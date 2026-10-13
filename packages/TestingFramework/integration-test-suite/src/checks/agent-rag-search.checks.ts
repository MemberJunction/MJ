/**
 * agent-rag-search.checks.ts — the 'agent-rag-search' bundle (RS1–RS7), agents-extended-suite §10.
 *
 * SPLIT TIER: a DETERMINISTIC engine core (RS1/RS2/RS3/RS7 — no LLM, keyword path only) + LIVE agent
 * legs (RS4/RS6). The keyword path is fully deterministic: EntitySearchProvider LIKE over the seeded
 * scope's entity list, below-MIN_TERM_LENGTH short-circuit, RRF/permission safety-net (SearchEngine.ts).
 *
 * SEEDED METADATA (metadata-optional/integration-test/ai-search/): 'IT: Integration Test Scope' — a
 * Database-provider scope over MJ: AI Agent Notes whose entity ExtraFilter is `Note NOT LIKE
 * '%IT-SCOPE-EXCLUDED%'` — plus 'IT: Search Agent' (SearchScopeAccess='Assigned', scope Phase='Both',
 * granted the Scoped Search action). This bundle SEEDS its own sentinel MJ: AI Agent Notes corpus in
 * Setup (unique marker), searches it, and deletes it (+ the SearchExecutionLog audit rows) in Teardown.
 *
 * TRANSPORT: DET legs call SearchEngine.Instance in-process (server); LIVE legs run IT: Search Agent via
 * AgentRunner.RunAgent (synchronous run handle; client path is fire-and-forget — proposal Q8).
 * DETERMINISM (§3): structural observables only — returned RecordIDs / SourceCounts, the Scoped Search
 * Actions step, the injected result + <retrieved_context> in the assembled prompt — never model prose.
 *
 * DEFERRED: RS5 (SearchScopeAccess='None' → ACCESS_DENIED) — no seeded agent has BOTH
 * SearchScopeAccess='None' AND a Scoped Search action grant, so the action's None gate isn't reachable
 * without a new roster agent (documented in the deliverable).
 *
 * FIXTURE-USABILITY DEGRADATION (not vacuity): if MJ: AI Agent Notes' Note field is not marked
 * IncludeInUserSearchAPI in this deployment, the keyword corpus is not searchable — the search legs
 * then skip-as-pass with a LOUD note (a real metadata/product gap to fix), mirroring RlsFixture.Usable.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { SearchEngine } from '@memberjunction/search-engine';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentNoteEntity, MJSearchExecutionLogEntity } from '@memberjunction/core-entities';
import { findUserByEmail, SEEDED_NOGRANT_EMAIL } from '@memberjunction/testing-integration';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentRagSearchFixture } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 4000);
const EXCLUDE_MARKER = 'IT-SCOPE-EXCLUDED';

class ModelNonCompliance extends Error {}
function assertP(cond: boolean, message: string): void {
  if (!cond) {
    throw new ModelNonCompliance(message);
  }
}
async function withBoundedRetry(label: string, fn: () => Promise<void>): Promise<void> {
  let last: ModelNonCompliance | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (e instanceof ModelNonCompliance) {
        last = e;
        console.warn(`  ⚠ ${label} phase-P miss (attempt ${attempt}/3): ${e.message}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`model-noncompliance: ${label} — ${last?.message ?? 'unknown'} (after 3 attempts)`);
}

function requireFixture(ctx: IntegrationCheckContext): AgentRagSearchFixture {
  if (!ctx.AgentRagSearchFixture) {
    throw new Error('AgentRagSearchFixture not initialized — the agent-rag-search lifecycle Setup must run first.');
  }
  return ctx.AgentRagSearchFixture;
}

/** True iff the deployment marks MJ: AI Agent Notes' Note field searchable (the keyword-corpus prerequisite). */
function noteCorpusSearchable(ctx: IntegrationCheckContext): boolean {
  const entity = ctx.Provider.EntityByName('MJ: AI Agent Notes');
  const noteField = entity?.Fields.find((f) => f.Name === 'Note');
  return !!noteField?.IncludeInUserSearchAPI;
}
function skipUnsearchable(id: string): void {
  console.warn(
    `  ⚠ agent-rag-search.${id} SKIPPED — MJ: AI Agent Notes' Note field is not IncludeInUserSearchAPI in this ` +
      'deployment, so the keyword corpus is not searchable (metadata/product gap to fix; see deliverable).',
  );
}

async function resolveSearchAgent(ctx: IntegrationCheckContext): Promise<MJAIAgentEntityExtended> {
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').toLowerCase() === 'it: search agent');
  Assert(!!agent, "seeded agent 'IT: Search Agent' not found — push metadata-optional/integration-test");
  return agent!;
}

async function seedNote(ctx: IntegrationCheckContext, text: string): Promise<string> {
  const note = await ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', ctx.User);
  note.Note = text;
  note.Type = 'Context';
  note.Status = 'Active';
  note.UserID = ctx.User.ID;
  Assert(await note.Save(), `sentinel note save: ${note.LatestResult?.CompleteMessage}`);
  return note.ID;
}

async function scopedSearch(ctx: IntegrationCheckContext, query: string, user: UserInfo): Promise<Awaited<ReturnType<typeof SearchEngine.Instance.Search>>> {
  const fx = requireFixture(ctx);
  await SearchEngine.Instance.Config({}, ctx.User, false);
  return SearchEngine.Instance.Search({ Query: `${fx.LogQueryPrefix} ${query}`, ScopeIDs: [fx.ScopeID], MaxResults: 25 }, user);
}

async function runSearchAgent(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, message: string): Promise<MJAIAgentRunEntityExtended> {
  const result = await new AgentRunner(ctx.Provider).RunAgent({
    agent,
    conversationMessages: [{ role: 'user', content: message }],
    contextUser: ctx.User,
    provider: ctx.Provider,
  });
  Assert(!!result.agentRun?.ID, 'RunAgent returned no agentRun for IT: Search Agent');
  requireFixture(ctx).CreatedRunIds.push(result.agentRun.ID);
  await settle(SETTLE_MS);
  return result.agentRun;
}

interface StepRow {
  StepType: string;
  StepName: string;
  TargetLogID: string | null;
  StepNumber: number;
}
async function stepsFor(ctx: IntegrationCheckContext, runId: string): Promise<StepRow[]> {
  const r = await new RunView().RunView<StepRow>(
    {
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${runId}'`,
      OrderBy: 'StepNumber',
      Fields: ['StepType', 'StepName', 'TargetLogID', 'StepNumber'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results : [];
}

/** All chat-message text across a run's Prompt steps (assembled-prompt content, in order). */
async function allPromptMessages(ctx: IntegrationCheckContext, runId: string): Promise<string> {
  const steps = await stepsFor(ctx, runId);
  const parts: string[] = [];
  for (const s of steps.filter((x) => x.StepType === 'Prompt' && x.TargetLogID)) {
    const run = await ctx.Provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', ctx.User);
    if (await run.Load(s.TargetLogID!)) {
      const { chatMessages } = run.ParseMessagesData();
      parts.push(chatMessages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n'));
    }
  }
  return parts.join('\n');
}
async function firstPromptMessages(ctx: IntegrationCheckContext, runId: string): Promise<string | null> {
  const steps = await stepsFor(ctx, runId);
  const first = steps.find((s) => s.StepType === 'Prompt' && s.TargetLogID);
  if (!first?.TargetLogID) {
    return null;
  }
  const run = await ctx.Provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', ctx.User);
  if (!(await run.Load(first.TargetLogID))) {
    return null;
  }
  const { chatMessages } = run.ParseMessagesData();
  return chatMessages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
}

export const AgentRagSearchChecks: NamedCheck[] = [
  {
    Id: 'agent-rag-search.RS1',
    Name: 'RS1: (deterministic) SearchEngine.Search over the IT scope returns exactly the seeded in-scope notes; SourceCounts.Entity>0',
    Fn: async (ctx): Promise<void> => {
      if (!noteCorpusSearchable(ctx)) {
        skipUnsearchable('RS1');
        return;
      }
      const fx = requireFixture(ctx);
      const res = await scopedSearch(ctx, `${fx.Marker} sentinel`, ctx.User);
      AssertEqual(res.Success, true, `scoped search failed: ${res.ErrorMessage ?? ''}`);
      const returned = new Set(res.Results.map((r) => NormalizeUUID(r.RecordID)));
      // The two in-scope sentinel notes must be present (excluded one asserted absent in RS2).
      const inScope = fx.SeededNoteIds.filter((id) => !fx.ExcludedNoteIds.includes(id));
      for (const id of inScope) {
        Assert(returned.has(NormalizeUUID(id)), `in-scope sentinel note ${id} was not returned by the scoped search`);
      }
      Assert(res.SourceCounts.Entity > 0, 'the entity keyword source must have contributed hits');
      console.log(`      → scoped search returned ${res.TotalCount} hits; all ${inScope.length} in-scope sentinels present`);
    },
  },
  {
    Id: 'agent-rag-search.RS2',
    Name: 'RS2: (deterministic) the scope ExtraFilter excludes the IT-SCOPE-EXCLUDED note from the same sentinel query',
    Fn: async (ctx): Promise<void> => {
      if (!noteCorpusSearchable(ctx)) {
        skipUnsearchable('RS2');
        return;
      }
      const fx = requireFixture(ctx);
      const res = await scopedSearch(ctx, `${fx.Marker} sentinel`, ctx.User);
      AssertEqual(res.Success, true, `scoped search failed: ${res.ErrorMessage ?? ''}`);
      const returned = new Set(res.Results.map((r) => NormalizeUUID(r.RecordID)));
      // Non-vacuous: RS1 proved the marker matches; the excluded note carries the SAME marker but the
      // scope's `Note NOT LIKE '%IT-SCOPE-EXCLUDED%'` ExtraFilter must keep it out.
      for (const id of fx.ExcludedNoteIds) {
        Assert(!returned.has(NormalizeUUID(id)), `the excluded note ${id} leaked past the scope ExtraFilter`);
      }
      console.log(`      → ${fx.ExcludedNoteIds.length} IT-SCOPE-EXCLUDED note(s) correctly filtered by the scope`);
    },
  },
  {
    Id: 'agent-rag-search.RS3',
    Name: 'RS3: (deterministic) a no-grant user gets zero protected sentinel rows through the search path (no cross-user leakage)',
    Fn: async (ctx): Promise<void> => {
      if (!noteCorpusSearchable(ctx)) {
        skipUnsearchable('RS3');
        return;
      }
      const fx = requireFixture(ctx);
      const nogrant = findUserByEmail(UserCache.Instance.Users, SEEDED_NOGRANT_EMAIL);
      if (!nogrant) {
        console.warn(
          `  ⚠ agent-rag-search.RS3 SKIPPED — seeded no-grant user '${SEEDED_NOGRANT_EMAIL}' not in the user cache ` +
            '(push metadata-optional/integration-test).',
        );
        return;
      }
      // First establish that the corpus is genuinely protected FROM the no-grant user: if they can
      // RunView our seeded notes, this deployment doesn't RLS-protect notes and there is nothing to
      // test — skip-as-pass loudly rather than assert a hollow zero.
      const idList = fx.SeededNoteIds.map((id) => `'${id}'`).join(',');
      const asNoGrant = await new RunView().RunView<{ ID: string }>(
        {
          EntityName: 'MJ: AI Agent Notes',
          ExtraFilter: `ID IN (${idList})`,
          Fields: ['ID'],
          ResultType: 'simple',
          BypassCache: true,
        },
        nogrant,
      );
      const visibleViaRunView = asNoGrant.Success ? asNoGrant.Results.length : 0;
      if (visibleViaRunView > 0) {
        console.warn(
          '  ⚠ agent-rag-search.RS3 SKIPPED — MJ: AI Agent Notes are not RLS-protected from the no-grant user in ' +
            'this deployment (RunView returned rows), so there is no cross-user isolation to prove here.',
        );
        return;
      }
      // Protected: the search path (which passes contextUser → native RLS) must ALSO return none of ours.
      const res = await scopedSearch(ctx, `${fx.Marker} sentinel`, nogrant);
      AssertEqual(res.Success, true, `no-grant scoped search failed structurally: ${res.ErrorMessage ?? ''}`);
      const returned = new Set(res.Results.map((r) => NormalizeUUID(r.RecordID)));
      for (const id of fx.SeededNoteIds) {
        Assert(!returned.has(NormalizeUUID(id)), `the no-grant user's search LEAKED a protected sentinel note ${id} — cross-user search leakage`);
      }
      console.log('      → no-grant user saw zero protected sentinel rows through the search path');
    },
  },
  {
    Id: 'agent-rag-search.RS7',
    Name: 'RS7: (deterministic) a below-MIN_TERM_LENGTH query short-circuits — empty success, no provider fan-out',
    Fn: async (ctx): Promise<void> => {
      await SearchEngine.Instance.Config({}, ctx.User, false);
      // A SINGLE character, deliberately. SearchEngine.MIN_TERM_LENGTH is private and has already
      // moved once (3 → 2, so short queries like "AI"/"US" now search), which retired the previous
      // 2-char input here without failing loudly. One char is below every plausible minimum, so this
      // check exercises the short-circuit itself rather than tracking the threshold's current value.
      const res = await SearchEngine.Instance.Search({ Query: 'm' }, ctx.User);
      AssertEqual(res.Success, true, 'a sub-minimum-length query must return empty SUCCESS');
      AssertEqual(res.TotalCount, 0, 'a sub-minimum-length query must return zero results');
      // The short-circuit returns BEFORE any provider fan-out — every source count stays zero.
      AssertEqual(
        res.SourceCounts.Vector + res.SourceCounts.FullText + res.SourceCounts.Entity + res.SourceCounts.Storage,
        0,
        'a short-circuited query must not fan out to any source',
      );
      console.log('      → below-minimum-length query short-circuited with no fan-out');
    },
  },
  {
    Id: 'agent-rag-search.RS4',
    Name: 'RS4: (live) IT: Search Agent invokes Scoped Search and the sentinel results are injected into the run',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      if (!noteCorpusSearchable(ctx)) {
        skipUnsearchable('RS4');
        return;
      }
      await withBoundedRetry('RS4', async () => {
        const fx = requireFixture(ctx);
        const agent = await resolveSearchAgent(ctx);
        const run = await runSearchAgent(ctx, agent, `Search for '${fx.LogQueryPrefix} ${fx.Marker} sentinel'.`);
        const steps = await stepsFor(ctx, run.ID);
        // Phase-P: the agent actually took the instructed Scoped Search action path.
        assertP(
          steps.some((s) => s.StepType === 'Actions'),
          'IT: Search Agent did not invoke the Scoped Search action',
        );
        // Framework: the search results (the sentinel) were injected back into the run's context — the
        // agent action path reaches the same corpus the engine path (RS1) does.
        const messages = await allPromptMessages(ctx, run.ID);
        Assert(messages.includes(fx.Marker), 'the Scoped Search results (sentinel marker) were not injected into the run');
        console.log(`      → run ${run.ID} invoked Scoped Search and received the sentinel results`);
      });
    },
  },
  {
    Id: 'agent-rag-search.RS6',
    Name: 'RS6: (live) pre-execution RAG injects <retrieved_context> with the sentinel into turn-1 of IT: Search Agent',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      if (!noteCorpusSearchable(ctx)) {
        skipUnsearchable('RS6');
        return;
      }
      const fx = requireFixture(ctx);
      const agent = await resolveSearchAgent(ctx);
      // The scope is Phase='Both' (includes PreExecution); a message carrying the sentinel drives the
      // RAG query so the pre-execution retrieval finds the seeded corpus.
      const run = await runSearchAgent(ctx, agent, `Tell me about ${fx.Marker} sentinel notes.`);
      const first = await firstPromptMessages(ctx, run.ID);
      Assert(!!first, 'could not read the first assembled prompt of the run');
      Assert(first!.includes('<retrieved_context>'), 'pre-execution RAG did not inject a <retrieved_context> block into turn-1');
      Assert(first!.includes(fx.Marker), 'the injected <retrieved_context> did not contain the seeded sentinel');
      console.log('      → pre-execution RAG injected <retrieved_context> with the sentinel into turn-1');
    },
  },
  {
    // RS5 (SearchScopeAccess='None' → ACCESS_DENIED) is DEFERRED: no seeded agent has BOTH
    // SearchScopeAccess='None' AND a Scoped Search action grant, so the action's None gate
    // (scoped-search.action.ts resolveScope) is unreachable without a new roster agent.
    Id: 'agent-rag-search.RS5',
    Name: 'RS5: (deferred) SearchScopeAccess=None → ACCESS_DENIED — needs a None-access agent with the Scoped Search grant',
    RequiresLiveModel: true,
    Fn: async (): Promise<void> => {
      console.warn(
        '  ⚠ agent-rag-search.RS5 DEFERRED — no seeded agent combines SearchScopeAccess=None with a ' +
          'Scoped Search action grant; the None gate is unreachable without a new roster agent (see deliverable).',
      );
    },
  },
];

for (const check of AgentRagSearchChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-rag-search', {
  Setup: async (ctx: IntegrationCheckContext) => {
    const marker = `ITRAG${Date.now()
      .toString(36)
      .replace(/[^a-z0-9]/gi, '')}`;
    // Resolve the seeded scope ID by name.
    const scopeR = await new RunView().RunView<{ ID: string }>(
      {
        EntityName: 'MJ: Search Scopes',
        ExtraFilter: `Name='IT: Integration Test Scope'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
      },
      ctx.User,
    );
    Assert(scopeR.Success && scopeR.Results.length === 1, "seeded 'IT: Integration Test Scope' not found — push metadata-optional/integration-test");
    const fx: AgentRagSearchFixture = {
      ScopeID: scopeR.Results[0].ID,
      Marker: marker,
      LogQueryPrefix: 'mj-integration-test rag',
      SeededNoteIds: [],
      ExcludedNoteIds: [],
      CreatedRunIds: [],
    };
    ctx.AgentRagSearchFixture = fx;
    // Seed the sentinel corpus: two in-scope notes + one excluded (carries the scope's exclusion marker).
    fx.SeededNoteIds.push(await seedNote(ctx, `${marker} sentinel alpha note ${FIXTURE_TAG}`));
    fx.SeededNoteIds.push(await seedNote(ctx, `${marker} sentinel beta note ${FIXTURE_TAG}`));
    const excludedId = await seedNote(ctx, `${marker} sentinel gamma ${EXCLUDE_MARKER} note ${FIXTURE_TAG}`);
    fx.SeededNoteIds.push(excludedId);
    fx.ExcludedNoteIds.push(excludedId);
  },
  Teardown: async (ctx: IntegrationCheckContext) => {
    const fx = ctx.AgentRagSearchFixture;
    if (!fx) {
      return;
    }
    // Sentinel notes.
    for (const id of fx.SeededNoteIds) {
      try {
        const note = await ctx.Provider.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', ctx.User);
        if (await note.Load(id)) {
          await note.Delete();
        }
      } catch (e) {
        console.error('rag note cleanup failed:', e);
      }
    }
    // SearchExecutionLog audit rows carrying our prefix (best-effort, bounded re-poll for the fire-and-forget write).
    for (let attempt = 0; attempt < 4; attempt++) {
      const logs = await new RunView().RunView<MJSearchExecutionLogEntity>(
        {
          EntityName: 'MJ: Search Execution Logs',
          ExtraFilter: `Query LIKE '${fx.LogQueryPrefix}%'`,
          ResultType: 'entity_object',
          BypassCache: true,
        },
        ctx.User,
      );
      const rows = logs.Success ? logs.Results : [];
      for (const row of rows) {
        try {
          await row.Delete();
        } catch (e) {
          console.error('rag log cleanup failed:', e);
        }
      }
      if (rows.length === 0 && attempt > 0) {
        break;
      }
      await settle(300);
    }
    // Run steps → runs.
    for (const runId of Array.from(new Set(fx.CreatedRunIds))) {
      try {
        const steps = await new RunView().RunView<{ ID: string }>(
          {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runId}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
          },
          ctx.User,
        );
        if (steps.Success) {
          for (const s of steps.Results) {
            try {
              const step = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', ctx.User);
              if (await step.Load(s.ID)) {
                await step.Delete();
              }
            } catch (e) {
              console.error('rag step cleanup failed:', e);
            }
          }
        }
        const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
        if (await run.Load(runId)) {
          await run.Delete();
        }
      } catch (e) {
        console.error('rag run cleanup failed:', e);
      }
    }
    ctx.AgentRagSearchFixture = undefined;
  },
});
