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

vi.mock('@memberjunction/core-entities', () => ({
    MJConversationDetailEntity: class {},
}));

import { TaskGraphContinuationDeliverer } from '../services/TaskGraphContinuationDeliverer';
import type { TaskContinuationParams } from '@memberjunction/task-graph';
import type { UserInfo } from '@memberjunction/core';

/** A conversation-detail row that can be loaded (the source) and saved (the reply). */
function detailRow(over: Partial<{ loads: boolean; saves: boolean; conversationID: string }> = {}) {
    const { loads = true, saves = true, conversationID = 'conv-1' } = over;
    return {
        ConversationID: conversationID,
        Role: '', Status: '', HiddenToUser: true, Message: '',
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
    // First row is the source detail (Load), second is the reply (Save).
    return { deliverer, providerFactory, provider, rows, reply: () => rows[1] };
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

describe('Reinvoke', () => {
    it('is deliberately absent, so the dispatcher degrades to a message', () => {
        // A safe reinvoke needs the NEW agent run to remember it was a continuation at depth N, so a
        // graph it submits inherits depth + 1 and MAX_REINVOKE_DEPTH can stop the chain. Nothing
        // durable records that yet, and a cap that never trips is worse than degrading.
        const h = harness();
        expect((h.deliverer as { Reinvoke?: unknown }).Reinvoke).toBeUndefined();
    });
});
