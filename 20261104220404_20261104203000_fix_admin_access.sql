/*
# Fix admin login: identity verification + is_admin() execute privilege

1. Fix email_verified flag in auth.identities for the admin user.
   - The Edge Function that created the admin set email_confirm: true which
     set email_confirmed_at in auth.users, but did NOT update
     identities.email_verified to true. This can cause GoTrue to reject
     or improperly handle sign-in.

2. Grant EXECUTE on is_admin() to authenticated.
   - The original migration revoked EXECUTE from everyone, which silently
     breaks every RLS policy that calls is_admin() (profiles, students,
     sessions, recitations, audit_history). When the browser queries these
     tables, the function cannot be executed, causing policies to fail.
   - is_admin() is SECURITY DEFINER and only returns a boolean — safe to
     expose to authenticated users.

3. No data changes — only privilege and identity metadata fixes.
*/

-- Fix 1: Set email_verified = true in auth.identities for the admin user
UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email_verified}', 'true'::jsonb),
    updated_at = now()
WHERE user_id = '6acdb64d-6a82-48b5-8961-04ad54669c4a'
  AND provider = 'email';

-- Fix 2: Grant EXECUTE on is_admin() to authenticated (not anon)
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
