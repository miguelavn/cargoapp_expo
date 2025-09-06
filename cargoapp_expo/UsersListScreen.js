import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { supabase, SUPABASE_URL } from './supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';

export default function UsersListScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [canCreate, setCanCreate] = useState(false);

  const PAGE_SIZE = 20;
  const EDGE_FUNCTION_NAME = 'list-users';

  const permissionsFromRoute = route?.params?.permissions;
  const normalizedPermissions = useMemo(
    () => (Array.isArray(permissionsFromRoute) ? permissionsFromRoute : []),
    [permissionsFromRoute]
  );

  const hasPerm = useCallback(
    (perm) =>
      normalizedPermissions.some(
        (p) => (p.permission_name || '').toLowerCase() === perm.toLowerCase()
      ),
    [normalizedPermissions]
  );

  const fetchPage = useCallback(
    async (pageToLoad = 0, append = false, searchText = search) => {
      setError('');
      if (pageToLoad === 0) setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error('Sesión no válida');

        const offset = pageToLoad * PAGE_SIZE;
        let url = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}?offset=${offset}&limit=${PAGE_SIZE}`;
        if (searchText) url += `&search=${encodeURIComponent(searchText)}`;

        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Error al cargar usuarios');

        const newUsers = Array.isArray(json.users) ? json.users : [];
        setUsers((prev) => (append ? [...prev, ...newUsers] : newUsers));
        setHasMore(!!json.has_more);
        setTotal(json.total || newUsers.length);
        setPage(pageToLoad);

        if (hasPerm('create_new_user_for_my_company') || hasPerm('create_new_user')) {
          setCanCreate(true);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [hasPerm, search]
  );

  const loadInitial = useCallback(() => fetchPage(0, false, search), [fetchPage, search]);
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    fetchPage(page + 1, true, search);
  }, [fetchPage, loading, hasMore, page, search]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // 🔎 Debounce búsqueda
  useEffect(() => {
    const delay = setTimeout(() => {
      fetchPage(0, false, search);
    }, 500);
    return () => clearTimeout(delay);
  }, [search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPage(0, false, search);
    setRefreshing(false);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <MaterialIcons name="person" size={26} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        {/* Nombre + apellido */}
        <Text style={styles.itemName} numberOfLines={1}>
          {[item.name, item.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
        </Text>
        {/* Empresa */}
        {item.company_name && (
          <Text style={styles.itemCompany}>{item.company_name}</Text>
        )}
        {/* Rol */}
        {item.role_name && (
          <Text style={styles.itemRole}>{item.role_name}</Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Usuarios</Text>
          {canCreate ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('RegisterUser')}
            >
              <MaterialIcons name="person-add" size={20} color="#333" />
              <Text style={styles.addBtnText}>Nuevo</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 76 }} />
          )}
        </View>

        {/* Campo de búsqueda */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={18} color="#666" style={{ marginRight: 6 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar usuario, empresa o rol"
            placeholderTextColor="#999"
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={18} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        {!loading && !error && (
          <Text style={styles.totalText}>Total usuarios: {total}</Text>
        )}

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
          onEndReached={() => {
            if (!search) loadMore();
          }}
          ListFooterComponent={
            loading && users.length > 0 ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
  },
  root: { flex: 1, backgroundColor: '#FAFAFA', paddingHorizontal: 16, paddingTop: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  backButton: {
    backgroundColor: '#FFD23F',
    padding: 10,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#222', flex: 1, textAlign: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD23F',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { marginLeft: 6, fontWeight: '600', color: '#333' },
  totalText: { fontSize: 13, color: '#666', marginBottom: 10, textAlign: 'right' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    paddingVertical: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemName: { fontSize: 16, fontWeight: '700', color: '#222' },
  itemCompany: { fontSize: 13, color: '#FFD23F', fontWeight: '600', marginTop: 2 },
  itemRole: { fontSize: 12, color: '#666', marginTop: 2 },
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
  empty: { textAlign: 'center', marginTop: 40, color: '#666' },
});
