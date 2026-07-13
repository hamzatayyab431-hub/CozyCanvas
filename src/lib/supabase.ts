import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isValidUrl = (url?: string): boolean => {
  if (!url || url === 'undefined' || url === 'null') return false;
  return url.startsWith('http://') || url.startsWith('https://');
};

const finalUrl = isValidUrl(supabaseUrl) ? supabaseUrl! : 'https://placeholder.supabase.co';
const finalKey = supabaseAnonKey && supabaseAnonKey !== 'undefined' && supabaseAnonKey !== 'null' ? supabaseAnonKey : 'placeholder';

if (!isValidUrl(supabaseUrl) || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing or invalid. Supabase features will be inactive.'
  );
}

export const supabase = createClient(finalUrl, finalKey);
