import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/colors';
import { usePermissions } from '../../../contexts/PermissionsContext';
import DriverAvailabilityToggle from '../../../components/DriverAvailabilityToggle';
import { useVehicleHeartbeat } from '../../../hooks/useVehicleHeartbeat';
import { useDriverDashboard } from '../../../hooks/useDriverDashboard';

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

	const {
		loading,
		error,
		vehicle,
		activeService,
		deliveredToday,
		canceledToday,
		setAvailability,
	} = useDriverDashboard(isDriver);

	useVehicleHeartbeat({ enabled: isDriver && !loading && !!vehicle });

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
	const online = vehicle?.online;
	const available = !!vehicle?.is_available;

	return (
		<View style={styles.screen}>
			<View style={styles.header}>
				<Text style={styles.headerOverline}>Conductor</Text>
				<Text style={styles.headerTitle}>Inicio</Text>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>1️⃣ Servicio asignado actualmente</Text>
				<View style={styles.card}>
					{activeService ? (
						<>
							<Text style={styles.cardTitle}>Servicio #{activeService.service_id}</Text>
							<Text style={styles.cardSub}>
								Estado: {String(activeService.status_name || activeService.status_id || '—')}
							</Text>
							<Text style={styles.cardSub} numberOfLines={2}>
								Ruta: {String(activeService.origin_address || activeService.origin || '—')} →{' '}
								{String(activeService.destination_address || activeService.destination || '—')}
							</Text>
						</>
					) : (
						<Text style={styles.muted}>No tienes un servicio activo.</Text>
					)}
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>2️⃣ Historial del día</Text>
				<View style={styles.row2}>
					<View style={styles.statCard}>
						<Text style={styles.statLabel}>Servicios entregados hoy</Text>
						<Text style={styles.statValue}>{deliveredToday}</Text>
					</View>
					<View style={styles.statCard}>
						<Text style={styles.statLabel}>Servicios cancelados hoy</Text>
						<Text style={styles.statValue}>{canceledToday}</Text>
					</View>
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>3️⃣ Estado del vehículo</Text>
				<View style={styles.card}>
					<View style={styles.vehicleTopRow}>
						<MaterialIcons name="local-shipping" size={18} color={COLORS.grayText} />
						<Text style={styles.cardTitle}>Vehículo: {plate}</Text>
					</View>

					<View style={styles.vehicleStatusRow}>
						<View style={styles.badge}>
							<View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
							<Text style={styles.badgeText}>
								{online == null ? 'Online: —' : online ? 'Online' : 'Offline'}
							</Text>
						</View>
					</View>

					<View style={{ height: 10 }} />
					<DriverAvailabilityToggle value={available} onChange={(v) => setAvailability(v)} />
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: COLORS.background,
		paddingHorizontal: 16,
		paddingTop: 18,
		paddingBottom: 100,
	},
	header: { marginBottom: 14 },
	headerOverline: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '800' },
	headerTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 20, fontWeight: '900' },

	section: { marginBottom: 14 },
	sectionTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 14, fontWeight: '900', marginBottom: 8 },

	card: {
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 12,
		backgroundColor: COLORS.white,
		padding: 12,
	},
	cardTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 15, fontWeight: '900' },
	cardSub: { color: COLORS.mutedForeground || COLORS.grayText, marginTop: 4, fontSize: 13, fontWeight: '700' },
	muted: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 13, fontWeight: '700' },

	row2: { flexDirection: 'row', gap: 10 },
	statCard: {
		flex: 1,
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 12,
		backgroundColor: COLORS.white,
		padding: 12,
	},
	statLabel: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '800' },
	statValue: { color: COLORS.foreground || COLORS.dark, fontSize: 20, fontWeight: '900', marginTop: 6 },

	vehicleTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
	vehicleStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
	badge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 999,
		paddingVertical: 6,
		paddingHorizontal: 10,
		backgroundColor: COLORS.white,
	},
	badgeText: { color: COLORS.foreground || COLORS.dark, fontSize: 12, fontWeight: '900' },
	dot: { width: 8, height: 8, borderRadius: 4 },
	dotOn: { backgroundColor: COLORS.success },
	dotOff: { backgroundColor: COLORS.grayText },

	center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.background },
	errorTitle: {
		color: COLORS.foreground || COLORS.dark,
		fontSize: 16,
		fontWeight: '900',
		textAlign: 'center',
		paddingHorizontal: 18,
	},
});
