import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { supabase, SUPABASE_URL } from './supabaseClient';
import { MaterialIcons } from '@expo/vector-icons';

// Paleta
const COLORS = {
  purple: '#6C63FF',
  yellow: '#FFD23F',
  white: '#FFFFFF',
  bg: '#FAFAFA',
  grayText: '#666',
  dark: '#222',
};

export default function UsersListScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null); // 'true' | 'false' | null

  const filterLabel = useMemo(() => {
    const parts = [];
    if (selectedRole) parts.push(selectedRole);
    if (activeFilter === 'true') parts.push('Activos');
    if (activeFilter === 'false') parts.push('Inactivos');
    return parts.length ? parts.join(' • ') : 'Filtros';
  }, [selectedRole, activeFilter]);

  const filtersActive = !!(selectedRole || activeFilter);
  const clearedAll = () => { setSelectedRole(null); setActiveFilter(null); };

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
    async (
      pageToLoad = 0,
      append = false,
      searchText = search,
      role = selectedRole,
      isActive = activeFilter
    ) => {
      setError('');
      if (pageToLoad === 0) setLoading(true);
      try {
        const { data: { session } = { session: null } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error('Sesión no válida');

        const offset = pageToLoad * PAGE_SIZE;
        let url = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}?offset=${offset}&limit=${PAGE_SIZE}`;
        if (searchText) url += `&search=${encodeURIComponent(searchText)}`;
        if (role) url += `&role=${encodeURIComponent(role)}`;
        if (isActive) url += `&is_active=${encodeURIComponent(isActive)}`;

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
    [hasPerm, search, selectedRole, activeFilter]
  );

  const loadInitial = useCallback(
    () => fetchPage(0, false, search, selectedRole, activeFilter),
    [fetchPage, search, selectedRole, activeFilter]
  );

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    fetchPage(page + 1, true, search, selectedRole, activeFilter);
  }, [fetchPage, loading, hasMore, page, search, selectedRole, activeFilter]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Debounce search / filters
  useEffect(() => {
    const delay = setTimeout(() => {
      fetchPage(0, false, search, selectedRole, activeFilter);
    }, 500);
    return () => clearTimeout(delay);
  }, [search, selectedRole, activeFilter, fetchPage]);

  // Roles
  useEffect(() => {
    const getRoles = async () => {
      try {
        const { data, error: rolesErr } = await supabase
          .from('roles')
          .select('role_name')
          .order('role_name');
        if (!rolesErr && Array.isArray(data)) {
          setRoles(data.map((r) => r.role_name).filter(Boolean));
        }
      } catch (_) {}
    };
    getRoles();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPage(0, false, search, selectedRole, activeFilter);
    setRefreshing(false);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.6}
      style={styles.card}
      onPress={() => { /* navegación futura */ }}
    >
      <View style={styles.avatar}>
        <MaterialIcons name="person" size={26} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName} numberOfLines={1}>
          {[item.name, item.last_name].filter(Boolean).join(' ') || 'Sin nombre'}
        </Text>
        {item.company_name && (
          <Text style={styles.itemCompany}>{item.company_name}</Text>
        )}
        {item.role_name && (
          <Text style={styles.itemRole}>{item.role_name}</Text>
        )}
      </View>
      <MaterialIcons name="chevron-right" size={26} color="#999" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Fondo degradado: morado parte superior -> blanco parte inferior */}
      <LinearGradient
        colors={['#6C63FF','#6C63FF','#FFFFFF']}
        locations={[0,0.35,0.36]}
        style={styles.gradientBg}
        pointerEvents="none"
      />
      <View style={styles.root}>
        {/* Header morado */}
        <View style={styles.headerArea}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={22} color={COLORS.dark} />
            </TouchableOpacity>
            <Text style={styles.title}>Usuarios</Text>
            {canCreate ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('RegisterUser')}
              >
                <MaterialIcons name="person-add" size={20} color={COLORS.dark} />
                <Text style={styles.addBtnText}>Nuevo</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 76 }} />
            )}
          </View>
          {/* Búsqueda + filtros */}
          <View style={styles.searchRow}>
            <View style={[styles.searchContainer, { flex: 1 }]}> 
              <MaterialIcons name="search" size={18} color={COLORS.grayText} style={{ marginRight: 6 }} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por nombre y apellido"
                placeholderTextColor="#999"
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialIcons name="close" size={18} color={COLORS.grayText} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.roleFilterBtn, filtersActive && styles.roleFilterBtnActive]}
              onPress={() => setShowRoleModal(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="filter-list" size={18} color={filtersActive ? '#fff' : COLORS.dark} />
              <Text
                style={[styles.roleFilterText, filtersActive && { color: '#fff' }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {filterLabel}{filtersActive ? ` (${total})` : ''}
              </Text>
              {filtersActive && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); clearedAll(); }}
                  style={styles.clearAllBtn}
                >
                  <MaterialIcons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Contenido */}
        <View style={styles.contentArea}>
          {!loading && !error && (
            <Text style={styles.totalText}>Total usuarios: {total}</Text>
          )}
          {loading && <ActivityIndicator size="large" color={COLORS.purple} style={{ marginTop: 8 }} />}
          {!!error && !loading && <Text style={styles.error}>{error}</Text>}
          {!loading && users.length === 0 && !error && (
            <Text style={styles.empty}>No hay usuarios para mostrar.</Text>
          )}

          <FlatList
            data={users}
            keyExtractor={(item, idx) => String(item.user_id || idx)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 160 : 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReachedThreshold={0.5}
            onEndReached={() => { if (!search) loadMore(); }}
            ListFooterComponent={
              loading && users.length > 0 ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator />
                </View>
              ) : <View style={{ height: 1 }} />
            }
            ListFooterComponentStyle={{ backgroundColor: COLORS.white }}
            style={{ flexGrow: 0 }}
          />
        </View>

        {/* Modal Filtros */}
        <Modal
          visible={showRoleModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRoleModal(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowRoleModal(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filtros</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={styles.sectionLabel}>Rol</Text>
              <Pressable
                style={[styles.roleItem, !selectedRole && styles.roleItemActive]}
                onPress={() => { setSelectedRole(null); setShowRoleModal(false); }}
              >
                <Text style={styles.roleItemText}>Todos</Text>
                {!selectedRole && <MaterialIcons name="check" size={18} color={COLORS.purple} />}
              </Pressable>
              {roles.map((r) => (
                <Pressable
                  key={r}
                  style={[styles.roleItem, selectedRole === r && styles.roleItemActive]}
                  onPress={() => { setSelectedRole(r); setShowRoleModal(false); }}
                >
                  <Text style={styles.roleItemText}>{r}</Text>
                  {selectedRole === r && <MaterialIcons name="check" size={18} color={COLORS.purple} />}
                </Pressable>
              ))}
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Estado</Text>
              <Pressable
                style={[styles.roleItem, !activeFilter && styles.roleItemActive]}
                onPress={() => { setActiveFilter(null); setShowRoleModal(false); }}
              >
                <Text style={styles.roleItemText}>Todos</Text>
                {!activeFilter && <MaterialIcons name="check" size={18} color={COLORS.purple} />}
              </Pressable>
              <Pressable
                style={[styles.roleItem, activeFilter === 'true' && styles.roleItemActive]}
                onPress={() => { setActiveFilter('true'); setShowRoleModal(false); }}
              >
                <Text style={styles.roleItemText}>Activos</Text>
                {activeFilter === 'true' && <MaterialIcons name="check" size={18} color={COLORS.purple} />}
              </Pressable>
              <Pressable
                style={[styles.roleItem, activeFilter === 'false' && styles.roleItemActive]}
                onPress={() => { setActiveFilter('false'); setShowRoleModal(false); }}
              >
                <Text style={styles.roleItemText}>Inactivos</Text>
                {activeFilter === 'false' && <MaterialIcons name="check" size={18} color={COLORS.purple} />}
              </Pressable>
            </ScrollView>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowRoleModal(false)}>
              <Text style={styles.closeModalText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
  },
  gradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  root: { flex: 1 },
  headerArea: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  contentArea: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  backButton: {
    backgroundColor: COLORS.yellow,
    padding: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  title: { fontSize: 16, paddingVertical: 0, paddingHorizontal: 10, fontWeight: '500', color: COLORS.dark, flex: 1, textAlign: 'left' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.yellow,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  addBtnText: { marginLeft: 6, fontWeight: '600', color: '#333' },
  totalText: { fontSize: 13, color: COLORS.grayText, marginBottom: 10, textAlign: 'right' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.dark, paddingVertical: 0 },
  roleFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 100,
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roleFilterBtnActive: { backgroundColor: COLORS.purple },
  roleFilterText: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: COLORS.dark, maxWidth: 90 },
  clearAllBtn: { marginLeft: 6, padding: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 0,
    gap: 4,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemName: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  itemCompany: { fontSize: 13, color: COLORS.grayText, fontWeight: '600', marginTop: 2 },
  itemRole: { fontSize: 12, color: COLORS.grayText, marginTop: 2 },
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
  empty: { textAlign: 'center', marginTop: 40, color: COLORS.grayText },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  modalContent: {
    position: 'absolute',
    top: '25%',
    left: 20,
    right: 20,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: 12, textAlign: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.grayText, marginBottom: 6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F7F7F7',
    marginBottom: 6,
  },
  roleItemActive: { backgroundColor: '#EDE9FF' },
  roleItemText: { fontSize: 14, fontWeight: '600', color: '#333' },
  closeModalBtn: {
    marginTop: 10,
    backgroundColor: COLORS.purple,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeModalText: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
});
