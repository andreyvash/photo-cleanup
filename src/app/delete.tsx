import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/button';
import { formatCount } from '@/lib/format';
import { useLibrary } from '@/library/library-store-provider';
import { describeItems } from '@/library/selection';
import { colors, radius, spacing, tabularNumbers, type } from '@/theme';

const MAX_THUMBNAILS = 7;

const WARNINGS: { icon: SFSymbol; text: string }[] = [
  { icon: 'trash', text: 'They’ll move to Recently Deleted in Photos, where you can recover them for 30 days.' },
  { icon: 'icloud', text: 'If iCloud Photos is on, they’ll also be deleted from your other devices that use it.' },
  { icon: 'hand.raised', text: 'iOS will ask you to confirm once more.' },
];

export default function DeleteReviewSheet() {
  const router = useRouter();
  const { selectedIds, sizes, deleteSelected } = useLibrary(
    useShallow((s) => ({ selectedIds: s.selectedIds, sizes: s.sizes, deleteSelected: s.deleteSelected })),
  );
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const outcome = await deleteSelected();
      if (outcome === 'deleted') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          Delete {formatCount(selectedIds.length, 'Item', 'Items')}?
        </Text>
        <Text style={styles.summary}>{describeItems(selectedIds, sizes)}</Text>
      </View>

      {/* A plain row: a ScrollView here would be adopted by the form sheet as its scrolling content. */}
      <View style={styles.thumbnails}>
        {selectedIds.slice(0, MAX_THUMBNAILS).map((id) => (
          <Image key={id} source={{ uri: `ph://${id}` }} contentFit="cover" style={styles.thumbnail} />
        ))}
        {selectedIds.length > MAX_THUMBNAILS ? (
          <View style={[styles.thumbnail, styles.more]}>
            <Text style={styles.moreText}>+{selectedIds.length - MAX_THUMBNAILS}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.warnings}>
        {WARNINGS.map(({ icon, text }) => (
          <View key={icon} style={styles.warning}>
            <SymbolView name={icon} size={20} tintColor={colors.secondaryLabel} style={styles.warningIcon} />
            <Text style={styles.warningText}>{text}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          Couldn’t delete: {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button title="Delete from Photos" variant="destructive" disabled={deleting} onPress={() => void confirmDelete()} />
        <Button title="Cancel" variant="plain" disabled={deleting} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: spacing.xl, paddingBottom: spacing.s, gap: spacing.xl },
  heading: { paddingHorizontal: spacing.xl, gap: spacing.xs, alignItems: 'center' },
  title: { ...type.title2, color: colors.label, textAlign: 'center' },
  summary: { ...type.subheadline, ...tabularNumbers, color: colors.secondaryLabel },
  thumbnails: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xs },
  thumbnail: { width: 44, height: 44, borderRadius: radius.thumb, borderCurve: 'continuous', backgroundColor: colors.placeholder },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill },
  moreText: { ...type.subheadline, ...tabularNumbers, fontWeight: '600', color: colors.secondaryLabel },
  warnings: { paddingHorizontal: spacing.xl, gap: spacing.m },
  warning: { flexDirection: 'row', gap: spacing.m, alignItems: 'flex-start' },
  warningIcon: { width: 24, height: 24 },
  warningText: { ...type.subheadline, color: colors.label, flex: 1 },
  error: { ...type.footnote, color: colors.destructive, paddingHorizontal: spacing.xl },
  actions: { paddingHorizontal: spacing.xl, gap: spacing.xs },
});
