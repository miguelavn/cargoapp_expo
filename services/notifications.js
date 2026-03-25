import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Mostrar notificaciones también cuando la app está abierta.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureLocalNotificationsAsync() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // En iOS y Android 13+ se requiere permiso incluso para notificaciones locales.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    const ok = finalStatus === 'granted';
    if (!ok) {
      console.log('[notifications] Permiso de notificaciones no concedido');
    }
    return ok;
  } catch (e) {
    console.log('[notifications] Error pidiendo permiso:', e?.message || e);
    return false;
  }
}

export function setupNotificationListeners({
  onNotificationReceived,
  onNotificationResponse,
} = {}) {
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    try {
      console.log('[notifications] received', {
        title: notification?.request?.content?.title,
        body: notification?.request?.content?.body,
        data: notification?.request?.content?.data,
      });
    } catch {
      // ignore
    }

    try {
      onNotificationReceived?.(notification);
    } catch {
      // ignore
    }
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};

    try {
      console.log('[notifications] response', {
        actionIdentifier: response?.actionIdentifier,
        data,
      });
    } catch {
      // ignore
    }

    try {
      onNotificationResponse?.(response);
    } catch {
      // ignore
    }
  });

  // Si la app fue abierta desde una notificación (cold start), recuperar la última respuesta.
  (async () => {
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) onNotificationResponse?.(last);
    } catch {
      // ignore
    }
  })();

  return () => {
    try {
      receivedSub?.remove?.();
    } catch {
      // ignore
    }
    try {
      responseSub?.remove?.();
    } catch {
      // ignore
    }
  };
}

export async function sendLocalNotification({
  title = 'Nuevo servicio asignado',
  body = 'Tienes un nuevo servicio disponible',
  data = { service_id: 123 },
} = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null,
    });
  } catch (e) {
    console.log('[notifications] Error enviando local notification:', e?.message || e);
  }
}
