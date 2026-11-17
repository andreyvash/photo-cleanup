import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/button';
import { GroupedRow, GroupedSection } from '@/components/grouped-list';
import { Thumbnail } from '@/components/thumbnail';
import { formatCount } from '@/lib/format';
import { useLibrary, useLibraryStore } from '@/library/library-store-provider';
import { describeItems } from '@/library/selection';
import { DRIVE_FOLDERS_KEY, useSendSession, useTransferQueue } from '@/send/send-session';
import { useService } from '@/services';
import { colors, spacing, tabularNumbers, type } from '@/theme';

const THUMBNAILS = 8;

export default function SendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const drive = useService('drive');
  const queue = useTransferQueue();
  const library = useLibraryStore();
  const { selectedIds, sizes } = useLibrary(useShallow((s) => ({ selectedIds: s.selectedIds, sizes: s.sizes })));
  const session = useSendSession(
    useShallow((s) => ({
      auth: s.auth,
      signingIn: s.signingIn,
      error: s.error,
      folderId: s.folderId,
      signIn: s.signIn,
      signOut: s.signOut,
      chooseFolder: s.chooseFolder,
    })),
  );

  const { auth } = session;
  const folders = useQuery({
    queryKey: [DRIVE_FOLDERS_KEY, auth.status === 'signedIn' ? auth.account.email : null],
    queryFn: () => drive.listFolders(),
    enabled: auth.status === 'signedIn',
  });
  const folder = folders.data?.find((candidate) => candidate.id === session.folderId) ?? null;

  function send() {
    if (!folder) return;
    const filenames = new Map(library.getState().items.map((item) => [item.id, item.filename]));
    const transferItems = selectedIds.map((id) => ({ id, filename: filenames.get(id) ?? null, size: sizes[id] ?? null }));
    void queue.start(transferItems, { id: folder.id, name: folder.name });
    router.replace('/send/progress');
  }

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View style={styles.thumbnails}>
            {selectedIds.slice(0, THUMBNAILS).map((id) => (
              <Thumbnail key={id} id={id} />
            ))}
          </View>
          <Text style={styles.summaryText}>{describeItems(selectedIds, sizes)}</Text>
        </View>

        {auth.status === 'checking' ? <ActivityIndicator style={styles.loading} /> : null}

        {auth.status === 'signedOut' ? (
          <View style={styles.signIn}>
            <Text style={styles.body}>
              Sign in to choose a folder in your Google Drive. Photo Cleanup can only see folders it creates — not the
              rest of your Drive.
            </Text>
            <Button
              title="Sign in with Google"
              disabled={session.signingIn}
              onPress={() => void session.signIn()}
            />
            {session.error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {session.error}
              </Text>
            ) : null}
          </View>
        ) : null}

        {auth.status === 'signedIn' ? (
          <>
            <GroupedSection header="Folder" footer="Only folders created by Photo Cleanup are shown.">
              {folders.isPending ? <GroupedRow title="Loading folders…" /> : null}
              {folders.isError ? (
                <GroupedRow
                  title="Couldn’t load folders. Try Again"
                  icon="arrow.clockwise"
                  onPress={() => void folders.refetch()}
                />
              ) : null}
              {folders.data?.length === 0 ? <GroupedRow title="No folders yet — create one below." /> : null}
              {folders.data?.map((candidate) => (
                <GroupedRow
                  key={candidate.id}
                  title={candidate.name}
                  icon="folder"
                  selected={candidate.id === session.folderId}
                  onPress={() => session.chooseFolder(candidate.id)}
                />
              ))}
              <GroupedRow
                title="New Folder…"
                icon="folder.badge.plus"
                titleColor={colors.accent}
                onPress={() => router.push('/send/new-folder')}
              />
            </GroupedSection>

            <GroupedSection footer={`Signed in as ${auth.account.email}`}>
              <GroupedRow title="Sign Out" titleColor={colors.accent} onPress={() => void session.signOut()} />
            </GroupedSection>
          </>
        ) : null}
      </ScrollView>

      {auth.status === 'signedIn' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s }]}>
          <Text style={styles.footnote}>Copies go to Drive. Nothing is deleted from Photos.</Text>
          <Button
            title={`Send ${formatCount(selectedIds.length, 'Item', 'Items')}`}
            disabled={!folder || selectedIds.length === 0}
            onPress={send}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.l, gap: spacing.xl },
  summary: { alignItems: 'center', gap: spacing.m, paddingHorizontal: spacing.l },
  thumbnails: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  summaryText: { ...type.headline, ...tabularNumbers, color: colors.label },
  loading: { marginTop: spacing.xl },
  signIn: { paddingHorizontal: spacing.xl, gap: spacing.l },
  body: { ...type.subheadline, color: colors.secondaryLabel, textAlign: 'center' },
  error: { ...type.footnote, color: colors.destructive, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.l, paddingTop: spacing.m, gap: spacing.s, backgroundColor: colors.groupedBackground },
  footnote: { ...type.footnote, color: colors.secondaryLabel, textAlign: 'center' },
});
