import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const CACHE_KEY = 'account_profile_cache_v1';

export default function Account() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [netReady, setNetReady] = useState(false);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(CACHE_KEY);
      if (cached) {
        setProfile(JSON.parse(cached));
        setLoading(false);
      }
    } catch {
      // noop
    }

    const update = () => {
      setIsOffline(!navigator.onLine);
      setNetReady(true);
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const fetchProfile = useCallback(async () => {
    setError('');
    setLoading(true);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const user = sessionRes?.session?.user;
      if (!user) throw new Error('No hay sesión activa');

      if (isOffline) {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (cached) {
          setError('Modo sin conexión');
          setLoading(false);
          return;
        }
        throw new Error('Sin conexión a internet');
      }

      const { data, error: userErr } = await supabase
        .from('app_users')
        .select(
          `
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
        `
        )
        .eq('auth_id', user.id)
        .eq('users_roles.default_role', true)
        .single();

      if (userErr) throw userErr;

      const usersRoles = Array.isArray(data?.users_roles) ? data.users_roles : [];
      const roleName = usersRoles[0]?.roles?.role_name || null;

      const base = {
        email: user.email,
        last_sign_in_at: user.last_sign_in_at,
        company_name: data?.companies?.name || null,
        role_name: roleName,
      };

      const finalProfile = { ...(data || {}), ...base };
      setProfile(finalProfile);

      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(finalProfile));
      } catch {
        // noop
      }
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  useEffect(() => {
    if (netReady) fetchProfile();
  }, [netReady, fetchProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const fullName = useMemo(() => {
    return (
      profile?.display_name ||
      [profile?.name, profile?.last_name].filter(Boolean).join(' ') ||
      'Usuario'
    );
  }, [profile]);

  const statusLabel = profile?.is_active === false ? 'Inactivo' : 'Activo';
  const statusColor = profile?.is_active === false ? '#DC2626' : '#16A34A';

  const InfoRow = ({ label, value, color }) => (
    <div className="infoRow">
      <div>
        <div className="infoLabel">{label}</div>
        <div className="infoValue" style={color ? { color } : undefined}>
          {value || '—'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="container">
      {isOffline ? (
        <div className="offlineBanner">Sin conexión - mostrando datos guardados</div>
      ) : null}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Cuenta</div>
            <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>{fullName}</div>
            <div style={{ color: 'var(--color-muted)', marginTop: 2, fontSize: 13 }}>{profile?.email || '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={fetchProfile} disabled={loading}>
              Refrescar
            </button>
            <button className="btn" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 12, color: 'var(--color-muted)' }}>Cargando…</div>
        ) : null}

        {!loading && error ? (
          <div style={{ marginTop: 12, color: '#B91C1C', fontWeight: 700 }}>{error}</div>
        ) : null}

        {!loading && !error ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Información
            </div>

            <div className="infoCard">
              <InfoRow label="Nombre" value={fullName} />
              <InfoRow label="Correo" value={profile?.email} />
              <InfoRow label="Empresa" value={profile?.company_name || 'Sin empresa'} />
              <InfoRow label="Rol" value={profile?.role_name || '—'} />
              <InfoRow label="Teléfono" value={profile?.phone} />
              <InfoRow
                label="Último acceso"
                value={profile?.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleString() : '—'}
              />
              <InfoRow label="Estado" value={statusLabel} color={statusColor} />
              <InfoRow label="ID" value={profile?.user_id || '—'} />
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btnPrimary" type="button" onClick={() => window.alert('Funcionalidad pendiente')}>
                Editar perfil
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
