import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, Alert, useWindowDimensions, TextInput, Switch, Modal, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { COLORS } from '../../../theme/colors';
import { usePermissions } from '../../../contexts/PermissionsContext';

function hasPerm(perms = [], needle) {
  const n = String(needle).toLowerCase();
  return (perms || []).some((p) => String(p.permission_name || p).toLowerCase() === n);
}

function normalizeProjectStatus(status) {
  if (status === false || status === 0 || status === '0') return false;
  if (typeof status === 'string' && status.toLowerCase() === 'false') return false;
  return true;
}

const TERMINAL_STATUSES = ['DELIVERED', 'CANCELED'];

function isServiceActive(statusName) {
  return !TERMINAL_STATUSES.includes(String(statusName || '').toUpperCase());
}

function statusVariant(statusName) {
  const k = String(statusName || '').toLowerCase().replace(/\s+/g, '_');
  if (['canceled', 'cancelled', 'cancelado'].includes(k)) return 'cancelled';
  if (['delivered', 'completed', 'entregado'].includes(k)) return 'completed';
  if (['accepted', 'loaded', 'in_progress', 'en_proceso'].includes(k)) return 'in_progress';
  if (['created'].includes(k)) return 'created';
  return 'default';
}

function formatDateEs(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr).slice(0, 10);
    return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return String(dateStr).slice(0, 10);
  }
}

export default function ServicesListScreen({ navigation, route }) {
  const { width: screenWidth } = useWindowDimensions();

  const { permissions: ctxPerms } = usePermissions();
  const permissions = route?.params?.permissions?.length ? route.params.permissions : (ctxPerms || []);

  const statLabelStyle = useMemo(() => {
    if (screenWidth <= 350) return { fontSize: 7 };
    if (screenWidth <= 390) return { fontSize: 8 };
    return { fontSize: 9 };
  }, [screenWidth]);

  const todayKey = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const canCreate = hasPerm(permissions, 'manage_services') || hasPerm(permissions, 'create_new_service_for_my_company');
  const canUpdate = hasPerm(permissions, 'manage_services') || hasPerm(permissions, 'update_all_services') || hasPerm(permissions, 'update_services_from_my_company');

  const hideBack = !!route?.params?.hideBack;

  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(route?.params?.projectId ? String(route.params.projectId) : '');
  const [services, setServices] = useState([]);
  const [statusTab, setStatusTab] = useState('en_proceso');
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const [searchText, setSearchText] = useState('');
  const [onlyToday, setOnlyToday] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('active'); // 'all' | 'active' | 'inactive'

  const [projectStats, setProjectStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const filteredProjects = useMemo(() => {
    const q = String(projectSearch || '').trim().toLowerCase();
    return (projects || [])
      .filter((p) => {
        const isActive = p?.status !== false;
        if (projectStatusFilter === 'active') return isActive;
        if (projectStatusFilter === 'inactive') return !isActive;
        return true;
      })
      .filter((p) => {
        if (!q) return true;
        return String(p?.name || '').toLowerCase().includes(q);
      });
  }, [projects, projectSearch, projectStatusFilter]);

  const projectIdRef = useRef(projectId);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const orderProjectIdCacheRef = useRef(new Map());

  const statsReloadTimerRef = useRef(null);
  const statsLastRunAtRef = useRef(0);
  const STATS_THROTTLE_MS = 1000;

  const scheduleStatsReload = () => {
    const pid = projectIdRef.current;
    if (!pid) return;

    const now = Date.now();
    const elapsed = now - (statsLastRunAtRef.current || 0);

    // Leading: ejecuta de una vez si ya pasó el intervalo.
    if (elapsed >= STATS_THROTTLE_MS) {
      statsLastRunAtRef.current = now;
      fetchProjectStats(pid);
      return;
    }

    // Trailing: programa UNA sola ejecución al final del intervalo.
    if (statsReloadTimerRef.current) return;
    const wait = Math.max(0, STATS_THROTTLE_MS - elapsed);
    statsReloadTimerRef.current = setTimeout(() => {
      statsReloadTimerRef.current = null;
      const nextPid = projectIdRef.current;
      if (!nextPid) return;
      statsLastRunAtRef.current = Date.now();
      fetchProjectStats(nextPid);
    }, wait);
  };

  const fetchProjectStats = async (pid) => {
    if (!pid) {
      setProjectStats(null);
      return;
    }
    setLoadingStats(true);
    try {
      const res = await callEdgeFunction('project-vehicles-stats', {
        method: 'GET',
        query: { project_id: pid },
      });
      const arr = Array.isArray(res?.data) ? res.data : [];
      setProjectStats(arr.length ? arr[0] : null);
    } catch {
      setProjectStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const statusKey = (name) => String(name || '').toLowerCase().replace(/\s+/g, '_');

  const isEnProceso = (s) => {
    const sid = Number(s?.status_id);
    if (!Number.isNaN(sid) && [1, 2, 3].includes(sid)) return true;
    const k = statusKey(s?.status_name);
    return ['created', 'accepted', 'loaded', 'in_progress', 'en_proceso'].includes(k);
  };

  const isEntregado = (s) => {
    const sid = Number(s?.status_id);
    if (!Number.isNaN(sid) && sid === 4) return true;
    const k = statusKey(s?.status_name);
    return ['completed', 'entregado', 'delivered'].includes(k);
  };

  const isCancelado = (s) => {
    const sid = Number(s?.status_id);
    if (!Number.isNaN(sid) && sid === 5) return true;
    const k = statusKey(s?.status_name);
    return ['cancelled', 'canceled', 'cancelado'].includes(k);
  };

  const filteredServices = useMemo(() => {
    let rows = services;
    if (statusTab === 'en_proceso') rows = rows.filter(isEnProceso);
    if (statusTab === 'entregado') rows = rows.filter(isEntregado);
    if (statusTab === 'cancelado') rows = rows.filter(isCancelado);

    const q = String(searchText || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((s) => {
        const hay = [
          s?.service_id,
          s?.project_name,
          s?.origin,
          s?.destination,
          s?.status_name,
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    }

    if (onlyToday) {
      rows = rows.filter((s) => {
        const k = s?.created_at ? String(s.created_at).slice(0, 10) : '';
        return k === todayKey;
      });
    }

    return rows;
  }, [services, statusTab, searchText, onlyToday, todayKey]);

  const countByTab = useMemo(() => {
    const enProceso = services.filter(isEnProceso).length;
    const entregado = services.filter(isEntregado).length;
    const cancelado = services.filter(isCancelado).length;
    return { enProceso, entregado, cancelado };
  }, [services]);

  useEffect(() => {
    (async () => {
      try {
        try {
          const res = await callEdgeFunction('list-projects', { method: 'GET', query: { limit: 1000 } });
          const rows = Array.isArray(res?.projects) ? res.projects : (Array.isArray(res?.data) ? res.data : []);
          const mapped = rows.map((p) => ({
            id: String(p.project_id ?? p.id),
            name: String(p.project_name ?? p.name ?? ''),
            status: normalizeProjectStatus(p.status),
          }));
          setProjects(mapped.filter((p) => p.id && p.name));
        } catch {
          const { data: pjs } = await supabase.from('projects').select('project_id, name, status').order('name');
          setProjects((pjs || []).map((p) => ({ id: String(p.project_id), name: p.name, status: normalizeProjectStatus(p.status) })));
        }
      } catch {}
      await load();
    })();
  }, []);

  // Web parity: refrescar lista con realtime
  useEffect(() => {
    const channel = supabase
      .channel('services-list-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Web parity (Services.tsx): estadísticas en tiempo real escuchando 5 tablas.
  // services: cambia estado (En Proceso/Entregados/Cancelados)
  // orders/order_details: cambian totales/relaciones
  // vehicles: online/offline afecta Disponibles
  // project_vehicles: asignación/desasignación afecta Asignados/Disponibles
  useEffect(() => {
    const getProjectIdByOrderId = async (orderId) => {
      const key = String(orderId ?? '').trim();
      if (!key) return null;
      if (orderProjectIdCacheRef.current.has(key)) return orderProjectIdCacheRef.current.get(key);
      try {
        const asNum = Number(orderId);
        const { data } = await supabase
          .from('orders')
          .select('project_id')
          .eq('id', Number.isNaN(asNum) ? orderId : asNum)
          .maybeSingle();
        const pid = data?.project_id != null ? String(data.project_id) : null;
        orderProjectIdCacheRef.current.set(key, pid);
        return pid;
      } catch {
        return null;
      }
    };

    const refreshStatsIfNeeded = (projectIdMaybe) => {
      const fp = projectIdRef.current;
      if (!fp) return;
      if (!projectIdMaybe || String(projectIdMaybe) === String(fp)) {
        scheduleStatsReload();
      }
    };

    const channel = supabase
      .channel('services-stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, async (payload) => {
        const row = (payload?.eventType === 'DELETE' ? payload?.old : payload?.new) || {};
        // services puede (o no) incluir project_id; si no, resolver via orders.
        if (row.project_id != null) {
          refreshStatsIfNeeded(String(row.project_id));
          return;
        }
        if (row.order_id != null) {
          const pid = await getProjectIdByOrderId(row.order_id);
          if (pid) refreshStatsIfNeeded(pid);
          return;
        }
        refreshStatsIfNeeded(undefined);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        const row = (payload?.eventType === 'DELETE' ? payload?.old : payload?.new) || {};
        if (row.id != null && row.project_id != null) {
          orderProjectIdCacheRef.current.set(String(row.id), String(row.project_id));
        }
        refreshStatsIfNeeded(row.project_id != null ? String(row.project_id) : undefined);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_details' }, async (payload) => {
        const row = (payload?.eventType === 'DELETE' ? payload?.old : payload?.new) || {};
        if (!row.order_id) return;
        const pid = await getProjectIdByOrderId(row.order_id);
        if (pid) refreshStatsIfNeeded(pid);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => {
        // Cualquier cambio de vehículo puede afectar DISPONIBLES
        refreshStatsIfNeeded();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_vehicles' }, async (payload) => {
        const row = (payload?.eventType === 'DELETE' ? payload?.old : payload?.new) || {};
        refreshStatsIfNeeded(row.project_id != null ? String(row.project_id) : undefined);
      })
      .subscribe();

    return () => {
      if (statsReloadTimerRef.current) clearTimeout(statsReloadTimerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web parity (cargoapp-next-main): subscribir a vehicles solo si hay servicios activos con vehículo.
  // En cada UPDATE, solo parchear online en servicios activos cuyo vehicle_id esté renderizado.
  useEffect(() => {
    const activeVehicleIds = (services || [])
      .filter((s) => isServiceActive(s?.status_name))
      .map((s) => s?.vehicle?.id ?? s?.vehicle?.vehicle_id ?? s?.vehicle_id)
      .filter((x) => x != null)
      .map((x) => Number(x))
      .filter((x) => !Number.isNaN(x));

    const uniqueIds = [...new Set(activeVehicleIds)];
    if (uniqueIds.length === 0) return;

    const idSet = new Set(uniqueIds);

    const channel = supabase
      .channel('vehicles-online-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vehicles' }, (payload) => {
        const row = payload?.new;
        const vehicleIdRaw = row?.vehicle_id ?? row?.id;
        const vehicleId = Number(vehicleIdRaw);
        if (Number.isNaN(vehicleId)) return;
        if (!idSet.has(vehicleId)) return;

        setServices((prev) => {
          let changed = false;
          const next = (prev || []).map((s) => {
            if (!isServiceActive(s?.status_name)) return s;

            const curV = s?.vehicle;
            const curVidRaw = s?.vehicle?.id ?? s?.vehicle?.vehicle_id ?? s?.vehicle_id;
            const curVid = Number(curVidRaw);
            if (Number.isNaN(curVid) || curVid !== vehicleId) return s;

            const prevOnline = curV && typeof curV === 'object' ? curV.online : null;
            if (prevOnline === row?.online) return s;

            changed = true;
            const nextVehicle = curV && typeof curV === 'object'
              ? { ...curV, online: row?.online }
              : { id: curVidRaw, vehicle_id: curVidRaw, online: row?.online };

            return { ...s, vehicle_id: s?.vehicle_id ?? curVidRaw, vehicle: nextVehicle };
          });
          return changed ? next : prev;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [services]);

  // Recarga cuando cambie el filtro de proyecto o se regrese con refresh
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, route?.params?.refresh]);

  // Reset a En Proceso cuando cambia el proyecto (paridad con web)
  useEffect(() => {
    setStatusTab('en_proceso');
  }, [projectId]);

  // Cargar métricas cuando se seleccione proyecto
  useEffect(() => {
    if (!projectId) {
      setProjectStats(null);
      return;
    }
    fetchProjectStats(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const load = async () => {
    try {
      setLoading(true);
      // Si hay edge function para listar servicios, úsala; sino, consulta directa (asumiendo RLS)
      try {
        const q = {};
        if (projectId) q.project_id = Number(projectId);
        const res = await callEdgeFunction('list-services', { method: 'GET', query: q });
        const arr = Array.isArray(res?.data) ? res.data : [];
        // Normalizar campos a nuestro render (paridad con cargoapp-next-main)
        const norm = arr.map((it) => {
          const originAddress = typeof it.origin_address === 'object'
            ? (it.origin_address?.address ?? null)
            : (it.origin_address ?? it.origin ?? null);
          const destinationAddress = typeof it.destination_address === 'object'
            ? (it.destination_address?.address ?? null)
            : (it.destination_address ?? it.destination ?? null);

          const rawVehicle = it.vehicle ?? null;
          const rawVehicleId = it.vehicle_id ?? it.vehicleId ?? rawVehicle?.vehicle_id ?? rawVehicle?.id ?? null;
          const normalizedVehicle = rawVehicle && typeof rawVehicle === 'object'
            ? rawVehicle
            : (rawVehicleId != null ? { id: rawVehicleId, vehicle_id: rawVehicleId, online: null } : null);

          return {
            service_id: it.service_id ?? it.id,
            order_id: it.order_id ?? it.orderId ?? null,
            project_id: it.project_id ?? null,
            project_name: it.project_name ?? it?.project?.name ?? null,

            vehicle_id: rawVehicleId,

            vehicle: normalizedVehicle,
            driver: it.driver ?? null,
            material: it.material ?? null,
            quantity: it.quantity ?? null,
            unit: it.unit ?? null,

            status_name: it.status_name ?? it.status ?? 'CREATED',
            status_id: it.status_id ?? null,
            substatus_id: it.substatus_id ?? null,
            substatus_name: it.substatus_name ?? null,
            pause_reason_id: it.pause_reason_id ?? null,
            pause_reason_name: it.pause_reason_name ?? null,

            created_at: it.created_at ?? it.date ?? null,
            origin: it.origin_address?.id ?? it.origin ?? null,
            destination: it.destination_address?.id ?? it.destination ?? null,
            origin_address: originAddress,
            destination_address: destinationAddress,
          };
        });
        setServices(norm);
      } catch {
        // Fallback directo: unir con orders para filtrar por proyecto
        let qb = supabase
          .from('services')
          .select('service_id, created_at, origin, destination, order_id, orders!inner(project_id)')
          .order('service_id', { ascending: false });
        if (projectId) qb = qb.eq('orders.project_id', Number(projectId));
        const { data } = await qb;
        const norm = (data || []).map((it) => ({
          service_id: it.service_id,
          created_at: it.created_at,
          order_id: it.order_id,
          project_name: null,
          origin: it.origin ?? null,
          destination: it.destination ?? null,
          status_name: null,
          status_id: null,
        }));
        setServices(norm);
      }

    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
    }
  };

  const cancelService = async (serviceId) => {
    try {
      setCancellingId(serviceId);
      await callEdgeFunction('update-service', {
        method: 'POST',
        body: { service_id: Number(serviceId), cancel: true },
      });
      Alert.alert('Éxito', 'Servicio cancelado');
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo cancelar el servicio');
    } finally {
      setCancellingId(null);
    }
  };

  const headerTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;

  return (
    <View style={styles.screen}>
      <View style={[styles.headerArea, { paddingTop: headerTop }]}> 
        <View style={styles.topBarRow}>
          {!hideBack ? (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
              <MaterialIcons name="arrow-back" size={20} color={COLORS.dark} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => (navigation?.openDrawer ? navigation.openDrawer() : null)}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <MaterialIcons name="menu" size={20} color={COLORS.dark} />
            </TouchableOpacity>
          )}
          <Text style={[styles.headerTitle, { flex: 1 }]}>Servicios</Text>
          <View style={{ width: 40, height: 40 }} />
        </View>
      </View>

      <View style={styles.container}>
        <Modal
          visible={filtersOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setFiltersOpen(false)}
        >
          <View style={styles.filtersModalRoot}>
            <View style={[styles.filtersDrawer, { width: Math.min(360, Math.round(screenWidth * 0.78)) }]}>
              <View style={styles.filtersHeaderRow}>
                <Text style={styles.filtersTitle}>Filtros</Text>
                <TouchableOpacity style={styles.filtersCloseBtn} activeOpacity={0.8} onPress={() => setFiltersOpen(false)}>
                  <MaterialIcons name="close" size={18} color={COLORS.grayText} />
                </TouchableOpacity>
              </View>

              <Text style={styles.filtersSectionLabel}>PROYECTO</Text>

              <View style={styles.filtersSearchWrap}>
                <MaterialIcons name="search" size={18} color={COLORS.grayText} />
                <TextInput
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                  placeholder="Buscar proyecto..."
                  placeholderTextColor={COLORS.grayText}
                  style={styles.filtersSearchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.filtersSegmentRow}>
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'active', label: 'Activos' },
                  { key: 'inactive', label: 'Inactivos' },
                ].map((s) => {
                  const active = projectStatusFilter === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      activeOpacity={0.85}
                      onPress={() => setProjectStatusFilter(s.key)}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <FlatList
                data={[{ id: '', name: 'Todos los proyectos', status: true }, ...filteredProjects]}
                keyExtractor={(it) => String(it.id)}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = String(projectId) === String(item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.projectListItem, selected && styles.projectListItemActive]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setProjectId(String(item.id || ''));
                        setFiltersOpen(false);
                      }}
                    >
                      <MaterialIcons name="folder" size={18} color={selected ? COLORS.primary : COLORS.grayText} />
                      <Text style={[styles.projectListText, selected && styles.projectListTextActive]} numberOfLines={1}>
                        {String(item.name || '')}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 18 }}
              />
            </View>
            <Pressable style={styles.filtersBackdrop} onPress={() => setFiltersOpen(false)} />
          </View>
        </Modal>

        <View style={styles.adminHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminTitle}>Administración de Servicios</Text>
            <Text style={styles.adminBreadcrumb}>Servicios  ›  Administrar</Text>
          </View>
          <TouchableOpacity style={styles.iconSquareBtn} activeOpacity={0.8} onPress={() => setFiltersOpen(true)}>
            <MaterialIcons name="tune" size={18} color={COLORS.foreground || COLORS.dark} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.projectRow} activeOpacity={0.85} onPress={() => setFiltersOpen(true)}>
          <View style={styles.projectIcon}>
            <MaterialIcons name="work-outline" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.projectRowText} numberOfLines={1}>
            {projects.find((p) => p.id === projectId)?.name || 'Todos los proyectos'}
          </Text>
          <MaterialIcons name="arrow-forward-ios" size={16} color={COLORS.grayText} />
        </TouchableOpacity>

        {!!projectId && (
          <View style={styles.statsWrapper}>
            {loadingStats && !projectStats ? (
              <Text style={styles.statsLoadingText}>Cargando métricas…</Text>
            ) : (
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={[styles.statLabel, statLabelStyle]}>Asignados</Text>
                  <Text style={styles.statValue}>{projectStats?.vehicles_assigned ?? 0}</Text>
                  <Text style={styles.statHint}>vehículos</Text>
                </View>

                <View style={[styles.statCard, styles.statCardPrimary]}>
                  <Text style={[styles.statLabel, styles.statLabelPrimary, statLabelStyle]}>Disponibles</Text>
                  <Text style={[styles.statValue, styles.statValuePrimary]}>{projectStats?.vehicles_available ?? 0}</Text>
                  <Text style={styles.statHint}>vehículos</Text>
                </View>

                <View style={styles.statCard}>
                  <Text style={[styles.statLabel, statLabelStyle]}>En proceso</Text>
                  <Text style={styles.statValue}>{projectStats?.services_in_process ?? 0}</Text>
                  <Text style={styles.statHint}>servicios</Text>
                </View>

                <View style={[styles.statCard, styles.statCardPrimarySoft]}>
                  <Text style={[styles.statLabel, styles.statLabelPrimary, statLabelStyle]}>Entregados</Text>
                  <Text style={[styles.statValue, styles.statValuePrimary]}>{projectStats?.services_delivered_today ?? 0}</Text>
                  <Text style={styles.statHint}>hoy</Text>
                </View>

                <View style={[styles.statCard, styles.statCardDangerSoft]}>
                  <Text style={[styles.statLabel, styles.statLabelDanger, statLabelStyle]}>Cancelados</Text>
                  <Text style={[styles.statValue, styles.statValueDanger]}>{projectStats?.services_canceled_today ?? 0}</Text>
                  <Text style={styles.statHint}>hoy</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <MaterialIcons name="search" size={18} color={COLORS.grayText} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Buscar servicio"
              placeholderTextColor={COLORS.grayText}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity
            style={styles.calendarBtn}
            activeOpacity={0.85}
            onPress={() => setOnlyToday((v) => !v)}
          >
            <MaterialIcons name="calendar-today" size={18} color={COLORS.grayText} />
          </TouchableOpacity>

          <Switch
            value={onlyToday}
            onValueChange={setOnlyToday}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />

          {canCreate && (
            <TouchableOpacity
              onPress={() => navigation.navigate('RegisterService', { projectId })}
              style={styles.newBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.newBtnText}>+ Nuevo</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabsRow}>
          {[
            { key: 'en_proceso', label: 'En Proceso', count: countByTab.enProceso },
            { key: 'entregado', label: 'Entregado', count: countByTab.entregado },
            { key: 'cancelado', label: 'Cancelado', count: countByTab.cancelado },
          ].map((t) => {
            const active = statusTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setStatusTab(t.key)}
                activeOpacity={0.85}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label} {t.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={filteredServices}
          keyExtractor={(it) => String(it.service_id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.serviceCard}
              onPress={() => navigation.navigate('RegisterService', { serviceId: item.service_id, projectId, statusName: item.status_name, statusId: item.status_id })}
              onLongPress={() => {
                const statusUpper = String(item.status_name || '').toUpperCase();
                const canCancel = canUpdate && ['CREATED', 'ACCEPTED'].includes(statusUpper);

                const buttons = [
                  { text: 'Cerrar', style: 'cancel' },
                  { text: 'Editar', onPress: () => navigation.navigate('RegisterService', { serviceId: item.service_id, projectId, statusName: item.status_name, statusId: item.status_id }) },
                ];
                if (canCancel) {
                  buttons.push({
                    text: cancellingId === item.service_id ? 'Cancelando…' : 'Cancelar servicio',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert('Confirmar', '¿Cancelar este servicio?', [
                        { text: 'No', style: 'cancel' },
                        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelService(item.service_id) },
                      ]);
                    },
                  });
                }

                Alert.alert('Acciones', `Servicio #${item.service_id}`, buttons);
              }}
              delayLongPress={250}
            >
              {(() => {
                const originText = item?.origin_address || item?.origin || '';
                const destinationText = item?.destination_address || item?.destination || '';
                const routeText = originText && destinationText
                  ? `${originText} → ${destinationText}`
                  : (originText || destinationText || 'Sin ruta');
                const v = item?.vehicle;
                const vehiclePlate = v ? String(v?.plate || '').trim() : '';
                const vehicleCap = v && v?.capacity_m3 != null ? Number(v.capacity_m3) : null;
                const vehicleOnline = !!(v && v?.online);

                const materialName = item?.material
                  ? (typeof item.material === 'object' ? (item.material?.name ?? '') : String(item.material))
                  : '';
                const unitName = item?.unit
                  ? (typeof item.unit === 'object' ? (item.unit?.name ?? '') : String(item.unit))
                  : '';
                const qty = item?.quantity != null && String(item.quantity) !== '' ? String(item.quantity) : '';

                const statusName = String(item?.status_name || 'CREATED');
                const stVariant = statusVariant(statusName);
                const active = isServiceActive(statusName);
                const sub = item?.substatus_name ? String(item.substatus_name) : '';
                const pauseReason = item?.pause_reason_name ? String(item.pause_reason_name) : '';

                return (
                  <>
                    <View style={styles.serviceTopRow}>
                      <View style={styles.serviceLeftIcon}>
                        <MaterialIcons name="build" size={16} color={COLORS.grayText} />
                        {!!(v && active) && (
                          <View
                            style={[
                              styles.serviceOnlineDot,
                              { backgroundColor: vehicleOnline ? COLORS.success : COLORS.grayText },
                            ]}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.serviceTitleRow}>
                          <Text style={styles.serviceTitle} numberOfLines={1}>Servicio #{item.service_id}</Text>
                          <Text style={styles.serviceDate} numberOfLines={1}>{formatDateEs(item.created_at)}</Text>
                        </View>

                        {!!v && (
                          <View style={styles.serviceLine}>
                            <MaterialIcons name="local-shipping" size={14} color={COLORS.grayText} />
                            <Text style={styles.serviceLineText} numberOfLines={1}>
                              {vehiclePlate ? vehiclePlate : 'Vehículo'}{vehicleCap ? ` · ${vehicleCap}m³` : ''}
                            </Text>
                          </View>
                        )}

                        {!!materialName && (
                          <View style={styles.serviceLine}>
                            <MaterialIcons name="inventory-2" size={14} color={COLORS.grayText} />
                            <Text style={styles.serviceLineText} numberOfLines={1}>
                              {materialName}{qty && unitName ? ` (${qty} ${unitName})` : (qty ? ` (${qty})` : '')}
                            </Text>
                          </View>
                        )}

                        <View style={styles.serviceLine}>
                          <MaterialIcons name="map" size={14} color={COLORS.grayText} />
                          <Text style={styles.serviceLineText} numberOfLines={1}>{routeText}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.serviceChipsRow}>
                      {!!(item.project_name) && (
                        <View style={styles.badgeOutline}>
                          <Text style={styles.badgeOutlineText} numberOfLines={1}>{String(item.project_name)}</Text>
                        </View>
                      )}

                      <View
                        style={[
                          styles.badge,
                          stVariant === 'in_progress' && styles.badgePrimary,
                          stVariant === 'completed' && styles.badgeSuccess,
                          stVariant === 'cancelled' && styles.badgeDanger,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            stVariant === 'in_progress' && styles.badgeTextPrimary,
                            stVariant === 'completed' && styles.badgeTextSuccess,
                            stVariant === 'cancelled' && styles.badgeTextDanger,
                          ]}
                          numberOfLines={1}
                        >
                          {statusName}
                        </Text>
                      </View>

                      {sub === 'ACTIVED' && (
                        <View style={styles.badgeOutlineSuccess}>
                          <Text style={styles.badgeOutlineSuccessText} numberOfLines={1}>ACTIVED</Text>
                        </View>
                      )}

                      {!!sub && sub !== 'ACTIVED' && (
                        <View style={styles.badgeDangerSoft}>
                          <Text style={styles.badgeDangerSoftText} numberOfLines={1}>
                            {sub}{pauseReason ? ` · ${pauseReason}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                );
              })()}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <Text style={{ color: COLORS.grayText, marginTop: 20 }}>
              No hay servicios.
            </Text>
          }
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  headerArea: { backgroundColor: COLORS.background, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  backButton: {
    backgroundColor: COLORS.soft,
    padding: 10,
    borderRadius: 20,
    elevation: 2,
    shadowColor: COLORS.foreground || COLORS.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  headerTitle: { color: COLORS.foreground || COLORS.dark, fontSize: 16, fontWeight: '700' },

  container: { backgroundColor: COLORS.background, flex: 1, paddingHorizontal: 16 },
  picker: { height: 50, width: '100%', backgroundColor: 'transparent' },

  adminHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  adminTitle: { fontSize: 16, fontWeight: '900', color: COLORS.foreground || COLORS.dark },
  adminBreadcrumb: { marginTop: 2, fontSize: 12, color: COLORS.grayText },
  iconSquareBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },

  projectRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, paddingVertical: 10, paddingHorizontal: 12 },
  projectIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.soft, alignItems: 'center', justifyContent: 'center' },
  projectRowText: { flex: 1, fontSize: 13, fontWeight: '800', color: COLORS.foreground || COLORS.dark },

  filtersModalRoot: { flex: 1, flexDirection: 'row' },
  filtersBackdrop: { flex: 1, backgroundColor: COLORS.foreground || COLORS.dark, opacity: 0.35 },
  filtersDrawer: { backgroundColor: COLORS.background, borderRightWidth: 1, borderRightColor: COLORS.border, paddingHorizontal: 16, paddingTop: 16 },
  filtersHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  filtersTitle: { fontSize: 14, fontWeight: '900', color: COLORS.foreground || COLORS.dark },
  filtersCloseBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },

  filtersSectionLabel: { marginTop: 4, fontSize: 11, fontWeight: '900', color: COLORS.grayText, letterSpacing: 0.6 },
  filtersSearchWrap: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  filtersSearchInput: { flex: 1, color: COLORS.foreground || COLORS.dark, fontSize: 13, paddingVertical: 0 },

  filtersSegmentRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segmentBtn: { flex: 1, height: 34, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segmentText: { fontSize: 12, fontWeight: '900', color: COLORS.grayText },
  segmentTextActive: { color: COLORS.white },

  projectListItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  projectListItemActive: { backgroundColor: COLORS.soft, borderColor: COLORS.soft },
  projectListText: { flex: 1, fontSize: 13, fontWeight: '800', color: COLORS.foreground || COLORS.dark },
  projectListTextActive: { color: COLORS.primary },

  statsWrapper: { marginTop: 10 },
  statsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statsIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.soft, alignItems: 'center', justifyContent: 'center' },
  statsTitleText: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.foreground || COLORS.dark },
  statsLoadingText: { color: COLORS.grayText, fontSize: 12, paddingVertical: 6 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statCard: { width: '19%', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' },
  statCardPrimary: { borderColor: COLORS.primary },
  statCardPrimarySoft: { borderColor: COLORS.primary },
  statCardDangerSoft: { borderColor: COLORS.danger },
  statLabel: { fontSize: 9, fontWeight: '700', color: COLORS.grayText, textTransform: 'uppercase', letterSpacing: 0.4 },
  statLabelPrimary: { color: COLORS.primary },
  statLabelDanger: { color: COLORS.danger },
  statValue: { marginTop: 6, fontSize: 15, fontWeight: '800', color: COLORS.foreground || COLORS.dark },
  statValuePrimary: { color: COLORS.primary },
  statValueDanger: { color: COLORS.danger },
  statHint: { marginTop: 2, fontSize: 9, color: COLORS.grayText },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 6 },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, color: COLORS.foreground || COLORS.dark, fontSize: 13, paddingVertical: 0 },
  calendarBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  newBtn: { height: 40, borderRadius: 12, backgroundColor: COLORS.primary, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  newBtnText: { color: COLORS.white, fontWeight: '900', fontSize: 13 },

  tabsRow: { flexDirection: 'row', gap: 18, marginTop: 8, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: '900', color: COLORS.grayText },
  tabTextActive: { color: COLORS.primary },

  serviceCard: { padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.white },
  serviceTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  serviceTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  serviceLeftIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.soft, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  serviceOnlineDot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 99, borderWidth: 2, borderColor: COLORS.white },
  serviceTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: COLORS.foreground || COLORS.dark },
  serviceDate: { fontSize: 11, color: COLORS.grayText },
  serviceLine: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  serviceLineText: { flex: 1, fontSize: 12, color: COLORS.grayText },
  serviceChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },

  badgeOutline: { maxWidth: '70%', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  badgeOutlineText: { fontSize: 10, fontWeight: '900', color: COLORS.foreground || COLORS.dark },

  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.soft },
  badgeText: { fontSize: 10, fontWeight: '900', color: COLORS.grayText },
  badgePrimary: { borderColor: COLORS.primary, backgroundColor: COLORS.soft },
  badgeTextPrimary: { color: COLORS.primary },
  badgeSuccess: { borderColor: COLORS.success, backgroundColor: COLORS.soft },
  badgeTextSuccess: { color: COLORS.success },
  badgeDanger: { borderColor: COLORS.danger, backgroundColor: COLORS.soft },
  badgeTextDanger: { color: COLORS.danger },

  badgeOutlineSuccess: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.success, backgroundColor: COLORS.white },
  badgeOutlineSuccessText: { fontSize: 10, fontWeight: '900', color: COLORS.success },

  badgeDangerSoft: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.danger, backgroundColor: COLORS.soft },
  badgeDangerSoftText: { fontSize: 10, fontWeight: '900', color: COLORS.danger },
});
