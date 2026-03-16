import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { COLORS } from '../../../theme/colors';
import { usePermissions } from '../../../contexts/PermissionsContext';
import DriverAvailabilityToggle from '../../../components/DriverAvailabilityToggle';
import { useVehicleHeartbeat } from '../../../hooks/useVehicleHeartbeat';
import { useDriverDashboard } from '../../../hooks/useDriverDashboard';
import { useIsOnline } from '../../../hooks/useIsOnline';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { supabase } from '../../../supabaseClient';

function hasPerm(perms = [], needle) {
	const n = String(needle).toLowerCase();
	return (perms || []).some((p) => String(p?.permission_name || p).toLowerCase() === n);
}

export default function DriverHomeScreen() {
	const { permissions } = usePermissions();
	const isDriver = useMemo(
		() => hasPerm(permissions, 'view_the_services_assigned_to_me_at_my_company'),
		[permissions]
	);

	const greeting = useMemo(() => {
		const h = new Date().getHours();
		if (h < 12) return 'Buenos días';
		if (h < 19) return 'Buenas tardes';
		return 'Buenas noches';
	}, []);

	const [driverFirstName, setDriverFirstName] = useState('');
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!isDriver) return;
			try {
				const { data: auth } = await supabase.auth.getUser();
				const authUser = auth?.user;
				if (!authUser?.id) return;

				const { data: appUser, error: appUserErr } = await supabase
					.from('app_users')
					.select('display_name, name')
					.eq('auth_id', authUser.id)
					.maybeSingle();
				if (appUserErr) return;
				const rawName = String(appUser?.name || appUser?.display_name || '').trim();
				const first = rawName ? rawName.split(/\s+/)[0] : '';
				if (!cancelled) setDriverFirstName(first);
			} catch {
				// ignore
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [isDriver]);

	const greetingText = useMemo(() => {
		return driverFirstName ? `${greeting} ${driverFirstName}` : greeting;
	}, [greeting, driverFirstName]);

	const {
		loading,
		error,
		vehicle,
		activeService,
		deliveredToday,
		canceledToday,
		setAvailability,
		refetch,
	} = useDriverDashboard(isDriver);

	const [serviceActionLoading, setServiceActionLoading] = useState('');
	const [serviceActionError, setServiceActionError] = useState('');
	const serviceActionInFlightRef = useRef(false);
	const lastServiceIdRef = useRef(null);
	const alertSoundRef = useRef(null);
	const alertSoundLoadingRef = useRef(false);
	const insets = useSafeAreaInsets();
	const isConnected = useIsOnline();

	const heartbeatEnabled = isDriver && vehicle?.is_active === true;
	useVehicleHeartbeat({ enabled: heartbeatEnabled });

	if (!isDriver) return null;

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={COLORS.primary} />
				<Text style={styles.muted}>Cargando dashboard…</Text>
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorTitle}>{error}</Text>
			</View>
		);
	}

	const plate = String(vehicle?.plate || vehicle?.plate_number || vehicle?.name || '—');
	const brand = String(vehicle?.brand || '—');
	const model = String(vehicle?.model || '—');
	const type = String(vehicle?.type || '—');
	const capacityText = vehicle?.capacity_m3 != null && String(vehicle.capacity_m3).trim() !== ''
		? `${vehicle.capacity_m3} m³`
		: '—';
	const available = !!vehicle?.is_available;
	const realOnline = isConnected && vehicle?.online === true;
	const isServiceRequested =
		!!activeService && String(activeService?.status_name || '').toUpperCase() === 'CREATED';
	const statusNameUpper = String(activeService?.status_name || '').toUpperCase();
	const hasNonTerminalActiveService =
		!!activeService && statusNameUpper !== 'CANCELED' && statusNameUpper !== 'DELIVERED';
	const canToggleAvailability = !hasNonTerminalActiveService;

	const playAlert = async () => {
		try {
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

			if (!alertSoundRef.current && !alertSoundLoadingRef.current) {
				alertSoundLoadingRef.current = true;
				try {
					const { sound } = await Audio.Sound.createAsync(
						require('../../../assets/sounds/notification.wav'),
						{ shouldPlay: false }
					);
					alertSoundRef.current = sound;
				} finally {
					alertSoundLoadingRef.current = false;
				}
			}

			if (alertSoundRef.current?.replayAsync) {
				await alertSoundRef.current.replayAsync();
			}
		} catch (e) {
			console.warn('Error reproduciendo alerta', e);
		}
	};

	useEffect(() => {
		return () => {
			try {
				alertSoundRef.current?.unloadAsync?.();
			} catch {
				// ignore
			}
			alertSoundRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!activeService) return;
		const isCreated = String(activeService?.status_name || '').toUpperCase() === 'CREATED';
		const serviceId = activeService?.service_id;
		const isNewService = !!serviceId && serviceId !== lastServiceIdRef.current;
		if (isCreated && isNewService) {
			playAlert();
			lastServiceIdRef.current = serviceId;
		}
	}, [activeService]);

	const respondToService = async (action) => {
		if (!activeService?.service_id) return;

		// evitar doble ejecución (doble tap)
		if (serviceActionLoading) return;
		if (serviceActionInFlightRef.current) return;
		serviceActionInFlightRef.current = true;

		setServiceActionError('');
		setServiceActionLoading(action);
		try {
			await callEdgeFunction('driver-service-response', {
				method: 'POST',
				body: { service_id: activeService.service_id, action },
				timeout: 20000,
			});
			await refetch({ silent: true });
		} catch (e) {
			setServiceActionError(e?.message || 'No se pudo actualizar el servicio');
		} finally {
			setServiceActionLoading('');
			serviceActionInFlightRef.current = false;
		}
	};

	return (
		<SafeAreaView
			edges={['left', 'right']}
			style={[
				styles.screen,
				{
					paddingTop: insets.top + 22,
					paddingBottom: insets.bottom + 100,
				},
			]}
		>
			<View style={styles.header}>
				<Text style={styles.headerOverline}>Conductor</Text>
				<View style={styles.titleRow}>
					<Text style={styles.headerTitle}>{greetingText}</Text>
					<View style={styles.onlineBadge}>
						<View style={[styles.dot, realOnline ? styles.dotOn : styles.dotOff]} />
						<Text style={styles.onlineText}>
							{!isConnected ? 'Sin conexión' : realOnline ? 'Online' : 'Offline'}
						</Text>
					</View>
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Vehículo asignado</Text>
				<View style={styles.card}>
					<Text style={styles.cardTitle}>{plate}</Text>
					<Text style={styles.cardSub}>Marca: {brand}</Text>
					<Text style={styles.cardSub}>Modelo: {model}</Text>
					<Text style={styles.cardSub}>Tipo: {type}</Text>
					<Text style={styles.cardSub}>Capacidad: {capacityText}</Text>
				</View>
			</View>

			<DriverAvailabilityToggle
				value={available}
				onChange={(v) => setAvailability(v)}
				disabled={!canToggleAvailability}
			/>

			<View style={{ height: 14 }} />

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Estadísticas de hoy</Text>
				<View style={styles.row2}>
					<View style={styles.statCard}>
						<Text style={styles.statLabel}>Entregados</Text>
						<Text style={styles.statValue}>{deliveredToday}</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={styles.statLabel}>Cancelados</Text>
						<Text style={styles.statValue}>{canceledToday}</Text>
					</View>
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Solicitudes de viaje</Text>
				<View style={styles.card}>
					{activeService ? (
						<>
							{isServiceRequested ? (
								<View style={styles.alertBanner}>
									<Text style={styles.alertText}>Nuevo servicio disponible</Text>
								</View>
							) : null}
							<Text style={styles.cardTitle}>Servicio #{activeService.service_id}</Text>
							<Text style={styles.cardSub}>
								Estado: {String(activeService.status_name || activeService.status_id || '—')}
							</Text>
							<Text style={styles.cardSub} numberOfLines={2}>
								Ruta: {String(activeService.origin_address || activeService.origin || '—')} →{' '}
								{String(activeService.destination_address || activeService.destination || '—')}
							</Text>

							{isServiceRequested ? (
								<>
									<View style={{ height: 12 }} />
									<View style={styles.actionsRow}>
										<Pressable
											onPress={() => respondToService('cancel')}
											disabled={!!serviceActionLoading}
											style={[styles.btn, styles.btnGhost, serviceActionLoading && styles.btnDisabled]}
										>
											<Text style={[styles.btnText, styles.btnGhostText]}>
												{serviceActionLoading === 'cancel' ? 'Rechazando…' : 'Rechazar'}
											</Text>
										</Pressable>
										<Pressable
											onPress={() => respondToService('accept')}
											disabled={!!serviceActionLoading}
											style={[styles.btn, styles.btnPrimary, serviceActionLoading && styles.btnDisabled]}
										>
											<Text style={[styles.btnText, styles.btnPrimaryText]}>
												{serviceActionLoading === 'accept' ? 'Aceptando…' : 'Aceptar'}
											</Text>
										</Pressable>
									</View>
									{serviceActionError ? (
										<Text style={styles.inlineError}>{serviceActionError}</Text>
									) : null}
								</>
							) : null}
						</>
					) : (
						<Text style={styles.muted}>No tienes solicitudes por el momento.</Text>
					)}
				</View>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: COLORS.background,
		paddingHorizontal: 16,
		paddingTop: 22,
		paddingBottom: 100,
	},
	header: { marginBottom: 14 },
	headerOverline: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '800', marginTop: 6 },
	headerTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 20, fontWeight: '900' },
	titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
	onlineBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.white,
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 999,
	},
	onlineText: { color: COLORS.foreground || COLORS.dark, fontSize: 12, fontWeight: '900' },
	dot: { width: 8, height: 8, borderRadius: 4 },
	dotOn: { backgroundColor: COLORS.success },
	dotOff: { backgroundColor: COLORS.grayText },

	section: { marginBottom: 14 },
	sectionTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 14, fontWeight: '900', marginBottom: 8 },

	card: {
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 12,
		backgroundColor: COLORS.white,
		padding: 12,
	},
	alertBanner: {
		backgroundColor: COLORS.secondary,
		padding: 10,
		borderRadius: 10,
		marginBottom: 10,
	},
	alertText: {
		fontWeight: '900',
		textAlign: 'center',
		color: COLORS.foreground || COLORS.dark,
	},
	cardTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 15, fontWeight: '900' },
	cardSub: { color: COLORS.mutedForeground || COLORS.grayText, marginTop: 4, fontSize: 13, fontWeight: '700' },
	muted: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 13, fontWeight: '700' },

	actionsRow: { flexDirection: 'row', gap: 10 },
	btn: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	btnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	btnPrimaryText: { color: COLORS.white },
	btnGhost: { backgroundColor: COLORS.white, borderColor: COLORS.border },
	btnGhostText: { color: COLORS.foreground || COLORS.dark },
	btnDisabled: { opacity: 0.6 },
	btnText: { fontSize: 14, fontWeight: '900' },
	inlineError: { marginTop: 10, color: COLORS.danger, fontSize: 13, fontWeight: '800' },

	row2: { flexDirection: 'row', gap: 10 },
	statCard: {
		flex: 1,
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 12,
		backgroundColor: COLORS.white,
		padding: 12,
	},
	statLabel: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '900' },
	statValue: { color: COLORS.foreground || COLORS.dark, fontSize: 20, fontWeight: '900', marginTop: 6 },

	center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.background },
	errorTitle: {
		color: COLORS.foreground || COLORS.dark,
		fontSize: 16,
		fontWeight: '900',
		textAlign: 'center',
		paddingHorizontal: 18,
	},
});
