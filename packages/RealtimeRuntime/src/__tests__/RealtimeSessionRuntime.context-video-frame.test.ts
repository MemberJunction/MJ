/**
 * The channel context's (deprecated) `SendVideoFrame`: a channel's frame goes through the session's video source
 * arbiter as the channel's own source, so it reaches the model only while the arbiter picks that source, and only while
 * the channel's exposure allows pixels. Before, it wrote straight to the client, past the arbiter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, VideoSourceArbiter, type VideoSourceState } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    InMemoryChannelExposurePreferences,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type StartRealtimeClientSessionResult,
} from '../index';

/** A channel that sends its pictures through its context, as a channel written before the frame bridge would. */
@RegisterClass(BaseRealtimeChannelClient, 'ContextFrameSketchChannel')
class SketchChannel extends BaseRealtimeChannelClient {
    public static Instance: SketchChannel | null = null;
    /** Whether the channel also runs the base class's own frame bridge for the same pictures. */
    public static WithFrameBridge = false;
    public get ChannelName(): string {
        return 'Sketch';
    }
    public override get TabTitle(): string {
        return 'Sketch';
    }
    public override GetDescriptor() {
        return {
            Key: 'Sketch',
            Version: '2.0.0',
            DisplayName: 'Sketch pad',
            Instructions: 'A pad the agent can look at.',
            Nouns: [{ Name: 'pad', Description: 'The pad', Schema: { type: 'object' } }],
            Verbs: [],
            DisplayPolicy: 'open-on-start' as const,
            DefaultAvailability: 'all-sessions' as const,
            MaxExposure: 'pixels' as const,
        };
    }
    /** Sends one picture through the context, the way the deprecated path does. */
    public Send(frame: string): void {
        this.Context?.SendVideoFrame?.(frame);
    }
    /** The arbiter of the live connection, so a test can add a competing source. */
    public Arbiter(): VideoSourceArbiter {
        const client = this.Context?.Client;
        if (!client) {
            throw new Error('the channel has no live client yet');
        }
        return VideoSourceArbiter.ForSink(client);
    }
    protected override OnInitialize(): void {
        SketchChannel.Instance = this;
        if (SketchChannel.WithFrameBridge) {
            this.EnableVisualPerception({ GetLatestFrame: async () => 'bridge-frame' });
        }
    }
}

/** One frame the model was sent, with the source the client was told it came from. */
interface SentFrame {
    Data: string;
    MimeType: string | undefined;
    SourceID: string | undefined;
}

@RegisterClass(BaseRealtimeClient, 'context-frame-fake-provider')
class ContextFrameClient extends BaseRealtimeClient {
    public static Frames: SentFrame[] = [];
    public static Notes: string[] = [];
    public static VideoLive = true;
    public async Connect(): Promise<void> {
        this.emitStateChange('listening');
    }
    public override IsTrackEstablished(modality: string, direction: 'inbound' | 'outbound'): boolean {
        return ContextFrameClient.VideoLive && modality === 'video' && direction === 'inbound';
    }
    public override get MaxInboundVideoStreams(): number {
        return ContextFrameClient.VideoLive ? 1 : 0;
    }
    public override SendVideoFrame(base64Image: string, mimeType?: string, sourceId?: string): boolean {
        ContextFrameClient.Frames.push({ Data: base64Image, MimeType: mimeType, SourceID: sourceId });
        return true;
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(text: string): void {
        ContextFrameClient.Notes.push(text);
    }
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

class Host implements IRealtimeMediaHost {
    public async AcquireMicrophone(): Promise<MediaStream> {
        return { getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream;
    }
}

const POLICY: RealtimeSessionClientPolicy = {
    Version: 1,
    Channels: [{ Key: 'Sketch', DisplayPolicy: 'open-on-start', MaxExposure: 'pixels', Exposure: 'pixels', Source: 'default' }],
};

class MintProvider {
    /** Entity metadata is present, so the runtime reads the channel registry from the AI engine's cache. */
    public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }];
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (query.includes('mutation StartRealtimeClientSession')) {
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-1',
                ConversationId: 'conv-1',
                Provider: 'context-frame-fake-provider',
                Model: 'm',
                EphemeralToken: 't',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
            };
            if (query.includes('ClientPolicyJson')) {
                result.ClientPolicyJson = JSON.stringify(POLICY);
            }
            return { StartRealtimeClientSession: result };
        }
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

const SKETCH_ROW = { ID: 'c1', Name: 'Sketch', ClientPluginClass: 'ContextFrameSketchChannel', IsActive: true };

async function startSession(): Promise<{ runtime: RealtimeSessionRuntime; channel: SketchChannel }> {
    vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
        Config: async () => undefined,
        AgentChannels: [SKETCH_ROW],
    } as unknown as AIEngineBase);
    const runtime = new RealtimeSessionRuntime(new Host());
    runtime.Provider = new MintProvider() as unknown as IMetadataProvider;
    runtime.SetExposurePreferences(new InMemoryChannelExposurePreferences());
    await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null);
    const channel = SketchChannel.Instance;
    if (!channel) {
        throw new Error('the Sketch channel did not mount');
    }
    return { runtime, channel };
}

/** The clock the arbiter paces each source by: every send is a fresh second, so pacing never drops a frame here. */
let now = 1_000_000;
function nextSecond(): void {
    now += 1_000;
}

function sourcesOf(runtime: RealtimeSessionRuntime): readonly VideoSourceState[] {
    let sources: readonly VideoSourceState[] = [];
    runtime.VideoSources$.subscribe((s) => (sources = s)).unsubscribe();
    return sources;
}

describe("RealtimeSessionRuntime — a channel's frames through its context", () => {
    beforeEach(() => {
        ContextFrameClient.Frames = [];
        ContextFrameClient.Notes = [];
        ContextFrameClient.VideoLive = true;
        SketchChannel.Instance = null;
        SketchChannel.WithFrameBridge = false;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(Date, 'now').mockImplementation(() => now);
    });
    afterEach(() => vi.restoreAllMocks());

    it('reach the model as the channel\'s own source, only while the arbiter picks that source', async () => {
        const { runtime, channel } = await startSession();

        nextSecond();
        channel.Send('sketch-1');
        expect(ContextFrameClient.Frames).toEqual([{ Data: 'sketch-1', MimeType: 'image/jpeg', SourceID: 'Sketch#1' }]);
        expect(sourcesOf(runtime)).toMatchObject([{ SourceID: 'Sketch#1', Label: 'Sketch pad', ChannelKey: 'Sketch', Enabled: true, Active: true }]);

        // The user starts their camera: a capture outranks a channel surface, so the camera is what the model sees now.
        channel.Arbiter().RegisterSource({ SourceID: 'camera', Label: 'Camera', Kind: 'camera' });
        nextSecond();
        channel.Send('sketch-2');
        expect(ContextFrameClient.Frames.map((f) => f.Data)).toEqual(['sketch-1']);
        expect(ContextFrameClient.Notes).toContain('[You can now see: Camera]');

        // The user picks the sketch pad: its frames reach the model again, and the model is told.
        expect(runtime.SelectVideoSource('Sketch#1')).toBe(true);
        nextSecond();
        channel.Send('sketch-3');
        expect(ContextFrameClient.Frames.map((f) => f.Data)).toEqual(['sketch-1', 'sketch-3']);
        expect(ContextFrameClient.Notes).toContain('[You can now see: Sketch pad]');
        await runtime.EndRealtimeSession();
    });

    it("send nothing while the channel's exposure is below pixels, and the source follows the exposure", async () => {
        const { runtime, channel } = await startSession();
        runtime.SetUserChannelExposure('Sketch', 'state');

        nextSecond();
        channel.Send('sketch-1');
        expect(ContextFrameClient.Frames).toEqual([]);
        expect(sourcesOf(runtime)).toMatchObject([{ SourceID: 'Sketch#1', Enabled: false, Active: false }]);

        runtime.SetUserChannelExposure('Sketch', undefined);
        expect(sourcesOf(runtime)).toMatchObject([{ SourceID: 'Sketch#1', Enabled: true }]);
        nextSecond();
        channel.Send('sketch-2');
        expect(ContextFrameClient.Frames.map((f) => f.Data)).toEqual(['sketch-2']);

        // Turning the source off in the "agent can see" control lowers the channel's exposure, which stops its frames.
        expect(runtime.SetVideoSourceEnabled('Sketch#1', false)).toBe(true);
        nextSecond();
        channel.Send('sketch-3');
        expect(ContextFrameClient.Frames.map((f) => f.Data)).toEqual(['sketch-2']);
        await runtime.EndRealtimeSession();
    });

    it("are one source with the frames of the channel's own frame bridge", async () => {
        SketchChannel.WithFrameBridge = true;
        const { runtime, channel } = await startSession();
        expect(sourcesOf(runtime).map((s) => s.SourceID)).toEqual(['Sketch#1']);

        nextSecond();
        channel.Send('sketch-1');
        expect(channel.Arbiter().GetSources().map((s) => s.SourceID)).toEqual(['Sketch#1']);
        expect(ContextFrameClient.Frames).toContainEqual({ Data: 'sketch-1', MimeType: 'image/jpeg', SourceID: 'Sketch#1' });
        await runtime.EndRealtimeSession();
    });

    it('go nowhere, and list no source, when the session takes no inbound video', async () => {
        ContextFrameClient.VideoLive = false;
        const { runtime, channel } = await startSession();
        nextSecond();
        channel.Send('sketch-1');
        expect(ContextFrameClient.Frames).toEqual([]);
        expect(sourcesOf(runtime)).toEqual([]);
        await runtime.EndRealtimeSession();
    });
});
