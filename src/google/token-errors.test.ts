import { needsSignInAgain } from './token-errors';

// Shapes produced by @react-native-google-signin's iOS getTokens(): a string code plus a message.
const nativeError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('needsSignInAgain', () => {
  it('asks to sign in when nobody is signed in', () => {
    expect(needsSignInAgain(nativeError('getTokens', 'getTokens requires a user to be signed in'))).toBe(true);
  });

  it('asks to sign in when the saved sign-in is gone or was revoked', () => {
    expect(
      needsSignInAgain(nativeError('-4', 'RNGoogleSignIn: The user has never signed in before, or they have since signed out.')),
    ).toBe(true);
    expect(
      needsSignInAgain(
        nativeError('-10', 'RNGoogleSignIn: Unknown error in google sign in., Error Domain=org.openid.appauth.oauth_token Code=-10 "invalid_grant"'),
      ),
    ).toBe(true);
  });

  it('treats a failed refresh while offline as a connection problem, not a sign-in problem', () => {
    expect(
      needsSignInAgain(
        nativeError('-1009', 'RNGoogleSignIn: Unknown error in google sign in., Error Domain=NSURLErrorDomain Code=-1009 "The Internet connection appears to be offline."'),
      ),
    ).toBe(false);
  });
});
