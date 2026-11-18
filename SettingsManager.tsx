import { useEffect, useState, useCallback } from 'react';
import {
  Settings as SettingsIcon, Building2, BookOpen, CalendarDays, Users,
  ShieldCheck, FileText, History, Save, Plus, Pencil, X, Check, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DeleteRecordButton } from '@/components/DeleteRecordButton';
import type { Halqa, PlatformSetting, QuranJuz, QuranSurah, Profile, AuditEntry } from '@/types';

type Notice = { type: 'success' | 'error'; text: string } | null;
type SettingsSection = 'platform' | 'halqat' | 'sessions' | 'quran' | 'attendance' | 'recitation' | 'roles' | 'reports' | 'audit';

const sectionLabels: { key: SettingsSection; label: string; icon: typeof SettingsIcon }[] = [
  { key: 'platform', label: 'معلومات المنصة والجهة', icon: Building2 },
  { key: 'halqat', label: 'إدارة الحلقات', icon: Users },
  { key: 'sessions', label: 'أيام السرد والجلسات', icon: CalendarDays },
  { key: 'quran', label: 'المقررات وتقسيمات المصحف', icon: BookOpen },
  { key: 'attendance', label: 'الحضور والغياب', icon: Check },
  { key: 'recitation', label: 'التسميع والأخطاء', icon: FileText },
  { key: 'roles', label: 'الأدوار والصلاحيات', icon: ShieldCheck },
  { key: 'reports', label: 'التقارير والتصدير', icon: FileText },
  { key: 'audit', label: 'سجل العمليات والأمان', icon: History },
];

export function SettingsManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [section, setSection] = useState<SettingsSection>('platform');

  return (
    <>
      <section className="welcome-row page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> الإعدادات</div>
          <h1>إعدادات النظام</h1>
          <p>مركز الإعدادات — اختر قسمًا لتعديل بياناته وحفظها.</p>
        </div>
      </section>
      <div className="settings-layout">
        <aside className="settings-nav panel-card">
          {sectionLabels.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${section === key ? 'active' : ''}`}
              onClick={() => setSection(key)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {section === 'platform' && <PlatformSettingsSection setNotice={setNotice} />}
          {section === 'halqat' && <HalqatSection setNotice={setNotice} />}
          {section === 'sessions' && <SessionSettingsSection setNotice={setNotice} />}
          {section === 'quran' && <QuranSettingsSection setNotice={setNotice} />}
          {section === 'attendance' && <AttendanceSettingsSection setNotice={setNotice} />}
          {section === 'recitation' && <RecitationSettingsSection setNotice={setNotice} />}
          {section === 'roles' && <RolesSettingsSection setNotice={setNotice} />}
          {section === 'reports' && <ReportsSettingsSection setNotice={setNotice} />}
          {section === 'audit' && <AuditSection setNotice={setNotice} />}
        </div>
      </div>
    </>
  );
}

/* ── Platform Info Section ── */
function PlatformSettingsSection({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('platform_settings').select('*').eq('category', 'platform').order('key');
      setSettings((data ?? []) as PlatformSetting[]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: PlatformSetting) => { map[s.key] = s.value; });
      setValues(map);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    let errors = 0;
    for (const s of settings) {
      const { error } = await supabase.rpc('admin_update_setting', { p_key: s.key, p_value: values[s.key] ?? '' });
      if (error) errors++;
    }
    if (errors === 0) setNotice({ type: 'success', text: 'تم حفظ معلومات المنصة.' });
    else setNotice({ type: 'error', text: 'تعذر حفظ بعض الإعدادات.' });
    setSaving(false);
  };

  if (loading) return <div className="panel-card"><div className="empty-state">جارٍ التحميل...</div></div>;

  const fieldLabels: Record<string, string> = {
    platform_name: 'اسم المنصة',
    institution_name: 'اسم الجهة',
    branch_name: 'اسم الفرع',
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading">
        <div><h2>معلومات المنصة والجهة والفرع</h2><p>عدّل بيانات المنصة الأساسية</p></div>
        <Building2 size={22} color="#6d9293" />
      </div>
      <div className="settings-form">
        {settings.map((s) => (
          <label key={s.key}>
            {fieldLabels[s.key] || s.description}
            <input value={values[s.key] ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
          </label>
        ))}
        <button className="primary-button" onClick={() => void save()} disabled={saving}>
          {saving ? 'جارٍ الحفظ...' : <><Save size={17} /> حفظ التغييرات</>}
        </button>
      </div>
    </div>
  );
}

/* ── Halqat Section ── */
function HalqatSection({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [halqat, setHalqat] = useState<Halqa[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Halqa | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('halqat').select('*').order('name');
    setHalqat((data ?? []) as Halqa[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const { error } = await supabase.rpc('admin_update_halqa', {
        p_id: editing.id, p_name: name, p_description: desc, p_is_active: isActive,
      });
      if (error) setNotice({ type: 'error', text: 'تعذر تعديل الحلقة.' });
      else { setNotice({ type: 'success', text: 'تم تعديل الحلقة.' }); setShowForm(false); void load(); }
    } else {
      const { error } = await supabase.rpc('admin_create_halqa', { p_name: name, p_description: desc });
      if (error) setNotice({ type: 'error', text: 'تعذر إنشاء الحلقة.' });
      else { setNotice({ type: 'success', text: 'تم إنشاء الحلقة.' }); setShowForm(false); void load(); }
    }
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading">
        <div><h2>إدارة الحلقات</h2><p>أضف وعدّل وعلّق الحلقات</p></div>
        <button className="primary-button" onClick={() => { setEditing(null); setName(''); setDesc(''); setIsActive(true); setShowForm(true); }}>
          <Plus size={17} /> إضافة حلقة
        </button>
      </div>
      {showForm && (
        <form className="inline-form" style={{ marginBottom: '18px' }} onSubmit={submit}>
          <label>اسم الحلقة<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>الوصف<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="وصف مختصر" /></label>
          {editing && <label className="check-field"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> الحلقة نشطة</label>}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>إلغاء</button>
            <button className="primary-button">{editing ? 'حفظ' : 'إنشاء'}</button>
          </div>
        </form>
      )}
      <div className="data-table">
        <div className="table-head"><span>اسم الحلقة</span><span>الوصف</span><span>الحالة</span><span /></div>
        {halqat.map((h) => (
          <div className="table-row" key={h.id}>
            <strong>{h.name}</strong>
            <span>{h.description || '—'}</span>
            <span className={`status ${h.is_active ? 'done' : 'planned'}`}><i />{h.is_active ? 'نشطة' : 'متوقفة'}</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button className="row-more" onClick={() => { setEditing(h); setName(h.name); setDesc(h.description); setIsActive(h.is_active); setShowForm(true); }}>
                <Pencil size={15} />
              </button>
              <DeleteRecordButton kind="halqa" recordId={h.id} recordName={h.name} onDone={() => void load()} setNotice={setNotice} />
            </div>
          </div>
        ))}
        {halqat.length === 0 && <div className="empty-state">لا توجد حلقات. أضف أول حلقة.</div>}
      </div>
    </div>
  );
}

/* ── Session Settings Section ── */
function SessionSettingsSection({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('platform_settings').select('*').eq('category', 'sessions').order('key');
      setSettings((data ?? []) as PlatformSetting[]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: PlatformSetting) => { map[s.key] = s.value; });
      setValues(map);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    let errors = 0;
    for (const s of settings) {
      const { error } = await supabase.rpc('admin_update_setting', { p_key: s.key, p_value: values[s.key] ?? '' });
      if (error) errors++;
    }
    setNotice(errors === 0 ? { type: 'success', text: 'تم حفظ إعدادات الجلسات.' } : { type: 'error', text: 'تعذر الحفظ.' });
    setSaving(false);
  };

  const labels: Record<string, string> = {
    default_start_time: 'وقت البداية الافتراضي',
    default_end_time: 'وقت النهاية الافتراضي',
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>إعدادات أيام السرد والجلسات</h2><p>القيم الافتراضية للجلسات</p></div><CalendarDays size={22} color="#6d9293" /></div>
      <div className="settings-form">
        {settings.map((s) => (
          <label key={s.key}>{labels[s.key] || s.description}<input value={values[s.key] ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} /></label>
        ))}
        <button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? 'جارٍ الحفظ...' : <><Save size={17} /> حفظ</>}</button>
      </div>
    </div>
  );
}

/* ── Quran Settings Section ── */
function QuranSettingsSection({ setNotice: _setNotice }: { setNotice: (n: Notice) => void }) {
  const [juzList, setJuzList] = useState<QuranJuz[]>([]);
  const [surahList, setSurahList] = useState<QuranSurah[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data: juz }, { data: surahs }] = await Promise.all([
        supabase.from('quran_juz').select('*').order('juz_number'),
        supabase.from('quran_surahs').select('*').order('sort_order'),
      ]);
      setJuzList((juz ?? []) as QuranJuz[]);
      setSurahList((surahs ?? []) as QuranSurah[]);
    })();
  }, []);

  return (
    <div className="content-grid">
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>الأجزاء (30)</h2><p>تقسيمات المصحف — الأجزاء</p></div><BookOpen size={22} color="#6d9293" /></div>
        <div className="data-table">
          <div className="table-head"><span>الجزء</span><span>من صفحة</span><span>إلى صفحة</span></div>
          {juzList.map((j) => (
            <div className="table-row" key={j.id}>
              <strong>{j.name}</strong><span>{j.start_page}</span><span>{j.end_page}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>السور (114)</h2><p>بيانات السور وعدد الآيات</p></div><BookOpen size={22} color="#6d9293" /></div>
        <div className="quran-surah-list">
          {surahList.map((s) => (
            <div className="surah-row" key={s.id} style={{ gridTemplateColumns: '27px 1fr 60px 60px 70px', gap: '8px' }}>
              <div className="surah-number">{s.surah_number}</div>
              <div className="surah-title"><strong>{s.name}</strong><span>{s.revelation_type === 'meccan' ? 'مكية' : 'مدنية'} · {s.ayah_count} آية</span></div>
              <span style={{ fontSize: '9px', color: '#94a1a2' }}>ص {s.start_page}</span>
              <span style={{ fontSize: '9px', color: '#94a1a2' }}>إلى {s.end_page}</span>
              <span style={{ fontSize: '9px', color: '#94a1a2' }}>{s.ayah_count} آية</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Attendance Settings Section ── */
function AttendanceSettingsSection({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('platform_settings').select('*').eq('category', 'attendance').order('key');
      setSettings((data ?? []) as PlatformSetting[]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: PlatformSetting) => { map[s.key] = s.value; });
      setValues(map);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    let errors = 0;
    for (const s of settings) {
      const { error } = await supabase.rpc('admin_update_setting', { p_key: s.key, p_value: values[s.key] ?? '' });
      if (error) errors++;
    }
    setNotice(errors === 0 ? { type: 'success', text: 'تم حفظ إعدادات الحضور.' } : { type: 'error', text: 'تعذر الحفظ.' });
    setSaving(false);
  };

  const labels: Record<string, string> = {
    attendance_default_status: 'حالة الحضور الافتراضية',
    enable_late_status: 'تفعيل حالة التأخير (true/false)',
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>إعدادات الحضور والغياب</h2><p>تخصيص خيارات الحضور</p></div><Check size={22} color="#6d9293" /></div>
      <div className="settings-form">
        {settings.map((s) => (
          <label key={s.key}>{labels[s.key] || s.description}<input value={values[s.key] ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} /></label>
        ))}
        <button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? 'جارٍ الحفظ...' : <><Save size={17} /> حفظ</>}</button>
      </div>
    </div>
  );
}

/* ── Recitation Settings Section ── */
function RecitationSettingsSection({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('platform_settings').select('*').eq('category', 'recitation').order('key');
      setSettings((data ?? []) as PlatformSetting[]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: PlatformSetting) => { map[s.key] = s.value; });
      setValues(map);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    let errors = 0;
    for (const s of settings) {
      const { error } = await supabase.rpc('admin_update_setting', { p_key: s.key, p_value: values[s.key] ?? '' });
      if (error) errors++;
    }
    setNotice(errors === 0 ? { type: 'success', text: 'تم حفظ إعدادات التسميع.' } : { type: 'error', text: 'تعذر الحفظ.' });
    setSaving(false);
  };

  const labels: Record<string, string> = {
    recitation_pass_threshold: 'حد الأخطاء المسموح',
    enable_hesitations_tracking: 'تتبع الترددات (true/false)',
    enable_revision_flag: 'تحديد السور للمراجعة (true/false)',
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>إعدادات التسميع</h2><p>إعدادات الأخطاء والترددات والإعادة</p></div><FileText size={22} color="#6d9293" /></div>
      <div className="settings-form">
        {settings.map((s) => (
          <label key={s.key}>{labels[s.key] || s.description}<input value={values[s.key] ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} /></label>
        ))}
        <button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? 'جارٍ الحفظ...' : <><Save size={17} /> حفظ</>}</button>
      </div>
    </div>
  );
}

/* ── Roles Settings Section ── */
function RolesSettingsSection({ setNotice: _setNotice }: { setNotice: (n: Notice) => void }) {
  const roles: { name: string; desc: string; perms: string[] }[] = [
    { name: 'مدير النظام', desc: 'صلاحيات كاملة على جميع أجزاء النظام', perms: ['إنشاء وتعديل الحسابات', 'إدارة الطلاب والحلقات', 'إنشاء وإدارة أيام السرد', 'توزيع الطلاب على المعلمين', 'عرض جميع التقارير والسجل', 'تعديل إعدادات النظام'] },
    { name: 'معلم', desc: 'صلاحيات محدودة على الجلسات المسندة إليه', perms: ['عرض الجلسات المسندة إليه', 'تسجيل الحضور والغياب', 'تسجيل التسميع والأخطاء', 'عرض ملفات الطلاب المسندين', 'لا يمكنه تعديل بيانات اليوم'] },
    { name: 'مشرف', desc: 'صلاحيات متابعة وإشراف قابلة للتخصيص', perms: ['متابعة الإحصائيات', 'متابعة الطلاب والمعلمين', 'عرض التقارير', 'صلاحيات قابلة للتخصيص من المدير'] },
  ];

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>الأدوار والصلاحيات</h2><p>الأدوار المتاحة في النظام وصلاحياتها</p></div><ShieldCheck size={22} color="#6d9293" /></div>
      <div className="roles-grid">
        {roles.map((r) => (
          <div className="role-card" key={r.name}>
            <h3>{r.name}</h3>
            <p>{r.desc}</p>
            <ul>{r.perms.map((p, i) => <li key={i}><Check size={14} /> {p}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Reports Settings Section ── */
function ReportsSettingsSection({ setNotice: _setNotice }: { setNotice: (n: Notice) => void }) {
  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>إعدادات التقارير والتصدير</h2><p>خيارات التصدير المتاحة</p></div><FileText size={22} color="#6d9293" /></div>
      <div className="settings-form">
        <label>صيغة التصدير الافتراضية<input value="PDF" readOnly /></label>
        <label>اتجاه التصدير<input value="من اليمين إلى اليسار (RTL)" readOnly /></label>
        <label>دعم اللغة العربية<input value="مفعّل" readOnly /></label>
      </div>
    </div>
  );
}

/* ── Audit Section ── */
function AuditSection({ setNotice: _setNotice }: { setNotice: (n: Notice) => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const [{ data: audit }, { data: profiles }] = await Promise.all([
        supabase.from('audit_history').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('profiles').select('id, display_name'),
      ]);
      setEntries((audit ?? []) as AuditEntry[]);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: { id: string; display_name: string }) => { map[p.id] = p.display_name; });
      setActors(map);
    })();
  }, []);

  const actionLabels: Record<string, string> = {
    create: 'إضافة', update: 'تعديل', status_change: 'تغيير حالة', role_change: 'تغيير دور',
    update_profile: 'تعديل حساب', assign_teacher: 'إسناد معلم', unassign_teacher: 'إلغاء إسناد معلم',
    assign_student: 'توزيع طالب', unassign_student: 'إزالة طالب', update_setting: 'تعديل إعداد',
  };
  const entityLabels: Record<string, string> = {
    student: 'طالب', user: 'مستخدم', session: 'يوم سرد', halqa: 'حلقة', setting: 'إعداد',
  };

  return (
    <div className="panel-card" style={{ padding: '22px' }}>
      <div className="panel-heading"><div><h2>سجل العمليات والأمان</h2><p>آخر 50 عملية في النظام</p></div><History size={22} color="#6d9293" /></div>
      <div className="audit-list">
        {entries.map((e) => (
          <div className="audit-row" key={e.id}>
            <Check size={16} />
            <div>
              <strong>{actionLabels[e.action] || e.action}</strong>
              <span>{entityLabels[e.entity_type] || e.entity_type} · {(e.actor_id ? actors[e.actor_id] : undefined) || 'النظام'}</span>
            </div>
            <time>{new Date(e.created_at).toLocaleString('ar-SA')}</time>
          </div>
        ))}
        {entries.length === 0 && <div className="empty-state">لا يوجد سجل عمليات.</div>}
      </div>
    </div>
  );
}
