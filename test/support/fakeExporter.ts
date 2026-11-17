/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ExportedFile, Exporter } from '@/transfer/queue';

type AssetFile = { filename: string; mimeType: string; size: number };

/**
 * Stands in for the PhotoResources native module: writes real files into a fresh temp directory per export.
 * Like the native module, it removes that directory itself when an export fails.
 */
export class FakeExporter implements Exporter {
  private assets = new Map<string, AssetFile[]>();
  private failures = new Map<string, { message: string; code: string }>();

  private constructor(private readonly root: string) {}

  static async create(): Promise<FakeExporter> {
    return new FakeExporter(await mkdtemp(join(tmpdir(), 'photo-resources-')));
  }

  /** An asset in the photo library and the files it exports to (one or more). */
  addAsset(id: string, files: AssetFile[]): void {
    this.assets.set(id, files);
  }

  /** Makes exporting `id` fail the way the native module does. */
  failExport(id: string, error: { message: string; code: string }): void {
    this.failures.set(id, error);
  }

  /** Temp export directories still on disk. */
  async leftovers(): Promise<string[]> {
    return readdir(this.root);
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  async exportForUpload(itemId: string, onProgress: (fraction: number) => void) {
    const asset = this.assets.get(itemId);
    if (!asset) throw codedError('This item is no longer in your library.', 'ASSET_NOT_FOUND');
    const directory = join(this.root, randomUUID());
    await mkdir(directory);
    try {
      const files: ExportedFile[] = [];
      for (const [index, file] of asset.entries()) {
        const path = join(directory, file.filename);
        await writeFile(path, Buffer.alloc(file.size, index + 1));
        onProgress((index + 0.5) / asset.length);
        const failure = this.failures.get(itemId);
        if (failure) throw codedError(failure.message, failure.code);
        files.push({ uri: pathToFileURL(path).href, filename: file.filename, mimeType: file.mimeType, size: file.size });
        onProgress((index + 1) / asset.length);
      }
      return { directory, files };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async discard(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
  }

  async clearLeftovers(): Promise<void> {
    for (const name of await readdir(this.root)) {
      await rm(join(this.root, name), { recursive: true, force: true });
    }
  }
}

/** For screen tests: exports one file per item, named after it, instantly and without touching the disk. */
export class InstantExporter implements Exporter {
  leftoversCleared = false;

  async exportForUpload(itemId: string, onProgress: (fraction: number) => void) {
    onProgress(1);
    return {
      directory: `memory://${itemId}`,
      files: [{ uri: `memory://${itemId}/${itemId}.HEIC`, filename: `${itemId}.HEIC`, mimeType: 'image/heic', size: 1_000 }],
    };
  }

  async discard(): Promise<void> {}

  async clearLeftovers(): Promise<void> {
    this.leftoversCleared = true;
  }
}

function codedError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
