import { fireEvent, screen, within } from 'expo-router/testing-library';

import { FakePhotoLibrary, photo, video } from '../support/fakePhotoLibrary';
import { pressSelectionBarButton, renderApp, selectTiles } from '../support/renderApp';

async function openDeleteReviewForTwoItems() {
  const library = new FakePhotoLibrary([
    photo('small', 400_000),
    video('long-video', 25_800_000, 10),
    photo('large', 10_800_000),
  ]);
  const app = await renderApp({ photoLibrary: library });
  await screen.findByText('3 items · 37 MB');

  // Largest first: the video, then the large photo.
  await selectTiles([0, 1]);
  await pressSelectionBarButton('Delete');

  return { app, library };
}

describe('Deleting from Photos', () => {
  it('reviews the selection and warns about Recently Deleted and other iCloud devices before deleting', async () => {
    const { app } = await openDeleteReviewForTwoItems();

    expect(app.getPathname()).toBe('/delete');
    expect(await screen.findByText('Delete 2 Items?')).toBeVisible();
    expect(screen.getByText('2 items · 36.6 MB')).toBeVisible();
    expect(screen.getByText(/Recently Deleted/)).toBeVisible();
    expect(screen.getByText(/other devices/)).toBeVisible();
    expect(screen.getByText(/iOS will ask you to confirm/)).toBeVisible();
  });

  it('deletes the items once confirmed and returns to the library', async () => {
    const { app, library } = await openDeleteReviewForTwoItems();

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete from Photos' }));

    expect(library.ids()).toEqual(['small']);
    expect(app.getPathname()).toBe('/');
    expect(await screen.findByText('Moved 2 items to Recently Deleted.')).toBeVisible();
    expect(screen.getAllByTestId('library-tile')).toHaveLength(1);
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  it('keeps everything when the user declines iOS’s confirmation', async () => {
    const { app, library } = await openDeleteReviewForTwoItems();
    library.deleteConfirmation = 'dontAllow';

    await fireEvent.press(await screen.findByRole('button', { name: 'Delete from Photos' }));

    expect(library.ids()).toEqual(['small', 'long-video', 'large']);
    expect(app.getPathname()).toBe('/delete');
    expect(screen.queryByText(/Moved .* to Recently Deleted/)).toBeNull();
  });

  it('can be cancelled without changing the selection', async () => {
    const { app } = await openDeleteReviewForTwoItems();

    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(app.getPathname()).toBe('/');
    expect(within(screen.getByTestId('selection-bar')).getByText('2 items · 36.6 MB')).toBeVisible();
  });
});
