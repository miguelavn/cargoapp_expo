import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { callEdgeFunction } from '../api/edgeFunctions';

function normalizeId(val) {
	if (val === null || val === undefined) return null;
	return String(val);
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

	const activeServiceId = useMemo(() => {
		return normalizeId(state.activeService?.service_id);
	}, [state.activeService]);

	const refetch = useCallback(async () => {
		if (!enabled) return;
		setState((s) => ({ ...s, loading: true, error: '' }));
		try {
			const json = await callEdgeFunction('driver-dashboard', { method: 'GET' });
			if (!mountedRef.current) return;
			setState({
				loading: false,
				error: '',
				vehicle: json?.vehicle ?? null,
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
		}
	}, [enabled]);

	useEffect(() => {
		if (!enabled) return;
		refetch();
	}, [enabled, refetch]);

	// Realtime: si cambia el vehículo del conductor, refrescar dashboard.
	useEffect(() => {
		if (!enabled || !vehicleId) return;

		const channel = supabase
			.channel(`driver-dashboard-vehicle-${vehicleId}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
				const row = payload?.new;
				const updatedId = normalizeId(row?.vehicle_id ?? row?.id);
				if (!updatedId || updatedId !== vehicleId) return;
				refetch();
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, vehicleId, refetch]);

	// Realtime: si cambia el servicio activo actual, refrescar dashboard.
	useEffect(() => {
		if (!enabled || !activeServiceId) return;

		const channel = supabase
			.channel(`driver-dashboard-service-${activeServiceId}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'services', filter: `service_id=eq.${activeServiceId}` },
				() => {
					refetch();
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, activeServiceId, refetch]);

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
				let res = await supabase
					.from('vehicles')
					.update({ is_available: nextAvailable })
					.eq('vehicle_id', vehicleId)
					.select('vehicle_id, id');
				if (res.error) throw res.error;
				if (!Array.isArray(res.data) || res.data.length === 0) {
					res = await supabase
						.from('vehicles')
						.update({ is_available: nextAvailable })
						.eq('id', vehicleId)
						.select('vehicle_id, id');
					if (res.error) throw res.error;
				}
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
