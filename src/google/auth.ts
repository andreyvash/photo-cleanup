import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

/** Lets the app see only files and folders it creates in the user's Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export type GoogleAccount = { email: string; name: string | null };

export interface GoogleAuth {
  /** The account from a previous session, without showing any UI; null if there isn't one. */
  restore(): Promise<GoogleAccount | null>;
  /** Shows Google's sign-in; null if the user cancelled. */
  signIn(): Promise<GoogleAccount | null>;
  signOut(): Promise<void>;
  /** A valid access token (refreshed automatically when it's about to expire). */
  getAccessToken(): Promise<string>;
}

/** `needsSignIn` tells callers that retrying won't help until the user signs in (again). */
export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly needsSignIn = false,
  ) {
    super(message);
  }
}

const toAccount = (user: User): GoogleAccount => ({ email: user.user.email, name: user.user.name ?? null });

export function createGoogleAuth(): GoogleAuth {
  const iosClientId = Constants.expoConfig?.extra?.googleIosClientId as string | undefined;
  let configured = false;

  function configure() {
    if (!iosClientId) {
      throw new GoogleAuthError('Google sign-in isn’t set up yet. Add GOOGLE_IOS_CLIENT_ID to .env.local and rebuild.', true);
    }
    if (!configured) {
      GoogleSignin.configure({ iosClientId, scopes: [DRIVE_SCOPE] });
      configured = true;
    }
  }

  /** Google's consent screen lets people untick scopes; without Drive access the app can't do its job. */
  async function withDriveScope(user: User): Promise<User> {
    if (user.scopes.includes(DRIVE_SCOPE)) return user;
    const response = await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
    if (response && isSuccessResponse(response) && response.data.scopes.includes(DRIVE_SCOPE)) {
      return response.data;
    }
    throw new GoogleAuthError('Photo Cleanup needs permission to add files to your Google Drive.');
  }

  return {
    restore: async () => {
      if (!iosClientId) return null;
      configure();
      const response = await GoogleSignin.signInSilently();
      return response.type === 'success' && response.data.scopes.includes(DRIVE_SCOPE) ? toAccount(response.data) : null;
    },
    signIn: async () => {
      configure();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return null;
      return toAccount(await withDriveScope(response.data));
    },
    signOut: async () => {
      configure();
      await GoogleSignin.signOut();
    },
    getAccessToken: async () => {
      configure();
      try {
        const { accessToken } = await GoogleSignin.getTokens();
        return accessToken;
      } catch (error) {
        if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_REQUIRED) {
          throw new GoogleAuthError('Sign in to Google again to continue.', true);
        }
        throw error;
      }
    },
  };
}
