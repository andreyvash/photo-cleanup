import type { LibraryItem } from './types';
import { visibleItems } from './sortFilter';

const item = (id: string, mediaType: 'photo' | 'video', creationTime: number | null): LibraryItem => ({
  id,
  mediaType,
  filename: `${id}.file`,
  creationTime,
  duration: mediaType === 'video' ? 12 : null,
  width: 100,
  height: 100,
});

const items = [
  item('old-photo', 'photo', 1_000),
  item('new-photo', 'photo', 5_000),
  item('video', 'video', 3_000),
  item('mystery', 'photo', 4_000),
  item('pending', 'video', 2_000),
];

// `mystery` could not be measured (null); `pending` has not been measured yet (absent).
const sizes: Record<string, number | null> = {
  'old-photo': 2_000_000,
  'new-photo': 2_000_000,
  video: 50_000_000,
  mystery: null,
};

const ids = (list: LibraryItem[]) => list.map((i) => i.id);

describe('visibleItems', () => {
  it('sorts largest first, breaking ties by newest, with unknown sizes last', () => {
    const result = visibleItems(items, sizes, { filter: 'all', sort: 'largest' });
    expect(ids(result)).toEqual(['video', 'new-photo', 'old-photo', 'mystery', 'pending']);
  });

  it('sorts newest first, with undated items last', () => {
    const undated = item('undated', 'photo', null);
    const result = visibleItems([...items, undated], sizes, { filter: 'all', sort: 'newest' });
    expect(ids(result)).toEqual(['new-photo', 'mystery', 'video', 'pending', 'old-photo', 'undated']);
  });

  it('shows only photos or only videos when filtered', () => {
    expect(ids(visibleItems(items, sizes, { filter: 'photos', sort: 'largest' }))).toEqual([
      'new-photo',
      'old-photo',
      'mystery',
    ]);
    expect(ids(visibleItems(items, sizes, { filter: 'videos', sort: 'largest' }))).toEqual(['video', 'pending']);
  });
});
