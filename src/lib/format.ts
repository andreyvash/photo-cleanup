const STEPS = [
  { unit: 'TB', size: 1e12, digits: 1 },
  { unit: 'GB', size: 1e9, digits: 1 },
  { unit: 'MB', size: 1e6, digits: 1 },
  { unit: 'KB', size: 1e3, digits: 0 },
] as const;

const numberFormats = {
  0: new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }),
};

/** Decimal units, as iOS Settings shows storage: 2.7 MB, 24.9 GB. */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) {
    return 'Size unavailable';
  }
  for (const { unit, size, digits } of STEPS) {
    const factor = 10 ** digits;
    const value = Math.round((bytes / size) * factor) / factor;
    if (value >= 1) {
      return `${numberFormats[digits].format(value)} ${unit}`;
    }
  }
  return bytes === 0 ? '0 KB' : '1 KB';
}

export function formatNumber(value: number): string {
  return numberFormats[0].format(value);
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}
