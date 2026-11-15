import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, tabularNumbers, type } from '@/theme';

import { Button } from './button';

export const SELECTION_BAR_HEIGHT = 128;

/** Floating bar shown while items are selected: what's selected, and what you can do with it. */
export function SelectionBar({
  summary,
  onClear,
  onDelete,
  onSend,
}: {
  summary: string;
  onClear: () => void;
  onDelete: () => void;
  onSend: () => void;
}) {
  const insets = useSafeAreaInsets();
  const Surface = isLiquidGlassAvailable() ? GlassView : View;
  return (
    <View testID="selection-bar" style={[styles.container, { bottom: Math.max(insets.bottom, spacing.m) }]}>
      <Surface style={[styles.bar, !isLiquidGlassAvailable() && styles.solid]}>
        <View style={styles.row}>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear Selection"
            hitSlop={12}
            onPress={onClear}
            style={({ pressed }) => pressed && { opacity: 0.4 }}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Button title="Delete" icon="trash" variant="destructiveTinted" onPress={onDelete} style={styles.action} />
          <Button title="Send to Drive" icon="icloud.and.arrow.up" onPress={onSend} style={styles.action} />
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: spacing.m, right: spacing.m },
  bar: {
    borderRadius: radius.bar,
    borderCurve: 'continuous',
    padding: spacing.m,
    paddingTop: spacing.m + 2,
    gap: spacing.m,
    overflow: 'hidden',
  },
  solid: { backgroundColor: colors.card, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.xs },
  summary: { ...type.headline, ...tabularNumbers, color: colors.label, flex: 1 },
  clear: { ...type.body, color: colors.accent },
  action: { flex: 1, paddingHorizontal: spacing.m },
});
