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
import { ImportanceDisplay, EvaluationLineage, type ModelingPlanSpec, type TrustGrade, type FeatureStepWarning } from '@memberjunction/predictive-studio-core';

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
  /** Structured warnings emitted during plan translation or training (e.g. dropped candidate features). */
  warnings?: FeatureStepWarning[];
  /** The labels of the approved experiments the build did not train (no Prediction Unit, so no search). */
  untrainedExperiments?: string[];
}


/** Feature importance entry matching MLExperimentResultsSpec. */
export interface MLFeatureImportancePayload {
  feature: string;
  importance: number;
}

/**
 * The agent payload = the modeling plan the conversation accumulated, plus the builder's outcome. `Leaderboard` is
 * the builder's own row shape, whose score may be null (an unmeasured candidate), so it replaces the plan's.
 */
export interface PredictiveStudioBuilderPayload extends Omit<ModelingPlanSpec, 'Leaderboard'> {
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
export function SummarizeBuildResult(result: BuildPredictionResult): PredictiveStudioBuildOutcome {
  return {
    success: result.success,
    pipelineId: result.pipelineId,
    modelId: result.modelId,
    trustGrade: result.trust?.grade,
    trustOneLiner: result.trust?.oneLiner,
    published: result.published,
    heldReason: result.heldReason,
    errorMessage: result.errorMessage,
    warnings: result.warnings && result.warnings.length > 0 ? result.warnings : undefined,
    untrainedExperiments: result.untrainedExperiments && result.untrainedExperiments.length > 0 ? result.untrainedExperiments : undefined,
  };
}

/**
 * The sentence naming the approved experiments a build did not train, or '' when every one was trained. Without a
 * Prediction Unit on the pipeline there is no search, so only the highest-priority experiment trains.
 */
function untrainedExperimentsNote(untrained: readonly string[] | undefined): string {
  if (!untrained || untrained.length === 0) return '';
  const count = untrained.length === 1 ? 'The other proposed experiment' : `The other ${untrained.length} proposed experiments`;
  return `${count} (${untrained.join(', ')}) ${untrained.length === 1 ? 'was' : 'were'} not trained: a search over several candidates needs a Prediction Unit on the pipeline.`;
}

/** A plain, user-facing sentence describing what the build did (for the agent's reasoning/message). */
export function BuildOutcomeMessage(o: PredictiveStudioBuildOutcome): string {
  const warningText = o.warnings && o.warnings.length > 0
    ? ` Note: ${o.warnings.length} candidate feature(s) could not be mapped to pipeline steps (${o.warnings.map(w => `${w.FeatureName}: ${w.Reason}`).join('; ')}).`
    : '';
  if (!o.success) return `I couldn't build the prediction: ${o.errorMessage ?? 'unknown error'}.${warningText}`;
  const untrained = untrainedExperimentsNote(o.untrainedExperiments);
  const untrainedText = untrained ? ` ${untrained}` : '';
  if (o.published) return `Done — I built and published your prediction (trust: ${o.trustGrade}). It's now in your Predictions.${untrainedText}${warningText}`;
  const heldMessage = o.heldReason
    ? (o.heldReason.trim().endsWith('.') ? o.heldReason.trim() : `${o.heldReason.trim()}.`)
    : 'it needs review before it can be published.';
  return `I built and trained the prediction, but I'm holding it back: ${heldMessage}${untrainedText}${warningText}`;
}

/** Parse raw feature importance off the trained MLModel entity. */
export function ParseFeatureImportance(raw: unknown): MLFeatureImportancePayload[] {
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

/** The hidden-list note for a model whose stored weights are not of a kind shown as drivers but are not split/impurity counts. */
export const UNSHOWN_IMPORTANCE_KIND_NOTE = "This model's feature weights are not of a kind we show as drivers yet.";

/**
 * The note shown where a hidden feature-importance list would be, chosen from the model's stored importance kind:
 * split/impurity counts get the reason they are hidden; any other kind (unknown, `none`) gets a neutral note.
 */
export function HiddenImportanceNote(lineageJSON: string | null | undefined): string {
  return EvaluationLineage.Read(lineageJSON || null)?.ImportanceKind === 'split_or_impurity'
    ? ImportanceDisplay.HiddenNote
    : UNSHOWN_IMPORTANCE_KIND_NOTE;
}

/**
 * Generate a clean markdown results report for the ML Experiment Results artifact. A `null` score or
 * trust grade means the model was not measured; the report says so rather than standing in a number.
 * `hiddenImportanceNote` is the note printed when `importanceHidden` (see {@link HiddenImportanceNote});
 * it defaults to the split/impurity note. `untrainedExperiments` are named in the measurement note.
 */
export function GenerateMarkdownReport(
  name: string,
  goal: string,
  targetVar: string,
  targetMetric: string,
  score: number | null,
  trustGrade: TrustGrade | null,
  oneLiner: string,
  published: boolean,
  features: MLFeatureImportancePayload[],
  leaderboard: MLLeaderboardEntryPayload[] | undefined,
  importanceHidden: boolean,
  hiddenImportanceNote: string = ImportanceDisplay.HiddenNote,
  untrainedExperiments: readonly string[] = [],
): string {
  // An unmeasured model's verdict grade is 'Poor' by construction; say "Not measured" rather than calling it a measured Poor result.
  const trustGradeLabel = trustGrade && score !== null ? trustGrade : 'Not measured';
  return renderMarkdownReport(name, targetVar, targetMetric, score, trustGradeLabel, oneLiner, published, features, leaderboard, importanceHidden, hiddenImportanceNote, untrainedExperiments);
}

/** The report body, with the trust grade already rendered as its display label. */
function renderMarkdownReport(
  name: string,
  targetVar: string,
  targetMetric: string,
  score: number | null,
  trustGradeLabel: string,
  oneLiner: string,
  published: boolean,
  features: MLFeatureImportancePayload[],
  leaderboard: MLLeaderboardEntryPayload[] | undefined,
  importanceHidden: boolean,
  hiddenImportanceNote: string,
  untrainedExperiments: readonly string[],
): string {
  const topFeatures = features.length > 0
    ? features.slice(0, 8).map((f) => `- **${f.feature}**: ${(f.importance * 100).toFixed(1)}% of the model's weight`).join('\n')
    : importanceHidden
      ? `- ${hiddenImportanceNote}`
      : '- No feature importance weights were recorded for this model.';
  const isTournament = (leaderboard?.length ?? 0) > 1;
  const hasWinner = (leaderboard ?? []).some((r) => r.isWinner === true);

  return `# Model Development Results: ${name}

## Executive Summary
${oneLiner}

## ${isTournament ? (hasWinner ? 'Winning Model Performance' : 'Selected Model Performance') : 'Model Performance'}
- **Target Variable**: \`${targetVar}\`
- **Primary Metric**: **${targetMetric}** = **${score !== null && score !== undefined ? score.toFixed(3) : 'not measured'}**
- **Trust Grade**: **${trustGradeLabel}** (${published ? 'Published to Catalog' : 'Held for Review'})
${renderLeaderboardSection(leaderboard, targetMetric, hasWinner)}
## Features the model weighted most (associations, not causes)
${topFeatures}

## How this was measured
- ${measurementNote(isSearchLeaderboard(leaderboard), untrainedExperiments)}
- Registered in the Predictive Studio Models catalog; the Trust Grade line above says whether it was published.
`;
}

/** Whether a leaderboard holds a search's inner-fold scores (optimistic by construction) rather than a holdout score. */
function isSearchLeaderboard(leaderboard: readonly MLLeaderboardEntryPayload[] | undefined): boolean {
  return (leaderboard || []).some((r) => r.optimistic === true);
}

/**
 * The leaderboard table. A search prints each candidate's inner-fold mean with its interval under a header that says
 * those scores are optimistic; any other leaderboard prints its score. An unmeasured row says so, and a leaderboard of
 * several rows with no measured one says it has no winner.
 */
function renderLeaderboardSection(leaderboard: MLLeaderboardEntryPayload[] | undefined, targetMetric: string, hasWinner: boolean): string {
  if (!leaderboard || leaderboard.length === 0) {
    return '';
  }
  const search = isSearchLeaderboard(leaderboard);
  const rows = leaderboard
    .map((r) => {
      const measured = typeof r.score === 'number';
      const scoreText = typeof r.score === 'number' ? leaderboardScoreText(r, r.score, search) : 'not measured';
      const status = r.isWinner ? '🏆 Winner (Selected)' : measured ? 'Evaluated' : 'Not measured';
      return `| ${r.rank ?? '—'} | ${r.algorithm ?? 'Candidate'} | ${scoreText} | ${status} |`;
    })
    .join('\n');
  const noWinner = leaderboard.length > 1 && !hasWinner ? '\nNo candidate was measured, so no winner was picked.\n' : '';
  // A search ranks on its inner-fold metric (the protocol's primary score), which may differ from the plan's metric.
  const header = search ? `Inner-CV ${leaderboard[0].metricName || targetMetric} [95% interval] (optimistic)` : `Score (${targetMetric})`;
  return `\n## Tournament Leaderboard\n| Rank | Algorithm | ${header} | Status |\n|---|---|---|---|\n${rows}\n${noWinner}`;
}

/** A measured row's score cell: `mean [lower, upper]` for a search row with an interval, else the score and its metric. */
function leaderboardScoreText(r: MLLeaderboardEntryPayload, score: number, search: boolean): string {
  if (search && typeof r.innerLower === 'number' && typeof r.innerUpper === 'number') {
    return `${score.toFixed(3)} [${r.innerLower.toFixed(3)}, ${r.innerUpper.toFixed(3)}]`;
  }
  return `${score.toFixed(3)}${r.metricName ? ` (${r.metricName})` : ''}`;
}

/**
 * How the result was measured. A search picked its winner on inner-fold scores over the training rows and read the
 * held-back rows once, for the winner; a build without a search scored its one model on the held-back rows, and names
 * the proposed experiments it did not train.
 */
function measurementNote(search: boolean, untrainedExperiments: readonly string[]): string {
  if (search) {
    return 'The winner is the simplest candidate whose inner-fold score is within one standard error of the best; inner-fold scores are optimistic, and the held-back rows were read once, for the winner.';
  }
  const untrained = untrainedExperimentsNote(untrainedExperiments);
  return `The score comes from the rows held back from training.${untrained ? ` ${untrained}` : ''}`;
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
      result = await this.createBuilder().Build({ spec: payload, provider, user });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      LogError(`PredictiveStudioPipelineBuilderAgent: build threw: ${errorMessage}`);
      result = { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage };
    }

    const outcome = SummarizeBuildResult(result);
    let newPayloadObj: PredictiveStudioBuilderPayload = { ...payload, BuildResult: outcome };
    let directive: ArtifactDirective | undefined;

    if (result.success) {
      const targetVar = payload.TargetDefinition?.TargetVariable ?? 'Target';
      const name = payload.Name || `${targetVar} Prediction`;
      const isReg = payload.TargetDefinition?.ProblemType === 'regression';
      const targetMetric = payload.TargetDefinition?.SuccessMetric ?? (isReg ? 'R²' : 'AUC');
      // No measured headline means no number: never stand in a made-up score for an unmeasured model.
      const scoreVal = result.trust?.headlineMetric?.value ?? null;

      const rawFeatures = ParseFeatureImportance(result.model?.FeatureImportance).sort((a, b) => b.importance - a.importance);
      const showable = ImportanceDisplay.GlobalDriversShowable(result.model?.Lineage);
      const featureBars = showable ? rawFeatures : [];
      const importanceHidden = rawFeatures.length > 0 && !showable;

      const leaderboard: MLLeaderboardEntryPayload[] = result.leaderboard ?? [];

      const bestModelName = `${name} (v${result.model?.Version ?? 1})`;
      const summaryText = result.trust?.oneLiner ?? BuildOutcomeMessage(outcome);
      const reportMarkdown = GenerateMarkdownReport(
        name,
        payload.Goal || `Predict ${targetVar}`,
        targetVar,
        targetMetric,
        scoreVal,
        result.trust?.grade ?? null,
        summaryText,
        result.published,
        featureBars,
        leaderboard,
        importanceHidden,
        HiddenImportanceNote(result.model?.Lineage),
        result.untrainedExperiments ?? [],
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
    const message = BuildOutcomeMessage(outcome);
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
