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

import { assetUri, toLocalIdentifier } from './asset-uri';
import type { PermissionState, PhotoLibrary } from './photoLibrary';
import type { LibraryItem } from './types';


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

    // One query: expo-media-library re-runs the whole PhotoKit fetch for every offset page.
    listItems: async () => {
      const all = await new Query().orderBy({ key: AssetField.CREATION_TIME, ascending: false }).exeForMetadata();
      return all.flatMap((metadata) => toItem(metadata) ?? []);
    },

    getSizes: (ids) => PhotoResources.getSizes(ids),

    deleteItems: async (ids) => {
      try {
        await Asset.delete(ids.map((id) => new Asset(assetUri(id))));
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
