/*
# Add public username-to-email lookup function

1. Purpose
- Allow unauthenticated users to look up the email associated with a username,
  so they can sign in with username instead of email.
- The function only returns the email — no other profile data is exposed.

2. Security
- SECURITY DEFINER function, callable by anon (for login before authentication).
- Returns only the email column, nothing else.
- Does not expose passwords, roles, or any sensitive data.
*/

CREATE OR REPLACE FUNCTION public.lookup_email_by_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles
  WHERE lower(username) = lower(trim(p_username))
  AND is_active
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_email_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon, authenticated;
