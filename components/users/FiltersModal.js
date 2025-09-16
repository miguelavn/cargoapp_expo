import React from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../theme/colors';

export function FiltersModal({ visible, onClose, roles, selectedRole, setSelectedRole, activeFilter, setActiveFilter }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.content}>
        <Text style={styles.title}>Filtros</Text>
        <ScrollView style={{ maxHeight: 300 }}>
          <Text style={styles.sectionLabel}>Rol</Text>
          <RoleItem label="Todos" active={!selectedRole} onPress={() => { setSelectedRole(null); onClose(); }} />
          {roles.map(r => (
            <RoleItem key={r} label={r} active={selectedRole === r} onPress={() => { setSelectedRole(r); onClose(); }} />
          ))}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Estado</Text>
          <RoleItem label="Todos" active={!activeFilter} onPress={() => { setActiveFilter(null); onClose(); }} />
          <RoleItem label="Activos" active={activeFilter === 'true'} onPress={() => { setActiveFilter('true'); onClose(); }} />
            <RoleItem label="Inactivos" active={activeFilter === 'false'} onPress={() => { setActiveFilter('false'); onClose(); }} />
        </ScrollView>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>Cerrar</Text></TouchableOpacity>
      </View>
    </Modal>
  );
}

function RoleItem({ label, active, onPress }) {
  return (
    <Pressable style={[styles.roleItem, active && styles.roleItemActive]} onPress={onPress}>
      <Text style={styles.roleItemText}>{label}</Text>
      {active && <MaterialIcons name="check" size={18} color={COLORS.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  content: {
    position: 'absolute', top: '25%', left: 20, right: 20,
    backgroundColor: COLORS.white, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: 12, textAlign: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.grayText, marginBottom: 6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F7F7F7', marginBottom: 6 },
  roleItemActive: { backgroundColor: '#EDE9FF' },
  roleItemText: { fontSize: 14, fontWeight: '600', color: '#333' },
  closeBtn: { marginTop: 10, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  closeText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
});

export default FiltersModal;
