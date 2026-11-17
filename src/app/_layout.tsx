import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { LibraryStoreProvider } from '@/library/library-store-provider';
import { useService } from '@/services';
import { colors } from '@/theme';

export default function RootLayout() {
  const exporter = useService('exporter');
  // At launch no transfer can be running yet, so temporary copies left by a killed session can go.
  useEffect(() => {
    void exporter.clearLeftovers();
  }, [exporter]);

  return (
    <LibraryStoreProvider>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: colors.background } }}>
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
