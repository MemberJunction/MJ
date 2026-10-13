/**
 * Tests for the run-tree loader's wire handling.
 *
 * The SQL itself is verified against a real database (the recursive CTE's four members, the depth
 * bound, the prompt-cost join). What these cover is the half that goes wrong silently: how the rows
 * come back over a transport. A `DATETIME` may arrive as a Date or as a string, a `DECIMAL` as a
 * number or a string, and a NULL cost must stay distinguishable from a zero cost — get that wrong
 * and a free step and an unpriced step look identical in a total.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IRunQueryProvider } from '@memberjunction/core';
import { LoadAgentRunTree } from '../agent-run-tree-loader';

/** A provider that returns a canned result set, so no database is involved. */
function providerReturning(results: unknown[], success = true, errorMessage?: string): IRunQueryProvider {
    return {
        RunQuery: vi.fn().mockResolvedValue({ Success: success, Results: results, ErrorMessage: errorMessage }),
        RunQueries: vi.fn(),
    } as unknown as IRunQueryProvider;
}

const RUN_ROW = {
    NodeID: 'run-1',
    ParentNodeID: null,
    Depth: 0,
    Sequence: 0,
    NodeType: 'Run',
    Name: 'Demo Flow Agent',
    Status: 'Completed',
    StartedAt: '2026-08-09T10:00:00.000Z',
    CompletedAt: '2026-08-09T10:00:01.410Z',
    DurationMs: 1410,
    Cost: '0.0125',
    Tokens: '900',
    PromptTokens: '700',
    CompletionTokens: '200',
    SourceEntity: 'MJ: AI Agent Runs',
    SourceID: 'run-1',
};

const STEP_ROW = {
    NodeID: 'step-1',
    ParentNodeID: 'run-1',
    Depth: 1,
    Sequence: 1,
    NodeType: 'Step',
    Name: 'Task Graph: Demo Flow Agent',
    Status: 'Completed',
    StartedAt: null,
    CompletedAt: null,
    DurationMs: null,
    Cost: null,
    Tokens: null,
    SourceEntity: 'MJ: AI Agent Run Steps',
    SourceID: 'step-1',
};

describe('LoadAgentRunTree', () => {
    it('assembles the rows into a tree', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW, STEP_ROW]));

        expect(result.ErrorMessage).toBeNull();
        expect(result.Rows).toHaveLength(2);
        expect(result.Root?.NodeID).toBe('run-1');
        expect(result.Root?.Children).toHaveLength(1);
        expect(result.Root?.Children[0].NodeID).toBe('step-1');
    });

    it('passes the run id and the depth cap to the query', async () => {
        const provider = providerReturning([RUN_ROW]);
        await LoadAgentRunTree('run-1', provider, undefined, 25);

        expect(provider.RunQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                QueryName: 'GetAgentRunTree',
                Parameters: { agentRunID: 'run-1', maxDepth: 25 },
            }),
            undefined,
        );
    });

    it('parses timestamps that arrive as strings', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW]));

        expect(result.Rows[0].StartedAt).toBeInstanceOf(Date);
        expect(result.Rows[0].StartedAt?.toISOString()).toBe('2026-08-09T10:00:00.000Z');
    });

    it('parses numerics that arrive as strings', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW]));

        expect(result.Rows[0].Cost).toBe(0.0125);
        expect(result.Rows[0].Tokens).toBe(900);
    });

    it('projects the prompt/completion split, which the cost rollup writes to its own columns', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW]));

        expect(result.Rows[0].PromptTokens).toBe(700);
        expect(result.Rows[0].CompletionTokens).toBe(200);
    });

    it('leaves the split NULL when the query does not return it', async () => {
        // A row that predates the widened projection must not read as "zero prompt tokens" — the
        // settlement rollup sums these, and a fabricated zero is indistinguishable from a real one.
        const { PromptTokens: _p, CompletionTokens: _c, ...older } = RUN_ROW;
        const result = await LoadAgentRunTree('run-1', providerReturning([older]));

        expect(result.Rows[0].PromptTokens).toBeNull();
        expect(result.Rows[0].CompletionTokens).toBeNull();
    });

    it('keeps an absent cost NULL rather than collapsing it to zero', async () => {
        // The distinction that matters for a total: a step with no cost DATA is not a step that
        // cost nothing, and rendering both as 0 hides which one you are looking at.
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW, STEP_ROW]));

        const step = result.Rows.find((r) => r.NodeID === 'step-1');
        expect(step?.Cost).toBeNull();
        expect(step?.Tokens).toBeNull();
        expect(step?.DurationMs).toBeNull();
    });

    it('treats an empty-string numeric as absent, not as zero', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([{ ...RUN_ROW, Cost: '', Tokens: '' }]));

        expect(result.Rows[0].Cost).toBeNull();
        expect(result.Rows[0].Tokens).toBeNull();
    });

    it('treats an unparseable timestamp as absent rather than as the epoch', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([{ ...RUN_ROW, StartedAt: 'not a date' }]));

        expect(result.Rows[0].StartedAt).toBeNull();
    });

    it('reports truncation when a node sits at the depth cap', async () => {
        const deep = { ...STEP_ROW, NodeID: 'deep', Depth: 100 };
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW, deep]));

        expect(result.Truncated).toBe(true);
    });

    it('is not truncated when everything sits above the cap', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([RUN_ROW, STEP_ROW]));

        expect(result.Truncated).toBe(false);
    });

    it('surfaces a failed query rather than returning an empty tree as success', async () => {
        const result = await LoadAgentRunTree('run-1', providerReturning([], false, 'query exploded'));

        expect(result.ErrorMessage).toBe('query exploded');
        expect(result.Root).toBeNull();
    });

    it('refuses an empty run id without calling the query', async () => {
        const provider = providerReturning([]);
        const result = await LoadAgentRunTree('', provider);

        expect(result.ErrorMessage).toBe('An agent run ID is required.');
        expect(provider.RunQuery).not.toHaveBeenCalled();
    });

    it('returns an error instead of throwing when the provider throws', async () => {
        const provider = {
            RunQuery: vi.fn().mockRejectedValue(new Error('connection reset')),
        } as unknown as IRunQueryProvider;

        const result = await LoadAgentRunTree('run-1', provider);

        expect(result.ErrorMessage).toBe('connection reset');
        expect(result.Root).toBeNull();
    });
});
