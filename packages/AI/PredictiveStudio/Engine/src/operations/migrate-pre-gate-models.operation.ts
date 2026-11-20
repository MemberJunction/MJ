/**
 * @module operations/migrate-pre-gate-models.operation
 *
 * **Migrate Pre-Gate Models** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.MigratePreGateModels` operation (§5.6, D4-22). A thin adapter over
 * {@link PreGateModelMigration.RunPass}: a dry run (the default) reports the pre-change work that remains and writes
 * nothing; a writing pass runs the Registry Check job's step (g) as the job run the input names, and only such a run
 * may (ruling R9). Every read and write runs on the request's provider as its user. Failures throw, so the framework
 * wraps them as an `EXECUTION_ERROR` result preserving the message.
 */
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioMigratePreGateModelsOperation,
  type PredictiveStudioMigratePreGateModelsInput,
  type PredictiveStudioMigratePreGateModelsOutput,
} from '@memberjunction/core-entities';
import { PreGateModelMigration } from '../migration/pre-gate-model-migration';

/**
 * Server implementation of `PredictiveStudio.MigratePreGateModels`. Extends the CodeGen-emitted
 * {@link PredictiveStudioMigratePreGateModelsOperation} base and supplies only the body; registered last so it wins
 * server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.MigratePreGateModels')
export class PredictiveStudioMigratePreGateModelsServerOperation extends PredictiveStudioMigratePreGateModelsOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioMigratePreGateModelsInput,
    provider: IMetadataProvider,
    user: UserInfo,
    _context: RemoteOpServerContext,
  ): Promise<PredictiveStudioMigratePreGateModelsOutput> {
    // The operation's input is camelCase like every Remote Operation contract; the job's configuration is PascalCase.
    const config = PreGateModelMigration.ConfigFrom({
      ...(input?.batchSize === undefined ? {} : { BatchSize: input.batchSize }),
      ...(input?.retrainPerRun === undefined ? {} : { RetrainPerRun: input.retrainPerRun }),
    });
    const pass = await PreGateModelMigration.RunPass(
      { DryRun: input?.dryRun !== false, ScheduledJobRunID: input?.scheduledJobRunId || null, Config: config },
      { ContextUser: user, Provider: provider },
    );
    const counts = {
      dryRun: pass.DryRun, evidenceBearing: pass.Survey.EvidenceBearing, unverifiedArtifacts: pass.Survey.UnverifiedArtifacts,
      schedulesToDisable: pass.Survey.SchedulesToDisable, pipelinesToReEvaluate: pass.Survey.PipelinesToReEvaluate,
    };
    const d = pass.Details;
    if (d === null) return counts;
    return {
      ...counts, adopted: d.Reverified.Adopted.length, demoted: d.Reverified.Demoted.length, artifactsChanged: d.Artifacts.Changed,
      schedulesDisabled: d.Schedules.Disabled.length, retrained: d.ReEvaluation.Trained,
    };
  }
}
