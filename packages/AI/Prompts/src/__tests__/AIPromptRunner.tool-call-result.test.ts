/**
 * A turn that answered only with tool calls has no text to parse. Its prompt run must not record the
 * "Failed to parse result" error, which every native tool-calling agent turn used to carry.
 */
import { describe, it, expect } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import type { ChatResult } from '@memberjunction/ai';

interface ResultInternals {
    applyChatResultFields: (promptRun: { ErrorMessage?: string | null; Result?: string }, prompt: unknown, modelResult: ChatResult,
        parsedResult: { result: unknown }, endTime: Date, executionTimeMS: number) => void;
}

function chatResult(content: string, withCalls: boolean): ChatResult {
    return {
        success: true,
        data: {
            choices: [{
                message: { role: 'assistant', content, ...(withCalls ? { toolCalls: [{ id: 'call_1', name: 'write_components', arguments: {} }] } : {}) },
                finish_reason: withCalls ? 'tool_calls' : 'stop',
                index: 0
            }],
            usage: { promptTokens: 1, completionTokens: 1 }
        }
    } as unknown as ChatResult;
}

function apply(result: ChatResult): { ErrorMessage?: string | null } {
    const runner = new AIPromptRunner() as unknown as ResultInternals;
    const promptRun: { ErrorMessage?: string | null } = {};
    runner.applyChatResultFields(promptRun, { Name: 'p' }, result, { result: '' }, new Date(), 1);
    return promptRun;
}

describe('applyChatResultFields — empty text', () => {
    it('records no parse error for a tool-call-only turn', () => {
        expect(apply(chatResult('', true)).ErrorMessage).toBeUndefined();
    });

    it('still records the parse error for an empty text-only turn', () => {
        expect(apply(chatResult('', false)).ErrorMessage).toBe('Failed to parse result into expected format; raw output saved instead');
    });
});
