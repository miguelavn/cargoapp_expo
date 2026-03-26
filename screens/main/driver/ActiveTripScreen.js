import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useNetInfo } from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import polyline from '@mapbox/polyline';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/colors';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { sendLocalNotification } from '../../../services/notifications';
import { consumeDriverCanceled, markDriverCanceled, unmarkDriverCanceled } from '../../../services/driverCancelTracker';
import {
  clearPersistedActiveTrip,
  enqueueOfflineEvent,
  getOfflineEventsCount,
  getPersistedActiveTrip,
  persistActiveTrip,
  syncOfflineEventsQueue,
} from '../../../services/offlineTrip';

function getStatusUpperFromService(service) {
  const raw = String(service?.status_name || '').trim();
  if (raw) return raw.toUpperCase();
  const sid = Number(service?.status_id);
  if (sid === 1) return 'CREATED';
  if (sid === 2) return 'ACCEPTED';
  if (sid === 3) return 'LOADED';
  if (sid === 4) return 'DELIVERED';
  if (sid === 5) return 'CANCELED';
  return '';
}

function getStatusDisplayName(statusUpper) {
  const s = String(statusUpper || '').toUpperCase();
  if (s === 'CREATED') return 'Creado';
  if (s === 'ACCEPTED') return 'Aceptado';
  if (s === 'LOADED') return 'Cargado';
  if (s === 'DELIVERED') return 'Entregado';
  if (s === 'CANCELED') return 'Cancelado';
  return '—';
}

function isTerminalStatus(statusUpper) {
  const s = String(statusUpper || '').toUpperCase();
  return s === 'DELIVERED' || s === 'CANCELED';
}

function isServicePaused(service) {
  const sub = String(service?.substatus_name || '').toUpperCase();
  if (sub === 'PAUSED') return true;
  return service?.pause_reason_id != null;
}

function normalizeServiceRow(row) {
  if (!row || typeof row !== 'object') return row;
  const originId = row.origin ?? row.origin_id ?? row.originId ?? null;
  const destinationId = row.destination ?? row.destination_id ?? row.destinationId ?? null;

  return {
    ...row,
    origin: originId ?? row.origin,
    destination: destinationId ?? row.destination,
  };
}

function toLatLngFromMaybeGeography(maybe, depth = 0) {
  // Soporta:
  // - { location: { coordinates: [lng, lat] } }
  // - { coordinates: [lng, lat] }
  // - { type: 'Point', coordinates: [lng, lat] }
  // - "POINT(lng lat)" o "SRID=4326;POINT(lng lat)"
  // - "lng,lat"
  // - [lng, lat]
  if (!maybe) return null;

  if (depth > 3) return null;

  const parseWkbPoint = (bytes) => {
    try {
      if (!bytes || bytes.length < 21) return null;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const littleEndian = dv.getUint8(0) === 1;
      const typeInt = dv.getUint32(1, littleEndian);
      const hasSrid = (typeInt & 0x20000000) !== 0;
      const baseType = typeInt & 0x0000ffff;
      if (baseType !== 1) return null;
      let offset = 5;
      if (hasSrid) offset += 4;
      const x = dv.getFloat64(offset, littleEndian); // lng
      const y = dv.getFloat64(offset + 8, littleEndian); // lat
      if (!Number.isNaN(x) && !Number.isNaN(y) && Math.abs(y) <= 90 && Math.abs(x) <= 180) {
        return { latitude: y, longitude: x };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Si viene como { location: <string|object|array> } (como origin_address/destination_address)
  if (maybe && typeof maybe === 'object' && !Array.isArray(maybe)) {
    // Algunas fuentes pueden serializar geography como { type: 'Buffer', data: [..] }
    if (maybe?.type === 'Buffer' && Array.isArray(maybe?.data)) {
      const bytes = new Uint8Array(maybe.data.map((v) => Number(v) & 0xff));
      const parsed = parseWkbPoint(bytes);
      if (parsed) return parsed;
    }

    // Uint8Array / ArrayBuffer (por si llega desde algún bridge)
    if (typeof Uint8Array !== 'undefined' && maybe instanceof Uint8Array) {
      const parsed = parseWkbPoint(maybe);
      if (parsed) return parsed;
    }

    // GeoJSON wrappers: { geometry: { type, coordinates } }
    if (maybe.geometry != null) {
      const nested = toLatLngFromMaybeGeography(maybe.geometry, depth + 1);
      if (nested) return nested;
    }

    // Soportar objetos estilo { latitude, longitude } o { lat, lng }
    const latLike = maybe.latitude ?? maybe.lat;
    const lngLike = maybe.longitude ?? maybe.lng ?? maybe.lon;
    if (latLike != null && lngLike != null) {
      const lat0 = Number(latLike);
      const lng0 = Number(lngLike);
      if (!Number.isNaN(lat0) && !Number.isNaN(lng0) && Math.abs(lat0) <= 90 && Math.abs(lng0) <= 180) {
        return { latitude: lat0, longitude: lng0 };
      }
    }

    if (maybe.location != null) {
      const nested = toLatLngFromMaybeGeography(maybe.location, depth + 1);
      if (nested) return nested;
    }
  }

  if (typeof maybe === 'string') {
    const raw = maybe.trim();

    // PostGIS EWKB/WKB hex (a veces "\\x010100..." o "010100...")
    const hexRaw = raw.startsWith('\\x') ? raw.slice(2) : (raw.startsWith('0x') ? raw.slice(2) : raw);
    if (/^[0-9a-fA-F]+$/.test(hexRaw) && hexRaw.length >= 18) {
      try {
        const bytesLen = Math.floor(hexRaw.length / 2);
        const bytes = new Uint8Array(bytesLen);
        for (let i = 0; i < bytesLen; i++) {
          bytes[i] = parseInt(hexRaw.slice(i * 2, i * 2 + 2), 16);
        }
        const parsed = parseWkbPoint(bytes);
        if (parsed) return parsed;
      } catch {
        // ignore
      }
    }

    // JSON string (ej: {"type":"Point","coordinates":[lng,lat]} o [lng,lat])
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try {
        const parsed = JSON.parse(raw);
        const nested = toLatLngFromMaybeGeography(parsed, depth + 1);
        if (nested) return nested;
      } catch {
        // ignore
      }
    }

    // WKT: POINT(lng lat)
    const m = raw.match(/POINT\s*\(\s*([+-]?[0-9]*\.?[0-9]+)\s+([+-]?[0-9]*\.?[0-9]+)\s*\)/i);
    if (m) {
      const lng0 = Number(m[1]);
      const lat0 = Number(m[2]);
      if (!Number.isNaN(lat0) && !Number.isNaN(lng0)) {
        if (Math.abs(lat0) > 90 || Math.abs(lng0) > 180) return null;
        return { latitude: lat0, longitude: lng0 };
      }
    }

    // "lng,lat"
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const lng0 = Number(parts[0]);
      const lat0 = Number(parts[1]);
      if (!Number.isNaN(lat0) && !Number.isNaN(lng0)) {
        if (Math.abs(lat0) > 90 || Math.abs(lng0) > 180) return null;
        return { latitude: lat0, longitude: lng0 };
      }
    }
  }

  const coords = Array.isArray(maybe)
    ? maybe
    : (maybe?.location?.coordinates || maybe?.coordinates || null);

  if (!Array.isArray(coords) || coords.length < 2) return null;

  let lng = Number(coords[0]);
  let lat = Number(coords[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  // Heurística: si vienen invertidos como [lat,lng].
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

function approxMetersBetween(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDegrees(from, to) {
  if (!from || !to) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const toDeg = (v) => (v * 180) / Math.PI;

  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  const normalized = (brng + 360) % 360;
  if (Number.isNaN(normalized)) return null;
  return normalized;
}

function decodeGooglePolyline(encoded) {
  if (!encoded) return [];
  try {
    // @mapbox/polyline decode devuelve [[lat,lng], ...] (NO invertir)
    const pairs = polyline.decode(encoded);
    return pairs.map(([lat, lng]) => ({ latitude: Number(lat), longitude: Number(lng) }))
      .filter((p) => !Number.isNaN(p.latitude) && !Number.isNaN(p.longitude));
  } catch {
    return [];
  }
}

function isIgnorableQueueSyncError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('duplicate') ||
    msg.includes('already processed') ||
    msg.includes('already applied') ||
    msg.includes('already exists') ||
    msg.includes('ya existe') ||
    msg.includes('ya fue') ||
    msg.includes('ya se encuentra') ||
    msg.includes('same status') ||
    msg.includes('unique constraint') ||
    msg.includes('conflict')
  );
}

export default function ActiveTripScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const fitModeRef = useRef(null); // 'driverPickup' | 'pickupDropoff'
  const locationSubRef = useRef(null);
  const lastDriverCoordRef = useRef(null);
  const lastDriverRouteFetchAtRef = useRef(0);
  const lastDriverRouteFromRef = useRef(null);
  const prevServiceIdRef = useRef(null);
  const cachedPickupServiceIdRef = useRef(null);
  const cachedDestinationServiceIdRef = useRef(null);

  const exitOnceRef = useRef(false);
  const netInfo = useNetInfo();

  const routeServiceId = route?.params?.serviceId ?? route?.params?.service?.service_id ?? null;
  const [service, setService] = useState(route?.params?.service || null);

  useEffect(() => {
    setService(route?.params?.service || null);
  }, [route?.params?.service]);

  const refreshOfflineQueueCount = async () => {
    try {
      const count = await getOfflineEventsCount();
      setPendingOfflineEvents(Number(count) || 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshOfflineQueueCount();
  }, []);

  const originCoord = useMemo(() => {
    return (
      toLatLngFromMaybeGeography(service?.origin_location) ||
      toLatLngFromMaybeGeography(service?.origin_address) ||
      toLatLngFromMaybeGeography(service?.origin)
    );
  }, [service]);

  const destinationCoord = useMemo(() => {
    return (
      toLatLngFromMaybeGeography(service?.destination_location) ||
      toLatLngFromMaybeGeography(service?.destination_address) ||
      toLatLngFromMaybeGeography(service?.destination)
    );
  }, [service]);

  // Restaurar viaje/cache desde almacenamiento local para soportar relanzar sin internet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sid = routeServiceId ?? service?.service_id;
      if (!sid) return;
      try {
        const trip = await getPersistedActiveTrip();
        if (!trip || String(trip?.active_service_id || '') !== String(sid)) return;
        if (cancelled) return;

        if (trip?.service && !service) {
          setService((prev) => ({ ...prev, ...trip.service }));
        }

        const cachedPickup = Array.isArray(trip?.cachedRouteToPickup) ? trip.cachedRouteToPickup : [];
        const cachedDestination = Array.isArray(trip?.cachedRouteToDestination) ? trip.cachedRouteToDestination : [];

        if (cachedPickup.length >= 2) {
          setCachedRouteToPickup(cachedPickup);
          setRouteToPickup(cachedPickup);
          cachedPickupServiceIdRef.current = sid;
        }
        if (cachedDestination.length >= 2) {
          setCachedRouteToDestination(cachedDestination);
          setRouteToDestination(cachedDestination);
          cachedDestinationServiceIdRef.current = sid;
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeServiceId, service?.service_id]);

  // Si el servicio que llega por navegación no trae coordenadas (ej: viene del driver-dashboard),
  // hidratarlo vía Supabase (RLS) usando service_id.
  const hydrateTriedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const sid = routeServiceId ?? service?.service_id;
      if (!sid) return;
      if (hydrateTriedRef.current) return;

      const hasOrigin = !!(
        toLatLngFromMaybeGeography(service?.origin_location) ||
        toLatLngFromMaybeGeography(service?.origin_address) ||
        toLatLngFromMaybeGeography(service?.origin)
      );
      const hasDest = !!(
        toLatLngFromMaybeGeography(service?.destination_location) ||
        toLatLngFromMaybeGeography(service?.destination_address) ||
        toLatLngFromMaybeGeography(service?.destination)
      );

      const hasStatus = !!String(service?.status_name || '').trim() || (service?.status_id != null);
      const hasMaterial = !!String(service?.material_name || '').trim();

      if (hasOrigin && hasDest && hasStatus && hasMaterial) {
        // Si ya tenemos lo esencial, evitar llamadas innecesarias.
        return;
      }

      hydrateTriedRef.current = true;

      // 0) Preferir Edge Function (usa service role y ya agregaste permiso de driver)
      try {
        const res = await callEdgeFunction('list-services', {
          method: 'GET',
          query: { service_id: Number(sid) },
          timeout: 30000,
        });

        const row = normalizeServiceRow(res?.data ?? null);
        if (row && !cancelled) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.log('[ActiveTrip] hydrated(list-services)', {
              service_id: row?.service_id,
              origin_id: row?.origin ?? row?.origin_id,
              destination_id: row?.destination ?? row?.destination_id,
              origin_location_type: typeof row?.origin_location,
              destination_location_type: typeof row?.destination_location,
              origin_location_preview:
                typeof row?.origin_location === 'string'
                  ? row.origin_location.slice(0, 32)
                  : (row?.origin_location && typeof row.origin_location === 'object')
                    ? Object.keys(row.origin_location).slice(0, 6)
                    : row?.origin_location,
              destination_location_preview:
                typeof row?.destination_location === 'string'
                  ? row.destination_location.slice(0, 32)
                  : (row?.destination_location && typeof row.destination_location === 'object')
                    ? Object.keys(row.destination_location).slice(0, 6)
                    : row?.destination_location,
              origin_addr_loc_type: typeof row?.origin_address?.location,
              destination_addr_loc_type: typeof row?.destination_address?.location,
            });
          }
          setService((prev) => ({ ...prev, ...row }));
          return;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ActiveTrip] No se pudo hidratar via list-services', e?.message || e);
      }

      const selectColsView = [
        'service_id',
        'origin_location',
        'destination_location',
        'origin_address',
        'destination_address',
        'material_id',
        'material_name',
        'unit_id',
        'unit_name',
        'quantity',
        'status_id',
        'status_name',
        'substatus_id',
        'substatus_name',
        'pause_reason_id',
        'origin_id',
        'destination_id',
      ].join(',');

      const selectColsServices = [
        'service_id',
        'origin_location',
        'destination_location',
        'origin_address',
        'destination_address',
        // En tabla `services` normalmente existen los IDs/qty (los nombres suelen venir por vista/joins)
        'material_id',
        'unit_id',
        'quantity',
        'status_id',
        'substatus_id',
        'pause_reason_id',
        'origin',
        'destination',
      ].join(',');

      // 1) Preferir vista (si existe y RLS permite)
      try {
        const { data, error } = await supabase
          .from('services_full_view')
          .select(selectColsView)
          .eq('service_id', Number(sid))
          .maybeSingle();
        const normalized = normalizeServiceRow(data);
        if (!error && normalized && !cancelled) {
          setService((prev) => ({ ...prev, ...normalized }));
          return;
        }
      } catch {
        // ignore
      }

      // 2) Fallback directo a tabla services
      try {
        const { data, error } = await supabase
          .from('services')
          .select(selectColsServices)
          .eq('service_id', Number(sid))
          .maybeSingle();
        if (error) throw error;
        const normalized = normalizeServiceRow(data);
        if (normalized && !cancelled) {
          setService((prev) => ({ ...prev, ...normalized }));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ActiveTrip] No se pudo hidratar servicio via supabase', e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeServiceId, service?.service_id]);

  useEffect(() => {
    // Si cambia el servicio, permitir rehidratar.
    hydrateTriedRef.current = false;
  }, [routeServiceId]);

  const originText = useMemo(() => {
    const raw = service?.origin_address;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') return String(raw?.address || service?.origin || '—');
    return String(service?.origin || '—');
  }, [service]);

  const materialText = useMemo(() => {
    const materialName = String(service?.material_name || '').trim();
    if (!materialName) return '';

    const unitName = String(service?.unit_name || '').trim();
    const qty = service?.quantity != null && String(service.quantity) !== '' ? String(service.quantity) : '';

    if (qty && unitName) return `${materialName} (${qty} ${unitName})`;
    if (qty) return `${materialName} (${qty})`;
    return materialName;
  }, [service]);

  const destinationText = useMemo(() => {
    const raw = service?.destination_address;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') return String(raw?.address || service?.destination || '—');
    return String(service?.destination || '—');
  }, [service]);

  const [driverCoord, setDriverCoord] = useState(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [routeToPickup, setRouteToPickup] = useState([]);
  const [routeToDestination, setRouteToDestination] = useState([]);
  const [cachedRouteToPickup, setCachedRouteToPickup] = useState(null);
  const [cachedRouteToDestination, setCachedRouteToDestination] = useState(null);
  const [tripStarted, setTripStarted] = useState(false);
  const [trackMarkerChanges, setTrackMarkerChanges] = useState(true);
  const [truckImageOk, setTruckImageOk] = useState(true);

  const [pauseReasons, setPauseReasons] = useState([]);
  const [pauseReasonsLoading, setPauseReasonsLoading] = useState(false);
  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [pauseActionLoading, setPauseActionLoading] = useState(false);
  const [pauseActionError, setPauseActionError] = useState('');

  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusActionError, setStatusActionError] = useState('');
  const [routeRecalcLoading, setRouteRecalcLoading] = useState(false);
  const [pendingOfflineEvents, setPendingOfflineEvents] = useState(0);
  const [isSyncingOfflineEvents, setIsSyncingOfflineEvents] = useState(false);
  const offlineSyncInFlightRef = useRef(false);
  const routeToPickupRef = useRef([]);

  const actionBusy = pauseActionLoading || statusActionLoading;

  useEffect(() => {
    routeToPickupRef.current = Array.isArray(routeToPickup) ? routeToPickup : [];
  }, [routeToPickup]);

  // react-native-maps (especialmente en Android) puede no renderizar
  // correctamente Markers con children si tracksViewChanges=false desde el inicio.
  // Lo dejamos true por un momento y luego lo apagamos.
  useEffect(() => {
    setTrackMarkerChanges(true);
    const t = setTimeout(() => setTrackMarkerChanges(false), 1500);
    return () => clearTimeout(t);
  }, [driverCoord, originCoord, destinationCoord]);

  const serviceId = routeServiceId ?? service?.service_id ?? null;
  const serviceIdStr = serviceId == null ? '' : String(serviceId);

  const isConnected = netInfo?.isConnected;
  const isInternetReachable = netInfo?.isInternetReachable;
  const isOnline = isConnected === true && isInternetReachable !== false;

  useEffect(() => {
    if (!serviceId) return;
    const status = getStatusUpperFromService(service);
    const substatus = String(service?.substatus_name || '').toUpperCase();

    (async () => {
      try {
        if (status === 'DELIVERED' || status === 'CANCELED') {
          await clearPersistedActiveTrip();
          return;
        }

        await persistActiveTrip({
          active_service_id: serviceId,
          service,
          status,
          substatus,
          cachedRouteToPickup,
          cachedRouteToDestination,
        });
      } catch {
        // ignore
      }
    })();
  }, [serviceId, service, cachedRouteToPickup, cachedRouteToDestination]);

  const statusUpper = useMemo(() => {
    return getStatusUpperFromService(service);
  }, [service]);

  // El "inicio" del viaje es implícito: al aceptar ya estás en viaje.
  // Usamos LOADED para cambiar el badge a "entregar".
  useEffect(() => {
    setTripStarted(statusUpper === 'LOADED' || statusUpper === 'DELIVERED');
  }, [statusUpper]);

  const canCoordinatorCancel = statusUpper === '' || statusUpper === 'CREATED' || statusUpper === 'ACCEPTED';

  const isPaused = useMemo(() => isServicePaused(service), [service]);

  const pauseReasonText = useMemo(() => {
    const rid = service?.pause_reason_id;
    if (rid == null) return '';
    const found = Array.isArray(pauseReasons)
      ? pauseReasons.find((r) => String(r?.id) === String(rid))
      : null;
    const name = String(found?.name || '').trim();
    if (name) return name;
    return '—';
  }, [service?.pause_reason_id, pauseReasons]);

  const isTerminal = isTerminalStatus(statusUpper);
  const canAccept = statusUpper === 'CREATED';
  const canReject = statusUpper === 'CREATED';
  const canPause = !isTerminal && !isPaused && (statusUpper === 'ACCEPTED' || statusUpper === 'LOADED');
  const canResume = !isTerminal && isPaused && (statusUpper === 'ACCEPTED' || statusUpper === 'LOADED');
  const canLoad = !isTerminal && !isPaused && statusUpper === 'ACCEPTED';
  const canDeliver = !isTerminal && !isPaused && statusUpper === 'LOADED';
  const showCompactActionRow = canPause && (canLoad || canDeliver);

  const hasCachedPickupForCurrentService = useMemo(() => {
    if (!Array.isArray(cachedRouteToPickup) || cachedRouteToPickup.length < 2) return false;
    return String(cachedPickupServiceIdRef.current || '') === serviceIdStr;
  }, [cachedRouteToPickup, serviceIdStr]);

  const hasCachedDestinationForCurrentService = useMemo(() => {
    if (!Array.isArray(cachedRouteToDestination) || cachedRouteToDestination.length < 2) return false;
    return String(cachedDestinationServiceIdRef.current || '') === serviceIdStr;
  }, [cachedRouteToDestination, serviceIdStr]);

  // Si cambia de servicio, limpiar cache/rutas para evitar mezclar polylines de otro viaje.
  useEffect(() => {
    const prev = prevServiceIdRef.current == null ? '' : String(prevServiceIdRef.current);
    if (prev && prev !== serviceIdStr) {
      setRouteToPickup([]);
      setRouteToDestination([]);
      setCachedRouteToPickup(null);
      setCachedRouteToDestination(null);
      cachedPickupServiceIdRef.current = null;
      cachedDestinationServiceIdRef.current = null;
      lastDriverRouteFetchAtRef.current = 0;
      lastDriverRouteFromRef.current = null;
    }
    prevServiceIdRef.current = serviceId;
  }, [serviceId, serviceIdStr]);

  const cancelNotifiedForServiceIdRef = useRef('');

  useEffect(() => {
    if (statusUpper !== 'CANCELED') return;
    const sid = serviceId;
    if (!sid) return;

    // Si el conductor canceló/rechazó, no mostrar una notificación que diga "coordinador".
    if (consumeDriverCanceled(sid)) return;

    // Evitar duplicados en la misma pantalla.
    if (String(cancelNotifiedForServiceIdRef.current) === String(sid)) return;
    cancelNotifiedForServiceIdRef.current = String(sid);

    // Notificación local visible incluso en foreground (via NotificationHandler).
    sendLocalNotification({
      title: 'Servicio cancelado',
      body: 'El coordinador canceló el servicio',
      data: { service_id: sid },
    });
  }, [statusUpper, serviceId]);

  useEffect(() => {
    // Auto-salida en estados terminales.
    if (exitOnceRef.current) return;
    if (!isTerminal) return;

    exitOnceRef.current = true;
    setPauseModalVisible(false);

    const t = setTimeout(() => {
      try {
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation.navigate('Principal');
        }
      } catch {
        // ignore
      }
    }, 350);

    return () => clearTimeout(t);
  }, [isTerminal, navigation]);

  const refetchService = async () => {
    const sid = serviceId;
    if (!sid) return;

    try {
      const res = await callEdgeFunction('list-services', {
        method: 'GET',
        query: { service_id: Number(sid) },
        timeout: 30000,
      });
      const row = normalizeServiceRow(res?.data ?? null);
      if (row) {
        setService((prev) => ({ ...prev, ...row }));
        return row;
      }
    } catch {
      // ignore
    }

    try {
      const { data } = await supabase
        .from('services')
        .select('service_id, status_id, substatus_id, pause_reason_id')
        .eq('service_id', Number(sid))
        .maybeSingle();
      if (data) {
        const normalized = normalizeServiceRow(data);
        setService((prev) => ({ ...prev, ...normalized }));
        return normalized;
      }
    } catch {
      // ignore
    }
  };

  // Sincronización inicial: aunque venga un servicio con status "stale", enganchar rápido.
  const initialSyncTriedRef = useRef(false);
  useEffect(() => {
    if (!serviceId) return;
    if (initialSyncTriedRef.current) return;
    initialSyncTriedRef.current = true;
    refetchService();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  // Escuchar cambios en el servicio (Realtime) por si el coordinador lo cancela.
  useEffect(() => {
    const sid = serviceId;
    if (!sid) return;

    if (!canCoordinatorCancel) return;

    let unsubscribed = false;

    const channel = supabase
      .channel(`service-${sid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'services',
          filter: `service_id=eq.${Number(sid)}`,
        },
        () => {
          if (unsubscribed) return;

          (async () => {
            await refetchService();
            // La salida terminal se maneja en el efecto por statusUpper.
          })();
        }
      )
      .subscribe();

    return () => {
      unsubscribed = true;
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
    // Ojo: usamos service?.status_name como fallback, pero no re-suscribimos por ese estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, canCoordinatorCancel]);

  const setServiceSubstatus = async (nextSubstatus, reasonId) => {
    const sid = serviceId;
    if (!sid) return;
    if (actionBusy) return;

    setPauseActionError('');
    const next = String(nextSubstatus || '').toUpperCase();
    const pauseReasonId = next === 'PAUSED' ? reasonId : null;

    if (!isOnline) {
      await enqueueOfflineEvent({
        service_id: Number(sid),
        status: null,
        substatus: next,
        pause_reason_id: pauseReasonId,
        created_at: new Date().toISOString(),
      });

      setService((prev) => ({
        ...prev,
        substatus_name: next,
        pause_reason_id: pauseReasonId,
      }));
      setPauseModalVisible(false);
      refreshOfflineQueueCount();
      return;
    }

    setPauseActionLoading(true);
    try {
      const body = {
        service_id: Number(sid),
        substatus: next,
      };

      if (next === 'PAUSED') {
        body.pause_reason_id = reasonId;
      }
      if (next === 'ACTIVED') {
        body.pause_reason_id = null;
      }

      await callEdgeFunction('driver-service-response', {
        method: 'POST',
        body: {
          ...body,
          created_at: new Date().toISOString(),
        },
        timeout: 20000,
      });

      // Optimista: actualizar UI inmediatamente tras éxito.
      setService((prev) => ({
        ...prev,
        substatus_name: next,
        pause_reason_id: next === 'PAUSED' ? reasonId : null,
      }));

      await refetchService();
    } catch (e) {
      setPauseActionError(e?.message || 'No se pudo actualizar la pausa');
      throw e;
    } finally {
      setPauseActionLoading(false);
    }
  };

  const setServiceStatus = async (nextStatus) => {
    const sid = serviceId;
    if (!sid) return;
    if (actionBusy) return;

    const next = String(nextStatus || '').toUpperCase();

    if (!isOnline && next === 'ACCEPTED') {
      setStatusActionError('Debes tener conexión para aceptar el servicio');
      return;
    }

    if (!isOnline && (next === 'LOADED' || next === 'DELIVERED')) {
      await enqueueOfflineEvent({
        service_id: Number(sid),
        status: next,
        substatus: null,
        pause_reason_id: null,
        created_at: new Date().toISOString(),
      });

      setService((prev) => ({
        ...prev,
        status_name: next,
        status_id: next === 'LOADED' ? 3 : 4,
      }));

      setStatusActionError('');
      refreshOfflineQueueCount();
      return;
    }

    setStatusActionError('');
    setStatusActionLoading(true);
    const isDriverCancel = next === 'CANCELED';
    if (isDriverCancel) {
      markDriverCanceled(sid);
    }
    try {
      await callEdgeFunction('driver-service-response', {
        method: 'POST',
        body: {
          service_id: Number(sid),
          status: next,
          created_at: new Date().toISOString(),
        },
        timeout: 20000,
      });

      // Optimista: actualizar UI inmediatamente tras éxito.
      setService((prev) => ({
        ...prev,
        status_name: next,
        status_id:
          next === 'CREATED'
            ? 1
            : next === 'ACCEPTED'
              ? 2
              : next === 'LOADED'
                ? 3
                : next === 'DELIVERED'
                  ? 4
                  : next === 'CANCELED'
                    ? 5
                    : prev?.status_id,
      }));

      await refetchService();
    } catch (e) {
      if (isDriverCancel) {
        unmarkDriverCanceled(sid);
      }
      setStatusActionError(e?.message || 'No se pudo actualizar el estado');
      throw e;
    } finally {
      setStatusActionLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPauseReasonsLoading(true);
      try {
        const { data, error } = await supabase
          .from('pause_reasons')
          .select('id, name')
          .order('name', { ascending: true });
        if (error) throw error;
        if (!cancelled) setPauseReasons(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPauseReasons([]);
      } finally {
        if (!cancelled) setPauseReasonsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackPickupToDropoffCoords = useMemo(() => {
    if (!originCoord || !destinationCoord) return [];
    return [originCoord, destinationCoord];
  }, [originCoord, destinationCoord]);

  const fallbackDriverToPickupCoords = useMemo(() => {
    if (!driverCoord || !originCoord) return [];
    return [driverCoord, originCoord];
  }, [driverCoord, originCoord]);

  const effectiveRouteToPickup = useMemo(() => {
    if (!isOnline && hasCachedPickupForCurrentService) return cachedRouteToPickup;
    if (routeToPickup?.length >= 2) return routeToPickup;
    return fallbackDriverToPickupCoords;
  }, [isOnline, hasCachedPickupForCurrentService, cachedRouteToPickup, routeToPickup, fallbackDriverToPickupCoords]);

  const effectiveRouteToDestination = useMemo(() => {
    if (!isOnline && hasCachedDestinationForCurrentService) return cachedRouteToDestination;
    if (routeToDestination?.length >= 2) return routeToDestination;
    return fallbackPickupToDropoffCoords;
  }, [isOnline, hasCachedDestinationForCurrentService, cachedRouteToDestination, routeToDestination, fallbackPickupToDropoffCoords]);

  const isShowingCachedRouteOffline = !isOnline && (hasCachedPickupForCurrentService || hasCachedDestinationForCurrentService);

  useEffect(() => {
    if (!isOnline) return;
    if (pendingOfflineEvents <= 0) return;
    if (offlineSyncInFlightRef.current) return;

    offlineSyncInFlightRef.current = true;
    setIsSyncingOfflineEvents(true);

    (async () => {
      try {
        const result = await syncOfflineEventsQueue(async (ev) => {
          try {
            await callEdgeFunction('driver-service-response', {
              method: 'POST',
              body: {
                service_id: Number(ev?.service_id),
                status: ev?.status || undefined,
                substatus: ev?.substatus || undefined,
                pause_reason_id: ev?.pause_reason_id ?? undefined,
                created_at: ev?.created_at || new Date().toISOString(),
              },
              timeout: 20000,
            });
          } catch (e) {
            if (isIgnorableQueueSyncError(e)) return { ack: true };
            throw e;
          }

          return { ack: true };
        });

        setPendingOfflineEvents(result?.remaining || 0);
        if ((result?.processed || 0) > 0) {
          await refetchService();
        }
      } catch {
        // ignore
      } finally {
        offlineSyncInFlightRef.current = false;
        setIsSyncingOfflineEvents(false);
        refreshOfflineQueueCount();
      }
    })();
  }, [isOnline, pendingOfflineEvents]);

  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    // compat (por si alguien ya configuró la otra variable)
    process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ||
    Constants?.expoConfig?.extra?.googleMapsApiKey ||
    '';

  useEffect(() => {
    if (!__DEV__) return;
    // eslint-disable-next-line no-console
    console.log('[ActiveTrip] coords', {
      driverCoord,
      originCoord,
      destinationCoord,
      hasDirectionsKey: !!googleMapsApiKey,
      serviceId: routeServiceId,
      routeToPickupLen: routeToPickup?.length || 0,
      routeToDestinationLen: routeToDestination?.length || 0,
    });
  }, [driverCoord, originCoord, destinationCoord, googleMapsApiKey, routeToPickup, routeToDestination, routeServiceId]);

  // Ubicación del conductor en tiempo real.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLocationError('');
        const existing = await Location.getForegroundPermissionsAsync();
        const req = existing?.status === 'granted'
          ? existing
          : await Location.requestForegroundPermissionsAsync();

        if (req?.status !== 'granted') {
          if (!cancelled) {
            setLocationError('Permiso de ubicación no concedido');
          }
          return;
        }

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const initialCoord = {
          latitude: Number(initial?.coords?.latitude),
          longitude: Number(initial?.coords?.longitude),
        };

        if (!cancelled && !Number.isNaN(initialCoord.latitude) && !Number.isNaN(initialCoord.longitude)) {
          lastDriverCoordRef.current = initialCoord;
          setDriverCoord(initialCoord);

          const h = Number(initial?.coords?.heading);
          if (!Number.isNaN(h) && h >= 0) setDriverHeading(h);
        }

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3500,
            distanceInterval: 10,
          },
          (loc) => {
            const next = {
              latitude: Number(loc?.coords?.latitude),
              longitude: Number(loc?.coords?.longitude),
            };
            if (Number.isNaN(next.latitude) || Number.isNaN(next.longitude)) return;

            const prev = lastDriverCoordRef.current;
            if (prev && approxMetersBetween(prev, next) < 3) return;

            const headingRaw = Number(loc?.coords?.heading);
            if (!Number.isNaN(headingRaw) && headingRaw >= 0) {
              setDriverHeading(headingRaw);
            } else if (prev) {
              const b = bearingDegrees(prev, next);
              if (b != null) setDriverHeading(b);
            }

            lastDriverCoordRef.current = next;
            setDriverCoord(next);
          }
        );

        locationSubRef.current = sub;
      } catch {
        if (!cancelled) {
          setLocationError('No se pudo obtener la ubicación (revisa permisos/GPS)');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        locationSubRef.current?.remove?.();
      } catch {
        // ignore
      }
      locationSubRef.current = null;
    };
  }, []);

  async function getRoute(from, to) {
    if (!from || !to) return [];
    if (!googleMapsApiKey) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[ActiveTrip] Google Maps API key vacía; usando línea recta');
      }
      return [from, to];
    }

    const origin = `${from.latitude},${from.longitude}`;
    const destination = `${to.latitude},${to.longitude}`;
    const url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&mode=driving` +
      `&key=${encodeURIComponent(googleMapsApiKey)}`;

    const res = await fetch(url);
    const json = await res.json();

    const apiStatus = String(json?.status || '');
    if (apiStatus && apiStatus !== 'OK') {
      const msg = json?.error_message ? `: ${json.error_message}` : '';
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[ActiveTrip] Directions no OK', {
          status: apiStatus,
          message: json?.error_message,
          routes: Array.isArray(json?.routes) ? json.routes.length : null,
        });
      }
      throw new Error(`Directions status ${apiStatus}${msg}`);
    }

    const points = json?.routes?.[0]?.overview_polyline?.points;
    const decoded = decodeGooglePolyline(points);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[ActiveTrip] Directions decoded', {
        pointsEncodedLen: typeof points === 'string' ? points.length : 0,
        coordsLen: decoded?.length || 0,
      });
    }
    return decoded?.length ? decoded : [from, to];
  }

  const recalculateRoutesManually = async () => {
    if (routeRecalcLoading || actionBusy) return;
    if (!isOnline) {
      setStatusActionError('Sin conexión: no se pueden recalcular rutas');
      return;
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isDetailedRoute = (coords) => Array.isArray(coords) && coords.length > 2;

    setStatusActionError('');
    setRouteRecalcLoading(true);
    try {
      // 1) Recalcular A -> B
      if (originCoord && destinationCoord) {
        const destCoords = await getRoute(originCoord, destinationCoord);
        if (Array.isArray(destCoords) && destCoords.length >= 2) {
          setRouteToDestination(destCoords);
          if (destCoords.length > 2) {
            setCachedRouteToDestination(destCoords);
            cachedDestinationServiceIdRef.current = serviceId;
          }
        }
      }

      // 2) Recalcular conductor -> A con reintentos cortos
      if (driverCoord && originCoord) {
        let pickupCoords = await getRoute(driverCoord, originCoord);
        if (!isDetailedRoute(pickupCoords)) {
          for (let i = 0; i < 2; i += 1) {
            await wait(900 + i * 500);
            const retry = await getRoute(driverCoord, originCoord);
            if (isDetailedRoute(retry)) {
              pickupCoords = retry;
              break;
            }
            if ((retry?.length || 0) > (pickupCoords?.length || 0)) {
              pickupCoords = retry;
            }
          }
        }

        if (isDetailedRoute(pickupCoords)) {
          setRouteToPickup(pickupCoords);
          setCachedRouteToPickup(pickupCoords);
          cachedPickupServiceIdRef.current = serviceId;
        } else if (hasCachedPickupForCurrentService) {
          setRouteToPickup(cachedRouteToPickup);
        } else {
          setRouteToPickup(fallbackDriverToPickupCoords);
        }
      }
    } catch {
      if (hasCachedPickupForCurrentService) {
        setRouteToPickup(cachedRouteToPickup);
      }
    } finally {
      setRouteRecalcLoading(false);
    }
  };

  // Ruta: (1) recogida -> entrega (una vez)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!originCoord || !destinationCoord) {
        setRouteToDestination([]);
        return;
      }

      if (!isOnline) {
        if (hasCachedDestinationForCurrentService) {
          setRouteToDestination(cachedRouteToDestination);
          return;
        }
        setRouteToDestination(fallbackPickupToDropoffCoords);
        return;
      }

      try {
        if (cancelled) return;
        const coords = await getRoute(originCoord, destinationCoord);
        if (cancelled) return;
        setRouteToDestination(coords);
        if (Array.isArray(coords) && coords.length >= 2) {
          setCachedRouteToDestination(coords);
          cachedDestinationServiceIdRef.current = serviceId;
        }
      } catch {
        if (cancelled) return;
        if (hasCachedDestinationForCurrentService) {
          setRouteToDestination(cachedRouteToDestination);
          return;
        }
        setRouteToDestination(fallbackPickupToDropoffCoords);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [originCoord, destinationCoord, fallbackPickupToDropoffCoords, googleMapsApiKey, isOnline, serviceId]);

  // Ruta: (2) conductor -> recogida (se actualiza con throttle)
  useEffect(() => {
    let cancelled = false;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const isDetailedRoute = (coords) => Array.isArray(coords) && coords.length > 2;

    const getDriverToPickupRouteWithRetry = async (from, to) => {
      // Primer intento inmediato
      let best = await getRoute(from, to);
      if (isDetailedRoute(best)) return best;

      // Reintentos cortos para casos transitorios de Directions (latencia/route warm-up)
      for (let i = 0; i < 2; i += 1) {
        await wait(900 + i * 500);
        const retry = await getRoute(from, to);
        if (isDetailedRoute(retry)) return retry;
        if ((retry?.length || 0) > (best?.length || 0)) best = retry;
      }

      return best;
    };

    (async () => {
      if (!driverCoord || !originCoord) {
        setRouteToPickup([]);
        return;
      }

      if (!isOnline) {
        if (hasCachedPickupForCurrentService) {
          setRouteToPickup(cachedRouteToPickup);
          return;
        }
        setRouteToPickup(fallbackDriverToPickupCoords);
        return;
      }

      const now = Date.now();
      const lastAt = lastDriverRouteFetchAtRef.current || 0;
      const prevFrom = lastDriverRouteFromRef.current;

      // Throttle para no golpear Directions en cada update.
      // Recalcula si pasaron 15s o si te moviste > 60m desde el último "from".
      const movedMeters = prevFrom ? approxMetersBetween(prevFrom, driverCoord) : Infinity;
      if (now - lastAt < 15000 && movedMeters < 60) return;

      lastDriverRouteFetchAtRef.current = now;
      lastDriverRouteFromRef.current = driverCoord;

      try {
        const coords = await getDriverToPickupRouteWithRetry(driverCoord, originCoord);
        if (cancelled) return;

        const detailed = isDetailedRoute(coords);

        if (__DEV__ && !detailed) {
          // eslint-disable-next-line no-console
          console.warn('[ActiveTrip] Ruta conductor→recogida sin detalle (línea recta). Posible ZERO_RESULTS/coord fuera de vía.', {
            coordsLen: coords?.length || 0,
          });
        }

        if (detailed) {
          setRouteToPickup(coords);
          setCachedRouteToPickup(coords);
          cachedPickupServiceIdRef.current = serviceId;
          return;
        }

        // Si no vino detalle, no degradar UX reemplazando una ruta buena ya dibujada.
        if (Array.isArray(routeToPickupRef.current) && routeToPickupRef.current.length > 2) {
          return;
        }

        if (hasCachedPickupForCurrentService) {
          setRouteToPickup(cachedRouteToPickup);
          return;
        }

        setRouteToPickup(fallbackDriverToPickupCoords);
      } catch {
        if (cancelled) return;
        if (Array.isArray(routeToPickupRef.current) && routeToPickupRef.current.length > 2) {
          return;
        }
        if (hasCachedPickupForCurrentService) {
          setRouteToPickup(cachedRouteToPickup);
          return;
        }
        setRouteToPickup(fallbackDriverToPickupCoords);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [driverCoord, originCoord, fallbackDriverToPickupCoords, isOnline, serviceId]);

  // Fit al cargar rutas reales para mostrar el recorrido completo.
  useEffect(() => {
    if (!isMapReady) return;
    if (!mapRef.current) return;

    const a = effectiveRouteToPickup || [];
    const b = effectiveRouteToDestination || [];
    const all = [...a, ...b].filter(Boolean);
    if (all.length < 2) return;

    // Evitar recalcular fit en cada tick mientras el conductor se mueve.
    if (fitModeRef.current === 'fullRoute') return;

    setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates?.(all, {
          edgePadding: {
            top: Math.round(insets.top + 90),
            right: 40,
            bottom: Math.round(insets.bottom + 240),
            left: 40,
          },
          animated: true,
        });
        fitModeRef.current = 'fullRoute';
      } catch {
        // ignore
      }
    }, 60);
  }, [isMapReady, effectiveRouteToPickup, effectiveRouteToDestination, insets.bottom, insets.top]);

  // Fit del mapa al entrar.
  // Preferencia:
  // - si ya tengo ubicación del conductor y origen: enfocar conductor + recogida
  // - si no: origen + destino
  useEffect(() => {
    if (!isMapReady) return;
    if (!mapRef.current) return;

    const canFitDriverPickup = !!(driverCoord && originCoord);
    const canFitPickupDropoff = !!(originCoord && destinationCoord);
    if (!canFitDriverPickup && !canFitPickupDropoff) return;

    // Si primero hicimos fit a pickup+dropoff, cuando llegue GPS hacemos "upgrade" a driver+pickup.
    if (fitModeRef.current === 'driverPickup') return;

    const nextMode = canFitDriverPickup ? 'driverPickup' : 'pickupDropoff';
    if (fitModeRef.current && fitModeRef.current === nextMode) return;

    const coords = canFitDriverPickup ? [driverCoord, originCoord] : [originCoord, destinationCoord];
    setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates?.(coords, {
          edgePadding: {
            top: Math.round(insets.top + 90),
            right: 40,
            bottom: Math.round(insets.bottom + 240),
            left: 40,
          },
          animated: true,
        });
        fitModeRef.current = nextMode;
      } catch {
        // ignore
      }
    }, 60);
  }, [isMapReady, driverCoord, originCoord, destinationCoord, insets.bottom, insets.top]);

  // Si no hay coords del servicio todavía, al menos centra en la ubicación del conductor.
  useEffect(() => {
    if (!isMapReady) return;
    if (!mapRef.current) return;
    if (!driverCoord) return;
    if (originCoord) return; // cuando haya origen, el fit se encarga.

    // Evitar re-centrar infinito
    if (fitModeRef.current === 'driverOnly') return;
    fitModeRef.current = 'driverOnly';

    try {
      mapRef.current?.animateToRegion?.({
        latitude: driverCoord.latitude,
        longitude: driverCoord.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 600);
    } catch {
      // ignore
    }
  }, [isMapReady, driverCoord, originCoord]);

  const badgeText = locationError
    ? locationError
    : isTerminal
      ? (statusUpper === 'DELIVERED' ? 'Servicio entregado' : 'Servicio cancelado')
      : isPaused
        ? 'Servicio pausado'
        : (tripStarted ? 'En camino a entregar' : 'En camino a recoger');

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        onMapReady={() => setIsMapReady(true)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        initialRegion={
          (driverCoord || originCoord)
            ? {
                latitude: (driverCoord || originCoord).latitude,
                longitude: (driverCoord || originCoord).longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }
            : {
                // fallback neutral para evitar saltos raros antes de GPS.
                latitude: 0,
                longitude: 0,
                latitudeDelta: 60,
                longitudeDelta: 60,
              }
        }
      >
        {originCoord ? (
          <Marker
            coordinate={originCoord}
            title="A - Recoger"
            description={originText}
            tracksViewChanges={trackMarkerChanges}
            anchor={{ x: 0.5, y: 0.9 }}
          >
            <View style={[styles.letterMarker, { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}>
              <Text style={styles.letterMarkerText}>A</Text>
            </View>
          </Marker>
        ) : null}

        {destinationCoord ? (
          <Marker
            coordinate={destinationCoord}
            title="B - Entregar"
            description={destinationText}
            tracksViewChanges={trackMarkerChanges}
            anchor={{ x: 0.5, y: 0.9 }}
          >
            <View style={[styles.letterMarker, { backgroundColor: COLORS.success, borderColor: COLORS.success }]}>
              <Text style={styles.letterMarkerText}>B</Text>
            </View>
          </Marker>
        ) : null}

        {driverCoord ? (
          <Marker
            coordinate={driverCoord}
            title="Vehículo"
            tracksViewChanges={trackMarkerChanges}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.vehicleMarker}>
              <View style={{ transform: [{ rotate: `${Number(driverHeading) || 0}deg` }] }}>
                <Image
                  source={require('../../../assets/camion-de-carga.png')}
                  style={styles.vehicleMarkerImage}
                  resizeMode="contain"
                  onError={() => setTruckImageOk(false)}
                />
                {!truckImageOk ? (
                  <MaterialCommunityIcons
                    name="truck"
                    size={22}
                    color={COLORS.foreground || COLORS.dark}
                    style={styles.vehicleMarkerVectorFallback}
                  />
                ) : null}
              </View>
            </View>
          </Marker>
        ) : null}

        {effectiveRouteToPickup?.length >= 2 ? (
          <Polyline
            coordinates={effectiveRouteToPickup}
            strokeColor={COLORS.primary}
            strokeWidth={5}
          />
        ) : null}

        {effectiveRouteToDestination?.length >= 2 ? (
          <Polyline
            coordinates={effectiveRouteToDestination}
            strokeColor={COLORS.success}
            strokeWidth={4}
          />
        ) : null}
      </MapView>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={[styles.topBadgeWrap, { paddingTop: insets.top + 10 }]} pointerEvents="none">
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>{badgeText}</Text>
          </View>
          {pendingOfflineEvents > 0 ? (
            <View style={styles.pendingEventsBadge}>
              <Text style={styles.pendingEventsBadgeText}>
                {isSyncingOfflineEvents
                  ? `Sincronizando ${pendingOfflineEvents} evento(s)…`
                  : `Eventos pendientes por sincronizar: ${pendingOfflineEvents}`}
              </Text>
            </View>
          ) : null}
          {isShowingCachedRouteOffline ? (
            <View style={styles.offlineRouteBadge}>
              <Text style={styles.offlineRouteBadgeText}>Sin conexión: mostrando última ruta disponible</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.bottomCardWrap, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
          <View style={styles.bottomCard}>
            <Text style={styles.bottomTitle}>Viaje activo</Text>

            <View style={{ height: 10 }} />

            {!!materialText && (
              <>
                <Text style={styles.label}>Material</Text>
                <Text style={styles.value} numberOfLines={2}>{materialText}</Text>
                <View style={{ height: 10 }} />
              </>
            )}

            <Text style={styles.label}>Origen</Text>
            <Text style={styles.value} numberOfLines={2}>{originText}</Text>

            <View style={{ height: 10 }} />

            <Text style={styles.label}>Destino</Text>
            <Text style={styles.value} numberOfLines={2}>{destinationText}</Text>

            <View style={{ height: 10 }} />

            <Text style={styles.modalMuted}>Estado: {getStatusDisplayName(statusUpper)}</Text>
            {isPaused ? (
              <Text style={styles.modalMuted}>Razón de pausa: {pauseReasonText}</Text>
            ) : null}

            <View style={{ height: 12 }} />

            <Pressable
              onPress={recalculateRoutesManually}
              disabled={routeRecalcLoading || actionBusy || !isOnline}
              style={[
                styles.recalcBtn,
                (routeRecalcLoading || actionBusy || !isOnline) && styles.btnDisabled,
              ]}
            >
              <MaterialCommunityIcons name="routes" size={16} color="#0A4F80" />
              <Text style={styles.recalcBtnText}>
                {routeRecalcLoading ? 'Recalculando rutas…' : 'Recalcular rutas'}
              </Text>
            </Pressable>

            <View style={{ height: 12 }} />

            {canResume ? (
              <Pressable
                onPress={async () => {
                  if (actionBusy) return;
                  try {
                    await setServiceSubstatus('ACTIVED');
                  } catch {
                    // error ya seteado
                  }
                }}
                disabled={actionBusy}
                style={[styles.primaryBtn, styles.primaryBtnSuccess, actionBusy && styles.btnDisabled]}
              >
                <Text style={styles.primaryBtnText}>
                  {actionBusy ? 'Reanudando…' : 'Reanudar servicio'}
                </Text>
              </Pressable>
            ) : showCompactActionRow ? (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => {
                    if (actionBusy) return;
                    setPauseActionError('');
                    setPauseModalVisible(true);
                  }}
                  disabled={actionBusy}
                  style={[styles.primaryBtn, styles.primaryBtnGhost, styles.btnRowLeft, actionBusy && styles.btnDisabled]}
                >
                  <Text style={[styles.primaryBtnText, styles.primaryBtnGhostText]}>
                    {actionBusy ? 'Procesando…' : 'Pausar servicio'}
                  </Text>
                </Pressable>

                {canLoad ? (
                  <Pressable
                    onPress={async () => {
                      if (actionBusy) return;
                      try {
                        await setServiceStatus('LOADED');
                      } catch {
                        // error ya seteado
                      }
                    }}
                    disabled={actionBusy}
                    style={[styles.primaryBtn, styles.primaryBtnSuccess, styles.btnRowRight, actionBusy && styles.btnDisabled]}
                  >
                    <Text style={styles.primaryBtnText}>{actionBusy ? 'Guardando…' : 'Ya cargué'}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={async () => {
                      if (actionBusy) return;
                      try {
                        await setServiceStatus('DELIVERED');
                      } catch {
                        // error ya seteado
                      }
                    }}
                    disabled={actionBusy}
                    style={[styles.primaryBtn, styles.primaryBtnSuccess, styles.btnRowRight, actionBusy && styles.btnDisabled]}
                  >
                    <Text style={styles.primaryBtnText}>{actionBusy ? 'Guardando…' : 'Ya entregué'}</Text>
                  </Pressable>
                )}
              </View>
            ) : canPause ? (
              <Pressable
                onPress={() => {
                  if (actionBusy) return;
                  setPauseActionError('');
                  setPauseModalVisible(true);
                }}
                disabled={actionBusy}
                style={[styles.primaryBtn, styles.primaryBtnGhost, actionBusy && styles.btnDisabled]}
              >
                <Text style={[styles.primaryBtnText, styles.primaryBtnGhostText]}>
                  {actionBusy ? 'Procesando…' : 'Pausar servicio'}
                </Text>
              </Pressable>
            ) : null}

            {pauseActionError ? (
              <Text style={styles.inlineError}>{pauseActionError}</Text>
            ) : null}

            {(canResume || canPause) ? <View style={{ height: 10 }} /> : null}

            {isTerminal ? null : canAccept || canReject ? (
              <>
                {canAccept ? (
                  <Pressable
                    onPress={async () => {
                      if (actionBusy) return;
                      try {
                        await setServiceStatus('ACCEPTED');
                      } catch {
                        // error ya seteado
                      }
                    }}
                    disabled={actionBusy}
                    style={[styles.primaryBtn, styles.primaryBtnSuccess, actionBusy && styles.btnDisabled]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {actionBusy ? 'Guardando…' : 'Aceptar servicio'}
                    </Text>
                  </Pressable>
                ) : null}

                <View style={{ height: 10 }} />

                {canReject ? (
                  <Pressable
                    onPress={async () => {
                      if (actionBusy) return;
                      try {
                        await setServiceStatus('CANCELED');
                      } catch {
                        // error ya seteado
                      }
                    }}
                    disabled={actionBusy}
                    style={[styles.primaryBtn, styles.primaryBtnDanger, actionBusy && styles.btnDisabled]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {actionBusy ? 'Guardando…' : 'Rechazar servicio'}
                    </Text>
                  </Pressable>
                ) : null}

                {statusActionError ? (
                  <Text style={styles.inlineError}>{statusActionError}</Text>
                ) : null}
              </>
            ) : showCompactActionRow ? null : canLoad ? (
              <>
                <Pressable
                  onPress={async () => {
                    if (actionBusy) return;
                    try {
                      await setServiceStatus('LOADED');
                    } catch {
                      // error ya seteado
                    }
                  }}
                  disabled={actionBusy}
                  style={[styles.primaryBtn, styles.primaryBtnSuccess, actionBusy && styles.btnDisabled]}
                >
                  <Text style={styles.primaryBtnText}>
                    {actionBusy ? 'Guardando…' : 'Ya cargué'}
                  </Text>
                </Pressable>

                {statusActionError ? (
                  <Text style={styles.inlineError}>{statusActionError}</Text>
                ) : null}

                <View style={{ height: 10 }} />
              </>
            ) : canDeliver ? (
              <>
                <Pressable
                  onPress={async () => {
                    if (actionBusy) return;
                    try {
                      await setServiceStatus('DELIVERED');
                    } catch {
                      // error ya seteado
                    }
                  }}
                  disabled={actionBusy}
                  style={[styles.primaryBtn, styles.primaryBtnSuccess, actionBusy && styles.btnDisabled]}
                >
                  <Text style={styles.primaryBtnText}>
                    {actionBusy ? 'Guardando…' : 'Ya entregué'}
                  </Text>
                </Pressable>

                {statusActionError ? (
                  <Text style={styles.inlineError}>{statusActionError}</Text>
                ) : null}

                <View style={{ height: 10 }} />
              </>
            ) : null}

            {showCompactActionRow && statusActionError ? (
              <Text style={styles.inlineError}>{statusActionError}</Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {pauseModalVisible ? (
        <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Selecciona una razón de pausa</Text>
            <View style={{ height: 10 }} />

            {pauseReasonsLoading ? (
              <View style={styles.centerRow}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.modalMuted}>Cargando razones…</Text>
              </View>
            ) : pauseReasons?.length ? (
              <ScrollView style={styles.modalList} contentContainerStyle={{ paddingVertical: 6 }}>
                {pauseReasons.map((r) => (
                  <Pressable
                    key={String(r?.id)}
                    onPress={async () => {
                      if (actionBusy) return;
                      try {
                        await setServiceSubstatus('PAUSED', r?.id);
                        setPauseModalVisible(false);
                      } catch {
                        // mantener abierto si falla
                      }
                    }}
                    disabled={actionBusy}
                    style={[
                      styles.reasonRow,
                      actionBusy && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.reasonText}>{String(r?.name || '—')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.modalMuted}>No hay razones disponibles.</Text>
            )}

            <View style={{ height: 12 }} />

            <Pressable
              onPress={() => setPauseModalVisible(false)}
              disabled={actionBusy}
              style={[styles.primaryBtn, styles.primaryBtnGhost, actionBusy && styles.btnDisabled]}
            >
              <Text style={[styles.primaryBtnText, styles.primaryBtnGhostText]}>Cancelar</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  map: { ...StyleSheet.absoluteFillObject },
  overlay: { flex: 1 },

  letterMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterMarkerText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },
  vehicleMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleMarkerImage: {
    width: 28,
    height: 28,
  },
  vehicleMarkerVectorFallback: {
    position: 'absolute',
    left: 3,
    top: 3,
  },

  topBadgeWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  topBadge: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topBadgeText: {
    color: COLORS.foreground || COLORS.dark,
    fontSize: 13,
    fontWeight: '900',
  },
  offlineRouteBadge: {
    marginTop: 8,
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: '#F0B15A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  offlineRouteBadgeText: {
    color: '#8A4B08',
    fontSize: 12,
    fontWeight: '800',
  },
  pendingEventsBadge: {
    marginTop: 8,
    backgroundColor: '#EAF6FF',
    borderWidth: 1,
    borderColor: '#8BC8F8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pendingEventsBadgeText: {
    color: '#0A4F80',
    fontSize: 12,
    fontWeight: '800',
  },

  bottomCardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  bottomCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  bottomTitle: {
    color: COLORS.foreground || COLORS.dark,
    fontSize: 15,
    fontWeight: '900',
  },
  label: {
    color: COLORS.mutedForeground || COLORS.grayText,
    fontSize: 12,
    fontWeight: '800',
  },
  value: {
    color: COLORS.foreground || COLORS.dark,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  recalcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#8BC8F8',
    backgroundColor: '#EAF6FF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recalcBtnText: {
    color: '#0A4F80',
    fontSize: 13,
    fontWeight: '900',
  },

  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDanger: {
    backgroundColor: COLORS.danger,
  },
  primaryBtnSuccess: {
    backgroundColor: COLORS.success,
  },
  primaryBtnGhost: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  primaryBtnGhostText: {
    color: COLORS.foreground || COLORS.dark,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },

  btnRow: {
    flexDirection: 'row',
  },
  btnRowLeft: {
    flex: 1,
    marginRight: 10,
  },
  btnRowRight: {
    flex: 1,
  },

  btnDisabled: { opacity: 0.6 },
  inlineError: { marginTop: 10, color: COLORS.danger, fontSize: 13, fontWeight: '800' },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    maxHeight: '80%',
  },
  modalTitle: {
    color: COLORS.foreground || COLORS.dark,
    fontSize: 15,
    fontWeight: '900',
  },
  modalMuted: {
    color: COLORS.grayText,
    fontSize: 13,
    fontWeight: '700',
  },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalList: { borderTopWidth: 1, borderColor: COLORS.border, marginTop: 6 },
  reasonRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  reasonText: { color: COLORS.foreground || COLORS.dark, fontSize: 14, fontWeight: '800' },
});
