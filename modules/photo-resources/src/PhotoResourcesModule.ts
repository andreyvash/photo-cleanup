import { NativeModule, requireNativeModule } from 'expo';

import type { ExportResult, PhotoResourcesModuleEvents } from './PhotoResources.types';

declare class PhotoResourcesModule extends NativeModule<PhotoResourcesModuleEvents> {
  getSizes(ids: string[]): Promise<Record<string, number | null>>;
  exportForUpload(id: string): Promise<ExportResult>;
  clearExports(): Promise<void>;
}

export default requireNativeModule<PhotoResourcesModule>('PhotoResources');
