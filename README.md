# cargoapp_expo
App mobil de cargo hecha con react native y expo

## EAS Build para Android

Este proyecto esta configurado para generar builds Android con EAS en dos modos:

- APK instalable (preview): build de distribucion interna en formato APK para instalar directamente en dispositivos Android.
- Development build (development): build con development client para pruebas y debugging en dispositivo real.

### Google Maps API Key (Android)

Para que `react-native-maps` funcione en APK/dev build (fuera de Expo Go), define la variable de entorno:

`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

Opciones recomendadas:

- En EAS (Cloud Build): agrega la variable en el proyecto EAS (`eas env:create` o desde dashboard).
- En local: exporta la variable antes de ejecutar comandos de build.

La configuracion de Expo inyecta esa variable en `android.config.googleMaps.apiKey` durante el build.

### 1) Login en EAS

eas login

### 2) Generar APK instalable

npm run build:apk

Usa el perfil preview y genera un APK Android instalable.

### 3) Generar development build

npm run build:dev

Usa el perfil development, habilita development client y distribucion interna para pruebas en dispositivo.
