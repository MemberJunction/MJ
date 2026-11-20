/**
 * The zero-schema-change measure of IT182 and gate G5.6 (Tasks M5b.6, M5b.7): two schema fingerprints differ in
 * columns, migrations or entity metadata exactly when the stored query's values moved.
 */
import { describe, it, expect } from 'vitest';
import { PsPredictionServing, type SchemaFingerprint } from '../checks/ps-prediction-serving.checks';

const BEFORE: SchemaFingerprint = { ColumnCount: 9000, ColumnChecksum: 123456, MigrationCount: 410, EntityMetadataUpdatedAt: '2026-11-19T10:00:00.000Z' };

describe('PsPredictionServing.Delta', () => {
  it('reports nothing changed for the same fingerprint', () => {
    expect(PsPredictionServing.Delta(BEFORE, { ...BEFORE })).toEqual({ ColumnsChanged: 0, MigrationsAdded: 0, EntityMetadataChanged: 0 });
  });

  it('counts added columns, and a retyped or renamed column (same count, other checksum) as one', () => {
    expect(PsPredictionServing.Delta(BEFORE, { ...BEFORE, ColumnCount: 9002, ColumnChecksum: 99 }).ColumnsChanged).toBe(2);
    expect(PsPredictionServing.Delta(BEFORE, { ...BEFORE, ColumnChecksum: 99 }).ColumnsChanged).toBe(1);
  });

  it('counts applied migrations and flags an entity-metadata change (a CodeGen run)', () => {
    const after = { ...BEFORE, MigrationCount: 411, EntityMetadataUpdatedAt: '2026-11-19T10:05:00.000Z' };
    expect(PsPredictionServing.Delta(BEFORE, after)).toEqual({ ColumnsChanged: 0, MigrationsAdded: 1, EntityMetadataChanged: 1 });
  });
});

describe('PsPredictionServing.TeardownSql (D4-230)', () => {
  const table = (entityName: string): string => `[t].[${entityName.replace(/[^A-Za-z]/g, '')}]`;
  const tag = "IT182 1 (mj-integration-test — safe to delete)";
  const statements = (): string[] => PsPredictionServing.TeardownSql(tag, table).split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  const position = (needle: string): number => statements().findIndex((s) => s.startsWith(`DELETE FROM ${needle}`));

  it('deletes every row Setup can have written by its tag alone, so a Setup that failed before its fixture was built leaves nothing', () => {
    const sql = PsPredictionServing.TeardownSql(tag, table);
    expect(sql).toContain(`'IT182 1 (mj-integration-test — safe to delete)%'`);
    expect(sql).not.toMatch(/ID = '/);
    for (const entity of ['MJFeatureValues', 'MJMLScoringRuns', 'MJMLModelScoringBindings', 'MJMLModels', 'MJMLTrainingPipelines', 'MJFiles', 'MJKnowledgeHubSavedSearches']) {
      expect(position(`[t].[${entity}]`), entity).toBeGreaterThanOrEqual(0);
    }
  });

  it('deletes children before the rows they reference', () => {
    expect(position('[t].[MJFeatureValues]')).toBeLessThan(position('[t].[MJMLModelScoringBindings]'));
    expect(position('[t].[MJMLScoringRuns]')).toBeLessThan(position('[t].[MJMLModelScoringBindings]'));
    expect(position('[t].[MJMLModelScoringBindings]')).toBeLessThan(position('[t].[MJMLTrainingPipelines]'));
    expect(position('[t].[MJMLModels]')).toBeLessThan(position('[t].[MJMLTrainingPipelines]'));
    expect(position('[t].[MJMLModels]')).toBeLessThan(position('[t].[MJFiles]'));
  });

  it('escapes the tag', () => {
    expect(PsPredictionServing.TeardownSql("IT182 o'clock", table)).toContain(`'IT182 o''clock%'`);
  });
});
