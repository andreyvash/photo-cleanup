# Noridoc: send

Path: @/src/send

### Overview
- `SendSessionProvider` and its hooks hold the state of one Send to Google Drive session: the Google account, the chosen Drive folder, the transfer queue, and a TanStack Query client for Drive folder data.
- The session belongs to the Send modal. It's created when the modal opens and discarded when it closes.

### How it fits into the larger codebase
- `@/src/app/send/_layout.tsx` mounts the provider around the modal's nested stack. `/send`, `/send/new-folder` and `/send/progress` share one session, and nothing outside the modal can reach it.
- The provider gets `googleAuth`, `drive` and `exporter` from `@/src/services.tsx`, and builds a `TransferQueue` (`@/src/transfer/queue.ts`) from the Drive client and the exporter.
- The Send screens also read the app-wide library store in `@/src/library` for the selection and sizes. That store's provider sits higher up, in the root layout, so both stores are available inside the modal. The provider itself writes back to it once, through `keepSelected`, when the modal closes.
- The `QueryClient` is provided here rather than at the root. Only the Send screens use it, for the folder list (`useQuery`) and for creating a folder (`useMutation` followed by invalidation). `DRIVE_FOLDERS_KEY` is exported so both agree on the cache key: the Send screen queries `[DRIVE_FOLDERS_KEY, <account email>]`, and the New Folder sheet invalidates `[DRIVE_FOLDERS_KEY]`, which matches every account's list.

### Core Implementation
- The provider builds its value once, with `useState`: a zustand vanilla session store, a `TransferQueue`, and a `QueryClient` whose queries retry once (`retry: 1`).
- On mount it calls `session.restore()` to sign in silently. On unmount, the effect's cleanup:
  1. calls `queue.stop()`, so closing the modal aborts any upload in progress;
  2. if the queue has items, calls the library store's `keepSelected` with the IDs of `sentItems(...)` (`@/src/transfer/queue.ts`), the same rule the progress screen uses to count what was sent.

  The cleanup runs however the modal closes: Done, swipe-down or Cancel. Narrowing here rather than in the Done button is what covers a swipe-down after a partial failure, which would otherwise leave unsent items selected for deletion. If nothing was ever queued (`items` is empty, for example after Cancel on the folder picker), the selection is left alone.
- Session store fields:
  - `auth` (`SendAuth`): `{ status: 'checking' }`, then `{ status: 'signedIn', account }` or `{ status: 'signedOut' }`. The account exists only inside the signed-in variant, so a status and an account can't disagree. Screens branch on `auth.status`.
  - `signingIn`, `error`.
  - `folderId`: the folder chosen for this send.
- `signIn()` sets `signingIn` and clears `error`. On success it sets `auth` to signed in with the account. If the user cancels Google's sheet (a null account), `auth` stays as it was. A thrown error becomes the `error` text through `messageOf(error, 'Couldn’t sign in to Google.')` (`@/src/lib/errors.ts`).
- `restore()` treats any failure as signed out. `signOut()` sets `auth` to signed out and clears the chosen folder.
- Hooks:
  - `useSendSession(selector)` subscribes to the session store with zustand's `useStore`.
  - `useTransfer(selector)` subscribes to the queue's store the same way.
  - `useTransferQueue()` returns the queue itself, for calling `start`, `stop` and `retryFailed`.
  - All three throw if they're used outside the provider.

### Things to Know
- `folderId` is just an ID. The Send screen looks it up in the fetched folder list, so a chosen folder that's missing from the latest list can't be sent to.
- The queue belongs to the session, so transfer state doesn't survive closing the modal, and reopening Send starts a new queue. That's why the progress screen disables swipe-to-dismiss while a transfer is `running`. It allows it while `stopping`, because an export in progress can't be cancelled and may take minutes. The item still exporting at that point can't become `sent` later, because the queue checks the abort signal before uploading it.
- A cancelled or failed sign-in never clears an account that's already signed in.
- `googleAuth` and `drive` are first requested here, so the first time Send opens in a launch, the production Google Sign-In wrapper and Drive client are created. The `exporter` already exists by then: the root layout (`@/src/app/_layout.tsx`) requests it at launch to call `clearLeftovers()`, and `useService` returns that same cached instance here.

Created and maintained by Nori.
