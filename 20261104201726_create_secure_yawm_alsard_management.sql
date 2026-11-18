/*
# Create secure يوم السرد management system

1. Purpose
- Replace the prototype's in-memory dashboard data with persistent, role-aware records.
- Support exactly two application roles: `admin` and `teacher`.
- Keep every recitation attempt as a historical record; future attempts never overwrite prior work.

2. New tables
- `profiles`: one application profile per Supabase Auth user, with display name, role, and active state.
- `students`: administrator-managed student profiles and enrollment information.
- `quran_portions`: selectable Quran portions.
- `surahs`: Surahs belonging to each portion.
- `yawm_sessions`: named sessions with date, start/end times, and scheduled/open/closed status.
- `session_teachers`: per-session teacher authorization.
- `session_students`: per-session student availability; students are not permanently bound to teachers.
- `recitation_records`: immutable historical portion submissions with teacher, student, session, portion, and timestamp.
- `recitation_surah_details`: one mandatory detail row for each Surah in a submitted portion, including confirmation, mistakes, hesitations, and revision flag.
- `audit_history`: administrator-visible history of privileged changes and recitation corrections.

3. Security
- Row Level Security is enabled on every new table.
- Administrative writes and teacher recitation submission happen through SECURITY DEFINER functions that check the authenticated caller's role and current session state.
- Teachers can only read sessions/students they are assigned to and their own submissions.
- Teachers cannot create accounts, alter sessions, manage students, or access audit/report data.
- Authenticated users receive only the minimum table and function grants required by these policies.

4. Important notes
- The first administrator must be created once in Supabase Auth's user management. After signing in, the application can claim that first profile as the sole administrator through `claim_initial_admin`; no public registration is exposed.
- Teacher accounts are created by the deployed server function, which uses the Supabase service role only on the server.
- Quran seed data is intentionally small and editable through a later administrator-managed content migration.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'teacher')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  basic_info text NOT NULL DEFAULT '',
  enrollment_date date NOT NULL DEFAULT current_date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quran_portions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.surahs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portion_id uuid NOT NULL REFERENCES public.quran_portions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portion_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.yawm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'closed')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_session_times CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS public.session_teachers (
  session_id uuid NOT NULL REFERENCES public.yawm_sessions(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS public.session_students (
  session_id uuid NOT NULL REFERENCES public.yawm_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.recitation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  session_id uuid NOT NULL REFERENCES public.yawm_sessions(id),
  portion_id uuid NOT NULL REFERENCES public.quran_portions(id),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recitation_surah_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.recitation_records(id) ON DELETE CASCADE,
  surah_id uuid NOT NULL REFERENCES public.surahs(id),
  mistakes integer NOT NULL DEFAULT 0 CHECK (mistakes >= 0),
  hesitations integer NOT NULL DEFAULT 0 CHECK (hesitations >= 0),
  confirmed boolean NOT NULL DEFAULT false,
  needs_revision boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  UNIQUE (record_id, surah_id)
);

CREATE TABLE IF NOT EXISTS public.audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS students_active_name_idx ON public.students (is_active, name);
CREATE INDEX IF NOT EXISTS sessions_date_status_idx ON public.yawm_sessions (session_date, status);
CREATE INDEX IF NOT EXISTS session_teachers_teacher_idx ON public.session_teachers (teacher_id, session_id);
CREATE INDEX IF NOT EXISTS session_students_student_idx ON public.session_students (student_id, session_id);
CREATE INDEX IF NOT EXISTS recitation_records_student_idx ON public.recitation_records (student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS recitation_records_teacher_idx ON public.recitation_records (teacher_id, submitted_at DESC);

INSERT INTO public.quran_portions (name, sort_order) VALUES
  ('الجزء الثلاثون', 30),
  ('الجزء التاسع والعشرون', 29),
  ('سورة الكهف', 18),
  ('سورة يوسف', 12)
ON CONFLICT (sort_order) DO NOTHING;

INSERT INTO public.surahs (portion_id, name, sort_order)
SELECT p.id, seed.name, seed.sort_order
FROM public.quran_portions p
JOIN (VALUES
  ('الجزء الثلاثون', 'النبأ', 1), ('الجزء الثلاثون', 'النازعات', 2), ('الجزء الثلاثون', 'عبس', 3),
  ('الجزء التاسع والعشرون', 'الملك', 1), ('الجزء التاسع والعشرون', 'القلم', 2), ('الجزء التاسع والعشرون', 'الحاقة', 3),
  ('سورة الكهف', 'الكهف', 1), ('سورة يوسف', 'يوسف', 1)
) AS seed(portion_name, name, sort_order) ON seed.portion_name = p.name
ON CONFLICT (portion_id, sort_order) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_active);
$$;

CREATE OR REPLACE FUNCTION public.claim_initial_admin()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.profiles;
  auth_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles) THEN RAISE EXCEPTION 'Initial administrator already exists'; END IF;
  SELECT email INTO auth_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (auth.uid(), COALESCE(auth_email, ''), COALESCE(split_part(auth_email, '@', 1), 'مدير النظام'), 'admin')
  RETURNING * INTO claimed;
  RETURN claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_student(p_name text, p_basic_info text, p_enrollment_date date)
RETURNS public.students
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.students;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(p_name)) < 2 THEN RAISE EXCEPTION 'Invalid student name'; END IF;
  INSERT INTO public.students (name, basic_info, enrollment_date) VALUES (trim(p_name), COALESCE(p_basic_info, ''), COALESCE(p_enrollment_date, current_date)) RETURNING * INTO created;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data) VALUES (auth.uid(), 'create', 'student', created.id, to_jsonb(created));
  RETURN created;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_student(p_id uuid, p_name text, p_basic_info text, p_is_active boolean)
RETURNS public.students
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.students; updated_row public.students;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO before_row FROM public.students WHERE id = p_id;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  UPDATE public.students SET name = trim(p_name), basic_info = COALESCE(p_basic_info, ''), is_active = p_is_active, updated_at = now() WHERE id = p_id RETURNING * INTO updated_row;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data) VALUES (auth.uid(), 'update', 'student', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  RETURN updated_row;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_session(p_name text, p_date date, p_start time, p_end time)
RETURNS public.yawm_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.yawm_sessions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'Invalid session times'; END IF;
  INSERT INTO public.yawm_sessions (name, session_date, start_time, end_time, created_by) VALUES (trim(p_name), p_date, p_start, p_end, auth.uid()) RETURNING * INTO created;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data) VALUES (auth.uid(), 'create', 'session', created.id, to_jsonb(created));
  RETURN created;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_session_status(p_id uuid, p_status text)
RETURNS public.yawm_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.yawm_sessions; updated_row public.yawm_sessions;
BEGIN
  IF NOT public.is_admin() OR p_status NOT IN ('scheduled', 'open', 'closed') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO before_row FROM public.yawm_sessions WHERE id = p_id;
  UPDATE public.yawm_sessions SET status = p_status, updated_at = now() WHERE id = p_id RETURNING * INTO updated_row;
  IF updated_row.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data) VALUES (auth.uid(), 'status_change', 'session', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  RETURN updated_row;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_assign_teacher(p_session_id uuid, p_teacher_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_teacher_id AND role = 'teacher' AND is_active) THEN RAISE EXCEPTION 'Teacher not found'; END IF;
  INSERT INTO public.session_teachers (session_id, teacher_id) VALUES (p_session_id, p_teacher_id) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_assign_student(p_session_id uuid, p_student_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND is_active) THEN RAISE EXCEPTION 'Student not found'; END IF;
  INSERT INTO public.session_students (session_id, student_id) VALUES (p_session_id, p_student_id) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.save_recitation(p_student_id uuid, p_session_id uuid, p_portion_id uuid, p_details jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_record uuid; expected_count integer; received_count integer; invalid_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher' AND is_active) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.yawm_sessions s JOIN public.session_teachers st ON st.session_id = s.id WHERE s.id = p_session_id AND s.status = 'open' AND st.teacher_id = auth.uid()) THEN RAISE EXCEPTION 'Session is not open or not assigned'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN RAISE EXCEPTION 'Student is not assigned to this session'; END IF;
  SELECT count(*) INTO expected_count FROM public.surahs WHERE portion_id = p_portion_id;
  SELECT count(*) INTO received_count FROM jsonb_array_elements(p_details);
  SELECT count(*) INTO invalid_count FROM jsonb_to_recordset(p_details) AS d(surah_id uuid, mistakes integer, hesitations integer, confirmed boolean, needs_revision boolean, notes text) WHERE d.confirmed IS NOT TRUE OR d.mistakes < 0 OR d.hesitations < 0 OR NOT EXISTS (SELECT 1 FROM public.surahs s WHERE s.id = d.surah_id AND s.portion_id = p_portion_id);
  IF expected_count = 0 OR received_count <> expected_count OR invalid_count > 0 THEN RAISE EXCEPTION 'Every Surah must be explicitly confirmed'; END IF;
  INSERT INTO public.recitation_records (teacher_id, student_id, session_id, portion_id) VALUES (auth.uid(), p_student_id, p_session_id, p_portion_id) RETURNING id INTO new_record;
  INSERT INTO public.recitation_surah_details (record_id, surah_id, mistakes, hesitations, confirmed, needs_revision, notes)
  SELECT new_record, d.surah_id, d.mistakes, d.hesitations, d.confirmed, d.needs_revision, COALESCE(d.notes, '') FROM jsonb_to_recordset(p_details) AS d(surah_id uuid, mistakes integer, hesitations integer, confirmed boolean, needs_revision boolean, notes text);
  RETURN new_record;
END; $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yawm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitation_surah_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles, public.students, public.quran_portions, public.surahs, public.yawm_sessions, public.session_teachers, public.session_students, public.recitation_records, public.recitation_surah_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_initial_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_student(text, text, date), public.admin_update_student(uuid, text, text, boolean), public.admin_create_session(text, date, time, time), public.admin_set_session_status(uuid, text), public.admin_assign_teacher(uuid, uuid), public.admin_assign_student(uuid, uuid), public.save_recitation(uuid, uuid, uuid, jsonb) TO authenticated;
REVOKE ALL ON public.audit_history FROM anon, authenticated;
GRANT SELECT ON public.audit_history TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS students_select_authorized ON public.students;
CREATE POLICY students_select_authorized ON public.students FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.session_students ss JOIN public.session_teachers st ON st.session_id = ss.session_id WHERE ss.student_id = students.id AND st.teacher_id = auth.uid()));
DROP POLICY IF EXISTS portions_select_authenticated ON public.quran_portions;
CREATE POLICY portions_select_authenticated ON public.quran_portions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS surahs_select_authenticated ON public.surahs;
CREATE POLICY surahs_select_authenticated ON public.surahs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sessions_select_authorized ON public.yawm_sessions;
CREATE POLICY sessions_select_authorized ON public.yawm_sessions FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.session_teachers st WHERE st.session_id = yawm_sessions.id AND st.teacher_id = auth.uid()));
DROP POLICY IF EXISTS session_teachers_select_authorized ON public.session_teachers;
CREATE POLICY session_teachers_select_authorized ON public.session_teachers FOR SELECT TO authenticated USING (public.is_admin() OR teacher_id = auth.uid());
DROP POLICY IF EXISTS session_students_select_authorized ON public.session_students;
CREATE POLICY session_students_select_authorized ON public.session_students FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.session_teachers st WHERE st.session_id = session_students.session_id AND st.teacher_id = auth.uid()));
DROP POLICY IF EXISTS recitations_select_owner_or_admin ON public.recitation_records;
CREATE POLICY recitations_select_owner_or_admin ON public.recitation_records FOR SELECT TO authenticated USING (public.is_admin() OR teacher_id = auth.uid());
DROP POLICY IF EXISTS recitation_details_select_owner_or_admin ON public.recitation_surah_details;
CREATE POLICY recitation_details_select_owner_or_admin ON public.recitation_surah_details FOR SELECT TO authenticated USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.recitation_records r WHERE r.id = recitation_surah_details.record_id AND r.teacher_id = auth.uid()));
DROP POLICY IF EXISTS audit_select_admin ON public.audit_history;
CREATE POLICY audit_select_admin ON public.audit_history FOR SELECT TO authenticated USING (public.is_admin());
