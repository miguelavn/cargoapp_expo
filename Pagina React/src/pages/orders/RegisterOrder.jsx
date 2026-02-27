import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { callEdgeFunction } from '../../api/edgeFunctions.js';

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
  } catch {
    const rounded = Math.round(num);
    const s = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$ ${s}`;
  }
};

export default function RegisterOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const orderId = useMemo(() => {
    const raw = searchParams.get('orderId');
    const n = raw ? Number(raw) : null;
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const initialProjectId = useMemo(() => searchParams.get('projectId') || '', [searchParams]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState('');

  const [projects, setProjects] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);
  const [supplierCompanies, setSupplierCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [materials, setMaterials] = useState([]);

  const [orderDetails, setOrderDetails] = useState([]);
  const [isEditing, setIsEditing] = useState(orderId ? false : true);

  const [form, setForm] = useState({
    project_id: initialProjectId,
    order_type_id: '',
    code: '',
    date: '',
    supplier_id: '',
  });

  const [showLineModal, setShowLineModal] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
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

  const isPurchase = Number(form.order_type_id) === 1;

  useEffect(() => {
    let mounted = true;
    (async () => {
      setBootLoading(true);
      setError('');
      try {
        const [{ data: pjs }, { data: types }, { data: ct }, { data: mu }, { data: mats }] = await Promise.all([
          supabase.from('projects').select('project_id, name, status').eq('status', true).order('name'),
          supabase.from('order_type').select('id, type'),
          supabase.from('company_types').select('id, name'),
          supabase.from('measurement_units').select('id, name').order('name'),
          supabase.from('materials').select('material_id, name, unit_id, company_id').order('name'),
        ]);

        if (!mounted) return;
        setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name })));
        setOrderTypes((types || []).map((t) => ({ id: String(t.id), name: t.type })));
        setUnits((mu || []).map((u) => ({ id: String(u.id), name: u.name })));
        setMaterials(
          (mats || []).map((m) => ({
            id: String(m.material_id),
            name: m.name,
            unit_id: m.unit_id != null ? String(m.unit_id) : '',
            company_id: m.company_id,
          }))
        );

        const supplierTypeIds = (ct || [])
          .filter((t) => {
            const n = String(t?.name || '').toLowerCase();
            return (
              n === 'supplier' ||
              n === 'client and supplier' ||
              n === 'cliente y proveedor' ||
              n === 'proveedor'
            );
          })
          .map((t) => t.id);

        if (supplierTypeIds.length > 0) {
          const { data: companies } = await supabase
            .from('companies')
            .select('company_id, name, company_type_id')
            .in('company_type_id', supplierTypeIds)
            .order('name');
          if (!mounted) return;
          setSupplierCompanies((companies || []).map((c) => ({ id: String(c.company_id), name: c.name })));
        } else {
          setSupplierCompanies([]);
        }

        if (orderId) {
          await loadOrder(orderId);
        }
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'No se pudieron cargar los datos iniciales');
      } finally {
        if (mounted) setBootLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (!isPurchase && lineForm.material_id) {
      setLineForm((s) => ({ ...s, material_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.order_type_id]);

  const loadOrder = async (id) => {
    try {
      let header;
      try {
        const res = await callEdgeFunction('get-order', { method: 'GET', query: { id } });
        header = res?.order;
        if (Array.isArray(res?.details)) {
          setOrderDetails(
            res.details.map((d) => ({
              ...d,
              material_id: d.material_id != null ? String(d.material_id) : '',
            }))
          );
        }
      } catch {
        const { data, error: headerErr } = await supabase
          .from('orders')
          .select('id, code, date, order_type_id, project_id, supplier_id')
          .eq('id', id)
          .maybeSingle();
        if (headerErr) throw headerErr;
        header = data;
        const { data: det } = await supabase
          .from('order_details')
          .select('id, description, unit_id, quantity, unit_value, total_value, pickup_location, delivery_location, material_id')
          .eq('order_id', id)
          .order('id', { ascending: true });
        setOrderDetails(
          (det || []).map((d) => ({
            ...d,
            material_id: d.material_id != null ? String(d.material_id) : '',
          }))
        );
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
      setError(e?.message || 'No se pudo cargar la orden');
    }
  };

  const reloadDetails = async () => {
    if (!orderId) return;
    try {
      try {
        const res = await callEdgeFunction('get-order', { method: 'GET', query: { id: orderId } });
        if (Array.isArray(res?.details)) {
          setOrderDetails(
            res.details.map((d) => ({
              ...d,
              material_id: d.material_id != null ? String(d.material_id) : '',
            }))
          );
          return;
        }
      } catch {
        // noop
      }
      const { data: det } = await supabase
        .from('order_details')
        .select('id, description, unit_id, quantity, unit_value, total_value, pickup_location, delivery_location, material_id')
        .eq('order_id', orderId)
        .order('id', { ascending: true });
      setOrderDetails(
        (det || []).map((d) => ({
          ...d,
          material_id: d.material_id != null ? String(d.material_id) : '',
        }))
      );
    } catch (e) {
      setError(e?.message || 'No se pudieron recargar las líneas');
    }
  };

  const handleChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const setLineField = (k, v) => setLineForm((s) => ({ ...s, [k]: v }));

  const onUnitValueChange = (text) => {
    const digits = (text || '').replace(/\D+/g, '');
    if (!digits) {
      setLineForm((s) => ({ ...s, unit_value: '', unit_value_display: '' }));
      return;
    }
    const num = Number(digits);
    setLineForm((s) => ({ ...s, unit_value: String(num), unit_value_display: formatCOP(num) }));
  };

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
      setLineForm({
        description: '',
        unit_id: '',
        quantity: '',
        unit_value: '',
        unit_value_display: '',
        pickup_location: '',
        delivery_location: '',
        material_id: '',
      });
    }
    setShowLineModal(true);
  };

  const closeLineModal = () => {
    setShowLineModal(false);
    setEditingLine(null);
  };

  const saveLine = async () => {
    setError('');
    const errs = [];
    if (!lineForm.description?.trim()) errs.push('Descripción requerida');
    if (!/^\d+$/.test(lineForm.quantity || '')) errs.push('Cantidad debe ser un entero');
    const qty = Number(lineForm.quantity);
    if (!(qty > 0)) errs.push('Cantidad debe ser > 0');
    if (!lineForm.unit_id) errs.push('Selecciona una unidad');
    if (isPurchase && !lineForm.material_id) errs.push('Selecciona un material');
    const unitVal = lineForm.unit_value !== '' ? Number(lineForm.unit_value) : null;
    if (!(unitVal >= 0)) errs.push('Valor unitario requerido');
    if (!lineForm.pickup_location?.trim()) errs.push('Origen requerido');
    if (!lineForm.delivery_location?.trim()) errs.push('Destino requerido');

    if (errs.length) {
      setError(errs[0]);
      return;
    }

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
        if (editingLine && (editingLine.id || editingLine._tmpId)) {
          setOrderDetails((prev) =>
            prev.map((l) => {
              const match = editingLine.id ? l.id === editingLine.id : l._tmpId === editingLine._tmpId;
              return match ? { ...l, ...payload, id: l.id, _tmpId: l._tmpId } : l;
            })
          );
        } else {
          const tmpId = Date.now() + Math.random();
          setOrderDetails((prev) => [...prev, { ...payload, id: undefined, _tmpId: tmpId }]);
        }
      } else {
        if (editingLine) {
          await callEdgeFunction('update-order-detail', { method: 'POST', body: { id: editingLine.id, ...payload } });
        } else {
          await callEdgeFunction('create-order-detail', { method: 'POST', body: payload });
        }
        await reloadDetails();
      }

      closeLineModal();
    } catch (e) {
      setError(e?.message || 'No se pudo guardar la línea');
      return;
    } finally {
      setSavingLine(false);
    }
  };

  const deleteLine = async (line) => {
    setError('');
    const ok = window.confirm('¿Deseas eliminar esta línea?');
    if (!ok) return;

    try {
      if (!orderId) {
        if (line?._tmpId != null) {
          setOrderDetails((prev) => prev.filter((l) => l._tmpId !== line._tmpId));
        }
        return;
      }

      if (!line?.id) return;
      await callEdgeFunction('delete-order-detail', { method: 'POST', body: { id: line.id } });
      await reloadDetails();
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar la línea');
    }
  };

  const onSubmit = async () => {
    setError('');
    if (!form.project_id) return setError('Selecciona un proyecto');
    if (!form.order_type_id) return setError('Selecciona un tipo de orden');
    if (!form.supplier_id) return setError('Selecciona un proveedor');
    if (!orderId && orderDetails.length === 0) return setError('Agrega al menos una línea a la orden');

    try {
      setLoading(true);

      if (orderId) {
        await callEdgeFunction('update-order', {
          method: 'POST',
          body: {
            id: orderId,
            project_id: Number(form.project_id),
            order_type_id: Number(form.order_type_id),
            supplier_id: Number(form.supplier_id),
          },
        });
        setIsEditing(false);
        await loadOrder(orderId);
        return;
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const y = now.getFullYear();
      const m = pad(now.getMonth() + 1);
      const d = pad(now.getDate());
      const hh = pad(now.getHours());
      const mm = pad(now.getMinutes());
      const ss = pad(now.getSeconds());

      let appUserId = '';
      let companyId = null;
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const authId = sessionRes?.session?.user?.id;
        if (authId) {
          const { data: appUser } = await supabase
            .from('app_users')
            .select('user_id, company_id')
            .eq('auth_id', authId)
            .maybeSingle();
          appUserId = appUser?.user_id ? String(appUser.user_id) : '';
          companyId = appUser?.company_id ?? null;
        }
      } catch {
        // noop
      }

      const autoCode = `${y}${m}${d}${hh}${mm}${ss}${appUserId ? '-' + appUserId : ''}`;
      const autoDate = `${y}-${m}-${d}`;

      const details = orderDetails.map((l) => ({
        description: l.description,
        unit_id: l.unit_id != null ? Number(l.unit_id) : null,
        quantity: Number(l.quantity),
        unit_value: l.unit_value != null ? Number(l.unit_value) : null,
        total_value:
          l.total_value != null
            ? Number(l.total_value)
            : l.unit_value != null
              ? Number(l.unit_value) * Number(l.quantity)
              : null,
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

      await callEdgeFunction('create-order', { method: 'POST', body });
      navigate('/orders', { replace: true });
    } catch (e) {
      setError(e?.message || 'No se pudo guardar la orden');
    } finally {
      setLoading(false);
    }
  };

  const headerTitle = orderId ? 'Detalle de orden' : 'Registrar orden';

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" to="/orders" style={{ textDecoration: 'none' }}>
              Volver
            </Link>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{headerTitle}</div>
          </div>
          <div style={{ color: 'var(--color-muted)', marginTop: 6 }}>
            {orderId ? 'Puedes ver o editar los datos.' : 'Completa la cabecera y agrega líneas.'}
          </div>
        </div>

        {orderId ? (
          <button className="btn" onClick={() => setIsEditing((v) => !v)}>
            {isEditing ? 'Ver' : 'Editar'}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--color-secondary)' }}>
          <div style={{ fontWeight: 800 }}>Atención</div>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="col12">
          <div className="card">
            <div className="grid">
              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Proyecto</div>
                {orderId && !isEditing ? (
                  <div className="input" style={{ background: '#F3F4F6' }}>
                    {projects.find((p) => p.id === form.project_id)?.name || '—'}
                  </div>
                ) : (
                  <select className="input" value={form.project_id} onChange={(e) => handleChange('project_id', e.target.value)}>
                    <option value="">Selecciona un proyecto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Tipo de orden</div>
                {orderId && !isEditing ? (
                  <div className="input" style={{ background: '#F3F4F6' }}>
                    {orderTypes.find((t) => t.id === form.order_type_id)?.name || '—'}
                  </div>
                ) : (
                  <select className="input" value={form.order_type_id} onChange={(e) => handleChange('order_type_id', e.target.value)}>
                    <option value="">Selecciona el tipo de orden</option>
                    {orderTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {orderId ? (
                <>
                  <div className="col6">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Código</div>
                    <div className="input" style={{ background: '#F3F4F6' }}>{form.code || '—'}</div>
                  </div>
                  <div className="col6">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Fecha</div>
                    <div className="input" style={{ background: '#F3F4F6' }}>{form.date || '—'}</div>
                  </div>
                </>
              ) : null}

              <div className="col12">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Proveedor</div>
                {orderId && !isEditing ? (
                  <div className="input" style={{ background: '#F3F4F6' }}>
                    {supplierCompanies.find((c) => c.id === form.supplier_id)?.name || '—'}
                  </div>
                ) : (
                  <select className="input" value={form.supplier_id} onChange={(e) => handleChange('supplier_id', e.target.value)}>
                    <option value="">Selecciona un proveedor</option>
                    {supplierCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="col12" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btnPrimary" onClick={onSubmit} disabled={loading || bootLoading || (orderId && !isEditing)}>
                  {loading ? 'Guardando…' : orderId ? 'Guardar cambios' : 'Guardar orden'}
                </button>
              </div>
            </div>

            {bootLoading ? (
              <div style={{ marginTop: 10, color: 'var(--color-muted)' }}>Cargando catálogos…</div>
            ) : null}
          </div>
        </div>

        <div className="col12">
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Líneas de la orden</div>
                <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>
                  {orderDetails.length === 0 ? 'Esta orden no tiene líneas.' : `${orderDetails.length} línea(s)`}
                </div>
              </div>
              {(isEditing || !orderId) ? (
                <button className="btn" onClick={() => openLineModal()}>
                  Agregar línea
                </button>
              ) : null}
            </div>

            {orderDetails.length > 0 ? (
              <div className="list" style={{ marginTop: 12 }}>
                {orderDetails.map((item, idx) => {
                  const key = String(item?.id ?? item?._tmpId ?? idx);
                  const unitName = (() => {
                    const uid = item?.unit_id != null ? String(item.unit_id) : '';
                    return units.find((u) => u.id === uid)?.name;
                  })();
                  const materialName = item?.material_id
                    ? materials.find((m) => m.id === String(item.material_id))?.name || `ID ${item.material_id}`
                    : '—';

                  return (
                    <div key={key} className="listItem">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>{item?.description || '(Sin descripción)'}</div>
                          {isPurchase ? (
                            <div className="meta">Material: {materialName}</div>
                          ) : null}
                          <div className="meta">Cantidad: {item?.quantity ?? '-'}{unitName ? ` ${unitName}` : ''}</div>
                          {item?.unit_value != null ? (
                            <div className="meta">Vlr unidad: {formatCOP(item.unit_value)}</div>
                          ) : null}
                          {item?.total_value != null ? (
                            <div className="meta">Total: {formatCOP(item.total_value)}</div>
                          ) : null}
                          {(item?.pickup_location || item?.delivery_location) ? (
                            <div className="meta">
                              {item?.pickup_location ? `Origen: ${item.pickup_location}` : ''}
                              {item?.pickup_location && item?.delivery_location ? ' | ' : ''}
                              {item?.delivery_location ? `Destino: ${item.delivery_location}` : ''}
                            </div>
                          ) : null}
                        </div>

                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button className="btn" onClick={() => openLineModal(item)}>Editar</button>
                            <button className="btn" onClick={() => deleteLine(item)}>Eliminar</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showLineModal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{editingLine ? 'Editar línea' : 'Nueva línea'}</div>
              <button className="btn" onClick={closeLineModal}>
                Cerrar
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Descripción</div>
              <textarea
                className="input"
                rows={3}
                value={lineForm.description}
                onChange={(e) => setLineField('description', e.target.value)}
                placeholder="Descripción *"
              />
            </div>

            <div className="grid" style={{ marginTop: 10 }}>
              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Unidad</div>
                <select className="input" value={lineForm.unit_id} onChange={(e) => setLineField('unit_id', e.target.value)}>
                  <option value="">Selecciona una unidad</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {isPurchase ? (
                <div className="col6">
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Material</div>
                  <select className="input" value={lineForm.material_id} onChange={(e) => setLineField('material_id', e.target.value)}>
                    <option value="">Selecciona un material</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Cantidad</div>
                <input className="input" value={lineForm.quantity} onChange={(e) => onQuantityChange(e.target.value)} placeholder="Cantidad (entero) *" inputMode="numeric" />
              </div>

              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Valor unitario</div>
                <input className="input" value={lineForm.unit_value_display} onChange={(e) => onUnitValueChange(e.target.value)} placeholder="Valor unitario *" inputMode="numeric" />
              </div>

              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Origen</div>
                <input className="input" value={lineForm.pickup_location} onChange={(e) => setLineField('pickup_location', e.target.value)} placeholder="Origen *" />
              </div>

              <div className="col6">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Destino</div>
                <input className="input" value={lineForm.delivery_location} onChange={(e) => setLineField('delivery_location', e.target.value)} placeholder="Destino *" />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={closeLineModal} disabled={savingLine}>Cancelar</button>
              <button className="btn btnPrimary" onClick={saveLine} disabled={savingLine}>
                {savingLine ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
