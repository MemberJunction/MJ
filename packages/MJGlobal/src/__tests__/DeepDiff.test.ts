import { describe, it, expect } from 'vitest';
import { DeepDiffer, DiffChangeType, DiffChange, DeepDiffResult } from '../DeepDiff';

/**
 * Tests for DeepDiffer — recursive diff between two values producing structured
 * changes, a summary, and formatted text. Covers object/array/nested diffs, type
 * changes, additions/removals, identity, and every config option the class exposes
 * (includeUnchanged, maxDepth, maxStringLength, includeArrayIndices,
 * treatNullAsUndefined, valueFormatter) plus updateConfig.
 */
describe('DeepDiffer', () => {
  /** Locate the single change at a given path (fails the test if absent). */
  const at = (result: DeepDiffResult, path: string): DiffChange => {
    const change = result.changes.find((c) => c.path === path);
    expect(change, `expected a change at path "${path}"`).toBeDefined();
    return change as DiffChange;
  };

  // ---------------------------------------------------------------
  // Primitive & object modifications
  // ---------------------------------------------------------------
  describe('object modifications', () => {
    it('should detect a modified primitive property', () => {
      const r = new DeepDiffer().diff({ a: 1 }, { a: 2 });
      expect(r.summary.modified).toBe(1);
      const c = at(r, 'a');
      expect(c.type).toBe(DiffChangeType.Modified);
      expect(c.oldValue).toBe(1);
      expect(c.newValue).toBe(2);
      expect(c.description).toBe('Changed from 1 to 2');
    });

    it('should detect a nested modification with a dotted path', () => {
      const r = new DeepDiffer().diff({ u: { name: 'A' } }, { u: { name: 'B' } });
      const c = at(r, 'u.name');
      expect(c.type).toBe(DiffChangeType.Modified);
      expect(c.description).toBe('Changed from "A" to "B"');
    });

    it('should treat a type change (number -> string) as a modification', () => {
      const r = new DeepDiffer().diff({ a: 1 }, { a: '1' });
      const c = at(r, 'a');
      expect(c.type).toBe(DiffChangeType.Modified);
      expect(c.oldValue).toBe(1);
      expect(c.newValue).toBe('1');
    });

    it('should diff a root-level primitive pair under the "root" path', () => {
      const r = new DeepDiffer().diff('a', 'b');
      const c = at(r, 'root');
      expect(c.type).toBe(DiffChangeType.Modified);
      expect(c.description).toBe('Changed from "a" to "b"');
    });
  });

  // ---------------------------------------------------------------
  // Additions & removals
  // ---------------------------------------------------------------
  describe('additions and removals', () => {
    it('should detect an added key', () => {
      const r = new DeepDiffer().diff({ a: 1 }, { a: 1, b: 2 });
      expect(r.summary.added).toBe(1);
      const c = at(r, 'b');
      expect(c.type).toBe(DiffChangeType.Added);
      expect(c.newValue).toBe(2);
      expect(c.oldValue).toBeUndefined();
      expect(c.description).toBe('Added 2');
    });

    it('should detect a removed key', () => {
      const r = new DeepDiffer().diff({ a: 1, b: 2 }, { a: 1 });
      expect(r.summary.removed).toBe(1);
      const c = at(r, 'b');
      expect(c.type).toBe(DiffChangeType.Removed);
      expect(c.oldValue).toBe(2);
      expect(c.newValue).toBeUndefined();
      expect(c.description).toBe('Removed 2');
    });
  });

  // ---------------------------------------------------------------
  // Arrays
  // ---------------------------------------------------------------
  describe('arrays', () => {
    it('should report a length change plus the added element when an array grows', () => {
      const r = new DeepDiffer().diff({ items: [1] }, { items: [1, 2] });
      const lengthChange = at(r, 'items');
      expect(lengthChange.type).toBe(DiffChangeType.Modified);
      expect(lengthChange.description).toBe('Array length changed from 1 to 2');
      const added = at(r, 'items.[1]');
      expect(added.type).toBe(DiffChangeType.Added);
      expect(added.newValue).toBe(2);
    });

    it('should report a length change plus the removed element when an array shrinks', () => {
      const r = new DeepDiffer().diff([1, 2], [1]);
      const lengthChange = at(r, 'root');
      expect(lengthChange.type).toBe(DiffChangeType.Modified);
      expect(lengthChange.description).toBe('Array length changed from 2 to 1');
      const removed = at(r, '[1]');
      expect(removed.type).toBe(DiffChangeType.Removed);
      expect(removed.oldValue).toBe(2);
    });

    it('should detect an element modification without a length change', () => {
      const r = new DeepDiffer().diff([1, 2], [1, 3]);
      expect(r.summary.modified).toBe(1);
      const c = at(r, '[1]');
      expect(c.type).toBe(DiffChangeType.Modified);
      expect(c.oldValue).toBe(2);
      expect(c.newValue).toBe(3);
    });
  });

  // ---------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------
  describe('identity', () => {
    it('should report no changes for deeply equal objects', () => {
      const r = new DeepDiffer().diff({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } });
      expect(r.changes).toHaveLength(0);
      expect(r.summary.totalPaths).toBe(0);
    });

    it('should report no changes for equal primitives', () => {
      expect(new DeepDiffer().diff(5, 5).changes).toHaveLength(0);
      expect(new DeepDiffer().diff('x', 'x').changes).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------
  // includeUnchanged
  // ---------------------------------------------------------------
  describe('includeUnchanged option', () => {
    it('should record unchanged paths when enabled', () => {
      const r = new DeepDiffer({ includeUnchanged: true }).diff({ a: 1, b: 2 }, { a: 1, b: 3 });
      expect(r.summary.unchanged).toBe(1);
      const c = at(r, 'a');
      expect(c.type).toBe(DiffChangeType.Unchanged);
      expect(c.description).toBe('No change');
    });
  });

  // ---------------------------------------------------------------
  // treatNullAsUndefined
  // ---------------------------------------------------------------
  describe('treatNullAsUndefined option', () => {
    it('should treat null -> value as Added (not Modified)', () => {
      const r = new DeepDiffer({ treatNullAsUndefined: true }).diff({ name: null }, { name: 'John' });
      expect(at(r, 'name').type).toBe(DiffChangeType.Added);
    });

    it('should treat value -> null as Removed (not Modified)', () => {
      const r = new DeepDiffer({ treatNullAsUndefined: true }).diff(
        { status: 'active' },
        { status: null }
      );
      expect(at(r, 'status').type).toBe(DiffChangeType.Removed);
    });

    it('should treat null -> value as Modified by default (option off)', () => {
      const r = new DeepDiffer().diff({ name: null }, { name: 'John' });
      const c = at(r, 'name');
      expect(c.type).toBe(DiffChangeType.Modified);
      expect(c.description).toBe('Changed from null to "John"');
    });
  });

  // ---------------------------------------------------------------
  // maxDepth
  // ---------------------------------------------------------------
  describe('maxDepth option', () => {
    it('should not descend beyond the configured depth', () => {
      const r = new DeepDiffer({ maxDepth: 1 }).diff({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });
      expect(r.changes).toHaveLength(0);
    });

    it('should detect the change when depth is sufficient', () => {
      const r = new DeepDiffer({ maxDepth: 10 }).diff({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });
      expect(at(r, 'a.b.c').type).toBe(DiffChangeType.Modified);
    });
  });

  // ---------------------------------------------------------------
  // includeArrayIndices
  // ---------------------------------------------------------------
  describe('includeArrayIndices option', () => {
    it('should use a generic [] path segment when indices are disabled', () => {
      const r = new DeepDiffer({ includeArrayIndices: false }).diff({ items: [1] }, { items: [1, 2] });
      expect(at(r, 'items.[]').type).toBe(DiffChangeType.Added);
    });
  });

  // ---------------------------------------------------------------
  // valueFormatter
  // ---------------------------------------------------------------
  describe('valueFormatter option', () => {
    it('should use the custom formatter in descriptions', () => {
      const r = new DeepDiffer({ valueFormatter: (_value, type) => `<${type}>` }).diff(
        { a: 1 },
        { a: 2 }
      );
      expect(at(r, 'a').description).toBe('Changed from <number> to <number>');
    });
  });

  // ---------------------------------------------------------------
  // maxStringLength
  // ---------------------------------------------------------------
  describe('maxStringLength option', () => {
    it('should truncate long strings in descriptions', () => {
      const r = new DeepDiffer({ maxStringLength: 5 }).diff({ a: 'x' }, { a: 'abcdefghij' });
      expect(at(r, 'a').description).toBe('Changed from "x" to "abcde..."');
    });
  });

  // ---------------------------------------------------------------
  // Formatted output
  // ---------------------------------------------------------------
  describe('formatted output', () => {
    it('should include a summary header, totals, and grouped changes', () => {
      const r = new DeepDiffer().diff({ a: 1 }, { a: 2, b: 3 });
      expect(r.formatted).toContain('=== Deep Diff Summary ===');
      expect(r.formatted).toContain('Total changes: 2');
      expect(r.formatted).toContain('Added: 1');
      expect(r.formatted).toContain('Modified: 1');
      expect(r.formatted).toContain('=== Changes ===');
      expect(r.formatted).toContain('a: Changed from 1 to 2');
      expect(r.formatted).toContain('b: Added 3');
    });
  });

  // ---------------------------------------------------------------
  // updateConfig
  // ---------------------------------------------------------------
  describe('updateConfig', () => {
    it('should apply config changes to subsequent diffs', () => {
      const differ = new DeepDiffer();
      differ.updateConfig({ includeUnchanged: true });
      const r = differ.diff({ a: 1 }, { a: 1 });
      expect(r.summary.unchanged).toBe(1);
      expect(at(r, 'a').type).toBe(DiffChangeType.Unchanged);
    });
  });

  // ---------------------------------------------------------------
  // Summary totals
  // ---------------------------------------------------------------
  describe('summary totals', () => {
    it('should count added, removed, and modified across a mixed diff', () => {
      const r = new DeepDiffer().diff({ a: 1, b: 2 }, { a: 99, c: 3 });
      expect(r.summary.added).toBe(1); // c
      expect(r.summary.removed).toBe(1); // b
      expect(r.summary.modified).toBe(1); // a
      expect(r.summary.totalPaths).toBe(3);
    });
  });
});
