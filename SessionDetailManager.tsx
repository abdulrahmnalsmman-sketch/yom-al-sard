import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, Clock3, Plus, X, Pencil, Users, ShieldCheck, CheckCircle2,
  CalendarDays, UserPlus, UserMinus, Save, BookOpen, Check, AlertCircle, Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  YawmSession, SessionStatus, Profile, Student, AttendanceRecord,
  QuranPortion, Surah, QuranJuz, QuranSurah, RecitationEntry,
} from '@/types';

type Notice = { type: 'success' | 'error'; text: string } | null;
const statusLabels: Record<SessionStatus, string> = { scheduled: 'مجدولة', open: 'مفتوحة', closed: 'مغلقة' };
const attendanceLabels: Record<string, string> = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'مستأذن' };

export function SessionDetailManager({
  session, onBack, setNotice,
}: {
  session: YawmSession;
  onBack: () => void;
  setNotice: (n: Notice) => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'teachers' | 'supervisors' | 'students' | 'attendance' | 'recitations'>('details');
  const [currentSession, setCurrentSession] = useState(session);

  return (
    <>
      <section className="welcome-row page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> إدارة يوم السرد</div>
          <h1>{currentSession.name}</h1>
          <p>{new Date(currentSession.session_date).toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })} · {currentSession.start_time.slice(0, 5)} - {currentSession.end_time.slice(0, 5)}</p>
        </div>
        <button className="secondary-button" onClick={onBack}><ChevronLeft size={17} /> العودة للقائمة</button>
      </section>

      <div className="session-tabs">
        <button className={`session-tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>تفاصيل اليوم</button>
        <button className={`session-tab ${activeTab === 'teachers' ? 'active' : ''}`} onClick={() => setActiveTab('teachers')}>المعلمون</button>
        <button className={`session-tab ${activeTab === 'supervisors' ? 'active' : ''}`} onClick={() => setActiveTab('supervisors')}>المشرفون</button>
        <button className={`session-tab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>الطلاب والتوزيع</button>
        <button className={`session-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>الحضور</button>
        <button className={`session-tab ${activeTab === 'recitations' ? 'active' : ''}`} onClick={() => setActiveTab('recitations')}>التسميعات</button>
      </div>

      {activeTab === 'details' && <SessionDetailsTab session={currentSession} setSession={setCurrentSession} setNotice={setNotice} />}
      {activeTab === 'teachers' && <SessionTeachersTab session={currentSession} setNotice={setNotice} />}
      {activeTab === 'supervisors' && <SessionSupervisorsTab session={currentSession} setNotice={setNotice} />}
      {activeTab === 'students' && <SessionStudentsTab session={currentSession} setNotice={setNotice} />}
      {activeTab === 'attendance' && <SessionAttendanceTab session={currentSession} setNotice={setNotice} />}
      {activeTab === 'recitations' && <SessionRecitationsTab session={currentSession} setNotice={setNotice} />}
    </>
  );
}

/* ── Details Tab ── */
function SessionDetailsTab({ session, setSession, setNotice }: { session: YawmSession; setSession: (s: YawmSession) => void; setNotice: (n: Notice) => void }) {
  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(session.session_date);
  const [start, setStart] = useState(session.start_time);
  const [end, setEnd] = useState(session.end_time);
  const [targetJuz, setTargetJuz] = useState(String(session.target_juz ?? ''));
  const [numHalqat, setNumHalqat] = useState(String(session.num_halqat ?? ''));
  const [dayNotes, setDayNotes] = useState(session.notes ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_update_session_full', {
      p_id: session.id, p_name: name, p_date: date, p_start: start, p_end: end,
      p_target_juz: parseFloat(targetJuz) || 0,
      p_num_halqat: parseInt(numHalqat) || 0,
      p_notes: dayNotes,
    });
    if (error || !data) setNotice({ type: 'error', text: 'تعذر تعديل اليوم.' });
    else { setSession(data as YawmSession); setNotice({ type: 'success', text: 'تم حفظ تعديلات اليوم.' }); }
    setSaving(false);
  };

  const updateStatus = async (status: SessionStatus) => {
    const { data, error } = await supabase.rpc('admin_set_session_status', { p_id: session.id, p_status: status });
    if (error || !data) setNotice({ type: 'error', text: 'تعذر تحديث الحالة.' });
    else { setSession(data as YawmSession); setNotice({ type: 'success', text: `تم تغيير الحالة إلى ${statusLabels[status]}.` }); }
  };

  return (
    <div className="session-management-grid">
      <form className="inline-form panel-card" onSubmit={save}>
        <div className="form-heading"><h2>تعديل بيانات اليوم</h2></div>
        <label>اسم اليوم<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <div className="form-grid">
          <label>التاريخ<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label>البداية<input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label>النهاية<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        <div className="form-grid">
          <label>المستهدف العام من أجزاء الطلاب<input type="number" min="0" step="0.01" value={targetJuz} onChange={(e) => setTargetJuz(e.target.value)} placeholder="مجموع أجزاء مقررات الطلاب" /></label>
          <label>عدد الحلقات<input type="number" value={numHalqat} onChange={(e) => setNumHalqat(e.target.value)} placeholder="عدد الحلقات" /></label>
        </div>
        <label>ملاحظات<input value={dayNotes} onChange={(e) => setDayNotes(e.target.value)} placeholder="ملاحظات إضافية" /></label>
        <div className="form-actions">
          <button className="primary-button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : <><Save size={17} /> حفظ التعديلات</>}</button>
        </div>
      </form>
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>حالة اليوم</h2><p>تحكم في فتح وإغلاق اليوم</p></div></div>
        <div className="session-status-control">
          <span className={`status ${session.status === 'open' ? 'next' : session.status === 'closed' ? 'done' : 'planned'}`}>
            <i /> {statusLabels[session.status]}
          </span>
          <div className="status-buttons">
            {session.status !== 'scheduled' && <button className="small-action" style={{ background: '#eaf5f0', color: '#3d8375' }} onClick={() => void updateStatus('scheduled')}>جدولة</button>}
            {session.status !== 'open' && <button className="small-action open-action" onClick={() => void updateStatus('open')}>فتح اليوم</button>}
            {session.status !== 'closed' && <button className="small-action close-action" onClick={() => void updateStatus('closed')}>إغلاق اليوم</button>}
            {session.status === 'closed' && <div className="closed-label"><CheckCircle2 size={16} /> محفوظ</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Teachers Tab ── */
function SessionTeachersTab({ session, setNotice }: { session: YawmSession; setNotice: (n: Notice) => void }) {
  const [assigned, setAssigned] = useState<Profile[]>([]);
  const [available, setAvailable] = useState<Profile[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const { data: teacherRows } = await supabase
      .from('session_teachers')
      .select('teacher_id, profiles!inner(id, email, display_name, role, is_active, username)')
      .eq('session_id', session.id);
    const assignedList = (teacherRows ?? []).flatMap((r: { profiles: Profile[] }) => r.profiles ?? []).filter(Boolean) as Profile[];
    setAssigned(assignedList);

    const assignedIds = new Set(assignedList.map((p) => p.id));
    const { data: allTeachers } = await supabase
      .from('profiles')
      .select('id, email, display_name, role, is_active, username')
      .eq('role', 'teacher')
      .eq('is_active', true)
      .order('display_name');
    setAvailable((allTeachers ?? []).filter((p: Profile) => !assignedIds.has(p.id)) as Profile[]);
  }, [session.id]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (teacherId: string) => {
    const { error } = await supabase.rpc('admin_assign_session_teacher', { p_session_id: session.id, p_teacher_id: teacherId });
    if (error) setNotice({ type: 'error', text: 'تعذر إسناد المعلم.' });
    else { setNotice({ type: 'success', text: 'تم إسناد المعلم لليوم.' }); void load(); }
  };

  const unassign = async (teacherId: string) => {
    const { error } = await supabase.rpc('admin_unassign_session_teacher', { p_session_id: session.id, p_teacher_id: teacherId });
    if (error) setNotice({ type: 'error', text: 'تعذر إزالة المعلم.' });
    else { setNotice({ type: 'success', text: 'تمت إزالة المعلم من اليوم.' }); void load(); }
  };

  return (
    <div className="content-grid">
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading">
          <div><h2>المعلمون المشاركون</h2><p>{assigned.length} معلم</p></div>
          <button className="primary-button" onClick={() => setShowAdd(!showAdd)}><Plus size={17} /> إضافة معلم</button>
        </div>
        {showAdd && (
          <div className="add-teacher-list">
            {available.map((t) => (
              <div className="teacher-pick-row" key={t.id}>
                <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{t.display_name.charAt(0)}</div>
                <div><strong>{t.display_name}</strong><span>{t.username || t.email}</span></div>
                <button className="small-action open-action" onClick={() => void assign(t.id)}><UserPlus size={14} /> إسناد</button>
              </div>
            ))}
            {available.length === 0 && <div className="empty-state">لا يوجد معلمون متاحون.</div>}
          </div>
        )}
        <div className="teacher-list">
          {assigned.map((t) => (
            <div className="teacher-pick-row" key={t.id}>
              <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{t.display_name.charAt(0)}</div>
              <div><strong>{t.display_name}</strong><span>{t.username || t.email}</span></div>
              <button className="small-action close-action" onClick={() => void unassign(t.id)}><UserMinus size={14} /> إزالة</button>
            </div>
          ))}
          {assigned.length === 0 && <div className="empty-state">لم يتم إسناد معلمين بعد.</div>}
        </div>
      </div>
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>معلومات</h2><p>كيف يعمل التوزيع</p></div><ShieldCheck size={20} color="#6d9293" /></div>
        <div className="info-list">
          <p><Check size={15} /> المعلم المسند يرى اليوم في حسابه عند فتحه</p>
          <p><Check size={15} /> لا يرى المعلم الأيام غير المسندة إليه</p>
          <p><Check size={15} /> يمكن توزيع الطلاب على المعلمين من تبويب الطلاب</p>
          <p><Check size={15} /> تعديل التوزيع ينعكس فورًا في حساب المعلم</p>
        </div>
      </div>
    </div>
  );
}

/* ── Supervisors Tab ── */
function SessionSupervisorsTab({ session, setNotice }: { session: YawmSession; setNotice: (n: Notice) => void }) {
  const [assigned, setAssigned] = useState<Profile[]>([]);
  const [available, setAvailable] = useState<Profile[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const { data: supRows } = await supabase
      .from('session_supervisors')
      .select('supervisor_id, profiles!inner(id, email, display_name, role, is_active, username)')
      .eq('session_id', session.id);
    const assignedList = (supRows ?? []).flatMap((r: { profiles: Profile[] }) => r.profiles ?? []).filter(Boolean) as Profile[];
    setAssigned(assignedList);

    const assignedIds = new Set(assignedList.map((p) => p.id));
    const { data: allSupervisors } = await supabase
      .from('profiles')
      .select('id, email, display_name, role, is_active, username')
      .eq('role', 'supervisor')
      .eq('is_active', true)
      .order('display_name');
    setAvailable((allSupervisors ?? []).filter((p: Profile) => !assignedIds.has(p.id)) as Profile[]);
  }, [session.id]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (supervisorId: string) => {
    const { error } = await supabase.rpc('admin_assign_session_supervisor', { p_session_id: session.id, p_supervisor_id: supervisorId });
    if (error) setNotice({ type: 'error', text: 'تعذر إسناد المشرف.' });
    else { setNotice({ type: 'success', text: 'تم إسناد المشرف لليوم.' }); void load(); }
  };

  const unassign = async (supervisorId: string) => {
    const { error } = await supabase.rpc('admin_unassign_session_supervisor', { p_session_id: session.id, p_supervisor_id: supervisorId });
    if (error) setNotice({ type: 'error', text: 'تعذر إزالة المشرف.' });
    else { setNotice({ type: 'success', text: 'تمت إزالة المشرف من اليوم.' }); void load(); }
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading">
        <div><h2>المشرفون المشاركون</h2><p>{assigned.length} مشرف</p></div>
        <button className="primary-button" onClick={() => setShowAdd(!showAdd)}><Plus size={17} /> إضافة مشرف</button>
      </div>
      {showAdd && (
        <div className="add-teacher-list">
          {available.map((s) => (
            <div className="teacher-pick-row" key={s.id}>
              <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{s.display_name.charAt(0)}</div>
              <div><strong>{s.display_name}</strong><span>{s.username || s.email}</span></div>
              <button className="small-action open-action" onClick={() => void assign(s.id)}><UserPlus size={14} /> إسناد</button>
            </div>
          ))}
          {available.length === 0 && <div className="empty-state">لا يوجد مشرفون متاحون.</div>}
        </div>
      )}
      <div className="teacher-list">
        {assigned.map((s) => (
          <div className="teacher-pick-row" key={s.id}>
            <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{s.display_name.charAt(0)}</div>
            <div><strong>{s.display_name}</strong><span>{s.username || s.email}</span></div>
            <button className="small-action close-action" onClick={() => void unassign(s.id)}><UserMinus size={14} /> إزالة</button>
          </div>
        ))}
        {assigned.length === 0 && <div className="empty-state">لم يتم إسناد مشرفين بعد.</div>}
      </div>
    </div>
  );
}

/* ── Students Tab ── */
function SessionStudentsTab({ session, setNotice }: { session: YawmSession; setNotice: (n: Notice) => void }) {
  const [assignments, setAssignments] = useState<{ student: Student; teacherId: string | null }[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  const load = useCallback(async () => {
    const [{ data: ssaRows }, { data: teacherRows }, { data: studentRows }] = await Promise.all([
      supabase.from('session_student_assignments').select('student_id, teacher_id').eq('session_id', session.id),
      supabase.from('session_teachers').select('teacher_id, profiles!inner(id, email, display_name, role, is_active, username)').eq('session_id', session.id),
      supabase.from('students').select('*').eq('is_active', true).order('name'),
    ]);

    const teacherList = (teacherRows ?? []).flatMap((r: { profiles: Profile[] }) => r.profiles ?? []).filter(Boolean) as Profile[];
    setTeachers(teacherList);

    const assignmentMap = new Map<string, string>();
    (ssaRows ?? []).forEach((r: { student_id: string; teacher_id: string }) => assignmentMap.set(r.student_id, r.teacher_id));

    // Also get students from session_students (may not have teacher assignment yet)
    const { data: sessionStudentRows } = await supabase.from('session_students').select('student_id').eq('session_id', session.id);
    const sessionStudentIds = new Set((sessionStudentRows ?? []).map((r: { student_id: string }) => r.student_id));

    const assignedStudents = ((studentRows ?? []) as Student[]).filter((s) => sessionStudentIds.has(s.id));
    setAssignments(assignedStudents.map((s) => ({ student: s, teacherId: assignmentMap.get(s.id) ?? null })));
    setAllStudents(((studentRows ?? []) as Student[]).filter((s) => !sessionStudentIds.has(s.id)));
  }, [session.id]);

  useEffect(() => { void load(); }, [load]);

  const addStudent = async () => {
    if (!selectedStudent) { setNotice({ type: 'error', text: 'اختر طالبًا.' }); return; }
    if (!selectedTeacher) { setNotice({ type: 'error', text: 'اختر معلمًا.' }); return; }
    const { error } = await supabase.rpc('admin_assign_student_to_teacher', {
      p_session_id: session.id, p_student_id: selectedStudent, p_teacher_id: selectedTeacher,
    });
    if (error) setNotice({ type: 'error', text: 'تعذر توزيع الطالب.' });
    else {
      setNotice({ type: 'success', text: 'تم توزيع الطالب على المعلم.' });
      setSelectedStudent(''); setSelectedTeacher(''); setShowAdd(false); void load();
    }
  };

  const reassign = async (studentId: string, teacherId: string) => {
    const { error } = await supabase.rpc('admin_assign_student_to_teacher', {
      p_session_id: session.id, p_student_id: studentId, p_teacher_id: teacherId,
    });
    if (error) setNotice({ type: 'error', text: 'تعذر إعادة التوزيع.' });
    else { setNotice({ type: 'success', text: 'تم إعادة توزيع الطالب.' }); void load(); }
  };

  const removeStudent = async (studentId: string) => {
    const { error } = await supabase.rpc('admin_unassign_student', { p_session_id: session.id, p_student_id: studentId });
    if (error) setNotice({ type: 'error', text: 'تعذر إزالة الطالب.' });
    else { setNotice({ type: 'success', text: 'تمت إزالة الطالب من اليوم.' }); void load(); }
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading">
        <div><h2>توزيع الطلاب على المعلمين</h2><p>{assignments.length} طالب في هذا اليوم</p></div>
        <button className="primary-button" onClick={() => setShowAdd(!showAdd)}><Plus size={17} /> إضافة طالب</button>
      </div>

      {showAdd && (
        <div className="add-student-form" style={{ marginBottom: '18px' }}>
          <div className="form-grid">
            <label>الطالب
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                <option value="">اختر طالبًا</option>
                {allStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>المعلم
              <select value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)}>
                <option value="">اختر معلمًا</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setShowAdd(false)}>إلغاء</button>
            <button className="primary-button" onClick={() => void addStudent()}><Check size={16} /> توزيع</button>
          </div>
        </div>
      )}

      <div className="data-table">
        <div className="table-head"><span>الطالب</span><span>المعلم</span><span>الحلقة</span><span>المقرر</span><span /></div>
        {assignments.map(({ student, teacherId }) => {
          const teacher = teachers.find((t) => t.id === teacherId);
          return (
            <div className="table-row" key={student.id}>
              <strong>{student.name}</strong>
              <select
                value={teacherId ?? ''}
                onChange={(e) => void reassign(student.id, e.target.value)}
                style={{ height: '31px', fontSize: '10px', border: '1px solid #dfe8e5', borderRadius: '6px', padding: '0 6px', color: '#385156' }}
              >
                <option value="">— بدون معلم —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
              </select>
              <span>{student.halqa || '—'}</span>
              <span>{student.current_portion || '—'}</span>
              <button className="row-more" onClick={() => void removeStudent(student.id)}><UserMinus size={14} /></button>
            </div>
          );
        })}
        {assignments.length === 0 && <div className="empty-state">لم يتم توزيع طلاب بعد.</div>}
      </div>
    </div>
  );
}

/* ── Attendance Tab ── */
function SessionAttendanceTab({ session, setNotice }: { session: YawmSession; setNotice: (n: Notice) => void }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<{ student: Student; teacherId: string | null }[]>([]);

  const load = useCallback(async () => {
    const [{ data: attRows }, { data: ssaRows }, { data: studentRows }] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('session_id', session.id),
      supabase.from('session_student_assignments').select('student_id, teacher_id').eq('session_id', session.id),
      supabase.from('session_students').select('student_id').eq('session_id', session.id),
    ]);

    const attMap = new Map<string, AttendanceRecord>();
    (attRows ?? []).forEach((r: AttendanceRecord) => attMap.set(r.student_id, r));
    setRecords(Array.from(attMap.values()));

    const ssaMap = new Map<string, string>();
    (ssaRows ?? []).forEach((r: { student_id: string; teacher_id: string }) => ssaMap.set(r.student_id, r.teacher_id));

    const studentIds = (studentRows ?? []).map((r: { student_id: string }) => r.student_id);
    if (studentIds.length > 0) {
      const { data: studentData } = await supabase.from('students').select('*').in('id', studentIds).order('name');
      setStudents(((studentData ?? []) as Student[]).map((s) => ({ student: s, teacherId: ssaMap.get(s.id) ?? null })));
    }
  }, [session.id]);

  useEffect(() => { void load(); }, [load]);

  const setAttendance = async (studentId: string, status: string) => {
    const { error } = await supabase.rpc('teacher_save_attendance', {
      p_session_id: session.id, p_student_id: studentId, p_status: status,
    });
    if (error) setNotice({ type: 'error', text: 'تعذر تسجيل الحضور.' });
    else { setNotice({ type: 'success', text: 'تم تسجيل الحضور.' }); void load(); }
  };

  const present = records.filter((r) => r.status === 'present').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const late = records.filter((r) => r.status === 'late').length;

  return (
    <>
      <div className="report-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div><span>إجمالي الطلاب</span><strong>{students.length}</strong></div>
        <div><span>حاضر</span><strong>{present}</strong></div>
        <div><span>غائب</span><strong>{absent}</strong></div>
        <div><span>متأخر</span><strong>{late}</strong></div>
      </div>
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>كشف الحضور</h2><p>سجّل حضور كل طالب</p></div></div>
        <div className="attendance-list">
          {students.map(({ student }) => {
            const record = records.find((r) => r.student_id === student.id);
            const currentStatus = record?.status ?? '';
            return (
              <div className="attendance-row" key={student.id}>
                <div className="attendance-student">
                  <strong>{student.name}</strong>
                  <span>{student.halqa || ''}</span>
                </div>
                <div className="attendance-buttons">
                  {(['present', 'absent', 'late', 'excused'] as const).map((st) => (
                    <button
                      key={st}
                      className={`attendance-btn ${currentStatus === st ? `att-${st}` : ''}`}
                      onClick={() => void setAttendance(student.id, st)}
                    >
                      {attendanceLabels[st]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {students.length === 0 && <div className="empty-state">لا يوجد طلاب في هذا اليوم.</div>}
        </div>
      </div>
    </>
  );
}

/* ── Recitations Tab ── */
const recitationStatusLabels: Record<string, string> = { done: 'تم', not_ready: 'غير جاهز', repeat: 'يحتاج إعادة' };

function SessionRecitationsTab({ session, setNotice: _setNotice }: { session: YawmSession; setNotice: (n: Notice) => void }) {
  const [entries, setEntries] = useState<RecitationEntry[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [surahNames, setSurahNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const { data: recRows } = await supabase
        .from('recitation_entries')
        .select('id, teacher_id, student_id, session_id, surah_id, surah_number, status, mistakes, hesitations, notes, created_at, updated_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false });
      const rows = (recRows ?? []) as RecitationEntry[];
      setEntries(rows);

      if (rows.length > 0) {
        const studentIds = [...new Set(rows.map((r) => r.student_id))];
        const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];
        const surahIds = [...new Set(rows.map((r) => r.surah_id).filter(Boolean) as string[])];

        const [studentsRes, teachersRes, surahsRes] = await Promise.all([
          supabase.from('students').select('id, name').in('id', studentIds),
          supabase.from('profiles').select('id, display_name').in('id', teacherIds),
          supabase.from('quran_surahs').select('id, name').in('id', surahIds),
        ]);

        const sMap: Record<string, string> = {};
        (studentsRes.data ?? []).forEach((s: { id: string; name: string }) => { sMap[s.id] = s.name; });
        setStudentNames(sMap);

        const tMap: Record<string, string> = {};
        (teachersRes.data ?? []).forEach((t: { id: string; display_name: string }) => { tMap[t.id] = t.display_name; });
        setTeacherNames(tMap);

        const surMap: Record<string, string> = {};
        (surahsRes.data ?? []).forEach((s: { id: string; name: string }) => { surMap[s.id] = s.name; });
        setSurahNames(surMap);
      }
    })();
  }, [session.id]);

  const doneCount = entries.filter((e) => e.status === 'done').length;
  const notReadyCount = entries.filter((e) => e.status === 'not_ready').length;
  const repeatCount = entries.filter((e) => e.status === 'repeat').length;

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>تسميعات اليوم</h2><p>{entries.length} سجل تسميع · {doneCount} تم · {repeatCount} إعادة · {notReadyCount} غير جاهز</p></div><BookOpen size={20} color="#6d9293" /></div>
      <div className="recitation-list">
        {entries.map((rec) => (
          <div className="recitation-record-row" key={rec.id}>
            <div className="recitation-record-header">
              <div>
                <strong>{studentNames[rec.student_id] || 'طالب'}</strong>
                <span>{surahNames[rec.surah_id ?? ''] || '—'} · {teacherNames[rec.teacher_id] || 'معلم'}</span>
              </div>
              <time>{new Date(rec.created_at).toLocaleString('ar-SA')}</time>
            </div>
            <div className="recitation-detail-row">
              <span className={`status ${rec.status === 'done' ? 'done' : rec.status === 'repeat' ? 'next' : 'planned'}`}><i />{recitationStatusLabels[rec.status] ?? rec.status}</span>
              <span>أخطاء: {rec.mistakes}</span>
              <span>تردد: {rec.hesitations}</span>
            </div>
          </div>
        ))}
        {entries.length === 0 && <div className="empty-state">لا توجد تسميعات في هذا اليوم بعد.</div>}
      </div>
    </div>
  );
}
