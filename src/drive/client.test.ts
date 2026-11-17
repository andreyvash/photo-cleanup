/** @jest-environment node */
/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { driveClientFor } from '../../test/support/driveClient';
import { FakeDrive } from '../../test/support/fakeDrive';

let drive: FakeDrive;
let scratch: string;

beforeEach(async () => {
  drive = await FakeDrive.start();
  scratch = await mkdtemp(join(tmpdir(), 'drive-client-'));
});

afterEach(async () => {
  await drive.close();
  await rm(scratch, { recursive: true, force: true });
});

function connect(getAccessToken?: () => Promise<string>) {
  return driveClientFor(drive, getAccessToken);
}

async function localFile(name: string, size: number): Promise<string> {
  const path = join(scratch, name);
  await writeFile(path, Buffer.alloc(size, 0xab));
  return pathToFileURL(path).href;
}

async function uploadPhoto(client: ReturnType<typeof connect>, folderId: string, extra: { signal?: AbortSignal } = {}) {
  return client.uploadFile({
    fileUri: await localFile('IMG_0001.HEIC', 300_000),
    filename: 'IMG_0001.HEIC',
    mimeType: 'image/heic',
    size: 300_000,
    folderId,
    ...extra,
  });
}

describe('listFolders', () => {
  it('returns only folders that are not in the trash, sorted by name', async () => {
    const vacation = drive.addFolder('Vacation');
    const archive = drive.addFolder('Archive');
    drive.addFolder('Old stuff', { trashed: true });
    drive.addFile('IMG_0001.JPG');
    const backups = drive.addFolder('Backups');

    const folders = await connect().listFolders();

    expect(folders.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: archive, name: 'Archive' },
      { id: backups, name: 'Backups' },
      { id: vacation, name: 'Vacation' },
    ]);
    expect(folders.every((folder) => !Number.isNaN(Date.parse(folder.createdTime)))).toBe(true);
  });
});

describe('createFolder', () => {
  it('creates a folder that then shows up in the folder list', async () => {
    const client = connect();

    const created = await client.createFolder("Mom's iPhone");

    expect(created.name).toBe("Mom's iPhone");
    expect(await client.listFolders()).toEqual([created]);
  });
});

describe('uploadFile', () => {
  it('puts the whole file into the folder and reports progress up to its size', async () => {
    const folderId = drive.addFolder('Backups');
    const progress: [number, number][] = [];

    const { id } = await connect().uploadFile({
      fileUri: await localFile('IMG_0001.HEIC', 300_000),
      filename: 'IMG_0001.HEIC',
      mimeType: 'image/heic',
      size: 300_000,
      folderId,
      onProgress: (sent, total) => progress.push([sent, total]),
    });

    expect(drive.filesIn(folderId)).toEqual([{ id, name: 'IMG_0001.HEIC', mimeType: 'image/heic', size: 300_000 }]);
    expect(progress.at(-1)).toEqual([300_000, 300_000]);
  });

  it('counts a 200 from Drive as uploaded even when the body is not JSON, and does not upload again', async () => {
    const folderId = drive.addFolder('Backups');
    drive.answerUploadWith('IMG_0001.HEIC', 'OK');

    const result = await uploadPhoto(connect(), folderId);

    expect(result).toEqual({ id: '' });
    expect(drive.filesIn(folderId).map((file) => file.name)).toEqual(['IMG_0001.HEIC']);
    expect(drive.requests('startUpload')).toBe(1);
  });

  it('throws folderMissing when the folder does not exist', async () => {
    await expect(uploadPhoto(connect(), 'deleted-folder-id')).rejects.toMatchObject({
      kind: 'folderMissing',
      message: 'The Drive folder no longer exists.',
    });
  });

  it('throws quota at once when Drive is full', async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail(
      'startUpload',
      { status: 403, reason: 'storageQuotaExceeded', message: "The user's Drive storage quota has been exceeded." },
      { times: Infinity },
    );

    await expect(uploadPhoto(connect(), folderId)).rejects.toMatchObject({
      kind: 'quota',
      message: 'Your Google Drive is full.',
    });
    expect(drive.requests('startUpload')).toBe(1);
    expect(drive.filesIn(folderId)).toEqual([]);
  });

  it("throws rejected with Google's message for other client errors, without retrying", async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail('startUpload', { status: 400, reason: 'invalid', message: 'Invalid value for name.' }, { times: Infinity });

    await expect(uploadPhoto(connect(), folderId)).rejects.toMatchObject({
      kind: 'rejected',
      message: 'Invalid value for name.',
    });
    expect(drive.requests('startUpload')).toBe(1);
  });

  it('starts over with a new session when the upload fails part-way, so the file lands once', async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail('uploadBytes', { status: 503 }, { times: 2 });

    await uploadPhoto(connect(), folderId);

    expect(drive.filesIn(folderId).map((file) => file.size)).toEqual([300_000]);
    expect(drive.requests('startUpload')).toBe(3);
  });

  it('starts over when the upload session has expired', async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail('uploadBytes', { status: 404, message: 'Upload session expired.' });

    await uploadPhoto(connect(), folderId);

    expect(drive.filesIn(folderId).map((file) => file.name)).toEqual(['IMG_0001.HEIC']);
  });

  it('rides out rate limits and a dropped connection', async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail('startUpload', { status: 429 });
    drive.fail('startUpload', { status: 403, reason: 'userRateLimitExceeded', message: 'User rate limit exceeded.' });
    drive.fail('uploadBytes', 'drop');

    await uploadPhoto(connect(), folderId);

    expect(drive.filesIn(folderId).map((file) => file.name)).toEqual(['IMG_0001.HEIC']);
  });

  it('recovers when the token expires mid-upload', async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail('uploadBytes', { status: 401 });

    await uploadPhoto(connect(), folderId);

    expect(drive.filesIn(folderId).map((file) => file.name)).toEqual(['IMG_0001.HEIC']);
  });

  it('throws cancelled when aborted mid-upload, and nothing lands in Drive', async () => {
    const folderId = drive.addFolder('Backups');
    const inFlight = drive.stallUpload('IMG_0001.HEIC');
    const controller = new AbortController();

    const upload = uploadPhoto(connect(), folderId, { signal: controller.signal });
    await inFlight;
    controller.abort();

    await expect(upload).rejects.toMatchObject({ kind: 'cancelled' });
    expect(drive.filesIn(folderId)).toEqual([]);
  });
});

describe('access tokens', () => {
  it('fetches a new token and carries on after a single 401', async () => {
    drive.addFolder('Backups');
    const tokens = ['expired-token', drive.validToken];

    const folders = await connect(async () => tokens.shift() ?? drive.validToken).listFolders();

    expect(folders.map((folder) => folder.name)).toEqual(['Backups']);
  });

  it('throws auth when Drive keeps refusing the token', async () => {
    await expect(connect(async () => 'revoked-token').listFolders()).rejects.toMatchObject({
      kind: 'auth',
      message: 'Sign in to Google again to continue.',
    });
  });

  it('throws auth when getting a token needs the user to sign in', async () => {
    const signedOut = async (): Promise<string> => {
      throw Object.assign(new Error('getTokens requires a user to be signed in'), { needsSignIn: true });
    };

    await expect(connect(signedOut).listFolders()).rejects.toMatchObject({
      kind: 'auth',
      message: 'Sign in to Google again to continue.',
    });
  });

  it('retries when a token refresh fails for another reason, such as being offline', async () => {
    drive.addFolder('Backups');
    let refreshes = 0;
    const flakyRefresh = async (): Promise<string> => {
      if (++refreshes <= 2) throw new Error('The Internet connection appears to be offline.');
      return drive.validToken;
    };

    const folders = await connect(flakyRefresh).listFolders();

    expect(folders.map((folder) => folder.name)).toEqual(['Backups']);
  });

  it('gives up with unavailable when a token refresh keeps failing for another reason', async () => {
    const offline = async (): Promise<string> => {
      throw new Error('The Internet connection appears to be offline.');
    };

    await expect(connect(offline).listFolders()).rejects.toMatchObject({
      kind: 'unavailable',
      message: "Google Drive didn't respond. Try again.",
    });
  });
});

describe('retries', () => {
  it('succeeds when Drive recovers after two 503s', async () => {
    drive.addFolder('Backups');
    drive.fail('listFiles', { status: 503 }, { times: 2 });

    const folders = await connect().listFolders();

    expect(folders.map((folder) => folder.name)).toEqual(['Backups']);
  });

  it('gives up with unavailable after three retries', async () => {
    drive.addFolder('Backups');
    drive.fail('listFiles', { status: 503 }, { times: 4 });

    await expect(connect().listFolders()).rejects.toMatchObject({
      kind: 'unavailable',
      message: "Google Drive didn't respond. Try again.",
    });
  });

  it('gives up with unavailable when the connection keeps dropping', async () => {
    const folderId = drive.addFolder('Backups');
    drive.fail('uploadBytes', 'drop', { times: Infinity });

    await expect(uploadPhoto(connect(), folderId)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(drive.filesIn(folderId)).toEqual([]);
  });
});
