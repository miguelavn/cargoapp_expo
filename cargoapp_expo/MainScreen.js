import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button, FlatList, ActivityIndicator, TouchableOpacity, } from 'react-native';
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


        alert(user.id);
        
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
    <View style={styles.container}>
      <View style={styles.topBar}>
      <TouchableOpacity onPress={handleLogout} style={styles.logoutIcon}>
        <MaterialIcons name="logout" size={28} color="#d9534f" />
      </TouchableOpacity>
    </View>
      <Text style={styles.title}>Bienvenido a CargoApp</Text>
      <Text style={styles.subtitle}>Pantalla principal</Text>
      <Button title="Ir a registro de usuario" onPress={() => navigation.navigate('RegisterUser')} color="#007bff" />


      {/* Los permisos ya no se muestran, pero se guardan en contexto global */}
      {loading ? (
          <Text style={{ color: '#007bff', marginTop: 20 }}>Cargando permisos...</Text>
        ) : error ? (
          <Text style={{ color: 'red', marginTop: 20 }}>{error}</Text>
        ) : permissions.length === 0 ? (
          <Text style={{ color: '#333', marginTop: 20 }}>No tiene permisos asignados.</Text>
        ) : (
          <View style={{ marginTop: 20, width: '100%' }}>
            <Text style={{ fontWeight: 'bold', color: '#007bff', marginBottom: 8, textAlign: 'center' }}>Permisos del usuario:</Text>
            {permissions.map((perm) => (
              <View key={perm.id} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                <Text style={{ color: '#333', fontWeight: '600' }}>{perm.permission_name}</Text>
                {perm.description ? (
                  <Text style={{ color: '#666', fontSize: 13 }}>{perm.description}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}


        
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e3f0ff',
    padding: 20,
  },
  topBar: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#333',
    marginBottom: 30,
  },
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

});

export default MainScreen;
