/**
 * Gate G4.9 "C1 → C3.1" (owner PR 5, phase 4): a session halts at its token budget with at most one call of overrun,
 * and every training run logs a compute cost above 0 beside its proper score (§5.1.7; F-AG-7, F-EXP-2, F-EXP-3).
 * Server transport: the agent runs in this process as the D5-46 person (G4.1's mechanics).
 *
 * On the truth suite's W1-signal world:
 *  1. **Low token budget:** one planning session with the orchestrator's `MaxTokensPerRun` lowered (in this process
 *     only, restored after) to {@link PsGateC1C31Steps.LOW_TOKEN_CAP} → the run ends `Failed` on the `tokens`
 *     guardrail, its tree's `TotalTokensUsed` ≤ the cap + the tokens of its last prompt call, and its `RunCost`
 *     says `stoppedByBudget`.
 *  2. **A priced build:** with a compute rate set (`PS_COMPUTE_USD_PER_SECOND`, in this process only), a presented plan
 *     approved by the person builds → every training run of the build stores `ComputeCost > 0` beside its proper
 *     score (the trainer's holdout primary score), `TokensUsed` 0 or unset (no strategist or derivation call ran for it); the
 *     build's `report` row records the `RunCost` whose training parts equal the stored sums; the delivered ML Experiment
 *     Results report shows the run's stored cost line beside its primary metric (D5-A6-4, D5-A6-5); and `RunCostReport.Of`
 *     of the build run equals the stored sums: tokens = the root's `TotalTokensUsed` + the runs' `TokensUsed`, usd =
 *     the root's `TotalCost` + the runs' `ComputeCost`.
 * Needs the database MJAPI uses, the LLM keys, the D5-46 user, the truth sidecar and the truth datasets loaded.
 * Mutation tier: it spends LLM money (three runs).
 */
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJAIPromptRunEntity, MJMLBuildApprovalClaimEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AgentDecisionLog, AgentRunTree, BuildApprovalClaims, BuildApprovalResolver, RunCostReport } from '@memberjunction/predictive-studio';
import { JsonParse, TrainingRunResultsParser } from '@memberjunction/predictive-studio-core';
import { HarnessSidecar } from '@memberjunction/predictive-studio-truth-suite';
import { Assert, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGateAgentSession } from './ps-gate-c1-c3-4.checks';

type Measured = Record<string, string | number | boolean | null>;

/** The gate's halves. */
class PsGateC1C31Steps {
  /**
   * The low token budget: below one planning session's spend (M0 measured 9,483–89,348 tokens a run; the Goal Analyst's
   * prompt alone is ~29k input tokens, A3), so the session must stop on it.
   */
  public static readonly LOW_TOKEN_CAP = 15_000;
  /** The compute rate set for the priced build: any rate above 0 prices its seconds above 0. */
  public static readonly GATE_USD_PER_SECOND = '0.0001'; // $0.0001 per compute second, a gate rate (no rate is configured by default)
  /** USD sums compare at the stored scale (6 decimals). */
  public static readonly USD_TOLERANCE = 1e-6; // one unit of the stored 6-decimal scale

  /** The tree's prompt runs, newest last (by completion). */
  public static async PromptRuns(ctx: IntegrationCheckContext, person: UserInfo, tree: readonly string[]): Promise<Array<Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsed' | 'CompletedAt'>>> {
    const view = RunView.FromMetadataProvider(ctx.Provider);
    const steps = await view.RunView<Pick<MJAIAgentRunStepEntity, 'TargetLogID'>>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID IN (${AgentRunTree.InList(tree)}) AND StepType='Prompt' AND TargetLogID IS NOT NULL`, Fields: ['TargetLogID'], ResultType: 'simple', BypassCache: true,
    }, person);
    const ids = steps.Success ? steps.Results.flatMap((s) => (s.TargetLogID ? [s.TargetLogID] : [])) : [];
    if (ids.length === 0) return [];
    const prompts = await view.RunView<Pick<MJAIPromptRunEntity, 'ID' | 'TokensUsed' | 'CompletedAt'>>({
      EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `ID IN (${AgentRunTree.InList(ids)})`, Fields: ['ID', 'TokensUsed', 'CompletedAt'], OrderBy: 'CompletedAt ASC', ResultType: 'simple', BypassCache: true,
    }, person);
    if (!prompts.Success) throw new Error(`G4.9: reading the prompt runs failed: ${prompts.ErrorMessage}`);
    return prompts.Results;
  }

  /** The root run's stored totals. */
  public static async Root(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'TotalTokensUsed' | 'TotalCost'>> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'TotalTokensUsed' | 'TotalCost'>>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'Status', 'TotalTokensUsed', 'TotalCost'], ResultType: 'simple', BypassCache: true,
    }, person);
    const row = rows.Success ? rows.Results[0] : undefined;
    if (!row) throw new Error(`G4.9: run ${runId} could not be read`);
    return row;
  }

  /** The guardrail type a run step of the tree recorded, or null. */
  public static async GuardrailType(ctx: IntegrationCheckContext, person: UserInfo, tree: readonly string[]): Promise<string | null> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRunStepEntity, 'OutputData'>>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID IN (${AgentRunTree.InList(tree)}) AND OutputData LIKE '%${RunCostReport.GUARDRAIL_KEY}%'`, Fields: ['OutputData'], ResultType: 'simple', BypassCache: true,
    }, person);
    for (const r of rows.Success ? rows.Results : []) {
      const parsed = JsonParse.ParseJsonText(r.OutputData, 'OutputData');
      const tripped = parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? JsonParse.JsonObjectField(parsed.Value, RunCostReport.GUARDRAIL_KEY) : null;
      if (tripped) return JsonParse.JsonString(tripped, 'type');
    }
    return null;
  }

  /** Half 1: a planning session under the low token cap. */
  public static async LowBudget(ctx: IntegrationCheckContext, person: UserInfo, world: string): Promise<Measured> {
    const agent = await PsGateAgentSession.Agent(person, 'G4.9');
    const shipped = agent.MaxTokensPerRun;
    agent.MaxTokensPerRun = PsGateC1C31Steps.LOW_TOKEN_CAP;
    let runId: string;
    try {
      runId = (await PsGateAgentSession.Run(ctx, agent, person, `Plan a model that predicts Renewed on ${world} from its other columns, then show me the plan.`, undefined, 'G4.9')).RunID;
    } finally {
      agent.MaxTokensPerRun = shipped;
    }
    const tree = await AgentRunTree.Ids(runId, ctx.Provider, person);
    const root = await PsGateC1C31Steps.Root(ctx, person, runId);
    const prompts = await PsGateC1C31Steps.PromptRuns(ctx, person, tree);
    const lastCall = prompts.length > 0 ? prompts[prompts.length - 1].TokensUsed || 0 : 0;
    const cost = await RunCostReport.Of(runId, ctx.Provider, person);
    return {
      run: runId, status: root.Status, cap: PsGateC1C31Steps.LOW_TOKEN_CAP, totalTokens: root.TotalTokensUsed, lastCallTokens: lastCall, promptCalls: prompts.length,
      guardrail: await PsGateC1C31Steps.GuardrailType(ctx, person, tree), stoppedByBudget: cost.stoppedByBudget,
    };
  }

  /** Half 2: a priced build, its training runs and its cost report. */
  public static async PricedBuild(ctx: IntegrationCheckContext, person: UserInfo, world: string): Promise<Measured> {
    const agent = await PsGateAgentSession.Agent(person, 'G4.9');
    const plan = PsGateAgentSession.Plan(`PSTruth: G4.9 ${new Date().toISOString()} build`, world, 'Renewed');
    const presented = await PsGateAgentSession.Run(ctx, agent, person, 'Show me this plan so I can approve it.', plan, 'G4.9');
    const request = await PsGateAgentSession.PlanRequest(ctx, person, presented.RunID, 'G4.9');
    await PsGateAgentSession.Approve(request, 'G4.9');
    const resumedId = await PsGateAgentSession.ResumedRunId(ctx, person, request.ID, 'G4.9');
    const resumed = await PsGateAgentSession.Ended(ctx, person, resumedId, 'G4.9');
    const runs = await PsGateC1C31Steps.TrainingRuns(ctx, person, resumedId);
    const root = await PsGateC1C31Steps.Root(ctx, person, resumedId);
    const cost = await RunCostReport.Of(resumedId, ctx.Provider, person);
    const report = await PsGateC1C31Steps.ReportCost(ctx, person, presented.RunID, resumedId);
    const artifactLine = await PsGateC1C31Steps.ArtifactCostLine(ctx, person, resumedId);
    const expectedLine = runs.length === 1 ? PsGateC1C31Steps.ExpectedCostLine(runs[0]) : null;
    const storedTokens = (root.TotalTokensUsed || 0) + runs.reduce((s, r) => s + (r.TokensUsed || 0), 0);
    const storedUsd = (root.TotalCost || 0) + runs.reduce((s, r) => s + (r.ComputeCost || 0), 0);
    const storedSeconds = runs.reduce((s, r) => s + (r.ComputeSeconds || 0), 0);
    const storedComputeUsd = runs.reduce((s, r) => s + (r.ComputeCost || 0), 0);
    const near = (a: number | null, b: number): boolean => a !== null && Math.abs(a - b) <= PsGateC1C31Steps.USD_TOLERANCE;
    return {
      run: resumedId, status: resumed.Status, trainingRuns: runs.length,
      everyRunPricedBesideProperScore: runs.length > 0 && runs.every((r) => (r.ComputeCost || 0) > 0 && PsGateC1C31Steps.ProperScore(r.ValidationResults) !== null),
      properScores: runs.map((r) => PsGateC1C31Steps.ProperScore(r.ValidationResults) || 'none').join(','),
      tokensUsedOnRuns: runs.map((r) => r.TokensUsed ?? 'null').join(','),
      runCostTokens: cost.tokens, storedTokens, runCostUsd: cost.usd, storedUsd: Math.round(storedUsd * 1e6) / 1e6,
      runCostEqualsStored: cost.tokens === storedTokens && near(cost.usd, storedUsd) && Math.abs(cost.computeSeconds - storedSeconds) < 1e-9,
      reportComputeSeconds: report.ComputeSeconds, reportComputeUsd: report.ComputeUsd, reportPromptTokens: report.PromptTokens,
      reportEqualsStored: report.ComputeSeconds !== null && Math.abs(report.ComputeSeconds - storedSeconds) < 1e-9 && near(report.ComputeUsd, storedComputeUsd)
        && report.PromptTokens !== null && report.PromptTokens > 0 && report.PromptTokens <= (root.TotalTokensUsed || 0),
      artifactCostLine: artifactLine, expectedCostLine: expectedLine,
      artifactShowsStoredCost: expectedLine !== null && artifactLine === expectedLine,
    };
  }

  /** The build's training runs: those of the pipeline its claim names. */
  public static async TrainingRuns(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<Array<Pick<MJMLTrainingRunEntity, 'ID' | 'ComputeCost' | 'ComputeSeconds' | 'TokensUsed' | 'ValidationResults'>>> {
    const view = RunView.FromMetadataProvider(ctx.Provider);
    const claims = await view.RunView<Pick<MJMLBuildApprovalClaimEntity, 'MLTrainingPipelineID'>>({
      EntityName: BuildApprovalClaims.EntityName, ExtraFilter: `ClaimingAgentRunID='${EscapeSQLString(runId)}' AND MLTrainingPipelineID IS NOT NULL`, Fields: ['MLTrainingPipelineID'], ResultType: 'simple', BypassCache: true,
    }, person);
    const pipelines = claims.Success ? claims.Results.flatMap((c) => (c.MLTrainingPipelineID ? [c.MLTrainingPipelineID] : [])) : [];
    if (pipelines.length === 0) return [];
    const runs = await view.RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ComputeCost' | 'ComputeSeconds' | 'TokensUsed' | 'ValidationResults'>>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID IN (${AgentRunTree.InList(pipelines)})`, Fields: ['ID', 'ComputeCost', 'ComputeSeconds', 'TokensUsed', 'ValidationResults'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!runs.Success) throw new Error(`G4.9: reading the build's training runs failed: ${runs.ErrorMessage}`);
    return runs.Results;
  }

  /** The cost line the ML Experiment Results report must show for a run, from its stored columns (D5-A6-5). */
  public static ExpectedCostLine(run: Pick<MJMLTrainingRunEntity, 'ComputeSeconds' | 'ComputeCost' | 'TokensUsed'>): string {
    const usd = run.ComputeCost === null ? 'not priced' : `$${run.ComputeCost.toFixed(6)}`;
    const tokens = run.TokensUsed === null ? 'no LLM tokens recorded' : `${run.TokensUsed.toLocaleString('en-US')} LLM tokens`;
    return `- **Training cost**: ${(run.ComputeSeconds || 0).toFixed(3)} s of compute, ${usd}, ${tokens}`;
  }

  /** The cost line of the report the build delivered (its run's final payload `Markdown`), or null. */
  public static async ArtifactCostLine(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<string | null> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJAIAgentRunEntity, 'FinalPayload'>>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['FinalPayload'], ResultType: 'simple', BypassCache: true,
    }, person);
    const parsed = JsonParse.ParseJsonText(rows.Success ? rows.Results[0]?.FinalPayload || null : null, 'FinalPayload');
    const markdown = parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? JsonParse.JsonString(parsed.Value, 'Markdown') : null;
    return markdown === null ? null : markdown.split('\n').find((l) => l.startsWith('- **Training cost**')) || null;
  }

  /** The trainer's holdout primary score a run stores (`metric value`), or null. */
  public static ProperScore(validationResults: string | null): string | null {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
    if (parsed.Ok === false || parsed.Value.status !== 'completed' || parsed.Value.trainer === null) return null;
    const primary = parsed.Value.trainer.holdout.primary;
    return `${primary.metric} ${primary.value}`;
  }

  /** The `RunCost` parts the `report` row `runId` wrote in the session `sessionRunId` recorded. */
  public static async ReportCost(ctx: IntegrationCheckContext, person: UserInfo, sessionRunId: string, runId: string): Promise<{ readonly ComputeSeconds: number | null; readonly ComputeUsd: number | null; readonly PromptTokens: number | null }> {
    const rows = await AgentDecisionLog.Rows(sessionRunId, ctx.Provider, person);
    for (const row of rows.filter((r) => r.Decision === 'report' && UUIDsEqual(r.AgentRunID, runId))) {
      for (const call of row.ToolCalls) {
        const result = JsonParse.IsJsonObject(call.result) ? call.result : null;
        const cost = result ? JsonParse.JsonObjectField(result, 'runCost') : null;
        if (call.action === 'build' && cost) {
          return { ComputeSeconds: JsonParse.JsonNumber(cost, 'computeSeconds'), ComputeUsd: JsonParse.JsonNumber(cost, 'computeUsd'), PromptTokens: JsonParse.JsonNumber(cost, 'promptTokens') };
        }
      }
    }
    return { ComputeSeconds: null, ComputeUsd: null, PromptTokens: null };
  }
}

export const PsGateC1C31Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-c3-1.G4.9', Name: 'G4.9 C1 → C3.1: a session halts at its token budget (overrun ≤ one call), and every run logs its cost beside its proper score', RequiresMutation: true,
    Fn: async (ctx) => {
      HarnessSidecar.DefaultToSuiteSidecar();
      BuildApprovalClaims.Register();
      BuildApprovalResolver.Register();
      AgentDecisionLog.Register();
      const person = PsGateAgentSession.Person('G4.9');
      const world = PsGateAgentSession.World(ctx.Provider, 'G4.9');

      const low = await PsGateC1C31Steps.LowBudget(ctx, person, world);
      const rate = process.env.PS_COMPUTE_USD_PER_SECOND;
      process.env.PS_COMPUTE_USD_PER_SECOND = PsGateC1C31Steps.GATE_USD_PER_SECOND;
      let priced: Measured;
      try {
        priced = await PsGateC1C31Steps.PricedBuild(ctx, person, world);
      } finally {
        if (rate === undefined) delete process.env.PS_COMPUTE_USD_PER_SECOND;
        else process.env.PS_COMPUTE_USD_PER_SECOND = rate;
      }

      const total = typeof low.totalTokens === 'number' ? low.totalTokens : Number.POSITIVE_INFINITY;
      const lowOk = low.status === 'Failed' && low.guardrail === 'tokens' && low.stoppedByBudget === true && typeof low.lastCallTokens === 'number'
        && total <= PsGateC1C31Steps.LOW_TOKEN_CAP + low.lastCallTokens;
      const pricedOk = priced.everyRunPricedBesideProperScore === true && priced.runCostEqualsStored === true && priced.reportEqualsStored === true
        && priced.artifactShowsStoredCost === true
        && String(priced.tokensUsedOnRuns).split(',').every((t) => t === '0' || t === 'null');
      const measured = { low, priced };
      console.log(`      → G4.9: low budget ${lowOk ? 'halted' : 'did not halt'} within one call (${low.totalTokens} of ${low.cap} + ${low.lastCallTokens}); priced build ${pricedOk ? 'held' : 'failed'}  ${JSON.stringify(measured)}`);
      Assert(lowOk && pricedOk, `G4.9: ${JSON.stringify(measured)}`);
    },
  },
];

for (const c of PsGateC1C31Checks) IntegrationCheckRegistry.Instance.Register(c);
