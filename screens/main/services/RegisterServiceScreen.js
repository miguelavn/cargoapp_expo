import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Alert, Modal, FlatList, Pressable, ActionSheetIOS, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { COLORS } from '../../../theme/colors';
import { Button } from '../../../components/ui/Button';

export default function RegisterServiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const headerTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;

  const getCenteredPopoverLayout = () => {
    // Siempre abrir “centrado desde arriba” para que no se corte si el campo está abajo.
    const top = Math.max(insets.top + 12, Math.floor(screenHeight * 0.12));
    const maxHeight = Math.max(320, screenHeight - top - Math.max(12, insets.bottom));
    return { top, maxHeight };
  };

  const isDbTrue = (val) => val === true || val === 1 || val === '1' || val === 'true' || val === 't';
  const isDbFalse = (val) => val === false || val === 0 || val === '0' || val === 'false' || val === 'f';

  const TERMINAL_STATUSES = ['DELIVERED', 'CANCELED'];
  const isServiceActiveStatus = (statusName) => {
    return !TERMINAL_STATUSES.includes(String(statusName || '').toUpperCase());
  };

  const serviceId = route?.params?.serviceId ? Number(route.params.serviceId) : null;
  const isEditing = !!serviceId;
  const [serviceStatusName, setServiceStatusName] = useState(route?.params?.statusName ? String(route.params.statusName) : '');
  const [serviceStatusId, setServiceStatusId] = useState(route?.params?.statusId != null ? Number(route.params.statusId) : null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const vehicleAnchorRef = useRef(null);
  const [vehiclePopoverTop, setVehiclePopoverTop] = useState(null);
  const [vehiclePopoverMaxHeight, setVehiclePopoverMaxHeight] = useState(null);

  const [purchasePickerOpen, setPurchasePickerOpen] = useState(false);
  const [purchaseQuery, setPurchaseQuery] = useState('');
  const purchaseAnchorRef = useRef(null);
  const [purchasePopoverTop, setPurchasePopoverTop] = useState(null);
  const [purchasePopoverMaxHeight, setPurchasePopoverMaxHeight] = useState(null);

  const [transportPickerOpen, setTransportPickerOpen] = useState(false);
  const [transportQuery, setTransportQuery] = useState('');
  const transportAnchorRef = useRef(null);
  const [transportPopoverTop, setTransportPopoverTop] = useState(null);
  const [transportPopoverMaxHeight, setTransportPopoverMaxHeight] = useState(null);
  const [units, setUnits] = useState([]);
  const [purchaseOptions, setPurchaseOptions] = useState([]); // filas de project_materials_availability
  const [transportOptions, setTransportOptions] = useState([]); // filas de transport_orders_availability
  const [driverName, setDriverName] = useState('');
  const [originAddress, setOriginAddress] = useState('');
  const [projectAddresses, setProjectAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [myCompanyId, setMyCompanyId] = useState(null);

  const isHydratingRef = useRef(false);
  

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

  const statusKey = (name) => String(name || '').toLowerCase().replace(/\s+/g, '_');
  const isCreatedStatus = useMemo(() => {
    const k = statusKey(serviceStatusName);
    if (k === 'created') return true;
    if (serviceStatusId != null && !Number.isNaN(Number(serviceStatusId)) && Number(serviceStatusId) === 1) return true;
    return false;
  }, [serviceStatusName, serviceStatusId]);

  const isAcceptedStatus = useMemo(() => {
    const k = statusKey(serviceStatusName);
    if (k === 'accepted') return true;
    if (serviceStatusId != null && !Number.isNaN(Number(serviceStatusId)) && Number(serviceStatusId) === 2) return true;
    return false;
  }, [serviceStatusName, serviceStatusId]);

  const isLoadedStatus = useMemo(() => {
    const k = statusKey(serviceStatusName);
    if (k === 'loaded') return true;
    if (serviceStatusId != null && !Number.isNaN(Number(serviceStatusId)) && Number(serviceStatusId) === 3) return true;
    return false;
  }, [serviceStatusName, serviceStatusId]);

  // Web parity:
  // - CREATED: cambiar vehículo + cancelar
  // - ACCEPTED: solo cancelar
  // - LOADED: no permitir modificar nada
  // - otros: solo lectura
  const canEditVehicleInEdit = isEditing && isCreatedStatus;
  const canCancelInEdit = isEditing && (isCreatedStatus || isAcceptedStatus);
  const canSaveInEdit = isEditing ? canEditVehicleInEdit : true;
  const isReadOnlyEdit = isEditing && !canEditVehicleInEdit && !canCancelInEdit;

  const prevTransportSupplierRef = useRef('');
  const vehiclesReloadTimerRef = useRef(null);

  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === String(form.project_id)) || null,
    [projects, form.project_id]
  );

  const selectedPurchase = useMemo(() => {
    if (!form.purchase_order_id || !form.material_id) return null;
    return purchaseOptions.find(
      (r) => String(r.order_id) === String(form.purchase_order_id) && String(r.material_id) === String(form.material_id)
    ) || null;
  }, [purchaseOptions, form.purchase_order_id, form.material_id]);

  const selectedTransport = useMemo(() => {
    if (!form.transport_order_id) return null;
    return transportOptions.find((r) => String(r.order_id) === String(form.transport_order_id)) || null;
  }, [transportOptions, form.transport_order_id]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => String(v.id) === String(form.vehicle_id)) || null,
    [vehicles, form.vehicle_id]
  );

  const filteredVehicles = useMemo(() => {
    const q = String(vehicleQuery || '').trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const haystack = `${v.name || ''} ${v.label || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [vehicles, vehicleQuery]);

  const purchaseItems = useMemo(() => {
    return (purchaseOptions || []).map((r) => {
      const orderId = String(r.order_id ?? '');
      const materialId = String(r.material_id ?? '');
      const unitId = String(r.unit_id ?? '');
      const supplierId = String(r.supplier_id ?? '');
      const label = `${r.material_name} (${r.available} ${r.unit_name}) - OC ${r.order_code}`;
      return {
        key: `${orderId}-${materialId}`,
        label,
        order_id: orderId,
        material_id: materialId,
        unit_id: unitId,
        supplier_id: supplierId,
        order_code: r.order_code,
        material_name: r.material_name,
        available: r.available,
        unit_name: r.unit_name,
      };
    });
  }, [purchaseOptions]);

  const filteredPurchaseItems = useMemo(() => {
    const q = String(purchaseQuery || '').trim().toLowerCase();
    if (!q) return purchaseItems;
    return purchaseItems.filter((it) => {
      const haystack = `${it.label || ''} ${it.material_name || ''} ${it.order_code || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [purchaseItems, purchaseQuery]);

  const transportItems = useMemo(() => {
    return (transportOptions || []).map((r) => {
      const orderId = String(r.order_id ?? '');
      const supplierId = String(r.transport_supplier_id ?? r.supplier_id ?? '');
      const supplierName = r.transport_supplier_name ?? r.transport_supplier ?? r.supplier_name ?? '';
      const available = r.total_available ?? r.available;
      const unitName = r.unit_name ?? '';
      const label = `${supplierName} • ${available ?? '—'} ${unitName}`.trim();

      return {
        key: orderId || `${String(r.order_code ?? '')}-${supplierId}`,
        order_id: orderId,
        order_code: r.order_code,
        supplier_id: supplierId,
        pickup_location: r.pickup_location,
        label,
      };
    });
  }, [transportOptions]);

  const filteredTransportItems = useMemo(() => {
    const q = String(transportQuery || '').trim().toLowerCase();
    if (!q) return transportItems;
    return transportItems.filter((it) => {
      const haystack = `${it.label || ''} ${it.order_code || ''} ${it.order_id || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [transportItems, transportQuery]);

  const selectedUnit = useMemo(
    () => units.find((u) => String(u.id) === String(form.unit_id)) || null,
    [units, form.unit_id]
  );

  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const scheduleVehiclesReload = () => {
    if (vehiclesReloadTimerRef.current) clearTimeout(vehiclesReloadTimerRef.current);
    vehiclesReloadTimerRef.current = setTimeout(() => {
      const cur = formRef.current;
      if (cur?.transport_supplier_id) loadVehicles(cur.transport_supplier_id);
    }, 350);
  };

  const patchVehicleRow = (row) => {
    if (!row) return;
    const vid = String(row.vehicle_id ?? row.id ?? '');
    if (!vid) return;
    setVehicles((prev) => {
      const idx = prev.findIndex((v) => String(v.id) === vid);
      if (idx === -1) return prev;
      const old = prev[idx];
      const displayPlate = row.plate ?? row.plate_number ?? row.code ?? row.name ?? row.vehicle_number;
      const displayModel = row.model ?? row.vehicle_model ?? null;
      const nextName = displayPlate != null ? String(displayPlate || '') : old.name;
      const nextLabel = (displayModel != null || row.capacity_m3 != null || displayPlate != null)
        ? [String(displayModel || '').trim(), row.capacity_m3 != null ? `${row.capacity_m3} m³` : '', String(displayPlate || '')]
          .filter((x) => String(x || '').trim())
          .join(' - ')
        : old.label;
      const next = {
        ...old,
        online: Object.prototype.hasOwnProperty.call(row, 'online') ? row.online : old.online,
        is_active: Object.prototype.hasOwnProperty.call(row, 'is_active') ? row.is_active : old.is_active,
        is_available: Object.prototype.hasOwnProperty.call(row, 'is_available') ? row.is_available : old.is_available,
        current_service_id: Object.prototype.hasOwnProperty.call(row, 'current_service_id') ? row.current_service_id : old.current_service_id,
        capacity_m3: row.capacity_m3 != null ? row.capacity_m3 : old.capacity_m3,
        driver_id: row.driver_id != null ? String(row.driver_id) : old.driver_id,
        name: nextName,
        label: nextLabel,
      };
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  };

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

  const upsertVehicleIntoList = (row) => {
    if (!row) return;
    const vid = String(row.vehicle_id ?? row.id ?? '');
    if (!vid) return;

    const displayPlate = row.plate ?? row.plate_number ?? row.code ?? row.name ?? row.vehicle_number;
    const displayModel = row.model ?? row.vehicle_model ?? '';
    const capacity = row.capacity_m3 != null ? row.capacity_m3 : null;

    const mapped = {
      id: vid,
      name: String(displayPlate || `#${vid}`),
      label: [String(displayModel || '').trim(), capacity != null ? `${capacity} m³` : '', String(displayPlate || '')]
        .filter((x) => String(x || '').trim())
        .join(' - ') || `Vehículo #${vid}`,
      capacity_m3: capacity,
      driver_id: row.driver_id != null ? String(row.driver_id) : '',
      online: Object.prototype.hasOwnProperty.call(row, 'online') ? row.online : null,
      is_active: Object.prototype.hasOwnProperty.call(row, 'is_active') ? row.is_active : true,
      is_available: Object.prototype.hasOwnProperty.call(row, 'is_available') ? row.is_available : true,
      current_service_id: Object.prototype.hasOwnProperty.call(row, 'current_service_id') ? row.current_service_id : null,
    };

    setVehicles((prev) => {
      const idx = prev.findIndex((v) => String(v.id) === vid);
      if (idx === -1) return [mapped, ...prev];
      const copy = prev.slice();
      copy[idx] = { ...prev[idx], ...mapped };
      return copy;
    });
  };

  const hydrateVehicleDetails = async (vehicleId) => {
    try {
      if (!vehicleId) return;
      const num = Number(vehicleId);
      if (Number.isNaN(num)) return;

      // Intentar por vehicle_id (esquema común), con fallback a id
      let row = null;
      try {
        const { data } = await supabase.from('vehicles').select('*').eq('vehicle_id', num).maybeSingle();
        row = data || null;
      } catch {}

      if (!row) {
        try {
          const { data } = await supabase.from('vehicles').select('*').eq('id', num).maybeSingle();
          row = data || null;
        } catch {}
      }

      if (row) upsertVehicleIntoList(row);
    } catch {}
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

  // Realtime (como web): refrescar disponibilidad (OC/OT) y mantener selector de vehículo actualizado
  useEffect(() => {
    const refreshAvailability = async () => {
      const cur = formRef.current;
      if (cur?.project_id) {
        await fetchPurchaseOptions(cur.project_id);
        if (cur?.material_id) await fetchTransportOptions(cur.project_id, cur.material_id);
      }
    };

    const channel = supabase
      .channel('register-service-availability-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshAvailability)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_details' }, refreshAvailability)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, refreshAvailability)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_vehicles' }, scheduleVehiclesReload)
      .subscribe();

    return () => {
      if (vehiclesReloadTimerRef.current) clearTimeout(vehiclesReloadTimerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime dedicado para vehicles (create/edit): igual que web, cualquier cambio puede afectar la lista de disponibles
  useEffect(() => {
    if (!form.transport_supplier_id) return;
    const channel = supabase
      .channel('vehicles-service-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, (payload) => {
        const row = payload?.new ?? payload?.old;
        patchVehicleRow(row);
        scheduleVehiclesReload();
      })
      .subscribe();

    return () => {
      if (vehiclesReloadTimerRef.current) clearTimeout(vehiclesReloadTimerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.transport_supplier_id]);

  // Web parity (Services.tsx): canal global UPDATE a `vehicles` + filtro en JS por vehicleId.
  // Esto mantiene el puntito online/offline del vehículo actual, incluso en edición restringida.
  useEffect(() => {
    if (!isEditing) return;
    const vidRaw = form.vehicle_id ? String(form.vehicle_id) : '';
    const vid = Number(vidRaw);
    if (!vidRaw || Number.isNaN(vid)) return;

    const channel = supabase
      .channel(`service-vehicle-online-realtime-${serviceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
        const row = payload?.new;
        if (!row) return;
        const vehicleId = row.vehicle_id ?? row.id;
        if (Number(vehicleId) !== Number(vid)) return;

        upsertVehicleIntoList(row);
        patchVehicleRow(row);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isEditing, serviceId, form.vehicle_id]);

  // Recargar vehículos cuando cambie el supplier de la orden de transporte
  useEffect(() => {
    const nextSupplierId = form.transport_supplier_id || '';
    if (prevTransportSupplierRef.current === nextSupplierId) return;
    prevTransportSupplierRef.current = nextSupplierId;

    // En edición, no resetear valores al hidratar ni al tener supplier fijo.
    if (!isEditing && !isHydratingRef.current) {
      // Si cambia el supplier, resetear vehículo/conductor
      setForm((s) => ({ ...s, vehicle_id: '', driver_id: '' }));
      setDriverName('');
    }

    // Si aún no hay OT/supplier seleccionado, no mostrar vehículos
    if (!nextSupplierId) {
      setVehicles([]);
      return;
    }

    loadVehicles(nextSupplierId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.transport_supplier_id, isEditing]);

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

  // Paridad web: si el vehículo seleccionado deja de cumplir (active/available/online y sin servicio), limpiar selección.
  useEffect(() => {
    if (!form.vehicle_id) return;
    const veh = vehicles.find((v) => String(v.id) === String(form.vehicle_id));
    if (!veh) return;
    if (isEditing) return;
    const stillValid = isDbTrue(veh.is_active) && isDbTrue(veh.is_available) && isDbTrue(veh.online) && veh.current_service_id == null;
    if (!stillValid) {
      setForm((s) => ({ ...s, vehicle_id: '', driver_id: '' }));
      setDriverName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, isEditing]);

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
      if (!form.project_id) {
        setPurchaseOptions([]);
        setTransportOptions([]);
        return;
      }

      await fetchPurchaseOptions(form.project_id);

      if (!isEditing && !isHydratingRef.current) {
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
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id, isEditing]);

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

      const currentServiceId = serviceId;
      const currentVehicleId = formRef.current?.vehicle_id ? String(formRef.current.vehicle_id) : '';

      const { data } = await supabase.from('vehicles').select('*');
      let list = Array.isArray(data) ? data : [];

      // Filtros base (solo si existen las columnas)
      list = list.filter((v) => {
        const vid = String(v.vehicle_id ?? v.id ?? '');
        // En edición, SIEMPRE incluir el vehículo actualmente asignado para mostrar su info,
        // aunque no cumpla filtros de disponibilidad (offline/inactive/etc.).
        if (isEditing && currentVehicleId && vid && vid === currentVehicleId) return true;

        // Paridad exacta con web (services.tsx):
        // is_active=true AND is_available=true AND online=true AND current_service_id IS NULL
        if (!isDbTrue(v.is_active)) return false;
        if (!isDbTrue(v.is_available)) return false;
        if (!isDbTrue(v.online)) return false;
        if (v.current_service_id != null) {
          // En edición, permitir que aparezca el vehículo ya asignado al servicio.
          if (!currentServiceId || Number(v.current_service_id) !== Number(currentServiceId)) return false;
        }
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
          const displayPlate = v.plate ?? v.plate_number ?? v.code ?? v.name ?? v.vehicle_number;
          const displayModel = v.model ?? v.vehicle_model ?? '';
          return {
            id: String(vid),
            name: String(displayPlate || ''),
            label: [String(displayModel || '').trim(), v.capacity_m3 != null ? `${v.capacity_m3} m³` : '', String(displayPlate || '')]
              .filter((x) => String(x || '').trim())
              .join(' - '),
            capacity_m3: v.capacity_m3,
            driver_id: v.driver_id != null ? String(v.driver_id) : '',
            online: Object.prototype.hasOwnProperty.call(v, 'online') ? v.online : null,
            is_active: Object.prototype.hasOwnProperty.call(v, 'is_active') ? v.is_active : true,
            is_available: Object.prototype.hasOwnProperty.call(v, 'is_available') ? v.is_available : true,
            current_service_id: Object.prototype.hasOwnProperty.call(v, 'current_service_id') ? v.current_service_id : null,
          };
        })
        .filter((v) => v.id && v.name);

      // Si estamos editando y el vehículo actual no está en la lista (por filtros), al menos mantener el id visible.
      if (currentVehicleId && !mapped.some((v) => String(v.id) === currentVehicleId)) {
        mapped.unshift({
          id: currentVehicleId,
          name: `#${currentVehicleId}`,
          label: `Vehículo #${currentVehicleId}`,
          capacity_m3: null,
          driver_id: String(formRef.current?.driver_id || ''),
          online: null,
          is_active: true,
          is_available: true,
          current_service_id: currentServiceId ?? null,
        });
      }

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
        if (Object.prototype.hasOwnProperty.call(r, 'is_active') && isDbFalse(r.is_active)) return false;
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
      isHydratingRef.current = true;
      // Si tienes edge get-service úsala; si no, directo
      try {
        const res = await callEdgeFunction('get-service', { method: 'GET', query: { service_id: id } });
        const s = res?.service;
        if (s) {
          const nextStatusName = s.status_name ?? s.status ?? s.statusName ?? '';
          const nextStatusId = s.status_id ?? s.statusId ?? null;
          if (nextStatusName) setServiceStatusName(String(nextStatusName));
          if (nextStatusId != null && !Number.isNaN(Number(nextStatusId))) setServiceStatusId(Number(nextStatusId));

          setForm({
            purchase_order_id: s.purchase_order_id ? String(s.purchase_order_id) : (s.order_id ? String(s.order_id) : ''),
            transport_order_id: s.transport_order_id ? String(s.transport_order_id) : '',
            project_id: s.project_id ? String(s.project_id) : (route?.params?.projectId ? String(route.params.projectId) : ''),
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

          if (s.vehicle_id) hydrateVehicleDetails(String(s.vehicle_id));
        }
      } catch {
        const { data } = await supabase
          .from('services')
          .select('*')
          .eq('service_id', id)
          .maybeSingle();
        if (data) {
          const nextStatusName = data.status_name ?? data.status ?? '';
          const nextStatusId = data.status_id ?? null;
          if (nextStatusName) setServiceStatusName(String(nextStatusName));
          if (nextStatusId != null && !Number.isNaN(Number(nextStatusId))) setServiceStatusId(Number(nextStatusId));

          setForm({
            purchase_order_id: data.purchase_order_id ? String(data.purchase_order_id) : (data.order_id ? String(data.order_id) : ''),
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
            transport_supplier_id: data.transport_supplier_id ? String(data.transport_supplier_id) : (data.transport_supplier ? String(data.transport_supplier) : ''),
          });

          if (data.vehicle_id) hydrateVehicleDetails(String(data.vehicle_id));
        }
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo cargar el servicio');
    } finally {
      // soltar el flag en el siguiente tick para que useEffects no reseteen durante setForm
      setTimeout(() => {
        isHydratingRef.current = false;
      }, 0);
    }
  };

  const onCancelService = async () => {
    if (!serviceId) return;
    Alert.alert('Confirmar', '¿Cancelar este servicio?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await callEdgeFunction('update-service', { method: 'POST', body: { service_id: Number(serviceId), cancel: true } });
            Alert.alert('Éxito', 'Servicio cancelado', [
              { text: 'OK', onPress: () => navigation.navigate('ServicesList', { refresh: true, projectId: form.project_id }) },
            ]);
          } catch (e) {
            Alert.alert('Error', e.message || 'No se pudo cancelar el servicio');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const onSubmit = async () => {
    if (isEditing && !canEditVehicleInEdit) {
      Alert.alert('Solo lectura', 'En la web solo se puede cambiar el vehículo en estado CREATED.');
      return;
    }

    const errs = {};
    if (!form.vehicle_id) errs.vehicle_id = 'Selecciona un vehículo';
    if (!form.driver_id) errs.driver_id = 'El vehículo no tiene conductor asignado';

    if (!isEditing) {
      if (!form.project_id) errs.project_id = 'Selecciona un proyecto';
      if (!form.purchase_order_id) errs.purchase_order_id = 'Selecciona la orden de compra';
      if (!form.transport_order_id) errs.transport_order_id = 'Selecciona la orden de transporte';
      if (!form.material_id) errs.material_id = 'Selecciona un material';
      if (!form.unit_id) errs.unit_id = 'Selecciona una unidad';
      if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) errs.quantity = 'Cantidad requerida (capacidad del vehículo)';
      if (selectedAvailability != null && !isNaN(Number(form.quantity)) && Number(form.quantity) > Number(selectedAvailability)) {
        errs.quantity = `Cantidad supera disponible (${selectedAvailability})`;
      }
      if (!String(form.destination || '').trim()) errs.destination = 'Destino requerido';
    }
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
            <MaterialIcons name="arrow-back" size={20} color={COLORS.foreground || COLORS.dark} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerOverline}>Servicios</Text>
            <Text style={styles.headerTitle}>Detalle del Servicio</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          {serviceId ? 'Editar servicio' : 'Crear servicio'}{selectedProject?.name ? ` · ${selectedProject.name}` : ''}
        </Text>
      </View>

      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.containerContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
        showsVerticalScrollIndicator={false}
      >
        {isEditing ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <MaterialIcons name="info" size={18} color={COLORS.mutedForeground || COLORS.grayText} />
              <Text style={styles.infoTitle}>Edición restringida</Text>
            </View>
            <Text style={styles.infoSubtext}>
              Estado: {serviceStatusName ? String(serviceStatusName).toUpperCase() : '—'}
            </Text>
            <Text style={styles.infoSubtext}>
              {isCreatedStatus
                ? 'Solo puedes cambiar el vehículo y cancelar el servicio.'
                : (isAcceptedStatus
                  ? 'Solo puedes cancelar el servicio.'
                  : 'Este servicio está en modo solo lectura. No se permite modificar ni cancelar en este estado.')}
            </Text>
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>Proyecto</Text>
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => {
              if (isEditing) {
                Alert.alert('Bloqueado', 'No puedes cambiar el proyecto al editar un servicio.');
                return;
              }
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
            <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.grayText} style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker enabled={!isEditing} selectedValue={form.project_id} onValueChange={(v) => handleChange('project_id', v)} style={styles.picker}>
              <Picker.Item label="Selecciona un proyecto" value="" />
              {projects.map((p) => (
                <Picker.Item key={p.id} label={p.name} value={p.id} />
              ))}
            </Picker>
          </View>
        )}

     

        <Text style={styles.fieldLabel}>Orden de compra (Material)</Text>
        <TouchableOpacity
          ref={purchaseAnchorRef}
          collapsable={false}
          style={[styles.dropdown, (!form.project_id || isEditing) && styles.dropdownDisabled]}
          onPress={() => {
            if (isEditing) {
              Alert.alert('Bloqueado', 'No puedes cambiar la OC/Material al editar un servicio.');
              return;
            }
            if (!form.project_id) {
              Alert.alert('Selecciona un proyecto', 'Primero elige un proyecto para listar órdenes de compra.');
              return;
            }
            setPurchaseQuery('');
            const { top, maxHeight } = getCenteredPopoverLayout();
            setPurchasePopoverTop(top);
            setPurchasePopoverMaxHeight(maxHeight);
            setPurchasePickerOpen(true);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.dropdownText, !form.project_id && styles.dropdownTextDisabled]}>
            {selectedPurchase?.order_code
              ? `${selectedPurchase.material_name} - OC ${selectedPurchase.order_code}`
              : (form.project_id ? 'Selecciona material/OC' : 'Selecciona un proyecto primero')}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.grayText} style={styles.dropdownIcon} />
        </TouchableOpacity>

        <Modal
          visible={purchasePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPurchasePickerOpen(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setPurchasePickerOpen(false)} />
            <View
              style={[
                styles.vehicleSheet,
                styles.vehiclePopover,
                purchasePopoverTop != null
                  ? {
                    top: purchasePopoverTop,
                    maxHeight: purchasePopoverMaxHeight ?? Math.max(240, screenHeight - purchasePopoverTop - Math.max(12, insets.bottom)),
                  }
                  : {
                    top: Math.max(120, Math.floor(screenHeight * 0.25)),
                    maxHeight: Math.floor(screenHeight * 0.7),
                  },
              ]}
            >
              <View style={styles.vehicleSheetHeader}>
                <Text style={styles.vehicleSheetTitle}>Selecciona material/OC</Text>
                <TouchableOpacity onPress={() => setPurchasePickerOpen(false)} style={styles.vehicleSheetClose}>
                  <MaterialIcons name="close" size={22} color={COLORS.grayText} />
                </TouchableOpacity>
              </View>

              <View style={styles.vehicleSearchRow}>
                <MaterialIcons name="search" size={18} color={COLORS.grayText} />
                <TextInput
                  value={purchaseQuery}
                  onChangeText={setPurchaseQuery}
                  placeholder="Buscar material u OC"
                  placeholderTextColor={COLORS.grayText}
                  style={styles.vehicleSearchInput}
                />
              </View>

              <FlatList
                data={filteredPurchaseItems}
                keyExtractor={(item) => String(item.key)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSelected = String(form.purchase_order_id) === String(item.order_id) && String(form.material_id) === String(item.material_id);
                  return (
                    <TouchableOpacity
                      style={styles.vehicleRow}
                      onPress={() => {
                        handleChange('purchase_order_id', item.order_id);
                        handleChange('material_id', item.material_id);
                        handleChange('unit_id', item.unit_id);
                        handleChange('material_supplier_id', item.supplier_id);
                        setSelectedAvailability(item.available);

                        // Al cambiar material, limpiar transporte/vehículo/origen (como web)
                        handleChange('transport_order_id', '');
                        handleChange('transport_supplier_id', '');
                        handleChange('vehicle_id', '');
                        handleChange('driver_id', '');
                        handleChange('origin', '');
                        setOriginAddress('');
                        setVehicles([]);
                        setDriverName('');

                        setPurchasePickerOpen(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.vehicleRowText}>
                        <Text style={styles.vehicleRowTitle}>{String(item.material_name || '—')}</Text>
                        <Text style={styles.vehicleRowSubtitle} numberOfLines={1}>{String(item.label || '')}</Text>
                      </View>
                      {isSelected ? <MaterialIcons name="check" size={20} color={COLORS.primary} /> : null}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.vehicleEmptyText}>No hay opciones.</Text>}
              />
            </View>
          </View>
        </Modal>


        {selectedPurchase ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <MaterialIcons name="inventory-2" size={18} color={COLORS.mutedForeground || COLORS.grayText} />
              <Text style={styles.infoTitle}>{String(selectedPurchase.material_name || 'Material')}</Text>
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>OC</Text>
                <Text style={styles.infoValue}>{selectedPurchase.order_code ? `OC ${selectedPurchase.order_code}` : `#${selectedPurchase.order_id}`}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Proveedor</Text>
                <Text style={styles.infoValue}>{String(selectedPurchase.supplier_name || '—')}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Disponible</Text>
                <Text style={styles.infoValue}>{`${selectedPurchase.available ?? '—'} ${selectedPurchase.unit_name || ''}`.trim()}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Unidad</Text>
                <Text style={styles.infoValue}>{String(selectedPurchase.unit_name || selectedUnit?.name || '—')}</Text>
              </View>
            </View>
          </View>
        ) : null}



        <Text style={styles.fieldLabel}>Orden de transporte</Text>
        <TouchableOpacity
          ref={transportAnchorRef}
          collapsable={false}
          style={[styles.dropdown, (!form.project_id || isEditing) && styles.dropdownDisabled]}
          onPress={() => {
            if (isEditing) {
              Alert.alert('Bloqueado', 'No puedes cambiar la OT al editar un servicio.');
              return;
            }
            if (!form.project_id) {
              Alert.alert('Selecciona un proyecto', 'Primero elige un proyecto para listar órdenes de transporte.');
              return;
            }
            if (!form.material_id) {
              Alert.alert('Selecciona un material', 'Primero selecciona el material/OC para listar órdenes de transporte.');
              return;
            }
            setTransportQuery('');
            const { top, maxHeight } = getCenteredPopoverLayout();
            setTransportPopoverTop(top);
            setTransportPopoverMaxHeight(maxHeight);
            setTransportPickerOpen(true);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.dropdownText, !form.project_id && styles.dropdownTextDisabled]}>
            {selectedTransport?.order_code
              ? `OT ${selectedTransport.order_code} - ${selectedTransport.transport_supplier_name || ''}`.trim()
              : (form.project_id ? (form.material_id ? 'Selecciona una OT' : 'Selecciona material/OC primero') : 'Selecciona un proyecto primero')}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.grayText} style={styles.dropdownIcon} />
        </TouchableOpacity>

        <Modal
          visible={transportPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setTransportPickerOpen(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setTransportPickerOpen(false)} />
            <View
              style={[
                styles.vehicleSheet,
                styles.vehiclePopover,
                transportPopoverTop != null
                  ? {
                    top: transportPopoverTop,
                    maxHeight: transportPopoverMaxHeight ?? Math.max(240, screenHeight - transportPopoverTop - Math.max(12, insets.bottom)),
                  }
                  : {
                    top: Math.max(120, Math.floor(screenHeight * 0.25)),
                    maxHeight: Math.floor(screenHeight * 0.7),
                  },
              ]}
            >
              <View style={styles.vehicleSheetHeader}>
                <Text style={styles.vehicleSheetTitle}>Selecciona una OT</Text>
                <TouchableOpacity onPress={() => setTransportPickerOpen(false)} style={styles.vehicleSheetClose}>
                  <MaterialIcons name="close" size={22} color={COLORS.grayText} />
                </TouchableOpacity>
              </View>

              <View style={styles.vehicleSearchRow}>
                <MaterialIcons name="search" size={18} color={COLORS.grayText} />
                <TextInput
                  value={transportQuery}
                  onChangeText={setTransportQuery}
                  placeholder="Buscar OT o transportista"
                  placeholderTextColor={COLORS.grayText}
                  style={styles.vehicleSearchInput}
                />
              </View>

              <FlatList
                data={filteredTransportItems}
                keyExtractor={(item) => String(item.key)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSelected = String(form.transport_order_id) === String(item.order_id);
                  return (
                    <TouchableOpacity
                      style={styles.vehicleRow}
                      onPress={async () => {
                        handleChange('transport_order_id', item.order_id);

                        const raw = (transportOptions || []).find((r) => String(r.order_id) === String(item.order_id)) || null;
                        const nextSupplierIdRaw =
                          raw?.transport_supplier_id ??
                          raw?.transport_supplier_company_id ??
                          raw?.transport_company_id ??
                          raw?.supplier_id ??
                          item.supplier_id;

                        const nextPickupRaw = raw?.pickup_location ?? item.pickup_location;

                        // Al cambiar OT, limpiar vehículo/conductor para evitar inconsistencias
                        handleChange('vehicle_id', '');
                        handleChange('driver_id', '');
                        setDriverName('');

                        handleChange('transport_supplier_id', nextSupplierIdRaw != null ? String(nextSupplierIdRaw) : '');

                        // origen estilo web
                        handleChange('origin', nextPickupRaw != null ? String(nextPickupRaw) : '');
                        setOriginAddress('');

                        if (nextPickupRaw) {
                          try {
                            const { data } = await supabase
                              .from('company_address')
                              .select('address')
                              .eq('id', Number(nextPickupRaw))
                              .maybeSingle();
                            if (data?.address) setOriginAddress(data.address);
                          } catch {}
                        }

                        setTransportPickerOpen(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.vehicleRowText}>
                        <Text style={styles.vehicleRowTitle}>{String(item.order_code ? `OT ${item.order_code}` : `OT #${item.order_id}`)}</Text>
                        <Text style={styles.vehicleRowSubtitle} numberOfLines={1}>{String(item.label || '')}</Text>
                      </View>
                      {isSelected ? <MaterialIcons name="check" size={20} color={COLORS.primary} /> : null}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.vehicleEmptyText}>No hay opciones.</Text>}
              />
            </View>
          </View>
        </Modal>

        {selectedTransport ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <MaterialIcons name="local-shipping" size={18} color={COLORS.mutedForeground || COLORS.grayText} />
              <Text style={styles.infoTitle}>{selectedTransport.order_code ? `OT ${selectedTransport.order_code}` : `OT #${selectedTransport.order_id}`}</Text>
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Transportista</Text>
                <Text style={styles.infoValue}>{String(selectedTransport.transport_supplier_name || '—')}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Disponible</Text>
                <Text style={styles.infoValue}>{`${selectedTransport.total_available ?? '—'} ${selectedTransport.unit_name || ''}`.trim()}</Text>
              </View>
              <View style={styles.infoCellFull}>
                <Text style={styles.infoLabel}>Origen</Text>
                <Text style={styles.infoValue}>{String(originAddress || '—')}</Text>
              </View>
            </View>
          </View>
        ) : null}













        <Text style={styles.fieldLabel}>Vehículo</Text>
        <TouchableOpacity
          ref={vehicleAnchorRef}
          collapsable={false}
          style={[styles.dropdown, (!form.transport_order_id || (isEditing && !canEditVehicleInEdit)) && styles.dropdownDisabled]}
          onPress={() => {
            if (isEditing && !canEditVehicleInEdit) {
              Alert.alert('Solo lectura', 'Solo puedes cambiar el vehículo cuando el servicio está en estado CREATED.');
              return;
            }
            if (!form.transport_order_id) {
              Alert.alert('Selecciona una OT', 'Primero selecciona la orden de transporte para ver los vehículos disponibles.');
              return;
            }
            setVehicleQuery('');

            const { top, maxHeight } = getCenteredPopoverLayout();
            setVehiclePopoverTop(top);
            setVehiclePopoverMaxHeight(maxHeight);
            setVehiclePickerOpen(true);
          }}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.dropdownText,
              selectedVehicle?.online != null && styles.dropdownTextWithDot,
              !form.transport_order_id && styles.dropdownTextDisabled,
            ]}
          >
            {form.transport_order_id
              ? (selectedVehicle?.label || selectedVehicle?.name || (form.vehicle_id ? `Vehículo #${form.vehicle_id}` : 'Selecciona un vehículo'))
              : 'Selecciona una OT primero'}
          </Text>
          {selectedVehicle?.online != null ? (
            <View
              style={[
                styles.vehicleDot,
                styles.vehicleDotDropdown,
                selectedVehicle.online ? styles.vehicleDotOnline : styles.vehicleDotOffline,
              ]}
            />
          ) : null}
          <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.grayText} style={styles.dropdownIcon} />
        </TouchableOpacity>

        <Modal
          visible={vehiclePickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setVehiclePickerOpen(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setVehiclePickerOpen(false)} />
            <View
              style={[
                styles.vehicleSheet,
                styles.vehiclePopover,
                vehiclePopoverTop != null
                  ? {
                    top: vehiclePopoverTop,
                    maxHeight: vehiclePopoverMaxHeight ?? Math.max(240, screenHeight - vehiclePopoverTop - Math.max(12, insets.bottom)),
                  }
                  : {
                    top: Math.max(120, Math.floor(screenHeight * 0.25)),
                    maxHeight: vehiclePopoverMaxHeight ?? Math.floor(screenHeight * 0.7),
                  },
              ]}
            >
            <View style={styles.vehicleSheetHeader}>
              <Text style={styles.vehicleSheetTitle}>Selecciona un vehículo</Text>
              <TouchableOpacity onPress={() => setVehiclePickerOpen(false)} style={styles.vehicleSheetClose}>
                <MaterialIcons name="close" size={22} color={COLORS.grayText} />
              </TouchableOpacity>
            </View>

            <View style={styles.vehicleSearchRow}>
              <MaterialIcons name="search" size={18} color={COLORS.grayText} />
              <TextInput
                value={vehicleQuery}
                onChangeText={setVehicleQuery}
                placeholder="Buscar por placa o modelo"
                placeholderTextColor={COLORS.grayText}
                style={styles.vehicleSearchInput}
              />
            </View>

            <FlatList
              data={filteredVehicles}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={filteredVehicles.length ? undefined : { paddingBottom: 10 }}
              renderItem={({ item }) => {
                const isDisabled = !isDbTrue(item.is_active) || !isDbTrue(item.is_available) || !isDbTrue(item.online) || (item.current_service_id != null && Number(item.current_service_id) !== Number(serviceId));
                const isSelected = String(form.vehicle_id) === String(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.vehicleRow, isDisabled && styles.vehicleRowDisabled]}
                    disabled={isDisabled}
                    onPress={() => {
                      handleChange('vehicle_id', item.id);
                      setVehiclePickerOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.vehicleDot, item.online ? styles.vehicleDotOnline : styles.vehicleDotOffline]} />
                    <View style={styles.vehicleRowText}>
                      <Text style={styles.vehicleRowTitle}>{String(item.name || '—')}</Text>
                      <Text style={styles.vehicleRowSubtitle} numberOfLines={1}>
                        {String(item.label || '')}
                      </Text>
                    </View>
                    {isSelected ? <MaterialIcons name="check" size={20} color={COLORS.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.vehicleEmptyText}>No hay vehículos disponibles.</Text>
              }
            />
            </View>
          </View>
        </Modal>

        {selectedVehicle ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <MaterialIcons name="directions-car" size={18} color={COLORS.mutedForeground || COLORS.grayText} />
              <Text style={styles.infoTitle}>{String(selectedVehicle.name || 'Vehículo')}</Text>
              {isServiceActiveStatus(serviceStatusName) && selectedVehicle?.online != null ? (
                <View style={styles.onlineBadge}>
                  <View style={[styles.onlineBadgeDot, selectedVehicle.online ? styles.onlineDotOnline : styles.onlineDotOffline]} />
                  <Text style={[styles.onlineBadgeText, selectedVehicle.online ? styles.onlineTextOnline : styles.onlineTextOffline]}>
                    {selectedVehicle.online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Capacidad</Text>
                <Text style={styles.infoValue}>{selectedVehicle.capacity_m3 != null ? `${selectedVehicle.capacity_m3} m³` : '—'}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Conductor</Text>
                <Text style={styles.infoValue}>{driverName || (form.driver_id ? `Conductor #${form.driver_id}` : '—')}</Text>
              </View>
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Cantidad</Text>
                <Text style={styles.infoValue}>{form.quantity ? `${form.quantity} ${selectedUnit?.name || ''}`.trim() : '—'}</Text>
              </View>
            </View>
          </View>
        ) : null}





        {/* Material y unidad se derivan de la selección OC/material */}

        <Text style={styles.fieldLabel}>Unidad</Text>
        <TextInput
          style={styles.input}
          placeholder="Se asigna al seleccionar material"
          value={selectedUnit?.name || ''}
          editable={false}
          selectTextOnFocus={false}
        />





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
              if (isEditing) {
                Alert.alert('Bloqueado', 'No puedes cambiar el destino al editar un servicio.');
                return;
              }
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
            <MaterialIcons name="arrow-drop-down" size={24} color={COLORS.grayText} style={styles.dropdownIcon} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dropdown}>
            <Picker
              enabled={!!form.project_id && !loadingAddresses && !isEditing}
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

        <View style={{ height: 16 }} />
        {canCancelInEdit ? (
          <Button
            title="Cancelar servicio"
            onPress={onCancelService}
            loading={loading}
            disabled={loading}
            variant="danger"
            style={{ width: '100%' }}
          />
        ) : null}

        {canCancelInEdit ? <View style={{ height: 10 }} /> : null}
        <Button
          title={serviceId ? 'Guardar cambios' : 'Crear servicio'}
          onPress={onSubmit}
          loading={loading}
          disabled={loading || (isEditing && !canSaveInEdit)}
          style={{ width: '100%' }}
        />

        <View style={{ height: Math.max(16, insets.bottom) }} />

      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  headerArea: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backButton: { backgroundColor: COLORS.soft, padding: 10, borderRadius: 20 },
  headerOverline: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '600' },
  headerTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 13, fontWeight: '600' },

  container: { flex: 1 },
  containerContent: { paddingHorizontal: 16, paddingTop: 12 },

  fieldLabel: { fontSize: 13, color: COLORS.mutedForeground || COLORS.grayText, marginBottom: 6, marginTop: 14, fontWeight: '700' },
  dropdown: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    position: 'relative',
  },
  dropdownText: { paddingVertical: 14, paddingHorizontal: 12, color: COLORS.foreground || COLORS.dark, fontSize: 16 },
  dropdownTextWithDot: { paddingLeft: 32 },
  dropdownIcon: { position: 'absolute', right: 10, top: 12 },
  dropdownDisabled: {
    backgroundColor: COLORS.soft,
  },
  dropdownTextDisabled: {
    color: COLORS.grayText,
  },
  picker: { height: 50, width: '100%', backgroundColor: 'transparent' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
    backgroundColor: COLORS.soft,
    color: COLORS.foreground || COLORS.dark,
  },

  infoCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    padding: 12,
    marginTop: 6,
    marginBottom: 4,
  },
  infoHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  infoTitle: { flex: 1, color: COLORS.foreground || COLORS.dark, fontSize: 15, fontWeight: '700' },
  infoSubtext: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 13, fontWeight: '600', marginTop: 4 },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  onlineBadgeDot: { width: 8, height: 8, borderRadius: 4 },
  onlineDotOnline: { backgroundColor: COLORS.success },
  onlineDotOffline: { backgroundColor: COLORS.grayText },
  onlineBadgeText: { fontSize: 12, fontWeight: '800' },
  onlineTextOnline: { color: COLORS.success },
  onlineTextOffline: { color: COLORS.grayText },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCell: { width: '48%' },
  infoCellFull: { width: '100%' },
  infoLabel: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '700' },
  infoValue: { color: COLORS.foreground || COLORS.dark, fontSize: 13, fontWeight: '600', marginTop: 3 },

  modalRoot: { flex: 1 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.foreground || COLORS.dark, opacity: 0.35 },
  vehicleSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  vehiclePopover: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  vehicleSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  vehicleSheetTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 16, fontWeight: '800' },
  vehicleSheetClose: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },

  vehicleSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: COLORS.white,
  },
  vehicleSearchInput: { flex: 1, fontSize: 15, color: COLORS.foreground || COLORS.dark },

  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  vehicleRowDisabled: { opacity: 0.45 },
  vehicleRowText: { flex: 1 },
  vehicleRowTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 15, fontWeight: '800' },
  vehicleRowSubtitle: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 12, fontWeight: '600', marginTop: 2 },
  vehicleEmptyText: { color: COLORS.mutedForeground || COLORS.grayText, fontSize: 13, fontWeight: '600', paddingVertical: 10 },

  vehicleDot: { width: 10, height: 10, borderRadius: 999 },
  vehicleDotDropdown: { position: 'absolute', left: 12, top: '50%', transform: [{ translateY: -5 }] },
  vehicleDotOnline: { backgroundColor: COLORS.success },
  vehicleDotOffline: { backgroundColor: COLORS.grayText },
});
