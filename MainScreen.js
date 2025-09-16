import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from './supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';
import AdminMain from './screens/main/roles/AdminMain';
import DriverMain from './screens/main/roles/DriverMain';
import CoordinatorMain from './screens/main/roles/CoordinatorMain';
import CustomerMain from './screens/main/roles/CustomerMain';

import { usePermissions } from './contexts/PermissionsContext';

const MainScreen = ({ navigation }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const noRoleHandled = useRef(false);
  const { setPermissions: setGlobalPermissions } = usePermissions();
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  useEffect(() => {
    const fetchFromView = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No se encontró usuario logueado');

        // Consulta directa a la vista 
        const { data: row, error: viewError } = await supabase
          .from('user_active_role_permissions')
          .select('*')
          .eq('auth_id', user.id)
          .maybeSingle();

        if (viewError) throw viewError;
        if (!row) throw new Error('No se encontró un rol activo asignado a tu usuario.');

        setDisplayName(row.display_name || user.email || 'Usuario');
        setRoleName(row.role_name || '');

        // Empresa sólo si no es Administrador global
        if (row.role_name && !row.role_name.toLowerCase().includes('administrador global')) {
          setCompanyName(row.company_name || '');
        } else {
          setCompanyName('');
        }

        // Permisos: preferimos el array detallado (permissions_full) si existe
        let perms = [];
        if (Array.isArray(row.permissions_full) && row.permissions_full.length > 0) {
          perms = row.permissions_full.map(p => ({
            id: p.id,
            permission_name: p.permission_name,
            description: p.description,
          }));
        } else if (Array.isArray(row.permissions)) {
          perms = row.permissions.map((name, idx) => ({ id: idx, permission_name: name, description: '' }));
        }
        setPermissions(perms);
        setGlobalPermissions(perms);
      } catch (err) {
        setError(err.message);
        setPermissions([]);
        if (!noRoleHandled.current && /rol activo/i.test(err.message)) {
          noRoleHandled.current = true;
          Alert.alert(
            'Sin rol asignado',
            'No se encontró un rol activo asignado a tu cuenta. Volverás al inicio de sesión.',
            [
              {
                text: 'Aceptar',
                onPress: async () => {
                  try { await supabase.auth.signOut(); } catch (_) {}
                  navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                },
              },
            ],
            { cancelable: false }
          );
        }
      }
      setLoading(false);
    };
    fetchFromView();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#6C63FF' }}>
      {/* Contenedor principal blanco redondeado */}
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Encabezado tipo Rappi con usuario y rol */}
      <View style={styles.userHeader}>
            <View style={styles.avatarMock}>
              <MaterialIcons name="person" size={20} color="#333" />
            </View>
            <View style={{ flex: 1 }}>
        <Text style={styles.userNameText}>{getGreeting()}, {displayName || 'Usuario'}</Text>
        <Text style={styles.userRoleText}>{roleName ? roleName : ''}</Text>
        {!!companyName && (
              <Text style={styles.companyNameText}>{companyName}</Text>
            )}
            </View>
          </View>

          {/* Pregunta principal */}
          <Text style={styles.bigQuestion}>¿Qué quieres hacer hoy?</Text>

          {/* Contenido según rol dentro del panel, incrustado */}
          {roleName?.toLowerCase().includes('administrador') ? (
            <AdminMain permissions={permissions} navigation={navigation} />
          ) : roleName?.toLowerCase().includes('coordinador') ? (
            <CoordinatorMain permissions={permissions} navigation={navigation} />
          ) : roleName?.toLowerCase().includes('conductor') ? (
            <DriverMain />
          ) : (
            <CustomerMain permissions={permissions} navigation={navigation} />
          )}

          {/* Estado de permisos (silencioso) */}
          {loading ? (
            <Text style={styles.infoText}>Cargando permisos...</Text>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}
        </View>
      </View>

      {/* Menú inferior ahora es proporcionado por Tab Navigator */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 90, // dejar espacio para el bottom nav
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 200,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    marginTop: 24,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 16 },
  permissionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 10,
  },
  permissionItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  permissionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  permissionDesc: {
    fontSize: 13,
    color: '#666',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  infoText: {
    color: '#007bff',
    textAlign: 'center',
    marginTop: 6,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  avatarMock: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userNameText: { fontSize: 16, fontWeight: '700', color: '#333' },
  userRoleText: { fontSize: 12, color: '#666' },
  companyNameText: { fontSize: 12, color: '#888' },
  bigQuestion: { fontSize: 22, fontWeight: '800', color: '#333', marginTop: 8 },
  noPermText: {
    color: '#333',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
  },
  // Logout movido a AccountScreen
  // bottomNav styles removidos (Tab Navigator se encarga)

});

export default MainScreen;
