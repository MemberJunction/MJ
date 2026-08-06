/**
 * agent-compaction-e2e.checks.ts — the 'agent-compaction-e2e' bundle (CE1–CE9), agents-extended-suite §9.3.
 *
 * Beyond the assembly-layer conversation-compaction bundle (CC1–CC12): this bundle proves the LIVE
 * post-turn compaction machinery FIRES and persists, plus the deterministic budget-precedence math CC
 * never touches. SPLIT TIER:
 *   - CE1 is DETERMINISTIC (no LLM): ConversationCompactionManager.ResolveEffectiveBudget precedence
 *     Agent→AgentType→Default + clamp-to-model + the floor math, over the REAL seeded agents.
 *   - CE2/CE9 are LIVE-MODEL, fabricate-then-observe (§3.4): hand-build a stored conversation history,
 *     spend ONE real turn, observe the framework's post-turn reaction (boundary summary persisted +
 *     Compaction step recorded / correctly NOT recorded).
 *
 * Facts (verified): budget precedence uses `||` (0/NULL fall through), defaults 8000/75/30
 * (ConversationCompactionManager.ts:119-142); TriggerTokens=floor(MaxTokens×trigger%/100). Post-turn
 * compaction is fire-and-forget in finalizeAgentRun on settled statuses ['Completed','AwaitingFeedback']
 * (base-agent.ts:13218, startPostTurnCompaction :13625); it writes the summary to a boundary
 * ConversationDetail (SummaryOfEarlierConversation + SummaryPromptRunID — no new rows) and records a
 * StepType='Compaction' step ONLY when the pass fired or errored (quiet no-op records nothing).
 *
 * SEEDED AGENT: 'IT: Compaction Agent' (ContextWindowMaxTokens=8000, CompactionTriggerPercent=50,
 * CompactionTargetPercent=25) — an explicit Agent-level budget so pre/post-turn compaction is eligible.
 * TRANSPORT: CE1 pure in-process; CE2/CE9 server AgentRunner.RunAgent (synchronous run handle for step
 * correlation; client path is fire-and-forget — proposal Q8).
 *
 * DEFERRED (documented in the deliverable) — CE3 (multi-pass recursion), CE4 (compaction+carry-forward
 * co-fire), CE5 (post-compaction retrieval round-trip), CE6 (failed pass), CE7 (topUp token identity),
 * CE8 (churn/unsatisfiable-budget guards): each needs deep post-turn orchestration or internal-seam
 * driving (or forcing a specific model tool-emission) that cannot be observed reliably/non-vacuously
 * headless in a single turn. CE2 (positive) + CE9 (negative) are the trustworthy live core.
 */
import { RunView } from '@memberjunction/core';
import { ConversationEngine, MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner, ConversationCompactionManager } from '@memberjunction/ai-agents';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentCompactionE2EFixture } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 5000);
const COMPACTION_POLL_ATTEMPTS = Number(process.env.AGENT_COMPACTION_POLL ?? 12);

function requireFixture(ctx: IntegrationCheckContext): AgentCompactionE2EFixture {
  if (!ctx.AgentCompactionE2EFixture) {
    throw new Error('AgentCompactionE2EFixture not initialized — the agent-compaction-e2e lifecycle Setup must run first.');
  }
  return ctx.AgentCompactionE2EFixture;
}

async function resolveAgent(ctx: IntegrationCheckContext, name: string): Promise<MJAIAgentEntityExtended> {
  await AIEngine.Instance.Config(false, ctx.User, ctx.Provider);
  const agent = AIEngine.Instance.Agents.find((a) => (a.Name ?? '').toLowerCase() === name.toLowerCase());
  Assert(!!agent, `seeded agent '${name}' not found — push metadata-optional/integration-test`);
  return agent!;
}

function loopAgentType(agent: MJAIAgentEntityExtended): MJAIAgentTypeEntity | null {
  return AIEngine.Instance.AgentTypes.find((t) => UUIDsEqual(t.ID, agent.TypeID)) ?? null;
}

/** Fabricate a stored conversation with N detail rows of a given size (fabricate-then-observe). */
async function fabricateConversation(ctx: IntegrationCheckContext, rows: Array<{ role: 'User' | 'AI'; text: string }>): Promise<MJConversationEntity> {
  const fx = requireFixture(ctx);
  const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
  conversation.Name = `Compaction e2e ${FIXTURE_TAG}`;
  conversation.UserID = ctx.User.ID;
  Assert(await conversation.Save(), `fixture conversation save: ${conversation.LatestResult?.CompleteMessage}`);
  const details: MJConversationDetailEntity[] = [];
  for (const row of rows) {
    const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
    detail.ConversationID = conversation.ID;
    detail.Role = row.role;
    detail.Message = row.text;
    detail.HiddenToUser = false;
    Assert(await detail.Save(), `fixture detail save: ${detail.LatestResult?.CompleteMessage}`);
    details.push(detail);
  }
  fx.Conversations.push({ Conversation: conversation, Details: details });
  return conversation;
}

/** A block of filler text (~size chars) so the fabricated history exceeds the token trigger. */
function filler(marker: string, size: number): string {
  const unit = `${marker} the quick brown fox jumps over the lazy dog and discusses metadata-driven platforms at length. `;
  let out = '';
  while (out.length < size) {
    out += unit;
  }
  return out.slice(0, size);
}

async function runCompactionAgent(
  ctx: IntegrationCheckContext,
  agent: MJAIAgentEntityExtended,
  conversationId: string,
  message: string,
): Promise<MJAIAgentRunEntityExtended> {
  const result = await new AgentRunner(ctx.Provider).RunAgent({
    agent,
    conversationMessages: [{ role: 'user', content: message }],
    contextUser: ctx.User,
    provider: ctx.Provider,
    conversationId,
  });
  Assert(!!result.agentRun?.ID, 'RunAgent returned no agentRun for IT: Compaction Agent');
  requireFixture(ctx).CreatedRunIds.push(result.agentRun.ID);
  await settle(SETTLE_MS);
  return result.agentRun;
}

async function compactionStepCount(ctx: IntegrationCheckContext, runId: string): Promise<number> {
  const r = await new RunView().RunView<{ StepType: string }>(
    {
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${runId}'`,
      Fields: ['StepType'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results.filter((s) => s.StepType === 'Compaction').length : 0;
}

/**
 * The Compaction steps for a run, with the fields that distinguish "the pass fired" from "the pass
 * ran and failed" — a failed summary prompt or a failed audit-row save records a step with
 * Success=0, whereas a skipped pass records nothing at all (base-agent.ts runCrossTurnCompaction).
 */
async function compactionStepDetails(ctx: IntegrationCheckContext, runId: string): Promise<Array<{ Success: boolean | null; ErrorMessage: string | null }>> {
  const r = await new RunView().RunView<{ StepType: string; Success: boolean | null; ErrorMessage: string | null }>(
    {
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${runId}'`,
      Fields: ['StepType', 'Success', 'ErrorMessage'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return r.Success ? r.Results.filter((s) => s.StepType === 'Compaction').map((s) => ({ Success: s.Success, ErrorMessage: s.ErrorMessage })) : [];
}

/**
 * Boundary-summary state, reported as its TWO independent saves: the summary written onto the
 * boundary ConversationDetail, and the ConversationCompactionRun audit row. Collapsing them into
 * one boolean makes a failed audit insert masquerade as "compaction never fired".
 */
async function boundarySummaryState(ctx: IntegrationCheckContext, conversationId: string): Promise<{ summary: boolean; audit: boolean }> {
  const rv = new RunView();
  const detailsResult = await rv.RunView<{ ID: string; SummaryOfEarlierConversation: string | null }>(
    {
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `ConversationID='${conversationId}'`,
      Fields: ['ID', 'SummaryOfEarlierConversation'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  if (!detailsResult.Success) return { summary: false, audit: false };
  const boundaryRows = detailsResult.Results.filter((d) => !!d.SummaryOfEarlierConversation && d.SummaryOfEarlierConversation.trim().length > 0);
  if (boundaryRows.length === 0) return { summary: false, audit: false };
  const boundaryIds = boundaryRows.map((d) => `'${d.ID}'`).join(',');
  const auditResult = await rv.RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Conversation Compaction Runs',
      ExtraFilter: `ConversationDetailID IN (${boundaryIds})`,
      Fields: ['ID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return { summary: true, audit: auditResult.Success && auditResult.Results.length > 0 };
}

async function boundarySummaryPresent(ctx: IntegrationCheckContext, conversationId: string): Promise<boolean> {
  const rv = new RunView();
  const detailsResult = await rv.RunView<{ ID: string; SummaryOfEarlierConversation: string | null }>(
    {
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `ConversationID='${conversationId}'`,
      Fields: ['ID', 'SummaryOfEarlierConversation'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  if (!detailsResult.Success) return false;
  const boundaryRows = detailsResult.Results.filter((d) => !!d.SummaryOfEarlierConversation && d.SummaryOfEarlierConversation.trim().length > 0);
  if (boundaryRows.length === 0) return false;

  // Verify audit record exists in the ConversationCompactionRun table
  const boundaryIds = boundaryRows.map((d) => `'${d.ID}'`).join(',');
  const auditResult = await rv.RunView<{ ID: string }>(
    {
      EntityName: 'MJ: Conversation Compaction Runs',
      ExtraFilter: `ConversationDetailID IN (${boundaryIds})`,
      Fields: ['ID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    ctx.User,
  );
  return auditResult.Success && auditResult.Results.length > 0;
}

export const AgentCompactionE2EChecks: NamedCheck[] = [
  {
    Id: 'agent-compaction-e2e.CE1',
    Name: 'CE1: (deterministic) budget precedence Agent→AgentType→Default + clamp + floor math via ResolveEffectiveBudget',
    Fn: async (ctx): Promise<void> => {
      const compAgent = await resolveAgent(ctx, 'IT: Compaction Agent');
      const echoAgent = await resolveAgent(ctx, 'IT: Echo Agent');
      const type = loopAgentType(compAgent);

      // Agent precedence + floor math (Agent budget 8000, trigger 50%, target 25%, no clamp).
      const agentBudget = ConversationCompactionManager.ResolveEffectiveBudget(compAgent, type, null);
      AssertEqual(agentBudget.MaxTokens, 8000, 'Agent-level ContextWindowMaxTokens must win');
      AssertEqual(agentBudget.BoundedBy, 'Agent', "BoundedBy must be 'Agent' when the agent sets the budget");
      AssertEqual(agentBudget.TriggerTokens, 4000, 'TriggerTokens = floor(8000 × 50 / 100)');
      AssertEqual(agentBudget.TargetTokens, 2000, 'TargetTokens = floor(8000 × 25 / 100)');
      AssertEqual(agentBudget.ClampedToModel, false, 'no clamp when modelMax is null');

      // Clamp-to-model: a smaller model window overrides the Agent budget and flips BoundedBy.
      const clamped = ConversationCompactionManager.ResolveEffectiveBudget(compAgent, type, 4000);
      AssertEqual(clamped.MaxTokens, 4000, 'MaxTokens must clamp down to the model window');
      AssertEqual(clamped.BoundedBy, 'Model', "BoundedBy must flip to 'Model' after a clamp");
      AssertEqual(clamped.ClampedToModel, true, 'ClampedToModel must be flagged');
      AssertEqual(clamped.TriggerTokens, 2000, 'TriggerTokens recomputed on the clamped max (floor(4000 × 50/100))');

      // Default path: an agent with NO compaction knobs + agentType=null falls through the `||`
      // chain to the 8000/75/30 defaults (BoundedBy='Default'). This is the precedence contract
      // a `||`→`??`-on-zero refactor (Q5) would move — CE1 pins it.
      const defaults = ConversationCompactionManager.ResolveEffectiveBudget(echoAgent, null, null);
      AssertEqual(defaults.MaxTokens, 8000, 'default MaxTokens is 8000 when nothing is configured');
      AssertEqual(defaults.BoundedBy, 'Default', "unset agent + null agentType → BoundedBy='Default'");
      AssertEqual(defaults.TriggerTokens, 6000, 'default TriggerTokens = floor(8000 × 75 / 100)');
      AssertEqual(defaults.TargetTokens, 2400, 'default TargetTokens = floor(8000 × 30 / 100)');
      console.log('      → budget precedence (Agent/Model-clamp/Default) + floor math all hold');
    },
  },
  {
    Id: 'agent-compaction-e2e.CE2',
    Name: 'CE2: (live) over-trigger fabricated history + one turn → boundary summary persisted + Compaction step; next window folds',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      const agent = await resolveAgent(ctx, 'IT: Compaction Agent');
      // Fabricate a stored history whose estimated tokens exceed the 4000 trigger. The real
      // estimator (heuristicTokenCount) is ~4 chars/token WITH a 50% whitespace discount, so a
      // 1400-char filler row is ~323 tokens, not ~280 — 12 rows landed at ~3.9k, just UNDER the
      // trigger, making compaction a quiet no-op. 16 rows ≈ 5.2k tokens clears it with margin
      // (and is > MIN_MESSAGES_TO_COMPACT (4)).
      const rows: Array<{ role: 'User' | 'AI'; text: string }> = [];
      for (let i = 1; i <= 16; i++) {
        rows.push({ role: i % 2 === 1 ? 'User' : 'AI', text: filler(`CE2-msg${i}`, 1400) });
      }
      const conv = await fabricateConversation(ctx, rows);
      const run = await runCompactionAgent(ctx, agent, conv.ID, 'Acknowledge and finish.');

      // PRECONDITION, asserted separately: startPostTurnCompaction returns SILENTLY (no Compaction
      // step, no boundary summary) unless the root run settled as Completed/AwaitingFeedback. Without
      // this assertion a failed live turn is indistinguishable from "compaction didn't fire", and the
      // real cause — the model, not the compaction wiring — is invisible in the failure message.
      Assert(
        run.Status === 'Completed' || run.Status === 'AwaitingFeedback',
        `CE2 precondition: the turn must settle before post-turn compaction is eligible, but the run ended ` +
          `Status='${run.Status}' (ErrorMessage: ${run.ErrorMessage ?? 'none'}) — compaction was never attempted`,
      );

      // Post-turn compaction is fire-and-forget (+ a real summary LLM call) — poll for it to land.
      let state = { summary: false, audit: false };
      let steps: Array<{ Success: boolean | null; ErrorMessage: string | null }> = [];
      for (let i = 0; i < COMPACTION_POLL_ATTEMPTS; i++) {
        state = await boundarySummaryState(ctx, conv.ID);
        steps = await compactionStepDetails(ctx, run.ID);
        if (state.summary && state.audit && steps.length > 0) {
          break;
        }
        await settle(2500);
      }
      // Report the three independent outcomes separately — a recorded-but-failed step (summary prompt
      // or audit save) is a different defect from no step at all (the pass never ran).
      const stepDiag = steps.length === 0
        ? 'no Compaction step recorded (the pass never ran or quietly no-op\'d)'
        : `Compaction steps: ${JSON.stringify(steps)}`;
      Assert(
        steps.length > 0,
        `post-turn compaction recorded no Compaction step for an over-trigger history (~5.2k tokens vs a 4k trigger) — ${stepDiag}`,
      );
      Assert(
        state.summary,
        `a Compaction step was recorded but no boundary summary was persisted — ${stepDiag} ` +
          '(check the seeded "Conversation Summary" prompt has an active model binding with a reachable vendor)',
      );
      Assert(
        state.audit,
        `the boundary summary persisted but its ConversationCompactionRun audit row did not — ${stepDiag}`,
      );

      // The next assembled window must fold to [summary, tail] — the summary is now the first message.
      const window = await ConversationEngine.Instance.GetAgentContextWindow(conv.ID, ctx.User);
      Assert(window.length > 0, 'the post-compaction window is empty');
      AssertEqual(window[0].metadata?.isConversationSummary, true, 'the folded window must lead with the summary message');
      Assert(window.length <= rows.length, 'the folded window must be no larger than the raw history');
      console.log(`      → compaction fired: boundary summary persisted, Compaction step recorded, window folded to ${window.length}`);
    },
  },
  {
    Id: 'agent-compaction-e2e.CE9',
    Name: 'CE9: (live) under-trigger history fires NO compaction — no Compaction step, no boundary summary (negative control)',
    RequiresLiveModel: true,
    Fn: async (ctx): Promise<void> => {
      const agent = await resolveAgent(ctx, 'IT: Compaction Agent');
      // A tiny history well under the 4000 trigger (and the quiet no-op records no step).
      const conv = await fabricateConversation(ctx, [
        { role: 'User', text: 'CE9 short one' },
        { role: 'AI', text: 'CE9 short two' },
      ]);
      const run = await runCompactionAgent(ctx, agent, conv.ID, 'Acknowledge and finish.');
      // Same precondition as CE2, and here it also guards against VACUOUS GREEN: a run that failed to
      // settle skips post-turn compaction entirely, so "no Compaction step" would prove nothing about
      // the under-trigger negative control this check exists to assert.
      Assert(
        run.Status === 'Completed' || run.Status === 'AwaitingFeedback',
        `CE9 precondition: the turn must settle for the negative control to be meaningful, but the run ended ` +
          `Status='${run.Status}' (ErrorMessage: ${run.ErrorMessage ?? 'none'})`,
      );
      // Give any (erroneous) post-turn pass ample time to appear before asserting absence.
      await settle(SETTLE_MS);
      const steps = await compactionStepCount(ctx, run.ID);
      AssertEqual(steps, 0, `an under-trigger history must fire NO compaction pass (got ${steps} Compaction steps)`);
      Assert(!(await boundarySummaryPresent(ctx, conv.ID)), 'an under-trigger history must not persist a boundary summary');
      console.log('      → under-trigger history correctly produced no Compaction step and no boundary summary');
    },
  },
];

for (const check of AgentCompactionE2EChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-compaction-e2e', {
  Setup: async (ctx: IntegrationCheckContext) => {
    ctx.AgentCompactionE2EFixture = { Conversations: [], CreatedRunIds: [] };
  },
  Teardown: async (ctx: IntegrationCheckContext) => {
    const fx = ctx.AgentCompactionE2EFixture;
    if (!fx) {
      return;
    }
    // FK-safe: run steps → runs → conversation details → conversations. Best-effort per record.
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
              console.error('compaction step cleanup failed:', e);
            }
          }
        }
        const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
        if (await run.Load(runId)) {
          await run.Delete();
        }
      } catch (e) {
        console.error('compaction run cleanup failed:', e);
      }
    }
    for (const entry of fx.Conversations) {
      try {
        for (const detail of entry.Details) {
          try {
            await detail.Delete();
          } catch (e) {
            console.error('compaction detail cleanup failed:', e);
          }
        }
        await entry.Conversation.Delete();
      } catch (e) {
        console.error('compaction conversation cleanup failed:', e);
      }
    }
    ctx.AgentCompactionE2EFixture = undefined;
  },
});
