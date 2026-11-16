# Noridoc: google

Path: @/src/google

### Overview
- Google sign-in for Send to Drive. It wraps `@react-native-google-signin/google-signin` 17 (the free tier) behind a small `GoogleAuth` interface: `restore`, `signIn`, `signOut` and `getAccessToken`.
- It defines the app's only OAuth scope, `DRIVE_SCOPE` (`drive.file`). With that scope the app can see only files and folders it created.

### How it fits into the larger codebase
- `GoogleAuth` is a service boundary in `@/src/services.tsx`. The production instance also supplies the Drive client's tokens: `createDriveClient` receives `getAccessToken: () => googleAuth.getAccessToken()`, so every request in `@/src/drive` gets its token here.
- The only UI-side caller is `@/src/send/send-session.tsx`. It calls `restore()` when the Send modal opens, calls `signIn()` and `signOut()` from the Send screen, and stores the resulting `GoogleAccount`.
- The iOS client ID comes from `GOOGLE_IOS_CLIENT_ID` in `.env.local`:
  - `@/app.config.ts` exposes it as `extra.googleIosClientId`, which this module reads through `expo-constants`.
  - `app.config.ts` adds the Google Sign-In config plugin, with a URL scheme derived from the client ID, only when the variable is set.
  - Setting or changing the ID needs a native rebuild.
- Screen tests replace this module with `FakeGoogleAuth` from `@/test/support/fakeGoogle.ts`, so Jest never loads the real SDK.

### Core Implementation
- `configure()` runs lazily, the first time a method needs it, and calls `GoogleSignin.configure({ iosClientId, scopes: [DRIVE_SCOPE] })` once per instance. If there's no client ID, it throws a `GoogleAuthError` (with `needsSignIn`) asking the user to add `GOOGLE_IOS_CLIENT_ID` to `.env.local` and rebuild.
- `GoogleAuthError` carries `needsSignIn` (default `false`). `true` tells callers that retrying won't help until the user signs in (again). The Drive client reads this flag by duck typing.
- `restore()` calls `signInSilently()` and returns an account only if the restored user still has the Drive scope. With no client ID it returns null instead of throwing, so an app without the setup simply shows the signed-out state.
- `signIn()` shows Google's sign-in sheet and returns null if the user cancels. After a successful sign-in, `withDriveScope` checks the granted scopes:
  - Google's granular consent lets people untick the Drive scope. If it's missing, the code asks for it again with `GoogleSignin.addScopes`.
  - If Drive access still isn't granted, it throws a `GoogleAuthError` saying the app needs permission to add files to Drive.
- `getAccessToken()` returns `GoogleSignin.getTokens().accessToken`. The SDK refreshes the token when it's about to expire. If `getTokens()` fails, `needsSignInAgain(error)` (`token-errors.ts`) decides what happens:
  - An error whose message contains `NSURLErrorDomain` (a refresh that failed because the device is offline) is rethrown unchanged.
  - Everything else becomes `GoogleAuthError('Sign in to Google again to continue.', true)`. That covers code `getTokens` (no signed-in user), `SIGN_IN_REQUIRED` (nothing in the keychain), and an expired or revoked refresh token (AppAuth `invalid_grant`, which is what the weekly expiry in Testing mode produces).

  The check reads the message because on iOS the library rejects a refresh failure with only the bare numeric GIDSignIn/AppAuth code, and the error domain appears only in the message.
- `GoogleAccount` keeps only `{ email, name }`.

### Things to Know
- The Send screen shows error messages from here (`GoogleAuthError` text and SDK errors) word for word. The "isn't set up" message appears only after the user taps Sign in with Google.
- What a `getAccessToken` failure becomes in `@/src/drive`:
  - A `GoogleAuthError` with `needsSignIn === true` (any token failure except an offline one, or no client ID) becomes `DriveError('auth')`, with no retry.
  - The offline (`NSURLErrorDomain`) error is retried like a network failure and ends as `DriveError('unavailable')`, so an offline user isn't told to sign in again.

  Both kinds halt the transfer queue.
- While the Google OAuth app is in Testing, Google expires the refresh token after 7 days, so users have to sign in again about once a week.
- Because `drive.file` is the only scope, folders created outside the app, such as in Drive on the web, never appear in the folder list.

Created and maintained by Nori.
