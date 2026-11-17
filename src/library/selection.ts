import { formatBytes, formatCount } from '@/lib/format';

import type { SizeMap } from './types';

export type SizeTotal = { count: number; bytes: number; unknownCount: number };

/** Adds up sizes, counting the ones that aren't known separately. */
export function totalSize(sizes: Iterable<number | null | undefined>): SizeTotal {
  const total: SizeTotal = { count: 0, bytes: 0, unknownCount: 0 };
  for (const size of sizes) {
    total.count += 1;
    if (typeof size === 'number') {
      total.bytes += size;
    } else {
      total.unknownCount += 1;
    }
  }
  return total;
}

/** "41.2 MB + 1 unknown", or "Size unavailable" when no size is known. */
export function formatTotal({ count, bytes, unknownCount }: SizeTotal): string {
  if (count > 0 && unknownCount === count) {
    return formatBytes(null);
  }
  const unknownText = unknownCount > 0 ? ` + ${formatCount(unknownCount, 'unknown', 'unknown')}` : '';
  return `${formatBytes(bytes)}${unknownText}`;
}

/** "3 items · 41.2 MB + 1 unknown" — the count always paired with the combined size. */
export function describeItems(ids: Iterable<string>, sizes: SizeMap): string {
  const total = totalSize(Array.from(ids, (id) => sizes[id]));
  return `${formatCount(total.count, 'item', 'items')} · ${formatTotal(total)}`;
}
