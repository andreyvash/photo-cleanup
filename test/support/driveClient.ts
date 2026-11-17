import { createDriveClient } from '@/drive/client';

import type { FakeDrive } from './fakeDrive';
import { nodeFetch, nodeTransport } from './nodeTransport';

/** The real Drive client, talking to a FakeDrive over HTTP, with retry backoff skipped. */
export function driveClientFor(drive: FakeDrive, getAccessToken: () => Promise<string> = async () => drive.validToken) {
  return createDriveClient({
    getAccessToken,
    transport: nodeTransport,
    fetch: nodeFetch,
    baseUrl: drive.baseUrl,
    sleep: async () => {},
  });
}
