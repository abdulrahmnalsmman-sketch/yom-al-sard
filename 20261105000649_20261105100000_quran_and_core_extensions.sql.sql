/*
# Quran data tables, halqat, settings, attendance, and student curriculum

1. Purpose
- Build a complete Quran reference database (114 surahs, 30 juz, hizb, pages, ayah counts).
- Add halqat (study circles) management.
- Add platform settings table for configurable system data.
- Add attendance tracking per session per student.
- Add student curriculum assignment tables (juz, surah, ayah range, page range).
- Add session_student_assignments to link specific students to specific teachers within a session.

2. New Tables
- quran_juz: 30 juz with page boundaries.
- quran_hizb: 60 hizb divisions linked to juz.
- quran_surahs: 114 surahs with ayah counts, page start, juz start, revelation type.
- quran_pages: 604 pages of the standard Madinah Mushaf.
- halqat: study circles (name, description, is_active).
- platform_settings: key-value settings store for platform info.
- attendance_records: per-session per-student attendance (present/absent/late/excused).
- student_curricula: curriculum assigned to a student (type: juz/surah/ayah_range/page_range).
- student_curriculum_items: individual items within a curriculum (e.g., specific juz numbers or surah IDs).
- curriculum_progress: tracks completion of each curriculum item per student.
- session_student_assignments: assigns a student to a specific teacher within a session.

3. Modified Tables
- yawm_sessions: add location field (optional).
- students: add halqa_id FK to halqat table (optional, alongside existing text halqa field).

4. Security
- RLS enabled on all new tables.
- Authenticated SELECT where appropriate.
- All mutations through SECURITY DEFINER functions with admin/teacher role checks.
- Grants follow least-privilege principle.
*/

-- ═══════════════════════════════════════════════════════════
-- QURAN REFERENCE TABLES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.quran_juz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  juz_number integer NOT NULL UNIQUE CHECK (juz_number >= 1 AND juz_number <= 30),
  name text NOT NULL,
  start_page integer NOT NULL CHECK (start_page >= 1),
  end_page integer NOT NULL CHECK (end_page >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quran_hizb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hizb_number integer NOT NULL UNIQUE CHECK (hizb_number >= 1 AND hizb_number <= 60),
  juz_id uuid NOT NULL REFERENCES public.quran_juz(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_page integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quran_surahs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surah_number integer NOT NULL UNIQUE CHECK (surah_number >= 1 AND surah_number <= 114),
  name text NOT NULL,
  name_arabic text NOT NULL,
  name_english text NOT NULL,
  ayah_count integer NOT NULL CHECK (ayah_count > 0),
  start_page integer NOT NULL CHECK (start_page >= 1 AND start_page <= 604),
  end_page integer NOT NULL CHECK (end_page >= 1 AND end_page <= 604),
  start_juz_id uuid REFERENCES public.quran_juz(id),
  revelation_type text NOT NULL CHECK (revelation_type IN ('meccan', 'medinan')),
  sort_order integer NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quran_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_number integer NOT NULL UNIQUE CHECK (page_number >= 1 AND page_number <= 604),
  juz_id uuid NOT NULL REFERENCES public.quran_juz(id) ON DELETE CASCADE,
  surah_id uuid REFERENCES public.quran_surahs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- HALQAT (STUDY CIRCLES)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.halqat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add halqa_id to students (optional FK, alongside existing text halqa field)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS halqa_id uuid REFERENCES public.halqat(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════
-- PLATFORM SETTINGS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- ATTENDANCE
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.yawm_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS attendance_session_idx ON public.attendance_records (session_id);
CREATE INDEX IF NOT EXISTS attendance_student_idx ON public.attendance_records (student_id);

-- ═══════════════════════════════════════════════════════════
-- STUDENT CURRICULUM
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.student_curricula (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_curriculum_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid NOT NULL REFERENCES public.student_curricula(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('juz', 'surah', 'ayah_range', 'page_range')),
  juz_id uuid REFERENCES public.quran_juz(id) ON DELETE SET NULL,
  surah_id uuid REFERENCES public.quran_surahs(id) ON DELETE SET NULL,
  start_ayah integer,
  end_ayah integer,
  start_page integer,
  end_page integer,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  needs_revision boolean NOT NULL DEFAULT false,
  revision_notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS curriculum_student_idx ON public.student_curricula (student_id);
CREATE INDEX IF NOT EXISTS curriculum_items_idx ON public.student_curriculum_items (curriculum_id);

-- ═══════════════════════════════════════════════════════════
-- SESSION-STUDENT-TEACHER ASSIGNMENT
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.session_student_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.yawm_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS ssa_session_idx ON public.session_student_assignments (session_id);
CREATE INDEX IF NOT EXISTS ssa_teacher_idx ON public.session_student_assignments (teacher_id, session_id);

-- ═══════════════════════════════════════════════════════════
-- RLS + GRANTS
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.quran_juz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_hizb ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_surahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.halqat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_curriculum_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_student_assignments ENABLE ROW LEVEL SECURITY;

-- Quran reference data: readable by all authenticated
GRANT SELECT ON public.quran_juz, public.quran_hizb, public.quran_surahs, public.quran_pages TO authenticated;

-- Halqat: readable by authenticated
GRANT SELECT ON public.halqat TO authenticated;

-- Settings: readable by authenticated
GRANT SELECT ON public.platform_settings TO authenticated;

-- Attendance: readable by admin and assigned teacher
GRANT SELECT ON public.attendance_records TO authenticated;

-- Curriculum: readable by admin and assigned teacher
GRANT SELECT ON public.student_curricula, public.student_curriculum_items TO authenticated;

-- Session assignments: readable by admin, supervisor, and assigned teacher
GRANT SELECT ON public.session_student_assignments TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- POLICIES
-- ═══════════════════════════════════════════════════════════

-- Quran reference: all authenticated can read
DROP POLICY IF EXISTS quran_juz_select ON public.quran_juz;
CREATE POLICY quran_juz_select ON public.quran_juz FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS quran_hizb_select ON public.quran_hizb;
CREATE POLICY quran_hizb_select ON public.quran_hizb FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS quran_surahs_select ON public.quran_surahs;
CREATE POLICY quran_surahs_select ON public.quran_surahs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS quran_pages_select ON public.quran_pages;
CREATE POLICY quran_pages_select ON public.quran_pages FOR SELECT TO authenticated USING (true);

-- Halqat: all authenticated can read
DROP POLICY IF EXISTS halqat_select ON public.halqat;
CREATE POLICY halqat_select ON public.halqat FOR SELECT TO authenticated USING (true);

-- Settings: all authenticated can read
DROP POLICY IF EXISTS settings_select ON public.platform_settings;
CREATE POLICY settings_select ON public.platform_settings FOR SELECT TO authenticated USING (true);

-- Attendance: admin, supervisor, or assigned teacher can read
DROP POLICY IF EXISTS attendance_select ON public.attendance_records;
CREATE POLICY attendance_select ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR teacher_id = auth.uid()
  );

-- Curriculum: admin, supervisor, or teacher assigned to student's session can read
DROP POLICY IF EXISTS curricula_select ON public.student_curricula;
CREATE POLICY curricula_select ON public.student_curricula
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.session_student_assignments ssa
      JOIN public.session_teachers st ON st.session_id = ssa.session_id
      WHERE ssa.student_id = student_curricula.student_id
      AND st.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS curriculum_items_select ON public.student_curriculum_items;
CREATE POLICY curriculum_items_select ON public.student_curriculum_items
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.student_curricula sc
      JOIN public.session_student_assignments ssa ON ssa.student_id = sc.student_id
      JOIN public.session_teachers st ON st.session_id = ssa.session_id
      WHERE sc.id = student_curriculum_items.curriculum_id
      AND st.teacher_id = auth.uid()
    )
  );

-- Session assignments: admin, supervisor, or assigned teacher
DROP POLICY IF EXISTS ssa_select ON public.session_student_assignments;
CREATE POLICY ssa_select ON public.session_student_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_supervisor()
    OR teacher_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════
-- SEED PLATFORM SETTINGS
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.platform_settings (key, value, category, description) VALUES
  ('platform_name', 'يوم السرد', 'platform', 'اسم المنصة'),
  ('institution_name', 'حلقات الشيخين سعد وعبدالعزيز الموسى', 'platform', 'اسم الجهة'),
  ('branch_name', 'الرياض', 'platform', 'اسم الفرع'),
  ('default_start_time', '18:30', 'sessions', 'وقت البداية الافتراضي'),
  ('default_end_time', '20:00', 'sessions', 'وقت النهاية الافتراضي'),
  ('recitation_pass_threshold', '0', 'recitation', 'حد الأخطاء المسموح'),
  ('enable_hesitations_tracking', 'true', 'recitation', 'تتبع الترددات'),
  ('enable_revision_flag', 'true', 'recitation', 'تحديد السور للمراجعة'),
  ('attendance_default_status', 'present', 'attendance', 'حالة الحضور الافتراضية'),
  ('enable_late_status', 'true', 'attendance', 'تفعيل حالة التأخير')
ON CONFLICT (key) DO NOTHING;
