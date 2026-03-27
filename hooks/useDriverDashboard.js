import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { callEdgeFunction } from '../api/edgeFunctions';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { consumeDriverCanceled } from '../services/driverCancelTracker';
import { useIsOnline } from './useIsOnline';
import {
	clearPersistedActiveTrip,
	getOfflineEventsCount,
	persistActiveTrip,
	syncOfflineEventsQueue,
} from '../services/offlineTrip';

function normalizeId(val) {
	if (val === null || val === undefined) return null;
	return String(val);
}

const TERMINAL_SERVICE_STATUSES = new Set(['DELIVERED', 'CANCELED']);

function normalizeStatusNameFromRow(row, statusNameById) {
	const raw = row?.status_name ?? row?.status;
	if (raw != null && String(raw).trim()) return String(raw).toUpperCase();

	const idKey = normalizeId(row?.status_id);
	if (idKey && statusNameById && typeof statusNameById.get === 'function') {
		const mapped = statusNameById.get(idKey);
		if (mapped != null && String(mapped).trim()) return String(mapped).toUpperCase();
	}

	// Último fallback (si tus IDs coinciden con los defaults)
	const sid = Number(row?.status_id);
	if (sid === 1) return 'CREATED';
	if (sid === 2) return 'ACCEPTED';
	if (sid === 3) return 'LOADED';
	if (sid === 4) return 'DELIVERED';
	if (sid === 5) return 'CANCELED';
	return '';
}

function isTerminalServiceRow(row, statusNameById) {
	const name = normalizeStatusNameFromRow(row, statusNameById);
	return TERMINAL_SERVICE_STATUSES.has(name);
}

function isIgnorableQueueSyncError(error) {
	const msg = String(error?.message || error || '').toLowerCase();
	if (!msg) return false;
	return (
		msg.includes('duplicate') ||
		msg.includes('already processed') ||
		msg.includes('already applied') ||
		msg.includes('already exists') ||
		msg.includes('ya existe') ||
		msg.includes('ya fue') ||
		msg.includes('ya se encuentra') ||
		msg.includes('same status') ||
		msg.includes('unique constraint') ||
		msg.includes('conflict')
	);
}

export function useDriverDashboard(enabled) {
	const isOnline = useIsOnline();
	const [state, setState] = useState({
		loading: false,
		error: '',
		vehicle: null,
		activeService: null,
		deliveredToday: 0,
		canceledToday: 0,
	});
	const [pendingOfflineEvents, setPendingOfflineEvents] = useState(0);
	const [appUserId, setAppUserId] = useState(null);

	const appUserIdRef = useRef(null);
	const appUserIdReadyRef = useRef(false);
	const statusNameByIdRef = useRef(new Map());
	const statusCatalogLoadedRef = useRef(false);
	const statusCatalogLoadingRef = useRef(false);

	const loadStatusCatalog = useCallback(async () => {
		if (!enabled) return;
		if (statusCatalogLoadedRef.current) return;
		if (statusCatalogLoadingRef.current) return;
		statusCatalogLoadingRef.current = true;
		try {
			const { data, error } = await supabase
				.from('service_status')
				.select('id, status_name');
			if (error) throw error;
			const map = new Map();
			for (const row of data || []) {
				const idKey = normalizeId(row?.id);
				const name = row?.status_name;
				if (idKey && name) map.set(idKey, String(name));
			}
			statusNameByIdRef.current = map;
		} catch {
			// ignore (usaremos fallbacks)
		} finally {
			statusCatalogLoadedRef.current = true;
			statusCatalogLoadingRef.current = false;
		}
	}, [enabled]);

	useEffect(() => {
		loadStatusCatalog();
	}, [loadStatusCatalog]);

	const stateRef = useRef(state);
	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const vehicleId = useMemo(() => {
		return normalizeId(state.vehicle?.vehicle_id ?? state.vehicle?.id);
	}, [state.vehicle]);

	const driverId = useMemo(() => {
		return normalizeId(state.vehicle?.driver_id) || normalizeId(appUserId);
	}, [state.vehicle, appUserId]);

	const activeServiceId = useMemo(() => {
		return normalizeId(state.activeService?.service_id);
	}, [state.activeService]);

	const refetchInFlightRef = useRef(false);
	const lastRefetchAtRef = useRef(0);
	const pendingRefetchRef = useRef(false);
	const pendingSilentRef = useRef(null);
	const lastRealtimeSyncAtRef = useRef(0);
	const queueSyncInFlightRef = useRef(false);
	const queueLastSyncAtRef = useRef(0);

	// Notificaciones locales por Realtime (evitar duplicados)
	const lastServiceIdRef = useRef(null);
	const notifiedKeysRef = useRef(new Set());
	const notifiedKeysOrderRef = useRef([]);

	const markNotified = (key) => {
		const k = String(key || '');
		if (!k) return;
		if (notifiedKeysRef.current.has(k)) return;
		notifiedKeysRef.current.add(k);
		notifiedKeysOrderRef.current.push(k);
		// Limitar crecimiento (evita leaks en sesiones largas)
		if (notifiedKeysOrderRef.current.length > 60) {
			const toRemove = notifiedKeysOrderRef.current.splice(0, 20);
			for (const r of toRemove) notifiedKeysRef.current.delete(r);
		}
	};

	const notifyLocalService = useCallback(async ({ title, body, serviceId }) => {
		try {
			const sid = serviceId != null ? Number(serviceId) : null;
			if (!sid || Number.isNaN(sid)) return;

			try {
				await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			} catch {
				// ignore
			}

			// Sonido existente del proyecto (si falla, no bloquear)
			try {
				const { sound } = await Audio.Sound.createAsync(
					require('../assets/sounds/notification.wav'),
					{ shouldPlay: true }
				);
				setTimeout(() => {
					try {
						sound?.unloadAsync?.();
					} catch {
						// ignore
					}
				}, 2500);
			} catch {
				// ignore
			}

			await Notifications.scheduleNotificationAsync({
				content: {
					title: title || 'Nuevo servicio',
					body: body || 'Tienes un nuevo servicio disponible',
					data: { service_id: sid },
				},
				trigger: null,
			});
		} catch {
			// ignore
		}
	}, []);

	const refetch = useCallback(async ({ silent = false, force = false } = {}) => {
		if (!enabled) return;
		await loadStatusCatalog();
		if (refetchInFlightRef.current) {
			pendingRefetchRef.current = true;
			pendingSilentRef.current = pendingSilentRef.current == null
				? silent
				: (pendingSilentRef.current && silent);
			return;
		}
		const now = Date.now();
		// Evitar ráfagas de refetch por eventos Realtime/heartbeat.
		if (!force && silent && now - lastRefetchAtRef.current < 1200) return;
		lastRefetchAtRef.current = now;
		refetchInFlightRef.current = true;
		setState((s) => ({ ...s, loading: silent ? s.loading : true, error: '' }));
		try {
			// Resolver user_id del app_user una sola vez (para Realtime y fallbacks).
			if (!appUserIdReadyRef.current) {
				try {
					const { data: auth } = await supabase.auth.getUser();
					const authUser = auth?.user;
					if (authUser?.id) {
						const u = await supabase
							.from('app_users')
							.select('user_id')
							.eq('auth_id', authUser.id)
							.maybeSingle();
						if (!u.error && u.data?.user_id != null) {
							appUserIdRef.current = u.data.user_id;
							setAppUserId(u.data.user_id);
						}
					}
				} catch {
					// ignore
				} finally {
					appUserIdReadyRef.current = true;
				}
			}

			const json = await callEdgeFunction('driver-dashboard', { method: 'GET' });

			let vehicle = json?.vehicle ?? null;
			// En algunos payloads puede venir como `id` aunque en DB sea `vehicle_id`.
			const vehicleIdFromEdge = normalizeId(vehicle?.vehicle_id ?? vehicle?.id ?? json?.vehicle_id);

			// Consultar directamente el vehículo desde `vehicles` (fuente principal para datos del vehículo).
			// Si falla por RLS u otro motivo, mantenemos el objeto que venga del dashboard.
			const vehicleSelect =
				'vehicle_id, plate, type, brand, model, year, capacity_m3, is_active, is_available, driver_id, online, last_heartbeat, current_service_id';

			if (vehicleIdFromEdge) {
				try {
					const res = await supabase
						.from('vehicles')
						.select(vehicleSelect)
						.eq('vehicle_id', vehicleIdFromEdge)
						.maybeSingle();
					if (res.error) throw res.error;
					if (res.data) vehicle = { ...vehicle, ...res.data };
				} catch (e) {
					// eslint-disable-next-line no-console
					console.warn('[driver-dashboard] No se pudo leer vehicles (RLS?)', e?.message || e);
				}
			}

			// Fallback: si la Edge Function no trajo vehicle_id, resolver por driver_id del usuario actual.
			if (!vehicleIdFromEdge) {
				try {
						const fallbackDriverId = appUserIdRef.current;
						if (fallbackDriverId != null) {
							const v = await supabase
								.from('vehicles')
								.select(vehicleSelect)
								.eq('driver_id', fallbackDriverId)
								.eq('is_active', true)
								.order('vehicle_id', { ascending: false })
								.limit(1)
								.maybeSingle();
							if (v.error) throw v.error;
							if (v.data) vehicle = { ...vehicle, ...v.data };
						}
				} catch (e) {
					// eslint-disable-next-line no-console
					console.warn('[driver-dashboard] No se pudo resolver vehículo por driver_id', e?.message || e);
				}
			}

			let activeService = json?.active_service ?? null;
			// Importante: si Realtime ya colocó un servicio activo pero el dashboard aún no lo incluye,
			// NO lo borres; PERO evita preservar cuando el backend ya liberó el vehículo.
			if (!activeService && stateRef.current?.activeService) {
				const prev = stateRef.current.activeService;
				const prevId = normalizeId(prev?.service_id ?? prev?.id);
				const vehicleCurrentId = normalizeId(vehicle?.current_service_id ?? json?.vehicle?.current_service_id);
				const vehicleAvailable = vehicle?.is_available === true;

				// Si el vehículo ya no tiene servicio actual o ya está disponible, no preserves el servicio previo.
				if (!vehicleCurrentId || vehicleAvailable) {
					// no preserve
				} else {
					// Preservar solo si coincide con el current_service_id o si el realtime fue muy reciente.
					const realtimeWasRecent = Date.now() - (lastRealtimeSyncAtRef.current || 0) < 6000;
					if ((prevId && vehicleCurrentId && prevId === vehicleCurrentId) || realtimeWasRecent) {
						activeService = prev;
					}
				}
			}
			// Fallback: si el dashboard no trae active_service, resolverlo directo por driver_id.
			if (!activeService && appUserIdRef.current != null) {
				try {
					// Preferir view si existe (incluye status_name/substatus_name). Si falla, caer a tabla.
					let data;
					let error;
					try {
						const res = await supabase
							.from('services_full_view')
							.select('service_id, driver_id, vehicle_id, status_id, status_name, origin_address, destination_address, origin_location, destination_location, substatus_id, substatus_name, pause_reason_id')
							.eq('driver_id', appUserIdRef.current)
							.order('service_id', { ascending: false })
							.limit(5);
						if (res.error) throw res.error;
						data = Array.isArray(res.data)
							? (res.data.find((r) => !isTerminalServiceRow(r, statusNameByIdRef.current)) || null)
							: null;
						error = res.error;
					} catch {
						// ignore
					}

					if (!data && !error) {
						const res2 = await supabase
							.from('services')
							.select('service_id, driver_id, vehicle_id, status_id, origin_address, destination_address, origin_location, destination_location, substatus_id, pause_reason_id')
							.eq('driver_id', appUserIdRef.current)
							.order('service_id', { ascending: false })
							.limit(5);
						if (res2.error) throw res2.error;
						data = Array.isArray(res2.data)
							? (res2.data.find((r) => !isTerminalServiceRow(r, statusNameByIdRef.current)) || null)
							: null;
						error = res2.error;
					}

					if (error) throw error;
					if (data) activeService = data;
				} catch (e) {
					// eslint-disable-next-line no-console
					console.warn('[driver-dashboard] No se pudo resolver active_service (fallback)', e?.message || e);
				}
			}

			// Fallback 2: si el vehículo tiene current_service_id, resolver el servicio por id.
			// Esto cubre el caso donde `services.driver_id` todavía no está seteado.
			if (!activeService) {
				const currentServiceId = normalizeId(vehicle?.current_service_id ?? json?.vehicle?.current_service_id);
				if (currentServiceId) {
					try {
						let svc = null;
						try {
							const res = await supabase
								.from('services_full_view')
								.select('service_id, driver_id, vehicle_id, status_id, status_name, origin_address, destination_address, origin_location, destination_location, substatus_id, substatus_name, pause_reason_id')
								.eq('service_id', currentServiceId)
								.maybeSingle();
							if (res.error) throw res.error;
							svc = res.data;
						} catch {
							// ignore
						}
						if (!svc) {
							const res2 = await supabase
								.from('services')
								.select('service_id, driver_id, vehicle_id, status_id, origin_address, destination_address, origin_location, destination_location, substatus_id, pause_reason_id')
								.eq('service_id', currentServiceId)
								.maybeSingle();
							if (res2.error) throw res2.error;
							svc = res2.data;
						}
						if (svc && !isTerminalServiceRow(svc, statusNameByIdRef.current)) {
							activeService = svc;
						}
					} catch (e) {
						// eslint-disable-next-line no-console
						console.warn('[driver-dashboard] No se pudo resolver service por current_service_id', e?.message || e);
					}
				}
			}

			// Asegurar status_name normalizado cuando venga solo status_id.
			if (activeService && !activeService?.status_name) {
				const normalized = normalizeStatusNameFromRow(activeService, statusNameByIdRef.current);
				if (normalized) activeService = { ...activeService, status_name: normalized };
			}

			// Si el servicio resultó terminal, limpiarlo.
			if (activeService && isTerminalServiceRow(activeService, statusNameByIdRef.current)) {
				activeService = null;
			}

			// Guardia extra: si el vehículo ya quedó disponible y no reporta current_service_id,
			// nunca mostrar un servicio activo (evita UI stale tras DELIVERED/CANCELED).
			const finalVehicleCurrentId = normalizeId(vehicle?.current_service_id ?? json?.vehicle?.current_service_id);
			if (!finalVehicleCurrentId && vehicle?.is_available === true) {
				activeService = null;
			}

			if (!mountedRef.current) return;
			setState({
				loading: false,
				error: '',
				vehicle,
				activeService,
				deliveredToday: Number(json?.stats?.delivered_today ?? 0) || 0,
				canceledToday: Number(json?.stats?.canceled_today ?? 0) || 0,
			});
		} catch (e) {
			if (!mountedRef.current) return;
			if (!isOnline) {
				// En offline no bloquear el dashboard con error global.
				setState((s) => ({
					...s,
					loading: false,
					error: '',
				}));
				return;
			}
			setState((s) => ({
				...s,
				loading: false,
				error: e?.message || 'No se pudo cargar el dashboard del conductor',
			}));
		} finally {
			refetchInFlightRef.current = false;

			// Si mientras estábamos en vuelo llegó un evento realtime (servicio asignado / vehículo update),
			// ejecutar un refetch inmediatamente (saltándose el throttle) para reducir latencia percibida.
			if (pendingRefetchRef.current && enabled) {
				pendingRefetchRef.current = false;
				const nextSilent = pendingSilentRef.current == null ? true : pendingSilentRef.current;
				pendingSilentRef.current = null;
				setTimeout(() => {
					refetch({ silent: nextSilent, force: true });
				}, 0);
			}
		}
	}, [enabled, loadStatusCatalog]);

	// Asegurar que appUserId esté resuelto lo antes posible para Realtime.
	useEffect(() => {
		let cancelled = false;
		if (!enabled) return;
		if (appUserIdReadyRef.current && appUserIdRef.current != null) return;
		(async () => {
			try {
				const { data: auth } = await supabase.auth.getUser();
				const authUser = auth?.user;
				if (!authUser?.id) return;
				const u = await supabase
					.from('app_users')
					.select('user_id')
					.eq('auth_id', authUser.id)
					.maybeSingle();
				if (u.error) throw u.error;
				if (!cancelled && u.data?.user_id != null) {
					appUserIdRef.current = u.data.user_id;
					setAppUserId(u.data.user_id);
				}
			} catch {
				// ignore
			} finally {
				if (!cancelled) appUserIdReadyRef.current = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [enabled]);

	useEffect(() => {
		if (!enabled) return;
		refetch({ silent: false });
	}, [enabled, refetch]);

	const refreshOfflineQueueCount = useCallback(async () => {
		try {
			const count = await getOfflineEventsCount();
			if (mountedRef.current) setPendingOfflineEvents(count);
		} catch {
			// ignore
		}
	}, []);

	const runOfflineQueueSync = useCallback(async ({ force = false } = {}) => {
		if (!enabled) return { processed: 0, remaining: pendingOfflineEvents, skipped: true };
		if (!isOnline) return { processed: 0, remaining: pendingOfflineEvents, skipped: true };

		let freshCount = pendingOfflineEvents;
		try {
			freshCount = await getOfflineEventsCount();
			if (mountedRef.current && freshCount !== pendingOfflineEvents) {
				setPendingOfflineEvents(freshCount);
			}
		} catch {
			// ignore
		}

		if (!force && freshCount <= 0) return { processed: 0, remaining: 0, skipped: true };
		if (queueSyncInFlightRef.current) return { processed: 0, remaining: pendingOfflineEvents, skipped: true };

		const now = Date.now();
		if (!force && now - (queueLastSyncAtRef.current || 0) < 1500) {
			return { processed: 0, remaining: pendingOfflineEvents, skipped: true };
		}
		queueLastSyncAtRef.current = now;

		queueSyncInFlightRef.current = true;
		try {
			const result = await syncOfflineEventsQueue(async (ev) => {
				try {
					await callEdgeFunction('driver-service-response', {
						method: 'POST',
						body: {
							event_id: ev?.event_id || undefined,
							service_id: Number(ev?.service_id),
							status: ev?.status || undefined,
							substatus: ev?.substatus || undefined,
							pause_reason_id: ev?.pause_reason_id ?? undefined,
							latitude: ev?.latitude ?? null,
							longitude: ev?.longitude ?? null,
							created_at: ev?.created_at || new Date().toISOString(),
						},
						timeout: 20000,
					});
				} catch (e) {
					if (isIgnorableQueueSyncError(e)) return { ack: true };
					throw e;
				}
				return { ack: true };
			});

			if (mountedRef.current) {
				setPendingOfflineEvents(result?.remaining || 0);
			}

			if ((result?.processed || 0) > 0) {
				refetch({ silent: true, force: true });
			}

			return result;
		} catch (e) {
			return { processed: 0, remaining: freshCount, skipped: false, error: e };
		} finally {
			queueSyncInFlightRef.current = false;
			refreshOfflineQueueCount();
		}
	}, [enabled, isOnline, pendingOfflineEvents, refetch, refreshOfflineQueueCount]);

	useEffect(() => {
		if (!enabled) return;
		refreshOfflineQueueCount();
	}, [enabled, refreshOfflineQueueCount]);

	useEffect(() => {
		if (!enabled) return;

		const active = state.activeService;
		const sid = normalizeId(active?.service_id ?? active?.id);
		const status = normalizeStatusNameFromRow(active, statusNameByIdRef.current);
		const isTerminal = TERMINAL_SERVICE_STATUSES.has(status);

		(async () => {
			try {
				if (!active || !sid || isTerminal) {
					await clearPersistedActiveTrip();
					return;
				}

				await persistActiveTrip({
					active_service_id: active?.service_id ?? active?.id,
					service: active,
					status,
					substatus: String(active?.substatus_name || '').toUpperCase(),
				});
			} catch {
				// ignore
			}
		})();
	}, [enabled, state.activeService]);

	useEffect(() => {
		if (!enabled) return;
		if (!isOnline) return;
		runOfflineQueueSync();
	}, [enabled, isOnline, runOfflineQueueSync]);

	// Realtime: si cambia el vehículo del conductor, actualizar localmente.
	useEffect(() => {
		if (!enabled || !vehicleId) return;

		const channel = supabase
			.channel(`driver-dashboard-vehicle-${vehicleId}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
				const row = payload?.new;
				const updatedId = normalizeId(row?.vehicle_id ?? row?.id);
				if (!updatedId || updatedId !== vehicleId) return;

				// Evitar recargar todo: merge directo del vehículo.
				if (mountedRef.current) {
					setState((s) => ({
						...s,
						vehicle: s.vehicle ? { ...s.vehicle, ...row } : row,
					}));
				}

				// Si cambia el servicio actual, ahí sí refrescar (pero en modo silencioso).
				const prev = stateRef.current?.vehicle;
				const prevServiceId = normalizeId(prev?.current_service_id);
				const nextServiceId = normalizeId(row?.current_service_id);
				if (prevServiceId !== nextServiceId) {
					refetch({ silent: true });
				}
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, vehicleId, refetch]);

	// Realtime: si cambia el servicio activo actual, refrescar dashboard (silencioso).
	useEffect(() => {
		if (!enabled || !activeServiceId) return;

		const channel = supabase
			.channel(`driver-dashboard-service-${activeServiceId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'services', filter: `service_id=eq.${activeServiceId}` },
				() => {
					refetch({ silent: true });
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, activeServiceId, refetch]);

	// Realtime: detectar servicios nuevos/actualizados asignados al conductor.
	// Esto cubre el caso donde NO se actualiza `vehicles.current_service_id` al crear el servicio.
	useEffect(() => {
		if (!enabled || !driverId) return;

		const shouldNotifyNewService = (row, eventType) => {
			if (!row) return false;
			if (eventType !== 'INSERT' && eventType !== 'UPDATE') return false;
			const statusUpper = normalizeStatusNameFromRow(row, statusNameByIdRef.current);
			if (statusUpper !== 'CREATED') return false;
			const sid = normalizeId(row?.service_id ?? row?.id);
			if (!sid) return false;
			if (lastServiceIdRef.current && String(lastServiceIdRef.current) === String(sid)) return false;
			return true;
		};

		const maybeNotify = async (row, eventType) => {
			if (!row) return;
			const sid = normalizeId(row?.service_id ?? row?.id);
			if (!sid) return;
			const statusUpper = normalizeStatusNameFromRow(row, statusNameByIdRef.current);

			// 1) NUEVO SERVICIO
			if (shouldNotifyNewService(row, eventType)) {
				lastServiceIdRef.current = sid;
				markNotified(`${sid}:CREATED`);
				await notifyLocalService({
					title: 'Nuevo servicio',
					body: 'Tienes un nuevo servicio disponible',
					serviceId: sid,
				});
				return;
			}

			// 2) BONUS: CANCELADO (una vez por servicio)
			if (statusUpper === 'CANCELED') {
				// Si el conductor canceló/rechazó desde el frontend, no mostrar una notificación
				// que diga "El coordinador canceló".
				if (consumeDriverCanceled(sid)) return;

				const key = `${sid}:CANCELED`;
				if (!notifiedKeysRef.current.has(key)) {
					markNotified(key);
					await notifyLocalService({
						title: 'Servicio cancelado',
						body: 'El coordinador canceló el servicio',
						serviceId: sid,
					});
				}
			}
		};

		const applyServiceRowToState = (row) => {
			if (!row) return;
			const serviceId = normalizeId(row?.service_id ?? row?.id);
			if (!serviceId) return;
			const normalizedStatusName = normalizeStatusNameFromRow(row, statusNameByIdRef.current);

			setState((s) => {
				const prevActiveId = normalizeId(s?.activeService?.service_id ?? s?.activeService?.id);
				const isTerminal = isTerminalServiceRow(row, statusNameByIdRef.current);

				// Si el servicio actual se volvió terminal, limpiarlo.
				if (isTerminal && prevActiveId && prevActiveId === serviceId) {
					return { ...s, activeService: null };
				}

				// Si llega un servicio no-terminal asignado, mostrarlo inmediatamente.
				if (!isTerminal) {
					const merged = s.activeService && prevActiveId === serviceId
						? { ...s.activeService, ...row, status_name: normalizedStatusName || s.activeService?.status_name, service_id: row?.service_id ?? s.activeService?.service_id }
						: { ...row, status_name: normalizedStatusName, service_id: row?.service_id ?? serviceId };
					return { ...s, activeService: merged };
				}

				return s;
			});
		};

		const scheduleDashboardSync = () => {
			const now = Date.now();
			// Evitar que un aluvión de eventos realtime dispare refetch en bucle.
			if (now - (lastRealtimeSyncAtRef.current || 0) < 900) return;
			lastRealtimeSyncAtRef.current = now;
			refetch({ silent: true });
		};

		const channel = supabase
			.channel(`driver-dashboard-services-driver-${driverId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'services', filter: `driver_id=eq.${driverId}` },
				(payload) => {
					const row = (payload?.eventType === 'DELETE' ? payload?.old : payload?.new) || null;
					maybeNotify(row, payload?.eventType);
					// 1) Reacción inmediata en UI
					applyServiceRowToState(row);
					// 2) Sync completo (detalles + stats) en background
					scheduleDashboardSync();
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, driverId, notifyLocalService, refetch]);

	// Realtime (respaldo): detectar cambios en services por vehicle_id.
	// Útil cuando el coordinador crea el servicio y aún no existe driver_id.
	useEffect(() => {
		if (!enabled || !vehicleId) return;

		const applyServiceRowToState = (row) => {
			if (!row) return;
			const serviceId = normalizeId(row?.service_id ?? row?.id);
			if (!serviceId) return;
			const normalizedStatusName = normalizeStatusNameFromRow(row, statusNameByIdRef.current);

			setState((s) => {
				const prevActiveId = normalizeId(s?.activeService?.service_id ?? s?.activeService?.id);
				const isTerminal = isTerminalServiceRow(row, statusNameByIdRef.current);

				if (isTerminal && prevActiveId && prevActiveId === serviceId) {
					return { ...s, activeService: null };
				}

				if (!isTerminal) {
					const merged = s.activeService && prevActiveId === serviceId
						? { ...s.activeService, ...row, status_name: normalizedStatusName || s.activeService?.status_name, service_id: row?.service_id ?? s.activeService?.service_id }
						: { ...row, status_name: normalizedStatusName, service_id: row?.service_id ?? serviceId };
					return { ...s, activeService: merged };
				}

				return s;
			});
		};

		const scheduleDashboardSync = () => {
			const now = Date.now();
			if (now - (lastRealtimeSyncAtRef.current || 0) < 900) return;
			lastRealtimeSyncAtRef.current = now;
			refetch({ silent: true });
		};

		const channel = supabase
			.channel(`driver-dashboard-services-vehicle-${vehicleId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'services', filter: `vehicle_id=eq.${vehicleId}` },
				(payload) => {
					const row = (payload?.eventType === 'DELETE' ? payload?.old : payload?.new) || null;
					applyServiceRowToState(row);
					scheduleDashboardSync();
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, vehicleId, refetch]);

	const setAvailability = useCallback(
		async (nextAvailable) => {
			if (!vehicleId) return;
			setState((s) => ({
				...s,
				error: '',
				vehicle: s.vehicle ? { ...s.vehicle, is_available: nextAvailable } : s.vehicle,
			}));
			try {
				// Intento directo (si RLS lo permite). Si no, el usuario verá error.
				const res = await supabase
					.from('vehicles')
					.update({ is_available: nextAvailable })
					.eq('vehicle_id', vehicleId)
					.select('vehicle_id');
				if (res.error) throw res.error;
				// Refrescar para mantener consistencia (por si backend cambia más campos)
				refetch();
			} catch (e) {
				if (!mountedRef.current) return;
				setState((s) => ({
					...s,
					error: e?.message || 'No se pudo actualizar disponibilidad',
				}));
			}
		},
		[vehicleId, refetch]
	);

	return {
		loading: state.loading,
		error: state.error,
		vehicle: state.vehicle,
		vehicleId,
		activeService: state.activeService,
		deliveredToday: state.deliveredToday,
		canceledToday: state.canceledToday,
		pendingOfflineEvents,
		syncPendingOfflineEvents: runOfflineQueueSync,
		refetch,
		setAvailability,
	};
}
