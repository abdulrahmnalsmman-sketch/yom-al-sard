import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SiteSettings } from '@/types';

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (queryError) {
      setError(queryError.message);
    } else if (!data) {
      setError('لم يتم العثور على إعدادات الموقع.');
    } else {
      setError(null);
      setSettings(data as SiteSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, setSettings, loading, error, reload };
}
