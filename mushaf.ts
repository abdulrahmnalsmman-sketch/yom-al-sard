export type MushafWord = {
  location: string;
  word: string;
  qpcV2: string;
};

export type MushafLine =
  | { line: number; type: 'surah-header'; text: string; surah: string }
  | { line: number; type: 'basmala'; qpcV2: string }
  | { line: number; type: 'text'; text: string; verseRange: string; words: MushafWord[] };

export type MushafPage = {
  page: number;
  lines: MushafLine[];
};

const pageCache = new Map<number, MushafPage>();
const pending = new Map<number, Promise<MushafPage>>();

export async function loadMushafPage(page: number): Promise<MushafPage> {
  const cached = pageCache.get(page);
  if (cached) return cached;
  const inflight = pending.get(page);
  if (inflight) return inflight;

  const promise = (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}mushaf/qpc2/page-${String(page).padStart(3, '0')}.json`);
    if (!res.ok) throw new Error(`تعذر تحميل الصفحة ${page}`);
    const json = (await res.json()) as MushafPage;
    if (!json || !Array.isArray(json.lines) || json.page !== page) {
      throw new Error(`بيانات الصفحة ${page} غير صالحة`);
    }
    pageCache.set(page, json);
    pending.delete(page);
    return json;
  })();

  pending.set(page, promise);
  return promise;
}

export function loadPageFont(page: number): void {
  const padded = String(page).padStart(3, '0');
  const id = `qpc2-p${padded}`;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `@font-face{font-family:'QPC2Page';src:url('https://cdn.jsdelivr.net/gh/zonetecde/mushaf-layout@v2/fonts/QPC2/p${padded}.woff2') format('woff2');font-display:swap;}`;
  document.head.appendChild(style);
}

export function loadSurahHeaderFont(): void {
  const id = 'qpc2-surahs';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `@font-face{font-family:'QPC2Surahs';src:url('https://cdn.jsdelivr.net/gh/zonetecde/mushaf-layout@v2/fonts/Surahs.ttf') format('truetype');font-display:swap;}`;
  document.head.appendChild(style);
}

export function loadBasmalaFont(): void {
  const id = 'qpc2-bsml';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `@font-face{font-family:'QPC2BSML';src:url('https://cdn.jsdelivr.net/gh/zonetecde/mushaf-layout@v2/fonts/QPC2/QPC2BSML.ttf') format('truetype');font-display:swap;}`;
  document.head.appendChild(style);
}
