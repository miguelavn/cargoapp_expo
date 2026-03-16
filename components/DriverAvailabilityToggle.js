import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLORS } from '../theme/colors';

export default function DriverAvailabilityToggle({ value, onChange, disabled, disableAvailable }) {
	const available = !!value;
	return (
		<View style={styles.wrap}>
			<View style={styles.pill}>
				<Pressable
					onPress={() => onChange && onChange(false)}
					disabled={!!disabled}
					style={[styles.option, !available && styles.optionActive]}
				>
					<Text style={[styles.optionText, !available && styles.optionTextActive]}>Ocupado</Text>
				</Pressable>
				<Pressable
					onPress={() => onChange && onChange(true)}
					disabled={!!disabled || !!disableAvailable}
					style={[styles.option, available && styles.optionActive]}
				>
					<Text style={[styles.optionText, available && styles.optionTextActive]}>Disponible</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		alignSelf: 'stretch',
	},
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 999,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.white,
		padding: 4,
	},
	option: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 10,
		borderRadius: 999,
	},
	optionActive: {
		backgroundColor: COLORS.primary,
	},
	optionText: {
		color: COLORS.foreground || COLORS.dark,
		fontSize: 14,
		fontWeight: '900',
	},
	optionTextActive: {
		color: COLORS.white,
	},
});
