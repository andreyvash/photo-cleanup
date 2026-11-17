import { toExportError } from './export-errors';

/** How Expo delivers an exception thrown by a native module function. */
const nativeError = (code: string, cause: string) =>
  Object.assign(new Error(`Calling the 'exportForUpload' function has failed\n→ Caused by: ${cause}`), { code });

describe('toExportError', () => {
  it('turns known native failures into plain messages a person can act on', () => {
    expect(toExportError(nativeError('ICLOUD_DOWNLOAD_FAILED', 'x')).message).toBe(
      'Couldn’t download this item from iCloud. Check your connection and try again.',
    );
    expect(toExportError(nativeError('NOT_ENOUGH_SPACE', 'x')).message).toBe(
      'Not enough free space on this iPhone to copy this item.',
    );
    expect(toExportError(nativeError('ASSET_NOT_FOUND', 'x')).message).toBe('This item is no longer in your library.');
  });

  it('keeps the underlying reason for other failures, without Expo’s wrapper text', () => {
    expect(toExportError(nativeError('EXPORT_FAILED', 'The file couldn’t be saved.')).message).toBe(
      'The file couldn’t be saved.',
    );
  });

  it('falls back to a generic message when there is nothing useful', () => {
    expect(toExportError(undefined).message).toBe('Couldn’t copy this item.');
  });
});
