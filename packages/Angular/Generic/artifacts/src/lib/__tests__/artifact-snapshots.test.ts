import { describe, it, expect } from 'vitest';
import { DataSnapshot, DataTable, NormalizeToTables } from '@memberjunction/core';
import {
  createJsonSnapshot,
  createCodeSnapshot,
  createMarkdownSnapshot,
  createDataSnapshot,
  buildMultiTableSql,
} from '../snapshot-helpers';

/**
 * Tests for artifact-level state snapshot logic.
 *
 * These tests exercise the pure snapshot-creation functions that the Angular
 * viewer components delegate to, without requiring Angular TestBed.
 */

describe('Artifact Snapshot Helpers', () => {

  describe('createJsonSnapshot', () => {
    it('should return null when content is null', () => {
      const result = createJsonSnapshot(null, 'Test');
      expect(result).toBeNull();
    });

    it('should parse valid JSON and count top-level keys', () => {
      const json = '{"name":"Alice","age":30,"active":true}';
      const result = createJsonSnapshot(json, 'My JSON');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('My JSON');
      expect(result!.interpretation).toBe('JSON artifact with 3 top-level keys.');
      expect(result!.custom).toEqual({ name: 'Alice', age: 30, active: true });
    });

    it('should return null for invalid JSON', () => {
      const result = createJsonSnapshot('not json {{{', 'Bad');
      expect(result).toBeNull();
    });

    it('should handle JSON arrays', () => {
      const json = '[1,2,3]';
      const result = createJsonSnapshot(json, 'Array');
      expect(result).not.toBeNull();
      // Arrays don't have "top-level keys" — no interpretation set
      expect(result!.interpretation).toBeUndefined();
      expect(result!.custom).toEqual([1, 2, 3]);
    });
  });

  describe('createCodeSnapshot', () => {
    it('should return null when content is null', () => {
      const result = createCodeSnapshot(null, 'Test');
      expect(result).toBeNull();
    });

    it('should count lines and include content in custom', () => {
      const code = 'line1\nline2\nline3';
      const result = createCodeSnapshot(code, 'My Code');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('My Code');
      expect(result!.interpretation).toBe('Code artifact, 3 lines.');
      expect(result!.custom).toEqual({ content: code, lineCount: 3 });
    });

    it('should handle single line content', () => {
      const result = createCodeSnapshot('console.log("hi")', 'One Liner');
      expect(result!.interpretation).toBe('Code artifact, 1 lines.');
      expect((result!.custom as { lineCount: number }).lineCount).toBe(1);
    });
  });

  describe('createMarkdownSnapshot', () => {
    it('should return null when content is null', () => {
      const result = createMarkdownSnapshot(null, 'Test');
      expect(result).toBeNull();
    });

    it('should include content in custom', () => {
      const md = '# Hello\n\nWorld';
      const result = createMarkdownSnapshot(md, 'My Doc');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('My Doc');
      expect(result!.custom).toEqual({ content: md });
    });
  });

  describe('createDataSnapshot', () => {
    it('should return null when spec is null', () => {
      const result = createDataSnapshot(null);
      expect(result).toBeNull();
    });

    it('should normalize a spec with columns and rows into tables', () => {
      const spec = {
        title: 'Sales Report',
        columns: [
          { field: 'Name', headerName: 'Customer Name' },
          { field: 'Amount', headerName: 'Total', sqlBaseType: 'money' },
        ],
        rows: [
          { Name: 'Alice', Amount: 100 },
          { Name: 'Bob', Amount: 200 },
        ],
      };
      const result = createDataSnapshot(spec);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Sales Report');
      expect(result!.tables).toBeDefined();
      expect(result!.tables!.length).toBeGreaterThanOrEqual(1);
      expect(result!.tables![0].rows).toHaveLength(2);
    });

    it('should use "Results" as default table name when title is missing', () => {
      const spec = {
        columns: [{ field: 'ID' }],
        rows: [{ ID: 1 }],
      };
      const result = createDataSnapshot(spec);
      expect(result).not.toBeNull();
      expect(result!.tables).toBeDefined();
      expect(result!.tables![0].name).toBe('Results');
    });
  });
});

describe('buildMultiTableSql', () => {
  it('concatenates SQL from multiple tables with headers', () => {
    const tables = [
      { name: 'customers', metadata: { sql: 'SELECT * FROM Customers' } },
      { name: 'orders', metadata: { sql: 'SELECT * FROM Orders' } },
    ];
    const result = buildMultiTableSql(tables as DataTable[]);

    expect(result).toContain('-- ═══ customers ═══');
    expect(result).toContain('SELECT * FROM Customers');
    expect(result).toContain('-- ═══ orders ═══');
    expect(result).toContain('SELECT * FROM Orders');
  });

  it('skips tables without SQL', () => {
    const tables = [
      { name: 'has_sql', metadata: { sql: 'SELECT 1' } },
      { name: 'no_sql', metadata: {} },
      { name: 'no_meta' },
    ];
    const result = buildMultiTableSql(tables as DataTable[]);

    expect(result).toContain('-- ═══ has_sql ═══');
    expect(result).not.toContain('no_sql');
    expect(result).not.toContain('no_meta');
  });

  it('returns null when no tables have SQL', () => {
    const tables = [{ name: 'a' }, { name: 'b', metadata: {} }];
    const result = buildMultiTableSql(tables as DataTable[]);
    expect(result).toBeNull();
  });
});

describe('NormalizeToTables (core utility)', () => {
  it('should return empty array for empty snapshot', () => {
    const snap = new DataSnapshot();
    expect(NormalizeToTables(snap)).toEqual([]);
  });

  it('should handle a spec with columns and rows (legacy format)', () => {
    const data = {
      columns: [{ field: 'A' }, { field: 'B' }],
      rows: [{ A: 1, B: 2 }],
    };
    const tables = NormalizeToTables(data, 'Sheet1');
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toHaveLength(1);
  });

  it('should return empty for a context-only snapshot', () => {
    const snap = new DataSnapshot();
    snap.title = 'Just a title';
    const tables = NormalizeToTables(snap);
    expect(tables).toEqual([]);
  });
});
