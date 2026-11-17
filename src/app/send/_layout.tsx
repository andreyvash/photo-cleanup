import { Stack } from 'expo-router';

import { SendSessionProvider } from '@/send/send-session';
import { colors } from '@/theme';

export default function SendLayout() {
  return (
    <SendSessionProvider>
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.groupedBackground } }}>
        <Stack.Screen name="index" options={{ title: 'Send to Google Drive' }} />
        <Stack.Screen
          name="new-folder"
          options={{
            title: 'New Folder',
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.groupedBackground },
          }}
        />
        <Stack.Screen name="progress" options={{ headerBackVisible: false }} />
      </Stack>
    </SendSessionProvider>
  );
}
