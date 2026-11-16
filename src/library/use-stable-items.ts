import { useMemo, useState } from 'react';

import { stableOrder } from './stableOrder';
import type { LibraryItem } from './types';

/**
 * `sorted`, but held steady while `frozen`; `resetKey` changes (the user picking a filter or sort) re-sort at once.
 */
export function useStableItems(sorted: LibraryItem[], frozen: boolean, resetKey: string): LibraryItem[] {
  const [previous, setPrevious] = useState({ sorted, frozen, resetKey, ids: sorted.map((item) => item.id) });

  let ids = previous.ids;
  if (previous.sorted !== sorted || previous.frozen !== frozen || previous.resetKey !== resetKey) {
    const keep = frozen && previous.resetKey === resetKey;
    ids = stableOrder(
      keep ? previous.ids : [],
      sorted.map((item) => item.id),
      keep,
    );
    setPrevious({ sorted, frozen, resetKey, ids });
  }

  return useMemo(() => {
    const byId = new Map(sorted.map((item) => [item.id, item]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }, [ids, sorted]);
}
