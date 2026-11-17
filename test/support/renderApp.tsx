import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import { ServicesProvider, type Services } from '@/services';

import { InstantExporter } from './fakeExporter';

/** The whole app from the Library screen, with these fakes (and an InstantExporter unless one is given). */
export function renderApp(services: Partial<Services>) {
  const all = { exporter: new InstantExporter(), ...services };
  const wrapper = ({ children }: { children: ReactNode }) => <ServicesProvider services={all}>{children}</ServicesProvider>;
  return renderRouter('./src/app', { wrapper, initialUrl: '/' });
}

/** Ticks the checkbox of the library tiles at these grid positions. */
export async function selectTiles(positions: number[]) {
  const tiles = screen.getAllByTestId('library-tile');
  for (const position of positions) {
    await fireEvent.press(within(tiles[position]).getByRole('checkbox'));
  }
}

export async function pressSelectionBarButton(name: string) {
  await fireEvent.press(within(screen.getByTestId('selection-bar')).getByRole('button', { name }));
}
