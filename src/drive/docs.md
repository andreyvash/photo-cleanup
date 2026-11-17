# Noridoc: drive

Path: @/src/drive

### Overview
- A small Google Drive v3 REST client over `fetch`, covering only what the app needs: list the folders the app can see, create a folder, and upload a file into a folder with Drive's resumable protocol.
- Every failure surfaces as a `DriveError` with a `kind` and a message written for the user. Screens and the transfer queue display these errors without translating them.

### How it fits into the larger codebase
- `DriveClient` is one of the boundaries in `@/src/services.tsx`. The production instance is built there lazily by the `drive` factory, as `createDriveClient({ getAccessToken: () => productionService('googleAuth').getAccessToken(), transport: expoUploadTransport })`. Every Drive request therefore gets its token from the production `GoogleAuth` in `@/src/google/auth.ts`.
- Who calls in:
  - `@/src/transfer/queue.ts` calls `uploadFile`, and halts the queue on `quota`, `auth`, `folderMissing` and `unavailable`.
  - The Send screens in `@/src/app/send` call `listFolders` through a TanStack Query (keyed by `DRIVE_FOLDERS_KEY` from `@/src/send/send-session.tsx`) and `createFolder` through a mutation.
- The OAuth scope is `drive.file` only (`DRIVE_SCOPE` in `@/src/google/auth.ts`), so Drive shows the app only the folders it created. The folder query relies on this and doesn't filter by parent. The scope was chosen for personal use and to avoid restricted-scope verification.
- Every external dependency can be injected: `fetch`, `transport`, `baseUrl` and `sleep`. That's how `client.test.ts` and `@/src/transfer/queue.test.ts` run the real client over HTTP against the local fake in `@/test/support/fakeDrive.ts`, both through `driveClientFor(drive, getAccessToken?)` in `@/test/support/driveClient.ts`.

### Core Implementation
- `withRetries(attempt, signal)` wraps every request:
  - It gets a fresh token before each attempt and runs the attempt.
  - On failure it asks `judge(failure)` whether to reauthorize, retry after a backoff, or throw a `DriveError`.
- What `judge` decides:

  | Failure | Outcome |
  |---|---|
  | Not an HTTP error response (dropped connection, missing session URL, a token refresh that failed without needing sign-in) | retry |
  | `getAccessToken` throws an error with `needsSignIn === true` | `auth`, no retry |
  | 401 | get a new token and retry once; a second 401 becomes `auth` |
  | 403 `storageQuotaExceeded` | `quota`, no retry |
  | 403 `rateLimitExceeded` / `userRateLimitExceeded`, 429, 5xx | retry |
  | 404 while starting an upload | `folderMissing` |
  | 404 while sending bytes (the session expired) | retry with a new session |
  | Anything else | `rejected`, with Google's error message |

- Transient failures get up to 3 retries with exponential backoff and jitter, after which the client throws `unavailable`. The one reauthorization doesn't count toward that limit.
- Token failures are told apart by duck typing, so the client doesn't import `@/src/google/auth.ts`. An error with `needsSignIn === true` becomes `auth`. `@/src/google/auth.ts` sets it on every token failure except an offline one: no signed-in user, nothing in the keychain, or an expired or revoked refresh token. Any other failure, which in production means the `NSURLErrorDomain` error from an offline refresh, is retried like a network failure and ends as `unavailable`. That way an offline user isn't told to sign in again.
- `uploadFile` runs the whole resumable protocol inside each attempt:
  1. POST to `/upload/drive/v3/files?uploadType=resumable` with the metadata (`name`, `parents: [folderId]`) and the `X-Upload-Content-Type` / `X-Upload-Content-Length` headers.
  2. Read the session URL from the `Location` header.
  3. Hand the whole file to the `UploadTransport` as a single PUT. A 200 or 201 counts as success whatever the body contains. The new file's `id` is read from the body when it's there, and is `''` otherwise. Drive already has the file at that point, so a body that can't be read must never lead to another upload and a duplicate.
- Because step 1 is inside the retried attempt, every retry opens a new session and sends the file from the first byte. A partial upload is never resumed.
- `UploadTransport` is the seam for sending the bytes. It receives the session URL, the file URI, the headers, an `onProgress(bytesSent)` callback and an optional signal, and resolves to `{ status, body }`; the client reads nothing else from the response. The production `expoUploadTransport` (in `transport.ts`) uses expo-file-system's `File.createUploadTask` with `sessionType: 'background'` and forwards the task's `bytesSent`. iOS can then keep streaming from disk while the app is suspended, as long as the JS runtime that started the upload is still alive.
- `uploadFile`'s own `onProgress` likewise reports only bytes sent for that file. The transfer queue turns that into a fraction over all of an item's files.
- `DriveFolder` is `{ id, name }`. `listFolders` queries `mimeType = folder and trashed = false`, requests `files(id,name)`, reads one page (`pageSize` 1000), and sorts by name with `localeCompare`. `createFolder` POSTs folder metadata, requests `id,name`, and returns the same shape.
- Cancellation: the `AbortSignal` passed to `uploadFile` goes to both the initiate request and the transport. If the signal is aborted before or during an attempt, the client throws `cancelled`, whatever the underlying error was.

### Things to Know
- `DriveError` messages are the UI text, for example "Your Google Drive is full." Only `rejected` swaps in Google's own message when there is one.
- The default `fetch` looks up `globalThis.fetch` when a request is made, not when the module loads. Tests can therefore pass Node's real fetch through the `fetch` option, which matters because jest-expo replaces the global fetch.
- `listFolders` reads only the first page, so it returns at most 1000 folders.
- Retries restart uploads at the queue level too. If some of an item's files land (say an edited photo's original) and a later one fails, retrying the item uploads them all again, which leaves duplicates in Drive.
- The transport's PUT also carries the `Authorization` header and the content type.
- The `sleep` option lets tests skip the backoff delays.

Created and maintained by Nori.
