import { formatBytes, formatCount } from '@/lib/format';

import type { SizeMap } from './types';

/** "3 items · 41.2 MB + 1 unknown" — the count always paired with the combined size. */
export function describeItems(ids: Iterable<string>, sizes: SizeMap): string {
  let count = 0;
  let totalBytes = 0;
  let unknownCount = 0;
  for (const id of ids) {
    count += 1;
    const size = sizes[id];
    if (typeof size === 'number') {
      totalBytes += size;
    } else {
      unknownCount += 1;
    }
  }
  const countText = formatCount(count, 'item', 'items');
  if (count > 0 && unknownCount === count) {
    return `${countText} · ${formatBytes(null)}`;
  }
  const unknownText = unknownCount > 0 ? ` + ${formatCount(unknownCount, 'unknown', 'unknown')}` : '';
  return `${countText} · ${formatBytes(totalBytes)}${unknownText}`;
}
