import React, { useState } from "react";
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
} from "react-native";
import { supabase } from "./supabaseClient";
import { MaterialIcons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

const showAlert = (title, message) => {
  if (Platform.OS === "web") {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const LoginScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  const isValidEmail = emailRegex.test(form.email) && form.email.length > 0;
  const isValidPassword = form.password.length >= 6;

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  const handleLogin = async () => {
    setLoading(true);
    setFieldErrors({ email: "", password: "" });
    if (!isValidEmail) {
      setFieldErrors((prev) => ({ ...prev, email: "Correo no válido." }));
      setLoading(false);
      return;
    }
    if (!isValidPassword) {
      setFieldErrors((prev) => ({ ...prev, password: "La contraseña debe tener al menos 6 caracteres." }));
      setLoading(false);
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) {
        showAlert("Error", error.message);
        setLoading(false);
        return;
      }
      // Login exitoso
      navigation.replace("Principal");
    } catch (error) {
      showAlert("Error", error.message);
    }
    setLoading(false);
  };

  return (
  <View style={{ flex: 1, backgroundColor: "#6C63FF" }}>
    {/* Encabezado con ilustración */}
    <View style={styles.header}>
      <Image
        source={require("./assets/login.png")}
        style={styles.headerImage}
        resizeMode="contain"
      />
    </View>

    {/* Contenido scrolleable */}
    <KeyboardAwareScrollView
      contentContainerStyle={styles.container}
      enableOnAndroid={true}
      extraScrollHeight={40}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.formCard}>
        <Text style={styles.title}>Iniciar sesión</Text>

        {/* Campo Email */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              fieldErrors.email
                ? styles.inputError
                : isValidEmail
                ? styles.inputSuccess
                : null,
            ]}
            placeholder="Email"
            value={form.email}
            onChangeText={(v) => handleChange("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {isValidEmail && (
            <MaterialIcons
              name="check"
              size={22}
              color="#2ecc40"
              style={styles.iconRight}
            />
          )}
        </View>
        {fieldErrors.email ? (
          <Text style={styles.errorText}>{fieldErrors.email}</Text>
        ) : null}

        {/* Campo Password */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              fieldErrors.password
                ? styles.inputError
                : isValidPassword
                ? styles.inputSuccess
                : null,
            ]}
            placeholder="Contraseña"
            value={form.password}
            onChangeText={(v) => handleChange("password", v)}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={styles.iconToggle}
            onPress={() => setShowPassword((prev) => !prev)}
          >
            <MaterialIcons
              name={showPassword ? "visibility" : "visibility-off"}
              size={22}
              color="#888"
            />
          </TouchableOpacity>
          {isValidPassword && (
            <MaterialIcons
              name="check"
              size={22}
              color="#2ecc40"
              style={styles.iconRight}
            />
          )}
        </View>
        {fieldErrors.password ? (
          <Text style={styles.errorText}>{fieldErrors.password}</Text>
        ) : null}

        {/* Botón Login */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Text>
        </TouchableOpacity>

        {/* Link Olvidé contraseña */}
        <TouchableOpacity
          style={styles.forgotContainer}
            onPress={() => navigation.navigate("ForgotPassword")}
        >
          <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>

    {/* Links fijos abajo */}
    <View style={styles.bottomLinks}>
      <TouchableOpacity
        style={styles.linkItem}
        onPress={() =>
          Alert.alert("Soporte técnico", "Escríbenos a soporte@cargoapp.com")
        }
      >
        <MaterialIcons
          name="support-agent"
          size={30}
          color="#333"
          style={styles.linkIcon}
        />
        <Text style={styles.linkText}>Soporte técnico</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkItem}
        onPress={() =>
          Alert.alert("Visita nuestra web", "https://cargoapp.com")
        }
      >
        <MaterialIcons
          name="public"
          size={30}
          color="#333"
          style={styles.linkIcon}
        />
        <Text style={styles.linkText}>Visita nuestra web</Text>
      </TouchableOpacity>
    </View>
  </View>
);

};

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 20,
  },
  backButton: {
    backgroundColor: "#FFD23F",
    padding: 10,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 8,
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
    borderBottomRightRadius: 200,
  },
  formCard: {
    backgroundColor: "#fff",
    top: 16,
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
    marginBottom: 14,
    fontSize: 16,
    backgroundColor: "#F3F4F6",
    paddingRight: 40,
  },
  inputSuccess: {
    borderColor: "#2ecc40",
  },
  inputError: {
    borderColor: "red",
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
  iconToggle: {
    position: "absolute",
    right: 38,
    top: 14,
    zIndex: 10,
    padding: 2,
  },
  errorText: {
    color: "red",
    marginBottom: 10,
    fontSize: 13,
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
    fontSize: 19,
    fontWeight: "600",
  },

  forgotContainer: {
    marginTop: 18,
    alignItems: 'center',
  },
  forgotText: {
    color: '#333',
    fontWeight: "600",
    fontSize: 15,
    textDecorationLine: 'none',
  },

  bottomLinks: {
  position: 'absolute',   // para fijarlo en la parte inferior
  bottom: 25,             // distancia desde abajo
  left: 0,
  right: 0,
  flexDirection: 'row',   // pone los hijos en fila
  justifyContent: 'space-between', // uno a la izq, otro a la der
  paddingHorizontal: 20,  // margen lateral
  alignItems: 'center',
},

linkItem: {
  flexDirection: 'row',
  alignItems: 'center',
},

linkIcon: {
  marginRight: 8,
},

linkText: {
  color: '#333',
  fontSize: 15,
  textDecorationLine: 'none',
},



});

export default LoginScreen;
