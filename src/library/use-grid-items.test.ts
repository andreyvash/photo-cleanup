import { renderHook } from '@testing-library/react-native';

import type { LibraryItem, LibrarySort, SizeMap } from './types';
import { useGridItems } from './use-grid-items';

type Props = { items: LibraryItem[]; sizes: SizeMap; sort: LibrarySort; measuring: boolean };

function render(initial: Props) {
  return renderHook(
    ({ items, sizes, sort, measuring }: Props) => useGridItems(items, sizes, { filter: 'all', sort }, measuring),
    { initialProps: initial },
  );
}

const ids = (items: LibraryItem[]) => items.map((item) => item.id);

const photo = (id: string, creationTime: number): LibraryItem => ({
  id,
  mediaType: 'photo',
  filename: `${id}.HEIC`,
  creationTime,
  duration: null,
  width: null,
  height: null,
});

// Newest first: a, b, c.
const items = [photo('a', 3), photo('b', 2), photo('c', 1)];

describe('useGridItems', () => {
  it('sorts largest first once sizes are known', async () => {
    const { result } = await render({ items, sizes: { a: 1, b: 3, c: 2 }, sort: 'largest', measuring: false });
    expect(ids(result.current)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the same list while sizes arrive in largest first, then re-sorts once measuring finishes', async () => {
    const { result, rerender } = await render({ items, sizes: {}, sort: 'largest', measuring: true });
    const first = result.current;

    await rerender({ items, sizes: { a: 1, b: 3 }, sort: 'largest', measuring: true });
    expect(result.current).toBe(first);

    await rerender({ items, sizes: { a: 1, b: 3, c: 2 }, sort: 'largest', measuring: false });
    expect(ids(result.current)).toEqual(['b', 'c', 'a']);
  });

  it('adds new items at the end and drops removed ones while measuring', async () => {
    const { result, rerender } = await render({ items, sizes: {}, sort: 'largest', measuring: true });
    const added = photo('d', 4);

    await rerender({ items: [added, items[0], items[2]], sizes: { c: 9 }, sort: 'largest', measuring: true });

    expect(ids(result.current)).toEqual(['a', 'c', 'd']);
  });

  it('doesn’t re-sort newest first when only sizes change', async () => {
    const { result, rerender } = await render({ items, sizes: {}, sort: 'newest', measuring: true });
    const first = result.current;

    await rerender({ items, sizes: { a: 1, b: 3, c: 2 }, sort: 'newest', measuring: false });

    expect(result.current).toBe(first);
    expect(ids(first)).toEqual(['a', 'b', 'c']);
  });

  it('re-sorts at once when the user changes the sort, even while measuring', async () => {
    const { result, rerender } = await render({ items, sizes: { a: 1, b: 3 }, sort: 'newest', measuring: true });

    await rerender({ items, sizes: { a: 1, b: 3 }, sort: 'largest', measuring: true });

    expect(ids(result.current)).toEqual(['b', 'a', 'c']);
  });
});
