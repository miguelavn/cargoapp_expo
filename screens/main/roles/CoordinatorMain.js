import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

function hasPerm(perms = [], needle) {
  if (!Array.isArray(perms) || perms.length === 0) return false;
  const n = String(needle).toLowerCase();
  return perms.some((p) => String(p.permission_name || '').toLowerCase() === n);
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

export default function CoordinatorMain({ permissions = [], navigation }) {
  const showOrders = useMemo(() => (
    hasPerm(permissions, 'view_all_orders') ||
    hasPerm(permissions, 'view_all_orders_from_my_company')
  ), [permissions]);

  const showServices = useMemo(() => (
    hasPerm(permissions, 'create_new_service_for_my_company')
  ), [permissions]);

  return (
    <>
      <View style={{ height: 120, backgroundColor: '#FFEDEB', borderRadius: 12, marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', marginHorizontal: -6, flexWrap: 'wrap' }}>
        {showOrders && (
          <QuickAction
            icon="file-document-edit"
            label="Órdenes"
            onPress={() => navigation?.navigate?.('OrdersList', { permissions })}
          />
        )}
        {showServices && (
          <QuickAction
            icon="tools"
            label="Servicios"
            onPress={() => navigation?.navigate?.('ServicesList', { permissions })}
          />
        )}
        {(!showOrders && !showServices) && (
          <View style={{ flex: 1, margin: 6 }}>
            <Text style={{ color: '#666', textAlign: 'center', padding: 12 }}>Sin accesos disponibles</Text>
          </View>
        )}
      </View>
    </>
  );
}
