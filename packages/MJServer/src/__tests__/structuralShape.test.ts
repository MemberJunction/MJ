import { describe, it, expect } from 'vitest';
import { describeStructure } from '../logging/structuralShape.js';

describe('describeStructure', () => {
  describe('primitives', () => {
    it('reduces a string to "<string>"', () => {
      expect(describeStructure('FAKE_SECRET_VALUE_DO_NOT_USE')).toBe('<string>');
    });

    it('reduces an empty string to "<string>"', () => {
      expect(describeStructure('')).toBe('<string>');
    });

    it('reduces a number to "<number>"', () => {
      expect(describeStructure(42)).toBe('<number>');
    });

    it('reduces zero to "<number>"', () => {
      expect(describeStructure(0)).toBe('<number>');
    });

    it('reduces a boolean true to "<boolean>"', () => {
      expect(describeStructure(true)).toBe('<boolean>');
    });

    it('reduces a boolean false to "<boolean>"', () => {
      expect(describeStructure(false)).toBe('<boolean>');
    });

    it('reduces a bigint to "<bigint>"', () => {
      expect(describeStructure(BigInt(123))).toBe('<bigint>');
    });

    it('reduces a symbol to "<symbol>"', () => {
      expect(describeStructure(Symbol('foo'))).toBe('<symbol>');
    });
  });

  describe('null and undefined', () => {
    it('preserves null', () => {
      expect(describeStructure(null)).toBeNull();
    });

    it('preserves undefined', () => {
      expect(describeStructure(undefined)).toBeUndefined();
    });
  });

  describe('arrays', () => {
    it('preserves an empty array', () => {
      expect(describeStructure([])).toEqual([]);
    });

    it('maps over a primitive array preserving structure', () => {
      expect(describeStructure(['a', 'b', 'c'])).toEqual(['<string>', '<string>', '<string>']);
    });

    it('maps over a mixed-type array', () => {
      expect(describeStructure([1, 'two', true])).toEqual(['<number>', '<string>', '<boolean>']);
    });

    it('maps over an array of objects', () => {
      expect(describeStructure([{ ID: 'a' }, { ID: 'b' }])).toEqual([
        { ID: '<string>' },
        { ID: '<string>' },
      ]);
    });

    it('preserves array elements that are null', () => {
      expect(describeStructure([null, 'x'])).toEqual([null, '<string>']);
    });
  });

  describe('plain objects', () => {
    it('preserves a flat object replacing values with type markers', () => {
      expect(describeStructure({ Name: 'X', Values: 'FAKE_SECRET', Count: 5 })).toEqual({
        Name: '<string>',
        Values: '<string>',
        Count: '<number>',
      });
    });

    it('preserves a nested object replacing leaf values', () => {
      expect(
        describeStructure({ input: { Values: 'FAKE_SECRET', Count: 3 } }),
      ).toEqual({ input: { Values: '<string>', Count: '<number>' } });
    });

    it('preserves an empty object', () => {
      expect(describeStructure({})).toEqual({});
    });

    it('handles null values inside an object', () => {
      expect(describeStructure({ Name: 'X', Description: null })).toEqual({
        Name: '<string>',
        Description: null,
      });
    });

    it('handles undefined values inside an object', () => {
      expect(describeStructure({ Name: 'X', Description: undefined })).toEqual({
        Name: '<string>',
        Description: undefined,
      });
    });
  });

  describe('depth cap', () => {
    it('collapses objects beyond the default depth (5) to "<object>"', () => {
      // Build an object 7 levels deep: { a: { a: { a: { a: { a: { a: { a: 'leaf' } } } } } } }
      const deep: Record<string, unknown> = { a: 'leaf' };
      let nested: Record<string, unknown> = { a: deep };
      for (let i = 0; i < 5; i++) {
        nested = { a: nested };
      }
      // nested is now 7 levels deep. At depth 5, the inner object should collapse.
      const result = describeStructure(nested) as Record<string, unknown>;
      // Walk into the result 5 levels — at level 5, we should hit '<object>'.
      let cursor: unknown = result;
      for (let i = 0; i < 5; i++) {
        cursor = (cursor as Record<string, unknown>).a;
      }
      expect(cursor).toBe('<object>');
    });

    it('honors a custom maxDepth parameter', () => {
      const value = { a: { b: { c: 'leaf' } } };
      // maxDepth=2 means: depth 0 = outer object, depth 1 = { b: ... }, depth 2 = collapsed
      const result = describeStructure(value, 2) as Record<string, unknown>;
      expect(result).toEqual({ a: { b: '<object>' } });
    });

    it('allows depth 0 to immediately collapse', () => {
      expect(describeStructure({ a: 1 }, 0)).toBe('<object>');
    });
  });

  describe('special object types', () => {
    it('labels a Date instance as "<Date>"', () => {
      expect(describeStructure(new Date())).toBe('<Date>');
    });

    it('labels a function as "<function>"', () => {
      expect(describeStructure(() => {})).toBe('<function>');
    });

    it('labels a class instance with its constructor name', () => {
      class Foo {
        bar = 'baz';
      }
      expect(describeStructure(new Foo())).toBe('<Foo>');
    });

    it('treats a Map as "<Map>"', () => {
      expect(describeStructure(new Map())).toBe('<Map>');
    });

    it('treats a Set as "<Set>"', () => {
      expect(describeStructure(new Set())).toBe('<Set>');
    });
  });

  describe('security property — no input values appear in output', () => {
    it('does not leak a secret string anywhere in the output', () => {
      const secret = 'FAKE_SECRET_VALUE_DO_NOT_USE';
      const payload = { input: { Values: secret, Name: 'HubSpot' } };
      const result = describeStructure(payload);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain('FAKE_SECRET');
      expect(serialized).not.toContain('HubSpot');
    });

    it('does not leak a numeric value anywhere in the output', () => {
      const payload = { count: 1234567890 };
      const result = describeStructure(payload);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('1234567890');
    });
  });
});
