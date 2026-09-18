/**
 * A three-finish shortlist, kept per viewer in this browser only. Nothing is uploaded
 * and nothing is read back by the site — the same privacy rule the photo path follows.
 */

export const SHORTLIST_LIMIT = 3;
export const SHORTLIST_KEY = 'ffe.visualizer.shortlist.v1';

/** Storage can be absent, blocked, or full; every path here has to survive that. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readShortlist(isKnownId: (id: string) => boolean): string[] {
  try {
    const raw = storage()?.getItem(SHORTLIST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string' || ids.includes(entry) || !isKnownId(entry)) continue;
      ids.push(entry);
      if (ids.length === SHORTLIST_LIMIT) break;
    }
    return ids;
  } catch {
    return [];
  }
}

export function writeShortlist(ids: readonly string[]): void {
  try {
    storage()?.setItem(SHORTLIST_KEY, JSON.stringify(ids.slice(0, SHORTLIST_LIMIT)));
  } catch {
    // A viewer with storage blocked keeps the shortlist for this visit only.
  }
}

export function toggleShortlist(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((entry) => entry !== id);
  if (ids.length >= SHORTLIST_LIMIT) return [...ids];
  return [...ids, id];
}
