import { useState } from 'react';
import { Eye, EyeOff, ImagePlus, Palette, RotateCcw, Save, Type, Undo2, X } from 'lucide-react';
import type { SiteSettings } from '@/types';

type Patch = (p: Partial<SiteSettings>) => void;

type Props = {
  view: SiteSettings;
  dirty: boolean;
  saving: boolean;
  previewing: boolean;
  canUndo: boolean;
  onPatch: Patch;
  onUploadLogo: (file: File) => void;
  onSave: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  onTogglePreview: () => void;
  onExit: () => void;
};

export function SiteEditToolbar(props: Props) {
  const { view, dirty, saving, previewing, canUndo, onPatch, onUploadLogo, onSave, onDiscard, onUndo, onTogglePreview, onExit } = props;
  const [panelOpen, setPanelOpen] = useState(false);
  const [fontPanelOpen, setFontPanelOpen] = useState(false);
  const fontOptions = ['Tajawal', 'Cairo', 'Almarai', 'Noto Kufi Arabic', 'Amiri'];

  return (
    <div className="site-edit-toolbar" dir="rtl">
      {fontPanelOpen && (
        <div className="edit-panel">
          <div className="edit-panel-row">
            <label className="font-field">نوع الخط
              <select value={view.font_family} onChange={(e) => onPatch({ font_family: e.target.value })}>
                {fontOptions.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
      {panelOpen && (
        <div className="edit-panel">
          <div className="edit-panel-row">
            <label className="color-field">اللون الأساسي
              <input type="color" value={view.primary_color} onChange={(e) => onPatch({ primary_color: e.target.value })} />
            </label>
            <label className="color-field">لون التمييز
              <input type="color" value={view.accent_color} onChange={(e) => onPatch({ accent_color: e.target.value })} />
            </label>
            <label className="color-field">لون الهيدر
              <input type="color" value={view.header_color} onChange={(e) => onPatch({ header_color: e.target.value })} />
            </label>
          </div>
          <div className="edit-panel-row">
            <label className="color-field">لون القائمة الجانبية
              <input type="color" value={view.sidebar_color} onChange={(e) => onPatch({ sidebar_color: e.target.value })} />
            </label>
            <label className="color-field">لون الخلفية
              <input type="color" value={view.page_background_color} onChange={(e) => onPatch({ page_background_color: e.target.value })} />
            </label>
            <label className="color-field">لون البطاقات
              <input type="color" value={view.card_color} onChange={(e) => onPatch({ card_color: e.target.value })} />
            </label>
          </div>
          <div className="edit-panel-row">
            <label className="edit-chip">
              <ImagePlus size={16} /> تغيير الشعار
              <input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) onUploadLogo(file); e.target.value = ''; }} />
            </label>
            {view.logo_url && (
              <button type="button" className="edit-chip" onClick={() => onPatch({ logo_url: null })}>
                <X size={16} /> إزالة الشعار المخصص
              </button>
            )}
          </div>
        </div>
      )}
      <div className="edit-bar">
        <span className={`edit-status ${dirty ? 'dirty' : ''}`}>{dirty ? 'توجد تغييرات غير محفوظة' : 'كل التغييرات محفوظة'}</span>
        <div className="edit-bar-actions">
          <button type="button" className="edit-btn edit-btn-save" onClick={onSave} disabled={!dirty || saving}>
            <Save size={16} /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button type="button" className="edit-btn" onClick={onTogglePreview}>
            {previewing ? <EyeOff size={16} /> : <Eye size={16} />} {previewing ? 'إيقاف المعاينة' : 'معاينة'}
          </button>
          <button type="button" className="edit-btn" onClick={() => setFontPanelOpen((o) => !o)}>
            <Type size={16} /> الخط
          </button>
          <button type="button" className="edit-btn" onClick={() => setPanelOpen((o) => !o)}>
            <Palette size={16} /> الألوان والشعار
          </button>
          <button type="button" className="edit-btn" onClick={onDiscard} disabled={!dirty || saving}>
            <RotateCcw size={16} /> إلغاء التغييرات
          </button>
          <button type="button" className="edit-btn" onClick={onUndo} disabled={!canUndo || saving}>
            <Undo2 size={16} /> تراجع عن آخر حفظ
          </button>
          <button type="button" className="edit-btn edit-btn-exit" onClick={onExit}>
            <X size={16} /> إنهاء التعديل
          </button>
        </div>
      </div>
    </div>
  );
}
