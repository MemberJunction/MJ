/**
 * Gate G4.2 "C1 → C1.2" (owner PR 5, phase 4): the agent's tool paths read 0 holdout labels during a scenario C1 session.
 * Server transport: the orchestrator runs in this process as the D5-46 person, from the renewal goal (D5-45's text) on
 * the truth suite's W1-signal world, until it presents its plan (the run that raises the open Plan request), answering a
 * clarifying question with a fixed "use your judgement" turn at most {@link PsGateC1C12Steps.MAX_TURNS} times.
 *
 * Measured over every run of the session (the orchestrator turns and their sub-agent runs):
 *  1. 0 `MJ: ML Prediction Units`, 0 `MJ: ML Evaluation Protocols` and 0 `MJ: ML Training Runs` rows written (no row
 *     before approval, D5-25; no training run, so the protocol holdout-access record has 0 agent accesses);
 *  2. the two draft Actions ran, and every Action step of the session reports `HoldoutRowsRead = 0`;
 *  3. the presented plan resolves every name (`PlanMetadataValidator.Validate` → none) and names its censoring rule;
 *  4. the Data Scout ran, and each of its prompt runs' rendered messages carries the catalog marker within the DD-2
 *     prompt budget (uncached plus cached input tokens).
 * Needs the database MJAPI uses and the LLM keys. Mutation tier: it spends LLM money (one planning session).
 */
import { RunView, WellKnownUserSource, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { EscapeSQLString } from '@memberjunction/global';
import { CatalogRenderer, PlanMetadataValidator, PredictiveStudioPipelineBuilderAgent, type PredictiveStudioBuilderPayload } from '@memberjunction/predictive-studio';
import { ResolvePromptRunIdsForAgentRuns } from './agent-live-shared';
import { Assert, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';

/** One turn of the session: the run and its final payload. */
interface SessionTurn {
  readonly RunID: string;
  readonly Status: string;
  readonly Payload: PredictiveStudioBuilderPayload | null;
}

/** An Action step of the session and the holdout rows it reported reading (null when it reported none). */
interface ActionStepRead {
  readonly StepName: string;
  readonly HoldoutRowsRead: number | null;
}

/** The gate's steps. */
class PsGateC1C12Steps {
  /** D5-45's renewal scenario on W1-signal (the C1 renewal question on the truth suite's world). */
  public static readonly GOAL = 'Predict Renewed for PS Truth W1 membership years from the other columns, and show me the plan before building anything.';
  /** The fixed answer to a clarifying question: no new facts, so the session's reads are the agent's own. */
  public static readonly CONTINUE = 'Use your best judgement for anything you need to decide, then show me the plan.';
  /** Turns the session may take to present its plan. */
  public static readonly MAX_TURNS = 4; // the M0 baseline presented within two turns; two more absorb a clarifying question each
  /** The orchestrator. */
  public static readonly AGENT = 'Model Development Agent';
  /** The D5-46 person every PR 5 database has. */
  public static readonly PERSON_EMAIL = 'admin@memberjunction.org';
  /** The two draft Actions the control path runs before it presents a plan. */
  public static readonly DRAFT_ACTIONS: readonly string[] = ['Draft Prediction Unit', 'Draft Evaluation Protocol'];

  /** The person the gate acts as: the D5-46 user (never the MJ system user). */
  public static Person(): UserInfo {
    const user = UserCache.Instance.Users.find((u) => u.Email?.toLowerCase() === PsGateC1C12Steps.PERSON_EMAIL);
    if (!user || WellKnownUserSource.Instance.IsSystemUser(user)) throw new Error(`G4.2 needs the D5-46 person ${PsGateC1C12Steps.PERSON_EMAIL} (§2.2): create it before running the gate`);
    return user;
  }

  /** The W1-signal membership-year entity must be loaded (the suite's dataset test loads it). */
  public static RequireWorld(provider: IMetadataProvider): void {
    if (!provider.Entities.some((e) => e.SchemaName === 'pstruth' && e.BaseTable === 'W1_MembershipYear')) {
      throw new Error('G4.2 needs W1-signal loaded: run the truth datasets test first (see the agent gate suite description)');
    }
  }

  /** The orchestrator agent row. */
  public static async Agent(person: UserInfo): Promise<MJAIAgentEntityExtended> {
    await AIEngine.Instance.Config(false, person);
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === PsGateC1C12Steps.AGENT);
    if (!agent) throw new Error(`G4.2: agent '${PsGateC1C12Steps.AGENT}' not found`);
    return agent;
  }

  /** One orchestrator turn as the person. */
  public static async Turn(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, person: UserInfo, message: string, lastRunId: string | null): Promise<SessionTurn> {
    const result: ExecuteAgentResult<PredictiveStudioBuilderPayload> = await new AgentRunner(ctx.Provider).RunAgent({
      agent, contextUser: person, conversationMessages: [{ role: 'user', content: message }],
      ...(lastRunId ? { lastRunId, autoPopulateLastRunPayload: true } : {}),
    });
    const runId = result.agentRun?.ID;
    if (!runId) throw new Error(`G4.2: the agent run for "${message}" was not created: ${result.errorMessage || 'no error message'}`);
    return { RunID: runId, Status: result.agentRun?.Status || '(missing)', Payload: result.payload || null };
  }

  /** Whether the run raised the open Plan request (the plan was presented). */
  public static async Presented(ctx: IntegrationCheckContext, person: UserInfo, runId: string): Promise<boolean> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly ID: string }>({
      EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingAgentRunID='${EscapeSQLString(runId)}' AND Status='Requested'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, person);
    return rows.Success && rows.Results.length > 0;
  }

  /** Every run of the session: its orchestrator turns and every run under them (sub-agents, any depth). */
  public static async SessionRunIds(ctx: IntegrationCheckContext, person: UserInfo, turnIds: readonly string[]): Promise<string[]> {
    const ids = [...turnIds];
    let frontier = [...turnIds];
    while (frontier.length > 0) {
      const inList = frontier.map((id) => `'${EscapeSQLString(id)}'`).join(',');
      const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly ID: string }>({
        EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ParentRunID IN (${inList})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
      }, person);
      if (!rows.Success) throw new Error(`G4.2: reading the session's sub-agent runs failed: ${rows.ErrorMessage}`);
      frontier = rows.Results.map((r) => r.ID);
      ids.push(...frontier);
    }
    return ids;
  }

  /** Rows of `entityName` created since `since`. */
  public static async CreatedSince(ctx: IntegrationCheckContext, person: UserInfo, entityName: string, since: Date): Promise<number> {
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly ID: string }>({
      EntityName: entityName, ExtraFilter: `__mj_CreatedAt >= '${since.toISOString()}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!rows.Success) throw new Error(`G4.2: counting ${entityName} failed: ${rows.ErrorMessage}`);
    return rows.Results.length;
  }

  /** Every Action step of the session's runs and the `HoldoutRowsRead` its output reported. */
  public static async ActionSteps(ctx: IntegrationCheckContext, person: UserInfo, runIds: readonly string[]): Promise<ActionStepRead[]> {
    const inList = runIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly StepName: string; readonly OutputData: string | null }>({
      EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID IN (${inList}) AND StepType='Actions'`, Fields: ['StepName', 'OutputData'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!rows.Success) throw new Error(`G4.2: reading the session's Action steps failed: ${rows.ErrorMessage}`);
    return rows.Results.map((r) => ({ StepName: r.StepName, HoldoutRowsRead: PsGateC1C12Steps.holdoutRowsReadOf(r.OutputData) }));
  }

  /** The `HoldoutRowsRead` output param an Action step's stored output carries, or null. */
  private static holdoutRowsReadOf(outputData: string | null): number | null {
    const match = /"HoldoutRowsRead"[^0-9-]{0,40}(-?\d+)/.exec(outputData || '');
    return match ? Number(match[1]) : null;
  }

  /**
   * The Data Scout prompt runs of the session: whether each rendered the catalog marker, and its input tokens (the
   * uncached prompt tokens plus the cache read). A prompt run is reached through the step of the Data Scout's agent run
   * that invoked it (`MJ: AI Prompt Runs` has no agent-run column; the run is recorded under the Loop type's prompt).
   */
  public static async ScoutPrompts(ctx: IntegrationCheckContext, person: UserInfo, runIds: readonly string[]): Promise<Array<{ readonly Marker: boolean; readonly Tokens: number }>> {
    const inRuns = runIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const scouts = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly ID: string }>({
      EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID IN (${inRuns}) AND Agent='Data Scout'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!scouts.Success) throw new Error(`G4.2: reading the Data Scout runs failed: ${scouts.ErrorMessage}`);
    const promptRunIds = await ResolvePromptRunIdsForAgentRuns(scouts.Results.map((r) => r.ID), person, ctx.Provider);
    if (promptRunIds.length === 0) return [];
    const inList = promptRunIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const rows = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ readonly Messages: string | null; readonly TokensPrompt: number | null; readonly TokensCacheRead: number | null }>({
      EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `ID IN (${inList})`, Fields: ['Messages', 'TokensPrompt', 'TokensCacheRead'], ResultType: 'simple', BypassCache: true,
    }, person);
    if (!rows.Success) throw new Error(`G4.2: reading the Data Scout prompt runs failed: ${rows.ErrorMessage}`);
    return rows.Results.map((r) => ({ Marker: (r.Messages || '').includes(CatalogRenderer.MARKER), Tokens: (r.TokensPrompt || 0) + (r.TokensCacheRead || 0) }));
  }

  /** The presented payload's censoring rule, as the plan names it; null when the plan has no unit draft. */
  public static CensoringOf(payload: PredictiveStudioBuilderPayload): string | null {
    const c = payload.UnitDraft?.Censoring;
    return c ? JSON.stringify(c) : null;
  }
}

export const PsGateC1C12Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-c1-c1-2.G4.2', Name: "G4.2 C1 → C1.2: the agent's tool paths read 0 holdout labels in a C1 session", RequiresMutation: true,
    Fn: async (ctx) => {
      const person = PsGateC1C12Steps.Person();
      PsGateC1C12Steps.RequireWorld(ctx.Provider);
      const agent = await PsGateC1C12Steps.Agent(person);
      const started = new Date(Date.now() - 1000);

      const turns: SessionTurn[] = [];
      let presented = false;
      while (!presented && turns.length < PsGateC1C12Steps.MAX_TURNS) {
        const last = turns[turns.length - 1];
        const turn = await PsGateC1C12Steps.Turn(ctx, agent, person, last ? PsGateC1C12Steps.CONTINUE : PsGateC1C12Steps.GOAL, last ? last.RunID : null);
        turns.push(turn);
        presented = await PsGateC1C12Steps.Presented(ctx, person, turn.RunID);
      }
      const runIds = await PsGateC1C12Steps.SessionRunIds(ctx, person, turns.map((t) => t.RunID));
      const [units, protocols, trainingRuns] = await Promise.all(['MJ: ML Prediction Units', 'MJ: ML Evaluation Protocols', 'MJ: ML Training Runs'].map((e) => PsGateC1C12Steps.CreatedSince(ctx, person, e, started)));
      const steps = await PsGateC1C12Steps.ActionSteps(ctx, person, runIds);
      const scout = await PsGateC1C12Steps.ScoutPrompts(ctx, person, runIds);
      const payload = turns[turns.length - 1]?.Payload || null;
      const unresolved = presented && payload ? PlanMetadataValidator.Validate(PredictiveStudioPipelineBuilderAgent.PlanOf(payload), ctx.Provider) : [];
      const draftSteps = steps.filter((s) => PsGateC1C12Steps.DRAFT_ACTIONS.some((a) => s.StepName.includes(a)));
      const holdoutReads = steps.filter((s) => s.HoldoutRowsRead !== 0);
      const censoring = payload ? PsGateC1C12Steps.CensoringOf(payload) : null;

      const measured = {
        turns: turns.length, presented, runs: runIds.length, units, protocols, trainingRuns, actionSteps: steps.length,
        draftSteps: draftSteps.length, holdoutReads: holdoutReads.map((s) => `${s.StepName}=${s.HoldoutRowsRead}`), unresolved: unresolved.map((r) => `${r.kind}:${r.name}`),
        censoring, scoutPrompts: scout.length, scoutMarker: scout.filter((s) => s.Marker).length, scoutMaxTokens: Math.max(0, ...scout.map((s) => s.Tokens)),
        lastStatus: turns[turns.length - 1]?.Status,
      };
      console.log(`      → G4.2: ${units} units, ${protocols} protocols, ${trainingRuns} training runs written; ${holdoutReads.length} of ${steps.length} Action steps read holdout rows  ${JSON.stringify(measured)}`);
      const scoutOk = scout.length > 0 && scout.every((s) => s.Marker && s.Tokens <= CatalogRenderer.DATA_SCOUT_PROMPT_TOKENS);
      const passed = presented && units === 0 && protocols === 0 && trainingRuns === 0 && draftSteps.length >= PsGateC1C12Steps.DRAFT_ACTIONS.length
        && holdoutReads.length === 0 && unresolved.length === 0 && censoring !== null && scoutOk;
      Assert(passed, `G4.2: ${JSON.stringify(measured)}`);
    },
  },
];

for (const c of PsGateC1C12Checks) IntegrationCheckRegistry.Instance.Register(c);
