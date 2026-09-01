/**
 * @module agent/statistics-pass-agent
 *
 * The Predictive Studio Agent's **statistics** code sub-agent — the framework wrapper around the
 * deterministic {@link StatisticsPass}. Mirrors {@link PredictiveStudioPipelineBuilderAgent}: a
 * `BaseAgent` whose `executeAgentInternal` runs **once, in pure code (no LLM)**, measures the
 * training partition, evaluates each proposed candidate's inherited statistical gates, and writes
 * both onto the payload.
 *
 * It runs BEFORE the architecture is chosen, which is the whole point — an algorithm picked from a
 * guidance matrix and a goal sentence is a guess; one picked knowing the class balance, the
 * per-feature association with the target, and the rows-per-feature is a decision.
 *
 * Nothing here is an opinion. The sidecar returns measurements; the hints and gate verdicts come
 * from pure functions with explicit thresholds. The conversational sub-agents may then *reason*
 * about the numbers, but they cannot change them.
 *
 * Registered by DriverClass `'PredictiveStudioStatisticsPassAgent'` so the Model Development
 * Agent's metadata can route to it.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { BaseAgent } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type {
  CandidateGateReport,
  DatasetStatistics,
  ModelingPlanSpec,
  ValidationStrategy,
} from '@memberjunction/predictive-studio-core';

import { MLComponentEngine } from '../components';
import { StatisticsPass, runStatisticsPassBestEffort } from '../statistics/statistics-pass';
import { evaluateProfileGates } from '../statistics/gates';
import { MJSidecarDescriber, type ISidecarDescriber } from '../statistics/seams';
import { modelingPlanToAssemblyParams, modelingPlanToPipelineConfig } from './modeling-plan-to-pipeline';

/** The payload this sub-agent reads and augments — the plan, plus what the pass measured. */
export interface PredictiveStudioStatisticsPayload extends ModelingPlanSpec {
  /**
   * The count of USER messages at the moment the orchestrator last forced the pass. Prevents the
   * force-route from firing twice for the same message when the pass produced nothing usable
   * (mirrors `BuildAttemptUserMessageCount` on the builder payload).
   */
  StatisticsAttemptUserMessageCount?: number;
}

/**
 * Should the orchestrator force the statistics pass?
 *
 * Yes exactly once per plan: as soon as the plan is complete enough to describe (a target entity, a
 * target variable and at least one candidate feature) and the pass has not already produced
 * `Statistics`. After that it never re-fires — re-measuring the same data on every turn would burn
 * a sidecar round trip per message and could not change the answer.
 *
 * The user-message stamp handles the one failure mode: if the pass runs and produces nothing (the
 * sidecar is down), the stamp stops it re-firing for the SAME message, while a fresh user message
 * lets it try again.
 *
 * @param payload the current agent payload
 * @param userMessageCount user messages so far — the freshness clock for a retry
 */
export function shouldForceStatisticsPass(
  payload: PredictiveStudioStatisticsPayload | undefined,
  userMessageCount?: number,
): boolean {
  if (!payload || payload.Statistics) {
    return false;
  }
  if (!isDescribable(payload)) {
    return false;
  }
  const stampedAt = payload.StatisticsAttemptUserMessageCount;
  if (stampedAt === undefined) {
    return true;
  }
  return (userMessageCount ?? 0) > stampedAt;
}

/** Is there enough of a plan to describe anything? */
function isDescribable(spec: ModelingPlanSpec): boolean {
  const target = spec.TargetDefinition;
  return (
    !!target?.EntityName?.trim() &&
    !!target?.TargetVariable?.trim() &&
    (spec.CandidateFeatures?.length ?? 0) > 0
  );
}

/** A plain, user-facing sentence describing what the pass found. */
export function statisticsOutcomeMessage(stats: DatasetStatistics | null, gates: CandidateGateReport[]): string {
  if (!stats) {
    return "I couldn't measure the data before choosing an approach, so I'll proceed on the plan alone — treat the result with extra caution.";
  }
  const parts: string[] = [
    `I looked at ${stats.RowCount.toLocaleString()} rows and ${stats.FeatureCount} candidate inputs ` +
      `(${round(stats.RowsPerFeature)} rows per input).`,
  ];
  if (stats.Target.MinorityFraction != null) {
    parts.push(`The rarer outcome is ${pct(stats.Target.MinorityFraction)} of rows.`);
  }
  const flagged = stats.Features.filter((f) => f.Hints.length > 0);
  if (flagged.length > 0) {
    parts.push(`${flagged.length} input${flagged.length === 1 ? '' : 's'} need${flagged.length === 1 ? 's' : ''} a closer look: ${flagged.slice(0, 3).map((f) => f.Name).join(', ')}${flagged.length > 3 ? '…' : ''}.`);
  }
  const blocked = gates.filter((g) => !g.Admissible);
  if (blocked.length > 0) {
    parts.push(`${blocked.length} candidate approach${blocked.length === 1 ? '' : 'es'} ruled out: ${blocked.map((g) => g.ComponentTypeName).join(', ')}.`);
  }
  return parts.join(' ');
}

@RegisterClass(BaseAgent, 'PredictiveStudioStatisticsPassAgent')
export class PredictiveStudioStatisticsPassAgent extends BaseAgent {
  /**
   * Measure once, gate the candidates, write both onto the payload, terminate.
   *
   * Returns `Success` even when the measurement itself failed — the pass RAN, and the payload
   * records the absence. That is what lets the orchestrator's `shouldForceStatisticsPass` see the
   * stamp and stop, so a sidecar outage degrades the plan to the old blind one instead of
   * deadlocking the conversation. Only genuine can't-run-at-all cases (no user, no provider) are
   * `Failed`.
   */
  protected override async executeAgentInternal<P = PredictiveStudioStatisticsPayload>(
    params: ExecuteAgentParams,
    _config: AgentConfiguration,
  ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
    const payload = (params.payload ?? {}) as PredictiveStudioStatisticsPayload;
    const user = params.contextUser;
    if (!user) {
      return this.codeStep<P>('Failed', payload as unknown as P, 'No context user — cannot measure the data.');
    }
    const provider = this.ProviderToUse;
    if (!provider) {
      return this.codeStep<P>('Failed', payload as unknown as P, 'No metadata provider available — cannot measure the data.');
    }

    const stats = await this.measure(payload, user, provider);
    const gates = stats ? await this.gateCandidates(payload, stats, user, provider) : [];

    const newPayload = {
      ...payload,
      ...(stats ? { Statistics: stats } : {}),
      ...(gates.length > 0 ? { GateReports: gates } : {}),
    } as unknown as P;
    return this.codeStep<P>('Success', newPayload, statisticsOutcomeMessage(stats, gates));
  }

  /** Run the pre-pass over the plan's own assembly params. Best-effort by design. */
  private async measure(
    spec: ModelingPlanSpec,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<DatasetStatistics | null> {
    let assembly: ReturnType<typeof modelingPlanToAssemblyParams>;
    let validation: ValidationStrategy;
    try {
      assembly = modelingPlanToAssemblyParams(spec);
      validation = modelingPlanToPipelineConfig(spec).validation;
    } catch (err) {
      // An incomplete plan is not an error here — the pass simply has nothing to describe yet.
      LogStatus(`StatisticsPassAgent: plan is not yet describable (${err instanceof Error ? err.message : String(err)}).`);
      return null;
    }

    return runStatisticsPassBestEffort(
      this.createPass(),
      {
        assembly,
        validation,
        problemType: spec.TargetDefinition.ProblemType,
        // Collinearity is the one hint that needs the O(n²) matrix; it earns its cost here because
        // two inputs that move together make BOTH their weights meaningless, and a user reading the
        // model's story would otherwise see a confident number attached to an arbitrary split.
        includeCorrelations: true,
      },
      { describer: this.createDescriber(), contextUser: user, provider },
    );
  }

  /**
   * Evaluate each proposed experiment's algorithm against its component type's inherited gates.
   * Silently yields an empty list when the component tree isn't available — the plan is still
   * usable with measurements alone, just without admissibility verdicts.
   */
  private async gateCandidates(
    spec: ModelingPlanSpec,
    stats: DatasetStatistics,
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<CandidateGateReport[]> {
    try {
      const engine = MLComponentEngine.Instance;
      await engine.Config(false, user, provider);

      const reports: CandidateGateReport[] = [];
      const seen = new Set<string>();
      for (const experiment of spec.ProposedExperiments ?? []) {
        const type = engine.FindTypeByName(experiment.AlgorithmName);
        if (!type || seen.has(type.ID)) {
          continue;
        }
        seen.add(type.ID);
        reports.push(evaluateProfileGates(engine.ResolveProfile(type.ID), stats));
      }
      return reports;
    } catch (err) {
      LogError(`StatisticsPassAgent: could not gate candidates (measurements are still available): ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** Pass seam — overridden in unit tests to inject an assembler over in-memory fixtures. */
  protected createPass(): StatisticsPass {
    return new StatisticsPass();
  }

  /** Describer seam — overridden in unit tests so no Python process is needed. */
  protected createDescriber(): ISidecarDescriber {
    return new MJSidecarDescriber();
  }

  /** Terminate the sub-agent with a definite verdict, mirroring the builder agent's shape. */
  private codeStep<P>(step: 'Success' | 'Failed', newPayload: P, reasoning: string): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
    const finalStep: BaseAgentNextStep<P> = { terminate: true, step, reasoning, newPayload } as BaseAgentNextStep<P>;
    if (step === 'Failed') {
      (finalStep as { message?: string; errorMessage?: string }).message = reasoning;
      (finalStep as { message?: string; errorMessage?: string }).errorMessage = reasoning;
    }
    return { finalStep, stepCount: 1 };
  }
}

function round(v: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Tree-shaking anchor — call from a manifest/loader so the @RegisterClass side effect survives bundling. */
export function LoadPredictiveStudioStatisticsPassAgent(): void {
  /* no-op */
}
