import { describe, it, expect } from 'vitest';
import { CrushJSON, DescribeCrush, type JsonValue, type CrushResult } from '../crush-json';

/**
 * Reconstruct the logical set of records from a crushed top-level table, reversing
 * interning and column mapping. Mirrors how an AI consumer would read the legend, so
 * these tests assert *semantic* round-trip rather than byte equality.
 */
function reconstructTable(result: CrushResult): Array<Record<string, JsonValue>> {
  const parsed = JSON.parse(result.Text) as { $t: { c: string[]; r: JsonValue[][] } };
  const intern = result.Legend.Intern ?? {};
  const deref = (value: JsonValue): JsonValue =>
    typeof value === 'string' && value in intern ? intern[value] : value;
  return parsed.$t.r.map((row) => {
    const record: Record<string, JsonValue> = {};
    parsed.$t.c.forEach((column, index) => {
      record[column] = deref(row[index]);
    });
    return record;
  });
}

describe('CrushJSON', () => {
  describe('tabular transform', () => {
    it('collapses an array of objects to columns + rows', () => {
      const data: JsonValue = [
        { id: 1, name: 'Alice', status: 'Active' },
        { id: 2, name: 'Bob', status: 'Active' },
      ];
      const result = CrushJSON(data);
      const parsed = JSON.parse(result.Text) as { $t: { c: string[]; r: JsonValue[][] } };
      expect(parsed.$t.c).toEqual(['id', 'name', 'status']);
      expect(parsed.$t.r).toHaveLength(2);
      expect(result.CrushedChars).toBeLessThan(result.OriginalChars);
    });

    it('semantically round-trips the original records', () => {
      const data: JsonValue = [
        { id: 1, name: 'Alice', role: 'Admin' },
        { id: 2, name: 'Bob', role: 'User' },
        { id: 3, name: 'Carol', role: 'Admin' },
      ];
      const result = CrushJSON(data, { InternMinLength: 0 });
      expect(reconstructTable(result)).toEqual(data);
    });

    it('fills missing keys with null and unions columns deterministically', () => {
      const data: JsonValue = [
        { b: 2, a: 1 },
        { a: 3, c: 4 },
      ];
      const result = CrushJSON(data, { ElideEmpty: false, InternMinLength: 0 });
      const parsed = JSON.parse(result.Text) as { $t: { c: string[]; r: JsonValue[][] } };
      expect(parsed.$t.c).toEqual(['a', 'b', 'c']);
      expect(parsed.$t.r).toEqual([
        [1, 2, null],
        [3, null, 4],
      ]);
    });

    it('does not tabularize arrays below TabularMinRows', () => {
      const data: JsonValue = [{ id: 1, name: 'Solo' }];
      const result = CrushJSON(data);
      expect(result.Text).not.toContain('$t');
    });
  });

  describe('determinism & idempotency', () => {
    it('produces byte-identical output across runs', () => {
      const data: JsonValue = [
        { z: 'last', a: 'first', m: 'middle' },
        { a: 'x', z: 'y', m: 'w' },
      ];
      expect(CrushJSON(data).Text).toBe(CrushJSON(data).Text);
    });

    it('is byte-stable regardless of key insertion order', () => {
      const a: JsonValue = { name: 'X', id: 1, tags: ['b', 'a'] };
      const b: JsonValue = { tags: ['b', 'a'], id: 1, name: 'X' };
      expect(CrushJSON(a).Text).toBe(CrushJSON(b).Text);
    });

    it('is idempotent on already-crushed shapes (stable second pass)', () => {
      const data: JsonValue = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const once = CrushJSON(data).Text;
      const reparsed = JSON.parse(once) as JsonValue;
      expect(CrushJSON(reparsed).Text).toBe(once);
    });
  });

  describe('string interning', () => {
    it('interns repeated long strings and reverses them via the legend', () => {
      const repeated = 'OperationCompletedSuccessfully';
      const data: JsonValue = [
        { id: 1, status: repeated },
        { id: 2, status: repeated },
        { id: 3, status: repeated },
      ];
      const result = CrushJSON(data, { InternMinLength: 8, InternMinCount: 3 });
      expect(result.Legend.Intern).toBeDefined();
      expect(Object.values(result.Legend.Intern!)).toContain(repeated);
      expect(reconstructTable(result)).toEqual(data);
    });

    it('skips interning when a datum collides with the token prefix', () => {
      const data: JsonValue = [
        { id: 1, status: '§0-real-data-value-here' },
        { id: 2, status: '§0-real-data-value-here' },
        { id: 3, status: '§0-real-data-value-here' },
      ];
      const result = CrushJSON(data, { InternMinLength: 4, InternMinCount: 2 });
      expect(result.Legend.Intern).toBeUndefined();
    });
  });

  describe('elision', () => {
    it('drops columns empty across all rows and records them', () => {
      const data: JsonValue = [
        { id: 1, name: 'Alice', note: null },
        { id: 2, name: 'Bob', note: '' },
      ];
      const result = CrushJSON(data);
      const parsed = JSON.parse(result.Text) as { $t: { c: string[] } };
      expect(parsed.$t.c).not.toContain('note');
      expect(result.Legend.Elided).toContain('note');
    });

    it('keeps a column that is empty in only some rows', () => {
      const data: JsonValue = [
        { id: 1, note: 'kept' },
        { id: 2, note: null },
      ];
      const result = CrushJSON(data);
      const parsed = JSON.parse(result.Text) as { $t: { c: string[] } };
      expect(parsed.$t.c).toContain('note');
    });
  });

  describe('budget guard', () => {
    it('truncates trailing rows and records the count', () => {
      const data: JsonValue = Array.from({ length: 200 }, (_, i) => ({ id: i, name: `User${i}` }));
      const full = CrushJSON(data, { InternMinLength: 0 });
      const budgeted = CrushJSON(data, { MaxChars: 400, InternMinLength: 0 });
      expect(budgeted.CrushedChars).toBeLessThanOrEqual(400);
      expect(budgeted.Legend.TruncatedRows).toBeGreaterThan(0);
      expect(budgeted.CrushedChars).toBeLessThan(full.CrushedChars);
    });

    it('does not truncate when within budget', () => {
      const data: JsonValue = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
      const result = CrushJSON(data, { MaxChars: 10000 });
      expect(result.Legend.TruncatedRows).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles an empty array', () => {
      const result = CrushJSON([]);
      expect(result.Text).toBe('[]');
    });

    it('handles a scalar', () => {
      expect(CrushJSON(42).Text).toBe('42');
      expect(CrushJSON('hello').Text).toBe('"hello"');
      expect(CrushJSON(null).Text).toBe('null');
    });

    it('handles a mixed-type array without tabularizing', () => {
      const data: JsonValue = [1, 'two', { three: 3 }];
      const result = CrushJSON(data);
      expect(result.Text).not.toContain('$t');
    });

    it('handles deeply nested objects', () => {
      const data: JsonValue = { a: { b: { c: { d: [{ id: 1 }, { id: 2 }] } } } };
      const result = CrushJSON(data);
      expect(result.Text).toContain('$t');
      expect(() => JSON.parse(result.Text)).not.toThrow();
    });
  });

  describe('hardening / hostile inputs', () => {
    it('does not throw on pathologically deep nesting and notes the depth limit', () => {
      let deep: JsonValue = { v: 1 };
      for (let i = 0; i < 400; i++) {
        deep = { n: deep };
      }
      let result: ReturnType<typeof CrushJSON> | undefined;
      expect(() => { result = CrushJSON(deep); }).not.toThrow();
      expect(result!.Legend.Notes.join(' ')).toContain('depth');
      expect(() => JSON.parse(result!.Text)).not.toThrow();
    });

    it('respects a custom MaxDepth', () => {
      const data: JsonValue = { a: { b: { c: { d: { e: 1 } } } } };
      const result = CrushJSON(data, { MaxDepth: 2 });
      expect(result.Legend.Notes.join(' ')).toContain('depth');
    });

    it('normalizes NaN/Infinity to null and flags it (no silent data loss)', () => {
      const data: JsonValue = [
        { id: 1, v: NaN as unknown as number },
        { id: 2, v: Infinity as unknown as number },
        { id: 3, v: -Infinity as unknown as number },
      ];
      const result = CrushJSON(data, { InternMinLength: 0 });
      expect(result.Legend.Notes.join(' ')).toContain('Non-finite');
      const parsed = JSON.parse(result.Text) as { $t: { r: JsonValue[][] } };
      expect(parsed.$t.r.map((row) => row[1])).toEqual([null, null, null]);
    });

    it('does NOT falsely claim a table when data has a literal "$t" key', () => {
      const data: JsonValue = { $t: 'a real value', other: 'x'.repeat(30) };
      const result = CrushJSON(data);
      expect(result.Legend.Notes.join(' ')).not.toContain('table');
      expect(DescribeCrush(result)).not.toContain('table');
    });

    it('still flags a real table even when a column is named "$t"', () => {
      const data: JsonValue = [{ $t: 1, id: 1 }, { $t: 2, id: 2 }];
      const result = CrushJSON(data);
      expect(result.Legend.Notes.join(' ')).toContain('table');
    });

    it('keeps reserved-key data (c / r / $t columns) reconstructable', () => {
      const data: JsonValue = [
        { $t: 'A', c: 'B', r: 'C', id: 1 },
        { $t: 'D', c: 'E', r: 'F', id: 2 },
      ];
      const result = CrushJSON(data, { InternMinLength: 0 });
      const parsed = JSON.parse(result.Text) as { $t: { c: string[]; r: JsonValue[][] } };
      const cols = parsed.$t.c;
      const rebuilt = parsed.$t.r.map((row) => {
        const rec: Record<string, JsonValue> = {};
        cols.forEach((col, i) => { rec[col] = row[i]; });
        return rec;
      });
      expect(rebuilt).toEqual(data);
    });
  });
});

describe('DescribeCrush', () => {
  it('returns an empty string when nothing was transformed', () => {
    expect(DescribeCrush(CrushJSON(42))).toBe('');
  });

  it('describes the table and intern legend for a transformed payload', () => {
    const repeated = 'SomeRepeatedStatusValue';
    const data: JsonValue = [
      { id: 1, status: repeated },
      { id: 2, status: repeated },
      { id: 3, status: repeated },
    ];
    const description = DescribeCrush(CrushJSON(data, { InternMinLength: 8, InternMinCount: 3 }));
    expect(description).toContain('context-crush');
    expect(description).toContain('table');
    expect(description).toContain(repeated);
  });
});
