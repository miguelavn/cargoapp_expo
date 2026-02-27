import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

function hasPerm(perms = [], needle) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  const n = String(needle).toLowerCase();
  return perms.some((p) => String(p.permission_name || '').toLowerCase() === n);
}

function QuickAction({ label, onClick }) {
  return (
    <button className="qaCard" type="button" onClick={onClick}>
      <div className="qaLabel">{label}</div>
    </button>
  );
}

export default function CoordinatorMain({ permissions = [] }) {
  const navigate = useNavigate();

  const showOrders = useMemo(
    () => hasPerm(permissions, 'view_all_orders') || hasPerm(permissions, 'view_all_orders_from_my_company'),
    [permissions]
  );

  const showServices = useMemo(
    () => hasPerm(permissions, 'create_new_service_for_my_company'),
    [permissions]
  );

  const actions = [];
  if (showOrders) actions.push({ key: 'orders', label: 'Órdenes' });
  if (showServices) actions.push({ key: 'services', label: 'Servicios' });

  const onAction = (key) => {
    if (key === 'orders') return navigate('/orders');
    if (key === 'services') return navigate('/services');
    window.alert('Pantalla pendiente de migración');
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="qaBanner" />
      {actions.length === 0 ? (
        <div style={{ marginTop: 12, color: 'var(--color-muted)', textAlign: 'center' }}>Sin accesos disponibles</div>
      ) : (
        <div className="qaGrid" style={{ marginTop: 12 }}>
          {actions.map((a) => (
            <QuickAction key={a.key} label={a.label} onClick={() => onAction(a.key)} />
          ))}
        </div>
      )}
    </div>
  );
}
