/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export type DriveEndpoint =
  /** GET /drive/v3/files */
  | 'listFiles'
  /** POST /drive/v3/files */
  | 'createFile'
  /** POST /upload/drive/v3/files?uploadType=resumable */
  | 'startUpload'
  /** PUT <session url> */
  | 'uploadBytes';

/** A Google-style JSON error response, or `'drop'` to cut the connection without answering. */
export type InjectedFailure = { status: number; reason?: string; message?: string } | 'drop';

type StoredFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  trashed: boolean;
  createdTime: string;
  size: number;
};

type UploadSession = {
  name: string;
  mimeType: string;
  parents: string[];
  declaredSize: number | null;
  fields: string | null;
};

type FailureRule = {
  endpoint: DriveEndpoint;
  failure: InjectedFailure;
  remaining: number;
  name?: string;
};

const DEFAULT_REASONS: Record<number, string> = {
  400: 'badRequest',
  401: 'authError',
  403: 'forbidden',
  404: 'notFound',
  429: 'rateLimitExceeded',
};

/**
 * A local HTTP server that behaves like the slice of Google Drive v3 the app uses.
 * Everything it stores is what "landed in Drive"; tests assert on that.
 */
export class FakeDrive {
  /** The only access token Drive accepts; any other token is answered with 401, like an expired one. */
  validToken = 'valid-token';

  private files: StoredFile[] = [];
  private sessions = new Map<string, UploadSession>();
  private rules: FailureRule[] = [];
  private stalls = new Map<string, () => void>();
  private uploadAnswers = new Map<string, string>();
  private counts: Record<DriveEndpoint, number> = {
    listFiles: 0,
    createFile: 0,
    startUpload: 0,
    uploadBytes: 0,
  };

  private constructor(
    private readonly server: http.Server,
    readonly baseUrl: string,
  ) {}

  static async start(): Promise<FakeDrive> {
    let drive: FakeDrive | undefined;
    const server = http.createServer((req, res) => {
      drive!.handle(req, res).catch((error: unknown) => {
        if (req.destroyed) return;
        console.error('FakeDrive could not handle', req.method, req.url, error);
        if (!res.headersSent) res.writeHead(500).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    drive = new FakeDrive(server, `http://127.0.0.1:${port}`);
    return drive;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Seeds a folder (as if the app had created it earlier). Returns its id. */
  addFolder(name: string, options: { trashed?: boolean } = {}): string {
    return this.store({ name, mimeType: FOLDER_MIME_TYPE, parents: ['root'], trashed: options.trashed ?? false, size: 0 });
  }

  /** Seeds a regular file. Returns its id. */
  addFile(name: string, options: { parents?: string[]; mimeType?: string } = {}): string {
    return this.store({
      name,
      mimeType: options.mimeType ?? 'image/jpeg',
      parents: options.parents ?? ['root'],
      trashed: false,
      size: 1,
    });
  }

  /**
   * Makes the next `times` requests to `endpoint` fail. With `name`, only requests about the file with
   * that name count (the metadata name for `startUpload`, the session's file for `uploadBytes`).
   */
  fail(endpoint: DriveEndpoint, failure: InjectedFailure, options: { times?: number; name?: string } = {}): void {
    this.rules.push({ endpoint, failure, remaining: options.times ?? 1, name: options.name });
  }

  /**
   * The next upload of the file called `name` arrives but is never read or answered, like a transfer stuck
   * mid-way. Resolves once that upload is in flight.
   */
  stallUpload(name: string): Promise<void> {
    return new Promise((resolve) => this.stalls.set(name, resolve));
  }

  /** The next upload of `name` is stored as usual, but Drive answers with `body` instead of the JSON file resource. */
  answerUploadWith(name: string, body: string): void {
    this.uploadAnswers.set(name, body);
  }

  /** What is in a folder, in creation order. */
  filesIn(folderId: string): { id: string; name: string; mimeType: string; size: number }[] {
    return this.files
      .filter((file) => file.parents.includes(folderId) && !file.trashed)
      .map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size }));
  }

  /** How many requests reached `endpoint`, including failed ones. */
  requests(endpoint: DriveEndpoint): number {
    return this.counts[endpoint];
  }

  private store(file: Omit<StoredFile, 'id' | 'createdTime'>): string {
    const id = randomUUID().replaceAll('-', '');
    this.files.push({ ...file, id, createdTime: new Date().toISOString() });
    return id;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const endpoint = route(req.method ?? 'GET', url);
    if (!endpoint) return sendError(res, 404, 'notFound', 'Not Found');
    this.counts[endpoint]++;

    const sessionId = url.searchParams.get('upload_id') ?? '';
    const session = endpoint === 'uploadBytes' ? this.sessions.get(sessionId) : undefined;
    if (session && this.stalls.has(session.name)) {
      const notify = this.stalls.get(session.name)!;
      this.stalls.delete(session.name);
      notify();
      return;
    }

    const body = await readBody(req);
    const json = endpoint === 'uploadBytes' || body.length === 0 ? {} : JSON.parse(body.toString('utf8'));
    const name: string | undefined = session?.name ?? json.name;

    const rule = this.rules.find(
      (candidate) =>
        candidate.endpoint === endpoint && candidate.remaining > 0 && (candidate.name === undefined || candidate.name === name),
    );
    if (rule) {
      rule.remaining--;
      if (rule.failure === 'drop') {
        req.socket.destroy();
        return;
      }
      const { status, reason, message } = rule.failure;
      return sendError(res, status, reason ?? DEFAULT_REASONS[status] ?? 'backendError', message ?? http.STATUS_CODES[status] ?? 'Error');
    }

    if (req.headers.authorization !== `Bearer ${this.validToken}`) {
      return sendError(
        res,
        401,
        'authError',
        'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.',
      );
    }

    switch (endpoint) {
      case 'listFiles':
        return this.listFiles(url, res);
      case 'createFile':
        return this.createFile(url, json, res);
      case 'startUpload':
        return this.startUpload(req, url, json, res);
      case 'uploadBytes':
        return this.uploadBytes(sessionId, body, res);
    }
  }

  private listFiles(url: URL, res: ServerResponse): void {
    const q = url.searchParams.get('q');
    let matches: (file: StoredFile) => boolean = () => true;
    if (q !== null) {
      try {
        matches = parseQuery(q);
      } catch {
        return sendError(res, 400, 'invalid', 'Invalid Value');
      }
    }
    const fieldsParam = url.searchParams.get('fields');
    const fileFields = fieldsParam ? /files\(([^)]*)\)/.exec(fieldsParam)?.[1] ?? null : null;
    sendJson(res, 200, {
      kind: 'drive#fileList',
      incompleteSearch: false,
      files: this.files.filter(matches).map((file) => pick(file, fileFields)),
    });
  }

  private createFile(url: URL, metadata: { name?: string; mimeType?: string; parents?: string[] }, res: ServerResponse): void {
    const parents = metadata.parents ?? ['root'];
    const missing = this.missingParent(parents);
    if (missing) return sendError(res, 404, 'notFound', `File not found: ${missing}.`);
    const id = this.store({
      name: metadata.name ?? 'Untitled',
      mimeType: metadata.mimeType ?? 'application/octet-stream',
      parents,
      trashed: false,
      size: 0,
    });
    sendJson(res, 200, pick(this.files.find((file) => file.id === id)!, url.searchParams.get('fields')));
  }

  private startUpload(
    req: IncomingMessage,
    url: URL,
    metadata: { name?: string; mimeType?: string; parents?: string[] },
    res: ServerResponse,
  ): void {
    const parents = metadata.parents ?? ['root'];
    const missing = this.missingParent(parents);
    if (missing) return sendError(res, 404, 'notFound', `File not found: ${missing}.`);
    const declared = req.headers['x-upload-content-length'];
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      name: metadata.name ?? 'Untitled',
      mimeType: metadata.mimeType ?? header(req, 'x-upload-content-type') ?? 'application/octet-stream',
      parents,
      declaredSize: declared === undefined ? null : Number(declared),
      fields: url.searchParams.get('fields'),
    });
    res.writeHead(200, {
      Location: `${this.baseUrl}/upload/drive/v3/files?uploadType=resumable&upload_id=${sessionId}`,
      'Content-Length': '0',
    });
    res.end();
  }

  private uploadBytes(sessionId: string, bytes: Buffer, res: ServerResponse): void {
    const session = this.sessions.get(sessionId);
    if (!session) return sendError(res, 404, 'notFound', 'Upload session not found or expired.');
    if (session.declaredSize !== null && bytes.length < session.declaredSize) {
      res.writeHead(308, bytes.length > 0 ? { Range: `bytes=0-${bytes.length - 1}` } : {});
      res.end();
      return;
    }
    if (session.declaredSize !== null && bytes.length > session.declaredSize) {
      return sendError(res, 400, 'badContent', 'Received more bytes than the declared upload size.');
    }
    this.sessions.delete(sessionId);
    const id = this.store({
      name: session.name,
      mimeType: session.mimeType,
      parents: session.parents,
      trashed: false,
      size: bytes.length,
    });
    const answer = this.uploadAnswers.get(session.name);
    if (answer !== undefined) {
      this.uploadAnswers.delete(session.name);
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(answer) });
      res.end(answer);
      return;
    }
    sendJson(res, 200, pick(this.files.find((file) => file.id === id)!, session.fields ?? 'id,name'));
  }

  private missingParent(parents: string[]): string | undefined {
    return parents.find(
      (parent) =>
        parent !== 'root' &&
        !this.files.some((file) => file.id === parent && file.mimeType === FOLDER_MIME_TYPE && !file.trashed),
    );
  }
}

function route(method: string, url: URL): DriveEndpoint | null {
  if (url.pathname === '/drive/v3/files' && method === 'GET') return 'listFiles';
  if (url.pathname === '/drive/v3/files' && method === 'POST') return 'createFile';
  if (url.pathname === '/upload/drive/v3/files' && method === 'POST' && url.searchParams.get('uploadType') === 'resumable') {
    return 'startUpload';
  }
  if (url.pathname === '/upload/drive/v3/files' && method === 'PUT' && url.searchParams.has('upload_id')) return 'uploadBytes';
  return null;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, reason: string, message: string): void {
  sendJson(res, status, { error: { code: status, message, errors: [{ message, domain: 'global', reason }] } });
}

/** Applies a Drive `fields` selection (a comma-separated list of top-level file fields). */
function pick(file: StoredFile, fields: string | null): Record<string, unknown> {
  const all: Record<string, unknown> = { kind: 'drive#file', ...file };
  const keys = (fields ?? 'kind,id,name,mimeType').split(',').map((key) => key.trim());
  return Object.fromEntries(keys.filter((key) => key in all).map((key) => [key, all[key]]));
}

type Token = { type: 'string' | 'word' | 'op'; value: string };

function tokenize(q: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < q.length) {
    const char = q[i];
    if (/\s/.test(char)) {
      i++;
    } else if (char === "'") {
      let value = '';
      i++;
      while (i < q.length && q[i] !== "'") {
        if (q[i] === '\\') i++;
        value += q[i];
        i++;
      }
      if (i >= q.length) throw new Error('Unterminated string');
      i++;
      tokens.push({ type: 'string', value });
    } else if (q.startsWith('!=', i)) {
      tokens.push({ type: 'op', value: '!=' });
      i += 2;
    } else if (char === '=') {
      tokens.push({ type: 'op', value: '=' });
      i++;
    } else {
      const word = /^[A-Za-z]+/.exec(q.slice(i));
      if (!word) throw new Error(`Unexpected ${char}`);
      tokens.push({ type: 'word', value: word[0] });
      i += word[0].length;
    }
  }
  return tokens;
}

/** Supports the Drive query terms the app needs: `mimeType`/`name` =/!= 'x', `trashed` =/!= bool, 'id' in parents, joined by `and`. */
function parseQuery(q: string): (file: StoredFile) => boolean {
  const tokens = tokenize(q);
  const clauses: ((file: StoredFile) => boolean)[] = [];
  let i = 0;
  while (i < tokens.length) {
    const [a, b, c] = [tokens[i], tokens[i + 1], tokens[i + 2]];
    i += 3;
    if (a?.type === 'string' && b?.value === 'in' && c?.value === 'parents') {
      clauses.push((file) => file.parents.includes(a.value));
    } else if (a?.type === 'word' && (a.value === 'mimeType' || a.value === 'name') && b?.type === 'op' && c?.type === 'string') {
      const field = a.value;
      const equal = b.value === '=';
      clauses.push((file) => (file[field] === c.value) === equal);
    } else if (a?.value === 'trashed' && b?.type === 'op' && c?.type === 'word' && (c.value === 'true' || c.value === 'false')) {
      const wanted = (c.value === 'true') === (b.value === '=');
      clauses.push((file) => file.trashed === wanted);
    } else {
      throw new Error('Invalid query');
    }
    if (i < tokens.length) {
      if (tokens[i].value !== 'and') throw new Error('Invalid query');
      i++;
    }
  }
  return (file) => clauses.every((clause) => clause(file));
}
