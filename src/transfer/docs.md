# Noridoc: transfer

Path: @/src/transfer

### Overview
- The transfer queue sends a batch of library items to one Drive folder, one item at a time. It keeps a status for each item, which the progress screen renders.
- The folder also contains the production `Exporter` adapter. It turns the PhotoResources native module into the callback-based interface the queue uses.
- Transfers only ever copy. Nothing in this folder deletes from the photo library.

### How it fits into the larger codebase
- `queue.ts` defines the `Exporter` interface and the `ExportedFile` type. `@/src/services.tsx` registers `exporter` as a service boundary with these types, and both exporter fakes in `@/test/support` implement them.
- The queue depends only on `Pick<DriveClient, 'uploadFile'>` from `@/src/drive` and on an `Exporter`. It has no React or navigation code, so `queue.test.ts` runs it in the Node environment against the real Drive client and the local fake Drive server.
- `SendSessionProvider` in `@/src/send/send-session.tsx` creates one queue per Send modal. Screens in `@/src/app/send` read the queue's zustand `store` and call `start`, `stop` and `retryFailed`.
- `photo-exporter.ts` wraps `@/modules/photo-resources`:
  - It calls `clearExports()` once, when the exporter is created.
  - It subscribes to `onExportProgress` for each export, keeps only events for that item's ID, and unsubscribes in a `finally`.
  - Its `discard` deletes the temp directory with expo-file-system's `Directory`.
- When the user taps Done, the progress screen passes the IDs with `sent` status to `keepSelected` on the library store (`@/src/library/store.ts`). A delete that follows can then only touch items that reached Drive.

### Core Implementation
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
- Halting: if an upload fails with a `DriveError` of kind `quota` or `auth`, that item becomes `failed` and every remaining item becomes `notSent` with the same message. Any other upload error, and any export error, fails only that item and the queue moves on.
- `stop()` only acts while `running`. It sets `phase: 'stopping'` and aborts the queue's `AbortController`. The upload in progress rejects, its item becomes `notSent` with "Stopped", and so does every item after it.
- `retryFailed()` re-runs only the items that are `failed` or `notSent`, in their original order and to the same folder. `run` merges into the existing status map, so items already `sent` keep that status.
- After every upload attempt, successful or not, a `finally` discards the export's temp directory and ignores any error from discarding.

### Things to Know
- `start()` resolves only after the whole batch finishes. The Send screen doesn't await it; it calls it and goes straight to the progress screen.
- `stop()` can't interrupt an export, because the exporter takes no abort signal. The queue waits for the current export or iCloud download to finish, then sees the abort before the first upload and marks the item `notSent`.
- A failed export never reaches the discard step. The exporter cleans up after a failed export itself, and both the native module and the disk-backed fake do.
- `TransferItem.size` is the size the library measured. It can be null and is used only for display. Upload progress uses the actual sizes of the exported files.
- A Live Photo is two files. If the still lands and the video fails, the item is `failed`, and a retry uploads both files again, which can duplicate the still in Drive.
- The queue lives only in memory. If the app is killed during a transfer, nothing is saved or resumed.

Created and maintained by Nori.
