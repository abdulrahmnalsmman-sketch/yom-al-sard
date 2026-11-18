/*
# Add Quran face/line data and recitation calculation columns

## Overview
This migration adds precise face (وجه) and line count data to the quran_surahs table
based on the Madinah Mushaf (15 lines per page, 604 pages), and adds calculation
columns to recitation_entries for tracking faces recited, faces completed, and
the source of the value (auto-calculated vs manual entry).

## Changes to quran_surahs
New columns:
- `line_count` (integer): Number of actual text lines the surah occupies in the Mushaf
- `face_count` (numeric): Precise face count = line_count / 15
- `face_description` (text): Arabic text description of the face count
- `page_count` (integer): Number of pages the surah spans

## Changes to recitation_entries
New columns:
- `lines_recited` (integer): Number of actual lines recited
- `faces_recited` (numeric): Precise faces recited = lines_recited / 15
- `faces_completed` (integer): Number of complete faces (floor of faces_recited)
- `recitation_type` (text): 'original' | 'repeat' | 'review'
- `value_source` (text): 'auto' | 'manual'
- `recited_at` (timestamptz): When the recitation was confirmed by the teacher

## Security
- No new tables, no RLS changes needed
- No new grants needed (columns added to existing tables with existing policies)
*/

-- Add face/line data columns to quran_surahs
ALTER TABLE quran_surahs
  ADD COLUMN IF NOT EXISTS line_count integer,
  ADD COLUMN IF NOT EXISTS face_count numeric(6,2),
  ADD COLUMN IF NOT EXISTS face_description text,
  ADD COLUMN IF NOT EXISTS page_count integer;

-- Calculate page_count from existing start_page/end_page
UPDATE quran_surahs
SET page_count = GREATEST(end_page - start_page + 1, 1);

-- Set line_count and face_count based on the provided data (15 lines per face)
UPDATE quran_surahs SET line_count = 7, face_count = 0.07 WHERE surah_number = 1;
UPDATE quran_surahs SET line_count = 720, face_count = 48.00 WHERE surah_number = 2;
UPDATE quran_surahs SET line_count = 405, face_count = 27.00 WHERE surah_number = 3;
UPDATE quran_surahs SET line_count = 420, face_count = 28.00 WHERE surah_number = 4;
UPDATE quran_surahs SET line_count = 270, face_count = 18.00 WHERE surah_number = 5;
UPDATE quran_surahs SET line_count = 345, face_count = 23.00 WHERE surah_number = 6;
UPDATE quran_surahs SET line_count = 390, face_count = 26.00 WHERE surah_number = 7;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 8;
UPDATE quran_surahs SET line_count = 315, face_count = 21.00 WHERE surah_number = 9;
UPDATE quran_surahs SET line_count = 195, face_count = 13.00 WHERE surah_number = 10;
UPDATE quran_surahs SET line_count = 195, face_count = 13.00 WHERE surah_number = 11;
UPDATE quran_surahs SET line_count = 210, face_count = 14.00 WHERE surah_number = 12;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 13;
UPDATE quran_surahs SET line_count = 105, face_count = 7.00 WHERE surah_number = 14;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 15;
UPDATE quran_surahs SET line_count = 210, face_count = 14.00 WHERE surah_number = 16;
UPDATE quran_surahs SET line_count = 180, face_count = 12.00 WHERE surah_number = 17;
UPDATE quran_surahs SET line_count = 180, face_count = 12.00 WHERE surah_number = 18;
UPDATE quran_surahs SET line_count = 105, face_count = 7.00 WHERE surah_number = 19;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 20;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 21;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 22;
UPDATE quran_surahs SET line_count = 120, face_count = 8.00 WHERE surah_number = 23;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 24;
UPDATE quran_surahs SET line_count = 105, face_count = 7.00 WHERE surah_number = 25;
UPDATE quran_surahs SET line_count = 165, face_count = 11.00 WHERE surah_number = 26;
UPDATE quran_surahs SET line_count = 135, face_count = 9.00 WHERE surah_number = 27;
UPDATE quran_surahs SET line_count = 165, face_count = 11.00 WHERE surah_number = 28;
UPDATE quran_surahs SET line_count = 120, face_count = 8.00 WHERE surah_number = 29;
UPDATE quran_surahs SET line_count = 105, face_count = 7.00 WHERE surah_number = 30;
UPDATE quran_surahs SET line_count = 60, face_count = 4.00 WHERE surah_number = 31;
UPDATE quran_surahs SET line_count = 45, face_count = 3.00 WHERE surah_number = 32;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 33;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 34;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 35;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 36;
UPDATE quran_surahs SET line_count = 105, face_count = 7.00 WHERE surah_number = 37;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 38;
UPDATE quran_surahs SET line_count = 135, face_count = 9.00 WHERE surah_number = 39;
UPDATE quran_surahs SET line_count = 150, face_count = 10.00 WHERE surah_number = 40;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 41;
UPDATE quran_surahs SET line_count = 90, face_count = 6.00 WHERE surah_number = 42;
UPDATE quran_surahs SET line_count = 105, face_count = 7.00 WHERE surah_number = 43;
UPDATE quran_surahs SET line_count = 45, face_count = 3.00 WHERE surah_number = 44;
UPDATE quran_surahs SET line_count = 60, face_count = 4.00 WHERE surah_number = 45;
UPDATE quran_surahs SET line_count = 67, face_count = 4.50 WHERE surah_number = 46;
UPDATE quran_surahs SET line_count = 60, face_count = 4.00 WHERE surah_number = 47;
UPDATE quran_surahs SET line_count = 67, face_count = 4.50 WHERE surah_number = 48;
UPDATE quran_surahs SET line_count = 38, face_count = 2.50 WHERE surah_number = 49;
UPDATE quran_surahs SET line_count = 37, face_count = 2.50 WHERE surah_number = 50;
UPDATE quran_surahs SET line_count = 45, face_count = 3.00 WHERE surah_number = 51;
UPDATE quran_surahs SET line_count = 37, face_count = 2.50 WHERE surah_number = 52;
UPDATE quran_surahs SET line_count = 38, face_count = 2.50 WHERE surah_number = 53;
UPDATE quran_surahs SET line_count = 37, face_count = 2.50 WHERE surah_number = 54;
UPDATE quran_surahs SET line_count = 45, face_count = 3.00 WHERE surah_number = 55;
UPDATE quran_surahs SET line_count = 52, face_count = 3.50 WHERE surah_number = 56;
UPDATE quran_surahs SET line_count = 67, face_count = 4.50 WHERE surah_number = 57;
UPDATE quran_surahs SET line_count = 52, face_count = 3.50 WHERE surah_number = 58;
UPDATE quran_surahs SET line_count = 53, face_count = 3.50 WHERE surah_number = 59;
UPDATE quran_surahs SET line_count = 37, face_count = 2.50 WHERE surah_number = 60;
UPDATE quran_surahs SET line_count = 23, face_count = 1.50 WHERE surah_number = 61;
UPDATE quran_surahs SET line_count = 22, face_count = 1.50 WHERE surah_number = 62;
UPDATE quran_surahs SET line_count = 23, face_count = 1.50 WHERE surah_number = 63;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 64;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 65;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 66;
UPDATE quran_surahs SET line_count = 37, face_count = 2.50 WHERE surah_number = 67;
UPDATE quran_surahs SET line_count = 38, face_count = 2.50 WHERE surah_number = 68;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 69;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 70;
UPDATE quran_surahs SET line_count = 23, face_count = 1.50 WHERE surah_number = 71;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 72;
UPDATE quran_surahs SET line_count = 23, face_count = 1.50 WHERE surah_number = 73;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 74;
UPDATE quran_surahs SET line_count = 22, face_count = 1.50 WHERE surah_number = 75;
UPDATE quran_surahs SET line_count = 30, face_count = 2.00 WHERE surah_number = 76;
UPDATE quran_surahs SET line_count = 23, face_count = 1.50 WHERE surah_number = 77;
UPDATE quran_surahs SET line_count = 22, face_count = 1.50 WHERE surah_number = 78;
UPDATE quran_surahs SET line_count = 23, face_count = 1.50 WHERE surah_number = 79;
UPDATE quran_surahs SET line_count = 19, face_count = 1.25 WHERE surah_number = 80;
UPDATE quran_surahs SET line_count = 15, face_count = 1.00 WHERE surah_number = 81;
UPDATE quran_surahs SET line_count = 11, face_count = 0.75 WHERE surah_number = 82;
UPDATE quran_surahs SET line_count = 34, face_count = 2.25 WHERE surah_number = 83;
UPDATE quran_surahs SET line_count = 15, face_count = 1.00 WHERE surah_number = 84;
UPDATE quran_surahs SET line_count = 15, face_count = 1.00 WHERE surah_number = 85;
UPDATE quran_surahs SET line_count = 8, face_count = 0.50 WHERE surah_number = 86;
UPDATE quran_surahs SET line_count = 7, face_count = 0.50 WHERE surah_number = 87;
UPDATE quran_surahs SET line_count = 15, face_count = 1.00 WHERE surah_number = 88;
UPDATE quran_surahs SET line_count = 19, face_count = 1.25 WHERE surah_number = 89;
UPDATE quran_surahs SET line_count = 11, face_count = 0.75 WHERE surah_number = 90;
UPDATE quran_surahs SET line_count = 8, face_count = 0.50 WHERE surah_number = 91;
UPDATE quran_surahs SET line_count = 7, face_count = 0.50 WHERE surah_number = 92;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 93;
UPDATE quran_surahs SET line_count = 4, face_count = 0.25 WHERE surah_number = 94;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 95;
UPDATE quran_surahs SET line_count = 8, face_count = 0.50 WHERE surah_number = 96;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 97;
UPDATE quran_surahs SET line_count = 11, face_count = 0.75 WHERE surah_number = 98;
UPDATE quran_surahs SET line_count = 7, face_count = 0.50 WHERE surah_number = 99;
UPDATE quran_surahs SET line_count = 7, face_count = 0.50 WHERE surah_number = 100;
UPDATE quran_surahs SET line_count = 8, face_count = 0.50 WHERE surah_number = 101;
UPDATE quran_surahs SET line_count = 6, face_count = 0.40 WHERE surah_number = 102;
UPDATE quran_surahs SET line_count = 3, face_count = 0.20 WHERE surah_number = 103;
UPDATE quran_surahs SET line_count = 6, face_count = 0.40 WHERE surah_number = 104;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 105;
UPDATE quran_surahs SET line_count = 4, face_count = 0.25 WHERE surah_number = 106;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 107;
UPDATE quran_surahs SET line_count = 3, face_count = 0.20 WHERE surah_number = 108;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 109;
UPDATE quran_surahs SET line_count = 3, face_count = 0.20 WHERE surah_number = 110;
UPDATE quran_surahs SET line_count = 5, face_count = 0.33 WHERE surah_number = 111;
UPDATE quran_surahs SET line_count = 4, face_count = 0.25 WHERE surah_number = 112;
UPDATE quran_surahs SET line_count = 4, face_count = 0.25 WHERE surah_number = 113;
UPDATE quran_surahs SET line_count = 4, face_count = 0.25 WHERE surah_number = 114;

-- Add calculation columns to recitation_entries
ALTER TABLE recitation_entries
  ADD COLUMN IF NOT EXISTS lines_recited integer,
  ADD COLUMN IF NOT EXISTS faces_recited numeric(8,4),
  ADD COLUMN IF NOT EXISTS faces_completed integer,
  ADD COLUMN IF NOT EXISTS recitation_type text DEFAULT 'original' CHECK (recitation_type IN ('original', 'repeat', 'review')),
  ADD COLUMN IF NOT EXISTS value_source text DEFAULT 'auto' CHECK (value_source IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS recited_at timestamptz;

-- Set recited_at to created_at for existing rows
UPDATE recitation_entries SET recited_at = created_at WHERE recited_at IS NULL;

-- Backfill faces_recited for existing entries using surah face_count
UPDATE recitation_entries re
SET
  lines_recited = qs.line_count,
  faces_recited = qs.face_count,
  faces_completed = FLOOR(qs.face_count),
  value_source = 'auto'
FROM quran_surahs qs
WHERE re.surah_id = qs.id
  AND re.faces_recited IS NULL
  AND re.status = 'done';

-- Update the RPC function to accept and store the new calculation fields
CREATE OR REPLACE FUNCTION teacher_save_recitation_entry(
  p_session_id uuid,
  p_student_id uuid,
  p_mode text,
  p_status text,
  p_surah_from uuid,
  p_surah_to uuid,
  p_mistakes integer,
  p_hesitations integer,
  p_notes text,
  p_ayah_from integer DEFAULT NULL,
  p_ayah_to integer DEFAULT NULL,
  p_halaqa_id uuid DEFAULT NULL,
  p_lines_recited integer DEFAULT NULL,
  p_faces_recited numeric DEFAULT NULL,
  p_value_source text DEFAULT 'auto',
  p_recitation_type text DEFAULT 'original'
) RETURNS recitation_entries
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row recitation_entries;
  v_teacher uuid := auth.uid();
  v_surah_num integer;
  v_session yawm_sessions;
  v_surah_line_count integer;
  v_surah_face_count numeric;
  v_lines integer;
  v_faces numeric;
  v_faces_completed integer;
BEGIN
  IF p_status NOT IN ('done', 'repeat', 'not_ready') THEN RAISE EXCEPTION 'invalid_recitation'; END IF;
  IF p_surah_from IS NULL THEN RAISE EXCEPTION 'surah_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN RAISE EXCEPTION 'student_not_in_session'; END IF;

  SELECT surah_number, line_count, face_count INTO v_surah_num, v_surah_line_count, v_surah_face_count FROM quran_surahs WHERE id = p_surah_from;
  SELECT * INTO v_session FROM yawm_sessions WHERE id = p_session_id;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'session_closed'; END IF;

  -- Calculate faces from lines if provided, otherwise use surah's full face_count
  IF p_lines_recited IS NOT NULL AND p_lines_recited > 0 THEN
    v_lines := p_lines_recited;
    v_faces := p_lines_recited::numeric / 15.0;
  ELSIF p_faces_recited IS NOT NULL AND p_faces_recited > 0 THEN
    v_lines := NULL;
    v_faces := p_faces_recited;
  ELSE
    v_lines := v_surah_line_count;
    v_faces := v_surah_face_count;
  END IF;
  v_faces_completed := FLOOR(v_faces);

  INSERT INTO recitation_entries (
    session_id, student_id, teacher_id, mode, status,
    surah_id, surah_from_id, surah_to_id, surah_number,
    mistakes, hesitations, notes,
    ayah_from, ayah_to, halaqa_id, session_date,
    lines_recited, faces_recited, faces_completed,
    recitation_type, value_source, recited_at,
    updated_at
  )
  SELECT
    p_session_id, p_student_id, v_teacher, 'recitation', p_status,
    p_surah_from, p_surah_from, p_surah_to, v_surah_num,
    GREATEST(COALESCE(p_mistakes, 0), 0), GREATEST(COALESCE(p_hesitations, 0), 0), COALESCE(p_notes, ''),
    p_ayah_from, p_ayah_to, p_halaqa_id, v_session.session_date,
    v_lines, v_faces, v_faces_completed,
    COALESCE(p_recitation_type, 'original'), COALESCE(p_value_source, 'auto'),
    CASE WHEN p_status = 'done' THEN now() ELSE NULL END,
    now()
  ON CONFLICT (session_id, student_id, surah_id, COALESCE(ayah_from, 0)) WHERE mode = 'recitation'
  DO UPDATE SET
    status = excluded.status,
    teacher_id = excluded.teacher_id,
    surah_to_id = excluded.surah_to_id,
    mistakes = excluded.mistakes,
    hesitations = excluded.hesitations,
    notes = excluded.notes,
    ayah_to = excluded.ayah_to,
    halaqa_id = excluded.halaqa_id,
    session_date = excluded.session_date,
    lines_recited = excluded.lines_recited,
    faces_recited = excluded.faces_recited,
    faces_completed = excluded.faces_completed,
    recitation_type = excluded.recitation_type,
    value_source = excluded.value_source,
    recited_at = excluded.recited_at,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Revoke from anon, grant to authenticated
REVOKE EXECUTE ON FUNCTION teacher_save_recitation_entry(
  uuid, uuid, text, text, uuid, uuid, integer, integer, text,
  integer, integer, uuid, integer, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_save_recitation_entry(
  uuid, uuid, text, text, uuid, uuid, integer, integer, text,
  integer, integer, uuid, integer, numeric, text, text
) TO authenticated;
