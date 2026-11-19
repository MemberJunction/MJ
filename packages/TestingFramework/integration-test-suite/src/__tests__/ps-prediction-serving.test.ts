/**
 * The zero-schema-change measure of IT180 and gate G5.6 (Tasks M5b.6, M5b.7): two schema fingerprints differ in
 * columns, migrations or entity metadata exactly when the stored query's values moved.
 */
import { describe, it, expect } from 'vitest';
import { PsPredictionServing, type SchemaFingerprint } from '../checks/ps-prediction-serving.checks';

const BEFORE: SchemaFingerprint = { ColumnCount: 9000, ColumnChecksum: 123456, MigrationCount: 410, EntityMetadataUpdatedAt: '2026-11-19T10:00:00.000Z' };

describe('PsPredictionServing.Delta', () => {
  it('reports nothing changed for the same fingerprint', () => {
    expect(PsPredictionServing.Delta(BEFORE, { ...BEFORE })).toEqual({ columnsChanged: 0, migrationsAdded: 0, entityMetadataChanged: 0 });
  });

  it('counts added columns, and a retyped or renamed column (same count, other checksum) as one', () => {
    expect(PsPredictionServing.Delta(BEFORE, { ...BEFORE, ColumnCount: 9002, ColumnChecksum: 99 }).columnsChanged).toBe(2);
    expect(PsPredictionServing.Delta(BEFORE, { ...BEFORE, ColumnChecksum: 99 }).columnsChanged).toBe(1);
  });

  it('counts applied migrations and flags an entity-metadata change (a CodeGen run)', () => {
    const after = { ...BEFORE, MigrationCount: 411, EntityMetadataUpdatedAt: '2026-11-19T10:05:00.000Z' };
    expect(PsPredictionServing.Delta(BEFORE, after)).toEqual({ columnsChanged: 0, migrationsAdded: 1, entityMetadataChanged: 1 });
  });
});
