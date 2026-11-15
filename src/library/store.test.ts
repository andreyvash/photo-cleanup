import { FakePhotoLibrary, photo, video } from '../../test/support/fakePhotoLibrary';

import { describeItems } from './selection';
import { createLibraryStore } from './store';

const until = async (check: () => boolean) => {
  for (let i = 0; i < 50 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(check()).toBe(true);
};

function setup(library: FakePhotoLibrary, sizeBatchSize = 500) {
  const store = createLibraryStore(library, { sizeBatchSize });
  return { store, state: () => store.getState() };
}

describe('library store', () => {
  it('lists every item and measures all sizes in batches, reporting progress', async () => {
    const library = new FakePhotoLibrary([
      photo('p1', 1_000_000),
      photo('p2', 2_000_000),
      video('v1', 50_000_000),
      photo('p3', 3_000_000),
      video('v2', 9_000_000),
    ]);
    const { store, state } = setup(library, 2);
    const progress: string[] = [];
    store.subscribe((s) => {
      const label = s.sizing ? `${s.sizing.done}/${s.sizing.total}` : 'done';
      if (progress[progress.length - 1] !== label) progress.push(label);
    });

    await state().start();

    expect(state().permission).toBe('granted');
    expect(state().items.map((i) => i.id).sort()).toEqual(['p1', 'p2', 'p3', 'v1', 'v2']);
    expect(describeItems(['p1', 'p2', 'p3', 'v1', 'v2'], state().sizes)).toBe('5 items · 65 MB');
    expect(progress).toEqual(['0/5', '2/5', '4/5', 'done']);
  });

  it('keeps items it could not measure, marked as unknown', async () => {
    const { state } = setup(new FakePhotoLibrary([photo('ok', 2_000_000), video('icloud', null)]));

    await state().start();

    expect(state().items).toHaveLength(2);
    expect(describeItems(['ok', 'icloud'], state().sizes)).toBe('2 items · 2 MB + 1 unknown');
  });

  it('shows nothing until access is granted, then loads after the user allows it', async () => {
    const library = new FakePhotoLibrary([photo('p1', 1_000_000)], 'undetermined');
    const { state } = setup(library);

    await state().start();
    expect(state().permission).toBe('undetermined');
    expect(state().items).toEqual([]);

    await state().requestAccess();
    expect(state().permission).toBe('granted');
    expect(state().items.map((i) => i.id)).toEqual(['p1']);
  });

  it('stays empty when access is denied', async () => {
    const library = new FakePhotoLibrary([photo('p1', 1_000_000)], 'undetermined');
    library.permissionAfterRequest = 'denied';
    const { state } = setup(library);

    await state().start();
    await state().requestAccess();

    expect(state().permission).toBe('denied');
    expect(state().items).toEqual([]);
  });

  it('shows only the photos the user shared when access is limited', async () => {
    const library = new FakePhotoLibrary([photo('shared', 1_000_000), photo('private', 2_000_000)], 'limited');
    library.limitedSelection = ['shared'];
    const { state } = setup(library);

    await state().start();

    expect(state().permission).toBe('limited');
    expect(state().items.map((i) => i.id)).toEqual(['shared']);
  });

  it('keeps the selection across filter changes', async () => {
    const { state } = setup(new FakePhotoLibrary([photo('p1', 1_000_000), video('v1', 4_000_000)]));
    await state().start();

    state().toggleSelection('p1');
    state().toggleSelection('v1');
    state().setFilter('photos');
    state().toggleSelection('v1');
    state().toggleSelection('v1');

    expect(describeItems(state().selectedIds, state().sizes)).toBe('2 items · 5 MB');

    state().toggleSelection('p1');
    expect(state().selectedIds).toEqual(['v1']);

    state().clearSelection();
    expect(state().selectedIds).toEqual([]);
  });

  it('follows changes made in the Photos app: removed items leave the list and the selection, new ones get measured', async () => {
    const library = new FakePhotoLibrary([photo('p1', 1_000_000), photo('p2', 2_000_000)]);
    const { state } = setup(library);
    await state().start();
    state().toggleSelection('p1');
    state().toggleSelection('p2');

    library.externallyRemove('p1');
    library.externallyAdd(video('new', 7_000_000));

    await until(() => state().items.some((i) => i.id === 'new') && state().sizes.new !== undefined);
    expect(state().items.map((i) => i.id).sort()).toEqual(['new', 'p2']);
    expect(state().selectedIds).toEqual(['p2']);
    expect(describeItems(['new'], state().sizes)).toBe('1 item · 7 MB');
  });

  it('deletes the selected items from Photos and says where they went', async () => {
    const library = new FakePhotoLibrary([photo('p1', 1_000_000), photo('p2', 2_000_000), video('v1', 3_000_000)]);
    const { state } = setup(library);
    await state().start();
    state().toggleSelection('p1');
    state().toggleSelection('v1');

    const outcome = await state().deleteSelected();

    expect(outcome).toBe('deleted');
    expect(library.ids()).toEqual(['p2']);
    expect(state().items.map((i) => i.id)).toEqual(['p2']);
    expect(state().selectedIds).toEqual([]);
    expect(state().notice).toBe('Moved 2 items to Recently Deleted.');
  });

  it('changes nothing when the user declines iOS’s delete confirmation', async () => {
    const library = new FakePhotoLibrary([photo('p1', 1_000_000), photo('p2', 2_000_000)]);
    library.deleteConfirmation = 'dontAllow';
    const { state } = setup(library);
    await state().start();
    state().toggleSelection('p1');

    const outcome = await state().deleteSelected();

    expect(outcome).toBe('cancelled');
    expect(library.ids()).toEqual(['p1', 'p2']);
    expect(state().items).toHaveLength(2);
    expect(state().selectedIds).toEqual(['p1']);
    expect(state().notice).toBeNull();
  });

  it('can narrow the selection to the items that were sent to Drive', async () => {
    const { state } = setup(new FakePhotoLibrary([photo('p1', 1), photo('p2', 2), photo('p3', 3)]));
    await state().start();
    ['p1', 'p2', 'p3'].forEach((id) => state().toggleSelection(id));

    state().keepSelected(['p1', 'p3', 'gone']);

    expect(state().selectedIds).toEqual(['p1', 'p3']);
  });
});
