# Noridoc: app

Path: @/src/app

### Overview
- The expo-router route tree: the size-sorted Library grid at `/`, the item preview at `/asset/[id]`, the delete review sheet at `/delete`, and the Send to Google Drive modal under `/send`.
- Routes are thin. They select from the library store and the send session, assemble components from `@/src/components`, and call store actions. The business logic lives in `@/src/library`, `@/src/transfer` and `@/src/drive`.

### How it fits into the larger codebase
- The root layout wraps the whole stack in `LibraryStoreProvider` (`@/src/library/library-store-provider.tsx`). Every route, including the nested Send stack, uses that one library store.
- `send/_layout.tsx` wraps the Send stack in `SendSessionProvider` (`@/src/send/send-session.tsx`). The Google account, the chosen folder, the transfer queue and the QueryClient therefore exist only while the modal is open.
- Routes reach external systems only through `useService` from `@/src/services.tsx`; for example, the Send screens call `drive.listFolders` and `drive.createFolder`. That's what lets `@/test/screens` render these exact routes with `renderRouter('./src/app', { wrapper })` and fakes.
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
  - Otherwise: a 3-column FlashList of `visibleItems(...)` with `LibraryHeader` as the list header, and an empty state that tells an empty library apart from a filter with no matches.

  The sort menu is a native header toolbar menu, hidden until photo access is granted or limited. When anything is selected, the floating `SelectionBar` appears and pushes `/delete` or `/send`.
- `/asset/[id]` Preview:
  - It looks up the item in the store by ID and shows "Item Not Found" if it's gone, for example after being deleted in Photos.
  - The header title is the item's size, or "Measuring…" until it's measured, and a toolbar button toggles selection.
  - Photos use expo-image with `ph://<id>`. Videos use expo-video loaded through `player.replaceAsync({ uri: 'ph://<id>' })`, which is the only way it can load photo-library videos.
- `/delete` review sheet:
  - It shows "Delete N Items?", the count and size summary, a row of thumbnails (capped, with a "+N" tile for the rest), and warnings: items go to Recently Deleted for 30 days, iCloud Photos removes them from the user's other devices, and iOS will ask to confirm again.
  - Confirming calls `deleteSelected()`. On `deleted` it plays a success haptic and goes back to the Library, which shows the notice. On `cancelled` it stays on the sheet and nothing changes. A thrown error appears inline.
- `/send` (index):
  - A Cancel button and the selection summary, then either sign-in (when signed out) or, when signed in, the folder list from `useQuery(['drive-folders', email])` with a "New Folder…" row and Sign Out.
  - Send is enabled only when the chosen folder is in the current list and something is selected.
  - Sending builds `TransferItem`s from the selection, starts the queue without awaiting it, and calls `router.replace('/send/progress')`, so going back can't return to the folder picker.
- `/send/new-folder` form sheet: a `useMutation` calls `drive.createFolder`, then selects the new folder, invalidates `['drive-folders']` and goes back.
- `/send/progress`:
  - Each row shows the thumbnail, filename, status text, size and a status icon.
  - The header shows "X of Y sent", the bytes sent and the folder name, with a SwiftUI `ProgressView` that tracks the fraction of items sent.
  - While running or stopping, the screen stays awake, swipe-to-dismiss is off (`gestureEnabled: !busy`), and a Stop button shows.
  - When finished, it plays a success or warning haptic and shows "Retry N Failed" (counting `failed` and `notSent` items) and Done. Done calls `keepSelected(sentIds)` and then `router.dismissTo('/')`.

### Things to Know
- Push the preview route with `params: { id }`, never by putting the ID in the path string: PhotoKit local identifiers contain slashes.
- The Library header summary describes the visible, filtered items. The selection bar describes `selectedIds`, which can include items the current filter hides.
- `Stack.Toolbar` menus and buttons render in the native header, and Jest can't drive them. Sorting is covered by unit tests in `@/src/library` and by the Maestro flow in `e2e/`.
- Sending never deletes from Photos. `/delete` is the only way to delete, and after a transfer the selection shrinks to the items that reached Drive, so a later delete can't remove an item that wasn't copied.
- Closing the Send modal unmounts the session, which stops the queue. That's why swipe-to-dismiss is off while sending.
- The delete sheet puts its thumbnails in a plain row, not a ScrollView, because a form sheet adopts a ScrollView inside it as the sheet's own scrolling content.
- The overall progress bar counts items. The byte figures in the header use the sizes the library measured, and count unknown sizes as 0.

Created and maintained by Nori.
