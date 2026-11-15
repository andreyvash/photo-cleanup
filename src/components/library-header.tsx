import { Host } from '@expo/ui';
import { Picker, ProgressView, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCount } from '@/lib/format';
import type { LibraryFilter } from '@/library/types';
import { colors, radius, spacing, tabularNumbers, type } from '@/theme';

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
];

export function LibraryHeader({
  summary,
  filter,
  onFilterChange,
  sizing,
  limited,
  onManageAccess,
  notice,
  onDismissNotice,
}: {
  summary: string;
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  sizing: { done: number; total: number } | null;
  limited: boolean;
  onManageAccess: () => void;
  notice: string | null;
  onDismissNotice: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.summary}>{summary}</Text>

      {sizing ? (
        <View style={styles.sizing} accessibilityLabel={`Measuring sizes, ${sizing.done} of ${sizing.total}`}>
          <Text style={styles.sizingText}>
            Measuring sizes… {formatCount(sizing.done, '', '').trim()} of {formatCount(sizing.total, 'item', 'items')}
          </Text>
          <Host matchContents={{ vertical: true }} style={styles.progressHost}>
            <ProgressView value={sizing.total === 0 ? 0 : sizing.done / sizing.total} />
          </Host>
        </View>
      ) : null}

      {notice ? (
        <View style={styles.banner} accessibilityRole="alert">
          <SymbolView name="trash" size={17} tintColor={colors.secondaryLabel} />
          <Text style={styles.bannerText}>{notice}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={onDismissNotice}>
            <SymbolView name="xmark" size={13} weight="semibold" tintColor={colors.secondaryLabel} />
          </Pressable>
        </View>
      ) : null}

      {limited ? (
        <View style={styles.banner}>
          <SymbolView name="lock.rectangle.stack" size={17} tintColor={colors.secondaryLabel} />
          <Text style={styles.bannerText}>You’re seeing only the photos you chose to share.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage"
            hitSlop={12}
            onPress={onManageAccess}
            style={({ pressed }) => pressed && { opacity: 0.4 }}>
            <Text style={styles.bannerAction}>Manage</Text>
          </Pressable>
        </View>
      ) : null}

      <Host matchContents={{ vertical: true }} style={styles.filterHost}>
        <Picker
          testID="library-filter"
          selection={filter}
          onSelectionChange={(value: LibraryFilter) => onFilterChange(value)}
          modifiers={[pickerStyle('segmented')]}>
          {FILTERS.map(({ value, label }) => (
            <SwiftText key={value} modifiers={[tag(value)]}>
              {label}
            </SwiftText>
          ))}
        </Picker>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.l, paddingBottom: spacing.m, gap: spacing.m },
  summary: { ...type.subheadline, ...tabularNumbers, color: colors.secondaryLabel },
  sizing: { gap: spacing.xs + 2 },
  sizingText: { ...type.footnote, ...tabularNumbers, color: colors.secondaryLabel },
  progressHost: { width: '100%' },
  filterHost: { width: '100%' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  bannerText: { ...type.footnote, color: colors.label, flex: 1 },
  bannerAction: { ...type.subheadline, fontWeight: '600', color: colors.accent },
});
