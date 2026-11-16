import { stableOrder } from './stableOrder';

describe('stableOrder', () => {
  it('uses the sorted order when nothing is being measured', () => {
    expect(stableOrder(['a', 'b', 'c'], ['c', 'a', 'b'], false)).toEqual(['c', 'a', 'b']);
  });

  it('keeps tiles where they are while sizes arrive, adding new ones at the end', () => {
    // "c" was just measured as the largest, and "d" just appeared.
    expect(stableOrder(['a', 'b', 'c'], ['c', 'a', 'd', 'b'], true)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops items that are gone, even while measuring', () => {
    expect(stableOrder(['a', 'b', 'c'], ['c', 'a'], true)).toEqual(['a', 'c']);
  });
});
