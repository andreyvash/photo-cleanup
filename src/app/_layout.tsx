import { Stack } from 'expo-router';

import { LibraryStoreProvider } from '@/library/library-store-provider';

export default function RootLayout() {
  return (
    <LibraryStoreProvider>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="asset/[id]" options={{ headerLargeTitleEnabled: false }} />
        <Stack.Screen name="send" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen
          name="delete"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            headerShown: false,
          }}
        />
      </Stack>
    </LibraryStoreProvider>
  );
}
