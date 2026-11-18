/*
# Teacher halqa workflow, recitation entries, and curriculum progress

1. New table
- recitation_entries: one row per student per session per mode (recitation or review).
  Holds the status (تم / يُعاد / غير جاهز / جيد), the surah range recited, mistakes and hesitations counters, and notes.

2. Modified table
- student_curriculum_items: new columns completed_ayahs and completed_pages (lists of numbers the teacher has marked as done).

3. New functions (all SECURITY DEFINER, callable only by signed-in users)
- teacher_create_halqa(name, student_ids): a teacher creates their own halqa for today. It creates an open day, assigns the teacher to it, and adds the chosen students.
- teacher_save_recitation_entry(...): saves or updates a student's recitation or review result. Only teachers assigned to the day can save.
- set_curriculum_item_progress(...): teachers and admins mark completed ayahs and pages of a curriculum item.

4. Security
- recitation_entries has RLS enabled. Authenticated users can read only their own entries (teacher) or all entries (admin, supervisor). Writes go through the functions only.
- Functions revoke EXECUTE from PUBLIC and anon.

5. Notes
- No existing data is deleted or changed.
- Admin and supervisor no longer distribute students through the app UI.
*/

ALTER TABLE student_curriculum_items
  ADD COLUMN IF NOT EXISTS completed_ayahs integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completed_pages integer[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS recitation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES yawm_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES profiles(id),
  mode text NOT NULL CHECK (mode IN ('recitation', 'review')),
  status text NOT NULL CHECK (status IN ('done', 'repeat', 'not_ready', 'good')),
  surah_from_id uuid REFERENCES quran_surahs(id),
  surah_to_id uuid REFERENCES quran_surahs(id),
  mistakes integer NOT NULL DEFAULT 0 CHECK (mistakes >= 0),
  hesitations integer NOT NULL DEFAULT 0 CHECK (hesitations >= 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id, mode)
);

ALTER TABLE recitation_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON recitation_entries TO authenticated;

DROP POLICY IF EXISTS "select_recitation_entries" ON recitation_entries;
CREATE POLICY "select_recitation_entries" ON recitation_entries FOR SELECT
TO authenticated
USING (
  teacher_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor') AND p.is_active)
);

CREATE OR REPLACE FUNCTION teacher_create_halqa(p_name text, p_student_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_teacher uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_teacher AND role = 'teacher' AND is_active) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 THEN
    RAISE EXCEPTION 'students_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_student_ids) sid
    WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = sid AND s.is_active)
  ) THEN
    RAISE EXCEPTION 'invalid_student';
  END IF;

  INSERT INTO yawm_sessions (name, session_date, start_time, end_time, status, created_by)
  VALUES (
    trim(p_name), CURRENT_DATE, LOCALTIME::time, (LOCALTIME + interval '2 hours')::time, 'open', v_teacher
  )
  RETURNING id INTO v_session_id;

  INSERT INTO session_teachers (session_id, teacher_id) VALUES (v_session_id, v_teacher);

  INSERT INTO session_students (session_id, student_id)
  SELECT v_session_id, sid FROM unnest(p_student_ids) sid;

  INSERT INTO session_student_assignments (session_id, student_id, teacher_id)
  SELECT v_session_id, sid, v_teacher FROM unnest(p_student_ids) sid;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION teacher_save_recitation_entry(
  p_session_id uuid, p_student_id uuid, p_mode text, p_status text,
  p_surah_from uuid, p_surah_to uuid, p_mistakes integer, p_hesitations integer, p_notes text
)
RETURNS recitation_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row recitation_entries;
  v_teacher uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN
    RAISE EXCEPTION 'student_not_in_session';
  END IF;

  INSERT INTO recitation_entries (
    session_id, student_id, teacher_id, mode, status, surah_from_id, surah_to_id,
    mistakes, hesitations, notes, updated_at
  )
  VALUES (
    p_session_id, p_student_id, v_teacher, p_mode, p_status, p_surah_from, p_surah_to,
    greatest(coalesce(p_mistakes, 0), 0), greatest(coalesce(p_hesitations, 0), 0), coalesce(p_notes, ''), now()
  )
  ON CONFLICT (session_id, student_id, mode) DO UPDATE SET
    status = EXCLUDED.status,
    surah_from_id = EXCLUDED.surah_from_id,
    surah_to_id = EXCLUDED.surah_to_id,
    mistakes = EXCLUDED.mistakes,
    hesitations = EXCLUDED.hesitations,
    notes = EXCLUDED.notes,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION set_curriculum_item_progress(
  p_item_id uuid, p_completed_ayahs integer[], p_completed_pages integer[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher') AND is_active
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE student_curriculum_items
  SET completed_ayahs = coalesce(p_completed_ayahs, '{}'),
      completed_pages = coalesce(p_completed_pages, '{}'),
      updated_at = now()
  WHERE id = p_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION teacher_create_halqa(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_create_halqa(text, uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION set_curriculum_item_progress(uuid, integer[], integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_curriculum_item_progress(uuid, integer[], integer[]) TO authenticated;
