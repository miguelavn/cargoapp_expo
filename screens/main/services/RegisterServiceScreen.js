import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Alert, ActionSheetIOS } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { COLORS } from '../../../theme/colors';

export default function RegisterServiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;

  const serviceId = route?.params?.serviceId ? Number(route.params.serviceId) : null;
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  // Esquema real de services: service: order_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, status
  const [form, setForm] = useState({
    order_id: '',
    project_id: route?.params?.projectId ? String(route.params.projectId) : '', // solo para facilitar filtro y UX
    vehicle_id: '',
    driver_id: '',
    material_id: '',
    unit_id: '',
    quantity: '',
    origin: '',
    destination: '',
    status: 'CREATED',
  });

  const handleChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const { data: pjs } = await supabase.from('projects').select('project_id, name, status').eq('status', true).order('name');
        setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
      } catch {}
      await loadVehicles();
      if (serviceId) await loadService(serviceId);
    })();
  }, []);

  const loadVehicles = async () => {
    try {
      // Filtrar por empresa del usuario: activos y disponibles
      const { data: { session } } = await supabase.auth.getSession();
      const authId = session?.user?.id;
      let companyId = null;
      if (authId) {
        const { data: appUser } = await supabase
          .from('app_users')
          .select('company_id')
          .eq('auth_id', authId)
          .maybeSingle();
        companyId = appUser?.company_id ?? null;
      }
      // Esquema: vehicles(vehicle_id, is_active, is_available, company_id, plate)
      let qb = supabase
        .from('vehicles')
        .select('vehicle_id, plate, is_active, is_available, company_id')
        .eq('is_active', true)
        .eq('is_available', true);
      if (companyId) qb = qb.eq('company_id', companyId);
      const { data } = await qb.order('plate');
      setVehicles((data || []).map((v) => ({ id: String(v.vehicle_id), name: v.plate })));
    } catch (e) {}
  };

  const loadService = async (id) => {
    try {
      // Si tienes edge get-service úsala; si no, directo
      try {
        const res = await callEdgeFunction('get-service', { method: 'GET', query: { service_id: id } });
        const s = res?.service;
        if (s) setForm({
          order_id: s.order_id ? String(s.order_id) : '',
          project_id: s.project_id ? String(s.project_id) : '', // si la edge lo retorna
          vehicle_id: s.vehicle_id ? String(s.vehicle_id) : '',
          driver_id: s.driver_id ? String(s.driver_id) : '',
          material_id: s.material_id ? String(s.material_id) : '',
          unit_id: s.unit_id ? String(s.unit_id) : '',
          quantity: s.quantity ? String(s.quantity) : '',
          origin: s.origin || '',
          destination: s.destination || '',
          status: s.status || 'CREATED',
        });
      } catch {
        const { data } = await supabase
          .from('services')
          .select('service_id, order_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, status')
          .eq('service_id', id)
          .maybeSingle();
        if (data) setForm({
          order_id: data.order_id ? String(data.order_id) : '',
          project_id: route?.params?.projectId ? String(route.params.projectId) : '',
          vehicle_id: data.vehicle_id ? String(data.vehicle_id) : '',
          driver_id: data.driver_id ? String(data.driver_id) : '',
          material_id: data.material_id ? String(data.material_id) : '',
          unit_id: data.unit_id ? String(data.unit_id) : '',
          quantity: data.quantity ? String(data.quantity) : '',
          origin: data.origin || '',
          destination: data.destination || '',
          status: data.status || 'CREATED',
        });
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo cargar el servicio');
    }
  };

  const onSubmit = async () => {
    const errs = {};
    if (!form.order_id) errs.order_id = 'Ingresa la orden relacionada';
    if (!form.vehicle_id) errs.vehicle_id = 'Selecciona un vehículo';
    if (!form.material_id) errs.material_id = 'Selecciona un material';
    if (!form.unit_id) errs.unit_id = 'Selecciona una unidad';
    if (!form.quantity || isNaN(Number(form.quantity))) errs.quantity = 'Cantidad requerida (número)';
    if (!form.destination?.trim()) errs.destination = 'Destino requerido';
    if (Object.keys(errs).length) return Alert.alert('Validación', Object.values(errs)[0]);

    try {
      setLoading(true);
      if (serviceId) {
        // update
        try {
          await callEdgeFunction('update-service', {
            method: 'POST',
            body: {
              service_id: serviceId,
              order_id: Number(form.order_id),
              vehicle_id: Number(form.vehicle_id),
              driver_id: form.driver_id ? Number(form.driver_id) : null,
              material_id: Number(form.material_id),
              unit_id: Number(form.unit_id),
              quantity: Number(form.quantity),
              origin: form.origin?.trim() || null,
              destination: form.destination.trim(),
              status: form.status,
            },
          });
        } catch (e) {
          // fallback solo si tus RLS lo permiten; idealmente usar solo edge
          const { error } = await supabase
            .from('services')
            .update({
              order_id: Number(form.order_id),
              vehicle_id: Number(form.vehicle_id),
              driver_id: form.driver_id ? Number(form.driver_id) : null,
              material_id: Number(form.material_id),
              unit_id: Number(form.unit_id),
              quantity: Number(form.quantity),
              origin: form.origin?.trim() || null,
              destination: form.destination.trim(),
              status: form.status,
            })
            .eq('service_id', serviceId);
          if (error) throw error;
        }
        Alert.alert('Éxito', 'Servicio actualizado', [
          { text: 'OK', onPress: () => navigation.navigate('ServicesList', { refresh: true, projectId: form.project_id }) },
        ]);
      } else {
        // create
        try {
          await callEdgeFunction('create-service', {
            method: 'POST',
            body: {
              order_id: Number(form.order_id),
              vehicle_id: Number(form.vehicle_id),
              driver_id: form.driver_id ? Number(form.driver_id) : null,
              material_id: Number(form.material_id),
              unit_id: Number(form.unit_id),
              quantity: Number(form.quantity),
              origin: form.origin?.trim() || null,
              destination: form.destination.trim(),
              status: form.status,
            },
          });
        } catch (e) {
          const { error } = await supabase.from('services').insert({
            order_id: Number(form.order_id),
            vehicle_id: Number(form.vehicle_id),
            driver_id: form.driver_id ? Number(form.driver_id) : null,
            material_id: Number(form.material_id),
            unit_id: Number(form.unit_id),
            quantity: Number(form.quantity),
            origin: form.origin?.trim() || null,
            destination: form.destination.trim(),
            status: form.status,
          });
          if (error) throw error;
        }
        Alert.alert('Éxito', 'Servicio creado', [
          { text: 'OK', onPress: () => navigation.navigate('ServicesList', { refresh: true, projectId: form.project_id }) },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar el servicio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.headerArea, { paddingTop: headerTop }]}> 
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1 }]}>{serviceId ? 'Editar servicio' : 'Registrar servicio'}</Text>
          <TouchableOpacity onPress={onSubmit} disabled={loading} style={[styles.smallBtn, loading && { opacity: 0.6 }]}>
            <Text style={styles.smallBtnText}>{loading ? 'Guardando…' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.container}>
        <Text style={styles.fieldLabel}>Proyecto</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const items = projects.map((p) => ({ label: p.name, value: p.id }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona un proyecto', options, cancelButtonIndex: 0 },
                (idx) => { if (idx > 0) handleChange('project_id', items[idx - 1].value); }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {projects.find((p) => p.id === form.project_id)?.name || 'Selecciona un proyecto'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker selectedValue={form.project_id} onValueChange={(v) => handleChange('project_id', v)} style={styles.picker}>
              <Picker.Item label="Selecciona un proyecto" value="" />
              {projects.map((p) => (
                <Picker.Item key={p.id} label={p.name} value={p.id} />
              ))}
            </Picker>
          </View>
        )}

        <Text style={styles.fieldLabel}>Vehículo</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const items = vehicles.map((v) => ({ label: v.name, value: v.id }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona un vehículo', options, cancelButtonIndex: 0 },
                (idx) => { if (idx > 0) handleChange('vehicle_id', items[idx - 1].value); }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {vehicles.find((v) => v.id === form.vehicle_id)?.name || 'Selecciona un vehículo'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker selectedValue={form.vehicle_id} onValueChange={(v) => handleChange('vehicle_id', v)} style={styles.picker}>
              <Picker.Item label="Selecciona un vehículo" value="" />
              {vehicles.map((v) => (
                <Picker.Item key={v.id} label={v.name} value={v.id} />
              ))}
            </Picker>
          </View>
        )}

        <Text style={styles.fieldLabel}>Orden</Text>
        <TextInput style={styles.input} placeholder="ID de Orden" keyboardType="numeric" value={form.order_id} onChangeText={(v) => handleChange('order_id', v.replace(/[^0-9]/g, ''))} />

        <Text style={styles.fieldLabel}>Material (ID)</Text>
        <TextInput style={styles.input} placeholder="ID de Material" keyboardType="numeric" value={form.material_id} onChangeText={(v) => handleChange('material_id', v.replace(/[^0-9]/g, ''))} />

        <Text style={styles.fieldLabel}>Unidad (ID)</Text>
        <TextInput style={styles.input} placeholder="ID de Unidad" keyboardType="numeric" value={form.unit_id} onChangeText={(v) => handleChange('unit_id', v.replace(/[^0-9]/g, ''))} />

        <Text style={styles.fieldLabel}>Cantidad</Text>
        <TextInput style={styles.input} placeholder="Cantidad" keyboardType="numeric" value={form.quantity} onChangeText={(v) => handleChange('quantity', v.replace(/[^0-9.]/g, ''))} />

        <Text style={styles.fieldLabel}>Origen</Text>
        <TextInput style={styles.input} placeholder="Origen (opcional)" value={form.origin} onChangeText={(v) => handleChange('origin', v)} />

        <Text style={styles.fieldLabel}>Destino</Text>
        <TextInput style={styles.input} placeholder="Destino" value={form.destination} onChangeText={(v) => handleChange('destination', v)} />

        <Text style={styles.fieldLabel}>Estado</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const items = [
                { label: 'CREATED', value: 'CREATED' },
                { label: 'ACCEPTED', value: 'ACCEPTED' },
                { label: 'LOADED', value: 'LOADED' },
                { label: 'DELIVERED', value: 'DELIVERED' },
              ];
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Estado del servicio', options, cancelButtonIndex: 0 },
                (idx) => { if (idx > 0) handleChange('status', items[idx - 1].value); }
              );
            }}
          >
            <Text style={styles.dropdownText}>{form.status}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker selectedValue={form.status} onValueChange={(v) => handleChange('status', v)} style={styles.picker}>
              <Picker.Item label="CREATED" value="CREATED" />
              <Picker.Item label="ACCEPTED" value="ACCEPTED" />
              <Picker.Item label="LOADED" value="LOADED" />
              <Picker.Item label="DELIVERED" value="DELIVERED" />
            </Picker>
          </View>
        )}
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
  input: { borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16, backgroundColor: '#F3F4F6' },
  smallBtn: { backgroundColor: COLORS.yellow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: '#333', fontWeight: '600' },
});
