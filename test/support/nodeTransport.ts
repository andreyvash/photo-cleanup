/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import type { UploadTransport } from '@/drive/client';

/**
 * Node's own fetch, taken from the host realm. jest-expo's setup file replaces `globalThis.fetch` in every test
 * environment with expo/fetch, which only works on a device.
 */
export const nodeFetch: typeof fetch = vm.runInThisContext('fetch');

/** Stands in for the native upload task: reads the file from disk and PUTs it. */
export const nodeTransport: UploadTransport = async ({ url, fileUri, headers, onProgress, signal }) => {
  const bytes = await readFile(fileURLToPath(fileUri));
  const response = await nodeFetch(url, { method: 'PUT', headers, body: new Uint8Array(bytes), signal });
  const body = await response.text();
  onProgress(bytes.length);
  return { status: response.status, body };
};
