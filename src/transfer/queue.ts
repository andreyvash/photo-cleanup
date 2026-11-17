import { createStore, type StoreApi } from 'zustand/vanilla';

import type { DriveClient } from '@/drive/client';
import { DriveError, type DriveErrorKind } from '@/drive/errors';
import { messageOf } from '@/lib/errors';

export type ExportedFile = { uri: string; filename: string; mimeType: string; size: number };

export type Exporter = {
  /** Copies the asset's files (from the Photos library, downloading from iCloud if needed) into a temp directory. */
  exportForUpload(itemId: string, onProgress: (fraction: number) => void): Promise<{ directory: string; files: ExportedFile[] }>;
  /** Deletes the temp directory. */
  discard(directory: string): Promise<void>;
  /** Deletes every temp directory, e.g. those of a session that was killed. Only safe while nothing is exporting. */
  clearLeftovers(): Promise<void>;
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
  /** Never attempted: stopped by the user, or an earlier item hit an error that halted the queue. */
  | { state: 'notSent'; message: string };

export type TransferState = {
  phase: 'idle' | 'running' | 'stopping' | 'finished';
  folder: { id: string; name: string } | null;
  items: TransferItem[];
  statuses: Record<string, TransferStatus>;
};

export type TransferQueue = {
  store: StoreApi<TransferState>;
  /** Resolves when the run finishes. Does nothing while a run is in progress. */
  start(items: TransferItem[], folder: { id: string; name: string }): Promise<void>;
  /** Cancels the upload in flight; it and every remaining item become notSent "Stopped". */
  stop(): void;
  /** Re-runs every failed and notSent item. Does nothing while a run is in progress. */
  retryFailed(): Promise<void>;
};

const STOPPED = 'Stopped';
const NOTHING_TO_COPY = 'Nothing to copy for this item.';
/** Errors that would fail every remaining item too, so the queue stops instead of exporting them. */
const HALTING_ERRORS = new Set<DriveErrorKind>(['quota', 'auth', 'folderMissing', 'unavailable']);

export const isBusy = ({ phase }: Pick<TransferState, 'phase'>) => phase === 'running' || phase === 'stopping';

export const isRetryable = (status: TransferStatus | undefined) =>
  status?.state === 'failed' || status?.state === 'notSent';

/** The items that reached Drive: the only ones a later delete may remove. */
export const sentItems = ({ items, statuses }: Pick<TransferState, 'items' | 'statuses'>) =>
  items.filter((item) => statuses[item.id]?.state === 'sent');

const percent = (fraction: number) => Math.round(fraction * 100);

/**
 * Sends items to a Drive folder one at a time, in order. Each item is exported to a temp directory, every one of
 * its files is uploaded, and the temp directory is always discarded afterwards. Never deletes from the photo library.
 */
export function createTransferQueue(deps: { drive: Pick<DriveClient, 'uploadFile'>; exporter: Exporter }): TransferQueue {
  const store = createStore<TransferState>()(() => ({ phase: 'idle', folder: null, items: [], statuses: {} }));
  let controller: AbortController | null = null;

  /** Progress is shown in whole percent, so a change within the same percent isn't published. */
  function setStatus(id: string, status: TransferStatus): void {
    const current = store.getState().statuses[id];
    if (
      current?.state === status.state &&
      'progress' in current &&
      'progress' in status &&
      percent(current.progress) === percent(status.progress)
    ) {
      return;
    }
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
      return error instanceof DriveError && HALTING_ERRORS.has(error.kind) ? error.message : null;
    } finally {
      await deps.exporter.discard(exported.directory).catch(() => {});
    }
  }

  async function uploadAll(id: string, files: ExportedFile[], folderId: string, signal: AbortSignal): Promise<void> {
    if (files.length === 0) throw new Error(NOTHING_TO_COPY);
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
      if (isBusy(store.getState())) return;
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
      if (isBusy(store.getState())) return;
      const { folder, items, statuses } = store.getState();
      if (!folder) return;
      const ids = items.filter((item) => isRetryable(statuses[item.id])).map((item) => item.id);
      await run(ids, folder.id);
    },
  };
}
