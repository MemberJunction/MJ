/**
 * @module agent/run-cost
 *
 * A Model Development Agent session's real `RunCost` (§3.3, §5.1.7; F-EXP-3, G4.9), read from what the session stored:
 *
 * - **tokens** = the agent run tree's `TotalTokensUsed` (the root row's: the framework adds each sub-agent's tokens to
 *   it) + the tokens its training runs recorded (the prompt runs attributed to their iterations, D5-A6-1);
 * - **usd** = the tree's prompt cost (the root row's `TotalCost`) + the compute cost its training runs recorded;
 * - **computeSeconds** = its training runs' compute seconds;
 * - **budget** = the session's: the agent's token cap with the protocol's compute and candidate bounds (D5-A6-2);
 * - **stoppedByBudget** = a run step of the tree tripped a guardrail, or a trainer stopped on its budget.
 *
 * A session's training runs are those of the pipelines its build claims named and those of the iterations of the
 * experiment sessions it ran.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJAIAgentEntity, MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJExperimentSessionEntity, MJExperimentSessionIterationEntity,
  MJMLBuildApprovalClaimEntity, MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { JsonParse, TrainingRunResultsParser, type Budgets, type RunCost } from '@memberjunction/predictive-studio-core';
import { AgentRunTree } from '../experiment/token-accounting';
import { BuildApprovalClaims } from './build-approval-claims';

/** The root run's totals: what the framework stored, or what a run still writing its own row holds in memory. */
export interface RunTotals {
  readonly TotalTokensUsed: number | null;
  readonly TotalCost: number | null;
}

/** A session's `RunCost` and the stored parts it was summed from (what the `report` decision row records). */
export interface RunCostBreakdown {
  readonly Cost: RunCost;
  /** The agent run tree's tokens. */
  readonly PromptTokens: number;
  /** The tokens the session's training runs recorded. */
  readonly IterationTokens: number;
  /** The agent run tree's prompt cost (USD). */
  readonly PromptUsd: number;
  /** The compute cost the session's training runs recorded (USD). */
  readonly ComputeUsd: number;
  /** The training runs summed. */
  readonly TrainingRunIDs: readonly string[];
}

type RootRow = Pick<MJAIAgentRunEntity, 'ID' | 'AgentID' | 'TotalTokensUsed' | 'TotalCost'>;
type TrainingCostRow = Pick<MJMLTrainingRunEntity, 'ID' | 'ComputeSeconds' | 'ComputeCost' | 'TokensUsed' | 'ValidationResults'>;

/** The session cost report. */
export class RunCostReport {
  /** The key a guardrail writes on the run step it stopped (`BaseAgent`'s guardrail check). */
  public static readonly GUARDRAIL_KEY = 'guardrailExceeded';
  /** USD is stored to 6 decimal places (`ComputeCost`, `TotalCost`): sums are rounded there so they compare exactly. */
  private static readonly USD_SCALE = 1e6; // 6 decimals, the scale ComputeCost and TotalCost store

  /**
   * The `RunCost` of the session rooted at `agentRunId`.
   *
   * @param rootTotals the root run's totals when the caller holds fresher ones than its stored row (a run reporting
   *   on itself); the stored row's otherwise
   * @throws when the run does not exist or a read fails
   */
  public static async Of(agentRunId: string, provider: IMetadataProvider, contextUser: UserInfo, rootTotals?: RunTotals): Promise<RunCost> {
    return (await RunCostReport.Breakdown(agentRunId, provider, contextUser, rootTotals)).Cost;
  }

  /** {@link Of} with the stored parts it summed. */
  public static async Breakdown(agentRunId: string, provider: IMetadataProvider, contextUser: UserInfo, rootTotals?: RunTotals): Promise<RunCostBreakdown> {
    const root = await RunCostReport.root(agentRunId, provider, contextUser);
    const tree = await AgentRunTree.Ids(root.ID, provider, contextUser);
    const [runs, maxTokens, guardrailTripped] = await Promise.all([
      RunCostReport.trainingRuns(tree, provider, contextUser),
      RunCostReport.tokenCap(root.AgentID, provider, contextUser),
      RunCostReport.guardrailTripped(tree, provider, contextUser),
    ]);
    return RunCostReport.Sum(rootTotals || root, runs, maxTokens, guardrailTripped);
  }

  /** The breakdown of a root's totals and its training runs (pure). */
  public static Sum(root: RunTotals, runs: readonly TrainingCostRow[], maxTokens: number, guardrailTripped: boolean): RunCostBreakdown {
    const promptTokens = root.TotalTokensUsed || 0;
    const promptUsd = root.TotalCost || 0;
    const iterationTokens = runs.reduce((sum, r) => sum + (r.TokensUsed || 0), 0);
    const computeUsd = RunCostReport.usd(runs.reduce((sum, r) => sum + (r.ComputeCost || 0), 0));
    const stored = runs.map((r) => RunCostReport.storedCost(r.ValidationResults));
    const protocol = stored.find((c) => c !== null) || null;
    const budget: Budgets = { maxComputeSeconds: protocol ? protocol.budget.maxComputeSeconds : 0, maxTokens, maxCandidates: protocol ? protocol.budget.maxCandidates : 0, hardStop: true };
    const cost: RunCost = {
      computeSeconds: runs.reduce((sum, r) => sum + (r.ComputeSeconds || 0), 0),
      tokens: promptTokens + iterationTokens,
      usd: RunCostReport.usd(promptUsd + computeUsd),
      budget,
      stoppedByBudget: guardrailTripped || stored.some((c) => c !== null && c.stoppedByBudget),
    };
    return { Cost: cost, PromptTokens: promptTokens, IterationTokens: iterationTokens, PromptUsd: promptUsd, ComputeUsd: computeUsd, TrainingRunIDs: runs.map((r) => r.ID) };
  }

  /** A USD amount at the stored scale. */
  private static usd(value: number): number {
    return Math.round(value * RunCostReport.USD_SCALE) / RunCostReport.USD_SCALE;
  }

  /** The trainer's stored cost block of a completed run, or null. */
  private static storedCost(validationResults: string | null): RunCost | null {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
    if (parsed.Ok === false || parsed.Value.status !== 'completed' || parsed.Value.trainer === null) return null;
    return parsed.Value.trainer.cost;
  }

  /** The root run's row. */
  private static async root(agentRunId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<RootRow> {
    const rows = await RunView.FromMetadataProvider(provider).RunView<RootRow>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${EscapeSQLString(agentRunId)}'`, Fields: ['ID', 'AgentID', 'TotalTokensUsed', 'TotalCost'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!rows.Success) throw new Error(`RunCostReport: reading agent run ${agentRunId} failed: ${rows.ErrorMessage || 'unknown error'}`);
    const row = rows.Results[0];
    if (!row) throw new Error(`RunCostReport: agent run ${agentRunId} does not exist`);
    return row;
  }

  /** The agent's per-run token cap (0 when it has none). */
  private static async tokenCap(agentId: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<number> {
    const rows = await RunView.FromMetadataProvider(provider).RunView<Pick<MJAIAgentEntity, 'ID' | 'MaxTokensPerRun'>>({
      EntityName: 'MJ: AI Agents', ExtraFilter: `ID='${EscapeSQLString(agentId)}'`, Fields: ['ID', 'MaxTokensPerRun'], ResultType: 'simple',
    }, contextUser);
    if (!rows.Success) throw new Error(`RunCostReport: reading agent ${agentId} failed: ${rows.ErrorMessage || 'unknown error'}`);
    return rows.Results[0]?.MaxTokensPerRun || 0;
  }

  /** True when a run step of the tree records a tripped guardrail. */
  private static async guardrailTripped(tree: readonly string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<boolean> {
    const rows = await RunView.FromMetadataProvider(provider).RunView<Pick<MJAIAgentRunStepEntity, 'OutputData'>>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID IN (${AgentRunTree.InList(tree)}) AND OutputData LIKE '%${RunCostReport.GUARDRAIL_KEY}%'`,
      Fields: ['OutputData'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!rows.Success) throw new Error(`RunCostReport: reading the run steps failed: ${rows.ErrorMessage || 'unknown error'}`);
    return rows.Results.some((s) => {
      const parsed = JsonParse.ParseJsonText(s.OutputData, 'OutputData');
      return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) && JsonParse.IsJsonObject(parsed.Value[RunCostReport.GUARDRAIL_KEY]);
    });
  }

  /** The training runs of the session: its claims' pipelines and its experiment sessions' iterations. */
  private static async trainingRuns(tree: readonly string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<TrainingCostRow[]> {
    const view = RunView.FromMetadataProvider(provider);
    const list = AgentRunTree.InList(tree);
    // One batch, two shapes: a claim row carries `MLTrainingPipelineID`, a session row `ID`.
    const [claims, sessions] = await view.RunViews<Partial<Pick<MJMLBuildApprovalClaimEntity, 'MLTrainingPipelineID'> & Pick<MJExperimentSessionEntity, 'ID'>>>([
      { EntityName: BuildApprovalClaims.EntityName, ExtraFilter: `ClaimingAgentRunID IN (${list}) AND MLTrainingPipelineID IS NOT NULL`, Fields: ['MLTrainingPipelineID'], ResultType: 'simple', BypassCache: true },
      { EntityName: 'MJ: Experiment Sessions', ExtraFilter: `AgentRunID IN (${list})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    ], contextUser);
    if (!claims.Success || !sessions.Success) throw new Error(`RunCostReport: reading the session's builds failed: ${claims.ErrorMessage || sessions.ErrorMessage || 'unknown error'}`);
    const pipelines = claims.Results.flatMap((c) => (c.MLTrainingPipelineID ? [c.MLTrainingPipelineID] : []));
    const iterations = await RunCostReport.iterationsOf(sessions.Results.flatMap((s) => (s.ID ? [s.ID] : [])), provider, contextUser);
    const predicates = [
      ...(pipelines.length > 0 ? [`PipelineID IN (${AgentRunTree.InList(pipelines)})`] : []),
      ...(iterations.length > 0 ? [`ExperimentSessionIterationID IN (${AgentRunTree.InList(iterations)})`] : []),
    ];
    if (predicates.length === 0) return [];
    const runs = await view.RunView<TrainingCostRow>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: predicates.join(' OR '), Fields: ['ID', 'ComputeSeconds', 'ComputeCost', 'TokensUsed', 'ValidationResults'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!runs.Success) throw new Error(`RunCostReport: reading the training runs failed: ${runs.ErrorMessage || 'unknown error'}`);
    return runs.Results;
  }

  /** The iterations of the experiment sessions. */
  private static async iterationsOf(sessionIds: readonly string[], provider: IMetadataProvider, contextUser: UserInfo): Promise<string[]> {
    if (sessionIds.length === 0) return [];
    const rows = await RunView.FromMetadataProvider(provider).RunView<Pick<MJExperimentSessionIterationEntity, 'ID'>>({
      EntityName: 'MJ: Experiment Session Iterations', ExtraFilter: `ExperimentSessionID IN (${AgentRunTree.InList(sessionIds)})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, contextUser);
    if (!rows.Success) throw new Error(`RunCostReport: reading the experiment iterations failed: ${rows.ErrorMessage || 'unknown error'}`);
    return rows.Results.map((r) => r.ID);
  }
}
