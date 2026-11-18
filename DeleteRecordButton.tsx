import { useEffect, useState } from 'react';
import { Trash2, X, Archive, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type RecordKind = 'session' | 'student' | 'halqa' | 'teacher';
type Notice = { type: 'success' | 'error'; text: string } | null;

const KIND_LABEL: Record<RecordKind, string> = {
  session: 'يوم الهمة',
  student: 'الطالب',
  halqa: 'الحلقة',
  teacher: 'حساب المعلم',
};

const USAGE_LABEL: Record<string, string> = {
  recitations: 'سجلات تسميع',
  legacy_recitations: 'سجلات تسميع سابقة',
  attendance: 'سجلات حضور',
  students: 'طلاب مرتبطون بالحلقة',
  session_assignments: 'تعيينات في أيام الهمة',
  session_students: 'طلاب في اليوم',
  session_teachers: 'معلمون في اليوم',
  student_assignments: 'تعيينات طلاب',
  created_sessions: 'أيام همة أنشأها',
  curricula: 'مقررات أسندها',
};

export function DeleteRecordButton({
  kind, recordId, recordName, onDone, setNotice,
}: {
  kind: RecordKind;
  recordId: string;
  recordName: string;
  onDone: () => void;
  setNotice: (n: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [usageError, setUsageError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmStep, setConfirmStep] = useState(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsage(null);
    setUsageError('');
    setActionError('');
    setConfirmStep(1);
    supabase.rpc('admin_entity_usage', { p_kind: kind, p_id: recordId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setUsageError(error.message);
      else setUsage((data ?? {}) as Record<string, number>);
    });
    return () => { cancelled = true; };
  }, [open, kind, recordId]);

  const linkedEntries = usage ? Object.entries(usage).filter(([, count]) => count > 0) : [];
  const isLinked = linkedEntries.length > 0;

  const confirm = async () => {
    setBusy(true);
    setActionError('');
    const { data, error } = await supabase.rpc('admin_delete_entity', { p_kind: kind, p_id: recordId });
    setBusy(false);
    if (error) { setActionError(error.message); return; }
    setOpen(false);
    setNotice({
      type: 'success',
      text: data === 'archived'
        ? `تمت أرشفة «${recordName}» لوجود سجلات مرتبطة به، ولم تُحذف بياناته.`
        : `تم حذف «${recordName}» نهائياً.`,
    });
    onDone();
  };

  // Session cascade delete: two-step confirmation
  const confirmSessionDelete = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    setBusy(true);
    setActionError('');
    const { data, error } = await supabase.rpc('admin_cascade_delete_session', { p_session_id: recordId });
    setBusy(false);
    if (error) { setActionError(error.message); setConfirmStep(1); return; }
    setOpen(false);
    setNotice({ type: 'success', text: `تم حذف «${recordName}» وجميع البيانات المرتبطة به نهائياً.` });
    onDone();
  };

  return (
    <>
      <button
        type="button"
        className="small-action close-action"
        title={`حذف ${KIND_LABEL[kind]}`}
        aria-label={`حذف ${KIND_LABEL[kind]} ${recordName}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <Trash2 size={13} />
      </button>

      {open && (
        <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); if (!busy) setOpen(false); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)', textAlign: 'right' }}>
            <button className="modal-close" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button>
            <h2 style={{ marginBottom: '8px' }}>حذف {KIND_LABEL[kind]}</h2>
            <p style={{ fontWeight: 700, marginBottom: '12px' }}>{recordName}</p>

            {kind === 'session' ? (
              <>
                {confirmStep === 1 && (
                  <>
                    <p style={{ marginBottom: '8px', color: '#b42318', fontWeight: 600 }}>
                      تحذير: سيتم حذف هذا اليوم وجميع البيانات المرتبطة به نهائياً، بما يشمل:
                    </p>
                    <ul style={{ marginBottom: '12px', paddingRight: '18px', color: '#889698', fontSize: '12px' }}>
                      <li>سجلات التسميع لجميع المعلمين</li>
                      <li>الترددات والأخطاء وحالات التسميع</li>
                      <li>سجلات الحضور والغياب</li>
                      <li>توزيع الطلاب على الحلقات</li>
                      <li>جميع التقارير والإحصائيات الخاصة بهذا اليوم</li>
                    </ul>
                    <p style={{ marginBottom: '12px' }}>لا يمكن التراجع عن هذا الحذف. هل أنت متأكد؟</p>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>إلغاء</button>
                      <button className="primary-button close-action" onClick={() => void confirmSessionDelete()}>نعم، متأكد</button>
                    </div>
                  </>
                )}
                {confirmStep === 2 && (
                  <>
                    <p style={{ marginBottom: '8px', color: '#b42318', fontWeight: 700 }}>
                      تأكيد نهائي: سيتم حذف كل شيء بشكل لا يمكن استرجاعه.
                    </p>
                    <p style={{ marginBottom: '12px' }}>اكتب "تأكيد" في الزر أدناه للحذف النهائي.</p>
                    {actionError && <p style={{ color: '#b42318', marginBottom: '12px' }}>{actionError}</p>}
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => { setConfirmStep(1); }} disabled={busy}>رجوع</button>
                      <button className="primary-button close-action" disabled={busy} onClick={() => void confirmSessionDelete()}>
                        {busy ? 'جارٍ الحذف...' : 'حذف نهائي لا رجعة فيه'}
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {!usage && !usageError && <p>جارٍ فحص السجلات المرتبطة...</p>}
                {usageError && <p style={{ color: '#b42318' }}>تعذر فحص الارتباط بالسجلات: {usageError}</p>}

                {usage && isLinked && (
                  <>
                    <p style={{ marginBottom: '8px' }}>
                      يوجد لهذا العنصر سجلات مرتبطة، لذلك لن يُحذف نهائياً. سيتم أرشفته وإخفاؤه من القوائم مع الحفاظ على جميع السجلات والتقارير.
                    </p>
                    <ul style={{ marginBottom: '12px', paddingRight: '18px' }}>
                      {linkedEntries.map(([key, count]) => <li key={key}>{USAGE_LABEL[key] ?? key}: {count}</li>)}
                    </ul>
                  </>
                )}
                {usage && !isLinked && (
                  <p style={{ marginBottom: '12px' }}>لا توجد سجلات مرتبطة. سيتم الحذف النهائي ولا يمكن التراجع عنه.</p>
                )}
                {actionError && <p style={{ color: '#b42318', marginBottom: '12px' }}>{actionError}</p>}

                <div className="form-actions">
                  <button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>إلغاء</button>
                  <button className="primary-button" disabled={!usage || busy} onClick={() => void confirm()}>
                    {busy ? 'جارٍ التنفيذ...' : isLinked ? 'أرشفة' : 'حذف نهائي'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Student Archive / Restore / Permanent Delete Buttons ── */

export function ArchiveStudentButton({ studentId, studentName, onDone, setNotice }: {
  studentId: string; studentName: string; onDone: () => void; setNotice: (n: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const archive = async () => {
    if (!window.confirm(`هل تريد أرشفة الطالب «${studentName}»؟\nسيختفي من القوائم النشطة مع الاحتفاظ بجميع بياناته وسجلاته.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_archive_student', { p_student_id: studentId });
    setBusy(false);
    if (error) { setNotice({ type: 'error', text: 'تعذر أرشفة الطالب.' }); return; }
    setNotice({ type: 'success', text: `تمت أرشفة الطالب «${studentName}».` });
    onDone();
  };
  return <button type="button" className="small-action" title="أرشفة الطالب" disabled={busy}
    onClick={(e) => { e.stopPropagation(); void archive(); }}><Archive size={13} /></button>;
}

export function RestoreStudentButton({ studentId, studentName, onDone, setNotice }: {
  studentId: string; studentName: string; onDone: () => void; setNotice: (n: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_restore_student', { p_student_id: studentId });
    setBusy(false);
    if (error) { setNotice({ type: 'error', text: 'تعذر استعادة الطالب.' }); return; }
    setNotice({ type: 'success', text: `تمت استعادة الطالب «${studentName}» إلى القائمة النشطة.` });
    onDone();
  };
  return <button type="button" className="small-action open-action" title="استعادة الطالب" disabled={busy}
    onClick={(e) => { e.stopPropagation(); void restore(); }}><RotateCcw size={13} /></button>;
}

export function PermanentDeleteStudentButton({ studentId, studentName, onDone, setNotice }: {
  studentId: string; studentName: string; onDone: () => void; setNotice: (n: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');

  const doDelete = async () => {
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('admin_delete_student_permanent', { p_student_id: studentId });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); setStep(1); return; }
    setOpen(false);
    setNotice({ type: 'success', text: `تم حذف الطالب «${studentName}» وجميع بياناته نهائياً.` });
    onDone();
  };

  return (
    <>
      <button type="button" className="small-action close-action" title="حذف نهائي" disabled={busy}
        onClick={(e) => { e.stopPropagation(); setOpen(true); setStep(1); setError(''); }}><Trash2 size={13} /></button>

      {open && (
        <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); if (!busy) setOpen(false); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', textAlign: 'right' }}>
            <button className="modal-close" onClick={() => setOpen(false)} disabled={busy}><X size={18} /></button>
            <h2 style={{ marginBottom: '8px' }}>الحذف النهائي للطالب</h2>
            <p style={{ fontWeight: 700, marginBottom: '12px' }}>{studentName}</p>

            {step === 1 && (
              <>
                <p style={{ color: '#b42318', fontWeight: 600, marginBottom: '8px' }}>
                  تحذير: سيتم حذف الطالب وجميع بياناته نهائياً، بما يشمل:
                </p>
                <ul style={{ marginBottom: '12px', paddingRight: '18px', color: '#889698', fontSize: '12px' }}>
                  <li>سجلات التسميع والترددات والأخطاء</li>
                  <li>سجلات الحضور والغياب</li>
                  <li>المقررات والارتباطات بالحلقات</li>
                  <li>جميع التقارير المرتبطة به</li>
                </ul>
                <p style={{ marginBottom: '12px' }}>لا يمكن استعادة البيانات بعد الحذف النهائي. هل أنت متأكد؟</p>
                <div className="form-actions">
                  <button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>إلغاء</button>
                  <button className="primary-button close-action" onClick={() => setStep(2)}>نعم، متأكد</button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p style={{ color: '#b42318', fontWeight: 700, marginBottom: '12px' }}>
                  تأكيد نهائي: لا يمكن التراجع عن هذا الحذف.
                </p>
                {error && <p style={{ color: '#b42318', marginBottom: '12px' }}>{error}</p>}
                <div className="form-actions">
                  <button className="secondary-button" onClick={() => setStep(1)} disabled={busy}>رجوع</button>
                  <button className="primary-button close-action" disabled={busy} onClick={() => void doDelete()}>
                    {busy ? 'جارٍ الحذف...' : 'حذف نهائي لا رجعة فيه'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
