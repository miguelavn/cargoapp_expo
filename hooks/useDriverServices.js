import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const TERMINAL_STATUS_IDS = [4, 5]; // DELIVERED, CANCELED

function startOfDayISO(d = new Date()) {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x.toISOString();
}
function endOfDayISO(d = new Date()) {
	const x = new Date(d);
	x.setHours(24, 0, 0, 0);
	return x.toISOString();
}

export function useDriverServices(driverId, enabled) {
	const [state, setState] = useState({
		loading: false,
		error: '',
		activeService: null,
		deliveredToday: 0,
		canceledToday: 0,
	});

	const driverIdRef = useRef(driverId);
	useEffect(() => {
		driverIdRef.current = driverId;
	}, [driverId]);

	const refetch = useCallback(async () => {
		if (!enabled || !driverIdRef.current) return;
		const did = driverIdRef.current;

		setState((s) => ({ ...s, loading: true, error: '' }));
		try {
			// 1) Servicio activo: el más reciente que NO esté DELIVERED/CANCELED
			let active = null;

			// Preferir vista si existe
			try {
				const { data, error } = await supabase
					.from('services_full_view')
					.select('*')
					.eq('driver_id', did)
					.order('service_id', { ascending: false })
					.limit(10);
				if (error) throw error;
				const rows = Array.isArray(data) ? data : [];
				active = rows.find((r) => !TERMINAL_STATUS_IDS.includes(Number(r?.status_id))) || null;
			} catch {
				const { data, error } = await supabase
					.from('services')
					.select('*')
					.eq('driver_id', did)
					.order('service_id', { ascending: false })
					.limit(10);
				if (error) throw error;
				const rows = Array.isArray(data) ? data : [];
				active = rows.find((r) => !TERMINAL_STATUS_IDS.includes(Number(r?.status_id))) || null;
			}

			// 2) Historial del día (contadores)
			const start = startOfDayISO();
			const end = endOfDayISO();

			let delivered = 0;
			let canceled = 0;
			try {
				const d1 = await supabase
					.from('services')
					.select('service_id', { count: 'exact', head: true })
					.eq('driver_id', did)
					.eq('status_id', 4)
					.gte('created_at', start)
					.lt('created_at', end);
				delivered = d1.count ?? 0;

				const c1 = await supabase
					.from('services')
					.select('service_id', { count: 'exact', head: true })
					.eq('driver_id', did)
					.eq('status_id', 5)
					.gte('created_at', start)
					.lt('created_at', end);
				canceled = c1.count ?? 0;
			} catch {
				// Fallback: traer filas del día y contar
				const { data } = await supabase
					.from('services')
					.select('status_id, created_at')
					.eq('driver_id', did)
					.gte('created_at', start)
					.lt('created_at', end);
				const rows = Array.isArray(data) ? data : [];
				delivered = rows.filter((r) => Number(r?.status_id) === 4).length;
				canceled = rows.filter((r) => Number(r?.status_id) === 5).length;
			}

			setState({
				loading: false,
				error: '',
				activeService: active,
				deliveredToday: delivered,
				canceledToday: canceled,
			});
		} catch (e) {
			setState((s) => ({
				...s,
				loading: false,
				error: e?.message || 'Error cargando servicios',
			}));
		}
	}, [enabled]);

	useEffect(() => {
		if (!enabled || !driverId) return;
		refetch();
	}, [enabled, driverId, refetch]);

	// Realtime: services changes filtered by driver_id
	useEffect(() => {
		if (!enabled || !driverId) return;

		const channel = supabase
			.channel(`driver-services-realtime-${driverId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'services', filter: `driver_id=eq.${driverId}` },
				() => {
					refetch();
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, driverId, refetch]);

	return useMemo(
		() => ({
			loading: state.loading,
			error: state.error,
			activeService: state.activeService,
			deliveredToday: state.deliveredToday,
			canceledToday: state.canceledToday,
			refetch,
		}),
		[state, refetch]
	);
}
