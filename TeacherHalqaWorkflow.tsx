import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Users, BookOpen, CheckCircle2, ChevronRight, UserPlus, Scan } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { QuranJuz, QuranSurah, Student, StudentCurriculumItem, YawmSession } from '@/types';
import { RecitationEntryForm } from '@/components/RecitationEntryForm';
import { MushafReader } from '@/components/MushafReader';

type Notice = { type: 'success' | 'error'; text: string } | null;
type AttendanceStatus = 'present' | 'absent';
type Stage = 'attendance' | 'recitation';

export function TeacherHalqaWorkflow({
  session, teacherId, onBack, setNotice,
}: {
  session: YawmSession;
  teacherId: string;
  onBack: () => void;
  setNotice: (n: Notice) => void;
}) {
  const [students, setStudents] = useState<Pick<Student, 'id' | 'name'>[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [surahs, setSurahs] = useState<QuranSurah[]>([]);
  const [juzList, setJuzList] = useState<QuranJuz[]>([]);
  const [mushafStudent, setMushafStudent] = useState<{ name: string; items: StudentCurriculumItem[] } | null>(null);
  const [stage, setStage] = useState<Stage>('attendance');
  const [fromSurah, setFromSurah] = useState('');
  const [toSurah, setToSurah] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: rosterRows, error: rosterError }, { data: attRows }, { data: surahRows }, { data: juzRows }] = await Promise.all([
      supabase
        .from('session_student_assignments')
        .select('student_id, students(id, name)')
        .eq('session_id', session.id)
        .eq('teacher_id', teacherId),
      supabase.from('attendance_records').select('student_id, status').eq('session_id', session.id),
      supabase.from('quran_surahs').select('*').order('surah_number'),
      supabase.from('quran_juz').select('*').order('juz_number'),
    ]);
    setJuzList((juzRows ?? []) as QuranJuz[]);
    if (rosterError) setNotice({ type: 'error', text: 'تعذر تحميل طلاب الحلقة.' });

    const roster = ((rosterRows ?? []) as unknown as { students: Pick<Student, 'id' | 'name'> | null }[])
      .map((r) => r.students)
      .filter((s): s is Pick<Student, 'id' | 'name'> => Boolean(s))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    setStudents(roster);
    setSurahs((surahRows ?? []) as QuranSurah[]);

    const map: Record<string, AttendanceStatus> = {};
    roster.forEach((student) => { map[student.id] = 'present'; });
    ((attRows ?? []) as { student_id: string; status: string }[]).forEach((r) => {
      if (r.status === 'present' || r.status === 'absent') map[r.student_id] = r.status as AttendanceStatus;
    });
    setAttendance(map);

    if (roster.length > 0) {
      const { data: curricula } = await supabase
        .from('student_curricula')
        .select('student_curriculum_items(surah_id, sort_order, item_type)')
        .eq('student_id', roster[0].id)
        .eq('is_active', true);
      const items = ((curricula ?? []) as unknown as { student_curriculum_items: { surah_id: string; sort_order: number; item_type: string }[] }[])
        .flatMap((c) => c.student_curriculum_items ?? [])
        .filter((i) => (i.item_type === 'surah' || i.item_type === 'ayah_range' || i.item_type === 'page_range') && i.surah_id)
        .sort((a, b) => a.sort_order - b.sort_order);
      if (items.length > 0) {
        setFromSurah(items[0].surah_id);
        setToSurah(items[items.length - 1].surah_id);
      } else if (surahRows && surahRows.length > 0) {
        const allSurahs = surahRows as QuranSurah[];
        setFromSurah(allSurahs[0].id);
        setToSurah(allSurahs[77].id);
      }
    }
    setLoading(false);
  }, [session.id, teacherId, setNotice]);

  useEffect(() => { void load(); }, [load]);

  const markAttendance = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const saveAttendance = async () => {
    if (!students.every((student) => attendance[student.id])) {
      setNotice({ type: 'error', text: 'حدد حالة الحضور لكل طالب.' });
      return;
    }
    setSavingAttendance(true);
    const { error } = await supabase.rpc('teacher_save_attendance_batch', {
      p_session_id: session.id,
      p_attendance: attendance,
    });
    setSavingAttendance(false);
    if (error) {
      setNotice({ type: 'error', text: 'تعذر حفظ الحضور. تأكد أنك معلم الحلقة ثم حاول مرة أخرى.' });
      return;
    }
    setNotice({ type: 'success', text: 'تم حفظ الحضور.' });
    setStage('recitation');
    setCurrentIndex(0);
  };

  const presentStudents = students.filter((s) => attendance[s.id] === 'present');
  const allMarked = students.length > 0 && students.every((s) => attendance[s.id]);
  const current = presentStudents[currentIndex];
  const fromNumber = surahs.find((s) => s.id === fromSurah)?.surah_number ?? 1;
  const toNumber = surahs.find((s) => s.id === toSurah)?.surah_number ?? 114;
  const rangeValid = fromSurah && toSurah && fromNumber <= toNumber;

  if (loading) return <div className="empty-state">جارٍ تحميل الحلقة...</div>;

  return (
    <>
      <section className="welcome-row page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> حلقة اليوم</div>
          <h1>{session.name}</h1>
          <p>{students.length} طالب · {presentStudents.length} حاضر</p>
        </div>
        <button className="secondary-button" onClick={onBack}><ChevronLeft size={17} /> العودة</button>
      </section>

      <div className="halqa-steps">
        <button className={`halqa-step ${stage === 'attendance' ? 'active' : ''}`} onClick={() => setStage('attendance')}>
          <Users size={15} /> الحضور
        </button>
        <button
          className={`halqa-step ${stage === 'recitation' ? 'active' : ''}`}
          disabled={!allMarked}
          onClick={() => { setCurrentIndex(0); setStage('recitation'); }}
        >
          <BookOpen size={15} /> التسميع
        </button>
      </div>

      {stage === 'attendance' && (
        <div className="panel-card attendance-panel">
          <div className="panel-heading">
            <div><h2>قائمة الحضور</h2><p>حدد حالة كل طالب ثم انتقل للتسميع</p></div>
          </div>
          {students.length === 0 && <div className="empty-state">لا يوجد طلاب في حلققتك. حدد طلابك من قائمة الطلاب أولاً.</div>}
          <div className="attendance-list">
            {students.map((s) => {
              const status = attendance[s.id];
              return (
                <div className="attendance-row" key={s.id}>
                  <strong>{s.name}</strong>
                  <div className="attendance-choices">
                    <select className={`attendance-select ${status}`} value={status ?? 'present'} onChange={(event) => markAttendance(s.id, event.target.value as AttendanceStatus)}>
                      <option value="present">حاضر</option>
                      <option value="absent">غائب</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="recitation-footer">
            <span>{allMarked ? 'تم تسجيل حضور الجميع.' : 'سجّل حضور كل الطلاب للمتابعة.'}</span>
            <button className="primary-button" disabled={!allMarked || savingAttendance} onClick={() => void saveAttendance()}>
              {savingAttendance ? 'جارٍ حفظ الحضور...' : 'متابعة للتسميع'}
            </button>
          </div>
        </div>
      )}

      {stage === 'recitation' && (
        <>
          <div className="panel-card curriculum-day-panel" style={{ marginBottom: '14px' }}>
            <div className="panel-heading">
              <div><h2>مقرر اليوم</h2><p>حدد نطاق السور للتسميع</p></div>
            </div>
            <div className="curriculum-day-list">
              <div className="curriculum-day-row">
                <label>من سورة
                  <select value={fromSurah} onChange={(e) => setFromSurah(e.target.value)}>
                    <option value="">اختر</option>
                    {surahs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label>إلى سورة
                  <select value={toSurah} onChange={(e) => setToSurah(e.target.value)}>
                    <option value="">اختر</option>
                    {surahs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="recitation-footer" style={{ marginTop: 0, marginBottom: '14px' }}>
            <span>افتح مصحف المدينة داخل نطاق مقرر الطالب الحالي</span>
            <button
              className="secondary-button"
              onClick={() => void openMushaf(current)}
              disabled={!current}
            >
              <Scan size={16} /> مصحف المدينة
            </button>
          </div>

          {presentStudents.length > 0 && (
            <div className="student-nav-bar">
              {presentStudents.map((s, i) => (
                <button
                  key={s.id}
                  className={`student-nav-pill ${i === currentIndex ? 'active' : ''}`}
                  onClick={() => setCurrentIndex(i)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="panel-card recitation-panel">
            {!current && (
              <div className="empty-state">
                <CheckCircle2 size={20} />
                {presentStudents.length === 0 ? ' لا يوجد طلاب حاضرون للتسميع.' : ' تم تسميع جميع الطلاب الحاضرين.'}
              </div>
            )}
            {current && rangeValid && (
              <>
                <div className="recitation-progress">
                  <span>الطالب {currentIndex + 1} من {presentStudents.length}</span>
                  <div className="progress-track"><span style={{ width: `${((currentIndex + 1) / presentStudents.length) * 100}%` }} /></div>
                </div>
                <RecitationEntryForm
                  key={current.id}
                  sessionId={session.id}
                  studentId={current.id}
                  studentName={current.name}
                  surahs={surahs}
                  fromSurahId={fromSurah}
                  toSurahId={toSurah}
                  setNotice={setNotice}
                  onStudentComplete={() => {
                    if (currentIndex < presentStudents.length - 1) {
                      setCurrentIndex((i) => i + 1);
                    } else {
                      setNotice({ type: 'success', text: 'تم تسميع جميع الطلاب الحاضرين.' });
                    }
                  }}
                />
                <div className="student-nav-buttons">
                  <button
                    className="secondary-button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronRight size={16} /> الطالب السابق
                  </button>
                  <button
                    className="primary-button"
                    disabled={currentIndex >= presentStudents.length - 1}
                    onClick={() => setCurrentIndex((i) => i + 1)}
                  >
                    الطالب التالي <ChevronLeft size={16} />
                  </button>
                </div>
              </>
            )}
            {current && !rangeValid && (
              <div className="empty-state">حدد نطاق السور في المقرر أعلاه قبل بدء التسميع.</div>
            )}
          </div>
        </>
      )}

      {mushafStudent && (
        <MushafReader
          teacherId={teacherId}
          surahs={surahs}
          juzList={juzList}
          curriculumItems={mushafStudent.items}
          activeStudentName={mushafStudent.name}
          onClose={() => setMushafStudent(null)}
          setNotice={setNotice}
        />
      )}
    </>
  );

  async function openMushaf(student: Pick<Student, 'id' | 'name'> | undefined) {
    if (!student) return;
    const { data: curricula } = await supabase
      .from('student_curricula')
      .select('student_curriculum_items(*)')
      .eq('student_id', student.id)
      .eq('is_active', true);
    const items = ((curricula ?? []) as unknown as { student_curriculum_items: StudentCurriculumItem[] }[])
      .flatMap((c) => c.student_curriculum_items ?? [])
      .sort((a, b) => a.sort_order - b.sort_order);
    setMushafStudent({ name: student.name, items });
  }
}
