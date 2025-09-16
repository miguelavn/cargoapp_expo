import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { MaterialIcons } from '@expo/vector-icons';

const COLORS = {
  purple: '#6C63FF',
  yellow: '#FFD23F',
  white: '#FFFFFF',
  grayText: '#666',
  dark: '#222',
  soft: '#F3F4F6',
  border: '#E5E7EB',
};

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const notchThreshold = 44;
  // Android: subir header (reducir padding artificial)
  const headerTop = Platform.OS === 'ios'
    ? (insets.top > notchThreshold ? insets.top - 6 : insets.top)
    : 8;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [netReady, setNetReady] = useState(false); // sabemos ya el estado inicial de red
  const CACHE_KEY = 'account_profile_cache_v1';

  // Cargar caché inicial y suscribirse a cambios de red
  useEffect(() => {
    let unsubscribe;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          setProfile(JSON.parse(cached));
          setLoading(false); // mostramos algo mientras intentamos refrescar
        }
      } catch (_) { /* ignore */ }

      unsubscribe = NetInfo.addEventListener(state => {
        const offline = !(state.isConnected && state.isInternetReachable !== false);
        setIsOffline(offline);
        setNetReady(true);
      });
    })();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const fetchProfile = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('No hay sesión activa');

      // Query con joins reales según el esquema:
      // app_users (user_id PK) -> users_roles (user_id FK) -> roles (id PK) y companies (company_id FK)
      // Filtramos users_roles.default_role = true para obtener el rol principal.
      if (isOffline) {
        // Sin red: no forzamos error si existe caché
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          setError('Modo sin conexión');
          setLoading(false);
          return;
        } else {
          throw new Error('Sin conexión a internet');
        }
      }

      const { data, error: userErr } = await supabase
        .from('app_users')
        .select(`
          user_id,
          auth_id,
          name,
          last_name,
          phone,
          is_active,
          company_id,
          companies:company_id(name),
          users_roles!inner(
            default_role,
            roles:role_id(role_name)
          )
        `)
        .eq('auth_id', user.id)
        .eq('users_roles.default_role', true)
        .single();

      if (userErr) throw userErr;

      const profileData = data || {};

      // users_roles vendrá como array (aunque filtrado) por la naturaleza 1:N
      const usersRoles = Array.isArray(profileData.users_roles) ? profileData.users_roles : [];
      const roleName = usersRoles[0]?.roles?.role_name || null;

      const base = {
        email: user.email,
        last_sign_in_at: user.last_sign_in_at,
        company_name: profileData?.companies?.name || null,
        role_name: roleName,
      };

  const finalProfile = { ...profileData, ...base };
  setProfile(finalProfile);
  // Guardar en caché
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(finalProfile)); } catch (_) { /* ignore */ }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  // Ejecutar fetch cuando ya conocemos el estado de red inicial
  useEffect(() => {
    if (netReady) fetchProfile();
  }, [netReady, fetchProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  const fullName = profile?.display_name || [profile?.name, profile?.last_name].filter(Boolean).join(' ') || 'Usuario';
  const statusLabel = profile?.is_active === false ? 'Inactivo' : 'Activo';
  const statusColor = profile?.is_active === false ? '#DC2626' : '#16A34A';

  const InfoRow = ({ icon, label, value, color }) => (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <MaterialIcons name={icon} size={20} color={COLORS.purple} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, color && { color }]} numberOfLines={2}>{value || '—'}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        {/* Banner offline */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="cloud-off" size={16} color="#B45309" />
            <Text style={styles.offlineText}>Sin conexión - mostrando datos guardados</Text>
          </View>
        )}
        {/* Header morado */}
  <View style={[styles.headerArea, { paddingTop: headerTop }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={22} color={COLORS.dark} />
            </TouchableOpacity>
            <Text style={styles.title}>Cuenta</Text>
            <TouchableOpacity onPress={fetchProfile} style={styles.refreshBtn}>
              <MaterialIcons name="refresh" size={22} color={COLORS.dark} />
            </TouchableOpacity>
          </View>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <MaterialIcons name="person" size={42} color={COLORS.white} />
            </View>
            <Text style={styles.userName} numberOfLines={1}>{fullName}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{profile?.email || '—'}</Text>
          </View>
        </View>

        {/* Contenido */}
         <View style={styles.contentArea}>
          {loading && (
            <View style={{ paddingVertical: 40 }}>
              <ActivityIndicator size="large" color={COLORS.purple} />
            </View>
          )}
          {!loading && error && (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!loading && !error && (
            // Se aumenta el paddingBottom para que los botones finales no queden cubiertos por la Tab Bar
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Información</Text>
                <View style={styles.card}>
                  <InfoRow icon="badge" label="Nombre" value={fullName} />
                  <InfoRow icon="mail-outline" label="Correo" value={profile?.email} />
                  <InfoRow icon="work" label="Empresa" value={profile?.company_name || 'Sin empresa'} />
                  <InfoRow icon="security" label="Rol" value={profile?.role_name || '—'} />
                  <InfoRow icon="phone" label="Teléfono" value={profile?.phone} />
                  <InfoRow icon="access-time" label="Último acceso" value={profile?.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleString() : '—'} />
                  <InfoRow icon="toggle-on" label="Estado" value={statusLabel} color={statusColor} />
                  <InfoRow icon="fingerprint" label="ID" value={profile?.user_id || '—'} />
                </View>
              </View>

              <View style={styles.actionsArea}>
                <TouchableOpacity style={styles.primaryActionBtn} onPress={() => Alert.alert('Editar', 'Funcionalidad pendiente')}> 
                  <MaterialIcons name="edit" size={20} color="#333" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryActionBtnText}>Editar perfil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleLogout}>
                  <MaterialIcons name="logout" size={20} color="#DC2626" style={{ marginRight: 6 }} />
                  <Text style={styles.secondaryBtnText}>Cerrar sesión</Text>
                </TouchableOpacity>
                {/* Spacer adicional de seguridad por si el alto de la Tab Navigator varía */}
                <View style={{ height: 10 }} />
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
   safeArea: {
     flex: 1,
     backgroundColor: COLORS.white,
     // removemos paddingTop en Android para que el header quede más alto
     paddingTop: Platform.OS === 'android' ? 0 : 0,
   },
  root: { flex: 1 },
  headerArea: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 20,
  paddingTop: 0,
  paddingBottom: 10, 
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  marginBottom: 6, 
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
  refreshBtn: {
    backgroundColor: COLORS.yellow,
    padding: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  title: { fontSize: 16, fontWeight: '500', color: COLORS.dark, paddingHorizontal: 10, flex: 1, textAlign: 'center' },
  avatarWrapper: { alignItems: 'center', marginTop: 0 },
  avatarCircle: {
    width: 72, // tamaño reducido
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6, // menos espacio debajo del avatar
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  userName: { fontSize: 20, fontWeight: '700', color: COLORS.white, maxWidth: '80%' },
  userEmail: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  contentArea: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.grayText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoLabel: { fontSize: 12, fontWeight: '600', color: COLORS.grayText, marginBottom: 2, textTransform: 'uppercase' },
  infoValue: { fontSize: 15, fontWeight: '600', color: COLORS.dark },
  actionsArea: { marginTop: 10 },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.yellow,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  primaryActionBtnText: { fontSize: 16, fontWeight: '600', color: '#333' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 12,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  errorText: { marginLeft: 8, color: '#B91C1C', fontWeight: '600', flex: 1 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
  },
  offlineText: { color: '#92400E', fontSize: 12, fontWeight: '600' },
});
