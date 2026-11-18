export type Role = 'admin' | 'teacher' | 'supervisor';

export type StatSource = 'teachers' | 'students' | 'sessions';
export type StatCard = { label: string; value: string; source: StatSource | null };

export type SiteSettings = {
  id: number;
  platform_name: string;
  platform_tagline: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  header_color: string;
  sidebar_color: string;
  page_background_color: string;
  card_color: string;
  font_family: string;
  hero_title: string;
  hero_subtitle: string;
  hero_background_url: string | null;
  about_title: string;
  about_text: string;
  primary_button_label: string;
  secondary_button_label: string;
  footer_text: string;
  stat_cards: StatCard[];
  updated_at: string;
};
export type SessionStatus = 'scheduled' | 'open' | 'closed';

export type SupervisorPermissions = {
  profile_id: string;
  can_view_stats: boolean;
  can_view_students: boolean;
  can_view_teachers: boolean;
  can_view_reports: boolean;
  can_take_attendance: boolean;
  can_recite: boolean;
  can_manage_sessions: boolean;
};

export type UserAccessPermissions = {
  profile_id: string;
  can_view_students: boolean;
  can_add_students: boolean;
  can_edit_students: boolean;
  can_delete_students: boolean;
  can_view_halqat: boolean;
  can_add_halqat: boolean;
  can_edit_halqat: boolean;
  can_delete_halqat: boolean;
  can_record_attendance: boolean;
  can_edit_attendance: boolean;
  can_view_reports: boolean;
  can_export_reports: boolean;
  can_view_fees: boolean;
  can_collect_fees: boolean;
  can_manage_users: boolean;
  access_scope: 'all_halqat' | 'selected_halqat';
  selected_halqat_ids: string[];
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  username: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
};

export type ProfileWithAuth = Profile & {
  created_at: string;
  last_sign_in_at: string | null;
};

export type Student = {
  id: string;
  name: string;
  basic_info: string;
  enrollment_date: string;
  is_active: boolean;
  internal_id: string | null;
  halqa: string | null;
  halqa_id: string | null;
  current_portion: string | null;
  notes: string | null;
};

export type StudentEditHistory = {
  id: string;
  student_id: string;
  actor_id: string | null;
  action: string;
  changes: unknown;
  created_at: string;
};

export type YawmSession = {
  id: string;
  name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  target_juz?: number;
  num_halqat?: number;
  notes?: string;
};

export type QuranPortion = { id: string; name: string; sort_order: number };
export type Surah = { id: string; portion_id: string; name: string; sort_order: number };

export type QuranJuz = {
  id: string;
  juz_number: number;
  name: string;
  start_page: number;
  end_page: number;
  start_surah_number: number;
  start_ayah_number: number;
  start_ayah_text: string | null;
  end_surah_number: number;
  end_ayah_number: number;
};

export type QuranSurah = {
  id: string;
  surah_number: number;
  name: string;
  name_arabic: string;
  name_english: string;
  ayah_count: number;
  start_page: number;
  end_page: number;
  start_juz_id: string | null;
  revelation_type: 'meccan' | 'medinan';
  sort_order: number;
  line_count?: number | null;
  face_count?: number | null;
  face_description?: string | null;
  page_count?: number | null;
};

export type Halqa = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
};

export type AttendanceRecord = {
  id: string;
  session_id: string;
  student_id: string;
  teacher_id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes: string;
  created_at: string;
  updated_at: string;
};

export type StudentCurriculum = {
  id: string;
  student_id: string;
  name: string;
  is_active: boolean;
  assigned_by: string | null;
  created_at: string;
};

export type CurriculumItemType = 'juz' | 'surah' | 'ayah_range' | 'page_range';

export type StudentCurriculumItem = {
  id: string;
  curriculum_id: string;
  item_type: CurriculumItemType;
  juz_id: string | null;
  surah_id: string | null;
  start_ayah: number | null;
  end_ayah: number | null;
  start_page: number | null;
  end_page: number | null;
  is_completed: boolean;
  completed_at: string | null;
  needs_revision: boolean;
  revision_notes: string;
  sort_order: number;
  completed_ayahs: number[];
  completed_pages: number[];
};

export type SessionStudentAssignment = {
  id: string;
  session_id: string;
  student_id: string;
  teacher_id: string;
};

export type RecitationRecord = {
  id: string;
  teacher_id: string;
  student_id: string;
  session_id: string;
  portion_id: string;
  submitted_at: string;
};

export type RecitationStatus = 'done' | 'not_ready' | 'repeat';

export type RecitationEntry = {
  id: string;
  session_id: string;
  student_id: string;
  teacher_id: string;
  mode: string;
  status: RecitationStatus;
  surah_id: string | null;
  surah_from_id: string | null;
  surah_to_id: string | null;
  surah_number: number | null;
  mistakes: number;
  hesitations: number;
  notes: string;
  ayah_from: number | null;
  ayah_to: number | null;
  halaqa_id: string | null;
  session_date: string | null;
  created_at: string;
  updated_at: string;
  lines_recited?: number | null;
  faces_recited?: number | null;
  faces_completed?: number | null;
  recitation_type?: 'original' | 'repeat' | 'review' | null;
  value_source?: 'auto' | 'manual' | null;
  recited_at?: string | null;
};

export type DayRecitationRow = {
  id: string;
  student_id: string;
  student_name: string;
  teacher_id: string;
  teacher_name: string;
  halaqa_id: string | null;
  halaqa_name: string | null;
  surah_id: string | null;
  surah_number: number | null;
  surah_name: string | null;
  status: RecitationStatus;
  mistakes: number;
  hesitations: number;
  notes: string;
  created_at: string;
  updated_at: string;
  lines_recited?: number | null;
  faces_recited?: number | null;
  faces_completed?: number | null;
  recitation_type?: 'original' | 'repeat' | 'review' | null;
  value_source?: 'auto' | 'manual' | null;
  recited_at?: string | null;
  ayah_from?: number | null;
  ayah_to?: number | null;
  mode?: string;
};

export type PlatformSetting = {
  id: string;
  key: string;
  value: string;
  category: string;
  description: string;
};

export type PendingStudent = {
  name: string;
  internal_id?: string;
  halqa?: string;
  current_portion?: string;
  notes?: string;
  is_duplicate: boolean;
};

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};
