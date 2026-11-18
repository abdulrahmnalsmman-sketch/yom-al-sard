/*
# Site edit PIN and PIN-checked settings updates

## What this adds
1. Enables the `pgcrypto` extension (in the `extensions` schema) so the PIN can be stored as a bcrypt hash.
2. `site_edit_pin`: a single-row table that holds only the bcrypt hash of the admin's edit PIN.
   No PIN is seeded. The admin sets it from inside the site.
3. `admin_has_site_edit_pin()`: tells the admin UI whether a PIN has been set yet.
4. `admin_set_site_edit_pin(p_current_pin, p_new_pin)`: sets the first PIN, or changes it when the current PIN is correct.
5. `admin_verify_site_edit_pin(p_pin)`: returns true only when the PIN matches.
6. `admin_update_site_settings(p_pin, p_values)`: replaces the earlier version. It requires an admin AND the correct PIN, and it validates colors.

## Security
- `site_edit_pin` has RLS enabled and no grants or policies for anon or authenticated, so the hash cannot be read from the browser.
- Every function checks `is_admin()` first, then checks the PIN on the server.
- All functions are revoked from PUBLIC and anon and granted only to authenticated.
- The earlier `admin_update_site_settings(jsonb)` is removed. It was created in this same work session and had no callers, so no data is lost.

## Data safety
- Additive except for removing the earlier unused function. No existing tables or rows are changed.
- Re-running is safe: `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, and policy-free tables.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.site_edit_pin (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_edit_pin ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_edit_pin FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_update_site_settings(jsonb);

CREATE OR REPLACE FUNCTION public.admin_has_site_edit_pin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الموقع.';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.site_edit_pin WHERE id = 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_verify_site_edit_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  stored_hash text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الموقع.';
  END IF;
  SELECT pin_hash INTO stored_hash FROM public.site_edit_pin WHERE id = 1;
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN extensions.crypt(p_pin, stored_hash) = stored_hash;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_site_edit_pin(p_current_pin text, p_new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الموقع.';
  END IF;
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'يجب أن يتكون الرمز السري من 4 إلى 8 أرقام.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_edit_pin WHERE id = 1) THEN
    IF NOT public.admin_verify_site_edit_pin(p_current_pin) THEN
      RAISE EXCEPTION 'الرمز السري الحالي غير صحيح.';
    END IF;
  END IF;
  INSERT INTO public.site_edit_pin (id, pin_hash, updated_at)
  VALUES (1, extensions.crypt(p_new_pin, extensions.gen_salt('bf')), now())
  ON CONFLICT (id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_site_settings(p_pin text, p_values jsonb)
RETURNS public.site_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  result public.site_settings;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الموقع.';
  END IF;
  IF NOT public.admin_verify_site_edit_pin(p_pin) THEN
    RAISE EXCEPTION 'الرمز السري غير صحيح.';
  END IF;
  IF (p_values->>'primary_color') IS NOT NULL AND (p_values->>'primary_color') !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'اللون الأساسي غير صالح.';
  END IF;
  IF (p_values->>'accent_color') IS NOT NULL AND (p_values->>'accent_color') !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'لون التمييز غير صالح.';
  END IF;
  IF p_values ? 'stat_cards' AND jsonb_typeof(p_values->'stat_cards') <> 'array' THEN
    RAISE EXCEPTION 'بطاقات الأرقام يجب أن تكون قائمة.';
  END IF;

  UPDATE public.site_settings SET
    platform_name = COALESCE(p_values->>'platform_name', platform_name),
    platform_tagline = COALESCE(p_values->>'platform_tagline', platform_tagline),
    logo_url = CASE WHEN p_values ? 'logo_url' THEN p_values->>'logo_url' ELSE logo_url END,
    primary_color = COALESCE(p_values->>'primary_color', primary_color),
    accent_color = COALESCE(p_values->>'accent_color', accent_color),
    hero_title = COALESCE(p_values->>'hero_title', hero_title),
    hero_subtitle = COALESCE(p_values->>'hero_subtitle', hero_subtitle),
    hero_background_url = CASE WHEN p_values ? 'hero_background_url' THEN p_values->>'hero_background_url' ELSE hero_background_url END,
    about_title = COALESCE(p_values->>'about_title', about_title),
    about_text = COALESCE(p_values->>'about_text', about_text),
    primary_button_label = COALESCE(p_values->>'primary_button_label', primary_button_label),
    secondary_button_label = COALESCE(p_values->>'secondary_button_label', secondary_button_label),
    footer_text = COALESCE(p_values->>'footer_text', footer_text),
    stat_cards = COALESCE(p_values->'stat_cards', stat_cards),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_has_site_edit_pin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_verify_site_edit_pin(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_site_edit_pin(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_site_settings(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_has_site_edit_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_site_edit_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_site_edit_pin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_site_settings(text, jsonb) TO authenticated;
