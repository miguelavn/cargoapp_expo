import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { supabase } from './supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';

// Contexto para guardar permisos globalmente
import { createContext, useContext } from 'react';
export const PermissionsContext = createContext([]);

const MainScreen = ({ navigation }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const setGlobalPermissions = useContext(PermissionsContext)[1] || (()=>{});

  useEffect(() => {
    const fetchUserPermissions = async () => {
      setLoading(true);
      setError("");
      try {
        // 1. Obtener usuario actual
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No se encontró usuario logueado");    
        // 2. Buscar en app_users por auth_id
        const { data: appUser, error: appUserError } = await supabase
          .from('app_users')
          .select('user_id')
          .eq('auth_id', user.id)
          .single();
        if (appUserError || !appUser) throw new Error("No se encontró el usuario en app_users");

        // 3. Buscar el rol del usuario
        const { data: userRole, error: userRoleError } = await supabase
          .from('users_roles')
          .select('role_id')
          .eq('user_id', appUser.user_id)
          .single();
        if (userRoleError || !userRole) throw new Error("No se encontró el rol del usuario");

        // 4. Buscar los permisos asociados a ese rol
        const { data: rolesPermissions, error: rolesPermissionsError } = await supabase
          .from('roles_permissions')
          .select('permission_id')
          .eq('role_id', userRole.role_id);
        if (rolesPermissionsError) throw new Error("No se encontraron permisos para el rol");

        const permissionIds = rolesPermissions.map(rp => rp.permission_id);
        if (permissionIds.length === 0) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // 5. Obtener los nombres de los permisos
        const { data: permissionsData, error: permissionsError } = await supabase
          .from('permissions')
          .select('permission_name, description, id')
          .in('id', permissionIds);
        if (permissionsError) throw new Error("Error al obtener los permisos");

  setPermissions(permissionsData);
  setGlobalPermissions(permissionsData);
      } catch (err) {
        setError(err.message);
        setPermissions([]);
      }
      setLoading(false);
    };
    fetchUserPermissions();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#6C63FF' }}>
      {/* Top bar: logout */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutIcon}>
          <MaterialIcons name="logout" size={28} color="#d9534f" />
        </TouchableOpacity>
      </View>

      {/* Contenedor principal blanco redondeado */}
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Bienvenido a CargoApp</Text>
          <Text style={styles.subtitle}>Selecciona una opción para continuar</Text>

          {/* Acción principal ejemplo */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('RegisterUser')}
          >
            <Text style={styles.primaryButtonText}>Registrar usuario</Text>
          </TouchableOpacity>

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
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 200,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    marginTop: 24,
  },
  topBar: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 20,
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
  primaryButton: {
    backgroundColor: '#FFD23F',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#333',
    fontSize: 17,
    fontWeight: '600',
  },
  noPermText: {
    color: '#333',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
  },
  logoutIcon: {
  padding: 8,
  borderRadius: 20,
  backgroundColor: '#fff',
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 2,
  borderTopLeftRadius: 8,
  borderBottomLeftRadius: 20,
  borderTopRightRadius: 20,
  borderBottomRightRadius: 8,
},
  // bottomNav styles removidos (Tab Navigator se encarga)

});

export default MainScreen;
