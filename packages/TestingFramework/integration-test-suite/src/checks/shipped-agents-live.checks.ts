/**
 * shipped-agents-live.checks.ts — the 'shipped-agents-live' bundle (SA1–SA4): the REAL shipped
 * agents (Sage, Query Builder, Research Agent) exercised as standard live-tier members
 * (plans/integration-test-expansion/agents-extended-suite-proposal.md §5b).
 *
 * LIVE-MODEL, CLIENT transport (GraphQLAIClient → live MJAPI). Smoke-depth BY DESIGN: shipped prompts
 * are not imperative test scripts, so assertions stick to what ANY successful run must satisfy —
 * NEVER the model's content (§3). Every assertion is a framework observable via verifyAgentRun
 * (terminal run + every AIAgentRunStep terminal with CompletedAt; Sub-Agent steps recurse into their
 * linked child runs; Prompt steps → AIPromptRun, Action/Tool steps → Action Execution Log) plus the
 * conversation/artifact plumbing. A missing or non-Active shipped agent is SKIPPED cleanly (informative,
 * not a failure) — mirrors agent-runner AR1.
 *
 * Self-cleaning: live runs are FK-purged and the SA4 conversation removed in Teardown.
 * ON by default (RequiresLiveModel); opt out with RUN_AGENT_TESTS=0.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, verifyAgentRun } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentLiveFixture } from '@memberjunction/testing-integration';
import {
    AGENT_LIVE_FIXTURE_TAG, AGENT_LIVE_SETTLE_MS, newMarker, sleep,
    makeAIClient, userTurn, runAgentOverWire, resolveRunId, getRunSteps, deleteById, purgeAgentRun,
} from './agent-live-shared';

function fixture(ctx: IntegrationCheckContext): AgentLiveFixture {
    if (!ctx.ShippedAgentsLiveFixture) {
        throw new Error('ShippedAgentsLiveFixture not initialized — the shipped-agents-live lifecycle Setup must run first.');
    }
    return ctx.ShippedAgentsLiveFixture;
}

/** Resolve a shipped agent by name; returns null (skip-clean) when absent or non-Active. */
async function resolveShipped(name: string, user: UserInfo): Promise<MJAIAgentEntityExtended | null> {
    const r = await new RunView().RunView<MJAIAgentEntityExtended>({
        EntityName: 'MJ: AI Agents', ExtraFilter: `Name='${name}'`, ResultType: 'entity_object', BypassCache: true,
    }, user);
    const agent = r.Success && r.Results.length === 1 ? r.Results[0] : null;
    if (!agent) { console.log(`      → SKIPPED: shipped agent '${name}' not found in metadata`); return null; }
    if (agent.Status !== 'Active') { console.log(`      → SKIPPED: '${name}' is ${agent.Status} (not runnable)`); return null; }
    return agent;
}

/** Run a shipped agent over the wire, land its run id (recorded for teardown), deep-verify it. */
async function runAndVerify(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, message: string, opts?: { conversationDetailId?: string }): Promise<string> {
    const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), agent, userTurn(message), opts);
    await sleep(AGENT_LIVE_SETTLE_MS);
    const fallback = opts?.conversationDetailId
        ? `AgentID='${agent.ID}' AND ConversationDetailID='${opts.conversationDetailId}'`
        : `AgentID='${agent.ID}' AND Status<>'Running'`;
    const runId = await resolveRunId(result, ctx.User, fallback);
    Assert(!!runId, `shipped run for '${agent.Name}' landed an AI Agent Run`);
    fixture(ctx).LiveRunIds.push(runId!);
    // Deep pass — recurses into Sub-Agent child runs and every step's target log.
    await verifyAgentRun(runId!, ctx.User, true);
    return runId!;
}

export const ShippedAgentsLiveChecks: NamedCheck[] = [
    {
        Id: 'shipped-agents-live.SA1',
        Name: 'SA1: Sage runs a bounded task to a terminal run with every step finalized (flagship wiring intact)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const sage = await resolveShipped('Sage', ctx.User);
            if (!sage) { return; }
            const runId = await runAndVerify(ctx, sage, 'Reply with the single word: pong.');
            const steps = await getRunSteps(runId, ctx.User);
            Assert(steps.length > 0, 'SA1: the run produced steps (the agent graph executed)');
        }
    },
    {
        Id: 'shipped-agents-live.SA2',
        Name: 'SA2: Query Builder completes; any Sub-Agent step links a child run that is itself step-terminal',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const qb = await resolveShipped('Query Builder', ctx.User);
            if (!qb) { return; }
            // verifyAgentRun already recurses Sub-Agent steps into their linked child runs (parent↔child lineage).
            const runId = await runAndVerify(ctx, qb, 'How many users are in the system? Give the number only.');
            const steps = await getRunSteps(runId, ctx.User);
            const subAgentSteps = steps.filter(s => s.StepType === 'Sub-Agent');
            // If it delegated, every Sub-Agent step must be linked to a child run (TargetLogID) — no dangling delegation.
            Assert(subAgentSteps.every(s => !!s.TargetLogID), 'SA2: every Sub-Agent step links a child run (TargetLogID set)');
        }
    },
    {
        Id: 'shipped-agents-live.SA3',
        Name: 'SA3: Research Agent (bounded, no web) reaches terminal with all sub-agent runs linked + terminal — no orphan steps in the tree',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const research = await resolveShipped('Research Agent', ctx.User);
            if (!research) { return; }
            // Narrowly bounded so the multi-sub-agent tree terminates deterministically (no live web dependency).
            const runId = await runAndVerify(
                ctx, research,
                'Using only this sentence and no web search, answer in one word what color the sky is described as: "The sky is blue." Then finish.',
            );
            // verifyAgentRun recursed the whole tree; re-assert no top-level orphan Running step remains.
            const steps = await getRunSteps(runId, ctx.User);
            Assert(steps.every(s => s.Status !== 'Running' && s.CompletedAt != null), 'SA3: every step in the tree finalized (no orphan Running steps)');
        }
    },
    {
        Id: 'shipped-agents-live.SA4',
        Name: 'SA4: a shipped agent run in a conversation stamps ConversationID and writes an agent-response detail (plumbing intact)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const sage = await resolveShipped('Sage', ctx.User);
            if (!sage) { return; }
            const fx = fixture(ctx);
            // Fabricate the conversation + user turn, then run linked to it.
            const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
            conversation.Name = `SA4 shipped conversation ${fx.Marker} ${AGENT_LIVE_FIXTURE_TAG}`;
            conversation.UserID = ctx.User.ID;
            Assert(await conversation.Save(), `SA4: conversation save: ${conversation.LatestResult?.CompleteMessage}`);
            fx.ConversationIds.push(conversation.ID);
            const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
            detail.ConversationID = conversation.ID;
            detail.Role = 'User';
            detail.Message = 'Reply with the single word: pong.';
            detail.HiddenToUser = false;
            Assert(await detail.Save(), `SA4: detail save: ${detail.LatestResult?.CompleteMessage}`);
            fx.ConversationDetailIds.push(detail.ID);

            const runId = await runAndVerify(ctx, sage, 'Reply with the single word: pong.', { conversationDetailId: detail.ID });

            const run = await new RunView().RunView<{ ConversationID: string | null }>({
                EntityName: 'MJ: AI Agent Runs', ExtraFilter: `ID='${runId}'`, Fields: ['ConversationID'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            AssertEqual((run.Results?.[0]?.ConversationID ?? '').toUpperCase(), conversation.ID.toUpperCase(), 'SA4: run stamped with the conversation id');
            const details = await new RunView().RunView<{ Role: string }>({
                EntityName: 'MJ: Conversation Details', ExtraFilter: `ConversationID='${conversation.ID}'`, Fields: ['Role'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            Assert((details.Results || []).some(d => d.Role === 'AI'), 'SA4: an agent-response ConversationDetail (Role=AI) was written');
        }
    },
];

for (const check of ShippedAgentsLiveChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

async function teardownShipped(fx: AgentLiveFixture | undefined, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    if (!fx) {
        return;
    }
    for (const runId of fx.LiveRunIds) {
        try { await purgeAgentRun(runId, provider, user); } catch (e) { console.error('shipped run purge failed:', e); }
    }
    for (const convId of fx.ConversationIds) {
        try {
            const details = await new RunView().RunView<{ ID: string }>({
                EntityName: 'MJ: Conversation Details', ExtraFilter: `ConversationID='${convId}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
            }, user);
            for (const d of (details.Success ? details.Results : [])) {
                await deleteById('MJ: Conversation Details', d.ID, provider, user);
            }
            await deleteById('MJ: Conversations', convId, provider, user);
        } catch (e) { console.error('SA4 conversation cleanup failed:', e); }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('shipped-agents-live', {
    Setup: async ctx => {
        ctx.ShippedAgentsLiveFixture = {
            Marker: newMarker('SA'),
            ConversationIds: [], ConversationDetailIds: [], LiveRunIds: [], FabricatedRunIds: [], FabricatedStepIds: [],
        };
    },
    Teardown: async ctx => {
        await teardownShipped(ctx.ShippedAgentsLiveFixture, ctx.Provider, ctx.User);
        ctx.ShippedAgentsLiveFixture = undefined;
    }
});
