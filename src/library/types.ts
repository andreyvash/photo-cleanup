export type MediaKind = 'photo' | 'video';

export type LibraryItem = {
  /** PhotoKit local identifier. */
  id: string;
  mediaType: MediaKind;
  filename: string | null;
  /** Milliseconds since epoch. */
  creationTime: number | null;
  /** Seconds; null for photos. */
  duration: number | null;
  width: number | null;
  height: number | null;
};

/** Bytes per item id. `null` = could not be measured; missing = not measured yet. */
export type SizeMap = Record<string, number | null>;

export type LibraryFilter = 'all' | 'photos' | 'videos';
export type LibrarySort = 'largest' | 'newest';
