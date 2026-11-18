/*
# Fix adding surahs to student curricula and add safe admin deletion

## 1. Curriculum items
- admin_add_curriculum_item now validates the surah/juz, ayah and page ranges against the Quran index.
- When no position is supplied, the item is appended after the last item of the curriculum (max + 1), so the order follows the order in which surahs were added.
- Adding the same surah twice to one curriculum is rejected with a clear message.
- Errors are raised as readable Arabic messages so the screen can show the real cause.

## 2. Archive column
- yawm_sessions gains archived_at (nullable). Archived days are hidden from lists but kept for reports.

## 3. Usage check and safe deletion (admin only)
- admin_entity_usage(kind, id) returns counts of linked records (recitations, attendance, curricula, assignments, students in a halqa).
- admin_delete_entity(kind, id) hard-deletes only when nothing is linked. When history is linked it archives instead:
  - session: sets archived_at
  - student / halqa / teacher: sets is_active = false
- Teacher login removal only happens when the teacher has no links; an admin cannot delete their own account.

## Security
- All functions check is_admin() first, are SECURITY DEFINER with a fixed search_path, and are executable only by authenticated users.
*/

ALTER TABLE public.yawm_sessions ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_add_curriculum_item(
  p_curriculum_id uuid,
  p_item_type text,
  p_juz_id uuid DEFAULT NULL::uuid,
  p_surah_id uuid DEFAULT NULL::uuid,
  p_start_ayah integer DEFAULT NULL::integer,
  p_end_ayah integer DEFAULT NULL::integer,
  p_start_page integer DEFAULT NULL::integer,
  p_end_page integer DEFAULT NULL::integer,
  p_sort_order integer DEFAULT NULL::integer
)
RETURNS student_curriculum_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  created public.student_curriculum_items;
  surah_ayah_count integer;
  next_order integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ليس لديك صلاحية تعديل المقررات.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_curricula WHERE id = p_curriculum_id) THEN
    RAISE EXCEPTION 'المقرر غير موجود.';
  END IF;
  IF p_item_type NOT IN ('juz', 'surah', 'ayah_range', 'page_range') THEN
    RAISE EXCEPTION 'نوع العنصر غير صحيح.';
  END IF;

  IF p_item_type = 'juz' THEN
    IF p_juz_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.quran_juz WHERE id = p_juz_id) THEN
      RAISE EXCEPTION 'الجزء المختار غير موجود في فهرس القرآن.';
    END IF;
  ELSIF p_item_type IN ('surah', 'ayah_range') THEN
    IF p_surah_id IS NULL THEN RAISE EXCEPTION 'اختر السورة أولاً.'; END IF;
    SELECT ayah_count INTO surah_ayah_count FROM public.quran_surahs WHERE id = p_surah_id;
    IF surah_ayah_count IS NULL THEN
      RAISE EXCEPTION 'السورة المختارة غير موجودة في فهرس القرآن.';
    END IF;
    IF p_start_ayah IS NOT NULL AND (p_start_ayah < 1 OR p_start_ayah > surah_ayah_count) THEN
      RAISE EXCEPTION 'آية البداية خارج نطاق السورة (1 - %).', surah_ayah_count;
    END IF;
    IF p_end_ayah IS NOT NULL AND (p_end_ayah < 1 OR p_end_ayah > surah_ayah_count) THEN
      RAISE EXCEPTION 'آية النهاية خارج نطاق السورة (1 - %).', surah_ayah_count;
    END IF;
    IF p_start_ayah IS NOT NULL AND p_end_ayah IS NOT NULL AND p_start_ayah > p_end_ayah THEN
      RAISE EXCEPTION 'آية البداية يجب أن تكون قبل آية النهاية.';
    END IF;
    IF p_item_type = 'surah' AND EXISTS (
      SELECT 1 FROM public.student_curriculum_items
      WHERE curriculum_id = p_curriculum_id AND item_type = 'surah' AND surah_id = p_surah_id
    ) THEN
      RAISE EXCEPTION 'هذه السورة موجودة بالفعل في المقرر.';
    END IF;
  ELSE
    IF p_start_page IS NULL OR p_end_page IS NULL
       OR p_start_page < 1 OR p_end_page > 604 OR p_start_page > p_end_page THEN
      RAISE EXCEPTION 'أرقام الصفحات غير صحيحة (من 1 إلى 604).';
    END IF;
  END IF;

  IF p_sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order
    FROM public.student_curriculum_items WHERE curriculum_id = p_curriculum_id;
  ELSE
    next_order := p_sort_order;
  END IF;

  INSERT INTO public.student_curriculum_items
    (curriculum_id, item_type, juz_id, surah_id, start_ayah, end_ayah, start_page, end_page, sort_order)
  VALUES
    (p_curriculum_id, p_item_type, p_juz_id, p_surah_id, p_start_ayah, p_end_ayah, p_start_page, p_end_page, next_order)
  RETURNING * INTO created;
  RETURN created;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_add_curriculum_item(uuid, text, uuid, uuid, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_curriculum_item(uuid, text, uuid, uuid, integer, integer, integer, integer, integer) TO authenticated;

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
      'attendance', (SELECT count(*) FROM public.attendance_records WHERE session_id = p_id)
    ) INTO result;
  ELSIF p_kind = 'student' THEN
    SELECT jsonb_build_object(
      'recitations', (SELECT count(*) FROM public.recitation_entries WHERE student_id = p_id),
      'legacy_recitations', (SELECT count(*) FROM public.recitation_records WHERE student_id = p_id),
      'attendance', (SELECT count(*) FROM public.attendance_records WHERE student_id = p_id)
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

  usage := public.admin_entity_usage(p_kind, p_id);
  SELECT COALESCE(SUM(value::integer), 0) > 0 INTO is_linked FROM jsonb_each_text(usage);

  IF p_kind = 'session' THEN
    IF is_linked THEN
      UPDATE public.yawm_sessions SET archived_at = now() WHERE id = p_id AND archived_at IS NULL;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected = 0 AND NOT EXISTS (SELECT 1 FROM public.yawm_sessions WHERE id = p_id) THEN
        RAISE EXCEPTION 'يوم الهمة غير موجود.';
      END IF;
      RETURN 'archived';
    END IF;
    DELETE FROM public.yawm_sessions WHERE id = p_id;
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

REVOKE EXECUTE ON FUNCTION public.admin_entity_usage(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_entity_usage(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_entity(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_entity(text, uuid) TO authenticated;
