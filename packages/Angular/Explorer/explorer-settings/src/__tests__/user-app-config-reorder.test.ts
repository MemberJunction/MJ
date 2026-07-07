/**
 * Covers the app-config dialog's positional reorder/resequence helpers.
 *
 * Regression for issue #3027: rows can carry DUPLICATE Sequence values (e.g. a
 * re-enabled app kept a stale value), and the old value-swap MoveUp/MoveDown swapped
 * two equal numbers — rows went dirty, Save enabled, and the order silently never
 * changed. Positional moves must reorder regardless of the stored values and heal
 * duplicates by renumbering 0..n-1.
 */
import { describe, it, expect } from 'vitest';
import { moveAndResequence, resequenceItems, ReorderableAppItem } from '../lib/user-app-config/user-app-config-reorder';

interface TestItem extends ReorderableAppItem {
  name: string;
}

function item(name: string, sequence: number): TestItem {
  return { name, sequence, isDirty: false };
}

const names = (items: TestItem[]) => items.map(i => i.name).join(',');
const seqs = (items: TestItem[]) => items.map(i => i.sequence).join(',');

describe('moveAndResequence', () => {
  it('reorders and renumbers with clean sequential values', () => {
    const result = moveAndResequence([item('a', 0), item('b', 1), item('c', 2)], 2, 1);
    expect(names(result)).toBe('a,c,b');
    expect(seqs(result)).toBe('0,1,2');
  });

  it('reorders even when the two neighbors hold DUPLICATE sequence values (the #3027 no-op case)', () => {
    // Old value-swap behavior: swapping 6 and 6 changed nothing — order stuck forever.
    const result = moveAndResequence([item('a', 0), item('bulk', 6), item('testing', 6)], 2, 1);
    expect(names(result)).toBe('a,testing,bulk');
    expect(seqs(result)).toBe('0,1,2'); // duplicates healed
    expect(result.every(i => i.sequence !== 6 || i.isDirty)).toBe(true);
  });

  it('reorders across a stale 999 park value and heals it', () => {
    const result = moveAndResequence([item('a', 0), item('b', 1), item('reenabled', 999)], 2, 0);
    expect(names(result)).toBe('reenabled,a,b');
    expect(seqs(result)).toBe('0,1,2');
  });

  it('marks exactly the renumbered items dirty', () => {
    const result = moveAndResequence([item('a', 0), item('b', 1), item('c', 2)], 2, 1);
    expect(result.map(i => i.isDirty)).toEqual([false, true, true]); // a keeps 0, c→1 and b→2 changed
  });

  it('returns the input unchanged for out-of-range or no-op moves', () => {
    const input = [item('a', 5), item('b', 5)];
    expect(moveAndResequence(input, -1, 0)).toBe(input);
    expect(moveAndResequence(input, 0, 2)).toBe(input);
    expect(moveAndResequence(input, 1, 1)).toBe(input);
    expect(seqs(input)).toBe('5,5'); // untouched — no surprise renumbering on a no-op
  });

  it('does not mutate the input array order (returns a new array)', () => {
    const input = [item('a', 0), item('b', 1)];
    const result = moveAndResequence(input, 1, 0);
    expect(names(input)).toBe('a,b');
    expect(result).not.toBe(input);
  });
});

describe('resequenceItems', () => {
  it('renumbers duplicates in display order and dirties only corrected items', () => {
    const items = [item('a', 0), item('b', 6), item('c', 6), item('d', 999)];
    resequenceItems(items);
    expect(seqs(items)).toBe('0,1,2,3');
    expect(items.map(i => i.isDirty)).toEqual([false, true, true, true]);
  });

  it('is a no-op on an already-sequential list', () => {
    const items = [item('a', 0), item('b', 1)];
    resequenceItems(items);
    expect(items.every(i => !i.isDirty)).toBe(true);
  });
});
