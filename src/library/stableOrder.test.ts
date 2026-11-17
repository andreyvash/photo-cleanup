import { stableOrder } from './stableOrder';

const order = (previous: string[], sorted: string[]) =>
  stableOrder(
    previous.map((id) => ({ id })),
    sorted.map((id) => ({ id })),
  ).map((item) => item.id);

describe('stableOrder', () => {
  it('keeps tiles where they are while sizes arrive, adding new ones at the end', () => {
    // "c" was just measured as the largest, and "d" just appeared.
    expect(order(['a', 'b', 'c'], ['c', 'a', 'd', 'b'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops items that are gone', () => {
    expect(order(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c']);
  });

  it('returns the current version of each item', () => {
    const updated = { id: 'a', filename: 'new' };
    expect(stableOrder([{ id: 'a', filename: 'old' }], [updated])[0]).toBe(updated);
  });
});
