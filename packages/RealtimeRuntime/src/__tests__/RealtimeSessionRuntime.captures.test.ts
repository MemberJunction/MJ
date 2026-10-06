import { describe, it, expect, vi, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient, type VideoSourceState } from '@memberjunction/ai-realtime-client';
import type { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    REALTIME_CHANNEL_CONTRACT_VERSION,
    type RealtimeChannelDescriptor,
    type RealtimeChannelDisplayPolicy,
    type RealtimeSessionClientPolicy,
    type ResolvedRealtimeChannel,
} from '@memberjunction/ai-core-plus';
import {
    BaseRealtimeChannelClient,
    RealtimeSessionRuntime,
    REALTIME_CAPTURES_OFF,
    type RealtimeCaptureKind,
    type RealtimeCaptureStates,
    type StartRealtimeClientSessionResult,
} from '../index';
import { ShareHost, VideoClient } from './capture-test-helpers';

/** A video model's driver: it negotiates audio and inbound video when it connects. */
@RegisterClass(BaseRealtimeClient, 'capture-provider')
class CaptureProviderClient extends VideoClient {
    public override async Connect(_config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
        this.Negotiate(true);
    }
}

/** A channel that fronts a capture, as the Camera and Screen Share channels do. */
class CaptureChannel extends BaseRealtimeChannelClient {
    public Opened = 0;
    constructor(
        private readonly key: string,
        private readonly kind: RealtimeCaptureKind,
        private readonly display: RealtimeChannelDisplayPolicy = 'on-demand'
    ) {
        super();
    }
    public get ChannelName(): string {
        return this.key;
    }
    public override get CaptureKind(): RealtimeCaptureKind {
        return this.kind;
    }
    public override GetDescriptor(): RealtimeChannelDescriptor {
        return {
            Key: this.key,
            Version: REALTIME_CHANNEL_CONTRACT_VERSION,
            DisplayName: this.key,
            Instructions: `Shows the agent the user's ${this.kind}.`,
            Nouns: [],
            Verbs: [],
            DisplayPolicy: this.display,
            DefaultAvailability: 'opt-in',
            MaxExposure: 'pixels',
        };
    }
    protected override OnOpen(): void {
        this.Opened++;
    }
}

/** Answers the mint with the capture provider and, when set, a server policy. */
class MintProvider {
    public readonly sessionId = 'transport-session-1';
    public readonly Entities: unknown[] = [];
    public Policy: RealtimeSessionClientPolicy | null = null;
    public async ExecuteGQL(query: string): Promise<unknown> {
        if (!query.includes('mutation StartRealtimeClientSession')) {
            return {};
        }
        const result: StartRealtimeClientSessionResult = {
            AgentSessionId: 'session-1',
            ConversationId: 'conv-1',
            Provider: 'capture-provider',
            Model: 'video-model',
            EphemeralToken: 'token',
            ExpiresAt: '2030-01-01T00:00:00Z',
            SessionConfigJson: '{}',
            ModelName: 'Video Model',
            NarrationInstructionsTemplate: null,
            PriorChannelStatesJson: null,
        };
        if (this.Policy && query.includes('ClientPolicyJson')) {
            result.ClientPolicyJson = JSON.stringify(this.Policy);
        }
        return { StartRealtimeClientSession: result };
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
}

/** The server's resolved entry for a capture channel. */
function resolved(key: string, overrides: Partial<ResolvedRealtimeChannel> = {}): ResolvedRealtimeChannel {
    return { Key: key, DisplayPolicy: 'on-demand', MaxExposure: 'pixels', Exposure: 'pixels', Source: 'host', ...overrides };
}

function build(channels: CaptureChannel[] = []) {
    const host = new ShareHost();
    const runtime = new RealtimeSessionRuntime(host);
    const provider = new MintProvider();
    runtime.Provider = provider as unknown as IMetadataProvider;
    const captures: RealtimeCaptureStates[] = [];
    runtime.Captures$.subscribe((c) => captures.push(c));
    let sources: readonly VideoSourceState[] = [];
    runtime.VideoSources$.subscribe((s) => (sources = s));
    const used: string[] = [];
    runtime.ChannelActivity$.subscribe((c) => used.push(c.ChannelName));
    const start = () =>
        runtime.StartRealtimeSession('agent-1', null, null, 'Sage', null, null, null, null, false, null, null, null, {
            HostChannels: channels.map((channel) => ({ Create: () => channel })),
        });
    return { host, runtime, provider, captures, used, start, sources: () => sources };
}

describe('RealtimeSessionRuntime camera and screen share', () => {
    afterEach(() => vi.restoreAllMocks());

    it('has neither outside a session, and says so when asked to start one', async () => {
        const { runtime, captures } = build();
        expect(captures).toEqual([REALTIME_CAPTURES_OFF]);
        expect(await runtime.StartCamera()).toEqual({ Status: 'failed', Failure: 'no-session', Message: 'There is no call to share with.' });
        expect(await runtime.StartScreenShare()).toMatchObject({ Status: 'failed', Failure: 'no-session' });
    });

    it('starts the camera through the host controller and lists it as its channel\'s source', async () => {
        const camera = new CaptureChannel('Camera', 'camera');
        const { host, runtime, captures, start, sources } = build([camera]);
        await start();
        const controller = host.Controllers[0];
        const state = await runtime.StartCamera('cam-1');
        expect(state).toEqual({ Status: 'on', Stream: controller.CameraStream });
        expect(captures[captures.length - 1].Camera.Status).toBe('on');
        expect(controller.StartCalls).toContainEqual(['camera', 'cam-1']);
        expect(sources().map((s) => ({ SourceID: s.SourceID, ChannelKey: s.ChannelKey, Enabled: s.Enabled }))).toEqual([
            { SourceID: 'capture:camera', ChannelKey: 'Camera', Enabled: true },
        ]);
        await runtime.EndRealtimeSession();
    });

    it('shares a screen through the host, and stops it on request', async () => {
        const { host, runtime, captures, start } = build([new CaptureChannel('ScreenShare', 'screen')]);
        await start();
        expect(await runtime.StartScreenShare({ PreferredSurface: 'tab' })).toMatchObject({ Status: 'on', Surface: 'window' });
        expect(host.Requests).toEqual([{ PreferredSurface: 'tab' }]);
        runtime.StopScreenShare();
        expect(captures[captures.length - 1].Screen).toEqual({ Status: 'off' });
        await runtime.EndRealtimeSession();
    });

    it('stops both when the session ends, before releasing the controller', async () => {
        const { host, runtime, captures, start, sources } = build([new CaptureChannel('Camera', 'camera'), new CaptureChannel('ScreenShare', 'screen')]);
        await start();
        await runtime.StartCamera();
        await runtime.StartScreenShare();
        const controller = host.Controllers[0];
        await runtime.EndRealtimeSession();
        expect(captures[captures.length - 1]).toEqual(REALTIME_CAPTURES_OFF);
        expect(controller.StopCalls).toContain('camera');
        expect(controller.Disposed).toBe(true);
        expect(sources()).toEqual([]);
        expect(await runtime.StartCamera()).toMatchObject({ Failure: 'no-session' });
    });

    describe("the capture's channel", () => {
        it('refuses a capture whose channel is not in the call, before asking for the camera or a screen', async () => {
            const { host, runtime, start } = build();
            await start();
            expect(await runtime.StartCamera()).toEqual({ Status: 'failed', Failure: 'policy', Message: 'The camera is not part of this call.' });
            expect(await runtime.StartScreenShare()).toEqual({ Status: 'failed', Failure: 'policy', Message: 'Screen sharing is not part of this call.' });
            expect(host.Controllers[0].StartCalls.filter(([kind]) => kind === 'camera')).toEqual([]);
            expect(host.Requests).toEqual([]);
            await runtime.EndRealtimeSession();
        });

        it('opens an on-demand channel when its capture starts, so its surface shows, and once only', async () => {
            const camera = new CaptureChannel('Camera', 'camera');
            const { runtime, used, start } = build([camera]);
            await start();
            expect(runtime.AdvertisedChannels).toEqual([camera]);
            await runtime.StartCamera();
            expect(runtime.ActiveChannels).toEqual([camera]);
            expect(camera.Opened).toBe(1);
            expect(used).toEqual(['Camera']);
            await runtime.StartCamera();
            expect(camera.Opened).toBe(1);
            await runtime.EndRealtimeSession();
        });

        it('counts an open channel as used when its capture starts', async () => {
            const screen = new CaptureChannel('ScreenShare', 'screen', 'open-on-start');
            const { runtime, used, start } = build([screen]);
            await start();
            expect(runtime.ActiveChannels).toEqual([screen]);
            await runtime.StartScreenShare();
            expect(used).toEqual(['ScreenShare']);
            await runtime.EndRealtimeSession();
        });

        it("refuses a capture the server's policy keeps from the agent, with its reason, and leaves its channel closed", async () => {
            const camera = new CaptureChannel('Camera', 'camera');
            const { host, runtime, provider, used, start } = build([camera]);
            provider.Policy = {
                Version: 1,
                Channels: [
                    resolved('Camera', {
                        Exposure: 'state',
                        ExposureLimits: [{ Source: 'zero-data-retention', Level: 'state', Reason: 'the model for this session does not declare zero data retention' }],
                    }),
                ],
            };
            await start();
            expect(await runtime.StartCamera()).toEqual({
                Status: 'failed',
                Failure: 'policy',
                Message: 'This call cannot show the agent your camera: the model for this session does not declare zero data retention.',
            });
            expect(host.Controllers[0].StartCalls.filter(([kind]) => kind === 'camera')).toEqual([]);
            expect(runtime.AdvertisedChannels).toEqual([camera]);
            expect(camera.Opened).toBe(0);
            expect(used).toEqual([]);
            await runtime.EndRealtimeSession();
        });

        it("starts the camera when the user has hidden the channel from the agent, but sends no frames until they show it", async () => {
            const { runtime, start, sources } = build([new CaptureChannel('Camera', 'camera')]);
            await start();
            runtime.SetUserChannelExposure('Camera', 'state');
            expect(await runtime.StartCamera()).toMatchObject({ Status: 'on' });
            expect(sources()[0]).toMatchObject({ SourceID: 'capture:camera', Enabled: false });
            expect(runtime.SetVideoSourceEnabled('capture:camera', true)).toBe(true);
            expect(sources()[0].Enabled).toBe(true);
            expect(runtime.GetChannelExposure('Camera')).toBe('pixels');
            await runtime.EndRealtimeSession();
        });

        it("hides a running capture from the agent when the user lowers its channel's exposure, and keeps it running", async () => {
            const { runtime, start, sources, captures } = build([new CaptureChannel('Camera', 'camera')]);
            await start();
            await runtime.StartCamera();
            runtime.SetUserChannelExposure('Camera', 'state');
            expect(sources()[0].Enabled).toBe(false);
            expect(captures[captures.length - 1].Camera.Status).toBe('on');
            runtime.SetUserChannelExposure('Camera', undefined);
            expect(sources()[0].Enabled).toBe(true);
            await runtime.EndRealtimeSession();
        });
    });
});
