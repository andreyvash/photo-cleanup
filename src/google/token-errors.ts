/**
 * Whether a failed GoogleSignin.getTokens() means the user must sign in again.
 *
 * On iOS the library rejects with "getTokens" when nobody is signed in, and otherwise with the bare numeric
 * GIDSignIn/AppAuth code; the error domain only appears in the message. Only a network failure is worth retrying —
 * everything else (no saved sign-in, an expired or revoked refresh token, keychain trouble) needs a fresh sign-in.
 */
export function needsSignInAgain(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !message.includes('NSURLErrorDomain');
}
