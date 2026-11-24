/**
 * @module registry/rollback-candidates
 *
 * The candidate of §5.7 R7 (a)'s rollback rule, the one implementation the lifecycle gate (after an adoption demotes a
 * pipeline's Published model, `LifecycleGate.RollBackToIncumbent`) and the Registry Check job (after it archives
 * or demotes one, `PredictiveStudioRegistryCheckJobDriver.RollBackPipeline`) share: the newest `Archived` model of the
 * pipeline that was published through the gate and whose artifact still verifies.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';

import type { IArtifactLoader } from '../scoring/types';
import { ArtifactRegistry } from './artifact-registry';
import { PublishRecords } from './publish-records';
import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

/** The model columns the rollback candidate is chosen on. */
type ArchivedModel = Pick<MJMLModelEntity, 'ID' | 'Version' | 'TrainingRunID' | 'ArtifactFileID' | 'ArtifactSha256'>;

/** Chooses the model the rollback rule publishes back. */
export class RollbackCandidates {
  /**
   * The newest (highest `Version`) `Archived` model of the pipeline with a `Delivery`, a `publish` or `adopt` record for
   * its training run ({@link PublishRecords.FindPublishForRun}: published through the gate before, the precondition the
   * gate's `rollback` purpose checks, so the gate never refuses the candidate `illegal-transition`) and an artifact that
   * verifies now ({@link ArtifactRegistry.Load}, not the stored `ArtifactStatus`); null when the pipeline has none. A
   * candidate whose bytes are gone is passed over and the next one tried.
   *
   * @throws Error when a read fails
   */
  public static async Find(pipelineId: string, loader: IArtifactLoader, ctx: RegistryContext): Promise<string | null> {
    const r = await StoredRowReads.Run<ArchivedModel>(
      {
        EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}' AND Status='Archived' AND Delivery IS NOT NULL AND TrainingRunID IS NOT NULL`,
        OrderBy: 'Version DESC', Fields: ['ID', 'Version', 'TrainingRunID', 'ArtifactFileID', 'ArtifactSha256'], ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the archived models of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const registry = ArtifactRegistry.ForContext(ctx, loader);
    for (const candidate of r.Results) {
      if (!candidate.TrainingRunID || (await PublishRecords.FindPublishForRun(candidate.TrainingRunID, ctx)) === null) continue;
      if ((await registry.Load(candidate, ctx)).Status === 'verified') return candidate.ID;
    }
    return null;
  }
}
