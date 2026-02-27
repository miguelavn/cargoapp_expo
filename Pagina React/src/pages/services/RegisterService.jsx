import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { callEdgeFunction } from '../../api/edgeFunctions.js';
import { usePermissions } from '../../state/PermissionsContext.jsx';
import { hasPermission } from '../../lib/permissions.js';

export default function RegisterService() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { permissions } = usePermissions();

  const serviceId = searchParams.get('serviceId') ? Number(searchParams.get('serviceId')) : null;
  const initialProjectId = searchParams.get('projectId') || '';

  const canCreate = useMemo(() => hasPermission(permissions, 'create_new_service_for_my_company'), [permissions]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [units, setUnits] = useState([]);
  const [purchaseOptions, setPurchaseOptions] = useState([]);
  const [transportOptions, setTransportOptions] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [driverName, setDriverName] = useState('');
  const [selectedAvailability, setSelectedAvailability] = useState(null);

  const [form, setForm] = useState({
    purchase_order_id: '',
    transport_order_id: '',
    project_id: initialProjectId,
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

  const prevTransportSupplierRef = useRef('');
  const hydratedServiceRef = useRef(false);
  const prevProjectIdRef = useRef(initialProjectId);
  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const { data: pjs } = await supabase
          .from('projects')
          .select('project_id, name, status')
          .eq('status', true)
          .order('name');
        setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
      } catch {
        setProjects([]);
      }

      try {
        const { data } = await supabase.from('measurement_units').select('id, name');
        setUnits((data || []).map((u) => ({ id: String(u.id), name: u.name })));
      } catch {
        setUnits([]);
      }

      try {
        const { data } = await supabase.from('service_status').select('id, status_name').order('id', { ascending: true });
        const list = (data || []).map((s) => ({ id: String(s.id), name: s.status_name }));
        setStatuses(list);
        setForm((prev) => {
          if (prev.status_id) return prev;
          const created = list.find((x) => String(x.name || '').toLowerCase() === 'created');
          return { ...prev, status_id: created?.id || prev.status_id };
        });
      } catch {
        setStatuses([]);
      }

      if (serviceId) {
        await loadService(serviceId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAvailabilityForProject = useCallback(async (projectId) => {
    try {
      if (!projectId) {
        setPurchaseOptions([]);
        setTransportOptions([]);
        return;
      }

      const { data: purchRows } = await supabase
        .from('project_materials_availability')
        .select('project_id, order_id, order_code, material_id, material_name, unit_id, unit_name, available, supplier_id, supplier_name')
        .eq('project_id', Number(projectId));
      setPurchaseOptions(Array.isArray(purchRows) ? purchRows : []);

      const { data: trRows } = await supabase
        .from('transport_orders_availability')
        .select('project_id, order_id, order_code, unit_id, unit_name, total_available, quantity_required, transport_supplier_id, transport_supplier_name, pickup_location')
        .eq('project_id', Number(projectId));
      setTransportOptions(Array.isArray(trRows) ? trRows : []);
    } catch {
      setPurchaseOptions([]);
      setTransportOptions([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const prev = prevProjectIdRef.current;
      const next = form.project_id;
      prevProjectIdRef.current = next;

      await loadAvailabilityForProject(next);

      // Si estamos hidratando un servicio existente, no resetear campos.
      if (serviceId && !hydratedServiceRef.current) return;

      // Si el usuario cambió el proyecto, resetear dependencias para evitar inconsistencias.
      if (prev && prev !== next) {
        setSelectedAvailability(null);
        setForm((s) => ({
          ...s,
          purchase_order_id: '',
          transport_order_id: '',
          material_id: '',
          material_supplier_id: '',
          transport_supplier_id: '',
          vehicle_id: '',
          driver_id: '',
          quantity: '',
        }));
        setDriverName('');
        setVehicles([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id]);

  const loadVehicles = useCallback(async (transportSupplierId = '') => {
    try {
      let qb = supabase
        .from('vehicles')
        .select('vehicle_id, plate, model, capacity_m3, is_active, is_available, transport_supplier_id, driver_id')
        .eq('is_active', true)
        .eq('is_available', true);
      if (transportSupplierId) {
        const sid = Number(transportSupplierId);
        if (!Number.isNaN(sid)) qb = qb.eq('transport_supplier_id', sid);
      }
      const { data } = await qb.order('plate');
      setVehicles(
        (data || []).map((v) => ({
          id: String(v.vehicle_id),
          name: v.plate,
          label: [String(v.model || '').trim(), v.capacity_m3 != null ? `${v.capacity_m3} m³` : '', v.plate]
            .filter((x) => String(x || '').trim())
            .join(' - '),
          capacity_m3: v.capacity_m3,
          driver_id: v.driver_id != null ? String(v.driver_id) : '',
        }))
      );
    } catch {
      setVehicles([]);
    }
  }, []);

  useEffect(() => {
    const nextSupplierId = form.transport_supplier_id || '';
    if (prevTransportSupplierRef.current === nextSupplierId) return;
    prevTransportSupplierRef.current = nextSupplierId;

    setField('vehicle_id', '');
    setField('driver_id', '');
    setDriverName('');
    setField('quantity', '');

    if (!nextSupplierId) {
      setVehicles([]);
      return;
    }

    loadVehicles(nextSupplierId);
  }, [form.transport_supplier_id, loadVehicles]);

  useEffect(() => {
    if (!form.vehicle_id) {
      if (form.quantity) setField('quantity', '');
      setDriverName('');
      return;
    }
    const veh = vehicles.find((v) => String(v.id) === String(form.vehicle_id));
    if (!veh || veh.capacity_m3 == null || Number.isNaN(Number(veh.capacity_m3))) {
      if (form.quantity) setField('quantity', '');
    } else {
      const nextQty = String(veh.capacity_m3);
      if (String(form.quantity) !== nextQty) setField('quantity', nextQty);
    }
    if (veh?.driver_id && String(form.driver_id) !== String(veh.driver_id)) setField('driver_id', String(veh.driver_id));
  }, [form.vehicle_id, vehicles, form.quantity, form.driver_id]);

  const loadDriverByVehicle = useCallback(async (vehicleId) => {
    try {
      if (!vehicleId) {
        setDriverName('');
        return;
      }
      const res = await callEdgeFunction('get-driver-by-vehicle', {
        method: 'GET',
        query: { vehicle_id: Number(vehicleId) },
      });
      const name = res?.driver?.name || '';
      setDriverName(String(name || ''));
    } catch {
      setDriverName('');
    }
  }, []);

  useEffect(() => {
    loadDriverByVehicle(form.vehicle_id);
  }, [form.vehicle_id, loadDriverByVehicle]);

  const loadService = async (id) => {
    try {
      setError('');
      try {
        const res = await callEdgeFunction('get-service', { method: 'GET', query: { service_id: id } });
        const s = res?.service;
        if (s) {
          setForm({
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
          hydratedServiceRef.current = true;
          return;
        }
      } catch {
        // fallback abajo
      }

      const { data } = await supabase
        .from('services')
        .select(
          'service_id, purchase_order_id, transport_order_id, project_id, vehicle_id, driver_id, material_id, unit_id, quantity, origin, destination, material_supplier_id, transport_supplier_id, status_id'
        )
        .eq('service_id', id)
        .maybeSingle();
      if (data) {
        setForm({
          purchase_order_id: data.purchase_order_id ? String(data.purchase_order_id) : '',
          transport_order_id: data.transport_order_id ? String(data.transport_order_id) : '',
          project_id: data.project_id ? String(data.project_id) : initialProjectId,
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
        hydratedServiceRef.current = true;
      }
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el servicio');
    }
  };

  const onSubmit = async () => {
    setError('');
    if (!canCreate) {
      setError('No tienes permiso para crear/editar servicios.');
      return;
    }

    const errs = {};
    if (!form.project_id) errs.project_id = 'Selecciona un proyecto';
    if (!form.purchase_order_id) errs.purchase_order_id = 'Selecciona la orden de compra';
    if (!form.transport_order_id) errs.transport_order_id = 'Selecciona la orden de transporte';
    if (!form.vehicle_id) errs.vehicle_id = 'Selecciona un vehículo';
    if (!form.driver_id) errs.driver_id = 'El vehículo no tiene conductor asignado';
    if (!form.material_id) errs.material_id = 'Selecciona un material';
    if (!form.material_supplier_id) errs.material_supplier_id = 'No se detectó proveedor del material (OC)';
    if (!form.unit_id) errs.unit_id = 'Selecciona una unidad';
    if (!form.quantity || Number.isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) errs.quantity = 'Cantidad requerida (capacidad del vehículo)';
    if (!form.transport_supplier_id) errs.transport_supplier_id = 'No se detectó proveedor de transporte (OT)';
    if (selectedAvailability != null && !Number.isNaN(Number(form.quantity)) && Number(form.quantity) > Number(selectedAvailability)) {
      errs.quantity = `Cantidad supera disponible (${selectedAvailability})`;
    }
    if (!form.destination?.trim()) errs.destination = 'Destino requerido';
    if (Object.keys(errs).length) {
      setError(Object.values(errs)[0]);
      return;
    }

    setLoading(true);
    try {
      const body = {
        service_id: serviceId || undefined,
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
      };

      if (serviceId) {
        await callEdgeFunction('update-service', { method: 'POST', body });
      } else {
        await callEdgeFunction('create-service', { method: 'POST', body });
      }

      navigate(`/services?projectId=${encodeURIComponent(form.project_id)}&refresh=1`, { replace: true });
    } catch (e) {
      setError(e?.message || 'No se pudo guardar el servicio');
    } finally {
      setLoading(false);
    }
  };

  const purchaseKey = form.purchase_order_id && form.material_id ? `${form.purchase_order_id}-${form.material_id}` : '';

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{serviceId ? 'Editar servicio' : 'Registrar servicio'}</div>
            <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>Selecciona proyecto, órdenes, vehículo y destino.</div>
          </div>
          <button className="btn btnPrimary" type="button" onClick={onSubmit} disabled={loading || !canCreate}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        {error ? (
          <div style={{ marginTop: 12, fontWeight: 800, textAlign: 'center' }}>{error}</div>
        ) : null}

        <div className="grid" style={{ marginTop: 12 }}>
          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Proyecto</label>
            <select className="input" value={form.project_id} onChange={(e) => setField('project_id', e.target.value)}>
              <option value="">Selecciona un proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Estado</label>
            <select className="input" value={form.status_id} onChange={(e) => setField('status_id', e.target.value)}>
              <option value="">Selecciona un estado</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col12">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Orden de compra (Material)</label>
            <select
              className="input"
              value={purchaseKey}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const [orderId, materialId] = String(val).split('-');
                const row = purchaseOptions.find(
                  (r) => String(r.order_id) === String(orderId) && String(r.material_id) === String(materialId)
                );
                if (!row) return;
                setField('purchase_order_id', String(row.order_id));
                setField('material_id', String(row.material_id));
                setField('unit_id', String(row.unit_id));
                setField('material_supplier_id', String(row.supplier_id));
                setSelectedAvailability(row.available);
              }}
              disabled={!form.project_id}
            >
              <option value="">{form.project_id ? 'Selecciona material/OC' : 'Selecciona un proyecto primero'}</option>
              {purchaseOptions.map((r) => (
                <option key={`${r.order_id}-${r.material_id}`} value={`${r.order_id}-${r.material_id}`}>
                  {`${r.material_name} (${r.available} ${r.unit_name}) - OC ${r.order_code}`}
                </option>
              ))}
            </select>
          </div>

          <div className="col12">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Orden de transporte</label>
            <select
              className="input"
              value={form.transport_order_id}
              onChange={async (e) => {
                const v = e.target.value;
                setField('transport_order_id', v);
                setField('vehicle_id', '');
                setField('driver_id', '');
                setDriverName('');

                const row = transportOptions.find((r) => String(r.order_id) === String(v));
                if (row?.transport_supplier_id != null) setField('transport_supplier_id', String(row.transport_supplier_id));

                if (row?.pickup_location && !form.origin?.trim()) {
                  try {
                    const { data } = await supabase
                      .from('company_address')
                      .select('address')
                      .eq('id', Number(row.pickup_location))
                      .maybeSingle();
                    if (data?.address) setField('origin', data.address);
                  } catch {
                    // noop
                  }
                }
              }}
              disabled={!form.project_id}
            >
              <option value="">{form.project_id ? 'Selecciona una OT' : 'Selecciona un proyecto primero'}</option>
              {transportOptions.map((r) => (
                <option key={String(r.order_id)} value={String(r.order_id)}>
                  {`OT ${r.order_code} - ${r.transport_supplier_name} (${r.total_available ?? '—'} ${r.unit_name})`}
                </option>
              ))}
            </select>
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Vehículo</label>
            <select
              className="input"
              value={form.vehicle_id}
              onChange={(e) => {
                const v = e.target.value;
                setField('vehicle_id', v);
                const veh = vehicles.find((x) => String(x.id) === String(v));
                if (veh?.driver_id) setField('driver_id', veh.driver_id);
                if (veh?.capacity_m3 != null && !Number.isNaN(Number(veh.capacity_m3))) setField('quantity', String(veh.capacity_m3));
              }}
              disabled={!form.transport_order_id}
            >
              <option value="">{form.transport_order_id ? 'Selecciona un vehículo' : 'Selecciona una OT primero'}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label || v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Conductor</label>
            <input
              className="input"
              value={!form.vehicle_id ? 'Seleccione un vehículo' : (driverName || (form.driver_id ? `Conductor #${form.driver_id}` : ''))}
              disabled
              readOnly
            />
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Unidad</label>
            <select className="input" value={form.unit_id} onChange={(e) => setField('unit_id', e.target.value)}>
              <option value="">Selecciona una unidad</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Cantidad</label>
            <input className="input" value={form.quantity} disabled readOnly />
            {selectedAvailability != null ? (
              <div style={{ marginTop: 6, color: 'var(--color-muted)', fontSize: 13 }}>Disponible: {selectedAvailability}</div>
            ) : null}
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Origen</label>
            <input className="input" placeholder="Origen (opcional)" value={form.origin} onChange={(e) => setField('origin', e.target.value)} />
          </div>

          <div className="col6">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Destino</label>
            <input className="input" placeholder="Destino" value={form.destination} onChange={(e) => setField('destination', e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => navigate(-1)} disabled={loading}>
            Cancelar
          </button>
          <button className="btn btnPrimary" type="button" onClick={onSubmit} disabled={loading || !canCreate}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
