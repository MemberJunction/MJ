import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, VideoSourceArbiter } from '@memberjunction/ai-realtime-client';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RealtimeChannelExposure, RealtimeSessionClientPolicy } from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    InMemoryChannelExposurePreferences,
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type StartRealtimeClientSessionResult,
} from '../index';

/** A channel that can show the model pictures, so it appears in the "agent can see" list. */
@RegisterClass(BaseRealtimeChannelClient, 'ExposureVisionChannel')
class VisionChannel extends BaseRealtimeChannelClient {
    public static Instance: VisionChannel | null = null;
    public get ChannelName(): string {
        return 'Vision';
    }
    public override get TabTitle(): string {
        return 'Vision';
    }
    public override GetDescriptor() {
        return {
            Key: 'Vision',
            Version: '2.0.0',
            DisplayName: 'Vision board',
            Instructions: 'A board the agent can look at.',
            Nouns: [{ Name: 'board', Description: 'The board', Schema: { type: 'object' } }],
            Verbs: [],
            DisplayPolicy: 'open-on-start' as const,
            DefaultAvailability: 'all-sessions' as const,
            MaxExposure: 'pixels' as const,
        };
    }
    /** The arbiter of the live connection, so a test can add a competing source and read who is being shown. */
    public Arbiter(): VideoSourceArbiter {
        const client = this.Context?.Client;
        if (!client) {
            throw new Error('the channel has no live client yet');
        }
        return VideoSourceArbiter.ForSink(client);
    }
    protected override OnInitialize(): void {
        VisionChannel.Instance = this;
        this.EnableVisualPerception({ GetLatestFrame: async () => 'frame' });
    }
}

@RegisterClass(BaseRealtimeClient, 'exposure-fake-provider')
class ExposureFakeClient extends BaseRealtimeClient {
    public static Notes: string[] = [];
    public static VideoLive = true;
    public async Connect(): Promise<void> {
        this.emitStateChange('listening');
    }
    public override IsTrackEstablished(modality: string, direction: 'inbound' | 'outbound'): boolean {
        return ExposureFakeClient.VideoLive && modality === 'video' && direction === 'inbound';
    }
    public override get MaxInboundVideoStreams(): number {
        return 1;
    }
    public override SendVideoFrame(): boolean {
        return true;
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(text: string): void {
        ExposureFakeClient.Notes.push(text);
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

class MintProvider {
    public Policy: RealtimeSessionClientPolicy | null = null;
    constructor(public Entities: unknown[] = [{ Name: 'MJ: AI Agent Channels' }]) {}
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (query.includes('mutation StartRealtimeClientSession')) {
            const result: StartRealtimeClientSessionResult = {
                AgentSessionId: 'session-1',
                ConversationId: 'conv-1',
                Provider: 'exposure-fake-provider',
                Model: 'm',
                EphemeralToken: 't',
                ExpiresAt: '2030-01-01T00:00:00Z',
                SessionConfigJson: '{}',
                ModelName: 'Fake',
                NarrationInstructionsTemplate: null,
                PriorChannelStatesJson: null,
            };
            if (this.Policy && query.includes('ClientPolicyJson')) {
                result.ClientPolicyJson = JSON.stringify(this.Policy);
            }
            return { StartRealtimeClientSession: result };
        }
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

const VISION_ROW = { ID: 'c1', Name: 'Vision', ClientPluginClass: 'ExposureVisionChannel', IsActive: true };

function stubRegistry(): void {
    vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
        Config: async () => undefined,
        AgentChannels: [VISION_ROW],
    } as unknown as AIEngineBase);
}

function policyFor(exposure: RealtimeChannelExposure, reasons: string[] = []): RealtimeSessionClientPolicy {
    return {
        Version: 1,
        Channels: [
            {
                Key: 'Vision',
                DisplayPolicy: 'open-on-start',
                MaxExposure: 'pixels',
                Exposure: exposure,
                ...(reasons.length > 0 ? { ExposureLimits: [{ Source: 'zero-data-retention' as const, Level: exposure, Reason: reasons[0] }] } : {}),
                Source: 'default',
            },
        ],
    };
}

async function startSession(
    policy: RealtimeSessionClientPolicy | null,
    preferences?: InMemoryChannelExposurePreferences
): Promise<RealtimeSessionRuntime> {
    const runtime = new RealtimeSessionRuntime(new Host());
    const provider = new MintProvider();
    provider.Policy = policy;
    runtime.Provider = provider as unknown as IMetadataProvider;
    runtime.SetExposurePreferences(preferences ?? new InMemoryChannelExposurePreferences());
    await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null);
    return runtime;
}

describe('RealtimeSessionRuntime — exposure policy', () => {
    beforeEach(() => {
        ExposureFakeClient.Notes = [];
        ExposureFakeClient.VideoLive = true;
        VisionChannel.Instance = null;
        stubRegistry();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('with no server exposure (an older server) the channel has its own ceiling', async () => {
        const runtime = await startSession(null);
        expect(runtime.GetChannelExposure('Vision')).toBe('pixels');
        await runtime.EndRealtimeSession();
    });

    it('applies the SERVER-decided exposure when the channel is mounted, before it initializes', async () => {
        const runtime = await startSession(policyFor('state', ['this agent requires a zero-data-retention model']));
        expect(runtime.GetChannelExposure('vision')).toBe('state');
        expect(VisionChannel.Instance?.ExposureReasons).toEqual(['this agent requires a zero-data-retention model']);
        await runtime.EndRealtimeSession();
    });

    it('does not request the video track at all when the server rules pixels out', async () => {
        const runtime = await startSession(policyFor('state'));
        expect(VisionChannel.Instance?.GetSourcedTracks()).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('tells the agent what it cannot perceive and why, once, in the catalog note', async () => {
        const runtime = await startSession(policyFor('state', ['this agent requires a zero-data-retention model']));
        const limits = ExposureFakeClient.Notes.filter((n) => n.includes('Visibility limits'));
        expect(limits).toHaveLength(1);
        expect(limits[0]).toContain('Vision board');
        expect(limits[0]).toContain("'pixels' is withheld");
        expect(limits[0]).toContain('zero-data-retention');
        await runtime.EndRealtimeSession();
    });

    it('sends no visibility note when nothing is limited', async () => {
        const runtime = await startSession(policyFor('pixels'));
        expect(ExposureFakeClient.Notes.filter((n) => n.includes('Visibility limits'))).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('takes the minimum with a choice the user saved earlier (persisted per channel key)', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        preferences.Set('Vision', 'state');
        const runtime = await startSession(policyFor('pixels'), preferences);
        expect(runtime.GetChannelExposure('Vision')).toBe('state');
        expect(ExposureFakeClient.Notes.some((n) => n.includes('Visibility limits') && n.includes('the user chose'))).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('a saved user choice can never RAISE what the server allows', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        preferences.Set('Vision', 'pixels');
        const runtime = await startSession(policyFor('state'), preferences);
        expect(runtime.GetChannelExposure('Vision')).toBe('state');
        await runtime.EndRealtimeSession();
    });

    it('SetUserChannelExposure lowers it immediately, tells the model, and remembers the choice', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        const runtime = await startSession(policyFor('pixels'), preferences);
        ExposureFakeClient.Notes.length = 0;
        expect(runtime.SetUserChannelExposure('Vision', 'none')).toBe(true);
        expect(runtime.GetChannelExposure('Vision')).toBe('none');
        expect(preferences.Get('Vision')).toBe('none');
        const note = ExposureFakeClient.Notes.find((n) => n.includes('exposure_changed')) ?? '';
        expect(note).toContain('"exposure":"none"');
        expect(note).toContain('the user chose');
        await runtime.EndRealtimeSession();
    });

    it('clearing the choice restores what policy allows', async () => {
        const runtime = await startSession(policyFor('pixels'));
        runtime.SetUserChannelExposure('Vision', 'none');
        runtime.SetUserChannelExposure('Vision', undefined);
        expect(runtime.GetChannelExposure('Vision')).toBe('pixels');
        await runtime.EndRealtimeSession();
    });

    it('remembers a choice for a channel that is not in this session, and reports that nothing was applied', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        const runtime = await startSession(policyFor('pixels'), preferences);
        expect(runtime.SetUserChannelExposure('Ghost', 'state')).toBe(false);
        expect(preferences.Get('Ghost')).toBe('state');
        expect(runtime.GetChannelExposure('Ghost')).toBeNull();
        await runtime.EndRealtimeSession();
    });
});

describe('RealtimeSessionRuntime — the "agent can see" sources', () => {
    beforeEach(() => {
        ExposureFakeClient.Notes = [];
        ExposureFakeClient.VideoLive = true;
        VisionChannel.Instance = null;
        stubRegistry();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('lists the channel as a video source as soon as the session is up (before it has sent a frame)', async () => {
        const runtime = await startSession(policyFor('pixels'));
        let sources: ReadonlyArray<{ SourceID: string; Label: string; Enabled: boolean; ChannelKey?: string }> = [];
        runtime.VideoSources$.subscribe((s) => (sources = s));
        expect(sources).toMatchObject([{ SourceID: 'Vision#1', Label: 'Vision board', Enabled: true, ChannelKey: 'Vision' }]);
        await runtime.EndRealtimeSession();
    });

    it('lists nothing when the session has no inbound video track', async () => {
        ExposureFakeClient.VideoLive = false;
        const runtime = await startSession(policyFor('pixels'));
        let sources: ReadonlyArray<unknown> = [];
        runtime.VideoSources$.subscribe((s) => (sources = s));
        expect(sources).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('turning a source off lowers the channel to state, persists per channel key, switches the source off and tells the model once', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        const runtime = await startSession(policyFor('pixels'), preferences);
        ExposureFakeClient.Notes.length = 0;
        expect(runtime.SetVideoSourceEnabled('Vision#1', false)).toBe(true);
        expect(runtime.GetChannelExposure('Vision')).toBe('state');
        expect(preferences.Get('Vision')).toBe('state');
        let sources: ReadonlyArray<{ Enabled: boolean }> = [];
        runtime.VideoSources$.subscribe((s) => (sources = s));
        expect(sources[0].Enabled).toBe(false);
        // The channel's own note covers it: the arbiter must not say the same thing a second time.
        expect(ExposureFakeClient.Notes.filter((n) => n.includes('exposure_changed'))).toHaveLength(1);
        expect(ExposureFakeClient.Notes.filter((n) => n.includes('You can no longer see'))).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('turning it back on restores perception and clears the remembered choice', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        const runtime = await startSession(policyFor('pixels'), preferences);
        runtime.SetVideoSourceEnabled('Vision#1', false);
        runtime.SetVideoSourceEnabled('Vision#1', true);
        expect(runtime.GetChannelExposure('Vision')).toBe('pixels');
        expect(preferences.Get('Vision')).toBeUndefined();
        let sources: ReadonlyArray<{ Enabled: boolean }> = [];
        runtime.VideoSources$.subscribe((s) => (sources = s));
        expect(sources[0].Enabled).toBe(true);
        await runtime.EndRealtimeSession();
    });

    it('a source that is not a channel is switched at the arbiter, which tells the model in the second person', async () => {
        const runtime = await startSession(policyFor('pixels'));
        VisionChannel.Instance!.Arbiter().RegisterSource({ SourceID: 'screen-share', Label: 'Screen', Kind: 'screen' });
        ExposureFakeClient.Notes.length = 0;
        expect(runtime.SetVideoSourceEnabled('screen-share', false)).toBe(true);
        expect(runtime.SetVideoSourceEnabled('screen-share', true)).toBe(true);
        expect(ExposureFakeClient.Notes.filter((n) => n.includes('Screen'))).toEqual([
            '[You can no longer see: Screen (the user turned it off)]',
            '[You can now see: Screen (turned back on)]',
        ]);
        await runtime.EndRealtimeSession();
    });

    it('a source the user had already turned off in an earlier call starts switched off but is still listed, so it can be turned back on', async () => {
        const preferences = new InMemoryChannelExposurePreferences();
        preferences.Set('Vision', 'state');
        const runtime = await startSession(policyFor('pixels'), preferences);
        let sources: ReadonlyArray<{ Enabled: boolean }> = [];
        runtime.VideoSources$.subscribe((s) => (sources = s));
        expect(sources).toHaveLength(1);
        expect(sources[0].Enabled).toBe(false);
        runtime.SetVideoSourceEnabled('Vision#1', true);
        expect(runtime.GetChannelExposure('Vision')).toBe('pixels');
        await runtime.EndRealtimeSession();
    });

    it('returns false for an unknown source, and when there is no session', async () => {
        const idle = new RealtimeSessionRuntime(new Host());
        expect(idle.SetVideoSourceEnabled('x', false)).toBe(false);
        const runtime = await startSession(policyFor('pixels'));
        expect(runtime.SetVideoSourceEnabled('nope', false)).toBe(false);
        await runtime.EndRealtimeSession();
    });

    it('clears the list when the session ends', async () => {
        const runtime = await startSession(policyFor('pixels'));
        let sources: ReadonlyArray<unknown> = [{}];
        runtime.VideoSources$.subscribe((s) => (sources = s));
        expect(sources).toHaveLength(1);
        await runtime.EndRealtimeSession();
        expect(sources).toEqual([]);
    });
});

describe('RealtimeSessionRuntime — the surface the user is looking at', () => {
    beforeEach(() => {
        ExposureFakeClient.Notes = [];
        ExposureFakeClient.VideoLive = true;
        VisionChannel.Instance = null;
        stubRegistry();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('when the model can watch one source and two are live, the channel the user is on is the one it sees', async () => {
        const runtime = await startSession(policyFor('pixels'));
        const arbiter = (VisionChannel.Instance as VisionChannel).Arbiter();
        arbiter.RegisterSource({ SourceID: 'Other#1', Label: 'Other board', ChannelKey: 'Other' });
        expect(arbiter.GetActiveSourceIDs()).toEqual(['Other#1']); // newest, nothing focused
        runtime.SetFocusedChannel('Vision');
        expect(arbiter.GetActiveSourceIDs()).toEqual(['Vision#1']);
        runtime.SetFocusedChannel(null);
        expect(arbiter.GetActiveSourceIDs()).toEqual(['Other#1']);
        await runtime.EndRealtimeSession();
    });

    it('a focus set before the session is live applies when it comes up', async () => {
        const runtime = new RealtimeSessionRuntime(new Host());
        runtime.SetFocusedChannel('Vision');
        const provider = new MintProvider();
        provider.Policy = policyFor('pixels');
        runtime.Provider = provider as unknown as IMetadataProvider;
        runtime.SetExposurePreferences(new InMemoryChannelExposurePreferences());
        await runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null);
        const arbiter = (VisionChannel.Instance as VisionChannel).Arbiter();
        arbiter.RegisterSource({ SourceID: 'Other#1', Label: 'Other board', ChannelKey: 'Other' });
        expect(arbiter.GetActiveSourceIDs()).toEqual(['Vision#1']);
        await runtime.EndRealtimeSession();
    });
});
