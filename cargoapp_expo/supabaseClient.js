import { createClient } from '@supabase/supabase-js';

// Exportar para reutilizar en llamadas a Edge Functions
export const SUPABASE_URL = 'https://tywfaayajgpfajvzftbd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5d2ZhYXlhamdwZmFqdnpmdGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjQwOTAsImV4cCI6MjA3MTc0MDA5MH0.XdFwdvF3PQKB8VNskWdu5cXgx5OlnJZwQKC8veratoo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
