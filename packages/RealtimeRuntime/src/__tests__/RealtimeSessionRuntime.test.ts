import { describe, it, expect, vi } from 'vitest';
import {
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type IRealtimeSessionRecorder,
} from '../index';

/**
 * A media host backed by nothing at all.
 *
 * This is the point of the extraction: a realtime session can be constructed and driven with no
 * browser, no microphone, and no audio hardware — which is what makes the runtime testable here,
 * and reusable from React Native and Node.
 */
class FakeMediaHost implements IRealtimeMediaHost {
    public AcquireMicrophoneCalls = 0;
    public recorder: FakeRecorder | null = null;

    constructor(private readonly failMic = false) {}

    public async AcquireMicrophone(): Promise<MediaStream> {
        this.AcquireMicrophoneCalls++;
        if (this.failMic) {
            throw new Error('permission denied');
        }
        // A structural stand-in — the runtime only forwards it to the driver and stops its tracks.
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }

    public CreateRecorder(): IRealtimeSessionRecorder | null {
        this.recorder = new FakeRecorder();
        return this.recorder;
    }
}

class FakeRecorder implements IRealtimeSessionRecorder {
    public IsRecording = true;
    public SampleRate = 24000;
    public MimeType = 'audio/wav';
    public StopCalls = 0;
    public Start = vi.fn();
    public AttachRemoteStream = vi.fn();
    public NowOffsetMs = () => 0;
    public GetPeaks = () => [0.1, 0.2];
    public async SnapshotNewSegmentBase64(): Promise<string | null> {
        return 'c2VnbWVudA==';
    }
    public async StopAndEncode(): Promise<string | null> {
        this.StopCalls++;
        return 'cmVjb3JkaW5n';
    }
}

/** A host that cannot record — a fully supported configuration, not a degraded one. */
class RecordinglessHost implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

describe('RealtimeSessionRuntime', () => {
    describe('construction without a browser', () => {
        it('constructs with only a media host — no DOM, no globals', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime).toBeInstanceOf(RealtimeSessionRuntime);
        });

        it('starts inactive, so a fresh runtime never looks like a live call', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.IsActive).toBe(false);
        });

        it('reports no agent session before one is minted', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.CurrentAgentSessionId).toBeNull();
        });

        it('exposes no channels before a session starts', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.ActiveChannels).toEqual([]);
            expect(runtime.HasChannelBeenUsed('Whiteboard')).toBe(false);
        });
    });

    describe('host seam contract', () => {
        it('accepts a host that cannot record — CreateRecorder is optional', () => {
            const runtime = new RealtimeSessionRuntime(new RecordinglessHost());
            expect(runtime).toBeInstanceOf(RealtimeSessionRuntime);
        });

        it('a recording host satisfies the recorder contract structurally', async () => {
            const host = new FakeMediaHost();
            const recorder = host.CreateRecorder();
            expect(recorder).not.toBeNull();
            // The runtime only ever receives already-encoded bytes — never a Blob.
            await expect(recorder!.SnapshotNewSegmentBase64()).resolves.toBe('c2VnbWVudA==');
            await expect(recorder!.StopAndEncode()).resolves.toBe('cmVjb3JkaW5n');
            expect(typeof recorder!.MimeType).toBe('string');
        });

        it('surfaces microphone acquisition through the host, not navigator', async () => {
            const host = new FakeMediaHost();
            await host.AcquireMicrophone();
            expect(host.AcquireMicrophoneCalls).toBe(1);
        });

        it('lets a denied microphone reject, so the runtime can fail the start cleanly', async () => {
            const host = new FakeMediaHost(true);
            await expect(host.AcquireMicrophone()).rejects.toThrow('permission denied');
        });
    });

    describe('mute handling with no live stream', () => {
        it('returns false rather than throwing when there is no microphone yet', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            expect(runtime.ToggleMute()).toBe(false);
        });
    });

    describe('client tool registry', () => {
        it('registers and unregisters a handler by prefix without a live session', () => {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            const handler = vi.fn(() => '{}');
            runtime.RegisterClientToolHandler('Whiteboard_', handler);
            runtime.UnregisterClientToolHandler('Whiteboard_');
            // The assertion that matters is that neither call requires a session or a browser.
            expect(handler).not.toHaveBeenCalled();
        });
    });
});

describe('host provider capability filter', () => {
    /** A host that can only carry WebRTC providers, like the React Native app. */
    class WebRtcOnlyRuntime extends RealtimeSessionRuntime {
        public Asked: string[] = [];
        protected override hostCanUseProvider(provider: string): boolean {
            this.Asked.push(provider);
            return provider === 'openai' || provider === 'openai-live';
        }
    }

    it('accepts everything by default, so existing hosts are unaffected', () => {
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        // The default is deliberately permissive — a browser can run every shipped driver.
        const canUse = (runtime as unknown as { hostCanUseProvider(p: string): boolean }).hostCanUseProvider;
        expect(canUse.call(runtime, 'gemini')).toBe(true);
        expect(canUse.call(runtime, 'elevenlabs')).toBe(true);
    });

    it('lets a host narrow what it will connect to', () => {
        const runtime = new WebRtcOnlyRuntime(new FakeMediaHost());
        const canUse = (runtime as unknown as { hostCanUseProvider(p: string): boolean }).hostCanUseProvider;
        expect(canUse.call(runtime, 'openai-live')).toBe(true);
        expect(canUse.call(runtime, 'gemini')).toBe(false);
        expect(runtime.Asked).toEqual(['openai-live', 'gemini']);
    });
});
