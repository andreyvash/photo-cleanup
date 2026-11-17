import type { LibraryItem, SizeMap } from './types';

export type PermissionState = 'undetermined' | 'denied' | 'limited' | 'granted';
export type DeleteOutcome = 'deleted' | 'cancelled';

/** The device photo library, as the app needs it. */
export interface PhotoLibrary {
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  /** Shows iOS's picker for changing which photos a limited-access app can see. */
  manageLimitedSelection(): Promise<void>;
  /** Every photo and video the app can see (metadata only). */
  listItems(): Promise<LibraryItem[]>;
  getSizes(ids: string[]): Promise<SizeMap>;
  /** iOS asks the user to confirm; 'cancelled' when they decline. */
  deleteItems(ids: string[]): Promise<DeleteOutcome>;
  /** Called when the library changes, including from other apps. Returns an unsubscribe function. */
  subscribe(onChange: (change: { deletedIds: string[] }) => void): () => void;
}
