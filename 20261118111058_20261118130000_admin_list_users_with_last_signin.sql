/*
# Admin list users with last sign-in

1. Purpose
- Give the user-management screen the real last sign-in time per account.
- Read directly from the auth user, which is the source of truth for sign-in timestamps.

2. Security
- SECURITY DEFINER function, restricted to active admins.
- Returns only non-sensitive fields (no passwords, no tokens).
- Execute privilege revoked from public and anon.
*/

CREATE OR REPLACE FUNCTION public.admin_list_users_with_last_signin()
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role text,
  is_active boolean,
  username text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.id,
    p.email,
    p.display_name,
    p.role,
    p.is_active,
    p.username,
    u.last_sign_in_at,
    u.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles caller
    WHERE caller.id = auth.uid()
      AND caller.role = 'admin'
      AND caller.is_active
  )
  ORDER BY u.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users_with_last_signin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users_with_last_signin() TO authenticated;
