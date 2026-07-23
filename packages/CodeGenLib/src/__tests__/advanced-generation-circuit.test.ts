import { describe, it, expect, vi } from 'vitest';
import { AdvancedGeneration } from '../Misc/advanced_generation';

/**
 * Circuit breaker for the advanced-generation AI path: after repeated credential/authentication
 * failures (e.g. a keyless or mis-credentialed CodeGen run), the breaker opens so the remaining
 * entities skip the LLM round-trip instead of each attempting a doomed call. These tests drive the
 * private executePrompt with a mocked prompt runner via bracket-notation access.
 */
type ExecutePromptFn = (params: unknown) => Promise<unknown>;

function callExecutePrompt(ag: AdvancedGeneration, params: unknown): Promise<unknown> {
    return (ag as unknown as { executePrompt: ExecutePromptFn }).executePrompt(params);
}
function setRunner(ag: AdvancedGeneration, fn: ExecutePromptFn): void {
    (ag as unknown as { _promptRunner: { ExecutePrompt: ExecutePromptFn } })._promptRunner = { ExecutePrompt: fn };
}

const PARAMS = { prompt: { Name: 'test-prompt' } };

describe('AdvancedGeneration — AI credential circuit breaker', () => {
    it('starts closed', () => {
        expect(new AdvancedGeneration().AICircuitOpen).toBe(false);
    });

    it('opens after 3 consecutive credential failures, then skips the round-trip', async () => {
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockRejectedValue(new Error('Invalid Vertex AI credentials'));
        setRunner(ag, runner);

        for (let i = 0; i < 3; i++) {
            await expect(callExecutePrompt(ag, PARAMS)).rejects.toBeTruthy();
        }
        expect(ag.AICircuitOpen).toBe(true);
        expect(runner).toHaveBeenCalledTimes(3);

        // 4th call short-circuits WITHOUT reaching the runner.
        await expect(callExecutePrompt(ag, PARAMS)).rejects.toThrow(/circuit is open/i);
        expect(runner).toHaveBeenCalledTimes(3);
    });

    it('does NOT open on non-credential errors', async () => {
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockRejectedValue(new Error('content exceeded max tokens'));
        setRunner(ag, runner);

        for (let i = 0; i < 5; i++) {
            await expect(callExecutePrompt(ag, PARAMS)).rejects.toBeTruthy();
        }
        expect(ag.AICircuitOpen).toBe(false);
        expect(runner).toHaveBeenCalledTimes(5);
    });

    it('a success resets the consecutive-failure counter (never 3 in a row → stays closed)', async () => {
        const ag = new AdvancedGeneration();
        let call = 0;
        const runner = vi.fn().mockImplementation(() => {
            call++;
            // fail, fail, succeed, fail, fail → no 3 consecutive failures
            if (call === 3) {
                return Promise.resolve({ success: true, result: {}, promptTokens: 0, completionTokens: 0, cost: 0, executionTimeMS: 1 });
            }
            return Promise.reject(new Error('unauthorized'));
        });
        setRunner(ag, runner);

        for (let i = 0; i < 5; i++) {
            try {
                await callExecutePrompt(ag, PARAMS);
            } catch {
                /* expected on the failing iterations */
            }
        }
        expect(ag.AICircuitOpen).toBe(false);
    });

    // --- The real-world path: AIPromptRunner does NOT throw for credential/auth failures.
    // Provider drivers catch internally and RETURN { success:false, chatResult.errorInfo.errorType }.
    // These pin that the breaker inspects the returned result, not just the catch block. ---

    it('opens after 3 consecutive RETURNED credential failures (success:false, errorType Authentication)', async () => {
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue({
            success: false,
            chatResult: { errorInfo: { errorType: 'Authentication' } },
            errorMessage: 'Invalid Vertex AI credentials',
        });
        setRunner(ag, runner);

        // The first three calls RETURN the failed result (they do NOT throw)...
        for (let i = 0; i < 3; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        expect(ag.AICircuitOpen).toBe(true);
        expect(runner).toHaveBeenCalledTimes(3);

        // ...and the 4th short-circuits WITHOUT reaching the runner.
        await expect(callExecutePrompt(ag, PARAMS)).rejects.toThrow(/circuit is open/i);
        expect(runner).toHaveBeenCalledTimes(3);
    });

    it('opens on returned NoCredentials, and on a credential message even without errorInfo', async () => {
        const agNoCreds = new AdvancedGeneration();
        setRunner(agNoCreds, vi.fn().mockResolvedValue({ success: false, chatResult: { errorInfo: { errorType: 'NoCredentials' } } }));
        for (let i = 0; i < 3; i++) await callExecutePrompt(agNoCreds, PARAMS);
        expect(agNoCreds.AICircuitOpen).toBe(true);

        // No errorInfo at all, but the message is a credential signal (some driver shapes).
        const agMsgOnly = new AdvancedGeneration();
        setRunner(agMsgOnly, vi.fn().mockResolvedValue({ success: false, errorMessage: 'Invalid Vertex AI credentials' }));
        for (let i = 0; i < 3; i++) await callExecutePrompt(agMsgOnly, PARAMS);
        expect(agMsgOnly.AICircuitOpen).toBe(true);
    });

    it('does NOT open on a returned NON-credential failure (e.g. ContextLengthExceeded)', async () => {
        const ag = new AdvancedGeneration();
        setRunner(ag, vi.fn().mockResolvedValue({
            success: false,
            chatResult: { errorInfo: { errorType: 'ContextLengthExceeded' } },
            errorMessage: 'context length exceeded',
        }));
        for (let i = 0; i < 5; i++) await callExecutePrompt(ag, PARAMS);
        expect(ag.AICircuitOpen).toBe(false);
    });

    it('a returned success (success:true) resets the counter — no 3-in-a-row → stays closed', async () => {
        const ag = new AdvancedGeneration();
        let call = 0;
        setRunner(ag, vi.fn().mockImplementation(() => {
            call++;
            // returned-fail, returned-fail, returned-success, returned-fail, returned-fail → never 3 consecutive
            if (call === 3) return Promise.resolve({ success: true, result: {} });
            return Promise.resolve({ success: false, chatResult: { errorInfo: { errorType: 'Authentication' } } });
        }));
        for (let i = 0; i < 5; i++) await callExecutePrompt(ag, PARAMS);
        expect(ag.AICircuitOpen).toBe(false);
    });
});
