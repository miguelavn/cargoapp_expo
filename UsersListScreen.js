import React, { useMemo, useState } from 'react';
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
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { usePermissions } from './contexts/PermissionsContext';
import { hasPermission } from './api/edgeFunctions';
import { useUsersPagination } from './hooks/useUsersPagination';
import { UserCard } from './components/users/UserCard';
import { FiltersModal } from './components/users/FiltersModal';
import { COLORS } from './theme/colors';

export default function UsersListScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const notchThreshold = 44; // referencia general de notch "estándar"
  // En Android quitamos el gran padding del SafeArea y usamos un offset menor para subir el header
  const headerTop = Platform.OS === 'ios'
    ? (insets.top > notchThreshold ? insets.top - 6 : insets.top)
    : 8; // más arriba en Android
  // Permisos combinados: desde la ruta (fallback) + globales
  const { permissions: globalPerms } = usePermissions();
  const permissionsFromRoute = Array.isArray(route?.params?.permissions)
    ? route.params.permissions
    : [];
  const normalizedPermissions = useMemo(
    () => [...permissionsFromRoute, ...globalPerms],
    [permissionsFromRoute, globalPerms]
  );
  const hasPerm = (perm) => hasPermission(normalizedPermissions, perm);

  // Estado UI / filtros
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null); // 'true' | 'false' | null

  // Etiqueta dinámica para botón de filtros
  const filterLabel = useMemo(() => {
    const parts = [];
    if (selectedRole) parts.push(selectedRole);
    if (activeFilter === 'true') parts.push('Activos');
    if (activeFilter === 'false') parts.push('Inactivos');
    return parts.length ? parts.join(' • ') : 'Filtros';
  }, [selectedRole, activeFilter]);
  const filtersActive = !!(selectedRole || activeFilter);
  const clearedAll = () => {
    setSelectedRole(null);
    setActiveFilter(null);
  };

  // Hook de paginación (usa edge function list-users)
  const { users, total, loading, error, loadMore, refresh, hasMore } = useUsersPagination({
    pageSize: 20,
    filters: { search, role: selectedRole, active: activeFilter },
  });
  const [hasScrolled, setHasScrolled] = useState(false);

  // Determinar si se puede crear usuario
  React.useEffect(() => {
    if (
      hasPerm('create_new_user_for_my_company') ||
      hasPerm('create_new_user')
    ) {
      setCanCreate(true);
    }
  }, [hasPerm]);

  // Cargar roles para filtro
  React.useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('./supabaseClient');
        const { data } = await supabase
          .from('roles')
          .select('role_name')
          .order('role_name');
        if (Array.isArray(data)) {
          setRoles(
            data
              .map((r) => r.role_name)
              .filter(Boolean)
              .sort()
          );
        }
      } catch (_) {
        // Silencio: fallo no crítico
      }
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const renderItem = ({ item }) => (
    <UserCard item={item} onPress={() => { /* navegación a detalle si aplica */ }} />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={[COLORS.purple, COLORS.purple, COLORS.white]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.gradientBg, { height: 260 }]}
      />
      <View style={styles.root}>
        {/* Header y filtros */}
  <View style={[styles.headerArea, { paddingTop: headerTop }]}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
            </TouchableOpacity>
            <Text style={styles.title}>Usuarios</Text>
            {canCreate ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => navigation.navigate('RegisterUser')}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="person-add"
                  size={20}
                  color={COLORS.dark}
                />
                <Text style={styles.addBtnText}>Nuevo</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 76 }} />
            )}
          </View>
          {/* Búsqueda + filtros */}
          <View style={styles.searchRow}>
            <View style={[styles.searchContainer, { flex: 1 }]}> 
              <MaterialIcons
                name="search"
                size={18}
                color={COLORS.grayText}
                style={{ marginRight: 6 }}
              />
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
                  <MaterialIcons
                    name="close"
                    size={18}
                    color={COLORS.grayText}
                  />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.roleFilterBtn,
                filtersActive && styles.roleFilterBtnActive,
              ]}
              onPress={() => setShowRoleModal(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="filter-list"
                size={18}
                color={filtersActive ? '#fff' : COLORS.dark}
              />
              <Text
                style={[styles.roleFilterText, filtersActive && { color: '#fff' }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {filterLabel}
                {filtersActive ? ` (${total})` : ''}
              </Text>
              {filtersActive && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    clearedAll();
                  }}
                  style={styles.clearAllBtn}
                >
                  <MaterialIcons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Lista */}
        <View style={styles.contentArea}>
          {!loading && !error && (
            <Text style={styles.totalText}>Total usuarios: {total}</Text>
          )}
            {loading && (
              <ActivityIndicator
                size="large"
                color={COLORS.purple}
                style={{ marginTop: 8 }}
              />
            )}
          {!!error && !loading && <Text style={styles.error}>{error}</Text>}
          {!loading && users.length === 0 && !error && (
            <Text style={styles.empty}>No hay usuarios para mostrar.</Text>
          )}
          <FlatList
            data={users}
            keyExtractor={(item, idx) => String(item.user_id || idx)}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingBottom: Platform.OS === 'ios' ? 160 : 100,
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            onEndReachedThreshold={0.5}
            onMomentumScrollBegin={() => setHasScrolled(true)}
            onEndReached={() => {
              if (!search && hasScrolled) loadMore();
            }}
            ListFooterComponent={() => {
              if (loading && users.length > 0) {
                return (
                  <View style={{ paddingVertical: 16 }}>
                    <ActivityIndicator />
                  </View>
                );
              }
              if (hasMore) {
                return (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={() => !loading && loadMore()}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <MaterialIcons name="refresh" size={18} color={COLORS.dark} />
                    <Text style={styles.loadMoreText}>{loading ? 'Cargando…' : 'Cargar más'}</Text>
                  </TouchableOpacity>
                );
              }
              return <View style={{ height: 12 }} />;
            }}
            ListFooterComponentStyle={{ backgroundColor: COLORS.white }}
            style={{ flexGrow: 0 }}
          />
        </View>

        <FiltersModal
          visible={showRoleModal}
          onClose={() => setShowRoleModal(false)}
          roles={roles}
          selectedRole={selectedRole}
            setSelectedRole={setSelectedRole}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // Fondo blanco global; el header/gradient proveen el morado arriba
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? 0 : 0,
  },
  gradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  root: { flex: 1 },
  headerArea: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 10,
  },
  contentArea: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 0,
    marginBottom: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 0,
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
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
  empty: { textAlign: 'center', marginTop: 40, color: COLORS.grayText },
  loadMoreBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.yellow,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 12,
    gap: 6,
  },
  loadMoreText: { fontWeight: '600', color: COLORS.dark, fontSize: 14 },
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
