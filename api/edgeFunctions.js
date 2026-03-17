// Helper centralizado para llamar Edge Functions de Supabase.
// Maneja errores, timeouts y query params.
import { SUPABASE_URL, supabase } from '../supabaseClient';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_GET_RETRIES = 1;
const DEFAULT_GET_RETRY_BACKOFF_MS = 350;

// Construye query string desde un objeto
function buildQuery(params = {}) {
  const esc = encodeURIComponent;
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${esc(k)}=${esc(v)}`).join('&');
}

export async function callEdgeFunction(
  name,
  { method = 'GET', headers = {}, body, query = {}, timeout = DEFAULT_TIMEOUT_MS } = {}
) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Error obteniendo la sesión');
  const session = data?.session;
  if (!session) throw new Error('Sesión no válida');

  const url = `${SUPABASE_URL}/functions/v1/${name}${buildQuery(query)}`;
  const isJson = body && typeof body === 'object';
  const upperMethod = String(method || 'GET').toUpperCase();
  const shouldRetry = upperMethod === 'GET';
  const maxAttempts = shouldRetry ? (DEFAULT_GET_RETRIES + 1) : 1;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, {
        method: upperMethod,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(isJson ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: isJson ? JSON.stringify(body) : body,
        signal: controller.signal,
      });

      const text = await resp.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (!resp.ok) throw new Error(json.error || `Error ${resp.status}`);
      return json;
    } catch (e) {
      lastError = e;

      const isAbort = e?.name === 'AbortError';
      const isNetwork = typeof e?.message === 'string' && e.message.toLowerCase().includes('network');

      if (isAbort) {
        const err = new Error('Tiempo de espera agotado');
        err.code = 'TIMEOUT';
        lastError = err;
      }

      const canRetry = shouldRetry && attempt < maxAttempts && (isAbort || isNetwork);
      if (!canRetry) break;

      await new Promise((r) => setTimeout(r, DEFAULT_GET_RETRY_BACKOFF_MS * attempt));
    } finally {
      clearTimeout(id);
    }
  }

  if (lastError?.code === 'TIMEOUT') throw lastError;
  if (lastError?.name === 'AbortError') throw new Error('Tiempo de espera agotado');
  throw lastError;
}

// Verificar permisos en cliente
export function hasPermission(permissions = [], perm) {
  if (!perm) return false;
  const needle = String(perm).toLowerCase();
  return permissions.some((p) =>
    (p.permission_name || p).toString().toLowerCase() === needle
  );
}
