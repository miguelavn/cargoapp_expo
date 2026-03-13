import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { callEdgeFunction } from '../api/edgeFunctions';

export function useVehicleHeartbeat({ enabled, intervalMs = 10000 }) {
	const intervalRef = useRef(null);

	useEffect(() => {
		const stop = () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};

		const tick = async () => {
			if (!enabled) return;
			try {
				await callEdgeFunction('driver-heartbeat', { method: 'POST', timeout: 8000 });
			} catch {
				// eslint-disable-next-line no-console
				console.warn('[heartbeat] Error llamando driver-heartbeat');
			}
		};

		const start = () => {
			stop();
			if (!enabled) return;
			// Ejecutar una vez inmediato
			tick();
			intervalRef.current = setInterval(tick, intervalMs);
		};

	const onAppStateChange = (next) => {
			if (next === 'active') start();
			else stop();
		};

		const sub = AppState.addEventListener('change', onAppStateChange);
		if (AppState.currentState === 'active') start();

		return () => {
			stop();
			sub.remove();
		};
	}, [enabled, intervalMs]);
}
