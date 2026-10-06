/**
 * Tests for `TaskGraphContinuationDeliverer`.
 *
 * The gap this closes: the dispatcher was constructed with no deliverer at all, so a graph that
 * finished logged its outcome, marked itself delivered, and said nothing to the conversation that
 * asked for it — durable execution nobody hears about.
 *
 * The contract that matters most is that it **never throws**. The dispatcher calls this inside the
 * compare-and-swap that marks a completion delivered; an escaping error would either abort that
 * guard or leave the graph looking undelivered and re-notifying on every later sweep.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

// Implementations are passed to vi.fn() rather than set with mockResolvedValue/mockReturnValue:
// the shared config's `restoreMocks` runs before every test, and under vitest 3 that resets a
// mock to the implementation it was CREATED with — none, for a bare vi.fn() — so a value set
// afterwards vanished after the first test and the deliverer was handed `undefined` history.
const loadWindowRows = vi.fn(async () => [{ ID: 'd1' }, { ID: 'd2' }]);
const assembleWindow = vi.fn(() => [
    { role: 'user', content: 'Find the five largest cities and give me a table' },
    { role: 'assistant', content: 'Here is the plan…' },
]);
vi.mock('@memberjunction/core-entities', () => ({
    MJConversationDetailEntity: class {},
    MJAIAgentRunEntity: class {},
    MJConversationEntity: class {},
    ConversationEngine: {
        LoadWindowRowsFresh: (...a: unknown[]) => loadWindowRows(...a),
        AssembleContextWindow: (...a: unknown[]) => assembleWindow(...a),
    },
}));

/**
 * The users the server knows. The conversation's owner is `owner-1`; the dispatcher runs as `user-1`.
 * `Refresh` is what the deliverer calls on a cache miss; a test can make it add a user, as a real
 * refresh would for a user created after the process loaded its cache.
 */
const userCache = vi.hoisted(() => ({
    users: [{ ID: 'owner-1', Name: 'Owner One' }, { ID: 'user-1', Name: 'Dispatcher' }] as Array<{ ID: string; Name: string }>,
    refresh: vi.fn(async () => undefined),
}));
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { get Users() { return userCache.users; }, Refresh: (...a: unknown[]) => userCache.refresh(...a) } },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({ MJAIAgentEntityExtended: class {} }));

const publish = vi.fn();
// The factory is hoisted above `publish`'s initialization, so it must not read the binding until called.
vi.mock('../generic/PubSubManager.js', () => ({ PubSubManager: { Instance: { Publish: (...args: unknown[]) => publish(...args) } } }));
vi.mock('../generic/PushStatusResolver.js', () => ({ BROADCAST_SESSION_ID: '*', PUSH_STATUS_UPDATES_TOPIC: 'PUSH_STATUS_UPDATES' }));
vi.mock('@memberjunction/ai', () => ({ ChatMessageRole: { user: 'user' } }));

const runAgent = vi.fn().mockResolvedValue({ success: true });
const runAgentInConversation = vi.fn().mockResolvedValue({ agentResult: { success: true } });
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgent = runAgent; RunAgentInConversation = runAgentInConversation; },
}));

import { TaskGraphContinuationDeliverer } from '../services/TaskGraphContinuationDeliverer';
import type { TaskContinuationParams } from '@memberjunction/task-graph';
import type { UserInfo } from '@memberjunction/core';

/**
 * A row that serves as the source detail (Load → ConversationID), the conversation (Load → UserID),
 * or the reply (NewRecord/Save), depending on where in the sequence the deliverer asks for it.
 */
function detailRow(over: Partial<{ loads: boolean; saves: boolean; conversationID: string; ownerID: string | null }> = {}) {
    const { loads = true, saves = true, conversationID = 'conv-1', ownerID = 'owner-1' } = over;
    return {
        ID: 'detail-new',
        ConversationID: conversationID,
        UserID: ownerID,
        Role: '', Status: '', HiddenToUser: true, Message: '', AgentID: '',
        NewRecord: vi.fn(),
        Load: vi.fn().mockResolvedValue(loads),
        Save: vi.fn().mockResolvedValue(saves),
        LatestResult: { CompleteMessage: 'FK violation' },
    };
}

function harness(over: Parameters<typeof detailRow>[0] = {}) {
    const rows: ReturnType<typeof detailRow>[] = [];
    const provider = {
        GetEntityObject: vi.fn().mockImplementation(async () => {
            const row = detailRow(over);
            rows.push(row);
            return row;
        }),
    };
    const providerFactory = { CreateProvider: vi.fn().mockResolvedValue(provider) };
    const deliverer = new TaskGraphContinuationDeliverer(
        providerFactory as never,
        { ID: 'user-1' } as UserInfo,
    );
    // Rows in order: the source detail (Load), the conversation (Load), the reply (Save).
    return { deliverer, providerFactory, provider, rows, reply: () => rows[2] };
}

const params = (over: Partial<TaskContinuationParams> = {}): TaskContinuationParams => ({
    ParentTaskID: 'parent-1',
    WorkflowName: 'Weekly digest',
    ConversationDetailID: 'detail-1',
    SubmittedByAgentRunID: 'run-1',
    ReinvokeDepth: 0,
    Tasks: [
        { TaskID: 't1', Name: 'Gather', Status: 'Complete', Summary: '412 rows' },
        { TaskID: 't2', Name: 'Summarize', Status: 'Complete' },
    ],
    Summary: '2 of 2 steps completed.',
    ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('posting the outcome', () => {
    it('writes an AI-role message into the graph\'s conversation', async () => {
        const h = harness();
        await h.deliverer.PostMessage(params());

        const reply = h.reply();
        expect(reply.Save).toHaveBeenCalled();
        expect(reply.ConversationID).toBe('conv-1');
        expect(reply.Role).toBe('AI');
        expect(reply.Status).toBe('Complete');
        expect(reply.HiddenToUser).toBe(false);
    });

    it('writes the reply as the conversation\'s OWNER, not as the dispatcher', async () => {
        // A conversation detail may only be written by the conversation's owner or a grantee; the
        // dispatcher's user is neither, and every post was refused until this.
        const h = harness();
        await h.deliverer.PostMessage(params());
        const replyCall = h.provider.GetEntityObject.mock.calls[2];
        expect(replyCall[0]).toBe('MJ: Conversation Details');
        expect(replyCall[1].ID).toBe('owner-1');
    });

    it('falls back to the dispatcher\'s user when no cached user owns the conversation', async () => {
        const h = harness({ ownerID: 'nobody-cached' });
        await h.deliverer.PostMessage(params());
        expect(h.provider.GetEntityObject.mock.calls[2][1].ID).toBe('user-1');
        expect(h.reply().Save).toHaveBeenCalled();
    });

    it('announces the posted message to the owner\'s sessions, so the page updates without a reload', async () => {
        publish.mockClear();
        const h = harness();
        await h.deliverer.PostMessage(params());
        expect(publish).toHaveBeenCalledTimes(1);
        const [, payload] = publish.mock.calls[0];
        expect(payload.sessionId).toBe('*');
        expect(payload.ownerUserId).toBe('owner-1');
        expect(JSON.parse(payload.message).data.conversationDetailId).toBe('detail-new');
    });

    it('does not announce a post that failed to save', async () => {
        publish.mockClear();
        const h = harness({ saves: false });
        await h.deliverer.PostMessage(params());
        expect(publish).not.toHaveBeenCalled();
    });

    it('names the workflow and carries the roll-up', async () => {
        const h = harness();
        await h.deliverer.PostMessage(params());
        expect(h.reply().Message).toContain('Weekly digest');
        expect(h.reply().Message).toContain('2 of 2 steps completed.');
    });

    it('lists each step, not just an aggregate status', async () => {
        // A graph where nine of ten steps succeeded is a materially different message from one that
        // failed outright, and the roll-up alone cannot say which step went wrong.
        const h = harness();
        await h.deliverer.PostMessage(params({
            Tasks: [
                { TaskID: 't1', Name: 'Gather', Status: 'Complete', Summary: '412 rows' },
                { TaskID: 't2', Name: 'Summarize', Status: 'Failed', ErrorMessage: 'model timed out' },
            ],
        }));
        const message = h.reply().Message;
        expect(message).toContain('Gather');
        expect(message).toContain('412 rows');
        expect(message).toContain('Summarize');
        expect(message).toContain('model timed out');
    });

    it('truncates a long graph rather than burying the conversation', async () => {
        const h = harness();
        const many = Array.from({ length: 50 }, (_, i) => ({ TaskID: `t${i}`, Name: `Step ${i}`, Status: 'Complete' }));
        await h.deliverer.PostMessage(params({ Tasks: many }));

        const message = h.reply().Message;
        expect(message).toContain('Step 0');
        expect(message).not.toContain('Step 49');
        // The count is stated rather than silently dropped — the task rows remain the full record.
        expect(message).toContain('30 more');
    });

    it('mints a fresh provider per delivery', async () => {
        // Deliveries run outside any request and concurrently with task execution; a shared provider
        // would share one transaction scope across unrelated work.
        const h = harness();
        await h.deliverer.PostMessage(params());
        expect(h.providerFactory.CreateProvider).toHaveBeenCalledTimes(1);
    });
});

describe('it never throws — the dispatcher marks delivery inside a CAS guard', () => {
    it('does nothing for a headless graph, without treating it as an error', async () => {
        // A graph submitted by a schedule, an entity-change trigger or an API call has no
        // conversation to answer. Most workflows are in this shape.
        const h = harness();
        await expect(h.deliverer.PostMessage(params({ ConversationDetailID: null }))).resolves.toBeUndefined();
        expect(h.providerFactory.CreateProvider).not.toHaveBeenCalled();
    });

    it('survives a conversation detail that will not load', async () => {
        const h = harness({ loads: false });
        await expect(h.deliverer.PostMessage(params())).resolves.toBeUndefined();
        expect(h.rows.length).toBe(1); // never got as far as building a reply
    });

    it('survives a failed save', async () => {
        const h = harness({ saves: false });
        await expect(h.deliverer.PostMessage(params())).resolves.toBeUndefined();
    });

    it('survives a provider that throws outright', async () => {
        const deliverer = new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockRejectedValue(new Error('pool exhausted')) } as never,
            { ID: 'user-1' } as UserInfo,
        );
        await expect(deliverer.PostMessage(params())).resolves.toBeUndefined();
    });
});

describe('Reinvoke — restarting the conversation\'s agent', () => {
    type RunRow = { ID: string; AgentID: string; ParentRunID?: string | null; ConfigurationID?: string | null; UserID?: string | null; loads?: boolean };

    /**
     * A provider that hands out rows in the order Reinvoke asks for them: the submitting run, then
     * each parent up the chain, then the agent, then the source detail (for the conversation ID),
     * then the reply detail.
     */
    function reinvokeHarness(over: { runs?: RunRow[]; agentLoads?: boolean; detail?: Parameters<typeof detailRow>[0] } = {}) {
        const { runs = [{ ID: 'run-1', AgentID: 'agent-1', UserID: 'owner-1' }], agentLoads = true, detail = {} } = over;
        const rows: Array<Record<string, unknown>> = [];
        const queue: Array<Record<string, unknown>> = [];
        for (const r of runs) {
            queue.push({ ...r, ParentRunID: r.ParentRunID ?? null, ConfigurationID: r.ConfigurationID ?? null, UserID: r.UserID ?? null, Load: vi.fn().mockResolvedValue(r.loads ?? true) });
        }
        // The agent row is for the deepest run that LOADS — a parent that will not load is skipped.
        const rootAgentID = [...runs].reverse().find((r) => r.loads !== false)?.AgentID ?? runs[0].AgentID;
        queue.push({ ID: rootAgentID, Load: vi.fn().mockResolvedValue(agentLoads) });
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async () => {
                const row = queue.shift() ?? (detailRow(detail) as unknown as Record<string, unknown>);
                rows.push(row);
                return row;
            }),
            ExecuteSQL: vi.fn(), // marks it as a database provider, so the owner lookup may refresh the user cache
        };
        const deliverer = new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockResolvedValue(provider) } as never,
            { ID: 'user-1' } as UserInfo,
        );
        const details = () => rows.filter((r) => 'NewRecord' in r) as unknown as ReturnType<typeof detailRow>[];
        return { deliverer, provider, rows, reply: () => details()[details().length - 1] };
    }

    beforeEach(() => {
        runAgent.mockClear();
        runAgentInConversation.mockClear();
        publish.mockClear();
        userCache.refresh.mockReset();
        userCache.refresh.mockResolvedValue(undefined);
        userCache.users = [{ ID: 'owner-1', Name: 'Owner One' }, { ID: 'user-1', Name: 'Dispatcher' }];
        runAgentInConversation.mockResolvedValue({ agentResult: { success: true, agentRun: { ID: 'followup-run' } } });
    });

    it('refreshes the user cache on a miss and runs as the owner it then finds', async () => {
        // The owner was created after this process loaded its cache: a stale cache would have
        // acted as the dispatcher's user, which the conversation's owner gate refuses.
        userCache.refresh.mockImplementation(async () => { userCache.users.push({ ID: 'late-owner', Name: 'Late Owner' }); });
        // Both the run's user and the conversation's owner are the late user, so nothing cached matches.
        const h = reinvokeHarness({ runs: [{ ID: 'run-1', AgentID: 'agent-1', UserID: 'late-owner' }], detail: { ownerID: 'late-owner' } });
        await h.deliverer.Reinvoke(params());

        expect(userCache.refresh).toHaveBeenCalledTimes(1);
        const [turn] = runAgentInConversation.mock.calls[0];
        expect(turn.contextUser.ID).toBe('late-owner');
    });

    it('renders each task\'s agent message beside its output', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ Tasks: [
            { TaskID: 't1', Name: 'Weather', Status: 'Complete', Output: '{"cities":["Sydney"]}', Message: 'Sydney: 61°F, overcast.' },
        ] }));
        const content: string = runAgentInConversation.mock.calls[0][0].conversationMessages.at(-1).content;
        expect(content).toContain('**Weather** reported:');
        expect(content).toContain('Sydney: 61°F, overcast.');
        expect(content).toContain('Output of **Weather**:');
    });

    it('announces the landed follow-up to every session of the conversation\'s owner', async () => {
        // The client refreshes on a completion push, but pushes are addressed to the session that
        // started the turn — and nothing started this one. A broadcast to the owner is what makes
        // the follow-up appear without a reload.
        const h = reinvokeHarness({ runs: [
            { ID: 'planner-run', AgentID: 'planner', ParentRunID: 'sage-run' },
            { ID: 'sage-run', AgentID: 'sage', UserID: 'owner-1' },
        ] });
        await h.deliverer.Reinvoke(params());

        expect(publish).toHaveBeenCalledTimes(1);
        const [topic, payload] = publish.mock.calls[0];
        expect(topic).toBe('PUSH_STATUS_UPDATES');
        expect(payload.sessionId).toBe('*');
        expect(payload.ownerUserId).toBe('owner-1');
        const msg = JSON.parse(payload.message);
        expect(msg.resolver).toBe('RunAIAgentResolver');
        expect(msg.data.type).toBe('complete');
        expect(msg.data.conversationDetailId).toBe('detail-new');
        expect(msg.data.conversationId).toBe('conv-1');
        expect(msg.data.agentRunId).toBe('followup-run');
        expect(msg.data.success).toBe(true);
    });

    it('a run with no user still delivers, as the conversation\'s owner', async () => {
        const h = reinvokeHarness({ runs: [{ ID: 'run-1', AgentID: 'agent-1', UserID: null }] });
        await h.deliverer.Reinvoke(params());
        expect(runAgentInConversation).toHaveBeenCalledTimes(1);
        expect(runAgentInConversation.mock.calls[0][0].contextUser.ID).toBe('owner-1');
        expect(publish.mock.calls[0][1].ownerUserId).toBe('owner-1');
    });

    it('runs the follow-up IN the conversation, on a reply it created first', async () => {
        // The regression: RunAgent executes a turn but writes nothing to any conversation, so the
        // follow-up composed its reply and the conversation still said "I'll follow up".
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params());

        expect(runAgent).not.toHaveBeenCalled();
        expect(runAgentInConversation).toHaveBeenCalledTimes(1);
        const [turn, options] = runAgentInConversation.mock.calls[0];
        expect(turn.agent.ID).toBe('agent-1');
        expect(turn.conversationMessages.at(-1).content).toContain('Weekly digest');
        expect(options.conversationId).toBe('conv-1');
        expect(options.conversationDetailId).toBe('detail-new');
        expect(turn.conversationDetailId).toBe('detail-new');

        const reply = h.reply();
        expect(reply.NewRecord).toHaveBeenCalled();
        expect(reply.Role).toBe('AI');
        expect(reply.Status).toBe('In-Progress');
        expect(reply.HiddenToUser).toBe(false);
        expect(reply.AgentID).toBe('agent-1');
        expect(reply.Save).toHaveBeenCalledTimes(1);
    });

    it('runs the follow-up AS the conversation\'s owner, and creates the reply as them', async () => {
        // The root run's user is the owner. The dispatcher's user (user-1) must not appear on
        // either the turn or the reply: the entity's write gate would refuse the dispatcher.
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params());
        const [turn] = runAgentInConversation.mock.calls[0];
        expect(turn.contextUser.ID).toBe('owner-1');
        const replyCall = h.provider.GetEntityObject.mock.calls.filter((c) => c[0] === 'MJ: Conversation Details').pop();
        expect(replyCall?.[1].ID).toBe('owner-1');
    });

    it('resolves the owner from the conversation when the run records an unknown user', async () => {
        const h = reinvokeHarness({ runs: [{ ID: 'run-1', AgentID: 'agent-1', UserID: 'not-cached' }] });
        await h.deliverer.Reinvoke(params());
        expect(runAgentInConversation.mock.calls[0][0].contextUser.ID).toBe('owner-1');
        const [, payload] = publish.mock.calls[0];
        expect(payload.ownerUserId).toBe('owner-1');
    });

    it('gives the follow-up the conversation it belongs to, with the outcome last', async () => {
        // Without the request and the approved plan in front of it, "present it in the form they
        // asked for" had nothing to point at and every follow-up chose its own shape.
        loadWindowRows.mockClear(); assembleWindow.mockClear();
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params());
        const [turn] = runAgentInConversation.mock.calls[0];
        expect(loadWindowRows).toHaveBeenCalledWith('conv-1', expect.objectContaining({ ID: 'owner-1' }), expect.anything());
        expect(assembleWindow.mock.calls[0][1]).toMatchObject({ excludeDetailIds: ['detail-new'], maxTailMessages: 20 });
        expect(turn.conversationMessages).toHaveLength(3);
        expect(turn.conversationMessages[0].content).toContain('give me a table');
        expect(turn.conversationMessages[2].content).toContain('Weekly digest');
        expect(turn.conversationMessages[2].content).toMatch(/exactly the columns they named/);
    });

    it('still runs on the outcome alone when the history cannot be loaded', async () => {
        loadWindowRows.mockRejectedValueOnce(new Error('view failed'));
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params());
        const [turn] = runAgentInConversation.mock.calls[0];
        expect(turn.conversationMessages).toHaveLength(1);
        expect(turn.conversationMessages[0].content).toContain('Weekly digest');
    });

    it('reinvokes the ROOT of the submitting run\'s chain, not the sub-agent that submitted', async () => {
        // The Workflow Planner (a sub-agent of Sage) submits the graph the user approved. The
        // follow-up belongs to Sage — the agent the user is talking to — not to the planner run as
        // a root run of its own.
        const h = reinvokeHarness({ runs: [
            { ID: 'planner-run', AgentID: 'planner', ParentRunID: 'sage-run' },
            { ID: 'sage-run', AgentID: 'sage', ConfigurationID: 'cfg-sage-text' },
        ] });
        await h.deliverer.Reinvoke(params({ SubmittedByAgentRunID: 'planner-run' }));

        const [turn] = runAgentInConversation.mock.calls[0];
        expect(turn.agent.ID).toBe('sage');
        expect(turn.configurationId).toBe('cfg-sage-text');
    });

    it('uses the deepest run that loads when a parent is missing', async () => {
        const h = reinvokeHarness({ runs: [
            { ID: 'child', AgentID: 'planner', ParentRunID: 'gone', ConfigurationID: 'cfg-child' },
            { ID: 'gone', AgentID: 'x', loads: false },
        ] });
        await h.deliverer.Reinvoke(params());
        const [turn] = runAgentInConversation.mock.calls[0];
        expect(turn.agent.ID).toBe('planner');
        expect(turn.configurationId).toBe('cfg-child');
    });

    it('carries each task\'s output and tells the agent to present it', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ Tasks: [
            { TaskID: 't1', Name: 'Build table', Status: 'Complete', Output: '| City | Temp |\n| São Paulo | 72°F |' },
        ] }));
        const content: string = runAgentInConversation.mock.calls[0][0].conversationMessages.at(-1).content;
        expect(content).toContain('Output of **Build table**');
        expect(content).toContain('| São Paulo | 72°F |');
        expect(content).toMatch(/Present these results to the user now/);
        expect(content).toMatch(/do not start the workflow again/i);
    });

    it('stamps depth + 1 — the value that makes MAX_REINVOKE_DEPTH real', async () => {
        // Without this the next graph the restarted run submits begins the chain at zero again, and
        // the cap can never fire. It is the whole reason ContinuationDepth exists as a column.
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ ReinvokeDepth: 3 }));
        expect(runAgentInConversation.mock.calls[0][0].continuationDepth).toBe(4);
    });

    it('starts a chain at 1, not 0 — depth 0 is "not a continuation"', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ ReinvokeDepth: 0 }));
        expect(runAgentInConversation.mock.calls[0][0].continuationDepth).toBe(1);
    });

    it('a headless submitter still gets its turn, without a conversation', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ ConversationDetailID: null }));
        expect(runAgentInConversation).not.toHaveBeenCalled();
        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].continuationDepth).toBe(1);
    });

    it('falls back to posting when the graph records no submitting run', async () => {
        // A schedule- or trigger-started graph has no turn to continue.
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ SubmittedByAgentRunID: null }));
        expect(runAgent).not.toHaveBeenCalled();
        expect(runAgentInConversation).not.toHaveBeenCalled();
    });

    it('falls back to posting when the submitting run cannot be loaded', async () => {
        const h = reinvokeHarness({ runs: [{ ID: 'run-1', AgentID: 'agent-1', loads: false }] });
        await h.deliverer.Reinvoke(params());
        expect(runAgent).not.toHaveBeenCalled();
        expect(runAgentInConversation).not.toHaveBeenCalled();
    });

    it('falls back to posting when the agent cannot be loaded', async () => {
        const h = reinvokeHarness({ agentLoads: false });
        await h.deliverer.Reinvoke(params());
        expect(runAgent).not.toHaveBeenCalled();
        expect(runAgentInConversation).not.toHaveBeenCalled();
    });

    it('never throws, and writes the plain outcome onto the reply it already created', async () => {
        runAgentInConversation.mockRejectedValueOnce(new Error('agent exploded'));
        const h = reinvokeHarness();
        await expect(h.deliverer.Reinvoke(params())).resolves.toBeUndefined();
        const reply = h.reply();
        expect(reply.Save).toHaveBeenCalledTimes(2);
        expect(reply.Status).toBe('Complete');
        expect(reply.Message).toContain('Weekly digest');
        expect(reply.Message).not.toMatch(/Present these results/);
    });
});
