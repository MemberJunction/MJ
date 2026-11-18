/**
 * A Strict validation failure on a turn that called tools keeps the turn.
 *
 * On such a turn the calls are the answer and the text beside them is narration. Retrying because
 * the narration failed validation asks the model again and throws its calls away — the agent loop
 * never sees them. A text-only turn still retries as before.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { ValidationResult } from '@memberjunction/global';
import type { ChatResult } from '@memberjunction/ai';

interface RetryInternals {
    executeModelWithFailover: (...args: unknown[]) => Promise<ChatResult>;
    parseAndValidateResultEnhanced: (...args: unknown[]) => Promise<{ result: unknown; validationResult?: ValidationResult }>;
    ApplyRetryDelay: (...args: unknown[]) => Promise<void>;
    executeWithValidationRetries: (...args: unknown[]) => Promise<{ modelResult: ChatResult; validationAttempts: unknown[] }>;
}

function turn(withCalls: boolean): ChatResult {
    return {
        success: true,
        data: {
            choices: [{
                message: {
                    role: 'assistant',
                    content: 'Let me look that up.',
                    ...(withCalls ? { toolCalls: [{ id: 'call_1', name: 'search_web', arguments: {} }] } : {})
                },
                finish_reason: withCalls ? 'tool_calls' : 'stop',
                index: 0
            }],
            usage: { promptTokens: 1, completionTokens: 1 }
        }
    } as unknown as ChatResult;
}

function runnerReturning(result: ChatResult): { internals: RetryInternals; calls: () => number } {
    const internals = new AIPromptRunner() as unknown as RetryInternals;
    const execute = vi.fn(async () => result);
    const failed = new ValidationResult();
    failed.Success = false;
    internals.executeModelWithFailover = execute;
    internals.parseAndValidateResultEnhanced = async () => ({ result: 'Let me look that up.', validationResult: failed });
    internals.ApplyRetryDelay = async () => undefined;
    return { internals, calls: () => execute.mock.calls.length };
}

const strictPrompt = { Name: 'Strict Prompt', MaxRetries: 2, ValidationBehavior: 'Strict' };
const run = (internals: RetryInternals) =>
    internals.executeWithValidationRetries({ Name: 'model' }, 'prompt', strictPrompt, {}, { VendorID: null }, []);

describe('executeWithValidationRetries — Strict validation and tool calls', () => {
    it('keeps a tool-call turn whose narration failed validation, without retrying', async () => {
        const { internals, calls } = runnerReturning(turn(true));

        const outcome = await run(internals);

        expect(calls()).toBe(1);
        expect(outcome.modelResult.data.choices[0].message.toolCalls).toHaveLength(1);
    });

    it('still retries a text-only turn that failed validation', async () => {
        const { internals, calls } = runnerReturning(turn(false));

        await run(internals);

        expect(calls()).toBe(3);
    });
});
