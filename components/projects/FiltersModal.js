import React from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../theme/colors';

export function FiltersModal({ visible, onClose, statusFilter, setStatusFilter }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.content}>
        <Text style={styles.title}>Filtros</Text>
        <ScrollView style={{ maxHeight: 260 }}>
          <Text style={styles.sectionLabel}>Estado</Text>
          <OptionItem label="Todos" active={!statusFilter} onPress={() => { setStatusFilter(null); onClose(); }} />
          <OptionItem label="Activos" active={statusFilter === 'active'} onPress={() => { setStatusFilter('active'); onClose(); }} />
          <OptionItem label="Inactivos" active={statusFilter === 'inactive'} onPress={() => { setStatusFilter('inactive'); onClose(); }} />
        </ScrollView>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>Cerrar</Text></TouchableOpacity>
      </View>
    </Modal>
  );
}

function OptionItem({ label, active, onPress }) {
  return (
    <Pressable style={[styles.optionItem, active && styles.optionItemActive]} onPress={onPress}>
      <Text style={styles.optionItemText}>{label}</Text>
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
  optionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F7F7F7', marginBottom: 6 },
  optionItemActive: { backgroundColor: '#EDE9FF' },
  optionItemText: { fontSize: 14, fontWeight: '600', color: '#333' },
  closeBtn: { marginTop: 10, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  closeText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
});

export default FiltersModal;
