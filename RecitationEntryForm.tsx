import { useEffect, useState, useCallback } from 'react';
import { Check, Minus, Plus, RotateCcw, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { QuranSurah, RecitationStatus } from '@/types';
import { JUZ_INDEX, formatAyahRange, getJuzEntriesForRange } from '@/lib/juzIndex';

type Notice = { type: 'success' | 'error'; text: string } | null;

export const recitationStatusLabels: Record<RecitationStatus, string> = {
  done: 'تم',
  not_ready: 'غير جاهز',
  repeat: 'يحتاج إعادة',
};

type SavedEntry = {
  id: string;
  surah_id: string;
  status: RecitationStatus;
  mistakes: number;
  hesitations: number;
  notes: string;
};

export function RecitationEntryForm({
  sessionId, studentId, studentName, surahs, fromSurahId, toSurahId, setNotice, onStudentComplete,
}: {
  sessionId: string;
  studentId: string;
  studentName: string;
  surahs: QuranSurah[];
  fromSurahId: string;
  toSurahId: string;
  setNotice: (n: Notice) => void;
  onStudentComplete: () => void;
}) {
  const [mistakes, setMistakes] = useState(0);
  const [hesitations, setHesitations] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [currentSurahIndex, setCurrentSurahIndex] = useState(0);
  const [lastSavedEntry, setLastSavedEntry] = useState<SavedEntry | null>(null);

  const fromNumber = surahs.find((s) => s.id === fromSurahId)?.surah_number ?? 1;
  const toNumber = surahs.find((s) => s.id === toSurahId)?.surah_number ?? 114;
  const rangeSurahs = surahs.filter((s) => s.surah_number >= fromNumber && s.surah_number <= toNumber);
  const currentSurah = rangeSurahs[currentSurahIndex];

  // Juz info for current surah
  const currentJuzEntries = currentSurah
    ? JUZ_INDEX.filter((e) => e.surahNumber === currentSurah.surah_number)
    : [];
  const currentJuz = currentJuzEntries[0]?.juz ?? 1;

  // All juz in the range for progress
  const allJuzInRange = getJuzEntriesForRange(fromNumber, toNumber);
  const uniqueJuz = [...new Set(allJuzInRange.map((e) => e.juz))];
  const currentJuzIndex = uniqueJuz.indexOf(currentJuz);

  const loadSaved = useCallback(async () => {
    const { data } = await supabase
      .from('recitation_entries')
      .select('id,surah_id,status,mistakes,hesitations,notes')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: true });
    const entries = (data ?? []) as SavedEntry[];
    setSavedEntries(entries);

    // Find first unsaved surah in range — any status (done/repeat/not_ready) counts as saved
    const savedSurahIds = new Set(entries.map((e) => e.surah_id));
    const firstUnsaved = rangeSurahs.findIndex((s) => !savedSurahIds.has(s.id));
    setCurrentSurahIndex(firstUnsaved >= 0 ? firstUnsaved : rangeSurahs.length);
  }, [sessionId, studentId, rangeSurahs]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  // Reset counters when surah changes
  useEffect(() => {
    setMistakes(0);
    setHesitations(0);
    setNotes('');
  }, [currentSurahIndex]);

  const saveStatus = async (status: RecitationStatus) => {
    if (!currentSurah || saving) return;
    setSaving(true);
    const surahId = currentSurah.id;
    const surahName = currentSurah.name;
    const currentMistakes = mistakes;
    const currentHesitations = hesitations;
    const currentNotes = notes.trim();

    const { data, error } = await supabase.rpc('teacher_save_recitation_entry', {
      p_session_id: sessionId,
      p_student_id: studentId,
      p_mode: 'recitation',
      p_status: status,
      p_surah_from: surahId,
      p_surah_to: surahId,
      p_mistakes: currentMistakes,
      p_hesitations: currentHesitations,
      p_notes: currentNotes,
    });

    if (error || !data) {
      setSaving(false);
      setNotice({ type: 'error', text: `تعذر حفظ تسميع ${surahName}.` });
      return;
    }

    const entry: SavedEntry = {
      id: (data as { id: string }).id,
      surah_id: surahId,
      status,
      mistakes: currentMistakes,
      hesitations: currentHesitations,
      notes: currentNotes,
    };
    setLastSavedEntry(entry);
    setSavedEntries((prev) => {
      const filtered = prev.filter((e) => e.surah_id !== surahId);
      return [...filtered, entry];
    });

    setNotice({ type: 'success', text: `تم حفظ سورة ${surahName}: ${recitationStatusLabels[status]}` });

    // Advance to next surah — all statuses advance, stops at end of range
    setCurrentSurahIndex((i) => {
      if (i < rangeSurahs.length - 1) return i + 1;
      return rangeSurahs.length; // past end triggers completion screen
    });
    setSaving(false);
  };

  const editLastSaved = () => {
    if (!lastSavedEntry || saving) return;
    const savedIndex = rangeSurahs.findIndex((s) => s.id === lastSavedEntry.surah_id);
    if (savedIndex < 0) return;
    setCurrentSurahIndex(savedIndex);
    setMistakes(lastSavedEntry.mistakes);
    setHesitations(lastSavedEntry.hesitations);
    setNotes(lastSavedEntry.notes);
    setNotice({ type: 'success', text: 'يمكنك تعديل آخر رصد ثم تأكيد حالته من جديد.' });
  };

  // Per-student counters
  const doneCount = savedEntries.filter((e) => e.status === 'done').length;
  const notReadyCount = savedEntries.filter((e) => e.status === 'not_ready').length;
  const repeatCount = savedEntries.filter((e) => e.status === 'repeat').length;
  const remaining = rangeSurahs.length - savedEntries.length;

  if (rangeSurahs.length === 0) {
    return (
      <div className="recitation-entry">
        <div className="empty-state">لا توجد سور في هذا النطاق. حدد المقرر أولًا.</div>
      </div>
    );
  }

  if (!currentSurah) {
    const facesDone = savedEntries
      .filter((e) => e.status === 'done')
      .reduce((sum, e) => {
        const s = surahs.find((s) => s.id === e.surah_id);
        return sum + (s?.face_count ? Number(s.face_count) : 0);
      }, 0);
    return (
      <div className="recitation-entry">
        <div className="student-counters">
          <div className="counter-pill done"><strong>{doneCount}</strong><span>تم</span></div>
          <div className="counter-pill not-ready"><strong>{notReadyCount}</strong><span>غير جاهز</span></div>
          <div className="counter-pill repeat"><strong>{repeatCount}</strong><span>إعادة</span></div>
          <div className="counter-pill remaining"><strong>{remaining}</strong><span>متبقي</span></div>
        </div>
        <div className="surah-big-name">
          <Check size={28} />
          <h2>تم تسميع جميع سور {studentName}</h2>
          <p>{doneCount} سورة مؤكدة · {repeatCount} تحتاج إعادة · {notReadyCount} غير جاهزة · {facesDone.toFixed(1)} وجه منجز</p>
        </div>
        <button className="primary-button" style={{ width: '100%', justifyContent: 'center' }} onClick={onStudentComplete}>
          الانتقال للطالب التالي
        </button>
      </div>
    );
  }

  return (
    <div className="recitation-entry">
      {/* Per-student counters */}
      <div className="student-counters">
        <div className="counter-pill done"><strong>{doneCount}</strong><span>تم</span></div>
        <div className="counter-pill not-ready"><strong>{notReadyCount}</strong><span>غير جاهز</span></div>
        <div className="counter-pill repeat"><strong>{repeatCount}</strong><span>إعادة</span></div>
        <div className="counter-pill remaining"><strong>{remaining}</strong><span>متبقي</span></div>
      </div>

      {/* Surah progress */}
      <div className="surah-progress-strip">
        <div className="progress-info">
          <span>السورة {currentSurahIndex + 1} من {rangeSurahs.length}</span>
          <span>الجزء {currentJuz} من {uniqueJuz.length || 1}</span>
        </div>
        <div className="progress-track"><span style={{ width: `${((currentSurahIndex + 1) / rangeSurahs.length) * 100}%` }} /></div>
      </div>

      {/* Big surah name */}
      <div className="surah-big-name">
        <span className="surah-juz-badge">الجزء {currentJuz}</span>
        <h2>{currentSurah.name}</h2>
        <p>
          {currentSurah.name_english} · {currentSurah.ayah_count} آية · {currentSurah.end_page - currentSurah.start_page + 1} وجه
        </p>
        {currentJuzEntries.length > 1 && (
          <p className="ayah-range-hint">
            في الجزء: {currentJuzEntries.map((e) => formatAyahRange(e)).join('، ')}
          </p>
        )}
      </div>

      {/* Counters */}
      <div className="counter-grid">
        <Counter label="الأخطاء" value={mistakes} onChange={setMistakes} />
        <Counter label="الترددات" value={hesitations} onChange={setHesitations} />
      </div>

      <label className="recitation-notes-label">
        ملاحظات المعلم
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="أضف ملاحظة مختصرة عند الحاجة" rows={3} />
      </label>

      {/* Three status buttons */}
      <div className="status-buttons">
        <button
          type="button"
          className="status-btn done-btn"
          disabled={saving}
          onClick={() => void saveStatus('done')}
        >
          <Check size={22} /> تم
        </button>
        <button
          type="button"
          className="status-btn not-ready-btn"
          disabled={saving}
          onClick={() => void saveStatus('not_ready')}
        >
          <Clock size={22} /> غير جاهز
        </button>
        <button
          type="button"
          className="status-btn repeat-btn"
          disabled={saving}
          onClick={() => void saveStatus('repeat')}
        >
          <RotateCcw size={22} /> يحتاج إعادة
        </button>
      </div>

      {/* Undo + saving indicator */}
      <div className="recitation-actions-row">
        {lastSavedEntry && (
          <button type="button" className="undo-btn" disabled={saving} onClick={editLastSaved}>
            <RotateCcw size={16} /> تعديل آخر رصد
          </button>
        )}
        {saving && <span className="saving-indicator"><span className="loading-spinner" /> جارٍ الحفظ...</span>}
      </div>

      {/* Saved entries list */}
      {savedEntries.length > 0 && (
        <div className="saved-entries-list">
          <h3>السور المسجلة</h3>
          {savedEntries.map((e) => {
            const s = surahs.find((s) => s.id === e.surah_id);
            return (
              <div key={e.id} className={`saved-entry-row ${e.status}`}>
                <span className="saved-entry-name">{s?.name ?? '—'}</span>
                <span className="saved-entry-status">{recitationStatusLabels[e.status]}</span>
                {(e.mistakes > 0 || e.hesitations > 0) && (
                  <span className="saved-entry-counters">{e.mistakes} خطأ · {e.hesitations} تردد</span>
                )}
                {e.notes && <span className="saved-entry-notes">{e.notes}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="counter-control">
      <span>{label}</span>
      <div className="counter-body">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`إنقاص ${label}`}>
          <Minus size={20} />
        </button>
        <strong>{value}</strong>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`زيادة ${label}`}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}
