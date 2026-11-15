import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import { ServicesProvider } from '@/services';

import { FakePhotoLibrary, photo, video } from '../support/fakePhotoLibrary';

function renderApp(library: FakePhotoLibrary) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={{ photoLibrary: library }}>{children}</ServicesProvider>
  );
  return renderRouter('./src/app', { wrapper, initialUrl: '/' });
}

const tileLabels = () => screen.getAllByTestId('library-tile').map((tile) => tile.props.accessibilityLabel);

function standardLibrary() {
  return new FakePhotoLibrary([
    photo('small', 400_000),
    video('long-video', 25_800_000, 10),
    photo('large', 10_800_000),
    video('icloud-video', null, 95),
  ]);
}

describe('Library screen', () => {
  it('lists photos and videos largest first, with their sizes', async () => {
    await renderApp(standardLibrary());

    expect(await screen.findByText('4 items · 37 MB + 1 unknown')).toBeVisible();
    expect(tileLabels()).toEqual([
      'Video, 25.8 MB, 0:10',
      'Photo, 10.8 MB',
      'Photo, 400 KB',
      'Video, Size unavailable, 1:35',
    ]);
  });

  // Sorting is chosen from the native header menu, which Jest can't drive; the order logic is unit-tested
  // in sortFilter.test.ts and the menu itself is covered by the end-to-end flow.
  it('filters to videos', async () => {
    await renderApp(standardLibrary());
    await screen.findByText('4 items · 37 MB + 1 unknown');

    // The segmented control is native SwiftUI; this is the event it sends when a segment is tapped.
    await fireEvent(screen.getByTestId('library-filter'), 'selectionChange', { nativeEvent: { selection: 'videos' } });

    expect(tileLabels()).toEqual(['Video, 25.8 MB, 0:10', 'Video, Size unavailable, 1:35']);
    expect(screen.getByText('2 items · 25.8 MB + 1 unknown')).toBeVisible();
  });

  it('selects items in a batch and shows their count and combined size', async () => {
    await renderApp(standardLibrary());
    await screen.findByText('4 items · 37 MB + 1 unknown');
    expect(screen.queryByTestId('selection-bar')).toBeNull();

    const [videoTile, largeTile] = screen.getAllByTestId('library-tile');
    await fireEvent.press(within(videoTile).getByRole('checkbox'));
    await fireEvent.press(within(largeTile).getByRole('checkbox'));

    const bar = screen.getByTestId('selection-bar');
    expect(within(bar).getByText('2 items · 36.6 MB')).toBeVisible();
    expect(within(videoTile).getByRole('checkbox')).toBeChecked();

    await fireEvent.press(within(bar).getByRole('button', { name: 'Clear Selection' }));
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  it('opens a preview showing the item and its size when tapped', async () => {
    const result = await renderApp(standardLibrary());
    await screen.findByText('4 items · 37 MB + 1 unknown');

    await fireEvent.press(screen.getAllByTestId('library-tile')[1]);

    expect(result.getPathname()).toBe('/asset/large');
    expect(await screen.findByText('10.8 MB')).toBeVisible();
    expect(screen.getByText(/large\.HEIC/)).toBeVisible();
  });

  it('says so in the preview when the size could not be read', async () => {
    const result = await renderApp(standardLibrary());
    await screen.findByText('4 items · 37 MB + 1 unknown');

    await fireEvent.press(screen.getAllByTestId('library-tile')[3]);

    expect(result.getPathname()).toBe('/asset/icloud-video');
    expect(await screen.findByText('Size unavailable')).toBeVisible();
  });

  it('asks for access before showing anything, and loads once allowed', async () => {
    const library = standardLibrary();
    library.permission = 'undetermined';
    await renderApp(library);

    await fireEvent.press(await screen.findByRole('button', { name: 'Allow Access' }));

    expect(await screen.findByText('4 items · 37 MB + 1 unknown')).toBeVisible();
  });

  it('explains how to turn access back on when it was denied', async () => {
    const library = standardLibrary();
    library.permission = 'denied';
    await renderApp(library);

    expect(await screen.findByRole('button', { name: 'Open Settings' })).toBeVisible();
    expect(screen.queryAllByTestId('library-tile')).toHaveLength(0);
  });

  it('says when it can only see some photos, with a way to change that', async () => {
    const library = standardLibrary();
    library.permission = 'limited';
    library.limitedSelection = ['small', 'large'];
    await renderApp(library);

    expect(await screen.findByText('2 items · 11.2 MB')).toBeVisible();
    expect(screen.getByText(/only the photos you chose/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Manage' })).toBeVisible();
  });

  it('shows a composed empty state when the library has nothing in it', async () => {
    await renderApp(new FakePhotoLibrary([]));

    expect(await screen.findByText('No Photos or Videos')).toBeVisible();
  });
});
