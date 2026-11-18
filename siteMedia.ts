import { supabase } from '@/lib/supabase';

export async function uploadSiteImage(file: File, folder: 'logo' | 'hero'): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from('site-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
}
