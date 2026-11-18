import { Link } from 'react-router-dom';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import type { SiteSettings, StatCard, StatSource } from '@/types';
import { EditableText } from '@/components/landing/EditableText';

export type LiveStats = Record<StatSource, number>;
type Patch = (p: Partial<SiteSettings>) => void;

const sourceOptions: { value: StatSource | ''; label: string }[] = [
  { value: '', label: 'رقم يدوي' },
  { value: 'teachers', label: 'عدد المعلمين' },
  { value: 'students', label: 'عدد الطلاب' },
  { value: 'sessions', label: 'عدد أيام السرد' },
];

export function LandingHero({ view, editable, patch, onUploadHero }: {
  view: SiteSettings; editable: boolean; patch: Patch; onUploadHero: (file: File) => void;
}) {
  const backgroundStyle = view.hero_background_url ? { backgroundImage: `url("${view.hero_background_url}")` } : undefined;
  const blockNavigation = (e: React.MouseEvent) => { if (editable) e.preventDefault(); };
  return (
    <section className="landing-hero" style={backgroundStyle}>
      {!view.hero_background_url && <div className="hero-animated-bg" />}
      <div className="landing-hero-overlay" />
      <div className="landing-hero-content">
        <EditableText as="h1" className="hero-title" value={view.hero_title} editing={editable} onChange={(v) => patch({ hero_title: v })} />
        <EditableText as="p" className="hero-subtitle" value={view.hero_subtitle} editing={editable} onChange={(v) => patch({ hero_subtitle: v })} />
        <div className="hero-actions">
          <Link to="/login" className="landing-btn landing-btn-primary" onClick={blockNavigation}>
            <EditableText value={view.primary_button_label} editing={editable} onChange={(v) => patch({ primary_button_label: v })} />
          </Link>
          <a href="#about" className="landing-btn landing-btn-ghost" onClick={blockNavigation}>
            <EditableText value={view.secondary_button_label} editing={editable} onChange={(v) => patch({ secondary_button_label: v })} />
          </a>
        </div>
      </div>
      {editable && (
        <div className="hero-edit-bar">
          <label className="edit-chip">
            <ImagePlus size={16} /> تغيير صورة الخلفية
            <input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) onUploadHero(file); e.target.value = ''; }} />
          </label>
          {view.hero_background_url && (
            <button type="button" className="edit-chip" onClick={() => patch({ hero_background_url: null })}>
              <Trash2 size={16} /> إزالة الصورة
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function LandingAbout({ view, editable, patch }: { view: SiteSettings; editable: boolean; patch: Patch }) {
  return (
    <section id="about" className="landing-about">
      <div className="section-inner">
        <EditableText as="h2" className="section-title" value={view.about_title} editing={editable} onChange={(v) => patch({ about_title: v })} />
        <EditableText as="p" className="about-text" value={view.about_text} editing={editable} onChange={(v) => patch({ about_text: v })} />
      </div>
    </section>
  );
}

export function LandingStats({ cards, liveStats, editable, onChange }: {
  cards: StatCard[]; liveStats: LiveStats | null; editable: boolean; onChange: (cards: StatCard[]) => void;
}) {
  const update = (index: number, change: Partial<StatCard>) =>
    onChange(cards.map((card, i) => (i === index ? { ...card, ...change } : card)));
  const displayValue = (card: StatCard) => {
    if (!card.source) return card.value;
    return liveStats ? String(liveStats[card.source]) : '...';
  };

  return (
    <section className="landing-stats">
      <div className="section-inner">
        <div className="stats-grid">
          {cards.map((card, index) => (
            <div className="stat-card" key={index}>
              {editable ? (
                <>
                  <input
                    className="stat-value-input"
                    value={card.source ? '' : card.value}
                    placeholder={card.source ? 'تلقائي' : 'الرقم'}
                    disabled={card.source !== null}
                    onChange={(e) => update(index, { value: e.target.value })}
                  />
                  <EditableText as="span" className="stat-label" value={card.label} editing onChange={(v) => update(index, { label: v })} />
                  <select value={card.source ?? ''} onChange={(e) => update(index, { source: (e.target.value || null) as StatSource | null })}>
                    {sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button type="button" className="edit-chip" onClick={() => onChange(cards.filter((_, i) => i !== index))}>
                    <Trash2 size={15} /> حذف البطاقة
                  </button>
                </>
              ) : (
                <>
                  <strong className="stat-number">{displayValue(card)}</strong>
                  <span className="stat-label">{card.label}</span>
                </>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button type="button" className="edit-chip stats-add" onClick={() => onChange([...cards, { label: '', value: '0', source: null }])}>
            <Plus size={16} /> إضافة بطاقة
          </button>
        )}
      </div>
    </section>
  );
}

export function LandingFooter({ view, editable, patch }: { view: SiteSettings; editable: boolean; patch: Patch }) {
  return (
    <footer className="landing-footer">
      <div className="section-inner footer-inner">
        <div className="footer-brand">
          <img src={view.logo_url || '/images/yawm_alsard_2.png'} alt={view.platform_name} />
          <div>
            <EditableText as="strong" value={view.platform_name} editing={editable} onChange={(v) => patch({ platform_name: v })} />
            <EditableText as="span" value={view.platform_tagline} editing={editable} onChange={(v) => patch({ platform_tagline: v })} />
          </div>
        </div>
        <EditableText as="p" className="footer-text" value={view.footer_text} editing={editable} onChange={(v) => patch({ footer_text: v })} />
      </div>
    </footer>
  );
}
