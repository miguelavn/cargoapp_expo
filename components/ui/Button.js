import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme/colors';

export function Button({ title, onPress, loading = false, disabled = false, variant = 'primary', style, textStyle, leftIcon, rightIcon }) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      disabled={isDisabled}
      style={[styles.base, variantStyles[variant], isDisabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {leftIcon ? <>{leftIcon}</> : null}
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? COLORS.dark : COLORS.white} />
      ) : (
        <Text style={[styles.text, variant === 'secondary' && styles.textDark, textStyle]}>{title}</Text>
      )}
      {rightIcon ? <>{rightIcon}</> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: 8,
  },
  text: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 16,
  },
  textDark: { color: COLORS.dark },
  disabled: { opacity: 0.6 },
});

const variantStyles = {
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.secondary },
  danger: { backgroundColor: COLORS.danger },
  ghost: { backgroundColor: 'transparent' },
};

export default Button;
