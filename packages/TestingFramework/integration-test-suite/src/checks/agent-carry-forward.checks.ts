/**
 * agent-carry-forward.checks.ts — the 'agent-carry-forward' bundle (CF1–CF6): the prior-turn
 * tool-result carry-forward machinery, proven prompt-visibly via FABRICATE-THEN-OBSERVE
 * (plans/integration-test-expansion/agents-extended-suite-proposal.md §6, §3.4).
 *
 * CC10 (conversation-compaction) covers the LOADER in-process; this bundle proves the
 * PROMPT-VISIBLE behavior over the wire: hand-fabricate a settled prior root run + Tool steps with
 * known OutputData, then spend exactly ONE live observing turn (IT: Echo Agent, cheapest) and assert
 * the framework's reaction in that turn's AIPromptRun.Messages — the injected carry-forward message.
 * All assertions are structural (header contract, compaction/cap markers, isolation, eligibility) —
 * never the model's prose.
 *
 * Machinery (verified in packages/AI/Agents/src/base-agent.ts + tool-result-format.ts):
 *   - injection is ONE transient user message headed by CARRY_FORWARD_HEADER, built by
 *     BaseAgent.BuildPriorTurnToolResultsMessage from settled (Completed|AwaitingFeedback) ROOT runs,
 *     scoped by ConversationID AND AgentID, over Tool steps whose OutputData is an eligible
 *     CarryForwardToolStepOutput (toolFamily ∈ {conversation, artifact}, non-empty tool, result.success);
 *   - the total is capped at maxStandaloneToolResultChars (100_000) with an "omitted for size" note.
 * Carry-forward fires only when the run is conversation-linked (conversationDetailId over the wire).
 *
 * LIVE-MODEL, CLIENT transport; ON by default (RequiresLiveModel), opt out with RUN_AGENT_TESTS=0.
 * Self-cleaning: fabricated steps/runs + live observing runs + conversations removed FK-ordered.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { CarryForwardToolFamily, CarryForwardToolStepOutput } from '@memberjunction/ai-agents';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, AgentLiveFixture } from '@memberjunction/testing-integration';
import {
    AGENT_LIVE_FIXTURE_TAG, AGENT_LIVE_SETTLE_MS, newMarker, sleep,
    makeAIClient, userTurn, runAgentOverWire, resolveRunId, firstPromptMessages,
    deleteById, purgeAgentRun,
} from './agent-live-shared';

/**
 * The exact header BaseAgent.BuildPriorTurnToolResultsMessage prepends. Pinned here as a CONTRACT:
 * the loop-agent system template teaches the model to recognize this string, so a drift is a real
 * regression this bundle must catch (mirrors base-agent.ts:5886).
 */
const CARRY_FORWARD_HEADER = 'Tool results from your previous turn (still valid — reuse instead of re-calling):';
/** base-agent.ts maxStandaloneToolResultChars — the total-size cap for the injected message. */
const MAX_STANDALONE_CHARS = 100_000;

function fixture(ctx: IntegrationCheckContext): AgentLiveFixture {
    if (!ctx.AgentCarryForwardFixture) {
        throw new Error('AgentCarryForwardFixture not initialized — the agent-carry-forward lifecycle Setup must run first.');
    }
    return ctx.AgentCarryForwardFixture;
}

async function agentByName(name: string, user: UserInfo): Promise<MJAIAgentEntityExtended> {
    const r = await new RunView().RunView<MJAIAgentEntityExtended>({
        EntityName: 'MJ: AI Agents', ExtraFilter: `Name='${name}'`, ResultType: 'entity_object', BypassCache: true,
    }, user);
    Assert(r.Success && r.Results.length === 1, `agent '${name}' resolves (found ${r.Results?.length ?? 0})`);
    Assert(r.Results[0].Status === 'Active', `agent '${name}' is Active`);
    return r.Results[0];
}

/** Create a marker-tagged conversation + one user detail; returns their ids (recorded for teardown). */
async function createConversationTurn(ctx: IntegrationCheckContext, text: string): Promise<{ conversationId: string; detailId: string }> {
    const fx = fixture(ctx);
    const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
    conversation.Name = `CF observe ${fx.Marker} ${AGENT_LIVE_FIXTURE_TAG}`;
    conversation.UserID = ctx.User.ID;
    Assert(await conversation.Save(), `conversation save: ${conversation.LatestResult?.CompleteMessage}`);
    fx.ConversationIds.push(conversation.ID);
    const detail = await ctx.Provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', ctx.User);
    detail.ConversationID = conversation.ID;
    detail.Role = 'User';
    detail.Message = text;
    detail.HiddenToUser = false;
    Assert(await detail.Save(), `conversation detail save: ${detail.LatestResult?.CompleteMessage}`);
    fx.ConversationDetailIds.push(detail.ID);
    return { conversationId: conversation.ID, detailId: detail.ID };
}

/** Fabricate a settled prior ROOT run for (conversation, agent) — the §3.4 prior turn. */
async function fabricatePriorRun(ctx: IntegrationCheckContext, conversationId: string, agentId: string, status: MJAIAgentRunEntityExtended['Status']): Promise<MJAIAgentRunEntityExtended> {
    const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', ctx.User);
    run.AgentID = agentId;
    run.ConversationID = conversationId;
    run.Status = status;              // settled (AwaitingFeedback|Completed) or Failed depending on the scenario
    run.StartedAt = new Date();
    run.CompletedAt = new Date();
    Assert(await run.Save(), `fabricated prior run save: ${run.LatestResult?.CompleteMessage}`);
    fixture(ctx).FabricatedRunIds.push(run.ID);
    return run;
}

/** Fabricate one completed Tool step on the prior run carrying the given OutputData. */
async function fabricateToolStep(ctx: IntegrationCheckContext, priorRunId: string, stepNumber: number, outputData: string): Promise<void> {
    const step = await ctx.Provider.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', ctx.User);
    step.AgentRunID = priorRunId;
    step.StepNumber = stepNumber;
    step.StepType = 'Tool';
    step.StepName = `Conversation Tool: getMessageBySequence ${AGENT_LIVE_FIXTURE_TAG}`;
    step.Status = 'Completed';
    step.StartedAt = new Date(Date.now() + stepNumber * 1000); // stable ASC ordering for multi-step scenarios
    step.OutputData = outputData;
    Assert(await step.Save(), `fabricated tool step save: ${step.LatestResult?.CompleteMessage}`);
    fixture(ctx).FabricatedStepIds.push(step.ID);
}

/** A carry-forward-ELIGIBLE Tool-step OutputData (conversation family) with a unique data marker. */
function eligibleOutputData(dataMarker: string): string {
    const out: CarryForwardToolStepOutput = {
        toolFamily: CarryForwardToolFamily.Conversation,
        tool: 'getMessageBySequence',
        input: { sequence: 1 },
        result: { success: true, data: dataMarker },
    };
    return JSON.stringify(out);
}

/** Run IT: Echo Agent one live turn linked to the conversation; return that run's first prompt Messages. */
async function observeTurn(ctx: IntegrationCheckContext, observer: MJAIAgentEntityExtended, detailId: string, conversationId: string): Promise<{ role: string; content: string }[]> {
    const result = await runAgentOverWire(makeAIClient(ctx.Provider, ctx.User), observer, userTurn('Acknowledge and finish.'), { conversationDetailId: detailId });
    await sleep(AGENT_LIVE_SETTLE_MS);
    const runId = await resolveRunId(result, ctx.User, `ConversationID='${conversationId}' AND AgentID='${observer.ID}'`, ctx.Provider);
    Assert(!!runId, 'CF: the observing turn landed an AI Agent Run');
    fixture(ctx).LiveRunIds.push(runId!);
    return firstPromptMessages(runId!, ctx.User, ctx.Provider);
}

/** Messages whose content carries the carry-forward header (the injected transient message(s)). */
function carryForwardMessages(messages: { role: string; content: string }[]): { role: string; content: string }[] {
    return messages.filter(m => m.content.includes(CARRY_FORWARD_HEADER));
}

export const AgentCarryForwardChecks: NamedCheck[] = [
    {
        Id: 'agent-carry-forward.CF1',
        Name: 'CF1: a settled prior turn\'s Tool result is injected as exactly ONE carry-forward message (not re-dumped, not dropped)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const turn = await createConversationTurn(ctx, `CF1 ${fixture(ctx).Marker}`);
            const marker = `CF1-DATA-${fixture(ctx).Marker}`;
            const prior = await fabricatePriorRun(ctx, turn.conversationId, echo.ID, 'AwaitingFeedback');
            await fabricateToolStep(ctx, prior.ID, 1, eligibleOutputData(marker));

            const messages = await observeTurn(ctx, echo, turn.detailId, turn.conversationId);
            const injected = carryForwardMessages(messages);
            AssertEqual(injected.length, 1, `CF1: exactly one injected carry-forward message (got ${injected.length}) — not a full re-dump, not nothing`);
            Assert(injected[0].role === 'user', 'CF1: the injected message has role=user');
            Assert(injected[0].content.includes(marker), 'CF1: the injected message carries the prior tool result');
            Assert(injected[0].content.includes('getMessageBySequence'), 'CF1: the rendered section names the tool');
        }
    },
    {
        Id: 'agent-carry-forward.CF2',
        Name: 'CF2: combined prior results over the 100k cap are size-capped with an omitted-for-size marker (bounded context)',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const turn = await createConversationTurn(ctx, `CF2 ${fixture(ctx).Marker}`);
            const prior = await fabricatePriorRun(ctx, turn.conversationId, echo.ID, 'AwaitingFeedback');
            // Two ~60k results → ~120k combined > 100k cap: first fits, second is dropped-with-note.
            const keep = `CF2-KEEP-${fixture(ctx).Marker}`;
            const drop = `CF2-DROP-${fixture(ctx).Marker}`;
            await fabricateToolStep(ctx, prior.ID, 1, eligibleOutputData(keep + 'x'.repeat(60_000)));
            await fabricateToolStep(ctx, prior.ID, 2, eligibleOutputData(drop + 'x'.repeat(60_000)));

            const messages = await observeTurn(ctx, echo, turn.detailId, turn.conversationId);
            const injected = carryForwardMessages(messages);
            AssertEqual(injected.length, 1, `CF2: still exactly one injected message (got ${injected.length})`);
            const content = injected[0].content;
            Assert(content.includes('omitted for size'), 'CF2: the omitted-for-size marker is present (the cap engaged)');
            Assert(content.includes(keep), 'CF2: the first (fitting) result is retained');
            Assert(!content.includes(drop), 'CF2: the over-cap result was dropped, not injected');
            Assert(content.length < MAX_STANDALONE_CHARS + 2_000, `CF2: injected message is bounded (~${content.length} chars, not the full ~120k)`);
        }
    },
    {
        Id: 'agent-carry-forward.CF3',
        Name: 'CF3: the DB-fallback render is deterministic — two independent observing turns produce byte-identical injected messages',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            // ADAPTS the proposal\'s cache≡DB CF3: the server-side PriorTurnToolResultCache is not reachable
            // over the wire, so the literal cache-vs-DB comparison lives in CC10 (in-process). Here we prove
            // the DB-fallback RENDER path is deterministic/stable — identical fabricated prior state in two
            // fresh conversations must render byte-identical carry-forward messages (catches stale/shape drift).
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const marker = `CF3-DATA-${fixture(ctx).Marker}`;
            const contents: string[] = [];
            for (const tag of ['A', 'B']) {
                const turn = await createConversationTurn(ctx, `CF3-${tag} ${fixture(ctx).Marker}`);
                const prior = await fabricatePriorRun(ctx, turn.conversationId, echo.ID, 'AwaitingFeedback');
                await fabricateToolStep(ctx, prior.ID, 1, eligibleOutputData(marker));
                const injected = carryForwardMessages(await observeTurn(ctx, echo, turn.detailId, turn.conversationId));
                AssertEqual(injected.length, 1, `CF3-${tag}: one injected carry-forward message`);
                contents.push(injected[0].content);
            }
            AssertEqual(contents[0], contents[1], 'CF3: the two independent DB-fallback renders are byte-identical');
        }
    },
    {
        Id: 'agent-carry-forward.CF4',
        Name: 'CF4: cross-agent and cross-conversation isolation — neither inherits the prior turn\'s tool results',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const other = await agentByName('IT: Tool Loop Agent', ctx.User);
            const marker = `CF4-DATA-${fixture(ctx).Marker}`;

            // (a) same conversation, DIFFERENT agent observing → AgentID filter blocks injection.
            const turnA = await createConversationTurn(ctx, `CF4a ${fixture(ctx).Marker}`);
            const priorA = await fabricatePriorRun(ctx, turnA.conversationId, echo.ID, 'AwaitingFeedback');
            await fabricateToolStep(ctx, priorA.ID, 1, eligibleOutputData(marker));
            const crossAgent = carryForwardMessages(await observeTurn(ctx, other, turnA.detailId, turnA.conversationId));
            AssertEqual(crossAgent.length, 0, 'CF4: a different agent in the same conversation gets NO injection (cross-agent isolation)');

            // (b) same agent, DIFFERENT conversation observing → ConversationID filter blocks injection.
            const turnB = await createConversationTurn(ctx, `CF4b-prior ${fixture(ctx).Marker}`);
            const priorB = await fabricatePriorRun(ctx, turnB.conversationId, echo.ID, 'AwaitingFeedback');
            await fabricateToolStep(ctx, priorB.ID, 1, eligibleOutputData(marker));
            const turnC = await createConversationTurn(ctx, `CF4b-observe ${fixture(ctx).Marker}`); // fresh conversation, no prior run
            const crossConv = carryForwardMessages(await observeTurn(ctx, echo, turnC.detailId, turnC.conversationId));
            AssertEqual(crossConv.length, 0, 'CF4: the same agent in a different conversation gets NO injection (cross-conversation isolation)');
        }
    },
    {
        Id: 'agent-carry-forward.CF5',
        Name: 'CF5: a prior run that ended Failed is never replayed — only settled (Completed|AwaitingFeedback) runs carry forward',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const turn = await createConversationTurn(ctx, `CF5 ${fixture(ctx).Marker}`);
            const marker = `CF5-DATA-${fixture(ctx).Marker}`;
            const prior = await fabricatePriorRun(ctx, turn.conversationId, echo.ID, 'Failed'); // NOT a settled status
            await fabricateToolStep(ctx, prior.ID, 1, eligibleOutputData(marker));

            const injected = carryForwardMessages(await observeTurn(ctx, echo, turn.detailId, turn.conversationId));
            AssertEqual(injected.length, 0, 'CF5: a Failed prior run produced NO carry-forward injection');
        }
    },
    {
        Id: 'agent-carry-forward.CF6',
        Name: 'CF6: only carry-forward-eligible tool families replay — an ineligible Tool step (no eligible toolFamily) is never injected',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            // REPURPOSED from the proposal\'s message-expiry CF6 (expiry needs ≥3 in-run iterations the
            // deterministic test agents don\'t produce — deferred to unit level). This pins the eligibility
            // gate (base-agent.ts:5865): Tool steps whose OutputData lacks an eligible toolFamily (e.g.
            // memory-write / client-tool steps) must NEVER be replayed as reusable results.
            const echo = await agentByName('IT: Echo Agent', ctx.User);
            const turn = await createConversationTurn(ctx, `CF6 ${fixture(ctx).Marker}`);
            const marker = `CF6-DATA-${fixture(ctx).Marker}`;
            const prior = await fabricatePriorRun(ctx, turn.conversationId, echo.ID, 'AwaitingFeedback');
            // A Tool step with NO carry-forward toolFamily (shaped like a non-replayable memory-write result).
            const ineligible = JSON.stringify({ tool: 'writeMemory', input: { note: marker }, result: { success: true, data: marker } });
            await fabricateToolStep(ctx, prior.ID, 1, ineligible);

            const injected = carryForwardMessages(await observeTurn(ctx, echo, turn.detailId, turn.conversationId));
            AssertEqual(injected.length, 0, 'CF6: an ineligible-toolFamily Tool step produced NO injection');
        }
    },
];

for (const check of AgentCarryForwardChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

async function teardownCarryForward(fx: AgentLiveFixture | undefined, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    if (!fx) {
        return;
    }
    for (const runId of fx.LiveRunIds) {
        try { await purgeAgentRun(runId, provider, user); } catch (e) { console.error('CF live run purge failed:', e); }
    }
    for (const stepId of fx.FabricatedStepIds) {
        await deleteById('MJ: AI Agent Run Steps', stepId, provider, user);
    }
    for (const runId of fx.FabricatedRunIds) {
        await deleteById('MJ: AI Agent Runs', runId, provider, user);
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
        } catch (e) { console.error('CF conversation cleanup failed:', e); }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-carry-forward', {
    Setup: async ctx => {
        ctx.AgentCarryForwardFixture = {
            Marker: newMarker('CF'),
            ConversationIds: [], ConversationDetailIds: [], LiveRunIds: [], FabricatedRunIds: [], FabricatedStepIds: [],
        };
    },
    Teardown: async ctx => {
        await teardownCarryForward(ctx.AgentCarryForwardFixture, ctx.Provider, ctx.User);
        ctx.AgentCarryForwardFixture = undefined;
    }
});
