import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import { DriveError } from '@/drive/errors';
import { ServicesProvider } from '@/services';

import { FakeDriveClient, FakeExporter, FakeGoogleAuth } from '../support/fakeGoogle';
import { FakePhotoLibrary, photo, video } from '../support/fakePhotoLibrary';

type Setup = { signedInAs?: string | null; folders?: { id: string; name: string }[] };

async function openSendFor(ids: string[], { signedInAs = 'me@example.com', folders = [] }: Setup = {}) {
  const library = new FakePhotoLibrary([photo('beach', 3_000_000), video('party', 40_000_000), photo('cat', 1_000_000)]);
  const googleAuth = new FakeGoogleAuth(signedInAs);
  const drive = new FakeDriveClient(folders.map((f) => ({ ...f, createdTime: '2026-11-01T00:00:00Z' })));
  const exporter = new FakeExporter();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={{ photoLibrary: library, googleAuth, drive, exporter }}>{children}</ServicesProvider>
  );
  const app = await renderRouter('./src/app', { wrapper, initialUrl: '/' });
  await screen.findByText('3 items · 44 MB');

  const tiles = screen.getAllByTestId('library-tile');
  // Library is sorted largest first: party (40 MB), beach (3 MB), cat (1 MB).
  const order = ['party', 'beach', 'cat'];
  for (const id of ids) {
    await fireEvent.press(within(tiles[order.indexOf(id)]).getByRole('checkbox'));
  }
  await fireEvent.press(within(screen.getByTestId('selection-bar')).getByRole('button', { name: 'Send to Drive' }));
  return { app, library, googleAuth, drive, exporter };
}

describe('Sending to Google Drive', () => {
  it('asks the user to sign in first, then lists the folders the app created', async () => {
    const { app } = await openSendFor(['party'], { signedInAs: null, folders: [{ id: 'f1', name: 'Trip 2026' }] });

    expect(app.getPathname()).toBe('/send');
    expect(await screen.findByText(/can only see folders it creates/i)).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(await screen.findByRole('button', { name: 'Trip 2026' })).toBeVisible();
    expect(screen.getByText(/me@example\.com/)).toBeVisible();
  });

  it('stays signed out when the user cancels Google’s sign-in, and explains errors', async () => {
    const { googleAuth } = await openSendFor(['party'], { signedInAs: null });

    googleAuth.nextSignIn = 'cancel';
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in with Google' }));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();

    googleAuth.nextSignIn = new Error('Google sign-in isn’t set up yet.');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText('Google sign-in isn’t set up yet.')).toBeVisible();
  });

  it('copies the selected items to the chosen folder, shows each one as sent, and leaves the originals in Photos', async () => {
    const { app, drive, library } = await openSendFor(['party', 'beach'], {
      folders: [{ id: 'f1', name: 'Trip 2026' }],
    });

    expect(await screen.findByText('2 items · 43 MB')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send 2 Items' })).toBeDisabled();

    await fireEvent.press(await screen.findByRole('button', { name: 'Trip 2026' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send 2 Items' }));

    expect(app.getPathname()).toBe('/send/progress');
    await waitFor(() => expect(screen.getAllByText('Sent')).toHaveLength(2));
    expect(screen.getByText('2 of 2 sent')).toBeVisible();
    expect(drive.namesIn('f1').sort()).toEqual(['beach.HEIC', 'party.HEIC']);
    expect(library.ids()).toEqual(['beach', 'party', 'cat']);

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(app.getPathname()).toBe('/');
    expect(within(screen.getByTestId('selection-bar')).getByText('2 items · 43 MB')).toBeVisible();
  });

  it('shows which items failed and why, and retries just those', async () => {
    const { drive } = await openSendFor(['party', 'beach', 'cat'], { folders: [{ id: 'f1', name: 'Trip 2026' }] });
    drive.failures.set('beach.HEIC', new DriveError('unavailable'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Trip 2026' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send 3 Items' }));

    expect(await screen.findByText("Google Drive didn't respond. Try again.")).toBeVisible();
    expect(screen.getByText('2 of 3 sent')).toBeVisible();

    drive.failures.clear();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry 1 Failed' }));

    await waitFor(() => expect(screen.getByText('3 of 3 sent')).toBeVisible());
    expect(drive.namesIn('f1').sort()).toEqual(['beach.HEIC', 'cat.HEIC', 'party.HEIC']);
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('only keeps the items that made it to Drive selected afterwards, so a failed item is never deleted by mistake', async () => {
    const { app, drive } = await openSendFor(['party', 'beach'], { folders: [{ id: 'f1', name: 'Trip 2026' }] });
    drive.failures.set('party.HEIC', new DriveError('quota'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Trip 2026' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send 2 Items' }));
    await screen.findAllByText('Your Google Drive is full.');

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(app.getPathname()).toBe('/');
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  it('narrows the selection to what reached Drive even when the sheet is swiped away instead of tapping Done', async () => {
    const { app, drive } = await openSendFor(['party', 'beach'], { folders: [{ id: 'f1', name: 'Trip 2026' }] });
    drive.failures.set('party.HEIC', new DriveError('rejected'));

    await fireEvent.press(await screen.findByRole('button', { name: 'Trip 2026' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Send 2 Items' }));
    await screen.findByRole('button', { name: 'Done' });

    // A swipe-down dismisses the modal without pressing Done.
    await act(() => router.back());

    expect(app.getPathname()).toBe('/');
    expect(within(screen.getByTestId('selection-bar')).getByText('1 item · 3 MB')).toBeVisible();
  });

  it('creates a new folder and selects it', async () => {
    const { app, drive } = await openSendFor(['cat']);

    expect(await screen.findByText(/No folders yet/)).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'New Folder…' }));
    expect(app.getPathname()).toBe('/send/new-folder');

    await fireEvent.changeText(screen.getByPlaceholderText('Folder name'), 'Phone Backup');
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));

    expect(app.getPathname()).toBe('/send');
    expect(drive.folders.map((f) => f.name)).toEqual(['Phone Backup']);
    expect(await screen.findByRole('button', { name: 'Phone Backup' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Send 1 Item' })).toBeEnabled();
  });
});
