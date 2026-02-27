import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const safeUrl = url || 'http://localhost:54321';
// Supabase exige una key no vacía; en dev preferimos no tumbar la UI.
// Si no está configurado, las llamadas fallarán con 401/403 y verás el warning.
const safeAnonKey = anonKey || 'MISSING_VITE_SUPABASE_ANON_KEY';

if (!url || !anonKey) {
  // En dev puede faltar .env; no lanzamos error fatal para permitir ver la UI.
  // Las pantallas que consulten Supabase fallarán con mensaje claro.
  // eslint-disable-next-line no-console
  console.warn('Faltan VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY en el entorno.');
}

export const supabase = createClient(safeUrl, safeAnonKey);
export const SUPABASE_URL = safeUrl;
