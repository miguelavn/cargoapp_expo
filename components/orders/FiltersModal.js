import React from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../theme/colors';

export function FiltersModal({ visible, onClose, suppliers, selectedSupplier, setSelectedSupplier, orderTypes, selectedOrderType, setSelectedOrderType, onApply, onClear }) {
  const supplierLabel = (id) => suppliers.find(s => s.id === id)?.name || 'Todos';
  const orderTypeLabel = (id) => orderTypes.find(o => o.id === id)?.name || 'Todos';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.content}>
        <Text style={styles.title}>Filtros</Text>
        <ScrollView style={{ maxHeight: 320 }}>
          <Text style={styles.sectionLabel}>Proveedor</Text>
          <OptionItem label="Todos" active={!selectedSupplier} onPress={() => setSelectedSupplier('')} />
          {suppliers.map(s => (
            <OptionItem key={s.id} label={s.name} active={selectedSupplier === s.id} onPress={() => setSelectedSupplier(s.id)} />
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Tipo de orden</Text>
          <OptionItem label="Todos" active={!selectedOrderType} onPress={() => setSelectedOrderType('')} />
          {orderTypes.map(o => (
            <OptionItem key={o.id} label={o.name} active={selectedOrderType === o.id} onPress={() => setSelectedOrderType(o.id)} />
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#EEE' }]} onPress={onClear}>
            <Text style={[styles.btnText, { color: COLORS.dark }]}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.purple }]} onPress={onApply}>
            <Text style={styles.btnText}>Aplicar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function OptionItem({ label, active, onPress }) {
  return (
    <Pressable style={[styles.optionItem, active && styles.optionItemActive]} onPress={onPress}>
      <Text style={styles.optionText}>{label}</Text>
      {active && <MaterialIcons name="check" size={18} color={COLORS.purple} />}
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
  optionText: { fontSize: 14, fontWeight: '600', color: '#333' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
});

export default FiltersModal;
