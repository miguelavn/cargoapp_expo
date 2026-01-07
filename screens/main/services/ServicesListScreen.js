import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Alert, ActionSheetIOS } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { COLORS } from '../../../theme/colors';

function hasPerm(perms = [], needle) {
  const n = String(needle).toLowerCase();
  return (perms || []).some((p) => String(p.permission_name || p).toLowerCase() === n);
}

export default function ServicesListScreen({ navigation, route }) {
  const permissions = route?.params?.permissions || [];
  const canCreate = hasPerm(permissions, 'create_new_service_for_my_company');

  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(route?.params?.projectId ? String(route.params.projectId) : '');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: pjs } = await supabase.from('projects').select('project_id, name, status').eq('status', true).order('name');
        setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
      } catch {}
      await load();
    })();
  }, []);

  // Recarga cuando cambie el filtro de proyecto o se regrese con refresh
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, route?.params?.refresh]);

  const load = async () => {
    try {
      setLoading(true);
      // Si hay edge function para listar servicios, úsala; sino, consulta directa (asumiendo RLS)
      try {
        const q = {};
        if (projectId) q.project_id = Number(projectId);
        const res = await callEdgeFunction('list-services', { method: 'GET', query: q });
        const arr = Array.isArray(res?.data) ? res.data : [];
        // Normalizar campos a nuestro render
        const norm = arr.map((it) => ({
          service_id: it.service_id ?? it.id,
          project_name: it.project_name ?? it?.project?.name ?? null,
          created_at: it.created_at ?? it.date ?? null,
          origin: it.origin ?? null,
          destination: it.destination ?? null,
          // Se mantiene por compatibilidad (p.ej. al abrir edición)
          order_id: it.order_id ?? it.orderId ?? null,
        }));
        setServices(norm);
      } catch {
        // Fallback directo: unir con orders para filtrar por proyecto
        let qb = supabase
          .from('services')
          .select('service_id, created_at, origin, destination, order_id, orders!inner(project_id)')
          .order('service_id', { ascending: false });
        if (projectId) qb = qb.eq('orders.project_id', Number(projectId));
        const { data } = await qb;
        const norm = (data || []).map((it) => ({
          service_id: it.service_id,
          created_at: it.created_at,
          order_id: it.order_id,
          project_name: null,
          origin: it.origin ?? null,
          destination: it.destination ?? null,
        }));
        setServices(norm);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
    }
  };

  const headerTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;

  return (
    <View style={styles.screen}>
      <View style={[styles.headerArea, { paddingTop: headerTop }]}> 
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1 }]}>Servicios</Text>
          {canCreate && (
            <TouchableOpacity onPress={() => navigation.navigate('RegisterService', { projectId })} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>Nuevo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.container}>
        <Text style={styles.fieldLabel}>Proyecto</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const items = projects.map((p) => ({ label: p.name, value: p.id }));
              const options = ['Cancelar', 'Todos', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona un proyecto', options, cancelButtonIndex: 0 },
                (idx) => {
                  if (idx === 1) setProjectId('');
                  if (idx > 1) setProjectId(items[idx - 2].value);
                }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {projects.find((p) => p.id === projectId)?.name || 'Selecciona un proyecto'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker selectedValue={projectId} onValueChange={(v) => setProjectId(v)} style={styles.picker}>
              <Picker.Item label="Selecciona un proyecto" value="" />
              {projects.map((p) => (
                <Picker.Item key={p.id} label={p.name} value={p.id} />
              ))}
            </Picker>
          </View>
        )}

        <TouchableOpacity onPress={load} style={[styles.button, { marginTop: 0 }]} activeOpacity={0.85}>
          <Text style={styles.buttonText}>{loading ? 'Cargando…' : 'Buscar'}</Text>
        </TouchableOpacity>

        <FlatList
          data={services}
          keyExtractor={(it) => String(it.service_id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('RegisterService', { serviceId: item.service_id, projectId })}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.project_name || 'Proyecto'}</Text>
              <Text style={styles.cardMeta}>Fecha: {item.created_at ? String(item.created_at).slice(0, 10) : '—'}</Text>
              <Text style={styles.cardMeta}>Origen: {item.origin || '—'}</Text>
              <Text style={styles.cardMeta}>Destino: {item.destination || '—'}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={<Text style={{ color: '#666', marginTop: 20 }}>No hay servicios.</Text>}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.purple },
  headerArea: { backgroundColor: COLORS.purple, paddingHorizontal: 16, paddingBottom: 10 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  backButton: {
    backgroundColor: COLORS.yellow,
    padding: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '500' },
  container: { backgroundColor: '#fff', flex: 1, paddingHorizontal: 12, borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4, marginTop: 12, fontWeight: '600' },
  dropdown: { borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 10, marginBottom: 12, backgroundColor: '#F3F4F6', overflow: 'hidden', position: 'relative' },
  dropdownText: { paddingVertical: 14, paddingHorizontal: 12, color: '#333', fontSize: 16 },
  dropdownIcon: { position: 'absolute', right: 10, top: 12 },
  picker: { height: 50, width: '100%', backgroundColor: 'transparent' },
  button: { backgroundColor: COLORS.yellow, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#333', fontSize: 17, fontWeight: '600' },
  smallBtn: { backgroundColor: COLORS.yellow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: '#333', fontWeight: '600' },
  card: { padding: 12, borderWidth: 1, borderColor: '#EEE', borderRadius: 10, backgroundColor: '#fff' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 2 },
});
