import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { COLORS } from '../../../theme/colors';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useDriverDashboard } from '../../../hooks/useDriverDashboard';
import { useIsOnline } from '../../../hooks/useIsOnline';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { markDriverCanceled, unmarkDriverCanceled } from '../../../services/driverCancelTracker';

function hasPerm(perms = [], needle) {
	const n = String(needle).toLowerCase();
	return (perms || []).some((p) => String(p?.permission_name || p).toLowerCase() === n);
}

export default function DriverServicesScreen() {
	const navigation = useNavigation();
	const insets = useSafeAreaInsets();
	const lastServiceIdRef = useRef(null);
	const alertSoundRef = useRef(null);
	const alertSoundLoadingRef = useRef(false);
	const { permissions } = usePermissions();
	const isDriver = useMemo(
		() => hasPerm(permissions, 'view_the_services_assigned_to_me_at_my_company'),
		[permissions]
	);

	const { loading, error, activeService, pendingOfflineEvents, syncPendingOfflineEvents, refetch } = useDriverDashboard(isDriver);
	const isConnected = useIsOnline();
	const [serviceActionLoading, setServiceActionLoading] = useState('');
	const [serviceActionError, setServiceActionError] = useState('');
	const [syncingPendingEvents, setSyncingPendingEvents] = useState(false);

	const isServiceRequested =
		!!activeService && (
			String(activeService?.status_name || '').toUpperCase() === 'CREATED' ||
			Number(activeService?.status_id) === 1
		);

	const statusNameUpper = String(activeService?.status_name || '').toUpperCase();
	const statusIdNumber = Number(activeService?.status_id);
	const isTerminalById = !Number.isNaN(statusIdNumber) && (statusIdNumber === 4 || statusIdNumber === 5);
	const hasNonTerminalActiveService = !!activeService && !(statusNameUpper === 'CANCELED' || statusNameUpper === 'DELIVERED' || isTerminalById);

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
		const isCreated =
			String(activeService?.status_name || '').toUpperCase() === 'CREATED' ||
			Number(activeService?.status_id) === 1;
		const serviceId = activeService?.service_id;
		const isNewService = !!serviceId && serviceId !== lastServiceIdRef.current;
		if (isCreated && isNewService) {
			playAlert();
			lastServiceIdRef.current = serviceId;
		}
	}, [activeService]);

	const respondToService = async (action) => {
		if (!activeService?.service_id) return;
		const serviceId = activeService.service_id;
		const status = action === 'accept' ? 'ACCEPTED' : action === 'cancel' ? 'CANCELED' : null;
		if (!status) return;
		if (action === 'accept' && !isConnected) {
			setServiceActionError('Debes tener conexión para aceptar el servicio');
			return;
		}
		setServiceActionError('');
		setServiceActionLoading(action);
		if (action === 'cancel') {
			markDriverCanceled(serviceId);
		}
		try {
			await callEdgeFunction('driver-service-response', {
				method: 'POST',
				body: {
					service_id: serviceId,
					status,
					created_at: new Date().toISOString(),
				},
				timeout: 20000,
			});
			if (action === 'accept') {
				// Optimista: al aceptar, en ActiveTrip debe mostrarse de inmediato "Ya cargué"
				navigation.navigate('ActiveTrip', {
					serviceId,
					service: {
						...activeService,
						status_id: 2,
						status_name: 'ACCEPTED',
					},
				});
			}
			await refetch({ silent: true });
		} catch (e) {
			if (action === 'cancel') {
				unmarkDriverCanceled(serviceId);
			}
			setServiceActionError(e?.message || 'No se pudo actualizar el servicio');
		} finally {
			setServiceActionLoading('');
		}
	};

	if (!isDriver) return null;

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator color={COLORS.primary} />
				<Text style={styles.muted}>Cargando…</Text>
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorText}>{error}</Text>
			</View>
		);
	}

	return (
		<SafeAreaView
			edges={['left', 'right']}
			style={[
				styles.screen,
				{
					paddingTop: insets.top + 18,
					paddingBottom: insets.bottom + 100,
				},
			]}
		>
			<Text style={styles.title}>Servicios</Text>
			{pendingOfflineEvents > 0 ? (
				<>
					<Text style={styles.pendingSyncText}>Eventos pendientes por sincronizar: {pendingOfflineEvents}</Text>
					{isConnected ? (
						<Pressable
							onPress={async () => {
								if (syncingPendingEvents) return;
								setSyncingPendingEvents(true);
								try {
									await syncPendingOfflineEvents?.({ force: true });
								} finally {
									setSyncingPendingEvents(false);
								}
							}}
							style={[styles.retrySyncBtn, syncingPendingEvents && styles.btnDisabled]}
							disabled={syncingPendingEvents}
						>
							<Text style={styles.retrySyncBtnText}>
								{syncingPendingEvents ? 'Sincronizando…' : 'Reintentar sincronización'}
							</Text>
						</Pressable>
					) : null}
				</>
			) : null}
			<View style={styles.card}>
				{activeService ? (
					<>
						{isServiceRequested ? (
							<View style={styles.alertBanner}>
								<Text style={styles.alertText}>Nuevo servicio disponible</Text>
							</View>
						) : null}
						<Text style={styles.cardTitle}>Servicio #{activeService.service_id}</Text>
						<Text style={styles.cardSub}>Estado: {String(activeService.status_name || activeService.status_id || '—')}</Text>
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
						) : hasNonTerminalActiveService ? (
							<>
								<View style={{ height: 12 }} />
								<Pressable
									onPress={() => navigation.navigate('ActiveTrip', { serviceId: activeService.service_id, service: activeService })}
									style={[styles.btn, styles.btnPrimary, styles.tripModeBtn]}
								>
									<Text style={[styles.btnText, styles.btnPrimaryText, styles.tripModeBtnText]}>Entrar en modo viaje</Text>
								</Pressable>
							</>
						) : null}
					</>
				) : (
					<Text style={styles.muted}>No tienes un servicio activo.</Text>
				)}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 100 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, gap: 10 },
	title: { color: COLORS.foreground || COLORS.dark, fontSize: 20, fontWeight: '900', marginBottom: 12 },
	pendingSyncText: { color: '#0A4F80', fontSize: 12, fontWeight: '800', marginBottom: 10 },
	retrySyncBtn: {
		marginBottom: 10,
		alignSelf: 'flex-start',
		backgroundColor: '#EAF6FF',
		borderWidth: 1,
		borderColor: '#8BC8F8',
		paddingVertical: 7,
		paddingHorizontal: 10,
		borderRadius: 8,
	},
	retrySyncBtnText: { color: '#0A4F80', fontSize: 12, fontWeight: '900' },
	card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.white, padding: 12 },
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
	errorText: { color: COLORS.danger, fontSize: 14, fontWeight: '800', textAlign: 'center', paddingHorizontal: 18 },

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
	tripModeBtn: { minHeight: 44 },
	tripModeBtnText: { color: '#FFFFFF', textAlign: 'center' },
	inlineError: { marginTop: 10, color: COLORS.danger, fontSize: 13, fontWeight: '800' },
});
