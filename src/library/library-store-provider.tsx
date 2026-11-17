import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';

import { useService } from '@/services';

import { createLibraryStore, type LibraryState, type LibraryStore } from './store';

const LibraryStoreContext = createContext<LibraryStore | null>(null);

export function LibraryStoreProvider({ children }: { children: ReactNode }) {
  const photoLibrary = useService('photoLibrary');
  const [store] = useState(() => createLibraryStore(photoLibrary));

  useEffect(() => {
    void store.getState().start();
  }, [store]);

  return <LibraryStoreContext.Provider value={store}>{children}</LibraryStoreContext.Provider>;
}

/** The store itself, for reading state at the moment of an action without re-rendering on every change. */
export function useLibraryStore(): LibraryStore {
  const store = useContext(LibraryStoreContext);
  if (!store) {
    throw new Error('useLibrary must be used inside LibraryStoreProvider');
  }
  return store;
}

export function useLibrary<T>(selector: (state: LibraryState) => T): T {
  return useStore(useLibraryStore(), selector);
}
