import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme/colors';

export function Input({ value, onChangeText, placeholder, secureTextEntry, keyboardType, right, left, style, inputStyle, ...rest }) {
  return (
    <View style={[styles.wrapper, style]}>
      {left ? <View style={styles.adornment}>{left}</View> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.grayText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={[styles.input, inputStyle]}
        {...rest}
      />
      {right ? <View style={styles.adornment}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.soft,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: SPACING.sm + 2,
    color: COLORS.dark,
  },
  adornment: {
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Input;
