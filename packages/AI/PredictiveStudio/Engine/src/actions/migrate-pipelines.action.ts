/**
 * @module actions/migrate-pipelines.action
 *
 * The data migration as an Action: every ML Training Pipeline without a Prediction Unit or an Evaluation Protocol gets
 * version 1 of both, is archived, or is held, with the reason. Dry run by default; the release procedure runs the dry
 * run and the real run and compares their counts.
 */
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { UtcDay } from '@memberjunction/predictive-studio-core';
import { PipelineMigration, type MigrationDeps, type MigrationRun } from '../migration/legacy-pipeline-migration';
import { MetadataEntityFactory } from '../training/seams';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';
export { MIGRATE_PIPELINES_DRIVER_CLASS } from './driver-classes';
import { MIGRATE_PIPELINES_DRIVER_CLASS } from './driver-classes';

/** Data migration: every pipeline gets a Prediction Unit and an Evaluation Protocol, is archived, or is held — with the reason. */
@RegisterClass(BaseAction, MIGRATE_PIPELINES_DRIVER_CLASS)
export class PredictiveStudioMigratePipelinesAction extends BasePredictiveStudioAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const dryRun = this.getBooleanParam(params, 'DryRun', true);
      const run = await PipelineMigration.MigratePipelines(this.BuildMigrationDeps(params), dryRun, this.getStringArrayParam(params, 'PipelineIDs'));
      this.writeOutputs(params, run);
      const failed = run.Report.filter((r) => r.Action === 'failed');
      return failed.length === 0
        ? this.ok(params, `${dryRun ? 'Dry run: ' : ''}${run.Report.length} pipelines examined.`)
        : this.fail('PARTIAL_FAILURE', `${failed.length} pipelines failed: ${failed.map((f) => `${f.PipelineName}: ${f.Reason || 'no reason recorded'}`).join('; ')}`);
    } catch (e) {
      LogError(e);
      return this.fail('MIGRATION_FAILED', e instanceof Error ? e.message : String(e));
    }
  }

  /** The migration's deps from the run params (the request's provider and user); overridable so tests inject fakes. */
  protected BuildMigrationDeps(params: RunActionParams): MigrationDeps {
    const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts:413-419)
    return { Provider: provider, User: params.ContextUser, EntityFactory: new MetadataEntityFactory(provider), Today: UtcDay.UtcDayIso(new Date()) };
  }

  private writeOutputs(params: RunActionParams, run: MigrationRun): void {
    this.addOutputParam(params, 'Report', JSON.stringify(run.Report));
    this.addOutputParam(params, 'MigratedCount', run.MigratedCount);
    this.addOutputParam(params, 'ArchivedCount', run.ArchivedCount);
    this.addOutputParam(params, 'HeldCount', run.HeldCount);
    this.addOutputParam(params, 'SkippedCount', run.SkippedCount);
    this.addOutputParam(params, 'FailedCount', run.FailedCount);
  }
}
