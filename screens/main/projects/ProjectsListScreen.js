import React, { useMemo, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { hasPermission, callEdgeFunction } from '../../../api/edgeFunctions';
import ProjectsFiltersModal from '../../../components/projects/FiltersModal';
import { COLORS } from '../../../theme/colors';

export default function ProjectsListScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const notchThreshold = 44;
  // Android: subir el header reduciendo margen superior
  const headerTop = Platform.OS === 'ios'
    ? (insets.top > notchThreshold ? insets.top - 6 : insets.top)
    : 8;
  const { permissions: globalPerms } = usePermissions();
  const permsFromRoute = Array.isArray(route?.params?.permissions)
    ? route.params.permissions
    : [];
  const normalizedPermissions = useMemo(
    () => [...permsFromRoute, ...globalPerms],
    [permsFromRoute, globalPerms]
  );

  const canCreate = useMemo(
    () =>
      hasPermission(normalizedPermissions, 'create_new_project_for_my_company') ||
      hasPermission(normalizedPermissions, 'create_new_project'),
    [normalizedPermissions]
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null); // "active" | "inactive" | null
  const [showFilters, setShowFilters] = useState(false);
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const requestIdRef = React.useRef(0);

  const fetchPage = useCallback(
    async (pageToLoad = 0, append = false) => {
      if (pageToLoad === 0) setError('');
      setLoading(true);
      const myReqId = ++requestIdRef.current;
      try {
        const pageSize = 10;
        const offset = pageToLoad * pageSize;
        const json = await callEdgeFunction('list-projects', {
          method: 'GET',
          query: { offset, limit: pageSize, search, status: statusFilter },
        });

        if (myReqId !== requestIdRef.current) return; // respuesta obsoleta
        const list = Array.isArray(json.projects) ? json.projects : [];
        setProjects((prev) => (append ? [...prev, ...list] : list));
        setTotal(typeof json.total === 'number' ? json.total : list.length);
        const recLen = list.length;
        let nextHasMore = recLen === pageSize;
        if (typeof json.has_more === 'boolean') {
          nextHasMore = json.has_more && recLen === pageSize;
        }
        if (append && recLen === 0) nextHasMore = false;
        setHasMore(nextHasMore);
        setPage(pageToLoad);
      } catch (e) {
        if (myReqId !== requestIdRef.current) return;
        if (e.message !== 'Tiempo de espera agotado') setError(e.message);
        setHasMore(false);
      } finally {
        if (myReqId === requestIdRef.current) setLoading(false);
      }
    },
    [search, statusFilter]
  );

  React.useEffect(() => {
    // Limpiar y reconsultar cuando cambia búsqueda o estado
    setProjects([]);
    setHasMore(false);
    setPage(0);
    const t = setTimeout(() => fetchPage(0, false), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter, fetchPage]);

  // Refresh automático al volver con { refresh: true }
  useFocusEffect(
    React.useCallback(() => {
      if (route?.params?.refresh) {
        fetchPage(0, false);
        // limpiar el flag para no repetir
        navigation.setParams({ refresh: undefined });
      }
    }, [route?.params?.refresh, fetchPage])
  );

  const loadMore = () => {
    if (!loading && hasMore) fetchPage(page + 1, true);
  };
  const refresh = async () => {
    setRefreshing(true);
    await fetchPage(0, false);
    setRefreshing(false);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.project_name || 'Proyecto'}
        </Text>
        <View
          style={[
            styles.badge,
            item.status === false && { backgroundColor: COLORS.grayText },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              item.status === false && { color: '#fff' },
            ]}
          >
            {item.status === false ? 'Inactivo' : 'Activo'}
          </Text>
        </View>
      </View>
      {item.city_name && (
        <Text style={styles.address} numberOfLines={1}>
          {item.city_name}
          {item.department_name ? `, ${item.department_name}` : ''}
        </Text>
      )}
      {item.description ? (
        <Text style={styles.desc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={[COLORS.purple, COLORS.purple, COLORS.white]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.gradientBg, { height: 250 }]}
      />
      <View style={styles.root}>
  <View style={[styles.headerArea, { paddingTop: headerTop }]}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
            </TouchableOpacity>
            <Text style={styles.title}>Proyectos</Text>
            {canCreate ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() =>
                  navigation.navigate('RegisterProject', {
                    permissions: normalizedPermissions,
                  })
                }
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={20} color={COLORS.dark} />
                <Text style={styles.addBtnText}>Nuevo</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 76 }} />
            )}
          </View>

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
                placeholder="Buscar por nombre"
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
              style={[
                styles.roleFilterBtn,
                statusFilter && styles.roleFilterBtnActive,
              ]}
              onPress={() => setShowFilters(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="filter-list"
                size={18}
                color={statusFilter ? '#fff' : COLORS.dark}
              />
              <Text
                style={[
                  styles.roleFilterText,
                  statusFilter && { color: '#fff' },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {statusFilter === 'active'
                  ? 'Activos'
                  : statusFilter === 'inactive'
                  ? 'Inactivos'
                  : 'Filtros'}
              </Text>
              {statusFilter && (
                <TouchableOpacity
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    setStatusFilter(null);
                  }}
                  style={styles.clearAllBtn}
                >
                  <MaterialIcons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.contentArea}>
          {!loading && !error && (
            <Text style={styles.totalText}>Total proyectos: {total}</Text>
          )}
          {loading && projects.length === 0 && (
            <ActivityIndicator size="large" color={COLORS.purple} style={{ marginTop: 8 }} />
          )}
          {!!error && !loading && <Text style={styles.error}>{error}</Text>}
          {!loading && projects.length === 0 && !error && (
            <Text style={styles.empty}>No hay proyectos para mostrar.</Text>
          )}

          <FlatList
            data={projects}
            keyExtractor={(item, idx) => String(item.project_id || idx)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 160 : 100 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
            onMomentumScrollBegin={() => setHasScrolled(true)}
            onEndReachedThreshold={0.25}
            onEndReached={() => {
      if (!search && hasScrolled) loadMore();
            }}
            ListFooterComponent={() => {
              if (loading && projects.length > 0)
                return (
                  <View style={{ paddingVertical: 16 }}>
                    <ActivityIndicator />
                  </View>
                );
              if (hasMore)
                return (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
        onPress={() => !loading && loadMore()}
                    activeOpacity={0.7}
        disabled={loading}
                  >
                    <MaterialIcons name="refresh" size={18} color={COLORS.dark} />
                    <Text style={styles.loadMoreText}>
                      {loading ? 'Cargando…' : 'Cargar más'}
                    </Text>
                  </TouchableOpacity>
                );
              return <View style={{ height: 12 }} />;
            }}
    ListFooterComponentStyle={{ backgroundColor: COLORS.white }}
    style={{ flexGrow: 0 }}
          />
        </View>
      </View>
      <ProjectsFiltersModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? 0 : 0,
  },
  gradientBg: { position: 'absolute', top: 0, left: 0, right: 0 },
  root: { flex: 1 },
  headerArea: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
  paddingTop: 0,
  paddingBottom: 10,
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
  title: { fontSize: 16,
     paddingVertical: 0, 
     paddingHorizontal: 10, 
     fontWeight: '500', 
     color: COLORS.dark, 
     flex: 1, 
     textAlign: 'left' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.yellow,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  addBtnText: { marginLeft: 6, fontWeight: '600', color: '#333' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  },
  roleFilterBtnActive: { backgroundColor: COLORS.purple },
  roleFilterText: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: COLORS.dark, maxWidth: 90 },
  clearAllBtn: { marginLeft: 6, padding: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)' },
  contentArea: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 0,
  },
  totalText: { fontSize: 13, color: COLORS.grayText, marginBottom: 10, textAlign: 'right' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#222', flex: 1 },
  desc: { marginTop: 4, fontSize: 12, color: '#555' },
  badge: { backgroundColor: '#D5F7D8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#176B1D' },
  address: { marginTop: 2, fontSize: 11, color: '#666' },
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
  error: { color: 'red', textAlign: 'center', marginTop: 20 },
  empty: { textAlign: 'center', marginTop: 40, color: COLORS.grayText },
});
