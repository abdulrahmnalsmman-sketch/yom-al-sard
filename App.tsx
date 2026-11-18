import { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate,
} from 'react-router-dom';
import {
  AlertCircle, BarChart3, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronLeft,
  Clock3, FileText, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search,
  ShieldCheck, Sparkles, UserPlus, Users, X, Settings, Upload, KeyRound, Eye,
  UserCog, FileSpreadsheet, FileText as FileTextIcon, AlertTriangle, Check, Pencil, Globe, Archive,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import type {
  Profile, QuranPortion, DayRecitationRow, Role, SessionStatus, Student,
  StudentEditHistory, Surah, UserAccessPermissions, YawmSession, PendingStudent,
} from '@/types';
import { SettingsManager as SettingsPanel } from '@/components/SettingsManager';
import { SessionDetailManager } from '@/components/SessionDetailManager';
import { StudentCurriculumManager } from '@/components/StudentCurriculumManager';
import { DeleteRecordButton, ArchiveStudentButton, RestoreStudentButton, PermanentDeleteStudentButton } from '@/components/DeleteRecordButton';
import { TeacherDashboard } from '@/components/TeacherDashboard';
import { TeacherHalqaReports } from '@/components/TeacherHalqaReports';
import { ReportsManager } from '@/components/ReportsManager';
import { LandingPage } from '@/components/landing/LandingPage';

type View = 'overview' | 'students' | 'archived' | 'sessions' | 'teachers' | 'reports' | 'recite' | 'users' | 'settings';
type Notice = { type: 'success' | 'error'; text: string } | null;

const statusLabels: Record<SessionStatus, string> = { scheduled: 'مجدولة', open: 'مفتوحة', closed: 'مغلقة' };
const roleLabels: Record<Role, string> = { admin: 'مدير النظام', teacher: 'معلم', supervisor: 'مشرف' };

const adminNav: { key: View; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { key: 'sessions', label: 'أيام السرد', icon: CalendarDays },
  { key: 'students', label: 'الطلاب', icon: Users },
  { key: 'archived', label: 'الطلاب المؤرشفون', icon: Archive },
  { key: 'teachers', label: 'المعلمون والمشرفون', icon: ShieldCheck },
  { key: 'users', label: 'إدارة المستخدمين', icon: UserCog },
  { key: 'reports', label: 'التقارير والسجل', icon: BarChart3 },
  { key: 'settings', label: 'الإعدادات', icon: Settings },
];

function App() {
  const { settings } = useSiteSettings();
  useEffect(() => {
    if (settings) document.title = settings.platform_name;
  }, [settings]);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<UnifiedLogin />} />
        <Route path="/site" element={<LandingPage />} />
        <Route path="/admin/*" element={<AdminGuard />} />
        <Route path="/supervisor/*" element={<SupervisorGuard />} />
        <Route path="/*" element={<TeacherGuard />} />
      </Routes>
    </BrowserRouter>
  );
}

/* ── Route Guards ────────────────────────────────────────────── */

function AdminGuard() {
  const { loading, profile, signOut } = useAuth();
  const location = useLocation();
  const [notice, setNotice] = useState<Notice>(null);

  if (loading) return <LoadingScreen />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role === 'teacher') return <Navigate to="/" replace />;
  if (profile.role === 'supervisor') return <Navigate to="/supervisor" replace />;
  if (!profile.is_active) return <BlockedScreen onLogout={() => void signOut()} />;

  return <AdminApp user={profile} notice={notice} setNotice={setNotice} key={location.pathname} />;
}

function SupervisorGuard() {
  const { loading, profile, signOut } = useAuth();
  const [notice, setNotice] = useState<Notice>(null);

  if (loading) return <LoadingScreen />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role === 'admin') return <Navigate to="/admin" replace />;
  if (profile.role === 'teacher') return <Navigate to="/" replace />;
  if (!profile.is_active) return <BlockedScreen onLogout={() => void signOut()} />;

  return <SupervisorApp user={profile} notice={notice} setNotice={setNotice} />;
}

function TeacherGuard() {
  const { loading, profile, signOut } = useAuth();
  const [notice, setNotice] = useState<Notice>(null);

  if (loading) return <LoadingScreen />;
  if (!profile) return <LandingPage />;
  if (profile.role === 'admin') return <Navigate to="/admin" replace />;
  if (profile.role === 'supervisor') return <Navigate to="/supervisor" replace />;
  if (!profile.is_active) return <BlockedScreen onLogout={() => void signOut()} />;

  return <TeacherApp user={profile} notice={notice} setNotice={setNotice} />;
}

/* ── Unified Login ───────────────────────────────────────────── */

function UnifiedLogin() {
  const { profile, signIn, loading } = useAuth();
  const { settings } = useSiteSettings();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const navigate = useNavigate();

  if (loading) return <LoadingScreen />;
  if (profile && profile.role === 'admin' && profile.is_active) return <Navigate to="/admin" replace />;
  if (profile && profile.role === 'teacher' && profile.is_active) return <Navigate to="/" replace />;
  if (profile && profile.role === 'supervisor' && profile.is_active) return <Navigate to="/supervisor" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setFormLoading(true);
    const { error, profile: prof } = await signIn(identifier, password);
    if (error) {
      setNotice({ type: 'error', text: error });
      setFormLoading(false);
      return;
    }
    if (prof && prof.is_active) {
      if (prof.role === 'admin') { navigate('/admin', { replace: true }); return; }
      if (prof.role === 'teacher') { navigate('/', { replace: true }); return; }
      if (prof.role === 'supervisor') { navigate('/supervisor', { replace: true }); return; }
    }
    setNotice({ type: 'error', text: 'هذا الحساب غير نشط.' });
    await supabase.auth.signOut();
    setFormLoading(false);
  };

  return (
    <div className="auth-page" dir="rtl">
      <AuthBrand />
      <div className="auth-card">
        <div className="auth-icon"><BookOpen size={23} /></div>
        <p className="auth-kicker">تسجيل الدخول</p>
        <h1>{settings?.platform_name}</h1>
        <p className="auth-subtitle">سجّل الدخول للوصول إلى مساحة العمل. يحدد النظام دورك تلقائيًا.</p>
        {notice && <NoticeBox notice={notice} />}
        <form onSubmit={submit}>
          <label>اسم المستخدم أو البريد الإلكتروني
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="اسم المستخدم أو name@example.com" required autoComplete="username" />
          </label>
          <label>كلمة المرور
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
          </label>
          <button className="primary-button auth-submit" disabled={formLoading}>
            {formLoading ? <><span className="button-spinner" /> جارٍ التحقق...</> : <>تسجيل الدخول <ChevronLeft size={17} /></>}
          </button>
        </form>
        <div className="auth-note"><ShieldCheck size={15} /> الدخول موحد لجميع المستخدمين</div>
      </div>
      <p className="auth-footer">حلقات الشيخين سعد وعبدالعزيز الموسى · فرع الرياض</p>
    </div>
  );
}

/* ── Shared UI helpers ───────────────────────────────────────── */

function AuthBrand() {
  const { settings } = useSiteSettings();
  return (
    <div className="auth-brand">
      <img src={settings?.logo_url || '/images/yawm_alsard_2.png'} alt={settings?.platform_name ?? ''} />
      <div>
        <strong>{settings?.platform_name}</strong>
        <span>{settings?.platform_tagline}</span>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return <div className="auth-loading"><div className="loading-spinner" /><span>جارٍ تجهيز المنصة...</span></div>;
}

function BlockedScreen({ onLogout }: { onLogout: () => void }) {
  return <div className="auth-loading"><AlertCircle size={25} color="#b17b36" /><h2>هذا الحساب غير نشط</h2><button className="text-button" onClick={onLogout}>تسجيل الخروج</button></div>;
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={`notice ${notice.type}`}><AlertCircle size={16} />{notice.text}</div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <section className="welcome-row page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</section>;
}

function InlineForm({ title, children, onSubmit, onCancel }: { title: string; children: React.ReactNode; onSubmit: (e: React.FormEvent) => void; onCancel: () => void }) {
  return <form className="inline-form panel-card" onSubmit={onSubmit}>
    <div className="form-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={onCancel}><X size={18} /></button></div>
    {children}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>إلغاء</button><button className="primary-button">حفظ</button></div>
  </form>;
}

/* ── App Frames ──────────────────────────────────────────────── */

function AdminApp({ user, notice, setNotice }: { user: Profile; notice: Notice; setNotice: (n: Notice) => void }) {
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const { signOut } = useAuth();
  return <AppFrame role="admin" user={user} view={view} setView={setView} mobileNav={mobileNav} setMobileNav={setMobileNav} notice={notice} setNotice={setNotice} onLogout={() => void signOut()}><AdminView view={view} user={user} setNotice={setNotice} setView={setView} /></AppFrame>;
}

function SupervisorApp({ user, notice, setNotice }: { user: Profile; notice: Notice; setNotice: (n: Notice) => void }) {
  const [view, setView] = useState<View>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [perms, setPerms] = useState<UserAccessPermissions | null>(null);
  const { signOut } = useAuth();
  useEffect(() => {
    void supabase.from('user_access_permissions').select('*').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => setPerms(data as UserAccessPermissions | null));
  }, [user.id]);
  const nav = adminNav.filter((item) => {
    if (item.key === 'settings' || item.key === 'users' || item.key === 'archived') return false;
    if (item.key === 'teachers') return perms?.can_manage_users ?? false;
    if (item.key === 'reports') return perms?.can_view_reports ?? false;
    if (item.key === 'sessions') return perms?.can_view_halqat ?? false;
    if (item.key === 'students') return perms?.can_view_students ?? false;
    return true;
  });
  return <AppFrame role="supervisor" user={user} view={view} setView={setView} mobileNav={mobileNav} setMobileNav={setMobileNav} notice={notice} setNotice={setNotice} onLogout={() => void signOut()} nav={nav}><SupervisorView view={view} user={user} setNotice={setNotice} perms={perms} setView={setView} /></AppFrame>;
}

function TeacherApp({ user, notice, setNotice }: { user: Profile; notice: Notice; setNotice: (n: Notice) => void }) {
  const [view, setView] = useState<View>('recite');
  const [mobileNav, setMobileNav] = useState(false);
  const { signOut } = useAuth();
  return <AppFrame role="teacher" user={user} view={view} setView={setView} mobileNav={mobileNav} setMobileNav={setMobileNav} notice={notice} setNotice={setNotice} onLogout={() => void signOut()}><TeacherView view={view} user={user} setNotice={setNotice} setView={setView} /></AppFrame>;
}

function TeacherView({ view, user, setNotice }: { view: View; user: Profile; setNotice: (n: Notice) => void; setView: (v: View) => void }) {
  if (view === 'reports') return <TeacherHalqaReports user={user} setNotice={setNotice} />;
  return <TeacherDashboard user={user} setNotice={setNotice} />;
}

function AppFrame({ children, role, user, view, setView, mobileNav, setMobileNav, notice, setNotice, onLogout, nav }: {
  children: React.ReactNode; role: Role; user: Profile; view: View; setView: (v: View) => void; mobileNav: boolean; setMobileNav: (o: boolean) => void; notice: Notice; setNotice: (n: Notice) => void; onLogout: () => void; nav?: { key: View; label: string; icon: typeof LayoutDashboard }[];
}) {
  const { settings } = useSiteSettings();
  const cssVars = settings ? {
    '--brand-primary': settings.primary_color,
    '--brand-accent': settings.accent_color,
    '--brand-header': settings.header_color,
    '--brand-sidebar': settings.sidebar_color,
    '--brand-bg': settings.page_background_color,
    '--brand-card': settings.card_color,
    '--brand-font': settings.font_family,
  } as React.CSSProperties : undefined;
  const teacherNav: { key: View; label: string; icon: typeof LayoutDashboard }[] = [{ key: 'recite', label: 'التسميع', icon: BookOpen }, { key: 'reports', label: 'تقارير الحلقة', icon: BarChart3 }];
  const items = nav ?? (role === 'admin' ? adminNav : teacherNav);
  return <div className="app-shell" dir="rtl" style={cssVars} data-font={settings?.font_family}>
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <img src={settings?.logo_url || '/images/yawm_alsard_2.png'} alt={settings?.platform_name ?? ''} className="brand-mark" />
        <div><strong>{settings?.platform_name}</strong><span>{role === 'admin' ? 'لوحة مدير النظام' : role === 'supervisor' ? 'لوحة المشرف' : 'بوابة المعلم'}</span></div>
        <button className="close-menu" onClick={() => setMobileNav(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
      </div>
      <div className="sidebar-rule" />
      <p className="menu-label">{role === 'admin' ? 'الإدارة والتحكم' : role === 'supervisor' ? 'متابعة وإشراف' : 'مساحتي التعليمية'}</p>
      <nav className="main-nav">
        {items.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${view === key ? 'active' : ''}`} onClick={() => { setView(key); setMobileNav(false); }}><Icon size={19} /><span>{label}</span></button>)}
        {role === 'admin' && <Link to="/site" className="nav-item"><Globe size={19} /><span>معاينة الموقع وتعديله</span></Link>}
      </nav>
      <div className="sidebar-bottom">
        <div className="support-card">
          <div className="support-icon"><Sparkles size={18} /></div>
          <div><strong>{role === 'admin' ? 'إدارة آمنة وموثوقة' : role === 'supervisor' ? 'متابعة دائمة' : 'بارك الله في جهودكم'}</strong><p>{role === 'admin' ? 'كل تغيير محفوظ في السجل' : role === 'supervisor' ? 'إحصائيات ومتابعة' : 'كل تسميع يصنع أثرًا'}</p></div>
        </div>
        <div className="user-card">
          <div className="avatar">{user.display_name.charAt(0)}</div>
          <div><strong>{user.display_name}</strong><span>{roleLabels[role]}</span></div>
          <button onClick={onLogout} aria-label="تسجيل الخروج"><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar">
        <button className="menu-trigger" onClick={() => setMobileNav(true)} aria-label="فتح القائمة"><Menu size={22} /></button>
        <div className="topbar-logos">
          <img src="/images/IMG-20260824-WA0009.jpg" alt="شعار حلقات الشيخين سعد وعبدالعزيز الموسى" className="institution-logo" />
          <div className="logo-divider" />
          <img src="/images/yawm_alsard_2.png" alt="شعار يوم السرد" className="platform-logo" />
        </div>
        <div className="topbar-actions">
          <button className="icon-button notification" aria-label="الإشعارات" onClick={() => setNotice({ type: 'success', text: 'لا توجد إشعارات جديدة.' })}><Bell size={20} /></button>
          <div className="top-avatar">{user.display_name.charAt(0)}</div>
        </div>
      </header>
      <div className="page-content">
        {notice && <div className="page-notice"><NoticeBox notice={notice} /></div>}
        {children}
      </div>
    </main>
  </div>;
}

/* ── Admin Views ─────────────────────────────────────────────── */

function AdminView({ view, user, setNotice, setView }: { view: View; user: Profile; setNotice: (n: Notice) => void; setView: (v: View) => void }) {
  if (view === 'students') return <StudentsManager setNotice={setNotice} />;
  if (view === 'archived') return <ArchivedStudentsManager setNotice={setNotice} />;
  if (view === 'sessions') return <SessionsManager setNotice={setNotice} />;
  if (view === 'teachers') return <TeachersManager setNotice={setNotice} />;
  if (view === 'users') return <UsersManager setNotice={setNotice} />;
  if (view === 'reports') return <ReportsManager setNotice={setNotice} />;
  if (view === 'settings') return <SettingsPanel setNotice={setNotice} />;
  return <AdminOverview user={user} setNotice={setNotice} setView={setView} />;
}

function AdminOverview({ user, setNotice, setView }: { user: Profile; setNotice: (n: Notice) => void; setView: (v: View) => void }) {
  const [stats, setStats] = useState({ students: 0, teachers: 0, supervisors: 0, sessions: 0, recitations: 0, revisions: 0 });
  const [liveDay, setLiveDay] = useState<{ name: string; done: number; notReady: number; repeat: number; juzAchieved: number; targetJuz: number } | null>(null);

  const loadStats = useCallback(async () => {
    const [{ count: students }, { count: teachers }, { count: supervisors }, { count: sessions }, { count: recitations }, { count: revisions }] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_active', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'supervisor').eq('is_active', true),
      supabase.from('yawm_sessions').select('*', { count: 'exact', head: true }),
      supabase.from('recitation_entries').select('*', { count: 'exact', head: true }),
      supabase.from('recitation_entries').select('*', { count: 'exact', head: true }).eq('status', 'repeat'),
    ]);
    setStats({ students: students ?? 0, teachers: teachers ?? 0, supervisors: supervisors ?? 0, sessions: sessions ?? 0, recitations: recitations ?? 0, revisions: revisions ?? 0 });
  }, []);

  const loadLiveDay = useCallback(async () => {
    const { data: openSession } = await supabase
      .from('yawm_sessions')
      .select('id,name,target_juz')
      .eq('status', 'open')
      .order('session_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!openSession) { setLiveDay(null); return; }
    const { data: entries } = await supabase
      .from('recitation_entries')
      .select('status,faces_recited')
      .eq('session_id', (openSession as { id: string }).id);
    const rows = (entries ?? []) as { status: string; faces_recited: number | null }[];
    const done = rows.filter((r) => r.status === 'done').length;
    const notReady = rows.filter((r) => r.status === 'not_ready').length;
    const repeat = rows.filter((r) => r.status === 'repeat').length;
    const totalFaces = rows.filter((r) => r.status === 'done').reduce((sum, r) => sum + (r.faces_recited ? Number(r.faces_recited) : 0), 0);
    const juzAchieved = totalFaces / 20;
    const s = openSession as { name: string; target_juz: number };
    setLiveDay({ name: s.name, done, notReady, repeat, juzAchieved, targetJuz: s.target_juz ?? 0 });
  }, []);

  useEffect(() => {
    void loadStats();
    void loadLiveDay();
    // Realtime: refresh when recitation_entries change
    const channel = supabase
      .channel('admin-overview-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recitation_entries' }, () => {
        void loadLiveDay();
        void loadStats();
      })
      .subscribe();
    // Fallback polling every 5 seconds
    const interval = setInterval(() => { void loadLiveDay(); }, 5000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [loadStats, loadLiveDay]);

  const achievementPct = liveDay && liveDay.targetJuz > 0 ? Math.min(100, (liveDay.juzAchieved / liveDay.targetJuz) * 100) : 0;

  return <>
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> لوحة التحكم · اليوم</div>
        <h1>مرحبًا <em>{user.display_name}</em></h1>
        <p>إليك ملخص إدارة حلقات يوم السرد وأحدث مؤشراتها.</p>
      </div>
      <button className="primary-button" onClick={() => setView('sessions')}><Plus size={19} /> إنشاء يوم همة</button>
    </section>
    <section className="stats-grid">
      <Stat label="إجمالي الطلاب" value={stats.students} icon={<Users size={19} />} tone="gold" />
      <Stat label="المعلمون النشطون" value={stats.teachers} icon={<ShieldCheck size={19} />} tone="teal" />
      <Stat label="المشرفون" value={stats.supervisors} icon={<Eye size={19} />} tone="sky" />
      <Stat label="أيام السرد" value={stats.sessions} icon={<CalendarDays size={19} />} tone="sand" />
    </section>

    {liveDay && (
      <section className="panel-card live-day-card">
        <div className="live-day-header">
          <div><span className="eyebrow-small">يوم جارٍ الآن</span><h2>{liveDay.name}</h2></div>
          <span className="live-pill"><i /> مباشر</span>
        </div>
        <div className="live-day-stats">
          <div className="live-stat"><strong>{liveDay.done}</strong><span>تم</span></div>
          <div className="live-stat"><strong>{liveDay.notReady}</strong><span>غير جاهز</span></div>
          <div className="live-stat"><strong>{liveDay.repeat}</strong><span>إعادة</span></div>
          {liveDay.targetJuz > 0 && <div className="live-stat"><strong>{liveDay.targetJuz}</strong><span>المستهدف (جزء)</span></div>}
          {liveDay.targetJuz > 0 && <div className="live-stat"><strong>{liveDay.juzAchieved.toFixed(2)}</strong><span>المنجز (جزء)</span></div>}
        </div>
        {liveDay.targetJuz > 0 && (
          <div className="live-day-progress">
            <div className="progress-info"><span>نسبة إنجاز المستهدف العام</span><span>{achievementPct.toFixed(0)}%</span></div>
            <div className="progress-track"><span style={{ width: `${achievementPct}%` }} /></div>
            <div className="progress-info" style={{ marginTop: '6px' }}><span>المتبقي: {(liveDay.targetJuz - liveDay.juzAchieved).toFixed(1)} جزء</span><span>{liveDay.juzAchieved.toFixed(1)} / {liveDay.targetJuz}</span></div>
          </div>
        )}
      </section>
    )}

    <section className="admin-quick-grid">
      <QuickAction icon={<UserPlus size={20} />} label="إضافة طالب" onClick={() => setView('students')} />
      <QuickAction icon={<ShieldCheck size={20} />} label="إضافة معلم" onClick={() => setView('users')} />
      <QuickAction icon={<CalendarDays size={20} />} label="إدارة أيام السرد" onClick={() => setView('sessions')} />
      <QuickAction icon={<BarChart3 size={20} />} label={`المراجعات المطلوبة (${stats.revisions})`} onClick={() => setView('reports')} />
    </section>
    <section className="content-grid"><RecentSessions setNotice={setNotice} /><RecentAudit /></section>
  </>;
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}>{icon}</div></div>
    <strong>{value.toLocaleString('ar-SA')}</strong>
    <div className="stat-trend stable"><span>بيانات محفوظة</span><small>مباشرة من النظام</small></div>
  </article>;
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span>{icon}</span><strong>{label}</strong><ChevronLeft size={16} /></button>;
}

function RecentSessions({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [sessions, setSessions] = useState<YawmSession[]>([]);
  useEffect(() => { void supabase.from('yawm_sessions').select('id,name,session_date,start_time,end_time,status').is('archived_at', null).order('session_date', { ascending: true }).limit(5).then(({ data }) => setSessions((data ?? []) as YawmSession[])); }, []);
  return <div className="sessions-panel panel-card">
    <div className="panel-heading">
      <div><h2>أيام السرد الأخيرة</h2><p>تحديث مباشر من قاعدة البيانات</p></div>
      <button className="text-button" onClick={() => setNotice({ type: 'success', text: 'يمكنك إدارة التفاصيل من تبويب أيام السرد.' })}>إدارة الأيام <ChevronLeft size={16} /></button>
    </div>
    <div className="session-list">
      {sessions.map((item) => <div className="session-row" key={item.id}>
        <div className="session-date"><span>{new Date(item.session_date).toLocaleDateString('ar-SA', { weekday: 'short' })}</span><strong>{new Date(item.session_date).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}</strong></div>
        <div className="session-info"><strong>{item.name}</strong><span>{item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}</span></div>
        <span className={`status ${item.status === 'open' ? 'next' : item.status === 'closed' ? 'done' : 'planned'}`}><i />{statusLabels[item.status]}</span>
      </div>)}
      {sessions.length === 0 && <div className="empty-state">لم يتم إنشاء أيام سرد بعد.</div>}
    </div>
  </div>;
}

function RecentAudit() {
  const [items, setItems] = useState<{ id: string; action: string; entity_type: string; created_at: string }[]>([]);
  useEffect(() => { void supabase.from('audit_history').select('id,action,entity_type,created_at').order('created_at', { ascending: false }).limit(5).then(({ data }) => setItems(data ?? [])); }, []);
  return <div className="calendar-card panel-card">
    <div className="panel-heading"><div><h2>آخر التغييرات</h2><p>سجل التدقيق الإداري</p></div><ShieldCheck size={20} color="#6d9293" /></div>
    {items.map((item) => <div className="audit-row" key={item.id}>
      <CheckCircle2 size={16} />
      <div><strong>{item.action === 'create' ? 'إضافة' : item.action === 'update' ? 'تعديل' : item.action === 'role_change' ? 'تغيير دور' : item.action === 'update_profile' ? 'تعديل حساب' : 'تغيير حالة'}</strong><span>{item.entity_type === 'student' ? 'طالب' : item.entity_type === 'user' ? 'مستخدم' : 'يوم سرد'}</span></div>
      <time>{new Date(item.created_at).toLocaleDateString('ar-SA')}</time>
    </div>)}
    {items.length === 0 && <div className="empty-state">سيظهر سجل العمليات هنا.</div>}
  </div>;
}

/* ── Students Manager with Import ────────────────────────────── */

function StudentsManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('students').select('*').order('name');
    if (error) setNotice({ type: 'error', text: 'تعذر تحميل الطلاب.' });
    else setStudents((data ?? []) as Student[]);
  };
  useEffect(() => { void load(); }, []);
  const filtered = students.filter((s) => s.is_active).filter((s) => s.name.includes(query) || (s.internal_id ?? '').includes(query) || (s.halqa ?? '').includes(query));

  if (selectedStudent) return <StudentProfile student={selectedStudent} onBack={() => { setSelectedStudent(null); void load(); }} setNotice={setNotice} />;
  if (showImport) return <StudentImport onBack={() => setShowImport(false)} onDone={() => { setShowImport(false); void load(); }} setNotice={setNotice} />;

  return <>
    <PageHeading eyebrow="إدارة الطلاب" title="الطلاب" subtitle="ملفات الطلاب ومعلومات الالتحاق محفوظة بشكل دائم." action={
      <div className="action-row">
        <button className="secondary-button" onClick={() => setShowImport(true)}><Upload size={18} /> استيراد من ملف</button>
        <button className="primary-button" onClick={() => { setEditingStudent(null); setShowForm(true); }}><Plus size={18} /> إضافة طالب</button>
      </div>
    } />
    {showForm && <StudentForm student={editingStudent} onCancel={() => setShowForm(false)} onSave={async () => { setShowForm(false); await load(); }} setNotice={setNotice} />}
    <div className="manager-toolbar">
      <div className="search-box manager-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن طالب..." /></div>
      <span>{filtered.length} طالب</span>
    </div>
    <div className="data-table panel-card">
      <div className="table-head student-table-head"><span>اسم الطالب</span><span>المعرف</span><span>الحلقة</span><span>المقرر</span><span>الحالة</span><span /></div>
      {filtered.map((student) => <div className="table-row student-table-row" key={student.id} onClick={() => setSelectedStudent(student)} style={{ cursor: 'pointer' }}>
        <strong>{student.name}</strong>
        <span>{student.internal_id || '—'}</span>
        <span>{student.halqa || '—'}</span>
        <span>{student.current_portion || '—'}</span>
        <span className={`status ${student.is_active ? 'done' : 'planned'}`}><i />{student.is_active ? 'نشط' : 'مؤرشف'}</span>
        <div className="row-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {student.is_active && <button className="row-more" onClick={(e) => { e.stopPropagation(); setEditingStudent(student); setShowForm(true); }}><Pencil size={15} /></button>}
          {student.is_active && <ArchiveStudentButton studentId={student.id} studentName={student.name} onDone={() => void load()} setNotice={setNotice} />}
          <PermanentDeleteStudentButton studentId={student.id} studentName={student.name} onDone={() => void load()} setNotice={setNotice} />
        </div>
      </div>)}
      {filtered.length === 0 && <div className="empty-state">لا يوجد طلاب مطابقون.</div>}
    </div>
  </>;
}

function ArchivedStudentsManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('students').select('*').eq('is_active', false).order('name');
    if (error) setNotice({ type: 'error', text: 'تعذر تحميل الطلاب المؤرشفين.' });
    else setStudents((data ?? []) as Student[]);
  };
  useEffect(() => { void load(); }, []);

  if (selectedStudent) return <StudentProfile student={selectedStudent} onBack={() => { setSelectedStudent(null); void load(); }} setNotice={setNotice} />;

  const filtered = students.filter((s) => s.name.includes(query) || (s.internal_id ?? '').includes(query) || (s.halqa ?? '').includes(query));

  return <>
    <PageHeading eyebrow="إدارة الطلاب" title="الطلاب المؤرشفون" subtitle="الطلاب المؤرشفون لا يظهرون في القوائم النشطة، ويمكن استرجاعهم في أي وقت." />
    <div className="manager-toolbar">
      <div className="search-box manager-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الأرشيف..." /></div>
      <span>{filtered.length} طالب</span>
    </div>
    <div className="data-table panel-card">
      <div className="table-head student-table-head"><span>اسم الطالب</span><span>المعرف</span><span>الحلقة</span><span>المقرر</span><span>الحالة</span><span /></div>
      {filtered.map((student) => <div className="table-row student-table-row" key={student.id} onClick={() => setSelectedStudent(student)} style={{ cursor: 'pointer' }}>
        <strong>{student.name}</strong>
        <span>{student.internal_id || '—'}</span>
        <span>{student.halqa || '—'}</span>
        <span>{student.current_portion || '—'}</span>
        <span className="status planned"><i />مؤرشف</span>
        <div className="row-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <RestoreStudentButton studentId={student.id} studentName={student.name} onDone={() => void load()} setNotice={setNotice} />
          <PermanentDeleteStudentButton studentId={student.id} studentName={student.name} onDone={() => void load()} setNotice={setNotice} />
        </div>
      </div>)}
      {filtered.length === 0 && <div className="empty-state">{students.length === 0 ? 'لا يوجد طلاب مؤرشفون.' : 'لا توجد نتائج مطابقة.'}</div>}
    </div>
  </>;
}

function StudentForm({ student, onCancel, onSave, setNotice }: { student: Student | null; onCancel: () => void; onSave: () => void; setNotice: (n: Notice) => void }) {
  const [name, setName] = useState(student?.name ?? '');
  const [internalId, setInternalId] = useState(student?.internal_id ?? '');
  const [halqa, setHalqa] = useState(student?.halqa ?? '');
  const [portion, setPortion] = useState(student?.current_portion ?? '');
  const [notes, setNotes] = useState(student?.notes ?? '');
  const [isActive, setIsActive] = useState(student?.is_active ?? true);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    if (student) {
      const { error } = await supabase.rpc('admin_update_student', {
        p_id: student.id, p_name: name, p_basic_info: notes, p_is_active: isActive,
        p_internal_id: internalId || null, p_halqa: halqa || null,
        p_current_portion: portion || null, p_notes: notes || null,
      });
      if (error) setNotice({ type: 'error', text: 'تعذر تعديل الطالب.' });
      else { setNotice({ type: 'success', text: 'تم تعديل بيانات الطالب.' }); onSave(); }
    } else {
      const { error } = await supabase.rpc('admin_create_student', {
        p_name: name, p_basic_info: notes, p_enrollment_date: new Date().toISOString().slice(0, 10),
        p_internal_id: internalId || null, p_halqa: halqa || null,
        p_current_portion: portion || null, p_notes: notes || null,
      });
      if (error) setNotice({ type: 'error', text: 'تعذر إضافة الطالب.' });
      else { setNotice({ type: 'success', text: 'تمت إضافة الطالب بنجاح.' }); onSave(); }
    }
    setLoading(false);
  };

  return <InlineForm title={student ? 'تعديل بيانات طالب' : 'إضافة طالب جديد'} onSubmit={submit} onCancel={onCancel}>
    <label>اسم الطالب<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
    <div className="form-grid">
      <label>المعرف الداخلي (اختياري)<input value={internalId} onChange={(e) => setInternalId(e.target.value)} placeholder="مثال: 1024" /></label>
      <label>الحلقة (اختياري)<input value={halqa} onChange={(e) => setHalqa(e.target.value)} placeholder="مثال: حلقة الفجر" /></label>
      <label>المقرر الحالي (اختياري)<input value={portion} onChange={(e) => setPortion(e.target.value)} placeholder="مثال: الجزء الثلاثون" /></label>
    </div>
    <label>ملاحظات<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="ملاحظات إضافية" className="form-textarea" /></label>
    {student && <label className="check-field"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> الطالب نشط</label>}
    <button type="submit" className="primary-button" disabled={loading} style={{ display: 'none' }}>{loading ? 'جارٍ الحفظ...' : 'حفظ'}</button>
  </InlineForm>;
}

/* ── Student Profile ─────────────────────────────────────────── */

function StudentProfile({ student, onBack, setNotice }: { student: Student; onBack: () => void; setNotice: (n: Notice) => void }) {
  const [history, setHistory] = useState<StudentEditHistory[]>([]);
  useEffect(() => {
    void supabase.from('student_edit_history').select('*').eq('student_id', student.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setHistory((data ?? []) as StudentEditHistory[]));
  }, [student.id]);

  return <>
    <PageHeading eyebrow="ملف الطالب" title={student.name} subtitle="الملف الكامل للطالب والمقررات وسجل التعديلات." action={<button className="secondary-button" onClick={onBack}><ChevronLeft size={17} /> العودة للقائمة</button>} />
    <div className="content-grid">
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>بيانات الطالب</h2><p>المعلومات المسجلة في النظام</p></div></div>
        <div className="profile-grid">
          <div className="profile-item"><span>الاسم</span><strong>{student.name}</strong></div>
          <div className="profile-item"><span>المعرف الداخلي</span><strong>{student.internal_id || '—'}</strong></div>
          <div className="profile-item"><span>الحلقة</span><strong>{student.halqa || '—'}</strong></div>
          <div className="profile-item"><span>المقرر الحالي</span><strong>{student.current_portion || '—'}</strong></div>
          <div className="profile-item"><span>تاريخ الالتحاق</span><strong>{new Date(student.enrollment_date).toLocaleDateString('ar-SA')}</strong></div>
          <div className="profile-item"><span>الحالة</span><strong className={`status ${student.is_active ? 'done' : 'planned'}`}><i />{student.is_active ? 'نشط' : 'غير نشط'}</strong></div>
          <div className="profile-item full"><span>ملاحظات</span><strong>{student.notes || student.basic_info || '—'}</strong></div>
        </div>
      </div>
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>سجل التعديلات</h2><p>تاريخ التغييرات على ملف الطالب</p></div></div>
        {history.map((h) => <div className="history-row" key={h.id}>
          <CheckCircle2 size={16} />
          <div><strong>{h.action === 'create' ? 'إنشاء' : h.action === 'curriculum_create' ? 'إنشاء مقرر' : h.action === 'update' ? 'تعديل' : h.action}</strong><span>{new Date(h.created_at).toLocaleString('ar-SA')}</span></div>
        </div>)}
        {history.length === 0 && <div className="empty-state">لا يوجد سجل تعديلات.</div>}
      </div>
    </div>
    <div style={{ marginTop: '15px' }}>
      <StudentCurriculumManager student={student} setNotice={setNotice} />
    </div>
  </>;
}

/* ── Student Import (Excel/Word/PDF) ────────────────────────── */

function StudentImport({ onBack, onDone, setNotice }: { onBack: () => void; onDone: () => void; setNotice: (n: Notice) => void }) {
  const [parsedStudents, setParsedStudents] = useState<PendingStudent[]>([]);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFile = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const names = await extractNamesFromFile(file);
      const existing = await supabase.from('students').select('name');
      const existingNames = new Set((existing.data ?? []).map((s: { name: string }) => s.name.trim()));
      const pending: PendingStudent[] = names.map((n) => ({
        ...n,
        is_duplicate: existingNames.has(n.name.trim()),
      }));
      setParsedStudents(pending);
    } catch {
      setNotice({ type: 'error', text: 'تعذر قراءة الملف. تأكد من صحة التنسيق.' });
    }
    setParsing(false);
  };

  const updateStudent = (index: number, changes: Partial<PendingStudent>) => {
    setParsedStudents((prev) => prev.map((s, i) => i === index ? { ...s, ...changes } : s));
  };

  const removeStudent = (index: number) => {
    setParsedStudents((prev) => prev.filter((_, i) => i !== index));
  };

  const saveAll = async () => {
    const valid = parsedStudents.filter((s) => s.name.trim().length >= 2 && !s.is_duplicate);
    if (valid.length === 0) { setNotice({ type: 'error', text: 'لا يوجد طلاب صالحون للاستيراد.' }); return; }
    let success = 0;
    for (const s of valid) {
      const { error } = await supabase.rpc('admin_create_student', {
        p_name: s.name, p_basic_info: s.notes || '', p_enrollment_date: new Date().toISOString().slice(0, 10),
        p_internal_id: s.internal_id || null, p_halqa: s.halqa || null,
        p_current_portion: s.current_portion || null, p_notes: s.notes || null,
      });
      if (!error) success++;
    }
    setNotice({ type: 'success', text: `تم استيراد ${success} طالب بنجاح.` });
    onDone();
  };

  return <>
    <PageHeading eyebrow="استيراد الطلاب" title="استيراد من ملف" subtitle="استورد أسماء الطلاب من ملف Excel أو Word أو PDF." action={<button className="secondary-button" onClick={onBack}><ChevronLeft size={17} /> العودة</button>} />
    {parsedStudents.length === 0 ? (
      <div className="panel-card import-drop-zone">
        <div className="import-icon"><Upload size={32} /></div>
        <h2>ارفع الملف هنا</h2>
        <p>الصيغ المدعومة: Excel (XLS, XLSX), Word (DOC, DOCX), PDF</p>
        <div className="import-formats">
          <span><FileSpreadsheet size={16} /> Excel</span>
          <span><FileTextIcon size={16} /> Word</span>
          <span><FileText size={16} /> PDF</span>
        </div>
        <label className="primary-button file-upload-label">
          <Upload size={18} /> اختيار ملف
          <input type="file" accept=".xls,.xlsx,.doc,.docx,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} style={{ display: 'none' }} />
        </label>
        {parsing && <div className="import-loading"><div className="loading-spinner" /><span>جارٍ قراءة الملف...</span></div>}
      </div>
    ) : (
      <>
        <div className="import-preview-header">
          <div><strong>{fileName}</strong><span>{parsedStudents.length} طالب مستخرج · {parsedStudents.filter((s) => s.is_duplicate).length} مكرر</span></div>
          <div className="action-row">
            <button className="secondary-button" onClick={() => setParsedStudents([])}>إلغاء</button>
            <button className="primary-button" onClick={() => void saveAll()}><Check size={18} /> حفظ الصالحين ({parsedStudents.filter((s) => !s.is_duplicate && s.name.trim().length >= 2).length})</button>
          </div>
        </div>
        <div className="data-table panel-card import-preview-table">
          <div className="table-head import-table-head"><span>الاسم</span><span>المعرف</span><span>الحلقة</span><span>المقرر</span><span>الحالة</span><span /></div>
          {parsedStudents.map((s, i) => <div className={`table-row import-table-row ${s.is_duplicate ? 'row-duplicate' : ''}`} key={i}>
            <input className="import-cell-input" value={s.name} onChange={(e) => updateStudent(i, { name: e.target.value, is_duplicate: false })} />
            <input className="import-cell-input" value={s.internal_id ?? ''} onChange={(e) => updateStudent(i, { internal_id: e.target.value })} placeholder="—" />
            <input className="import-cell-input" value={s.halqa ?? ''} onChange={(e) => updateStudent(i, { halqa: e.target.value })} placeholder="—" />
            <input className="import-cell-input" value={s.current_portion ?? ''} onChange={(e) => updateStudent(i, { current_portion: e.target.value })} placeholder="—" />
            <span className={`status ${s.is_duplicate ? 'planned' : 'done'}`}><i />{s.is_duplicate ? 'مكرر' : 'جديد'}</span>
            <button className="row-more" onClick={() => removeStudent(i)}><X size={15} /></button>
          </div>)}
        </div>
      </>
    )}
  </>;
}

async function extractNamesFromFile(file: File): Promise<PendingStudent[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return extractFromExcel(file);
  }
  if (name.endsWith('.doc') || name.endsWith('.docx')) {
    return extractFromWord(file);
  }
  if (name.endsWith('.pdf')) {
    return extractFromPdf(file);
  }
  throw new Error('Unsupported file type');
}

async function extractFromExcel(file: File): Promise<PendingStudent[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 'A' });
  const students: PendingStudent[] = [];
  for (const row of rows) {
    const values = Object.values(row).map((v) => String(v ?? '').trim()).filter(Boolean);
    if (values.length === 0) continue;
    const nameVal = values[0];
    if (nameVal && nameVal.length >= 2 && !isHeaderRow(nameVal)) {
      const student: PendingStudent = { name: nameVal, is_duplicate: false };
      for (const v of values.slice(1)) {
        if (looksLikePortion(v)) student.current_portion = v;
        else if (looksLikeGroup(v)) student.halqa = v;
        else if (/^\d+$/.test(v) && v.length <= 10) student.internal_id = v;
      }
      students.push(student);
    }
  }
  return students;
}

async function extractFromWord(file: File): Promise<PendingStudent[]> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return parseTextForNames(result.value);
}

async function extractFromPdf(file: File): Promise<PendingStudent[]> {
  const pdfjs = await import('pdfjs-dist');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return parseTextForNames(text);
}

function parseTextForNames(text: string): PendingStudent[] {
  const lines = text.split(/\n|,|;|\t/).map((l) => l.trim()).filter(Boolean);
  const students: PendingStudent[] = [];
  for (const line of lines) {
    if (line.length < 2 || isHeaderRow(line)) continue;
    const parts = line.split(/\s{2,}|\||\t/).map((p) => p.trim()).filter(Boolean);
    const student: PendingStudent = { name: parts[0], is_duplicate: false };
    for (const part of parts.slice(1)) {
      if (looksLikePortion(part)) student.current_portion = part;
      else if (looksLikeGroup(part)) student.halqa = part;
      else if (/^\d+$/.test(part) && part.length <= 10) student.internal_id = part;
    }
    students.push(student);
  }
  return students;
}

function isHeaderRow(text: string): boolean {
  const headers = ['الاسم', 'name', 'الطلاب', 'اسم', 'رقم', 'مقرر', 'حلقة'];
  return headers.some((h) => text.toLowerCase().includes(h.toLowerCase())) && text.length < 30;
}

function looksLikePortion(text: string): boolean {
  const keywords = ['جزء', 'سورة', 'جزء الثلاثون', 'الكهف', 'يوسف', 'النبأ', 'الملك', 'سور', 'آية', 'صفحة'];
  return keywords.some((k) => text.includes(k));
}

function looksLikeGroup(text: string): boolean {
  const keywords = ['حلقة', 'مجموعة', 'فوج', 'مجموعه'];
  return keywords.some((k) => text.includes(k));
}

/* ── Sessions Manager ────────────────────────────────────────── */

function SessionsManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [sessions, setSessions] = useState<YawmSession[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedSession, setSelectedSession] = useState<YawmSession | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('18:30');
  const [end, setEnd] = useState('20:00');
  const [targetJuz, setTargetJuz] = useState('');
  const [numHalqat, setNumHalqat] = useState('');
  const [dayNotes, setDayNotes] = useState('');
  const load = async () => { const { data } = await supabase.from('yawm_sessions').select('id,name,session_date,start_time,end_time,status,target_juz,num_halqat,notes').is('archived_at', null).order('session_date', { ascending: true }); setSessions((data ?? []) as YawmSession[]); };
  useEffect(() => { void load(); }, []);
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const { data, error } = await supabase.rpc('admin_create_session_full', {
      p_name: name, p_date: date, p_start: start, p_end: end,
      p_target_juz: parseFloat(targetJuz) || 0,
      p_num_halqat: parseInt(numHalqat) || 0,
      p_notes: dayNotes,
    });
    if (error || !data) setNotice({ type: 'error', text: 'تعذر إنشاء يوم السرد.' });
    else { setSessions((c) => [...c, data as YawmSession]); setShowForm(false); setName(''); setDayNotes(''); setNotice({ type: 'success', text: 'تم إنشاء يوم السرد.' }); }
  };
  const updateStatus = async (id: string, status: SessionStatus) => {
    const { data, error } = await supabase.rpc('admin_set_session_status', { p_id: id, p_status: status });
    if (error || !data) setNotice({ type: 'error', text: 'تعذر تحديث حالة اليوم.' });
    else { setSessions((c) => c.map((i) => i.id === id ? data as YawmSession : i)); setNotice({ type: 'success', text: `تم تغيير الحالة إلى ${statusLabels[status]}.` }); }
  };
  if (selectedSession) {
    return <SessionDetailManager session={selectedSession} onBack={() => { setSelectedSession(null); void load(); }} setNotice={setNotice} />;
  }
  return <>
    <PageHeading eyebrow="إدارة الأيام" title="أيام السرد" subtitle="أنشئ الأيام وافتحها للمعلمين وأغلقها عند انتهاء التسميع." action={<button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> إنشاء يوم همة</button>} />
    {showForm && <InlineForm title="إنشاء يوم سرد" onSubmit={add} onCancel={() => setShowForm(false)}>
      <label>اسم اليوم<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: يوم السرد الأسبوعي" required /></label>
      <div className="form-grid"><label>التاريخ<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label><label>وقت البداية<input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label><label>وقت النهاية<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label></div>
      <div className="form-grid"><label>المستهدف العام من أجزاء الطلاب<input type="number" min="0" step="0.01" value={targetJuz} onChange={(e) => setTargetJuz(e.target.value)} placeholder="يُحسب من مجموع مقررات الطلاب" /></label><label>عدد الحلقات<input type="number" value={numHalqat} onChange={(e) => setNumHalqat(e.target.value)} placeholder="عدد الحلقات" /></label></div>
      <label>ملاحظات<input value={dayNotes} onChange={(e) => setDayNotes(e.target.value)} placeholder="ملاحظات إضافية" /></label>
    </InlineForm>}
    <div className="session-management-grid">
      {sessions.map((item) => <article className="management-card panel-card" key={item.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedSession(item)}>
        <div className="management-card-top">
          <div className="session-date"><span>{new Date(item.session_date).toLocaleDateString('ar-SA', { weekday: 'short' })}</span><strong>{new Date(item.session_date).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}</strong></div>
          <span className={`status ${item.status === 'open' ? 'next' : item.status === 'closed' ? 'done' : 'planned'}`}><i />{statusLabels[item.status]}</span>
        </div>
        <h2>{item.name}</h2>
        <p><Clock3 size={14} /> {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}{item.target_juz ? ` · المستهدف العام: ${item.target_juz} جزء` : ''}{item.num_halqat ? ` · ${item.num_halqat} حلقة` : ''}</p>
        <div className="management-actions" onClick={(e) => e.stopPropagation()}>
          {item.status === 'scheduled' && <button className="small-action open-action" onClick={() => void updateStatus(item.id, 'open')}>فتح اليوم</button>}
          {item.status === 'open' && <button className="small-action close-action" onClick={() => void updateStatus(item.id, 'closed')}>إغلاق اليوم</button>}
          {item.status === 'closed' && <span className="closed-label"><CheckCircle2 size={14} /> محفوظ</span>}
          <button className="small-action" style={{ background: '#eaf3f2', color: '#024f63' }} onClick={() => setSelectedSession(item)}>إدارة التفاصيل <ChevronLeft size={13} /></button>
          <DeleteRecordButton kind="session" recordId={item.id} recordName={item.name} onDone={() => void load()} setNotice={setNotice} />
        </div>
      </article>)}
      {sessions.length === 0 && <div className="empty-state panel-card">لم يتم إنشاء أيام سرد بعد.</div>}
    </div>
  </>;
}

/* ── Teachers Manager (read-only list) ───────────────────────── */

function TeachersManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  useEffect(() => {
    void (async () => {
      const [{ data: tData }, { data: sData }] = await Promise.all([
        supabase.from('profiles').select('id,email,display_name,role,is_active,username').eq('role', 'teacher').order('display_name'),
        supabase.from('profiles').select('id,email,display_name,role,is_active,username').eq('role', 'supervisor').order('display_name'),
      ]);
      setTeachers((tData ?? []) as Profile[]);
      setSupervisors((sData ?? []) as Profile[]);
    })();
  }, []);
  return <>
    <PageHeading eyebrow="إدارة الصلاحيات" title="المعلمون والمشرفون" subtitle="إدارة الحسابات تتم من صفحة إدارة المستخدمين." action={null} />
    <div className="content-grid">
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>المعلمون</h2><p>{teachers.length} معلم</p></div><ShieldCheck size={20} color="#6d9293" /></div>
        {teachers.map((t) => <div className="history-row" key={t.id}>
          <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{t.display_name.charAt(0)}</div>
          <div><strong>{t.display_name}</strong><span>{t.username || t.email}</span></div>
          <span className={`status ${t.is_active ? 'done' : 'planned'}`}><i />{t.is_active ? 'نشط' : 'متوقف'}</span>
        </div>)}
        {teachers.length === 0 && <div className="empty-state">لا يوجد معلمون.</div>}
      </div>
      <div className="panel-card" style={{ padding: '22px' }}>
        <div className="panel-heading"><div><h2>المشرفون</h2><p>{supervisors.length} مشرف</p></div><Eye size={20} color="#6d9293" /></div>
        {supervisors.map((s) => <div className="history-row" key={s.id}>
          <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{s.display_name.charAt(0)}</div>
          <div><strong>{s.display_name}</strong><span>{s.username || s.email}</span></div>
          <span className={`status ${s.is_active ? 'done' : 'planned'}`}><i />{s.is_active ? 'نشط' : 'متوقف'}</span>
        </div>)}
        {supervisors.length === 0 && <div className="empty-state">لا يوجد مشرفون.</div>}
      </div>
    </div>
  </>;
}

/* ── Users Manager (create/edit/deactivate accounts) ────────── */

function UsersManager({ setNotice }: { setNotice: (n: Notice) => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [showPerms, setShowPerms] = useState<Profile | null>(null);
  const [showPwd, setShowPwd] = useState<Profile | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_list_users_with_last_signin');
    if (!error) setUsers((data ?? []) as Profile[]);
  };
  useEffect(() => { void load(); }, []);

  const toggleActive = async (user: Profile) => {
    if (user.is_active && !window.confirm(`هل تريد إيقاف حساب ${user.display_name}؟`)) return;
    const { error } = await supabase.rpc('admin_update_profile', { p_id: user.id, p_display_name: user.display_name, p_is_active: !user.is_active, p_username: user.username });
    if (error) setNotice({ type: 'error', text: 'تعذر تغيير حالة الحساب.' });
    else { setNotice({ type: 'success', text: user.is_active ? 'تم إيقاف الحساب.' : 'تم تنشيط الحساب.' }); void load(); }
  };

  const visibleUsers = users.filter((u) => {
    const matchesQuery = `${u.display_name} ${u.username ?? ''} ${u.email}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (roleFilter === 'all' || u.role === roleFilter) && (activeFilter === 'all' || (activeFilter === 'active' ? u.is_active : !u.is_active));
  });

  return <>
    <PageHeading eyebrow="إدارة المستخدمين" title="المستخدمون والصلاحيات" subtitle="إدارة الحسابات والأدوار والصلاحيات من مكان واحد." action={<button className="primary-button" onClick={() => { setEditingUser(null); setShowForm(true); }}><UserPlus size={18} /> إنشاء حساب</button>} />
    {showForm && <CreateUserForm onCancel={() => setShowForm(false)} onDone={() => { setShowForm(false); void load(); }} setNotice={setNotice} />}
    {editingUser && <EditUserForm user={editingUser} onCancel={() => setEditingUser(null)} onDone={() => { setEditingUser(null); void load(); }} setNotice={setNotice} />}
    {showPerms && <SupervisorPermissionsEditor supervisor={showPerms} onClose={() => { setShowPerms(null); void load(); }} setNotice={setNotice} />}
    {showPwd && <ChangePasswordForm user={showPwd} onClose={() => setShowPwd(null)} setNotice={setNotice} />}
    <div className="users-toolbar panel-card">
      <div className="search-box users-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو اسم المستخدم" /></div>
      <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}><option value="all">كل الأدوار</option><option value="admin">مدير النظام</option><option value="supervisor">مشرف</option><option value="teacher">معلم</option></select>
      <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'paused')}><option value="all">كل الحالات</option><option value="active">نشط</option><option value="paused">موقوف</option></select>
    </div>
    <div className="users-card-grid">
      {visibleUsers.map((u) => <article className="user-management-card panel-card" key={u.id}>
        <div className="user-card-header"><div className="avatar user-card-avatar">{u.display_name.charAt(0)}</div><div><h2>{u.display_name}</h2><span>{u.username || u.email}</span></div></div>
        <div className="user-badges"><span className={`role-badge ${u.role}`}>{roleLabels[u.role]}</span><span className={`state-badge ${u.is_active ? 'active' : 'paused'}`}><i />{u.is_active ? 'نشط' : 'موقوف'}</span></div>
        <p className="last-login">آخر دخول: {formatLastLogin(u.last_sign_in_at)}</p>
        {u.role !== 'admin' && <div className="user-card-actions">
          <button onClick={() => setEditingUser(u)}><Pencil size={15} /> تعديل</button>
          <button onClick={() => setShowPerms(u)}><Settings size={15} /> الصلاحيات</button>
          <button onClick={() => setShowPwd(u)}><KeyRound size={15} /> إعادة تعيين كلمة المرور</button>
          <button className="danger-action" onClick={() => void toggleActive(u)}><AlertTriangle size={15} /> {u.is_active ? 'إيقاف' : 'تفعيل'}</button>
          {u.role === 'teacher' && <DeleteRecordButton kind="teacher" recordId={u.id} recordName={u.display_name} onDone={() => void load()} setNotice={setNotice} />}
        </div>}
      </article>)}
      {visibleUsers.length === 0 && <div className="empty-state panel-card">لا توجد حسابات مطابقة للبحث.</div>}
    </div>
  </>;
}

function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return 'لم يسجل الدخول بعد';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return date.toLocaleDateString('ar', { day: 'numeric', month: 'short' }) + ' · ' + date.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

function CreateUserForm({ onCancel, onDone, setNotice }: { onCancel: () => void; onDone: () => void; setNotice: (n: Notice) => void }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'supervisor'>('teacher');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.functions.invoke('create-teacher', {
      body: { display_name: displayName, username, password, role },
    });
    if (error) {
      const body = await error.json?.().catch?.(() => ({}));
      setNotice({ type: 'error', text: body?.error || 'تعذر إنشاء الحساب.' });
    } else {
      setNotice({ type: 'success', text: 'تم إنشاء الحساب بنجاح.' });
      onDone();
    }
    setLoading(false);
  };

  return <InlineForm title="إنشاء حساب جديد" onSubmit={submit} onCancel={onCancel}>
    <label>الاسم الظاهر<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
    <label>اسم المستخدم (للدخول)<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="مثال: ahmad" required /></label>
    <label>كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="٦ أحرف على الأقل" required /></label>
    <label>الدور<select value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'supervisor')}><option value="teacher">معلم</option><option value="supervisor">مشرف</option></select></label>
    <button type="submit" className="primary-button" disabled={loading} style={{ display: 'none' }}>{loading ? 'جارٍ الإنشاء...' : 'إنشاء'}</button>
  </InlineForm>;
}

function EditUserForm({ user, onCancel, onDone, setNotice }: { user: Profile; onCancel: () => void; onDone: () => void; setNotice: (n: Notice) => void }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [username, setUsername] = useState(user.username ?? '');
  const [isActive, setIsActive] = useState(user.is_active);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.rpc('admin_update_profile', {
      p_id: user.id, p_display_name: displayName, p_is_active: isActive, p_username: username || null,
    });
    if (error) setNotice({ type: 'error', text: 'تعذر تعديل الحساب.' });
    else { setNotice({ type: 'success', text: 'تم تعديل الحساب.' }); onDone(); }
    setLoading(false);
  };

  return <InlineForm title={`تعديل حساب: ${user.display_name}`} onSubmit={submit} onCancel={onCancel}>
    <label>الاسم الظاهر<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
    <label>اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اتركه فارغًا للحذف" /></label>
    <label className="check-field"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> الحساب نشط</label>
    <button type="submit" className="primary-button" disabled={loading} style={{ display: 'none' }}>{loading ? 'جارٍ الحفظ...' : 'حفظ'}</button>
  </InlineForm>;
}

function SupervisorPermissionsEditor({ supervisor, onClose, setNotice }: { supervisor: Profile; onClose: () => void; setNotice: (n: Notice) => void }) {
  const permissionGroups = [
    { title: 'الطلاب', items: [['can_view_students', 'عرض'], ['can_add_students', 'إضافة'], ['can_edit_students', 'تعديل'], ['can_delete_students', 'حذف']] },
    { title: 'الحلقات', items: [['can_view_halqat', 'عرض'], ['can_add_halqat', 'إضافة'], ['can_edit_halqat', 'تعديل'], ['can_delete_halqat', 'حذف']] },
    { title: 'الحضور والتسميع', items: [['can_record_attendance', 'تسجيل'], ['can_edit_attendance', 'تعديل سجلات سابقة']] },
    { title: 'التقارير', items: [['can_view_reports', 'عرض'], ['can_export_reports', 'تصدير']] },
    { title: 'الرسوم', items: [['can_view_fees', 'عرض'], ['can_collect_fees', 'تحصيل']] },
    { title: 'المستخدمون', items: [['can_manage_users', 'إدارة الحسابات']] },
  ] as { title: string; items: [string, string][] }[];
  const keys = permissionGroups.flatMap((group) => group.items.map(([key]) => key));
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries(keys.map((key) => [key, false])));
  const [role, setRole] = useState<Role>(supervisor.role);
  const [scope, setScope] = useState<'all_halqat' | 'selected_halqat'>('all_halqat');
  const [halqat, setHalqat] = useState<{ id: string; name: string }[]>([]);
  const [selectedHalqat, setSelectedHalqat] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      supabase.from('user_access_permissions').select('*').eq('profile_id', supervisor.id).maybeSingle(),
      supabase.from('halqat').select('id,name').eq('is_active', true).order('name'),
    ]).then(([permissionResult, halqaResult]) => {
      const data = permissionResult.data as Record<string, unknown> | null;
      if (data) {
        setValues((prev) => Object.fromEntries(keys.map((key) => [key, Boolean(data[key])] )));
        setScope(data.access_scope === 'selected_halqat' ? 'selected_halqat' : 'all_halqat');
        setSelectedHalqat(Array.isArray(data.selected_halqat_ids) ? data.selected_halqat_ids as string[] : []);
      }
      setHalqat((halqaResult.data ?? []) as { id: string; name: string }[]);
    });
  }, [supervisor.id]);

  const save = async () => {
    setLoading(true);
    const { error } = await supabase.rpc('admin_save_user_access_permissions', { p_profile_id: supervisor.id, p_role: role, p_values: { ...values, access_scope: scope, selected_halqat_ids: selectedHalqat } });
    setLoading(false);
    if (error) setNotice({ type: 'error', text: 'تعذر حفظ الصلاحيات. حاول مرة أخرى.' });
    else { setNotice({ type: 'success', text: 'تم حفظ الصلاحيات.' }); onClose(); }
  };

  return <div className="bottom-sheet-backdrop" onClick={onClose}>
    <div className="permissions-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-handle" /><div className="sheet-header"><div><span className="eyebrow-small">إدارة الوصول</span><h2>صلاحيات {supervisor.display_name}</h2></div><button className="modal-close" onClick={onClose}><X size={18} /></button></div>
      <div className="permissions-sheet-content"><label>الدور<select value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="teacher">معلم</option><option value="supervisor">مشرف</option><option value="admin">مدير النظام</option></select></label>
        {permissionGroups.map((group) => <section className="permission-group" key={group.title}><h3>{group.title}</h3>{group.items.map(([key, label]) => <label className="permission-switch" key={key}><span>{label}<small>تحديد صلاحية {label} ضمن {group.title}</small></span><input type="checkbox" checked={values[key]} onChange={() => setValues((prev) => ({ ...prev, [key]: !prev[key] }))} /><i /></label>)}</section>)}
        <label>نطاق الوصول<select value={scope} onChange={(e) => setScope(e.target.value as 'all_halqat' | 'selected_halqat')}><option value="all_halqat">كل الحلقات</option><option value="selected_halqat">حلقات محددة</option></select></label>
        {scope === 'selected_halqat' && <div className="halqat-multi-select">{halqat.map((halqa) => <label key={halqa.id}><input type="checkbox" checked={selectedHalqat.includes(halqa.id)} onChange={() => setSelectedHalqat((ids) => ids.includes(halqa.id) ? ids.filter((id) => id !== halqa.id) : [...ids, halqa.id])} /> {halqa.name}</label>)}</div>}
      </div><div className="sheet-actions"><button className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={loading} onClick={() => void save()}>{loading ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}</button></div>
    </div>
  </div>;
}

function ChangePasswordForm({ user, onClose, setNotice }: { user: Profile; onClose: () => void; setNotice: (n: Notice) => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (newPassword.length < 6) { setNotice({ type: 'error', text: 'كلمة المرور قصيرة جدًا.' }); return; }
    setLoading(true);
    const { error } = await supabase.functions.invoke('create-teacher', {
      body: { action: 'change_password', target_id: user.id, new_password: newPassword },
    });
    if (error) setNotice({ type: 'error', text: 'تعذر تغيير كلمة المرور.' });
    else { setNotice({ type: 'success', text: 'تم تغيير كلمة المرور.' }); onClose(); }
    setLoading(false);
  };
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(380px, 100%)', textAlign: 'right' }}>
      <button className="modal-close" onClick={onClose}><X size={18} /></button>
      <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>تغيير كلمة المرور</h2>
      <p style={{ textAlign: 'center', color: '#889698', fontSize: '11px', marginBottom: '20px' }}>{user.display_name}</p>
      <label className="inline-form-label">كلمة المرور الجديدة<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} placeholder="٦ أحرف على الأقل" /></label>
      <button className="primary-button modal-action" onClick={() => void submit()} disabled={loading}>{loading ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}</button>
    </div>
  </div>;
}

/* ── Reports Manager is imported from @/components/ReportsManager ── */

/* ── Settings Manager ────────────────────────────────────────── */

/* SettingsManager is now imported from @/components/SettingsManager */

/* ── Supervisor View ─────────────────────────────────────────── */

function SupervisorView({ view, user, setNotice, perms, setView }: { view: View; user: Profile; setNotice: (n: Notice) => void; perms: UserAccessPermissions | null; setView: (v: View) => void }) {
  if (view === 'students' && (perms?.can_view_students ?? false)) return <StudentsManager setNotice={setNotice} />;
  if (view === 'sessions' && (perms?.can_view_halqat ?? false)) return <SessionsManager setNotice={setNotice} />;
  if (view === 'reports' && (perms?.can_view_reports ?? false)) return <ReportsManager setNotice={setNotice} />;
  return <SupervisorOverview user={user} perms={perms} />;
}

function SupervisorOverview({ user, perms }: { user: Profile; perms: UserAccessPermissions | null }) {
  const [stats, setStats] = useState({ students: 0, teachers: 0, sessions: 0, recitations: 0 });
  const loadStats = useCallback(async () => {
    const [{ count: students }, { count: teachers }, { count: sessions }, { count: recitations }] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_active', true),
      supabase.from('yawm_sessions').select('*', { count: 'exact', head: true }),
      supabase.from('recitation_entries').select('*', { count: 'exact', head: true }),
    ]);
    setStats({ students: students ?? 0, teachers: teachers ?? 0, sessions: sessions ?? 0, recitations: recitations ?? 0 });
  }, []);
  useEffect(() => {
    void loadStats();
    const channel = supabase.channel('supervisor-overview-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recitation_entries' }, () => void loadStats())
      .subscribe();
    const interval = setInterval(() => { void loadStats(); }, 5000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [loadStats]);
  return <>
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> لوحة المشرف · اليوم</div>
        <h1>مرحبًا <em>{user.display_name}</em></h1>
        <p>إليك ملخص متابعة حلقات يوم السرد.</p>
      </div>
    </section>
    <section className="stats-grid">
      {perms?.can_view_students && <Stat label="إجمالي الطلاب" value={stats.students} icon={<Users size={19} />} tone="gold" />}
      {perms?.can_manage_users && <Stat label="المعلمون النشطون" value={stats.teachers} icon={<ShieldCheck size={19} />} tone="teal" />}
      {perms?.can_view_halqat && <Stat label="أيام السرد" value={stats.sessions} icon={<CalendarDays size={19} />} tone="sky" />}
      {perms?.can_view_reports && <Stat label="التسميعات" value={stats.recitations} icon={<BookOpen size={19} />} tone="sand" />}
    </section>
  </>;
}

/* ── Teacher Views ───────────────────────────────────────────── */



export default App;
