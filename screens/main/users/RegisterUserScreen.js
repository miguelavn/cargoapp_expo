import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  ActionSheetIOS,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../../../supabaseClient";
import { callEdgeFunction } from '../../../api/edgeFunctions';
import { MaterialIcons } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

// Utilidad para mostrar alertas según la plataforma
const showAlert = (title, message) => {
  if (Platform.OS === "web") {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const RegisterUserScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    name: "",
    last_name: "",
    username: "",
    personal_id: "",
    email: "",
    phone: "",
    company_id: "",
    role_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [fieldErrors, setFieldErrors] = useState({ username: "", email: "" });

  // Validaciones en tiempo real
  const nameRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$/;
  const usernameRegex = /^[a-zA-Z0-9_]{3,}$/;
  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const phoneRegex = /^[0-9]{7,15}$/;

  const isValidName = nameRegex.test(form.name) && form.name.length > 0;
  const isValidLastName = nameRegex.test(form.last_name) && form.last_name.length > 0;
  const isValidUsername = usernameRegex.test(form.username) && form.username.length > 0 && !fieldErrors.username;
  const isValidEmail = emailRegex.test(form.email) && form.email.length > 0 && !fieldErrors.email;
  const isValidPhone = phoneRegex.test(form.phone) && form.phone.length > 0;

  useEffect(() => {

    
    const fetchOptions = async () => {
      setLoadingOptions(true);
      try {

        const { data: companiesData } = await supabase
          .from("companies")
          .select("company_id, name");

        const { data: rolesData } = await supabase
          .from("roles")
          .select("id, role_name");

        setCompanies(companiesData || []);
        setRoles(rolesData || []);
      } catch (e) {
        showAlert("Error", "No se pudieron cargar las opciones de empresa y rol");
      }
      setLoadingOptions(false);
    };

    fetchOptions();
  }, []);

  // Helpers para iOS (deben estar en el scope del componente, no dentro de handleSubmit)
  const showActionSheet = (title, items, currentValue, onSelect) => {
    if (Platform.OS !== 'ios') return;
    const options = ['Cancelar', ...items.map((i) => i.label)];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: 0,
        userInterfaceStyle: 'light',
      },
      (buttonIndex) => {
        if (buttonIndex > 0) {
          const item = items[buttonIndex - 1];
            onSelect(item.value);
        }
      }
    );
  };

  const getSelectedLabel = (items, value) => {
    const found = items.find((i) => String(i.value) === String(value));
    return found ? found.label : '';
  };

  const handleChange = (field, value) => {
    // Solo permitir letras y espacios en nombre y apellido
    if (field === "name" || field === "last_name") {
      if (value === "" || nameRegex.test(value)) {
        setForm({ ...form, [field]: value });
      }
      return;
    }
    // Solo permitir números en teléfono
    if (field === "phone") {
      if (value === "" || /^[0-9]*$/.test(value)) {
        setForm({ ...form, [field]: value });
      }
      return;
    }
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async () => {
  setLoading(true);
  try {
    // Generar contraseña temporal
    const randomString = () => Math.random().toString(36).slice(-6);
    const tempPassword = randomString() + "A1!";

    // Validar correo
    if (!emailRegex.test(form.email)) {
      showAlert("Error", "El correo no es válido.");
      setLoading(false);
      return;
    }

  // (helpers movidos al scope superior)

    // Obtener la sesión actual (admin logueado)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showAlert("Error", "No hay sesión activa.");
      setLoading(false);
      return;
    }

    // Llamar a Edge Function centralizada
    await callEdgeFunction('createUser', {
      method: 'POST',
      body: {
        email: form.email,
        password: tempPassword,
        name: form.name,
        lastName: form.last_name,
        username: form.username,
        personalId: form.personal_id,
        phone: form.phone,
        companyId: form.company_id ? Number(form.company_id) : null,
        roleId: form.role_id ? Number(form.role_id) : null,
      },
    });

    showAlert("Éxito", "Usuario creado correctamente. Se ha enviado correo de activación.");
    setForm({
      name: "",
      last_name: "",
      username: "",
      personal_id: "",
      email: "",
      phone: "",
      company_id: "",
      role_id: "",
    });
  } catch (error) {
    console.error(error);
    showAlert("Error", error.message);
  }
  setLoading(false);
};


  return (
    <View style={{ flex: 1, backgroundColor: "#6C63FF" }}>
      {/* Botón moderno de regresar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Encabezado con ilustración */}
      <View style={styles.header}>
        <Image
          source={require("../../../assets/register.png")}
          style={styles.headerImage}
          resizeMode="contain"
        />
      </View>

      {/* Contenedor principal con scroll que evita teclado */}
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        enableOnAndroid={true}
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formCard}>
          <Text style={styles.title}>Crea una cuenta</Text>

          {/* Nombre */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, isValidName ? styles.inputSuccess : null]}
              placeholder="Nombre"
              value={form.name}
              onChangeText={(v) => handleChange("name", v)}
            />
            {isValidName && (
              <Ionicons name="checkmark-circle" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>
          {/* Apellido */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, isValidLastName ? styles.inputSuccess : null]}
              placeholder="Apellido"
              value={form.last_name}
              onChangeText={(v) => handleChange("last_name", v)}
            />
            {isValidLastName && (
              <Ionicons name="checkmark-circle" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>
          {/* Username */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, fieldErrors.username ? styles.inputError : isValidUsername ? styles.inputSuccess : null]}
              placeholder="Username"
              value={form.username}
              onChangeText={(v) => handleChange("username", v)}
            />
            {isValidUsername && (
              <Ionicons name="checkmark-circle" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>
          {fieldErrors.username ? (
            <Text style={styles.errorText}>{fieldErrors.username}</Text>
          ) : null}
          {/* NIT / Cédula */}
          <TextInput
            style={styles.input}
            placeholder="NIT / Cédula"
            value={form.personal_id}
            onChangeText={(v) => handleChange("personal_id", v)}
          />
          {/* Email */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, fieldErrors.email ? styles.inputError : isValidEmail ? styles.inputSuccess : null]}
              placeholder="Email"
              value={form.email}
              onChangeText={(v) => handleChange("email", v)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {isValidEmail && (
              <Ionicons name="checkmark-circle" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>
          {fieldErrors.email ? (
            <Text style={styles.errorText}>{fieldErrors.email}</Text>
          ) : null}
          {/* Teléfono */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, isValidPhone ? styles.inputSuccess : null]}
              placeholder="Teléfono"
              value={form.phone}
              onChangeText={(v) => handleChange("phone", v)}
              keyboardType="phone-pad"
            />
            {isValidPhone && (
              <Ionicons name="checkmark-circle" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>

          {/* Selectores */}
          {loadingOptions ? (
            <ActivityIndicator size="large" color="#007bff" />
          ) : (
            <>
              {Platform.OS === 'ios' ? (
                <>
                  {/* Empresa - iOS ActionSheet */}
                  <TouchableOpacity
                    style={styles.dropdown}
                    onPress={() =>
                      showActionSheet(
                        'Selecciona una empresa',
                        companies.map((c) => ({ label: c.name, value: String(c.company_id) })),
                        form.company_id,
                        (val) => handleChange('company_id', val)
                      )
                    }
                  >
                    <Text style={styles.dropdownText}>
                      {getSelectedLabel(
                        companies.map((c) => ({ label: c.name, value: String(c.company_id) })),
                        form.company_id
                      ) || 'Selecciona una empresa'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
                  </TouchableOpacity>

                  {/* Rol - iOS ActionSheet */}
                  <TouchableOpacity
                    style={styles.dropdown}
                    onPress={() =>
                      showActionSheet(
                        'Selecciona un rol',
                        roles.map((r) => ({ label: r.role_name, value: String(r.id) })),
                        form.role_id,
                        (val) => handleChange('role_id', val)
                      )
                    }
                  >
                    <Text style={styles.dropdownText}>
                      {getSelectedLabel(
                        roles.map((r) => ({ label: r.role_name, value: String(r.id) })),
                        form.role_id
                      ) || 'Selecciona un rol'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={24} color="#666" style={styles.dropdownIcon} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Empresa - Android Picker */}
                  <View style={styles.dropdown}>
                    <Picker
                      selectedValue={form.company_id}
                      onValueChange={(v) => handleChange('company_id', v)}
                      style={styles.picker}
                    >
                      <Picker.Item label="Selecciona una empresa" value="" />
                      {companies.map((c) => (
                        <Picker.Item key={c.company_id} label={c.name} value={String(c.company_id)} />
                      ))}
                    </Picker>
                  </View>

                  {/* Rol - Android Picker */}
                  <View style={styles.dropdown}>
                    <Picker
                      selectedValue={form.role_id}
                      onValueChange={(v) => handleChange('role_id', v)}
                      style={styles.picker}
                    >
                      <Picker.Item label="Selecciona un rol" value="" />
                      {roles.map((r) => (
                        <Picker.Item key={r.id} label={r.role_name} value={String(r.id)} />
                      ))}
                    </Picker>
                  </View>
                </>
              )}
            </>
          )}

          {/* Botón principal */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Registrando..." : "Registrar usuario"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
  top: Platform.OS === 'ios' ? 70 : 40, // más abajo en iOS por notch
    left: 20,
    zIndex: 20,
  },
  backButton: {
    backgroundColor: "#FFD23F",
    padding: 10,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  header: {
    backgroundColor: "#6C63FF",
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  paddingTop: Platform.OS === 'ios' ? 30 : 0, // separa imagen del notch
  },
  headerImage: {
    width: "70%",
    height: "100%",
  },
  container: {
    backgroundColor: "#fff",
    top: 0,
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 40,
    zIndex: 10,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  formCard: {
    backgroundColor: "#fff",
    top: 12,
    padding: 18,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#333",
  },
  input: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "#F3F4F6",
    paddingRight: 40,
  },
  inputSuccess: {
    borderColor: "#2ecc40",
  },
  inputContainer: {
    position: "relative",
    justifyContent: "center",
  },
  iconRight: {
    position: "absolute",
    right: 10,
    top: 14,
    zIndex: 10,
  },
  inputError: {
    borderColor: "red",
  },
  errorText: {
    color: "red",
    marginBottom: 10,
    fontSize: 13,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: 10,
    marginBottom: 12,
  backgroundColor: "#F3F4F6",
  overflow: 'hidden',
  },
  dropdownText: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    color: '#333',
    fontSize: 16,
  },
  dropdownIcon: {
    position: 'absolute',
    right: 10,
    top: 12,
  },
  picker: {
  height: 50,
  width: "100%",
  backgroundColor: 'transparent',
  },
  button: {
    backgroundColor: "#FFD23F",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#333",
    fontSize: 17,
    fontWeight: "600",
  },
});

export default RegisterUserScreen;
