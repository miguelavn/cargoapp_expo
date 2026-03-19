import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { COLORS } from '../../../theme/colors';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useDriverDashboard } from '../../../hooks/useDriverDashboard';
import { callEdgeFunction } from '../../../api/edgeFunctions';

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

	const { loading, error, activeService, refetch } = useDriverDashboard(isDriver);
	const [serviceActionLoading, setServiceActionLoading] = useState('');
	const [serviceActionError, setServiceActionError] = useState('');

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
		setServiceActionError('');
		setServiceActionLoading(action);
		try {
			await callEdgeFunction('driver-service-response', {
				method: 'POST',
				body: { service_id: activeService.service_id, action },
				timeout: 20000,
			});
			if (action === 'accept') {
				navigation.navigate('ActiveTrip', { serviceId: activeService.service_id, service: activeService });
			}
			await refetch({ silent: true });
		} catch (e) {
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
									style={[styles.btn, styles.btnPrimary]}
								>
									<Text style={[styles.btnText, styles.btnPrimaryText]}>Reanudar viaje</Text>
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
	inlineError: { marginTop: 10, color: COLORS.danger, fontSize: 13, fontWeight: '800' },
});
