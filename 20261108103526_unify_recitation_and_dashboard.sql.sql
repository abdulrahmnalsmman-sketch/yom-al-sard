/*
# Unify recitation data source and add dashboard infrastructure

## Summary
Fixes core problem: teachers saved to recitation_entries but admin read from recitation_records. Now all screens read recitation_entries.
1. Adds halaqa_id, surah_number to recitation_entries
2. Adds target_juz, num_halqat, notes to yawm_sessions
3. Creates session_supervisors table
4. Creates get_dashboard_stats and get_day_recitations RPC functions
5. Grants SELECT on recitation_entries to authenticated
6. Enables realtime on recitation_entries and attendance_records
7. Backfills surah_number from quran_surahs

## Security
- SELECT on recitation_entries granted to authenticated
- session_supervisors RLS enabled with admin-only insert/delete
- All new RPCs are SECURITY DEFINER, EXECUTE revoked from anon
- Realtime publication enabled for recitation_entries and attendance_records
*/

ALTER TABLE recitation_entries ADD COLUMN IF NOT EXISTS halaqa_id uuid REFERENCES halqat(id);
ALTER TABLE recitation_entries ADD COLUMN IF NOT EXISTS surah_number integer;

UPDATE recitation_entries re
SET surah_number = qs.surah_number
FROM quran_surahs qs
WHERE re.surah_id = qs.id AND re.surah_number IS NULL;

ALTER TABLE yawm_sessions ADD COLUMN IF NOT EXISTS target_juz numeric DEFAULT 0;
ALTER TABLE yawm_sessions ADD COLUMN IF NOT EXISTS num_halqat integer DEFAULT 0;
ALTER TABLE yawm_sessions ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

CREATE TABLE IF NOT EXISTS session_supervisors (
  session_id uuid NOT NULL REFERENCES yawm_sessions(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, supervisor_id)
);

ALTER TABLE session_supervisors ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON session_supervisors TO authenticated;

DROP POLICY IF EXISTS "admin_manage_session_supervisors_sel" ON session_supervisors;
CREATE POLICY "admin_manage_session_supervisors_sel" ON session_supervisors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_session_supervisors_ins" ON session_supervisors;
CREATE POLICY "admin_manage_session_supervisors_ins" ON session_supervisors
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_manage_session_supervisors_del" ON session_supervisors;
CREATE POLICY "admin_manage_session_supervisors_del" ON session_supervisors
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT SELECT ON recitation_entries TO authenticated;

CREATE INDEX IF NOT EXISTS idx_recitation_entries_halaqa ON recitation_entries(halaqa_id);
CREATE INDEX IF NOT EXISTS idx_recitation_entries_surah_num ON recitation_entries(surah_number);
CREATE INDEX IF NOT EXISTS idx_recitation_entries_teacher ON recitation_entries(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);

ALTER TABLE recitation_entries REPLICA IDENTITY FULL;
ALTER TABLE attendance_records REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'recitation_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE recitation_entries;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attendance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_records;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_session yawm_sessions;
BEGIN
  SELECT * INTO v_session FROM yawm_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'session_not_found'); END IF;

  SELECT jsonb_build_object(
    'session', to_jsonb(v_session),
    'total_students', (SELECT count(DISTINCT ss.student_id) FROM session_students ss WHERE ss.session_id = p_session_id),
    'total_teachers', (SELECT count(DISTINCT st.teacher_id) FROM session_teachers st WHERE st.session_id = p_session_id),
    'total_supervisors', (SELECT count(*) FROM session_supervisors WHERE session_id = p_session_id),
    'total_halqat', (SELECT count(DISTINCT h.id) FROM halqat h
      WHERE h.is_active AND EXISTS (
        SELECT 1 FROM session_teachers st
        JOIN profiles p ON p.id = st.teacher_id
        WHERE st.session_id = p_session_id
      )),
    'attendance', (SELECT jsonb_build_object(
      'present', count(*) FILTER (WHERE status = 'present'),
      'absent', count(*) FILTER (WHERE status = 'absent'),
      'late', count(*) FILTER (WHERE status = 'late'),
      'excused', count(*) FILTER (WHERE status = 'excused'),
      'total', count(*)
    ) FROM attendance_records WHERE session_id = p_session_id),
    'recitations', (SELECT jsonb_build_object(
      'done', count(*) FILTER (WHERE status = 'done'),
      'not_ready', count(*) FILTER (WHERE status = 'not_ready'),
      'repeat', count(*) FILTER (WHERE status = 'repeat'),
      'total', count(*),
      'total_mistakes', coalesce(sum(mistakes), 0),
      'total_hesitations', coalesce(sum(hesitations), 0),
      'pages_done', coalesce(sum(
        CASE WHEN status = 'done' THEN
          (SELECT qs.end_page - qs.start_page + 1 FROM quran_surahs qs WHERE qs.id = recitation_entries.surah_id)
        ELSE 0 END
      ), 0)
    ) FROM recitation_entries WHERE session_id = p_session_id),
    'students_without_recitation', (SELECT count(*) FROM session_students ss
      WHERE ss.session_id = p_session_id
      AND NOT EXISTS (SELECT 1 FROM recitation_entries re WHERE re.session_id = p_session_id AND re.student_id = ss.student_id)),
    'students_without_attendance', (SELECT count(*) FROM session_students ss
      WHERE ss.session_id = p_session_id
      AND NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.session_id = p_session_id AND ar.student_id = ss.student_id))
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_dashboard_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION get_day_recitations(p_session_id uuid)
RETURNS TABLE(
  id uuid, student_id uuid, student_name text, teacher_id uuid, teacher_name text,
  halaqa_id uuid, halaqa_name text, surah_id uuid, surah_number int, surah_name text,
  status text, mistakes int, hesitations int, notes text, created_at timestamptz, updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT re.id, re.student_id, st.name, re.teacher_id, p.display_name,
    re.halaqa_id, h.name,
    re.surah_id, re.surah_number, qs.name,
    re.status, re.mistakes, re.hesitations, re.notes, re.created_at, re.updated_at
  FROM recitation_entries re
  LEFT JOIN students st ON st.id = re.student_id
  LEFT JOIN profiles p ON p.id = re.teacher_id
  LEFT JOIN halqat h ON h.id = re.halaqa_id
  LEFT JOIN quran_surahs qs ON qs.id = re.surah_id
  WHERE re.session_id = p_session_id
  ORDER BY re.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_day_recitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_day_recitations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION admin_assign_session_supervisor(p_session_id uuid, p_supervisor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  INSERT INTO session_supervisors (session_id, supervisor_id) VALUES (p_session_id, p_supervisor_id)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_assign_session_supervisor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_assign_session_supervisor(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION admin_unassign_session_supervisor(p_session_id uuid, p_supervisor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  DELETE FROM session_supervisors WHERE session_id = p_session_id AND supervisor_id = p_supervisor_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_unassign_session_supervisor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_unassign_session_supervisor(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION admin_update_session_full(
  p_id uuid, p_name text, p_date date, p_start time, p_end time,
  p_target_juz numeric DEFAULT 0, p_num_halqat integer DEFAULT 0, p_notes text DEFAULT ''
)
RETURNS yawm_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_session yawm_sessions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE yawm_sessions SET name = trim(p_name), session_date = p_date, start_time = p_start, end_time = p_end,
    target_juz = p_target_juz, num_halqat = p_num_halqat, notes = p_notes, updated_at = now()
  WHERE id = p_id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_update_session_full(uuid, text, date, time, time, numeric, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_update_session_full(uuid, text, date, time, time, numeric, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_create_session_full(
  p_name text, p_date date, p_start time, p_end time,
  p_target_juz numeric DEFAULT 0, p_num_halqat integer DEFAULT 0, p_notes text DEFAULT ''
)
RETURNS yawm_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created yawm_sessions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'Invalid session times'; END IF;
  INSERT INTO yawm_sessions (name, session_date, start_time, end_time, created_by, target_juz, num_halqat, notes)
  VALUES (trim(p_name), p_date, p_start, p_end, auth.uid(), p_target_juz, p_num_halqat, p_notes)
  RETURNING * INTO created;
  INSERT INTO audit_history (actor_id, action, entity_type, entity_id, after_data) VALUES (auth.uid(), 'create', 'session', created.id, to_jsonb(created));
  RETURN created;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_create_session_full(text, date, time, time, numeric, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_create_session_full(text, date, time, time, numeric, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION teacher_save_recitation_entry(
  p_session_id uuid, p_student_id uuid, p_mode text, p_status text,
  p_surah_from uuid, p_surah_to uuid, p_mistakes integer, p_hesitations integer, p_notes text,
  p_ayah_from integer DEFAULT NULL, p_ayah_to integer DEFAULT NULL,
  p_halaqa_id uuid DEFAULT NULL
)
RETURNS recitation_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row recitation_entries; v_teacher uuid := auth.uid(); v_surah_num integer; v_session yawm_sessions;
BEGIN
  IF p_status NOT IN ('done', 'repeat', 'not_ready') THEN RAISE EXCEPTION 'invalid_recitation'; END IF;
  IF p_surah_from IS NULL THEN RAISE EXCEPTION 'surah_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM session_students WHERE session_id = p_session_id AND student_id = p_student_id) THEN RAISE EXCEPTION 'student_not_in_session'; END IF;

  SELECT surah_number INTO v_surah_num FROM quran_surahs WHERE id = p_surah_from;
  SELECT * INTO v_session FROM yawm_sessions WHERE id = p_session_id;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'session_closed'; END IF;

  INSERT INTO recitation_entries (session_id, student_id, teacher_id, mode, status, surah_id, surah_from_id, surah_to_id, surah_number, mistakes, hesitations, notes, ayah_from, ayah_to, halaqa_id, session_date, updated_at)
  SELECT p_session_id, p_student_id, v_teacher, 'recitation', p_status, p_surah_from, p_surah_from, p_surah_to, v_surah_num,
    GREATEST(COALESCE(p_mistakes, 0), 0), GREATEST(COALESCE(p_hesitations, 0), 0), COALESCE(p_notes, ''),
    p_ayah_from, p_ayah_to, p_halaqa_id, v_session.session_date, now()
  ON CONFLICT (session_id, student_id, surah_id, COALESCE(ayah_from, 0)) WHERE mode = 'recitation'
  DO UPDATE SET status = excluded.status, teacher_id = excluded.teacher_id, surah_to_id = excluded.surah_to_id,
    mistakes = excluded.mistakes, hesitations = excluded.hesitations, notes = excluded.notes,
    ayah_to = excluded.ayah_to, halaqa_id = excluded.halaqa_id, session_date = excluded.session_date, updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text, integer, integer, uuid) TO authenticated;
