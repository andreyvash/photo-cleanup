import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, type ColorValue, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

type Variant = 'primary' | 'destructive' | 'tinted' | 'destructiveTinted' | 'plain';

const VARIANTS: Record<Variant, { background: ColorValue; foreground: ColorValue }> = {
  primary: { background: colors.accent, foreground: '#FFFFFF' },
  destructive: { background: colors.destructive, foreground: '#FFFFFF' },
  tinted: { background: colors.fill, foreground: colors.accent },
  destructiveTinted: { background: colors.fill, foreground: colors.destructive },
  plain: { background: 'transparent', foreground: colors.accent },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: SFSymbol;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { background, foreground } = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.4 : 1 },
        pressed && variant !== 'plain' && styles.pressed,
        pressed && variant === 'plain' && styles.pressedPlain,
        style,
      ]}>
      {icon ? <SymbolView name={icon} size={17} tintColor={foreground} weight="semibold" /> : null}
      <Text style={[styles.title, { color: foreground }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  pressedPlain: { opacity: 0.4 },
  title: { ...type.headline },
});
