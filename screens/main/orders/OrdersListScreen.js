import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Platform, ActivityIndicator, FlatList, Alert, RefreshControl
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { COLORS } from '../../../theme/colors';
import { FiltersModal } from '../../../components/orders/FiltersModal';
import { ProjectPickerModal } from '../../../components/orders/ProjectPickerModal';

export default function OrdersListScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const notchThreshold = 44;
  const headerTop = Platform.OS === 'ios'
    ? (insets.top > notchThreshold ? insets.top - 6 : insets.top)
    : 8;

  const [projects, setProjects] = useState([]);   // {id,name}
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(route?.params?.projectId ? String(route.params.projectId) : '');

  const [suppliers, setSuppliers] = useState([]); // {id,name}
  const [orderTypes, setOrderTypes] = useState([]); // {id,name}
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedOrderType, setSelectedOrderType] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasScrolled, setHasScrolled] = useState(false);
  const PAGE_SIZE = 20;
  const requestIdRef = React.useRef(0);

  // 🔹 Cargar proyectos activos
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('project_id, name, status')
          .eq('status', true)
          .order('name', { ascending: true });
        if (error) throw error;
        const list = (data || []).map(p => ({ id: String(p.project_id), name: p.name }));
        setProjects(list);
        // Si no hay selección, no preseleccionamos (el usuario puede buscar)
      } catch (e) {
        console.warn('No se pudieron cargar proyectos', e.message);
      }
    })();
  }, []);

  // 🔹 Cargar proveedores (filtrados por tipo proveedor si existen)
  useEffect(() => {
    (async () => {
      try {
        const { data: ct } = await supabase.from('company_types').select('id, name');
        const supplierTypeIds = (ct || [])
          .filter((t) => {
            const n = String(t?.name || '').toLowerCase();
            return n === 'supplier' || n === 'client and supplier' || n === 'proveedor' || n === 'cliente y proveedor';
          })
          .map((t) => t.id);
        let companies = [];
        if (supplierTypeIds.length > 0) {
          const { data } = await supabase
            .from('companies')
            .select('company_id, name, company_type_id')
            .in('company_type_id', supplierTypeIds)
            .order('name', { ascending: true });
          companies = data || [];
        } else {
          const { data } = await supabase
            .from('companies')
            .select('company_id, name, company_type_id')
            .order('name', { ascending: true });
          companies = data || [];
        }
        setSuppliers(companies.map(s => ({ id: String(s.company_id), name: s.name })));
      } catch (e) {
        console.warn('No se pudieron cargar proveedores', e.message);
      }
    })();
  }, []);

  // 🔹 Cargar tipos de orden
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('order_type').select('id, type').order('id');
        setOrderTypes((data || []).map(t => ({ id: String(t.id), name: t.type })));
      } catch (e) {}
    })();
  }, []);

  // 🔹 Cargar órdenes desde la Edge Function
  const fetchOrders = async (nextPage = 1, replace = false) => {
    setLoading(true);
    const myReqId = ++requestIdRef.current;
    try {
      const res = await callEdgeFunction('list-orders', {
        method: 'POST',
        body: {
          page: nextPage,
          pageSize: PAGE_SIZE,
          project_id: selectedProject ? Number(selectedProject) : undefined,
          supplier_id: selectedSupplier ? Number(selectedSupplier) : undefined,
          order_type_id: selectedOrderType ? Number(selectedOrderType) : undefined,
        },
      });
      if (myReqId !== requestIdRef.current) return; // respuesta obsoleta, no aplicar
      const data = Array.isArray(res?.orders) ? res.orders : [];
      setTotal(Number(res?.total || 0));
      setOrders(replace ? data : [...orders, ...data]);
      const more = typeof res?.has_more === 'boolean' ? res.has_more : data.length === PAGE_SIZE;
      setHasMore(more);
      setPage(nextPage);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudieron cargar las órdenes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Al entrar o cambiar filtros, limpiar y rehacer consulta
    setOrders([]);
    setHasMore(true);
    setPage(1);
    fetchOrders(1, true);
  }, [selectedProject, selectedSupplier, selectedOrderType]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders(1, true);
    setRefreshing(false);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => navigation.navigate('RegisterOrder', { orderId: item.id })}
      style={styles.orderCard}
    >
      <Text style={styles.orderTitle}>{item.code || `Orden #${item.id}`}</Text>
      <Text style={styles.orderMeta}>{item.date ? `Fecha: ${item.date}` : 'Sin fecha'}</Text>
      <Text style={styles.orderMeta}>{item.order_type_name || ''}</Text>
      {!!item.supplier_id && (
        <Text style={styles.orderMeta}>Proveedor: {item.supplier_name || `ID ${item.supplier_id}`}</Text>
      )}
      {item.project_name && (
        <Text style={styles.orderMeta}>Proyecto: {item.project_name}</Text>
      )}
    </TouchableOpacity>
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
        <View style={[styles.headerArea, { paddingTop: headerTop }] }>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
            </TouchableOpacity>
            <Text style={styles.title}>Órdenes</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('RegisterOrder', { projectId: selectedProject || undefined })}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={20} color={COLORS.dark} />
              <Text style={styles.addBtnText}>Nueva</Text>
            </TouchableOpacity>
          </View>
          {/* Selector de proyecto (dropdown con búsqueda en modal) + botón Filtros */}
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={[styles.searchContainer, { flex: 1 }]}
              onPress={() => setShowProjectModal(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="folder" size={18} color={COLORS.grayText} style={{ marginRight: 6 }} />
              <Text style={styles.searchInput} numberOfLines={1}>
                {selectedProject ? (projects.find(p => p.id === selectedProject)?.name || 'Proyecto') : 'Seleccionar proyecto'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={20} color={COLORS.grayText} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleFilterBtn, (selectedSupplier || selectedOrderType) && styles.roleFilterBtnActive]}
              onPress={() => setShowFilters(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="filter-list" size={18} color={(selectedSupplier || selectedOrderType) ? '#fff' : COLORS.dark} />
              <Text style={[styles.roleFilterText, (selectedSupplier || selectedOrderType) && { color: '#fff' }]} numberOfLines={1} ellipsizeMode="tail">
                Filtros
              </Text>
              {(selectedSupplier || selectedOrderType) && (
                <TouchableOpacity
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    setSelectedSupplier('');
                    setSelectedOrderType('');
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
          {!loading && (
            <Text style={styles.totalText}>Total órdenes: {total}</Text>
          )}
          {loading && orders.length === 0 && (
            <ActivityIndicator size="large" color={COLORS.purple} style={{ marginTop: 8 }} />
          )}
          <FlatList
            data={orders}
            keyExtractor={(item, idx) => String(item.id ?? idx)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 160 : 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            onEndReachedThreshold={0.5}
            onMomentumScrollBegin={() => setHasScrolled(true)}
            onEndReached={() => {
              if (hasScrolled && hasMore && !loading) fetchOrders(page + 1);
            }}
            ListFooterComponent={() => {
              if (loading && orders.length > 0) {
                return (
                  <View style={{ paddingVertical: 16 }}>
                    <ActivityIndicator />
                  </View>
                );
              }
              if (hasMore) {
                return (
                  <TouchableOpacity style={styles.loadMoreBtn} onPress={() => !loading && fetchOrders(page + 1)} activeOpacity={0.7} disabled={loading}>
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
          visible={showFilters}
          onClose={() => setShowFilters(false)}
          suppliers={suppliers}
          selectedSupplier={selectedSupplier}
          setSelectedSupplier={setSelectedSupplier}
          orderTypes={orderTypes}
          selectedOrderType={selectedOrderType}
          setSelectedOrderType={setSelectedOrderType}
          onApply={() => { setShowFilters(false); }}
          onClear={() => { setSelectedSupplier(''); setSelectedOrderType(''); setShowFilters(false); }}
        />
        <ProjectPickerModal
          visible={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          projects={projects}
          selectedProject={selectedProject}
          onSelect={(id) => { setSelectedProject(id); setShowProjectModal(false); }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.white, paddingTop: Platform.OS === 'android' ? 0 : 0 },
  gradientBg: { position: 'absolute', top: 0, left: 0, right: 0 },
  root: { flex: 1 },
  headerArea: { backgroundColor: COLORS.purple, paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10 },
  contentArea: { flex: 1, backgroundColor: COLORS.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 0, marginBottom: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 0 },
  backButton: { backgroundColor: COLORS.yellow, padding: 10, borderRadius: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
  title: { fontSize: 16, paddingVertical: 0, paddingHorizontal: 10, fontWeight: '500', color: COLORS.white, flex: 1, textAlign: 'left' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.yellow, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  addBtnText: { marginLeft: 6, fontWeight: '600', color: '#333' },
  totalText: { fontSize: 13, color: COLORS.grayText, marginBottom: 10, textAlign: 'right' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.dark, paddingVertical: 0 },
  roleFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, minWidth: 100, justifyContent: 'center', position: 'relative', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  roleFilterBtnActive: { backgroundColor: COLORS.purple },
  roleFilterText: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: COLORS.dark, maxWidth: 90 },
  clearAllBtn: { marginLeft: 6, padding: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)' },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#EEE', marginBottom: 10, backgroundColor: '#fff' },
  orderTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  orderMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  loadMoreBtn: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', backgroundColor: COLORS.yellow, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, marginTop: 12, gap: 6 },
  loadMoreText: { fontWeight: '600', color: COLORS.dark, fontSize: 14 },
  
});
