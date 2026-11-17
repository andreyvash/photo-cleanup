export type PhotoResourcesModuleEvents = {
  onExportProgress: (event: ExportProgressEvent) => void;
};

export type ExportProgressEvent = {
  id: string;
  /** 0–1 across all of the asset's exported files. */
  progress: number;
};

/**
 * The PhotoKit resource types that hold an asset's media, named as in `PHAssetResourceType`. `other` is any type the
 * module doesn't name (e.g. `audio`, or one added in a later iOS), exported so that nothing is lost on delete.
 */
export type ResourceType =
  | 'photo'
  | 'alternatePhoto'
  | 'fullSizePhoto'
  | 'pairedVideo'
  | 'fullSizePairedVideo'
  | 'video'
  | 'fullSizeVideo'
  | 'other';

export type ExportedResource = {
  uri: string;
  type: ResourceType;
  /** The resource's own name in Photos, e.g. "IMG_1234.HEIC", or "FullSizeRender.jpg" for an edited version. */
  originalFilename: string;
  mimeType: string;
  size: number;
};

export type ExportResult = {
  /** Temporary directory holding `resources`; delete it once they've been uploaded. */
  directory: string;
  resources: ExportedResource[];
};
