/**
 * @module agent/pipeline-builder-agent
 *
 * The Predictive Studio Agent's **code sub-agent** — the framework wrapper around the deterministic
 * {@link PredictiveStudioPipelineBuilder}. It mirrors Database Designer's `DatabaseDesignerSchemaBuilder`
 * and Agent Manager's builder: a `BaseAgent` whose `executeAgentInternal` runs **once, in pure code
 * (no LLM)**, reads the approved {@link ModelingPlanSpec} off the agent payload, builds the pipeline +
 * trains + publishes-gated-on-trust, and writes the outcome back to the payload. The conversational
 * sub-agents (Goal Analyst / Data Scout / Experiment Designer) accumulate the plan; THIS agent commits
 * it to metadata, so the structure created is type-safe and deterministic — never LLM-emitted.
 *
 * Registered by DriverClass `'PredictiveStudioPipelineBuilderAgent'` so the Model Development Agent's
 * metadata can route to it after the user approves.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { ModelingPlanSpec, TrustGrade } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPipelineBuilder, type BuildPredictionResult } from './pipeline-builder';

/** The compact, payload-safe outcome the builder writes back so the agent can narrate the result. */
export interface PredictiveStudioBuildOutcome {
  success: boolean;
  pipelineId?: string;
  modelId?: string;
  trustGrade?: TrustGrade;
  trustOneLiner?: string;
  published: boolean;
  /** When not published, the plain reason (trust gate / leakage); else null. */
  heldReason: string | null;
  /** A clean error message when the build failed; else null. */
  errorMessage: string | null;
}

/** The agent payload = the modeling plan the conversation accumulated, plus the builder's outcome. */
export interface PredictiveStudioBuilderPayload extends ModelingPlanSpec {
  BuildResult?: PredictiveStudioBuildOutcome;
  /**
   * The count of USER messages in the conversation at the moment the orchestrator last FORCED a build
   * (stamped by `PredictiveStudioModelDevAgent.determineNextStep`). After a **failed** build this is what
   * distinguishes the stale "build it" message that triggered the failed attempt (same count → no re-force,
   * the no-loop guard) from a FRESH user request to retry (higher count → deterministic rebuild).
   */
  BuildAttemptUserMessageCount?: number;
}

/** Project the rich {@link BuildPredictionResult} into the compact, payload-safe outcome (pure → testable). */
export function summarizeBuildResult(result: BuildPredictionResult): PredictiveStudioBuildOutcome {
  return {
    success: result.success,
    pipelineId: result.pipelineId,
    modelId: result.modelId,
    trustGrade: result.trust?.grade,
    trustOneLiner: result.trust?.oneLiner,
    published: result.published,
    heldReason: result.heldReason,
    errorMessage: result.errorMessage,
  };
}

/** A plain, user-facing sentence describing what the build did (for the agent's reasoning/message). */
export function buildOutcomeMessage(o: PredictiveStudioBuildOutcome): string {
  if (!o.success) return `I couldn't build the prediction: ${o.errorMessage ?? 'unknown error'}.`;
  if (o.published) return `Done — I built and published your prediction (trust: ${o.trustGrade}). It's now in your Predictions.`;
  return `I built and trained the prediction, but I'm holding it back: ${o.heldReason ?? 'it needs review before it can be published.'}`;
}

@RegisterClass(BaseAgent, 'PredictiveStudioPipelineBuilderAgent')
export class PredictiveStudioPipelineBuilderAgent extends BaseAgent {
  /**
   * Run the deterministic build once. Reads the approved plan off `params.payload`, builds the
   * pipeline + trains + publishes-gated-on-trust, writes the outcome to the payload, and terminates
   * the sub-agent with Success (build ran — even when the model is held, that's a successful run with
   * a held outcome) or Failed (the build itself errored).
   */
  protected override async executeAgentInternal<P = PredictiveStudioBuilderPayload>(
    params: ExecuteAgentParams,
    _config: AgentConfiguration,
  ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
    const payload = (params.payload ?? {}) as PredictiveStudioBuilderPayload;
    const user = params.contextUser;
    if (!user) {
      return this.codeStep<P>('Failed', payload as unknown as P, 'No context user — cannot build the pipeline.');
    }
    const provider = this.ProviderToUse;
    if (!provider) {
      return this.codeStep<P>('Failed', payload as unknown as P, 'No metadata provider available — cannot build the pipeline.');
    }

    let result: BuildPredictionResult;
    try {
      result = await this.createBuilder().build({ spec: payload, provider, user });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilderAgent: build threw: ${errorMessage}`);
      result = { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage };
    }

    const outcome = summarizeBuildResult(result);
    const newPayload = { ...payload, BuildResult: outcome } as unknown as P;
    const message = buildOutcomeMessage(outcome);
    // The deterministic builder RAN to a definite outcome — published, held (trust gate / leakage), OR
    // could-not-build (invalid plan / train error). All three are a successful *run* of this sub-agent:
    // the outcome (including any error) is recorded on the payload as `BuildResult`. Returning Success
    // guarantees that payload propagates back to the orchestrator, whose `shouldForceBuild` then sees
    // `BuildResult` and STOPS — so a deterministic build failure is narrated to the user ("I couldn't
    // build the prediction: <reason>") ONCE, never retried in a loop. (Genuine can't-run-at-all cases —
    // no user / no provider, handled above — remain `Failed`.) `BuildResult.success` preserves the real
    // pass/fail for observability regardless of the step verdict.
    return this.codeStep<P>('Success', newPayload, message);
  }

  /** Builder seam — overridden in unit tests to inject a stub (no DB / sidecar). */
  protected createBuilder(): PredictiveStudioPipelineBuilder {
    return new PredictiveStudioPipelineBuilder();
  }

  /** Shape a terminal code-agent step (no chat loop), mirroring the Database Designer base code agent. */
  private codeStep<P>(step: 'Success' | 'Failed', newPayload: P, reasoning: string): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
    const finalStep: BaseAgentNextStep<P> = { terminate: true, step, reasoning, newPayload } as BaseAgentNextStep<P>;
    if (step === 'Failed') {
      (finalStep as { message?: string; errorMessage?: string }).message = reasoning;
      (finalStep as { message?: string; errorMessage?: string }).errorMessage = reasoning;
    }
    return { finalStep, stepCount: 1 };
  }
}

/** Tree-shaking anchor — call from a manifest/loader so the @RegisterClass side effect survives bundling. */
export function LoadPredictiveStudioPipelineBuilderAgent(): void {
  /* no-op */
}
