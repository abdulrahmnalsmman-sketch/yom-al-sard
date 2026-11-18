/*
# Site settings table and media bucket

## What this adds
1. `site_settings`: a single-row table holding the platform's editable public content
   (platform name, logo, colors, hero text, about text, button labels, stat card labels,
   hero background image URL).
2. `admin_update_site_settings(jsonb)`: the only write path. It checks `is_admin()` on the
   server and updates only the whitelisted columns.
3. `site-media` storage bucket: public read, admin-only upload, update, and delete.

## Security
- RLS is enabled on `site_settings`. Everyone (anon and authenticated) can read it.
  Nobody can write it directly; writes go through the admin-checked function.
- The function is revoked from PUBLIC and anon and granted only to authenticated.
- Storage uploads are limited to admins through `is_admin()`.

## Data safety
- Additive only. No existing tables, rows, or policies are changed.
- The seed row uses `ON CONFLICT DO NOTHING`, so re-running this migration is safe.
*/

CREATE TABLE IF NOT EXISTS public.site_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  platform_name text NOT NULL DEFAULT 'يوم السرد',
  platform_tagline text NOT NULL DEFAULT 'منصة حلقات الشيخين سعد وعبدالعزيز الموسى',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#1f4d3a',
  accent_color text NOT NULL DEFAULT '#c9a24a',
  hero_title text NOT NULL DEFAULT 'يوم السرد',
  hero_subtitle text NOT NULL DEFAULT '',
  hero_background_url text,
  about_title text NOT NULL DEFAULT 'من نحن',
  about_text text NOT NULL DEFAULT '',
  primary_button_label text NOT NULL DEFAULT 'تسجيل الدخول',
  secondary_button_label text NOT NULL DEFAULT 'تعرف أكثر',
  footer_text text NOT NULL DEFAULT '',
  stat_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.site_settings TO anon, authenticated;

DROP POLICY IF EXISTS "site_settings_public_read" ON public.site_settings;
CREATE POLICY "site_settings_public_read" ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.admin_update_site_settings(p_values jsonb)
RETURNS public.site_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.site_settings;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل إعدادات الموقع.';
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

REVOKE EXECUTE ON FUNCTION public.admin_update_site_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_site_settings(jsonb) TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-media', 'site-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "site_media_public_read" ON storage.objects;
CREATE POLICY "site_media_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "site_media_admin_insert" ON storage.objects;
CREATE POLICY "site_media_admin_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "site_media_admin_update" ON storage.objects;
CREATE POLICY "site_media_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'site-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-media' AND public.is_admin());

DROP POLICY IF EXISTS "site_media_admin_delete" ON storage.objects;
CREATE POLICY "site_media_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'site-media' AND public.is_admin());
