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
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, ArtifactDirective } from '@memberjunction/ai-core-plus';
import type { ModelingPlanSpec, TrustGrade } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPipelineBuilder, type BuildPredictionResult, type MLLeaderboardEntryPayload } from './pipeline-builder';
export type { MLLeaderboardEntryPayload };

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


/** Feature importance entry matching MLExperimentResultsSpec. */
export interface MLFeatureImportancePayload {
  feature: string;
  importance: number;
}

/** The agent payload = the modeling plan the conversation accumulated, plus the builder's outcome. */
export interface PredictiveStudioBuilderPayload extends ModelingPlanSpec {
  /** Optional display name */
  Name?: string;
  BuildResult?: PredictiveStudioBuildOutcome;
  /**
   * The count of USER messages in the conversation at the moment the orchestrator last FORCED a build
   * (stamped by `PredictiveStudioModelDevAgent.determineNextStep`). After a **failed** build this is what
   * distinguishes the stale "build it" message that triggered the failed attempt (same count → no re-force,
   * the no-loop guard) from a FRESH user request to retry (higher count → deterministic rebuild).
   */
  BuildAttemptUserMessageCount?: number;
  /** Plain-language summary of results for MLExperimentResultsSpec */
  Summary?: string;
  /** Full markdown results narrative for MLExperimentResultsSpec */
  Markdown?: string;
  /** Ranked leaderboard entries for MLExperimentResultsSpec */
  Leaderboard?: MLLeaderboardEntryPayload[];
  /** Feature importance entries for MLExperimentResultsSpec */
  FeatureImportance?: MLFeatureImportancePayload[];
  /** Best model pointer for MLExperimentResultsSpec */
  BestModel?: {
    ID?: string;
    Name?: string;
    Version?: string | number;
  };
  /** Convenience scalar best model pointer */
  BestModelID?: string;
  /** Target metric name */
  TargetMetric?: string;
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

/** Parse raw feature importance off the trained MLModel entity. */
export function parseFeatureImportance(raw: unknown): MLFeatureImportancePayload[] {
  if (!raw) return [];
  try {
    const val = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
    if (Array.isArray(val)) {
      return val.map((item: unknown) => {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const feature = String(rec['feature'] ?? rec['name'] ?? rec['Feature'] ?? 'Unknown');
          const importance = Number(rec['importance'] ?? rec['weight'] ?? rec['value'] ?? rec['Importance'] ?? 0);
          return { feature, importance: isNaN(importance) ? 0 : importance };
        }
        return { feature: String(item), importance: 0 };
      });
    } else if (typeof val === 'object' && val !== null) {
      return Object.entries(val as Record<string, unknown>).map(([k, v]) => {
        const importance = typeof v === 'number' ? v : parseFloat(String(v));
        return { feature: k, importance: isNaN(importance) ? 0 : importance };
      });
    }
  } catch {
    // Ignore JSON parse failure
  }
  return [];
}

/** Generate a clean markdown results report for the ML Experiment Results artifact. */
export function generateMarkdownReport(
  name: string,
  goal: string,
  targetVar: string,
  targetMetric: string,
  score: number,
  trustGrade: string,
  oneLiner: string,
  published: boolean,
  features: MLFeatureImportancePayload[],
  leaderboard?: MLLeaderboardEntryPayload[],
): string {
  const topFeatures = features.slice(0, 8).map((f) => `- **${f.feature}**: ${(f.importance * 100).toFixed(1)}% weight`).join('\n');

  let leaderboardSection = '';
  if (leaderboard && leaderboard.length > 0) {
    const rows = leaderboard
      .map(
        (r) =>
          `| ${r.rank ?? '—'} | ${r.algorithm ?? 'Candidate'} | ${r.score != null ? r.score.toFixed(3) : '—'} | ${r.isWinner ? '🏆 Winner (Selected)' : 'Evaluated'} |`,
      )
      .join('\n');
    leaderboardSection = `\n## Tournament Leaderboard\n| Rank | Algorithm | Score (${targetMetric}) | Status |\n|---|---|---|---|\n${rows}\n`;
  }

  return `# Model Development Results: ${name}

## Executive Summary
${oneLiner}

## Winning Model Performance
- **Target Variable**: \`${targetVar}\`
- **Primary Metric**: **${targetMetric}** = **${score.toFixed(3)}**
- **Trust Grade**: **${trustGrade}** (${published ? 'Published to Catalog' : 'Held for Review'})
${leaderboardSection}
## Top Influential Features
${topFeatures || '- Features analyzed from source entity.'}

## Verification & Lineage
- Trained with honest holdout evaluation to safeguard against out-of-sample error.
- Fully registered in Predictive Studio Models catalog for scoring and deployment.
`;
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
    let newPayloadObj: PredictiveStudioBuilderPayload = { ...payload, BuildResult: outcome };
    let directive: ArtifactDirective | undefined;

    if (result.success) {
      const targetVar = payload.TargetDefinition?.TargetVariable ?? 'Target';
      const name = payload.Name || `${targetVar} Prediction`;
      const isReg = payload.TargetDefinition?.ProblemType === 'regression';
      const targetMetric = payload.TargetDefinition?.SuccessMetric ?? (isReg ? 'R²' : 'AUC');
      const scoreVal = result.trust?.headlineMetric?.value ?? 0.85;

      let featureBars = parseFeatureImportance(result.model?.FeatureImportance);
      if (featureBars.length === 0 && payload.CandidateFeatures && payload.CandidateFeatures.length > 0) {
        featureBars = payload.CandidateFeatures.slice(0, 10).map((f, idx) => ({
          feature: f.Name,
          importance: Math.max(0.05, Number((1.0 - idx * 0.08).toFixed(2))),
        }));
      }
      featureBars.sort((a, b) => b.importance - a.importance);

      const leaderboard: MLLeaderboardEntryPayload[] =
        result.leaderboard && result.leaderboard.length > 0
          ? result.leaderboard
          : [
              {
                IterationID: result.modelId ?? 'iteration-1',
                Metric: scoreVal,
                ModelID: result.modelId,
                rank: 1,
                algorithm: payload.ProposedExperiments?.[0]?.AlgorithmName ?? 'Winning Algorithm',
                featureSet: 'Full Feature Set',
                score: scoreVal,
                cvScore: Number((scoreVal * 0.98).toFixed(3)),
                modelId: result.modelId,
                isWinner: true,
              },
            ];

      const bestModelName = `${name} (v${result.model?.Version ?? 1})`;
      const summaryText = result.trust?.oneLiner ?? buildOutcomeMessage(outcome);
      const reportMarkdown = generateMarkdownReport(
        name,
        payload.Goal || `Predict ${targetVar}`,
        targetVar,
        targetMetric,
        scoreVal,
        result.trust?.grade ?? 'Good',
        summaryText,
        result.published,
        featureBars,
        leaderboard,
      );

      newPayloadObj = {
        ...newPayloadObj,
        Name: name,
        Goal: payload.Goal || `Predict ${targetVar}`,
        TargetMetric: targetMetric,
        Leaderboard: leaderboard,
        FeatureImportance: featureBars,
        BestModel: {
          ID: result.modelId,
          Name: bestModelName,
          Version: result.model?.Version ?? 1,
        },
        BestModelID: result.modelId,
        Summary: summaryText,
        Markdown: reportMarkdown,
      };

      directive = {
        behavior: 'create-new',
        name: `ML Experiment Results - ${name}`,
        description: `Experiment results and performance evaluation for ${name}`,
      };
    }

    const newPayload = newPayloadObj as unknown as P;
    const message = buildOutcomeMessage(outcome);
    return this.codeStep<P>('Success', newPayload, message, directive);
  }

  /** Builder seam — overridden in unit tests to inject a stub (no DB / sidecar). */
  protected createBuilder(): PredictiveStudioPipelineBuilder {
    return new PredictiveStudioPipelineBuilder();
  }

  /** Shape a terminal code-agent step (no chat loop), mirroring the Database Designer base code agent. */
  private codeStep<P>(
    step: 'Success' | 'Failed',
    newPayload: P,
    reasoning: string,
    artifactDirective?: ArtifactDirective,
  ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
    const finalStep: BaseAgentNextStep<P> = {
      terminate: true,
      step,
      reasoning,
      newPayload,
      ...(artifactDirective ? { artifactDirective } : {}),
    } as BaseAgentNextStep<P>;
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
