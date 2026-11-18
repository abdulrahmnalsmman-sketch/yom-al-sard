import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Plus, X, Save, Check, Trash2, ChevronLeft,
  RefreshCw, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  Student, QuranJuz, QuranSurah, StudentCurriculum, StudentCurriculumItem,
} from '@/types';

type Notice = { type: 'success' | 'error'; text: string } | null;

type JuzSurahEntry = {
  juz_number: number;
  juz_name: string;
  surah_id: string;
  surah_number: number;
  surah_name: string;
};

export function StudentCurriculumManager({
  student, setNotice,
}: {
  student: Student;
  setNotice: (n: Notice) => void;
}) {
  const [curricula, setCurricula] = useState<StudentCurriculum[]>([]);
  const [items, setItems] = useState<Record<string, StudentCurriculumItem[]>>({});
  const [juzList, setJuzList] = useState<QuranJuz[]>([]);
  const [surahList, setSurahList] = useState<QuranSurah[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzSurahEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: currData }, { data: juzData }, { data: surahData }, { data: idxData }] = await Promise.all([
      supabase.from('student_curricula').select('*').eq('student_id', student.id).order('created_at', { ascending: false }),
      supabase.from('quran_juz').select('*').order('juz_number'),
      supabase.from('quran_surahs').select('*').order('sort_order'),
      supabase.rpc('get_juz_surah_index'),
    ]);
    setCurricula((currData ?? []) as StudentCurriculum[]);
    setJuzList((juzData ?? []) as QuranJuz[]);
    setSurahList((surahData ?? []) as QuranSurah[]);
    setJuzIndex((idxData ?? []) as JuzSurahEntry[]);

    const itemsMap: Record<string, StudentCurriculumItem[]> = {};
    if (currData && currData.length > 0) {
      const { data: itemData } = await supabase
        .from('student_curriculum_items')
        .select('*')
        .in('curriculum_id', currData.map((c: StudentCurriculum) => c.id))
        .order('sort_order');
      (itemData ?? []).forEach((item: StudentCurriculumItem) => {
        if (!itemsMap[item.curriculum_id]) itemsMap[item.curriculum_id] = [];
        itemsMap[item.curriculum_id].push(item);
      });
    }
    setItems(itemsMap);
    setLoading(false);
  }, [student.id]);

  useEffect(() => { void load(); }, [load]);

  const createCurriculum = async (name: string) => {
    const { data, error } = await supabase.rpc('admin_create_curriculum', { p_student_id: student.id, p_name: name });
    if (error || !data) { setNotice({ type: 'error', text: error?.message || 'تعذر إنشاء المقرر.' }); return; }
    setNotice({ type: 'success', text: 'تم إنشاء المقرر.' });
    setShowForm(false);
    void load();
  };

  const deleteCurriculum = async (id: string) => {
    const { error } = await supabase.rpc('admin_delete_curriculum', { p_id: id });
    if (error) setNotice({ type: 'error', text: error.message });
    else { setNotice({ type: 'success', text: 'تم حذف المقرر.' }); void load(); }
  };

  const toggleComplete = async (item: StudentCurriculumItem) => {
    const { error } = await supabase.rpc('admin_update_curriculum_item', {
      p_id: item.id, p_is_completed: !item.is_completed,
    });
    if (error) setNotice({ type: 'error', text: 'تعذر تحديث الحالة.' });
    else void load();
  };

  const toggleRevision = async (item: StudentCurriculumItem) => {
    const { error } = await supabase.rpc('admin_update_curriculum_item', {
      p_id: item.id, p_needs_revision: !item.needs_revision,
    });
    if (error) setNotice({ type: 'error', text: 'تعذر تحديث المراجعة.' });
    else void load();
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.rpc('admin_delete_curriculum_item', { p_id: id });
    if (error) setNotice({ type: 'error', text: error.message });
    else { setNotice({ type: 'success', text: 'تم حذف العنصر.' }); void load(); }
  };

  if (loading) return <div className="panel-card"><div className="empty-state">جارٍ تحميل المقررات...</div></div>;

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading">
        <div><h2>مقررات الطالب</h2><p>إدارة المقررات والإنجاز والمراجعة</p></div>
        <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={17} /> مقرر جديد</button>
      </div>

      {showForm && (
        <NewCurriculumForm onSave={createCurriculum} onCancel={() => setShowForm(false)} />
      )}

      {curricula.length === 0 && !showForm && (
        <div className="empty-state">لا يوجد مقرر لهذا الطالب بعد. أنشئ مقررًا جديدًا.</div>
      )}

      <div className="curricula-list">
        {curricula.map((curr) => {
          const currItems = items[curr.id] ?? [];
          const completed = currItems.filter((i) => i.is_completed).length;
          const revision = currItems.filter((i) => i.needs_revision).length;
          const total = currItems.length;
          const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

          return (
            <div className="curriculum-block" key={curr.id}>
              <div className="curriculum-block-header">
                <div>
                  <h3>{curr.name || `مقرر ${new Date(curr.created_at).toLocaleDateString('ar-SA')}`}</h3>
                  <span>{total} عنصر · {completed} مكتمل · {revision} للمراجعة</span>
                </div>
                <div className="curriculum-actions">
                  <button className="small-action open-action" onClick={() => setShowItemForm(curr.id)}><Plus size={14} /> تحديد المقرر</button>
                  <button className="small-action close-action" onClick={() => void deleteCurriculum(curr.id)}><Trash2 size={14} /></button>
                </div>
              </div>

              {total > 0 && (
                <div className="progress-item">
                  <div><strong>نسبة الإنجاز</strong><span>{progress}%</span></div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                </div>
              )}

              {showItemForm === curr.id && (
                <JuzRangeItemForm
                  curriculumId={curr.id}
                  juzList={juzList}
                  onSave={async () => { setShowItemForm(null); void load(); }}
                  onCancel={() => setShowItemForm(null)}
                  setNotice={setNotice}
                />
              )}

              <div className="curriculum-items">
                {currItems.map((item, idx) => (
                  <CurriculumItemRow
                    key={item.id}
                    item={item}
                    index={idx}
                    juzList={juzList}
                    surahList={surahList}
                    onToggleComplete={() => void toggleComplete(item)}
                    onToggleRevision={() => void toggleRevision(item)}
                    onDelete={() => void deleteItem(item.id)}
                  />
                ))}
                {currItems.length === 0 && showItemForm !== curr.id && (
                  <div className="empty-state" style={{ padding: '15px 0' }}>حدد المقرر بالأجزاء.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── New Curriculum Form ── */
function NewCurriculumForm({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  return (
    <form className="inline-form" style={{ marginBottom: '18px' }} onSubmit={(e) => { e.preventDefault(); onSave(name); }}>
      <label>اسم المقرر (اختياري)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مقرر الجزء الثلاثون" /></label>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>إلغاء</button>
        <button className="primary-button">إنشاء</button>
      </div>
    </form>
  );
}

/* ── Juz Range Item Form ── */
function JuzRangeItemForm({
  curriculumId, juzList, onSave, onCancel, setNotice,
}: {
  curriculumId: string;
  juzList: QuranJuz[];
  onSave: () => void;
  onCancel: () => void;
  setNotice: (n: Notice) => void;
}) {
  const [fromJuz, setFromJuz] = useState('1');
  const [toJuz, setToJuz] = useState('30');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const fromNum = parseInt(fromJuz);
    const toNum = parseInt(toJuz);
    if (!fromNum || !toNum || fromNum < 1 || toNum > 30 || fromNum > toNum) {
      setNotice({ type: 'error', text: 'نطاق الأجزاء غير صحيح (1-30).' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_add_curriculum_by_juz_range', {
      p_curriculum_id: curriculumId,
      p_from_juz: fromNum,
      p_to_juz: toNum,
    });
    setSaving(false);
    if (error) {
      setNotice({ type: 'error', text: error.message });
      return;
    }
    setNotice({ type: 'success', text: `تم تحديد المقرر: ${data as number} عنصر من الجزء ${fromNum} إلى الجزء ${toNum}.` });
    onSave();
  };

  return (
    <div className="add-item-form" style={{ marginBottom: '18px', padding: '18px', background: '#f5f8f7', borderRadius: '10px', border: '1px solid #e7efed' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#354b4f', marginBottom: '12px' }}>
        تحديد المقرر بالأجزاء
      </div>
      <div className="form-grid">
        <label>من الجزء
          <select value={fromJuz} onChange={(e) => setFromJuz(e.target.value)}>
            {juzList.map((j) => <option key={j.id} value={j.juz_number}>الجزء {j.juz_number}</option>)}
          </select>
        </label>
        <label>إلى الجزء
          <select value={toJuz} onChange={(e) => setToJuz(e.target.value)}>
            {juzList.map((j) => <option key={j.id} value={j.juz_number}>الجزء {j.juz_number}</option>)}
          </select>
        </label>
      </div>
      <p style={{ fontSize: '11px', color: '#889698', marginTop: '10px' }}>
        سيقوم النظام باستخراج السور الواقعة ضمن نطاق الأجزاء المختارة تلقائيًا، مع مراعاة حدود الأجزاء بدقة. إذا امتدت سورة بين جزأين ستظهر تحت كل جزء بحسب موضعها فيه.
      </p>
      <div className="form-actions" style={{ marginTop: '12px' }}>
        <button type="button" className="secondary-button" onClick={onCancel}>إلغاء</button>
        <button className="primary-button" disabled={saving} onClick={() => void save()}>
          {saving ? 'جارٍ الحفظ...' : <><Save size={15} /> حفظ المقرر</>}
        </button>
      </div>
    </div>
  );
}

/* ── Curriculum Item Row ── */
function CurriculumItemRow({
  item, index, juzList, surahList, onToggleComplete, onToggleRevision, onDelete,
}: {
  item: StudentCurriculumItem;
  index: number;
  juzList: QuranJuz[];
  surahList: QuranSurah[];
  onToggleComplete: () => void;
  onToggleRevision: () => void;
  onDelete: () => void;
}) {
  const surah = surahList.find((s) => s.id === item.surah_id);

  let label = '';
  if (item.item_type === 'surah' && surah) {
    label = surah.name;
  } else if (item.item_type === 'page_range' && surah) {
    label = surah.name;
  } else if (item.item_type === 'juz') {
    const juz = juzList.find((j) => j.id === item.juz_id);
    label = juz?.name ?? 'جزء';
  } else if (item.item_type === 'ayah_range' && surah) {
    label = surah.name;
  }

  return (
    <div className={`curriculum-item-row ${item.is_completed ? 'completed' : ''} ${item.needs_revision ? 'needs-revision' : ''}`}
      style={{ display: 'grid', gridTemplateColumns: '27px 1fr auto', gap: '10px', alignItems: 'center', padding: '10px 0', borderTop: index === 0 ? 'none' : '1px solid #eff2f1' }}>
      <div className="surah-number" style={{ width: '27px', height: '27px' }}>{index + 1}</div>
      <div className="surah-title">
        <strong style={{ fontSize: '11px', color: item.is_completed ? '#54917b' : '#456064' }}>{label}</strong>
        {item.needs_revision && <span style={{ fontSize: '9px', color: '#b17b36', marginTop: '3px', display: 'block' }}>تحتاج إلى مراجعة</span>}
      </div>
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        <button className={`small-action ${item.needs_revision ? 'close-action' : ''}`} style={!item.needs_revision ? { background: '#eef2f0', color: '#8b9a9c' } : {}} onClick={onToggleRevision} title="مراجعة">
          <RefreshCw size={13} />
        </button>
        <button className={`small-action ${item.is_completed ? 'close-action' : 'open-action'}`} onClick={onToggleComplete} title={item.is_completed ? 'إلغاء الإنجاز' : 'تم'}>
          {item.is_completed ? <CheckCircle2 size={14} /> : <Check size={14} />}
        </button>
        <button className="small-action close-action" onClick={onDelete} title="حذف"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}
