import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { callEdgeFunction } from '../../api/edgeFunctions.js';
import { usePermissions } from '../../state/PermissionsContext.jsx';
import { hasPermission } from '../../lib/permissions.js';

function getFullName(u) {
  const full = [u?.name, u?.last_name].filter(Boolean).join(' ').trim();
  return full || u?.display_name || u?.username || u?.email || 'Sin nombre';
}

function getInitials(u) {
  const name = u?.name || '';
  const last = u?.last_name || '';
  if (name && last) return (name[0] + last[0]).toUpperCase();
  const full = getFullName(u);
  const parts = full.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (full[0] || '?').toUpperCase();
}

const AVATAR_COLORS = [
  '#727b81',
];

function avatarColor(u) {
  const str = getFullName(u);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function randomPass() {
  return Math.random().toString(36).slice(-6) + 'A1!';
}

function friendlyUserSaveError(e, fallback) {
  const raw = String(e?.message || '').trim();
  const msg = raw || String(fallback || 'Ocurrió un error');
  if (/correo\s+ya\s+est[aá]\s+registrado/i.test(msg)) {
    return 'Este correo ya está registrado. Usa otro correo.';
  }
  return msg;
}

const EMPTY_EDIT = { name: '', last_name: '', username: '', personal_id: '', email: '', phone: '', company_id: '', role_id: '' };
const EMPTY_CREATE = { name: '', last_name: '', username: '', personal_id: '', email: '', phone: '', company_id: '', role_id: '' };

export default function Users() {
  const { permissions } = usePermissions();
  const canViewAllUsers = useMemo(() => hasPermission(permissions, 'view_all_users'), [permissions]);
  const canViewUsersInMyCompany = useMemo(
    () => hasPermission(permissions, 'view_all_users_in_my_company'),
    [permissions]
  );

  const canCreate = useMemo(
    () => hasPermission(permissions, 'create_new_user_for_my_company') || hasPermission(permissions, 'create_new_user'),
    [permissions]
  );
  const canEdit = useMemo(
    () =>
      hasPermission(permissions, 'update_user') ||
      hasPermission(permissions, 'update_user_from_my_company') ||
      hasPermission(permissions, 'edit_user') ||
      hasPermission(permissions, 'create_new_user_for_my_company') ||
      hasPermission(permissions, 'create_new_user'),
    [permissions]
  );

  // ── Catálogos ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [roleCounts, setRoleCounts] = useState({}); // { [role_name]: number | null }
  const [roleCountsLoading, setRoleCountsLoading] = useState(false);

  const [myCompanyId, setMyCompanyId] = useState(null);
  const [myCompanyLoading, setMyCompanyLoading] = useState(false);
  const [myCompanyError, setMyCompanyError] = useState('');

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [activeCount, setActiveCount] = useState(null);
  const [inactiveCount, setInactiveCount] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [activeFilter, setActiveFilter] = useState('true');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const selectedCompanyName = useMemo(() => {
    if (!selectedCompanyId) return '';
    const c = companies.find((x) => String(x.company_id) === String(selectedCompanyId));
    return c?.name ? String(c.name) : '';
  }, [companies, selectedCompanyId]);

  // ── Lista ─────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const requestIdRef = useRef(0);
  const retryRef = useRef(0);

  // ── Panel derecho: modo ── 'view' | 'edit' | 'create' ────────────────────
  const [panelMode, setPanelMode] = useState('view'); // 'view' | 'edit' | 'create'
  const [selectedUser, setSelectedUser] = useState(null);

  // ── Edición ───────────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── Creación ──────────────────────────────────────────────────────────────
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Cargar catálogos y conteos ────────────────────────────────────────────
  useEffect(() => {
    setLoadingOptions(true);
    Promise.all([
      supabase.from('roles').select('id, role_name').order('role_name'),
      supabase.from('companies').select('company_id, name').order('name'),
    ])
      .then(([{ data: rolesData }, { data: companiesData }]) => {
        setRoles(Array.isArray(rolesData) ? rolesData.filter(Boolean) : []);
        setCompanies(Array.isArray(companiesData) ? companiesData.filter(Boolean) : []);
      })
      .catch(() => {
        setRoles([]);
        setCompanies([]);
      })
      .finally(() => setLoadingOptions(false));

    (async () => {
      try {
        const [actJson, inactJson] = await Promise.all([
          callEdgeFunction('list-users', { method: 'GET', query: { limit: 1, is_active: 'true' } }),
          callEdgeFunction('list-users', { method: 'GET', query: { limit: 1, is_active: 'false' } }),
        ]);
        setActiveCount(typeof actJson.total === 'number' ? actJson.total : null);
        setInactiveCount(typeof inactJson.total === 'number' ? inactJson.total : null);
      } catch {
        // not critical
      }
    })();
  }, []);

  // ── Conteos por rol (estilo workflowOS/UserRolesNav) ─────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadRoleCounts = async () => {
      if (!Array.isArray(roles) || roles.length === 0) {
        setRoleCounts({});
        return;
      }
      setRoleCountsLoading(true);
      try {
        const results = await Promise.all(
          roles.map(async (r) => {
            try {
              const json = await callEdgeFunction('list-users', {
                method: 'GET',
                query: {
                  limit: 1,
                  is_active: 'true',
                  role: r.role_name,
                  company: selectedCompanyName || undefined,
                },
              });
              return { role_name: r.role_name, total: typeof json.total === 'number' ? json.total : null };
            } catch {
              return { role_name: r.role_name, total: null };
            }
          })
        );

        if (cancelled) return;
        const next = {};
        results.forEach((x) => {
          if (x?.role_name) next[String(x.role_name)] = x.total;
        });
        setRoleCounts(next);
      } finally {
        if (!cancelled) setRoleCountsLoading(false);
      }
    };

    loadRoleCounts();
    return () => {
      cancelled = true;
    };
  }, [roles, selectedCompanyName]);

  // ── Resolver empresa del usuario actual (para restringir selector) ───────
  useEffect(() => {
    let mounted = true;
    const loadMyCompany = async () => {
      if (canViewAllUsers) {
        if (mounted) {
          setMyCompanyId(null);
          setMyCompanyError('');
          setMyCompanyLoading(false);
        }
        return;
      }
      if (!canViewUsersInMyCompany) return;

      setMyCompanyLoading(true);
      setMyCompanyError('');
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const authId = sessionRes?.session?.user?.id;
        if (!authId) throw new Error('No hay sesión activa');

        const { data: appUser, error } = await supabase
          .from('app_users')
          .select('company_id')
          .eq('auth_id', authId)
          .maybeSingle();

        if (error) throw error;

        if (mounted) {
          setMyCompanyId(appUser?.company_id ?? null);
        }
      } catch {
        if (mounted) {
          setMyCompanyId(null);
          setMyCompanyError('No se pudo determinar tu empresa');
        }
      } finally {
        if (mounted) setMyCompanyLoading(false);
      }
    };

    loadMyCompany();
    return () => {
      mounted = false;
    };
  }, [canViewAllUsers, canViewUsersInMyCompany]);

  const visibleCompanies = useMemo(() => {
    if (canViewAllUsers) return companies;
    if (canViewUsersInMyCompany) {
      if (myCompanyId == null) return [];
      return companies.filter((c) => String(c.company_id) === String(myCompanyId));
    }
    return companies;
  }, [companies, canViewAllUsers, canViewUsersInMyCompany, myCompanyId]);

  // Autoselección / saneo del filtro de empresa
  useEffect(() => {
    if (canViewAllUsers) return;
    if (!canViewUsersInMyCompany) return;

    // Si solo hay una empresa visible, se autoselecciona
    if (!selectedCompanyId && visibleCompanies.length === 1) {
      const only = visibleCompanies[0];
      if (only?.company_id != null) setSelectedCompanyId(String(only.company_id));
      return;
    }

    // Si la selección actual ya no existe en el set visible, se limpia
    if (selectedCompanyId) {
      const exists = visibleCompanies.some((c) => String(c.company_id) === String(selectedCompanyId));
      if (!exists) setSelectedCompanyId('');
    }
  }, [canViewAllUsers, canViewUsersInMyCompany, visibleCompanies, selectedCompanyId]);

  // ── Fetch página ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (pageToLoad = 0, append = false) => {
      if (pageToLoad === 0) setListError('');
      setLoading(true);
      const myReq = ++requestIdRef.current;
      let scheduledRetry = false;
      try {
        const pageSize = 30;
        const json = await callEdgeFunction('list-users', {
          method: 'GET',
          query: {
            offset: pageToLoad * pageSize,
            limit: pageSize,
            search: search || undefined,
            role: selectedRole || undefined,
            company: selectedCompanyName || undefined,
            is_active: activeFilter || undefined,
          },
        });
        if (myReq !== requestIdRef.current) return;
        const list = Array.isArray(json.users) ? json.users : [];
        setUsers((prev) => (append ? [...prev, ...list] : list));
        setTotal(typeof json.total === 'number' ? json.total : list.length);
        setHasMore(!!json.has_more);
        setPage(pageToLoad);
        retryRef.current = 0;
      } catch (e) {
        if (myReq !== requestIdRef.current) return;
        if (e?.message === 'Sesión no válida' && retryRef.current < 3) {
          retryRef.current += 1;
          scheduledRetry = true;
          setTimeout(() => fetchPage(pageToLoad, append), 600);
          return;
        }
        if (e?.message === 'Tiempo de espera agotado') {
          setListError('Tiempo de espera agotado');
        } else if (String(e?.message || '').trim() !== '{') {
          setListError(e?.message || 'No se pudieron cargar los usuarios');
        }
        setHasMore(false);
      } finally {
        if (!scheduledRetry && myReq === requestIdRef.current) setLoading(false);
      }
    },
    [search, selectedRole, selectedCompanyName, activeFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const delay = search ? 450 : 0;
    const t = setTimeout(() => {
      setUsers([]);
      setHasMore(false);
      setPage(0);
      retryRef.current = 0;
      fetchPage(0, false);
    }, delay);
    return () => clearTimeout(t);
  }, [search, selectedRole, selectedCompanyId, activeFilter, fetchPage]);

  // ── Panel: acciones ───────────────────────────────────────────────────────
  const selectUser = (u) => {
    setSelectedUser(u);
    setPanelMode('view');
    setEditError('');
    setCreateError('');
  };

  const startEdit = () => {
    if (!selectedUser) return;
    const roleFromName = roles.find((r) => r.role_name === selectedUser.role_name);
    const companyFromName = companies.find(
      (c) => String(c.name || '').toLowerCase() === String(selectedUser.company_name || '').toLowerCase()
    );
    setEditForm({
      name: selectedUser.name || '',
      last_name: selectedUser.last_name || '',
      username: selectedUser.username || '',
      personal_id: selectedUser.personal_id || selectedUser.personalId || '',
      email: selectedUser.email || '',
      phone: selectedUser.phone || '',
      company_id:
        selectedUser.company_id != null
          ? String(selectedUser.company_id)
          : selectedUser.companyId != null
            ? String(selectedUser.companyId)
            : companyFromName?.company_id != null
              ? String(companyFromName.company_id)
              : '',
      role_id:
        selectedUser.role_id != null
          ? String(selectedUser.role_id)
          : selectedUser.roleId != null
            ? String(selectedUser.roleId)
            : roleFromName?.id != null
              ? String(roleFromName.id)
              : '',
    });
    setEditError('');
    setPanelMode('edit');
  };

  const cancelEdit = () => {
    setPanelMode(selectedUser ? 'view' : 'view');
    setEditError('');
  };

  const saveEdit = async () => {
    if (!selectedUser || editSaving) return;
    setEditSaving(true);
    setEditError('');
    try {
      const uid = selectedUser.user_id || selectedUser.id;
      await callEdgeFunction('update-user', {
        method: 'POST',
        body: {
          user_id: uid,
          email: editForm.email.trim() || undefined,
          name: editForm.name.trim() || undefined,
          lastName: editForm.last_name.trim() || undefined,
          username: editForm.username.trim() || undefined,
          personalId: editForm.personal_id.trim() || undefined,
          phone: editForm.phone.trim() || undefined,
          companyId: editForm.company_id ? Number(editForm.company_id) : undefined,
          roleId: editForm.role_id ? Number(editForm.role_id) : undefined,
        },
      });

      const companyObj = companies.find((c) => String(c.company_id) === String(editForm.company_id));
      const roleObj = roles.find((r) => String(r.id) === String(editForm.role_id));
      const updated = {
        ...selectedUser,
        name: editForm.name.trim() || selectedUser.name,
        last_name: editForm.last_name.trim() || selectedUser.last_name,
        email: editForm.email.trim() || selectedUser.email,
        phone: editForm.phone.trim() || selectedUser.phone,
        username: editForm.username.trim() || selectedUser.username,
        personal_id: editForm.personal_id.trim() || selectedUser.personal_id,
        company_id: editForm.company_id ? Number(editForm.company_id) : selectedUser.company_id,
        company_name: companyObj?.name || selectedUser.company_name,
        role_id: editForm.role_id ? Number(editForm.role_id) : selectedUser.role_id,
        role_name: roleObj?.role_name || selectedUser.role_name,
      };
      setSelectedUser(updated);
      setUsers((prev) =>
        prev.map((u) => (String(u.user_id || u.id) === String(uid) ? updated : u))
      );
      setPanelMode('view');
    } catch (e) {
      setEditError(friendlyUserSaveError(e, 'No se pudo guardar. Intenta de nuevo.'));
    } finally {
      setEditSaving(false);
    }
  };

  const startCreate = () => {
    setSelectedUser(null);
    setCreateForm(EMPTY_CREATE);
    setCreateError('');
    setPanelMode('create');
  };

  // Autoselección de empresa cuando solo hay una opción visible
  useEffect(() => {
    if (panelMode !== 'create') return;
    if (createForm.company_id) return;
    if (visibleCompanies.length === 1) {
      const only = visibleCompanies[0];
      if (only?.company_id != null) setCreateForm((p) => ({ ...p, company_id: String(only.company_id) }));
    }
  }, [panelMode, visibleCompanies, createForm.company_id]);

  const cancelCreate = () => {
    setPanelMode('view');
    setCreateError('');
  };

  const saveCreate = async () => {
    if (createSaving) return;
    const f = createForm;
    if (!f.name.trim()) { setCreateError('El nombre es obligatorio'); return; }
    if (!f.last_name.trim()) { setCreateError('El apellido es obligatorio'); return; }
    if (!f.email.trim()) { setCreateError('El correo es obligatorio'); return; }
    setCreateSaving(true);
    setCreateError('');
    try {
      await callEdgeFunction('createUser', {
        method: 'POST',
        body: {
          email: f.email.trim(),
          password: randomPass(),
          name: f.name.trim(),
          lastName: f.last_name.trim(),
          username: f.username.trim() || undefined,
          personalId: f.personal_id.trim() || undefined,
          phone: f.phone.trim() || undefined,
          companyId: f.company_id ? Number(f.company_id) : null,
          roleId: f.role_id ? Number(f.role_id) : null,
        },
      });
      setPanelMode('view');
      setCreateForm(EMPTY_CREATE);
      // Refrescar la lista
      setUsers([]);
      setHasMore(false);
      setPage(0);
      retryRef.current = 0;
      fetchPage(0, false);
    } catch (e) {
      setCreateError(friendlyUserSaveError(e, 'No se pudo crear el usuario'));
    } finally {
      setCreateSaving(false);
    }
  };

  const setFilter = (role, active, companyId) => {
    setSelectedRole(role);
    setActiveFilter(active);
    if (companyId !== undefined) setSelectedCompanyId(companyId);
    setSelectedUser(null);
    setPanelMode('view');
  };

  const isFilterActive = (role, active) => selectedRole === role && activeFilter === active;
  const isCompanyActive = (companyId) => String(selectedCompanyId || '') === String(companyId || '');

  // ── Helpers formulario ────────────────────────────────────────────────────
  const setEditField = (k, v) => setEditForm((p) => ({ ...p, [k]: v }));
  const setCreateField = (k, v) => setCreateForm((p) => ({ ...p, [k]: v }));

  // ── Título panel ──────────────────────────────────────────────────────────
  const panelTitle =
    panelMode === 'create' ? 'Nuevo Usuario' :
    panelMode === 'edit' ? 'Editar Usuario' :
    'Detalles del Usuario';

  const panelIcon =
    panelMode === 'create' ? 'fa-user-plus' :
    panelMode === 'edit' ? 'fa-pen-to-square' :
    'fa-user';

  return (
    <div className="usersPage">
      <div className="usersPageHeader">
        <h1 className="usersPageTitle">Administración de Usuarios</h1>
        <div className="usersPageBreadcrumb">
          <span style={{ color: 'var(--color-primary)' }}>Usuarios</span>
          <i className="fa-solid fa-angle-right" aria-hidden="true" style={{ margin: '0 6px', fontSize: 11 }} />
          <span>Administrar Usuarios</span>
        </div>
      </div>

      <div className="usersLayout">
        {/* ── Panel izquierdo: filtros ────────────────────────────────── */}
        <aside className="usersFilterPanel" aria-label="Filtros">
          <div className="usersFilterSection">
            <div className="usersFilterSectionTitle">Roles</div>

            <button
              type="button"
              className={`usersFilterItem ${isFilterActive('', 'true') ? 'usersFilterItemActive' : ''}`}
              onClick={() => setFilter('', 'true')}
            >
              <span>Usuarios Activos</span>
              {activeCount != null && (
                <span className={`usersFilterBadge ${isFilterActive('', 'true') ? 'usersFilterBadgeActive' : 'usersFilterBadgeBlue'}`}>{activeCount}</span>
              )}
            </button>

            {roles.map((r) => (
              <button
                key={r.role_name}
                type="button"
                className={`usersFilterItem ${selectedRole === r.role_name ? 'usersFilterItemActive' : ''}`}
                onClick={() => setFilter(r.role_name, activeFilter === 'false' ? 'false' : 'true')}
              >
                <span>{r.role_name}</span>
                {activeFilter !== 'false' && !roleCountsLoading && roleCounts?.[r.role_name] != null ? (
                  <span className="usersFilterBadge usersFilterBadgeBlue">{roleCounts[r.role_name]}</span>
                ) : null}
              </button>
            ))}

            <button
              type="button"
              className={`usersFilterItem usersFilterItemDanger ${isFilterActive('', 'false') ? 'usersFilterItemDangerActive' : ''}`}
              onClick={() => setFilter('', 'false')}
            >
              <span>Usuarios Inactivos</span>
              {inactiveCount != null && (
                <span className={`usersFilterBadge ${isFilterActive('', 'false') ? 'usersFilterBadgeActive' : 'usersFilterBadgeRed'}`}>{inactiveCount}</span>
              )}
            </button>

            <div className="usersFilterSectionTitle" style={{ marginTop: 16 }}>Empresas</div>

            {canViewAllUsers ? (
              <button
                type="button"
                className={`usersFilterItem ${!selectedCompanyId ? 'usersFilterItemActive' : ''}`}
                onClick={() => setSelectedCompanyId('')}
              >
                <span>Todas las empresas</span>
              </button>
            ) : null}

            {visibleCompanies.map((c) => (
              <button
                key={String(c.company_id)}
                type="button"
                className={`usersFilterItem ${isCompanyActive(String(c.company_id)) ? 'usersFilterItemActive' : ''}`}
                onClick={() => setSelectedCompanyId(String(c.company_id))}
              >
                <span>{c.name}</span>
              </button>
            ))}

            {!loadingOptions && visibleCompanies.length === 0 && canViewUsersInMyCompany && !canViewAllUsers ? (
              <div className="usersListEmpty" style={{ padding: '8px 0' }}>
                {myCompanyError || 'No hay empresas disponibles'}
              </div>
            ) : null}
          </div>
        </aside>

        {/* ── Panel central: lista ──────────────────────────────────── */}
        <section className="usersListPanel" aria-label="Lista de usuarios">
          <div className="usersListSearch">
            <i className="fa-solid fa-magnifying-glass usersListSearchIcon" aria-hidden="true" />
            <input
              className="usersListSearchInput"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuarios"
              autoCorrect="off"
            />
            {canCreate && (
              <button
                type="button"
                className="btn btnPrimary"
                style={{ whiteSpace: 'nowrap', fontSize: 13 }}
                onClick={startCreate}
              >
                + Nuevo
              </button>
            )}
          </div>

          {listError && <div className="usersListError">{listError}</div>}

          <div className="usersListScroll">
            {loading && users.length === 0 ? (
              <div className="usersListEmpty">Cargando…</div>
            ) : !loading && users.length === 0 ? (
              <div className="usersListEmpty">No hay usuarios para mostrar.</div>
            ) : (
              users.map((u, idx) => {
                const uid = String(u.user_id || u.id || idx);
                const isSelected = selectedUser && String(selectedUser.user_id || selectedUser.id) === uid;
                return (
                  <button
                    key={uid}
                    type="button"
                    className={`usersListItem ${isSelected ? 'usersListItemSelected' : ''}`}
                    onClick={() => { if (!isSelected) selectUser(u); }}
                  >
                    <span className="usersListAvatar" style={{ background: avatarColor(u) }} aria-hidden="true">
                      {getInitials(u)}
                    </span>
                    <span className="usersListItemBody">
                      <span className="usersListItemName">{getFullName(u)}</span>
                      {u.email && <span className="usersListItemEmail">{u.email}</span>}
                      {(u.role_name || u.company_name) && (
                        <span className="usersListItemBadges">
                          {u.role_name && <span className="uiBadge uiBadgeGreen">{u.role_name}</span>}
                          {u.company_name && <span className="uiBadge uiBadgeBlue">{u.company_name}</span>}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}

            {hasMore && (
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
            )}
            {loading && users.length > 0 && (
              <div className="usersListEmpty" style={{ padding: 12 }}>Cargando…</div>
            )}
          </div>
        </section>

        {/* ── Panel derecho ─────────────────────────────────────────── */}
        <aside className="usersDetailPanel" aria-label="Detalle del usuario">
          {/* Cabecera del panel */}
          <div className="usersDetailHeader">
            <span className="usersDetailHeaderTitle">
              <i className={`fa-regular ${panelIcon}`} aria-hidden="true" style={{ marginRight: 8 }} />
              {panelTitle}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {panelMode === 'view' && selectedUser && canEdit && (
                <button type="button" className="usersDetailEditLink" onClick={startEdit}>
                  <i className="fa-regular fa-pen-to-square" aria-hidden="true" style={{ marginRight: 4 }} />
                  Editar
                </button>
              )}
              {(panelMode === 'edit' || panelMode === 'create') && (
                <button type="button" className="usersDetailEditLink" style={{ color: 'var(--color-muted)' }}
                  onClick={panelMode === 'edit' ? cancelEdit : cancelCreate}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" style={{ marginRight: 4 }} />
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* ── Vista lectura ── */}
          {panelMode === 'view' && selectedUser && (
            <div className="usersDetailBody">
              <div className="usersDetailField">
                <div className="usersDetailLabel">Nombre <span className="usersDetailRequired">*</span></div>
                <div className="usersDetailValue">{getFullName(selectedUser)}</div>
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Correo Corporativo <span className="usersDetailRequired">*</span></div>
                <div className="usersDetailValue">{selectedUser.email || '—'}</div>
              </div>
              {selectedUser.phone && (
                <div className="usersDetailField">
                  <div className="usersDetailLabel">Teléfono</div>
                  <div className="usersDetailValue">{selectedUser.phone}</div>
                </div>
              )}
              {selectedUser.username && (
                <div className="usersDetailField">
                  <div className="usersDetailLabel">ID Personal</div>
                  <div className="usersDetailValue">{selectedUser.username}</div>
                </div>
              )}
              <div className="usersDetailField">
                <div className="usersDetailLabel">Estado</div>
                <div className="usersDetailValueRow">
                  <span
                    className={`usersDetailToggle ${selectedUser.is_active !== false && selectedUser.is_active !== 'false' ? 'usersDetailToggleOn' : ''}`}
                    role="img"
                    aria-label={selectedUser.is_active !== false && selectedUser.is_active !== 'false' ? 'Activo' : 'Inactivo'}
                  />
                  <span style={{ fontSize: 13 }}>
                    {selectedUser.is_active !== false && selectedUser.is_active !== 'false' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
              {selectedUser.role_name && (
                <div className="usersDetailSection">
                  <div className="usersDetailSectionTitle">Asignación de Roles</div>
                  <div className="usersDetailLabel" style={{ marginBottom: 8 }}>Roles Asignados:</div>
                  <div className="usersDetailBadges">
                    <span className="uiBadge uiBadgeGreen">{selectedUser.role_name}</span>
                  </div>
                </div>
              )}
              {selectedUser.company_name && (
                <div className="usersDetailSection">
                  <div className="usersDetailSectionTitle">Empresa</div>
                  <div className="usersDetailBadges">
                    <span className="uiBadge uiBadgeBlue">{selectedUser.company_name}</span>
                  </div>
                </div>
              )}
              {canEdit && (
                <div className="usersDetailFooter">
                  <button type="button" className="btn btnPrimary" onClick={startEdit}>
                    Editar Usuario
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Vista edición ── */}
          {panelMode === 'edit' && selectedUser && (
            <div className="usersDetailBody">
              <div className="usersDetailField">
                <div className="usersDetailLabel">Nombre <span className="usersDetailRequired">*</span></div>
                <input className="usersDetailInput" value={editForm.name} onChange={(e) => setEditField('name', e.target.value)} placeholder="Nombre" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Apellido <span className="usersDetailRequired">*</span></div>
                <input className="usersDetailInput" value={editForm.last_name} onChange={(e) => setEditField('last_name', e.target.value)} placeholder="Apellido" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Correo <span className="usersDetailRequired">*</span></div>
                <input className="usersDetailInput" type="email" value={editForm.email} onChange={(e) => setEditField('email', e.target.value)} placeholder="correo@empresa.com" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Teléfono</div>
                <input className="usersDetailInput" value={editForm.phone} onChange={(e) => setEditField('phone', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Teléfono" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Username</div>
                <input className="usersDetailInput" value={editForm.username} onChange={(e) => setEditField('username', e.target.value)} placeholder="Username" autoCapitalize="none" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">NIT / Cédula</div>
                <input className="usersDetailInput" value={editForm.personal_id} onChange={(e) => setEditField('personal_id', e.target.value)} placeholder="NIT / Cédula" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Empresa</div>
                <select
                  className="usersDetailSelect"
                  value={editForm.company_id}
                  onChange={(e) => setEditField('company_id', e.target.value)}
                  disabled={loadingOptions || myCompanyLoading || (visibleCompanies.length === 1 && !canViewAllUsers)}
                >
                  <option value="">
                    {loadingOptions || myCompanyLoading
                      ? 'Cargando…'
                      : myCompanyError && canViewUsersInMyCompany && !canViewAllUsers
                        ? myCompanyError
                        : 'Selecciona empresa'}
                  </option>
                  {visibleCompanies.map((c) => (
                    <option key={String(c.company_id)} value={String(c.company_id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Rol</div>
                <select
                  className="usersDetailSelect"
                  value={editForm.role_id}
                  onChange={(e) => setEditField('role_id', e.target.value)}
                  disabled={loadingOptions}
                >
                  <option value="">{loadingOptions ? 'Cargando…' : 'Selecciona rol'}</option>
                  {roles.map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {r.role_name}
                    </option>
                  ))}
                </select>
              </div>
              {editError && <div className="usersDetailSaveError">{editError}</div>}
              <div className="usersDetailEditActions">
                <button type="button" className="usersDetailCancelBtn" onClick={cancelEdit} disabled={editSaving}>Cancelar</button>
                <button type="button" className="btn btnPrimary" onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          )}

          {/* ── Vista crear ── */}
          {panelMode === 'create' && (
            <div className="usersDetailBody">
              <div className="usersDetailField">
                <div className="usersDetailLabel">Nombre <span className="usersDetailRequired">*</span></div>
                <input className="usersDetailInput" value={createForm.name} onChange={(e) => setCreateField('name', e.target.value)} placeholder="Nombre" autoComplete="off" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Apellido <span className="usersDetailRequired">*</span></div>
                <input className="usersDetailInput" value={createForm.last_name} onChange={(e) => setCreateField('last_name', e.target.value)} placeholder="Apellido" autoComplete="off" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Correo <span className="usersDetailRequired">*</span></div>
                <input className="usersDetailInput" type="email" value={createForm.email} onChange={(e) => setCreateField('email', e.target.value)} placeholder="correo@empresa.com" autoComplete="off" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Teléfono</div>
                <input className="usersDetailInput" value={createForm.phone} onChange={(e) => setCreateField('phone', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Teléfono" autoComplete="off" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Username</div>
                <input className="usersDetailInput" value={createForm.username} onChange={(e) => setCreateField('username', e.target.value)} placeholder="Username" autoCapitalize="none" autoComplete="off" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">NIT / Cédula</div>
                <input className="usersDetailInput" value={createForm.personal_id} onChange={(e) => setCreateField('personal_id', e.target.value)} placeholder="NIT / Cédula" autoComplete="off" />
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Empresa</div>
                <select
                  className="usersDetailSelect"
                  value={createForm.company_id}
                  onChange={(e) => setCreateField('company_id', e.target.value)}
                  disabled={loadingOptions || myCompanyLoading || (visibleCompanies.length === 1 && !canViewAllUsers)}
                >
                  <option value="">
                    {loadingOptions || myCompanyLoading
                      ? 'Cargando…'
                      : myCompanyError && canViewUsersInMyCompany && !canViewAllUsers
                        ? myCompanyError
                        : 'Selecciona empresa'}
                  </option>
                  {visibleCompanies.map((c) => (
                    <option key={String(c.company_id)} value={String(c.company_id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="usersDetailField">
                <div className="usersDetailLabel">Rol</div>
                <select className="usersDetailSelect" value={createForm.role_id} onChange={(e) => setCreateField('role_id', e.target.value)} disabled={loadingOptions}>
                  <option value="">{loadingOptions ? 'Cargando…' : 'Selecciona rol'}</option>
                  {roles.map((r) => <option key={String(r.id)} value={String(r.id)}>{r.role_name}</option>)}
                </select>
              </div>
              {createError && <div className="usersDetailSaveError">{createError}</div>}
              <div className="usersDetailEditActions">
                <button type="button" className="usersDetailCancelBtn" onClick={cancelCreate} disabled={createSaving}>Cancelar</button>
                <button type="button" className="btn btnPrimary" onClick={saveCreate} disabled={createSaving || loadingOptions}>
                  {createSaving ? 'Creando…' : 'Crear Usuario'}
                </button>
              </div>
            </div>
          )}

          {/* ── Sin selección ── */}
          {panelMode === 'view' && !selectedUser && (
            <div className="usersDetailEmpty">
              <i className="fa-regular fa-user usersDetailEmptyIcon" aria-hidden="true" />
              <div className="usersDetailEmptyText">Selecciona un usuario para ver sus detalles</div>

              {canCreate ? (
                <div style={{ marginTop: 12, width: '100%', textAlign: 'center'  }}>
                  <button type="button" className="btn btnPrimary" style={{ width: '50%'}} onClick={startCreate}>
                    + Nuevo Usuario
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
