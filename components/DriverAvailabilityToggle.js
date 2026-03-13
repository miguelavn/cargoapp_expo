import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { COLORS } from '../theme/colors';

export default function DriverAvailabilityToggle({ value, onChange, disabled }) {
	return (
		<View style={styles.row}>
			<Text style={styles.label}>Disponible para servicios</Text>
			<Switch
				value={value}
				onValueChange={onChange}
				disabled={!!disabled}
				trackColor={{ false: COLORS.border, true: COLORS.primary }}
				thumbColor={COLORS.white}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.white,
	},
	label: {
		color: COLORS.foreground || COLORS.dark,
		fontSize: 15,
		fontWeight: '800',
	},
});
