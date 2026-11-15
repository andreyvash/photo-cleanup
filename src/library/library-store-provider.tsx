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

export function useLibrary<T>(selector: (state: LibraryState) => T): T {
  const store = useContext(LibraryStoreContext);
  if (!store) {
    throw new Error('useLibrary must be used inside LibraryStoreProvider');
  }
  return useStore(store, selector);
}
