import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { callEdgeFunction } from '../../api/edgeFunctions.js';
import { usePermissions } from '../../state/PermissionsContext.jsx';
import { hasPermission } from '../../lib/permissions.js';

export default function Services() {
  const { permissions } = usePermissions();
  const canCreate = useMemo(() => hasPermission(permissions, 'create_new_service_for_my_company'), [permissions]);

  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    })();
  }, []);

  const load = async () => {
    setError('');
    try {
      setLoading(true);
      try {
        const q = {};
        if (projectId) q.project_id = Number(projectId);
        const res = await callEdgeFunction('list-services', { method: 'GET', query: q });
        const arr = Array.isArray(res?.data) ? res.data : [];
        const norm = arr.map((it) => ({
          service_id: it.service_id ?? it.id,
          project_name: it.project_name ?? it?.project?.name ?? null,
          created_at: it.created_at ?? it.date ?? null,
          origin: it.origin ?? null,
          destination: it.destination ?? null,
          order_id: it.order_id ?? it.orderId ?? null,
        }));
        setServices(norm);
      } catch {
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
      setError(e?.message || 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Servicios</div>
            <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>Filtra por proyecto y registra servicios.</div>
          </div>
          {canCreate ? (
            <Link className="btn btnPrimary" to={`/services/new${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`} style={{ textDecoration: 'none' }}>
              Nuevo
            </Link>
          ) : null}
        </div>

        <div className="grid" style={{ marginTop: 12, alignItems: 'end' }}>
          <div className="col9">
            <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Proyecto</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Todos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col3">
            <button className="btn" type="button" onClick={load} disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Cargando…' : 'Buscar'}
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: 12, fontWeight: 800, textAlign: 'center' }}>{error}</div>
        ) : null}

        <div className="list" style={{ marginTop: 12 }}>
          {services.map((s) => (
            <Link
              key={String(s.service_id)}
              to={`/services/new?serviceId=${encodeURIComponent(String(s.service_id))}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="listItem">
                <div style={{ fontWeight: 900 }}>Servicio #{s.service_id}</div>
                <div className="meta">Proyecto: {s.project_name || '—'}</div>
                <div className="meta">Fecha: {s.created_at ? String(s.created_at).slice(0, 10) : '—'}</div>
                <div className="meta">Origen: {s.origin || '—'}</div>
                <div className="meta">Destino: {s.destination || '—'}</div>
              </div>
            </Link>
          ))}
        </div>

        {!loading && services.length === 0 && !error ? (
          <div style={{ marginTop: 12, color: 'var(--color-muted)', textAlign: 'center' }}>No hay servicios.</div>
        ) : null}
      </div>
    </div>
  );
}
