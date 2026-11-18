import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, BookOpen, CalendarDays, Users, ShieldCheck, Layers,
  TrendingUp, AlertCircle, RotateCcw, CheckCircle2, Clock3, Target, Award,
  AlertTriangle, Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { DayRecitationRow, YawmSession, QuranSurah, Halqa } from '@/types';
import {
  formatFaceValue, fullFaceDescription, errorRatePerFace,
} from '@/lib/faceCalc';

type Notice = { type: 'success' | 'error'; text: string } | null;

type ReportType = 'day' | 'student' | 'surah' | 'halqa';

type StatCard = {
  label: string;
  value: string | number;
  icon: typeof BookOpen;
  tone: 'teal' | 'gold' | 'red' | 'sky' | 'sand' | 'green';
  sub?: string;
};

type SurahStat = {
  surahNumber: number;
  name: string;
  ayahCount: number;
  lineCount: number;
  faceCount: number;
  facesRecited: number;
  facesCompleted: number;
  mistakes: number;
  hesitations: number;
  done: number;
  repeat: number;
  notReady: number;
  needsRevision: boolean;
};

type TeacherStat = {
  name: string;
  total: number;
  done: number;
  repeat: number;
  notReady: number;
  mistakes: number;
  hesitations: number;
  facesRecited: number;
  facesCompleted: number;
  studentCount: number;
};

type StudentStat = {
  id: string;
  name: string;
  halqaName: string;
  halqaId: string | null;
  teacherName: string;
  curriculum: string;
  facesRecited: number;
  facesCompleted: number;
  mistakes: number;
  hesitations: number;
  totalRecitations: number;
  repeatCount: number;
  juzCompleted: number;
  surahsDone: number;
};

type StudentSortKey = 'default' | 'hesitation_high' | 'hesitation_low' | 'mistakes_high' | 'mistakes_low' | 'revision_needs' | 'juz_completed';
type SurahSortKey = 'default' | 'hesitation_high' | 'errors_high' | 'least_recited' | 'most_revision';

const recitationStatusLabels: Record<string, string> = {
  done: 'تم',
  not_ready: 'غير جاهز',
  repeat: 'إعادة',
};

const studentSortLabels: Record<StudentSortKey, string> = {
  default: 'الترتيب الافتراضي',
  hesitation_high: 'الأعلى ترددًا',
  hesitation_low: 'الأقل ترددًا',
  mistakes_high: 'الأعلى أخطاءً',
  mistakes_low: 'الأقل أخطاءً',
  revision_needs: 'الأكثر حاجة لإعادة الضبط',
  juz_completed: 'الأكثر إنجازًا (أجزاء)',
};

const surahSortLabels: Record<SurahSortKey, string> = {
  default: 'الترتيب الافتراضي',
  hesitation_high: 'الأعلى ترددًا',
  errors_high: 'الأعلى أخطاءً',
  least_recited: 'الأقل تسميعًا',
  most_revision: 'الأكثر حاجة لإعادة الضبط',
};

export function ReportsManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<DayRecitationRow[]>([]);
  const [sessions, setSessions] = useState<YawmSession[]>([]);
  const [halqat, setHalqat] = useState<Halqa[]>([]);
  const [surahs, setSurahs] = useState<QuranSurah[]>([]);
  const [filterSession, setFilterSession] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterHalqa, setFilterHalqa] = useState<string>('all');
  const [filterStudent, setFilterStudent] = useState<string>('all');
  const [reportType, setReportType] = useState<ReportType>('day');
  const [studentSort, setStudentSort] = useState<StudentSortKey>('default');
  const [surahSort, setSurahSort] = useState<SurahSortKey>('default');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [sessionRes, halqatRes, surahsRes] = await Promise.all([
      supabase.from('yawm_sessions').select('id,name,session_date,status,target_juz').order('session_date', { ascending: false }),
      supabase.from('halqat').select('id,name,is_active').eq('is_active', true).order('name'),
      supabase.from('quran_surahs').select('id,surah_number,name,ayah_count,start_page,end_page,line_count,face_count,page_count').order('surah_number'),
    ]);
    setSessions((sessionRes.data ?? []) as YawmSession[]);
    setHalqat((halqatRes.data ?? []) as Halqa[]);
    setSurahs((surahsRes.data ?? []) as QuranSurah[]);

    let query = supabase
      .from('recitation_entries')
      .select(`id,student_id,teacher_id,surah_id,surah_number,status,mistakes,hesitations,notes,created_at,updated_at,session_id,
        halaqa_id,ayah_from,ayah_to,mode,lines_recited,faces_recited,faces_completed,recitation_type,value_source,recited_at,
        students!student_id(name,halqa_id),
        profiles!teacher_id(display_name),
        quran_surahs!surah_id(name,surah_number,ayah_count,line_count,face_count),
        yawm_sessions!session_id(name),
        halqat!halaqa_id(name)`);
    if (filterSession !== 'all') query = query.eq('session_id', filterSession);
    if (filterTeacher !== 'all') query = query.eq('teacher_id', filterTeacher);
    if (filterHalqa !== 'all') query = query.eq('halaqa_id', filterHalqa);
    if (filterStudent !== 'all') query = query.eq('student_id', filterStudent);

    const allRows: unknown[] = [];
    let offset = 0;
    let loadError: unknown = null;

    while (true) {
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + 999);
      if (error) {
        loadError = error;
        break;
      }
      const batch = data ?? [];
      allRows.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }

    if (loadError) setNotice({ type: 'error', text: 'تعذر تحميل التقارير.' });
    setRows(allRows as DayRecitationRow[]);
    setLoading(false);
  }, [filterSession, filterTeacher, filterHalqa, filterStudent, setNotice]);

  useEffect(() => { void load(); }, [load]);

  // Extract names from joined data
  const processedRows = useMemo(() => {
    return rows.map((r) => {
      const raw = r as unknown as {
        students?: { name: string; halqa_id: string | null } | null;
        profiles?: { display_name: string } | null;
        'quran_surahs'?: { name: string; surah_number: number; ayah_count: number; line_count: number | null; face_count: number | null } | null;
        'yawm_sessions'?: { name: string } | null;
        halqat?: { name: string } | null;
      };
      return {
        ...r,
        student_name: raw.students?.name ?? r.student_name ?? '—',
        teacher_name: raw.profiles?.display_name ?? r.teacher_name ?? '—',
        surah_name: raw['quran_surahs']?.name ?? r.surah_name ?? '—',
        halaqa_name: raw.halqat?.name ?? r.halaqa_name ?? '—',
      } as DayRecitationRow;
    });
  }, [rows]);

  // Only count 'done' status original recitations toward achievement
  const achievementRows = processedRows.filter((r) => r.status === 'done' && (r.recitation_type ?? 'original') === 'original');

  const doneCount = processedRows.filter((r) => r.status === 'done').length;
  const notReadyCount = processedRows.filter((r) => r.status === 'not_ready').length;
  const repeatCount = processedRows.filter((r) => r.status === 'repeat').length;
  const totalMistakes = processedRows.reduce((s, r) => s + r.mistakes, 0);
  const totalHesitations = processedRows.reduce((s, r) => s + r.hesitations, 0);

  const totalFacesRecited = achievementRows.reduce((s, r) => s + (r.faces_recited ? Number(r.faces_recited) : 0), 0);
  const totalFacesCompleted = achievementRows.reduce((s, r) => s + (r.faces_completed ?? 0), 0);
  const totalLinesRecited = achievementRows.reduce((s, r) => s + (r.lines_recited ?? 0), 0);

  // Juz calculation: 1 juz = 20 faces
  const totalJuzAchieved = totalFacesRecited / 20;

  // Target juz from sessions
  const targetJuz = sessions.length > 0
    ? sessions.filter((s) => filterSession === 'all' || s.id === filterSession)
        .reduce((sum, s) => sum + (s.target_juz ?? 0), 0)
    : 0;
  const achievementPct = targetJuz > 0 ? Math.min(100, (totalJuzAchieved / targetJuz) * 100) : 0;

  // Unique counts
  const studentIds = new Set(processedRows.map((r) => r.student_id));
  const teacherIds = new Set(processedRows.map((r) => r.teacher_id));
  const halqaIds = new Set(processedRows.map((r) => r.halaqa_id).filter(Boolean));
  const sessionCount = new Set(processedRows.map((r) => (r as { session_id?: string }).session_id ?? r.id)).size;

  // Surahs needing revision or not ready
  const surahsNeedingRevision = new Set(processedRows.filter((r) => r.status === 'repeat').map((r) => r.surah_id)).size;
  const surahsNotReady = new Set(processedRows.filter((r) => r.status === 'not_ready').map((r) => r.surah_id)).size;

  const errorPerFace = errorRatePerFace(totalMistakes, totalFacesRecited);
  const hesitPerFace = errorRatePerFace(totalHesitations, totalFacesRecited);

  const statCards: StatCard[] = [
    { label: 'المستهدف العام من الأجزاء', value: targetJuz > 0 ? targetJuz.toFixed(1) : '—', icon: Target, tone: 'sky', sub: targetJuz > 0 ? `${targetJuz} جزء` : 'غير محدد' },
    { label: 'المنجز من الأجزاء', value: totalJuzAchieved.toFixed(2), icon: TrendingUp, tone: 'teal', sub: `${totalFacesRecited.toFixed(1)} وجه` },
    { label: 'نسبة إنجاز المستهدف العام', value: `${achievementPct.toFixed(1)}%`, icon: Award, tone: achievementPct >= 50 ? 'green' : 'gold', sub: achievementPct >= 100 ? 'مكتمل' : `متبقٍ ${(targetJuz - totalJuzAchieved).toFixed(1)} جزء` },
    { label: 'عدد الطلاب', value: studentIds.size, icon: Users, tone: 'sand' },
    { label: 'عدد المعلمين', value: teacherIds.size, icon: ShieldCheck, tone: 'teal' },
    { label: 'عدد الحلقات', value: halqaIds.size, icon: Layers, tone: 'sky' },
    { label: 'الأيام المنفذة', value: sessions.filter((s) => filterSession === 'all' || s.id === filterSession).length, icon: CalendarDays, tone: 'gold' },
    { label: 'الأوجه المسمّعة', value: totalFacesRecited.toFixed(2), icon: BookOpen, tone: 'teal', sub: `${totalLinesRecited} سطر` },
    { label: 'الأوجه المكتملة', value: totalFacesCompleted, icon: CheckCircle2, tone: 'green' },
    { label: 'سور تحتاج إعادة', value: surahsNeedingRevision, icon: RotateCcw, tone: 'gold' },
    { label: 'سور غير منضبطة', value: surahsNotReady, icon: AlertTriangle, tone: 'red' },
    { label: 'إجمالي الأخطاء', value: totalMistakes, icon: AlertCircle, tone: 'red', sub: `${errorPerFace.toFixed(2)} لكل وجه` },
    { label: 'إجمالي الترددات', value: totalHesitations, icon: Clock3, tone: 'gold', sub: `${hesitPerFace.toFixed(2)} لكل وجه` }
  ];

  // Surah report aggregation
  const surahStats = useMemo(() => {
    const map = new Map<string, SurahStat>();
    for (const r of processedRows) {
      if (!r.surah_id) continue;
      const key = r.surah_id;
      if (!map.has(key)) {
        const surah = surahs.find((s) => s.id === r.surah_id);
        map.set(key, {
          surahNumber: r.surah_number ?? 0,
          name: r.surah_name ?? '—',
          ayahCount: surah?.ayah_count ?? 0,
          lineCount: surah?.line_count ?? 0,
          faceCount: surah?.face_count ? Number(surah.face_count) : 0,
          facesRecited: 0,
          facesCompleted: 0,
          mistakes: 0,
          hesitations: 0,
          done: 0,
          repeat: 0,
          notReady: 0,
          needsRevision: false,
        });
      }
      const stat = map.get(key)!;
      stat.mistakes += r.mistakes;
      stat.hesitations += r.hesitations;
      if (r.status === 'done') {
        stat.done++;
        stat.facesRecited += r.faces_recited ? Number(r.faces_recited) : 0;
        stat.facesCompleted += r.faces_completed ?? 0;
      }
      if (r.status === 'repeat') { stat.repeat++; stat.needsRevision = true; }
      if (r.status === 'not_ready') stat.notReady++;
    }

    const arr = Array.from(map.values());
    switch (surahSort) {
      case 'hesitation_high': return arr.sort((a, b) => b.hesitations - a.hesitations);
      case 'errors_high': return arr.sort((a, b) => b.mistakes - a.mistakes);
      case 'least_recited': return arr.sort((a, b) => a.done - b.done || a.facesRecited - b.facesRecited);
      case 'most_revision': return arr.sort((a, b) => b.repeat - a.repeat || (b.needsRevision ? 1 : 0) - (a.needsRevision ? 1 : 0));
      default: return arr.sort((a, b) => b.mistakes - a.mistakes || b.hesitations - a.hesitations);
    }
  }, [processedRows, surahs, surahSort]);

  // Teacher/halqa report aggregation
  const teacherStats = useMemo(() => {
    const map = new Map<string, TeacherStat>();
    const teacherStudents = new Map<string, Set<string>>();
    for (const r of processedRows) {
      const key = r.teacher_name ?? '—';
      if (!map.has(key)) {
        map.set(key, {
          name: key, total: 0, done: 0, repeat: 0, notReady: 0,
          mistakes: 0, hesitations: 0, facesRecited: 0, facesCompleted: 0, studentCount: 0,
        });
        teacherStudents.set(key, new Set());
      }
      const stat = map.get(key)!;
      stat.total++;
      stat.mistakes += r.mistakes;
      stat.hesitations += r.hesitations;
      if (r.status === 'done') {
        stat.done++;
        stat.facesRecited += r.faces_recited ? Number(r.faces_recited) : 0;
        stat.facesCompleted += r.faces_completed ?? 0;
      }
      if (r.status === 'repeat') stat.repeat++;
      if (r.status === 'not_ready') stat.notReady++;
      teacherStudents.get(key)!.add(r.student_id);
    }
    for (const [key, students] of teacherStudents) {
      map.get(key)!.studentCount = students.size;
    }
    return Array.from(map.values());
  }, [processedRows]);

  // Student report aggregation
  const studentStats = useMemo(() => {
    const map = new Map<string, StudentStat>();
    for (const r of processedRows) {
      const key = r.student_id;
      if (!map.has(key)) {
        map.set(key, {
          id: r.student_id,
          name: r.student_name ?? '—',
          halqaName: r.halaqa_name ?? '—',
          halqaId: r.halaqa_id ?? null,
          teacherName: r.teacher_name ?? '—',
          curriculum: '',
          facesRecited: 0,
          facesCompleted: 0,
          mistakes: 0,
          hesitations: 0,
          totalRecitations: 0,
          repeatCount: 0,
          juzCompleted: 0,
          surahsDone: 0,
        });
      }
      const stat = map.get(key)!;
      stat.totalRecitations++;
      stat.mistakes += r.mistakes;
      stat.hesitations += r.hesitations;
      if (r.status === 'done' && (r.recitation_type ?? 'original') === 'original') {
        stat.facesRecited += r.faces_recited ? Number(r.faces_recited) : 0;
        stat.facesCompleted += r.faces_completed ?? 0;
        stat.surahsDone++;
      }
      if (r.status === 'repeat') stat.repeatCount++;
    }
    for (const stat of map.values()) {
      stat.juzCompleted = stat.facesRecited / 20;
    }

    const arr = Array.from(map.values());
    switch (studentSort) {
      case 'hesitation_high': return arr.sort((a, b) => b.hesitations - a.hesitations);
      case 'hesitation_low': return arr.sort((a, b) => a.hesitations - b.hesitations);
      case 'mistakes_high': return arr.sort((a, b) => b.mistakes - a.mistakes);
      case 'mistakes_low': return arr.sort((a, b) => a.mistakes - b.mistakes);
      case 'revision_needs': return arr.sort((a, b) => b.repeatCount - a.repeatCount);
      case 'juz_completed': return arr.sort((a, b) => b.juzCompleted - a.juzCompleted);
      default: return arr.sort((a, b) => b.facesRecited - a.facesRecited);
    }
  }, [processedRows, studentSort]);

  // Group students by halqa for visual grouping
  const studentGroups = useMemo(() => {
    const groups = new Map<string, { halqaName: string; students: StudentStat[] }>();
    for (const s of studentStats) {
      const halqaKey = s.halqaId ?? '__no_halqa__';
      const halqaName = s.halqaName && s.halqaName !== '—' ? s.halqaName : 'بدون حلقة';
      if (!groups.has(halqaKey)) groups.set(halqaKey, { halqaName, students: [] });
      groups.get(halqaKey)!.students.push(s);
    }
    return Array.from(groups.values());
  }, [studentStats]);

  // Unique students for filter dropdown
  const studentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of processedRows) {
      if (!seen.has(r.student_id)) seen.set(r.student_id, r.student_name ?? '—');
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [processedRows]);

  // Unique teachers for filter dropdown (ID + name)
  const teacherOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of processedRows) {
      if (!seen.has(r.teacher_id)) seen.set(r.teacher_id, r.teacher_name ?? '—');
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [processedRows]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const exportData = processedRows.map((r) => ({
      'الطالب': r.student_name ?? '—',
      'المعلم': r.teacher_name ?? '—',
      'الحلقة': r.halaqa_name ?? '—',
      'السورة': r.surah_name ?? '—',
      'الحالة': recitationStatusLabels[r.status] ?? r.status,
      'الأوجه المسمّعة': r.faces_recited ? Number(r.faces_recited).toFixed(2) : '—',
      'الأوجه المكتملة': r.faces_completed ?? '—',
      'الأخطاء': r.mistakes,
      'الترددات': r.hesitations,
      'النوع': r.recitation_type === 'repeat' ? 'إعادة' : r.recitation_type === 'review' ? 'مراجعة' : 'أصلي',
      'التاريخ': new Date(r.created_at).toLocaleString('ar-SA'),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'التقارير');
    XLSX.writeFile(wb, `تقرير-يوم-السرد-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="reports-dark">
      <div className="reports-dark-header">
        <div>
          <div className="reports-dark-eyebrow"><BarChart3 size={16} /> المتابعة والتحليل</div>
          <h1>التقارير والإحصائيات</h1>
          <p>لوحة تحليلية شاملة مرتبطة بقاعدة البيانات — أوجه مسمّعة، مكتملة، أخطاء، ترددات، ونسب إنجاز.</p>
        </div>
        <button className="reports-export-btn" onClick={() => void exportExcel()}>
          <Download size={17} /> تصدير Excel
        </button>
      </div>

      {/* Filters */}
      <div className="reports-filters">
        <select value={filterSession} onChange={(e) => setFilterSession(e.target.value)}>
          <option value="all">كل الأيام</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)}>
          <option value="all">كل المعلمين</option>
          {teacherOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterHalqa} onChange={(e) => setFilterHalqa(e.target.value)}>
          <option value="all">كل الحلقات</option>
          {halqat.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)}>
          <option value="all">كل الطلاب</option>
          {studentOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Stat cards grid */}
      <div className="reports-stat-grid">
        {statCards.map((card, i) => (
          <div key={i} className={`reports-stat-card tone-${card.tone}`}>
            <div className="reports-stat-icon"><card.icon size={20} /></div>
            <div className="reports-stat-body">
              <span className="reports-stat-label">{card.label}</span>
              <strong className="reports-stat-value">{card.value}</strong>
              {card.sub && <span className="reports-stat-sub">{card.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Report tabs */}
      <div className="reports-tabs">
        <button className={reportType === 'day' ? 'active' : ''} onClick={() => setReportType('day')}>التقرير العام</button>
        <button className={reportType === 'student' ? 'active' : ''} onClick={() => setReportType('student')}>تقرير الطلاب</button>
        <button className={reportType === 'surah' ? 'active' : ''} onClick={() => setReportType('surah')}>تقرير السور</button>
        <button className={reportType === 'halqa' ? 'active' : ''} onClick={() => setReportType('halqa')}>تقرير الحلقات والمعلمين</button>
      </div>

      {/* Report content */}
      {reportType === 'day' && (
        <div className="reports-table-wrap">
          <div className="reports-table-head">
            <span>الطالب</span><span>الحلقة</span><span>المعلم</span><span>السورة</span>
            <span>الحالة</span><span>الأوجه</span><span>الأخطاء</span><span>التردد</span><span>الوقت</span>
          </div>
          {processedRows.slice(0, 80).map((r) => (
            <div key={r.id} className="reports-table-row">
              <strong>{r.student_name ?? '—'}</strong>
              <span>{r.halaqa_name ?? '—'}</span>
              <span>{r.teacher_name ?? '—'}</span>
              <span>{r.surah_name ?? '—'}</span>
              <span className={`reports-status ${r.status}`}>
                {recitationStatusLabels[r.status] ?? r.status}
              </span>
              <span>{r.faces_recited ? Number(r.faces_recited).toFixed(2) : '—'}</span>
              <span>{r.mistakes}</span>
              <span>{r.hesitations}</span>
              <span className="reports-time">{new Date(r.created_at).toLocaleDateString('ar-SA')}</span>
            </div>
          ))}
          {processedRows.length === 0 && (
            <div className="reports-empty">{loading ? 'جارٍ التحميل...' : 'ستظهر التقارير بعد حفظ أول تسميع.'}</div>
          )}
        </div>
      )}

      {reportType === 'student' && (
        <div className="reports-table-wrap">
          {/* Sort selector */}
          <div className="reports-sort-bar">
            <label><span>ترتيب حسب:</span>
              <select value={studentSort} onChange={(e) => setStudentSort(e.target.value as StudentSortKey)}>
                {(Object.keys(studentSortLabels) as StudentSortKey[]).map((k) => (
                  <option key={k} value={k}>{studentSortLabels[k]}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Grouped by halqa when no specific halqa filter; otherwise flat list */}
          {filterHalqa === 'all' ? (
            studentGroups.map((group) => (
              <div key={group.halqaName} className="reports-halqa-group">
                <div className="reports-halqa-header">
                  <Layers size={17} />
                  <strong>{group.halqaName}</strong>
                  <span className="reports-halqa-count">{group.students.length} طالب</span>
                </div>
                <div className="reports-table-head">
                  <span>الطالب</span><span>المعلم</span><span>الأوجه المسمّعة</span>
                  <span>الأجزاء المنجزة</span><span>الأخطاء</span><span>الترددات</span><span>إعادة ضبط</span>
                </div>
                {group.students.map((s) => (
                  <div key={s.id} className="reports-table-row">
                    <strong>{s.name}</strong>
                    <span>{s.teacherName}</span>
                    <span className="reports-face-value">{s.facesRecited > 0 ? fullFaceDescription(s.facesRecited) : '—'}</span>
                    <span className="reports-juz-value">{s.juzCompleted > 0 ? s.juzCompleted.toFixed(2) : '—'}</span>
                    <span>{s.mistakes}</span>
                    <span>{s.hesitations}</span>
                    <span className={s.repeatCount > 0 ? 'reports-rev-yes' : 'reports-rev-no'}>
                      {s.repeatCount > 0 ? `${s.repeatCount}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <>
              <div className="reports-table-head">
                <span>الطالب</span><span>المعلم</span><span>الأوجه المسمّعة</span>
                <span>الأجزاء المنجزة</span><span>الأخطاء</span><span>الترددات</span><span>إعادة ضبط</span>
              </div>
              {studentStats.map((s) => (
                <div key={s.id} className="reports-table-row">
                  <strong>{s.name}</strong>
                  <span>{s.teacherName}</span>
                  <span className="reports-face-value">{s.facesRecited > 0 ? fullFaceDescription(s.facesRecited) : '—'}</span>
                  <span className="reports-juz-value">{s.juzCompleted > 0 ? s.juzCompleted.toFixed(2) : '—'}</span>
                  <span>{s.mistakes}</span>
                  <span>{s.hesitations}</span>
                  <span className={s.repeatCount > 0 ? 'reports-rev-yes' : 'reports-rev-no'}>
                    {s.repeatCount > 0 ? `${s.repeatCount}` : '—'}
                  </span>
                </div>
              ))}
            </>
          )}
          {studentStats.length === 0 && <div className="reports-empty">{loading ? 'جارٍ التحميل...' : 'لا توجد بيانات.'}</div>}
        </div>
      )}

      {reportType === 'surah' && (
        <div className="reports-table-wrap">
          {/* Sort selector */}
          <div className="reports-sort-bar">
            <label><span>ترتيب حسب:</span>
              <select value={surahSort} onChange={(e) => setSurahSort(e.target.value as SurahSortKey)}>
                {(Object.keys(surahSortLabels) as SurahSortKey[]).map((k) => (
                  <option key={k} value={k}>{surahSortLabels[k]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="reports-table-head">
            <span>السورة</span><span>الأوجه المقررة</span><span>المسمّعة</span><span>المكتملة</span>
            <span>الأخطاء</span><span>الترددات</span><span>تم</span><span>إعادة</span><span>غير جاهز</span><span>إعادة ضبط؟</span>
          </div>
          {surahStats.map((s) => (
            <div key={s.surahNumber} className="reports-table-row">
              <strong>{s.name}</strong>
              <span>{s.faceCount > 0 ? formatFaceValue(s.faceCount) : '—'}</span>
              <span>{s.facesRecited > 0 ? formatFaceValue(s.facesRecited) : '—'}</span>
              <span>{s.facesCompleted > 0 ? s.facesCompleted : '—'}</span>
              <span>{s.mistakes}</span>
              <span>{s.hesitations}</span>
              <span>{s.done}</span>
              <span>{s.repeat}</span>
              <span>{s.notReady}</span>
              <span className={s.needsRevision ? 'reports-rev-yes' : 'reports-rev-no'}>
                {s.needsRevision ? 'نعم' : 'لا'}
              </span>
            </div>
          ))}
          {surahStats.length === 0 && <div className="reports-empty">{loading ? 'جارٍ التحميل...' : 'لا توجد بيانات.'}</div>}
        </div>
      )}

      {reportType === 'halqa' && (
        <div className="reports-table-wrap">
          <div className="reports-table-head">
            <span>المعلم</span><span>الطلاب</span><span>إجمالي</span><span>تم</span><span>إعادة</span>
            <span>غير جاهز</span><span>الأوجه المسمّعة</span><span>الأوجه المكتملة</span>
            <span>الأخطاء</span><span>الترددات</span><span>الإنجاز</span>
          </div>
          {teacherStats.map((t) => {
            const pct = t.total > 0 ? (t.done / t.total) * 100 : 0;
            return (
              <div key={t.name} className="reports-table-row">
                <strong>{t.name}</strong>
                <span>{t.studentCount}</span>
                <span>{t.total}</span>
                <span>{t.done}</span>
                <span>{t.repeat}</span>
                <span>{t.notReady}</span>
                <span>{t.facesRecited > 0 ? formatFaceValue(t.facesRecited) : '—'}</span>
                <span>{t.facesCompleted > 0 ? t.facesCompleted : '—'}</span>
                <span>{t.mistakes}</span>
                <span>{t.hesitations}</span>
                <span className="reports-pct">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
          {teacherStats.length === 0 && <div className="reports-empty">{loading ? 'جارٍ التحميل...' : 'لا توجد بيانات.'}</div>}
        </div>
      )}
    </div>
  );
}
