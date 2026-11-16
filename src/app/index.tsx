import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/button';
import { LibraryHeader } from '@/components/library-header';
import { LibraryTile } from '@/components/library-tile';
import { MessageView } from '@/components/message-view';
import { SELECTION_BAR_HEIGHT, SelectionBar } from '@/components/selection-bar';
import { useLibrary } from '@/library/library-store-provider';
import { describeItems } from '@/library/selection';
import { visibleItems } from '@/library/sortFilter';
import { colors, spacing } from '@/theme';

const COLUMNS = 3;
const GAP = 2;

export default function LibraryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tileSize = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const state = useLibrary(
    useShallow((s) => ({
      permission: s.permission,
      items: s.items,
      sizes: s.sizes,
      sizing: s.sizing,
      filter: s.filter,
      sort: s.sort,
      selectedIds: s.selectedIds,
      notice: s.notice,
    })),
  );
  const actions = useLibrary(
    useShallow((s) => ({
      requestAccess: s.requestAccess,
      manageAccess: s.manageAccess,
      setFilter: s.setFilter,
      setSort: s.setSort,
      toggleSelection: s.toggleSelection,
      clearSelection: s.clearSelection,
      dismissNotice: s.dismissNotice,
    })),
  );

  const items = useMemo(
    () => visibleItems(state.items, state.sizes, { filter: state.filter, sort: state.sort }),
    [state.items, state.sizes, state.filter, state.sort],
  );
  const selected = useMemo(() => new Set(state.selectedIds), [state.selectedIds]);
  const openItem = useCallback((id: string) => router.push({ pathname: '/asset/[id]', params: { id } }), [router]);

  const header = (
    <>
      <Stack.Screen.Title large>Library</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          icon="arrow.up.arrow.down"
          title="Sort By"
          hidden={state.permission !== 'granted' && state.permission !== 'limited'}>
          <Stack.Toolbar.MenuAction isOn={state.sort === 'largest'} onPress={() => actions.setSort('largest')}>
            Largest First
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction isOn={state.sort === 'newest'} onPress={() => actions.setSort('newest')}>
            Newest First
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );

  if (state.permission === 'checking') {
    return header;
  }

  if (state.permission === 'undetermined' || state.permission === 'denied') {
    const denied = state.permission === 'denied';
    return (
      <>
        {header}
        <MessageView
          icon="photo.stack"
          title={denied ? 'Photo Access Is Off' : 'See What’s Taking Up Space'}
          body={
            denied
              ? 'Turn on access to your photos in Settings to see them sorted by size.'
              : 'Photo Cleanup lists your photos and videos by size. Nothing leaves your iPhone unless you send it to Google Drive.'
          }
          action={
            denied ? (
              <Button title="Open Settings" onPress={() => void Linking.openSettings()} />
            ) : (
              <Button title="Allow Access" onPress={() => void actions.requestAccess()} />
            )
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <FlashList
        data={items}
        numColumns={COLUMNS}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.list}
        contentContainerStyle={{ paddingBottom: state.selectedIds.length > 0 ? SELECTION_BAR_HEIGHT + spacing.xl : 0 }}
        extraData={selected}
        ListHeaderComponent={
          <LibraryHeader
            summary={describeItems(
              items.map((item) => item.id),
              state.sizes,
            )}
            filter={state.filter}
            onFilterChange={actions.setFilter}
            sizing={state.sizing}
            limited={state.permission === 'limited'}
            onManageAccess={() => void actions.manageAccess()}
            notice={state.notice}
            onDismissNotice={actions.dismissNotice}
          />
        }
        ListEmptyComponent={
          state.items.length === 0 ? (
            <MessageView
              icon="photo.on.rectangle"
              title="No Photos or Videos"
              body="Photos and videos you take or save will show up here."
            />
          ) : (
            <MessageView icon="line.3.horizontal.decrease" title="Nothing Here" body="Nothing matches this filter." />
          )
        }
        renderItem={({ item, index }) => {
          // Equal-width columns with a GAP between them: split each gap across the neighbouring cells.
          const column = index % COLUMNS;
          return (
            <View
              style={{
                paddingLeft: (column * GAP) / COLUMNS,
                paddingRight: ((COLUMNS - 1 - column) * GAP) / COLUMNS,
                paddingBottom: GAP,
              }}>
              <LibraryTile
                item={item}
                size={state.sizes[item.id]}
                selected={selected.has(item.id)}
                tileSize={tileSize}
                onOpen={openItem}
                onToggle={actions.toggleSelection}
              />
            </View>
          );
        }}
      />
      {state.selectedIds.length > 0 ? (
        <SelectionBar
          summary={describeItems(state.selectedIds, state.sizes)}
          onClear={actions.clearSelection}
          onDelete={() => router.push('/delete')}
          onSend={() => router.push('/send')}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.background },
});
