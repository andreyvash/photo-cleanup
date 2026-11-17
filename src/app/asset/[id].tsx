import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { MessageView } from '@/components/message-view';
import { formatBytes, formatDuration } from '@/lib/format';
import { assetUri } from '@/library/asset-uri';
import { useLibrary } from '@/library/library-store-provider';
import type { LibraryItem } from '@/library/types';
import { colors, spacing, tabularNumbers, type } from '@/theme';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function details(item: LibraryItem) {
  const parts: string[] = [];
  if (item.filename) parts.push(item.filename);
  if (item.width && item.height) parts.push(`${item.width} × ${item.height}`);
  if (item.mediaType === 'video' && item.duration != null) parts.push(formatDuration(item.duration));
  return parts.join(' · ');
}

function VideoPreview({ id }: { id: string }) {
  const player = useVideoPlayer(null);
  useEffect(() => {
    // Photo-library videos can only be loaded with replaceAsync.
    void player.replaceAsync({ uri: assetUri(id) });
  }, [player, id]);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.media} />;
}

export default function AssetPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { item, size, selected, toggleSelection } = useLibrary(
    useShallow((s) => ({
      item: s.items.find((candidate) => candidate.id === id),
      size: s.sizes[id],
      selected: s.selectedIds.includes(id),
      toggleSelection: s.toggleSelection,
    })),
  );

  if (!item) {
    return (
      <>
        <Stack.Screen.Title>Not Found</Stack.Screen.Title>
        <MessageView
          icon="questionmark.square.dashed"
          title="Item Not Found"
          body="It may have been deleted in the Photos app."
        />
      </>
    );
  }

  const sizeText = size === undefined ? 'Measuring…' : formatBytes(size);

  return (
    <View style={styles.container}>
      <Stack.Screen.Title>{sizeText}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={selected ? 'checkmark.circle.fill' : 'circle'}
          onPress={() => toggleSelection(item.id)}>
          {selected ? 'Selected' : 'Select'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {item.mediaType === 'video' ? (
        <VideoPreview id={item.id} />
      ) : (
        <Image source={{ uri: assetUri(item.id) }} contentFit="contain" style={styles.media} transition={150} />
      )}

      <View style={[styles.info, { paddingBottom: insets.bottom + spacing.m }]}>
        <Text style={styles.size} selectable>
          {sizeText}
        </Text>
        <Text style={styles.details} selectable>
          {details(item)}
        </Text>
        {item.creationTime != null ? (
          <Text style={styles.details}>{dateFormat.format(new Date(item.creationTime))}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  media: { flex: 1 },
  info: { paddingHorizontal: spacing.l, paddingTop: spacing.m, gap: spacing.xxs, alignItems: 'center' },
  size: { ...type.headline, ...tabularNumbers, color: colors.label },
  details: { ...type.footnote, ...tabularNumbers, color: colors.secondaryLabel, textAlign: 'center' },
});
