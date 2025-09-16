import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../../theme/colors';

export function ProjectPickerModal({ visible, onClose, projects, selectedProject, onSelect }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(q));
  }, [query, projects]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.content}>
        <Text style={styles.title}>Seleccionar proyecto</Text>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={18} color={COLORS.grayText} style={{ marginRight: 6 }} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar proyecto..."
            placeholderTextColor="#999"
            style={styles.searchInput}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <MaterialIcons name="close" size={18} color={COLORS.grayText} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ maxHeight: 320 }}>
          <OptionItem label="Todos los proyectos" active={!selectedProject} onPress={() => onSelect('')} />
          {filtered.map(p => (
            <OptionItem key={p.id} label={p.name} active={selectedProject === p.id} onPress={() => onSelect(p.id)} />
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={styles.closeText}>Cerrar</Text></TouchableOpacity>
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
    position: 'absolute', top: '20%', left: 20, right: 20,
    backgroundColor: COLORS.white, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: 12, textAlign: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F7F7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.dark, paddingVertical: 0 },
  optionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F7F7F7', marginBottom: 6 },
  optionItemActive: { backgroundColor: '#EDE9FF' },
  optionText: { fontSize: 14, fontWeight: '600', color: '#333' },
  closeBtn: { marginTop: 10, backgroundColor: COLORS.purple, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  closeText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
});

export default ProjectPickerModal;
