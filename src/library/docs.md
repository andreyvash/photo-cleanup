# Noridoc: library

Path: @/src/library

### Overview
- Everything about the device photo library as the app sees it:
  - the `PhotoLibrary` boundary interface;
  - its production adapter, built on expo-media-library and PhotoResources;
  - the app-wide library store, which holds permission, items, sizes, filter and sort, the selection, and notices.
- The folder also holds the pure logic that orders items and describes a set of them, as in "3 items · 41.2 MB + 1 unknown".

### How it fits into the larger codebase
- `PhotoLibrary` (in `photoLibrary.ts`) is a service boundary in `@/src/services.tsx`. The production `createExpoPhotoLibrary()` is only `require`d the first time it's needed, and tests swap in `FakePhotoLibrary` from `@/test/support`.
- `LibraryStoreProvider` wraps the whole navigator in `@/src/app/_layout.tsx`. The Library screen, the preview, the delete sheet and the Send modal all share one store through `useLibrary(selector)`.
- The store is how the flows hand off to each other:
  - The Send screens read `selectedIds`, `sizes` and `items` to build transfer items.
  - The progress screen calls `keepSelected` with the IDs that reached Drive.
  - The delete sheet calls `deleteSelected`.
- Sizes come from `@/modules/photo-resources` (`getSizes`). Text formatting comes from `@/src/lib/format.ts`: decimal units like iOS Settings, and "Size unavailable" for null.
- IDs are bare PhotoKit local identifiers everywhere:
  - Only the adapter deals with expo-media-library's `ph://<localIdentifier>` IDs. It strips the prefix when listing and adds it back when building the `Asset`s to delete.
  - UI code builds `ph://<id>` itself for expo-image and expo-video.

### Core Implementation
- `SizeMap` (in `types.ts`) has three possible states per ID: a number (bytes), `null` (couldn't be measured), or no entry (not measured yet). The UI depends on the difference:
  - Tiles hide the size pill while there's no entry.
  - The preview shows "Measuring…".
  - `describeItems` counts both null and missing sizes as unknown.
- `createLibraryStore(library, { sizeBatchSize = 500 })` returns a zustand vanilla store. `start()` reads the current permission without prompting and applies it. The store subscribes to library changes the first time access turns out to be readable, not before.
- With `granted` or `limited` access, a load:
  1. lists every item;
  2. keeps the sizes it already knows for items that are still there;
  3. removes vanished items from `selectedIds`;
  4. measures only the IDs without a size, in batches, updating `sizing: { done, total }` after each batch and setting it to null when finished.

  Without read access, the store clears items, sizes and the selection.
- Every library change event reads the permission again and reloads. Edits made in the Photos app, or by this app's own delete, show up without measuring everything again.
- `latestLoad` is a generation counter. Each load records its value, and a load whose value is out of date (because a newer load started or access was lost) discards its results instead of overwriting newer state.
- `deleteSelected()` passes the selection to `PhotoLibrary.deleteItems`, which shows iOS's own confirmation:
  - `'cancelled'` changes nothing. That's the result when the user declines, or when nothing is selected.
  - `'deleted'` removes the items from `items`, clears the selection, and sets a one-time `notice` ("Moved N items to Recently Deleted.").
  - Any other error is passed back to the caller.
- `toggleSelection` keeps IDs in the order the user picked them. `keepSelected(ids)` narrows the selection to the IDs it's given. The selection doesn't depend on the filter, so items the filter hides stay selected.
- `visibleItems` (in `sortFilter.ts`) filters by kind and sorts in one of two ways:
  - Largest first, with unknown sizes last and ties going to the newer item.
  - Newest first, with undated items last.

  The screen computes this list. The store only holds the `filter` and `sort` choices.
- The production adapter:
  - maps permissions, treating `granted` with `accessPrivileges: 'limited'` as `limited`;
  - pages through `new Query().exeForMetadata()` newest first;
  - keeps only images and videos;
  - converts video duration from milliseconds to seconds.

### Things to Know
- PhotoKit reports a declined delete as an error (`PHPhotosError.userCancelled`, 3072). The adapter turns any error whose message matches `3072` or "cancel" into `'cancelled'` and rethrows everything else.
- After a delete, the store doesn't remove the deleted items' entries from `sizes` itself. The change event PhotoKit sends for the deletion triggers a reload, and the reload drops them.
- `permission` starts as `'checking'`, a value that isn't a PhotoKit state. It lets the screen show only the header until the first permission check finishes.
- The change subscription is created only once access is `granted` or `limited`, because observing a library the app isn't authorized for makes iOS show its photo-access prompt. That prompt should appear only when the user taps Allow Access (`requestAccess`). `FakePhotoLibrary` reproduces this with `systemPromptShown`. Once created, the subscription is never removed; the store lives as long as the root layout.
- With `limited` access, the list contains only the items the user shared. `manageAccess()` just opens iOS's limited-selection picker; the store relies on the change subscription to pick up the new selection.
- When nothing in a set could be measured, `describeItems` returns "N items · Size unavailable" rather than a byte total with an unknown count.

Created and maintained by Nori.
