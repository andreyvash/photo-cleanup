import type { LibraryFilter, LibraryItem, LibrarySort, SizeMap } from './types';

const KIND_FOR_FILTER = { photos: 'photo', videos: 'video' } as const;

/** Descending; values that aren't numbers go last. */
function compareKnownDescending(a: number | null | undefined, b: number | null | undefined): number {
  const aKnown = typeof a === 'number';
  const bKnown = typeof b === 'number';
  if (aKnown && bKnown) {
    return b - a;
  }
  if (aKnown) {
    return -1;
  }
  if (bKnown) {
    return 1;
  }
  return 0;
}

export function visibleItems(
  items: LibraryItem[],
  sizes: SizeMap,
  { filter, sort }: { filter: LibraryFilter; sort: LibrarySort },
): LibraryItem[] {
  const filtered = filter === 'all' ? items : items.filter((item) => item.mediaType === KIND_FOR_FILTER[filter]);
  const newestFirst = (a: LibraryItem, b: LibraryItem) => compareKnownDescending(a.creationTime, b.creationTime);
  const largestFirst = (a: LibraryItem, b: LibraryItem) =>
    compareKnownDescending(sizes[a.id], sizes[b.id]) || newestFirst(a, b);
  return [...filtered].sort(sort === 'largest' ? largestFirst : newestFirst);
}
