/**
 * What a task records as its output from an agent run.
 *
 * The defect: a Loop agent's answer lives in the run's Message, and its payload is usually partial
 * or an echo of the task input. Recording the payload alone sent downstream tasks and the
 * workflow's follow-up turn the input bag and lost the answer, so the follow-up presented JSON
 * instead of the table the user asked for.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai', () => ({ ChatMessageRole: { user: 'user' } }));
vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));
vi.mock('@memberjunction/ai-core-plus', () => ({ MJAIAgentEntityExtended: class {}, MJAIAgentRunEntityExtended: class {} }));

import { ExtractTaskOutput, TASK_OUTPUT_MESSAGE_KEY } from '../services/TaskGraphAgentRunner';

const run = (payload: unknown, message: string | null | undefined) => ({ payload, agentRun: { Message: message } });

describe('ExtractTaskOutput', () => {
    it('attaches the prose answer to a structured payload, keeping every payload field', () => {
        // The real case: the agent wrote {cities} to the payload and listed every temperature in its message.
        const out = ExtractTaskOutput(run({ cities: ['Sydney', 'Melbourne'] }, 'Sydney: 52°F. Melbourne: 63°F.')) as Record<string, unknown>;
        expect(out.cities).toEqual(['Sydney', 'Melbourne']);
        expect(out[TASK_OUTPUT_MESSAGE_KEY]).toBe('Sydney: 52°F. Melbourne: 63°F.');
    });

    it('is the message alone when there is no payload', () => {
        expect(ExtractTaskOutput(run(undefined, 'the answer'))).toBe('the answer');
        expect(ExtractTaskOutput(run(null, 'the answer'))).toBe('the answer');
    });

    it('is the payload alone when there is no message', () => {
        expect(ExtractTaskOutput(run({ a: 1 }, null))).toEqual({ a: 1 });
        expect(ExtractTaskOutput(run({ a: 1 }, '   '))).toEqual({ a: 1 });
    });

    it('does not change the shape of an array or primitive payload', () => {
        // Wrapping these would break every `@taskN.output` reference that relies on the shape.
        expect(ExtractTaskOutput(run([1, 2, 3], 'three numbers'))).toEqual([1, 2, 3]);
        expect(ExtractTaskOutput(run('done', 'prose'))).toBe('done');
        expect(ExtractTaskOutput(run(42, 'prose'))).toBe(42);
    });

    it('is null for no result at all', () => {
        expect(ExtractTaskOutput(null)).toBeNull();
        expect(ExtractTaskOutput(undefined)).toBeNull();
        expect(ExtractTaskOutput({})).toBeNull();
    });

    it('does not mutate the payload it was given', () => {
        const payload = { a: 1 };
        ExtractTaskOutput(run(payload, 'msg'));
        expect(payload).toEqual({ a: 1 });
    });
});
