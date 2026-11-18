/*
 * Face (وجه) calculation utilities for the Madinah Mushaf.
 * 1 face = 15 lines. faces = lines / 15.
 * Values are NOT rounded during calculation — rounding is for display only.
 */

export const LINES_PER_FACE = 15;

/** Convert a line count to a precise face value (no rounding). */
export function linesToFaces(lines: number): number {
  return lines / LINES_PER_FACE;
}

/** Complete faces = floor of the precise face value. */
export function completedFaces(lines: number): number {
  return Math.floor(lines / LINES_PER_FACE);
}

/** Remaining lines after removing complete faces. */
export function remainingLines(lines: number): number {
  return lines % LINES_PER_FACE;
}

/** Format a number to 2 decimal places, trimming trailing zeros for display. */
export function formatFaceValue(faces: number): string {
  return faces.toFixed(2).replace(/\.?0+$/, '');
}

/** Convert a numeric face value to an Arabic description. */
export function describeFaces(faces: number): string {
  const whole = Math.floor(faces);
  const remainder = faces - whole;

  const wholePart = describeWholeFaces(whole);
  const fractionPart = describeFraction(remainder);

  if (whole === 0 && fractionPart === '') return 'أقل من وجه';
  if (whole === 0) return fractionPart;
  if (fractionPart === '') return wholePart;
  return `${wholePart} و${fractionPart}`;
}

function describeWholeFaces(n: number): string {
  if (n === 0) return '';
  if (n === 1) return 'وجه واحد';
  if (n === 2) return 'وجهان';
  if (n >= 3 && n <= 10) return `${n} أوجه`;
  return `${n} وجهًا`;
}

function describeFraction(f: number): string {
  // Round to nearest 0.25 to detect common fractions
  const rounded = Math.round(f * 4) / 4;
  const remainingLines = Math.round(f * 15);

  if (rounded === 0) return '';
  if (rounded === 0.25) return 'ربع وجه';
  if (rounded === 0.33) return 'ثلث وجه';
  if (rounded === 0.4) return 'خمسا الوجه';
  if (rounded === 0.5) return 'نصف وجه';
  if (rounded === 0.67) return 'ثلثا وجه';
  if (rounded === 0.75) return 'ثلاثة أرباع وجه';
  if (rounded === 1) return '';

  // For non-standard fractions, describe in terms of lines
  if (remainingLines > 0) {
    return `${remainingLines} ${remainingLines === 1 ? 'سطر' : remainingLines === 2 ? 'سطران' : 'أسطر'}`;
  }
  return '';
}

/** Full description with both numeric value and Arabic text. */
export function fullFaceDescription(faces: number): string {
  const numeric = formatFaceValue(faces);
  const desc = describeFaces(faces);
  return `${desc} (${numeric})`;
}

/** Describe remaining lines after complete faces. */
export function describeRemaining(lines: number): string {
  const rem = remainingLines(lines);
  if (rem === 0) return 'مكتمل';
  if (rem === 1) return 'سطر واحد متبقٍ';
  if (rem === 2) return 'سطران متبقيان';
  return `${rem} أسطر متبقية`;
}

/** Calculate faces from a range of pages (approximate — each page = 1 face in 15-line Mushaf). */
export function pagesToFaces(startPage: number, endPage: number): number {
  return Math.max(0, endPage - startPage + 1);
}

/** Estimate lines from ayah count within a surah (rough approximation). */
export function estimateLinesFromAyahs(ayahCount: number, surahLineCount: number, surahAyahCount: number): number {
  if (surahAyahCount === 0) return 0;
  return Math.round((ayahCount / surahAyahCount) * surahLineCount);
}

/** Error rate per face recited. */
export function errorRatePerFace(errors: number, facesRecited: number): number {
  if (facesRecited <= 0) return 0;
  return errors / facesRecited;
}
