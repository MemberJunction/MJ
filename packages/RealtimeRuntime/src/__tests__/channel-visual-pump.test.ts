import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VisualPerceptionPump, type VisualFrameReason, type VisualPerceptionPumpHost } from '../channels/channel-visual-pump';

function makeHarness(overrides: Partial<VisualPerceptionPumpHost> = {}) {
    const pushed: string[] = [];
    const reports: Array<{ frame: string; reason: VisualFrameReason; changeId: number }> = [];
    const notes: number[] = [];
    const errors: string[] = [];
    const state = { frame: 'f1', videoUp: true, changeId: 1, cadence: 1000, sink: true };
    const host: VisualPerceptionPumpHost = {
        GetSink: () => (state.sink ? { PushFrame: (f: string) => (pushed.push(f), true) } : null),
        IsInboundVideoEstablished: () => state.videoUp,
        GetCadenceMs: () => state.cadence,
        CaptureFrame: async () => state.frame,
        GetChangeId: () => state.changeId,
        OnFramePushed: (frame, reason, changeId) => reports.push({ frame, reason, changeId }),
        SendConfirmationNote: (changeId) => notes.push(changeId),
        OnError: (context) => errors.push(context),
        ...overrides,
    };
    return { host, state, pushed, reports, notes, errors, pump: new VisualPerceptionPump(host) };
}

describe('VisualPerceptionPump', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('pushes the first change immediately (leading edge) and tags it with the change id', async () => {
        vi.setSystemTime(10_000);
        const h = makeHarness();
        await h.pump.OnChange();
        expect(h.pushed).toEqual(['f1']);
        expect(h.reports).toEqual([{ frame: 'f1', reason: 'change', changeId: 1 }]);
    });

    it('is inert without a sink or without an established inbound video track', async () => {
        const noSink = makeHarness();
        noSink.state.sink = false;
        await noSink.pump.OnChange();
        const noVideo = makeHarness();
        noVideo.state.videoUp = false;
        await noVideo.pump.OnChange();
        await noVideo.pump.Confirm();
        expect(noSink.pushed).toHaveLength(0);
        expect(noVideo.pushed).toHaveLength(0);
        expect(noVideo.notes).toHaveLength(0);
    });

    it('paces changes inside the cooldown into ONE trailing settle that shows the resting state', async () => {
        vi.setSystemTime(10_000);
        const h = makeHarness();
        await h.pump.OnChange(); // leading edge
        h.state.frame = 'f2';
        h.state.changeId = 2;
        await h.pump.OnChange();
        h.state.frame = 'f3';
        h.state.changeId = 3;
        await h.pump.OnChange();
        expect(h.pushed).toEqual(['f1']);
        await vi.advanceTimersByTimeAsync(1000);
        expect(h.pushed).toEqual(['f1', 'f3']);
        expect(h.reports[1]).toEqual({ frame: 'f3', reason: 'settle', changeId: 3 });
    });

    it('drops a frame identical to the last one sent', async () => {
        vi.setSystemTime(10_000);
        const h = makeHarness();
        await h.pump.OnChange();
        vi.setSystemTime(12_000);
        await h.pump.OnChange(); // same frame, cadence elapsed
        expect(h.pushed).toEqual(['f1']);
    });

    it('Confirm pushes one confirmation frame, cancels a pending settle, and sends the do-not-narrate note', async () => {
        vi.setSystemTime(10_000);
        const h = makeHarness();
        await h.pump.OnChange();
        h.state.frame = 'f2';
        h.state.changeId = 2;
        await h.pump.OnChange(); // arms a trailing settle
        h.state.frame = 'f3';
        h.state.changeId = 3;
        await h.pump.Confirm();
        expect(h.pushed).toEqual(['f1', 'f3']);
        expect(h.reports[1].reason).toBe('confirmation');
        expect(h.notes).toEqual([3]);
        await vi.advanceTimersByTimeAsync(5000);
        expect(h.pushed).toEqual(['f1', 'f3']); // the cancelled settle did not push a duplicate
    });

    it('Confirm sends no note when nothing could be captured', async () => {
        const h = makeHarness({ CaptureFrame: async () => null });
        await h.pump.Confirm();
        expect(h.pushed).toHaveLength(0);
        expect(h.notes).toHaveLength(0);
    });

    it('never throws into callers: a capture failure is reported through OnError', async () => {
        const h = makeHarness({
            CaptureFrame: async () => {
                throw new Error('render failed');
            },
        });
        await expect(h.pump.OnChange()).resolves.toBeUndefined();
        await expect(h.pump.Confirm()).resolves.toBeUndefined();
        expect(h.errors).toEqual(['change', 'confirmation']);
    });

    it('CancelPending cancels the settle but keeps the dedupe frame; Dispose forgets both', async () => {
        vi.setSystemTime(10_000);
        const h = makeHarness();
        await h.pump.OnChange();
        h.state.frame = 'f2';
        await h.pump.OnChange(); // arms settle
        h.pump.CancelPending();
        await vi.advanceTimersByTimeAsync(5000);
        expect(h.pushed).toEqual(['f1']);

        h.pump.Dispose();
        vi.setSystemTime(30_000);
        h.state.frame = 'f1';
        await h.pump.OnChange(); // dedupe frame forgotten, so f1 is pushed again
        expect(h.pushed).toEqual(['f1', 'f1']);
    });
});
