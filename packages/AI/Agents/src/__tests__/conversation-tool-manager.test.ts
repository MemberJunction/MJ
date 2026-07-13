/**
 * Unit tests for ConversationToolManager.
 *
 * Covers: the availability gate (no conversationId → unavailable + contained error),
 * exact fetch by sequence, range validation + message cap + total-character budget,
 * keyword/regex search with role and sequence-range filters + result caps + snippets,
 * and error containment (bad regex, unknown tool, missing inputs).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCache: { Details: Array<Record<string, unknown>> } = { Details: [] };

vi.mock('@memberjunction/core-entities', () => ({
    ConversationEngine: {
        Instance: {
            LoadConversationDetails: vi.fn().mockImplementation(async () => mockCache),
        },
    },
}));

import { ConversationToolManager } from '../ConversationToolManager';

function detail(sequence: number, role: string, message: string, agent: string | null = null): Record<string, unknown> {
    return { ID: `detail-${sequence}`, Sequence: sequence, Role: role, Message: message, Agent: agent };
}

const user = { ID: 'user-1' } as never;

describe('ConversationToolManager', () => {
    let manager: ConversationToolManager;

    beforeEach(() => {
        manager = new ConversationToolManager();
        manager.Initialize('conv-1', user);
        mockCache.Details = [
            detail(1, 'User', 'What was our Q3 budget decision?'),
            detail(2, 'AI', 'The Q3 budget was approved at $50,000.', 'Sage'),
            detail(3, 'User', 'And what about hiring?'),
            detail(4, 'AI', 'Hiring was deferred to Q4 pending budget review.', 'Sage'),
            detail(5, 'User', 'Thanks. Budget it is.'),
        ] as never;
    });

    describe('availability gate', () => {
        it('is unavailable without a conversationId and contains the error', async () => {
            const bare = new ConversationToolManager();
            bare.Initialize(null, user);
            expect(bare.IsAvailable).toBe(false);
            const result = await bare.ExecuteSingleToolCall({ tool: 'getMessageBySequence', input: { sequence: 1 } });
            expect(result.result.success).toBe(false);
            expect(result.result.errorMessage).toContain('unavailable');
        });

        it('is available with a conversationId; Clear() disarms', () => {
            expect(manager.IsAvailable).toBe(true);
            manager.Clear();
            expect(manager.IsAvailable).toBe(false);
        });
    });

    describe('getMessageBySequence', () => {
        it('returns the exact message with role/agent metadata', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessageBySequence', input: { sequence: 2 } });
            expect(r.result.success).toBe(true);
            expect(r.result.data).toMatchObject({ sequence: 2, role: 'AI', agent: 'Sage', message: 'The Q3 budget was approved at $50,000.' });
        });

        it('errors helpfully on a missing sequence', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessageBySequence', input: { sequence: 99 } });
            expect(r.result.success).toBe(false);
            expect(r.result.errorMessage).toContain('No message found at sequence 99');
        });

        it('errors on missing input', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessageBySequence', input: {} });
            expect(r.result.success).toBe(false);
        });
    });

    describe('getMessagesByRange', () => {
        it('returns the inclusive range in order', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessagesByRange', input: { startSequence: 2, endSequence: 4 } });
            expect(r.result.success).toBe(true);
            const data = r.result.data as { messages: Array<{ sequence: number }> };
            expect(data.messages.map(m => m.sequence)).toEqual([2, 3, 4]);
        });

        it('rejects ranges over the message cap', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessagesByRange', input: { startSequence: 1, endSequence: 100 } });
            expect(r.result.success).toBe(false);
            expect(r.result.errorMessage).toContain('max 50');
        });

        it('rejects inverted ranges', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessagesByRange', input: { startSequence: 4, endSequence: 2 } });
            expect(r.result.success).toBe(false);
        });

        it('caps the total character budget with a truncation note', async () => {
            mockCache.Details = Array.from({ length: 10 }, (_, i) => detail(i + 1, 'User', 'y'.repeat(10_000))) as never;
            const r = await manager.ExecuteSingleToolCall({ tool: 'getMessagesByRange', input: { startSequence: 1, endSequence: 10 } });
            expect(r.result.success).toBe(true);
            const data = r.result.data as { messages: unknown[]; truncated?: string };
            expect(data.messages.length).toBeLessThan(10);
            expect(data.truncated).toContain('capped');
        });
    });

    describe('searchConversation', () => {
        it('keyword search is case-insensitive and returns snippets with metadata', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'searchConversation', input: { query: 'BUDGET' } });
            expect(r.result.success).toBe(true);
            const data = r.result.data as { hits: Array<{ sequence: number; matchType: string; snippet: string }>; totalMatches: number };
            expect(data.totalMatches).toBe(4);
            expect(data.hits[0]).toMatchObject({ sequence: 1, matchType: 'keyword' });
            expect(data.hits[0].snippet).toContain('budget');
        });

        it('applies role and sequence-range filters', async () => {
            const r = await manager.ExecuteSingleToolCall({
                tool: 'searchConversation',
                input: { query: 'budget', role: 'AI', startSequence: 3, endSequence: 5 },
            });
            const data = r.result.data as { hits: Array<{ sequence: number }> };
            expect(data.hits.map(h => h.sequence)).toEqual([4]);
        });

        it('supports regex matching', async () => {
            const r = await manager.ExecuteSingleToolCall({
                tool: 'searchConversation',
                input: { query: '\\$\\d{2},\\d{3}', isRegex: true },
            });
            const data = r.result.data as { hits: Array<{ sequence: number; matchType: string }> };
            expect(data.hits).toHaveLength(1);
            expect(data.hits[0]).toMatchObject({ sequence: 2, matchType: 'regex' });
        });

        it('contains invalid regex errors', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'searchConversation', input: { query: '([', isRegex: true } });
            expect(r.result.success).toBe(false);
            expect(r.result.errorMessage).toContain('Invalid regular expression');
        });

        it('honors maxResults while reporting totalMatches', async () => {
            const r = await manager.ExecuteSingleToolCall({ tool: 'searchConversation', input: { query: 'budget', maxResults: 2 } });
            const data = r.result.data as { hits: unknown[]; totalMatches: number };
            expect(data.hits).toHaveLength(2);
            expect(data.totalMatches).toBe(4);
        });
    });

    describe('summarizeRange (recursive sub-call via host seam)', () => {
        it('renders the range with sequence handles, threads the lens, and returns the prompt-run lineage', async () => {
            const host = {
                RunSummaryPrompt: vi.fn().mockResolvedValue({ text: 'FOCUSED SUMMARY', promptRunId: 'SUB-RUN-1' }),
            };
            manager.SetSummaryHost(host);
            const r = await manager.ExecuteSingleToolCall({
                tool: 'summarizeRange',
                input: { startSequence: 1, endSequence: 4, lens: 'budget decisions only' },
            });
            expect(r.result.success).toBe(true);
            expect(r.promptRunId).toBe('SUB-RUN-1');
            expect(r.result.data).toMatchObject({ lens: 'budget decisions only', startSequence: 1, endSequence: 4, messageCount: 4, summary: 'FOCUSED SUMMARY' });
            const [rangeText, lens] = host.RunSummaryPrompt.mock.calls[0];
            expect(lens).toBe('budget decisions only');
            expect(rangeText).toContain('[seq 1] User:');
            expect(rangeText).toContain('[seq 4] AI:');
            expect(rangeText).not.toContain('[seq 5]');
        });

        it('fails cleanly without a host, a lens, or an in-range span', async () => {
            const noHost = await manager.ExecuteSingleToolCall({ tool: 'summarizeRange', input: { startSequence: 1, endSequence: 2, lens: 'x' } });
            expect(noHost.result.success).toBe(false);
            expect(noHost.result.errorMessage).toContain('no summary host');

            manager.SetSummaryHost({ RunSummaryPrompt: vi.fn() });
            const noLens = await manager.ExecuteSingleToolCall({ tool: 'summarizeRange', input: { startSequence: 1, endSequence: 2 } });
            expect(noLens.result.success).toBe(false);
            expect(noLens.result.errorMessage).toContain('lens');

            const emptyRange = await manager.ExecuteSingleToolCall({ tool: 'summarizeRange', input: { startSequence: 90, endSequence: 95, lens: 'x' } });
            expect(emptyRange.result.success).toBe(false);
            expect(emptyRange.result.errorMessage).toContain('No messages found');
        });

        it('rejects spans over the 500-message cap', async () => {
            manager.SetSummaryHost({ RunSummaryPrompt: vi.fn() });
            const r = await manager.ExecuteSingleToolCall({ tool: 'summarizeRange', input: { startSequence: 1, endSequence: 999, lens: 'x' } });
            expect(r.result.success).toBe(false);
            expect(r.result.errorMessage).toContain('max 500');
        });
    });

    it('contains unknown tools as failed results', async () => {
        const r = await manager.ExecuteSingleToolCall({ tool: 'summarizeEverything' as never, input: {} });
        expect(r.result.success).toBe(false);
        expect(r.result.errorMessage).toContain('Unknown conversation tool');
    });

    it('documentation lists every tool', () => {
        const docs = manager.GetToolDocumentation();
        for (const tool of ['getMessageBySequence', 'getMessagesByRange', 'searchConversation', 'summarizeRange']) {
            expect(docs).toContain(tool);
        }
    });
});
