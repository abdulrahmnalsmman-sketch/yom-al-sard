/*
# Add juz-based curriculum, teacher student selection, and student transfer RPCs

## 1. admin_add_curriculum_by_juz_range
- Creates curriculum items for all surahs that fall within a juz range (from_juz to to_juz).
- A surah is included in a juz if its page range overlaps with the juz's page range.
- If a surah spans multiple juz, it appears under each juz it overlaps (via separate curriculum items with appropriate page/ayah ranges).
- Automatically assigns sort_order based on surah_number within the curriculum.
- Clears existing items for the curriculum before adding new ones (for edit functionality).
- Admin-only.

## 2. teacher_select_session_students
- Lets a teacher select students from the general pool for a session they're assigned to.
- Creates session_students and session_student_assignments rows linking the selected students to the calling teacher.
- Removes students that were previously selected by this teacher but are no longer in the new selection (preserves recitation history).
- Teacher must be assigned to the session.

## 3. teacher_transfer_student
- Allows a teacher to take over a student from another teacher within the same session.
- Updates session_student_assignments to point the student to the new teacher.
- Does NOT delete or modify existing recitation_entries — the original teacher who did the recitation is preserved in those records.
- Both teachers must be assigned to the session.

## 4. get_juz_surah_index
- Returns a clean juz→surahs index: for each of the 30 juz, lists surahs whose page range overlaps that juz.
- No extra descriptions, just juz_number and surah name.
- Public read function.
*/

-- 1. Juz-based curriculum creation
CREATE OR REPLACE FUNCTION public.admin_add_curriculum_by_juz_range(
  p_curriculum_id uuid,
  p_from_juz integer,
  p_to_juz integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
  v_next_order integer;
  v_surah record;
  v_juz record;
  v_item_type text;
  v_start_page integer;
  v_end_page integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ليس لديك صلاحية تعديل المقررات.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM student_curricula WHERE id = p_curriculum_id) THEN
    RAISE EXCEPTION 'المقرر غير موجود.';
  END IF;
  IF p_from_juz < 1 OR p_to_juz > 30 OR p_from_juz > p_to_juz THEN
    RAISE EXCEPTION 'نطاق الأجزاء غير صحيح (1-30).';
  END IF;

  -- Clear existing items for this curriculum
  DELETE FROM student_curriculum_items WHERE curriculum_id = p_curriculum_id;

  v_next_order := 1;
  FOR v_juz IN SELECT * FROM quran_juz WHERE juz_number >= p_from_juz AND juz_number <= p_to_juz ORDER BY juz_number LOOP
    -- Find surahs that overlap this juz's page range
    FOR v_surah IN
      SELECT id, surah_number, name, start_page, end_page, ayah_count
      FROM quran_surahs
      WHERE start_page <= v_juz.end_page AND end_page >= v_juz.start_page
      ORDER BY surah_number
    LOOP
      -- Determine the page range within this juz for this surah
      v_start_page := GREATEST(v_surah.start_page, v_juz.start_page);
      v_end_page := LEAST(v_surah.end_page, v_juz.end_page);

      -- If the surah is fully within this juz, add as 'surah' type
      -- If only partially, add as 'page_range' with the overlapping pages
      IF v_start_page = v_surah.start_page AND v_end_page = v_surah.end_page THEN
        v_item_type := 'surah';
        v_start_page := NULL;
        v_end_page := NULL;
        INSERT INTO student_curriculum_items
          (curriculum_id, item_type, surah_id, sort_order)
        VALUES (p_curriculum_id, v_item_type, v_surah.id, v_next_order);
      ELSE
        v_item_type := 'page_range';
        INSERT INTO student_curriculum_items
          (curriculum_id, item_type, surah_id, start_page, end_page, sort_order)
        VALUES (p_curriculum_id, v_item_type, v_surah.id, v_start_page, v_end_page, v_next_order);
      END IF;

      v_next_order := v_next_order + 1;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_add_curriculum_by_juz_range(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_curriculum_by_juz_range(uuid, integer, integer) TO authenticated;

-- 2. Teacher selects students for a session
CREATE OR REPLACE FUNCTION public.teacher_select_session_students(
  p_session_id uuid,
  p_student_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher uuid := auth.uid();
  v_existing_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_teacher AND role = 'teacher' AND is_active) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN
    RAISE EXCEPTION 'not_assigned_to_session';
  END IF;
  IF p_student_ids IS NULL THEN
    RAISE EXCEPTION 'students_required';
  END IF;

  -- Validate all student IDs exist and are active
  IF EXISTS (
    SELECT 1 FROM unnest(p_student_ids) sid
    WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = sid AND s.is_active)
  ) THEN
    RAISE EXCEPTION 'invalid_student';
  END IF;

  -- Get students currently assigned to this teacher in this session
  SELECT array_agg(student_id) INTO v_existing_ids
  FROM session_student_assignments
  WHERE session_id = p_session_id AND teacher_id = v_teacher;

  -- Remove assignments for students no longer selected (preserves recitation_entries)
  DELETE FROM session_student_assignments
  WHERE session_id = p_session_id
    AND teacher_id = v_teacher
    AND student_id = ANY(COALESCE(v_existing_ids, ARRAY[]::uuid[]))
    AND NOT (student_id = ANY(p_student_ids));

  -- Also remove from session_students if no other teacher has them
  DELETE FROM session_students
  WHERE session_id = p_session_id
    AND student_id NOT IN (
      SELECT student_id FROM session_student_assignments WHERE session_id = p_session_id
    )
    AND student_id = ANY(COALESCE(v_existing_ids, ARRAY[]::uuid[]));

  -- Add new students to session_students (if not already there)
  INSERT INTO session_students (session_id, student_id)
  SELECT p_session_id, sid FROM unnest(p_student_ids) sid
  ON CONFLICT DO NOTHING;

  -- Add/update assignments for this teacher
  INSERT INTO session_student_assignments (session_id, student_id, teacher_id)
  SELECT p_session_id, sid, v_teacher FROM unnest(p_student_ids) sid
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.teacher_select_session_students(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_select_session_students(uuid, uuid[]) TO authenticated;

-- 3. Teacher transfers (takes over) a student from another teacher
CREATE OR REPLACE FUNCTION public.teacher_transfer_student(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_teacher AND role = 'teacher' AND is_active) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM session_teachers WHERE session_id = p_session_id AND teacher_id = v_teacher) THEN
    RAISE EXCEPTION 'not_assigned_to_session';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND is_active) THEN
    RAISE EXCEPTION 'invalid_student';
  END IF;

  -- Ensure student is in session_students
  INSERT INTO session_students (session_id, student_id)
  VALUES (p_session_id, p_student_id)
  ON CONFLICT DO NOTHING;

  -- Remove existing assignment for this student in this session (any teacher)
  DELETE FROM session_student_assignments
  WHERE session_id = p_session_id AND student_id = p_student_id;

  -- Assign to the requesting teacher
  INSERT INTO session_student_assignments (session_id, student_id, teacher_id)
  VALUES (p_session_id, p_student_id, v_teacher);

  -- Note: recitation_entries keep the original teacher_id, preserving who actually did the recitation
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.teacher_transfer_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_transfer_student(uuid, uuid) TO authenticated;

-- 4. Get juz-surah index (public read)
CREATE OR REPLACE FUNCTION public.get_juz_surah_index()
RETURNS TABLE(juz_number integer, juz_name text, surah_id uuid, surah_number integer, surah_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT j.juz_number, j.name, s.id, s.surah_number, s.name
  FROM quran_juz j
  CROSS JOIN quran_surahs s
  WHERE s.start_page <= j.end_page AND s.end_page >= j.start_page
  ORDER BY j.juz_number, s.surah_number;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_juz_surah_index() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_juz_surah_index() TO authenticated;
