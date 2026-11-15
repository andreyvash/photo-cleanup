import { createContext, useContext, type ReactNode } from 'react';

import type { PhotoLibrary } from '@/library/photoLibrary';

/** Everything the app reaches outside of itself: the device photo library, Google, the network. */
export type Services = {
  photoLibrary: PhotoLibrary;
};

const ServicesContext = createContext<Partial<Services>>({});

const production: Partial<Services> = {};

/** Real implementations are created on first use, so native modules only load where they're needed. */
function productionService<K extends keyof Services>(key: K): Services[K] {
  if (!production[key]) {
    switch (key) {
      case 'photoLibrary': {
        const { createExpoPhotoLibrary } = require('@/library/expo-photo-library') as typeof import('@/library/expo-photo-library');
        production.photoLibrary = createExpoPhotoLibrary();
        break;
      }
    }
  }
  return production[key] as Services[K];
}

/** Supplies implementations explicitly; anything not supplied falls back to the real one. */
export function ServicesProvider({ services, children }: { services: Partial<Services>; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useService<K extends keyof Services>(key: K): Services[K] {
  const provided = useContext(ServicesContext);
  return provided[key] ?? productionService(key);
}
