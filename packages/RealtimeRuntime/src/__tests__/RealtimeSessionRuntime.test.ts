import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, REQUESTED_TRACKS_SESSION_KEY } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type IRealtimeSessionRecorder,
    type StartRealtimeClientSessionResult,
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

describe('session lifecycle, driven end to end with fakes', () => {
    /**
     * A realtime client that connects to nothing.
     *
     * Registered under a provider key so the runtime's real ClassFactory resolution runs — the same
     * lookup a device does — rather than being handed an instance.
     */
    @RegisterClass(BaseRealtimeClient, 'fake-provider')
    class FakeRealtimeClient extends BaseRealtimeClient {
        public static DisconnectCalls = 0;
        public async Connect(): Promise<void> {}
        public SendText(): void {}
        public CancelActiveResponse(): void {}
        public SendContextNote(): void {}
        public RequestSpokenUpdate(): void {}
        public SendToolResult(): void {}
        public SetMuted(): void {}
        public async Disconnect(): Promise<void> {
            FakeRealtimeClient.DisconnectCalls++;
        }
        public get IsBusy(): boolean {
            return false;
        }
        public get IsAudioPlaying(): boolean {
            return false;
        }
    }

    /** A driver whose socket is already gone: Disconnect throws, as a dead WebSocket can. */
    @RegisterClass(BaseRealtimeClient, 'fake-throwing-disconnect')
    class ThrowingDisconnectClient extends FakeRealtimeClient {
        public override async Disconnect(): Promise<void> { throw new Error('socket already gone'); }
    }

    /**
     * Records every GraphQL relay the runtime makes, so teardown can be asserted on.
     *
     * `sessionId` + `PushStatusUpdates` stand in for the transport's delegated-run progress topic —
     * the runtime subscribes to it the moment a session goes live, so a provider without them
     * cannot get a session started at all.
     */
    class RecordingProvider {
        public Mutations: string[] = [];
        public readonly sessionId = 'transport-session-1';
        public async ExecuteGQL(query: string): Promise<unknown> {
            this.Mutations.push(query);
            return {};
        }
        public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
            return { subscribe: () => ({ unsubscribe: () => undefined }) };
        }
    }

    /** A host that also reports whether the runtime handed the microphone back. */
    class ReleasingHost extends FakeMediaHost {
        public ReleaseCalls = 0;
        public async ReleaseMicrophone(): Promise<void> {
            this.ReleaseCalls++;
        }
    }

    function mintedSession(provider: string): StartRealtimeClientSessionResult {
        return {
            AgentSessionId: 'session-1',
            ConversationId: 'conv-1',
            Provider: provider,
            Model: 'model-1',
            EphemeralToken: 'token',
            ExpiresAt: '2030-01-01T00:00:00Z',
            SessionConfigJson: '{}',
            ModelName: 'Fake Realtime',
            NarrationInstructionsTemplate: null,
            PriorChannelStatesJson: null,
        };
    }

    /** Builds a runtime wired to a recording provider, with recording consent off. */
    function build(host: IRealtimeMediaHost) {
        const runtime = new RealtimeSessionRuntime(host);
        const provider = new RecordingProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;
        return { runtime, provider };
    }

    /** The mutation names the runtime sent, for readable assertions. */
    function mutationNames(provider: RecordingProvider): string[] {
        return provider.Mutations.map((m) => m.match(/mutation (\w+)/)?.[1] ?? m.trim().slice(0, 20));
    }

    /**
     * A provider whose `UploadRealtimeRecording` never answers until the test settles it — what the
     * runtime sees when the tab closes while tens of MB of WAV are still on the wire. Every other
     * relay answers at once. `UploadStarted` resolves the moment the upload mutation arrives, so
     * tests never count microtask ticks.
     */
    class StalledUploadProvider extends RecordingProvider {
        private markStarted: () => void = () => undefined;
        public readonly UploadStarted = new Promise<void>((resolve) => { this.markStarted = resolve; });
        private settleUpload: (outcome: { ok: boolean }) => void = () => undefined;
        private readonly upload = new Promise<{ ok: boolean }>((resolve) => { this.settleUpload = resolve; });
        public override async ExecuteGQL(query: string): Promise<unknown> {
            this.Mutations.push(query);
            if (/mutation UploadRealtimeRecording\(/.test(query)) {
                this.markStarted();
                const { ok } = await this.upload; // never settles unless the test calls Finish/Fail
                if (!ok) { throw new Error('network gone'); }
                return { UploadRealtimeRecording: { Success: true, FileID: 'file-1' } };
            }
            return {};
        }
        public FinishUpload(): void { this.settleUpload({ ok: true }); }
        public FailUpload(): void { this.settleUpload({ ok: false }); }
    }

    function buildStalled(host: IRealtimeMediaHost = new FakeMediaHost()) {
        const runtime = new RealtimeSessionRuntime(host);
        const provider = new StalledUploadProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;
        return { runtime, provider };
    }

    it('goes live through real driver resolution, then closes the server session once', async () => {
        const { runtime, provider } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        expect(runtime.IsActive).toBe(true);
        expect(runtime.CurrentAgentSessionId).toBe('session-1');

        await runtime.EndRealtimeSession();
        expect(runtime.IsActive).toBe(false);
        expect(mutationNames(provider).filter((n) => n === 'CloseAgentSession')).toHaveLength(1);
    });

    it('coalesces concurrent teardowns instead of racing into two of everything', async () => {
        // An explicit stop followed by the host unmounting fires this twice. `teardown` flips the
        // active flag last, so without coalescing the second call passes the guard and runs
        // alongside the first: two Disconnects, two CloseAgentSession mutations, two ended events.
        const { runtime, provider } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        FakeRealtimeClient.DisconnectCalls = 0;

        await Promise.all([runtime.EndRealtimeSession(), runtime.EndRealtimeSession()]);

        expect(FakeRealtimeClient.DisconnectCalls).toBe(1);
        expect(mutationNames(provider).filter((n) => n === 'CloseAgentSession')).toHaveLength(1);
    });

    it('hands the microphone back to the host on teardown', async () => {
        // Stopping the tracks is not the same thing: iOS stays in a record-and-play audio category
        // for the rest of the app's life unless something puts it back.
        const host = new ReleasingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        await runtime.EndRealtimeSession();
        expect(host.ReleaseCalls).toBe(1);
    });

    it('releases a start the host abandoned while the microphone was being acquired', async () => {
        // The window is real: tapping back during the ~1-2s mint/permission sequence used to leave
        // a live microphone, a live provider connection and an Active server session behind.
        let releaseMic: (() => void) | null = null;
        class SlowHost extends ReleasingHost {
            public override async AcquireMicrophone(): Promise<MediaStream> {
                await new Promise<void>((resolve) => {
                    releaseMic = resolve;
                });
                return super.AcquireMicrophone();
            }
        }
        const host = new SlowHost();
        const { runtime, provider } = build(host);

        const starting = runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        await runtime.EndRealtimeSession();   // user leaves mid-start
        releaseMic!();                        // the microphone now arrives, for nobody
        await starting;

        expect(runtime.IsActive).toBe(false);
        expect(runtime.CurrentAgentSessionId).toBeNull();
        // Closed exactly once, by whichever half got there — never left Active for the janitor.
        expect(mutationNames(provider).filter((n) => n === 'CloseAgentSession')).toHaveLength(1);
    });

    it('declines an unusable provider through the shared teardown, and says which one', async () => {
        class WebRtcOnly extends RealtimeSessionRuntime {
            protected override hostCanUseProvider(p: string): boolean {
                return p !== 'gemini';
            }
        }
        const runtime = new WebRtcOnly(new FakeMediaHost());
        const provider = new RecordingProvider();
        runtime.Provider = provider as unknown as IMetadataProvider;

        const states: string[] = [];
        runtime.ConnectionState$.subscribe((s) => states.push(s));

        await runtime.StartRealtimeSessionFromResult(mintedSession('gemini'));

        expect(runtime.IsActive).toBe(false);
        expect(states).toContain('error');
        expect(runtime.LastStartError?.message).toContain('gemini');
        // The minted row is durable, so declining still has to close it.
        expect(mutationNames(provider)).toContain('CloseAgentSession');
    });

    it('clears the last start error when a later session starts cleanly', async () => {
        const { runtime } = build(new FakeMediaHost());
        await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'));
        expect(runtime.LastStartError).toBeNull();
        await runtime.EndRealtimeSession();
    });

    describe('a page that dies during the end-of-call upload (#5195)', () => {
        it('closes the server session before the consolidated upload starts', async () => {
            const { runtime, provider } = buildStalled();
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-provider'), { recordingConsent: true });

            void runtime.EndRealtimeSession();
            await provider.UploadStarted;

            const names = mutationNames(provider);
            expect(names).toContain('CloseAgentSession');
            expect(names.indexOf('CloseAgentSession')).toBeLessThan(names.indexOf('UploadRealtimeRecording'));
        });

        it('still closes the session when the driver fails to disconnect', async () => {
            expect(ThrowingDisconnectClient).toBeDefined();
            const { runtime, provider } = build(new FakeMediaHost());
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-throwing-disconnect'), { recordingConsent: true });

            await runtime.EndRealtimeSession();

            expect(mutationNames(provider)).toContain('CloseAgentSession');
            expect(runtime.IsActive).toBe(false);
            expect(runtime.CurrentAgentSessionId).toBeNull();
        });
    });

    describe('recording mixes the agent stream (#5153)', () => {
        const agentStream = { getAudioTracks: () => [{}], getTracks: () => [] } as unknown as MediaStream;

        /** A PCM-playback driver: publishes its playout output during Connect, as Gemini/ElevenLabs/xAI do. */
        @RegisterClass(BaseRealtimeClient, 'fake-pcm-provider')
        class FakePcmClient extends FakeRealtimeClient {
            public override async Connect(): Promise<void> {
                this.publishRemoteMediaStream(agentStream);
            }
        }

        /** A WebRTC driver: the agent track lands after Connect resolves, as OpenAI's does. */
        @RegisterClass(BaseRealtimeClient, 'fake-webrtc-provider')
        class FakeWebRtcClient extends FakeRealtimeClient {
            public static Last: FakeWebRtcClient | null = null;
            public override async Connect(): Promise<void> {
                FakeWebRtcClient.Last = this;
            }
            public LandTrack(stream: MediaStream): void {
                this.publishRemoteMediaStream(stream);
            }
        }

        it('hands a stream published at Connect to the recorder at Start', async () => {
            expect(FakePcmClient).toBeDefined();
            const host = new FakeMediaHost();
            const { runtime } = build(host);
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-pcm-provider'), { recordingConsent: true });

            expect(host.recorder?.Start).toHaveBeenCalledTimes(1);
            expect(host.recorder?.Start.mock.calls[0][1]).toBe(agentStream);
            await runtime.EndRealtimeSession();
        });

        it('attaches a stream that lands after Connect to the recorder already running', async () => {
            const host = new FakeMediaHost();
            const { runtime } = build(host);
            await runtime.StartRealtimeSessionFromResult(mintedSession('fake-webrtc-provider'), { recordingConsent: true });
            expect(host.recorder?.Start.mock.calls[0][1]).toBeNull();

            FakeWebRtcClient.Last?.LandTrack(agentStream);

            expect(host.recorder?.AttachRemoteStream).toHaveBeenCalledWith(agentStream);
            await runtime.EndRealtimeSession();
        });
    });
});

describe('channel registry on a connect-only provider (#4887)', () => {
    // Bracket access reaches the private method with its real return type, no cast needed.
    const fetchChannelDefinitions = (runtime: RealtimeSessionRuntime) => runtime['fetchChannelDefinitions']();

    // A connect-only provider has no entity metadata, so AIEngineBase cannot load — but the embed
    // still needs its channels: without them Whiteboard/Media tools never reach the mint and the
    // agent loses them (seen live on Caliber's widget). The registry is read over GraphQL instead.
    const registryRow = (Name: string, IsActive: boolean) => ({
        Data: JSON.stringify({ ID: `id-${Name}`, Name, ClientPluginClass: `${Name}Channel`, IsActive }),
    });

    it('reads the ACTIVE registry rows over GraphQL, without touching AIEngineBase, when the provider has no entity metadata', async () => {
        const spy = vi.spyOn(AIEngineBase, 'GetProviderInstance');
        const ExecuteGQL = vi.fn().mockResolvedValue({
            RunDynamicView: { Success: true, Results: [registryRow('Whiteboard', true), registryRow('Retired', false)] },
        });
        try {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            runtime.Provider = { Entities: [], ExecuteGQL } as never; // Entities + ExecuteGQL are all it reads

            await expect(fetchChannelDefinitions(runtime)).resolves.toEqual([
                { ID: 'id-Whiteboard', Name: 'Whiteboard', ClientPluginClass: 'WhiteboardChannel' },
            ]);
            expect(ExecuteGQL).toHaveBeenCalledTimes(1);
            expect(ExecuteGQL.mock.calls[0][1]).toMatchObject({ input: { EntityName: 'MJ: AI Agent Channels' } });
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    it('degrades to no channels, with a warning, when the GraphQL registry read fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const ExecuteGQL = vi.fn().mockResolvedValue({ RunDynamicView: { Success: false, ErrorMessage: 'denied', Results: [] } });
        try {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            runtime.Provider = { Entities: [], ExecuteGQL } as never;

            await expect(fetchChannelDefinitions(runtime)).resolves.toEqual([]);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('Channel registry unavailable'), expect.stringContaining('denied'));
        } finally {
            warn.mockRestore();
        }
    });

    it('still consults AIEngineBase when the provider has entity metadata', async () => {
        const spy = vi.spyOn(AIEngineBase, 'GetProviderInstance').mockImplementation(() => {
            throw new Error('engine consulted');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
            runtime.Provider = { Entities: [{}] } as never; // only Entities is read

            await expect(fetchChannelDefinitions(runtime)).resolves.toEqual([]);
            expect(spy).toHaveBeenCalledTimes(1);
        } finally {
            spy.mockRestore();
            warn.mockRestore();
        }
    });
});

describe('BuildClientConfig: the requested-tracks key has one home', () => {
    // The drivers read the hint (Gemini) and strip it before the wire (OpenAI-protocol) through
    // REQUESTED_TRACKS_SESSION_KEY; the writer must use the same constant, or a rename on either
    // side silently breaks track negotiation and re-leaks the hint into OpenAI's session.update.
    const session = (SessionConfigJson: string): StartRealtimeClientSessionResult =>
        ({ AgentSessionId: 's', ConversationId: null, Provider: 'gemini', Model: 'm', EphemeralToken: 't', ExpiresAt: 'x', SessionConfigJson, ModelName: null }) as StartRealtimeClientSessionResult;

    it('writes channel-sourced tracks under REQUESTED_TRACKS_SESSION_KEY, keeping the mint-supplied ones', () => {
        const runtime = new RealtimeSessionRuntime(new FakeMediaHost());
        const video = { Direction: 'Inbound', Modality: 'Video' } as const;
        runtime['_activeChannels$'].next([{ GetSourcedTracks: () => [video] } as never]);
        const minted = { Direction: 'Outbound', Modality: 'Video' };
        const config = runtime.BuildClientConfig(session(JSON.stringify({ [REQUESTED_TRACKS_SESSION_KEY]: [minted] })));
        const tracks = config.SessionConfig?.[REQUESTED_TRACKS_SESSION_KEY] as Array<{ Direction: string; Modality: string }>;
        expect(tracks).toEqual(expect.arrayContaining([expect.objectContaining(video), expect.objectContaining(minted)]));
    });

    it('never spells the key as a string literal in the runtime source', () => {
        const source = readFileSync(fileURLToPath(new URL('../session/RealtimeSessionRuntime.ts', import.meta.url)), 'utf8');
        expect(source.length).toBeGreaterThan(0);
        expect(source).not.toMatch(/['"`]requestedTracks['"`]/);
    });
});
