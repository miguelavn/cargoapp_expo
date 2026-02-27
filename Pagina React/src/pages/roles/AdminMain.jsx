import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

function hasPerm(perms = [], needle) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  const n = String(needle).toLowerCase();
  return perms.some((p) => String(p.permission_name || '').toLowerCase() === n);
}

function hasAll(perms = [], needles = []) {
  return needles.every((n) => hasPerm(perms, n));
}

function QuickAction({ label, onClick }) {
  return (
    <button className="qaCard" type="button" onClick={onClick}>
      <div className="qaLabel">{label}</div>
    </button>
  );
}

export default function AdminMain({ permissions = [] }) {
  const navigate = useNavigate();

  const actions = useMemo(() => {
    const list = [];

    if (hasAll(permissions, ['view_all_users_in_my_company', 'create_new_user_for_my_company'])) {
      list.push({ key: 'users', label: 'Usuarios' });
    }
    if (hasPerm(permissions, 'view_all_projects_from_my_company')) {
      list.push({ key: 'projects', label: 'Proyectos' });
    }
    if (hasPerm(permissions, 'view_all_orders') || hasPerm(permissions, 'view_all_orders_from_my_company')) {
      list.push({ key: 'orders', label: 'Órdenes' });
    }
    if (hasPerm(permissions, 'view_reports_from_my_company')) {
      list.push({ key: 'reports', label: 'Reportes' });
    }
    if (hasPerm(permissions, 'manage_all_services_for_my_company')) {
      list.push({ key: 'services', label: 'Servicios' });
    }

    return list;
  }, [permissions]);

  const onAction = (key) => {
    if (key === 'orders') return navigate('/orders');
    if (key === 'users') return navigate('/users');
    if (key === 'projects') return navigate('/projects');
    if (key === 'services') return navigate('/services');
    window.alert('Pantalla pendiente de migración');
  };

  if (actions.length === 0) {
    return <div style={{ marginTop: 16, color: 'var(--color-muted)', textAlign: 'center' }}>No tienes accesos disponibles.</div>;
  }

  return (
    <div className="qaGrid" style={{ marginTop: 12 }}>
      {actions.map((a) => (
        <QuickAction key={a.key} label={a.label} onClick={() => onAction(a.key)} />
      ))}
    </div>
  );
}
