import type { DeleteOutcome, PermissionState, PhotoLibrary } from '@/library/photoLibrary';
import type { LibraryItem, SizeMap } from '@/library/types';

type FakeEntry = { item: LibraryItem; size: number | null };

/**
 * In-memory stand-in for the device photo library (the native boundary).
 * Behaves like PhotoKit: deletes remove items and notify listeners; limited access hides unselected items.
 */
export class FakePhotoLibrary implements PhotoLibrary {
  permission: PermissionState;
  /** What `requestPermission()` resolves to (what the user taps in the system prompt). */
  permissionAfterRequest: PermissionState = 'granted';
  /** What the user taps in iOS's own delete confirmation. */
  deleteConfirmation: 'delete' | 'dontAllow' = 'delete';
  /** Ids visible when access is limited. */
  limitedSelection: string[] = [];
  readonly sizeRequests: string[][] = [];
  /** Makes the next listing / size read fail, like a PhotoKit error. */
  failNextList = false;
  failNextSizes = false;
  /** Whether iOS's photo-access prompt has appeared. */
  systemPromptShown = false;

  private entries: FakeEntry[];
  private listeners = new Set<(change: { deletedIds: string[] }) => void>();

  constructor(entries: FakeEntry[], permission: PermissionState = 'granted') {
    this.entries = [...entries];
    this.permission = permission;
  }

  async getPermission() {
    return this.permission;
  }

  async requestPermission() {
    if (this.permission === 'undetermined') {
      this.systemPromptShown = true;
      this.permission = this.permissionAfterRequest;
    }
    return this.permission;
  }

  async manageLimitedSelection() {}

  async listItems() {
    if (this.failNextList) {
      this.failNextList = false;
      throw new Error('The operation couldn’t be completed.');
    }
    if (this.permission === 'denied' || this.permission === 'undetermined') {
      throw new Error('No photo library access');
    }
    return this.visibleEntries().map((e) => e.item);
  }

  async getSizes(ids: string[]) {
    if (this.failNextSizes) {
      this.failNextSizes = false;
      throw new Error('The operation couldn’t be completed.');
    }
    this.sizeRequests.push(ids);
    const sizes: SizeMap = {};
    for (const id of ids) {
      sizes[id] = this.entries.find((e) => e.item.id === id)?.size ?? null;
    }
    return sizes;
  }

  async deleteItems(ids: string[]): Promise<DeleteOutcome> {
    if (this.deleteConfirmation === 'dontAllow') {
      return 'cancelled';
    }
    this.entries = this.entries.filter((e) => !ids.includes(e.item.id));
    this.emitChange(ids);
    return 'deleted';
  }

  subscribe(onChange: (change: { deletedIds: string[] }) => void) {
    // Like PHPhotoLibrary.register(_:): observing an unauthorized library makes iOS ask for access.
    if (this.permission === 'undetermined') {
      this.systemPromptShown = true;
    }
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  }

  // Changes made outside the app (e.g. in the Photos app).
  externallyAdd(entry: FakeEntry) {
    this.entries.push(entry);
    this.emitChange();
  }

  externallyRemove(id: string) {
    this.entries = this.entries.filter((e) => e.item.id !== id);
    this.emitChange([id]);
  }

  /** Photos reports an edit or an iCloud sync update without adding or removing anything. */
  externallyUpdate() {
    this.emitChange();
  }

  ids() {
    return this.entries.map((e) => e.item.id);
  }

  private visibleEntries() {
    return this.permission === 'limited'
      ? this.entries.filter((e) => this.limitedSelection.includes(e.item.id))
      : this.entries;
  }

  private emitChange(deletedIds: string[] = []) {
    this.listeners.forEach((listener) => listener({ deletedIds }));
  }
}

let nextTime = 1_700_000_000_000;

export function photo(id: string, size: number | null): FakeEntry {
  nextTime += 60_000;
  return {
    item: { id, mediaType: 'photo', filename: `${id}.HEIC`, creationTime: nextTime, duration: null, width: 4032, height: 3024 },
    size,
  };
}

export function video(id: string, size: number | null, duration = 30): FakeEntry {
  nextTime += 60_000;
  return {
    item: { id, mediaType: 'video', filename: `${id}.MOV`, creationTime: nextTime, duration, width: 1920, height: 1080 },
    size,
  };
}
