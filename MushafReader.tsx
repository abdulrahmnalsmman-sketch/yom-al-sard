import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, Loader2, X, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { QuranJuz, QuranSurah, StudentCurriculumItem } from '@/types';
import {
  loadBasmalaFont, loadMushafPage, loadPageFont, loadSurahHeaderFont,
  type MushafPage,
} from '@/lib/mushaf';

type Notice = { type: 'success' | 'error'; text: string } | null;

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toArabicNumber = (n: number): string =>
  String(n).split('').map((d) => ARABIC_DIGITS[Number(d)]).join('');

export function MushafReader({
  teacherId,
  surahs,
  juzList,
  curriculumItems,
  activeStudentName,
  onClose,
  setNotice,
}: {
  teacherId: string;
  surahs: QuranSurah[];
  juzList: QuranJuz[];
  curriculumItems: StudentCurriculumItem[];
  activeStudentName: string | null;
  onClose: () => void;
  setNotice: (n: Notice) => void;
}) {
  const [page, setPage] = useState<number | null>(null);
  const [pageData, setPageData] = useState<MushafPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpValue, setJumpValue] = useState('');
  const [savingPosition, setSavingPosition] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // Curriculum bounds: pages allowed by the active student's curriculum (fallback: full mushaf)
  const bounds = useMemo(() => {
    const pages: number[] = [];
    for (const item of curriculumItems) {
      let start: number | null = null;
      let end: number | null = null;
      if (item.item_type === 'juz' && item.juz_id) {
        const juz = juzList.find((j) => j.id === item.juz_id);
        if (juz) { start = juz.start_page; end = juz.end_page; }
      } else if (item.surah_id) {
        const surah = surahs.find((s) => s.id === item.surah_id);
        if (surah) { start = surah.start_page; end = surah.end_page; }
      } else if (item.start_page && item.end_page) {
        start = item.start_page; end = item.end_page;
      }
      if (start && end) {
        for (let p = start; p <= end; p++) pages.push(p);
      }
    }
    if (pages.length === 0) return { min: 1, max: 604, pages: null as Set<number> | null };
    return { min: Math.min(...pages), max: Math.max(...pages), pages: new Set(pages) };
  }, [curriculumItems, juzList, surahs]);

  // Load saved position once
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('mushaf_reading_position')
        .select('last_page')
        .eq('user_id', teacherId)
        .maybeSingle();
      let start = (data?.last_page as number | undefined) ?? 1;
      if (bounds.pages && !bounds.pages.has(start)) start = bounds.min;
      setPage(start);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  // Load page data + font when page changes
  useEffect(() => {
    if (page === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPageFont(page);
    loadSurahHeaderFont();
    loadBasmalaFont();
    loadMushafPage(page)
      .then((data) => { if (!cancelled) { setPageData(data); setLoading(false); } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'تعذر تحميل الصفحة.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [page]);

  // Debounced save of last page
  useEffect(() => {
    if (page === null) return;
    setSavingPosition(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        const { error: upsertError } = await supabase
          .from('mushaf_reading_position')
          .upsert({ user_id: teacherId, last_page: page }, { onConflict: 'user_id' });
        setSavingPosition(false);
        if (upsertError) setNotice({ type: 'error', text: 'تعذر حفظ آخر صفحة.' });
      })();
    }, 800);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [page, teacherId, setNotice]);

  const go = useCallback((target: number) => {
    setPage((prev) => {
      const base = prev ?? 1;
      let next = target;
      if (bounds.pages) {
        // Snap to nearest allowed page
        if (!bounds.pages.has(next)) {
          const sorted = Array.from(bounds.pages).sort((a, b) => Math.abs(a - next) - Math.abs(b - next));
          next = sorted[0] ?? bounds.min;
        }
      } else {
        next = Math.min(604, Math.max(1, next));
      }
      return next === base ? prev : next;
    });
  }, [bounds]);

  const step = (dir: 1 | -1) => {
    if (page === null) return;
    let next = page + dir;
    if (bounds.pages) {
      if (!bounds.pages.has(next)) return;
    } else {
      next = Math.min(604, Math.max(1, next));
    }
    go(next);
  };

  const headerInfo = useMemo(() => {
    if (!pageData || page === null) return { surahName: '', juzNumber: null as number | null };
    const firstText = pageData.lines.find((l) => l.type === 'text');
    const surahNum = firstText?.verseRange ? Number(firstText.verseRange.split(':')[0]) : null;
    const surahName = surahNum ? (surahs.find((s) => s.surah_number === surahNum)?.name_arabic ?? '') : '';
    const juz = juzList.find((j) => page >= j.start_page && page <= j.end_page);
    return { surahName, juzNumber: juz?.juz_number ?? null };
  }, [pageData, surahs, juzList, page]);

  const inBounds = useCallback((p: number) => (bounds.pages ? bounds.pages.has(p) : p >= 1 && p <= 604), [bounds]);

  if (page === null) {
    return (
      <div className="mushaf-overlay" role="dialog" aria-modal="true">
        <div className="mushaf-shell">
          <div className="mushaf-loading" style={{ margin: 'auto' }}><Loader2 size={26} className="spin" /> جارٍ فتح المصحف...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mushaf-overlay" role="dialog" aria-modal="true">
      <div className="mushaf-shell">
        <header className="mushaf-topbar">
          <div className="mushaf-title">
            <BookOpen size={17} />
            <span>مصحف المدينة</span>
            {activeStudentName && <span className="mushaf-student-chip">{activeStudentName}</span>}
          </div>
          <div className="mushaf-meta">
            <span>صفحة {toArabicNumber(page)}</span>
            {headerInfo.surahName && <span>· سورة {headerInfo.surahName}</span>}
            {headerInfo.juzNumber !== null && <span>· الجزء {toArabicNumber(headerInfo.juzNumber)}</span>}
            {savingPosition ? <Loader2 size={13} className="spin" /> : <MapPin size={13} />}
          </div>
          <button className="mushaf-close" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
        </header>

        <div className="mushaf-toolbar">
          <button className="mushaf-nav" onClick={() => step(-1)} disabled={!inBounds(page - 1)}>
            <ChevronRight size={16} /> السابق
          </button>
          <div className="mushaf-jump">
            <input
              type="number" min={bounds.min} max={bounds.max} placeholder={`${bounds.min}-${bounds.max}`}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && jumpValue) { const n = Number(jumpValue); if (n >= 1 && n <= 604 && inBounds(n)) { go(n); setJumpValue(''); } } }}
            />
            <button onClick={() => { const n = Number(jumpValue); if (n >= 1 && n <= 604 && inBounds(n)) { go(n); setJumpValue(''); } }}>انتقال</button>
          </div>
          <button className="mushaf-nav" onClick={() => step(1)} disabled={!inBounds(page + 1)}>
            التالي <ChevronLeft size={16} />
          </button>
        </div>

        {curriculumItems.length > 0 && (
          <div className="mushaf-bounds-note">
            نطاق المقرر: صفحة {toArabicNumber(bounds.min)} إلى صفحة {toArabicNumber(bounds.max)}
          </div>
        )}

        <main className="mushaf-page-area">
          {loading && <div className="mushaf-loading"><Loader2 size={26} className="spin" /> جارٍ تحميل الصفحة...</div>}
          {error && <div className="mushaf-error">{error}</div>}
          {!loading && !error && pageData && (
            <div className="mushaf-page" style={{ fontSize: 'clamp(18px, 4.2vw, 34px)' }}>
              {pageData.lines.map((line) => {
                if (line.type === 'surah-header') {
                  return (
                    <div key={line.line} className="mushaf-line surah-header" style={{ fontFamily: "'QPC2Surahs', serif" }}>
                      {line.surah}
                    </div>
                  );
                }
                if (line.type === 'basmala') {
                  return (
                    <div key={line.line} className="mushaf-line basmala" style={{ fontFamily: "'QPC2BSML', serif" }}>
                      {line.qpcV2}
                    </div>
                  );
                }
                return (
                  <div key={line.line} className="mushaf-line text-line" style={{ fontFamily: `'QPC2Page', serif` }}>
                    {line.words.map((w, i) => (
                      <span key={`${w.location}-${i}`} className="mushaf-word">{w.qpcV2}</span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
