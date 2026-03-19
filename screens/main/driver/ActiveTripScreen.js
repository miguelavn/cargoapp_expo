import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import polyline from '@mapbox/polyline';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/colors';
import { supabase } from '../../../supabaseClient';
import { callEdgeFunction } from '../../../api/edgeFunctions';

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

export default function ActiveTripScreen({ route }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const fitModeRef = useRef(null); // 'driverPickup' | 'pickupDropoff'
  const locationSubRef = useRef(null);
  const lastDriverCoordRef = useRef(null);
  const lastDriverRouteFetchAtRef = useRef(0);
  const lastDriverRouteFromRef = useRef(null);

  const routeServiceId = route?.params?.serviceId ?? route?.params?.service?.service_id ?? null;
  const [service, setService] = useState(route?.params?.service || null);

  useEffect(() => {
    setService(route?.params?.service || null);
  }, [route?.params?.service]);

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
      if (hasOrigin && hasDest) {
        // Aun si ya hay coords, mantener la hidratación desactivada para evitar llamadas innecesarias.
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
        'status_id',
        'status_name',
        'origin_id',
        'destination_id',
      ].join(',');

      const selectColsServices = [
        'service_id',
        'origin_location',
        'destination_location',
        'origin_address',
        'destination_address',
        'status_id',
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
  const [tripStarted, setTripStarted] = useState(false);
  const [trackMarkerChanges, setTrackMarkerChanges] = useState(true);
  const [truckImageOk, setTruckImageOk] = useState(true);

  // react-native-maps (especialmente en Android) puede no renderizar
  // correctamente Markers con children si tracksViewChanges=false desde el inicio.
  // Lo dejamos true por un momento y luego lo apagamos.
  useEffect(() => {
    setTrackMarkerChanges(true);
    const t = setTimeout(() => setTrackMarkerChanges(false), 1500);
    return () => clearTimeout(t);
  }, [driverCoord, originCoord, destinationCoord]);

  const fallbackPickupToDropoffCoords = useMemo(() => {
    if (!originCoord || !destinationCoord) return [];
    return [originCoord, destinationCoord];
  }, [originCoord, destinationCoord]);

  const fallbackDriverToPickupCoords = useMemo(() => {
    if (!driverCoord || !originCoord) return [];
    return [driverCoord, originCoord];
  }, [driverCoord, originCoord]);

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

  // Ruta: (1) recogida -> entrega (una vez)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!originCoord || !destinationCoord) {
        setRouteToDestination([]);
        return;
      }
      try {
        if (cancelled) return;
        const coords = await getRoute(originCoord, destinationCoord);
        if (cancelled) return;
        setRouteToDestination(coords);
      } catch {
        if (cancelled) return;
        setRouteToDestination(fallbackPickupToDropoffCoords);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [originCoord, destinationCoord, fallbackPickupToDropoffCoords, googleMapsApiKey]);

  // Ruta: (2) conductor -> recogida (se actualiza con throttle)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!driverCoord || !originCoord) {
        setRouteToPickup([]);
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
        const coords = await getRoute(driverCoord, originCoord);
        if (cancelled) return;
        if (__DEV__ && (coords?.length || 0) <= 2) {
          // eslint-disable-next-line no-console
          console.warn('[ActiveTrip] Ruta conductor→recogida sin detalle (línea recta). Posible ZERO_RESULTS/coord fuera de vía.', {
            coordsLen: coords?.length || 0,
          });
        }
        setRouteToPickup(coords);
      } catch {
        if (cancelled) return;
        setRouteToPickup(fallbackDriverToPickupCoords);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [driverCoord, originCoord, fallbackDriverToPickupCoords]);

  // Fit al cargar rutas reales para mostrar el recorrido completo.
  useEffect(() => {
    if (!isMapReady) return;
    if (!mapRef.current) return;

    const a = (routeToPickup?.length ? routeToPickup : fallbackDriverToPickupCoords) || [];
    const b = (routeToDestination?.length ? routeToDestination : fallbackPickupToDropoffCoords) || [];
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
  }, [isMapReady, routeToPickup, routeToDestination, fallbackDriverToPickupCoords, fallbackPickupToDropoffCoords, insets.bottom, insets.top]);

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

        {(routeToPickup?.length ? routeToPickup : fallbackDriverToPickupCoords)?.length >= 2 ? (
          <Polyline
            coordinates={routeToPickup?.length ? routeToPickup : fallbackDriverToPickupCoords}
            strokeColor={COLORS.primary}
            strokeWidth={5}
          />
        ) : null}

        {(routeToDestination?.length ? routeToDestination : fallbackPickupToDropoffCoords)?.length >= 2 ? (
          <Polyline
            coordinates={routeToDestination?.length ? routeToDestination : fallbackPickupToDropoffCoords}
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
        </View>

        <View style={[styles.bottomCardWrap, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
          <View style={styles.bottomCard}>
            <Text style={styles.bottomTitle}>Viaje activo</Text>

            <View style={{ height: 10 }} />

            <Text style={styles.label}>Origen</Text>
            <Text style={styles.value} numberOfLines={2}>{originText}</Text>

            <View style={{ height: 10 }} />

            <Text style={styles.label}>Destino</Text>
            <Text style={styles.value} numberOfLines={2}>{destinationText}</Text>

            <View style={{ height: 12 }} />

            <Pressable
              onPress={() => setTripStarted((v) => !v)}
              style={[styles.primaryBtn, tripStarted && styles.primaryBtnDanger]}
            >
              <Text style={styles.primaryBtnText}>{tripStarted ? 'Finalizar' : 'Iniciar viaje'}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
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
  primaryBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },
});
