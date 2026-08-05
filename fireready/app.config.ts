import { ExpoConfig } from 'expo/config';

// App config lives in TypeScript (instead of app.json) so we can pull
// secrets like the Android Google Maps key from the environment at build time.
const config: ExpoConfig = {
  name: 'FireReady',
  slug: 'fireready',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'fireready',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    supportsTablet: false,
    // Uses Apple Maps via react-native-maps — no API key needed on iOS.
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'FireReady uses your location to share your check-in position with your family and to plan evacuation routes.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    config: {
      // Required for the map on Android dev/production builds.
      // Set GOOGLE_MAPS_ANDROID_API_KEY in .env (see README).
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    },
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#B3261E',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'FireReady uses your location to share your check-in position with your family and to plan evacuation routes.',
      },
    ],
    ['expo-notifications', {}],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    // Set this after `eas init` so push notifications can resolve your project.
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
