import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { supabase, SUPABASE_URL } from './supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';

export default function UsersListScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;
  const [canCreate, setCanCreate] = useState(false);
  const permissionsFromRoute = route?.params?.permissions; // puede venir undefined
  // Normalizar a un arreglo estable (evita recrear [] cada render y provocar loops)
  const normalizedPermissions = useMemo(() => (
    Array.isArray(permissionsFromRoute) ? permissionsFromRoute : []
  ), [permissionsFromRoute]);

  const hasPerm = (perm) => normalizedPermissions.some(p => (p.permission_name||'').toLowerCase() === perm.toLowerCase());

  const fetchPage = useCallback(async (pageToLoad = 0, append = false) => {
    setError('');
    try {
      if (pageToLoad === 0) setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sesión no válida');

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/list-users?offset=${pageToLoad * PAGE_SIZE}&limit=${PAGE_SIZE}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Error al cargar usuarios');

      const newUsers = json.users || [];
      setHasMore(newUsers.length === PAGE_SIZE);
      setUsers(prev => append ? [...prev, ...newUsers] : newUsers);
      setPage(pageToLoad);
      if (hasPerm('create_new_user_for_my_company') || hasPerm('create_new_user')) setCanCreate(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hasPerm]);

  const load = useCallback(() => fetchPage(0, false), [fetchPage]);
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    fetchPage(page + 1, true);
  }, [fetchPage, page, hasMore, loading]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.display_name || item.name || 'Sin nombre'}</Text>
        {item.role_name && <Text style={styles.itemRole}>{item.role_name}</Text>}
      </View>
      {item.company_name && <Text style={styles.itemCompany}>{item.company_name}</Text>}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Usuarios</Text>
        {canCreate && (
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('RegisterUser')}>
            <MaterialIcons name="person-add" size={20} color="#333" />
            <Text style={styles.addBtnText}>Nuevo</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading && <ActivityIndicator size="large" color="#6C63FF" style={{ marginTop: 24 }} />}
      {!!error && !loading && <Text style={styles.error}>{error}</Text>}
      {!loading && users.length === 0 && !error && (
        <Text style={styles.empty}>No hay usuarios para mostrar.</Text>
      )}
      <FlatList
        data={users}
        keyExtractor={(item, idx) => String(item.user_id || idx)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
        ListFooterComponent={loading && users.length > 0 ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator />
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#333' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFD23F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { marginLeft: 6, fontWeight: '600', color: '#333' },
  item: { flexDirection: 'row', padding: 14, backgroundColor: '#F8F8FF', borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  itemName: { fontSize: 16, fontWeight: '600', color: '#333' },
  itemRole: { fontSize: 12, color: '#666', marginTop: 2 },
  itemCompany: { fontSize: 11, color: '#888', marginLeft: 10 },
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
  empty: { textAlign: 'center', marginTop: 40, color: '#666' },
});
