/*
# UI customization columns on site_settings

## What this adds
Adds five new columns to `site_settings` for independent color control and font selection:
- `font_family` (text, default 'Tajawal') — Google Arabic font name applied app-wide.
- `header_color` (text, default '#1f4d3a') — color for the site header/navbar.
- `sidebar_color` (text, default '#1f4d3a') — color for the admin/teacher sidebar.
- `page_background_color` (text, default '#f6f3ea') — color for page backgrounds.
- `card_color` (text, default '#ffffff') — color for cards and panels.

Also updates `admin_update_site_settings(p_pin, p_values)` to accept and validate these new fields.

## Security
- No new tables. RLS already enabled on `site_settings` (anon read, no direct write).
- The update function already checks `is_admin()` and the PIN. Color validation is extended to all new color columns.

## Data safety
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` is additive; no data is lost.
- The function is replaced with `CREATE OR REPLACE` (same signature, backward compatible).
*/

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT 'Tajawal';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS header_color text NOT NULL DEFAULT '#1f4d3a';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS sidebar_color text NOT NULL DEFAULT '#1f4d3a';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS page_background_color text NOT NULL DEFAULT '#f6f3ea';
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS card_color text NOT NULL DEFAULT '#ffffff';

CREATE OR REPLACE FUNCTION public.admin_update_site_settings(p_pin text, p_values jsonb)
RETURNS public.site_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  result public.site_settings;
  color_fields text[] := ARRAY['primary_color','accent_color','header_color','sidebar_color','page_background_color','card_color'];
  field text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الموقع.';
  END IF;
  IF NOT public.admin_verify_site_edit_pin(p_pin) THEN
    RAISE EXCEPTION 'الرمز السري غير صحيح.';
  END IF;

  FOREACH field IN ARRAY color_fields LOOP
    IF (p_values->>field) IS NOT NULL AND (p_values->>field) !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'اللون % غير صالح.', field;
    END IF;
  END LOOP;

  IF p_values ? 'stat_cards' AND jsonb_typeof(p_values->'stat_cards') <> 'array' THEN
    RAISE EXCEPTION 'بطاقات الأرقام يجب أن تكون قائمة.';
  END IF;

  UPDATE public.site_settings SET
    platform_name = COALESCE(p_values->>'platform_name', platform_name),
    platform_tagline = COALESCE(p_values->>'platform_tagline', platform_tagline),
    logo_url = CASE WHEN p_values ? 'logo_url' THEN p_values->>'logo_url' ELSE logo_url END,
    primary_color = COALESCE(p_values->>'primary_color', primary_color),
    accent_color = COALESCE(p_values->>'accent_color', accent_color),
    header_color = COALESCE(p_values->>'header_color', header_color),
    sidebar_color = COALESCE(p_values->>'sidebar_color', sidebar_color),
    page_background_color = COALESCE(p_values->>'page_background_color', page_background_color),
    card_color = COALESCE(p_values->>'card_color', card_color),
    font_family = COALESCE(p_values->>'font_family', font_family),
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

REVOKE EXECUTE ON FUNCTION public.admin_update_site_settings(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_site_settings(text, jsonb) TO authenticated;
