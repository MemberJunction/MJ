/**
 * Pure reorder/resequence helpers for the user app-config dialog.
 *
 * Reordering is POSITIONAL (splice + renumber 0..n-1), never a sequence-value swap:
 * persisted rows can carry duplicate Sequence values (issue #3027 — e.g. a re-enabled
 * app kept a stale value like the dialog's 999 park value), and swapping two equal
 * values marks rows dirty without changing the sort order — the user clicks the
 * arrows, saves, and nothing happens. Positional moves always work, and the renumber
 * heals any duplicates as a side effect.
 *
 * Kept pure (no Angular imports) so vitest covers them without a TestBed.
 */

export interface ReorderableAppItem {
  sequence: number;
  isDirty: boolean;
}

/**
 * Returns a new array with the item at `fromIndex` moved to `toIndex`, renumbered
 * 0..n-1 in the new display order. Out-of-range indexes return the input array
 * unchanged (and un-renumbered) so callers can bind arrow buttons without guards.
 */
export function moveAndResequence<T extends ReorderableAppItem>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 || fromIndex >= items.length ||
    toIndex < 0 || toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const reordered = [...items];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  resequenceItems(reordered);
  return reordered;
}

/**
 * Renumbers items to their display index (0..n-1), marking every corrected item
 * dirty so the next save persists the fix — this is what self-heals duplicate
 * Sequence values already in the database.
 */
export function resequenceItems<T extends ReorderableAppItem>(items: T[]): void {
  items.forEach((item, index) => {
    if (item.sequence !== index) {
      item.sequence = index;
      item.isDirty = true;
    }
  });
}
