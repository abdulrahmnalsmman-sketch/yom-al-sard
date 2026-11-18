/*
# Harden teacher session writes and permissions

1. Modified access
- attendance_records: teachers may insert and update only rows for students in sessions where they are assigned.
- student_curriculum_items: teachers may update only curriculum items belonging to students in their assigned sessions.
- recitation_entries: teachers may insert and update only entries for students in their assigned sessions.

2. New function
- teacher_save_attendance_batch(session_id, attendance JSONB): atomically saves present/absent statuses for the teacher's own session roster.

3. Security
- Grants are limited to authenticated users.
- Every write policy checks auth.uid() against session_teachers.
- Existing privileged admin and supervisor paths remain available.

4. Data safety
- No rows are deleted. Existing records are updated only for the authorized session.
*/

GRANT SELECT, INSERT, UPDATE ON attendance_records TO authenticated;
GRANT SELECT, UPDATE ON student_curriculum_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON recitation_entries TO authenticated;

DROP POLICY IF EXISTS "attendance_teacher_insert_own_session" ON attendance_records;
CREATE POLICY "attendance_teacher_insert_own_session" ON attendance_records FOR INSERT TO authenticated
WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM session_teachers st WHERE st.session_id = attendance_records.session_id AND st.teacher_id = auth.uid())
  AND EXISTS (SELECT 1 FROM session_students ss WHERE ss.session_id = attendance_records.session_id AND ss.student_id = attendance_records.student_id)
);

DROP POLICY IF EXISTS "attendance_teacher_update_own_session" ON attendance_records;
CREATE POLICY "attendance_teacher_update_own_session" ON attendance_records FOR UPDATE TO authenticated
USING (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM session_teachers st WHERE st.session_id = attendance_records.session_id AND st.teacher_id = auth.uid())
)
WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM session_teachers st WHERE st.session_id = attendance_records.session_id AND st.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "curriculum_teacher_update_own_students" ON student_curriculum_items;
CREATE POLICY "curriculum_teacher_update_own_students" ON student_curriculum_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM student_curricula sc
  JOIN session_student_assignments ssa ON ssa.student_id = sc.student_id
  JOIN session_teachers st ON st.session_id = ssa.session_id
  WHERE sc.id = student_curriculum_items.curriculum_id AND st.teacher_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM student_curricula sc
  JOIN session_student_assignments ssa ON ssa.student_id = sc.student_id
  JOIN session_teachers st ON st.session_id = ssa.session_id
  WHERE sc.id = student_curriculum_items.curriculum_id AND st.teacher_id = auth.uid()
));

DROP POLICY IF EXISTS "recitation_teacher_insert_own_session" ON recitation_entries;
CREATE POLICY "recitation_teacher_insert_own_session" ON recitation_entries FOR INSERT TO authenticated
WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM session_teachers st WHERE st.session_id = recitation_entries.session_id AND st.teacher_id = auth.uid())
  AND EXISTS (SELECT 1 FROM session_students ss WHERE ss.session_id = recitation_entries.session_id AND ss.student_id = recitation_entries.student_id)
);

DROP POLICY IF EXISTS "recitation_teacher_update_own_session" ON recitation_entries;
CREATE POLICY "recitation_teacher_update_own_session" ON recitation_entries FOR UPDATE TO authenticated
USING (teacher_id = auth.uid() AND EXISTS (SELECT 1 FROM session_teachers st WHERE st.session_id = recitation_entries.session_id AND st.teacher_id = auth.uid()))
WITH CHECK (teacher_id = auth.uid() AND EXISTS (SELECT 1 FROM session_teachers st WHERE st.session_id = recitation_entries.session_id AND st.teacher_id = auth.uid()));

CREATE OR REPLACE FUNCTION teacher_save_attendance_batch(p_session_id uuid, p_attendance jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_count integer := 0;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  FOR r IN SELECT key::uuid AS student_id, value #>> '{}' AS status FROM jsonb_each(coalesce(p_attendance, '{}'::jsonb)) LOOP
    IF r.status NOT IN ('present', 'absent') THEN RAISE EXCEPTION 'invalid_attendance'; END IF;
    IF NOT EXISTS (SELECT 1 FROM session_students WHERE session_id = p_session_id AND student_id = r.student_id) THEN RAISE EXCEPTION 'student_not_in_session'; END IF;
    INSERT INTO attendance_records (session_id, student_id, teacher_id, status, updated_at)
    VALUES (p_session_id, r.student_id, v_teacher, r.status, now())
    ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, teacher_id = v_teacher, updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION teacher_save_attendance_batch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_save_attendance_batch(uuid, jsonb) TO authenticated;
