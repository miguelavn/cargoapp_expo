import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import logoCargo from '../assets/logoCargo.png';
import { usePermissions } from '../state/PermissionsContext.jsx';
import { hasPermission } from '../lib/permissions.js';

export default function PrincipalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPermissions } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [sidebarHover, setSidebarHover] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userPermissions, setUserPermissions] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuView, setUserMenuView] = useState('root');
  const userMenuRef = useRef(null);
  const [expanded, setExpanded] = useState({ orders: true, projects: false, users: false, services: false });

  const canSeeOrders = useMemo(() => {
    return (
      hasPermission(userPermissions, 'view_all_orders') ||
      hasPermission(userPermissions, 'view_all_orders_from_my_company')
    );
  }, [userPermissions]);

  const canSeeProjects = useMemo(() => {
    return (
      hasPermission(userPermissions, 'view_all_projects') ||
      hasPermission(userPermissions, 'view_all_projects_from_my_company') ||
      hasPermission(userPermissions, 'create_new_project') ||
      hasPermission(userPermissions, 'create_new_project_for_my_company')
    );
  }, [userPermissions]);

  const canSeeUsers = useMemo(() => {
    return (
      hasPermission(userPermissions, 'view_all_users') ||
      hasPermission(userPermissions, 'view_all_users_in_my_company') ||
      hasPermission(userPermissions, 'create_new_user') ||
      hasPermission(userPermissions, 'create_new_user_for_my_company') ||
      hasPermission(userPermissions, 'update_user') ||
      hasPermission(userPermissions, 'update_user_from_my_company') ||
      hasPermission(userPermissions, 'edit_user')
    );
  }, [userPermissions]);

  const canSeeServices = useMemo(() => {
    return (
      hasPermission(userPermissions, 'manage_all_services_for_my_company') ||
      hasPermission(userPermissions, 'create_new_service_for_my_company')
    );
  }, [userPermissions]);

  const canSeeVehicle = useMemo(() => {
    const r = String(userRole || '').toLowerCase();
    return r.includes('conductor') || r.includes('driver');
  }, [userRole]);

  const canCreateUsers = useMemo(() => {
    return (
      hasPermission(userPermissions, 'create_new_user') ||
      hasPermission(userPermissions, 'create_new_user_for_my_company')
    );
  }, [userPermissions]);

  const canCreateProjects = useMemo(() => {
    return (
      hasPermission(userPermissions, 'create_new_project') ||
      hasPermission(userPermissions, 'create_new_project_for_my_company')
    );
  }, [userPermissions]);

  const canCreateServices = useMemo(() => {
    return (
      hasPermission(userPermissions, 'create_new_service_for_my_company') ||
      hasPermission(userPermissions, 'manage_all_services_for_my_company')
    );
  }, [userPermissions]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('app_sidebar_minimize');
      setSidebarMinimized(raw === '1');
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const syncExpanded = () => {
      const path = location.pathname || '/';
      setExpanded((prev) => {
        const next = { ...prev };
        if (path.startsWith('/orders')) next.orders = true;
        if (path.startsWith('/projects')) next.projects = true;
        if (path.startsWith('/users')) next.users = true;
        if (path.startsWith('/services')) next.services = true;
        return next;
      });
    };
    syncExpanded();
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) throw new Error('No se encontró usuario');

        const { data: row, error } = await supabase
          .from('user_active_role_permissions')
          .select('display_name, role_name, permissions, permissions_full')
          .eq('auth_id', user.id)
          .maybeSingle();

        if (error) throw error;

        const name =
          row?.display_name ||
          user?.user_metadata?.display_name ||
          user?.user_metadata?.full_name ||
          user?.email ||
          '';
        const role = row?.role_name || '';

        let perms = [];
        if (Array.isArray(row?.permissions_full) && row.permissions_full.length > 0) {
          perms = row.permissions_full
            .map((p) => p?.permission_name)
            .filter(Boolean)
            .map(String);
        } else if (Array.isArray(row?.permissions)) {
          perms = row.permissions.filter(Boolean).map(String);
        }

        if (mounted) {
          setUserName(String(name || ''));
          setUserEmail(String(user?.email || ''));
          setUserRole(String(role || ''));
          setUserPermissions(perms);
          setPermissions(perms.map((permission_name, idx) => ({ id: idx, permission_name, description: '' })));
        }
      } catch {
        if (mounted) {
          setUserName('');
          setUserEmail('');
          setUserRole('');
          setUserPermissions([]);
          setPermissions([]);
        }
      }
    };

    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };

    const onPointerDown = (e) => {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(e.target)) return;
      setUserMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  useEffect(() => {
    setUserMenuOpen(false);
    setUserMenuView('root');
  }, [location.pathname]);

  const title = useMemo(() => {
    const path = location.pathname || '/';
    if (path === '/') return 'Bienvenido';
    if (path === '/orders') return 'Órdenes';
    if (path === '/orders/new') return 'Registrar orden';
    if (path === '/projects') return 'Proyectos';
    if (path === '/projects/new') return 'Registrar proyecto';
    if (path === '/users') return 'Usuarios';
    if (path === '/services') return 'Servicios';
    if (path === '/services/new') return 'Registrar servicio';
    if (path === '/vehicle') return 'Vehículo';
    if (path === '/account') return 'Cuenta';
    return 'CargoApp';
  }, [location.pathname]);

  const breadcrumb = useMemo(() => {
    const path = location.pathname || '/';
    if (path === '/') return 'Home';
    if (path.startsWith('/orders')) return 'Home • Órdenes';
    if (path.startsWith('/projects')) return 'Home • Proyectos';
    if (path.startsWith('/users')) return 'Home • Usuarios';
    if (path.startsWith('/services')) return 'Home • Servicios';
    if (path.startsWith('/vehicle')) return 'Home • Vehículo';
    if (path.startsWith('/account')) return 'Home • Cuenta';
    return 'Home';
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  const toggleGroup = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleMinimize = () => {
    setSidebarMinimized((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('app_sidebar_minimize', next ? '1' : '0');
      } catch {
        // noop
      }
      if (next) {
        setSidebarHover(false);
      }
      return next;
    });
  };

  const isDesktopMinimized = sidebarMinimized && !sidebarHover;

  return (
    <div className={`appShell ${sidebarMinimized ? 'appShellMin' : ''} ${sidebarMinimized && sidebarHover ? 'appShellHover' : ''}`}>
      <aside
        className={`appSidebar ${sidebarOpen ? 'appSidebarOpen' : ''} ${sidebarMinimized ? 'appSidebarMin' : ''} ${sidebarMinimized && sidebarHover ? 'appSidebarHover' : ''}`}
        aria-label="Menú lateral"
        onMouseEnter={() => {
          if (sidebarMinimized) setSidebarHover(true);
        }}
        onMouseLeave={() => {
          if (sidebarMinimized) setSidebarHover(false);
        }}
      >
        <div className="appSidebarTop">
          <Link to="/" className="appBrand" onClick={closeSidebar} style={{ textDecoration: 'none' }}>
            <img className="appBrandLogo" src={logoCargo} alt="CargoApp" />
            <span className="appBrandText">CargoApp</span>
          </Link>
          <button type="button" className="iconBtn appSidebarClose" onClick={closeSidebar} aria-label="Cerrar menú">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className={`appUserCard ${isDesktopMinimized ? 'appUserCardMin' : ''}`} aria-label="Usuario">
          <div className="appUserAvatar" aria-hidden="true">
            {(userName || 'U').slice(0, 1).toUpperCase()}
          </div>
          {!isDesktopMinimized ? (
            <div className="appUserMeta">
              <div className="appUserName">{userName || 'Usuario'}</div>
              <div className="appUserSub">{userRole || '—'}</div>
            </div>
          ) : null}
        </div>

        <div className="appSectionLabel">MÓDULOS</div>

        <nav className="appNav" aria-label="Navegación">
          <NavLink to="/" end onClick={closeSidebar} className={({ isActive }) => `appNavItem ${isActive ? 'appNavItemActive' : ''}`} style={{ textDecoration: 'none' }}>
            <i className="fa-solid fa-house appNavIcon" aria-hidden="true" />
            <span className="appNavLabel">Home</span>
          </NavLink>

          {canSeeOrders ? (
            <div className="appNavGroup">
              <button type="button" className="appNavGroupBtn" onClick={() => toggleGroup('orders')} aria-expanded={expanded.orders}>
                <span className="appNavGroupLeft">
                  <i className="fa-solid fa-clipboard-list appNavIcon" aria-hidden="true" />
                  <span className="appNavLabel">Órdenes de Servicio</span>
                </span>
                {!isDesktopMinimized ? (
                  <i className={`fa-solid ${expanded.orders ? 'fa-chevron-down' : 'fa-chevron-right'} appNavChevron`} aria-hidden="true" />
                ) : null}
              </button>
              {expanded.orders && !isDesktopMinimized ? (
                <div className="appNavSub">
                  <NavLink
                    to="/orders"
                    end
                    onClick={closeSidebar}
                    className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="appNavLabel">Listado</span>
                  </NavLink>
                  <NavLink
                    to="/orders/new"
                    onClick={closeSidebar}
                    className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="appNavLabel">Registrar</span>
                  </NavLink>
                </div>
              ) : null}
            </div>
          ) : null}

          {canSeeProjects ? (
            <div className="appNavGroup">
              <button type="button" className="appNavGroupBtn" onClick={() => toggleGroup('projects')} aria-expanded={expanded.projects}>
                <span className="appNavGroupLeft">
                  <i className="fa-solid fa-folder-tree appNavIcon" aria-hidden="true" />
                  <span className="appNavLabel">Proyectos</span>
                </span>
                {!isDesktopMinimized ? (
                  <i className={`fa-solid ${expanded.projects ? 'fa-chevron-down' : 'fa-chevron-right'} appNavChevron`} aria-hidden="true" />
                ) : null}
              </button>
              {expanded.projects && !isDesktopMinimized ? (
                <div className="appNavSub">
                  <NavLink
                    to="/projects"
                    end
                    onClick={closeSidebar}
                    className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="appNavLabel">Listado</span>
                  </NavLink>
                  {canCreateProjects ? (
                    <NavLink
                      to="/projects/new"
                      onClick={closeSidebar}
                      className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="appNavLabel">Registrar</span>
                    </NavLink>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {canSeeUsers ? (
            <div className="appNavGroup">
              <button type="button" className="appNavGroupBtn" onClick={() => toggleGroup('users')} aria-expanded={expanded.users}>
                <span className="appNavGroupLeft">
                  <i className="fa-solid fa-users appNavIcon" aria-hidden="true" />
                  <span className="appNavLabel">Usuarios</span>
                </span>
                {!isDesktopMinimized ? (
                  <i className={`fa-solid ${expanded.users ? 'fa-chevron-down' : 'fa-chevron-right'} appNavChevron`} aria-hidden="true" />
                ) : null}
              </button>
              {expanded.users && !isDesktopMinimized ? (
                <div className="appNavSub">
                  <NavLink
                    to="/users"
                    end
                    onClick={closeSidebar}
                    className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="appNavLabel">Administrar usuarios</span>
                  </NavLink>
                </div>
              ) : null}
            </div>
          ) : null}

          {canSeeServices ? (
            <div className="appNavGroup">
              <button type="button" className="appNavGroupBtn" onClick={() => toggleGroup('services')} aria-expanded={expanded.services}>
                <span className="appNavGroupLeft">
                  <i className="fa-solid fa-screwdriver-wrench appNavIcon" aria-hidden="true" />
                  <span className="appNavLabel">Servicios</span>
                </span>
                {!isDesktopMinimized ? (
                  <i className={`fa-solid ${expanded.services ? 'fa-chevron-down' : 'fa-chevron-right'} appNavChevron`} aria-hidden="true" />
                ) : null}
              </button>
              {expanded.services && !isDesktopMinimized ? (
                <div className="appNavSub">
                  <NavLink
                    to="/services"
                    end
                    onClick={closeSidebar}
                    className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <span className="appNavLabel">Listado</span>
                  </NavLink>
                  {canCreateServices ? (
                    <NavLink
                      to="/services/new"
                      onClick={closeSidebar}
                      className={({ isActive }) => `appNavSubItem ${isActive ? 'appNavSubItemActive' : ''}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="appNavLabel">Registrar</span>
                    </NavLink>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {canSeeVehicle ? (
            <NavLink to="/vehicle" onClick={closeSidebar} className={({ isActive }) => `appNavItem ${isActive ? 'appNavItemActive' : ''}`} style={{ textDecoration: 'none' }}>
              <i className="fa-solid fa-truck appNavIcon" aria-hidden="true" />
              <span className="appNavLabel">Vehículo</span>
            </NavLink>
          ) : null}
        </nav>

        <div className="appSidebarBottom">
          <div className="appSectionLabel">GENERAL</div>
          <NavLink
            to="/account"
            onClick={closeSidebar}
            className={({ isActive }) => `appNavItem ${isActive ? 'appNavItemActive' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <i className="fa-solid fa-user appNavIcon" aria-hidden="true" />
            <span className="appNavLabel">Cuenta</span>
          </NavLink>
          <button type="button" className="appNavItem appNavItemButton" onClick={signOut}>
            <i className="fa-solid fa-right-from-bracket appNavIcon" aria-hidden="true" />
            <span className="appNavLabel">Salir</span>
          </button>
        </div>

        <button
          type="button"
          className="appSidebarToggle"
          onClick={toggleMinimize}
          aria-label={sidebarMinimized ? 'Expandir sidebar' : 'Minimizar sidebar'}
          aria-pressed={sidebarMinimized}
        >
          <i className={`fa-solid ${sidebarMinimized ? 'fa-angle-right' : 'fa-angle-left'}`} aria-hidden="true" />
        </button>
      </aside>

      {sidebarOpen ? <div className="appSidebarOverlay" role="presentation" onClick={closeSidebar} /> : null}

      <div className="appMain">
        <header className="appHeader" role="banner">
          <div className="appHeaderInner">
            <button
              type="button"
              className="iconBtn appBurger"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={sidebarOpen}
            >
              <i className="fa-solid fa-bars" aria-hidden="true" />
            </button>
            <div className="appHeaderTitles">
              <div className="appHeaderTitle" aria-label="Sección actual">
                {title}
              </div>
              <div className="appHeaderBreadcrumb" aria-label="Ruta">
                {breadcrumb}
              </div>
            </div>

            <div className="appHeaderRight">
              <button type="button" className="iconBtn" aria-label="Notificaciones">
                <i className="fa-regular fa-bell" aria-hidden="true" />
              </button>

              <div className="appUserMenuWrap" ref={userMenuRef}>
                <button
                  type="button"
                  className="iconBtn appUserMenuBtn"
                  onClick={() => {
                    setUserMenuOpen((v) => {
                      const next = !v;
                      if (next) setUserMenuView('root');
                      return next;
                    });
                  }}
                  aria-label="Abrir menú de usuario"
                  aria-expanded={userMenuOpen}
                >
                  <span className="appUserMenuBtnAvatar" aria-hidden="true">
                    {(userName || 'U').slice(0, 1).toUpperCase()}
                  </span>
                </button>

                {userMenuOpen ? (
                  <div className="appUserMenu" role="menu" aria-label="Menú de usuario">
                    {userMenuView === 'root' ? (
                      <>
                        <div className="appUserMenuTop">
                          <div className="appUserMenuAvatar" aria-hidden="true">
                            {(userName || 'U').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="appUserMenuMeta">
                            <div className="appUserMenuNameRow">
                              <div className="appUserMenuName">{userName || 'Usuario'}</div>
                              {userRole ? <span className="appUserRoleBadge">{userRole}</span> : null}
                            </div>
                            <div className="appUserMenuEmail">{userEmail || ''}</div>
                          </div>
                        </div>

                        <div className="appUserMenuDivider" role="presentation" />

                        <div className="appUserMenuList" role="presentation">
                          <button
                            type="button"
                            className="appUserMenuItem"
                            onClick={() => setUserMenuView('permissions')}
                          >
                            <span className="appUserMenuItemText">Mis permisos</span>
                            <i className="fa-solid fa-chevron-right appUserMenuItemIcon" aria-hidden="true" />
                          </button>
                        </div>

                        <div className="appUserMenuDivider" role="presentation" />

                        <div className="appUserMenuList" role="presentation">
                          <button type="button" className="appUserMenuItem" onClick={() => {}}>
                            <span className="appUserMenuItemText">Modo</span>
                            <i className="fa-regular fa-sun appUserMenuItemIcon" aria-hidden="true" />
                          </button>
                          <button type="button" className="appUserMenuItem" onClick={signOut}>
                            <span className="appUserMenuItemText">Cerrar sesión</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="appUserMenuSubTop">
                          <button type="button" className="appUserMenuBack" onClick={() => setUserMenuView('root')} aria-label="Volver">
                            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                          </button>
                          <div className="appUserMenuSubTitle">Mis permisos</div>
                        </div>

                        <div className="appPermList" role="presentation">
                          {userPermissions.length === 0 ? (
                            <div className="appPermEmpty">Sin permisos cargados</div>
                          ) : (
                            <ul className="appPermUl">
                              {userPermissions.map((p) => (
                                <li key={p} className="appPermLi">
                                  {p}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="appOutlet">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
