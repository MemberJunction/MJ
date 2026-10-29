import { describe, it, expect, vi, afterEach } from 'vitest';
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

// ===========================================================================
// Bounds on the advanced-generation LLM path.
//
// Advanced generation had no per-call deadline, no stall detection and no spend ceiling. The
// deadline machinery already existed one layer down — AIPromptRunner resolves
// `params.timeoutMS ?? DefaultPromptTimeoutMS`, composes it with any cancellation token into a
// single AbortSignal, and hands that to the provider SDK so the socket is torn down rather than
// abandoned — but `DefaultPromptTimeoutMS` returns undefined and CodeGen never passed
// `timeoutMS` at any of its seven prompt sites. Every call took the explicitly-unbounded branch,
// so a provider that accepted the connection and then stalled produced a promise that never
// settled, and because a stall raises no error the failover machinery was never entered.
// ===========================================================================
import { AdvancedGenerationPromptRunner } from '../Misc/advanced_generation';
import { configInfo } from '../Config/config';

/** The subset of the advancedGeneration config these tests drive. */
type AdvGenConfigShape = {
    enableAdvancedGeneration?: boolean;
    callTimeoutMS?: number;
    stallFailureCircuitThreshold?: number;
    maxRunCostUSD?: number;
};
type MutableConfig = { advancedGeneration?: AdvGenConfigShape };

function setAdvGenConfig(partial: AdvGenConfigShape | undefined): void {
    (configInfo as unknown as MutableConfig).advancedGeneration = partial;
}
function readDefaultTimeout(): number | undefined {
    const runner = new AdvancedGenerationPromptRunner();
    return (runner as unknown as { DefaultPromptTimeoutMS: number | undefined }).DefaultPromptTimeoutMS;
}

/** A returned (not thrown) provider failure carrying the errorType a driver would populate. */
function failedResult(errorType: string, message: string): unknown {
    return { success: false, errorMessage: message, chatResult: { errorInfo: { errorType } } };
}
function successResult(costUSD = 0): unknown {
    return {
        success: true, result: {}, promptTokens: 0, completionTokens: 0,
        cost: costUSD, executionTimeMS: 1,
    };
}

describe('AdvancedGenerationPromptRunner — every model call carries a wall-clock ceiling', () => {
    const original = (configInfo as unknown as MutableConfig).advancedGeneration;
    afterEach(() => setAdvGenConfig(original));

    it('imposes the configured ceiling, overriding the base runner\'s unbounded default', () => {
        setAdvGenConfig({ callTimeoutMS: 45_000 });
        expect(readDefaultTimeout()).toBe(45_000);
    });

    it('falls back to 90s when there is no advancedGeneration config section at all', () => {
        // The case least likely to have been thought about must still be bounded.
        setAdvGenConfig(undefined);
        expect(readDefaultTimeout()).toBe(90_000);
    });

    it('treats 0 as an explicit opt-out, restoring the previous unbounded behaviour', () => {
        setAdvGenConfig({ callTimeoutMS: 0 });
        expect(readDefaultTimeout()).toBeUndefined();
    });
});

describe('AdvancedGeneration — provider-health (stall) circuit breaker', () => {
    const original = (configInfo as unknown as MutableConfig).advancedGeneration;
    afterEach(() => setAdvGenConfig(original));

    it('opens after 3 consecutive provider-health failures and then skips the round-trip', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 3 });
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue(failedResult('NetworkError', 'socket hang up'));
        setRunner(ag, runner);

        for (let i = 0; i < 3; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        expect(ag.AICircuitOpen).toBe(true);
        expect(runner).toHaveBeenCalledTimes(3);

        // 4th call short-circuits WITHOUT reaching the runner — the point of the breaker is to
        // stop aiming load at a provider that is already failing, not to retry it faster.
        await expect(callExecutePrompt(ag, PARAMS)).rejects.toThrow(/circuit is open/i);
        expect(runner).toHaveBeenCalledTimes(3);
    });

    // A thrown timeout is recognised two independent ways, and each needs its own test: a single
    // error carrying BOTH the name and the message marker leaves either detector free to rot
    // unnoticed. (Mutation testing caught exactly that — breaking the name check stayed green
    // because the message marker was also present.)
    it('opens on a thrown error identified ONLY by name (AIPromptTimeoutError)', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 2 });
        const ag = new AdvancedGeneration();
        // Deliberately no "exceeded its configured TimeoutMS" text: name is the only signal. This is
        // the serialized-across-a-boundary shape, where the class identity is gone but `name` survives.
        const timeout = new Error('the model call was aborted');
        timeout.name = 'AIPromptTimeoutError';
        const runner = vi.fn().mockRejectedValue(timeout);
        setRunner(ag, runner);

        for (let i = 0; i < 2; i++) {
            await expect(callExecutePrompt(ag, PARAMS)).rejects.toBeTruthy();
        }
        expect(ag.AICircuitOpen).toBe(true);
    });

    it('opens on a thrown error identified ONLY by the timeout message marker', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 2 });
        const ag = new AdvancedGeneration();
        // Plain `name` of 'Error' — this is the shape after the runner's failover layer has wrapped
        // the typed error and only its text remains.
        const runner = vi.fn().mockRejectedValue(
            new Error("AI prompt 'p' exceeded its configured TimeoutMS (90000ms) — the model call was aborted")
        );
        setRunner(ag, runner);

        for (let i = 0; i < 2; i++) {
            await expect(callExecutePrompt(ag, PARAMS)).rejects.toBeTruthy();
        }
        expect(ag.AICircuitOpen).toBe(true);
    });

    it('does NOT open on RateLimit — transient, per-vendor, and failover handles it', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 3 });
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue(failedResult('RateLimit', '429 too many requests'));
        setRunner(ag, runner);

        for (let i = 0; i < 6; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        expect(ag.AICircuitOpen).toBe(false);
        expect(runner).toHaveBeenCalledTimes(6);
    });

    it('does NOT open on a content/validation failure, which says nothing about provider health', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 3 });
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue(failedResult('ContextLengthExceeded', 'prompt is 500 tokens over the limit'));
        setRunner(ag, runner);

        for (let i = 0; i < 5; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        // Also guards the trap of classifying on message text: this message contains "500".
        expect(ag.AICircuitOpen).toBe(false);
    });

    it('a success resets the consecutive-stall counter', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 3 });
        const ag = new AdvancedGeneration();
        let call = 0;
        const runner = vi.fn().mockImplementation(() => {
            call++;
            // fail, fail, succeed, fail, fail → never 3 in a row
            return Promise.resolve(call === 3 ? successResult() : failedResult('ServiceUnavailable', '503'));
        });
        setRunner(ag, runner);

        for (let i = 0; i < 5; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        expect(ag.AICircuitOpen).toBe(false);
    });

    it('a threshold of 0 disables the stall circuit entirely', async () => {
        setAdvGenConfig({ stallFailureCircuitThreshold: 0 });
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue(failedResult('NetworkError', 'socket hang up'));
        setRunner(ag, runner);

        for (let i = 0; i < 8; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        expect(ag.AICircuitOpen).toBe(false);
        expect(runner).toHaveBeenCalledTimes(8);
    });
});

describe('AdvancedGeneration — optional per-run spend ceiling', () => {
    const original = (configInfo as unknown as MutableConfig).advancedGeneration;
    afterEach(() => setAdvGenConfig(original));

    it('opens the circuit once the configured ceiling is reached', async () => {
        setAdvGenConfig({ maxRunCostUSD: 1 });
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue(successResult(0.4));
        setRunner(ag, runner);

        await callExecutePrompt(ag, PARAMS); // 0.4
        expect(ag.AICircuitOpen).toBe(false);
        await callExecutePrompt(ag, PARAMS); // 0.8
        expect(ag.AICircuitOpen).toBe(false);
        await callExecutePrompt(ag, PARAMS); // 1.2 → at/above the ceiling
        expect(ag.AICircuitOpen).toBe(true);
        expect(runner).toHaveBeenCalledTimes(3);
    });

    it('never opens when the ceiling is 0 (the shipped default: no ceiling)', async () => {
        setAdvGenConfig({ maxRunCostUSD: 0 });
        const ag = new AdvancedGeneration();
        const runner = vi.fn().mockResolvedValue(successResult(25));
        setRunner(ag, runner);

        for (let i = 0; i < 4; i++) {
            await callExecutePrompt(ag, PARAMS);
        }
        expect(ag.AICircuitOpen).toBe(false);
    });
});
