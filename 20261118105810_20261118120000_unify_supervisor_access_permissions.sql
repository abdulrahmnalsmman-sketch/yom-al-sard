/*
# Unify supervisor access permissions without removing legacy data

1. Purpose
- Make the detailed permissions edited by the administrator the same permissions read by the supervisor dashboard.
- Preserve the existing `supervisor_permissions` table and all of its rows for compatibility with earlier functionality.

2. Security changes
- Allow an authenticated supervisor to read only their own row in `user_access_permissions`.
- Keep administrator access unchanged.
- No anonymous access is added.

3. Data preservation
- No table, column, relationship, or existing row is deleted or changed destructively.
- Existing legacy supervisor permission rows are copied into the detailed table only when a matching detailed row does not already exist.

4. Compatibility mapping
- Legacy student/report/attendance/session flags are mapped to the closest detailed permissions.
- The detailed table remains the source used by the current administrator permission editor.
*/

DROP POLICY IF EXISTS "supervisor_read_own_user_access_permissions" ON public.user_access_permissions;
CREATE POLICY "supervisor_read_own_user_access_permissions"
ON public.user_access_permissions
FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'supervisor'
      AND is_active
  )
);

INSERT INTO public.user_access_permissions (
  profile_id,
  can_view_students,
  can_view_halqat,
  can_record_attendance,
  can_view_reports,
  access_scope,
  selected_halqat_ids,
  updated_at
)
SELECT
  legacy.profile_id,
  legacy.can_view_students,
  legacy.can_manage_sessions,
  legacy.can_take_attendance,
  legacy.can_view_reports,
  'all_halqat',
  '{}',
  now()
FROM public.supervisor_permissions AS legacy
JOIN public.profiles AS profile ON profile.id = legacy.profile_id
WHERE profile.role = 'supervisor'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_access_permissions AS detailed
    WHERE detailed.profile_id = legacy.profile_id
  );
