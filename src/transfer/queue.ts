import { createStore, type StoreApi } from 'zustand/vanilla';

import type { DriveClient } from '@/drive/client';
import { DriveError } from '@/drive/errors';

export type ExportedFile = { uri: string; filename: string; mimeType: string; size: number };

export type Exporter = {
  /** Copies the asset's files (from the Photos library, downloading from iCloud if needed) into a temp directory. */
  exportForUpload(itemId: string, onProgress: (fraction: number) => void): Promise<{ directory: string; files: ExportedFile[] }>;
  /** Deletes the temp directory. */
  discard(directory: string): Promise<void>;
};

export type TransferItem = { id: string; filename: string | null; size: number | null };

export type TransferStatus =
  | { state: 'waiting' }
  /** Exporting / iCloud download, 0..1. */
  | { state: 'downloading'; progress: number }
  /** 0..1 over all of the item's files. */
  | { state: 'uploading'; progress: number }
  | { state: 'sent' }
  | { state: 'failed'; message: string }
  /** Never attempted: stopped by the user, or Drive is full. */
  | { state: 'notSent'; message: string };

export type TransferState = {
  phase: 'idle' | 'running' | 'stopping' | 'finished';
  folder: { id: string; name: string } | null;
  items: TransferItem[];
  statuses: Record<string, TransferStatus>;
};

export type TransferQueue = {
  store: StoreApi<TransferState>;
  start(items: TransferItem[], folder: { id: string; name: string }): Promise<void>;
  stop(): void;
  retryFailed(): Promise<void>;
};

const STOPPED = 'Stopped';

/**
 * Sends items to a Drive folder one at a time, in order. Each item is exported to a temp directory, every one of
 * its files is uploaded, and the temp directory is always discarded afterwards. Never deletes from the photo library.
 */
export function createTransferQueue(deps: { drive: Pick<DriveClient, 'uploadFile'>; exporter: Exporter }): TransferQueue {
  const store = createStore<TransferState>()(() => ({ phase: 'idle', folder: null, items: [], statuses: {} }));
  let controller: AbortController | null = null;

  function setStatus(id: string, status: TransferStatus): void {
    store.setState((state) => ({ statuses: { ...state.statuses, [id]: status } }));
  }

  async function run(ids: string[], folderId: string): Promise<void> {
    const { signal } = (controller = new AbortController());
    store.setState((state) => ({
      phase: 'running',
      statuses: { ...state.statuses, ...Object.fromEntries(ids.map((id) => [id, { state: 'waiting' } as const])) },
    }));
    /** Once set, every remaining item becomes notSent with this message. */
    let haltedWith: string | null = null;
    for (const id of ids) {
      if (haltedWith === null && signal.aborted) haltedWith = STOPPED;
      if (haltedWith !== null) {
        setStatus(id, { state: 'notSent', message: haltedWith });
        continue;
      }
      haltedWith = await transfer(id, folderId, signal);
    }
    controller = null;
    store.setState({ phase: 'finished' });
  }

  /** Returns the message to halt the queue with, or null to carry on. */
  async function transfer(id: string, folderId: string, signal: AbortSignal): Promise<string | null> {
    setStatus(id, { state: 'downloading', progress: 0 });
    let exported: Awaited<ReturnType<Exporter['exportForUpload']>>;
    try {
      exported = await deps.exporter.exportForUpload(id, (progress) => setStatus(id, { state: 'downloading', progress }));
    } catch (error) {
      setStatus(id, { state: 'failed', message: messageOf(error) });
      return null;
    }
    try {
      await uploadAll(id, exported.files, folderId, signal);
      setStatus(id, { state: 'sent' });
      return null;
    } catch (error) {
      if (signal.aborted) {
        setStatus(id, { state: 'notSent', message: STOPPED });
        return STOPPED;
      }
      setStatus(id, { state: 'failed', message: messageOf(error) });
      return error instanceof DriveError && (error.kind === 'quota' || error.kind === 'auth') ? error.message : null;
    } finally {
      await deps.exporter.discard(exported.directory).catch(() => {});
    }
  }

  async function uploadAll(id: string, files: ExportedFile[], folderId: string, signal: AbortSignal): Promise<void> {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const progressAt = (bytes: number) => (totalBytes > 0 ? Math.min(bytes / totalBytes, 1) : 1);
    let uploadedBytes = 0;
    setStatus(id, { state: 'uploading', progress: 0 });
    for (const file of files) {
      if (signal.aborted) throw new DriveError('cancelled');
      await deps.drive.uploadFile({
        fileUri: file.uri,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        folderId,
        signal,
        onProgress: (bytesSent) =>
          setStatus(id, { state: 'uploading', progress: progressAt(uploadedBytes + Math.min(bytesSent, file.size)) }),
      });
      uploadedBytes += file.size;
      setStatus(id, { state: 'uploading', progress: progressAt(uploadedBytes) });
    }
  }

  return {
    store,

    async start(items, folder) {
      store.setState({ items, folder, statuses: {} });
      await run(
        items.map((item) => item.id),
        folder.id,
      );
    },

    stop() {
      if (store.getState().phase !== 'running') return;
      store.setState({ phase: 'stopping' });
      controller?.abort();
    },

    async retryFailed() {
      const { folder, items, statuses } = store.getState();
      if (!folder) return;
      const ids = items
        .map((item) => item.id)
        .filter((id) => statuses[id]?.state === 'failed' || statuses[id]?.state === 'notSent');
      await run(ids, folder.id);
    },
  };
}

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.length > 0 ? message : 'Something went wrong.';
}
