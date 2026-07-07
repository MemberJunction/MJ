import { describe, it, expect, beforeEach } from 'vitest';
import { RecordDependencyAnalyzer } from '../lib/record-dependency-analyzer';
import type { RecordData } from '../lib/sync-engine';

/**
 * Tests for the "fields" requirement in flattenFileRecords. A normal record must carry a
 * "fields" object, but a delete tombstone (deleteRecord.delete === true) removes a record by
 * primaryKey alone and legitimately has none — it must flow through without throwing, matching
 * the exemption ValidationService already applies.
 */
describe('RecordDependencyAnalyzer.flattenFileRecords', () => {
  let analyzer: RecordDependencyAnalyzer;

  beforeEach(() => {
    analyzer = new RecordDependencyAnalyzer();
  });

  it('flattens a normal record with fields', () => {
    const records: RecordData[] = [{ fields: { Name: 'MJ' } }];
    const flattened = analyzer.flattenFileRecords(records, 'MJ: Component Registries');
    expect(flattened).toHaveLength(1);
    expect(flattened[0].record.fields).toEqual({ Name: 'MJ' });
  });

  it('flattens a delete tombstone that has no fields', () => {
    const records: RecordData[] = [
      {
        primaryKey: { ID: 'B2F8C247-D22E-4991-9A69-0F73954A68D6' },
        deleteRecord: { delete: true, deletedAt: '2026-06-18T04:21:08.722Z' },
      } as unknown as RecordData,
    ];
    const flattened = analyzer.flattenFileRecords(records, 'MJ: Component Registries');
    expect(flattened).toHaveLength(1);
    expect(flattened[0].record.deleteRecord?.delete).toBe(true);
    // Tombstones carry no lookups/FKs — they enter the graph as leaf nodes.
    expect(flattened[0].dependencies.size).toBe(0);
  });

  it('flattens a mix of a normal record and a delete tombstone', () => {
    const records: RecordData[] = [
      { fields: { Name: 'MJ' }, primaryKey: { ID: '65A86000-1514-401D-AC50-F8DF1FE76954' } },
      {
        primaryKey: { ID: 'B2F8C247-D22E-4991-9A69-0F73954A68D6' },
        deleteRecord: { delete: true },
      } as unknown as RecordData,
    ];
    const flattened = analyzer.flattenFileRecords(records, 'MJ: Component Registries');
    expect(flattened).toHaveLength(2);
  });

  it('throws when a non-delete record is missing fields', () => {
    const records: RecordData[] = [{ primaryKey: { ID: 'X' } } as unknown as RecordData];
    expect(() => analyzer.flattenFileRecords(records, 'MJ: Component Registries')).toThrow(
      /missing required "fields" property/,
    );
  });

  it('still throws for a deleteRecord with delete !== true and no fields', () => {
    const records: RecordData[] = [
      { primaryKey: { ID: 'X' }, deleteRecord: { delete: false } } as unknown as RecordData,
    ];
    expect(() => analyzer.flattenFileRecords(records, 'MJ: Component Registries')).toThrow(
      /missing required "fields" property/,
    );
  });
});
