/**
 * The zero-schema-change measure of IT187 and gate G5.6 (Tasks M5b.6, M5b.7): two schema fingerprints differ in
 * columns, migrations or entity metadata exactly when the stored query's values moved.
 */
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewResult } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { PsPredictionServing, type SchemaFingerprint, type ServingIdentities } from '../checks/ps-prediction-serving.checks';

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
  const tag = "IT187 1 (mj-integration-test — safe to delete)";
  const statements = (): string[] => PsPredictionServing.TeardownSql(tag, table).split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  const position = (needle: string): number => statements().findIndex((s) => s.startsWith(`DELETE FROM ${needle}`));

  it('deletes every row Setup can have written by its tag alone, so a Setup that failed before its fixture was built leaves nothing', () => {
    const sql = PsPredictionServing.TeardownSql(tag, table);
    expect(sql).toContain(`'IT187 1 (mj-integration-test — safe to delete)%'`);
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
    expect(PsPredictionServing.TeardownSql("IT187 o'clock", table)).toContain(`'IT187 o''clock%'`);
  });
});

describe('PsPredictionServing.ReleaseIdentities (audit M5b-4)', () => {
  /** A provider whose role read answers `roles` and whose entity creation throws (no user row can be loaded). */
  function contextWith(roles: { Success: boolean; ErrorMessage?: string }): IntegrationCheckContext {
    const metadata: Pick<IMetadataProvider, 'GetEntityObject'> = {
      GetEntityObject: async (): Promise<never> => { throw new Error('no entity object in this double'); },
    };
    const provider = Object.assign(metadata as IMetadataProvider, {
      RunView: async (): Promise<RunViewResult> => ({ Success: roles.Success, ErrorMessage: roles.ErrorMessage || '', Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, UserViewRunID: '' }),
    });
    // ReleaseIdentities reads only the provider (and passes ctx.User, unused by this double)
    const ctx: Pick<IntegrationCheckContext, 'Provider'> = { Provider: provider };
    return ctx as IntegrationCheckContext;
  }
  const identities = (userIds: string[]): ServingIdentities => ({
    Restricted: { UserID: userIds[0], Email: 'r@x', Provider: {} as IMetadataProvider },
    Authorized: { UserID: userIds[1], Email: 'a@x', Provider: {} as IMetadataProvider },
    Keys: { CreatedKeyIds: [], CreatedScopeRuleIds: [] },
    UserIDs: userIds,
  });

  it('reports a failed role read instead of treating it as no roles, and still releases the next user', async () => {
    const warnings = await PsPredictionServing.ReleaseIdentities(contextWith({ Success: false, ErrorMessage: 'role read refused' }), identities(['U1', 'U2']));
    expect(warnings).toEqual([
      "reading user U1's role rows failed: role read refused; the user and its roles are left",
      "reading user U2's role rows failed: role read refused; the user and its roles are left",
    ]);
  });

  it('turns a throwing step into a warning: teardown never throws', async () => {
    const warnings = await PsPredictionServing.ReleaseIdentities(contextWith({ Success: true }), identities(['U1', 'U2']));
    expect(warnings).toEqual(['releasing user U1 failed: no entity object in this double', 'releasing user U2 failed: no entity object in this double']);
  });
});
