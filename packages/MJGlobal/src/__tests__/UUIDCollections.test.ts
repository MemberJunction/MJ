import { describe, it, expect } from 'vitest';
import {
    UUIDSet,
    UUIDMap,
    FilterByUUIDs,
    ExcludeByUUIDs,
    CountByUUID,
    IndexByUUID,
} from '../util/UUIDCollections';

// SQL Server returns UUIDs upper-case, PostgreSQL lower-case: every collection must treat the
// two spellings of one ID as the same ID.
const A_LOWER = 'aaaaaaaa-0000-0000-0000-000000000001';
const A_UPPER = A_LOWER.toUpperCase();
const B_LOWER = 'bbbbbbbb-0000-0000-0000-000000000002';
const B_UPPER = B_LOWER.toUpperCase();
const C_LOWER = 'cccccccc-0000-0000-0000-000000000003';

describe('UUIDSet', () => {
    it('finds an ID regardless of case or surrounding whitespace', () => {
        const set = new UUIDSet([A_LOWER]);
        expect(set.Has(A_UPPER)).toBe(true);
        expect(set.Has(`  ${A_UPPER}\t`)).toBe(true);
        expect(set.Has(B_LOWER)).toBe(false);
    });

    it('stores case variants of one ID once', () => {
        const set = new UUIDSet([A_LOWER, A_UPPER, ` ${A_LOWER} `]);
        expect(set.Size).toBe(1);
    });

    it('iterates normalized (lower-case, trimmed) IDs', () => {
        expect([...new UUIDSet([A_UPPER, ` ${B_UPPER} `])]).toEqual([A_LOWER, B_LOWER]);
    });

    it('adds, deletes and clears across case variants', () => {
        const set = new UUIDSet().Add(A_UPPER).Add(B_LOWER);
        expect(set.Delete(A_LOWER)).toBe(true);
        expect(set.Delete(A_LOWER)).toBe(false);
        expect(set.Has(A_UPPER)).toBe(false);
        expect(set.Size).toBe(1);
        set.Clear();
        expect(set.Size).toBe(0);
    });

    it('follows NormalizeUUID for null and undefined (both normalize to the empty string)', () => {
        const set = new UUIDSet([null]);
        expect(set.Has(undefined)).toBe(true);
        expect(set.Has('')).toBe(true);
        expect(new UUIDSet([A_LOWER]).Has(null)).toBe(false);
    });

    it('starts empty with no argument', () => {
        expect(new UUIDSet().Size).toBe(0);
    });
});

describe('UUIDMap', () => {
    it('gets a value stored under a different case of the same ID', () => {
        const map = new UUIDMap([[A_LOWER, 'Admin']]);
        expect(map.Get(A_UPPER)).toBe('Admin');
        expect(map.Get(` ${A_UPPER} `)).toBe('Admin');
        expect(map.Get(B_LOWER)).toBeUndefined();
    });

    it('overwrites the value when a case variant is set', () => {
        const map = new UUIDMap<string>().Set(A_LOWER, 'first').Set(A_UPPER, 'second');
        expect(map.Size).toBe(1);
        expect(map.Get(A_LOWER)).toBe('second');
    });

    it('reports membership and deletes across case variants', () => {
        const map = new UUIDMap([[A_UPPER, 1], [B_UPPER, 2]]);
        expect(map.Has(A_LOWER)).toBe(true);
        expect(map.Delete(A_LOWER)).toBe(true);
        expect(map.Has(A_UPPER)).toBe(false);
        expect(map.Size).toBe(1);
        map.Clear();
        expect(map.Size).toBe(0);
    });

    it('iterates normalized keys with their values, in insertion order', () => {
        const map = new UUIDMap([[B_UPPER, 2], [A_UPPER, 1]]);
        expect([...map]).toEqual([[B_LOWER, 2], [A_LOWER, 1]]);
        expect([...map.Keys()]).toEqual([B_LOWER, A_LOWER]);
        expect([...map.Values()]).toEqual([2, 1]);
    });
});

interface Row { ID: string; Name: string }
const rows: Row[] = [
    { ID: A_UPPER, Name: 'a' },
    { ID: B_UPPER, Name: 'b' },
    { ID: C_LOWER, Name: 'c' },
];

interface Pending { artifactId: string; label: string }
const pending: Pending[] = [
    { artifactId: B_LOWER, label: 'report' },
    { artifactId: A_LOWER, label: 'image' },
];

describe('FilterByUUIDs', () => {
    it('keeps the items whose ID is listed, in the items’ own order, matching case-insensitively', () => {
        expect(FilterByUUIDs(rows, [C_LOWER.toUpperCase(), A_LOWER]).map((r) => r.Name)).toEqual(['a', 'c']);
    });

    it('reads a custom ID field through getId', () => {
        expect(FilterByUUIDs(pending, [A_UPPER], (p) => p.artifactId).map((p) => p.label)).toEqual(['image']);
    });

    it('accepts an existing UUIDSet', () => {
        expect(FilterByUUIDs(rows, new UUIDSet([B_LOWER])).map((r) => r.Name)).toEqual(['b']);
    });

    it('returns nothing for no IDs, and does not mutate the input', () => {
        const copy = [...rows];
        expect(FilterByUUIDs(rows, [])).toEqual([]);
        expect(rows).toEqual(copy);
    });
});

describe('ExcludeByUUIDs', () => {
    it('drops the items whose ID is listed, keeping the rest in order', () => {
        expect(ExcludeByUUIDs(rows, [B_LOWER]).map((r) => r.Name)).toEqual(['a', 'c']);
    });

    it('is the exact complement of FilterByUUIDs', () => {
        const ids = [A_LOWER, C_LOWER.toUpperCase()];
        const kept = FilterByUUIDs(rows, ids);
        const dropped = ExcludeByUUIDs(rows, ids);
        expect(kept.length + dropped.length).toBe(rows.length);
        expect(kept.some((r) => dropped.includes(r))).toBe(false);
    });

    it('reads a custom ID field through getId', () => {
        expect(ExcludeByUUIDs(pending, [B_UPPER], (p) => p.artifactId).map((p) => p.label)).toEqual(['image']);
    });

    it('keeps everything for no IDs', () => {
        expect(ExcludeByUUIDs(rows, []).map((r) => r.Name)).toEqual(['a', 'b', 'c']);
    });
});

describe('CountByUUID', () => {
    it('counts case variants of one ID together', () => {
        const counts = CountByUUID([A_LOWER, A_UPPER, B_UPPER], (id) => id);
        expect(counts.Get(A_UPPER)).toBe(2);
        expect(counts.Get(B_LOWER)).toBe(1);
        expect(counts.Get(C_LOWER)).toBeUndefined();
    });

    it('uses the item ID by default', () => {
        expect(CountByUUID([...rows, { ID: A_LOWER, Name: 'a2' }]).Get(A_LOWER)).toBe(2);
    });
});

describe('IndexByUUID', () => {
    it('looks items up by ID in any case', () => {
        const index = IndexByUUID(rows);
        expect(index.Get(B_LOWER)?.Name).toBe('b');
        expect(index.Get(C_LOWER.toUpperCase())?.Name).toBe('c');
    });

    it('keeps the FIRST item for a duplicated ID, as find() would', () => {
        const index = IndexByUUID([{ ID: A_UPPER, Name: 'first' }, { ID: A_LOWER, Name: 'second' }]);
        expect(index.Get(A_LOWER)?.Name).toBe('first');
        expect(index.Size).toBe(1);
    });

    it('reads a custom ID field through getId', () => {
        expect(IndexByUUID(pending, (p) => p.artifactId).Get(B_UPPER)?.label).toBe('report');
    });
});

describe('default ID selector', () => {
    it('treats an item whose ID is not a string as having no ID', () => {
        const odd = [{ ID: 42 as unknown as string, Name: 'numeric' }];
        expect(FilterByUUIDs(odd, [A_LOWER])).toEqual([]);
        expect(FilterByUUIDs(odd, [null]).map((r) => r.Name)).toEqual(['numeric']);
    });
});
