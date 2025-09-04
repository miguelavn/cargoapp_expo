import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

export default function VerifyCodeScreen({ route, navigation }) {
  const { email } = route.params;
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendTimer, setResendTimer] = useState(0); // segundos

  const isValidCode = code.trim().length === 6;
  const lengthOk = newPassword.length >= 8;
  const hasLetter = /[A-Za-z]/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const isValidPassword = lengthOk && hasLetter && hasUpper && hasNumber;
  const passwordsMatch = isValidPassword && confirmPassword.length > 0 && newPassword === confirmPassword;

  // Countdown para reenvío
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const handleVerify = async () => {
    setError("");
    if (!isValidCode || !isValidPassword || !passwordsMatch) {
      if (!isValidCode) {
        setError("El código debe tener 6 dígitos.");
      } else if (!lengthOk) {
        setError("La contraseña debe tener al menos 8 caracteres.");
      } else if (!hasUpper) {
        setError("La contraseña debe incluir al menos una mayúscula.");
      } else if (!hasNumber) {
        setError("La contraseña debe incluir al menos un número.");
      } else if (!hasLetter) {
        setError("La contraseña debe incluir letras.");
      } else if (!passwordsMatch) {
        setError("Las contraseñas no coinciden.");
      }
      return;
    }
    setLoading(true);

    try {
      const resp = await fetch("https://tywfaayajgpfajvzftbd.functions.supabase.co/verify-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Error al verificar código");

      Alert.alert("Éxito", "Tu contraseña ha sido cambiada.");
      navigation.replace("PasswordResetSuccess");
    } catch (err) {
      Alert.alert("Error", err.message);
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      const resp = await fetch("https://tywfaayajgpfajvzftbd.functions.supabase.co/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "No se pudo reenviar el código");
      Alert.alert("Código reenviado", "Revisa tu correo nuevamente.");
      setResendTimer(60);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
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
          <Text style={styles.title}>Verificar código</Text>
          <Text style={styles.subtitle}>Ingresa el código que enviamos a tu correo y define tu nueva contraseña.</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, !code ? null : isValidCode ? styles.inputSuccess : styles.inputError]}
              placeholder="Código de 6 dígitos"
              value={code}
              onChangeText={setCode}
              keyboardType="numeric"
              maxLength={6}
            />
            {isValidCode && (
              <MaterialIcons name="check" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, !newPassword ? null : isValidPassword ? styles.inputSuccess : styles.inputError]}
              placeholder="Nueva contraseña"
              secureTextEntry={!showPassword}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity style={styles.iconToggle} onPress={() => setShowPassword((p) => !p)}>
              <MaterialIcons name={showPassword ? "visibility" : "visibility-off"} size={22} color="#888" />
            </TouchableOpacity>
            {isValidPassword && (
              <MaterialIcons name="check" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>
          <Text style={styles.hintText}>Mín. 8 caracteres, 1 mayúscula y 1 número.</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                !confirmPassword ? null : passwordsMatch ? styles.inputSuccess : styles.inputError,
              ]}
              placeholder="Confirmar contraseña"
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity style={styles.iconToggle} onPress={() => setShowConfirmPassword((p) => !p)}>
              <MaterialIcons name={showConfirmPassword ? "visibility" : "visibility-off"} size={22} color="#888" />
            </TouchableOpacity>
            {passwordsMatch && (
              <MaterialIcons name="check" size={22} color="#2ecc40" style={styles.iconRight} />
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleVerify} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "Verificando..." : "Confirmar"}</Text>
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>¿No recibiste el código?</Text>
            <TouchableOpacity onPress={handleResend} disabled={resendTimer > 0}>
              <Text style={[styles.resendLink, resendTimer > 0 && styles.resendLinkDisabled]}>
                {resendTimer > 0 ? `Reenviar en ${resendTimer}s` : "Reenviar código"}
              </Text>
            </TouchableOpacity>
          </View>
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
    textAlign: "center",
  },
  hintText: {
    color: "#666",
    fontSize: 12,
    marginTop: -6,
    marginBottom: 10,
    textAlign: 'left',
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
  resendRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resendText: { color: '#666' },
  resendLink: { color: '#007bff', fontWeight: '600' },
  resendLinkDisabled: { color: '#999' },
});
