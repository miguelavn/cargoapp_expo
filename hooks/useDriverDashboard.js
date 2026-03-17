import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { callEdgeFunction } from '../api/edgeFunctions';

function normalizeId(val) {
	if (val === null || val === undefined) return null;
	return String(val);
}

const TERMINAL_SERVICE_STATUSES = new Set(['DELIVERED', 'CANCELED']);

function isTerminalService(statusName) {
	return TERMINAL_SERVICE_STATUSES.has(String(statusName || '').toUpperCase());
}

export function useDriverDashboard(enabled) {
	const [state, setState] = useState({
		loading: false,
		error: '',
		vehicle: null,
		activeService: null,
		deliveredToday: 0,
		canceledToday: 0,
	});

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
		return normalizeId(state.vehicle?.driver_id);
	}, [state.vehicle]);

	const activeServiceId = useMemo(() => {
		return normalizeId(state.activeService?.service_id);
	}, [state.activeService]);

	const refetchInFlightRef = useRef(false);
	const lastRefetchAtRef = useRef(0);
	const pendingRefetchRef = useRef(false);
	const pendingSilentRef = useRef(null);
	const lastRealtimeSyncAtRef = useRef(0);

	const refetch = useCallback(async ({ silent = false, force = false } = {}) => {
		if (!enabled) return;
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
					const { data: auth } = await supabase.auth.getUser();
					const authUser = auth?.user;
					if (authUser?.id) {
						const u = await supabase
							.from('app_users')
							.select('user_id')
							.eq('auth_id', authUser.id)
							.maybeSingle();
						if (u.error) throw u.error;
						const driverId = u.data?.user_id;
						if (driverId != null) {
							const v = await supabase
								.from('vehicles')
								.select(vehicleSelect)
								.eq('driver_id', driverId)
								.eq('is_active', true)
								.order('vehicle_id', { ascending: false })
								.limit(1)
								.maybeSingle();
							if (v.error) throw v.error;
							if (v.data) vehicle = { ...vehicle, ...v.data };
						}
					}
				} catch (e) {
					// eslint-disable-next-line no-console
					console.warn('[driver-dashboard] No se pudo resolver vehículo por driver_id', e?.message || e);
				}
			}

			if (!mountedRef.current) return;
			setState({
				loading: false,
				error: '',
				vehicle,
				activeService: json?.active_service ?? null,
				deliveredToday: Number(json?.stats?.delivered_today ?? 0) || 0,
				canceledToday: Number(json?.stats?.canceled_today ?? 0) || 0,
			});
		} catch (e) {
			if (!mountedRef.current) return;
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
	}, [enabled]);

	useEffect(() => {
		if (!enabled) return;
		refetch({ silent: false });
	}, [enabled, refetch]);

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

		const applyServiceRowToState = (row) => {
			if (!row) return;
			const serviceId = normalizeId(row?.service_id ?? row?.id);
			if (!serviceId) return;

			setState((s) => {
				const prevActiveId = normalizeId(s?.activeService?.service_id ?? s?.activeService?.id);
				const nextStatusName = String(row?.status_name || row?.status || '').toUpperCase();
				const isTerminal = isTerminalService(nextStatusName);

				// Si el servicio actual se volvió terminal, limpiarlo.
				if (isTerminal && prevActiveId && prevActiveId === serviceId) {
					return { ...s, activeService: null };
				}

				// Si llega un servicio no-terminal asignado, mostrarlo inmediatamente.
				if (!isTerminal) {
					const merged = s.activeService && prevActiveId === serviceId
						? { ...s.activeService, ...row, service_id: row?.service_id ?? s.activeService?.service_id }
						: { ...row, service_id: row?.service_id ?? serviceId };
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
	}, [enabled, driverId, refetch]);

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
		refetch,
		setAvailability,
	};
}
