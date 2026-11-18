/*
# Public site statistics function

## What this adds
- `public_site_stats()`: returns three counts for the home page: active teachers, active students, and recorded Yawm Al-Sard days. It returns only numbers, no names or personal data.

## Security
- SECURITY DEFINER so visitors can see the totals without direct access to the profiles, students, or sessions tables. Those tables stay locked for anonymous visitors.
- Revoked from PUBLIC and granted to anon and authenticated only.

## Data safety
- Additive. Nothing existing is changed.
*/

CREATE OR REPLACE FUNCTION public.public_site_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'teachers', (SELECT count(*) FROM public.profiles WHERE role = 'teacher' AND is_active),
    'students', (SELECT count(*) FROM public.students WHERE is_active),
    'sessions', (SELECT count(*) FROM public.yawm_sessions)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.public_site_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_site_stats() TO anon, authenticated;
