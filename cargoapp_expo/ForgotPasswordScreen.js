import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, Image } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const isValidEmail = emailRegex.test(email) && email.length > 0;

  const handleRequest = async () => {
    setError("");
    if (!isValidEmail) {
      setError("Por favor ingresa un correo válido.");
      return;
    }
    setLoading(true);

    try {
      const resp = await fetch("https://tywfaayajgpfajvzftbd.functions.supabase.co/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Error al enviar código");

      Alert.alert("Revisa tu correo", "Te hemos enviado un código de recuperación.");
      navigation.navigate("VerifyCode", { email });
    } catch (err) {
      Alert.alert("Error", err.message);
    }

    setLoading(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#6C63FF" }}>
      {/* Botón moderno de regresar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Encabezado con ilustración */}
      <View style={styles.header}>
        <Image
          source={require("./assets/resetPassword.png")}
          style={styles.headerImage}
          resizeMode="contain"
        />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        enableOnAndroid={true}
        extraScrollHeight={40}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formCard}>
          <Text style={styles.title}>Recuperar contraseña</Text>
          <Text style={styles.subtitle}>
            Ingresa tu correo y te enviaremos un código para restablecer tu contraseña.
          </Text>

          {/* Campo Email */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                error ? styles.inputError : isValidEmail ? styles.inputSuccess : null,
              ]}
              placeholder="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {isValidEmail && (
              <MaterialIcons name="check" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Botón */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRequest}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Enviando..." : "Enviar código"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

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
    marginBottom: 10,
    color: "#333",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    color: "#666",
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
  errorText: {
    color: "red",
    marginBottom: 10,
    fontSize: 13,
    textAlign: "center",
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
