import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBytes, formatDuration } from '@/lib/format';
import type { LibraryItem } from '@/library/types';
import { colors, radius, spacing, tabularNumbers, type } from '@/theme';

export function tileAccessibilityLabel(item: LibraryItem, size: number | null | undefined) {
  const parts = [item.mediaType === 'video' ? 'Video' : 'Photo'];
  if (size !== undefined) parts.push(formatBytes(size));
  if (item.mediaType === 'video' && item.duration != null) parts.push(formatDuration(item.duration));
  return parts.join(', ');
}

/** Grid tile: size pill bottom-left, selection circle bottom-right, duration top-left for videos. */
export const LibraryTile = memo(function LibraryTile({
  item,
  size,
  selected,
  tileSize,
  onOpen,
  onToggle,
}: {
  item: LibraryItem;
  /** null = can't be measured, undefined = not measured yet. */
  size: number | null | undefined;
  selected: boolean;
  tileSize: number;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <Pressable
      testID="library-tile"
      accessibilityRole="button"
      accessibilityLabel={tileAccessibilityLabel(item, size)}
      accessibilityState={{ selected }}
      accessibilityActions={[{ name: 'activate' }, { name: 'select', label: selected ? 'Deselect' : 'Select' }]}
      onAccessibilityAction={(event) => (event.nativeEvent.actionName === 'select' ? onToggle(item.id) : onOpen(item.id))}
      onPress={() => onOpen(item.id)}
      style={({ pressed }) => [{ width: tileSize, height: tileSize }, pressed && styles.pressed]}>
      <Image
        source={{ uri: `ph://${item.id}` }}
        recyclingKey={item.id}
        contentFit="cover"
        transition={0}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.placeholder }]}
      />
      {selected ? <View style={[StyleSheet.absoluteFill, styles.selectedScrim]} /> : null}

      {item.mediaType === 'video' && item.duration != null ? (
        <View style={[styles.badge, styles.topLeft]}>
          <SymbolView name="video.fill" size={10} tintColor={colors.onMedia} />
          <Text style={styles.badgeText}>{formatDuration(item.duration)}</Text>
        </View>
      ) : null}

      {size !== undefined ? (
        <View style={[styles.badge, styles.bottomLeft]}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {formatBytes(size)}
          </Text>
        </View>
      ) : null}

      <Pressable
        testID="select-toggle"
        accessibilityRole="checkbox"
        accessibilityLabel="Select"
        accessibilityState={{ checked: selected }}
        onPress={() => onToggle(item.id)}
        style={styles.selectHitArea}>
        <View style={[styles.circle, selected && styles.circleSelected]}>
          {selected ? <SymbolView name="checkmark" size={12} weight="bold" tintColor={colors.onMedia} /> : null}
        </View>
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  selectedScrim: { backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.mediaScrim,
    maxWidth: '72%',
  },
  topLeft: { top: spacing.xs + 2, left: spacing.xs + 2 },
  bottomLeft: { bottom: spacing.xs + 2, left: spacing.xs + 2 },
  badgeText: { ...type.caption2, ...tabularNumbers, color: colors.onMedia },
  selectHitArea: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.onMedia,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 2px rgba(0, 0, 0, 0.35)',
  },
  circleSelected: { backgroundColor: colors.accent, borderColor: colors.onMedia },
});
