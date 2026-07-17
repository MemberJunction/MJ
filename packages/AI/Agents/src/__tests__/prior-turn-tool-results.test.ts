/**
 * Unit tests for the prior-turn tool-result carry-forward: the pure renderer
 * (BaseAgent.BuildPriorTurnToolResultsMessage), the PriorTurnToolResultCache that keeps
 * the per-turn prior-run lookup off the database, and the BaseAgent populate/consume
 * wiring around it (results persisted in Tool steps' OutputData are re-injected one
 * turn forward so the agent can reuse them without re-calling).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import { BaseAgent } from '../base-agent';
import { CarryForwardToolFamily, CarryForwardStepRecord } from '../tool-result-format';
import { PriorTurnToolResultCache } from '../prior-turn-tool-result-cache';

function step(tool: string, data: unknown, success = true, input: unknown = { sequence: 9 }, toolFamily: string = CarryForwardToolFamily.Conversation): { OutputData: string | null } {
    return {
        OutputData: JSON.stringify({ toolFamily, tool, input, result: { success, data }, durationMs: 5 }),
    };
}

describe('BaseAgent.BuildPriorTurnToolResultsMessage', () => {
    it('renders successful results with the reuse header and tool signatures', () => {
        const body = BaseAgent.BuildPriorTurnToolResultsMessage(
            [step('getMessageBySequence', { sequence: 9, message: 'the incident log' })],
            100_000
        );
        expect(body).toContain('Tool results from your previous turn');
        expect(body).toContain('getMessageBySequence({"sequence":9})');
        expect(body).toContain('the incident log');
    });

    it('filters out failed results, missing OutputData, and invalid JSON', () => {
        const body = BaseAgent.BuildPriorTurnToolResultsMessage(
            [
                step('searchConversation', undefined, false),
                { OutputData: null },
                { OutputData: 'not-json{{' },
            ],
            100_000
        );
        expect(body).toBeNull();
    });

    it('returns null for an empty step list', () => {
        expect(BaseAgent.BuildPriorTurnToolResultsMessage([], 100_000)).toBeNull();
    });

    it('includes artifact-family results (the other carry-forward-eligible family)', () => {
        const body = BaseAgent.BuildPriorTurnToolResultsMessage(
            [step('get_full', { content: 'artifact body' }, true, { artifactId: 'a1' }, CarryForwardToolFamily.Artifact)],
            100_000
        );
        expect(body).toContain('get_full');
        expect(body).toContain('artifact body');
    });

    it('excludes Tool steps without an eligible toolFamily, even when their OutputData looks successful', () => {
        const memoryWriteShaped = {
            OutputData: JSON.stringify({ result: { success: true, data: 'note saved' } }),
        };
        const pipelineShaped = {
            OutputData: JSON.stringify({ tool: 'pipeline', result: { success: true, data: 'ran' } }),
        };
        const unknownFamily = step('someTool', 'data', true, {}, 'future-family');
        expect(BaseAgent.BuildPriorTurnToolResultsMessage([memoryWriteShaped, pipelineShaped, unknownFamily], 100_000)).toBeNull();
    });

    it('excludes eligible-family steps whose OutputData is missing a tool name (contract violation)', () => {
        const noToolName = {
            OutputData: JSON.stringify({ toolFamily: 'conversation', input: {}, result: { success: true, data: 'orphan' } }),
        };
        const emptyToolName = {
            OutputData: JSON.stringify({ toolFamily: 'conversation', tool: '', input: {}, result: { success: true, data: 'orphan' } }),
        };
        expect(BaseAgent.BuildPriorTurnToolResultsMessage([noToolName, emptyToolName], 100_000)).toBeNull();
    });

    it('caps the total size and notes omitted results', () => {
        const big = 'z'.repeat(5_000);
        const body = BaseAgent.BuildPriorTurnToolResultsMessage(
            [step('a', big), step('b', big), step('c', big)],
            6_000
        );
        expect(body).not.toBeNull();
        expect(body!.length).toBeLessThan(13_000);
        expect(body).toContain('omitted for size');
    });

    it('truncates a single oversized result instead of dropping it', () => {
        const body = BaseAgent.BuildPriorTurnToolResultsMessage(
            [step('getMessagesByRange', 'w'.repeat(20_000))],
            5_000
        );
        expect(body).not.toBeNull();
        expect(body).toContain('[truncated]');
    });
});

const CONV_ID = 'A1B2C3D4-E5F6-7A8B-9C0D-1E2F3A4B5C6D';

describe('PriorTurnToolResultCache', () => {
    beforeEach(() => PriorTurnToolResultCache.Instance.Clear());

    it('round-trips records and normalizes conversation-id casing (SQL Server upper vs PG lower)', () => {
        const records: CarryForwardStepRecord[] = [{ OutputData: 'payload' }];
        PriorTurnToolResultCache.Instance.Set(CONV_ID, records);
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID.toLowerCase())).toEqual(records);
    });

    it('treats an empty array as a valid negative-cache entry, distinct from a miss', () => {
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toBeUndefined(); // miss → ask the DB
        PriorTurnToolResultCache.Instance.Set(CONV_ID, []);
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toEqual([]); // known-empty → skip the DB
    });
});

/** Internals surface used by the cache consume/populate tests. */
function carryForwardInternals(agent: BaseAgent) {
    return agent as unknown as {
        loadPriorTurnToolResultSteps(params: Record<string, unknown>): Promise<CarryForwardStepRecord[]>;
        cachePriorTurnToolResults(): void;
        _executeParams: Record<string, unknown> | undefined;
        _depth: number;
        _agentRun: { Status: string; Steps: Array<Record<string, unknown>> } | undefined;
    };
}

describe('BaseAgent.loadPriorTurnToolResultSteps — cache consumption', () => {
    beforeEach(() => PriorTurnToolResultCache.Instance.Clear());
    afterEach(() => vi.restoreAllMocks());

    it('cache hit returns the cached records with zero database calls', async () => {
        const fromProvider = vi.spyOn(RunView, 'FromMetadataProvider');
        const records: CarryForwardStepRecord[] = [{ OutputData: 'cached-result' }];
        PriorTurnToolResultCache.Instance.Set(CONV_ID, records);

        const loaded = await carryForwardInternals(new BaseAgent()).loadPriorTurnToolResultSteps({
            conversationId: CONV_ID,
            contextUser: { ID: 'u1' },
        });
        expect(loaded).toEqual(records);
        expect(fromProvider).not.toHaveBeenCalled();
    });

    it('negative-cache hit (prior run made no tool calls) also skips the database', async () => {
        const fromProvider = vi.spyOn(RunView, 'FromMetadataProvider');
        PriorTurnToolResultCache.Instance.Set(CONV_ID, []);

        const loaded = await carryForwardInternals(new BaseAgent()).loadPriorTurnToolResultSteps({
            conversationId: CONV_ID,
            contextUser: { ID: 'u1' },
        });
        expect(loaded).toEqual([]);
        expect(fromProvider).not.toHaveBeenCalled();
    });

    it('cache miss falls back to the RunView pair (prior run lookup, then its Tool steps)', async () => {
        const runViewFn = vi.fn()
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'prior-run-1' }] })
            .mockResolvedValueOnce({ Success: true, Results: [{ OutputData: 'db-result' }] });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewFn } as unknown as RunView);

        const loaded = await carryForwardInternals(new BaseAgent()).loadPriorTurnToolResultSteps({
            conversationId: CONV_ID,
            contextUser: { ID: 'u1' },
        });
        expect(loaded).toEqual([{ OutputData: 'db-result' }]);
        expect(runViewFn).toHaveBeenCalledTimes(2);
    });
});

describe('BaseAgent.cachePriorTurnToolResults — population at run completion', () => {
    beforeEach(() => PriorTurnToolResultCache.Instance.Clear());

    function agentWith(overrides: { depth?: number; status?: string; steps?: Array<Record<string, unknown>> }) {
        const a = carryForwardInternals(new BaseAgent());
        a._executeParams = { conversationId: CONV_ID };
        a._depth = overrides.depth || 0;
        a._agentRun = { Status: overrides.status || 'Completed', Steps: overrides.steps || [] };
        return a;
    }

    it('projects completed Tool steps — and only those — into the cache, in order', () => {
        agentWith({
            steps: [
                { StepType: 'Prompt', Status: 'Completed', OutputData: 'prompt-out' },
                { StepType: 'Tool', Status: 'Completed', OutputData: 'tool-1' },
                { StepType: 'Tool', Status: 'Failed', OutputData: 'tool-failed' },
                { StepType: 'Tool', Status: 'Completed', OutputData: null },
                { StepType: 'Compaction', Status: 'Completed', OutputData: 'compaction-out' },
            ],
        }).cachePriorTurnToolResults();
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toEqual([
            { OutputData: 'tool-1' },
            { OutputData: null },
        ]);
    });

    it('caches an empty projection for a tool-free run (the negative-cache case)', () => {
        agentWith({ steps: [{ StepType: 'Prompt', Status: 'Completed', OutputData: 'x' }] }).cachePriorTurnToolResults();
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toEqual([]);
    });

    it('sub-agent runs never publish (mirrors the ParentRunID IS NULL filter of the DB path)', () => {
        agentWith({ depth: 1, steps: [{ StepType: 'Tool', Status: 'Completed', OutputData: 'sub' }] }).cachePriorTurnToolResults();
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toBeUndefined();
    });

    it("non-Completed runs leave the previous completed run's entry standing (mirrors the Status='Completed' filter)", () => {
        PriorTurnToolResultCache.Instance.Set(CONV_ID, [{ OutputData: 'from-run-N' }]);
        agentWith({ status: 'Failed', steps: [{ StepType: 'Tool', Status: 'Completed', OutputData: 'from-run-N+1' }] }).cachePriorTurnToolResults();
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toEqual([{ OutputData: 'from-run-N' }]);
    });

    it('skips runs without a conversationId (programmatic runs)', () => {
        const a = agentWith({ steps: [{ StepType: 'Tool', Status: 'Completed', OutputData: 'x' }] });
        a._executeParams = undefined;
        a.cachePriorTurnToolResults();
        expect(PriorTurnToolResultCache.Instance.Get(CONV_ID)).toBeUndefined();
    });
});
