import { File } from 'expo-file-system';

import type { UploadTransport } from './client';

/**
 * Streams the file from disk with a native upload task. A background session lets iOS keep sending while the app
 * is suspended, as long as the JS runtime that started it is still alive.
 */
export const expoUploadTransport: UploadTransport = ({ url, fileUri, headers, onProgress, signal }) =>
  new File(fileUri)
    .createUploadTask(url, {
      httpMethod: 'PUT',
      headers,
      onProgress: ({ bytesSent }) => onProgress(bytesSent),
      sessionType: 'background',
      signal,
    })
    .uploadAsync();
