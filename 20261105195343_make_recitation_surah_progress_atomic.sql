/*
# Store recitation one surah at a time

1. Modified table
- recitation_entries now supports one saved row per session, student, mode, and starting surah.
- Existing rows remain intact.

2. Modified function
- teacher_save_recitation_entry upserts the current surah without overwriting another surah in the same student's session.

3. Security
- Existing teacher session membership check remains mandatory.

4. Data safety
- No records are deleted. The former broad uniqueness rule is replaced by a more precise one.
*/

ALTER TABLE recitation_entries ADD COLUMN IF NOT EXISTS surah_id uuid REFERENCES quran_surahs(id);
UPDATE recitation_entries SET surah_id = surah_from_id WHERE surah_id IS NULL;
ALTER TABLE recitation_entries DROP CONSTRAINT IF EXISTS recitation_entries_session_id_student_id_mode_key;
CREATE UNIQUE INDEX IF NOT EXISTS recitation_entries_session_student_mode_surah_key ON recitation_entries(session_id, student_id, mode, surah_id);

CREATE OR REPLACE FUNCTION teacher_save_recitation_entry(
  p_session_id uuid, p_student_id uuid, p_mode text, p_status text,
  p_surah_from uuid, p_surah_to uuid, p_mistakes integer, p_hesitations integer, p_notes text
)
RETURNS recitation_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row recitation_entries; v_teacher uuid := auth.uid();
BEGIN
  IF p_mode NOT IN ('recitation', 'review') OR p_status NOT IN ('done', 'repeat', 'not_ready', 'good') THEN RAISE EXCEPTION 'invalid_recitation'; END IF;
  IF p_surah_from IS NULL THEN RAISE EXCEPTION 'surah_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN RAISE EXCEPTION 'student_not_in_session'; END IF;
  INSERT INTO recitation_entries (session_id, student_id, teacher_id, mode, status, surah_id, surah_from_id, surah_to_id, mistakes, hesitations, notes, updated_at)
  VALUES (p_session_id, p_student_id, v_teacher, p_mode, p_status, p_surah_from, p_surah_from, p_surah_to, greatest(coalesce(p_mistakes, 0), 0), greatest(coalesce(p_hesitations, 0), 0), coalesce(p_notes, ''), now())
  ON CONFLICT (session_id, student_id, mode, surah_id) DO UPDATE SET status = excluded.status, teacher_id = excluded.teacher_id, surah_to_id = excluded.surah_to_id, mistakes = excluded.mistakes, hesitations = excluded.hesitations, notes = excluded.notes, updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text) TO authenticated;
