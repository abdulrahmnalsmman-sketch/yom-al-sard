import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, Clock3, Users, UserPlus, Sparkles, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, SessionStatus, Student, YawmSession } from '@/types';
import { TeacherHalqaWorkflow } from '@/components/TeacherHalqaWorkflow';

type Notice = { type: 'success' | 'error'; text: string } | null;

const statusLabels: Record<SessionStatus, string> = { scheduled: 'مجدولة', open: 'مفتوحة', closed: 'مغلقة' };

const sessionColumns = 'id,name,session_date,start_time,end_time,status';

export function TeacherDashboard({ user, setNotice }: { user: Profile; setNotice: (n: Notice) => void }) {
  const [sessions, setSessions] = useState<YawmSession[]>([]);
  const [selected, setSelected] = useState<YawmSession | null>(null);
  const [showStudentPicker, setShowStudentPicker] = useState<YawmSession | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('session_teachers')
      .select(`yawm_sessions(${sessionColumns})`)
      .eq('teacher_id', user.id);
    if (error) { setNotice({ type: 'error', text: 'تعذر تحميل الأيام.' }); return; }
    const rows = ((data ?? []) as unknown as { yawm_sessions: YawmSession | null }[])
      .map((r) => r.yawm_sessions)
      .filter((s): s is YawmSession => s !== null && s.status !== 'closed')
      .sort((a, b) => b.session_date.localeCompare(a.session_date));
    setSessions(rows);
  }, [user.id, setNotice]);

  useEffect(() => { void load(); }, [load]);

  if (selected) {
    return <TeacherHalqaWorkflow session={selected} teacherId={user.id} onBack={() => { setSelected(null); void load(); }} setNotice={setNotice} />;
  }

  if (showStudentPicker) {
    return <StudentPickerPanel session={showStudentPicker} teacherId={user.id} onBack={() => { setShowStudentPicker(null); void load(); }} onDone={() => { setShowStudentPicker(null); setSelected(showStudentPicker); }} setNotice={setNotice} />;
  }

  return <>
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> لوحة المعلم</div>
        <h1>أهلًا بك، <em>{user.display_name}</em></h1>
        <p>اختر يوم السرد النشط ثم حدد طلابك وابدأ التسميع.</p>
      </div>
    </section>

    <div className="teacher-note"><Sparkles size={19} /><div><strong>خطوات العمل</strong><span>اختر اليوم ← حدد طلابك ← سجّل الحضور والتسميع.</span></div></div>

    <section className="teacher-session-grid">
      <div className="panel-card">
        <div className="panel-heading"><div><h2>أيام السرد</h2><p>الأيام المسندة إليك</p></div></div>
        {sessions.map((session) => (
          <div className="teacher-session" key={session.id}>
            <div className="session-date">
              <span>{new Date(session.session_date).toLocaleDateString('ar-SA', { weekday: 'short' })}</span>
              <strong>{new Date(session.session_date).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}</strong>
            </div>
            <div className="session-info">
              <strong>{session.name}</strong>
              <span><Clock3 size={13} /> {session.start_time.slice(0, 5)} · {statusLabels[session.status]}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {session.status === 'open' && <button className="small-action open-action" onClick={() => setSelected(session)}>بدء التسميع <ChevronLeft size={15} /></button>}
              <button className="small-action" style={{ background: '#eaf3f2', color: '#024f63' }} onClick={() => setShowStudentPicker(session)}><Users size={14} /> الطلاب</button>
            </div>
          </div>
        ))}
        {sessions.length === 0 && <div className="empty-state"><CalendarDays size={18} /> لا توجد أيام سرد مسندة إليك بعد. سيظهر اليوم هنا عند إسناده من قبل مدير النظام.</div>}
      </div>
      <div className="panel-card">
        <div className="panel-heading"><div><h2>ملاحظة</h2><p>كيف تعمل الحلقة</p></div><CheckCircle2 size={19} color="#6d9293" /></div>
        <div className="info-list">
          <p><Users size={15} /> حدد طلابك من القائمة العامة قبل بدء التسميع</p>
          <p><UserPlus size={15} /> تستطيع استلام طالب من معلم آخر أثناء اليوم</p>
          <p><CheckCircle2 size={15} /> تنقل بحرية بين الطلاب دون قيود تسلسلية</p>
        </div>
      </div>
    </section>
  </>;
}

/* ── Student Picker Panel ── */
function StudentPickerPanel({ session, teacherId, onBack, onDone, setNotice }: {
  session: YawmSession;
  teacherId: string;
  onBack: () => void;
  onDone: () => void;
  setNotice: (n: Notice) => void;
}) {
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentStudentIds, setCurrentStudentIds] = useState<Set<string>>(new Set());
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: studentsData }, { data: assignedData }, { data: allAssignedData }] = await Promise.all([
        supabase.from('students').select('*').eq('is_active', true).order('name'),
        supabase.from('session_student_assignments').select('student_id').eq('session_id', session.id).eq('teacher_id', teacherId),
        supabase.from('session_student_assignments').select('student_id, teacher_id').eq('session_id', session.id),
      ]);

      const students = (studentsData ?? []) as Student[];
      setAllStudents(students);

      const myStudentIds = new Set(((assignedData ?? []) as { student_id: string }[]).map((r) => r.student_id));
      setSelectedIds(myStudentIds);
      setCurrentStudentIds(myStudentIds);

      const allAssignedIds = new Set(((allAssignedData ?? []) as { student_id: string }[]).map((r) => r.student_id));
      setAvailableStudents(students.filter((s) => !allAssignedIds.has(s.id)));
      setLoading(false);
    })();
  }, [session.id, teacherId]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('teacher_select_session_students', {
      p_session_id: session.id,
      p_student_ids: Array.from(selectedIds),
    });
    setSaving(false);
    if (error) {
      setNotice({ type: 'error', text: 'تعذر حفظ اختيار الطلاب.' });
      return;
    }
    setNotice({ type: 'success', text: `تم تحديد ${selectedIds.size} طالب لحلقتك.` });
    onDone();
  };

  const transferStudent = async (studentId: string) => {
    const { error } = await supabase.rpc('teacher_transfer_student', {
      p_session_id: session.id,
      p_student_id: studentId,
    });
    if (error) {
      setNotice({ type: 'error', text: 'تعذر استلام الطالب.' });
      return;
    }
    setNotice({ type: 'success', text: 'تم استلام الطالب في حلقتك.' });
    setSelectedIds((prev) => { const next = new Set(prev); next.add(studentId); return next; });
    setAvailableStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const removedIds = [...currentStudentIds].filter((id) => !selectedIds.has(id));

  return <>
    <section className="welcome-row page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> اختيار الطلاب</div>
        <h1>{session.name}</h1>
        <p>حدد الطلاب الذين تريد ضمهم إلى حلقته</p>
      </div>
      <button className="secondary-button" onClick={onBack}><ChevronLeft size={17} /> العودة</button>
    </section>

    <div className="panel-card" style={{ padding: '22px', marginBottom: '15px' }}>
      <div className="panel-heading">
        <div><h2>طلابي المختارون</h2><p>{selectedIds.size} طالب</p></div>
        <button type="button" className="small-action" onClick={() => setSelectedIds(selectedIds.size === allStudents.length ? new Set() : new Set(allStudents.map((s) => s.id)))}>
          {selectedIds.size === allStudents.length && allStudents.length > 0 ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
        </button>
      </div>
      {loading && <div className="empty-state">جارٍ تحميل الطلاب...</div>}
      {!loading && (
        <div className="halqa-student-list">
          {allStudents.map((s) => {
            const on = selectedIds.has(s.id);
            return (
              <button key={s.id} type="button" className={`halqa-student-option ${on ? 'selected' : ''}`} onClick={() => toggle(s.id)}>
                <span className="halqa-check">{on && <CheckCircle2 size={13} />}</span>
                <span>{s.name}</span>
              </button>
            );
          })}
          {allStudents.length === 0 && <div className="empty-state">لا يوجد طلاب نشطون في النظام.</div>}
        </div>
      )}
      {removedIds.length > 0 && (
        <p style={{ fontSize: '11px', color: '#b17b36', marginTop: '10px' }}>
          سيتم إزالة {removedIds.length} طالب من حلقتك (لن تُحذف سجلات تسميعهم السابقة).
        </p>
      )}
      <div className="form-actions" style={{ marginTop: '15px' }}>
        <button type="button" className="secondary-button" onClick={onBack}>إلغاء</button>
        <button type="button" className="primary-button" disabled={saving || loading} onClick={() => void save()}>
          {saving ? 'جارٍ الحفظ...' : <><Save size={15} /> حفظ وبدء التسميع</>}
        </button>
      </div>
    </div>

    {availableStudents.length > 0 && (
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading">
          <div><h2>طلاب متاحون للاستلام</h2><p>طلاب مسجلون مع معلمين آخرين في هذا اليوم</p></div>
          <UserPlus size={20} color="#6d9293" />
        </div>
        <div className="halqa-student-list">
          {availableStudents.map((s) => (
            <div key={s.id} className="teacher-pick-row" style={{ padding: '10px 12px' }}>
              <div><strong>{s.name}</strong></div>
              <button className="small-action open-action" onClick={() => void transferStudent(s.id)}><UserPlus size={14} /> استلام</button>
            </div>
          ))}
        </div>
      </div>
    )}
  </>;
}
