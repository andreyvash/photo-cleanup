import { useState } from 'react';

import { visibleItems } from './sortFilter';
import { stableOrder } from './stableOrder';
import type { LibraryFilter, LibraryItem, LibrarySort, SizeMap } from './types';

const NO_SIZES: SizeMap = {};

type Inputs = { items: LibraryItem[]; sortSizes: SizeMap | null; resetKey: string; frozen: boolean };

/**
 * The library grid's items: `visibleItems`, held in place while sizes are still being measured in "largest first", so a
 * tap never lands on a tile that just moved (new items are added at the end, removed ones dropped). The grid re-sorts
 * once measuring finishes, and at once when the user changes the filter or sort. Nothing is re-sorted when only
 * sizes change and they can't change the order: in "newest first", or while the grid is held in place.
 */
export function useGridItems(
  items: LibraryItem[],
  sizes: SizeMap,
  { filter, sort }: { filter: LibraryFilter; sort: LibrarySort },
  measuring: boolean,
): LibraryItem[] {
  const inputs: Inputs = {
    items,
    sortSizes: sort === 'largest' ? sizes : null,
    resetKey: `${filter}:${sort}`,
    frozen: measuring && sort === 'largest',
  };
  const [previous, setPrevious] = useState<{ inputs: Inputs; result: LibraryItem[] } | null>(null);

  const reset = previous === null || previous.inputs.resetKey !== inputs.resetKey;
  if (
    !reset &&
    previous.inputs.items === inputs.items &&
    previous.inputs.frozen === inputs.frozen &&
    (inputs.frozen || previous.inputs.sortSizes === inputs.sortSizes)
  ) {
    return previous.result;
  }

  const sorted = visibleItems(items, inputs.sortSizes ?? NO_SIZES, { filter, sort });
  const result = inputs.frozen && !reset ? stableOrder(previous.result, sorted) : sorted;
  setPrevious({ inputs, result });
  return result;
}
