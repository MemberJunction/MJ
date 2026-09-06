/**
 * @module agent/pipeline-builder
 *
 * The **deterministic builder** behind the Predictive Studio Agent — the Predictive Studio analogue
 * of Database Designer's schema builder and Agent Manager's `AgentSpecSync`. It takes an approved,
 * strongly-typed {@link ModelingPlanSpec} and, in pure code (NO LLM), crafts the actual metadata:
 * creates the `MJ: ML Training Pipelines` row, kicks off training, then **publishes the model only
 * if the trust verdict clears the bar** — the same `deriveTrustVerdict` gate the business UI uses, so
 * a coin-flip / unmeasured / leakage-flagged model is never silently published into the catalog.
 *
 * Used by the agent's builder sub-agent AND directly callable from a headless script/test, so the
 * "build a new prediction" path is verifiable without the full LLM loop.
 */

import { RunView, type IMetadataProvider, type UserInfo, type EntityInfo, LogError, LogStatus } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import { type ModelingPlanSpec, deriveTrustVerdict, type TrustVerdict } from '@memberjunction/predictive-studio-core';

import { modelingPlanToPipelineConfig, type PipelineConfig } from './modeling-plan-to-pipeline';
import { trainModelViaEngine, wasTrainingLeakageFlagged } from '../operations/delegation';
import { gateArchitecture, type ArchitectureGateResult } from './architecture-gate';
import { ProductionModelPromotionGate } from '../actions/promote-model.gate';
import type { PromoteModelOutcome } from '../actions/promote-model.action';
import { createTrainingPipeline } from './create-pipeline';

/** Inputs for {@link PredictiveStudioPipelineBuilder.build}. */
export interface BuildPredictionInput {
  /** The approved modeling plan the agent accumulated. */
  spec: ModelingPlanSpec;
  /** The owning provider (multi-provider correctness). */
  provider: IMetadataProvider;
  /** The acting user (isolation/audit). */
  user: UserInfo;
  /** Publish the trained model when the trust verdict clears the bar. Default true. */
  autoPublish?: boolean;
  /** Sidecar version marker recorded in lineage. */
  sidecarVersion?: string;
}

/** The outcome of building a prediction from a plan. */
export interface BuildPredictionResult {
  /** Whether the build (pipeline create + train) succeeded. */
  success: boolean;
  /** The created `MJ: ML Training Pipelines` id (present once the pipeline is created). */
  pipelineId?: string;
  /** The trained `MJ: ML Models` id (present once training completes). */
  modelId?: string;
  /** The plain-language trust verdict for the trained model. */
  trust?: TrustVerdict;
  /** Whether the model was published into the business catalog. */
  published: boolean;
  /** Whether training flagged a leakage warning (held for analyst review). */
  leakageFlagged: boolean;
  /** When not published, the plain reason (trust gate or leakage); else null. */
  heldReason: string | null;
  /** A clean error message when the build failed; else null. */
  errorMessage: string | null;
  /**
   * What this single-model build did with a decision that asked for something larger.
   *
   * `defer` and `reify` both mean *race these and compare* — which a single-model builder cannot do.
   * It builds the leading candidate, which is a reasonable thing to do and a different thing from
   * what the plan records. Left unsaid, the model reads as the decision's outcome when it is only
   * its first step; this is where that difference is stated. Null when the decision and the build
   * are the same shape.
   */
  decisionNote: string | null;
}

/**
 * State what a single-model build did with a race-shaped decision, or null when there is nothing to
 * say.
 *
 * The builder trains ONE model. `defer` and `reify` both mean "race several and compare" — running
 * that is the experiment session's job. Building the leading candidate is the right thing for this
 * path to do; presenting it as the decision's outcome is not, so the difference is named.
 */
export function describeDecisionShape(spec: ModelingPlanSpec): string | null {
  const architecture = spec.Architecture;
  const candidates = (architecture?.Candidates ?? []).map((c) => c.ComponentTypeRef).filter(Boolean);
  if (architecture?.Decision === 'defer') {
    return (
      `The architecture deferred across ${candidates.length} candidate(s) [${candidates.join(', ')}] — it asked for a ` +
      `race, and this built only the leading one. Run an experiment session to compare them.`
    );
  }
  if (architecture?.Decision === 'reify') {
    return (
      `The architecture reified [${candidates.join(', ')}] under '${architecture.ReifiedUnderComponentTypeRef}' — it ` +
      `asked for a search across that family, and this built only the leading variation. Run an experiment session ` +
      `to search it.`
    );
  }
  return null;
}

/** Deterministic builder: approved {@link ModelingPlanSpec} → pipeline + trained (+ maybe published) model. */
export class PredictiveStudioPipelineBuilder {
  /**
   * Build a prediction from an approved plan: create the pipeline, train, and publish if the trust
   * verdict clears the bar. Never throws — returns a typed result with `success`/`errorMessage`.
   */
  public async build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const { spec, provider, user, autoPublish = true, sidecarVersion = 'predictive-studio-agent' } = input;
    try {
      // Gate the LLM-authored architecture BEFORE anything is created. A malformed decision, a
      // candidate the statistics pre-pass ruled out, or a composition the component tree refuses
      // must stop here — after `createPipeline` we would be leaving an orphan row behind, and after
      // training we would have spent the compute to learn what was knowable up front.
      const gate = this.gateArchitectureForBuild(spec);
      if (!gate.Executable) {
        return {
          success: false,
          published: false,
          leakageFlagged: false,
          heldReason: null,
          errorMessage: gate.Reasons.join(' '),
          decisionNote: null,
        };
      }

      const config = modelingPlanToPipelineConfig(spec);
      const pipeline = await this.createPipeline(config, provider, user);
      const trainResult = await trainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion }, provider, user);
      const model = trainResult.model;
      const trust = deriveTrustVerdict(model);
      const leakageFlagged = wasTrainingLeakageFlagged(trainResult);

      const { published, heldReason } = await this.maybePublish(model, trust, leakageFlagged, autoPublish, user, provider);
      const decisionNote = describeDecisionShape(spec);
      if (decisionNote) {
        LogStatus(`PredictiveStudioPipelineBuilder: ${decisionNote}`);
      }
      return {
        success: true,
        pipelineId: pipeline.ID,
        modelId: model.ID,
        trust,
        published,
        leakageFlagged,
        heldReason,
        errorMessage: null,
        decisionNote,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilder.build failed: ${errorMessage}`);
      return { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage, decisionNote: null };
    }
  }

  /**
   * Architecture gate seam. Overridden in tests to inject a component engine (or to bypass the tree
   * lookup entirely); the default runs the shape + admissibility + executability checks and skips
   * the graph check, which needs a loaded tree the builder does not otherwise require.
   */
  protected gateArchitectureForBuild(spec: ModelingPlanSpec): ArchitectureGateResult {
    return gateArchitecture(spec);
  }

  /** Create + save the `MJ: ML Training Pipelines` row from the resolved config. */
  /** Create + save the pipeline row. Delegates to the shared leaf helper (see `create-pipeline.ts`). */
  protected async createPipeline(config: PipelineConfig, provider: IMetadataProvider, user: UserInfo): Promise<MJMLTrainingPipelineEntity> {
    return createTrainingPipeline(config, provider, user);
  }

  /**
   * Publish the trained model into the business catalog ONLY if the trust verdict clears the bar and
   * training wasn't leakage-flagged. Otherwise leave it Draft and return the plain held-reason.
   */
  private async maybePublish(
    model: MJMLModelEntity,
    trust: TrustVerdict,
    leakageFlagged: boolean,
    autoPublish: boolean,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<{ published: boolean; heldReason: string | null }> {
    if (!autoPublish) {
      return { published: false, heldReason: 'Not published — auto-publish was off; review and publish when ready.' };
    }
    if (leakageFlagged) {
      return { published: false, heldReason: 'Held for analyst review — training flagged a possible data-leakage issue.' };
    }
    if (!trust.canAct) {
      return { published: false, heldReason: trust.gateReason ?? 'Held — this prediction is not reliable enough to publish yet.' };
    }

    // Route through the PROMOTION GATE rather than setting Status directly. Writing the column here
    // bypassed the state machine, the leakage re-check, the scoring-Action sync and (now) the story
    // hook — so an agent-built model reached Published by a different road than a human-promoted
    // one, and quietly skipped everything the gate exists to guarantee.
    const outcome = await this.promoteViaGate(model, contextUser, provider);
    if (outcome.kind === 'promoted') {
      return { published: true, heldReason: null };
    }
    if (outcome.kind === 'refused-leakage' || outcome.kind === 'signoff-reason-required') {
      // The gate re-checks leakage independently of the training-time flag, so it can catch a model
      // the builder's own check let through. A human sign-off with a reason is the only way past it,
      // and that is deliberately not something an agent may do on its own.
      return {
        published: false,
        heldReason:
          'Held for analyst review — the promotion gate flagged a possible data-leakage issue. ' +
          'Publishing it requires a person to sign off with a reason.',
      };
    }
    throw new Error(`Trained model could not be published: ${describePromotionFailure(outcome)}`);
  }

  /** Promotion seam — overridden in tests so no live gate/DB is needed. */
  protected async promoteViaGate(
    model: MJMLModelEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<PromoteModelOutcome> {
    return new ProductionModelPromotionGate().promote({
      modelId: model.ID,
      targetStatus: 'Published',
      // An agent NEVER signs off on a leakage-flagged model — that override exists for a person who
      // can give a reason and be accountable for it.
      signOff: false,
      contextUser,
      provider,
    });
  }
}

/** A readable message for a promotion outcome that is neither success nor a leakage hold. */
function describePromotionFailure(outcome: PromoteModelOutcome): string {
  switch (outcome.kind) {
    case 'not-found':
      return 'the model row could not be found';
    case 'invalid-transition':
      return `the promotion gate refused ${outcome.currentStatus} → ${outcome.targetStatus}`;
    case 'save-failed':
      return outcome.message;
    case 'refused-leakage':
    case 'signoff-reason-required':
      return 'the promotion gate held it for leakage sign-off';
    default:
      return 'the promotion gate refused the transition';
  }
}
