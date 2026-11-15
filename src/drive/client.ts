import { DriveError } from './errors';

export type DriveFolder = { id: string; name: string; createdTime: string };

export type UploadTransport = (request: {
  /** Resumable session URL. */
  url: string;
  /** file:// URI of a local file. */
  fileUri: string;
  headers: Record<string, string>;
  onProgress: (bytesSent: number, totalBytes: number) => void;
  signal?: AbortSignal;
}) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

export type DriveClientOptions = {
  /** Returns a valid token (Google Sign-In refreshes it). Called before every request. */
  getAccessToken: () => Promise<string>;
  /** Sends the file bytes with a PUT. */
  transport: UploadTransport;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Waits between retries. */
  sleep?: (ms: number) => Promise<void>;
};

export type UploadFileArgs = {
  fileUri: string;
  filename: string;
  mimeType: string;
  size: number;
  folderId: string;
  onProgress?: (bytesSent: number, totalBytes: number) => void;
  signal?: AbortSignal;
};

export type DriveClient = {
  /** Non-trashed folders the app can see (with the drive.file scope: the ones it created), sorted by name. */
  listFolders(): Promise<DriveFolder[]>;
  createFolder(name: string): Promise<DriveFolder>;
  /** Uploads with Drive's resumable protocol. A retry starts the upload over in a new session. */
  uploadFile(args: UploadFileArgs): Promise<{ id: string }>;
};

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const MAX_RETRIES = 3;
const FIRST_RETRY_DELAY_MS = 1000;

type Stage = 'request' | 'startUpload' | 'sendBytes';

/** Drive answered with an error status. */
class HttpFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly stage: Stage,
  ) {
    super(`Google Drive responded with ${status} (${stage})`);
  }
}

type Verdict = 'reauthorize' | 'retry' | DriveError;

export function createDriveClient(options: DriveClientOptions): DriveClient {
  const { getAccessToken, transport, baseUrl = 'https://www.googleapis.com', sleep = wait } = options;
  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function accessToken(): Promise<string> {
    try {
      return await getAccessToken();
    } catch (cause) {
      throw new DriveError('auth', { cause });
    }
  }

  /** Runs `attempt` with a fresh token, retrying once after a 401 and up to MAX_RETRIES times after transient failures. */
  async function withRetries<T>(attempt: (authorization: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let reauthorized = false;
    let retries = 0;
    for (;;) {
      if (signal?.aborted) throw new DriveError('cancelled');
      const authorization = `Bearer ${await accessToken()}`;
      let failure: unknown;
      try {
        return await attempt(authorization);
      } catch (error) {
        if (signal?.aborted) throw new DriveError('cancelled', { cause: error });
        failure = error;
      }
      const verdict = judge(failure);
      if (verdict instanceof DriveError) throw verdict;
      if (verdict === 'reauthorize') {
        if (reauthorized) throw new DriveError('auth', { cause: failure });
        reauthorized = true;
        continue;
      }
      if (retries === MAX_RETRIES) throw new DriveError('unavailable', { cause: failure });
      await sleep(backoff(retries++));
    }
  }

  async function requestJson<T>(url: string, init: { method?: string; body?: string } = {}): Promise<T> {
    return withRetries(async (authorization) => {
      const response = await fetchImpl(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: authorization,
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json; charset=UTF-8' }),
        },
        body: init.body,
      });
      const text = await response.text();
      if (!response.ok) throw new HttpFailure(response.status, text, 'request');
      return JSON.parse(text) as T;
    });
  }

  return {
    async listFolders() {
      const query = queryString({
        q: `mimeType = ${quote(FOLDER_MIME_TYPE)} and trashed = false`,
        fields: 'files(id,name,createdTime)',
        pageSize: '1000',
      });
      const { files = [] } = await requestJson<{ files?: DriveFolder[] }>(`${baseUrl}/drive/v3/files?${query}`);
      return files.sort((a, b) => a.name.localeCompare(b.name));
    },

    async createFolder(name) {
      return requestJson<DriveFolder>(`${baseUrl}/drive/v3/files?${queryString({ fields: 'id,name,createdTime' })}`, {
        method: 'POST',
        body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE }),
      });
    },

    async uploadFile({ fileUri, filename, mimeType, size, folderId, onProgress, signal }) {
      return withRetries(async (authorization) => {
        const started = await fetchImpl(`${baseUrl}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
          method: 'POST',
          headers: {
            Authorization: authorization,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': mimeType,
            'X-Upload-Content-Length': String(size),
          },
          body: JSON.stringify({ name: filename, parents: [folderId] }),
          signal,
        });
        if (!started.ok) throw new HttpFailure(started.status, await started.text(), 'startUpload');
        const sessionUrl = started.headers.get('location');
        if (!sessionUrl) throw new Error('Google Drive did not return an upload session URL.');

        const sent = await transport({
          url: sessionUrl,
          fileUri,
          headers: { Authorization: authorization, 'Content-Type': mimeType },
          onProgress: onProgress ?? (() => {}),
          signal,
        });
        if (sent.status !== 200 && sent.status !== 201) throw new HttpFailure(sent.status, sent.body, 'sendBytes');
        return { id: (JSON.parse(sent.body) as { id: string }).id };
      }, signal);
    },
  };
}

/** Decides what a failed attempt means. Anything that is not an HTTP error response is a network failure. */
function judge(failure: unknown): Verdict {
  if (!(failure instanceof HttpFailure)) return 'retry';
  const { status, stage } = failure;
  const { reasons, message } = readGoogleError(failure.body);
  if (status === 401) return 'reauthorize';
  if (status === 403 && reasons.includes('storageQuotaExceeded')) return new DriveError('quota', { cause: failure });
  if (status === 403 && (reasons.includes('rateLimitExceeded') || reasons.includes('userRateLimitExceeded'))) return 'retry';
  if (status === 404 && stage === 'startUpload') return new DriveError('folderMissing', { cause: failure });
  // Drive answers 404 when a resumable session has expired; the upload has to start over.
  if (status === 404 && stage === 'sendBytes') return 'retry';
  if (status === 429 || status >= 500) return 'retry';
  return new DriveError('rejected', { googleMessage: message, cause: failure });
}

function readGoogleError(body: string): { reasons: string[]; message?: string } {
  try {
    const { error } = JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[] } };
    return {
      reasons: (error?.errors ?? []).flatMap((entry) => (entry.reason ? [entry.reason] : [])),
      message: error?.message || undefined,
    };
  } catch {
    return { reasons: [] };
  }
}

/** Exponential backoff with jitter: ~0.5–1 s, 1–2 s, 2–4 s. */
function backoff(retry: number): number {
  const ceiling = FIRST_RETRY_DELAY_MS * 2 ** retry;
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A string literal for a Drive `q` query. */
function quote(value: string): string {
  return `'${value.replace(/[\\']/g, (char) => `\\${char}`)}'`;
}

function queryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}
