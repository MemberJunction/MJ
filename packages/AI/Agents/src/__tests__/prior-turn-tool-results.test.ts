/**
 * Unit tests for BaseAgent.BuildPriorTurnToolResultsMessage — the pure renderer behind
 * the prior-turn tool-result carry-forward (results persisted in Tool steps' OutputData
 * are re-injected one turn forward so the agent can reuse them without re-calling).
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';

function step(tool: string, data: unknown, success = true, input: unknown = { sequence: 9 }, toolFamily = 'conversation'): { OutputData: string | null } {
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
            [step('get_full', { content: 'artifact body' }, true, { artifactId: 'a1' }, 'artifact')],
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
