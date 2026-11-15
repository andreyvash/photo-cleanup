export type DriveErrorKind = 'auth' | 'quota' | 'folderMissing' | 'unavailable' | 'rejected' | 'cancelled';

const MESSAGES: Record<DriveErrorKind, string> = {
  auth: 'Sign in to Google again to continue.',
  quota: 'Your Google Drive is full.',
  folderMissing: 'The Drive folder no longer exists.',
  unavailable: "Google Drive didn't respond. Try again.",
  rejected: "Google Drive couldn't accept the request.",
  cancelled: 'The transfer was cancelled.',
};

/** A failed Drive request. `message` is written for the user. */
export class DriveError extends Error {
  readonly kind: DriveErrorKind;

  /** `googleMessage` replaces the default message of a `rejected` error. */
  constructor(kind: DriveErrorKind, options: { googleMessage?: string; cause?: unknown } = {}) {
    super(kind === 'rejected' && options.googleMessage ? options.googleMessage : MESSAGES[kind], { cause: options.cause });
    this.name = 'DriveError';
    this.kind = kind;
  }
}
