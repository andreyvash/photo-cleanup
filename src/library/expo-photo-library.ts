import {
  Asset,
  AssetField,
  MediaType,
  Query,
  addListener,
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
  type AssetMetadata,
  type PermissionResponse,
} from 'expo-media-library';

import PhotoResources from '../../modules/photo-resources/src/PhotoResourcesModule';

import type { PermissionState, PhotoLibrary } from './photoLibrary';
import type { LibraryItem } from './types';

const PAGE_SIZE = 1000;
const URI_PREFIX = 'ph://';

/** expo-media-library ids are `ph://<localIdentifier>`; the app uses the bare PhotoKit local identifier. */
const toLocalIdentifier = (id: string) => (id.startsWith(URI_PREFIX) ? id.slice(URI_PREFIX.length) : id);

function toPermission(response: PermissionResponse): PermissionState {
  if (response.status === 'granted') {
    return response.accessPrivileges === 'limited' ? 'limited' : 'granted';
  }
  return response.status === 'denied' ? 'denied' : 'undetermined';
}

function toItem(metadata: AssetMetadata): LibraryItem | null {
  if (metadata.mediaType !== MediaType.IMAGE && metadata.mediaType !== MediaType.VIDEO) {
    return null;
  }
  return {
    id: toLocalIdentifier(metadata.id),
    mediaType: metadata.mediaType === MediaType.VIDEO ? 'video' : 'photo',
    filename: metadata.filename,
    creationTime: metadata.creationTime,
    duration: metadata.duration == null ? null : metadata.duration / 1000,
    width: metadata.width,
    height: metadata.height,
  };
}

/** PhotoKit reports "user declined" as PHPhotosError.userCancelled (3072). */
function isUserCancellation(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? '');
  return /3072|cancel/i.test(message);
}

export function createExpoPhotoLibrary(): PhotoLibrary {
  return {
    getPermission: async () => toPermission(await getPermissionsAsync()),
    requestPermission: async () => toPermission(await requestPermissionsAsync()),
    manageLimitedSelection: () => presentPermissionsPicker(),

    listItems: async () => {
      const items: LibraryItem[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await new Query()
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .limit(PAGE_SIZE)
          .offset(offset)
          .exeForMetadata();
        for (const metadata of page) {
          const item = toItem(metadata);
          if (item) items.push(item);
        }
        if (page.length < PAGE_SIZE) return items;
      }
    },

    getSizes: (ids) => PhotoResources.getSizes(ids),

    deleteItems: async (ids) => {
      try {
        await Asset.delete(ids.map((id) => new Asset(`${URI_PREFIX}${id}`)));
        return 'deleted';
      } catch (error) {
        if (isUserCancellation(error)) return 'cancelled';
        throw error;
      }
    },

    subscribe: (onChange) => {
      const subscription = addListener((event) =>
        onChange({ deletedIds: (event.deletedAssets ?? []).map(toLocalIdentifier) }),
      );
      return () => subscription.remove();
    },
  };
}
