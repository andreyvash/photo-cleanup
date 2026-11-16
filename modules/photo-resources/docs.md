# Noridoc: photo-resources

Path: @/modules/photo-resources

### Overview
- A local Expo module (Swift, Expo Modules API) that adds the PhotoKit capabilities expo-media-library lacks: per-asset file sizes, plus exporting an asset's files to disk for upload, downloading from iCloud if needed.
- It runs on Apple platforms only, registered as `PhotoResourcesModule` in `expo-module.config.json`. The JS side is a typed `requireNativeModule('PhotoResources')` binding in `src/PhotoResourcesModule.ts`. Event and result types are in `src/PhotoResources.types.ts`.

### How it fits into the larger codebase
- It sits under the services boundary in `@/src/services.tsx`, and no screen or store calls it directly. Two adapters wrap it:
  - `@/src/library/expo-photo-library.ts` uses `getSizes` to implement `PhotoLibrary.getSizes`.
  - `@/src/transfer/photo-exporter.ts` uses `exportForUpload`, `clearExports` and the `onExportProgress` event to implement the `Exporter` interface.
- Both adapters import it by relative path (`../../modules/photo-resources/src/PhotoResourcesModule`), not as a package. Expo autolinks the local module into the iOS build, so Swift changes need a native rebuild (`npx expo run:ios`).
- IDs in and out are bare PhotoKit local identifiers with no `ph://` prefix. That matches the ID convention used across `@/src/library`.
- Jest never loads this module. Tests replace the `PhotoLibrary` and `Exporter` boundaries with fakes from `@/test/support`, and production services are only `require`d on first use.
- Exception descriptions are shown to the user. The transfer queue in `@/src/transfer/queue.ts` displays an export error's `message` as that item's failure text on the progress screen.

### Core Implementation
- `getSizes(ids)` first sets every requested ID to null. It then fetches the assets and, for each one, adds up `fileSize` across every `PHAssetResource` (photo, Live Photo video, edits). An ID stays null if the asset is missing, has no resources, or has any resource without a readable size.
- `exportForUpload(id)` picks the resources to upload and creates a new `tmp/photo-resources/<UUID>/` directory. It writes each resource with `PHAssetResourceManager.writeData` with network access allowed, so iCloud-only originals download. It returns `{ directory, files: [{ uri, filename, mimeType, size }] }` with `file://` URIs. `size` is read from the written file on disk, not from `fileSize`.
- Which resources get exported:
  - Images use the full-size (edited) rendition if there is one, otherwise the original photo.
  - A Live Photo also gets its paired video, preferring the full-size paired video.
  - Videos use the full-size video if present, otherwise the original.
  - Assets that are neither images nor videos export nothing.
- File naming: every file uses the base name of the asset's original resource plus the extension of the resource actually written. So an edited `FullSizeRender.jpg` uploads as `IMG_1234.jpg`, and a Live Photo's video shares the still's base name. The MIME type comes from the resource's UTI and falls back to `application/octet-stream`.
- `onExportProgress` events carry `{ id, progress }`. Progress runs from 0 to 1 across all of the asset's files, computed as `(fileIndex + fileFraction) / fileCount`.
- `clearExports()` deletes the whole `photo-resources` temp root.

### Things to Know
- `fileSize` is an undocumented KVC key. The code reads it only after `responds(to:)` succeeds, so if Apple removes the key, every size becomes null ("Size unavailable" in the UI) and nothing crashes.
- Coded errors from `exportForUpload`:

  | Code | When |
  |---|---|
  | `ASSET_NOT_FOUND` | The ID is no longer in the library |
  | `ICLOUD_DOWNLOAD_FAILED` | The write failed with an `NSURLErrorDomain` error or an error domain containing "Cloud" |
  | `EXPORT_FAILED` | No resource to export, or any other write failure (carries the system's localized description) |

- If a write fails, the module deletes its own export directory before throwing. Callers only need to discard directories from exports that succeeded.
- Progress events aren't tied to a call: every listener receives progress for every export, and the JS adapter filters by `id`.
- `clearExports` removes the root without checking whether an export is running. The exporter adapter calls it once, when the adapter is created and nothing can be mid-export.
- The `ExportedFile` and `ExportResult` shapes are repeated as the `Exporter` types in `@/src/transfer/queue.ts`. The rest of the app and the test fakes code against those copies.

Created and maintained by Nori.
