import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeClientUsage } from '@memberjunction/ai-realtime-client';
import { RealtimeSessionRuntime, type IRealtimeMediaHost } from '../index';

/**
 * The usage relay's detail blocks: the runtime adds each update's input and output blocks into the pending details
 * (amounts add up, inbound video running totals keep the larger value), relays them in full beside the token deltas,
 * and relays an update that carries only avatar video seconds. A token-only relay is the mutation it always was.
 */

/** The private surface the tests drive: the usage relay members, no `any`. */
interface UsageRelayInternals {
    agentSessionId: string | null;
    pendingUsageInput: number;
    pendingUsageOutput: number;
    usageFlushTimer: ReturnType<typeof setTimeout> | null;
    onUsageDelta(usage: RealtimeClientUsage): void;
    flushPendingUsage(agentSessionId?: string | null): Promise<void>;
}

class NoMediaHost implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

function internals(runtime: RealtimeSessionRuntime): UsageRelayInternals {
    return runtime as unknown as UsageRelayInternals;
}

/** The details record a relay call sent, parsed. */
function relayedDetails(call: unknown[]): unknown {
    const variables = call[1] as { usageDetailsJson?: string };
    return variables.usageDetailsJson === undefined ? undefined : JSON.parse(variables.usageDetailsJson);
}

describe('RealtimeSessionRuntime usage relay: detail blocks and avatar video seconds', () => {
    let runtime: RealtimeSessionRuntime;
    let executeGQL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        runtime = new RealtimeSessionRuntime(new NoMediaHost());
        executeGQL = vi.fn(async () => ({ RelayRealtimeUsage: true }));
        runtime.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
        internals(runtime).agentSessionId = 'sess-1';
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('relays an update that carries only avatar video seconds (no tokens)', async () => {
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 2.5 } });
        expect(internals(runtime).usageFlushTimer).not.toBeNull();

        await vi.advanceTimersByTimeAsync(10000);

        expect(executeGQL).toHaveBeenCalledTimes(1);
        expect(executeGQL.mock.calls[0][1]).toMatchObject({ agentSessionId: 'sess-1', inputTokens: 0, outputTokens: 0 });
        expect(relayedDetails(executeGQL.mock.calls[0])).toEqual({ Output: { VideoSeconds: 2.5 } });
    });

    it('adds the detail blocks up between relays: amounts sum, inbound running totals keep the larger value', async () => {
        internals(runtime).onUsageDelta({
            InputTokens: 100,
            OutputTokens: 6292,
            InputTokenDetails: { TextTokens: 60, AudioTokens: 40, VideoFrames: 10, VideoSeconds: 5 },
            OutputTokenDetails: { AudioTokens: 100, VideoTokens: 6192 },
        });
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 1.5 } });
        internals(runtime).onUsageDelta({
            InputTokens: 20,
            OutputTokens: 50,
            InputTokenDetails: { TextTokens: 20, VideoFrames: 12, VideoSeconds: 6 },
            OutputTokenDetails: { AudioTokens: 50 },
        });

        await vi.advanceTimersByTimeAsync(10000);

        expect(executeGQL).toHaveBeenCalledTimes(1);
        expect(executeGQL.mock.calls[0][1]).toMatchObject({ inputTokens: 120, outputTokens: 6342 });
        expect(relayedDetails(executeGQL.mock.calls[0])).toEqual({
            Input: { TextTokens: 80, AudioTokens: 40, VideoFrames: 12, VideoSeconds: 6 },
            Output: { AudioTokens: 150, VideoTokens: 6192, VideoSeconds: 1.5 },
        });
    });

    it('declares the details argument in the mutation, and leaves it out of a token-only relay', async () => {
        internals(runtime).onUsageDelta({ InputTokens: 9, OutputTokens: 3 });
        await vi.advanceTimersByTimeAsync(10000);

        expect(executeGQL.mock.calls[0][0]).toContain('usageDetailsJson: $usageDetailsJson');
        expect(executeGQL.mock.calls[0][1]).toEqual({ agentSessionId: 'sess-1', inputTokens: 9, outputTokens: 3 });
    });

    it('drops an update with nothing in it: zero tokens and zero-valued blocks', async () => {
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 0 }, InputTokenDetails: {} });
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: Number.NaN } });

        await vi.advanceTimersByTimeAsync(60000);
        expect(executeGQL).not.toHaveBeenCalled();
        expect(internals(runtime).usageFlushTimer).toBeNull();
    });

    it('keeps the details of a failed relay for the next one, without counting them twice', async () => {
        executeGQL.mockRejectedValueOnce(new Error('network down'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 3 } });
        await vi.advanceTimersByTimeAsync(10000);

        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 1 } });
        await vi.advanceTimersByTimeAsync(10000);

        expect(executeGQL).toHaveBeenCalledTimes(2);
        expect(relayedDetails(executeGQL.mock.calls[1])).toEqual({ Output: { VideoSeconds: 4 } });
    });

    it('sends each second once: a relay consumes the pending details', async () => {
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 3 } });
        await vi.advanceTimersByTimeAsync(10000);
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 2 } });
        await vi.advanceTimersByTimeAsync(10000);

        expect(executeGQL.mock.calls.map((call) => relayedDetails(call))).toEqual([{ Output: { VideoSeconds: 3 } }, { Output: { VideoSeconds: 2 } }]);
    });

    it('leaves no pending details after teardown, even when the final relay fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        executeGQL.mockImplementation(async (mutation: string) => {
            if (mutation.includes('RelayRealtimeUsage')) {
                throw new Error('network down');
            }
            return {};
        });
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 4 } });
        await (runtime as unknown as { teardown(closeServerSession: boolean): Promise<void> }).teardown(true);

        executeGQL.mockClear();
        executeGQL.mockResolvedValue({ RelayRealtimeUsage: true });
        internals(runtime).agentSessionId = 'sess-2';
        await internals(runtime).flushPendingUsage();
        expect(executeGQL).not.toHaveBeenCalled();
    });

    it('flushes pending video seconds at teardown, before closing the server session', async () => {
        internals(runtime).onUsageDelta({ OutputTokenDetails: { VideoSeconds: 4.25 } });
        await (runtime as unknown as { teardown(closeServerSession: boolean): Promise<void> }).teardown(true);

        const usageCall = executeGQL.mock.calls.find((call) => String(call[0]).includes('RelayRealtimeUsage'));
        const order = executeGQL.mock.calls.map((call) => (String(call[0]).includes('RelayRealtimeUsage') ? 'usage' : String(call[0]).includes('CloseAgentSession') ? 'close' : 'other'));
        expect(usageCall && relayedDetails(usageCall)).toEqual({ Output: { VideoSeconds: 4.25 } });
        expect(order.indexOf('usage')).toBeLessThan(order.indexOf('close'));
    });
});
