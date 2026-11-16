/**
 * While sizes are still being measured, "largest first" would keep reshuffling the grid under the user's finger.
 * Frozen: keep the previous order for items that are still there, and append new ones in sorted order.
 */
export function stableOrder(previousIds: string[], sortedIds: string[], frozen: boolean): string[] {
  if (!frozen) return sortedIds;
  const present = new Set(sortedIds);
  const kept = previousIds.filter((id) => present.has(id));
  const known = new Set(kept);
  return [...kept, ...sortedIds.filter((id) => !known.has(id))];
}
