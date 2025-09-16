import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Platform, ActivityIndicator, Switch, Image, ActionSheetIOS, findNodeHandle } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../../supabaseClient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { callEdgeFunction, hasPermission } from '../../../api/edgeFunctions';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { COLORS } from '../../../theme/colors';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

export default function RegisterProjectScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const COUNTRY_LOCKED = true; // mantener selector bloqueado por ahora
  const [countryId, setCountryId] = useState('1'); // Colombia por defecto
  const [countries, setCountries] = useState([{ id: '1', name: 'Colombia' }]);
  const scrollRef = useRef(null);
  const streetRef = useRef(null);
  const { permissions: globalPerms } = usePermissions();
  const permsFromRoute = Array.isArray(route?.params?.permissions) ? route.params.permissions : [];
  const perms = useMemo(() => [...permsFromRoute, ...globalPerms], [permsFromRoute, globalPerms]);

  const canCreate = hasPermission(perms, 'create_new_project_for_my_company') || hasPermission(perms, 'create_new_project');

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  // Fechas ya no se capturan en UI; start_date se asignará automáticamente
  const [active, setActive] = useState(true);
  const [departmentId, setDepartmentId] = useState('');
  const [cityId, setCityId] = useState(''); // numérico (de la ciudad seleccionada)
  const [street, setStreet] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [departments, setDepartments] = useState([]); // [{id, name}]
  const [cities, setCities] = useState([]); // [{id, name}]
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  // Helpers iOS similares a RegisterUserScreen
  const showActionSheet = (title, items, currentValue, onSelect) => {
    if (Platform.OS !== 'ios') return;
    const options = ['Cancelar', ...items.map(i => i.label)];
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options, cancelButtonIndex: 0, userInterfaceStyle: 'light' },
      (idx) => {
        if (idx > 0) {
          const item = items[idx - 1];
          onSelect(item.value);
        }
      }
    );
  };
  const getSelectedLabel = (items, value) => {
    const found = items.find((i) => String(i.value) === String(value));
    return found ? found.label : '';
  };

  React.useEffect(() => {
    (async () => {
      setLoadingDeps(true);
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('id, name, country_id')
          .eq('country_id', Number(countryId))
          .order('name', { ascending: true });
        if (error) throw error;
        const items = (data || []).map((d) => ({ id: String(d.id), name: String(d.name) }));
        setDepartments(items);
      } catch (_) {
        setDepartments([]);
      } finally {
        setLoadingDeps(false);
      }
    })();
  }, [countryId]);

  const fetchCities = React.useCallback(async (depId) => {
    setLoadingCities(true);
    setCities([]);
    try {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, department_id')
        .eq('department_id', depId)
        .order('name', { ascending: true });
      if (error) throw error;
      const items = (data || []).map((c) => ({ id: String(c.id), name: String(c.name) }));
      setCities(items);
    } catch (_) {
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
  // Validación mínima de dirección opcional: si uno está, ambos requeridos
  if ((street && !cityId) || (!street && cityId)) e.address = 'Completa calle y ciudad';
  if (cityId && !/^\d+$/.test(cityId)) e.cityId = 'Ciudad debe ser numérica (id)';
    return e;
  };

  const onSubmit = async () => {
    if (!canCreate) {
      Alert.alert('Permisos', 'No tienes permiso para crear proyectos.');
      return;
    }
    const e = validate();
    setErrors(e);
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
      Alert.alert('Éxito', 'Proyecto creado correctamente.', [
        { text: 'OK', onPress: () => navigation.navigate('ProjectsList', { refresh: true }) },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo crear el proyecto');
    } finally {
      setSaving(false);
    }
  };

  return (
  <View style={styles.screen}>
      {/* Botón regresar (mismo estilo que RegisterUserScreen) */}
      <View style={[styles.topBar, { top: Platform.OS === 'ios' ? 70 + insets.top * 0 : 40 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Header con imagen reutilizada */}
      <View style={styles.header}>
        <Image
          source={require('../../../assets/register.png')}
          style={styles.headerImage}
          resizeMode="contain"
        />
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        viewIsInsideTabBar={true}
        extraScrollHeight={120}
        keyboardOpeningTime={0}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="always"
      >
          <View style={styles.formCard}>
            <Text style={styles.title}>Registrar proyecto</Text>
            {!canCreate && (
              <Text style={styles.permWarn}>No tienes permisos para crear proyectos.</Text>
            )}
            {/* Nombre */}
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              placeholder="Nombre *"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#666"
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
            {/* Descripción */}
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }, errors.desc && styles.inputError]}
              placeholder="Descripción"
              value={desc}
              onChangeText={setDesc}
              placeholderTextColor="#666"
              multiline
              maxLength={400}
            />
            {errors.desc ? <Text style={styles.errorText}>{errors.desc}</Text> : null}

            {/* Fechas removidas (start/end) según solicitud */}

            {/* Activo */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Activo</Text>
              <Switch
                value={active}
                onValueChange={setActive}
                thumbColor={'#fff'}
                trackColor={{ true: COLORS.purple, false: '#ccc' }}
              />
            </View>

            {/* Dirección */}
            <Text style={styles.subtitle}>Dirección principal del proyecto</Text>
            {/* País (bloqueado por ahora) */}
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                style={[styles.dropdown, COUNTRY_LOCKED && { opacity: 0.8 }]}
                disabled={COUNTRY_LOCKED}
                onPress={() => {
                  if (COUNTRY_LOCKED) return;
                  showActionSheet(
                    'Selecciona un país',
                    countries.map((c) => ({ label: c.name, value: c.id })),
                    countryId,
                    async (val) => {
                      setCountryId(String(val));
                      setDepartmentId('');
                      setCityId('');
                    }
                  );
                }}
              >
                <Text style={styles.dropdownText}>
                  {getSelectedLabel(countries.map((c) => ({ label: c.name, value: c.id })), countryId) || 'Selecciona un país'}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.dropdown, COUNTRY_LOCKED && { opacity: 0.8 }]}>
                <Picker
                  enabled={!COUNTRY_LOCKED}
                  selectedValue={countryId}
                  onValueChange={async (val) => {
                    setCountryId(String(val));
                    setDepartmentId('');
                    setCityId('');
                  }}
                  style={styles.picker}
                >
                  {countries.map((c) => (
                    <Picker.Item key={c.id} label={c.name} value={c.id} />
                  ))}
                </Picker>
              </View>
            )}
           
            {/* Selectores dependientes Departamento -> Ciudad */}
            {Platform.OS === 'ios' ? (
              <>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() =>
                    showActionSheet(
                      'Selecciona un departamento',
                      departments.map((d) => ({ label: d.name, value: d.id })),
                      departmentId,
                      async (val) => {
                        setDepartmentId(val);
                        setCityId('');
                        await fetchCities(val);
                      }
                    )
                  }
                >
                  <Text style={styles.dropdownText}>
                    {getSelectedLabel(departments.map((d) => ({ label: d.name, value: d.id })), departmentId) || 'Selecciona un departamento'}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdown}
                  disabled={!departmentId}
                  onPress={() =>
                    showActionSheet(
                      'Selecciona una ciudad',
                      cities.map((c) => ({ label: c.name, value: c.id })),
                      cityId,
                      (val) => setCityId(val)
                    )
                  }
                >
                  <Text style={styles.dropdownText}>
                    {!departmentId
                      ? 'Selecciona un departamento primero'
                      : (getSelectedLabel(cities.map((c) => ({ label: c.name, value: c.id })), cityId) || (loadingCities ? 'Cargando ciudades...' : 'Selecciona una ciudad'))}
                  </Text>
                  <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.dropdown}>
                  <Picker
                    selectedValue={departmentId}
                    onValueChange={async (val) => {
                      setDepartmentId(val);
                      setCityId('');
                      if (val) await fetchCities(val);
                    }}
                    style={styles.picker}
                  >
                    <Picker.Item label="Selecciona un departamento" value="" />
                    {departments.map((d) => (
                      <Picker.Item key={d.id} label={d.name} value={d.id} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.dropdown}>
                  <Picker
                    enabled={!!departmentId}
                    selectedValue={cityId}
                    onValueChange={(val) => setCityId(val)}
                    style={styles.picker}
                  >
                    <Picker.Item label={!departmentId ? 'Selecciona un departamento primero' : (loadingCities ? 'Cargando ciudades...' : 'Selecciona una ciudad')} value="" />
                    {cities.map((c) => (
                      <Picker.Item key={c.id} label={c.name} value={c.id} />
                    ))}
                  </Picker>
                </View>
              </>
            )}
            {(errors.cityId || errors.address) && (
              <Text style={styles.errorText}>{errors.cityId || errors.address}</Text>
            )}


            <TextInput
              style={styles.input}
              placeholder="Calle (opcional)"
              value={street}
              ref={streetRef}
              onFocus={() => {
                setTimeout(() => {
                  const node = findNodeHandle(streetRef.current);
                  if (scrollRef.current) {
                    if (typeof scrollRef.current.scrollIntoView === 'function' && node) {
                      scrollRef.current.scrollIntoView(node);
                    } else if (typeof scrollRef.current.scrollToPosition === 'function') {
                      scrollRef.current.scrollToPosition(0, 250, true);
                    } else if (typeof scrollRef.current.scrollToEnd === 'function') {
                      scrollRef.current.scrollToEnd({ animated: true });
                    }
                  }
                }, 80);
              }}
              onChangeText={setStreet}
              placeholderTextColor="#666"
            />


            <TouchableOpacity
              disabled={saving || !canCreate}
              onPress={onSubmit}
              style={[styles.button, (saving || !canCreate) && styles.buttonDisabled]}
              activeOpacity={0.85}
            >
              {saving ? (
                <Text style={styles.buttonText}>Guardando...</Text>
              ) : (
                <Text style={styles.buttonText}>Guardar proyecto</Text>
              )}
            </TouchableOpacity>
          </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.purple },
  topBar: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
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
  header: {
    backgroundColor: COLORS.purple,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    paddingTop: Platform.OS === 'ios' ? 30 : 0,
  },
  headerImage: { width: '70%', height: '100%' },
  container: {
    backgroundColor: '#fff',
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 120,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  formCard: {
    backgroundColor: '#fff',
    top: 12,
    padding: 18,
    width: '100%',
    maxWidth: 420,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  subtitle: { fontSize: 14, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  permWarn: { textAlign: 'center', color: '#B00020', fontSize: 13, marginBottom: 8 },
  input: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#F3F4F6',
  },
  inputError: { borderWidth: 1, borderColor: '#D93025' },
  errorText: { color: '#D93025', fontSize: 12, marginTop: -6, marginBottom: 8 },
  row: { flexDirection: 'row', marginBottom: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  button: {
    backgroundColor: COLORS.yellow,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#333', fontSize: 17, fontWeight: '600' },
  countryNote: { fontSize: 13, color: '#666', marginBottom: 8 },
  dropdown: {
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    position: 'relative',
  },
  dropdownText: { paddingVertical: 14, paddingHorizontal: 12, color: '#333', fontSize: 16 },
  dropdownIcon: { position: 'absolute', right: 10, top: 12 },
  picker: { height: 50, width: '100%', backgroundColor: 'transparent' },
});
