import { SUPABASE_URL } from './supabaseClient.js';

export function getFunctionsBaseUrl() {
  const configured = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  if (configured) return configured;

  if (!SUPABASE_URL) return null;

  try {
    const u = new URL(SUPABASE_URL);
    const host = u.host.replace('.supabase.co', '.functions.supabase.co');
    return `${u.protocol}//${host}`;
  } catch {
    return null;
  }
}
