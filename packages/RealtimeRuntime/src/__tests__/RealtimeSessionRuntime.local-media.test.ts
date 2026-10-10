import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSubject, type Observable } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeClient,
    type ILocalMediaController,
    type LocalMediaFailure,
    type LocalMediaKind,
    type LocalMediaResult,
    type LocalMediaState,
    type MediaDevice,
} from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import {
    RealtimeSessionRuntime,
    type IRealtimeMediaHost,
    type IRealtimeSessionRecorder,
    type StartRealtimeClientSessionResult,
} from '../index';

/** A microphone track: only what the runtime and this test touch. */
class FakeTrack {
    public enabled = true;
    public Stopped = false;
    public stop(): void {
        this.Stopped = true;
    }
}

/** A stream whose audio track the controller can swap, as the real one does on a device switch. */
class FakeStream {
    public Track: FakeTrack | null = new FakeTrack();
    public getAudioTracks(): FakeTrack[] {
        return this.Track ? [this.Track] : [];
    }
    public getTracks(): FakeTrack[] {
        return this.getAudioTracks();
    }
}

/**
 * A controller whose microphone the test drives: it can hold a start, fail one, and swap the track in its
 * stream. Like the browser's, disposing it fails a start still in flight.
 */
class FakeLocalMediaController implements ILocalMediaController {
    public readonly FakeStream = new FakeStream();
    public readonly Stream = this.FakeStream as unknown as MediaStream;
    public readonly StartCalls: LocalMediaKind[] = [];
    public Disposed = 0;
    /** A failure the next start reports. */
    public NextFailure: { Reason: LocalMediaFailure; Message: string } | null = null;
    /** Completes State$ on Dispose, as the contract says; off simulates a controller that keeps publishing. */
    public CompletesOnDispose = true;
    private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });
    private held: { Release: () => void; Done: Promise<void> } | null = null;

    public get State(): LocalMediaState {
        return this.state.value;
    }
    public get State$(): Observable<LocalMediaState> {
        return this.state.asObservable();
    }
    public GetStream(_kind: LocalMediaKind): MediaStream | null {
        return this.Stream;
    }
    public async RefreshDevices(): Promise<MediaDevice[]> {
        return [];
    }
    public async Start(kind: LocalMediaKind): Promise<LocalMediaResult> {
        this.StartCalls.push(kind);
        await this.held?.Done;
        if (this.Disposed > 0) {
            return { Status: 'failed', Reason: 'error', Message: 'Stopped before the device started.' };
        }
        if (this.NextFailure) {
            return { Status: 'failed', ...this.NextFailure };
        }
        this.publishMicrophone('mic-built-in');
        return { Status: 'started', Stream: this.Stream };
    }
    public async SwitchDevice(kind: LocalMediaKind): Promise<LocalMediaResult> {
        return this.Start(kind);
    }
    public Stop(_kind: LocalMediaKind): void {
        this.state.next({ ...this.state.value, Microphone: { Status: 'off' } });
    }
    public Dispose(): void {
        this.Disposed++;
        this.held?.Release();
        if (this.CompletesOnDispose) {
            this.state.complete();
        }
    }

    /** Makes the next start wait until {@link Dispose} (or the test) releases it. */
    public HoldStart(): void {
        let release: () => void = () => undefined;
        const done = new Promise<void>((resolve) => (release = resolve));
        this.held = { Release: release, Done: done };
    }
    /**
     * A device switch or a lost device, in the browser controller's order: the old track leaves the stream
     * and the kind reports starting, then the new track arrives and the new device is reported.
     */
    public SwapTrack(deviceId: string): FakeTrack {
        this.FakeStream.Track = null;
        this.state.next({ ...this.state.value, Microphone: { Status: 'starting' } });
        const track = new FakeTrack();
        this.FakeStream.Track = track;
        this.publishMicrophone(deviceId);
        return track;
    }
    /** A state change that keeps the same track (a device-list refresh). */
    public Republish(): void {
        this.state.next({ ...this.state.value });
    }

    private publishMicrophone(deviceId: string): void {
        this.state.next({ ...this.state.value, Microphone: { Status: 'on', DeviceID: deviceId } });
    }
}

class FakeRecorder implements IRealtimeSessionRecorder {
    public IsRecording = true;
    public SampleRate = 24000;
    public MimeType = 'audio/wav';
    public Start = vi.fn();
    public AttachRemoteStream = vi.fn();
    public ReplaceMicrophone = vi.fn();
    public NowOffsetMs = (): number => 0;
    public GetPeaks = (): number[] => [];
    public async SnapshotNewSegmentBase64(): Promise<string | null> {
        return null;
    }
    public async StopAndEncode(): Promise<string | null> {
        return null;
    }
}

/** A browser-like host: it offers a controller, so AcquireMicrophone should never be reached. */
class ControllerHost implements IRealtimeMediaHost {
    public AcquireCalls = 0;
    public readonly Controllers: FakeLocalMediaController[] = [];
    public readonly Recorder = new FakeRecorder();
    /** Set up the next controller before the runtime creates it. */
    public Prepare: (controller: FakeLocalMediaController) => void = () => undefined;

    public async AcquireMicrophone(): Promise<MediaStream> {
        this.AcquireCalls++;
        throw new Error('AcquireMicrophone is the path for hosts without a controller');
    }
    public CreateLocalMediaController(): ILocalMediaController {
        const controller = new FakeLocalMediaController();
        this.Prepare(controller);
        this.Controllers.push(controller);
        return controller;
    }
    public CreateRecorder(): IRealtimeSessionRecorder | null {
        return this.Recorder;
    }
}

/** A host without a controller: the path React Native takes. It can fail or hold its acquisition. */
class AcquiringHost implements IRealtimeMediaHost {
    public AcquireCalls = 0;
    /** What the next acquisition rejects with. */
    public Failure: Error | null = null;
    /** When set, the acquisition waits for this promise before resolving or rejecting. */
    public Gate: Promise<void> | null = null;
    public async AcquireMicrophone(): Promise<MediaStream> {
        this.AcquireCalls++;
        await this.Gate;
        if (this.Failure) {
            throw this.Failure;
        }
        return new FakeStream() as unknown as MediaStream;
    }
}

/** A driver that records the stream it connected with and every microphone it was moved to. */
@RegisterClass(BaseRealtimeClient, 'mic-following-provider')
class MicFollowingClient extends BaseRealtimeClient {
    public static Instances: MicFollowingClient[] = [];
    public ConnectedWith: MediaStream | null = null;
    public readonly Replaced: MediaStream[] = [];
    constructor() {
        super();
        MicFollowingClient.Instances.push(this);
    }
    public async Connect(_config: unknown, micStream: MediaStream): Promise<void> {
        this.ConnectedWith = micStream;
    }
    public async ReplaceMicrophone(micStream: MediaStream): Promise<void> {
        this.Replaced.push(micStream);
    }
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
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

/** Records the runtime's GraphQL relays; the delegated-run topic stands in for the transport's. */
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

function mintedSession(id = 'session-1'): StartRealtimeClientSessionResult {
    return {
        AgentSessionId: id,
        ConversationId: 'conv-1',
        Provider: 'mic-following-provider',
        Model: 'model-1',
        EphemeralToken: 'token',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Fake Realtime',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
    };
}

function build(host: IRealtimeMediaHost) {
    const runtime = new RealtimeSessionRuntime(host);
    const provider = new RecordingProvider();
    runtime.Provider = provider as unknown as IMetadataProvider;
    const states: string[] = [];
    runtime.ConnectionState$.subscribe((s) => states.push(s));
    return { runtime, provider, states };
}

const lastClient = (): MicFollowingClient => MicFollowingClient.Instances[MicFollowingClient.Instances.length - 1];

describe('RealtimeSessionRuntime with a host controller for the microphone', () => {
    beforeEach(() => {
        MicFollowingClient.Instances = [];
    });

    it('starts the microphone through the controller and connects with its stream', async () => {
        const host = new ControllerHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());

        const controller = host.Controllers[0];
        expect(controller.StartCalls).toEqual(['microphone']);
        expect(host.AcquireCalls).toBe(0);
        expect(lastClient().ConnectedWith).toBe(controller.Stream);
        await runtime.EndRealtimeSession();
    });

    it('moves the driver and the recorder onto a swapped-in track', async () => {
        const host = new ControllerHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });
        const controller = host.Controllers[0];

        controller.SwapTrack('mic-headset');
        expect(lastClient().Replaced).toEqual([controller.Stream]);
        expect(host.Recorder.ReplaceMicrophone).toHaveBeenCalledWith(controller.Stream);
        await runtime.EndRealtimeSession();
    });

    it('moves nothing when the controller reports a change that keeps the track', async () => {
        const host = new ControllerHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });

        host.Controllers[0].Republish();
        expect(lastClient().Replaced).toEqual([]);
        expect(host.Recorder.ReplaceMicrophone).not.toHaveBeenCalled();
        await runtime.EndRealtimeSession();
    });

    it('disposes the controller at teardown, and a later session never hears from it', async () => {
        const host = new ControllerHost();
        host.Prepare = (controller) => (controller.CompletesOnDispose = false);
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession('session-1'));
        await runtime.EndRealtimeSession();
        const first = host.Controllers[0];
        expect(first.Disposed).toBe(1);

        await runtime.StartRealtimeSessionFromResult(mintedSession('session-2'));
        first.SwapTrack('mic-headset');
        expect(lastClient().Replaced).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it.each<[LocalMediaFailure, string]>([
        ['denied', 'NotAllowedError'],
        ['not-found', 'NotFoundError'],
        ['in-use', 'NotReadableError'],
        ['unsupported', 'NotSupportedError'],
        ['error', 'Error'],
    ])('the controller failing with %s fails the start with %s, named as getUserMedia would', async (reason, name) => {
        const host = new ControllerHost();
        host.Prepare = (controller) => (controller.NextFailure = { Reason: reason, Message: 'The microphone did not start.' });
        const { runtime, states } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());

        expect(runtime.LastStartError?.name).toBe(name);
        expect(runtime.LastStartError?.message).toBe('The microphone did not start.');
        expect(states).toContain('error');
        expect(host.Controllers[0].Disposed).toBe(1);
    });

    it('unwinds quietly when the session is ended while the controller is starting the microphone', async () => {
        const host = new ControllerHost();
        host.Prepare = (controller) => controller.HoldStart();
        const { runtime, provider, states } = build(host);

        const starting = runtime.StartRealtimeSessionFromResult(mintedSession());
        await runtime.EndRealtimeSession();
        await starting;

        expect(runtime.IsActive).toBe(false);
        expect(runtime.LastStartError).toBeNull();
        expect(states).not.toContain('error');
        expect(host.Controllers[0].Disposed).toBeGreaterThan(0);
        expect(provider.Mutations.filter((m) => m.includes('CloseAgentSession'))).toHaveLength(1);
    });

    it("hands the host's microphone back once when the session is ended while the controller is starting it", async () => {
        class ReleasingControllerHost extends ControllerHost {
            public ReleaseCalls = 0;
            public async ReleaseMicrophone(): Promise<void> {
                this.ReleaseCalls++;
            }
        }
        const host = new ReleasingControllerHost();
        host.Prepare = (controller) => controller.HoldStart();
        const { runtime } = build(host);

        const starting = runtime.StartRealtimeSessionFromResult(mintedSession());
        await runtime.EndRealtimeSession();
        await starting;

        expect(host.ReleaseCalls).toBe(1);
    });
});

describe('RealtimeSessionRuntime with a host that has no controller', () => {
    it('acquires the microphone from the host, as before', async () => {
        const host = new AcquiringHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        expect(host.AcquireCalls).toBe(1);
        await runtime.EndRealtimeSession();
    });

    it("fails the start with the host's own error", async () => {
        const host = new AcquiringHost();
        const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
        host.Failure = denied;
        const { runtime, states } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());

        expect(runtime.LastStartError).toBe(denied);
        expect(states).toContain('error');
    });

    it('unwinds quietly when the host rejects after the session was ended', async () => {
        const host = new AcquiringHost();
        let release: () => void = () => undefined;
        host.Gate = new Promise<void>((resolve) => (release = resolve));
        host.Failure = new Error('Permission denied');
        const { runtime, states } = build(host);

        const starting = runtime.StartRealtimeSessionFromResult(mintedSession());
        await runtime.EndRealtimeSession();
        release();
        await starting;

        expect(runtime.LastStartError).toBeNull();
        expect(states).not.toContain('error');
    });
});
