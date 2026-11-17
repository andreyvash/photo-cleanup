import type { ExportedResource, ResourceType } from '../../modules/photo-resources/src/PhotoResources.types';

import { toUploadFiles } from './upload-files';

const resource = (type: ResourceType, originalFilename: string): ExportedResource => ({
  uri: `file:///tmp/photo-resources/abc/${type}`,
  type,
  originalFilename,
  mimeType: 'application/octet-stream',
  size: 100,
});

const names = (resources: ExportedResource[]) => toUploadFiles(resources).map((file) => file.filename);

describe('toUploadFiles', () => {
  it('names an unedited photo after its original file', () => {
    expect(names([resource('photo', 'IMG_1234.HEIC')])).toEqual(['IMG_1234.HEIC']);
  });

  it('keeps the unedited original of an edited photo and marks the edited version', () => {
    expect(names([resource('photo', 'IMG_1234.HEIC'), resource('fullSizePhoto', 'FullSizeRender.jpg')])).toEqual([
      'IMG_1234.HEIC',
      'IMG_1234-edited.jpg',
    ]);
  });

  it('copies both halves of a RAW+JPEG pair under the same base name', () => {
    expect(names([resource('photo', 'IMG_1234.JPG'), resource('alternatePhoto', 'IMG_1234.DNG')])).toEqual([
      'IMG_1234.JPG',
      'IMG_1234.DNG',
    ]);
  });

  it('keeps the RAW of an edited RAW+JPEG pair alongside the edited version', () => {
    expect(
      names([
        resource('photo', 'IMG_1234.JPG'),
        resource('alternatePhoto', 'IMG_1234.DNG'),
        resource('fullSizePhoto', 'FullSizeRender.jpg'),
      ]),
    ).toEqual(['IMG_1234.JPG', 'IMG_1234.DNG', 'IMG_1234-edited.jpg']);
  });

  it('names a file of a type it doesn’t recognize after the original, unmarked', () => {
    expect(names([resource('photo', 'IMG_1234.HEIC'), resource('other', 'IMG_1234.m4a')])).toEqual([
      'IMG_1234.HEIC',
      'IMG_1234.m4a',
    ]);
  });

  it('falls back to the first file’s name when Photos reports no original', () => {
    expect(names([resource('fullSizePhoto', 'FullSizeRender.jpg')])).toEqual(['FullSizeRender-edited.jpg']);
  });

  it('names every file of an edited Live Photo after the still', () => {
    expect(
      names([
        resource('photo', 'IMG_1234.HEIC'),
        resource('fullSizePhoto', 'FullSizeRender.heic'),
        resource('pairedVideo', 'IMG_1234.MOV'),
        resource('fullSizePairedVideo', 'FullSizeRender.mov'),
      ]),
    ).toEqual(['IMG_1234.HEIC', 'IMG_1234-edited.heic', 'IMG_1234.MOV', 'IMG_1234-edited.mov']);
  });

  it('keeps the full-length original of a trimmed video', () => {
    expect(names([resource('video', 'IMG_5678.MOV'), resource('fullSizeVideo', 'FullSizeRender.mov')])).toEqual([
      'IMG_5678.MOV',
      'IMG_5678-edited.mov',
    ]);
  });

  it('only treats the last dot as the extension', () => {
    expect(names([resource('photo', 'trip.day.2.jpg'), resource('fullSizePhoto', 'FullSizeRender.jpg')])).toEqual([
      'trip.day.2.jpg',
      'trip.day.2-edited.jpg',
    ]);
  });

  it('handles files without an extension', () => {
    expect(names([resource('photo', 'IMG_1234'), resource('fullSizePhoto', 'FullSizeRender')])).toEqual([
      'IMG_1234',
      'IMG_1234-edited',
    ]);
  });

  it('passes each file’s location, type and size through unchanged', () => {
    const original = { ...resource('video', 'IMG_5678.MOV'), mimeType: 'video/quicktime', size: 25_800_000 };
    expect(toUploadFiles([original])).toEqual([
      { uri: original.uri, filename: 'IMG_5678.MOV', mimeType: 'video/quicktime', size: 25_800_000 },
    ]);
  });
});
