# Noridoc: library

Path: @/src/library

### Overview
- Everything about the device photo library as the app sees it:
  - the `PhotoLibrary` boundary interface;
  - its production adapter, built on expo-media-library and PhotoResources;
  - the app-wide library store, which holds permission, items, sizes, filter and sort, the selection, and notices.
- The folder also holds the pure logic that orders items and describes a set of them, as in "3 items · 41.2 MB + 1 unknown", plus `useStableItems`, the hook that holds the grid's order steady while sizes are still being measured.

### How it fits into the larger codebase
- `PhotoLibrary` (in `photoLibrary.ts`) is a service boundary in `@/src/services.tsx`. The production `createExpoPhotoLibrary()` is only `require`d the first time it's needed, and tests swap in `FakePhotoLibrary` from `@/test/support`.
- `LibraryStoreProvider` wraps the whole navigator in `@/src/app/_layout.tsx`. The Library screen, the preview, the delete sheet and the Send modal all share one store through `useLibrary(selector)`.
- The store is how the flows hand off to each other:
  - The Send screens read `selectedIds`, `sizes` and `items` to build transfer items.
  - `SendSessionProvider` (`@/src/send/send-session.tsx`) calls `keepSelected` with the IDs that reached Drive when the Send modal unmounts, however it was closed.
  - The delete sheet calls `deleteSelected`.
- `createExpoPhotoLibrary()` also calls `PhotoResources.clearExports()` to remove temp exports left by a killed session. The adapter is created once, when the root layout first asks for the `photoLibrary` service at app launch, so no transfer can be running at that moment. The transfer exporter (`@/src/transfer/photo-exporter.ts`) doesn't clear exports itself.
- Sizes come from `@/modules/photo-resources` (`getSizes`). Text formatting comes from `@/src/lib/format.ts`: decimal units like iOS Settings, and "Size unavailable" for null.
- IDs are bare PhotoKit local identifiers everywhere:
  - Only the adapter deals with expo-media-library's `ph://<localIdentifier>` IDs. It strips the prefix when listing and adds it back when building the `Asset`s to delete.
  - UI code builds `ph://<id>` itself for expo-image and expo-video.

### Core Implementation
- `SizeMap` (in `types.ts`) has three possible states per ID: a number (bytes), `null` (couldn't be measured), or no entry (not measured yet). The UI depends on the difference:
  - Tiles hide the size pill while there's no entry.
  - The preview shows "Measuring…".
  - `describeItems` counts both null and missing sizes as unknown.
- `createLibraryStore(library, { sizeBatchSize = 500 })` returns a zustand vanilla store. Every load goes through `reload()`, which reads the permission without prompting and applies it:
  - `start()` is just `reload()`.
  - `requestAccess()` calls `requestPermission()` (iOS's prompt) and then `reload()`, which reads the resulting permission again.
  - Library change events call `reload()`.

  The store subscribes to library changes the first time access turns out to be readable, not before.
- With `granted` or `limited` access, a load:
  1. lists every item;
  2. keeps the sizes it already knows for items that are still there;
  3. removes vanished items from `selectedIds`;
  4. measures only the IDs without a size, in batches, updating `sizing: { done, total }` after each batch and setting it to null when finished.

  Without read access, the store clears items, sizes and the selection.
- Reloads run one at a time, coordinated by closure variables (`running`, `reloadRequested`) rather than store state:

```
change event ─▶ reload() ── running? ──yes──▶ reloadRequested = true, return the running promise
                                │
                                no
                                ▼
                 do { reloadRequested = false; apply(getPermission()) } while (reloadRequested)
```

  However many events arrive during a reload (an iCloud sync can send many), exactly one follow-up reload runs after it. A reload is never restarted or abandoned partway, so every measured batch is merged into `sizes`. Sizes are facts about an item, so a batch is never thrown away because the library changed meanwhile. The follow-up reload then measures only what is still missing.
- A change event's `deletedIds` are removed from `items` and `selectedIds` immediately, in the event handler, before the reload starts. A deleted item can't stay visible or selected while a long reload is still in progress.
- Error handling:
  - A `listItems` failure sets the notice "Couldn’t read your photo library." and `sizing: null`, and leaves the existing items in place. Any other failure inside a reload (for example reading the permission) does the same.
  - A `getSizes` failure marks that batch's IDs as `null` ("Size unavailable"), and measuring continues with the next batch.
- `deleteSelected()` only counts and deletes selected IDs that are still in `items`, and passes them to `PhotoLibrary.deleteItems`, which shows iOS's own confirmation:
  - `'cancelled'` changes nothing. That's the result when the user declines, or when no selected ID is still in the library.
  - `'deleted'` removes the items from `items`, clears the selection, and sets a one-time `notice` ("Moved N items to Recently Deleted.").
  - Any other error is passed back to the caller.
- `toggleSelection` keeps IDs in the order the user picked them. `keepSelected(ids)` narrows the selection to the IDs it's given. The selection doesn't depend on the filter, so items the filter hides stay selected.
- `visibleItems` (in `sortFilter.ts`) filters by kind and sorts in one of two ways:
  - Largest first, with unknown sizes last and ties going to the newer item.
  - Newest first, with undated items last.

  The screen computes this list. The store only holds the `filter` and `sort` choices.
- Stable tile order (`stableOrder.ts`, `use-stable-items.ts`, used by `@/src/app/index.tsx`): while sizes are still being measured in "Largest first", every newly measured batch would reorder the grid under the user's finger. So the Library screen passes `visibleItems`' output through `useStableItems(sorted, frozen, resetKey)`:
  - `frozen` is `sizing !== null && sort === 'largest'`. While frozen, `stableOrder` keeps the previous order for items that are still present, drops removed ones, and appends new ones in sorted order. A tap therefore never lands on a tile that just moved.
  - When measuring finishes, `frozen` turns false and the grid re-sorts once.
  - `resetKey` is `"<filter>:<sort>"`. When the user changes the filter or sort, the hook re-sorts immediately, even if measuring is still running.
  - The hook keeps its previous inputs and ID order in `useState` and updates them during render when an input changes. It returns the current `LibraryItem` objects in the held order.
- The production adapter:
  - maps permissions, treating `granted` with `accessPrivileges: 'limited'` as `limited`;
  - pages through `new Query().exeForMetadata()` newest first;
  - keeps only images and videos;
  - converts video duration from milliseconds to seconds;
  - passes `{ deletedIds }` to `subscribe` listeners, mapping the event's `deletedAssets` to bare local identifiers (an empty list when the event has none).

### Things to Know
- PhotoKit reports a declined delete as an error (`PHPhotosError.userCancelled`, 3072). The adapter turns any error whose message matches `3072` or "cancel" into `'cancelled'` and rethrows everything else.
- After a delete, the store doesn't remove the deleted items' entries from `sizes` itself. The change event PhotoKit sends for the deletion triggers a reload, and the reload drops them.
- `notice` is shared: the same Library header banner shows the post-delete message and the "Couldn’t read your photo library." error.
- `permission` starts as `'checking'`, a value that isn't a PhotoKit state. It lets the screen show only the header until the first permission check finishes.
- The change subscription is created only once access is `granted` or `limited`, because observing a library the app isn't authorized for makes iOS show its photo-access prompt. That prompt should appear only when the user taps Allow Access (`requestAccess`). `FakePhotoLibrary` reproduces this with `systemPromptShown`. A `following` flag ensures the subscription is created only once. It is never removed; the store lives as long as the root layout.
- With `limited` access, the list contains only the items the user shared. `manageAccess()` just opens iOS's limited-selection picker; the store relies on the change subscription to pick up the new selection.
- When nothing in a set could be measured, `describeItems` returns "N items · Size unavailable" rather than a byte total with an unknown count.

Created and maintained by Nori.
