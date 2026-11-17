import { createStore } from 'zustand/vanilla';

import { formatCount } from '@/lib/format';

import type { DeleteOutcome, PermissionState, PhotoLibrary } from './photoLibrary';
import type { LibraryFilter, LibraryItem, LibrarySort, SizeMap } from './types';

export type LibraryState = {
  permission: PermissionState | 'checking';
  items: LibraryItem[];
  sizes: SizeMap;
  /** Progress while sizes are being read; null once every item has been measured. */
  sizing: { done: number; total: number } | null;
  filter: LibraryFilter;
  sort: LibrarySort;
  /** In the order the user selected them. Always a subset of `items`. */
  selectedIds: string[];
  /** The last attempt to read the library failed. */
  readFailed: boolean;
  /** One-off message for the library screen, e.g. after a delete. */
  notice: string | null;

  start(): Promise<void>;
  requestAccess(): Promise<void>;
  manageAccess(): Promise<void>;
  setFilter(filter: LibraryFilter): void;
  setSort(sort: LibrarySort): void;
  toggleSelection(id: string): void;
  clearSelection(): void;
  /** Narrows the selection to these ids (e.g. the items that were sent to Drive). */
  keepSelected(ids: string[]): void;
  deleteSelected(): Promise<DeleteOutcome>;
  dismissNotice(): void;
};

export const canRead = (permission: LibraryState['permission']) => permission === 'granted' || permission === 'limited';

/** Each measured batch re-renders the grid, so even a large library is measured in at most this many. */
const MAX_SIZE_BATCHES = 20;

/** Replaces the items and drops selected ids that are no longer among them. */
function withItems(state: LibraryState, items: LibraryItem[]): Pick<LibraryState, 'items' | 'selectedIds'> {
  const present = new Set(items.map((item) => item.id));
  return { items, selectedIds: state.selectedIds.filter((id) => present.has(id)) };
}

export function createLibraryStore(library: PhotoLibrary, { sizeBatchSize = 500 }: { sizeBatchSize?: number } = {}) {
  let following = false;
  let running: Promise<void> | null = null;
  let reloadRequested = false;

  return createStore<LibraryState>()((set, get) => {
    async function load(permission: PermissionState) {
      let items: LibraryItem[];
      try {
        items = await library.listItems();
      } catch {
        set({ permission, sizing: null, readFailed: true });
        return;
      }

      const present = new Set(items.map((item) => item.id));
      const knownSizes: SizeMap = {};
      for (const [id, size] of Object.entries(get().sizes)) {
        if (present.has(id)) knownSizes[id] = size;
      }
      const toMeasure = items.map((item) => item.id).filter((id) => !(id in knownSizes));
      set((state) => ({
        ...withItems(state, items),
        permission,
        sizes: knownSizes,
        readFailed: false,
        sizing: toMeasure.length > 0 ? { done: 0, total: toMeasure.length } : null,
      }));

      // Sizes are facts about an item, so every finished batch is kept even if the library changes meanwhile.
      const batchSize = Math.max(sizeBatchSize, Math.ceil(toMeasure.length / MAX_SIZE_BATCHES));
      for (let start = 0; start < toMeasure.length; start += batchSize) {
        const batch = toMeasure.slice(start, start + batchSize);
        let measured: SizeMap;
        try {
          measured = await library.getSizes(batch);
        } catch {
          measured = Object.fromEntries(batch.map((id) => [id, null]));
        }
        const done = Math.min(start + batchSize, toMeasure.length);
        set((state) => ({
          sizes: { ...state.sizes, ...measured },
          sizing: done < toMeasure.length ? { done, total: toMeasure.length } : null,
        }));
      }
    }

    async function apply(permission: PermissionState) {
      if (canRead(permission)) {
        followLibraryChanges();
        await load(permission);
      } else {
        set({ permission, items: [], sizes: {}, sizing: null, selectedIds: [], readFailed: false });
      }
    }

    /**
     * Reloads run one at a time. Changes that arrive meanwhile (an iCloud sync can send many) collapse into a
     * single follow-up reload instead of restarting the current one.
     */
    function reload(): Promise<void> {
      if (running) {
        reloadRequested = true;
        return running;
      }
      running = (async () => {
        do {
          reloadRequested = false;
          try {
            await apply(await library.getPermission());
          } catch {
            set({ sizing: null, readFailed: true });
          }
        } while (reloadRequested);
      })().finally(() => {
        running = null;
      });
      return running;
    }

    /** Only once access is granted: observing an unauthorized library makes iOS show its permission prompt. */
    function followLibraryChanges() {
      if (following) return;
      following = true;
      library.subscribe(({ deletedIds }) => {
        if (deletedIds.length > 0) {
          const deleted = new Set(deletedIds);
          set((state) =>
            withItems(
              state,
              state.items.filter((item) => !deleted.has(item.id)),
            ),
          );
        }
        void reload();
      });
    }

    return {
      permission: 'checking',
      items: [],
      sizes: {},
      sizing: null,
      filter: 'all',
      sort: 'largest',
      selectedIds: [],
      readFailed: false,
      notice: null,

      start: () => reload(),
      requestAccess: async () => {
        await library.requestPermission();
        await reload();
      },
      manageAccess: () => library.manageLimitedSelection(),
      setFilter: (filter) => set({ filter }),
      setSort: (sort) => set({ sort }),
      toggleSelection: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selected) => selected !== id)
            : [...state.selectedIds, id],
        })),
      clearSelection: () => set({ selectedIds: [] }),
      keepSelected: (ids) => set((state) => ({ selectedIds: state.selectedIds.filter((id) => ids.includes(id)) })),
      deleteSelected: async () => {
        const ids = get().selectedIds;
        if (ids.length === 0) return 'cancelled';
        const outcome = await library.deleteItems(ids);
        if (outcome === 'deleted') {
          const deleted = new Set(ids);
          set((state) => ({
            ...withItems(
              state,
              state.items.filter((item) => !deleted.has(item.id)),
            ),
            notice: `Moved ${formatCount(ids.length, 'item', 'items')} to Recently Deleted.`,
          }));
        }
        return outcome;
      },
      dismissNotice: () => set({ notice: null }),
    };
  });
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;
