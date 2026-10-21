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
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMetadataProvider, runAgent, processAgentArtifacts } = vi.hoisted(() => ({
    fromMetadataProvider: vi.fn(),
    runAgent: vi.fn(),
    processAgentArtifacts: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: {
        FromMetadataProvider: fromMetadataProvider,
    },
}));

const { OWNER, SUBMITTER } = vi.hoisted(() => ({ OWNER: { ID: 'owner-1' }, SUBMITTER: { ID: 'submitter-1' } }));
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: { Users: [OWNER, SUBMITTER, { ID: 'owner-user-99', Email: 'owner@example.com' }] },
        Users: [OWNER, SUBMITTER, { ID: 'owner-user-99', Email: 'owner@example.com' }],
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJConversationDetailEntity: class {},
    MJConversationDetailEntityExtended: class {},
    MJConversationEntity: class {},
    MJAIAgentRunEntity: class {},
}));

vi.mock('@memberjunction/ai-core-plus', () => ({ MJAIAgentEntityExtended: class {} }));
vi.mock('@memberjunction/ai', () => ({ ChatMessageRole: { user: 'user' } }));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = runAgent;
        ProcessAgentArtifacts = processAgentArtifacts;
    },
}));

import { TaskGraphContinuationDeliverer } from '../services/TaskGraphContinuationDeliverer';
import type { TaskContinuationParams } from '@memberjunction/task-graph';
import type { UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';

/** A conversation-detail row that can be loaded (the source) and saved (the reply). */
function detailRow(over: Partial<{ loads: boolean; saves: boolean; conversationID: string; branchID: string | null }> = {}) {
    const { loads = true, saves = true, conversationID = 'conv-1', branchID = null } = over;
    return {
        ID: 'reply-detail-1',
        ConversationID: conversationID,
        BranchID: branchID as string | null,
        UserID: 'owner-1',
        Role: '', Status: '', HiddenToUser: true, Message: '',
        AgentID: null as string | null,
        NewRecord: vi.fn(),
        MarkServerAuthoredReply: vi.fn(),
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
            if (rows.length > 0) {
                row.BranchID = 'stale';
            }
            rows.push(row);
            return row;
        }),
    };
    const providerFactory = { CreateProvider: vi.fn().mockResolvedValue(provider) };
    const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;
    const deliverer = new TaskGraphContinuationDeliverer(
        providerFactory as never,
        { ID: 'user-1' } as UserInfo,
        pubSub,
    );
    // Rows in order: the source detail (Load), the reply (Save). The reply starts on a 'stale' fork, so a test sees
    // the deliverer set it.
    return { deliverer, providerFactory, provider, rows, pubSub, reply: () => rows[1] };
}

const params = (over: Partial<TaskContinuationParams> = {}): TaskContinuationParams => ({
    ParentTaskID: 'parent-1',
    WorkflowName: 'Weekly digest',
    ConversationDetailID: 'detail-1',
    SubmittedByAgentRunID: 'run-1',
    SubmittedByUserID: 'submitter-1',
    ReinvokeDepth: 0,
    Tasks: [
        { TaskID: 't1', Name: 'Gather', Status: 'Complete', Summary: '412 rows' },
        { TaskID: 't2', Name: 'Summarize', Status: 'Complete' },
    ],
    Summary: '2 of 2 steps completed.',
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    fromMetadataProvider.mockReturnValue({
        RunView: vi.fn().mockResolvedValue({ Success: false, Results: [] }),
    });
    runAgent.mockResolvedValue({
        success: true,
        payload: 'Synthesized workflow outcome',
        agentRun: { ID: 'cont-run-1', Message: 'Synthesized workflow outcome' },
    });
    processAgentArtifacts.mockResolvedValue(undefined);
});

describe('posting the outcome', () => {
    it('writes an AI-role message into the graph\'s conversation and broadcasts completion via pubSub', async () => {
        const h = harness();
        await h.deliverer.PostMessage(params());

        const reply = h.reply();
        expect(reply.Save).toHaveBeenCalled();
        expect(reply.ConversationID).toBe('conv-1');
        expect(reply.Role).toBe('AI');
        expect(reply.Status).toBe('Complete');
        expect(reply.HiddenToUser).toBe(false);
        expect(h.pubSub.publish).toHaveBeenCalledTimes(2);
    });

    it("writes it as the graph's submitter, not the conversation's owner, marked as the server's reply", async () => {
        // TaskGraph.Submit takes any conversation detail ID. Written as the owner, the gate would pass for a
        // conversation the submitter cannot reach; written as the submitter, the gate checks their access.
        const h = harness();
        await h.deliverer.PostMessage(params());

        expect(h.provider.GetEntityObject.mock.calls[1]).toEqual(['MJ: Conversation Details', SUBMITTER]);
        expect(h.provider.GetEntityObject.mock.calls.some((call) => call[1] === OWNER)).toBe(false);
        expect(h.reply().MarkServerAuthoredReply).toHaveBeenCalledOnce();
    });

    it("falls back to the deliverer's own user when the graph records no submitter it knows", async () => {
        for (const submitter of [null, 'stranger-1']) {
            const h = harness();
            await h.deliverer.PostMessage(params({ SubmittedByUserID: submitter }));
            expect(h.provider.GetEntityObject.mock.calls[1]).toEqual(['MJ: Conversation Details', { ID: 'user-1' }]);
        }
    });

    it('names the workflow and carries the roll-up', async () => {
        const h = harness();
        await h.deliverer.PostMessage(params());
        expect(h.reply().Message).toContain('Weekly digest');
        expect(h.reply().Message).toContain('2 of 2 steps completed.');
    });

    it('lists each step, not just an aggregate status', async () => {
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
        expect(message).toContain('30 more');
    });

    it('posts into the fork of the message that started the graph', async () => {
        const h = harness({ branchID: 'T1' });
        await h.deliverer.PostMessage(params());
        expect(h.reply().BranchID).toBe('T1');
    });

    it('posts into Main when that message is in Main', async () => {
        const h = harness();
        await h.deliverer.PostMessage(params());
        expect(h.reply().BranchID).toBeNull();
    });

    it('mints a fresh provider per delivery', async () => {
        const h = harness();
        await h.deliverer.PostMessage(params());
        expect(h.providerFactory.CreateProvider).toHaveBeenCalledTimes(1);
    });
});

describe('it never throws — the dispatcher marks delivery inside a CAS guard', () => {
    it('does nothing for a headless graph, without treating it as an error', async () => {
        const h = harness();
        await expect(h.deliverer.PostMessage(params({ ConversationDetailID: null }))).resolves.toBeUndefined();
        expect(h.providerFactory.CreateProvider).not.toHaveBeenCalled();
    });

    it('survives a conversation detail that will not load', async () => {
        const h = harness({ loads: false });
        await expect(h.deliverer.PostMessage(params())).resolves.toBeUndefined();
        expect(h.rows.length).toBe(1);
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

describe('Reinvoke — restarting the submitting agent', () => {
    function reinvokeHarness(over: { runLoads?: boolean; agentLoads?: boolean } = {}) {
        const { runLoads = true, agentLoads = true } = over;
        const rows: Array<Record<string, unknown>> = [];
        let call = 0;
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async () => {
                call++;
                if (call === 1) {
                    const run = { AgentID: 'agent-1', Load: vi.fn().mockResolvedValue(runLoads) };
                    rows.push(run);
                    return run;
                }
                if (call === 2) {
                    const agent = { ID: 'agent-1', Load: vi.fn().mockResolvedValue(agentLoads) };
                    rows.push(agent);
                    return agent;
                }
                const detail = detailRow();
                rows.push(detail as unknown as Record<string, unknown>);
                return detail;
            }),
        };
        const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;
        const deliverer = new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockResolvedValue(provider) } as never,
            { ID: 'user-1' } as UserInfo,
            pubSub,
        );
        return { deliverer, provider, rows, pubSub };
    }

    it('starts the submitting agent a fresh turn carrying the outcome, saves reply detail, processes artifacts, and publishes completion', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params());

        expect(runAgent).toHaveBeenCalledTimes(1);
        const call = runAgent.mock.calls[0][0];
        expect(call.agent.ID).toBe('agent-1');
        expect(call.conversationMessages[0].content).toContain('Weekly digest');
        expect(call.conversationDetailId).toBe('reply-detail-1');

        const reply = h.rows[3] as ReturnType<typeof detailRow>;
        expect(reply.Role).toBe('AI');
        expect(reply.Status).toBe('Complete');
        expect(reply.Message).toBe('Synthesized workflow outcome');
        expect(processAgentArtifacts).toHaveBeenCalledTimes(1);
        expect(h.pubSub.publish).toHaveBeenCalledTimes(2);
    });

    it('stamps depth + 1 — the value that makes MAX_REINVOKE_DEPTH real', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ ReinvokeDepth: 3 }));
        expect(runAgent.mock.calls[0][0].continuationDepth).toBe(4);
    });

    it('starts a chain at 1, not 0 — depth 0 is "not a continuation"', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ ReinvokeDepth: 0 }));
        expect(runAgent.mock.calls[0][0].continuationDepth).toBe(1);
    });

    it('falls back to posting when the graph records no submitting run', async () => {
        const h = reinvokeHarness();
        await h.deliverer.Reinvoke(params({ SubmittedByAgentRunID: null }));
        expect(runAgent).not.toHaveBeenCalled();
    });

    it('falls back to posting when the submitting run cannot be loaded', async () => {
        const h = reinvokeHarness({ runLoads: false });
        await h.deliverer.Reinvoke(params());
        expect(runAgent).not.toHaveBeenCalled();
    });

    it('falls back to posting when the agent cannot be loaded', async () => {
        const h = reinvokeHarness({ agentLoads: false });
        await h.deliverer.Reinvoke(params());
        expect(runAgent).not.toHaveBeenCalled();
    });

    it('never throws — the dispatcher marks delivery inside a CAS guard', async () => {
        runAgent.mockRejectedValueOnce(new Error('agent exploded'));
        const h = reinvokeHarness();
        await expect(h.deliverer.Reinvoke(params())).resolves.toBeUndefined();
    });
});

describe('Reinvoke — on the fork of the message that started the graph', () => {
    function forkHarness(originBranch: string | null) {
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (name: string) => {
                if (name === 'MJ: AI Agent Runs') return { AgentID: 'agent-1', Load: vi.fn().mockResolvedValue(true) };
                if (name === 'MJ: AI Agents') return { ID: 'agent-1', Load: vi.fn().mockResolvedValue(true) };
                return detailRow({ branchID: originBranch });
            }),
        };
        return new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockResolvedValue(provider) } as never,
            { ID: 'user-1' } as UserInfo,
        );
    }

    it('runs the reinvoked agent on that fork, as PostMessage posts into it', async () => {
        await forkHarness('T1').Reinvoke(params());

        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].ConversationBranchID).toBe('T1');
    });

    it('leaves the branch unset when that message is in Main', async () => {
        await forkHarness(null).Reinvoke(params());

        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].ConversationBranchID).toBeUndefined();
    });

    it('enriches placeholder "output available (...)" task summaries with OutputPayload excerpts from MJ: Tasks', async () => {
        const { RunView } = await import('@memberjunction/core');
        vi.mocked(RunView.FromMetadataProvider).mockReturnValue({
            RunView: vi.fn().mockImplementation(async (rvParams: { EntityName: string }) => {
                if (rvParams.EntityName === 'MJ: Tasks') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 't1',
                                Name: 'Generate Schema Count Query',
                                OutputPayload: JSON.stringify({
                                    title: 'Entity Counts by Schema',
                                    request: 'SELECT SchemaName, COUNT(*) AS EntityCount FROM __mj.vwEntities GROUP BY SchemaName',
                                }),
                            },
                        ],
                    };
                }
                return { Success: false, Results: [] };
            }),
        } as never);

        await forkHarness(null).Reinvoke(
            params({
                Tasks: [
                    { TaskID: 't1', Name: 'Generate Schema Count Query', Status: 'Complete', Summary: 'output available (180 chars)' },
                ],
            }),
        );

        expect(runAgent).toHaveBeenCalledTimes(1);
        const sentContent = runAgent.mock.calls[0][0].conversationMessages[0].content as string;
        expect(sentContent).toContain('Title: Entity Counts by Schema');
        expect(sentContent).toContain('SELECT SchemaName, COUNT(*) AS EntityCount FROM __mj.vwEntities GROUP BY SchemaName');
    });

    it('updates the originating message in-place when no intervening messages were sent (IsLatest = true)', async () => {
        const { RunView } = await import('@memberjunction/core');
        vi.mocked(RunView.FromMetadataProvider).mockReturnValue({
            RunView: vi.fn().mockImplementation(async (rvParams: { EntityName: string }) => {
                if (rvParams.EntityName === 'MJ: Conversation Details') {
                    return {
                        Success: true,
                        Results: [{ ID: 'detail-1' }],
                    };
                }
                return { Success: false, Results: [] };
            }),
        } as never);

        const originDetail = {
            ...detailRow(),
            ID: 'detail-1',
            Message: "Started **Weekly digest** — 2 task(s) running. I'll follow up when it finishes.",
        };
        const createdDetails: Array<ReturnType<typeof detailRow>> = [];
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (name: string) => {
                if (name === 'MJ: AI Agent Runs') return { AgentID: 'agent-1', Load: vi.fn().mockResolvedValue(true) };
                if (name === 'MJ: AI Agents') return { ID: 'agent-1', Load: vi.fn().mockResolvedValue(true) };
                if (createdDetails.length === 0) {
                    createdDetails.push(originDetail);
                    return originDetail;
                }
                const next = detailRow();
                createdDetails.push(next);
                return next;
            }),
        };
        const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;
        const deliverer = new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockResolvedValue(provider) } as never,
            { ID: 'user-1' } as UserInfo,
            pubSub,
        );

        await deliverer.Reinvoke(params());

        // Only the originating detail was loaded and updated in-place — no second detail row created!
        expect(createdDetails.length).toBe(1);
        expect(originDetail.NewRecord).not.toHaveBeenCalled();
        expect(originDetail.Message).toBe('Synthesized workflow outcome');
        expect(originDetail.Status).toBe('Complete');
        expect(runAgent.mock.calls[0][0].conversationDetailId).toBe('detail-1');
        expect(runAgent.mock.calls[0][0].inputArtifacts).toEqual([]);
        expect(pubSub.publish).toHaveBeenCalledTimes(1);
    });

    it('creates a bottom continuation reply with ParentID = originDetailId and updates the origin message note when intervening messages exist (IsLatest = false)', async () => {
        const { RunView } = await import('@memberjunction/core');
        vi.mocked(RunView.FromMetadataProvider).mockReturnValue({
            RunView: vi.fn().mockImplementation(async (rvParams: { EntityName: string }) => {
                if (rvParams.EntityName === 'MJ: Conversation Details') {
                    return {
                        Success: true,
                        Results: [{ ID: 'intervening-user-msg-2' }],
                    };
                }
                return { Success: false, Results: [] };
            }),
        } as never);

        const originDetail = {
            ...detailRow(),
            ID: 'detail-1',
            ParentID: null as string | null,
            Message: "Started **Weekly digest** — 2 task(s) running. I'll follow up when it finishes.",
        };
        const replyDetail = {
            ...detailRow(),
            ID: 'bottom-reply-3',
            ParentID: null as string | null,
        };
        let detailCallCount = 0;
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (name: string) => {
                if (name === 'MJ: AI Agent Runs') return { AgentID: 'agent-1', Load: vi.fn().mockResolvedValue(true) };
                if (name === 'MJ: AI Agents') return { ID: 'agent-1', Load: vi.fn().mockResolvedValue(true) };
                detailCallCount++;
                return detailCallCount === 1 ? originDetail : replyDetail;
            }),
        };
        const pubSub = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as PubSubEngine;
        const deliverer = new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockResolvedValue(provider) } as never,
            { ID: 'user-1' } as UserInfo,
            pubSub,
        );

        await deliverer.Reinvoke(params());

        expect(replyDetail.NewRecord).toHaveBeenCalledTimes(1);
        expect(replyDetail.ParentID).toBe('detail-1');
        expect(replyDetail.Message).toBe('Synthesized workflow outcome');
        expect(originDetail.Message).toContain('*(✅ **Weekly digest** completed — synthesized results posted below.)*');
        expect(originDetail.Message).not.toContain("I'll follow up when it finishes");
        expect(pubSub.publish).toHaveBeenCalledTimes(2);
    });

    it('strips inherited upstream payload keys across DAG steps and extracts nested synthesis and report fields', async () => {
        const { RunView } = await import('@memberjunction/core');
        const step1Payload = {
            queryName: 'Annual Order Counts',
            sql: 'SELECT YEAR(OrderDate) AS OrderYear, COUNT(*) AS OrderCount FROM Orders GROUP BY YEAR(OrderDate)',
            explanation: 'Counts orders grouped by year.',
        };
        const step2Payload = {
            ...step1Payload,
            synthesis: {
                executiveSummary: 'Order volume grew 22% YoY between 2022 and 2025.',
                keyFindings: ['2024 peak growth', 'Steady enterprise retention'],
            },
        };
        const step3Payload = {
            ...step2Payload,
            report: {
                name: 'Annual Order Trend Executive Report',
                description: 'Board-ready HTML report covering annual order volume and YoY trajectory.',
                html: '<h1>Annual Order Trend</h1><p>Executive overview of multi-year order growth.</p>',
            },
        };

        vi.mocked(RunView.FromMetadataProvider).mockReturnValue({
            RunView: vi.fn().mockImplementation(async (rvParams: { EntityName: string }) => {
                if (rvParams.EntityName === 'MJ: Tasks') {
                    return {
                        Success: true,
                        Results: [
                            { ID: 't1', Name: 'Step 1: Query', OutputPayload: JSON.stringify(step1Payload) },
                            { ID: 't2', Name: 'Step 2: Strategy', OutputPayload: JSON.stringify(step2Payload) },
                            { ID: 't3', Name: 'Step 3: Report', OutputPayload: JSON.stringify(step3Payload) },
                        ],
                    };
                }
                return { Success: false, Results: [] };
            }),
        } as never);

        await forkHarness(null).Reinvoke(
            params({
                Tasks: [
                    { TaskID: 't1', Name: 'Step 1: Query', Status: 'Complete', Summary: 'output available (180 chars)' },
                    { TaskID: 't2', Name: 'Step 2: Strategy', Status: 'Complete', Summary: 'output available (320 chars)' },
                    { TaskID: 't3', Name: 'Step 3: Report', Status: 'Complete', Summary: 'output available (540 chars)' },
                ],
            }),
        );

        const sentContent = runAgent.mock.calls[0][0].conversationMessages[0].content as string;
        expect(sentContent).toContain('Title: Annual Order Counts');
        expect(sentContent).toContain('Executive Summary: Order volume grew 22% YoY between 2022 and 2025.');
        expect(sentContent).toContain('Report Title: Annual Order Trend Executive Report');
        expect(sentContent).toContain('Report Summary: Board-ready HTML report covering annual order volume and YoY trajectory.');
        // Step 1's SQL should only appear once (under Step 1), not duplicated under Step 2 and Step 3!
        const sqlOccurrences = sentContent.split('SELECT YEAR(OrderDate) AS OrderYear').length - 1;
        expect(sqlOccurrences).toBe(1);
    });

    it('walks up ParentRunID so a sub-agent (Workflow Planner) submission reinvokes the root conversation agent (Sage) as the conversation owner', async () => {
        const subAgentRun = {
            ID: 'subagent-planner-run',
            AgentID: 'workflow-planner-agent-id',
            ParentRunID: 'root-sage-run',
            UserID: null as string | null,
            Load: vi.fn().mockResolvedValue(true),
        };
        const rootSageRun = {
            ID: 'root-sage-run',
            AgentID: 'sage-agent-id',
            ParentRunID: null as string | null,
            UserID: 'owner-user-99',
            Load: vi.fn().mockResolvedValue(true),
        };
        const sageAgent = {
            ID: 'sage-agent-id',
            Name: 'Sage',
            Load: vi.fn().mockResolvedValue(true),
        };
        const detail = detailRow();
        let runCallCount = 0;
        const detailUsers: Array<UserInfo | undefined> = [];

        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (name: string, user?: UserInfo) => {
                if (name === 'MJ: AI Agent Runs') {
                    runCallCount++;
                    return runCallCount === 1 ? subAgentRun : rootSageRun;
                }
                if (name === 'MJ: AI Agents') {
                    return sageAgent;
                }
                detailUsers.push(user);
                return detail;
            }),
        };

        const deliverer = new TaskGraphContinuationDeliverer(
            { CreateProvider: vi.fn().mockResolvedValue(provider) } as never,
            { ID: 'system-user' } as UserInfo,
        );

        await deliverer.Reinvoke(params({ SubmittedByAgentRunID: 'subagent-planner-run' }));

        expect(subAgentRun.Load).toHaveBeenCalledWith('subagent-planner-run');
        expect(rootSageRun.Load).toHaveBeenCalledWith('root-sage-run');
        expect(sageAgent.Load).toHaveBeenCalledWith('sage-agent-id');
        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].agent.ID).toBe('sage-agent-id');
        expect(runAgent.mock.calls[0][0].contextUser.ID).toBe('owner-user-99');
        expect(detailUsers[0]?.ID).toBe('owner-user-99');
    });

    it('enriches Skipped steps with their unmet dependency Condition from MJ: Task Dependencies', async () => {
        const { RunView } = await import('@memberjunction/core');
        vi.mocked(RunView.FromMetadataProvider).mockReturnValue({
            RunView: vi.fn().mockImplementation(async (rvParams: { EntityName: string }) => {
                if (rvParams.EntityName === 'MJ: Tasks') {
                    return {
                        Success: true,
                        Results: [
                            { ID: 't1', Name: 'Build Query', Status: 'Complete', OutputPayload: JSON.stringify({ queryName: 'Users by Role' }) },
                            { ID: 't2', Name: 'Run Query', Status: 'Complete', OutputPayload: JSON.stringify({ summary: 'Built query blueprint without live execution' }) },
                            { ID: 't3', Name: 'Analyze Results', Status: 'Skipped', OutputPayload: null },
                        ],
                    };
                }
                if (rvParams.EntityName === 'MJ: Task Dependencies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                TaskID: 't3',
                                DependsOnTaskID: 't2',
                                Condition: 'output.rowCount > 0',
                            },
                        ],
                    };
                }
                return { Success: false, Results: [] };
            }),
        } as never);

        await forkHarness(null).Reinvoke(
            params({
                Tasks: [
                    { TaskID: 't1', Name: 'Build Query', Status: 'Complete' },
                    { TaskID: 't2', Name: 'Run Query', Status: 'Complete' },
                    { TaskID: 't3', Name: 'Analyze Results', Status: 'Skipped' },
                ],
                Summary: '2 of 3 steps completed (1 skipped).',
            }),
        );

        const sentContent = runAgent.mock.calls[0][0].conversationMessages[0].content as string;
        expect(sentContent).toContain('- ⏭️ **Analyze Results** — Skipped: branch condition `output.rowCount > 0` on "Run Query" evaluated to false');
        expect(sentContent).toContain('briefly explaining any conditional steps that were skipped');
    });
});


