import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';
import { callEdgeFunction } from '../../api/edgeFunctions.js';
import { usePermissions } from '../../state/PermissionsContext.jsx';
import { hasPermission } from '../../lib/permissions.js';

export default function RegisterProject() {
  const navigate = useNavigate();
  const { permissions } = usePermissions();
  const canCreate = useMemo(() => {
    return (
      hasPermission(permissions, 'create_new_project_for_my_company') ||
      hasPermission(permissions, 'create_new_project')
    );
  }, [permissions]);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [active, setActive] = useState(true);

  const [countryId] = useState('1');
  const [departments, setDepartments] = useState([]);
  const [cities, setCities] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [cityId, setCityId] = useState('');
  const [street, setStreet] = useState('');

  const [loadingDeps, setLoadingDeps] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    (async () => {
      setLoadingDeps(true);
      try {
        const { data, error: qErr } = await supabase
          .from('departments')
          .select('id, name, country_id')
          .eq('country_id', Number(countryId))
          .order('name', { ascending: true });
        if (qErr) throw qErr;
        setDepartments((data || []).map((d) => ({ id: String(d.id), name: String(d.name) })));
      } catch {
        setDepartments([]);
      } finally {
        setLoadingDeps(false);
      }
    })();
  }, [countryId]);

  const fetchCities = useCallback(async (depId) => {
    setLoadingCities(true);
    setCities([]);
    try {
      const { data, error: qErr } = await supabase
        .from('cities')
        .select('id, name, department_id')
        .eq('department_id', depId)
        .order('name', { ascending: true });
      if (qErr) throw qErr;
      setCities((data || []).map((c) => ({ id: String(c.id), name: String(c.name) })));
    } catch {
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  }, []);

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Nombre requerido';
    else if (name.trim().length < 3) e.name = 'Mínimo 3 caracteres';
    if (desc && desc.length < 5) e.desc = 'Descripción muy corta';
    if ((street && !cityId) || (!street && cityId)) e.address = 'Completa calle y ciudad';
    if (cityId && !/^\d+$/.test(cityId)) e.cityId = 'Ciudad debe ser numérica (id)';
    return e;
  };

  const onSubmit = async () => {
    if (!canCreate) {
      setError('No tienes permisos para crear proyectos.');
      return;
    }
    setError('');
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: desc.trim() || null,
        status: !!active,
      };
      if (street && cityId) {
        payload.address = {
          city_id: Number(cityId),
          address: street.trim(),
        };
      }
      await callEdgeFunction('create-project', { method: 'POST', body: payload });
      navigate('/projects?refresh=1', { replace: true });
    } catch (err) {
      setError(err?.message || 'No se pudo crear el proyecto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Registrar proyecto</div>
        <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>Completa los datos básicos del proyecto.</div>

        {!canCreate ? (
          <div style={{ marginTop: 10, fontWeight: 800, textAlign: 'center' }}>No tienes permisos para crear proyectos.</div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 12, fontWeight: 800, textAlign: 'center' }}>{error}</div>
        ) : null}

        <div className="grid" style={{ marginTop: 12 }}>
          <div className="col12">
            <input
              className="input"
              placeholder="Nombre *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {fieldErrors.name ? <div style={{ marginTop: 6, fontWeight: 800 }}>{fieldErrors.name}</div> : null}
          </div>

          <div className="col12">
            <textarea
              className="input"
              placeholder="Descripción"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              style={{ resize: 'vertical' }}
            />
            {fieldErrors.desc ? <div style={{ marginTop: 6, fontWeight: 800 }}>{fieldErrors.desc}</div> : null}
          </div>

          <div className="col12" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input id="projectActive" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <label htmlFor="projectActive" style={{ fontWeight: 800 }}>Activo</label>
          </div>

          <div className="col12" style={{ marginTop: 6, fontWeight: 900 }}>Dirección principal (opcional)</div>

          <div className="col6">
            <select
              className="input"
              value={departmentId}
              onChange={async (e) => {
                const val = e.target.value;
                setDepartmentId(val);
                setCityId('');
                if (val) await fetchCities(val);
                else setCities([]);
              }}
              disabled={loadingDeps}
            >
              <option value="">{loadingDeps ? 'Cargando departamentos…' : 'Selecciona un departamento'}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col6">
            <select
              className="input"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              disabled={!departmentId || loadingCities}
            >
              <option value="">
                {!departmentId
                  ? 'Selecciona un departamento primero'
                  : loadingCities
                    ? 'Cargando ciudades…'
                    : 'Selecciona una ciudad'}
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col12">
            <input className="input" placeholder="Calle (opcional)" value={street} onChange={(e) => setStreet(e.target.value)} />
            {(fieldErrors.cityId || fieldErrors.address) ? (
              <div style={{ marginTop: 6, fontWeight: 800 }}>{fieldErrors.cityId || fieldErrors.address}</div>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => navigate(-1)} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btnPrimary" type="button" onClick={onSubmit} disabled={saving || !canCreate}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
