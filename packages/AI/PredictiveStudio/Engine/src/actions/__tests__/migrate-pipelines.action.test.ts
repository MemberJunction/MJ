import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { PredictiveStudioMigratePipelinesAction } from '../migrate-pipelines.action';
import { PipelineMigration, type MigrationDeps, type MigrationReportRow, type MigrationRun } from '../../migration/legacy-pipeline-migration';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

/** Deps the action hands the migration; the migration itself is replaced by a spy, so nothing reads them. */
const INJECTED: MigrationDeps = { Provider: {} as IMetadataProvider, User: {} as UserInfo, EntityFactory: { getEntityObject: async () => { throw new Error('not used'); } }, Today: '2026-10-31' };

/** The action with injected deps (the seam its doc names). */
class TestableMigrateAction extends PredictiveStudioMigratePipelinesAction {
  public BuiltWith: RunActionParams | null = null;
  protected override BuildMigrationDeps(params: RunActionParams): MigrationDeps {
    this.BuiltWith = params;
    return INJECTED;
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

const row = (Action: MigrationReportRow['Action'], Reason: string | null = null): MigrationReportRow =>
  ({ PipelineID: 'P-1', PipelineName: 'Renewal', Action, Reason, PredictionUnitID: null, EvaluationProtocolID: null, Cutoff: null, Notes: [] });
const runOf = (rows: MigrationReportRow[]): MigrationRun => PipelineMigration.RunOf(rows);
const params = (list: ActionParam[]): RunActionParams => ({ Params: list }) as RunActionParams;
const input = (Name: string, Value: ActionParam['Value']): ActionParam => ({ Name, Value, Type: 'Input' });
const out = (p: RunActionParams, name: string): ActionParam['Value'] => p.Params.find((x) => x.Name === name)?.Value;

/** Spies the migration and records each call's dry-run flag and pipeline subset. */
function spyMigration(result: MigrationRun): Array<{ readonly DryRun: boolean; readonly Ids: readonly string[]; readonly Deps: MigrationDeps }> {
  const calls: Array<{ readonly DryRun: boolean; readonly Ids: readonly string[]; readonly Deps: MigrationDeps }> = [];
  vi.spyOn(PipelineMigration, 'MigratePipelines').mockImplementation(async (deps, dryRun, ids) => {
    calls.push({ DryRun: dryRun, Ids: ids, Deps: deps });
    return result;
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe('PredictiveStudioMigratePipelinesAction', () => {
  it('runs a dry run by default with the injected deps and writes every count', async () => {
    const calls = spyMigration(runOf([row('would-migrate'), row('would-hold', 'r')]));
    const action = new TestableMigrateAction();
    const p = params([]);
    const r = await action.run(p);
    expect([r.Success, r.Message, calls.length, calls[0].DryRun, calls[0].Ids, calls[0].Deps === INJECTED, action.BuiltWith === p]).toEqual([true, 'Dry run: 2 pipelines examined.', 1, true, [], true, true]);
    expect(['MigratedCount', 'HeldCount', 'ArchivedCount', 'SkippedCount', 'FailedCount'].map((n) => out(p, n))).toEqual([1, 1, 0, 0, 0]);
    expect(JSON.parse(String(out(p, 'Report')))).toHaveLength(2);
  });

  it('applies the migration when DryRun is explicitly false', async () => {
    const calls = spyMigration(runOf([row('migrated')]));
    const r = await new TestableMigrateAction().run(params([input('DryRun', false)]));
    expect([r.Success, r.Message, calls[0].DryRun]).toEqual([true, '1 pipelines examined.', false]);
  });

  it('reads PipelineIDs as an array value, as JSON text, or as a comma list, dropping blanks and non-strings', async () => {
    const calls = spyMigration(runOf([]));
    const action = new TestableMigrateAction();
    await action.run(params([input('PipelineIDs', ['A', ' B ', ''])]));
    await action.run(params([input('PipelineIDs', '["A", 7, " B "]')]));
    await action.run(params([input('PipelineIDs', 'A, B,,')]));
    expect(calls.map((c) => c.Ids)).toEqual([['A', 'B'], ['A', 'B'], ['A', 'B']]);
  });

  it('returns PARTIAL_FAILURE naming each failed pipeline and its reason', async () => {
    spyMigration(runOf([row('migrated'), row('failed', 'binding the unit: save 1 refused')]));
    const p = params([input('DryRun', false)]);
    const r = await new TestableMigrateAction().run(p);
    expect([r.Success, r.ResultCode, r.Message, out(p, 'FailedCount')]).toEqual([false, 'PARTIAL_FAILURE', '1 pipelines failed: Renewal: binding the unit: save 1 refused', 1]);
  });

  it('returns MIGRATION_FAILED when the migration throws, with its message', async () => {
    vi.spyOn(PipelineMigration, 'MigratePipelines').mockRejectedValue(new Error('Loading pipelines failed: boom'));
    const errors = ConsoleCapture.Errors();
    const r = await new TestableMigrateAction().run(params([]));
    expect([r.Success, r.ResultCode, r.Message]).toEqual([false, 'MIGRATION_FAILED', 'Loading pipelines failed: boom']);
    expect(ConsoleCapture.Lines(errors).length).toBeGreaterThan(0);
  });
});
