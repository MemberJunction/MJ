/**
 * Tests for the pure FK-autocomplete helpers used by MjFormFieldComponent:
 * cell formatting and the in-memory cached-entity filter / focus-show.
 */
import { describe, it, expect } from 'vitest';
import { FormatFKCell, FilterCachedFKRows } from '../field/fk-search-utils';

describe('FormatFKCell', () => {
  it('returns empty string for null and undefined', () => {
    expect(FormatFKCell(null)).toBe('');
    expect(FormatFKCell(undefined)).toBe('');
  });

  it('formats booleans as Yes/No', () => {
    expect(FormatFKCell(true)).toBe('Yes');
    expect(FormatFKCell(false)).toBe('No');
  });

  it('formats Date as a locale date string', () => {
    const d = new Date('2024-01-15T00:00:00Z');
    expect(FormatFKCell(d)).toBe(d.toLocaleDateString());
  });

  it('stringifies numbers and strings', () => {
    expect(FormatFKCell(42)).toBe('42');
    expect(FormatFKCell('Acme')).toBe('Acme');
    expect(FormatFKCell(0)).toBe('0');
  });
});

interface Row { name: string }
const rows: Row[] = [
  { name: 'Charlie' },
  { name: 'alpha' },
  { name: 'Bravo' },
  { name: 'Alphabet Soup' },
];
const getName = (r: Row) => r.name;

describe('FilterCachedFKRows — empty query (focus-show)', () => {
  it('returns rows sorted ascending by formatted name', () => {
    const result = FilterCachedFKRows(rows, '', 50, getName);
    expect(result.map(getName)).toEqual(['alpha', 'Alphabet Soup', 'Bravo', 'Charlie']);
  });

  it('respects the limit', () => {
    const result = FilterCachedFKRows(rows, '', 2, getName);
    expect(result).toHaveLength(2);
    expect(result.map(getName)).toEqual(['alpha', 'Alphabet Soup']);
  });

  it('treats whitespace-only query as empty', () => {
    const result = FilterCachedFKRows(rows, '   ', 50, getName);
    expect(result).toHaveLength(rows.length);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    FilterCachedFKRows(rows, '', 50, getName);
    expect(rows).toEqual(copy);
  });
});

describe('FilterCachedFKRows — non-empty query', () => {
  it('matches case-insensitive substrings', () => {
    const result = FilterCachedFKRows(rows, 'alph', 50, getName);
    expect(result.map(getName).sort()).toEqual(['Alphabet Soup', 'alpha']);
  });

  it('ignores the limit for substring matches (returns full match set)', () => {
    const result = FilterCachedFKRows(rows, 'a', 1, getName);
    // every row contains an "a" (case-insensitive); limit must NOT apply here
    expect(result.length).toBeGreaterThan(1);
  });

  it('returns empty array when nothing matches', () => {
    expect(FilterCachedFKRows(rows, 'zzz', 50, getName)).toEqual([]);
  });

  it('formats non-string name values before matching', () => {
    const numbered = [{ name: 100 }, { name: 200 }] as unknown as Row[];
    const result = FilterCachedFKRows(numbered, '20', 50, (r) => (r as { name: number }).name);
    expect(result).toHaveLength(1);
  });
});
