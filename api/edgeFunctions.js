// Helper centralizado para llamar Edge Functions de Supabase.
// Maneja errores, timeouts y query params.
import { SUPABASE_URL, supabase } from '../supabaseClient';

const DEFAULT_TIMEOUT_MS = 15000;

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

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const url = `${SUPABASE_URL}/functions/v1/${name}${buildQuery(query)}`;
  const isJson = body && typeof body === 'object';

  try {
    const resp = await fetch(url, {
      method,
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
    if (e.name === 'AbortError') throw new Error('Tiempo de espera agotado');
    throw e;
  } finally {
    clearTimeout(id);
  }
}

// Verificar permisos en cliente
export function hasPermission(permissions = [], perm) {
  if (!perm) return false;
  const needle = String(perm).toLowerCase();
  return permissions.some((p) =>
    (p.permission_name || p).toString().toLowerCase() === needle
  );
}
