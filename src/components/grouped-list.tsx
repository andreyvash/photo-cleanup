import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

/** An inset grouped section, like iOS Settings: optional header, rows, optional footer. */
export function GroupedSection({ header, footer, children }: { header?: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {header ? <Text style={styles.header}>{header.toUpperCase()}</Text> : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function GroupedRow({
  title,
  icon,
  titleColor = colors.label,
  selected,
  onPress,
}: {
  title: string;
  icon?: SFSymbol;
  titleColor?: ColorValue;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: !!selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {icon ? <SymbolView name={icon} size={20} tintColor={colors.accent} style={styles.icon} /> : null}
      <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
        {title}
      </Text>
      {selected ? <SymbolView name="checkmark" size={16} weight="semibold" tintColor={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.s - 2, paddingHorizontal: spacing.l },
  header: { ...type.footnote, color: colors.secondaryLabel, paddingHorizontal: spacing.l },
  footer: { ...type.footnote, color: colors.secondaryLabel, paddingHorizontal: spacing.l },
  card: { borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.card, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: spacing.l + 32 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingHorizontal: spacing.l },
  rowPressed: { backgroundColor: colors.fill },
  icon: { width: 24, height: 24 },
  title: { ...type.body, flex: 1 },
});
