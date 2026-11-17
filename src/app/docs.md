# Noridoc: app

Path: @/src/app

### Overview
- The expo-router route tree: the size-sorted Library grid at `/`, the item preview at `/asset/[id]`, the delete review sheet at `/delete`, and the Send to Google Drive modal under `/send`.
- Routes are thin. They select from the library store and the send session, assemble components from `@/src/components`, and call store actions. The business logic lives in `@/src/library`, `@/src/transfer` and `@/src/drive`.

### How it fits into the larger codebase
- The root layout wraps the whole stack in `LibraryStoreProvider` (`@/src/library/library-store-provider.tsx`). Every route, including the nested Send stack, uses that one library store.
- The root layout also calls `exporter.clearLeftovers()` (`@/src/transfer`) once, in an effect on mount. At launch no transfer can be running, so the temp exports a killed session left behind can be deleted safely. This makes `exporter` a service the app requests at launch, not only when Send opens.
- `send/_layout.tsx` wraps the Send stack in `SendSessionProvider` (`@/src/send/send-session.tsx`). The Google account, the chosen folder, the transfer queue and the QueryClient therefore exist only while the modal is open.
- Routes reach external systems only through `useService` from `@/src/services.tsx`; for example, the Send screens call `drive.listFolders` and `drive.createFolder`. That's what lets `@/test/screens` render these exact routes with fakes, through `renderApp` (`@/test/support/renderApp.tsx`).
- Styling follows `@/src/theme.ts`. Header content uses expo-router's `Stack.Screen.Title` and `Stack.Toolbar`, which render buttons and menus in the native header.
- `@/app.config.ts` turns on typed routes (`experiments.typedRoutes`), so `router.push` targets are type-checked.

### Core Implementation
- How the root stack presents each route:
  - `index`: large title.
  - `asset/[id]`: pushed, with the large title turned off.
  - `send`: a modal with its own nested stack; the outer header is hidden.
  - `delete`: a form sheet sized to its content, with a grabber.
- `/` Library renders according to `permission`:
  - `checking`: only the header.
  - `undetermined`: an Allow Access prompt.
  - `denied`: an Open Settings prompt.
  - Otherwise: a 3-column FlashList of `useGridItems(items, sizes, { filter, sort }, sizing !== null)` (`@/src/library/use-grid-items.ts`), with `LibraryHeader` as the list header, and an empty state that tells an empty library apart from a filter with no matches. While sizes are still being measured in "Largest first", tiles keep their positions (new items are appended, removed ones dropped), so a tap never lands on a tile that just moved. The grid re-sorts once measuring finishes, and immediately when the user changes the filter or sort.

  The screen passes `LibraryHeader` only the summary of the visible items; the header reads the filter, measuring progress, banners and access state from the library store itself. The sort menu is a native header toolbar menu, hidden unless `canRead(permission)` (`@/src/library/store.ts`). When anything is selected, the floating `SelectionBar` appears and pushes `/delete` or `/send`.
- `/asset/[id]` Preview:
  - It looks up the item in the store by ID and shows "Item Not Found" if it's gone, for example after being deleted in Photos.
  - The header title is the item's size, or "Measuring…" until it's measured, and a toolbar button toggles selection.
  - Photos use expo-image with `assetUri(id)` (`ph://<id>`, from `@/src/library/asset-uri.ts`). Videos use expo-video loaded through `player.replaceAsync({ uri: assetUri(id) })`, which is the only way it can load photo-library videos.
- `/delete` review sheet:
  - It shows "Delete N Items?", the count and size summary, a row of `Thumbnail`s (capped, with a "+N" tile drawn in `thumbnailFrame` for the rest), and warnings: items go to Recently Deleted for 30 days, iCloud Photos removes them from the user's other devices, and iOS will ask to confirm again.
  - Confirming calls `deleteSelected()`. On `deleted` it plays a success haptic and goes back to the Library, which shows the notice. On `cancelled` it stays on the sheet and nothing changes. A thrown error appears inline, as `messageOf(error)` (`@/src/lib/errors.ts`).
- `/send` (index):
  - A Cancel button and the selection summary with thumbnails, then a screen chosen by the session's `auth.status`: a spinner while `checking`, sign-in when `signedOut`, and when `signedIn` the folder list from `useQuery([DRIVE_FOLDERS_KEY, email])` with a "New Folder…" row and Sign Out.
  - Send is enabled only when the chosen folder is in the current list and something is selected.
  - The screen subscribes to the library store's `selectedIds` and `sizes` only. When Send is tapped it reads filenames once from `useLibraryStore().getState().items`, builds `TransferItem`s from the selection, starts the queue without awaiting it, and calls `router.replace('/send/progress')`, so going back can't return to the folder picker.
- `/send/new-folder` form sheet: a `useMutation` calls `drive.createFolder`, then selects the new folder, invalidates `[DRIVE_FOLDERS_KEY]` and goes back. The Create button and the keyboard's return key both call one `submit()`, which does nothing unless the trimmed name is non-empty and no mutation is pending, so one name can't create two folders. A failure shows `messageOf(error, 'Couldn’t create the folder.')`.
- `/send/progress`:
  - Each row shows the `Thumbnail`, filename, status text, size and a status icon. A `downloading` item with progress 0 reads "Preparing…", and "Downloading from iCloud N%" once progress arrives. PhotoKit only reports progress when it downloads from iCloud, so items already on the device stay at "Preparing…" while exporting.
  - The header shows "X of Y sent" (numbers formatted with `formatNumber`), then a detail line "<bytes sent> of <total> · to “<folder>”", with a SwiftUI `ProgressView` that tracks the fraction of items sent.
  - Which items count as sent, retryable and busy comes from the queue's selectors (`sentItems`, `isRetryable`, `isBusy` in `@/src/transfer/queue.ts`), not from rules written in the screen.
  - While busy (running or stopping), the screen stays awake and a Stop button shows (reading "Stopping…" and disabled while stopping).
  - Swipe-to-dismiss is off only while `running` (`gestureEnabled: phase !== 'running'`). While `stopping`, the user can swipe the modal away, because the export in progress can't be cancelled and may take minutes.
  - When finished, it plays a success or warning haptic and shows "Retry N Failed" (counting retryable items: `failed` and `notSent`) and Done. Done only calls `router.dismissTo('/')`. Narrowing the selection happens in `SendSessionProvider`'s unmount cleanup, not here.

### Things to Know
- Push the preview route with `params: { id }`, never by putting the ID in the path string: PhotoKit local identifiers contain slashes.
- The Library header summary describes the visible, filtered items. The selection bar describes `selectedIds`, which can include items the current filter hides.
- `Stack.Toolbar` menus and buttons render in the native header, and Jest can't drive them. Sorting is covered by unit tests in `@/src/library` and by the Maestro flow in `e2e/`.
- Sending never deletes from Photos. `/delete` is the only way to delete. When the Send modal closes after a transfer (Done, swipe-down or Cancel), the selection shrinks to the items that reached Drive, so a later delete can't remove an item that wasn't copied.
- Closing the Send modal unmounts the session, which stops the queue and narrows the selection (`@/src/send/send-session.tsx`). That's why swipe-to-dismiss is off while a transfer is running.
- The delete sheet puts its thumbnails in a plain row, not a ScrollView, because a form sheet adopts a ScrollView inside it as the sheet's own scrolling content.
- The overall progress bar counts items. The byte figures in the header use the sizes the library measured, through `totalSize` and `formatTotal` (`@/src/library/selection.ts`): the total reads like the rest of the app ("41.2 MB + 1 unknown"), the bytes sent count unknown sizes as 0, and when no item has a known size the byte figures are left out and only the folder shows.
- The queue publishes progress only when the whole percent changes, so while an item downloads or uploads the progress screen re-renders at most once per percent, not on every native progress callback.
- Routes don't use `useMemo` or `useCallback`. The React Compiler (`experiments.reactCompiler` in `@/app.config.ts`) memoizes values and callbacks such as the Library screen's selected-ID set and `openItem`.

Created and maintained by Nori.
