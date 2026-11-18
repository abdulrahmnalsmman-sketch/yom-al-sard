import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Props = { onUnlock: (pin: string) => void; onClose: () => void };

export function PinGate({ onUnlock, onClose }: Props) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('admin_has_site_edit_pin');
      if (rpcError) {
        setError(`تعذر التحقق من الرمز السري: ${rpcError.message}`);
        return;
      }
      setHasPin(Boolean(data));
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (hasPin) {
      const { data, error: rpcError } = await supabase.rpc('admin_verify_site_edit_pin', { p_pin: pin });
      setBusy(false);
      if (rpcError) { setError(`تعذر التحقق: ${rpcError.message}`); return; }
      if (!data) { setError('الرمز السري غير صحيح.'); return; }
      onUnlock(pin);
      return;
    }
    if (pin !== confirm) {
      setBusy(false);
      setError('الرمزان غير متطابقين.');
      return;
    }
    const { error: rpcError } = await supabase.rpc('admin_set_site_edit_pin', { p_current_pin: '', p_new_pin: pin });
    setBusy(false);
    if (rpcError) { setError(`تعذر حفظ الرمز السري: ${rpcError.message}`); return; }
    onUnlock(pin);
  };

  return (
    <div className="pin-overlay" dir="rtl" role="dialog" aria-modal="true">
      <form className="pin-card" onSubmit={submit}>
        <button type="button" className="pin-close" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
        <div className="pin-icon"><KeyRound size={22} /></div>
        {hasPin === null ? (
          <p className="pin-text">جارٍ التحقق...</p>
        ) : (
          <>
            <h2>{hasPin ? 'أدخل الرمز السري' : 'إنشاء رمز سري للتعديل'}</h2>
            <p className="pin-text">{hasPin ? 'الرمز مطلوب لفتح وضع التعديل.' : 'لم يُنشأ رمز بعد. أنشئ رمزًا من 4 إلى 8 أرقام.'}</p>
            <label>الرمز السري
              <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} required minLength={4} maxLength={8} />
            </label>
            {!hasPin && (
              <label>تأكيد الرمز
                <input type="password" inputMode="numeric" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={4} maxLength={8} />
              </label>
            )}
            {error && <div className="notice error">{error}</div>}
            <button className="pin-submit" disabled={busy}>{busy ? 'جارٍ التحقق...' : hasPin ? 'فتح التعديل' : 'حفظ الرمز وفتح التعديل'}</button>
          </>
        )}
      </form>
    </div>
  );
}
