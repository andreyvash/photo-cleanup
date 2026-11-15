import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme';

/** Centered icon + title + body (+ optional action) for permission, empty and error states. */
export function MessageView({
  icon,
  title,
  body,
  action,
}: {
  icon: SFSymbol;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.container}>
      <SymbolView name={icon} size={52} tintColor={colors.secondaryLabel} weight="light" />
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.l,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl * 2,
  },
  text: { alignItems: 'center', gap: spacing.s },
  title: { ...type.title3, color: colors.label, textAlign: 'center' },
  body: { ...type.subheadline, color: colors.secondaryLabel, textAlign: 'center' },
});
