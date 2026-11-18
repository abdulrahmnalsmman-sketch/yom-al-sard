/*
# Cascade Delete Session + Student Archive/Restore/Delete

## Part 1: admin_cascade_delete_session
- New SECURITY DEFINER RPC that permanently deletes a yawm_sessions row
  and ALL related data in the correct order.
- Deletes from: recitation_entries, recitation_records, recitation_surah_details,
  attendance_records, session_student_assignments, session_students,
  session_teachers, session_supervisors, audit_history (for this session),
  then finally the yawm_sessions row itself.
- Admin-only (is_admin() check).
- Does NOT delete students, teachers, or other sessions.

## Part 2: admin_archive_student / admin_restore_student / admin_delete_student_permanent
- admin_archive_student: sets is_active = false on a student (soft archive).
  Student disappears from active lists but all historical data is preserved.
- admin_restore_student: sets is_active = true (un-archive).
- admin_delete_student_permanent: hard-deletes a student and all related data
  (recitation_entries CASCADE, attendance_records CASCADE, student_curricula CASCADE,
  student_edit_history CASCADE, session_student_assignments CASCADE).
  This is irreversible. Admin-only.

## Part 3: admin_set_teacher_for_session
- New RPC that lets a teacher "act as" a selected teacher profile within a session.
  Used by the unified teacher login flow: the shared account authenticates,
  then the user picks their teacher name, and this RPC validates + returns the
  teacher's profile so the frontend can operate as that teacher.
- Actually we don't need a separate RPC for this — the frontend will fetch the
  teacher profile by ID and use it locally. The RLS policies already scope by
  auth.uid(), so we need a different approach: see Part 2 migration.

## Security
- All functions are SECURITY DEFINER with is_admin() or is_teacher() checks.
- REVOKE EXECUTE FROM PUBLIC, anon on all new functions.
- GRANT EXECUTE TO authenticated.
*/

-- ============================================================
-- Part 1: Cascade Delete Session
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_cascade_delete_session(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  session_name text;
  session_exists boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية الحذف.';
  END IF;

  SELECT name, true INTO session_name, session_exists
  FROM public.yawm_sessions WHERE id = p_session_id;

  IF NOT session_exists OR session_name IS NULL THEN
    RAISE EXCEPTION 'يوم السرد غير موجود.';
  END IF;

  -- Delete child records in dependency order
  -- recitation_surah_details cascade from recitation_records
  DELETE FROM public.recitation_surah_details
    WHERE record_id IN (SELECT id FROM public.recitation_records WHERE session_id = p_session_id);

  DELETE FROM public.recitation_entries WHERE session_id = p_session_id;
  DELETE FROM public.recitation_records WHERE session_id = p_session_id;
  DELETE FROM public.attendance_records WHERE session_id = p_session_id;
  DELETE FROM public.session_student_assignments WHERE session_id = p_session_id;
  DELETE FROM public.session_students WHERE session_id = p_session_id;
  DELETE FROM public.session_teachers WHERE session_id = p_session_id;
  DELETE FROM public.session_supervisors WHERE session_id = p_session_id;

  -- Delete audit history entries for this session
  DELETE FROM public.audit_history WHERE entity_type = 'session' AND entity_id = p_session_id;

  -- Finally delete the session itself
  DELETE FROM public.yawm_sessions WHERE id = p_session_id;

  -- Log the deletion
  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'delete', 'session', p_session_id, jsonb_build_object('name', session_name, 'deleted', true));

  RETURN 'deleted';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_cascade_delete_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cascade_delete_session(uuid) TO authenticated;

-- ============================================================
-- Part 2: Student Archive / Restore / Permanent Delete
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_archive_student(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية هذه العملية.';
  END IF;

  UPDATE public.students
    SET is_active = false, updated_at = now()
    WHERE id = p_student_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود أو مؤرشف بالفعل.';
  END IF;

  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'archive', 'student', p_student_id, jsonb_build_object('archived', true));

  RETURN 'archived';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_archive_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_student(uuid) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_restore_student(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية هذه العملية.';
  END IF;

  UPDATE public.students
    SET is_active = true, updated_at = now()
    WHERE id = p_student_id AND is_active = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطالب غير موجود أو نشط بالفعل.';
  END IF;

  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'restore', 'student', p_student_id, jsonb_build_object('restored', true));

  RETURN 'restored';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_restore_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_student(uuid) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_student_permanent(p_student_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  student_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية الحذف.';
  END IF;

  SELECT name INTO student_name FROM public.students WHERE id = p_student_id;
  IF student_name IS NULL THEN
    RAISE EXCEPTION 'الطالب غير موجود.';
  END IF;

  -- Hard delete: FK CASCADE handles recitation_entries, attendance_records,
  -- student_curricula, student_edit_history, session_student_assignments
  DELETE FROM public.students WHERE id = p_student_id;

  INSERT INTO public.audit_history (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'delete', 'student', p_student_id, jsonb_build_object('name', student_name, 'deleted', true));

  RETURN 'deleted';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_student_permanent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_student_permanent(uuid) TO authenticated;

-- ============================================================
-- Part 3: Update admin_entity_usage to include session_student_assignments
-- and session_teachers / session_students for session kind
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_entity_usage(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
result jsonb;
BEGIN
IF NOT public.is_admin() THEN RAISE EXCEPTION 'ليس لديك صلاحية الحذف.'; END IF;

IF p_kind = 'session' THEN
SELECT jsonb_build_object(
'recitations', (SELECT count(*) FROM public.recitation_entries WHERE session_id = p_id),
'legacy_recitations', (SELECT count(*) FROM public.recitation_records WHERE session_id = p_id),
'attendance', (SELECT count(*) FROM public.attendance_records WHERE session_id = p_id),
'student_assignments', (SELECT count(*) FROM public.session_student_assignments WHERE session_id = p_id),
'session_students', (SELECT count(*) FROM public.session_students WHERE session_id = p_id),
'session_teachers', (SELECT count(*) FROM public.session_teachers WHERE session_id = p_id)
) INTO result;
ELSIF p_kind = 'student' THEN
SELECT jsonb_build_object(
'recitations', (SELECT count(*) FROM public.recitation_entries WHERE student_id = p_id),
'legacy_recitations', (SELECT count(*) FROM public.recitation_records WHERE student_id = p_id),
'attendance', (SELECT count(*) FROM public.attendance_records WHERE student_id = p_id),
'student_assignments', (SELECT count(*) FROM public.session_student_assignments WHERE student_id = p_id),
'curricula', (SELECT count(*) FROM public.student_curricula WHERE student_id = p_id)
) INTO result;
ELSIF p_kind = 'halqa' THEN
SELECT jsonb_build_object(
'students', (SELECT count(*) FROM public.students WHERE halqa_id = p_id),
'recitations', (SELECT count(*) FROM public.recitation_entries WHERE halaqa_id = p_id)
) INTO result;
ELSIF p_kind = 'teacher' THEN
SELECT jsonb_build_object(
'recitations', (SELECT count(*) FROM public.recitation_entries WHERE teacher_id = p_id),
'legacy_recitations', (SELECT count(*) FROM public.recitation_records WHERE teacher_id = p_id),
'attendance', (SELECT count(*) FROM public.attendance_records WHERE teacher_id = p_id),
'session_assignments', (SELECT count(*) FROM public.session_teachers WHERE teacher_id = p_id),
'student_assignments', (SELECT count(*) FROM public.session_student_assignments WHERE teacher_id = p_id),
'created_sessions', (SELECT count(*) FROM public.yawm_sessions WHERE created_by = p_id),
'curricula', (SELECT count(*) FROM public.student_curricula WHERE assigned_by = p_id)
) INTO result;
ELSE
RAISE EXCEPTION 'نوع العنصر المطلوب فحصه غير معروف.';
END IF;

RETURN result;
END;
$function$;

-- ============================================================
-- Part 4: Update admin_delete_entity to use cascade delete for sessions
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_entity(p_kind text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
usage jsonb;
is_linked boolean;
affected integer;
BEGIN
IF NOT public.is_admin() THEN RAISE EXCEPTION 'ليس لديك صلاحية الحذف.'; END IF;
IF p_kind = 'teacher' AND p_id = auth.uid() THEN
RAISE EXCEPTION 'لا يمكن حذف أو أرشفة حسابك الحالي.';
END IF;

IF p_kind = 'session' THEN
  -- Always cascade-delete: the user explicitly confirmed they want everything gone
  PERFORM public.admin_cascade_delete_session(p_id);
  RETURN 'deleted';
ELSIF p_kind = 'student' THEN
IF is_linked THEN
UPDATE public.students SET is_active = false, updated_at = now() WHERE id = p_id;
GET DIAGNOSTICS affected = ROW_COUNT;
IF affected = 0 THEN RAISE EXCEPTION 'الطالب غير موجود.'; END IF;
RETURN 'archived';
END IF;
DELETE FROM public.students WHERE id = p_id;
ELSIF p_kind = 'halqa' THEN
IF is_linked THEN
UPDATE public.halqat SET is_active = false, updated_at = now() WHERE id = p_id;
GET DIAGNOSTICS affected = ROW_COUNT;
IF affected = 0 THEN RAISE EXCEPTION 'الحلقة غير موجودة.'; END IF;
RETURN 'archived';
END IF;
DELETE FROM public.halqat WHERE id = p_id;
ELSIF p_kind = 'teacher' THEN
IF is_linked THEN
UPDATE public.profiles SET is_active = false WHERE id = p_id;
GET DIAGNOSTICS affected = ROW_COUNT;
IF affected = 0 THEN RAISE EXCEPTION 'الحساب غير موجود.'; END IF;
RETURN 'archived';
END IF;
DELETE FROM auth.users WHERE id = p_id;
END IF;

GET DIAGNOSTICS affected = ROW_COUNT;
IF affected = 0 THEN RAISE EXCEPTION 'العنصر غير موجود.'; END IF;
RETURN 'deleted';
END;
$function$;
