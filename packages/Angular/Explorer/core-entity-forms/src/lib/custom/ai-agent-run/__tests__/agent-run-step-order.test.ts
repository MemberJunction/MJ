/**
 * The timeline listed steps by persist time (`__mj_CreatedAt`) while painting `StartedAt`.
 * A 1ms Artifact Tool whose INSERT lost a race with the next Execute Agent Prompt then
 * rendered *after* that prompt, even though its clock was 2ms earlier. This is that pair.
 */
import { describe, expect, it } from 'vitest';
import {
    CompareAgentRunStepsByExecutionOrder,
    SortAgentRunStepsByExecutionOrder,
} from '../agent-run-step-order';

describe('SortAgentRunStepsByExecutionOrder', () => {
    it('puts an artifact tool before the next prompt when persist order is inverted', () => {
        // The screenshot: CreatedAt of the second prompt beat the tool's INSERT, so a
        // `__mj_CreatedAt, StepNumber` query returned prompt then tool. StartedAt (and
        // StepNumber) still know the tool ran first.
        const validation = {
            id: 'validation',
            StartedAt: new Date('2026-08-28T12:28:33.737Z'),
            StepNumber: 1,
            __mj_CreatedAt: new Date('2026-08-28T12:28:33.740Z'),
        };
        const prompt1 = {
            id: 'prompt-1',
            StartedAt: new Date('2026-08-28T12:28:33.779Z'),
            StepNumber: 2,
            __mj_CreatedAt: new Date('2026-08-28T12:28:33.800Z'),
        };
        const prompt2 = {
            id: 'prompt-2',
            StartedAt: new Date('2026-08-28T12:28:37.371Z'),
            StepNumber: 4,
            __mj_CreatedAt: new Date('2026-08-28T12:28:37.380Z'),
        };
        const tool = {
            id: 'tool',
            StartedAt: new Date('2026-08-28T12:28:37.369Z'),
            StepNumber: 3,
            __mj_CreatedAt: new Date('2026-08-28T12:28:37.400Z'),
        };

        const sorted = SortAgentRunStepsByExecutionOrder([validation, prompt1, prompt2, tool]);

        expect(sorted.map((s) => s.id)).toEqual(['validation', 'prompt-1', 'tool', 'prompt-2']);
    });

    it('uses StepNumber when two steps share a StartedAt millisecond', () => {
        const t = new Date('2026-08-28T12:28:37.369Z');
        const a = { id: 'a', StartedAt: t, StepNumber: 5 };
        const b = { id: 'b', StartedAt: t, StepNumber: 4 };

        expect(SortAgentRunStepsByExecutionOrder([a, b]).map((s) => s.id)).toEqual(['b', 'a']);
    });

    it('sorts unstarted steps last, not at the epoch', () => {
        const running = { id: 'ran', StartedAt: new Date('2026-08-28T12:28:33.737Z'), StepNumber: 1 };
        const pending = { id: 'pending', StartedAt: null, StepNumber: 2 };

        expect(SortAgentRunStepsByExecutionOrder([pending, running]).map((s) => s.id)).toEqual([
            'ran',
            'pending',
        ]);
    });

    it('does not mutate the input array', () => {
        const a = { id: 'a', StartedAt: new Date('2026-08-28T12:28:37.371Z'), StepNumber: 2 };
        const b = { id: 'b', StartedAt: new Date('2026-08-28T12:28:37.369Z'), StepNumber: 1 };
        const input = [a, b];

        const sorted = SortAgentRunStepsByExecutionOrder(input);

        expect(input.map((s) => s.id)).toEqual(['a', 'b']);
        expect(sorted.map((s) => s.id)).toEqual(['b', 'a']);
        expect(sorted).not.toBe(input);
    });

    it('accepts ISO strings the same as Date instances', () => {
        const a = { id: 'a', StartedAt: '2026-08-28T12:28:37.371Z', StepNumber: 2 };
        const b = { id: 'b', StartedAt: '2026-08-28T12:28:37.369Z', StepNumber: 1 };

        expect(CompareAgentRunStepsByExecutionOrder(a, b)).toBeGreaterThan(0);
        expect(SortAgentRunStepsByExecutionOrder([a, b]).map((s) => s.id)).toEqual(['b', 'a']);
    });
});
