import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

function normalizeId(val) {
	if (val === null || val === undefined) return null;
	return String(val);
}

function toNumber(val) {
	const n = Number(val);
	return Number.isFinite(n) ? n : null;
}

function extractDriverIdFromRow(row) {
	if (!row || typeof row !== 'object') return null;
	// Convenciones comunes: user_id (vista), id (tabla), etc.
	const candidates = [row.user_id, row.id, row.app_user_id, row.profile_id];
	for (const c of candidates) {
		const n = toNumber(c);
		if (n != null) return n;
	}
	return null;
}

export function useDriverVehicle(enabled) {
	const [state, setState] = useState({
		loading: false,
		error: '',
		driverId: null,
		vehicle: null,
	});

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const vehicleId = useMemo(() => {
		const v = state.vehicle;
		return normalizeId(v?.vehicle_id ?? v?.id);
	}, [state.vehicle]);

	// Realtime: mantener online/offline y campos del vehículo al día.
	useEffect(() => {
		if (!enabled || !vehicleId) return;

		const channel = supabase
			.channel(`vehicles-online-driver-${vehicleId}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
				const row = payload?.new;
				const updatedId = normalizeId(row?.vehicle_id ?? row?.id);
				if (!updatedId || updatedId !== vehicleId) return;
				if (!mountedRef.current) return;
				setState((s) => ({
					...s,
					vehicle: s.vehicle ? { ...s.vehicle, ...row } : row,
				}));
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [enabled, vehicleId]);

	const refetch = useCallback(async () => {
		if (!enabled) return;
		setState((s) => ({ ...s, loading: true, error: '' }));
		try {
			const { data: auth } = await supabase.auth.getUser();
			const authUser = auth?.user;
			if (!authUser?.id) throw new Error('Sesión no válida');

			// Resolver el conductor actual: preferir app_users, fallback a la vista usada en MainScreen.
			let driverId = null;
			try {
				const { data: appUser, error: appUserErr } = await supabase
					.from('app_users')
					.select('*')
					.eq('auth_id', authUser.id)
					.maybeSingle();
				if (appUserErr) throw appUserErr;
				driverId = extractDriverIdFromRow(appUser);
			} catch {
				// Ignorar y probar con la vista
			}

			if (!driverId) {
				const { data: row, error: viewErr } = await supabase
					.from('user_active_role_permissions')
					.select('*')
					.eq('auth_id', authUser.id)
					.maybeSingle();
				if (viewErr) throw viewErr;
				driverId = extractDriverIdFromRow(row);
			}

			if (!driverId) throw new Error('No se pudo resolver el conductor actual');

			// Buscar vehículo del conductor
			let vehicleRow = null;
			try {
				const { data, error } = await supabase
					.from('vehicles')
					.select('*')
					.eq('driver_id', driverId)
					.order('vehicle_id', { ascending: false })
					.limit(1)
					.maybeSingle();
				if (error) throw error;
				vehicleRow = data;
			} catch {
				const { data, error } = await supabase
					.from('vehicles')
					.select('*')
					.eq('driver_id', driverId)
					.order('id', { ascending: false })
					.limit(1)
					.maybeSingle();
				if (error) throw error;
				vehicleRow = data;
			}

			const isActive = vehicleRow?.is_active === true || vehicleRow?.is_active === 1 || vehicleRow?.is_active === 'true';
			if (!vehicleRow || !isActive) {
				if (!mountedRef.current) return;
				setState({ loading: false, error: 'No tienes un vehículo activo asignado.', driverId, vehicle: null });
				return;
			}

			if (!mountedRef.current) return;
			setState({ loading: false, error: '', driverId, vehicle: vehicleRow });
		} catch (e) {
			if (!mountedRef.current) return;
			setState((s) => ({ ...s, loading: false, error: e?.message || 'Error cargando vehículo', vehicle: null }));
		}
	}, [enabled]);

	useEffect(() => {
		if (!enabled) return;
		refetch();
	}, [enabled, refetch]);

	const setAvailability = useCallback(
		async (nextAvailable) => {
			if (!vehicleId) return;
			setState((s) => ({ ...s, error: '' }));
			try {
				// Update por vehicle_id; si no afecta filas, fallback por id.
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

				if (!mountedRef.current) return;
				setState((s) => ({
					...s,
					vehicle: s.vehicle ? { ...s.vehicle, is_available: nextAvailable } : s.vehicle,
				}));
			} catch (e) {
				if (!mountedRef.current) return;
				setState((s) => ({ ...s, error: e?.message || 'No se pudo actualizar disponibilidad' }));
			}
		},
		[vehicleId]
	);

	return {
		loading: state.loading,
		error: state.error,
		driverId: state.driverId,
		vehicle: state.vehicle,
		vehicleId,
		refetch,
		setAvailability,
	};
}
