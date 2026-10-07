/**
 * agent-run-audience.checks.ts — the 'agent-run-audience' bundle (AU1–AU7, IT109, deterministic tier): an agent run
 * bounded by an audience (`ExecuteAgentParams.Audience`) and by its tenant (AU7), against the real search engine, permission resolver,
 * action engine and user cache. No model is called: pre-execution RAG runs directly, actions go through
 * `BaseAgent.ExecuteSingleAction` (the seam every action call in a run passes), and AU6's run is refused before Phase 2.
 *
 * - AU1 pre-execution RAG as the context user alone searches the IT scope (a Success search-log row).
 * - AU2 the same with an audience of the seeded no-grant user (granted Search on the scope by a fixture row, so the
 *   per-reader scope gate passes): nothing is injected and the search log shows ResultCount 0 — a role-less reader
 *   reads nothing, so the intersection is empty.
 * - AU3 a reader with no grant on the scope (the seeded RLS user A): nothing is injected and exactly one Forbidden
 *   row names that reader; no search runs.
 * - AU4 the Scoped Search action through `ExecuteSingleAction` with `Audience { Intersection, [no-grant] }`: no
 *   results and no `SourceCounts` (control: the same call without the audience returns `SourceCounts`).
 * - AU5 an action that does not declare audience support (`Calculate Expression`) is refused with
 *   `AUDIENCE_UNSUPPORTED`, never runs (no Action Execution Log row — control: without the audience it writes one)
 *   and is locked out for the run.
 * - AU6 `Execute` with an audience naming an unknown user fails the run before any prompt.
 * - AU7 the run's scope is authoritative for the Scoped Search tenant (A12.14): dispatched through `ExecuteSingleAction`
 *   on a run whose `PrimaryScopeRecordID` is A, a model-supplied tenant B is refused (`INVALID_PARAM`, one Forbidden
 *   row, no search), and with no model tenant the search runs under A (a Success row recording tenant A).
 *
 * FIXTURES. Like 'agent-rag-gate' this bundle seeds NO `MJ: AI Agent Notes` (a note save embeds, which the
 * deterministic lane cannot rely on), so the scope's corpus may be empty: the proofs are the search and action
 * logs. Setup adds one `MJ: Search Scope Permissions` row granting the no-grant user Search on the IT scope by
 * `UserID`; Teardown deletes it, the prefixed search-log rows, the action-log rows and AU6's run.
 *
 * TRANSPORT: server only. Audience readers are hydrated from the server's `UserCache`, which holds the seeded users
 * only in-process; on the client transport every check skips loudly.
 */
import { DatabaseProviderBase, RunView } from '@memberjunction/core';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AgentPreExecutionRAG, BaseAgent, CircuitBreakerActionResult } from '@memberjunction/ai-agents';
import type { AgentPreExecutionRAGResult } from '@memberjunction/ai-agents';
import { SearchEngine } from '@memberjunction/search-engine';
import type {
  AgentRunAudience,
  ExecuteAgentParams,
  MJAIAgentEntityExtended,
  MJAIAgentRunEntityExtended,
  MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJActionExecutionLogEntity, MJSearchExecutionLogEntity, MJSearchScopePermissionEntity } from '@memberjunction/core-entities';
import { findUserByEmail, SEEDED_NOGRANT_EMAIL, SEEDED_SCOPED_A_EMAIL } from '@memberjunction/testing-integration';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const IT_SCOPE_NAME = 'IT: Integration Test Scope';
const SEARCH_AGENT_NAME = 'it: search agent';
const LOG_QUERY_PREFIX = 'mj-integration-test audience';
const SCOPED_SEARCH_ACTION = 'Scoped Search';
const UNSUPPORTED_ACTION = 'Calculate Expression';
/** An MJ: Users ID no user has (uuidgen). */
const UNKNOWN_USER_ID = '75F8CF59-11B7-4D1A-BF0D-99419F70BFF6';
/** AU7's run tenant and the tenant the "model" names instead (uuidgen; neither is a real record — no grant is tenant-scoped). */
const RUN_TENANT_ID = '3E0B6F0A-6C1D-4E57-9B2A-7D4C1F8E2A61';
const OTHER_TENANT_ID = 'C9A4D2E7-15B8-4F3C-A06E-5B7E9D2C4F18';

/** What Setup resolves and creates; module-level, like agent-loop-standin (no context slot is added for it). */
interface AudienceFixture {
  ScopeID: string;
  Agent: MJAIAgentEntityExtended;
  /** it-nogrant: no roles; granted Search on the IT scope by the fixture row, so it passes the scope gate and reads nothing. */
  NoGrant: UserInfo;
  /** it-rls-a: holds no grant on the IT scope, so the scope gate refuses it. */
  Ungranted: UserInfo;
  GrantID: string | null;
  Marker: string;
  ActionLogIDs: string[];
  RunIDs: string[];
}

let fixture: AudienceFixture | undefined;
/** Why Setup could not build the fixture; every check skips loudly with it. */
let unavailable = '';

function skipNote(id: string, reason: string): void {
  console.warn(`  ⚠ agent-run-audience.${id} SKIPPED — ${reason}`);
}

/** The fixture, or undefined after a loud skip note (client transport, or the seeded roster is missing). */
function fixtureFor(id: string): AudienceFixture | undefined {
  if (!fixture) skipNote(id, unavailable || 'the bundle Setup did not run');
  return fixture;
}

function intersection(...users: UserInfo[]): AgentRunAudience {
  return { Mode: 'Intersection', UserIDs: users.map((u) => u.ID) };
}

/** Run pre-execution RAG directly for the IT search agent, with an optional audience. */
async function runRAG(ctx: IntegrationCheckContext, fx: AudienceFixture, query: string, readers?: UserInfo[]): Promise<AgentPreExecutionRAGResult | null> {
  await SearchEngine.Instance.Config({}, ctx.User, false);
  return new AgentPreExecutionRAG().Execute({ agent: fx.Agent, lastUserMessage: query, contextUser: ctx.User, audienceReaders: readers });
}

type LogRow = Pick<MJSearchExecutionLogEntity, 'ID' | 'Status' | 'ResultCount' | 'FailureReason' | 'SearchScopeID' | 'PrimaryScopeRecordID'>;

/** This user's search-log rows for exactly this query and status, re-polled briefly: a Success write is fire-and-forget. */
async function searchLogRows(ctx: IntegrationCheckContext, query: string, status: LogRow['Status'], expectSome: boolean): Promise<LogRow[]> {
  for (let attempt = 0; ; attempt++) {
    const r = await new RunView().RunView<LogRow>(
      {
        EntityName: 'MJ: Search Execution Logs',
        ExtraFilter: `Status='${status}' AND UserID='${EscapeSQLString(ctx.User.ID)}' AND Query='${EscapeSQLString(query)}'`,
        Fields: ['ID', 'Status', 'ResultCount', 'FailureReason', 'SearchScopeID', 'PrimaryScopeRecordID'],
        ResultType: 'simple',
        BypassCache: true,
      },
      ctx.User,
    );
    Assert(r.Success, `Search Execution Log read failed: ${r.ErrorMessage ?? ''}`);
    if (r.Results.length > 0 || !expectSome || attempt >= 5) return r.Results;
    await settle(500);
  }
}

/**
 * A BaseAgent driven straight at ExecuteSingleAction for the IT search agent, as agent-loop-standin does. `run` adds
 * run-level params (AU7's scope), which ExecuteSingleAction stamps on every dispatch as `RunActionParams.RunScope`.
 */
function actionHarness(ctx: IntegrationCheckContext, fx: AudienceFixture, audience?: AgentRunAudience, run: Partial<ExecuteAgentParams> = {}) {
  const agent = new BaseAgent();
  (agent as unknown as { _activeProvider: unknown })._activeProvider = ctx.Provider;
  const params: ExecuteAgentParams = { agent: fx.Agent, conversationMessages: [], contextUser: ctx.User, provider: ctx.Provider, Audience: audience, ...run };
  return {
    agent,
    call: async (action: MJActionEntityExtended, actionParams: Record<string, unknown>): Promise<ActionResult> => {
      const result = await agent.ExecuteSingleAction(params, { name: action.Name, params: actionParams }, action, ctx.User);
      if (result.LogEntry?.ID) fx.ActionLogIDs.push(result.LogEntry.ID);
      return result;
    },
  };
}

async function activeAction(ctx: IntegrationCheckContext, name: string): Promise<MJActionEntityExtended | undefined> {
  await ActionEngineServer.Instance.Config(false, ctx.User);
  return ActionEngineServer.Instance.Actions.find((a) => a.Name === name && a.Status === 'Active');
}

const paramNames = (result: ActionResult): string[] => (result.Params ?? []).filter((p) => p.Type !== 'Input').map((p) => p.Name);

/** Action Execution Log rows for this action whose recorded Params carry the marker. */
async function actionLogRows(ctx: IntegrationCheckContext, actionID: string, marker: string): Promise<Array<{ ID: string }>> {
  const r = await new RunView().RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Action Execution Logs',
      ExtraFilter: `ActionID='${EscapeSQLString(actionID)}' AND Params LIKE '%${EscapeSQLString(marker)}%'`,
      Fields: ['ID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  Assert(r.Success, `Action Execution Log read failed: ${r.ErrorMessage ?? ''}`);
  return r.Results;
}

export const AgentRunAudienceChecks: NamedCheck[] = [
  {
    Id: 'agent-run-audience.AU1',
    Name: 'AU1: (deterministic) pre-execution RAG as the context user alone searches the IT scope: a Success search-log row, no Forbidden row',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU1');
      if (!fx) return;
      const query = `${LOG_QUERY_PREFIX} ${fx.Marker} caller alone`;
      const result = await runRAG(ctx, fx, query);
      if (result) {
        Assert(result.queriedScopeIDs.some((id) => UUIDsEqual(id, fx.ScopeID)), 'the IT scope was not among the scopes searched');
      }
      AssertEqual((await searchLogRows(ctx, query, 'Forbidden', false)).length, 0, 'the caller alone must write no Forbidden row');
      const ran = await searchLogRows(ctx, query, 'Success', true);
      Assert(ran.length >= 1, 'the caller alone must leave a Success search-log row (the gate let the search run)');
      console.log(`      → caller alone: ${ran.length} Success row(s)${result ? `, ${result.combinedResults.length} result(s)` : ', empty corpus'}`);
    },
  },
  {
    Id: 'agent-run-audience.AU2',
    Name: 'AU2: (deterministic) the same with an audience of the no-grant user: nothing injected, the search ran and logged ResultCount 0',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU2');
      if (!fx) return;
      const query = `${LOG_QUERY_PREFIX} ${fx.Marker} room of nogrant`;
      AssertEqual(await runRAG(ctx, fx, query, [fx.NoGrant]), null, 'a room with a role-less reader must have nothing injected');
      AssertEqual((await searchLogRows(ctx, query, 'Forbidden', false)).length, 0, 'the granted reader must pass the scope gate (no Forbidden row)');
      const ran = await searchLogRows(ctx, query, 'Success', true);
      Assert(ran.length >= 1, 'the search must have run for the room (a Success row): the reader passed the gate on the fixture grant');
      Assert(ran.every((r) => r.ResultCount === 0), `the room's search must log ResultCount 0, got ${ran.map((r) => r.ResultCount).join(', ')}`);
      console.log(`      → room with the no-grant reader: ${ran.length} Success row(s), ResultCount 0, nothing injected`);
    },
  },
  {
    Id: 'agent-run-audience.AU3',
    Name: 'AU3: (deterministic) a reader with no grant on the scope: nothing injected, exactly one Forbidden row naming that reader, no search',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU3');
      if (!fx) return;
      const query = `${LOG_QUERY_PREFIX} ${fx.Marker} room of ungranted`;
      AssertEqual(await runRAG(ctx, fx, query, [fx.Ungranted]), null, 'a scope refused for a reader must inject nothing');
      const refused = await searchLogRows(ctx, query, 'Forbidden', true);
      AssertEqual(refused.length, 1, 'exactly one Forbidden row for the refused reader');
      Assert(!!refused[0].SearchScopeID && UUIDsEqual(refused[0].SearchScopeID, fx.ScopeID), 'the Forbidden row must name the IT scope');
      const reason = refused[0].FailureReason ?? '';
      Assert(reason.toLowerCase().includes(fx.Ungranted.ID.toLowerCase()), `the Forbidden row must name the reader: ${reason}`);
      AssertEqual((await searchLogRows(ctx, query, 'Success', false)).length, 0, 'no search may run for a refused room');
      console.log('      → ungranted reader: null, one Forbidden row naming them, no search');
    },
  },
  {
    Id: 'agent-run-audience.AU4',
    Name: 'AU4: (deterministic) Scoped Search through ExecuteSingleAction with an audience returns no results and no SourceCounts',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU4');
      if (!fx) return;
      const scopedSearch = await activeAction(ctx, SCOPED_SEARCH_ACTION);
      if (!scopedSearch) {
        skipNote('AU4', `the '${SCOPED_SEARCH_ACTION}' action is not Active in this database`);
        return;
      }
      const control = await actionHarness(ctx, fx).call(scopedSearch, { Query: `${LOG_QUERY_PREFIX} ${fx.Marker} action control` });
      AssertEqual(control.Success, true, `control (no audience) failed: ${control.Message ?? ''}`);
      Assert(paramNames(control).includes('SourceCounts'), 'control: without an audience the action returns SourceCounts');

      const room = await actionHarness(ctx, fx, intersection(fx.NoGrant)).call(scopedSearch, { Query: `${LOG_QUERY_PREFIX} ${fx.Marker} action room` });
      AssertEqual(room.Success, true, `the room's scoped search failed: ${room.Message ?? ''}`);
      const results = room.Params?.find((p) => p.Name === 'Results')?.Value;
      Assert(Array.isArray(results) && results.length === 0, `a room with a role-less reader must get no results, got ${JSON.stringify(results)}`);
      Assert(!paramNames(room).includes('SourceCounts'), 'SourceCounts must be withheld from a room');
      console.log('      → Scoped Search for the room: 0 results, no SourceCounts (control returned them)');
    },
  },
  {
    Id: 'agent-run-audience.AU5',
    Name: 'AU5: (deterministic) an action without audience support is refused (AUDIENCE_UNSUPPORTED), never runs, and is locked out for the run',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU5');
      if (!fx) return;
      const calc = await activeAction(ctx, UNSUPPORTED_ACTION);
      if (!calc) {
        skipNote('AU5', `the core '${UNSUPPORTED_ACTION}' action is not Active in this database`);
        return;
      }
      const controlMarker = `${fx.Marker}-au5-control`;
      const control = await actionHarness(ctx, fx).call(calc, { Expression: '2 + 3', Note: controlMarker });
      Assert(!!control.LogEntry?.ID, 'control: without an audience the action runs and writes an execution log row');

      const roomMarker = `${fx.Marker}-au5-room`;
      const harness = actionHarness(ctx, fx, intersection(fx.NoGrant));
      const refused = await harness.call(calc, { Expression: '2 + 3', Note: roomMarker });
      AssertEqual(refused.Success, false, 'the room call must be refused');
      AssertEqual(refused.ResultCode, 'AUDIENCE_UNSUPPORTED', `unexpected result code: ${refused.ResultCode ?? ''} — ${refused.Message ?? ''}`);
      Assert(!refused.LogEntry, 'a refused call has no log entry');
      const again = await harness.call(calc, { Expression: '3 + 4', Note: roomMarker });
      Assert(again instanceof CircuitBreakerActionResult && again.Reason === 'fatal', 'the refused action must be locked out for the run');

      await settle(1500); // the log writes ride a fire-and-forget queue
      Assert((await actionLogRows(ctx, calc.ID, controlMarker)).length >= 1, 'control: the unrestricted call left an Action Execution Log row');
      AssertEqual((await actionLogRows(ctx, calc.ID, roomMarker)).length, 0, 'the refused action must leave no Action Execution Log row');
      console.log('      → Calculate Expression refused for the room (AUDIENCE_UNSUPPORTED), no log row, locked out');
    },
  },
  {
    Id: 'agent-run-audience.AU6',
    Name: 'AU6: (deterministic) Execute with an audience naming an unknown user fails the run before any prompt',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU6');
      if (!fx) return;
      const agent = new BaseAgent();
      const result = await agent.Execute({
        agent: fx.Agent,
        conversationMessages: [{ role: 'user', content: `${LOG_QUERY_PREFIX} ${fx.Marker} AU6 — should be refused` }],
        contextUser: ctx.User,
        provider: ctx.Provider,
        Audience: { Mode: 'Intersection', UserIDs: [fx.NoGrant.ID, UNKNOWN_USER_ID] },
      });
      const run: MJAIAgentRunEntityExtended | undefined = result.agentRun;
      if (run?.IsSaved) fx.RunIDs.push(run.ID);
      AssertEqual(result.success, false, 'an audience naming an unknown user must fail the run');
      Assert(!!run?.IsSaved, 'the refused run is persisted (created in Phase 1, failed at the audience check)');
      if ((run!.ErrorMessage ?? '').includes('does not have permission')) {
        skipNote('AU6', `the context user may not run '${fx.Agent.Name}', so the permission check refused the run first`);
        return;
      }
      AssertEqual(run!.Status, 'Failed', 'run Status=Failed');
      const error = run!.ErrorMessage ?? '';
      Assert(error.toLowerCase().includes(UNKNOWN_USER_ID.toLowerCase()), `the error must name the unknown ID: '${error}'`);
      const prompts = await new RunView().RunView<{ ID: string }>(
        {
          EntityName: 'MJ: AI Agent Run Steps',
          ExtraFilter: `AgentRunID='${run!.ID}' AND StepType='Prompt'`,
          Fields: ['ID'],
          ResultType: 'simple',
          BypassCache: true,
        },
        ctx.User,
      );
      Assert(prompts.Success, `step read failed: ${prompts.ErrorMessage ?? ''}`);
      AssertEqual(prompts.Results.length, 0, 'no prompt may run for a refused audience');
      console.log(`      → run ${run!.ID} Failed before any prompt: ${run!.ErrorMessage}`);
    },
  },
  {
    Id: 'agent-run-audience.AU7',
    Name: 'AU7: (deterministic) Scoped Search in a run scoped to tenant A refuses a model tenant B (INVALID_PARAM, no search) and searches A',
    Fn: async (ctx): Promise<void> => {
      const fx = fixtureFor('AU7');
      if (!fx) return;
      const scopedSearch = await activeAction(ctx, SCOPED_SEARCH_ACTION);
      if (!scopedSearch) {
        skipNote('AU7', `the '${SCOPED_SEARCH_ACTION}' action is not Active in this database`);
        return;
      }
      const harness = actionHarness(ctx, fx, undefined, { PrimaryScopeRecordID: RUN_TENANT_ID });
      await assertOtherTenantRefused(ctx, fx, scopedSearch, harness.call);
      await assertRunTenantSearched(ctx, fx, scopedSearch, harness.call);
      console.log("      → run tenant A: a model tenant B refused (INVALID_PARAM, one Forbidden row, no search); no model tenant searched under A");
    },
  },
];

type ActionCall = (action: MJActionEntityExtended, actionParams: Record<string, unknown>) => Promise<ActionResult>;

/** AU7, first half: the model names tenant B inside a run scoped to A — refused before any search, one Forbidden row. */
async function assertOtherTenantRefused(ctx: IntegrationCheckContext, fx: AudienceFixture, action: MJActionEntityExtended, call: ActionCall): Promise<void> {
  const query = `${LOG_QUERY_PREFIX} ${fx.Marker} run scope other tenant`;
  const refused = await call(action, { Query: query, PrimaryScopeRecordID: OTHER_TENANT_ID });
  AssertEqual(refused.Success, false, 'a tenant the run does not carry must be refused');
  AssertEqual(refused.ResultCode, 'INVALID_PARAM', `unexpected result code: ${refused.ResultCode ?? ''} — ${refused.Message ?? ''}`);
  const forbidden = await searchLogRows(ctx, query, 'Forbidden', true);
  AssertEqual(forbidden.length, 1, 'exactly one Forbidden row for the refused tenant');
  const reason = (forbidden[0].FailureReason ?? '').toLowerCase();
  Assert(reason.includes(OTHER_TENANT_ID.toLowerCase()), `the Forbidden row must name the refused tenant: ${forbidden[0].FailureReason ?? ''}`);
  Assert(UUIDsEqual(forbidden[0].PrimaryScopeRecordID, RUN_TENANT_ID), "the Forbidden row belongs to the run's tenant");
  AssertEqual((await searchLogRows(ctx, query, 'Success', false)).length, 0, 'no search may run for a refused tenant');
}

/** AU7, second half: no model tenant — the search runs, and its Success row records the run's tenant. */
async function assertRunTenantSearched(ctx: IntegrationCheckContext, fx: AudienceFixture, action: MJActionEntityExtended, call: ActionCall): Promise<void> {
  const query = `${LOG_QUERY_PREFIX} ${fx.Marker} run scope own tenant`;
  const ran = await call(action, { Query: query });
  AssertEqual(ran.Success, true, `the run's own tenant must search: ${ran.Message ?? ''}`);
  const rows = await searchLogRows(ctx, query, 'Success', true);
  Assert(rows.length >= 1, 'the search must have run (a Success search-log row)');
  const tenants = rows.map((r) => r.PrimaryScopeRecordID);
  Assert(tenants.every((t) => UUIDsEqual(t, RUN_TENANT_ID)), `the search must run under the run's tenant, got ${tenants.join(', ')}`);
  AssertEqual((await searchLogRows(ctx, query, 'Forbidden', false)).length, 0, "the run's own tenant writes no Forbidden row");
}

for (const check of AgentRunAudienceChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

/** Resolves the seeded scope, agent and users, and grants the no-grant user Search on the scope by UserID. */
async function setupAudienceFixture(ctx: IntegrationCheckContext): Promise<void> {
  fixture = undefined;
  if (!(ctx.Provider instanceof DatabaseProviderBase) || UserCache.Instance.Users.length === 0) {
    unavailable = 'server transport only: audience readers are hydrated from the in-process UserCache';
    return;
  }
  const noGrant = findUserByEmail(UserCache.Instance.Users, SEEDED_NOGRANT_EMAIL);
  const ungranted = findUserByEmail(UserCache.Instance.Users, SEEDED_SCOPED_A_EMAIL);
  const scopeID = await resolveScopeID(ctx);
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').toLowerCase() === SEARCH_AGENT_NAME);
  if (!noGrant || !ungranted || !scopeID || !agent) {
    unavailable =
      `seeded roster missing (no-grant user: ${!!noGrant}, RLS user A: ${!!ungranted}, '${IT_SCOPE_NAME}': ${!!scopeID}, ` +
      `IT: Search Agent: ${!!agent}) — push metadata-optional/integration-test`;
    return;
  }
  const marker = `ITAUD${Date.now().toString(36)}`;
  fixture = { ScopeID: scopeID, Agent: agent, NoGrant: noGrant, Ungranted: ungranted, GrantID: null, Marker: marker, ActionLogIDs: [], RunIDs: [] };
  fixture.GrantID = await grantSearch(ctx, scopeID, noGrant.ID);
}

async function resolveScopeID(ctx: IntegrationCheckContext): Promise<string | undefined> {
  const r = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: Search Scopes', ExtraFilter: `Name='${EscapeSQLString(IT_SCOPE_NAME)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    ctx.User,
  );
  return r.Success && r.Results.length === 1 ? r.Results[0].ID : undefined;
}

async function grantSearch(ctx: IntegrationCheckContext, scopeID: string, userID: string): Promise<string> {
  const grant = await ctx.Provider.GetEntityObject<MJSearchScopePermissionEntity>('MJ: Search Scope Permissions', ctx.User);
  grant.NewRecord();
  grant.SearchScopeID = scopeID;
  grant.UserID = userID;
  grant.PermissionLevel = 'Search';
  Assert(await grant.Save(), `fixture grant save failed: ${grant.LatestResult?.CompleteMessage ?? ''}`);
  return grant.ID;
}

/** Deletes the grant, the prefixed search-log rows, the action-log rows and AU6's run. Best-effort: never throws. */
async function teardownAudienceFixture(ctx: IntegrationCheckContext): Promise<void> {
  const fx = fixture;
  fixture = undefined;
  unavailable = '';
  if (!fx) return;
  await deleteByID<MJSearchScopePermissionEntity>(ctx, 'MJ: Search Scope Permissions', fx.GrantID ? [fx.GrantID] : []);
  await sweepSearchLogs(ctx);
  await sweepActionLogs(ctx, fx);
  for (const runID of fx.RunIDs) {
    await deleteRunSteps(ctx, runID);
    await deleteByID<MJAIAgentRunEntityExtended>(ctx, 'MJ: AI Agent Runs', [runID]);
  }
}

/** A generated entity class: loadable by its single `ID`. */
type LoadableByID = BaseEntity & { Load(ID: string): Promise<boolean> };

async function deleteByID<T extends LoadableByID>(ctx: IntegrationCheckContext, entityName: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      const row = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
      if ((await row.Load(id)) && !(await row.Delete())) {
        console.error(`agent-run-audience cleanup of ${entityName} ${id} failed: ${row.LatestResult?.CompleteMessage ?? ''}`);
      }
    } catch (e) {
      console.error(`agent-run-audience cleanup of ${entityName} ${id} failed:`, e);
    }
  }
}

/** The bundle's search-log rows, re-swept briefly: the Success writes are fire-and-forget. */
async function sweepSearchLogs(ctx: IntegrationCheckContext): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const logs = await new RunView().RunView<MJSearchExecutionLogEntity>(
      { EntityName: 'MJ: Search Execution Logs', ExtraFilter: `Query LIKE '${LOG_QUERY_PREFIX}%'`, ResultType: 'entity_object', BypassCache: true },
      ctx.User,
    );
    const rows = logs.Success ? logs.Results : [];
    for (const row of rows) {
      if (!(await row.Delete())) console.error(`agent-run-audience search-log cleanup failed: ${row.LatestResult?.CompleteMessage ?? ''}`);
    }
    if (rows.length === 0 && attempt > 0) break;
    await settle(300);
  }
}

/** Action-log rows the checks recorded, plus any carrying the marker (the AU5 control's). */
async function sweepActionLogs(ctx: IntegrationCheckContext, fx: AudienceFixture): Promise<void> {
  await settle(1500);
  const marked = await new RunView().RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Action Execution Logs',
      ExtraFilter: `Params LIKE '%${EscapeSQLString(fx.Marker)}%'`,
      Fields: ['ID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  const ids = new Set([...fx.ActionLogIDs, ...(marked.Success ? marked.Results.map((r) => r.ID) : [])]);
  await deleteByID<MJActionExecutionLogEntity>(ctx, 'MJ: Action Execution Logs', [...ids]);
}

async function deleteRunSteps(ctx: IntegrationCheckContext, runID: string): Promise<void> {
  const steps = await new RunView().RunView<MJAIAgentRunStepEntityExtended>(
    { EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${EscapeSQLString(runID)}'`, ResultType: 'entity_object', BypassCache: true },
    ctx.User,
  );
  for (const step of steps.Success ? steps.Results : []) {
    if (!(await step.Delete())) console.error(`agent-run-audience step cleanup failed: ${step.LatestResult?.CompleteMessage ?? ''}`);
  }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-run-audience', { Setup: setupAudienceFixture, Teardown: teardownAudienceFixture });
