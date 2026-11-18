/*
# Stage 1: Add supervisor role, username, permissions, and enhanced student fields

1. Purpose
- Expand the system from two roles (admin/teacher) to three (admin/teacher/supervisor).
- Add username-based login support (username does NOT need to be an email).
- Add a granular permissions system for supervisors (configurable by admin).
- Enhance the students table with optional internal ID, group/halqa, and current portion.
- Add a student edit-history table for audit tracking.

2. Schema changes
- profiles: add `username` (unique, nullable), add 'supervisor' to role CHECK constraint.
- student additional fields: `internal_id`, `halqa`, `current_portion` on students table.
- New table `supervisor_permissions`: per-supervisor granular capabilities.
- New table `student_edit_history`: track changes to student records.

3. Security
- RLS enabled on all new tables.
- Only admin can read/write supervisor_permissions.
- Only admin can read student_edit_history.
- All existing data preserved — all new columns are nullable or have defaults.

4. Important notes
- The existing admin account keeps working with email-based login.
- Username is optional — existing accounts without username still use email.
- Supervisor permissions are stored as individual boolean columns for clarity.
- No data is deleted or modified.
*/

-- ── profiles: add username and supervisor role ──

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_lower text
  GENERATED ALWAYS AS (lower(username)) STORED;

-- Create unique index on username (partial — only where username is not null)
DROP INDEX IF EXISTS profiles_username_unique_idx;
CREATE UNIQUE INDEX profiles_username_unique_idx ON public.profiles (username_lower)
  WHERE username IS NOT NULL;

-- Update role constraint to include supervisor
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'supervisor'));

-- ── students: add enhanced fields ──

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS internal_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS halqa text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_portion text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS notes text;

-- ── supervisor_permissions table ──

CREATE TABLE IF NOT EXISTS public.supervisor_permissions (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_view_stats boolean NOT NULL DEFAULT true,
  can_view_students boolean NOT NULL DEFAULT true,
  can_view_teachers boolean NOT NULL DEFAULT true,
  can_view_reports boolean NOT NULL DEFAULT true,
  can_take_attendance boolean NOT NULL DEFAULT false,
  can_recite boolean NOT NULL DEFAULT false,
  can_manage_sessions boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supervisor_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.supervisor_permissions TO authenticated;

DROP POLICY IF EXISTS supervisor_perms_select_admin ON public.supervisor_permissions;
CREATE POLICY supervisor_perms_select_admin ON public.supervisor_permissions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

-- ── student_edit_history table ──

CREATE TABLE IF NOT EXISTS public.student_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_edit_history_student_idx
  ON public.student_edit_history (student_id, created_at DESC);

ALTER TABLE public.student_edit_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.student_edit_history TO authenticated;

DROP POLICY IF EXISTS student_history_select_admin ON public.student_edit_history;
CREATE POLICY student_history_select_admin ON public.student_edit_history
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── Update is_admin to also cover supervisor checks via is_supervisor ──

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'supervisor' AND is_active
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_supervisor() TO authenticated;

-- ── Update admin functions to also write to student_edit_history ──

CREATE OR REPLACE FUNCTION public.admin_create_student(
  p_name text, p_basic_info text, p_enrollment_date date,
  p_internal_id text DEFAULT NULL, p_halqa text DEFAULT NULL,
  p_current_portion text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.students
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.students;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(p_name)) < 2 THEN RAISE EXCEPTION 'Invalid student name'; END IF;
  INSERT INTO public.students (name, basic_info, enrollment_date, internal_id, halqa, current_portion, notes)
  VALUES (trim(p_name), COALESCE(p_basic_info, ''), COALESCE(p_enrollment_date, current_date),
          p_internal_id, p_halqa, p_current_portion, p_notes)
  RETURNING * INTO created;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'create', 'student', created.id, to_jsonb(created));
  INSERT INTO public.student_edit_history (student_id, actor_id, action, changes)
  VALUES (created.id, auth.uid(), 'create', to_jsonb(created));
  RETURN created;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_student(
  p_id uuid, p_name text, p_basic_info text, p_is_active boolean,
  p_internal_id text DEFAULT NULL, p_halqa text DEFAULT NULL,
  p_current_portion text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.students
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.students; updated_row public.students;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO before_row FROM public.students WHERE id = p_id;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  UPDATE public.students
  SET name = trim(p_name), basic_info = COALESCE(p_basic_info, ''),
      is_active = p_is_active,
      internal_id = p_internal_id, halqa = p_halqa,
      current_portion = p_current_portion, notes = p_notes,
      updated_at = now()
  WHERE id = p_id RETURNING * INTO updated_row;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), 'update', 'student', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  INSERT INTO public.student_edit_history (student_id, actor_id, action, changes)
  VALUES (p_id, auth.uid(), 'update',
    jsonb_build_object(
      'before', to_jsonb(before_row),
      'after', to_jsonb(updated_row)
    ));
  RETURN updated_row;
END; $$;

-- ── New admin functions: manage user accounts ──

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_id uuid, p_display_name text, p_is_active boolean,
  p_username text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.profiles; updated_row public.profiles;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO before_row FROM public.profiles WHERE id = p_id;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF before_row.role = 'admin' AND p_is_active = false AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'admin' AND is_active AND id <> p_id
  ) THEN RAISE EXCEPTION 'Cannot deactivate the last active admin'; END IF;
  UPDATE public.profiles
  SET display_name = trim(p_display_name), is_active = p_is_active,
      username = CASE WHEN p_username IS NOT NULL AND trim(p_username) = '' THEN NULL ELSE trim(p_username) END
  WHERE id = p_id RETURNING * INTO updated_row;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), 'update_profile', 'user', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  RETURN updated_row;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(
  p_id uuid, p_role text
)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.profiles; updated_row public.profiles;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_role NOT IN ('teacher', 'supervisor') THEN RAISE EXCEPTION 'Can only set teacher or supervisor roles'; END IF;
  SELECT * INTO before_row FROM public.profiles WHERE id = p_id;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF before_row.role = 'admin' THEN RAISE EXCEPTION 'Cannot change admin role'; END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_id RETURNING * INTO updated_row;
  IF p_role = 'supervisor' AND NOT EXISTS (
    SELECT 1 FROM public.supervisor_permissions WHERE profile_id = p_id
  ) THEN
    INSERT INTO public.supervisor_permissions (profile_id) VALUES (p_id);
  END IF;
  IF p_role = 'teacher' THEN
    DELETE FROM public.supervisor_permissions WHERE profile_id = p_id;
  END IF;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), 'role_change', 'user', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  RETURN updated_row;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_supervisor_permissions(
  p_profile_id uuid,
  p_can_view_stats boolean DEFAULT true,
  p_can_view_students boolean DEFAULT true,
  p_can_view_teachers boolean DEFAULT true,
  p_can_view_reports boolean DEFAULT true,
  p_can_take_attendance boolean DEFAULT false,
  p_can_recite boolean DEFAULT false,
  p_can_manage_sessions boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND role = 'supervisor') THEN
    RAISE EXCEPTION 'Target is not a supervisor';
  END IF;
  INSERT INTO public.supervisor_permissions
    (profile_id, can_view_stats, can_view_students, can_view_teachers, can_view_reports,
     can_take_attendance, can_recite, can_manage_sessions, updated_at)
  VALUES (p_profile_id, p_can_view_stats, p_can_view_students, p_can_view_teachers,
    p_can_view_reports, p_can_take_attendance, p_can_recite, p_can_manage_sessions, now())
  ON CONFLICT (profile_id) DO UPDATE SET
    can_view_stats = EXCLUDED.can_view_stats,
    can_view_students = EXCLUDED.can_view_students,
    can_view_teachers = EXCLUDED.can_view_teachers,
    can_view_reports = EXCLUDED.can_view_reports,
    can_take_attendance = EXCLUDED.can_take_attendance,
    can_recite = EXCLUDED.can_recite,
    can_manage_sessions = EXCLUDED.can_manage_sessions,
    updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.admin_change_password(
  p_id uuid, p_new_password text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(p_new_password) < 6 THEN RAISE EXCEPTION 'Password too short'; END IF;
  -- Password change is handled by the edge function via admin API
  RAISE EXCEPTION 'Use edge function for password changes';
END; $$;

-- ── Grants for new functions ──

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_supervisor_permissions(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_supervisor_permissions(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_supervisor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor() TO authenticated;

-- ── Update policies to allow supervisors to read students/sessions ──

DROP POLICY IF EXISTS students_select_authorized ON public.students;
CREATE POLICY students_select_authorized ON public.students
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.session_students ss
      JOIN public.session_teachers st ON st.session_id = ss.session_id
      WHERE ss.student_id = students.id AND st.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sessions_select_authorized ON public.yawm_sessions;
CREATE POLICY sessions_select_authorized ON public.yawm_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.session_teachers st
      WHERE st.session_id = yawm_sessions.id AND st.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS session_teachers_select_authorized ON public.session_teachers;
CREATE POLICY session_teachers_select_authorized ON public.session_teachers
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_supervisor() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS session_students_select_authorized ON public.session_students;
CREATE POLICY session_students_select_authorized ON public.session_students
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.session_teachers st
      WHERE st.session_id = session_students.session_id AND st.teacher_id = auth.uid()
    )
  );

-- Grant SELECT on new tables
GRANT SELECT ON public.supervisor_permissions, public.student_edit_history TO authenticated;
