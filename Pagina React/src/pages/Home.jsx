import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { usePermissions } from '../state/PermissionsContext.jsx';
import AdminMain from './roles/AdminMain.jsx';
import CoordinatorMain from './roles/CoordinatorMain.jsx';
import CustomerMain from './roles/CustomerMain.jsx';

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

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              {getGreeting()}, {displayName || 'Usuario'}
            </div>
            <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>{roleName || ''}</div>
            {companyName ? <div style={{ color: 'var(--color-muted)', marginTop: 2, fontSize: 13 }}>{companyName}</div> : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn" to="/account" style={{ textDecoration: 'none' }}>
              Cuenta
            </Link>
            <Link className="btn btnPrimary" to="/orders/new" style={{ textDecoration: 'none' }}>
              Registrar orden
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 12, fontWeight: 900, fontSize: 22 }}>¿Qué quieres hacer hoy?</div>

        {loading ? (
          <div style={{ marginTop: 10, color: 'var(--color-muted)' }}>Cargando permisos…</div>
        ) : error ? (
          <div style={{ marginTop: 10, color: '#B91C1C', fontWeight: 700, textAlign: 'center' }}>{error}</div>
        ) : roleKey.includes('administrador') ? (
          <AdminMain permissions={permissions} />
        ) : roleKey.includes('coordinador') ? (
          <CoordinatorMain permissions={permissions} />
        ) : (
          <CustomerMain permissions={permissions} />
        )}
      </div>
    </div>
  );
}
