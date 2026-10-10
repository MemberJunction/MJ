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
    REALTIME_MICROPHONE_NONE,
    type IRealtimeMediaHost,
    type IRealtimeSessionRecorder,
    type RealtimeMicrophoneState,
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
 * A controller whose microphone the test drives: it can hold a start, fail one, swap the track in its stream,
 * switch devices as the browser's does, lose the microphone, open one again in a new stream, and list devices.
 * Like the browser's, disposing it fails a start still in flight.
 */
class FakeLocalMediaController implements ILocalMediaController {
    public readonly FakeStream = new FakeStream();
    public readonly Stream = this.FakeStream as unknown as MediaStream;
    public readonly StartCalls: LocalMediaKind[] = [];
    /** The device each start asked for; `undefined` for the default. */
    public readonly StartDevices: Array<string | undefined> = [];
    /** Each device switch asked for: the kind and the device. */
    public readonly SwitchCalls: Array<[LocalMediaKind, string]> = [];
    /**
     * How the next switch ends: on the new device; back on the one in use when the new one cannot open; or with no
     * microphone when the one in use cannot open again either.
     */
    public NextSwitch: 'switched' | 'back' | 'lost' = 'switched';
    public Disposed = 0;
    /** A failure the next start reports. */
    public NextFailure: { Reason: LocalMediaFailure; Message: string } | null = null;
    /** Completes State$ on Dispose, as the contract says; off simulates a controller that keeps publishing. */
    public CompletesOnDispose = true;
    private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });
    private held: { Release: () => void; Done: Promise<void> } | null = null;
    /** The stream of the microphone it has open: the first one, none once it lost or stopped it, then the one it opened again. */
    private live: FakeStream | null = this.FakeStream;

    public get State(): LocalMediaState {
        return this.state.value;
    }
    public get State$(): Observable<LocalMediaState> {
        return this.state.asObservable();
    }
    /** The stream of the microphone it has open now; `null` while it has none. */
    public get LiveStream(): FakeStream | null {
        return this.live;
    }
    public GetStream(_kind: LocalMediaKind): MediaStream | null {
        return this.live as unknown as MediaStream | null;
    }
    public async RefreshDevices(): Promise<MediaDevice[]> {
        return [];
    }
    /**
     * Starts the microphone: the call's first start opens the first stream. With no microphone open (lost or stopped), a
     * start opens a new stream, as the browser's controller does: it reports starting, then the device or why it failed.
     */
    public async Start(kind: LocalMediaKind, deviceId?: string): Promise<LocalMediaResult> {
        this.StartCalls.push(kind);
        this.StartDevices.push(deviceId);
        const reopening = this.live === null;
        if (reopening) {
            this.state.next({ ...this.state.value, Microphone: { Status: 'starting' } });
        }
        await this.held?.Done;
        if (this.Disposed > 0) {
            return { Status: 'failed', Reason: 'error', Message: 'Stopped before the device started.' };
        }
        if (this.NextFailure) {
            const failure = this.NextFailure;
            if (reopening) {
                this.NextFailure = null;
                this.state.next({ ...this.state.value, Microphone: { Status: 'failed', Failure: failure.Reason, Message: failure.Message } });
            }
            return { Status: 'failed', ...failure };
        }
        if (reopening) {
            this.live = new FakeStream();
        }
        this.publishMicrophone(deviceId ?? 'mic-built-in');
        return { Status: 'started', Stream: this.live as unknown as MediaStream };
    }
    /**
     * Switches the microphone as the browser's controller does: the old track leaves the stream and the new one arrives
     * in it. When the new device cannot open, the one in use is opened again, also as a new track; when that fails too,
     * the controller has no microphone left.
     */
    public async SwitchDevice(kind: LocalMediaKind, deviceId: string): Promise<LocalMediaResult> {
        this.SwitchCalls.push([kind, deviceId]);
        const previous = this.state.value.Microphone.DeviceID ?? 'mic-built-in';
        const outcome = this.NextSwitch;
        this.NextSwitch = 'switched';
        await Promise.resolve();
        if (outcome !== 'switched') {
            if (outcome === 'back') {
                this.SwapTrack(previous);
            } else {
                this.LoseMicrophone('in-use');
            }
            return { Status: 'failed', Reason: 'in-use', Message: 'Another application is using the microphone.' };
        }
        this.SwapTrack(deviceId);
        return { Status: 'started', Stream: (this.live ?? this.FakeStream) as unknown as MediaStream };
    }
    /** Stops the microphone as the browser's controller does: its track stops, and the controller has none open. */
    public Stop(kind: LocalMediaKind): void {
        if (kind !== 'microphone') {
            return;
        }
        this.live?.Track?.stop();
        this.live = null;
        this.state.next({ ...this.state.value, Microphone: { Status: 'off' } });
    }
    public Dispose(): void {
        this.Disposed++;
        this.held?.Release();
        if (this.CompletesOnDispose) {
            this.state.complete();
        }
    }

    /** Makes the next start wait until {@link Dispose} or {@link ReleaseStart}. */
    public HoldStart(): void {
        let release: () => void = () => undefined;
        const done = new Promise<void>((resolve) => (release = resolve));
        this.held = { Release: release, Done: done };
    }
    /** Lets a held start go on. */
    public ReleaseStart(): void {
        this.held?.Release();
    }
    /**
     * A device switch or a lost device, in the browser controller's order: the old track leaves the stream
     * and the kind reports starting, then the new track arrives and the new device is reported.
     */
    public SwapTrack(deviceId: string): FakeTrack {
        const stream = this.live ?? this.FakeStream;
        stream.Track = null;
        this.state.next({ ...this.state.value, Microphone: { Status: 'starting' } });
        const track = new FakeTrack();
        stream.Track = track;
        this.publishMicrophone(deviceId);
        return track;
    }
    /**
     * The controller loses the microphone, in the browser controller's order: the track leaves the stream and stops, and
     * the kind reports starting while the controller tries the default; that fails too, so it stops the kind and reports
     * why.
     */
    public LoseMicrophone(reason: LocalMediaFailure): void {
        const stream = this.live;
        stream?.Track?.stop();
        if (stream) {
            stream.Track = null;
        }
        this.state.next({ ...this.state.value, Microphone: { Status: 'starting' } });
        this.live = null;
        this.state.next({ ...this.state.value, Microphone: { Status: 'off' } });
        this.state.next({ ...this.state.value, Microphone: { Status: 'failed', Failure: reason, Message: 'Could not start audio source.' } });
    }
    /** A state change that keeps the same track (a device-list refresh). */
    public Republish(): void {
        this.state.next({ ...this.state.value });
    }
    /** The devices the browser lists from now on, as after the user allows the microphone or plugs one in. */
    public SetDevices(devices: MediaDevice[]): void {
        this.state.next({ ...this.state.value, Devices: devices });
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

/**
 * A driver that records the stream it connected with and every microphone it was moved to. Like a real driver, it
 * mutes the stream it sends: the one it connected with, then the last one it was moved to.
 */
@RegisterClass(BaseRealtimeClient, 'mic-following-provider')
class MicFollowingClient extends BaseRealtimeClient {
    public static Instances: MicFollowingClient[] = [];
    /** When set, every connect waits for it: the window in which the driver is still connecting. */
    public static ConnectGate: Promise<void> | null = null;
    public ConnectedWith: MediaStream | null = null;
    public readonly Replaced: MediaStream[] = [];
    constructor() {
        super();
        MicFollowingClient.Instances.push(this);
    }
    public async Connect(_config: unknown, micStream: MediaStream): Promise<void> {
        await MicFollowingClient.ConnectGate;
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
    public SetMuted(muted: boolean): void {
        const sent = this.Replaced[this.Replaced.length - 1] ?? this.ConnectedWith;
        sent?.getAudioTracks().forEach((track) => (track.enabled = !muted));
    }
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

describe('RealtimeSessionRuntime: the microphone the user can switch to (#5371)', () => {
    const BUILT_IN: MediaDevice = { DeviceID: 'mic-built-in', Kind: 'microphone', Label: 'Built-in Microphone', GroupID: 'laptop' };
    const HEADSET: MediaDevice = { DeviceID: 'mic-headset', Kind: 'microphone', Label: 'USB Headset', GroupID: 'headset' };
    const CAMERA: MediaDevice = { DeviceID: 'cam-built-in', Kind: 'camera', Label: 'Built-in Camera', GroupID: 'laptop' };

    /** A host whose controller lists two microphones and a camera, as the browser does once the call's microphone is open. */
    const listingHost = (): ControllerHost => {
        const host = new ControllerHost();
        host.Prepare = (controller) => controller.SetDevices([BUILT_IN, CAMERA, HEADSET]);
        return host;
    };
    /** Every microphone state the runtime publishes from now on, starting with the current one. */
    const watch = (runtime: RealtimeSessionRuntime): RealtimeMicrophoneState[] => {
        const seen: RealtimeMicrophoneState[] = [];
        runtime.Microphone$.subscribe((microphone) => seen.push(microphone));
        return seen;
    };
    const current = (runtime: RealtimeSessionRuntime): RealtimeMicrophoneState => watch(runtime)[0];
    /** Lets a start run as far as it can: past the mint and the microphone, up to a connect that waits. */
    const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
        MicFollowingClient.Instances = [];
        MicFollowingClient.ConnectGate = null;
    });

    it('offers no microphone outside a call', () => {
        const { runtime } = build(listingHost());
        expect(current(runtime)).toBe(REALTIME_MICROPHONE_NONE);
    });

    it('lists the microphones and the one in use once the call is connected, and none while the driver is still connecting', async () => {
        const host = listingHost();
        const { runtime } = build(host);
        const seen = watch(runtime);
        let connect: () => void = () => undefined;
        MicFollowingClient.ConnectGate = new Promise<void>((resolve) => (connect = resolve));

        const starting = runtime.StartRealtimeSessionFromResult(mintedSession());
        await settle();
        expect(host.Controllers[0].StartCalls).toEqual(['microphone']);
        expect(lastClient().ConnectedWith).toBeNull();
        expect(await runtime.SwitchMicrophone('mic-headset')).toBe(REALTIME_MICROPHONE_NONE);
        expect(host.Controllers[0].SwitchCalls).toEqual([]);
        expect(seen).toEqual([REALTIME_MICROPHONE_NONE]);

        connect();
        await starting;
        expect(seen).toEqual([REALTIME_MICROPHONE_NONE, { DeviceID: 'mic-built-in', Devices: [BUILT_IN, HEADSET] }]);
        await runtime.EndRealtimeSession();
    });

    it('follows the list as microphones come and go, and says nothing when only the cameras change', async () => {
        const host = listingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        const seen = watch(runtime);
        const controller = host.Controllers[0];

        controller.SetDevices([BUILT_IN, CAMERA]);
        controller.SetDevices([BUILT_IN, CAMERA, { ...CAMERA, DeviceID: 'cam-desk', Label: 'Desk Camera', GroupID: 'desk' }]);
        controller.Republish();

        expect(seen).toEqual([
            { DeviceID: 'mic-built-in', Devices: [BUILT_IN, HEADSET] },
            { DeviceID: 'mic-built-in', Devices: [BUILT_IN] },
        ]);
        await runtime.EndRealtimeSession();
    });

    it('moves the call to the picked microphone: the driver and the recording follow it, and the call names it once it is on', async () => {
        const host = listingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });
        const seen = watch(runtime);
        const controller = host.Controllers[0];

        const switched = await runtime.SwitchMicrophone('mic-headset');

        expect(controller.SwitchCalls).toEqual([['microphone', 'mic-headset']]);
        expect(lastClient().Replaced).toEqual([controller.Stream]);
        expect(host.Recorder.ReplaceMicrophone).toHaveBeenCalledWith(controller.Stream);
        expect(switched).toEqual({ DeviceID: 'mic-headset', Devices: [BUILT_IN, HEADSET] });
        // Mid-switch the controller has no microphone on; the call kept naming the one in use until the new one was on.
        expect(seen.map((microphone) => microphone.DeviceID)).toEqual(['mic-built-in', 'mic-headset']);
        await runtime.EndRealtimeSession();
    });

    it('stays on the microphone in use when the picked one cannot open, and the driver follows its reopened track', async () => {
        const host = listingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        const seen = watch(runtime);
        const controller = host.Controllers[0];
        controller.NextSwitch = 'back';

        const switched = await runtime.SwitchMicrophone('mic-headset');

        expect(switched.DeviceID).toBe('mic-built-in');
        expect(seen.map((microphone) => microphone.DeviceID)).toEqual(['mic-built-in']);
        expect(lastClient().Replaced).toEqual([controller.Stream]);
        await runtime.EndRealtimeSession();
    });

    it('names no microphone while the call has none open, and a pick then opens one instead of switching (#5406)', async () => {
        const host = listingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        const controller = host.Controllers[0];

        controller.Stop('microphone');
        expect(current(runtime)).toEqual({ Devices: [BUILT_IN, HEADSET] });
        expect(await runtime.SwitchMicrophone('mic-headset')).toEqual({ DeviceID: 'mic-headset', Devices: [BUILT_IN, HEADSET] });
        expect(controller.SwitchCalls).toEqual([]);
        expect(controller.StartDevices).toEqual([undefined, 'mic-headset']);
        expect(lastClient().Replaced).toHaveLength(1);
        expect(lastClient().Replaced[0]).toBe(controller.LiveStream);
        await runtime.EndRealtimeSession();
    });

    it('switches nothing outside a call or on a host without a controller', async () => {
        const { runtime } = build(listingHost());
        expect(await runtime.SwitchMicrophone('mic-headset')).toBe(REALTIME_MICROPHONE_NONE);

        const plain = build(new AcquiringHost()).runtime;
        await plain.StartRealtimeSessionFromResult(mintedSession());
        expect(current(plain)).toBe(REALTIME_MICROPHONE_NONE);
        expect(await plain.SwitchMicrophone('mic-headset')).toBe(REALTIME_MICROPHONE_NONE);
        await plain.EndRealtimeSession();
    });

    it('offers no microphone once the call ends, and the next call lists its own', async () => {
        const host = listingHost();
        const { runtime } = build(host);
        await runtime.StartRealtimeSessionFromResult(mintedSession('session-1'));
        await runtime.EndRealtimeSession();
        expect(current(runtime)).toBe(REALTIME_MICROPHONE_NONE);
        expect(await runtime.SwitchMicrophone('mic-headset')).toBe(REALTIME_MICROPHONE_NONE);
        expect(host.Controllers[0].SwitchCalls).toEqual([]);

        host.Prepare = (controller) => controller.SetDevices([HEADSET]);
        await runtime.StartRealtimeSessionFromResult(mintedSession('session-2'));
        expect(current(runtime)).toEqual({ DeviceID: 'mic-built-in', Devices: [HEADSET] });
        await runtime.EndRealtimeSession();
    });

    describe('a microphone the call lost (#5406)', () => {
        /** A connected call that records, and its controller. */
        const call = async () => {
            const host = listingHost();
            const { runtime } = build(host);
            await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });
            return { host, runtime, controller: host.Controllers[0] };
        };

        it('says no microphone works when the switch and the fallback both fail, and moves the driver nowhere', async () => {
            const { host, runtime, controller } = await call();
            controller.NextSwitch = 'lost';

            const switched = await runtime.SwitchMicrophone('mic-headset');

            expect(switched).toEqual({ Devices: [BUILT_IN, HEADSET], Failure: 'in-use' });
            expect(current(runtime)).toEqual(switched);
            expect(lastClient().Replaced).toEqual([]);
            expect(host.Recorder.ReplaceMicrophone).not.toHaveBeenCalled();
            await runtime.EndRealtimeSession();
        });

        it('says no microphone works when the last one goes away', async () => {
            const { runtime, controller } = await call();

            controller.LoseMicrophone('not-found');
            controller.SetDevices([CAMERA]);

            expect(current(runtime)).toEqual({ Devices: [], Failure: 'not-found' });
            await runtime.EndRealtimeSession();
        });

        it('opens the picked microphone again: the driver and the recording move to it, and the call names it and no longer says none works', async () => {
            const { host, runtime, controller } = await call();
            controller.LoseMicrophone('not-found');

            const switched = await runtime.SwitchMicrophone('mic-headset');

            const reopened = controller.LiveStream;
            expect(reopened).not.toBeNull();
            expect(reopened).not.toBe(controller.FakeStream);
            expect(controller.StartDevices).toEqual([undefined, 'mic-headset']);
            expect(controller.SwitchCalls).toEqual([]);
            expect(lastClient().Replaced).toHaveLength(1);
            expect(lastClient().Replaced[0]).toBe(reopened);
            expect(host.Recorder.ReplaceMicrophone).toHaveBeenCalledTimes(1);
            expect(host.Recorder.ReplaceMicrophone.mock.calls[0][0]).toBe(reopened);
            expect(switched).toEqual({ DeviceID: 'mic-headset', Devices: [BUILT_IN, HEADSET] });
            expect(current(runtime)).toEqual(switched);

            // The reopened microphone is the call's now: unmuted as the call was, muted by the mute button, stopped at the end.
            const track = reopened?.Track;
            expect(track?.enabled).toBe(true);
            expect(runtime.ToggleMute()).toBe(true);
            expect(track?.enabled).toBe(false);
            await runtime.EndRealtimeSession();
            expect(track?.Stopped).toBe(true);
        });

        it('keeps saying no microphone works while the picked one opens, and after, when it cannot open', async () => {
            const { runtime, controller } = await call();
            controller.LoseMicrophone('not-found');
            controller.HoldStart();
            controller.NextFailure = { Reason: 'in-use', Message: 'Another application is using the microphone.' };

            const picking = runtime.SwitchMicrophone('mic-headset');
            expect(current(runtime)).toEqual({ Devices: [BUILT_IN, HEADSET], Failure: 'not-found' });
            controller.ReleaseStart();

            expect(await picking).toEqual({ Devices: [BUILT_IN, HEADSET], Failure: 'in-use' });
            expect(lastClient().Replaced).toEqual([]);
            await runtime.EndRealtimeSession();
        });

        it('keeps the mute: the mute button changes nothing while no microphone is open, and a muted call opens its next microphone muted', async () => {
            const { runtime, controller } = await call();
            expect(runtime.ToggleMute()).toBe(true);
            controller.LoseMicrophone('not-found');

            expect(runtime.ToggleMute()).toBe(true);
            await runtime.SwitchMicrophone('mic-headset');
            const track = controller.LiveStream?.Track;
            expect(track?.enabled).toBe(false);
            expect(runtime.ToggleMute()).toBe(false);
            expect(track?.enabled).toBe(true);
            await runtime.EndRealtimeSession();
        });
    });
});
