import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { ClientRealtimeSessionConfig, RealtimeTrackDescriptor } from '@memberjunction/ai';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseRealtimeClient, type MediaVideoSource } from '@memberjunction/ai-realtime-client';
import { REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type RealtimeChannelContext,
    type StartRealtimeClientSessionResult,
} from '../index';
import { AGENT_VIDEO_TRACK, FakeVideoDriver, videoPlayer, videoStream } from './agent-video-test-helpers';

/** A model that sends video (an avatar). */
@RegisterClass(BaseRealtimeClient, 'video-out-provider')
class VideoOutDriver extends FakeVideoDriver {
    protected override get OutputsVideo(): boolean {
        return true;
    }
}

/** A model that sends audio only. */
@RegisterClass(BaseRealtimeClient, 'audio-out-provider')
class AudioOutDriver extends FakeVideoDriver {
    protected override get OutputsVideo(): boolean {
        return false;
    }
}

/** A channel the host brings: one that shows the agent (it sinks outbound video, as the Avatar channel does), or not. */
class TestChannel extends BaseRealtimeChannelClient {
    constructor(
        private readonly key: string,
        private readonly sunk: readonly RealtimeTrackDescriptor[] = []
    ) {
        super();
    }
    public get ChannelName(): string {
        return this.key;
    }
    public override GetSunkTracks(): readonly RealtimeTrackDescriptor[] {
        return this.sunk;
    }
    public override GetDescriptor(): RealtimeChannelDescriptor {
        return {
            Key: this.key,
            Version: REALTIME_CHANNEL_CONTRACT_VERSION,
            DisplayName: this.key,
            Instructions: '',
            Nouns: [],
            Verbs: [],
            DisplayPolicy: 'open-on-start',
            DefaultAvailability: 'all-sessions',
            MaxExposure: 'none',
        };
    }
    public get ContextForTest(): RealtimeChannelContext | null {
        return this.Context;
    }
}

const avatarChannel = () => new TestChannel('Avatar', [AGENT_VIDEO_TRACK]);

/** Answers the mint with the driver a test names. */
class MintProvider {
    public readonly sessionId = 'transport-session-1';
    public readonly Entities: unknown[] = [];
    public Driver = 'video-out-provider';
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (!query.includes('mutation StartRealtimeClientSession')) {
            return {};
        }
        const result: StartRealtimeClientSessionResult = {
            AgentSessionId: 'session-1',
            ConversationId: 'conv-1',
            Provider: this.Driver,
            Model: 'avatar-model',
            EphemeralToken: 'token',
            ExpiresAt: '2030-01-01T00:00:00Z',
            SessionConfigJson: '{}',
            ModelName: 'Avatar Model',
            NarrationInstructionsTemplate: null,
            PriorChannelStatesJson: null,
        };
        return { StartRealtimeClientSession: result };
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

/**
 * A session with the given host channels, recording the agent's video and the channels marked as used. `begin` starts
 * the call; `start` starts it and returns its driver.
 */
function build(channels: TestChannel[] = [], driver = 'video-out-provider', host: IRealtimeMediaHost = { AcquireMicrophone: async () => videoStream('mic') }) {
    const runtime = new RealtimeSessionRuntime(host);
    const provider = new MintProvider();
    provider.Driver = driver;
    runtime.Provider = provider as unknown as IMetadataProvider;
    const videos: Array<MediaVideoSource | null> = [];
    runtime.AgentVideo$.subscribe((v) => videos.push(v));
    const used: string[] = [];
    runtime.ChannelActivity$.subscribe((c) => used.push(c.ChannelName));
    const begin = () =>
        runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null, {
            HostChannels: channels.map((channel) => ({ Create: () => channel })),
        });
    const start = async (): Promise<FakeVideoDriver> => {
        await begin();
        const client = runtime.Client;
        if (!(client instanceof FakeVideoDriver)) {
            throw new Error('The session did not start on the fake driver.');
        }
        return client;
    };
    return { runtime, videos, used, begin, start };
}

/** Called once the slow driver below is connecting, and to let it finish. */
let connecting: () => void = () => undefined;
let finishConnecting: () => void = () => undefined;

/** A video model whose connection the test holds open, after the video has already arrived. */
@RegisterClass(BaseRealtimeClient, 'slow-video-out-provider')
class SlowVideoOutDriver extends VideoOutDriver {
    public override async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.ShowAgentVideo(videoPlayer());
        connecting();
        await new Promise<void>((resolve) => (finishConnecting = resolve));
        await super.Connect(config, micStream);
    }
}

const outboundVideo = (client: FakeVideoDriver) =>
    client.AllTracks.filter((t) => t.Descriptor.Direction === 'outbound' && t.Descriptor.Modality === 'video');

describe("RealtimeSessionRuntime: the agent's video", () => {
    it('requests outbound video when a channel sinks it, and the driver establishes it when the model sends video', async () => {
        const { runtime, start } = build([avatarChannel()]);
        const client = await start();
        expect(client.Config?.SessionConfig['requestedTracks']).toContainEqual({ Modality: 'video', Direction: 'outbound' });
        expect(client).toBeInstanceOf(VideoOutDriver);
        expect(client.IsTrackEstablished('video', 'outbound')).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('leaves the track unsupported on a model that sends no video', async () => {
        const { runtime, start } = build([avatarChannel()], 'audio-out-provider');
        const client = await start();
        expect(client).toBeInstanceOf(AudioOutDriver);
        expect(outboundVideo(client).map((t) => t.State)).toEqual(['unsupported']);
        await runtime.EndRealtimeSession();
    });

    it('requests no outbound video when no channel sinks it', async () => {
        const { runtime, start } = build([new TestChannel('Notes')]);
        const client = await start();
        expect(client.Config?.SessionConfig['requestedTracks']).toBeUndefined();
        expect(outboundVideo(client)).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it("publishes the agent's video, a stream or a player, and a newer one replaces it", async () => {
        const { runtime, videos, start } = build([avatarChannel()]);
        const client = await start();
        const player = videoPlayer();
        const stream = videoStream('avatar');
        client.ShowAgentVideo(player);
        client.ShowAgentVideo(stream);
        expect(videos).toEqual([null, player, { Kind: 'stream', Stream: stream }]);
        await runtime.EndRealtimeSession();
    });

    it("gives a channel the agent's video through its context", async () => {
        const avatar = avatarChannel();
        const { runtime, start } = build([avatar]);
        const client = await start();
        const seen: Array<MediaVideoSource | null> = [];
        avatar.ContextForTest?.AgentVideo$?.subscribe((v) => seen.push(v));
        const player = videoPlayer();
        client.ShowAgentVideo(player);
        expect(seen).toEqual([null, player]);
        await runtime.EndRealtimeSession();
    });

    it("gives a channel the call's state through its context", async () => {
        const avatar = avatarChannel();
        const { runtime, start } = build([avatar]);
        const client = await start();
        const seen: string[] = [];
        avatar.ContextForTest?.ConnectionState$?.subscribe((s) => seen.push(s));
        client.ReportState('listening');
        client.ReportState('speaking');
        expect(seen.slice(-2)).toEqual(['listening', 'speaking']);
        await runtime.EndRealtimeSession();
    });

    it('marks the channel that shows the video as used when it arrives, so its surface shows, and no other channel', async () => {
        const { runtime, used, start } = build([
            avatarChannel(),
            new TestChannel('Notes'),
            new TestChannel('Sounds', [{ Modality: 'audio', Direction: 'outbound' }]),
            new TestChannel('Misdeclared', [{ Modality: 'video', Direction: 'inbound' }]),
        ]);
        const client = await start();
        expect(runtime.HasChannelBeenUsed('Avatar')).toBe(false);
        client.ShowAgentVideo(videoPlayer());
        expect(used).toEqual(['Avatar']);
        expect(runtime.HasChannelBeenUsed('Avatar')).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('ends with the call, and a late frame from the ended call does not bring it back', async () => {
        const { runtime, videos, start } = build([avatarChannel()]);
        const client = await start();
        client.ShowAgentVideo(videoPlayer());
        await runtime.EndRealtimeSession();
        expect(videos.at(-1)).toBeNull();
        client.ShowAgentVideo(videoPlayer());
        expect(videos.at(-1)).toBeNull();
        expect(videos).toHaveLength(3);
    });

    it('ends with a start the host abandoned while it was connecting, when the video had already arrived', async () => {
        // Ending the call while it connects: teardown waits on the host, the start finishes connecting and unwinds itself.
        let releaseMicrophone: () => void = () => undefined;
        const host: IRealtimeMediaHost = {
            AcquireMicrophone: async () => videoStream('mic'),
            ReleaseMicrophone: () => new Promise<void>((resolve) => (releaseMicrophone = resolve)),
        };
        const { runtime, videos, begin } = build([], 'slow-video-out-provider', host);
        const reached = new Promise<void>((resolve) => (connecting = resolve));
        const starting = begin();
        await reached;
        expect(videos).toHaveLength(2);
        const ending = runtime.EndRealtimeSession();
        finishConnecting();
        await starting;
        releaseMicrophone();
        await ending;
        expect(runtime.Client).toBeNull();
        expect(videos.at(-1)).toBeNull();
    });
});

/**
 * A resume moves a live call to a new connection with its provider (Google's `goAway`, a dropped socket): the driver
 * reports `'connecting'` mid-call and a live state once the new connection is in use. The agent's video can stop for a few
 * seconds meanwhile, which the Avatar channel's surface holds through (#5357).
 */
describe('RealtimeSessionRuntime: a resume (Resuming$)', () => {
    /** The call's resumes and states, in the order they change. */
    const record = (runtime: RealtimeSessionRuntime): string[] => {
        const log: string[] = [];
        runtime.Resuming$.subscribe((resuming) => log.push(`resuming:${resuming}`));
        runtime.ConnectionState$.subscribe((state) => log.push(state));
        return log;
    };

    /** A call that has connected and is live, with its driver. */
    const live = async (channels: TestChannel[] = []) => {
        const call = build(channels);
        const client = await call.start();
        client.ReportState('connecting');
        client.ReportState('connected');
        client.ReportState('listening');
        return { ...call, client };
    };

    it("is false through the call's first connect, and outside a call", async () => {
        const { runtime, start } = build([avatarChannel()]);
        const seen: boolean[] = [];
        runtime.Resuming$.subscribe((resuming) => seen.push(resuming));
        const client = await start();
        client.ReportState('connecting');
        client.ReportState('connected');
        client.ReportState('listening');
        await runtime.EndRealtimeSession();
        expect(seen).toEqual([false]);
    });

    it("is true from a 'connecting' mid-call until the call is live again, and changes before the call's state", async () => {
        const { runtime, client } = await live();
        const log = record(runtime);
        client.ReportState('connecting');
        client.ReportState('connected');
        client.ReportState('listening');
        expect(log).toEqual(['resuming:false', 'listening', 'resuming:true', 'connecting', 'resuming:false', 'listening']);
        await runtime.EndRealtimeSession();
    });

    it("starts while the agent speaks, holds through a second 'connecting', and ends at the next live state", async () => {
        const { runtime, client } = await live();
        client.ReportState('speaking');
        const seen: boolean[] = [];
        runtime.Resuming$.subscribe((resuming) => seen.push(resuming));
        client.ReportState('connecting');
        client.ReportState('connecting');
        expect(seen).toEqual([false, true]);
        client.ReportState('speaking');
        expect(seen).toEqual([false, true, false]);
        await runtime.EndRealtimeSession();
    });

    it("ends when the resume fails ('error')", async () => {
        const { runtime, client } = await live();
        const log = record(runtime);
        client.ReportState('connecting');
        client.ReportState('error');
        expect(log.slice(-2)).toEqual(['resuming:false', 'error']);
        await runtime.EndRealtimeSession();
    });

    it("ends when the call ends during a resume ('closed'), and the next call starts with none", async () => {
        const { runtime, client, start } = await live();
        client.ReportState('connecting');
        const log = record(runtime);
        await runtime.EndRealtimeSession();
        expect(log.slice(-2)).toEqual(['resuming:false', 'closed']);
        const next = await start();
        next.ReportState('connecting');
        expect(log.filter((entry) => entry.startsWith('resuming:'))).toEqual(['resuming:true', 'resuming:false']);
        await runtime.EndRealtimeSession();
    });

    it('reaches a channel through its context', async () => {
        const avatar = avatarChannel();
        const { runtime, client } = await live([avatar]);
        const seen: boolean[] = [];
        avatar.ContextForTest?.Resuming$?.subscribe((resuming) => seen.push(resuming));
        client.ReportState('connecting');
        client.ReportState('listening');
        expect(seen).toEqual([false, true, false]);
        await runtime.EndRealtimeSession();
    });
});
