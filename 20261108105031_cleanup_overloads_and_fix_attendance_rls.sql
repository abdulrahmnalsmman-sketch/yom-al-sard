/*
# Clean up old overloaded teacher_save_recitation_entry functions and fix attendance RLS

## Changes

1. **Drop old overloads** of `teacher_save_recitation_entry` that lack session_closed check, surah_number backfill, and halaqa_id. Only the latest version (with p_halaqa_id) should remain.
2. **Fix attendance RLS**: Requirements say teachers don't take attendance (admin only, or supervisor with explicit grant). The current policies allow teachers to insert/update attendance. Replace with admin/supervisor-only policies.
3. **Add DELETE policy** for attendance (admin only).

## Security
- Attendance: restrict INSERT/UPDATE/DELETE to admin and supervisor (if explicitly granted via `can_record_attendance` permission). Teachers lose direct write access.
- Recitation entries: unchanged (teacher insert/update own session, admin/supervisor/own-teacher select).
*/

-- Drop old overloads (2-arg and 9-arg versions without p_halaqa_id)
DROP FUNCTION IF EXISTS public.teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text);
DROP FUNCTION IF EXISTS public.teacher_save_recitation_entry(uuid, uuid, text, text, uuid, uuid, integer, integer, text, integer, integer);

-- Drop and recreate attendance policies to be admin/supervisor-only
DROP POLICY IF EXISTS "attendance_teacher_insert_own_session" ON attendance_records;
DROP POLICY IF EXISTS "attendance_teacher_update_own_session" ON attendance_records;
DROP POLICY IF EXISTS "attendance_select" ON attendance_records;

-- Admin and supervisor can read all attendance
CREATE POLICY "attendance_select"
ON attendance_records FOR SELECT
TO authenticated
USING (
  is_admin()
  OR is_supervisor()
  OR teacher_id = auth.uid()
);

-- Admin can insert attendance
CREATE POLICY "attendance_admin_insert"
ON attendance_records FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Supervisor with explicit attendance permission can insert
CREATE POLICY "attendance_supervisor_insert"
ON attendance_records FOR INSERT
TO authenticated
WITH CHECK (
  is_supervisor()
  AND EXISTS (
    SELECT 1 FROM user_access_permissions uap
    WHERE uap.profile_id = auth.uid()
    AND uap.can_record_attendance = true
  )
);

-- Admin can update attendance
CREATE POLICY "attendance_admin_update"
ON attendance_records FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Supervisor with explicit attendance permission can update
CREATE POLICY "attendance_supervisor_update"
ON attendance_records FOR UPDATE
TO authenticated
USING (
  is_supervisor()
  AND EXISTS (
    SELECT 1 FROM user_access_permissions uap
    WHERE uap.profile_id = auth.uid()
    AND uap.can_record_attendance = true
  )
)
WITH CHECK (
  is_supervisor()
  AND EXISTS (
    SELECT 1 FROM user_access_permissions uap
    WHERE uap.profile_id = auth.uid()
    AND uap.can_record_attendance = true
  )
);

-- Admin can delete attendance
DROP POLICY IF EXISTS "attendance_admin_delete" ON attendance_records;
CREATE POLICY "attendance_admin_delete"
ON attendance_records FOR DELETE
TO authenticated
USING (is_admin());
