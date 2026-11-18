/**
 * @module scoring/scoring-run-recorder
 *
 * The `MJ: ML Scoring Runs` row of one scoring call: written `running` before the first record is read (so a crash
 * leaves a visible row), and closed with its status, counts and refusal or first errors. A call refused before a model
 * was resolved (a withdrawn binding, a caller without the binding's authorization, a pipeline with no Published model)
 * has no model, and the table's `CK_MLScoringRun_Model` admits a model-less row only as `refused`, so such a row is
 * written once, refused, when it is closed.
 */
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { IsValidUUID } from '@memberjunction/global';
import type { Actor, EntityRef, ReadPolicy, ScoringResult, ScoringScope } from '@memberjunction/predictive-studio-core';

import type { ScoringContext } from './scoring-context';

/** The run row's request fields a model-path call names itself (`ScoringRequest`); a binding call takes the defaults. */
export interface ScoringRunRequestFields {
  /** The run row's ID, when the caller chose it. */
  readonly ID?: string;
  readonly EntityMapping?: EntityRef | null;
  readonly ReadPolicy?: ReadPolicy;
  readonly RequestedBy?: Actor;
}

/** At most this many record errors are stored on a failed run (`FirstErrors`). */
export const SCORING_FIRST_ERRORS_MAX = 20;

/** Opens and closes scoring-run rows. */
export class ScoringRunRecorder {
  /**
   * The run row of a call: saved `running` now when `model` is set; for a call with no model, an unsaved row that
   * {@link Close} saves refused.
   *
   * @throws when the scope entity is not in the provider's metadata, or the save fails
   */
  public static async Open(
    model: MJMLModelEntity | null, binding: MJMLModelScoringBindingEntity | null, scope: ScoringScope, asOf: Date, dryRun: boolean, ctx: ScoringContext,
    request: ScoringRunRequestFields = {},
  ): Promise<MJMLScoringRunEntity> {
    const run = await ctx.Provider.GetEntityObject<MJMLScoringRunEntity>('MJ: ML Scoring Runs', ctx.ContextUser);
    run.NewRecord();
    if (request.ID && IsValidUUID(request.ID)) run.ID = request.ID;
    ScoringRunRecorder.assignRequest(run, binding, scope, asOf, dryRun, ctx, request);
    run.ModelID = model ? model.ID : null;
    run.ModelVersion = model ? model.Version : null;
    run.FeatureSchemaHash = model ? model.FeatureSchemaHash : null;
    run.Status = 'running';
    run.StartedAt = new Date();
    if (model) await ScoringRunRecorder.save(run, 'open');
    return run;
  }

  /**
   * Closes the run with `result`: its status, counts, refusal or first errors, the artifact hash of a completed run and
   * the end time. A refusal writes `Written = 0`.
   *
   * @throws when a run with no model closes other than refused, or the save fails
   */
  public static async Close(run: MJMLScoringRunEntity, result: ScoringResult): Promise<void> {
    if (!run.ModelID && result.Status !== 'refused') throw new Error(`ScoringRunRecorder: a run with no model can only be refused (got ${result.Status})`);
    run.Status = result.Status;
    run.EndedAt = new Date();
    switch (result.Status) {
      case 'refused':
        run.Refusal = JSON.stringify(result.Reason);
        run.Written = 0;
        break;
      case 'failed':
        run.Total = result.Total;
        run.Failed = result.Failed;
        run.FirstErrors = JSON.stringify(result.FirstErrors.slice(0, SCORING_FIRST_ERRORS_MAX));
        run.Skipped = Math.max(0, result.Total - run.Written - result.Failed);
        break;
      case 'completed':
        run.Total = result.Total;
        run.Written = result.Written;
        run.ArtifactSha256 = result.ArtifactSha256;
        break;
    }
    await ScoringRunRecorder.save(run, 'close');
  }

  /** The actor who asked: the scheduled job run, the Record Process run, or the context user. Pure. */
  public static RequestedBy(ctx: ScoringContext): Actor {
    if (ctx.ScheduledJobRunID) return { kind: 'scheduled-job', scheduledJobRunId: ctx.ScheduledJobRunID };
    if (ctx.ProcessRunID) return { kind: 'system', component: 'record-process', processRunId: ctx.ProcessRunID };
    return { kind: 'human', userId: ctx.ContextUser.ID };
  }

  /** Sets the request columns: binding, path, scope, as-of, read policy, dry run, requester and the calling runs. */
  private static assignRequest(
    run: MJMLScoringRunEntity, binding: MJMLModelScoringBindingEntity | null, scope: ScoringScope, asOf: Date, dryRun: boolean, ctx: ScoringContext,
    request: ScoringRunRequestFields,
  ): void {
    const scopeEntity = ctx.Provider.EntityByName(scope.entity);
    if (!scopeEntity) throw new Error(`ScoringRunRecorder: the scope entity '${scope.entity}' is not in the provider's metadata`);
    const actor = request.RequestedBy || ScoringRunRecorder.RequestedBy(ctx);
    run.MLModelScoringBindingID = binding ? binding.ID : null;
    run.Path = ctx.Path;
    run.ScopeKind = scope.kind;
    run.ScopeEntityID = scopeEntity.ID;
    run.Scope = JSON.stringify(scope);
    run.EntityMapping = request.EntityMapping ? JSON.stringify(request.EntityMapping) : null;
    run.AsOfDate = asOf;
    run.ReadPolicy = JSON.stringify(request.ReadPolicy || { mode: 'complete' });
    run.DryRun = dryRun;
    run.RequestedBy = JSON.stringify(actor);
    run.RequestedByUserID = actor.kind === 'human' ? actor.userId : null;
    run.ProcessRunID = ctx.ProcessRunID;
    run.ScheduledJobRunID = ctx.ScheduledJobRunID;
    run.Total = 0;
    run.Written = 0;
    run.Failed = 0;
    run.Skipped = 0;
  }

  /** Saves the run; a failed save throws with the provider's message. */
  private static async save(run: MJMLScoringRunEntity, step: 'open' | 'close'): Promise<void> {
    if (!(await run.Save())) throw new Error(`ScoringRunRecorder: saving the scoring run (${step}) failed: ${run.LatestResult?.CompleteMessage || 'unknown error'}`);
  }
}
