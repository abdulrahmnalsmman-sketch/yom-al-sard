/*
# Juz boundaries per Madinah Mushaf (ayah level)

1. What changes
- Adds start and end ayah references to every juz (الأجزاء الثلاثون).
- Start points follow the approved list: juz N begins at the given surah and ayah.
- End point of each juz is the ayah immediately before the next juz starts; juz 30 ends at the last ayah of An-Nas.
- Juz division only (not quarters or hizb).

2. Modified table
- quran_juz: new columns start_surah_number, start_ayah_number, start_ayah_text, end_surah_number, end_ayah_number.

3. Security
- No policy or grant changes. Existing read access is unchanged.

4. Notes
- Existing rows are updated in place; no data is deleted.
- Rerunning this migration recomputes the same values.
*/

ALTER TABLE quran_juz
  ADD COLUMN IF NOT EXISTS start_surah_number integer,
  ADD COLUMN IF NOT EXISTS start_ayah_number integer,
  ADD COLUMN IF NOT EXISTS start_ayah_text text,
  ADD COLUMN IF NOT EXISTS end_surah_number integer,
  ADD COLUMN IF NOT EXISTS end_ayah_number integer;

WITH starts(juz_number, surah_number, ayah_number, ayah_text) AS (
  VALUES
    (1, 1, 1, NULL), (2, 2, 142, 'سيقول السفهاء'), (3, 2, 253, 'تلك الرسل'),
    (4, 3, 92, 'لن تنالوا'), (5, 4, 24, 'والمحصنات'), (6, 4, 148, 'لا يحب الله الجهر'),
    (7, 5, 83, 'وإذا سمعوا'), (8, 6, 111, 'ولو أننا'), (9, 7, 88, 'قال الملأ'),
    (10, 8, 41, 'واعلموا'), (11, 9, 94, 'يعتذرون'), (12, 11, 6, 'وما من دابة'),
    (13, 12, 53, 'وما أبرئ'), (14, 15, 1, 'ربما'), (15, 17, 1, 'سبحان الذي'),
    (16, 18, 75, 'قال ألم'), (17, 21, 1, 'اقترب للناس'), (18, 23, 1, 'قد أفلح'),
    (19, 25, 21, 'وقال الذين لا يرجون'), (20, 27, 56, 'أمن خلق'), (21, 29, 46, 'اتل ما أوحي'),
    (22, 33, 31, 'ومن يقنت'), (23, 36, 22, 'وما لي'), (24, 39, 32, 'فمن أظلم'),
    (25, 41, 47, 'إليه يرد'), (26, 46, 1, 'حم'), (27, 51, 31, 'قال فما خطبكم'),
    (28, 58, 1, 'قد سمع الله'), (29, 67, 1, 'تبارك'), (30, 78, 1, 'عم')
),
offs AS (
  SELECT surah_number, ayah_count,
    COALESCE(SUM(ayah_count) OVER (ORDER BY surah_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS off
  FROM quran_surahs
),
gstart AS (
  SELECT s.juz_number, s.surah_number, s.ayah_number, s.ayah_text, o.off + s.ayah_number AS g
  FROM starts s JOIN offs o ON o.surah_number = s.surah_number
),
gend AS (
  SELECT juz_number,
    COALESCE(LEAD(g) OVER (ORDER BY juz_number) - 1, (SELECT SUM(ayah_count) FROM quran_surahs)) AS g_end
  FROM gstart
),
ends AS (
  SELECT e.juz_number, o.surah_number, e.g_end - o.off AS ayah_number
  FROM gend e JOIN offs o ON e.g_end > o.off AND e.g_end <= o.off + o.ayah_count
)
UPDATE quran_juz j
SET start_surah_number = gs.surah_number,
    start_ayah_number = gs.ayah_number,
    start_ayah_text = gs.ayah_text,
    end_surah_number = en.surah_number,
    end_ayah_number = en.ayah_number
FROM gstart gs
JOIN ends en ON en.juz_number = gs.juz_number
WHERE j.juz_number = gs.juz_number;
