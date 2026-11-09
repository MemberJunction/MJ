/**
 * Tests for {@link BridgeRealtimeUsageRecorder}: how a bridged session's `OnUsage` updates add up, when they are
 * written (10 s after the first unwritten one, and at close), failed writes, and updates after close.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeUsage } from '@memberjunction/ai';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn() };
});

import { LogError, LogStatus } from '@memberjunction/core';
import {
    BridgeRealtimeUsageRecorder,
    BRIDGE_USAGE_FLUSH_MS,
    type BridgeUsageWrite,
} from '../realtime/bridge-realtime-usage-recorder';

/** A writer that records each write and answers with the next queued result (default: stored). */
function makeWriter(results: Array<boolean | Error> = []): { Writes: BridgeUsageWrite[]; Write: (w: BridgeUsageWrite) => Promise<boolean> } {
    const writes: BridgeUsageWrite[] = [];
    return {
        Writes: writes,
        Write: async (write: BridgeUsageWrite): Promise<boolean> => {
            writes.push(structuredClone(write));
            const result = results.shift() ?? true;
            if (result instanceof Error) {
                throw result;
            }
            return result;
        },
    };
}

function usage(partial: Partial<RealtimeUsage>): RealtimeUsage {
    return { InputTokens: 0, OutputTokens: 0, ...partial };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(LogError).mockClear();
    vi.mocked(LogStatus).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('BridgeRealtimeUsageRecorder — adding up', () => {
    it('sums token totals and every detail token field across updates into one write', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ InputTokens: 100, OutputTokens: 40, InputTokenDetails: { AudioTokens: 80, TextTokens: 20, CachedTokens: 5 }, OutputTokenDetails: { AudioTokens: 40 } }));
        recorder.Add(usage({ InputTokens: 50, OutputTokens: 10, InputTokenDetails: { AudioTokens: 30, ImageTokens: 20 }, OutputTokenDetails: { AudioTokens: 6, TextTokens: 4 } }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(writer.Writes).toEqual([{
            InputTokens: 150,
            OutputTokens: 50,
            Details: {
                Input: { AudioTokens: 110, TextTokens: 20, CachedTokens: 5, ImageTokens: 20 },
                Output: { AudioTokens: 46, TextTokens: 4 },
            },
        }]);
    });

    it('adds output video seconds, and keeps the latest of DurationSeconds and input VideoFrames / VideoSeconds', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ OutputTokenDetails: { VideoSeconds: 2.5 }, DurationSeconds: 30, InputTokenDetails: { VideoFrames: 10, VideoSeconds: 10 } }));
        recorder.Add(usage({ OutputTokenDetails: { VideoSeconds: 1.5 }, DurationSeconds: 45, InputTokenDetails: { VideoFrames: 25, VideoSeconds: 25 } }));
        recorder.Add(usage({ DurationSeconds: 40, InputTokenDetails: { VideoFrames: 20, VideoSeconds: 20 } }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(writer.Writes).toEqual([{
            InputTokens: 0,
            OutputTokens: 0,
            Details: { Input: { VideoFrames: 25, VideoSeconds: 25 }, Output: { VideoSeconds: 4 }, DurationSeconds: 45 },
        }]);
        expect(recorder.Totals).toEqual({ InputTokens: 0, OutputTokens: 0, OutputVideoSeconds: 4 });
    });

    it('ignores an update that adds nothing: no timer, no write', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ InputTokens: 0, OutputTokens: -3, InputTokenDetails: { AudioTokens: 0 }, OutputTokenDetails: {} }));
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS * 2);

        expect(writer.Writes).toEqual([]);
        expect(recorder.HasUnwrittenUsage).toBe(false);
    });

    it('writes an update that carries only seconds (no tokens)', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ OutputTokenDetails: { VideoSeconds: 0.5 } }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(writer.Writes).toEqual([{ InputTokens: 0, OutputTokens: 0, Details: { Output: { VideoSeconds: 0.5 } } }]);
    });

    it('writes an update that carries only running totals, keeping the larger value within a write', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ DurationSeconds: 30, InputTokenDetails: { VideoFrames: 10 } }));
        recorder.Add(usage({ DurationSeconds: 25, InputTokenDetails: { VideoFrames: 8 } }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(writer.Writes).toEqual([{ InputTokens: 0, OutputTokens: 0, Details: { Input: { VideoFrames: 10 }, DurationSeconds: 30 } }]);
        expect(recorder.HasUnwrittenUsage).toBe(false);
    });
});

describe('BridgeRealtimeUsageRecorder — when it writes', () => {
    it('writes 10 s after the first unwritten update, not before, and once for a burst', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ InputTokens: 1 }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS - 1);
        recorder.Add(usage({ InputTokens: 2 }));
        expect(writer.Writes).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(writer.Writes).toEqual([{ InputTokens: 3, OutputTokens: 0 }]);

        recorder.Add(usage({ OutputTokens: 4 }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);
        expect(writer.Writes).toHaveLength(2);
        expect(writer.Writes[1]).toEqual({ InputTokens: 0, OutputTokens: 4 });
    });

    it('keeps a failed write\'s amounts and writes them once, with what arrived since', async () => {
        const writer = makeWriter([false]);
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ InputTokens: 10, OutputTokenDetails: { AudioTokens: 3 }, DurationSeconds: 20 }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);
        recorder.Add(usage({ InputTokens: 5, OutputTokenDetails: { AudioTokens: 2 } }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS);

        expect(writer.Writes).toHaveLength(2);
        expect(writer.Writes[1]).toEqual({ InputTokens: 15, OutputTokens: 0, Details: { Output: { AudioTokens: 5 }, DurationSeconds: 20 } });
        expect(recorder.HasUnwrittenUsage).toBe(false);
    });

    it('treats a writer that throws as a failed write, logs it, and keeps the amounts', async () => {
        const writer = makeWriter([new Error('db down')]);
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ OutputTokens: 7 }));
        await recorder.Flush();

        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('db down'));
        expect(recorder.HasUnwrittenUsage).toBe(true);
        await recorder.Flush();
        expect(writer.Writes.map(w => w.OutputTokens)).toEqual([7, 7]);
    });
});

describe('BridgeRealtimeUsageRecorder — close', () => {
    it('writes what is unwritten, stops the timer, and drops later updates (logged once)', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ InputTokens: 9 }));
        await recorder.Close();
        recorder.Add(usage({ InputTokens: 4 }));
        recorder.Add(usage({ InputTokens: 6 }));
        await vi.advanceTimersByTimeAsync(BRIDGE_USAGE_FLUSH_MS * 2);

        expect(writer.Writes).toEqual([{ InputTokens: 9, OutputTokens: 0 }]);
        expect(LogStatus).toHaveBeenCalledTimes(1);
        expect(LogStatus).toHaveBeenCalledWith(expect.stringContaining('not stored'));
        expect(recorder.Totals.InputTokens).toBe(9);
    });

    it('waits for a write in progress and then sends only the remainder', async () => {
        let release: (stored: boolean) => void = () => undefined;
        let signalStarted: () => void = () => undefined;
        const firstWriteStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
        const writes: BridgeUsageWrite[] = [];
        const recorder = new BridgeRealtimeUsageRecorder((write) => {
            writes.push(structuredClone(write));
            if (writes.length > 1) {
                return Promise.resolve(true);
            }
            signalStarted();
            return new Promise<boolean>((resolve) => { release = resolve; });
        }, 'test');

        recorder.Add(usage({ InputTokens: 10 }));
        const firstWrite = recorder.Flush();
        await firstWriteStarted;
        recorder.Add(usage({ InputTokens: 3 }));
        const closing = recorder.Close();
        release(true);
        await firstWrite;
        await closing;

        expect(writes.map(w => w.InputTokens)).toEqual([10, 3]);
    });

    it('writes nothing when nothing is unwritten', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        await recorder.Close();

        expect(writer.Writes).toEqual([]);
    });

    it('logs and drops the amounts when the last write fails', async () => {
        const writer = makeWriter([false]);
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ InputTokens: 12, OutputTokens: 3 }));
        await recorder.Close();

        expect(writer.Writes).toHaveLength(1);
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('12 input and 3 output tokens'));
        expect(recorder.HasUnwrittenUsage).toBe(false);
    });

    it('is safe to call twice', async () => {
        const writer = makeWriter();
        const recorder = new BridgeRealtimeUsageRecorder(writer.Write, 'test');

        recorder.Add(usage({ OutputTokens: 2 }));
        await Promise.all([recorder.Close(), recorder.Close()]);

        expect(writer.Writes).toHaveLength(1);
    });
});
