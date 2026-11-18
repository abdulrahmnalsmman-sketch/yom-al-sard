/*
# Harden application grants

1. Purpose
- Remove default PUBLIC/anon access that can remain on newly created Supabase objects.
- Ensure the browser can reach only the authenticated read paths and approved RPC functions.

2. Security changes
- Revoke all table privileges from `anon` across the management tables.
- Revoke direct data mutation privileges from `authenticated`; privileged changes use role-checked functions.
- Keep authenticated SELECT only where the RLS policies already restrict rows.
- Revoke SECURITY DEFINER function execution from PUBLIC and anon, then grant the approved functions to authenticated.

3. Important notes
- This migration does not delete records or change existing data.
- Quran portion and Surah reference data remains readable to signed-in users; it is still protected from anonymous access.
*/

REVOKE ALL ON public.profiles, public.students, public.quran_portions, public.surahs, public.yawm_sessions, public.session_teachers, public.session_students, public.recitation_records, public.recitation_surah_details, public.audit_history FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles, public.students, public.quran_portions, public.surahs, public.yawm_sessions, public.session_teachers, public.session_students, public.recitation_records, public.recitation_surah_details, public.audit_history FROM authenticated;
GRANT SELECT ON public.profiles, public.students, public.quran_portions, public.surahs, public.yawm_sessions, public.session_teachers, public.session_students, public.recitation_records, public.recitation_surah_details, public.audit_history TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_initial_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_student(text, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_student(uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_session(text, date, time, time) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_session_status(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_assign_teacher(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_assign_student(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_recitation(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_initial_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_student(text, text, date), public.admin_update_student(uuid, text, text, boolean), public.admin_create_session(text, date, time, time), public.admin_set_session_status(uuid, text), public.admin_assign_teacher(uuid, uuid), public.admin_assign_student(uuid, uuid), public.save_recitation(uuid, uuid, uuid, jsonb) TO authenticated;
