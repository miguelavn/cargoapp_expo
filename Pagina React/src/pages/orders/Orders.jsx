import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { callEdgeFunction } from '../../api/edgeFunctions.js';

function ProjectPickerModal({ open, onClose, projects, selectedProject, onSelect }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => String(p.name || '').toLowerCase().includes(q));
  }, [query, projects]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard" style={{ maxWidth: 520 }}>
        <div style={{ fontWeight: 900, fontSize: 16, textAlign: 'center' }}>Seleccionar proyecto</div>

        <div style={{ marginTop: 12 }}>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proyecto…" autoCorrect="off" />
        </div>

        <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto' }}>
          <button
            type="button"
            className="btn"
            onClick={() => onSelect('')}
            style={{ width: '100%', textAlign: 'left', borderColor: !selectedProject ? 'var(--color-primary)' : 'var(--color-border)' }}
          >
            Todos los proyectos
          </button>

          <div style={{ height: 10 }} />

          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn"
              onClick={() => onSelect(p.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                marginTop: 8,
                borderColor: selectedProject === p.id ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function FiltersModal({ open, onClose, suppliers, orderTypes, selectedSupplier, setSelectedSupplier, selectedOrderType, setSelectedOrderType, onClear }) {
  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modalCard" style={{ maxWidth: 520 }}>
        <div style={{ fontWeight: 900, fontSize: 16, textAlign: 'center' }}>Filtros</div>

        <div style={{ marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Proveedor
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setSelectedSupplier('')}
              style={{ width: '100%', textAlign: 'left', borderColor: !selectedSupplier ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              Todos
            </button>
            {suppliers.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn"
                onClick={() => setSelectedSupplier(s.id)}
                style={{ width: '100%', textAlign: 'left', marginTop: 8, borderColor: selectedSupplier === s.id ? 'var(--color-primary)' : 'var(--color-border)' }}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div style={{ height: 14 }} />

          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Tipo de orden
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setSelectedOrderType('')}
              style={{ width: '100%', textAlign: 'left', borderColor: !selectedOrderType ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              Todos
            </button>
            {orderTypes.map((o) => (
              <button
                key={o.id}
                type="button"
                className="btn"
                onClick={() => setSelectedOrderType(o.id)}
                style={{ width: '100%', textAlign: 'left', marginTop: 8, borderColor: selectedOrderType === o.id ? 'var(--color-primary)' : 'var(--color-border)' }}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={onClear}>
            Limpiar
          </button>
          <button type="button" className="btn btnPrimary" onClick={onClose}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialProjectId = useMemo(() => searchParams.get('projectId') || '', [searchParams]);
  const [projects, setProjects] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(initialProjectId);

  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedOrderType, setSelectedOrderType] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('projects')
          .select('project_id, name, status')
          .eq('status', true)
          .order('name', { ascending: true });
        if (qErr) throw qErr;
        setProjects((data || []).map((p) => ({ id: String(p.project_id), name: p.name })));
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: ct } = await supabase.from('company_types').select('id, name');
        const supplierTypeIds = (ct || [])
          .filter((t) => {
            const n = String(t?.name || '').toLowerCase();
            return n === 'supplier' || n === 'client and supplier' || n === 'proveedor' || n === 'cliente y proveedor';
          })
          .map((t) => t.id);

        let companies = [];
        if (supplierTypeIds.length > 0) {
          const { data } = await supabase
            .from('companies')
            .select('company_id, name, company_type_id')
            .in('company_type_id', supplierTypeIds)
            .order('name', { ascending: true });
          companies = data || [];
        } else {
          const { data } = await supabase.from('companies').select('company_id, name, company_type_id').order('name', { ascending: true });
          companies = data || [];
        }
        setSuppliers(companies.map((s) => ({ id: String(s.company_id), name: s.name })));
      } catch {
        setSuppliers([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('order_type').select('id, type').order('id');
        setOrderTypes((data || []).map((t) => ({ id: String(t.id), name: t.type })));
      } catch {
        setOrderTypes([]);
      }
    })();
  }, []);

  const fetchOrders = useCallback(
    async (nextPage = 1, replace = false) => {
      setLoading(true);
      if (nextPage === 1) setError('');
      const myReqId = ++requestIdRef.current;
      const PAGE_SIZE = 20;
      try {
        const res = await callEdgeFunction('list-orders', {
          method: 'POST',
          body: {
            page: nextPage,
            pageSize: PAGE_SIZE,
            project_id: selectedProject ? Number(selectedProject) : undefined,
            supplier_id: selectedSupplier ? Number(selectedSupplier) : undefined,
            order_type_id: selectedOrderType ? Number(selectedOrderType) : undefined,
          },
        });

        if (myReqId !== requestIdRef.current) return;
        const data = Array.isArray(res?.orders) ? res.orders : [];
        setTotal(Number(res?.total || 0));
        setOrders((prev) => (replace ? data : [...prev, ...data]));
        const more = typeof res?.has_more === 'boolean' ? res.has_more : data.length === PAGE_SIZE;
        setHasMore(!!more);
        setPage(nextPage);
      } catch (e) {
        if (myReqId !== requestIdRef.current) return;
        setError(e?.message || 'No se pudieron cargar las órdenes');
      } finally {
        if (myReqId === requestIdRef.current) setLoading(false);
      }
    },
    [selectedProject, selectedSupplier, selectedOrderType]
  );

  useEffect(() => {
    setOrders([]);
    setHasMore(true);
    setPage(1);
    fetchOrders(1, true);
  }, [selectedProject, selectedSupplier, selectedOrderType, fetchOrders]);

  useEffect(() => {
    if (searchParams.get('refresh')) {
      fetchOrders(1, true);
      searchParams.delete('refresh');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchOrders]);

  const selectedProjectName = useMemo(() => {
    if (!selectedProject) return '';
    return projects.find((p) => p.id === selectedProject)?.name || '';
  }, [projects, selectedProject]);

  const clearFilters = () => {
    setSelectedSupplier('');
    setSelectedOrderType('');
  };

  const createLink = useMemo(() => {
    return selectedProject ? `/orders/new?projectId=${encodeURIComponent(selectedProject)}` : '/orders/new';
  }, [selectedProject]);

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Órdenes</div>
            <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>Filtra por proyecto, proveedor y tipo.</div>
          </div>
          <Link className="btn btnPrimary" to={createLink} style={{ textDecoration: 'none' }}>
            Nueva
          </Link>
        </div>

        <div className="grid" style={{ marginTop: 12, alignItems: 'end' }}>
          <div className="col8">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Proyecto</label>
            <button
              type="button"
              className="btn"
              onClick={() => setShowProjectModal(true)}
              style={{ width: '100%', textAlign: 'left' }}
            >
              {selectedProject ? (selectedProjectName || 'Proyecto') : 'Seleccionar proyecto'}
            </button>
          </div>
          <div className="col4" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowFilters(true)}
              style={{ flex: 1, minWidth: 140 }}
            >
              Filtros
            </button>
            {(selectedSupplier || selectedOrderType) ? (
              <button type="button" className="btn" onClick={clearFilters} style={{ flex: 1, minWidth: 140 }}>
                Limpiar
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 12, color: 'var(--color-muted)', fontSize: 13, textAlign: 'right' }}>
          {loading && orders.length === 0 ? 'Cargando…' : `Total órdenes: ${total}`}
        </div>

        {error ? (
          <div style={{ marginTop: 12, fontWeight: 800, textAlign: 'center' }}>{error}</div>
        ) : null}

        <div className="list" style={{ marginTop: 12 }}>
          {orders.map((o, idx) => (
            <Link
              key={String(o.id ?? idx)}
              to={`/orders/new?orderId=${encodeURIComponent(String(o.id))}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="listItem">
                <div style={{ fontWeight: 900, fontSize: 15 }}>{o.code || `Orden #${o.id}`}</div>
                <div className="meta">{o.date ? `Fecha: ${o.date}` : 'Sin fecha'}</div>
                {o.order_type_name ? <div className="meta">{o.order_type_name}</div> : null}
                {o.supplier_id ? <div className="meta">Proveedor: {o.supplier_name || `ID ${o.supplier_id}`}</div> : null}
                {o.project_name ? <div className="meta">Proyecto: {o.project_name}</div> : null}
              </div>
            </Link>
          ))}
        </div>

        {!loading && orders.length === 0 && !error ? (
          <div style={{ marginTop: 12, color: 'var(--color-muted)', textAlign: 'center' }}>No hay órdenes para mostrar.</div>
        ) : null}

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          {hasMore ? (
            <button className="btn" type="button" onClick={() => !loading && fetchOrders(page + 1, false)} disabled={loading}>
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          ) : null}
        </div>
      </div>

      <FiltersModal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        suppliers={suppliers}
        orderTypes={orderTypes}
        selectedSupplier={selectedSupplier}
        setSelectedSupplier={setSelectedSupplier}
        selectedOrderType={selectedOrderType}
        setSelectedOrderType={setSelectedOrderType}
        onClear={() => {
          clearFilters();
          setShowFilters(false);
        }}
      />

      <ProjectPickerModal
        open={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        projects={projects}
        selectedProject={selectedProject}
        onSelect={(id) => {
          setSelectedProject(id);
          setShowProjectModal(false);
        }}
      />
    </div>
  );
}
