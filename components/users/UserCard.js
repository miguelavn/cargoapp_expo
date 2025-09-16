import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../theme/colors';

export function UserCard({ item, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.65} style={styles.card} onPress={onPress}> 
      <View style={styles.avatar}><MaterialIcons name="person" size={26} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{[item.name, item.last_name].filter(Boolean).join(' ') || 'Sin nombre'}</Text>
        {item.company_name && <Text style={styles.company}>{item.company_name}</Text>}
        {item.role_name && <Text style={styles.role}>{item.role_name}</Text>}
      </View>
      <MaterialIcons name="chevron-right" size={26} color="#999" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 4,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  company: { fontSize: 13, color: COLORS.grayText, fontWeight: '600', marginTop: 2 },
  role: { fontSize: 12, color: COLORS.grayText, marginTop: 2 },
});

export default UserCard;
