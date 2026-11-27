/**
 * Gate G4.7 "W7 → C1.4" (owner PR 5, phase 4): the deterministic small-n refusal fires on W7-small-imbalanced s42 on 3
 * of 3 runs (§5.1.5, DD-5, D5-10). Client transport: the gate loads W7 s42 through the truth harness (the dataset load
 * of the suite leaves the world at its fresh seed), then runs the Model Development Agent on MJAPI three times from a
 * complete plan on the W7 membership years — no approval is involved, so the API caller runs it.
 *
 * Each run must end `decline-small-data`: the session's last decision row is that decline, carrying the profile's
 * counts (resolved and minority development rows below 200 or 50), its `profile` row read 0 holdout rows, no plan was
 * presented (no `present-plan` row, no open Plan request), and nothing was built (no claim, no Pipeline Builder run).
 * Needs MJAPI with the truth sidecar and the LLM keys (each run's first turn runs the orchestrator's prompt once).
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GraphQLAIClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAgentDecisionLogEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { AgentDecisionLog, BuildApprovalClaims, ProfileVerdict, type PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { W_WORLD_DENY_FIELDS, W_WORLD_FEATURES } from '@memberjunction/predictive-studio-truth-suite';
import { Assert, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { PsGate } from './ps-gates/ps-gate-fixture';

/** One run's outcome as the gate measures it. */
interface W7Run {
  readonly RunID: string;
  readonly Decisions: string;
  readonly Declined: boolean;
  readonly ResolvedRows: number | null;
  readonly MinorityRows: number | null;
  readonly ProfileHoldoutRowsRead: number | null;
  readonly Presented: number;
  readonly Claims: number;
  readonly BuilderRuns: number;
}

type LogRow = Pick<MJAgentDecisionLogEntity, 'Step' | 'Decision' | 'ToolCalls'>;

/** The gate's steps. */
class PsGateW7C14Steps {
  /** Runs of the session (G4.7: 3 of 3). */
  public static readonly RUNS = 3; // G4.7's "3 of 3"
  /** The orchestrator. */
  public static readonly AGENT = 'Model Development Agent';

  /** The W7 membership-year entity, after the gate loaded W7 s42. */
  public static World(provider: IMetadataProvider): string {
    const entity = provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === 'W7_MembershipYear');
    if (!entity) throw new Error('G4.7: the W7 membership-year entity is not in the metadata (run `pnpm run truth:provision`)');
    return entity.Name;
  }

  /** A complete plan predicting `Renewed` on the W7 membership years. */
  public static Plan(name: string, entityName: string): PredictiveStudioBuilderPayload {
    const features = [...W_WORLD_FEATURES];
    const plan: ModelingPlanSpec = {
      Name: name,
      Goal: `Predictive Studio truth suite (safe to delete) — predict Renewed on ${entityName}`,
      TargetDefinition: { EntityName: entityName, TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC', AsOfStrategy: { Mode: 'none' } },
      CandidateSources: [{ Kind: 'Entity', Ref: entityName, Why: 'the rows being predicted' }],
      CandidateFeatures: features.map((f) => ({ Name: f, SourceRef: entityName, Kind: 'numeric' as const, Why: 'observable on the row' })),
      LeakageNotes: W_WORLD_DENY_FIELDS.map((f) => ({ Field: f, Risk: 'identifier / world bookkeeping', Action: 'exclude' as const })),
      ProposedExperiments: [{ Label: 'logistic_regression', AlgorithmName: 'logistic_regression', FeatureSet: features, Rationale: 'truth harness', Priority: 1 }],
      ValidationStrategy: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };
    return plan;
  }

  /** The orchestrator's agent row, read through the client provider. */
  public static async Agent(ctx: IntegrationCheckContext): Promise<MJAIAgentEntityExtended> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentEntityExtended>({
      EntityName: 'MJ: AI Agents', ExtraFilter: `Name='${EscapeSQLString(PsGateW7C14Steps.AGENT)}'`, ResultType: 'entity_object', MaxRows: 1,
    }, ctx.User);
    const agent = rows.Success ? rows.Results[0] : undefined;
    if (!agent) throw new Error(`G4.7: agent '${PsGateW7C14Steps.AGENT}' not found: ${rows.ErrorMessage || 'no row'}`);
    return agent;
  }

  /** One session on MJAPI, then what it wrote. */
  public static async Session(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, plan: PredictiveStudioBuilderPayload): Promise<W7Run> {
    if (!(ctx.Provider instanceof GraphQLDataProvider)) throw new Error('G4.7 runs on the client transport (Configuration.transport = "client").');
    const result: ExecuteAgentResult<PredictiveStudioBuilderPayload> = await new GraphQLAIClient(ctx.Provider).RunAIAgent({
      agent, conversationMessages: [{ role: 'user', content: 'Show me the plan for predicting Renewed before you build anything.' }], payload: plan,
    });
    const runId = result.agentRun?.ID;
    if (!runId) throw new Error(`G4.7: the agent run was not created: ${result.errorMessage || 'no error message'}`);
    return PsGateW7C14Steps.Read(ctx.Provider, ctx.User, runId);
  }

  /** The run's decision rows, open Plan requests, claims and builder runs. */
  public static async Read(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<W7Run> {
    const id = EscapeSQLString(runId);
    const [log, requests, claims, builders] = await RunView.FromMetadataProvider(provider).RunViews([
      { EntityName: AgentDecisionLog.EntityName, ExtraFilter: `AgentRunID='${id}'`, Fields: ['Step', 'Decision', 'ToolCalls'], OrderBy: 'Step ASC', ResultType: 'simple' },
      { EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingAgentRunID='${id}'`, Fields: ['ID'], ResultType: 'simple' },
      { EntityName: BuildApprovalClaims.EntityName, ExtraFilter: `ClaimingAgentRunID='${id}'`, Fields: ['ID'], ResultType: 'simple' },
      { EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ParentRunID='${id}' AND Agent='Pipeline Builder'`, Fields: ['ID'], ResultType: 'simple' },
    ], user);
    if (!log.Success || !requests.Success || !claims.Success || !builders.Success) throw new Error(`G4.7: reading run ${runId} failed: ${log.ErrorMessage || requests.ErrorMessage || claims.ErrorMessage || builders.ErrorMessage}`);
    const rows: LogRow[] = log.Results;
    const last = rows[rows.length - 1];
    const refusal = last && last.Decision === 'decline-small-data' ? PsGateW7C14Steps.refusalOf(last.ToolCalls) : null;
    const profile = rows.find((r) => r.Decision === 'profile');
    return {
      RunID: runId, Decisions: rows.map((r) => `${r.Step}:${r.Decision}`).join(','), Declined: refusal !== null,
      ResolvedRows: refusal?.resolvedRows ?? null, MinorityRows: refusal?.minorityRows ?? null,
      ProfileHoldoutRowsRead: profile ? PsGateW7C14Steps.holdoutRowsReadOf(profile.ToolCalls) : null,
      Presented: rows.filter((r) => r.Decision === 'present-plan').length + requests.Results.length, Claims: claims.Results.length, BuilderRuns: builders.Results.length,
    };
  }

  /** The small-data refusal a decline row recorded (its counts), or null. */
  private static refusalOf(toolCalls: string): { readonly resolvedRows: number; readonly minorityRows: number } | null {
    for (const call of AgentDecisionLog.ParseToolCalls(toolCalls)) {
      const r = call.result;
      if (call.action !== 'refusal' || typeof r !== 'object' || r === null || Array.isArray(r)) continue;
      const resolved = r['resolvedRows'];
      const minority = r['minorityRows'];
      if (r['kind'] === 'small-data' && typeof resolved === 'number' && typeof minority === 'number') return { resolvedRows: resolved, minorityRows: minority };
    }
    return null;
  }

  /** The `holdoutRowsRead` a profile row recorded, or null. */
  private static holdoutRowsReadOf(toolCalls: string): number | null {
    const call = AgentDecisionLog.ParseToolCalls(toolCalls).find((c) => c.action === 'Profile Prediction Target');
    const r = call?.result;
    if (typeof r !== 'object' || r === null || Array.isArray(r)) return null;
    const read = r['holdoutRowsRead'];
    return typeof read === 'number' ? read : null;
  }
}

export const PsGateW7C14Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w7-c1-4.G4.7', Name: 'G4.7 W7 → C1.4: the small-data refusal fires on W7-small-imbalanced s42, 3 of 3', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      await h.EnsureLoaded({ Kind: 'world', ID: 'W7-small-imbalanced', Seed: 42 });
      const world = PsGateW7C14Steps.World(ctx.Provider);
      const agent = await PsGateW7C14Steps.Agent(ctx);
      const tag = `PSTruth: G4.7 ${new Date().toISOString()}`;
      const runs: W7Run[] = [];
      for (let i = 0; i < PsGateW7C14Steps.RUNS; i++) runs.push(await PsGateW7C14Steps.Session(ctx, agent, PsGateW7C14Steps.Plan(`${tag} ${i + 1}`, world)));
      const held = runs.filter((r) => r.Declined && r.ProfileHoldoutRowsRead === 0 && r.Presented === 0 && r.Claims === 0 && r.BuilderRuns === 0
        && r.ResolvedRows !== null && r.MinorityRows !== null && (r.ResolvedRows < ProfileVerdict.MIN_RESOLVED_ROWS || r.MinorityRows < ProfileVerdict.MIN_MINORITY_ROWS));
      console.log(`      → G4.7: ${held.length} of ${runs.length} W7 s42 sessions ended decline-small-data with no plan and no build  ${JSON.stringify(runs)}`);
      Assert(held.length === PsGateW7C14Steps.RUNS, `G4.7: ${held.length} of ${runs.length} runs declined small-data: ${JSON.stringify(runs)}`);
    },
  },
];

for (const c of PsGateW7C14Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w7-c1-4', PsGate.Lifecycle);
