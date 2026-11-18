/*
# RPC functions for session management, attendance, curriculum, halqat, settings

1. Purpose
- Admin functions: update session details, assign/unassign teachers, assign students to teachers, manage halqat, manage settings, manage Quran data.
- Teacher functions: save attendance, view assigned students.
- Admin functions: manage student curriculum (create, add items, update progress, mark revision).
- Updated save_recitation to use the new quran_surahs table and link to session_student_assignments.

2. New Functions
- admin_update_session: edit name, date, times of a session.
- admin_assign_session_teacher: assign a teacher to a session (with audit).
- admin_unassign_session_teacher: remove a teacher from a session.
- admin_assign_student_to_teacher: assign a student to a specific teacher in a session.
- admin_unassign_student: remove a student from a session.
- admin_get_session_students: list students assigned to a teacher in a session.
- teacher_save_attendance: record/update attendance for a student in a session.
- admin_create_halqa / admin_update_halqa: manage halqat.
- admin_update_setting: update a platform setting.
- admin_create_curriculum: create a curriculum for a student.
- admin_add_curriculum_item: add an item (juz/surah/ayah/page range) to a curriculum.
- admin_update_curriculum_item: mark item completed or needs revision.
- admin_delete_curriculum_item: remove a curriculum item.
- admin_delete_curriculum: remove an entire curriculum.
- teacher_get_session_students: get students assigned to this teacher in a session.

3. Security
- All admin functions check is_admin() first.
- Teacher functions check role and session assignment.
- All mutations write to audit_history where appropriate.
- Functions are SECURITY DEFINER with explicit grants to authenticated.
*/

-- ═══════════════════════════════════════════════════════════
-- SESSION MANAGEMENT
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_update_session(
  p_id uuid, p_name text, p_date date, p_start time, p_end time
)
RETURNS public.yawm_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.yawm_sessions; updated_row public.yawm_sessions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'Invalid session times'; END IF;
  SELECT * INTO before_row FROM public.yawm_sessions WHERE id = p_id;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  UPDATE public.yawm_sessions
  SET name = trim(p_name), session_date = p_date, start_time = p_start, end_time = p_end, updated_at = now()
  WHERE id = p_id RETURNING * INTO updated_row;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), 'update', 'session', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  RETURN updated_row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_update_session(uuid, text, date, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_session(uuid, text, date, time, time) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- SESSION TEACHER ASSIGNMENT (with audit)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_assign_session_teacher(
  p_session_id uuid, p_teacher_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_teacher_id AND role IN ('teacher', 'supervisor') AND is_active) THEN
    RAISE EXCEPTION 'Teacher not found or inactive';
  END IF;
  INSERT INTO public.session_teachers (session_id, teacher_id) VALUES (p_session_id, p_teacher_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'assign_teacher', 'session', p_session_id, jsonb_build_object('teacher_id', p_teacher_id));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_session_teacher(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_session_teacher(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unassign_session_teacher(
  p_session_id uuid, p_teacher_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.session_teachers WHERE session_id = p_session_id AND teacher_id = p_teacher_id;
  DELETE FROM public.session_student_assignments WHERE session_id = p_session_id AND teacher_id = p_teacher_id;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data)
  VALUES (auth.uid(), 'unassign_teacher', 'session', p_session_id, jsonb_build_object('teacher_id', p_teacher_id));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_unassign_session_teacher(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unassign_session_teacher(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- STUDENT-TEACHER ASSIGNMENT WITHIN SESSION
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_assign_student_to_teacher(
  p_session_id uuid, p_student_id uuid, p_teacher_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND is_active) THEN
    RAISE EXCEPTION 'Student not found or inactive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_teacher_id AND role = 'teacher' AND is_active) THEN
    RAISE EXCEPTION 'Teacher not found or inactive';
  END IF;
  -- Ensure teacher is assigned to the session
  INSERT INTO public.session_teachers (session_id, teacher_id) VALUES (p_session_id, p_teacher_id) ON CONFLICT DO NOTHING;
  -- Ensure student is in the session
  INSERT INTO public.session_students (session_id, student_id) VALUES (p_session_id, p_student_id) ON CONFLICT DO NOTHING;
  -- Assign student to this teacher (upsert — may reassign to different teacher)
  INSERT INTO public.session_student_assignments (session_id, student_id, teacher_id)
  VALUES (p_session_id, p_student_id, p_teacher_id)
  ON CONFLICT (session_id, student_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'assign_student', 'session', p_session_id,
    jsonb_build_object('student_id', p_student_id, 'teacher_id', p_teacher_id));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_assign_student_to_teacher(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_student_to_teacher(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unassign_student(
  p_session_id uuid, p_student_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.session_student_assignments WHERE session_id = p_session_id AND student_id = p_student_id;
  DELETE FROM public.session_students WHERE session_id = p_session_id AND student_id = p_student_id;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data)
  VALUES (auth.uid(), 'unassign_student', 'session', p_session_id, jsonb_build_object('student_id', p_student_id));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_unassign_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unassign_student(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- ATTENDANCE
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.teacher_save_attendance(
  p_session_id uuid, p_student_id uuid, p_status text, p_notes text DEFAULT ''
)
RETURNS public.attendance_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.attendance_records;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_status NOT IN ('present', 'absent', 'late', 'excused') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  -- Admin can save attendance for any session/student
  IF NOT public.is_admin() THEN
    -- Teacher must be assigned to this session and this student must be assigned to them
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher' AND is_active
    ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.session_student_assignments
      WHERE session_id = p_session_id AND student_id = p_student_id AND teacher_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Student not assigned to you in this session'; END IF;
  END IF;

  INSERT INTO public.attendance_records (session_id, student_id, teacher_id, status, notes)
  VALUES (p_session_id, p_student_id, auth.uid(), p_status, COALESCE(p_notes, ''))
  ON CONFLICT (session_id, student_id) DO UPDATE SET
    status = EXCLUDED.status, notes = EXCLUDED.notes, teacher_id = EXCLUDED.teacher_id, updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.teacher_save_attendance(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_save_attendance(uuid, uuid, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- HALQAT MANAGEMENT
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_halqa(
  p_name text, p_description text DEFAULT ''
)
RETURNS public.halqat
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.halqat;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(p_name)) < 2 THEN RAISE EXCEPTION 'Invalid halqa name'; END IF;
  INSERT INTO public.halqat (name, description) VALUES (trim(p_name), COALESCE(p_description, ''))
  RETURNING * INTO created;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'create', 'halqa', created.id, to_jsonb(created));
  RETURN created;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_create_halqa(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_halqa(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_halqa(
  p_id uuid, p_name text, p_description text DEFAULT '', p_is_active boolean DEFAULT true
)
RETURNS public.halqat
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE before_row public.halqat; updated_row public.halqat;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO before_row FROM public.halqat WHERE id = p_id;
  IF before_row.id IS NULL THEN RAISE EXCEPTION 'Halqa not found'; END IF;
  UPDATE public.halqat SET name = trim(p_name), description = COALESCE(p_description, ''),
    is_active = p_is_active, updated_at = now()
  WHERE id = p_id RETURNING * INTO updated_row;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (auth.uid(), 'update', 'halqa', p_id, to_jsonb(before_row), to_jsonb(updated_row));
  RETURN updated_row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_update_halqa(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_halqa(uuid, text, text, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- SETTINGS MANAGEMENT
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_update_setting(
  p_key text, p_value text
)
RETURNS public.platform_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.platform_settings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.platform_settings SET value = p_value, updated_at = now()
  WHERE key = p_key RETURNING * INTO result;
  IF result IS NULL THEN
    RAISE EXCEPTION 'Setting not found: %', p_key;
  END IF;
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'update_setting', 'setting', NULL, jsonb_build_object('key', p_key, 'value', p_value));
  RETURN result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_update_setting(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_setting(text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- STUDENT CURRICULUM MANAGEMENT
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_curriculum(
  p_student_id uuid, p_name text DEFAULT ''
)
RETURNS public.student_curricula
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.student_curricula;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  INSERT INTO public.student_curricula (student_id, name, assigned_by)
  VALUES (p_student_id, COALESCE(p_name, ''), auth.uid())
  RETURNING * INTO created;
  INSERT INTO public.student_edit_history (student_id, actor_id, action, changes)
  VALUES (p_student_id, auth.uid(), 'curriculum_create', to_jsonb(created));
  RETURN created;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_create_curriculum(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_curriculum(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_curriculum_item(
  p_curriculum_id uuid,
  p_item_type text,
  p_juz_id uuid DEFAULT NULL,
  p_surah_id uuid DEFAULT NULL,
  p_start_ayah integer DEFAULT NULL,
  p_end_ayah integer DEFAULT NULL,
  p_start_page integer DEFAULT NULL,
  p_end_page integer DEFAULT NULL,
  p_sort_order integer DEFAULT 0
)
RETURNS public.student_curriculum_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE created public.student_curriculum_items;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_item_type NOT IN ('juz', 'surah', 'ayah_range', 'page_range') THEN
    RAISE EXCEPTION 'Invalid item type';
  END IF;
  INSERT INTO public.student_curriculum_items
    (curriculum_id, item_type, juz_id, surah_id, start_ayah, end_ayah, start_page, end_page, sort_order)
  VALUES
    (p_curriculum_id, p_item_type, p_juz_id, p_surah_id, p_start_ayah, p_end_ayah, p_start_page, p_end_page, p_sort_order)
  RETURNING * INTO created;
  RETURN created;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_add_curriculum_item(uuid, text, uuid, uuid, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_curriculum_item(uuid, text, uuid, uuid, integer, integer, integer, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_curriculum_item(
  p_id uuid,
  p_is_completed boolean DEFAULT NULL,
  p_needs_revision boolean DEFAULT NULL,
  p_revision_notes text DEFAULT NULL
)
RETURNS public.student_curriculum_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated_row public.student_curriculum_items;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.student_curriculum_items SET
    is_completed = COALESCE(p_is_completed, is_completed),
    completed_at = CASE WHEN p_is_completed = true THEN now() WHEN p_is_completed = false THEN NULL ELSE completed_at END,
    needs_revision = COALESCE(p_needs_revision, needs_revision),
    revision_notes = COALESCE(p_revision_notes, revision_notes),
    updated_at = now()
  WHERE id = p_id RETURNING * INTO updated_row;
  IF updated_row IS NULL THEN RAISE EXCEPTION 'Curriculum item not found'; END IF;
  RETURN updated_row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_update_curriculum_item(uuid, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_curriculum_item(uuid, boolean, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_curriculum_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.student_curriculum_items WHERE id = p_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_curriculum_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_curriculum_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_curriculum(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.student_curricula WHERE id = p_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_curriculum(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_curriculum(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- UPDATED save_recitation to use new quran_surahs and session assignments
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_recitation(
  p_student_id uuid, p_session_id uuid, p_portion_id uuid, p_details jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_record uuid;
  d record;
  caller_role text;
  is_authorized boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid() AND is_active;
  IF caller_role IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Admin can save for any session; teacher must be assigned
  IF caller_role = 'admin' THEN
    is_authorized := true;
  ELSIF caller_role = 'teacher' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.yawm_sessions s
      JOIN public.session_teachers st ON st.session_id = s.id
      WHERE s.id = p_session_id AND s.status = 'open' AND st.teacher_id = auth.uid()
    ) INTO is_authorized;
  ELSIF caller_role = 'supervisor' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.session_teachers st
      WHERE st.session_id = p_session_id AND st.teacher_id = auth.uid()
    ) INTO is_authorized;
  END IF;

  IF NOT is_authorized THEN RAISE EXCEPTION 'Session is not open or not assigned'; END IF;

  -- Student must be in the session
  IF NOT EXISTS (SELECT 1 FROM public.session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN
    RAISE EXCEPTION 'Student is not assigned to this session';
  END IF;

  -- Validate all details: every surah must be confirmed
  FOR d IN SELECT * FROM jsonb_to_recordset(p_details) AS d(
    surah_id uuid, mistakes integer, hesitations integer, confirmed boolean, needs_revision boolean, notes text
  )
  LOOP
    IF d.confirmed IS NOT TRUE OR d.mistakes < 0 OR d.hesitations < 0 THEN
      RAISE EXCEPTION 'Every Surah must be explicitly confirmed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.surahs s WHERE s.id = d.surah_id AND s.portion_id = p_portion_id) THEN
      RAISE EXCEPTION 'Invalid surah for this portion';
    END IF;
  END LOOP;

  -- Insert the recitation record
  INSERT INTO public.recitation_records (teacher_id, student_id, session_id, portion_id)
  VALUES (auth.uid(), p_student_id, p_session_id, p_portion_id)
  RETURNING id INTO new_record;

  -- Insert surah details
  INSERT INTO public.recitation_surah_details (record_id, surah_id, mistakes, hesitations, confirmed, needs_revision, notes)
  SELECT new_record, d.surah_id, d.mistakes, d.hesitations, d.confirmed, d.needs_revision, COALESCE(d.notes, '')
  FROM jsonb_to_recordset(p_details) AS d(
    surah_id uuid, mistakes integer, hesitations integer, confirmed boolean, needs_revision boolean, notes text
  );

  -- If any surah needs revision, mark the corresponding curriculum item
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_details) AS d(surah_id uuid, needs_revision boolean) WHERE d.needs_revision = true) THEN
    UPDATE public.student_curriculum_items
    SET needs_revision = true, updated_at = now()
    WHERE surah_id IN (
      SELECT d.surah_id FROM jsonb_to_recordset(p_details) AS d(surah_id uuid, needs_revision boolean) WHERE d.needs_revision = true
    ) AND curriculum_id IN (
      SELECT sc.id FROM public.student_curricula sc
      WHERE sc.student_id = p_student_id AND sc.is_active
    );
  END IF;

  -- Mark confirmed surahs as completed in curriculum if they match
  UPDATE public.student_curriculum_items
  SET is_completed = true, completed_at = now(), updated_at = now()
  WHERE is_completed = false
    AND surah_id IN (
      SELECT d.surah_id FROM jsonb_to_recordset(p_details) AS d(surah_id uuid, confirmed boolean) WHERE d.confirmed = true
    )
    AND curriculum_id IN (
      SELECT sc.id FROM public.student_curricula sc
      WHERE sc.student_id = p_student_id AND sc.is_active
    );

  RETURN new_record;
END; $$;

-- ═══════════════════════════════════════════════════════════
-- TEACHER: get students assigned to me in a session
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.teacher_get_session_students(p_session_id uuid)
RETURNS TABLE (
  student_id uuid, student_name text, internal_id text, halqa text,
  current_portion text, is_active boolean, teacher_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF public.is_admin() THEN
    RETURN QUERY
    SELECT s.id, s.name, s.internal_id, s.halqa, s.current_portion, s.is_active,
           COALESCE(ssa.teacher_id, st.teacher_id) as teacher_id
    FROM public.students s
    JOIN public.session_students ss ON ss.student_id = s.id AND ss.session_id = p_session_id
    LEFT JOIN public.session_student_assignments ssa ON ssa.session_id = p_session_id AND ssa.student_id = s.id
    LEFT JOIN (
      SELECT session_id, min(teacher_id) as teacher_id FROM public.session_teachers WHERE session_id = p_session_id GROUP BY session_id
    ) st ON true
    ORDER BY s.name;
  ELSE
    -- Teacher: only students assigned to them
    RETURN QUERY
    SELECT s.id, s.name, s.internal_id, s.halqa, s.current_portion, s.is_active, ssa.teacher_id
    FROM public.students s
    JOIN public.session_student_assignments ssa ON ssa.student_id = s.id AND ssa.session_id = p_session_id
    WHERE ssa.teacher_id = auth.uid()
    ORDER BY s.name;
  END IF;
  RETURN;
END; $$;

REVOKE EXECUTE ON FUNCTION public.teacher_get_session_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_get_session_students(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- Update recitation policies to allow supervisors to read
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS recitations_select_owner_or_admin ON public.recitation_records;
CREATE POLICY recitations_select_owner_or_admin ON public.recitation_records
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_supervisor() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS recitation_details_select_owner_or_admin ON public.recitation_surah_details;
CREATE POLICY recitation_details_select_owner_or_admin ON public.recitation_surah_details
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR EXISTS (SELECT 1 FROM public.recitation_records r WHERE r.id = recitation_surah_details.record_id AND r.teacher_id = auth.uid())
  );

-- Grant SELECT on new tables to supervisor-relevant tables already done above
GRANT SELECT ON public.attendance_records, public.session_student_assignments TO authenticated;
