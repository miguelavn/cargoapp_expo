import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { usePermissions } from '../state/PermissionsContext.jsx';
import CoordinatorMain from './roles/CoordinatorMain.jsx';
import DriverMain from './roles/DriverMain.jsx';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleName, setRoleName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const noRoleHandled = useRef(false);
  const { permissions, setPermissions } = usePermissions();

  useEffect(() => {
    const fetchFromView = async () => {
      setLoading(true);
      setError('');

      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!user) throw new Error('No se encontró usuario logueado');

        const { data: row, error: viewError } = await supabase
          .from('user_active_role_permissions')
          .select('*')
          .eq('auth_id', user.id)
          .maybeSingle();

        if (viewError) throw viewError;
        if (!row) throw new Error('No se encontró un rol activo asignado a tu usuario.');

        setDisplayName(row.display_name || user.email || 'Usuario');
        setRoleName(row.role_name || '');

        if (row.role_name && !String(row.role_name).toLowerCase().includes('administrador global')) {
          setCompanyName(row.company_name || '');
        } else {
          setCompanyName('');
        }

        let perms = [];
        if (Array.isArray(row.permissions_full) && row.permissions_full.length > 0) {
          perms = row.permissions_full.map((p) => ({
            id: p.id,
            permission_name: p.permission_name,
            description: p.description,
          }));
        } else if (Array.isArray(row.permissions)) {
          perms = row.permissions.map((name, idx) => ({ id: idx, permission_name: name, description: '' }));
        }
        setPermissions(perms);
      } catch (err) {
        setError(err?.message || 'No se pudo cargar el inicio');
        setPermissions([]);

        if (!noRoleHandled.current && /rol activo/i.test(String(err?.message || ''))) {
          noRoleHandled.current = true;
          try {
            await supabase.auth.signOut();
          } catch {
            // noop
          }
          window.location.href = '/login';
        }
      } finally {
        setLoading(false);
      }
    };

    fetchFromView();
  }, [setPermissions]);

  const roleKey = useMemo(() => String(roleName || '').toLowerCase(), [roleName]);
  const greeting = useMemo(() => getGreeting(), []);

  return (
    <div className="homeShell">
      <div className="homeInner">
        <div className="card homeHeroCard">
          <div className="homeHeroRow">
            <div className="homeHeroLeft">
              <div className="homeHeroIcon" aria-hidden="true">
                <i className="fa-solid fa-sun" aria-hidden="true" />
              </div>

              <div className="homeHeroMeta">
                <div className="homeGreeting">
                  {greeting}, <span className="homeName">{displayName || 'Usuario'}</span>
                </div>

                {(roleName || companyName) ? (
                  <div className="homePills" aria-label="Rol y empresa">
                    {roleName ? <span className="homePill homePillPrimary">{roleName}</span> : null}
                    {companyName ? <span className="homePill">{companyName}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="homeHeroRight">
              <Link className="btn homeBtn" to="/account" style={{ textDecoration: 'none' }}>
                <i className="fa-regular fa-circle-user" aria-hidden="true" />
                Cuenta
              </Link>
              <Link className="btn btnPrimary homeBtn" to="/orders/new" style={{ textDecoration: 'none' }}>
                <i className="fa-solid fa-plus" aria-hidden="true" />
                Nueva orden
              </Link>
            </div>
          </div>
        </div>

        <div className="card homeMainCard">
          <div className="homeSectionHead">
            <div className="homeTitle">¿Qué quieres hacer hoy?</div>
            <div className="homeSubtitle">Accede rápidamente a tus módulos</div>
          </div>

          {loading ? (
            <div className="homeState">Cargando permisos…</div>
          ) : error ? (
            <div className="homeError">{error}</div>
          ) : roleKey.includes('coordinador') ? (
            <CoordinatorMain permissions={permissions} />
          ) : roleKey.includes('conductor') ? (
            <DriverMain permissions={permissions} />
          ) : (
            <div className="homeError">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Rol no soportado</div>
              <div style={{ marginBottom: 10 }}>Esta app solo está habilitada para Coordinador y Conductor.</div>
              <button
                className="btn btnPrimary"
                onClick={async () => {
                  try {
                    await supabase.auth.signOut();
                  } catch {
                    // noop
                  }
                  window.location.href = '/login';
                }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
