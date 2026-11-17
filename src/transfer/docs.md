# Noridoc: transfer

Path: @/src/transfer

### Overview
- The transfer queue sends a batch of library items to one Drive folder, one item at a time. It keeps a status for each item, which the progress screen renders.
- The folder also contains the production `Exporter` adapter, which turns the PhotoResources native module into the callback-based interface the queue uses, and `toExportError`, which turns native export failures into messages for the transfer list.
- Transfers only ever copy. Nothing in this folder deletes from the photo library.

### How it fits into the larger codebase
- `queue.ts` defines the `Exporter` interface and the `ExportedFile` type. `@/src/services.tsx` registers `exporter` as a service boundary with these types, and both exporter fakes in `@/test/support` implement them.
- The queue depends only on `Pick<DriveClient, 'uploadFile'>` from `@/src/drive` and on an `Exporter`. It has no React or navigation code, so `queue.test.ts` runs it in the Node environment against the real Drive client and the local fake Drive server.
- `SendSessionProvider` in `@/src/send/send-session.tsx` creates one queue per Send modal. Screens in `@/src/app/send` read the queue's zustand `store` and call `start`, `stop` and `retryFailed`.
- `photo-exporter.ts` wraps `@/modules/photo-resources`:
  - It subscribes to `onExportProgress` for each export, keeps only events for that item's ID, and unsubscribes in a `finally`.
  - It names the exported resources for Drive with `toUploadFiles` (`upload-files.ts`).
  - It rethrows any export failure through `toExportError`.
  - Its `discard` deletes the temp directory with expo-file-system's `Directory`.
  - It doesn't clear leftover exports. `createExpoPhotoLibrary()` in `@/src/library` does that once at app launch.
- `toExportError` (`export-errors.ts`) handles Expo's wrapping of native exceptions ("Calling the 'exportForUpload' function has failed → Caused by: …"), which keeps the native `code`. The resulting `Error` carries the `code` and the first message that applies:
  1. app copy for known codes (`ICLOUD_DOWNLOAD_FAILED`, `NOT_ENOUGH_SPACE`, `ASSET_NOT_FOUND`);
  2. the text after "→ Caused by:", that is, the native description without Expo's wrapper;
  3. the raw message;
  4. "Couldn’t copy this item."
- When the Send modal unmounts, `SendSessionProvider` (`@/src/send/send-session.tsx`) reads this queue's store and passes the IDs with `sent` status to `keepSelected` on the library store (`@/src/library/store.ts`). A delete that follows can then only touch items that reached Drive. `sent` is therefore the one status that must never be set for an item whose files didn't all land.

### Core Implementation
- `toUploadFiles` (`upload-files.ts`) turns the native module's exported resources into the queue's `ExportedFile`s. Every file takes the base name of the item's original resource (the first `photo` or `video` resource, else the first resource) plus its own extension, so `FullSizeRender.jpg` becomes `IMG_1234-edited.jpg`. Edited versions (`fullSizePhoto`, `fullSizePairedVideo`, `fullSizeVideo`) get a `-edited` suffix, the one English-language Google Takeout exports use. Any `other` type keeps the plain base name. Originals, a RAW (`alternatePhoto`) and a Live Photo's video keep the plain base name and differ by extension. Only the last dot counts as the extension. `uri`, `mimeType` and `size` pass through unchanged.
- State lives in a zustand vanilla store:
  - `phase`: `idle` → `running` → (`stopping`) → `finished`.
  - `folder`: the target Drive folder.
  - `items`: ID, filename, and the size the library measured.
  - `statuses`: one status per item ID.
- How an item's status moves:

```
waiting → downloading(progress) → uploading(progress) → sent
               │                        │
               └→ failed(message)       ├→ failed(message)
                                        └→ notSent("Stopped")
waiting → notSent(message)        (the queue halted before reaching this item)
```

- `run(ids, folderId)` marks every ID `waiting`, then handles the items in order:
  1. Export the item. Status is `downloading` with the exporter's 0–1 progress.
  2. Upload each exported file in turn. Status is `uploading`, with progress measured in bytes across all of the item's files.
  3. Mark the item `sent` once its last file lands.

  An export that returns no files fails the item with "Nothing to copy for this item." instead of reaching `sent`.
- Halting: if an upload fails with a `DriveError` whose kind is in `HALTING_ERRORS` (`quota`, `auth`, `folderMissing`, `unavailable`), that item becomes `failed` and every remaining item becomes `notSent` with the same message, without being exported. These are errors that would fail every remaining item too. Any other upload error (such as `rejected`), and any export error, fails only that item and the queue moves on.
- `stop()` only acts while `running`. It sets `phase: 'stopping'` and aborts the queue's `AbortController`. The upload in progress rejects, its item becomes `notSent` with "Stopped", and so does every item after it.
- `start()` and `retryFailed()` do nothing while a run is in progress (`phase` is `running` or `stopping`). That guards against double taps starting a second run over the same store.
- `retryFailed()` re-runs only the items that are `failed` or `notSent`, in their original order and to the same folder. `run` merges into the existing status map, so items already `sent` keep that status.
- After every upload attempt, successful or not, a `finally` discards the export's temp directory and ignores any error from discarding.

### Things to Know
- `start()` resolves only after the whole batch finishes. The Send screen doesn't await it; it calls it and goes straight to the progress screen.
- `stop()` can't interrupt an export, because the exporter takes no abort signal. The queue waits for the current export or iCloud download to finish, then sees the abort before the first upload and marks the item `notSent`. Because this can take minutes, the progress screen lets the user swipe the modal away while `stopping`. The queue object keeps running in the background until that export finishes, then discards its temp directory.
- The `downloading` status's progress stays at 0 for items already on the device, because PhotoKit only reports progress while downloading from iCloud. The progress screen shows "Preparing…" until progress is above 0.
- A failed export never reaches the discard step. The exporter cleans up after a failed export itself, and both the native module and the disk-backed fake do.
- `TransferItem.size` is the size the library measured. It can be null and is used only for display. Upload progress uses the actual sizes of the exported files.
- An item can be several files, usually at most four (an edited Live Photo: original and edited still, original and edited video). If some land and a later one fails, the item is `failed`, and a retry uploads all of them again, which duplicates the ones that had landed in Drive.
- The queue lives only in memory. If the app is killed during a transfer, nothing is saved or resumed.

Created and maintained by Nori.
