const appJson = require('./app.json');

module.exports = () => {
  const baseConfig = appJson.expo || {};

  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_DIRECTIONS_API_KEY ||
    process.env.GOOGLE_DIRECTIONS_API_KEY ||
    baseConfig?.extra?.googleMapsApiKey ||
    '';

  return {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      config: {
        ...(baseConfig.android?.config || {}),
        googleMaps: {
          ...(baseConfig.android?.config?.googleMaps || {}),
          apiKey: googleMapsApiKey,
        },
      },
    },
    extra: {
      ...(baseConfig.extra || {}),
      googleMapsApiKey,
    },
  };
};
