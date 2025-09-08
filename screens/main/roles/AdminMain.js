import React, { useMemo } from 'react';
import { Text, View, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

function hasPerm(perms = [], needle) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  const n = String(needle).toLowerCase();
  return perms.some((p) => String(p.permission_name || '').toLowerCase() === n);
}

function hasAll(perms = [], needles = []) {
  return needles.every((n) => hasPerm(perms, n));
}

function QuickAction({ icon, label, color = '#6C63FF', onPress }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#FFF4CC', borderless: false }}
      style={{
        flex: 1,
        minHeight: 92,
        backgroundColor: '#F8F8FF',
        borderRadius: 14,
        padding: 12,
        margin: 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={icon} size={28} color={color} />
      <Text style={{ marginTop: 8, fontWeight: '600', color: '#333', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function AdminMain({ permissions = [], navigation }) {
  const actions = useMemo(() => {
    const list = [];
    // Usuarios: requiere ambos permisos
    if (hasAll(permissions, ['view_all_users_in_my_company', 'create_new_user_for_my_company'])) {
      list.push({ key: 'users', icon: 'account-multiple', label: 'Usuarios' });
    }
    // Proyectos
    if (hasPerm(permissions, 'view_all_projects_from_my_company')) {
      list.push({ key: 'projects', icon: 'briefcase-variant', label: 'Proyectos' });
    }
    // Reportes
    if (hasPerm(permissions, 'view_reports_from_my_company')) {
      list.push({ key: 'reports', icon: 'chart-line', label: 'Reportes' });
    }
    // Servicios
    if (hasPerm(permissions, 'manage_all_services_for_my_company')) {
      list.push({ key: 'services', icon: 'toolbox-outline', label: 'Servicios' });
    }
    return list;
  }, [permissions]);

  // Agrupar en filas de 2 para mantener el layout actual
  const rows = [];
  for (let i = 0; i < actions.length; i += 2) {
    rows.push(actions.slice(i, i + 2));
  }

  return (
    <>
      {rows.length === 0 && (
        <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>No tienes accesos disponibles.</Text>
      )}
      {rows.map((row, idx) => (
        <View key={idx} style={{ flexDirection: 'row', marginHorizontal: -6 }}>
          {row.map((a) => ( 
      <QuickAction
              key={a.key}
              icon={a.icon}
              label={a.label}
              onPress={() => {
        if (a.key === 'users') navigation?.navigate?.('UsersList', { permissions });
              }}
            />
          ))}
          {row.length === 1 && <View style={{ flex: 1, margin: 6 }} />}
        </View>
      ))}
    </>
  );
}
