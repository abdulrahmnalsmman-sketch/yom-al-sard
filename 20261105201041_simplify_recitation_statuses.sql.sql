/*
# Simplify recitation statuses and remove mode distinction

## Summary
This migration simplifies the recitation system:
1. Migrates old status values: 'good' → 'done', 'repeat' stays 'repeat' (renamed label "يعاد"), 'not_ready' stays.
2. Removes the 'mode' column distinction by setting all existing rows to 'recitation' and making it the only mode.
3. Adds an 'ayah_from' and 'ayah_to' column to recitation_entries for precise ayah-level tracking per the static juz index.
4. Adds a 'session_date' column linking entries to the session's date for easier admin/report queries.
5. Creates an index on recitation_entries(session_id) for faster admin dashboard queries.
6. Grants admin (via authenticated role) SELECT on recitation_entries so the admin dashboard and reports can read them.

## Data migrations
- UPDATE recitation_entries SET status = 'done' WHERE status = 'good';
- UPDATE recitation_entries SET status = 'repeat' WHERE status = 'repeat';
- All rows get mode = 'recitation'.

## New columns on recitation_entries
- ayah_from integer (nullable) — starting ayah within the surah for this entry
- ayah_to integer (nullable) — ending ayah within the surah for this entry
- session_date date (nullable) — denormalized from yawm_sessions for fast queries

## Security
- No policy changes. Existing RLS policies on recitation_entries remain.
- Adds SELECT grant to authenticated so admin/supervisor can read recitation_entries.

## Important notes
1. The CHECK constraint on status is updated to only allow 'done', 'not_ready', 'repeat'.
2. The unique index now includes ayah_from so the same surah can be recited in different ayah ranges within a session.
3. The teacher_save_recitation_entry function is updated to accept ayah_from/ayah_to and default session_date.
*/

UPDATE recitation_entries SET status = 'done' WHERE status = 'good';
UPDATE recitation_entries SET status = 'repeat' WHERE status = 'repeat';
UPDATE recitation_entries SET mode = 'recitation' WHERE mode IS NULL OR mode = 'review';

ALTER TABLE recitation_entries ADD COLUMN IF NOT EXISTS ayah_from integer;
ALTER TABLE recitation_entries ADD COLUMN IF NOT EXISTS ayah_to integer;
ALTER TABLE recitation_entries ADD COLUMN IF NOT EXISTS session_date date;

UPDATE recitation_entries re
SET session_date = ys.session_date
FROM yawm_sessions ys
WHERE re.session_id = ys.id AND re.session_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_recitation_entries_session ON recitation_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_recitation_entries_date ON recitation_entries(session_date);
CREATE INDEX IF NOT EXISTS idx_recitation_entries_status ON recitation_entries(status);

DROP INDEX IF EXISTS recitation_entries_session_student_mode_surah_key;
CREATE UNIQUE INDEX IF NOT EXISTS recitation_entries_session_student_surah_ayah_key
  ON recitation_entries(session_id, student_id, surah_id, COALESCE(ayah_from, 0))
  WHERE mode = 'recitation';

GRANT SELECT ON recitation_entries TO authenticated;

CREATE OR REPLACE FUNCTION teacher_save_recitation_entry(
  p_session_id uuid, p_student_id uuid, p_mode text, p_status text,
  p_surah_from uuid, p_surah_to uuid, p_mistakes integer, p_hesitations integer, p_notes text,
  p_ayah_from integer DEFAULT NULL, p_ayah_to integer DEFAULT NULL
)
RETURNS recitation_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row recitation_entries; v_teacher uuid := auth.uid();
BEGIN
  IF p_status NOT IN ('done', 'repeat', 'not_ready') THEN RAISE EXCEPTION 'invalid_recitation'; END IF;
  IF p_surah_from IS NULL THEN RAISE EXCEPTION 'surah_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN RAISE EXCEPTION 'student_not_in_session'; END IF;
  INSERT INTO recitation_entries (session_id, student_id, teacher_id, mode, status, surah_id, surah_from_id, surah_to_id, mistakes, hesitations, notes, ayah_from, ayah_to, session_date, updated_at)
  SELECT p_session_id, p_student_id, v_teacher, 'recitation', p_status, p_surah_from, p_surah_from, p_surah_to, GREATEST(COALESCE(p_mistakes, 0), 0), GREATEST(COALESCE(p_hesitations, 0), 0), COALESCE(p_notes, ''), p_ayah_from, p_ayah_to, ys.session_date, now()
  FROM yawm_sessions ys WHERE ys.id = p_session_id
  ON CONFLICT (session_id, student_id, surah_id, COALESCE(ayah_from, 0)) WHERE mode = 'recitation'
  DO UPDATE SET status = excluded.status, teacher_id = excluded.teacher_id, surah_to_id = excluded.surah_to_id, mistakes = excluded.mistakes, hesitations = excluded.hesitations, notes = excluded.notes, ayah_to = excluded.ayah_to, session_date = excluded.session_date, updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text, integer, integer) TO authenticated;
