import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { assetUri } from '@/library/asset-uri';
import { colors, radius } from '@/theme';

export const THUMBNAIL_SIZE = 44;

const styles = StyleSheet.create({
  frame: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.thumb,
    borderCurve: 'continuous',
    backgroundColor: colors.placeholder,
  },
});

/** The thumbnail's frame, for a placeholder that sits in a row of thumbnails. */
export const thumbnailFrame = styles.frame;

/** A small square preview of a Photos item. */
export function Thumbnail({ id }: { id: string }) {
  return <Image source={{ uri: assetUri(id) }} contentFit="cover" style={styles.frame} />;
}
