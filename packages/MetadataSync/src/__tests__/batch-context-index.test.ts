import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/core', () => {
  return {
    Metadata: vi.fn().mockImplementation(function () {
      return {
        EntityByName: vi.fn().mockImplementation((name: string) => {
          // Return a stub EntityInfo with a single primary key
          return {
            Name: name,
            PrimaryKeys: [{ Name: 'ID' }],
          };
        }),
      };
    }),
    BaseEntity: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { BatchContextIndex } from '../lib/batch-context-index';

/**
 * Build a minimal mock entity that quacks like BaseEntity:
 *  - EntityInfo.Name, EntityInfo.Fields
 *  - Get(fieldName) returns the value from `data`
 */
function mockEntity(
  entityName: string,
  data: Record<string, unknown>,
): any {
  const fields = Object.keys(data).map((name) => ({ Name: name }));
  return {
    EntityInfo: { Name: entityName, Fields: fields },
    Get: vi.fn((field: string) => data[field]),
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

  // ----- basic set / get ---------------------------------------------------

  it('set and get by direct key', () => {
    const entity = mockEntity('Users', { ID: '1', Name: 'Alice' });
    index.set('users/alice', entity);

    expect(index.get('users/alice')).toBe(entity);
    expect(index.get('nonexistent')).toBeUndefined();
  });

  it('has() returns correct boolean', () => {
    const entity = mockEntity('Users', { ID: '1', Name: 'Alice' });
    index.set('k', entity);

    expect(index.has('k')).toBe(true);
    expect(index.has('missing')).toBe(false);
  });

  it('size reflects number of entries', () => {
    expect(index.size).toBe(0);
    index.set('a', mockEntity('Users', { ID: '1', Name: 'A' }));
    index.set('b', mockEntity('Users', { ID: '2', Name: 'B' }));
    expect(index.size).toBe(2);
  });

  it('is iterable via for..of and entries()', () => {
    const e1 = mockEntity('Users', { ID: '1', Name: 'Alice' });
    const e2 = mockEntity('Users', { ID: '2', Name: 'Bob' });
    index.set('a', e1);
    index.set('b', e2);

    const fromIterator = [...index];
    expect(fromIterator).toHaveLength(2);

    const fromEntries = [...index.entries()];
    expect(fromEntries).toHaveLength(2);
  });

  // ----- lookupByFields: single field --------------------------------------

  it('lookupByFields with single field returns primary key value', () => {
    const entity = mockEntity('Users', { ID: 'pk-42', Email: 'alice@test.com' });
    index.set('users/alice', entity);

    const result = index.lookupByFields('Users', [
      { fieldName: 'Email', fieldValue: 'alice@test.com' },
    ]);
    expect(result).toBe('pk-42');
  });

  // ----- lookupByFields: multiple fields -----------------------------------

  it('lookupByFields with multiple fields returns primary key value', () => {
    const entity = mockEntity('Users', {
      ID: 'pk-99',
      FirstName: 'John',
      LastName: 'Doe',
      Email: 'john@test.com',
    });
    index.set('users/john', entity);

    const result = index.lookupByFields('Users', [
      { fieldName: 'FirstName', fieldValue: 'John' },
      { fieldName: 'LastName', fieldValue: 'Doe' },
    ]);
    expect(result).toBe('pk-99');
  });

  // ----- order-independent composite key -----------------------------------

  it('composite key is order-independent', () => {
    const entity = mockEntity('Users', {
      ID: 'pk-7',
      FirstName: 'Jane',
      LastName: 'Smith',
    });
    index.set('users/jane', entity);

    // Lookup with fields in reverse order
    const result = index.lookupByFields('Users', [
      { fieldName: 'LastName', fieldValue: 'Smith' },
      { fieldName: 'FirstName', fieldValue: 'Jane' },
    ]);
    expect(result).toBe('pk-7');
  });

  // ----- case-insensitive matching -----------------------------------------

  it('lookupByFields is case-insensitive on values', () => {
    const entity = mockEntity('Users', { ID: 'pk-1', Name: 'Alice' });
    index.set('u/alice', entity);

    const result = index.lookupByFields('Users', [
      { fieldName: 'Name', fieldValue: 'alice' }, // lowercase lookup
    ]);
    expect(result).toBe('pk-1');
  });

  it('lookupByFields is case-insensitive on field names', () => {
    const entity = mockEntity('Users', { ID: 'pk-1', Name: 'Bob' });
    index.set('u/bob', entity);

    const result = index.lookupByFields('Users', [
      { fieldName: 'name', fieldValue: 'bob' }, // lowercase field name
    ]);
    expect(result).toBe('pk-1');
  });

  // ----- misses ------------------------------------------------------------

  it('returns undefined when entity name does not match', () => {
    const entity = mockEntity('Users', { ID: '1', Name: 'Alice' });
    index.set('u/alice', entity);

    const result = index.lookupByFields('Roles', [
      { fieldName: 'Name', fieldValue: 'Alice' },
    ]);
    expect(result).toBeUndefined();
  });

  it('returns undefined when field values do not match', () => {
    const entity = mockEntity('Users', { ID: '1', Name: 'Alice' });
    index.set('u/alice', entity);

    const result = index.lookupByFields('Users', [
      { fieldName: 'Name', fieldValue: 'Bob' },
    ]);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty batch context', () => {
    const result = index.lookupByFields('Users', [
      { fieldName: 'Name', fieldValue: 'Nobody' },
    ]);
    expect(result).toBeUndefined();
  });

  // ----- undefined / null normalization ------------------------------------

  it('normalizes undefined field values to empty string', () => {
    const entity = mockEntity('Users', { ID: 'pk-x', Status: undefined });
    index.set('u/x', entity);

    const result = index.lookupByFields('Users', [
      { fieldName: 'Status', fieldValue: '' },
    ]);
    expect(result).toBe('pk-x');
  });

  // ----- multiple entities of same type ------------------------------------

  it('distinguishes between multiple entities of the same type', () => {
    const alice = mockEntity('Users', { ID: 'pk-a', Email: 'alice@test.com' });
    const bob = mockEntity('Users', { ID: 'pk-b', Email: 'bob@test.com' });
    index.set('u/alice', alice);
    index.set('u/bob', bob);

    expect(
      index.lookupByFields('Users', [
        { fieldName: 'Email', fieldValue: 'alice@test.com' },
      ]),
    ).toBe('pk-a');

    expect(
      index.lookupByFields('Users', [
        { fieldName: 'Email', fieldValue: 'bob@test.com' },
      ]),
    ).toBe('pk-b');
  });

  // ----- performance -------------------------------------------------------

  it('10,000 entities with 10,000 lookups completes in under 100ms', () => {
    // Insert 10,000 entities
    for (let i = 0; i < 10_000; i++) {
      const entity = mockEntity('Items', {
        ID: `pk-${i}`,
        Code: `CODE-${i}`,
        Name: `Item ${i}`,
      });
      index.set(`items/${i}`, entity);
    }

    // Time 10,000 lookups
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const result = index.lookupByFields('Items', [
        { fieldName: 'Code', fieldValue: `CODE-${i}` },
      ]);
      // Verify correctness for a sample
      if (i % 1000 === 0) {
        expect(result).toBe(`pk-${i}`);
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
