/**
 * Fakes for the camera and screen-share tests: a client that negotiates the tracks a test gives it, a
 * camera-and-microphone controller the test drives, a share the test can end as the browser would, and a host that
 * offers both. No DOM, no devices.
 */
import { BehaviorSubject, type Observable } from 'rxjs';
import { DEFAULT_REALTIME_AUDIO_TRACKS, type ClientRealtimeSessionConfig, type RealtimeTrackDescriptor } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    type DisplayCapture,
    type DisplayCaptureOptions,
    type DisplayCaptureResult,
    type ILocalMediaController,
    type LocalMediaFailure,
    type LocalMediaKind,
    type LocalMediaResult,
    type LocalMediaState,
    type MediaDevice,
} from '@memberjunction/ai-realtime-client';
import type { IRealtimeMediaHost } from '../hosts/IRealtimeMediaHost';

/** A stream the captures only pass around. */
export const stream = (name: string): MediaStream =>
    ({ id: name, getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] }) as unknown as MediaStream;

/** A client that negotiates the tracks a test gives it and records the frames and notes it is sent. */
export class VideoClient extends BaseRealtimeClient {
    public readonly Frames: string[] = [];
    public readonly Notes: string[] = [];
    /** Negotiates audio plus, when the model takes video, inbound video at `rate`. */
    public Negotiate(takesVideo: boolean, requested: RealtimeTrackDescriptor[] = [], rate = 2): void {
        const supported: RealtimeTrackDescriptor[] = [...DEFAULT_REALTIME_AUDIO_TRACKS];
        if (takesVideo) {
            supported.push({ Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: rate });
        }
        this.negotiateTracks(requested, supported, takesVideo ? 1 : 0);
    }
    public override SendVideoFrame(base64Image: string): boolean {
        if (!this.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        this.Frames.push(base64Image);
        return true;
    }
    public async Connect(_config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {}
    public SendText(): void {}
    public SendContextNote(text: string): void {
        this.Notes.push(text);
    }
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public CancelActiveResponse(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

/** A controller whose camera the test drives. */
export class FakeController implements ILocalMediaController {
    public readonly StartCalls: Array<[LocalMediaKind, string | undefined]> = [];
    public readonly StopCalls: LocalMediaKind[] = [];
    /** The cameras each camera switch asked for. */
    public readonly SwitchCalls: string[] = [];
    /** How the next camera switch ends: on the new camera, back on the one in use, or with no camera. */
    public NextSwitch: 'switched' | 'back' | 'lost' = 'switched';
    public NextFailure: { Reason: LocalMediaFailure; Message: string } | null = null;
    public readonly CameraStream = stream('camera');
    public readonly MicrophoneStream = stream('microphone');
    public Disposed = false;
    private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'on' }, Devices: [] });
    private held: Promise<void> | null = null;
    private release: () => void = () => undefined;

    public get State(): LocalMediaState {
        return this.state.value;
    }
    public get State$(): Observable<LocalMediaState> {
        return this.state.asObservable();
    }
    public GetStream(): MediaStream | null {
        return this.CameraStream;
    }
    public async RefreshDevices(): Promise<MediaDevice[]> {
        return [];
    }
    public async Start(kind: LocalMediaKind, deviceId?: string): Promise<LocalMediaResult> {
        this.StartCalls.push([kind, deviceId]);
        if (kind === 'microphone') {
            this.state.next({ ...this.state.value, Microphone: { Status: 'on', DeviceID: 'mic' } });
            return { Status: 'started', Stream: this.MicrophoneStream };
        }
        await this.held;
        if (this.NextFailure) {
            return { Status: 'failed', ...this.NextFailure };
        }
        this.state.next({ ...this.state.value, Camera: { Status: 'on', DeviceID: deviceId ?? 'default' } });
        return { Status: 'started', Stream: this.CameraStream };
    }
    /** Switches the camera as the real controller does: starting, then the new camera, the old one, or none. */
    public async SwitchDevice(kind: LocalMediaKind, deviceId: string): Promise<LocalMediaResult> {
        if (kind !== 'camera') {
            return this.Start(kind, deviceId);
        }
        this.SwitchCalls.push(deviceId);
        const previous = this.state.value.Camera;
        const outcome = this.NextSwitch;
        this.NextSwitch = 'switched';
        this.state.next({ ...this.state.value, Camera: { Status: 'starting' } });
        if (outcome === 'switched') {
            this.state.next({ ...this.state.value, Camera: { Status: 'on', DeviceID: deviceId } });
            return { Status: 'started', Stream: this.CameraStream };
        }
        this.state.next({ ...this.state.value, Camera: outcome === 'back' ? previous : { Status: 'off' } });
        return { Status: 'failed', Reason: 'in-use', Message: 'Another application is using the camera.' };
    }
    public Stop(kind: LocalMediaKind): void {
        this.StopCalls.push(kind);
        this.state.next(kind === 'camera' ? { ...this.state.value, Camera: { Status: 'off' } } : { ...this.state.value, Microphone: { Status: 'off' } });
    }
    public Dispose(): void {
        this.Disposed = true;
    }
    /** Makes the next start wait until {@link Release} is called. */
    public HoldStart(): void {
        this.held = new Promise<void>((resolve) => (this.release = resolve));
    }
    public Release(): void {
        this.release();
    }
    /** The devices the browser lists from now on, as after a device is plugged in or the user allows the camera. */
    public SetDevices(devices: MediaDevice[]): void {
        this.state.next({ ...this.state.value, Devices: devices });
    }
    /** The camera goes away, as when it is unplugged. */
    public LoseCamera(): void {
        this.state.next({ ...this.state.value, Camera: { Status: 'off' } });
    }
}

/** A share the test can end as the browser's own bar would; a panel share when it is given the panel's name. */
export class FakeShare implements DisplayCapture {
    public readonly Stream = stream('screen');
    public readonly Track = {} as MediaStreamTrack;
    public readonly Label = 'Quarterly report';
    public Stopped = false;
    private readonly handlers = new Set<() => void>();
    constructor(
        public readonly Surface: DisplayCapture['Surface'],
        public readonly PanelLabel?: string
    ) {}
    public OnEnded(handler: () => void): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    public Stop(): void {
        this.Stopped = true;
    }
    /** The user pressed the browser's "Stop sharing". */
    public EndFromBrowser(): void {
        this.Stopped = true;
        [...this.handlers].forEach((h) => h());
    }
}

/** A host that can share a screen and open a camera; the test sets what the picker returns. */
export class ShareHost implements IRealtimeMediaHost {
    public readonly Requests: Array<DisplayCaptureOptions | undefined> = [];
    public readonly Controllers: FakeController[] = [];
    public Next: DisplayCaptureResult = { Status: 'started', Capture: new FakeShare('window') };
    public async AcquireMicrophone(): Promise<MediaStream> {
        return stream('mic');
    }
    public CreateLocalMediaController(): ILocalMediaController {
        const controller = new FakeController();
        this.Controllers.push(controller);
        return controller;
    }
    public async RequestDisplayCapture(options?: DisplayCaptureOptions): Promise<DisplayCaptureResult> {
        this.Requests.push(options);
        return this.Next;
    }
}
