import { Directory } from 'expo-file-system';

import PhotoResources from '../../modules/photo-resources/src/PhotoResourcesModule';

import { toExportError } from './export-errors';
import type { Exporter } from './queue';
import { toUploadFiles } from './upload-files';

/** Exports photo-library items to temporary files with the PhotoResources native module. */
export function createPhotoExporter(): Exporter {
  return {
    exportForUpload: async (itemId, onProgress) => {
      const subscription = PhotoResources.addListener('onExportProgress', (event) => {
        if (event.id === itemId) onProgress(event.progress);
      });
      try {
        const { directory, resources } = await PhotoResources.exportForUpload(itemId);
        return { directory, files: toUploadFiles(resources) };
      } catch (error) {
        throw toExportError(error);
      } finally {
        subscription.remove();
      }
    },
    discard: async (directory) => {
      const exported = new Directory(directory);
      if (exported.exists) exported.delete();
    },
  };
}
