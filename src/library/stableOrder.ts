/**
 * While sizes are still being measured, "largest first" would keep reshuffling the grid under the user's finger.
 * Keeps the previous order for items that are still there (using their current objects), and appends new ones in
 * sorted order.
 */
export function stableOrder<T extends { id: string }>(previous: T[], sorted: T[]): T[] {
  const current = new Map(sorted.map((item) => [item.id, item]));
  const kept = previous.flatMap((item) => current.get(item.id) ?? []);
  const keptIds = new Set(kept.map((item) => item.id));
  return [...kept, ...sorted.filter((item) => !keptIds.has(item.id))];
}
