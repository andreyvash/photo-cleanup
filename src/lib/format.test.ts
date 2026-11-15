import { formatBytes, formatCount, formatDuration } from './format';

describe('formatDuration', () => {
  it('reads like the Photos app: m:ss, or h:mm:ss for long videos', () => {
    expect(formatDuration(10)).toBe('0:10');
    expect(formatDuration(95.4)).toBe('1:35');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});

describe('formatBytes', () => {
  it('uses decimal units like iOS Settings, with one trimmed decimal', () => {
    expect(formatBytes(428_842)).toBe('429 KB');
    expect(formatBytes(2_657_721)).toBe('2.7 MB');
    expect(formatBytes(10_754_436)).toBe('10.8 MB');
    expect(formatBytes(5_000_000)).toBe('5 MB');
    expect(formatBytes(24_900_000_000)).toBe('24.9 GB');
    expect(formatBytes(1_000_000_000_000)).toBe('1 TB');
  });

  it('never shows a tiny file as zero', () => {
    expect(formatBytes(120)).toBe('1 KB');
    expect(formatBytes(0)).toBe('0 KB');
  });

  it('says so when the size is unknown', () => {
    expect(formatBytes(null)).toBe('Size unavailable');
  });
});

describe('formatCount', () => {
  it('pluralizes and groups thousands', () => {
    expect(formatCount(1, 'item', 'items')).toBe('1 item');
    expect(formatCount(0, 'item', 'items')).toBe('0 items');
    expect(formatCount(2887, 'photo', 'photos')).toBe('2,887 photos');
  });
});
