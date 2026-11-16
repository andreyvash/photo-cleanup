# Noridoc: photo-cleanup

Path: @/

### Overview
- Photo Cleanup is an iPhone-only app built on Expo SDK 58 (React Native 0.88, expo-router, TypeScript). It finds the photos and videos that take up the most space and lets the user copy them to a Google Drive folder or delete them from Photos.
- Product rules:
  - Browse and preview with a Photos/Videos filter.
  - Sort largest first, showing "Size unavailable" when a size can't be read.
  - Select in batches, always showing the count and combined size together.
  - Send to Drive with progress for each item, a list of failures, and a retry for them. The originals stay in Photos.
  - Delete only after a review that warns about Recently Deleted (30 days) and about other devices that use iCloud Photos. Sending never deletes anything.
- The app needs a development build (`npx expo run:ios`). It doesn't run in Expo Go because of the local native module and Google Sign-In.

### How it fits into the larger codebase
- How the layers connect:

```
                     src/app  (expo-router routes, src/components, src/theme.ts)
                        │ useLibrary                     │ useSendSession / useTransfer
                        ▼                                ▼
              src/library store                 src/send session ──owns──▶ src/transfer queue
              (root layout, app lifetime)       (Send modal lifetime)         │          │
                        │                                │                    │          │
   ─────────────── useService ── src/services.tsx (ServicesProvider) ─────────┼──────────┼──────
                        ▼                                ▼                    ▼          ▼
                  PhotoLibrary                       GoogleAuth          DriveClient  Exporter
             src/library adapter                     src/google          src/drive    src/transfer adapter
                        │                                │                    │          │
          expo-media-library + PhotoResources    google-signin SDK    fetch + upload task  PhotoResources
                                              (modules/photo-resources: Swift, PhotoKit)
```

- **Services boundary** (`@/src/services.tsx`): every external system sits behind a small interface: `PhotoLibrary`, `GoogleAuth`, `DriveClient` and `Exporter`.
  - `useService(key)` returns whatever `ServicesProvider` was given. Otherwise it creates the production implementation with `require` on first use and caches it for the rest of the launch, so native modules load only where they're needed.
  - The production `DriveClient` gets its access tokens from the production `GoogleAuth`.
  - Tests pass fakes for exactly these boundaries (`@/test`).
- **Two stores with different lifetimes**, both zustand vanilla stores:
  - The library store (`@/src/library`) is provided at the root layout and lasts as long as the app.
  - The send session and transfer queue (`@/src/send`, `@/src/transfer`) are provided by the Send modal's layout and last only while the modal is open.

  The library store's selection is how the two hand off: Send reads it, and when the transfer finishes it narrows the selection to the items that reached Drive.
- **IDs** are bare PhotoKit local identifiers everywhere. Only `@/src/library/expo-photo-library.ts` deals with expo-media-library's `ph://` IDs, and UI code builds `ph://<id>` itself for expo-image and expo-video.
- **Native module** `@/modules/photo-resources` exists because expo-media-library has no file-size API. It also exports originals for upload, downloading them from iCloud when needed.
- **Drive** (`@/src/drive`) uses only the `drive.file` scope, so the app sees only the folders it created. It uploads with the resumable protocol through an injectable upload transport.
- **Shared helpers**:
  - `@/src/lib/format.ts` formats sizes, counts and durations, using decimal units like iOS Settings.
  - `@/src/theme.ts` is the design system: one system-blue accent, iOS semantic colors, pill and capsule shapes, and tabular numbers for sizes.
  - The design patterns came from the Cleanup: Phone Storage Cleaner app on Appllama. The research notes are in `research/photo-cleanup/patterns.md`.

### Core Implementation
- The entry point is `expo-router/entry` (`main` in `package.json`), and the routes live in `@/src/app`. `tsconfig.json` maps the import alias `@/*` to `./src/*`, so code imports look like `@/library/store`. The paths in these docs (`@/src/...`) are relative to the repo root instead. The native module is imported by relative path because it's outside `src`.
- `@/app.config.ts` is a dynamic Expo config:
  - iOS only, portrait, no tablet support, bundle ID `dev.photocleanup.app`;
  - the `typedRoutes` and `reactCompiler` experiments are on;
  - plugins: expo-router, splash screen, expo-media-library (with the photo-permission text) and expo-video, plus Google Sign-In only when `GOOGLE_IOS_CLIENT_ID` is set.
- **Browse.** When the app starts, the library store checks photo access without showing iOS's prompt, which appears only when the user taps Allow Access. Once access is granted, the store lists metadata through the adapter, measures sizes through `PhotoResources.getSizes` in batches with visible progress, and reloads on every library change event. The Library screen derives the filtered, sorted list from the store with `visibleItems`.
- **Send.**
  1. The Send screen builds transfer items from the selection.
  2. The queue exports each item to a temp directory (native module), uploads each file (Drive client, through the background upload task), and always discards the temp directory afterwards.
  3. The progress screen shows each item's status, then narrows the selection to the items that were sent.
- **Delete.** The review sheet calls `deleteSelected`, which goes through iOS's own confirmation. If the user declines, nothing changes. If they confirm, the items are removed and a notice appears on the Library screen.
- Scripts: `npm test` (Jest), `npm run typecheck` (`tsc --noEmit`), `npm run lint`, and `npm run ios` / `npm start` for the development client.

### Things to Know
- Google setup:
  - `GOOGLE_IOS_CLIENT_ID` in `.env.local` (gitignored) reaches the app through `extra.googleIosClientId` and also produces the URL scheme for the Google Sign-In plugin, so changing it needs a rebuild.
  - Without it the app still runs, and Send says that sign-in isn't set up.
- Generated and local-only paths are gitignored: `/ios` (native project), `e2e/fixtures/` (made by `scripts/make-fixtures.sh`) and `research/**/img/`.
- Testing has three layers:
  - unit and integration tests next to the code in `@/src`;
  - screen tests in `@/test/screens`, running against fakes;
  - Maestro flows in `e2e/`, run on a simulator after `scripts/seed-simulator.sh <udid>`.

  Google sign-in and real uploads are checked by hand.
- Sizes come from PhotoKit's undocumented `fileSize` key. If Apple removes it, sizes show as "Size unavailable" and nothing crashes.
- Known limitations:
  - Retrying a Live Photo whose first file already landed can duplicate that file in Drive.
  - `stop()` waits for an export that's in progress to finish.
  - The transfer queue isn't saved if the app is killed.
  - `listFolders` reads only the first page, up to 1000 folders.
  - While the Google OAuth app is in Testing, the refresh token expires every 7 days.

Created and maintained by Nori.
