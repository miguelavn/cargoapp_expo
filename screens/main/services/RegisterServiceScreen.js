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
  const [driverName, setDriverName] = useState('');
  const [originAddress, setOriginAddress] = useState('');
  const [projectAddresses, setProjectAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [myCompanyId, setMyCompanyId] = useState(null);
  

  const [selectedAvailability, setSelectedAvailability] = useState(null); // numeric

  // Esquema real de services (según DB): purchase_order_id, transport_order_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, material_supplier_id, transport_supplier_id, project_id
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
  });

  const handleChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const prevTransportSupplierRef = useRef('');

  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const loadMyCompanyId = async () => {
    try {
      if (myCompanyId != null) return myCompanyId;
      const { data: sessionRes } = await supabase.auth.getSession();
      const authId = sessionRes?.session?.user?.id;
      if (!authId) return null;
      const { data } = await supabase.from('app_users').select('company_id').eq('auth_id', authId).maybeSingle();
      const cid = data?.company_id ?? null;
      setMyCompanyId(cid);
      return cid;
    } catch {
      return null;
    }
  };

  const loadDriverByVehicle = async (vehicleId) => {
    try {
      if (!vehicleId) {
        setDriverName('');
        return;
      }
      const res = await callEdgeFunction('get-driver-by-vehicle', {
        method: 'GET',
        query: { vehicle_id: Number(vehicleId) },
      });
      setDriverName(String(res?.driver?.name || ''));
    } catch {
      setDriverName('');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Web parity: intenta listar proyectos vía edge (filtra según permisos/RLS)
        try {
          const res = await callEdgeFunction('list-projects', { method: 'GET', query: { limit: 1000 } });
          const rows = Array.isArray(res?.projects) ? res.projects : (Array.isArray(res?.data) ? res.data : []);
          const mapped = rows.map((p) => ({
            id: String(p.project_id ?? p.id),
            name: String(p.project_name ?? p.name ?? ''),
            status: p.status,
          }));
          setProjects(mapped.filter((p) => p.id && p.name && p.status !== false));
        } catch {
          const { data: pjs } = await supabase.from('projects').select('project_id, name, status').eq('status', true).order('name');
          setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
        }
      } catch {}
      // No cargar vehículos hasta seleccionar una OT
      setVehicles([]);
      await loadUnits();
      if (serviceId) await loadService(serviceId);
    })();
  }, []);

  // Realtime (como web): refrescar disponibilidad y vehículos cuando cambian órdenes/detalles/vehículos
  useEffect(() => {
    const refresh = async () => {
      const cur = formRef.current;
      if (cur?.project_id) {
        await fetchPurchaseOptions(cur.project_id);
        if (cur?.material_id) await fetchTransportOptions(cur.project_id, cur.material_id);
      }
      if (cur?.transport_supplier_id) {
        await loadVehicles(cur.transport_supplier_id);
      }
    };

    const channel = supabase
      .channel('register-service-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_details' }, () => { refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => { refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_vehicles' }, () => { refresh(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recargar vehículos cuando cambie el supplier de la orden de transporte
  useEffect(() => {
    const nextSupplierId = form.transport_supplier_id || '';
    if (prevTransportSupplierRef.current === nextSupplierId) return;
    prevTransportSupplierRef.current = nextSupplierId;

    // Si cambia el supplier, resetear vehículo/conductor
    setForm((s) => ({ ...s, vehicle_id: '', driver_id: '' }));
    setDriverName('');

    // Si aún no hay OT/supplier seleccionado, no mostrar vehículos
    if (!nextSupplierId) {
      setVehicles([]);
      return;
    }

    loadVehicles(nextSupplierId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.transport_supplier_id]);

  // Resolver origen (id o texto) a dirección para mostrar (modo web)
  useEffect(() => {
    (async () => {
      const raw = String(form.origin || '').trim();
      if (!raw) {
        setOriginAddress('');
        return;
      }
      const asNum = Number(raw);
      if (!Number.isNaN(asNum) && raw !== '') {
        try {
          const { data } = await supabase.from('company_address').select('address').eq('id', asNum).maybeSingle();
          setOriginAddress(String(data?.address || ''));
          return;
        } catch {
          // fallback a mostrar el valor
        }
      }
      setOriginAddress(raw);
    })();
  }, [form.origin]);

  // Cargar direcciones de proyecto (modo web) para destino
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.project_id) {
        setProjectAddresses([]);
        return;
      }
      setLoadingAddresses(true);
      try {
        const { data, error } = await supabase
          .from('project_address')
          .select('id, address, city_id, location')
          .eq('project_id', Number(form.project_id))
          .eq('address_type_id', 1);
        if (!cancelled && !error) {
          setProjectAddresses(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setProjectAddresses([]);
      } finally {
        if (!cancelled) setLoadingAddresses(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.project_id]);

  // Resolver destino (id) a dirección para mostrar
  useEffect(() => {
    (async () => {
      const raw = String(form.destination || '').trim();
      if (!raw) {
        setDestinationAddress('');
        return;
      }
      const local = projectAddresses.find((a) => String(a.id) === raw);
      if (local?.address) {
        setDestinationAddress(String(local.address));
        return;
      }
      const asNum = Number(raw);
      if (!Number.isNaN(asNum)) {
        try {
          const { data } = await supabase.from('project_address').select('address').eq('id', asNum).maybeSingle();
          setDestinationAddress(String(data?.address || ''));
          return;
        } catch {}
      }
      setDestinationAddress(raw);
    })();
  }, [form.destination, projectAddresses]);

  // Sincronizar conductor (ID) desde vehículo y resolver nombre (Edge Function)
  useEffect(() => {
    (async () => {
      if (!form.vehicle_id) {
        if (form.driver_id) setForm((s) => ({ ...s, driver_id: '' }));
        setDriverName('');
        return;
      }

      const veh = vehicles.find((v) => String(v.id) === String(form.vehicle_id));
      if (veh?.driver_id && String(form.driver_id) !== String(veh.driver_id)) {
        setForm((s) => ({ ...s, driver_id: String(veh.driver_id) }));
      }

      await loadDriverByVehicle(form.vehicle_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vehicle_id, vehicles]);

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

  // Cargar disponibilidad cuando cambia el proyecto (OC/material). Las OT se cargan cuando haya material seleccionado.
  useEffect(() => {
    (async () => {
      await fetchPurchaseOptions(form.project_id);
      setTransportOptions([]);

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
        origin: '',
        destination: '',
      }));
      setOriginAddress('');
      setDestinationAddress('');
      setVehicles([]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id]);

  // Cargar OT (transport_orders_availability) cuando cambie el material seleccionado (como web)
  useEffect(() => {
    (async () => {
      if (!form.project_id || !form.material_id) {
        setTransportOptions([]);
        return;
      }
      await fetchTransportOptions(form.project_id, form.material_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.material_id, form.project_id]);

  const loadVehicles = async (transportSupplierId = '') => {
    try {
      const companyId = await loadMyCompanyId();

      const { data } = await supabase.from('vehicles').select('*');
      let list = Array.isArray(data) ? data : [];

      // Filtros base (solo si existen las columnas)
      list = list.filter((v) => {
        if (v.is_active === false) return false;
        if (v.is_available === false) return false;
        if (Object.prototype.hasOwnProperty.call(v, 'online') && v.online === false) return false;
        if (Object.prototype.hasOwnProperty.call(v, 'current_service_id') && v.current_service_id != null) return false;
        if (companyId != null && Object.prototype.hasOwnProperty.call(v, 'created_by_company') && v.created_by_company != null) {
          if (Number(v.created_by_company) !== Number(companyId)) return false;
        }
        return true;
      });

      // Filtrar por supplier de transporte
      if (transportSupplierId) {
        const sid = Number(transportSupplierId);
        if (!Number.isNaN(sid)) {
          list = list.filter((v) => Number(v.transport_supplier_id) === sid);
        }
      }

      // Filtrar por vehículos asignados al proyecto (si existen)
      if (formRef.current?.project_id) {
        try {
          const { data: pv } = await supabase
            .from('project_vehicles')
            .select('vehicle_id')
            .eq('project_id', Number(formRef.current.project_id));
          const ids = (pv || []).map((r) => Number(r.vehicle_id)).filter((x) => !Number.isNaN(x));
          if (ids.length > 0) {
            const idSet = new Set(ids);
            list = list.filter((v) => idSet.has(Number(v.vehicle_id ?? v.id)));
          }
        } catch {}
      }

      const mapped = list
        .map((v) => {
          const vid = v.vehicle_id ?? v.id;
          return {
            id: String(vid),
            name: String(v.plate || ''),
            label: [String(v.model || '').trim(), v.capacity_m3 != null ? `${v.capacity_m3} m³` : '', String(v.plate || '')]
              .filter((x) => String(x || '').trim())
              .join(' - '),
            capacity_m3: v.capacity_m3,
            driver_id: v.driver_id != null ? String(v.driver_id) : '',
          };
        })
        .filter((v) => v.id && v.name);

      mapped.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setVehicles(mapped);
    } catch (e) {}
  };

  const fetchPurchaseOptions = async (projectId) => {
    try {
      if (!projectId) {
        setPurchaseOptions([]);
        return;
      }

      // Órdenes de compra + materiales disponibles
      const { data: purchRows } = await supabase
        .from('project_materials_availability')
        .select('project_id, order_id, order_code, material_id, material_name, unit_id, unit_name, available, supplier_id, supplier_name')
        .eq('project_id', Number(projectId));
      setPurchaseOptions(Array.isArray(purchRows) ? purchRows : []);
    } catch (e) {
      // En caso de fallo, dejar vacío
      setPurchaseOptions([]);
    }
  };

  const fetchTransportOptions = async (projectId, materialId) => {
    try {
      if (!projectId || !materialId) {
        setTransportOptions([]);
        return;
      }
      const { data: trRows } = await supabase
        .from('transport_orders_availability')
        .select('*')
        .eq('project_id', Number(projectId));

      let rows = Array.isArray(trRows) ? trRows : [];
      // Filtros como web, solo si existen esas columnas
      rows = rows.filter((r) => {
        if (Object.prototype.hasOwnProperty.call(r, 'material_id') && String(r.material_id) !== String(materialId)) return false;
        if (Object.prototype.hasOwnProperty.call(r, 'is_active') && r.is_active === false) return false;
        return true;
      });

      setTransportOptions(rows);
    } catch {
      setTransportOptions([]);
    }
  };

  const loadUnits = async () => {
    try {
      const { data } = await supabase.from('measurement_units').select('id, name');
      setUnits((data || []).map((u) => ({ id: String(u.id), name: u.name })));
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
        });
      } catch {
        const { data } = await supabase
          .from('services')
          .select('service_id, purchase_order_id, transport_order_id, project_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, material_supplier_id, transport_supplier_id')
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
    if (!form.driver_id) errs.driver_id = 'El vehículo no tiene conductor asignado';
    if (!form.material_id) errs.material_id = 'Selecciona un material';
    if (!form.unit_id) errs.unit_id = 'Selecciona una unidad';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) errs.quantity = 'Cantidad requerida (capacidad del vehículo)';
    if (selectedAvailability != null && !isNaN(Number(form.quantity)) && Number(form.quantity) > Number(selectedAvailability)) {
      errs.quantity = `Cantidad supera disponible (${selectedAvailability})`;
    }
    if (!String(form.destination || '').trim()) errs.destination = 'Destino requerido';
    if (Object.keys(errs).length) return Alert.alert('Validación', Object.values(errs)[0]);

    try {
      setLoading(true);
      if (serviceId) {
        // update
        try {
          const originNum = Number(form.origin);
          const originValue = !Number.isNaN(originNum) && String(form.origin || '').trim() ? originNum : (form.origin?.trim() || null);
          const destNum = Number(form.destination);
          const destValue = !Number.isNaN(destNum) && String(form.destination || '').trim() ? destNum : (form.destination?.trim() || null);
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
              origin: originValue,
              destination: destValue,
              material_supplier_id: Number(form.material_supplier_id),
              transport_supplier_id: Number(form.transport_supplier_id),
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
              destination: form.destination?.trim() || null,
              material_supplier_id: Number(form.material_supplier_id),
              transport_supplier_id: Number(form.transport_supplier_id),
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
          const originNum = Number(form.origin);
          const originValue = !Number.isNaN(originNum) && String(form.origin || '').trim() ? originNum : (form.origin?.trim() || null);
          const destNum = Number(form.destination);
          const destValue = !Number.isNaN(destNum) && String(form.destination || '').trim() ? destNum : (form.destination?.trim() || null);
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
              origin: originValue,
              destination: destValue,
              material_supplier_id: Number(form.material_supplier_id),
              transport_supplier_id: Number(form.transport_supplier_id),
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
            destination: form.destination?.trim() || null,
            material_supplier_id: Number(form.material_supplier_id),
            transport_supplier_id: Number(form.transport_supplier_id),
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

                // Al cambiar material, limpiar transporte/vehículo/origen (como web)
                handleChange('transport_order_id', '');
                handleChange('transport_supplier_id', '');
                handleChange('vehicle_id', '');
                handleChange('driver_id', '');
                handleChange('origin', '');
                setOriginAddress('');
                setVehicles([]);
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

                    // Al cambiar OT, limpiar vehículo/conductor para evitar inconsistencias
                    handleChange('vehicle_id', '');
                    handleChange('driver_id', '');
                    setDriverName('');

                    // origen estilo web: guardar el id de pickup_location y mostrar la dirección
                    handleChange('origin', picked.pickup_location != null ? String(picked.pickup_location) : '');

                    handleChange('transport_supplier_id', picked.supplier_id);

                    // autocompletar origen desde pickup_location si existe
                    if (picked.pickup_location) {
                      try {
                        const { data } = await supabase
                          .from('company_address')
                          .select('address')
                          .eq('id', Number(picked.pickup_location))
                          .maybeSingle();
                        if (data?.address) setOriginAddress(data.address);
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

                // Al cambiar OT, limpiar vehículo/conductor para evitar inconsistencias
                handleChange('vehicle_id', '');
                handleChange('driver_id', '');
                setDriverName('');

                const row = transportOptions.find((r) => String(r.order_id) === String(v));
                if (row?.transport_supplier_id != null) handleChange('transport_supplier_id', String(row.transport_supplier_id));

                // origen estilo web
                handleChange('origin', row?.pickup_location != null ? String(row.pickup_location) : '');
                setOriginAddress('');

                if (row?.pickup_location) {
                  try {
                    const { data } = await supabase
                      .from('company_address')
                      .select('address')
                      .eq('id', Number(row.pickup_location))
                      .maybeSingle();
                    if (data?.address) setOriginAddress(data.address);
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

        <Text style={styles.fieldLabel}>Conductor</Text>
        <TextInput
          style={styles.input}
          placeholder="Conductor"
          value={
            !form.vehicle_id
              ? 'Seleccione un vehículo'
              : (driverName || (form.driver_id ? `Conductor #${form.driver_id}` : ''))
          }
          editable={false}
          selectTextOnFocus={false}
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
        <TextInput
          style={styles.input}
          placeholder="Se asigna al seleccionar OT"
          value={originAddress || (form.origin ? `Dirección #${form.origin}` : '')}
          editable={false}
          selectTextOnFocus={false}
        />

        <Text style={styles.fieldLabel}>Destino</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              if (!form.project_id) {
                Alert.alert('Selecciona un proyecto', 'Primero elige un proyecto para listar destinos.');
                return;
              }
              if (loadingAddresses) {
                Alert.alert('Cargando', 'Cargando direcciones del proyecto…');
                return;
              }
              const items = projectAddresses.map((a) => ({
                label: String(a.address || `Dirección #${a.id}`),
                value: String(a.id),
              }));
              const options = ['Cancelar', ...items.map((i) => i.label)];
              ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Selecciona un destino', options, cancelButtonIndex: 0 },
                (idx) => {
                  if (idx > 0) {
                    const picked = items[idx - 1];
                    handleChange('destination', picked.value);
                    setDestinationAddress(picked.label);
                  }
                }
              );
            }}
          >
            <Text style={styles.dropdownText}>
              {destinationAddress || (form.destination ? `Dirección #${form.destination}` : (form.project_id ? (loadingAddresses ? 'Cargando…' : 'Selecciona un destino') : 'Selecciona un proyecto primero'))}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker
              enabled={!!form.project_id && !loadingAddresses}
              selectedValue={String(form.destination || '')}
              onValueChange={(v) => {
                handleChange('destination', v);
                const addr = projectAddresses.find((a) => String(a.id) === String(v));
                setDestinationAddress(String(addr?.address || ''));
              }}
              style={styles.picker}
            >
              <Picker.Item
                label={!form.project_id ? 'Selecciona un proyecto primero' : (loadingAddresses ? 'Cargando destinos…' : 'Selecciona un destino')}
                value=""
              />
              {projectAddresses.map((a) => (
                <Picker.Item key={String(a.id)} label={String(a.address || `Dirección #${a.id}`)} value={String(a.id)} />
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
