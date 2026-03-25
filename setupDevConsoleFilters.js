import { LogBox } from 'react-native';

// Filtra logs ruidosos de expo-notifications en Expo Go (SDK 53+) lo más temprano posible.
// Importante: este módulo NO debe importar expo-notifications; solo suprime mensajes.

if (__DEV__ && !global.__expoNotificationsConsoleFilterInstalled) {
	global.__expoNotificationsConsoleFilterInstalled = true;

	LogBox.ignoreLogs([
		'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
		'`expo-notifications` functionality is not fully supported in Expo Go',
	]);

	const originalError = console.error;
	const originalWarn = console.warn;

	const shouldSuppress = (firstArg) => {
		const msg = typeof firstArg === 'string' ? firstArg : String(firstArg ?? '');
		return (
			msg.includes('expo-notifications: Android Push notifications (remote notifications) functionality') ||
			msg.includes('removed from Expo Go with the release of SDK 53') ||
			msg.includes('`expo-notifications` functionality is not fully supported in Expo Go') ||
			msg.includes('Learn more at https://docs.expo.dev/develop/development-builds/introduction/') ||
			msg.includes('Learn more: https://expo.fyi/dev-client')
		);
	};

	console.error = (...args) => {
		if (shouldSuppress(args?.[0])) return;
		originalError(...args);
	};

	console.warn = (...args) => {
		if (shouldSuppress(args?.[0])) return;
		originalWarn(...args);
	};
}
