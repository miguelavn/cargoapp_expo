import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { callEdgeFunction } from '../../api/edgeFunctions.js';
import { usePermissions } from '../../state/PermissionsContext.jsx';
import { hasPermission } from '../../lib/permissions.js';

function getProjectName(p) {
  return String(p?.project_name || p?.name || 'Proyecto').trim() || 'Proyecto';
}

function getProjectInitials(p) {
  const name = getProjectName(p);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] || 'P').toUpperCase();
}

function isProjectActive(p) {
  return p?.status !== false && p?.status !== 'false';
}

export default function Projects() {
  const { permissions } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [activeCount, setActiveCount] = useState(null);
  const [inactiveCount, setInactiveCount] = useState(null);
  const [totalCount, setTotalCount] = useState(null);

  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const [selectedProject, setSelectedProject] = useState(null);

  const canCreate = useMemo(() => {
    return (
      hasPermission(permissions, 'create_new_project_for_my_company') ||
      hasPermission(permissions, 'create_new_project')
    );
  }, [permissions]);

  const fetchPage = useCallback(
    async (pageToLoad = 0, append = false) => {
      if (pageToLoad === 0) setError('');
      setLoading(true);
      const myReq = ++requestIdRef.current;
      try {
        const pageSize = 10;
        const offset = pageToLoad * pageSize;
        const json = await callEdgeFunction('list-projects', {
          method: 'GET',
          query: {
            offset,
            limit: pageSize,
            search,
            status: statusFilter || undefined,
          },
        });

        if (myReq !== requestIdRef.current) return;
        const list = Array.isArray(json.projects) ? json.projects : [];
        setProjects((prev) => (append ? [...prev, ...list] : list));
        setTotal(typeof json.total === 'number' ? json.total : list.length);
        let nextHasMore = list.length === pageSize;
        if (typeof json.has_more === 'boolean') nextHasMore = json.has_more && list.length === pageSize;
        if (append && list.length === 0) nextHasMore = false;
        setHasMore(nextHasMore);
        setPage(pageToLoad);

        if (!append) {
          setSelectedProject((prevSelected) => {
            const prevId = prevSelected ? String(prevSelected.project_id || prevSelected.id || '') : '';
            if (prevId) {
              const stillThere = list.find((x) => String(x.project_id || x.id || '') === prevId);
              if (stillThere) return stillThere;
            }
            return list.length ? list[0] : null;
          });
        }
      } catch (e) {
        if (myReq !== requestIdRef.current) return;
        if (e?.message !== 'Tiempo de espera agotado') setError(e?.message || 'No se pudieron cargar los proyectos');
        setHasMore(false);
      } finally {
        if (myReq === requestIdRef.current) setLoading(false);
      }
    },
    [search, statusFilter]
  );

  // Conteos (estilo WorkflowOS): Activos / Inactivos / Total
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allJson, actJson, inactJson] = await Promise.all([
          callEdgeFunction('list-projects', { method: 'GET', query: { limit: 1 } }),
          callEdgeFunction('list-projects', { method: 'GET', query: { limit: 1, status: 'active' } }),
          callEdgeFunction('list-projects', { method: 'GET', query: { limit: 1, status: 'inactive' } }),
        ]);
        if (cancelled) return;
        setTotalCount(typeof allJson?.total === 'number' ? allJson.total : null);
        setActiveCount(typeof actJson?.total === 'number' ? actJson.total : null);
        setInactiveCount(typeof inactJson?.total === 'number' ? inactJson.total : null);
      } catch {
        if (cancelled) return;
        setTotalCount(null);
        setActiveCount(null);
        setInactiveCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setProjects([]);
      setHasMore(false);
      setPage(0);
      fetchPage(0, false);
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter, fetchPage]);

  useEffect(() => {
    if (searchParams.get('refresh')) {
      fetchPage(0, false);
      searchParams.delete('refresh');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchPage]);

  const statusLabel = useMemo(() => {
    if (statusFilter === 'active') return 'Activos';
    if (statusFilter === 'inactive') return 'Inactivos';
    return 'Todos';
  }, [statusFilter]);

  const selectProject = (p) => {
    setSelectedProject(p || null);
  };

  const selectedId = selectedProject ? String(selectedProject.project_id || selectedProject.id || '') : '';

  return (
    <div className="usersPage">
      <div className="usersPageHeader">
        <h1 className="usersPageTitle">Administración de Proyectos</h1>
        <div className="usersPageBreadcrumb">
          <span style={{ color: 'var(--color-primary)' }}>Proyectos</span>
          <i className="fa-solid fa-angle-right" aria-hidden="true" style={{ margin: '0 6px', fontSize: 11 }} />
          <span>Administrar Proyectos</span>
        </div>
      </div>

      <div className="usersLayout">
        {/* ── Panel izquierdo: filtros (estilo WorkflowOS) ───────────────── */}
        <aside className="usersFilterPanel" aria-label="Filtros">
          <div className="usersFilterSection">
            <div className="usersFilterSectionTitle">Estado</div>

            <button
              type="button"
              className={`usersFilterItem ${statusFilter === '' ? 'usersFilterItemActive' : ''}`}
              onClick={() => setStatusFilter('')}
            >
              <span>Todos</span>
              {totalCount != null && (
                <span className={`usersFilterBadge ${statusFilter === '' ? 'usersFilterBadgeActive' : ''}`}>{totalCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`usersFilterItem ${statusFilter === 'active' ? 'usersFilterItemActive' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              <span>Activos</span>
              {activeCount != null && (
                <span className={`usersFilterBadge ${statusFilter === 'active' ? 'usersFilterBadgeActive' : 'usersFilterBadgeBlue'}`}>{activeCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`usersFilterItem usersFilterItemDanger ${statusFilter === 'inactive' ? 'usersFilterItemDangerActive' : ''}`}
              onClick={() => setStatusFilter('inactive')}
            >
              <span>Inactivos</span>
              {inactiveCount != null && (
                <span className={`usersFilterBadge ${statusFilter === 'inactive' ? 'usersFilterBadgeActive' : 'usersFilterBadgeRed'}`}>{inactiveCount}</span>
              )}
            </button>

            <div className="usersFilterSectionTitle" style={{ marginTop: 16 }}>Resumen</div>
            <div className="usersListEmpty" style={{ padding: '6px 10px', textAlign: 'left' }}>
              {loading && projects.length === 0 ? 'Cargando…' : `Mostrando: ${total} (${statusLabel})`}
            </div>
          </div>
        </aside>

        {/* ── Panel central: lista ─────────────────────────────────────── */}
        <section className="usersListPanel" aria-label="Lista de proyectos">
          <div className="usersListSearch">
            <i className="fa-solid fa-magnifying-glass usersListSearchIcon" aria-hidden="true" />
            <input
              className="usersListSearchInput"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proyectos"
              autoCorrect="off"
            />
            {canCreate ? (
              <Link
                className="btn btnPrimary"
                to="/projects/new"
                style={{ textDecoration: 'none', whiteSpace: 'nowrap', fontSize: 13 }}
              >
                + Nuevo
              </Link>
            ) : null}
          </div>

          {error ? <div className="usersListError">{error}</div> : null}

          <div className="usersListScroll">
            {loading && projects.length === 0 ? (
              <div className="usersListEmpty">Cargando…</div>
            ) : !loading && projects.length === 0 ? (
              <div className="usersListEmpty">No hay proyectos para mostrar.</div>
            ) : (
              projects.map((p, idx) => {
                const pid = String(p.project_id || p.id || idx);
                const isSelected = selectedId && selectedId === pid;
                const active = isProjectActive(p);
                const location = p.city_name ? `${p.city_name}${p.department_name ? `, ${p.department_name}` : ''}` : '';

                return (
                  <button
                    key={pid}
                    type="button"
                    className={`usersListItem ${isSelected ? 'usersListItemSelected' : ''}`}
                    onClick={() => { if (!isSelected) selectProject(p); }}
                  >
                    <span className="usersListAvatar" style={{ background: 'var(--color-primary)' }} aria-hidden="true">
                      {getProjectInitials(p)}
                    </span>
                    <span className="usersListItemBody">
                      <span className="usersListItemName">{getProjectName(p)}</span>
                      {location ? <span className="usersListItemEmail">{location}</span> : null}
                      <span className="usersListItemBadges">
                        <span className={`uiBadge ${active ? 'uiBadgeGreen' : 'uiBadgeBlue'}`}>{active ? 'Activo' : 'Inactivo'}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}

            {hasMore ? (
              <div style={{ padding: '10px 16px 16px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%' }}
                  onClick={() => !loading && fetchPage(page + 1, true)}
                  disabled={loading}
                >
                  {loading ? 'Cargando…' : 'Cargar más'}
                </button>
              </div>
            ) : null}

            {loading && projects.length > 0 ? (
              <div className="usersListEmpty" style={{ padding: 12 }}>Cargando…</div>
            ) : null}
          </div>
        </section>

        {/* ── Panel derecho: detalle ──────────────────────────────────── */}
        <aside className="usersDetailPanel" aria-label="Detalle del proyecto">
          <div className="usersDetailHeader">
            <span className="usersDetailHeaderTitle">
              <i className="fa-regular fa-diagram-project" aria-hidden="true" style={{ marginRight: 8 }} />
              Detalles del Proyecto
            </span>
          </div>

          {selectedProject ? (
            <div className="usersDetailBody">
              <div className="usersDetailField">
                <div className="usersDetailLabel">Nombre</div>
                <div className="usersDetailValue">{getProjectName(selectedProject)}</div>
              </div>

              <div className="usersDetailField">
                <div className="usersDetailLabel">Estado</div>
                <div className="usersDetailValueRow">
                  <span
                    className={`usersDetailToggle ${isProjectActive(selectedProject) ? 'usersDetailToggleOn' : ''}`}
                    role="img"
                    aria-label={isProjectActive(selectedProject) ? 'Activo' : 'Inactivo'}
                  />
                  <span style={{ fontSize: 13 }}>{isProjectActive(selectedProject) ? 'Activo' : 'Inactivo'}</span>
                </div>
              </div>

              <div className="usersDetailField">
                <div className="usersDetailLabel">Ubicación</div>
                <div className="usersDetailValue">
                  {selectedProject.city_name
                    ? `${selectedProject.city_name}${selectedProject.department_name ? `, ${selectedProject.department_name}` : ''}`
                    : '—'}
                </div>
              </div>

              <div className="usersDetailField">
                <div className="usersDetailLabel">Descripción</div>
                <div className="usersDetailValue">{selectedProject.description ? String(selectedProject.description) : '—'}</div>
              </div>
            </div>
          ) : (
            <div className="usersDetailEmpty">
              <i className="fa-regular fa-diagram-project usersDetailEmptyIcon" aria-hidden="true" />
              <div className="usersDetailEmptyText">Selecciona un proyecto para ver sus detalles</div>
              {canCreate ? (
                <div style={{ marginTop: 12, width: '100%', textAlign: 'center' }}>
                  <Link className="btn btnPrimary" to="/projects/new" style={{ width: '50%', textDecoration: 'none', display: 'inline-block' }}>
                    + Nuevo Proyecto
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
