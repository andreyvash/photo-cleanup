import type { ExpoConfig } from 'expo/config';

// iOS OAuth client ID from Google Cloud, e.g. "1234-abc.apps.googleusercontent.com".
// Set it in .env.local (gitignored). Without it the app builds, but Google sign-in reports that it isn't set up.
const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID || undefined;
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

const plugins: ExpoConfig['plugins'] = [
  'expo-router',
  [
    'expo-splash-screen',
    {
      backgroundColor: '#FFFFFF',
      dark: { backgroundColor: '#000000' },
      image: './assets/images/splash-icon.png',
      imageWidth: 76,
    },
  ],
  [
    'expo-media-library',
    {
      photosPermission:
        'Photo Cleanup shows your photos and videos sorted by size so you can copy them to Google Drive or delete them.',
    },
  ],
  'expo-video',
];

if (googleIosUrlScheme) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]);
}

const config: ExpoConfig = {
  name: 'Photo Cleanup',
  slug: 'photo-cleanup',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'photocleanup',
  userInterfaceStyle: 'automatic',
  platforms: ['ios'],
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: 'dev.photocleanup.app',
    supportsTablet: false,
  },
  plugins,
  extra: {
    googleIosClientId,
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
