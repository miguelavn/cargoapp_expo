import React, { useEffect, useState, useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../../supabaseClient';
import AdminMain from './roles/AdminMain';
import DriverMain from './roles/DriverMain';
import CustomerMain from './roles/CustomerMain';
import CoordinatorMain from './roles/CoordinatorMain';
import { PermissionsContext } from '../../contexts/PermissionsContext';

// Obtiene displayName, rol (id + nombre) según users_roles.default_role = true y permisos.
async function fetchUserContext() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error('no-session');

  // app_users: id y nombre
  const { data: appUser } = await supabase
    .from('app_users')
    .select('user_id, name, last_name')
    .eq('auth_id', user.id)
    .maybeSingle();

  const displayName = appUser?.name
    ? `${appUser.name} ${appUser.last_name ?? ''}`.trim()
    : user.email || 'Usuario';

  let roleId = null;
  let roleName = '';

  if (appUser?.user_id) {
    // Rol activo por default_role = true
    const { data: activeRole } = await supabase
      .from('users_roles')
      .select('role_id, default_role, roles(id, role_name)')
      .eq('user_id', appUser.user_id)
      .eq('default_role', true)
      .maybeSingle();

    if (activeRole?.role_id) {
      roleId = activeRole.role_id;
      roleName = activeRole.roles?.role_name || '';
    } else {
      // Fallback: tomar cualquiera
      const { data: anyRole } = await supabase
        .from('users_roles')
        .select('role_id, roles(id, role_name)')
        .eq('user_id', appUser.user_id)
        .limit(1)
        .maybeSingle();
      if (anyRole?.role_id) {
        roleId = anyRole.role_id;
        roleName = anyRole.roles?.role_name || '';
      }
    }
  }

  // Permisos por roleId
  let permissions = [];
  if (roleId) {
    const { data: rolesPermissions } = await supabase
      .from('roles_permissions')
      .select('permission_id')
      .eq('role_id', roleId);
    const ids = (rolesPermissions || []).map((rp) => rp.permission_id);
    if (ids.length > 0) {
      const { data: perms } = await supabase
        .from('permissions')
        .select('id, permission_name, description')
        .in('id', ids);
      permissions = perms || [];
    }
  }

  return { displayName, roleId, roleName, permissions };
}

function roleKeyFromName(roleName = '') {
  const n = String(roleName).toLowerCase();
  if (n.includes('administrador')) return 'admin';
  if (n.includes('coordinador')) return 'coordinator';
  if (n.includes('conductor')) return 'driver';
  return 'customer';
}

export default function RoleAwareMain() {
  const [role, setRole] = useState(null);
  const [displayName, setDisplayName] = useState('Usuario');
  const [roleDisplayName, setRoleDisplayName] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ctx = await fetchUserContext();
        setDisplayName(ctx.displayName);
        setRoleDisplayName(ctx.roleName || '');
        setPermissions(ctx.permissions || []);
        const key = roleKeyFromName(ctx.roleName);
        setRole(key);
      } catch (e) {
        setRole('customer');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      try {
        const ctx = await fetchUserContext();
        setDisplayName(ctx.displayName);
        setRoleDisplayName(ctx.roleName || '');
        setPermissions(ctx.permissions || []);
        setRole(roleKeyFromName(ctx.roleName));
      } catch (_) {
        setRole('customer');
      }
    });
    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#6C63FF' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const ctxValue = useMemo(() => permissions, [permissions]);

  return (
    <PermissionsContext.Provider value={ctxValue}>
      {role === 'admin' ? (
        <AdminMain displayName={displayName} roleName={roleDisplayName} />
      ) : role === 'coordinator' ? (
        <CoordinatorMain displayName={displayName} roleName={roleDisplayName} />
      ) : role === 'driver' || role === 'conductor' ? (
        <DriverMain displayName={displayName} roleName={roleDisplayName} />
      ) : (
        <CustomerMain displayName={displayName} roleName={roleDisplayName} />
      )}
    </PermissionsContext.Provider>
  );
}
