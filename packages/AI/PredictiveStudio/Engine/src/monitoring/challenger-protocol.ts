/**
 * @module monitoring/challenger-protocol
 *
 * `ChallengerProtocol` — the protocol a monitoring challenger trains under (D4-180). A dated unit's protocol holds a
 * date-carved holdout with an absolute cutoff (rows on or after it are the holdout), so every later training of the
 * pipeline would train on the same rows as the incumbent and could never learn a later period. Before a fired
 * trigger's challenger trains, the cutoff is re-derived by the protocol's own default rule
 * (`ProtocolDefaults.DefaultHoldoutFor`, the year cutoff over the unit's current rows) and, when it moved, saved as the
 * protocol's next version authored by the monitoring job, the pipeline pointed at it. The incumbent's evidence stays
 * pinned to its own version. The holdout is a guard field: under `GuardFieldsEditableBy: 'human-only'` the job may not
 * change it, and the challenger is stopped with that reason.
 */
import type { MJMLEvaluationProtocolEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EvaluationProtocol, EvaluationProtocolRules, PredictionUnit, type Actor, type HoldoutSplit } from '@memberjunction/predictive-studio-core';

import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { ProtocolDefaults } from '../protocol/protocol-defaults';
import { EvaluationProtocolVersioning } from '../protocol/protocol-versioning';
import type { RegistryContext } from '../registry/registry-context';
import { MetadataEntityFactory } from '../training/seams';

/** Re-carving a monitoring challenger's date-carved holdout. */
export class ChallengerProtocol {
  /**
   * The holdout a challenger trains under: `stored` with the `fresh` default's later cutoff and an open end, when both
   * are date-carved and the default moved forward; null to keep `stored`. Pure.
   */
  public static Recarved(stored: HoldoutSplit, fresh: HoldoutSplit): HoldoutSplit | null {
    if (stored.kind !== 'date-carved' || fresh.kind !== 'date-carved') return null;
    if (fresh.cutoff <= stored.cutoff) return null;
    return { ...stored, cutoff: fresh.cutoff, holdoutEnd: null };
  }

  /**
   * Prepares the pipeline's protocol for a challenger: re-carved and saved as the next version, the pipeline pointed at
   * it, when the holdout is date-carved and the default cutoff moved. Returns null when the challenger may train, or
   * the reason it may not (the job is not allowed to edit the protocol's guard fields).
   *
   * @throws Error when a read or a save fails
   */
  public static async Prepare(pipelineId: string, author: Actor, now: Date, ctx: RegistryContext): Promise<string | null> {
    const factory = new MetadataEntityFactory(ctx.Provider);
    const pipeline = await factory.getEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', ctx.ContextUser);
    if (!(await pipeline.Load(pipelineId))) throw new Error(`Monitoring: ML Training Pipeline ${pipelineId} not found`);
    if (!pipeline.EvaluationProtocolID || !pipeline.PredictionUnitID) return null;
    const protocolRow = await factory.getEntityObject<MJMLEvaluationProtocolEntity>('MJ: ML Evaluation Protocols', ctx.ContextUser);
    if (!(await protocolRow.Load(pipeline.EvaluationProtocolID))) throw new Error(`Monitoring: Evaluation Protocol ${pipeline.EvaluationProtocolID} not found`);
    const protocol = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow);
    if (protocol.Ok === false) throw new Error(`Monitoring: Evaluation Protocol ${protocolRow.ID} does not parse: ${protocol.Errors.join('; ')}`);
    if (protocol.Value.holdout.kind !== 'date-carved') return null;
    const unitRow = await new RunViewPredictionUnitStore(ctx.Provider, ctx.ContextUser).Load(pipeline.PredictionUnitID);
    if (unitRow === null) throw new Error(`Monitoring: Prediction Unit ${pipeline.PredictionUnitID} not found`);
    const unit = PredictionUnit.ParsePredictionUnitRow(unitRow);
    if (unit.Ok === false) throw new Error(`Monitoring: Prediction Unit ${unitRow.ID} does not parse: ${unit.Errors.join('; ')}`);
    const fresh = await ProtocolDefaults.DefaultHoldoutFor(unit.Value, { DataAccess: new RunViewDataAccess(ctx.ContextUser, ctx.Provider), Metadata: new ProviderAssemblyMetadata(ctx.Provider), Now: now });
    const holdout = ChallengerProtocol.Recarved(protocol.Value.holdout, fresh);
    if (holdout === null) return null;
    if (!EvaluationProtocolRules.MayEditGuardFields(author, protocol.Value.guardFieldsEditableBy)) {
      return `the protocol's holdout is a guard field editable only by ${protocol.Value.guardFieldsEditableBy === 'human-only' ? 'a person' : 'a non-agent author'}, so monitoring cannot move its cutoff from ${protocol.Value.holdout.cutoff} to ${holdout.kind === 'date-carved' ? holdout.cutoff : ''} for a challenger`;
    }
    const next = await EvaluationProtocolVersioning.CreateNextEvaluationProtocolVersion(protocolRow, { holdout }, author, factory, ctx.ContextUser);
    pipeline.EvaluationProtocolID = next.ID;
    if (!(await pipeline.Save())) throw new Error(`Monitoring: pointing pipeline ${pipelineId} at Evaluation Protocol v${next.Version} failed: ${pipeline.LatestResult?.CompleteMessage || 'unknown error'}`);
    return null;
  }
}
