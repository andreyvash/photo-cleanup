# Photo Cleanup

An iPhone app for finding the photos and videos that take up the most space, then copying them to Google Drive or deleting them from Photos.

- **Browse:** every photo and video, filterable by Photos or Videos, with a preview on tap.
- **Sort by size:** the size of each item, largest first. "Size unavailable" appears when iOS doesn't report one.
- **Select in batches:** the count and combined size are always shown together.
- **Send to Google Drive:** copies items into a folder the app created, with progress and status for each item and a retry for the ones that failed. Each item's original is copied along with any edited version (`IMG_1234-edited.jpg`), RAW file and Live Photo video. The items stay in Photos.
- **Delete from Photos:** a review step comes first. Items go to Recently Deleted for 30 days, and with iCloud Photos on, they're deleted from your other devices too. Sending to Drive never deletes anything.

Built with Expo SDK 58 (React Native 0.88), Expo Router, and a small local Swift module (`modules/photo-resources`). The module reads file sizes from PhotoKit and exports each item's files for upload, downloading from iCloud if needed.

## Run it

Requirements: Xcode 26, CocoaPods, Node 22.13 or later.

```bash
npm install
npx expo run:ios            # builds the dev client and starts Metro
```

The app is iOS only and needs a development build. It doesn't run in Expo Go because of the native module and Google Sign-In.

### Google Drive setup (one time)

Sending to Drive needs your own Google OAuth client. Without one, the app still works, and Send to Drive explains that sign-in isn't set up.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Open **Google Auth Platform**:
   - **Branding:** set the app name and support email.
   - **Audience:** choose External, leave the publishing status on **Testing**, and add your Google account as a test user.
   - **Data Access:** add the scope `https://www.googleapis.com/auth/drive.file`.
3. Open **Clients**, create an **iOS** client, and set the bundle ID to `dev.photocleanup.app`. If you change the bundle ID, change it in `app.config.ts` too.
4. Put the client ID in `.env.local`, which is gitignored:
   ```
   GOOGLE_IOS_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```
5. Rebuild with `npx expo run:ios`. The URL scheme comes from the client ID at build time.

Notes:
- With the `drive.file` scope, the app can only see folders and files it created. It can't browse the rest of your Drive.
- While the OAuth app is in **Testing**, Google expires sign-ins after 7 days, so you'll be asked to sign in again about once a week.

## Test

```bash
npm test                    # Jest: unit, integration (fake Drive HTTP server) and screen tests
npm run typecheck
```

End-to-end tests use [Maestro](https://maestro.dev) on a simulator that has been seeded with fixtures of known sizes:

```bash
scripts/seed-simulator.sh <simulator-udid>   # erases the simulator, then adds 5 photos/videos
maestro test e2e/library.yaml
maestro test e2e/delete.yaml                 # deletes one fixture; re-seed afterwards
```

Google sign-in and real uploads can't be automated, because they need your account. Check them by hand: sign in, create a folder, send a few items, and confirm they appear in Drive.

## Known limitations

- **Edits arrive as a second file, not as an edit.** Drive gets the original and the edited version side by side. Photos' record of the edit isn't copied, so the edit can't be adjusted or reverted from the Drive copies.
- **The bytes sent can be fewer than the size shown.** The size shown is everything Photos stores for an item, which is what deleting frees. That includes the edit record and, for some edited items, an intermediate render, and neither is sent.
- Portrait depth and Live Photo effects (Loop, Bounce) are probably stored as edits too, so those items would arrive with an `-edited` file even if you never edited them. This hasn't been checked on a device yet.
- **Stop can't interrupt an iCloud download in progress.** That item is finished first, then discarded. You can close the screen meanwhile.
- A size comes from PhotoKit's undocumented `fileSize` resource key. If Apple removes it, sizes show as "Size unavailable" rather than crashing.
- Retrying a failed upload starts that file over. Partial uploads aren't resumed.
- If only some of an item's files made it to Drive (say the photo but not its Live Photo video), a retry uploads all of them again, so the ones that had arrived appear twice.
- If the app is closed during a transfer, the queue isn't restored. Send the remaining items again.
