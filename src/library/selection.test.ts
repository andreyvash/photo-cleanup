import { describeItems } from './selection';

const sizes: Record<string, number | null> = {
  a: 30_000_000,
  b: 11_200_000,
  c: null,
};

describe('describeItems', () => {
  it('pairs the count with the combined size', () => {
    expect(describeItems(['a', 'b'], sizes)).toBe('2 items · 41.2 MB');
    expect(describeItems(['a'], sizes)).toBe('1 item · 30 MB');
  });

  it('adds what it could not measure instead of hiding it', () => {
    expect(describeItems(['a', 'b', 'c'], sizes)).toBe('3 items · 41.2 MB + 1 unknown');
  });

  it('treats sizes that are still being calculated as unknown', () => {
    expect(describeItems(['a', 'not-measured-yet'], sizes)).toBe('2 items · 30 MB + 1 unknown');
  });

  it('says the size is unavailable when nothing could be measured', () => {
    expect(describeItems(['c'], sizes)).toBe('1 item · Size unavailable');
  });
});
