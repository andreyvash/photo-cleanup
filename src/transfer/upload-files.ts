import type { ExportedResource, ResourceType } from '../../modules/photo-resources/src/PhotoResources.types';

import type { ExportedFile } from './queue';

const EDITED_TYPES = new Set<ResourceType>(['fullSizePhoto', 'fullSizePairedVideo', 'fullSizeVideo']);

function splitExtension(filename: string): [stem: string, extension: string] {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? [filename.slice(0, dot), filename.slice(dot)] : [filename, ''];
}

/**
 * Names each exported resource for Drive after the item's original file: "IMG_1234.HEIC", its RAW "IMG_1234.DNG",
 * its Live Photo video "IMG_1234.MOV", and edited versions (which Photos calls "FullSizeRender") "IMG_1234-edited.jpg",
 * the suffix English-language Google Takeout exports use.
 */
export function toUploadFiles(resources: ExportedResource[]): ExportedFile[] {
  const original = resources.find((resource) => resource.type === 'photo' || resource.type === 'video') ?? resources[0];
  const [baseName] = splitExtension(original?.originalFilename ?? '');
  return resources.map(({ uri, type, originalFilename, mimeType, size }) => {
    const [, extension] = splitExtension(originalFilename);
    const suffix = EDITED_TYPES.has(type) ? '-edited' : '';
    return { uri, filename: `${baseName}${suffix}${extension}`, mimeType, size };
  });
}
