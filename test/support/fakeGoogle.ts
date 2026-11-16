import type { DriveClient, DriveFolder, UploadFileArgs } from '@/drive/client';
import { DriveError } from '@/drive/errors';
import type { GoogleAccount, GoogleAuth } from '@/google/auth';
import type { Exporter } from '@/transfer/queue';

/** Stands in for Google's native sign-in sheet. */
export class FakeGoogleAuth implements GoogleAuth {
  account: GoogleAccount | null;
  /** What happens when the user goes through Google's sign-in sheet. */
  nextSignIn: 'success' | 'cancel' | Error = 'success';

  constructor(signedInAs: string | null = null) {
    this.account = signedInAs ? { email: signedInAs, name: null } : null;
  }

  async restore() {
    return this.account;
  }

  async signIn() {
    if (this.nextSignIn === 'cancel') return null;
    if (this.nextSignIn instanceof Error) throw this.nextSignIn;
    this.account = { email: 'me@example.com', name: 'Me' };
    return this.account;
  }

  async signOut() {
    this.account = null;
  }

  async getAccessToken() {
    if (!this.account) throw new Error('Not signed in');
    return 'token';
  }
}

/** In-memory Google Drive; the HTTP protocol itself is covered by src/drive/client.test.ts. */
export class FakeDriveClient implements DriveClient {
  readonly files: { name: string; folderId: string; size: number }[] = [];
  /** Uploads of these filenames fail with the given error. */
  readonly failures = new Map<string, DriveError>();
  private nextId = 1;

  constructor(public folders: DriveFolder[] = []) {}

  async listFolders() {
    return [...this.folders].sort((a, b) => a.name.localeCompare(b.name));
  }

  async createFolder(name: string) {
    const folder = { id: `folder-${this.nextId++}`, name, createdTime: new Date().toISOString() };
    this.folders.push(folder);
    return folder;
  }

  async uploadFile({ filename, folderId, size, onProgress }: UploadFileArgs) {
    const failure = this.failures.get(filename);
    if (failure) throw failure;
    if (!this.folders.some((folder) => folder.id === folderId)) throw new DriveError('folderMissing');
    onProgress?.(size / 2, size);
    onProgress?.(size, size);
    this.files.push({ name: filename, folderId, size });
    return { id: `file-${this.nextId++}` };
  }

  namesIn(folderId: string) {
    return this.files.filter((file) => file.folderId === folderId).map((file) => file.name);
  }
}

/** Stands in for the native Photos export; produces one file per item named after it, instantly. */
export class InstantExporter implements Exporter {
  async exportForUpload(itemId: string, onProgress: (fraction: number) => void) {
    onProgress(1);
    return {
      directory: `memory://${itemId}`,
      files: [{ uri: `memory://${itemId}/${itemId}.HEIC`, filename: `${itemId}.HEIC`, mimeType: 'image/heic', size: 1_000 }],
    };
  }

  async discard() {}
}
