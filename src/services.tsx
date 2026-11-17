import { createContext, useContext, type ReactNode } from 'react';

import type { DriveClient } from '@/drive/client';
import type { GoogleAuth } from '@/google/auth';
import type { PhotoLibrary } from '@/library/photoLibrary';
import type { Exporter } from '@/transfer/queue';

/** Everything the app reaches outside of itself: the device photo library, Google, the network. */
export type Services = {
  photoLibrary: PhotoLibrary;
  googleAuth: GoogleAuth;
  drive: DriveClient;
  exporter: Exporter;
};

const ServicesContext = createContext<Partial<Services>>({});

/** Real implementations, `require`d on first use so native modules only load where they're needed. */
const factories: { [K in keyof Services]: () => Services[K] } = {
  photoLibrary: () =>
    (require('@/library/expo-photo-library') as typeof import('@/library/expo-photo-library')).createExpoPhotoLibrary(),
  googleAuth: () => (require('@/google/auth') as typeof import('@/google/auth')).createGoogleAuth(),
  drive: () => {
    const { createDriveClient } = require('@/drive/client') as typeof import('@/drive/client');
    const { expoUploadTransport } = require('@/drive/transport') as typeof import('@/drive/transport');
    return createDriveClient({
      getAccessToken: () => productionService('googleAuth').getAccessToken(),
      transport: expoUploadTransport,
    });
  },
  exporter: () =>
    (require('@/transfer/photo-exporter') as typeof import('@/transfer/photo-exporter')).createPhotoExporter(),
};

const production: Partial<Services> = {};

function productionService<K extends keyof Services>(key: K): Services[K] {
  return (production[key] ??= factories[key]());
}

/** Supplies implementations explicitly; anything not supplied falls back to the real one. */
export function ServicesProvider({ services, children }: { services: Partial<Services>; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useService<K extends keyof Services>(key: K): Services[K] {
  const provided = useContext(ServicesContext);
  return provided[key] ?? productionService(key);
}
