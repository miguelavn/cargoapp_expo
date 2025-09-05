import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

function hasPerm(perms = [], needle) {
  if (!Array.isArray(perms) || perms.length === 0) return true; // si no hay permisos cargados, mostrar todo por ahora
  const n = String(needle).toLowerCase();
  return perms.some((p) => String(p.permission_name || '').toLowerCase() === n);
}

function QuickAction({ iconSet = 'mci', icon, label, color = '#6C63FF', onPress }) {
  const IconComp = iconSet === 'mci' ? MaterialCommunityIcons : MaterialIcons;
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
      <IconComp name={icon} size={28} color={color} />
      <Text style={{ marginTop: 8, fontWeight: '600', color: '#333', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export default function AdminMain({ permissions = [] }) {
  return (
    <>
      <View style={{ flexDirection: 'row', marginHorizontal: -6 }}>
        {hasPerm(permissions, 'manage_users') && (
          <QuickAction iconSet="mci" icon="account-multiple" label="Usuarios" />
        )}
        {hasPerm(permissions, 'manage_companies') && (
          <QuickAction iconSet="mci" icon="office-building" label="Empresas" />
        )}
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -6 }}>
        {hasPerm(permissions, 'manage_projects') && (
          <QuickAction iconSet="mci" icon="briefcase-variant" label="Proyectos" />
        )}
        {hasPerm(permissions, 'view_reports') && (
          <QuickAction iconSet="mci" icon="chart-line" label="Reportes" />
        )}
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -6 }}>
        {hasPerm(permissions, 'orders_admin') && (
          <QuickAction iconSet="mci" icon="clipboard-list" label="Órdenes" />
        )}
        {hasPerm(permissions, 'settings_access') && (
          <QuickAction iconSet="mci" icon="cog" label="Configuración" />
        )}
      </View>
    </>
  );
}
