// Tracker en memoria para distinguir cancelaciones iniciadas por el conductor.
// No requiere backend. Se usa para suprimir notificaciones de "cancelado por coordinador"
// cuando el propio conductor canceló/rechazó desde el frontend.

const recentCancelsByServiceId = new Map();

function normalizeId(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

function purgeOlderThan(maxAgeMs) {
  const now = Date.now();
  for (const [key, ts] of recentCancelsByServiceId.entries()) {
    if (!ts || now - ts > maxAgeMs) recentCancelsByServiceId.delete(key);
  }
}

export function markDriverCanceled(serviceId) {
  const id = normalizeId(serviceId);
  if (!id) return;
  purgeOlderThan(5 * 60 * 1000);
  recentCancelsByServiceId.set(id, Date.now());
}

export function unmarkDriverCanceled(serviceId) {
  const id = normalizeId(serviceId);
  if (!id) return;
  recentCancelsByServiceId.delete(id);
}

// Consume (true una sola vez) para evitar suprimir notificaciones futuras.
export function consumeDriverCanceled(serviceId, windowMs = 60000) {
  const id = normalizeId(serviceId);
  if (!id) return false;

  const ts = recentCancelsByServiceId.get(id);
  if (!ts) return false;

  const now = Date.now();
  const ok = now - ts <= windowMs;
  if (ok) {
    recentCancelsByServiceId.delete(id);
    return true;
  }

  // Si ya expiró, limpiar.
  recentCancelsByServiceId.delete(id);
  return false;
}
