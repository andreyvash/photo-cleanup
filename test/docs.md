# Noridoc: test

Path: @/test

### Overview
- Test code shared across the app: screen tests that render the real expo-router app, plus the fakes and the fake server that the tests next to the code in `src/` also use.
- The rule throughout: fake only the boundaries declared in `@/src/services.tsx` (photo library, Google auth, Drive client, exporter) or what sits below them (HTTP). All of the app's own code runs for real.

### How it fits into the larger codebase
- The setup is Jest 30 with the `jest-expo` preset and React Native Testing Library 14, configured in `@/package.json`. That config adds React Native, Expo, Google Sign-In and FlashList to the transform list and loads FlashList's Jest setup file.
- `npm test` runs Jest with `LC_ALL=en_US.UTF-8`. `@/src/lib/format.ts` formats numbers with `Intl.NumberFormat` in the default locale, so this keeps assertions on formatted sizes and counts from depending on the host's region. Running `jest` directly doesn't set it.
- Tests live in two places:
  - Next to the code in `@/src`, as `*.test.ts`: the pure logic, the library store, the Drive client and the transfer queue.
  - Here, in `test/screens`: tests at the route level.
- Screen tests render the actual `@/src/app` route tree with expo-router's `renderRouter('./src/app', { wrapper, initialUrl: '/' })`. The `wrapper` is a `ServicesProvider` that passes in fakes from `test/support`.
- Any service a test doesn't pass in falls back to the real production implementation, which is loaded on first use. A test must therefore pass in every service the screens it visits will use, which is why the Send tests pass in every boundary.
- The Drive client and transfer queue tests (`@/src/drive/client.test.ts`, `@/src/transfer/queue.test.ts`) declare `@jest-environment node` and run the real `createDriveClient` over HTTP against `FakeDrive`.
- End-to-end tests run outside Jest as Maestro flows in `e2e/`, on a simulator prepared by `scripts/seed-simulator.sh <udid>`. That script:
  1. erases the simulator;
  2. sets the simulator's locale to en_US, so number formatting matches the assertions;
  3. generates fixtures of known sizes with `scripts/make-fixtures.sh` (ffmpeg);
  4. adds the fixtures one at a time, so their creation order is predictable;
  5. grants photo access.

  The delete flow removes a fixture, so seed the simulator again afterwards. Google sign-in and real uploads are checked by hand.

### Core Implementation
- `FakePhotoLibrary` is an in-memory stand-in for PhotoKit. Tests can set:
  - the permission, and what a permission request resolves to;
  - the items visible under limited access;
  - the user's answer to iOS's delete confirmation;
  - `failNextList` / `failNextSizes`, which make the next `listItems` or `getSizes` call throw once, like a PhotoKit error.

  It notifies change listeners with `{ deletedIds }` like the real adapter: its own deletes and `externallyRemove` report the removed IDs, while `externallyAdd` and `externallyUpdate` (an edit or iCloud sync update that adds or removes nothing) report none. Like the real API, `listItems` throws without access. Like PhotoKit, it sets `systemPromptShown` when a permission request or a change subscription happens while access is still `undetermined`, so tests can check that iOS's prompt appears only when the user asks for access. The `photo()` and `video()` helpers build entries with increasing creation times.
- `FakeDrive` is a real `node:http` server on a random localhost port. It implements the part of Drive v3 the client uses (list, create, starting a resumable upload, the byte PUT), returns Google-style JSON errors, and parses simple `q` queries. It accepts only `validToken` and answers any other token with 401. Tests control it with:
  - `fail(endpoint, failure, { times, name })` to inject failures, either a status and reason or `'drop'` to cut the connection;
  - `stallUpload(name)` to freeze an upload so aborts can be tested;
  - `answerUploadWith(name, body)` to store the next upload of `name` as usual but answer the byte PUT with a non-JSON body;
  - `filesIn(folderId)` and `requests(endpoint)` to check what landed in Drive.
- `nodeTransport` and `nodeFetch` stand in for the native upload task. `nodeFetch` is Node's own fetch, taken from the host realm with `vm.runInThisContext('fetch')`, because jest-expo replaces `globalThis.fetch` with expo/fetch, which only works on a device.
- There are two different exporter fakes:
  - `FakeExporter` (`fakeExporter.ts`) writes real temp files that the real Drive client can upload, for the queue tests. Like the native module, it deletes its directory when an export fails, and `leftovers()` lets tests check that cleanup happened. `failExport` makes an export fail with a native-style coded error.
  - `InstantExporter` (`fakeGoogle.ts`) is the screen-test exporter. It returns one in-memory file per item immediately, reporting progress 1, and its `discard` does nothing.
- `fakeGoogle.ts` also has `FakeGoogleAuth`, where `nextSignIn` makes the next sign-in succeed, cancel or throw an Error, and `FakeDriveClient`, an in-memory `DriveClient` whose uploads fail per filename via `failures`. The HTTP protocol itself is tested in the Drive client tests, not here.

### Things to Know
- In React Native Testing Library 14, `render` and `fireEvent` are async and have to be awaited.
- Jest can't drive native header toolbar menus and buttons (`Stack.Toolbar`). Sort order is unit-tested in `@/src/library/sortFilter.test.ts`, and the sort menu is covered by Maestro.
- The SwiftUI segmented filter is driven with `fireEvent(el, 'selectionChange', { nativeEvent: { selection } })`.
- A swipe-down dismissal of the Send modal is simulated with `act(() => router.back())`, since Jest can't perform the native gesture.
- Screen tests check text the user sees, such as "4 items · 37 MB + 1 unknown", and accessibility labels such as "Video, 25.8 MB, 0:10". Changing wording in `@/src/library/selection.ts`, `@/src/lib/format.ts` or `@/src/components` fails these tests.
- `createLibraryStore` takes a `sizeBatchSize` option, so store tests can watch sizes being measured in several batches with only a few items.
- Maestro flows match exact size text from the fixtures that `make-fixtures.sh` generates. iOS also puts its own sample photos on every simulator, so the flows check the largest and smallest items and totals for videos only, never totals for the whole library.

Created and maintained by Nori.
