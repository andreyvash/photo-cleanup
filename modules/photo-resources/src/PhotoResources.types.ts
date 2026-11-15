export type PhotoResourcesModuleEvents = {
  onExportProgress: (event: ExportProgressEvent) => void;
};

export type ExportProgressEvent = {
  id: string;
  /** 0–1 across all of the asset's exported files. */
  progress: number;
};

export type ExportedFile = {
  uri: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type ExportResult = {
  /** Temporary directory holding `files`; delete it once they've been uploaded. */
  directory: string;
  files: ExportedFile[];
};
