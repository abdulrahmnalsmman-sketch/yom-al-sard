import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { uploadSiteImage } from '@/lib/siteMedia';
import type { SiteSettings } from '@/types';
import { EditableText } from '@/components/landing/EditableText';
import { PinGate } from '@/components/landing/PinGate';
import { SiteEditToolbar } from '@/components/landing/SiteEditToolbar';
import { LandingAbout, LandingFooter, LandingHero, LandingStats, type LiveStats } from '@/components/landing/LandingSections';
import '@/components/landing/landing.css';

type Notice = { type: 'success' | 'error'; text: string } | null;

function toPayload(s: SiteSettings) {
  return {
    platform_name: s.platform_name,
    platform_tagline: s.platform_tagline,
    logo_url: s.logo_url,
    primary_color: s.primary_color,
    accent_color: s.accent_color,
    header_color: s.header_color,
    sidebar_color: s.sidebar_color,
    page_background_color: s.page_background_color,
    card_color: s.card_color,
    font_family: s.font_family,
    hero_title: s.hero_title,
    hero_subtitle: s.hero_subtitle,
    hero_background_url: s.hero_background_url,
    about_title: s.about_title,
    about_text: s.about_text,
    primary_button_label: s.primary_button_label,
    secondary_button_label: s.secondary_button_label,
    footer_text: s.footer_text,
    stat_cards: s.stat_cards,
  };
}

export function LandingPage() {
  const { profile } = useAuth();
  const { settings, loading, error, setSettings } = useSiteSettings();
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previous, setPrevious] = useState<SiteSettings | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('public_site_stats');
      if (rpcError) {
        setNotice({ type: 'error', text: `تعذر تحميل الأرقام: ${rpcError.message}` });
        return;
      }
      setLiveStats(data as LiveStats);
    })();
  }, []);

  if (loading) {
    return <div className="auth-loading"><div className="loading-spinner" /><span>جارٍ تحميل الموقع...</span></div>;
  }
  if (error || !settings) {
    return <div className="auth-loading"><span>تعذر تحميل إعدادات الموقع: {error}</span></div>;
  }

  const isAdmin = profile?.role === 'admin';
  const view = editing && draft ? draft : settings;
  const editable = editing && !previewing;
  const dirty = editing && draft !== null && JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(settings));

  const patch = (change: Partial<SiteSettings>) => setDraft((d) => (d ? { ...d, ...change } : d));

  const startEditing = (unlockedPin: string) => {
    setPin(unlockedPin);
    setShowPinGate(false);
    setDraft(settings);
    setEditing(true);
    setNotice(null);
  };

  const exitEditing = () => {
    if (dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد الخروج دون حفظها؟')) return;
    setEditing(false);
    setDraft(null);
    setPreviewing(false);
    setNotice(null);
  };

  const persist = async (values: SiteSettings): Promise<boolean> => {
    if (!pin) return false;
    setSaving(true);
    setNotice(null);
    const { data, error: rpcError } = await supabase.rpc('admin_update_site_settings', {
      p_pin: pin,
      p_values: toPayload(values),
    });
    setSaving(false);
    if (rpcError) {
      setNotice({ type: 'error', text: `تعذر الحفظ: ${rpcError.message}` });
      return false;
    }
    if (!data) {
      setNotice({ type: 'error', text: 'تعذر الحفظ: لم يُرجع الخادم بيانات الإعدادات.' });
      return false;
    }
    const saved = data as SiteSettings;
    setSettings(saved);
    setDraft(saved);
    return true;
  };

  const save = async () => {
    if (!draft) return;
    const before = settings;
    const ok = await persist(draft);
    if (ok) {
      setPrevious(before);
      setNotice({ type: 'success', text: 'تم حفظ التغييرات في قاعدة البيانات.' });
    }
  };

  const undo = async () => {
    if (!previous) return;
    const ok = await persist(previous);
    if (ok) {
      setPrevious(null);
      setNotice({ type: 'success', text: 'تم التراجع عن آخر حفظ وتثبيت النسخة السابقة.' });
    }
  };

  const uploadImage = async (file: File, folder: 'logo' | 'hero', field: 'logo_url' | 'hero_background_url') => {
    if (!file.type.startsWith('image/')) {
      setNotice({ type: 'error', text: 'الملف المختار ليس صورة.' });
      return;
    }
    try {
      const url = await uploadSiteImage(file, folder);
      patch({ [field]: url } as Pick<SiteSettings, typeof field>);
      setNotice({ type: 'success', text: 'تم رفع الصورة. اضغط حفظ لتثبيتها في الموقع.' });
    } catch (err) {
      setNotice({ type: 'error', text: `تعذر رفع الصورة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}` });
    }
  };

  const cssVars = {
    '--brand-primary': view.primary_color,
    '--brand-accent': view.accent_color,
    '--brand-header': view.header_color,
    '--brand-sidebar': view.sidebar_color,
    '--brand-bg': view.page_background_color,
    '--brand-card': view.card_color,
    '--brand-font': view.font_family,
  } as React.CSSProperties;

  return (
    <div className={`landing ${editable ? 'is-editing' : ''}`} dir="rtl" style={cssVars} data-font={view.font_family}>
      <header className="landing-header">
        <div className="landing-brand">
          <img src={view.logo_url || '/images/yawm_alsard_2.png'} alt={view.platform_name} />
          <EditableText as="strong" value={view.platform_name} editing={editable} onChange={(v) => patch({ platform_name: v })} />
        </div>
        <nav className="landing-nav">
          {isAdmin && (
            <Link to="/admin" className="landing-link"><LayoutDashboard size={17} /> لوحة الإدارة</Link>
          )}
          {isAdmin && !editing && (
            <button type="button" className="landing-pill" onClick={() => setShowPinGate(true)}>
              <Pencil size={15} /> تعديل الموقع
            </button>
          )}
          {!profile && (
            <Link to="/login" className="landing-pill">{view.primary_button_label}</Link>
          )}
        </nav>
      </header>

      <LandingHero
        view={view}
        editable={editable}
        patch={patch}
        onUploadHero={(file) => void uploadImage(file, 'hero', 'hero_background_url')}
      />
      <LandingAbout view={view} editable={editable} patch={patch} />
      <LandingStats
        cards={view.stat_cards}
        liveStats={liveStats}
        editable={editable}
        onChange={(cards) => patch({ stat_cards: cards })}
      />
      <LandingFooter view={view} editable={editable} patch={patch} />

      {notice && <div className={`notice ${notice.type} landing-notice`}>{notice.text}</div>}

      {editing && (
        <SiteEditToolbar
          view={view}
          dirty={dirty}
          saving={saving}
          previewing={previewing}
          canUndo={previous !== null}
          onPatch={patch}
          onUploadLogo={(file) => void uploadImage(file, 'logo', 'logo_url')}
          onSave={() => void save()}
          onDiscard={() => { setDraft(settings); setNotice(null); }}
          onUndo={() => void undo()}
          onTogglePreview={() => setPreviewing((p) => !p)}
          onExit={exitEditing}
        />
      )}

      {showPinGate && <PinGate onUnlock={startEditing} onClose={() => setShowPinGate(false)} />}
    </div>
  );
}
