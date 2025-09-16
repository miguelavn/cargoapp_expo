import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Alert, ActionSheetIOS, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { COLORS } from '../../../theme/colors';

// Contenedor de header estable para FlatList
const HeaderListContainer = ({ formHeader, linesHeader }) => (
  <>
    {formHeader}
    {linesHeader}
  </>
);

// Formateo de moneda colombiana (COP) con fallback simple
const formatCOP = (value) => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!isFinite(num)) return String(value ?? '');
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(num);
  } catch (e) {
    // Fallback: $ 1.234.567
    const rounded = Math.round(num);
    const s = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$ ${s}`;
  }
};

export default function RegisterOrderScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const notchThreshold = 44;
  // En OrdersListScreen se usa SafeAreaView, así que el padding top efectivo es insets.top + 8 en Android.
  // Aquí sumamos insets.top manualmente para igualar la altura visual.
  const headerTop = Platform.OS === 'ios'
    ? (insets.top > notchThreshold ? insets.top - 6 : insets.top)
    : (insets.top + 8);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);
  const [supplierCompanies, setSupplierCompanies] = useState([]);
  const [orderDetails, setOrderDetails] = useState([]);
  // Data combinada: header como primer item para evitar remount del header y cierre de teclado
  const listData = React.useMemo(() => [{ __type: 'header', _key: '__HEADER__' }, ...orderDetails], [orderDetails]);
  const [units, setUnits] = useState([]); // measurement_units
  const [materials, setMaterials] = useState([]); // materials (material_id, name, unit_id, company_id)
  const [showLineModal, setShowLineModal] = useState(false);
  const [editingLine, setEditingLine] = useState(null); // objeto línea o null
  const [savingLine, setSavingLine] = useState(false);
  const [lineForm, setLineForm] = useState({
    description: '',
    unit_id: '',
    quantity: '',
    unit_value: '',
    unit_value_display: '',
    pickup_location: '',
    delivery_location: '',
    material_id: '',
  });
  const orderId = route?.params?.orderId ? Number(route.params.orderId) : null;
  const [isEditing, setIsEditing] = useState(orderId ? false : true);
  const [form, setForm] = useState({
    project_id: route?.params?.projectId ? String(route.params.projectId) : '',
    order_type_id: '',
    code: '',
    date: '',
    supplier_id: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: pjs } = await supabase.from('projects').select('project_id, name, status').eq('status', true).order('name');
        setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
      } catch {}
      try {
        const { data: types } = await supabase.from('order_type').select('id, type');
        setOrderTypes((types || []).map((t) => ({ id: String(t.id), name: t.type })));
      } catch {}
      try {
        const { data: ct } = await supabase.from('company_types').select('id, name');
        const supplierTypeIds = (ct || [])
          .filter((t) => {
            const n = String(t?.name || '').toLowerCase();
            return n === 'supplier' || n === 'client and supplier' || n === 'cliente y proveedor' || n === 'proveedor';
          })
          .map((t) => t.id);
        if (supplierTypeIds.length > 0) {
          const { data: companies } = await supabase
            .from('companies')
            .select('company_id, name, company_type_id')
            .in('company_type_id', supplierTypeIds)
            .order('name');
          setSupplierCompanies((companies || []).map((c) => ({ id: String(c.company_id), name: c.name })));
        } else {
          setSupplierCompanies([]);
        }
      } catch {}
      try {
        const { data: mu } = await supabase.from('measurement_units').select('id, name').order('name');
        setUnits((mu || []).map(u => ({ id: String(u.id), name: u.name })));
      } catch {}
      try {
        const { data: mats } = await supabase
          .from('materials')
          .select('material_id, name, unit_id, company_id')
          .order('name');
        setMaterials((mats || []).map((m) => ({ id: String(m.material_id), name: m.name, unit_id: m.unit_id != null ? String(m.unit_id) : '', company_id: m.company_id })));
      } catch {}
      if (orderId) {
        await loadOrder(orderId);
      }
    })();
  }, []);

  const loadOrder = async (id) => {
    try {
      let header;
      try {
        const res = await callEdgeFunction('get-order', { method: 'GET', query: { id } });
        header = res?.order;
        if (Array.isArray(res?.details)) {
          setOrderDetails(res.details.map(d => ({
            ...d,
            material_id: d.material_id != null ? String(d.material_id) : ''
          })));
        }
      } catch (_) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, code, date, order_type_id, project_id, supplier_id')
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        header = data;
        const { data: det } = await supabase
          .from('order_details')
          .select('id, description, unit_id, quantity, unit_value, total_value, pickup_location, delivery_location, material_id')
          .eq('order_id', id)
          .order('id', { ascending: true });
        setOrderDetails((det || []).map(d => ({
          ...d,
          material_id: d.material_id != null ? String(d.material_id) : ''
        })));
      }
      if (header) {
        setForm((s) => ({
          ...s,
          project_id: header.project_id ? String(header.project_id) : '',
          order_type_id: header.order_type_id ? String(header.order_type_id) : '',
          code: header.code || '',
          date: header.date || '',
          supplier_id: header.supplier_id ? String(header.supplier_id) : '',
        }));
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo cargar la orden');
    }
  };


  const handleChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const setLineField = (k, v) => setLineForm((s) => ({ ...s, [k]: v }));

  // Formateo en vivo de valor unitario (COP sin decimales)
  const onUnitValueChange = (text) => {
    const digits = (text || '').replace(/\D+/g, '');
    if (!digits) {
      setLineForm((s) => ({ ...s, unit_value: '', unit_value_display: '' }));
      return;
    }
    const num = Number(digits);
    setLineForm((s) => ({ ...s, unit_value: String(num), unit_value_display: formatCOP(num) }));
  };

  // Cantidad: solo enteros
  const onQuantityChange = (text) => {
    const t = (text || '').replace(/[^0-9]/g, '');
    setLineField('quantity', t);
  };

  const openLineModal = (line = null) => {
    setEditingLine(line);
    if (line) {
      setLineForm({
        description: line.description || '',
        unit_id: line.unit_id ? String(line.unit_id) : '',
        quantity: line.quantity != null ? String(line.quantity) : '',
        unit_value: line.unit_value != null ? String(line.unit_value) : '',
        unit_value_display: line.unit_value != null ? formatCOP(line.unit_value) : '',
        pickup_location: line.pickup_location || '',
        delivery_location: line.delivery_location || '',
        material_id: line.material_id ? String(line.material_id) : '',
      });
    } else {
      setLineForm({ description: '', unit_id: '', quantity: '', unit_value: '', unit_value_display: '', pickup_location: '', delivery_location: '', material_id: '' });
    }
    setShowLineModal(true);
  };
  const closeLineModal = () => { setShowLineModal(false); setEditingLine(null); };

  const reloadDetails = async () => {
    if (!orderId) return;
    try {
      try {
        const res = await callEdgeFunction('get-order', { method: 'GET', query: { id: orderId } });
        if (Array.isArray(res?.details)) {
          setOrderDetails(res.details.map(d => ({
            ...d,
            material_id: d.material_id != null ? String(d.material_id) : ''
          })));
          return;
        }
      } catch {}
      const { data: det } = await supabase
        .from('order_details')
        .select('id, description, unit_id, quantity, unit_value, total_value, pickup_location, delivery_location, material_id')
        .eq('order_id', orderId)
        .order('id', { ascending: true });
      setOrderDetails((det || []).map(d => ({
        ...d,
        material_id: d.material_id != null ? String(d.material_id) : ''
      })));
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudieron recargar las líneas');
    }
  };


  const saveLine = async () => {
  const isPurchase = Number(form.order_type_id) === 1;
  const errs = [];
  if (!lineForm.description?.trim()) errs.push('Descripción requerida');
  // Cantidad entera > 0
  if (!/^\d+$/.test(lineForm.quantity || '')) errs.push('Cantidad debe ser un entero');
  const qty = Number(lineForm.quantity);
  if (!(qty > 0)) errs.push('Cantidad debe ser > 0');
  // Unidad requerida
  if (!lineForm.unit_id) errs.push('Selecciona una unidad');
  // Material requerido solo para órdenes de compra (order_type_id = 1)
  if (isPurchase && !lineForm.material_id) errs.push('Selecciona un material');
  // Valor unitario requerido y >= 0
  const unitVal = lineForm.unit_value !== '' ? Number(lineForm.unit_value) : null;
  if (!(unitVal >= 0)) errs.push('Valor unitario requerido');
  // Origen y Destino requeridos
  if (!lineForm.pickup_location?.trim()) errs.push('Origen requerido');
  if (!lineForm.delivery_location?.trim()) errs.push('Destino requerido');
    if (errs.length) { Alert.alert('Validación', errs[0]); return; }
    const total = unitVal != null ? qty * unitVal : null;
    const payload = {
      order_id: orderId || null,
      description: lineForm.description.trim(),
  unit_id: Number(lineForm.unit_id),
      quantity: qty,
      unit_value: unitVal,
      total_value: total,
      pickup_location: lineForm.pickup_location?.trim() || null,
      delivery_location: lineForm.delivery_location?.trim() || null,
      material_id: lineForm.material_id ? Number(lineForm.material_id) : null,
    };
    try {
      setSavingLine(true);
      if (!orderId) {
        // Modo creación: gestionar en memoria
        if (editingLine && (editingLine.id || editingLine._tmpId)) {
          setOrderDetails((prev) => prev.map((l) => {
            const match = editingLine.id ? l.id === editingLine.id : l._tmpId === editingLine._tmpId;
            return match ? { ...l, ...payload, id: l.id, _tmpId: l._tmpId } : l;
          }));
        } else {
          const tmpId = Date.now() + Math.random();
          setOrderDetails((prev) => [...prev, { ...payload, id: undefined, _tmpId: tmpId }]);
        }
      } else {
        if (editingLine) {
          // update en backend (sin fallback directo a Supabase)
          try {
            await callEdgeFunction('update-order-detail', { method: 'POST', body: { id: editingLine.id, ...payload } });
          } catch (e) {
            // Mostrar mensaje exacto de la edge function y mantener modal abierto
            Alert.alert('Error', e?.message || 'No se pudo actualizar la línea');
            return;
          }
        } else {
          // create en backend (sin fallback directo a Supabase)
          try {
            await callEdgeFunction('create-order-detail', { method: 'POST', body: payload });
          } catch (e) {
            Alert.alert('Error', e?.message || 'No se pudo crear la línea');
            return;
          }
        }
        await reloadDetails();
      }
      closeLineModal();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar la línea');
    } finally {
      setSavingLine(false);
    }
  };

  const confirmDeleteLine = (line) => {
    Alert.alert('Eliminar línea', '¿Deseas eliminar esta línea?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteLine(line) },
    ]);
  };
  const deleteLine = async (line) => {
    try {
      if (!orderId) {
        // Modo creación: eliminar en memoria usando _tmpId
        if (line?._tmpId != null) {
          setOrderDetails((prev) => prev.filter((l) => l._tmpId !== line._tmpId));
        }
        return;
      }
      if (!line?.id) return;
      try {
        await callEdgeFunction('delete-order-detail', { method: 'POST', body: { id: line.id } });
      } catch (e) {
        Alert.alert('Error', e?.message || 'No se pudo eliminar la línea');
        return;
      }
      await reloadDetails();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo eliminar la línea');
    }
  };

  const onSubmit = async () => {
    const errs = {};
    if (!form.project_id) errs.project_id = 'Selecciona un proyecto';
    if (!form.order_type_id) errs.order_type_id = 'Selecciona un tipo de orden';
  // Código y Fecha se generan automáticamente en creación; no validar ingreso del usuario
  if (!form.supplier_id) errs.supplier_id = 'Selecciona un proveedor';
  if (!orderId && orderDetails.length === 0) errs.details = 'Agrega al menos una línea a la orden';
    if (Object.keys(errs).length) {
      Alert.alert('Validación', Object.values(errs)[0]);
      return;
    }
    try {
      setLoading(true);
      if (orderId) {
        try {
          await callEdgeFunction('update-order', {
            method: 'POST',
            body: {
              id: orderId,
              project_id: Number(form.project_id),
              order_type_id: Number(form.order_type_id),
              // code y date no se editan desde la app en update
              supplier_id: Number(form.supplier_id),
            },
          });
          Alert.alert('Éxito', 'Orden actualizada', [
            { text: 'OK', onPress: async () => { setIsEditing(false); await loadOrder(orderId); } },
          ]);
        } catch (e) {
          Alert.alert('Pendiente', e.message || 'Falta implementar update-order en el backend');
        }
      } else {
        // Generar código y fecha automáticamente y enviar detalles en la creación
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const y = now.getFullYear();
        const m = pad(now.getMonth() + 1);
        const d = pad(now.getDate());
        const hh = pad(now.getHours());
        const mm = pad(now.getMinutes());
        const ss = pad(now.getSeconds());
        // Obtener user_id (app_users) y company_id si es posible
        let appUserId = '';
        let companyId = null;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const authId = session?.user?.id;
          if (authId) {
            const { data: appUser } = await supabase
              .from('app_users')
              .select('user_id, company_id')
              .eq('auth_id', authId)
              .maybeSingle();
            appUserId = appUser?.user_id ? String(appUser.user_id) : '';
            companyId = appUser?.company_id ?? null;
          }
        } catch {}
        // Código: AAAAMMDDHHMMSS-ID (ID de app_users.user_id)
        const autoCode = `${y}${m}${d}${hh}${mm}${ss}${appUserId ? '-' + appUserId : ''}`;
        const autoDate = `${y}-${m}-${d}`;
        // Construir detalles según contrato del edge
        const details = orderDetails.map((l) => ({
          description: l.description,
          unit_id: l.unit_id != null ? Number(l.unit_id) : null,
          quantity: Number(l.quantity),
          unit_value: l.unit_value != null ? Number(l.unit_value) : null,
          total_value: l.total_value != null ? Number(l.total_value) : (l.unit_value != null ? Number(l.unit_value) * Number(l.quantity) : null),
          pickup_location: l.pickup_location ?? null,
          delivery_location: l.delivery_location ?? null,
          material_id: l.material_id ? Number(l.material_id) : null,
        }));
        const body = {
          project_id: Number(form.project_id),
          order_type_id: Number(form.order_type_id),
          code: autoCode,
          date: autoDate,
          supplier_id: Number(form.supplier_id),
          details,
          ...(companyId ? { company_id: companyId } : {}),
        };
        const res = await callEdgeFunction('create-order', { method: 'POST', body });
        const newOrderId = res?.id ?? res?.order?.id ?? res?.data?.id;
        Alert.alert('Éxito', 'Orden creada', [
          { text: 'OK', onPress: () => navigation.navigate('OrdersList', { refresh: true, projectId: form.project_id }) },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo crear la orden');
    } finally {
      setLoading(false);
    }
  };

  const FormHeader = () => (
    <View style={styles.formCard}>
      {/* Botón Editar/Ver movido al header superior */}

      {orderId && !isEditing ? (
        <>
          <Text style={styles.fieldLabel}>Proyecto</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{projects.find((p) => p.id === form.project_id)?.name || '—'}</Text>
          </View>

          <Text style={styles.fieldLabel}>Tipo de orden</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{orderTypes.find((t) => t.id === form.order_type_id)?.name || '—'}</Text>
          </View>

          <Text style={styles.fieldLabel}>Código</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{form.code || '—'}</Text>
          </View>

          <Text style={styles.fieldLabel}>Fecha</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{form.date || '—'}</Text>
          </View>

          <Text style={styles.fieldLabel}>Proveedor</Text>
          <View style={styles.valueBox}>
            <Text style={styles.valueText}>{supplierCompanies.find((c) => c.id === form.supplier_id)?.name || '—'}</Text>
          </View>

          <TouchableOpacity
            disabled
            style={[styles.button, styles.buttonDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>{orderId ? 'Guardar cambios' : 'Guardar orden'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Proyecto */}
          <Text style={styles.fieldLabel}>Proyecto</Text>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={[styles.dropdown, !isEditing && { opacity: 0.7 }]}
              disabled={!isEditing}
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
            <View style={[styles.dropdown, !isEditing && { opacity: 0.7 }]}>
              <Picker enabled={!!isEditing} selectedValue={form.project_id} onValueChange={(v) => handleChange('project_id', v)} style={styles.picker}>
                <Picker.Item label="Selecciona un proyecto" value="" />
                {projects.length === 0 && <Picker.Item label="Sin proyectos" value="" />}
                {projects.map((p) => (
                  <Picker.Item key={p.id} label={p.name} value={p.id} />
                ))}
              </Picker>
            </View>
          )}

          {/* Tipo de orden */}
          <Text style={styles.fieldLabel}>Tipo de orden</Text>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={[styles.dropdown, !isEditing && { opacity: 0.7 }]}
              disabled={!isEditing}
              onPress={() => {
                const items = orderTypes.map((t) => ({ label: t.name, value: t.id }));
                const options = ['Cancelar', ...items.map((i) => i.label)];
                ActionSheetIOS.showActionSheetWithOptions(
                  { title: 'Tipo de orden', options, cancelButtonIndex: 0 },
                  (idx) => { if (idx > 0) handleChange('order_type_id', items[idx - 1].value); }
                );
              }}
            >
              <Text style={styles.dropdownText}>
                {orderTypes.find((t) => t.id === form.order_type_id)?.name || 'Selecciona el tipo de orden'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.dropdown, !isEditing && { opacity: 0.7 }]}>
              <Picker enabled={!!isEditing} selectedValue={form.order_type_id} onValueChange={(v) => handleChange('order_type_id', v)} style={styles.picker}>
                <Picker.Item label="Selecciona el tipo de orden" value="" />
                {orderTypes.length === 0 && <Picker.Item label="Sin tipos" value="" />}
                {orderTypes.map((t) => (
                  <Picker.Item key={t.id} label={t.name} value={t.id} />
                ))}
              </Picker>
            </View>
          )}

          {/* Código y Fecha no se muestran en creación/edición: se generan automáticamente */}
          {/* Proveedor (obligatorio) */}
          <Text style={styles.fieldLabel}>Proveedor</Text>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={[styles.dropdown, orderId && !isEditing && { opacity: 0.7 }]}
              disabled={orderId && !isEditing}
              onPress={() => {
                const items = supplierCompanies.map((c) => ({ label: c.name, value: c.id }));
                const options = ['Cancelar', ...items.map((i) => i.label)];
                ActionSheetIOS.showActionSheetWithOptions(
                  { title: 'Selecciona un proveedor', options, cancelButtonIndex: 0, destructiveButtonIndex: undefined },
                  (idx) => { if (idx > 0) handleChange('supplier_id', items[idx - 1].value); }
                );
              }}
            >
              <Text style={styles.dropdownText}>
                {supplierCompanies.find((c) => c.id === form.supplier_id)?.name || 'Selecciona un proveedor'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.dropdown, orderId && !isEditing && { opacity: 0.7 }]}>
              <Picker enabled={!orderId || !!isEditing} selectedValue={form.supplier_id} onValueChange={(v) => handleChange('supplier_id', v)} style={styles.picker}>
                <Picker.Item label="Selecciona un proveedor" value="" />
                {supplierCompanies.map((c) => (
                  <Picker.Item key={c.id} label={c.name} value={c.id} />
                ))}
              </Picker>
            </View>
          )}

          {/* Acción principal */}
          <TouchableOpacity
            disabled={loading || (orderId && !isEditing)}
            onPress={onSubmit}
            style={[styles.button, (loading || (orderId && !isEditing)) && styles.buttonDisabled]}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>{loading ? 'Guardando...' : (orderId ? 'Guardar cambios' : 'Guardar orden')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const LinesHeader = () => (
    <View style={styles.formCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.subtitleStrong}>Líneas de la orden</Text>
        {(isEditing || !orderId) && (
          <TouchableOpacity
            onPress={() => openLineModal()}
            style={styles.addLineBtn}
            activeOpacity={0.85}
          >
            <MaterialIcons name="add" size={20} color="#333" />
          </TouchableOpacity>
        )}
      </View>
      {orderDetails.length === 0 && (
        <Text style={{ color: '#666', marginTop: 6 }}>Esta orden no tiene líneas.</Text>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Header morado con botón atrás y título */}
      <View style={[styles.headerArea, { paddingTop: headerTop }]}>
        <View style={styles.topBarRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1 }]}>{orderId ? 'Detalle de orden' : 'Registrar orden'}</Text>
          {orderId && (
            <TouchableOpacity
              onPress={() => setIsEditing((v) => !v)}
              style={[styles.smallBtn, !isEditing && { backgroundColor: '#EEE' }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.smallBtnText, !isEditing && { color: '#333' }]}>{isEditing ? 'Ver' : 'Editar'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAwareFlatList
        enableOnAndroid={true}
        extraScrollHeight={100}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        data={listData}
        keyExtractor={(it, idx) => (it?.__type === 'header' ? it._key : String(it?.id ?? it?._tmpId ?? idx))}
        contentContainerStyle={styles.container}
        renderItem={({ item }) => (
          item?.__type === 'header' ? (
            <View key="__header_block">
              <FormHeader />
              <LinesHeader />
            </View>
          ) : (
          <View style={[styles.detailRow, { width: '100%' }]}>
            {/* Descripción */}
            <Text style={styles.detailTitle} numberOfLines={3}>
              {item?.description || '(Sin descripción)'}
            </Text>

            {/* Material: mostrar solo para órdenes de compra (order_type_id = 1) */}
            {Number(form.order_type_id) === 1 && (
              <Text style={styles.detailMeta}>
                Material: {item?.material_id ? (materials.find((m) => m.id === String(item.material_id))?.name || `ID ${item.material_id}`) : '—'}
              </Text>
            )}

            {/* Cantidad + Unidad */}
            <Text style={styles.detailMeta}>
              {(() => {
                const qty = item?.quantity ?? '-';
                const unitName = (() => {
                  const uid = item?.unit_id != null ? String(item.unit_id) : '';
                  return units.find((u) => u.id === uid)?.name;
                })();
                return `Cantidad: ${qty}${unitName ? ` ${unitName}` : ''}`;
              })()}
            </Text>

            {/* Valor unitario */}
            {item?.unit_value != null && (
              <Text style={styles.detailMeta}>Vlr unidad: {formatCOP(item.unit_value)}</Text>
            )}

            {/* Total */}
            {item?.total_value != null && (
              <Text style={styles.detailMeta}>Total: {formatCOP(item.total_value)}</Text>
            )}

            {/* Origen / Destino */}
            {(item?.pickup_location || item?.delivery_location) && (
              <Text style={styles.detailMeta} numberOfLines={2}>
                {item?.pickup_location ? `Origen: ${item.pickup_location}` : ''}
                {item?.pickup_location && item?.delivery_location ? ' | ' : ''}
                {item?.delivery_location ? `Destino: ${item.delivery_location}` : ''}
              </Text>
            )}

            {/* Botones de edición/borrado */}
            {isEditing && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                <TouchableOpacity onPress={() => openLineModal(item)} style={{ padding: 6, marginRight: 6 }}>
                  <MaterialIcons name="edit" size={18} color="#333" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDeleteLine(item)} style={{ padding: 6 }}>
                  <MaterialIcons name="delete" size={18} color="#cc0000" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          )
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Modal de línea */}
      <Modal
        visible={showLineModal}
        onRequestClose={closeLineModal}
        animationType="slide"
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.title, { marginBottom: 12 }]}>{editingLine ? 'Editar línea' : 'Nueva línea'}</Text>

            <Text style={styles.fieldLabel}>Descripción</Text>
            <TextInput
              style={styles.input}
              placeholder="Descripción *"
              value={lineForm.description}
              onChangeText={(v) => setLineField('description', v)}
              multiline
            />

            {/* Unidad */}
            <Text style={styles.fieldLabel}>Unidad</Text>
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => {
                  const items = units.map((u) => ({ label: u.name, value: u.id }));
                  const options = ['Cancelar', ...items.map((i) => i.label)];
                  ActionSheetIOS.showActionSheetWithOptions(
                    { title: 'Selecciona una unidad', options, cancelButtonIndex: 0 },
                    (idx) => {
                      if (idx > 0) setLineField('unit_id', items[idx - 1].value);
                    }
                  );
                }}
              >
                <Text style={styles.dropdownText}>
                  {units.find((u) => u.id === lineForm.unit_id)?.name || 'Selecciona una unidad'}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
              </TouchableOpacity>
            ) : (
              <View style={styles.dropdown}>
                <Picker selectedValue={lineForm.unit_id} onValueChange={(v) => setLineField('unit_id', v)} style={styles.picker}>
                  <Picker.Item label="Selecciona una unidad" value="" />
                  {units.map((u) => (
                    <Picker.Item key={u.id} label={u.name} value={u.id} />
                  ))}
                </Picker>
              </View>
            )}

            {/* Material: solo aplica a órdenes de compra (order_type_id = 1) */}
            {Number(form.order_type_id) === 1 && (
              <>
                <Text style={styles.fieldLabel}>Material</Text>
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity
                    style={styles.dropdown}
                    onPress={() => {
                      const items = materials.map((m) => ({ label: m.name, value: m.id }));
                      const options = ['Cancelar', ...items.map((i) => i.label)];
                      ActionSheetIOS.showActionSheetWithOptions(
                        { title: 'Selecciona un material', options, cancelButtonIndex: 0 },
                        (idx) => {
                          if (idx > 0) setLineField('material_id', items[idx - 1].value);
                        }
                      );
                    }}
                  >
                    <Text style={styles.dropdownText}>
                      {materials.find((m) => m.id === lineForm.material_id)?.name || 'Selecciona un material'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.dropdown}>
                    <Picker selectedValue={lineForm.material_id} onValueChange={(v) => setLineField('material_id', v)} style={styles.picker}>
                      <Picker.Item label="Selecciona un material" value="" />
                      {materials.map((m) => (
                        <Picker.Item key={m.id} label={m.name} value={m.id} />
                      ))}
                    </Picker>
                  </View>
                )}
              </>
            )}

            <Text style={styles.fieldLabel}>Cantidad</Text>
            <TextInput
              style={styles.input}
              placeholder="Cantidad (entero) *"
              keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
              value={lineForm.quantity}
              onChangeText={onQuantityChange}
            />
            <Text style={styles.fieldLabel}>Valor unitario</Text>
            <TextInput
              style={styles.input}
              placeholder="Valor unitario *"
              keyboardType="numeric"
              value={lineForm.unit_value_display}
              onChangeText={onUnitValueChange}
            />
            <Text style={styles.fieldLabel}>Origen</Text>
            <TextInput
              style={styles.input}
              placeholder="Origen *"
              value={lineForm.pickup_location}
              onChangeText={(v) => setLineField('pickup_location', v)}
            />
            <Text style={styles.fieldLabel}>Destino</Text>
            <TextInput
              style={styles.input}
              placeholder="Destino *"
              value={lineForm.delivery_location}
              onChangeText={(v) => setLineField('delivery_location', v)}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <TouchableOpacity onPress={closeLineModal} style={[styles.button, { flex: 1, backgroundColor: '#EEE' }]}>
                <Text style={[styles.buttonText, { color: '#333' }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveLine} disabled={savingLine} style={[styles.button, { flex: 1 }, savingLine && styles.buttonDisabled]}>
                <Text style={styles.buttonText}>{savingLine ? 'Guardando…' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.purple },
  // topBar removido; usamos headerArea
  backButton: {
    backgroundColor: COLORS.yellow,
    padding: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  headerArea: { backgroundColor: COLORS.purple, paddingHorizontal: 16, paddingBottom: 10 },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '500' },
  container: { backgroundColor: '#fff', flexGrow: 1, alignItems: 'stretch', paddingHorizontal: 12, paddingBottom: 60, borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  formCard: { backgroundColor: '#fff', top: 12, padding: 18, width: '100%' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  subtitleStrong: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
  dropdown: { borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 10, marginBottom: 12, backgroundColor: '#F3F4F6', overflow: 'hidden', position: 'relative' },
  dropdownText: { paddingVertical: 14, paddingHorizontal: 12, color: '#333', fontSize: 16 },
  dropdownIcon: { position: 'absolute', right: 10, top: 12 },
  picker: { height: 50, width: '100%', backgroundColor: 'transparent' },
  input: { borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 16, backgroundColor: '#F3F4F6' },
  inputDisabled: { opacity: 0.7 },
  button: { backgroundColor: COLORS.yellow, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#333', fontSize: 17, fontWeight: '600' },
  smallBtn: { backgroundColor: COLORS.yellow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: '#333', fontWeight: '600' },
  addLineBtn: { backgroundColor: COLORS.yellow, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  detailRow: { padding: 12, borderWidth: 1, borderColor: '#EEE', borderRadius: 10, backgroundColor: '#fff' },
  detailTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  detailMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  fieldLabel: { fontSize: 13, color: '#555', marginBottom: 4, marginTop: 6, fontWeight: '600' },
  valueBox: { borderRadius: 10, padding: 12, backgroundColor: '#F3F4F6', marginBottom: 8 },
  valueText: { fontSize: 16, color: '#333' },
});

// ---------- Gestión de líneas (modal) ----------

