/** @jest-environment node */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { StoreApi } from 'zustand/vanilla';

import { createTransferQueue, type Exporter, type TransferItem, type TransferState } from './queue';
import { driveClientFor } from '../../test/support/driveClient';
import { FakeDrive } from '../../test/support/fakeDrive';
import { FakeExporter } from '../../test/support/fakeExporter';

let drive: FakeDrive;
let exporter: FakeExporter;
let folder: { id: string; name: string };

beforeEach(async () => {
  drive = await FakeDrive.start();
  exporter = await FakeExporter.create();
  folder = { id: drive.addFolder('iPhone backup'), name: 'iPhone backup' };
});

afterEach(async () => {
  await drive.close();
  await exporter.dispose();
});

function makeQueue(withExporter: Exporter = exporter) {
  return createTransferQueue({ drive: driveClientFor(drive), exporter: withExporter });
}

function photo(id: string, filename: string, size: number): TransferItem {
  exporter.addAsset(id, [{ filename, mimeType: 'image/jpeg', size }]);
  return { id, filename, size };
}

function threePhotos(): TransferItem[] {
  return [photo('a', 'IMG_0001.JPG', 120_000), photo('b', 'IMG_0002.JPG', 80_000), photo('c', 'IMG_0003.JPG', 50_000)];
}

/** Every change of an item's state, as "<id> <state>", in the order they happened. */
function recordTransitions(store: StoreApi<TransferState>): string[] {
  const log: string[] = [];
  let previous = store.getState().statuses;
  store.subscribe(({ statuses }) => {
    for (const [id, status] of Object.entries(statuses)) {
      if (previous[id]?.state !== status.state) log.push(`${id} ${status.state}`);
    }
    previous = statuses;
  });
  return log;
}

function namesInDrive(): string[] {
  return drive.filesIn(folder.id).map((file) => file.name);
}

describe('transfer queue', () => {
  it('sends the items one at a time, in order, and cleans up the exported files', async () => {
    const queue = makeQueue();
    const transitions = recordTransitions(queue.store);

    await queue.start(threePhotos(), folder);

    expect(queue.store.getState().phase).toBe('finished');
    expect(queue.store.getState().statuses).toEqual({ a: { state: 'sent' }, b: { state: 'sent' }, c: { state: 'sent' } });
    expect(transitions).toEqual([
      'a waiting',
      'b waiting',
      'c waiting',
      'a downloading',
      'a uploading',
      'a sent',
      'b downloading',
      'b uploading',
      'b sent',
      'c downloading',
      'c uploading',
      'c sent',
    ]);
    expect(drive.filesIn(folder.id).map(({ name, size }) => ({ name, size }))).toEqual([
      { name: 'IMG_0001.JPG', size: 120_000 },
      { name: 'IMG_0002.JPG', size: 80_000 },
      { name: 'IMG_0003.JPG', size: 50_000 },
    ]);
    expect(await exporter.leftovers()).toEqual([]);
  });

  it('keeps going past an item Drive rejects, and retryFailed sends just that item', async () => {
    drive.fail('startUpload', { status: 400, reason: 'invalid', message: 'Invalid value for name.' }, { name: 'IMG_0002.JPG' });
    const queue = makeQueue();

    await queue.start(threePhotos(), folder);

    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'failed', message: 'Invalid value for name.' },
      c: { state: 'sent' },
    });

    await queue.retryFailed();

    expect(queue.store.getState().phase).toBe('finished');
    expect(queue.store.getState().statuses).toEqual({ a: { state: 'sent' }, b: { state: 'sent' }, c: { state: 'sent' } });
    expect(namesInDrive().sort()).toEqual(['IMG_0001.JPG', 'IMG_0002.JPG', 'IMG_0003.JPG']);
    expect(await exporter.leftovers()).toEqual([]);
  });

  it("fails an item that can't be exported with the exporter's message, and carries on", async () => {
    exporter.failExport('b', { message: "Couldn't download this item from iCloud.", code: 'ICLOUD_DOWNLOAD_FAILED' });
    const queue = makeQueue();

    await queue.start(threePhotos(), folder);

    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'failed', message: "Couldn't download this item from iCloud." },
      c: { state: 'sent' },
    });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG', 'IMG_0003.JPG']);
    expect(await exporter.leftovers()).toEqual([]);
  });

  it('stops when Drive is full: that item failed, the rest not sent', async () => {
    drive.fail(
      'startUpload',
      { status: 403, reason: 'storageQuotaExceeded', message: "The user's Drive storage quota has been exceeded." },
      { name: 'IMG_0002.JPG', times: Infinity },
    );
    const queue = makeQueue();

    await queue.start([...threePhotos(), photo('d', 'IMG_0004.JPG', 10_000)], folder);

    expect(queue.store.getState().phase).toBe('finished');
    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'failed', message: 'Your Google Drive is full.' },
      c: { state: 'notSent', message: 'Your Google Drive is full.' },
      d: { state: 'notSent', message: 'Your Google Drive is full.' },
    });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG']);
    expect(await exporter.leftovers()).toEqual([]);
  });

  it('stops when Google sign-in has to be redone', async () => {
    drive.fail('startUpload', { status: 401 }, { name: 'IMG_0002.JPG', times: Infinity });
    const queue = makeQueue();

    await queue.start(threePhotos(), folder);

    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'failed', message: 'Sign in to Google again to continue.' },
      c: { state: 'notSent', message: 'Sign in to Google again to continue.' },
    });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG']);
  });

  it('stops when the Drive folder is gone', async () => {
    drive.fail('startUpload', { status: 404, message: 'File not found: 1a2b3c.' }, { name: 'IMG_0002.JPG' });
    const queue = makeQueue();

    await queue.start(threePhotos(), folder);

    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'failed', message: 'The Drive folder no longer exists.' },
      c: { state: 'notSent', message: 'The Drive folder no longer exists.' },
    });
    expect(await exporter.leftovers()).toEqual([]);
  });

  it('stops when Drive stays unavailable, without exporting the rest', async () => {
    drive.fail('uploadBytes', { status: 503 }, { name: 'IMG_0002.JPG', times: Infinity });
    const queue = makeQueue();
    const transitions = recordTransitions(queue.store);

    await queue.start(threePhotos(), folder);

    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'failed', message: "Google Drive didn't respond. Try again." },
      c: { state: 'notSent', message: "Google Drive didn't respond. Try again." },
    });
    expect(transitions).not.toContain('c downloading');
    expect(namesInDrive()).toEqual(['IMG_0001.JPG']);
  });

  it('fails an item whose export has no files, and carries on', async () => {
    exporter.addAsset('empty', []);
    const queue = makeQueue();

    await queue.start(
      [photo('a', 'IMG_0001.JPG', 120_000), { id: 'empty', filename: null, size: null }, photo('c', 'IMG_0003.JPG', 50_000)],
      folder,
    );

    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      empty: { state: 'failed', message: 'Nothing to copy for this item.' },
      c: { state: 'sent' },
    });
    expect(await exporter.leftovers()).toEqual([]);
  });

  it('ignores start() while a run is in progress', async () => {
    const queue = makeQueue();
    const items = threePhotos();

    await Promise.all([queue.start(items, folder), queue.start(items, folder)]);

    expect(queue.store.getState().statuses).toEqual({ a: { state: 'sent' }, b: { state: 'sent' }, c: { state: 'sent' } });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG', 'IMG_0002.JPG', 'IMG_0003.JPG']);
  });

  it('ignores retryFailed() while a retry is in progress, so stop() still cancels it', async () => {
    drive.fail('startUpload', { status: 400, message: 'Invalid value for name.' }, { name: 'IMG_0002.JPG' });
    const queue = makeQueue();
    await queue.start(threePhotos(), folder);
    const inFlight = drive.stallUpload('IMG_0002.JPG');

    const retries = Promise.all([queue.retryFailed(), queue.retryFailed()]);
    await inFlight;

    expect(queue.store.getState().phase).toBe('running');
    queue.stop();
    await retries;
    expect(queue.store.getState().statuses.b).toEqual({ state: 'notSent', message: 'Stopped' });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG', 'IMG_0003.JPG']);
  });

  it('stop() cancels the upload in flight and leaves the rest unsent; retryFailed sends them', async () => {
    const inFlight = drive.stallUpload('IMG_0002.JPG');
    const queue = makeQueue();

    const finished = queue.start(threePhotos(), folder);
    await inFlight;
    queue.stop();

    expect(queue.store.getState().phase).toBe('stopping');
    await finished;
    expect(queue.store.getState().phase).toBe('finished');
    expect(queue.store.getState().statuses).toEqual({
      a: { state: 'sent' },
      b: { state: 'notSent', message: 'Stopped' },
      c: { state: 'notSent', message: 'Stopped' },
    });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG']);
    expect(await exporter.leftovers()).toEqual([]);

    await queue.retryFailed();

    expect(queue.store.getState().statuses).toEqual({ a: { state: 'sent' }, b: { state: 'sent' }, c: { state: 'sent' } });
    expect(namesInDrive()).toEqual(['IMG_0001.JPG', 'IMG_0002.JPG', 'IMG_0003.JPG']);
  });

  it('publishes progress only when the percentage shown changes', async () => {
    const steppingExporter: Exporter = {
      exportForUpload: async (id, onProgress) => {
        for (const fraction of [0.001, 0.002, 0.004, 0.5, 0.501, 1]) onProgress(fraction);
        return exporter.exportForUpload(id, () => {});
      },
      discard: (directory) => exporter.discard(directory),
    };
    const queue = makeQueue(steppingExporter);
    const published: number[] = [];
    queue.store.subscribe(({ statuses }, previous) => {
      const status = statuses.a;
      if (status !== previous.statuses.a && status?.state === 'downloading') published.push(status.progress);
    });

    await queue.start([photo('a', 'IMG_0001.JPG', 120_000)], folder);

    expect(published).toEqual([0, 0.5, 1]);
    expect(queue.store.getState().statuses.a).toEqual({ state: 'sent' });
  });

  describe('an item with two files (Live Photo)', () => {
    function livePhoto(): TransferItem {
      exporter.addAsset('live', [
        { filename: 'IMG_0005.HEIC', mimeType: 'image/heic', size: 90_000 },
        { filename: 'IMG_0005.MOV', mimeType: 'video/quicktime', size: 360_000 },
      ]);
      return { id: 'live', filename: 'IMG_0005.HEIC', size: 450_000 };
    }

    it('is sent only once both files are in Drive, with progress over both', async () => {
      const queue = makeQueue();
      let inDriveWhenSent: string[] | undefined;
      const progress: number[] = [];
      queue.store.subscribe(({ statuses }) => {
        const status = statuses.live;
        if (status?.state === 'uploading') progress.push(status.progress);
        if (status?.state === 'sent') inDriveWhenSent ??= namesInDrive();
      });

      await queue.start([livePhoto()], folder);

      expect(queue.store.getState().statuses.live).toEqual({ state: 'sent' });
      expect(inDriveWhenSent).toEqual(['IMG_0005.HEIC', 'IMG_0005.MOV']);
      expect(progress.some((value) => Math.abs(value - 90_000 / 450_000) < 1e-9)).toBe(true);
      expect(progress.at(-1)).toBe(1);
      expect([...progress].sort((x, y) => x - y)).toEqual(progress);
    });

    it('is failed, never sent, when its second file does not make it', async () => {
      drive.fail('startUpload', { status: 400, message: 'Invalid value for mimeType.' }, { name: 'IMG_0005.MOV' });
      const queue = makeQueue();
      const transitions = recordTransitions(queue.store);

      await queue.start([livePhoto()], folder);

      expect(queue.store.getState().statuses.live).toEqual({ state: 'failed', message: 'Invalid value for mimeType.' });
      expect(transitions).not.toContain('live sent');
      expect(await exporter.leftovers()).toEqual([]);
    });
  });
});
