const MESSAGES: Record<string, string> = {
  ICLOUD_DOWNLOAD_FAILED: 'Couldn’t download this item from iCloud. Check your connection and try again.',
  NOT_ENOUGH_SPACE: 'Not enough free space on this iPhone to copy this item.',
  ASSET_NOT_FOUND: 'This item is no longer in your library.',
};

const EXPO_CAUSE = /→ Caused by: ([\s\S]+)$/;

/**
 * Expo wraps native exceptions ("Calling the 'exportForUpload' function has failed → Caused by: …") but keeps the
 * native error code. Turn that into a message fit for the transfer list.
 */
export function toExportError(error: unknown): Error {
  const code = (error as { code?: unknown } | null)?.code;
  const raw = error instanceof Error ? error.message : '';
  return new Error(
    (typeof code === 'string' && MESSAGES[code]) || raw.match(EXPO_CAUSE)?.[1].trim() || raw || 'Couldn’t copy this item.',
  );
}
