import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVE_TRIP_KEY = 'ACTIVE_TRIP';
export const OFFLINE_EVENTS_QUEUE_KEY = 'OFFLINE_EVENTS_QUEUE';

let syncInFlight = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSyncToFinish({ timeoutMs = 6000, stepMs = 120 } = {}) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  while (syncInFlight && Date.now() < deadline) {
    await sleep(stepMs);
  }
  return !syncInFlight;
}

function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function normalizeRoute(route) {
  if (!Array.isArray(route)) return [];
  return route
    .map((p) => ({
      latitude: Number(p?.latitude),
      longitude: Number(p?.longitude),
    }))
    .filter((p) => !Number.isNaN(p.latitude) && !Number.isNaN(p.longitude));
}

function makeEventId(serviceId, createdAt) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `evt-${String(serviceId || '0')}-${String(createdAt)}-${rnd}`;
}

function normalizeCreatedAt(value) {
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function createdAtToMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

export async function getPersistedActiveTrip() {
  const raw = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
  const parsed = safeParse(raw, null);
  if (!isObject(parsed)) return null;
  return parsed;
}

export async function persistActiveTrip(payload) {
  if (!isObject(payload)) return;
  const serviceId = payload?.active_service_id ?? payload?.service?.service_id ?? null;
  if (serviceId == null || serviceId === '') return;

  const next = {
    active_service_id: serviceId,
    service: isObject(payload?.service) ? payload.service : null,
    status: String(payload?.status || '').toUpperCase(),
    substatus: String(payload?.substatus || '').toUpperCase(),
    cachedRouteToPickup: normalizeRoute(payload?.cachedRouteToPickup),
    cachedRouteToDestination: normalizeRoute(payload?.cachedRouteToDestination),
    updated_at: Date.now(),
  };

  await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(next));
}

export async function clearPersistedActiveTrip() {
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
}

export async function getOfflineEventsQueue() {
  const raw = await AsyncStorage.getItem(OFFLINE_EVENTS_QUEUE_KEY);
  const parsed = safeParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((e) => isObject(e));
}

async function setOfflineEventsQueue(queue) {
  const next = Array.isArray(queue) ? queue : [];
  await AsyncStorage.setItem(OFFLINE_EVENTS_QUEUE_KEY, JSON.stringify(next));
  return next;
}

export async function enqueueOfflineEvent(event) {
  if (!isObject(event)) return null;
  const serviceId = event?.service_id;
  if (serviceId == null || serviceId === '') return null;

  const createdAt = normalizeCreatedAt(event?.created_at);
  const normalized = {
    event_id: String(event?.event_id || makeEventId(serviceId, createdAt)),
    service_id: serviceId,
    status: event?.status ? String(event.status).toUpperCase() : null,
    substatus: event?.substatus ? String(event.substatus).toUpperCase() : null,
    pause_reason_id: event?.pause_reason_id ?? null,
    created_at: createdAt,
  };

  const queue = await getOfflineEventsQueue();
  const exists = queue.some((q) => String(q?.event_id) === normalized.event_id);
  if (exists) return normalized;

  queue.push(normalized);
  queue.sort((a, b) => createdAtToMs(a?.created_at) - createdAtToMs(b?.created_at));
  await setOfflineEventsQueue(queue);
  return normalized;
}

export async function getOfflineEventsCount() {
  const queue = await getOfflineEventsQueue();
  return queue.length;
}

export async function syncOfflineEventsQueue(sendEventFn) {
  if (typeof sendEventFn !== 'function') {
    return { processed: 0, remaining: await getOfflineEventsCount(), lastError: null };
  }
  if (syncInFlight) {
    const idle = await waitForSyncToFinish();
    return {
      processed: 0,
      remaining: await getOfflineEventsCount(),
      lastError: null,
      waitedForInFlight: true,
      inFlightResolved: idle,
    };
  }

  syncInFlight = true;
  let processed = 0;
  let lastError = null;

  try {
    let queue = await getOfflineEventsQueue();

    while (queue.length > 0) {
      const ev = queue[0];
      try {
        const res = await sendEventFn(ev);
        // Permitir que el caller marque un error como "ack" (idempotente) para
        // removerlo de la cola aunque el backend responda "duplicate".
        if (res && typeof res === 'object' && res.ack === false) {
          // explícitamente no ack: cortar para reintentar luego
          break;
        }
      } catch (e) {
        lastError = e;
        break;
      }

      queue.shift();
      processed += 1;
      await setOfflineEventsQueue(queue);
    }

    return { processed, remaining: queue.length, lastError };
  } finally {
    syncInFlight = false;
  }
}
