import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

export default function PasswordResetSuccessScreen({ navigation }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#6C63FF" }}>
      {/* Encabezado con ilustración */}
      <View style={styles.header}>
        <Image
          source={require("../../../assets/resetPassword.png")}
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
          <Text style={styles.title}>¡Contraseña cambiada!</Text>
          <Text style={styles.text}>Ya puedes iniciar sesión con tu nueva contraseña.</Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.replace("Login")}>
            <Text style={styles.buttonText}>Ir a Iniciar Sesión</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 10, color: '#333' },
  text: { fontSize: 16, textAlign: "center", marginBottom: 20, color: '#666' },
  button: { backgroundColor: "#FFD23F", paddingVertical: 14, borderRadius: 10, width: "100%", alignItems: "center" },
  buttonText: { color: "#333", fontWeight: "600", fontSize: 17 },
});
