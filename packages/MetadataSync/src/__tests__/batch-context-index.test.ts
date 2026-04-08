import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @memberjunction/core the same way other tests in this package do
vi.mock('@memberjunction/core', () => {
  return {
    Metadata: vi.fn().mockImplementation(function () {
      return {
        EntityByName: vi.fn().mockImplementation((name: string) => {
          // Return a realistic-enough entity info with a primary key
          return {
            Name: name,
            PrimaryKeys: [{ Name: 'ID' }],
            Fields: [{ Name: 'ID' }],
          };
        }),
      };
    }),
    BaseEntity: vi.fn(),
  };
});

import { BatchContextIndex, BatchContextStub } from '../lib/batch-context-index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal BatchContextStub with given entity name and field values. */
function makeStub(
  entityName: string,
  fields: Record<string, unknown>,
): BatchContextStub {
  const fieldNames = Object.keys(fields);
  return {
    EntityInfo: {
      Name: entityName,
      PrimaryKeys: [{ Name: 'ID' }],
      Fields: fieldNames.map((n) => ({ Name: n })),
    },
    Get(field: string) {
      return fields[field];
    },
    GetAll() {
      return { ...fields };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchContextIndex', () => {
  let index: BatchContextIndex;

  beforeEach(() => {
    index = new BatchContextIndex();
  });

  // -- Map-compatible surface -------------------------------------------------

  describe('Map-compatible surface', () => {
    it('set() and get() work like a Map', () => {
      const stub = makeStub('Users', { ID: '1', Name: 'Alice' });
      index.set('users/1', stub);

      expect(index.get('users/1')).toBe(stub);
      expect(index.get('nonexistent')).toBeUndefined();
    });

    it('has() returns true for existing keys, false otherwise', () => {
      const stub = makeStub('Users', { ID: '1' });
      index.set('users/1', stub);

      expect(index.has('users/1')).toBe(true);
      expect(index.has('missing')).toBe(false);
    });

    it('size reflects the number of entries', () => {
      expect(index.size).toBe(0);

      index.set('a', makeStub('Users', { ID: '1' }));
      expect(index.size).toBe(1);

      index.set('b', makeStub('Users', { ID: '2' }));
      expect(index.size).toBe(2);
    });
  });

  // -- lookupByFields ---------------------------------------------------------

  describe('lookupByFields()', () => {
    it('single field -- hit', () => {
      index.set('users/1', makeStub('Users', { ID: '1', Name: 'Alice' }));

      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'Alice' },
      ]);
      expect(result).toBe('1');
    });

    it('single field -- miss', () => {
      index.set('users/1', makeStub('Users', { ID: '1', Name: 'Alice' }));

      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'Bob' },
      ]);
      expect(result).toBeUndefined();
    });

    it('two fields -- hit', () => {
      index.set(
        'users/1',
        makeStub('Users', { ID: '1', Name: 'Alice', Email: 'alice@test.com' }),
      );

      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'Alice' },
        { fieldName: 'Email', fieldValue: 'alice@test.com' },
      ]);
      expect(result).toBe('1');
    });

    it('two fields -- miss when one value differs', () => {
      index.set(
        'users/1',
        makeStub('Users', { ID: '1', Name: 'Alice', Email: 'alice@test.com' }),
      );

      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'Alice' },
        { fieldName: 'Email', fieldValue: 'wrong@test.com' },
      ]);
      expect(result).toBeUndefined();
    });

    it('is order-independent -- fields in different order still match', () => {
      index.set(
        'users/1',
        makeStub('Users', { ID: '1', Name: 'Alice', Email: 'alice@test.com' }),
      );

      // Reverse the field order compared to the previous test
      const result = index.lookupByFields('Users', [
        { fieldName: 'Email', fieldValue: 'alice@test.com' },
        { fieldName: 'Name', fieldValue: 'Alice' },
      ]);
      expect(result).toBe('1');
    });

    it('is case-insensitive on values', () => {
      index.set('users/1', makeStub('Users', { ID: '1', Name: 'Alice' }));

      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'ALICE' },
      ]);
      expect(result).toBe('1');
    });

    it('is case-insensitive on field names', () => {
      index.set('users/1', makeStub('Users', { ID: '1', Name: 'Alice' }));

      const result = index.lookupByFields('Users', [
        { fieldName: 'name', fieldValue: 'Alice' },
      ]);
      expect(result).toBe('1');
    });

    it('returns undefined for wrong entity name', () => {
      index.set('users/1', makeStub('Users', { ID: '1', Name: 'Alice' }));

      const result = index.lookupByFields('Roles', [
        { fieldName: 'Name', fieldValue: 'Alice' },
      ]);
      expect(result).toBeUndefined();
    });

    it('3+ field lookup falls back to per-entity scan', () => {
      index.set(
        'users/1',
        makeStub('Users', {
          ID: '1',
          Name: 'Alice',
          Email: 'alice@test.com',
          Dept: 'Eng',
          Country: 'US',
        }),
      );

      // Query a 3-field subset (not all fields, so it's not the all-fields
      // composite key -- forces the fallback scan)
      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'Alice' },
        { fieldName: 'Email', fieldValue: 'alice@test.com' },
        { fieldName: 'Dept', fieldValue: 'Eng' },
      ]);
      expect(result).toBe('1');
    });

    it('3+ field lookup returns undefined on partial match', () => {
      index.set(
        'users/1',
        makeStub('Users', {
          ID: '1',
          Name: 'Alice',
          Email: 'alice@test.com',
          Dept: 'Eng',
          Country: 'US',
        }),
      );

      const result = index.lookupByFields('Users', [
        { fieldName: 'Name', fieldValue: 'Alice' },
        { fieldName: 'Email', fieldValue: 'alice@test.com' },
        { fieldName: 'Dept', fieldValue: 'Sales' }, // mismatch
      ]);
      expect(result).toBeUndefined();
    });
  });

  // -- clear() ----------------------------------------------------------------

  describe('clear()', () => {
    it('empties all entries and indexes', () => {
      index.set('users/1', makeStub('Users', { ID: '1', Name: 'Alice' }));
      index.set('roles/1', makeStub('Roles', { ID: '10', Name: 'Admin' }));
      expect(index.size).toBe(2);

      index.clear();

      expect(index.size).toBe(0);
      expect(index.get('users/1')).toBeUndefined();
      expect(
        index.lookupByFields('Users', [{ fieldName: 'Name', fieldValue: 'Alice' }]),
      ).toBeUndefined();
    });
  });

  // -- Iteration --------------------------------------------------------------

  describe('iteration', () => {
    it('for...of iterates over entries', () => {
      const stub1 = makeStub('Users', { ID: '1' });
      const stub2 = makeStub('Roles', { ID: '2' });
      index.set('users/1', stub1);
      index.set('roles/2', stub2);

      const collected: Array<[string, unknown]> = [];
      for (const entry of index) {
        collected.push(entry);
      }
      expect(collected).toHaveLength(2);
      expect(collected).toContainEqual(['users/1', stub1]);
      expect(collected).toContainEqual(['roles/2', stub2]);
    });

    it('entries() returns an iterable iterator', () => {
      const stub = makeStub('Users', { ID: '1' });
      index.set('users/1', stub);

      const entries = [...index.entries()];
      expect(entries).toEqual([['users/1', stub]]);
    });
  });
});
