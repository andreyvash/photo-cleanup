# Noridoc: photo-resources

Path: @/modules/photo-resources

### Overview
- A local Expo module (Swift, Expo Modules API) that adds the PhotoKit capabilities expo-media-library lacks: per-asset file sizes, plus exporting an asset's files to disk for upload, downloading from iCloud if needed.
- It runs on Apple platforms only, registered as `PhotoResourcesModule` in `expo-module.config.json`. The JS side is a typed `requireNativeModule('PhotoResources')` binding in `src/PhotoResourcesModule.ts`. Event and result types are in `src/PhotoResources.types.ts`.

### How it fits into the larger codebase
- It sits under the services boundary in `@/src/services.tsx`, and no screen or store calls it directly. Two adapters wrap it:
  - `@/src/library/expo-photo-library.ts` uses `getSizes` to implement `PhotoLibrary.getSizes`, and calls `clearExports` once when it's created at app launch.
  - `@/src/transfer/photo-exporter.ts` uses `exportForUpload` and the `onExportProgress` event to implement the `Exporter` interface.
- `@/src/transfer/upload-files.ts` imports only its types (`ExportedResource`, `ResourceType`).
- Both adapters import it by relative path (`../../modules/photo-resources/src/PhotoResourcesModule`), not as a package. Expo autolinks the local module into the iOS build, so Swift changes need a native rebuild (`npx expo run:ios`).
- IDs in and out are bare PhotoKit local identifiers with no `ph://` prefix. That matches the ID convention used across `@/src/library`.
- Jest never loads this module. Tests replace the `PhotoLibrary` and `Exporter` boundaries with fakes from `@/test/support`, and production services are only `require`d on first use.
- Export errors reach the user through `toExportError` (`@/src/transfer/export-errors.ts`). Expo wraps the native exception ("Calling … has failed → Caused by: …") but keeps its `code`. `toExportError` replaces the text with app copy for `ICLOUD_DOWNLOAD_FAILED`, `NOT_ENOUGH_SPACE` and `ASSET_NOT_FOUND`, and for other codes strips the wrapper so the native description shows. The transfer queue displays the result as that item's failure text on the progress screen.

### Core Implementation
- `getSizes(ids)` first sets every requested ID to null. It then fetches the assets and, for each one, adds up `fileSize` across every `PHAssetResource` (photo, Live Photo video, edits). An ID stays null if the asset is missing, has no resources, or has any resource without a readable size.
- `exportForUpload(id)` picks the resources to upload and creates a new `tmp/photo-resources/<UUID>/` directory. It writes each resource with `PHAssetResourceManager.writeData` with network access allowed, so iCloud-only originals download. It returns `{ directory, resources: [{ uri, type, originalFilename, mimeType, size }] }` with `file://` URIs. `size` is read from the written file on disk, not from `fileSize`.
- Which resources get exported (`uploadResources`): every resource except the `skippedTypes`. The known media types come first, in this order (`uploadTypes`): `photo`, `alternatePhoto` (the RAW of a RAW+JPEG pair), `fullSizePhoto` (the edited still), `pairedVideo` (a Live Photo's video), `fullSizePairedVideo` (its edited video), `video`, `fullSizeVideo` (the edited video). Any other type follows as `other`, for example `audio` or a type added in a later iOS. Copying an unknown type costs an extra file in Drive, while skipping it could lose data on delete.
- A plain photo or video exports one file, a RAW+JPEG pair or a Live Photo two, and an edited Live Photo four. Effects Photos applies after capture, such as Portrait depth or a Live Photo's Loop or Bounce, are probably stored as edits too, so those items would also export an edited version (not yet checked on a device).
- Skipped (`skippedTypes`): `adjustmentData` (Photos' edit recipe), the `adjustmentBase*` intermediate renders an edit was applied on top of, and `photoProxy` (iOS 17+, the temporary stand-in while the camera finishes processing a photo). An item that has only a proxy exports nothing and fails with `EXPORT_FAILED`, so it never becomes deletable before its real photo exists. The skipped resources still count in `getSizes`, so the size shown can be larger than the bytes sent, by a full-size image or video for an item with an intermediate render.
- `type` is the resource type's name as in `PHAssetResourceType`, or `other` (`ResourceType` in `PhotoResources.types.ts`). `originalFilename` is the resource's own name in Photos, e.g. `IMG_1234.HEIC` or, for an edited version, `FullSizeRender.jpg`.
- On disk each file is named `<index>.<extension>`, so resources that share a name can't overwrite each other. The module doesn't decide upload names: `toUploadFiles` in `@/src/transfer/upload-files.ts` names files for Drive from `type` and `originalFilename`. The MIME type comes from the resource's UTI and falls back to `application/octet-stream`.
- `onExportProgress` events carry `{ id, progress }`. Progress runs from 0 to 1 across all of the asset's files, computed as `(fileIndex + fileFraction) / fileCount`.
- `clearExports()` deletes the whole `photo-resources` temp root.

### Things to Know
- `fileSize` is an undocumented KVC key. The code reads it only after `responds(to:)` succeeds, so if Apple removes the key, every size becomes null ("Size unavailable" in the UI) and nothing crashes.
- Coded errors from `exportForUpload`:

  | Code | When |
  |---|---|
  | `ASSET_NOT_FOUND` | The ID is no longer in the library |
  | `NOT_ENOUGH_SPACE` | The write failed because the disk is full (`NSFileWriteOutOfSpaceError` or POSIX `ENOSPC`) |
  | `ICLOUD_DOWNLOAD_FAILED` | The write failed with an `NSURLErrorDomain` error, an error domain containing "Cloud", or `PHPhotosError` `networkAccessRequired` / `networkError` |
  | `EXPORT_FAILED` | No resource to export, or any other write failure (carries the system's localized description) |

- `exportException` classifies a failure by walking the error chain through `NSUnderlyingErrorKey` (`errorChain`, capped at a few levels), because PhotoKit often reports network and disk failures as an underlying error. Disk-full is checked before network.
- If a write or the file stat right after it fails, the module deletes its own export directory before throwing. Callers only need to discard directories from exports that succeeded.
- Progress events aren't tied to a call: every listener receives progress for every export, and the JS adapter filters by `id`. PhotoKit's `progressHandler` only fires while downloading from iCloud, so an export of an item already on the device sends no progress events. The progress screen shows "Preparing…" until progress arrives.
- `clearExports` removes the root without checking whether an export is running. The photo library adapter calls it once, when it's created at app launch and nothing can be mid-export.
- The native result isn't what the transfer queue consumes. `@/src/transfer/photo-exporter.ts` maps `ExportResult.resources` through `toUploadFiles` into the queue's `ExportedFile` (`{ uri, filename, mimeType, size }`) from `@/src/transfer/queue.ts`. The rest of the app and the test fakes code against that type.
- The resource selection can only be checked on a device or simulator: Jest never loads this module. On a simulator, edit a photo in the Photos app (Auto Enhance is enough) and its export returns the original plus a `fullSizePhoto`. RAW+JPEG pairs (`alternatePhoto`) can't be created on a simulator.

Created and maintained by Nori.
