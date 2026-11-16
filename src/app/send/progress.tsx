import { Host } from '@expo/ui';
import { ProgressView } from '@expo/ui/swift-ui';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/button';
import { formatBytes, formatCount } from '@/lib/format';
import { useTransfer, useTransferQueue } from '@/send/send-session';
import { colors, radius, spacing, tabularNumbers, type } from '@/theme';
import type { TransferItem, TransferStatus } from '@/transfer/queue';

const KEEP_AWAKE_TAG = 'send-to-drive';

function statusText(status: TransferStatus | undefined): string {
  switch (status?.state) {
    case 'downloading':
      // PhotoKit only reports progress when it has to download from iCloud.
      return status.progress > 0 ? `Downloading from iCloud ${Math.round(status.progress * 100)}%` : 'Preparing…';
    case 'uploading':
      return `Uploading ${Math.round(status.progress * 100)}%`;
    case 'sent':
      return 'Sent';
    case 'failed':
    case 'notSent':
      return status.message;
    default:
      return 'Waiting';
  }
}

function StatusRow({ item, status }: { item: TransferItem; status: TransferStatus | undefined }) {
  const state = status?.state ?? 'waiting';
  const problem = state === 'failed' || state === 'notSent';
  return (
    <View style={styles.row} accessible accessibilityLabel={`${item.filename ?? 'Item'}, ${statusText(status)}`}>
      <Image source={{ uri: `ph://${item.id}` }} contentFit="cover" style={styles.thumbnail} />
      <View style={styles.rowText}>
        <Text style={styles.filename} numberOfLines={1}>
          {item.filename ?? 'Untitled'}
        </Text>
        <Text style={[styles.status, problem && styles.statusProblem]} numberOfLines={2}>
          {statusText(status)}
        </Text>
      </View>
      <Text style={styles.size}>{formatBytes(item.size)}</Text>
      {state === 'sent' ? <SymbolView name="checkmark.circle.fill" size={20} tintColor={colors.success} /> : null}
      {state === 'failed' ? (
        <SymbolView name="exclamationmark.circle.fill" size={20} tintColor={colors.destructive} />
      ) : null}
    </View>
  );
}

export default function TransferProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queue = useTransferQueue();
  const { phase, folder, items, statuses } = useTransfer(
    useShallow((s) => ({ phase: s.phase, folder: s.folder, items: s.items, statuses: s.statuses })),
  );

  const sentIds = items.filter((item) => statuses[item.id]?.state === 'sent').map((item) => item.id);
  const retryable = items.filter((item) => ['failed', 'notSent'].includes(statuses[item.id]?.state ?? '')).length;
  const busy = phase === 'running' || phase === 'stopping';
  const sentBytes = items
    .filter((item) => statuses[item.id]?.state === 'sent')
    .reduce((total, item) => total + (item.size ?? 0), 0);
  const totalBytes = items.reduce((total, item) => total + (item.size ?? 0), 0);
  const progress = items.length === 0 ? 0 : sentIds.length / items.length;

  useEffect(() => {
    if (!busy) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [busy]);

  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current !== 'finished' && phase === 'finished') {
      void Haptics.notificationAsync(
        retryable === 0 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
    }
    previousPhase.current = phase;
  }, [phase, retryable]);

  // Closing the modal narrows the selection to what reached Drive (see SendSessionProvider).
  const done = () => router.dismissTo('/');

  const title = busy ? 'Sending' : retryable > 0 ? 'Finished with Problems' : 'Sent to Drive';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title, gestureEnabled: phase !== 'running' }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.count} accessibilityRole="header">
              {sentIds.length} of {items.length} sent
            </Text>
            <Text style={styles.detail}>
              {formatBytes(sentBytes)} of {formatBytes(totalBytes)}
              {folder ? ` · to “${folder.name}”` : ''}
            </Text>
            <Host matchContents={{ vertical: true }} style={styles.progress}>
              <ProgressView value={progress} />
            </Host>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <StatusRow item={item} status={statuses[item.id]} />}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s }]}>
        {busy ? (
          <Button title={phase === 'stopping' ? 'Stopping…' : 'Stop'} variant="tinted" disabled={phase === 'stopping'} onPress={() => queue.stop()} />
        ) : (
          <>
            {retryable > 0 ? (
              <Button title={`Retry ${formatCount(retryable, 'Failed', 'Failed')}`} onPress={() => void queue.retryFailed()} />
            ) : null}
            <Button title="Done" variant={retryable > 0 ? 'plain' : 'primary'} onPress={done} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.groupedBackground },
  list: { paddingBottom: spacing.l },
  header: { paddingHorizontal: spacing.l, paddingVertical: spacing.l, gap: spacing.xs },
  count: { ...type.title2, ...tabularNumbers, color: colors.label },
  detail: { ...type.subheadline, ...tabularNumbers, color: colors.secondaryLabel },
  progress: { width: '100%', marginTop: spacing.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s + 2,
    backgroundColor: colors.card,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.l + 44 + spacing.m },
  thumbnail: { width: 44, height: 44, borderRadius: radius.thumb, borderCurve: 'continuous', backgroundColor: colors.placeholder },
  rowText: { flex: 1, gap: 2 },
  filename: { ...type.body, color: colors.label },
  status: { ...type.footnote, ...tabularNumbers, color: colors.secondaryLabel },
  statusProblem: { color: colors.destructive },
  size: { ...type.footnote, ...tabularNumbers, color: colors.secondaryLabel },
  footer: { paddingHorizontal: spacing.l, paddingTop: spacing.m, gap: spacing.xs },
});
