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
  /** In the order the user selected them. */
  selectedIds: string[];
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

const canRead = (permission: PermissionState) => permission === 'granted' || permission === 'limited';

export function createLibraryStore(library: PhotoLibrary, { sizeBatchSize = 500 }: { sizeBatchSize?: number } = {}) {
  let latestLoad = 0;
  let unsubscribe: (() => void) | null = null;

  return createStore<LibraryState>()((set, get) => {
    async function load(permission: PermissionState) {
      const load = ++latestLoad;
      const items = await library.listItems();
      if (load !== latestLoad) return;

      const present = new Set(items.map((item) => item.id));
      const knownSizes: SizeMap = {};
      for (const [id, size] of Object.entries(get().sizes)) {
        if (present.has(id)) knownSizes[id] = size;
      }
      const toMeasure = items.map((item) => item.id).filter((id) => !(id in knownSizes));
      set((state) => ({
        permission,
        items,
        sizes: knownSizes,
        selectedIds: state.selectedIds.filter((id) => present.has(id)),
        sizing: toMeasure.length > 0 ? { done: 0, total: toMeasure.length } : null,
      }));

      for (let start = 0; start < toMeasure.length; start += sizeBatchSize) {
        const measured = await library.getSizes(toMeasure.slice(start, start + sizeBatchSize));
        if (load !== latestLoad) return;
        const done = Math.min(start + sizeBatchSize, toMeasure.length);
        set((state) => ({
          sizes: { ...state.sizes, ...measured },
          sizing: done < toMeasure.length ? { done, total: toMeasure.length } : null,
        }));
      }
    }

    async function apply(permission: PermissionState) {
      if (canRead(permission)) {
        await load(permission);
      } else {
        latestLoad++;
        set({ permission, items: [], sizes: {}, sizing: null, selectedIds: [] });
      }
    }

    return {
      permission: 'checking',
      items: [],
      sizes: {},
      sizing: null,
      filter: 'all',
      sort: 'largest',
      selectedIds: [],
      notice: null,

      start: async () => {
        unsubscribe ??= library.subscribe(() => {
          void library.getPermission().then(apply);
        });
        await apply(await library.getPermission());
      },
      requestAccess: async () => {
        await apply(await library.requestPermission());
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
            items: state.items.filter((item) => !deleted.has(item.id)),
            selectedIds: [],
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
