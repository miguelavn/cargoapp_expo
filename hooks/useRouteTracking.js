import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { callEdgeFunction } from '../api/edgeFunctions';

const ROUTE_TRACKING_QUEUE_KEY = 'route_tracking_queue';
const DEFAULT_INTERVAL_MS = 60000;
const DEFAULT_BATCH_SIZE = 50;

function safeParse(json, fallback) {
	try {
		const parsed = JSON.parse(json);
		return parsed == null ? fallback : parsed;
	} catch {
		return fallback;
	}
}

function toFiniteNumber(value) {
	if (value == null || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function normalizeLatitude(value) {
	const lat = toFiniteNumber(value);
	if (lat == null || Math.abs(lat) > 90) return null;
	return lat;
}

function normalizeLongitude(value) {
	const lng = toFiniteNumber(value);
	if (lng == null || Math.abs(lng) > 180) return null;
	return lng;
}

function makePointId(serviceId, recordedAt) {
	const rnd = Math.random().toString(36).slice(2, 8);
	return `rp-${String(serviceId || '0')}-${String(recordedAt || Date.now())}-${rnd}`;
}

function chunkArray(items, size) {
	const chunks = [];
	if (!Array.isArray(items) || !items.length) return chunks;
	const n = Math.max(1, Number(size) || 1);
	for (let i = 0; i < items.length; i += n) {
		chunks.push(items.slice(i, i + n));
	}
	return chunks;
}

function isConsecutiveDuplicatePoint(last, next) {
	if (!last || !next) return false;
	if (String(last?.service_id) !== String(next?.service_id)) return false;

	const latA = normalizeLatitude(last?.latitude);
	const lngA = normalizeLongitude(last?.longitude);
	const latB = normalizeLatitude(next?.latitude);
	const lngB = normalizeLongitude(next?.longitude);
	if (latA == null || lngA == null || latB == null || lngB == null) return false;

	return latA.toFixed(6) === latB.toFixed(6) && lngA.toFixed(6) === lngB.toFixed(6);
}

async function getQueue() {
	const raw = await AsyncStorage.getItem(ROUTE_TRACKING_QUEUE_KEY);
	const parsed = safeParse(raw, []);
	if (!Array.isArray(parsed)) return [];
	return parsed.filter((p) => p && typeof p === 'object');
}

async function setQueue(queue) {
	const next = Array.isArray(queue) ? queue : [];
	await AsyncStorage.setItem(ROUTE_TRACKING_QUEUE_KEY, JSON.stringify(next));
	return next;
}

export function useRouteTracking({ serviceId, isActive, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
	const [isOnline, setIsOnline] = useState(false);
	const intervalRef = useRef(null);
	const syncInFlightRef = useRef(false);
	const mountedRef = useRef(false);
	const permissionStatusRef = useRef('undetermined');

	const clearTrackingInterval = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const ensureLocationPermission = useCallback(async () => {
		try {
			let status = permissionStatusRef.current;
			if (status === 'granted') return true;
			if (status === 'denied') return false;

			const existing = await Location.getForegroundPermissionsAsync();
			status = existing?.status || 'undetermined';

			if (status !== 'granted') {
				const req = await Location.requestForegroundPermissionsAsync();
				status = req?.status || status;
			}

			permissionStatusRef.current = status;
			return status === 'granted';
		} catch {
			return false;
		}
	}, []);

	const enqueuePoint = useCallback(async (point) => {
		if (!point || typeof point !== 'object') return false;
		const sid = point?.service_id;
		if (sid == null || sid === '') return false;

		const normalized = {
			point_id: String(point?.point_id || makePointId(sid, point?.recorded_at)),
			service_id: sid,
			latitude: normalizeLatitude(point?.latitude),
			longitude: normalizeLongitude(point?.longitude),
			speed: toFiniteNumber(point?.speed),
			heading: toFiniteNumber(point?.heading),
			recorded_at: String(point?.recorded_at || new Date().toISOString()),
		};

		if (normalized.latitude == null || normalized.longitude == null) return false;

		const queue = await getQueue();
		const last = queue.length ? queue[queue.length - 1] : null;
		if (isConsecutiveDuplicatePoint(last, normalized)) return false;

		queue.push(normalized);
		await setQueue(queue);
		return true;
	}, []);

	const syncQueue = useCallback(async () => {
		if (syncInFlightRef.current) return;
		if (!isOnline) return;

		syncInFlightRef.current = true;
		try {
			const queue = await getQueue();
			if (!queue.length) return;

			const batches = chunkArray(queue, DEFAULT_BATCH_SIZE);
			for (const batch of batches) {
				const points = batch.map((p) => ({
					service_id: p?.service_id,
					latitude: p?.latitude ?? null,
					longitude: p?.longitude ?? null,
					speed: p?.speed ?? null,
					heading: p?.heading ?? null,
					recorded_at: p?.recorded_at,
				}));

				await callEdgeFunction('insert-route-history', {
					method: 'POST',
					body: { points },
					timeout: 20000,
				});

				const fresh = await getQueue();
				const sentIds = new Set(batch.map((p) => String(p?.point_id)));
				const remaining = fresh.filter((p) => !sentIds.has(String(p?.point_id)));
				await setQueue(remaining);
			}
		} catch {
			// offline-first: errores silenciosos, reintento posterior por reconexion
		} finally {
			syncInFlightRef.current = false;
		}
	}, [isOnline]);

	const captureLocation = useCallback(async () => {
		if (!isActive) return;
		if (!serviceId) return;

		try {
			const hasPermission = await ensureLocationPermission();
			if (!hasPermission) return;

			const location = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.High,
			});

			const latitude = normalizeLatitude(location?.coords?.latitude);
			const longitude = normalizeLongitude(location?.coords?.longitude);
			if (latitude == null || longitude == null) return;

			await enqueuePoint({
				service_id: serviceId,
				latitude,
				longitude,
				speed: toFiniteNumber(location?.coords?.speed),
				heading: toFiniteNumber(location?.coords?.heading),
				recorded_at: new Date().toISOString(),
			});

			if (isOnline) {
				syncQueue();
			}
		} catch {
			// errores silenciosos para no bloquear UI
		}
	}, [enqueuePoint, ensureLocationPermission, isActive, isOnline, serviceId, syncQueue]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			clearTrackingInterval();
		};
	}, [clearTrackingInterval]);

	useEffect(() => {
		let firstResolved = false;
		NetInfo.fetch().then((state) => {
			if (!mountedRef.current) return;
			const online = state?.isConnected === true && state?.isInternetReachable !== false;
			setIsOnline(online);
			firstResolved = true;
			if (online) syncQueue();
		});

		const unsubscribe = NetInfo.addEventListener((state) => {
			if (!mountedRef.current) return;
			const online = state?.isConnected === true && state?.isInternetReachable !== false;
			setIsOnline(online);
			if (online) syncQueue();
		});

		return () => {
			if (!firstResolved) {
				// noop
			}
			unsubscribe?.();
		};
	}, [syncQueue]);

	useEffect(() => {
		clearTrackingInterval();
		if (!isActive || !serviceId) return;

		captureLocation();
		intervalRef.current = setInterval(() => {
			captureLocation();
		}, Math.max(10000, Number(intervalMs) || DEFAULT_INTERVAL_MS));

		return () => {
			clearTrackingInterval();
		};
	}, [captureLocation, clearTrackingInterval, intervalMs, isActive, serviceId]);

	useEffect(() => {
		if (isOnline) {
			syncQueue();
		}
	}, [isOnline, syncQueue]);

	return { syncRouteTrackingQueue: syncQueue };
}

export const routeTrackingStorageKey = ROUTE_TRACKING_QUEUE_KEY;
