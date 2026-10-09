import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { ClientRealtimeSessionConfig, RealtimeAvatarStatus, RealtimeTrackDescriptor } from '@memberjunction/ai';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import { REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    RealtimeSessionRuntime,
    type RealtimeAvatarNotice,
    type StartRealtimeClientSessionResult,
} from '../index';
import { AGENT_VIDEO_TRACK, FakeVideoDriver, videoPlayer, videoStream } from './agent-video-test-helpers';

/** A model that sends video (an avatar): the agent's video track goes live when the session asks for it. */
@RegisterClass(BaseRealtimeClient, 'notice-video-out')
class VideoOutDriver extends FakeVideoDriver {
    protected override get OutputsVideo(): boolean {
        return true;
    }
}

/** A browser that can't play the avatar: the agent's video track stays unsupported. */
@RegisterClass(BaseRealtimeClient, 'notice-no-video-out')
class NoVideoOutDriver extends FakeVideoDriver {
    protected override get OutputsVideo(): boolean {
        return false;
    }
}

/** Called once the slow driver below is connecting, and to let it finish. */
let connecting: () => void = () => undefined;
let finishConnecting: () => void = () => undefined;

/** A driver whose connection the test holds open. */
@RegisterClass(BaseRealtimeClient, 'notice-slow')
class SlowDriver extends NoVideoOutDriver {
    public override async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        connecting();
        await new Promise<void>((resolve) => (finishConnecting = resolve));
        await super.Connect(config, micStream);
    }
}

/** A channel the host brings; the Avatar channel sinks the agent's video. */
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
}

const GRANTED: RealtimeAvatarStatus = { Requested: true, Granted: true };
const ENDPOINT: RealtimeAvatarStatus = { Requested: true, Granted: false, Reason: 'endpoint' };

function mintResult(driver: string, avatarStatusJson?: string | null): StartRealtimeClientSessionResult {
    return {
        AgentSessionId: 'session-1',
        ConversationId: 'conv-1',
        Provider: driver,
        Model: 'voice-model',
        EphemeralToken: 'token',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Voice Model',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
        ...(avatarStatusJson !== undefined ? { AvatarStatusJson: avatarStatusJson } : {}),
    };
}

/** Answers the mint with the driver and avatar status a test names. */
class MintProvider {
    public readonly sessionId = 'transport-session-1';
    public readonly Entities: unknown[] = [];
    constructor(
        private readonly driver: string,
        private readonly status: RealtimeAvatarStatus | null
    ) {}
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (!query.includes('mutation StartRealtimeClientSession')) {
            return {};
        }
        return { StartRealtimeClientSession: mintResult(this.driver, this.status ? JSON.stringify(this.status) : null) };
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

/** A session whose mint reports `status`, with or without the Avatar channel, recording every notice it publishes. */
function build(status: RealtimeAvatarStatus | null, options: { Driver?: string; AvatarChannel?: boolean } = {}) {
    const runtime = new RealtimeSessionRuntime({ AcquireMicrophone: async () => videoStream('mic') });
    runtime.Provider = new MintProvider(options.Driver ?? 'notice-video-out', status) as unknown as IMetadataProvider;
    const notices: Array<RealtimeAvatarNotice | null> = [];
    runtime.AvatarNotice$.subscribe((n) => notices.push(n));
    const channels = options.AvatarChannel === false ? [new TestChannel('Notes')] : [new TestChannel('Avatar', [AGENT_VIDEO_TRACK])];
    const begin = () =>
        runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null, {
            HostChannels: channels.map((channel) => ({ Create: () => channel })),
        });
    return { runtime, notices, begin };
}

/** A runtime for a host that mints for itself: it runs a result it was handed (no mint on its provider). */
function selfMinting(): RealtimeSessionRuntime {
    const runtime = new RealtimeSessionRuntime({ AcquireMicrophone: async () => videoStream('mic') });
    runtime.Provider = new MintProvider('notice-video-out', null) as unknown as IMetadataProvider;
    return runtime;
}

describe('RealtimeSessionRuntime.AvatarNotice$', () => {
    it("says why once the call connects, when the model can't show the avatar", async () => {
        const { runtime, notices, begin } = build(ENDPOINT);
        await begin();
        expect(notices).toEqual([null, { Reason: 'endpoint' }]);
        expect(runtime.CurrentAvatarNotice).toEqual({ Reason: 'endpoint' });
        await runtime.EndRealtimeSession();
    });

    it('says nothing before the connection opens', async () => {
        const { runtime, notices, begin } = build(ENDPOINT, { Driver: 'notice-slow' });
        const started = new Promise<void>((resolve) => (connecting = resolve));
        const call = begin();
        await started;
        expect(runtime.CurrentAvatarNotice).toBeNull();
        finishConnecting();
        await call;
        expect(notices).toEqual([null, { Reason: 'endpoint' }]);
        await runtime.EndRealtimeSession();
    });

    it('says nothing when the mint reports no status, or one this version cannot read', async () => {
        const none = build(null);
        await none.begin();
        expect(none.runtime.IsActive).toBe(true);
        expect(none.runtime.Client?.IsTrackEstablished('video', 'outbound')).toBe(true);
        expect(none.notices).toEqual([null]);
        await none.runtime.EndRealtimeSession();

        const fromResult = selfMinting();
        const seen: Array<RealtimeAvatarNotice | null> = [];
        fromResult.AvatarNotice$.subscribe((n) => seen.push(n));
        await fromResult.StartRealtimeSessionFromResult(mintResult('notice-video-out', '{"Requested":true,"Granted":false,"Reason":"downgraded"}'));
        expect(fromResult.IsActive).toBe(true);
        expect(seen).toEqual([null]);
        await fromResult.EndRealtimeSession();
    });

    it("says the app can't show the avatar when it was granted and no channel asked for the agent's video", async () => {
        const { runtime, notices, begin } = build(GRANTED, { AvatarChannel: false });
        await begin();
        expect(notices).toEqual([null, { Reason: 'host' }]);
        await runtime.EndRealtimeSession();
    });

    it("says the browser can't play the avatar when it was granted and asked for, but the track did not go live", async () => {
        const { runtime, notices, begin } = build(GRANTED, { Driver: 'notice-no-video-out' });
        await begin();
        expect(notices).toEqual([null, { Reason: 'browser' }]);
        await runtime.EndRealtimeSession();
    });

    it('says nothing when the avatar shows', async () => {
        const { runtime, notices, begin } = build(GRANTED);
        await begin();
        expect(runtime.IsTrackEstablished('video', 'outbound')).toBe(true);
        expect(notices).toEqual([null]);
        await runtime.EndRealtimeSession();
    });

    it('publishes once per call, whatever else the call does, and clears when the call ends', async () => {
        const { runtime, notices, begin } = build(ENDPOINT);
        await begin();
        const client = runtime.Client;
        if (!(client instanceof VideoOutDriver)) {
            throw new Error('The session did not start on the video driver.');
        }
        client.ReportState('speaking');
        client.ReportState('listening');
        client.ShowAgentVideo(videoPlayer());
        expect(notices).toEqual([null, { Reason: 'endpoint' }]);
        await runtime.EndRealtimeSession();
        expect(notices).toEqual([null, { Reason: 'endpoint' }, null]);
        expect(runtime.CurrentAvatarNotice).toBeNull();
    });

    it('a host that mints for itself gets the notice when it passes the status on, and none when it does not', async () => {
        const runtime = selfMinting();
        await runtime.StartRealtimeSessionFromResult(mintResult('notice-video-out', JSON.stringify(GRANTED)));
        expect(runtime.IsActive).toBe(true);
        expect(runtime.CurrentAvatarNotice).toEqual({ Reason: 'host' });
        await runtime.EndRealtimeSession();

        await runtime.StartRealtimeSessionFromResult(mintResult('notice-video-out'));
        expect(runtime.IsActive).toBe(true);
        expect(runtime.CurrentAvatarNotice).toBeNull();
        await runtime.EndRealtimeSession();
    });
});
