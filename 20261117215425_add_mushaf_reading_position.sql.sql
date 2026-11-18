/*
# Mushaf reader: teacher reading position

1. New Tables
- `mushaf_reading_position` — saves the last Mushaf page each signed-in user reached in the Quran reader.
  - `user_id` (uuid, primary key, references auth.users, defaults to the authenticated user)
  - `last_page` (integer, not null, default 1) — last Madinah Mushaf page (1..604)
  - `updated_at` (timestamp, auto-updated)

2. Security
- RLS enabled. Owner-scoped: each authenticated user can read and write only their own row.
- Grants: SELECT, INSERT, UPDATE, DELETE to `authenticated` only.

3. Notes
- Additive only; no existing tables or functions are touched.
- The frontend upserts one row per user on page change; it never sees other users' rows.
*/

CREATE TABLE IF NOT EXISTS public.mushaf_reading_position (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  last_page integer NOT NULL DEFAULT 1 CHECK (last_page >= 1 AND last_page <= 604),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mushaf_reading_position ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mushaf_reading_position TO authenticated;

DROP POLICY IF EXISTS "select_own_reading_position" ON public.mushaf_reading_position;
CREATE POLICY "select_own_reading_position" ON public.mushaf_reading_position
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reading_position" ON public.mushaf_reading_position;
CREATE POLICY "insert_own_reading_position" ON public.mushaf_reading_position
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reading_position" ON public.mushaf_reading_position;
CREATE POLICY "update_own_reading_position" ON public.mushaf_reading_position
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reading_position" ON public.mushaf_reading_position;
CREATE POLICY "delete_own_reading_position" ON public.mushaf_reading_position
FOR DELETE TO authenticated USING (auth.uid() = user_id);
