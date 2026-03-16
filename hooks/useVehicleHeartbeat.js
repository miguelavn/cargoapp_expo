import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { callEdgeFunction } from '../api/edgeFunctions';

export function useVehicleHeartbeat({ enabled, intervalMs = 10000, timeoutMs = 20000 }) {
	const intervalRef = useRef(null);
	const inFlightRef = useRef(false);

	useEffect(() => {
		const stop = () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
			// Si la app se fue a background, permitimos un tick inmediato al volver.
			inFlightRef.current = false;
		};

		const tick = async ({ force = false } = {}) => {
			if (!enabled) return;
			if (inFlightRef.current && !force) return;
			inFlightRef.current = true;
			try {
				await callEdgeFunction('driver-heartbeat', { method: 'POST', timeout: timeoutMs });
			} catch (e) {
				// eslint-disable-next-line no-console
				console.warn('[heartbeat] Error llamando driver-heartbeat', e?.message || e);
			} finally {
				inFlightRef.current = false;
			}
		};

		const start = ({ forceImmediate = false } = {}) => {
			stop();
			if (!enabled) return;
			// Ejecutar una vez inmediato
			tick({ force: forceImmediate });
			intervalRef.current = setInterval(tick, intervalMs);
		};

		const onAppStateChange = (next) => {
			if (next === 'active') start({ forceImmediate: true });
			else stop();
		};

		const sub = AppState.addEventListener('change', onAppStateChange);
		if (AppState.currentState === 'active') start({ forceImmediate: true });

		return () => {
			stop();
			sub.remove();
		};
	}, [enabled, intervalMs, timeoutMs]);
}
