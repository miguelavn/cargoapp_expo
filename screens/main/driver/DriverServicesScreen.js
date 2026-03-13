import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../../theme/colors';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useDriverDashboard } from '../../../hooks/useDriverDashboard';

function hasPerm(perms = [], needle) {
	const n = String(needle).toLowerCase();
	return (perms || []).some((p) => String(p?.permission_name || p).toLowerCase() === n);
}

export default function DriverServicesScreen() {
	const { permissions } = usePermissions();
	const isDriver = useMemo(
		() => hasPerm(permissions, 'view_the_services_assigned_to_me_at_my_company'),
		[permissions]
	);

	const { loading, error, activeService } = useDriverDashboard(isDriver);

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
		<View style={styles.screen}>
			<Text style={styles.title}>Servicios</Text>
			<View style={styles.card}>
				{activeService ? (
					<>
						<Text style={styles.cardTitle}>Servicio #{activeService.service_id}</Text>
						<Text style={styles.cardSub}>Estado: {String(activeService.status_name || activeService.status_id || '—')}</Text>
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
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 100 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, gap: 10 },
	title: { color: COLORS.foreground || COLORS.dark, fontSize: 20, fontWeight: '900', marginBottom: 12 },
	card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.white, padding: 12 },
	cardTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 15, fontWeight: '900' },
	cardSub: { color: COLORS.mutedForeground || COLORS.grayText, marginTop: 4, fontSize: 13, fontWeight: '700' },
	muted: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 13, fontWeight: '700' },
	errorText: { color: COLORS.danger, fontSize: 14, fontWeight: '800', textAlign: 'center', paddingHorizontal: 18 },
});
