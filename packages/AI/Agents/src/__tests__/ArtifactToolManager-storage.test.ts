import { describe, it, expect } from 'vitest';
import { ArtifactToolManager } from '../ArtifactToolManager';

describe('ArtifactToolManager.ShouldExternalizeContent', () => {
  it('returns shouldExternalize false for small content', () => {
    const result = ArtifactToolManager.ShouldExternalizeContent(1000);
    expect(result.shouldExternalize).toBe(false);
  });

  it('returns shouldExternalize true for large content', () => {
    const result = ArtifactToolManager.ShouldExternalizeContent(60_000);
    expect(result.shouldExternalize).toBe(true);
  });

  it('returns false when content is exactly at default limit', () => {
    const result = ArtifactToolManager.ShouldExternalizeContent(50_000);
    expect(result.shouldExternalize).toBe(false);
  });

  it('respects custom maxInlineChars option', () => {
    const result = ArtifactToolManager.ShouldExternalizeContent(600, { maxInlineChars: 500 });
    expect(result.shouldExternalize).toBe(true);
  });

  it('includes actual char count in reason string', () => {
    const result = ArtifactToolManager.ShouldExternalizeContent(60_000);
    expect(result.reason).toContain('60000');
  });
});

describe('ArtifactToolManager.BuildInlinePreview', () => {
  const makeTable = (rowCount: number, metadata?: Record<string, unknown>) => ({
    name: 'TestTable',
    columns: ['id', 'value'],
    rows: Array.from({ length: rowCount }, (_, i) => ({ id: i, value: `row${i}` })),
    ...(metadata ? { metadata } : {}),
  });

  const toJson = (tables: unknown[]) => JSON.stringify({ tables });

  it('returns small tables unchanged', () => {
    const input = toJson([makeTable(10)]);
    const result = ArtifactToolManager.BuildInlinePreview(input);
    expect(result).toBe(input);
  });

  it('truncates large table rows to default 30', () => {
    const input = toJson([makeTable(50)]);
    const result = JSON.parse(ArtifactToolManager.BuildInlinePreview(input));
    expect(result.tables[0].rows).toHaveLength(30);
  });

  it('respects custom maxRowsPerTable', () => {
    const input = toJson([makeTable(50)]);
    const result = JSON.parse(ArtifactToolManager.BuildInlinePreview(input, 10));
    expect(result.tables[0].rows).toHaveLength(10);
  });

  it('sets metadata.totalRowCount to original count', () => {
    const input = toJson([makeTable(50)]);
    const result = JSON.parse(ArtifactToolManager.BuildInlinePreview(input));
    expect(result.tables[0].metadata.totalRowCount).toBe(50);
  });

  it('sets metadata.truncatedForStorage to true', () => {
    const input = toJson([makeTable(50)]);
    const result = JSON.parse(ArtifactToolManager.BuildInlinePreview(input));
    expect(result.tables[0].metadata.truncatedForStorage).toBe(true);
  });

  it('returns original string for invalid JSON', () => {
    const bad = 'not valid json{{{';
    expect(ArtifactToolManager.BuildInlinePreview(bad)).toBe(bad);
  });

  it('returns unchanged when JSON has no tables array', () => {
    const input = JSON.stringify({ data: [1, 2, 3] });
    expect(ArtifactToolManager.BuildInlinePreview(input)).toBe(input);
  });

  it('truncates only large tables when multiple tables present', () => {
    const input = toJson([makeTable(5), makeTable(50), makeTable(20)]);
    const result = JSON.parse(ArtifactToolManager.BuildInlinePreview(input));
    expect(result.tables[0].rows).toHaveLength(5);
    expect(result.tables[1].rows).toHaveLength(30);
    expect(result.tables[2].rows).toHaveLength(20);
  });

  it('preserves existing metadata on truncated tables', () => {
    const input = toJson([makeTable(50, { source: 'query-x', format: 'csv' })]);
    const result = JSON.parse(ArtifactToolManager.BuildInlinePreview(input));
    expect(result.tables[0].metadata.source).toBe('query-x');
    expect(result.tables[0].metadata.format).toBe('csv');
    expect(result.tables[0].metadata.totalRowCount).toBe(50);
    expect(result.tables[0].metadata.truncatedForStorage).toBe(true);
  });
});
