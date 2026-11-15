import { Color } from 'expo-router';
import type { TextStyle } from 'react-native';

/**
 * One accent (system blue), one grey family (iOS system greys), red only for destructive actions.
 * Shape rule: actions are pills, floating bars are capsules, cards use 16, list thumbnails 8, grid tiles are square.
 */
export const colors = {
  accent: Color.ios.systemBlue,
  destructive: Color.ios.systemRed,
  success: Color.ios.systemGreen,
  label: Color.ios.label,
  secondaryLabel: Color.ios.secondaryLabel,
  tertiaryLabel: Color.ios.tertiaryLabel,
  background: Color.ios.systemBackground,
  groupedBackground: Color.ios.systemGroupedBackground,
  card: Color.ios.secondarySystemGroupedBackground,
  fill: Color.ios.tertiarySystemFill,
  placeholder: Color.ios.secondarySystemFill,
  separator: Color.ios.separator,
  /** Text and badges drawn over photos look the same in light and dark mode. */
  onMedia: '#FFFFFF',
  mediaScrim: 'rgba(0, 0, 0, 0.55)',
} as const;

export const spacing = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

export const radius = { thumb: 8, card: 16, bar: 28, pill: 999 } as const;

/** iOS text styles at the default Dynamic Type size. */
export const type = {
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22 },
  subheadline: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

export const tabularNumbers: TextStyle = { fontVariant: ['tabular-nums'] };
