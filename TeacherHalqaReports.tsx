import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Users, BookOpen, CheckCircle2, Clock3, RotateCcw, AlertCircle, CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, RecitationStatus, QuranSurah } from '@/types';
import { formatFaceValue } from '@/lib/faceCalc';

type Notice = { type: 'success' | 'error'; text: string } | null;

type RecitationRow = {
  id: string;
  student_id: string;
  student_name: string;
  surah_id: string | null;
  surah_name: string | null;
  surah_number: number | null;
  status: RecitationStatus;
  mistakes: number;
  hesitations: number;
  notes: string;
  created_at: string;
  faces_recited: number | null;
  faces_completed: number | null;
  recitation_type: string | null;
};

type AttendanceRow = { student_id: string; status: string };
type StudentInfo = { id: string; name: string };

const statusLabels: Record<string, string> = { done: 'تم', not_ready: 'غير جاهز', repeat: 'إعادة' };

export function TeacherHalqaReports({ user, setNotice }: { user: Profile; setNotice: (n: Notice) => void }) {
  const [sessions, setSessions] = useState<{ id: string; name: string; session_date: string }[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [rows, setRows] = useState<RecitationRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [surahs, setSurahs] = useState<QuranSurah[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase
      .from('session_teachers')
      .select('yawm_sessions(id,name,session_date)')
      .eq('teacher_id', user.id);
    const list = ((data ?? []) as unknown as { yawm_sessions: { id: string; name: string; session_date: string } | null }[])
      .map((r) => r.yawm_sessions)
      .filter((s): s is { id: string; name: string; session_date: string } => s !== null)
      .sort((a, b) => b.session_date.localeCompare(a.session_date));
    setSessions(list);
    if (list.length > 0 && !selectedSession) setSelectedSession(list[0].id);
  }, [user.id, selectedSession]);

  const loadData = useCallback(async () => {
    if (!selectedSession) { setLoading(false); return; }
    setLoading(true);

    const [{ data: studentRows }, { data: recitationRows }, { data: attRows }, { data: surahRows }] = await Promise.all([
      supabase
        .from('session_student_assignments')
        .select('student_id, students(id, name)')
        .eq('session_id', selectedSession)
        .eq('teacher_id', user.id),
      supabase
        .from('recitation_entries')
        .select('id,student_id,surah_id,status,mistakes,hesitations,notes,created_at,faces_recited,faces_completed,recitation_type')
        .eq('session_id', selectedSession),
      supabase
        .from('attendance_records')
        .select('student_id,status')
        .eq('session_id', selectedSession),
      supabase.from('quran_surahs').select('id,surah_number,name,face_count').order('surah_number'),
    ]);

    const myStudents = ((studentRows ?? []) as unknown as { students: StudentInfo | null }[])
      .map((r) => r.students)
      .filter((s): s is StudentInfo => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    setStudents(myStudents);

    const surahList = (surahRows ?? []) as QuranSurah[];
    setSurahs(surahList);

    const myStudentIds = new Set(myStudents.map((s) => s.id));
    const recs = ((recitationRows ?? []) as RecitationRow[]).filter((r) => myStudentIds.has(r.student_id));
    const enrichedRecs = recs.map((r) => {
      const surah = surahList.find((s) => s.id === r.surah_id);
      const student = myStudents.find((s) => s.id === r.student_id);
      return {
        ...r,
        surah_name: surah?.name ?? r.surah_name ?? '—',
        surah_number: surah?.surah_number ?? r.surah_number ?? null,
        student_name: student?.name ?? '—',
      };
    });
    setRows(enrichedRecs);

    const myAtt = ((attRows ?? []) as AttendanceRow[]).filter((r) => myStudentIds.has(r.student_id));
    setAttendance(myAtt);
    setLoading(false);
  }, [selectedSession, user.id]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);
  useEffect(() => { void loadData(); }, [loadData]);

  const studentStats = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; present: boolean;
      recited: boolean; done: number; repeat: number; notReady: number;
      mistakes: number; hesitations: number; facesRecited: number;
      surahsDone: { name: string; status: RecitationStatus; mistakes: number; hesitations: number }[];
    }>();
    for (const s of students) {
      const att = attendance.find((a) => a.student_id === s.id);
      map.set(s.id, {
        id: s.id, name: s.name, present: att?.status === 'present',
        recited: false, done: 0, repeat: 0, notReady: 0,
        mistakes: 0, hesitations: 0, facesRecited: 0, surahsDone: [],
      });
    }
    for (const r of rows) {
      const stat = map.get(r.student_id);
      if (!stat) continue;
      stat.recited = true;
      stat.mistakes += r.mistakes;
      stat.hesitations += r.hesitations;
      if (r.status === 'done') { stat.done++; stat.facesRecited += r.faces_recited ? Number(r.faces_recited) : 0; }
      if (r.status === 'repeat') stat.repeat++;
      if (r.status === 'not_ready') stat.notReady++;
      stat.surahsDone.push({ name: r.surah_name ?? '—', status: r.status, mistakes: r.mistakes, hesitations: r.hesitations });
    }
    return Array.from(map.values());
  }, [students, attendance, rows]);

  const surahStats = useMemo(() => {
    const map = new Map<string, { name: string; mistakes: number; hesitations: number; done: number; repeat: number; notReady: number }>();
    for (const r of rows) {
      if (!r.surah_id) continue;
      const key = r.surah_id;
      if (!map.has(key)) map.set(key, { name: r.surah_name ?? '—', mistakes: 0, hesitations: 0, done: 0, repeat: 0, notReady: 0 });
      const stat = map.get(key)!;
      stat.mistakes += r.mistakes;
      stat.hesitations += r.hesitations;
      if (r.status === 'done') stat.done++;
      if (r.status === 'repeat') stat.repeat++;
      if (r.status === 'not_ready') stat.notReady++;
    }
    return Array.from(map.values());
  }, [rows]);

  const totalDone = rows.filter((r) => r.status === 'done').length;
  const totalRepeat = rows.filter((r) => r.status === 'repeat').length;
  const totalNotReady = rows.filter((r) => r.status === 'not_ready').length;
  const totalMistakes = rows.reduce((s, r) => s + r.mistakes, 0);
  const totalHesitations = rows.reduce((s, r) => s + r.hesitations, 0);
  const totalFaces = rows.filter((r) => r.status === 'done').reduce((s, r) => s + (r.faces_recited ? Number(r.faces_recited) : 0), 0);
  const totalJuz = totalFaces / 20;
  const presentCount = studentStats.filter((s) => s.present).length;
  const absentCount = studentStats.length - presentCount;
  const recitedCount = studentStats.filter((s) => s.recited).length;
  const notRecitedCount = studentStats.filter((s) => s.present && !s.recited).length;

  return (
    <div className="reports-dark">
      <div className="reports-dark-header">
        <div>
          <div className="reports-dark-eyebrow"><BarChart3 size={16} /> تقارير الحلقة</div>
          <h1>تقارير حلقتي</h1>
          <p>تقارير طلابك وحضورهم وتسميعهم — خاصة بحلقتك فقط.</p>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="reports-filters">
          <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {sessions.length === 0 && !loading && (
        <div className="reports-empty">لا توجد أيام سرد مسندة إليك بعد.</div>
      )}

      {sessions.length > 0 && (
        <>
          <div className="reports-stat-grid">
            <div className="reports-stat-card tone-teal">
              <div className="reports-stat-icon"><Users size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">إجمالي الطلاب</span>
                <strong className="reports-stat-value">{studentStats.length}</strong>
              </div>
            </div>
            <div className="reports-stat-card tone-green">
              <div className="reports-stat-icon"><CheckCircle2 size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">الحاضرون</span>
                <strong className="reports-stat-value">{presentCount}</strong>
                <span className="reports-stat-sub">{absentCount} غائب</span>
              </div>
            </div>
            <div className="reports-stat-card tone-gold">
              <div className="reports-stat-icon"><BookOpen size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">سمّع</span>
                <strong className="reports-stat-value">{recitedCount}</strong>
                <span className="reports-stat-sub">{notRecitedCount} لم يسمّع</span>
              </div>
            </div>
            <div className="reports-stat-card tone-sky">
              <div className="reports-stat-icon"><BarChart3 size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">الأجزاء المنجزة</span>
                <strong className="reports-stat-value">{totalJuz.toFixed(2)}</strong>
                <span className="reports-stat-sub">{totalFaces.toFixed(1)} وجه</span>
              </div>
            </div>
            <div className="reports-stat-card tone-green">
              <div className="reports-stat-icon"><CheckCircle2 size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">تم</span>
                <strong className="reports-stat-value">{totalDone}</strong>
              </div>
            </div>
            <div className="reports-stat-card tone-gold">
              <div className="reports-stat-icon"><RotateCcw size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">إعادة</span>
                <strong className="reports-stat-value">{totalRepeat}</strong>
              </div>
            </div>
            <div className="reports-stat-card tone-red">
              <div className="reports-stat-icon"><AlertCircle size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">إجمالي الأخطاء</span>
                <strong className="reports-stat-value">{totalMistakes}</strong>
              </div>
            </div>
            <div className="reports-stat-card tone-gold">
              <div className="reports-stat-icon"><Clock3 size={20} /></div>
              <div className="reports-stat-body">
                <span className="reports-stat-label">إجمالي الترددات</span>
                <strong className="reports-stat-value">{totalHesitations}</strong>
              </div>
            </div>
          </div>

          <div className="reports-table-wrap">
            <div className="reports-table-head">
              <span>الطالب</span><span>الحضور</span><span>سمّع</span><span>تم</span><span>إعادة</span>
              <span>الأوجه</span><span>الأخطاء</span><span>الترددات</span><span>السور</span>
            </div>
            {studentStats.map((s) => (
              <div key={s.id} className="reports-table-row">
                <strong>{s.name}</strong>
                <span className={s.present ? 'reports-status done' : 'reports-status not_ready'}>{s.present ? 'حاضر' : 'غائب'}</span>
                <span>{s.recited ? 'نعم' : 'لا'}</span>
                <span>{s.done}</span>
                <span>{s.repeat}</span>
                <span>{s.facesRecited > 0 ? formatFaceValue(s.facesRecited) : '—'}</span>
                <span>{s.mistakes}</span>
                <span>{s.hesitations}</span>
                <span style={{ fontSize: '10px', color: '#889698' }}>
                  {s.surahsDone.map((su) => su.name).join('، ') || '—'}
                </span>
              </div>
            ))}
            {studentStats.length === 0 && <div className="reports-empty">{loading ? 'جارٍ التحميل...' : 'لا يوجد طلاب في حلققتك.'}</div>}
          </div>

          {surahStats.length > 0 && (
            <>
              <div className="reports-tabs" style={{ marginTop: '20px' }}>
                <button className="active">تحليل السور</button>
              </div>
              <div className="reports-table-wrap">
                <div className="reports-table-head">
                  <span>السورة</span><span>تم</span><span>إعادة</span><span>غير جاهز</span><span>الأخطاء</span><span>الترددات</span>
                </div>
                {surahStats.map((s, i) => (
                  <div key={i} className="reports-table-row">
                    <strong>{s.name}</strong>
                    <span>{s.done}</span>
                    <span>{s.repeat}</span>
                    <span>{s.notReady}</span>
                    <span>{s.mistakes}</span>
                    <span>{s.hesitations}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
