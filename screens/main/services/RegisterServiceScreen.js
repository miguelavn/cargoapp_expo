import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Alert, ActionSheetIOS } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
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
  const [units, setUnits] = useState([]);
  const [purchaseOptions, setPurchaseOptions] = useState([]); // filas de project_materials_availability
  const [transportOptions, setTransportOptions] = useState([]); // filas de transport_orders_availability
  const [statuses, setStatuses] = useState([]); // filas de service_status
  

  const [selectedAvailability, setSelectedAvailability] = useState(null); // numeric

  // Esquema real de services (según DB): purchase_order_id, transport_order_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, material_supplier_id, transport_supplier_id, project_id, status_id
  const [form, setForm] = useState({
    purchase_order_id: '',
    transport_order_id: '',
    project_id: route?.params?.projectId ? String(route.params.projectId) : '', // solo para facilitar filtro y UX
    vehicle_id: '',
    driver_id: '',
    material_id: '',
    unit_id: '',
    quantity: '',
    origin: '',
    destination: '',
    material_supplier_id: '',
    transport_supplier_id: '',
    status_id: '',
  });

  const handleChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const prevTransportSupplierRef = useRef('');

  useEffect(() => {
    (async () => {
      try {
        const { data: pjs } = await supabase.from('projects').select('project_id, name, status').eq('status', true).order('name');
        setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
      } catch {}
      // No cargar vehículos hasta seleccionar una OT
      setVehicles([]);
      await loadUnits();
      await loadStatuses();
      if (serviceId) await loadService(serviceId);
    })();
  }, []);

  // Recargar vehículos cuando cambie el supplier de la orden de transporte
  useEffect(() => {
    const nextSupplierId = form.transport_supplier_id || '';
    if (prevTransportSupplierRef.current === nextSupplierId) return;
    prevTransportSupplierRef.current = nextSupplierId;

    // Si cambia el supplier, resetear vehículo/conductor
    setForm((s) => ({ ...s, vehicle_id: '', driver_id: '' }));

    // Si aún no hay OT/supplier seleccionado, no mostrar vehículos
    if (!nextSupplierId) {
      setVehicles([]);
      return;
    }

    loadVehicles(nextSupplierId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.transport_supplier_id]);

  // La cantidad siempre se deriva del vehículo seleccionado (capacidad m3)
  useEffect(() => {
    if (!form.vehicle_id) {
      setForm((s) => (s.quantity ? { ...s, quantity: '' } : s));
      return;
    }

    const veh = vehicles.find((v) => String(v.id) === String(form.vehicle_id));
    if (!veh || veh.capacity_m3 == null || Number.isNaN(Number(veh.capacity_m3))) {
      setForm((s) => (s.quantity ? { ...s, quantity: '' } : s));
      return;
    }

    const nextQty = String(veh.capacity_m3);
    setForm((s) => (String(s.quantity) === nextQty ? s : { ...s, quantity: nextQty }));
  }, [form.vehicle_id, vehicles]);

  // Cargar disponibilidad cuando cambia el proyecto
  useEffect(() => {
    (async () => {
      await loadAvailabilityForProject(form.project_id);

      // Al cambiar de proyecto, resetear selecciones dependientes
      setSelectedAvailability(null);
      setForm((s) => ({
        ...s,
        purchase_order_id: '',
        transport_order_id: '',
        material_id: '',
        unit_id: '',
        material_supplier_id: '',
        transport_supplier_id: '',
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id]);

  const loadVehicles = async (transportSupplierId = '') => {
    try {
      // Esquema: vehicles(vehicle_id, plate, is_active, is_available, transport_supplier_id, driver_id)
      let qb = supabase
        .from('vehicles')
        .select('vehicle_id, plate, model, capacity_m3, is_active, is_available, transport_supplier_id, driver_id')
        .eq('is_active', true)
        .eq('is_available', true);

      // Si ya seleccionaron OT, filtrar por supplier de transporte
      if (transportSupplierId) {
        const sid = Number(transportSupplierId);
        if (!Number.isNaN(sid)) qb = qb.eq('transport_supplier_id', sid);
      }

      const { data } = await qb.order('plate');
      setVehicles((data || []).map((v) => ({
        id: String(v.vehicle_id),
        name: v.plate,
        label: [String(v.model || '').trim(), v.capacity_m3 != null ? `${v.capacity_m3} m³` : '', v.plate]
          .filter((x) => String(x || '').trim())
          .join(' - '),
        capacity_m3: v.capacity_m3,
        driver_id: v.driver_id != null ? String(v.driver_id) : '',
      })));
    } catch (e) {}
  };

  const loadAvailabilityForProject = async (projectId) => {
    try {
      if (!projectId) {
        setPurchaseOptions([]);
        setTransportOptions([]);
        return;
      }

      // Órdenes de compra + materiales disponibles
      const { data: purchRows } = await supabase
        .from('project_materials_availability')
        .select('project_id, order_id, order_code, material_id, material_name, unit_id, unit_name, available, supplier_id, supplier_name')
        .eq('project_id', Number(projectId));
      setPurchaseOptions(Array.isArray(purchRows) ? purchRows : []);

      // Órdenes de transporte + disponibilidad
      const { data: trRows } = await supabase
        .from('transport_orders_availability')
        .select('project_id, order_id, order_code, unit_id, unit_name, total_available, quantity_required, transport_supplier_id, transport_supplier_name, pickup_location')
        .eq('project_id', Number(projectId));
      setTransportOptions(Array.isArray(trRows) ? trRows : []);
    } catch (e) {
      // En caso de fallo, dejar vacío
      setPurchaseOptions([]);
      setTransportOptions([]);
    }
  };

  const loadUnits = async () => {
    try {
      const { data } = await supabase.from('measurement_units').select('id, name');
      setUnits((data || []).map((u) => ({ id: String(u.id), name: u.name })));
    } catch {}
  };

  const loadStatuses = async () => {
    try {
      const { data } = await supabase
        .from('service_status')
        .select('id, status_name')
        .order('id', { ascending: true });
      const list = (data || []).map((s) => ({ id: String(s.id), name: s.status_name }));
      setStatuses(list);

      // Default a CREATED si existe
      setForm((prev) => {
        if (prev.status_id) return prev;
        const created = list.find((x) => String(x.name || '').toLowerCase() === 'created');
        return { ...prev, status_id: created?.id || prev.status_id };
      });
    } catch {}
  };

  const loadService = async (id) => {
    try {
      // Si tienes edge get-service úsala; si no, directo
      try {
        const res = await callEdgeFunction('get-service', { method: 'GET', query: { service_id: id } });
        const s = res?.service;
        if (s) setForm({
          purchase_order_id: s.purchase_order_id ? String(s.purchase_order_id) : (s.order_id ? String(s.order_id) : ''),
          transport_order_id: s.transport_order_id ? String(s.transport_order_id) : '',
          project_id: s.project_id ? String(s.project_id) : '',
          vehicle_id: s.vehicle_id ? String(s.vehicle_id) : '',
          driver_id: s.driver_id ? String(s.driver_id) : '',
          material_id: s.material_id ? String(s.material_id) : '',
          unit_id: s.unit_id ? String(s.unit_id) : '',
          quantity: s.quantity ? String(s.quantity) : '',
          origin: s.origin || '',
          destination: s.destination || '',
          material_supplier_id: s.material_supplier_id ? String(s.material_supplier_id) : '',
          transport_supplier_id: s.transport_supplier_id ? String(s.transport_supplier_id) : '',
          status_id: s.status_id ? String(s.status_id) : '',
        });
      } catch {
        const { data } = await supabase
          .from('services')
          .select('service_id, purchase_order_id, transport_order_id, project_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, material_supplier_id, transport_supplier_id, status_id')
          .eq('service_id', id)
          .maybeSingle();
        if (data) setForm({
          purchase_order_id: data.purchase_order_id ? String(data.purchase_order_id) : '',
          transport_order_id: data.transport_order_id ? String(data.transport_order_id) : '',
          project_id: data.project_id ? String(data.project_id) : (route?.params?.projectId ? String(route.params.projectId) : ''),
          vehicle_id: data.vehicle_id ? String(data.vehicle_id) : '',
          driver_id: data.driver_id ? String(data.driver_id) : '',
          material_id: data.material_id ? String(data.material_id) : '',
          unit_id: data.unit_id ? String(data.unit_id) : '',
          quantity: data.quantity ? String(data.quantity) : '',
          origin: data.origin || '',
          destination: data.destination || '',
          material_supplier_id: data.material_supplier_id ? String(data.material_supplier_id) : '',
          transport_supplier_id: data.transport_supplier_id ? String(data.transport_supplier_id) : '',
          status_id: data.status_id ? String(data.status_id) : '',
        });
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo cargar el servicio');
    }
  };

  const onSubmit = async () => {
    const errs = {};
    if (!form.project_id) errs.project_id = 'Selecciona un proyecto';
    if (!form.purchase_order_id) errs.purchase_order_id = 'Selecciona la orden de compra';
    if (!form.transport_order_id) errs.transport_order_id = 'Selecciona la orden de transporte';
    if (!form.vehicle_id) errs.vehicle_id = 'Selecciona un vehículo';
    if (!form.driver_id) errs.driver_id = 'Selecciona un conductor (o un vehículo con conductor)';
    if (!form.material_id) errs.material_id = 'Selecciona un material';
    if (!form.unit_id) errs.unit_id = 'Selecciona una unidad';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) errs.quantity = 'Cantidad requerida (capacidad del vehículo)';
    if (selectedAvailability != null && !isNaN(Number(form.quantity)) && Number(form.quantity) > Number(selectedAvailability)) {
      errs.quantity = `Cantidad supera disponible (${selectedAvailability})`;
    }
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
              // compat: algunas edges antiguas usaban order_id como transport_order_id
              order_id: Number(form.transport_order_id),
              purchase_order_id: Number(form.purchase_order_id),
              transport_order_id: Number(form.transport_order_id),
              project_id: form.project_id ? Number(form.project_id) : null,
              vehicle_id: Number(form.vehicle_id),
              driver_id: Number(form.driver_id),
              material_id: Number(form.material_id),
              unit_id: Number(form.unit_id),
              quantity: Number(form.quantity),
              origin: form.origin?.trim() || null,
              destination: form.destination.trim(),
              material_supplier_id: Number(form.material_supplier_id),
              transport_supplier_id: Number(form.transport_supplier_id),
              status_id: form.status_id ? Number(form.status_id) : null,
            },
          });
        } catch (e) {
          // fallback solo si tus RLS lo permiten; idealmente usar solo edge
          const { error } = await supabase
            .from('services')
            .update({
              purchase_order_id: Number(form.purchase_order_id),
              transport_order_id: Number(form.transport_order_id),
              project_id: form.project_id ? Number(form.project_id) : null,
              vehicle_id: Number(form.vehicle_id),
              driver_id: Number(form.driver_id),
              material_id: Number(form.material_id),
              unit_id: Number(form.unit_id),
              quantity: Number(form.quantity),
              origin: form.origin?.trim() || null,
              destination: form.destination.trim(),
              material_supplier_id: Number(form.material_supplier_id),
              transport_supplier_id: Number(form.transport_supplier_id),
              status_id: form.status_id ? Number(form.status_id) : null,
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
              // compat: algunas edges antiguas usaban order_id como transport_order_id
              order_id: Number(form.transport_order_id),
              purchase_order_id: Number(form.purchase_order_id),
              transport_order_id: Number(form.transport_order_id),
              project_id: form.project_id ? Number(form.project_id) : null,
              vehicle_id: Number(form.vehicle_id),
              driver_id: Number(form.driver_id),
              material_id: Number(form.material_id),
              unit_id: Number(form.unit_id),
              quantity: Number(form.quantity),
              origin: form.origin?.trim() || null,
              destination: form.destination.trim(),
              material_supplier_id: Number(form.material_supplier_id),
              transport_supplier_id: Number(form.transport_supplier_id),
              status_id: form.status_id ? Number(form.status_id) : null,
            },
          });
        } catch (e) {
          const { error } = await supabase.from('services').insert({
            purchase_order_id: Number(form.purchase_order_id),
            transport_order_id: Number(form.transport_order_id),
            project_id: form.project_id ? Number(form.project_id) : null,
            vehicle_id: Number(form.vehicle_id),
            driver_id: Number(form.driver_id),
            material_id: Number(form.material_id),
            unit_id: Number(form.unit_id),
            quantity: Number(form.quantity),
            origin: form.origin?.trim() || null,
            destination: form.destination.trim(),
            material_supplier_id: Number(form.material_supplier_id),
            transport_supplier_id: Number(form.transport_supplier_id),
            status_id: form.status_id ? Number(form.status_id) : null,
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

      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.containerContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
        showsVerticalScrollIndicator={false}
      >
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

     

        <Text style={styles.fieldLabel}>Orden de compra (Material)</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              if (!form.project_id) {
                Alert.alert('Selecciona un proyecto', 'Primero elige un proyecto para listar órdenes de compra.');
                return;
              }
              const items = purchaseOptions.map((r) => ({
                label: `${r.material_name} (${r.available} ${r.unit_name}) - OC ${r.order_code}`,
                value: String(r.order_detail_id ?? `${r.order_id}-${r.material_id}`),
                order_id: String(r.order_id),
                material_id: String(r.material_id),
                unit_id: String(r.unit_id),
                supplier_id: String(r.supplier_id),
                available: r.available,
              }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona material de orden de compra', options, cancelButtonIndex: 0 },
                (idx) => {
                  if (idx > 0) {
                    const picked = items[idx - 1];
                    handleChange('purchase_order_id', picked.order_id);
                    handleChange('material_id', picked.material_id);
                    handleChange('unit_id', picked.unit_id);
                    handleChange('material_supplier_id', picked.supplier_id);
                    setSelectedAvailability(picked.available);
                  }
                }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {form.purchase_order_id
                ? `OC #${form.purchase_order_id}`
                : (form.project_id ? 'Selecciona material/OC' : 'Selecciona un proyecto primero')}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker
              enabled={!!form.project_id}
              selectedValue={form.purchase_order_id ? `${form.purchase_order_id}-${form.material_id}` : ''}
              onValueChange={(val) => {
                if (!val) return;
                const [orderId, materialId] = String(val).split('-');
                const row = purchaseOptions.find((r) => String(r.order_id) === String(orderId) && String(r.material_id) === String(materialId));
                if (!row) return;
                handleChange('purchase_order_id', String(row.order_id));
                handleChange('material_id', String(row.material_id));
                handleChange('unit_id', String(row.unit_id));
                handleChange('material_supplier_id', String(row.supplier_id));
                setSelectedAvailability(row.available);
              }}
              style={styles.picker}
            >
              <Picker.Item label={form.project_id ? 'Selecciona material/OC' : 'Selecciona un proyecto primero'} value="" />
              {purchaseOptions.map((r) => (
                <Picker.Item
                  key={`${r.order_id}-${r.material_id}`}
                  label={`${r.material_name} (${r.available} ${r.unit_name}) - OC ${r.order_code}`}
                  value={`${r.order_id}-${r.material_id}`}
                />
              ))}
            </Picker>
          </View>
        )}



        <Text style={styles.fieldLabel}>Orden de transporte</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              if (!form.project_id) {
                Alert.alert('Selecciona un proyecto', 'Primero elige un proyecto para listar órdenes de transporte.');
                return;
              }
              const items = transportOptions.map((r) => ({
                label: `OT ${r.order_code} - ${r.transport_supplier_name} (${r.total_available ?? '—'} ${r.unit_name})`,
                order_id: String(r.order_id),
                supplier_id: String(r.transport_supplier_id),
                pickup_location: r.pickup_location,
              }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona una orden de transporte', options, cancelButtonIndex: 0 },
                async (idx) => {
                  if (idx > 0) {
                    const picked = items[idx - 1];
                    handleChange('transport_order_id', picked.order_id);
                    handleChange('transport_supplier_id', picked.supplier_id);

                    // autocompletar origen desde pickup_location si existe
                    if (picked.pickup_location && !form.origin?.trim()) {
                      try {
                        const { data } = await supabase
                          .from('company_address')
                          .select('address')
                          .eq('id', Number(picked.pickup_location))
                          .maybeSingle();
                        if (data?.address) handleChange('origin', data.address);
                      } catch {}
                    }
                  }
                }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {form.transport_order_id
                ? `OT #${form.transport_order_id}`
                : (form.project_id ? 'Selecciona una OT' : 'Selecciona un proyecto primero')}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker
              enabled={!!form.project_id}
              selectedValue={form.transport_order_id}
              onValueChange={async (v) => {
                handleChange('transport_order_id', v);
                const row = transportOptions.find((r) => String(r.order_id) === String(v));
                if (row?.transport_supplier_id != null) handleChange('transport_supplier_id', String(row.transport_supplier_id));

                if (row?.pickup_location && !form.origin?.trim()) {
                  try {
                    const { data } = await supabase
                      .from('company_address')
                      .select('address')
                      .eq('id', Number(row.pickup_location))
                      .maybeSingle();
                    if (data?.address) handleChange('origin', data.address);
                  } catch {}
                }
              }}
              style={styles.picker}
            >
              <Picker.Item label={form.project_id ? 'Selecciona una OT' : 'Selecciona un proyecto primero'} value="" />
              {transportOptions.map((r) => (
                <Picker.Item
                  key={String(r.order_id)}
                  label={`OT ${r.order_code} - ${r.transport_supplier_name} (${r.total_available ?? '—'} ${r.unit_name})`}
                  value={String(r.order_id)}
                />
              ))}
            </Picker>
          </View>
        )}













           <Text style={styles.fieldLabel}>Vehículo</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              if (!form.transport_order_id) {
                Alert.alert('Selecciona una OT', 'Primero selecciona la orden de transporte para ver los vehículos disponibles.');
                return;
              }
              const items = vehicles.map((v) => ({
                label: v.label || v.name,
                value: v.id,
                driver_id: v.driver_id,
                capacity_m3: v.capacity_m3,
              }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona un vehículo', options, cancelButtonIndex: 0 },
                (idx) => {
                  if (idx > 0) {
                    const picked = items[idx - 1];
                    handleChange('vehicle_id', picked.value);
                    if (picked.driver_id) handleChange('driver_id', picked.driver_id);
                    if (picked.capacity_m3 != null && !Number.isNaN(Number(picked.capacity_m3))) handleChange('quantity', String(picked.capacity_m3));
                  }
                }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {form.transport_order_id
                ? ((vehicles.find((v) => v.id === form.vehicle_id)?.label || vehicles.find((v) => v.id === form.vehicle_id)?.name) || 'Selecciona un vehículo')
                : 'Selecciona una OT primero'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker
              enabled={!!form.transport_order_id}
              selectedValue={form.vehicle_id}
              onValueChange={(v) => {
                handleChange('vehicle_id', v);
                const veh = vehicles.find((x) => String(x.id) === String(v));
                if (veh?.driver_id) handleChange('driver_id', veh.driver_id);
                if (veh?.capacity_m3 != null && !Number.isNaN(Number(veh.capacity_m3))) handleChange('quantity', String(veh.capacity_m3));
              }}
              style={styles.picker}
            >
              <Picker.Item
                label={form.transport_order_id ? 'Selecciona un vehículo' : 'Selecciona una OT primero'}
                value=""
              />
              {form.transport_order_id && vehicles.map((v) => (
                <Picker.Item key={v.id} label={v.label || v.name} value={v.id} />
              ))}
            </Picker>
          </View>
        )}

        <Text style={styles.fieldLabel}>Conductor (ID)</Text>
        <TextInput
          style={styles.input}
          placeholder="ID de conductor"
          keyboardType="numeric"
          value={form.driver_id}
          onChangeText={(v) => handleChange('driver_id', v.replace(/[^0-9]/g, ''))}
        />





        {/* Material y unidad se derivan de la selección OC/material */}

        <Text style={styles.fieldLabel}>Unidad</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const items = units.map((u) => ({ label: u.name, value: u.id }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona una unidad', options, cancelButtonIndex: 0 },
                (idx) => { if (idx > 0) handleChange('unit_id', items[idx - 1].value); }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {units.find((u) => u.id === form.unit_id)?.name || 'Selecciona una unidad'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker selectedValue={form.unit_id} onValueChange={(v) => handleChange('unit_id', v)} style={styles.picker}>
              <Picker.Item label="Selecciona una unidad" value="" />
              {units.map((u) => (
                <Picker.Item key={u.id} label={u.name} value={u.id} />
              ))}
            </Picker>
          </View>
        )}





        <Text style={styles.fieldLabel}>Cantidad</Text>
        <TextInput
          style={styles.input}
          placeholder="Cantidad"
          keyboardType="numeric"
          value={form.quantity}
          editable={false}
          selectTextOnFocus={false}
        />

        <Text style={styles.fieldLabel}>Origen</Text>
        <TextInput style={styles.input} placeholder="Origen (opcional)" value={form.origin} onChangeText={(v) => handleChange('origin', v)} />

        <Text style={styles.fieldLabel}>Destino</Text>
        <TextInput style={styles.input} placeholder="Destino" value={form.destination} onChangeText={(v) => handleChange('destination', v)} />

        <Text style={styles.fieldLabel}>Estado</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              const items = statuses.map((s) => ({ label: s.name, value: s.id }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Estado del servicio', options, cancelButtonIndex: 0 },
                (idx) => { if (idx > 0) handleChange('status_id', items[idx - 1].value); }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {statuses.find((s) => s.id === form.status_id)?.name || 'Selecciona un estado'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker selectedValue={form.status_id} onValueChange={(v) => handleChange('status_id', v)} style={styles.picker}>
              <Picker.Item label="Selecciona un estado" value="" />
              {statuses.map((s) => (
                <Picker.Item key={s.id} label={s.name} value={s.id} />
              ))}
            </Picker>
          </View>
        )}
      </KeyboardAwareScrollView>
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
  container: { backgroundColor: '#fff', flex: 1, borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  containerContent: { paddingHorizontal: 12, paddingBottom: 40 },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4, marginTop: 12, fontWeight: '600' },
  dropdown: { borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 10, marginBottom: 12, backgroundColor: '#F3F4F6', overflow: 'hidden', position: 'relative' },
  dropdownText: { paddingVertical: 14, paddingHorizontal: 12, color: '#333', fontSize: 16 },
  dropdownIcon: { position: 'absolute', right: 10, top: 12 },
  picker: { height: 50, width: '100%', backgroundColor: 'transparent' },
  input: { borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16, backgroundColor: '#F3F4F6' },
  smallBtn: { backgroundColor: COLORS.yellow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: '#333', fontWeight: '600' },
});
