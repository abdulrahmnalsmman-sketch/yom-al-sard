import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

type AuthState = {
  loading: boolean;
  profile: Profile | null;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null; profile: Profile | null }>;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, role, is_active, username')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      setProfile(null);
      return null;
    }
    const prof = data as Profile;
    setProfile(prof);
    return prof;
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) await loadProfile(sessionData.session.user.id);
      if (mounted) setLoading(false);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!mounted) return;
      if (authSession?.user) {
        void loadProfile(authSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      return { error: 'أدخل اسم المستخدم وكلمة المرور.', profile: null };
    }

    let signInEmail = trimmed;
    if (!trimmed.includes('@')) {
      const { data: emailResult, error: rpcError } = await supabase
        .rpc('lookup_email_by_username', { p_username: trimmed });
      if (rpcError || !emailResult) {
        return { error: 'اسم المستخدم غير موجود.', profile: null };
      }
      signInEmail = emailResult as string;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: signInEmail, password });
    if (error) return { error: 'بيانات الدخول غير صحيحة أو الحساب غير متاح.', profile: null };
    if (!data.user) return { error: 'تعذر استرجاع بيانات الحساب.', profile: null };
    const prof = await loadProfile(data.user.id);
    return { error: prof ? null : 'تعذر تحميل بيانات الحساب.', profile: prof };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return { loading, profile, signIn, signOut };
}
