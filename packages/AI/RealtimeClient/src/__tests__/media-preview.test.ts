import { describe, it, expect } from 'vitest';
import { BehaviorSubject, type Observable } from 'rxjs';
import { MediaPreview, type MediaPreviewOptions } from '../media/mediaPreview';
import type { ILocalMediaController } from '../media/localMediaController';
import type { IRealtimeAudioMeter } from '../audio/audioMeter';
import type { LocalMediaKind, LocalMediaResult, LocalMediaState, LocalTrackState, MediaDevice } from '../media/model';

/** A stand-in for a `MediaStream`: the preview only hands it on. */
const stream = (id: string): MediaStream => ({ id }) as unknown as MediaStream;

const DEVICES: MediaDevice[] = [
    { DeviceID: 'mic-1', Kind: 'microphone', Label: 'Microphone 1', GroupID: 'g1' },
    { DeviceID: 'mic-2', Kind: 'microphone', Label: 'Microphone 2', GroupID: 'g2' },
    { DeviceID: 'cam-1', Kind: 'camera', Label: 'Camera 1', GroupID: 'g1' },
    { DeviceID: 'cam-2', Kind: 'camera', Label: 'Camera 2', GroupID: 'g3' },
];

/** A camera and microphone the test drives. The devices appear on the first listing, as once access is allowed. */
class FakeController implements ILocalMediaController {
    public readonly Calls: string[] = [];
    public readonly Failing = new Set<LocalMediaKind>();
    public Disposed = false;
    public readonly Streams: Record<LocalMediaKind, MediaStream> = { camera: stream('camera'), microphone: stream('microphone') };
    private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });

    public get State(): LocalMediaState {
        return this.state.value;
    }
    public get State$(): Observable<LocalMediaState> {
        return this.state.asObservable();
    }
    public GetStream(kind: LocalMediaKind): MediaStream | null {
        return this.track(kind).Status === 'on' ? this.Streams[kind] : null;
    }
    public async RefreshDevices(): Promise<MediaDevice[]> {
        this.Calls.push('list');
        this.state.next({ ...this.state.value, Devices: DEVICES });
        return DEVICES;
    }
    public async Start(kind: LocalMediaKind, deviceId?: string): Promise<LocalMediaResult> {
        this.Calls.push(`start ${kind} ${deviceId ?? 'default'}`);
        if (this.Failing.has(kind)) {
            this.setTrack(kind, { Status: 'failed', Failure: 'denied', Message: 'Not allowed.' });
            return { Status: 'failed', Reason: 'denied', Message: 'Not allowed.' };
        }
        this.setTrack(kind, { Status: 'on', DeviceID: deviceId ?? `${kind}-default` });
        return { Status: 'started', Stream: this.Streams[kind] };
    }
    public async SwitchDevice(kind: LocalMediaKind, deviceId: string): Promise<LocalMediaResult> {
        this.Calls.push(`switch ${kind} ${deviceId}`);
        this.setTrack(kind, { Status: 'on', DeviceID: deviceId });
        return { Status: 'started', Stream: this.Streams[kind] };
    }
    public Stop(kind: LocalMediaKind): void {
        this.Calls.push(`stop ${kind}`);
        this.setTrack(kind, { Status: 'off' });
    }
    public Dispose(): void {
        this.Disposed = true;
    }
    private track(kind: LocalMediaKind): LocalTrackState {
        return kind === 'camera' ? this.state.value.Camera : this.state.value.Microphone;
    }
    private setTrack(kind: LocalMediaKind, track: LocalTrackState): void {
        this.state.next(kind === 'camera' ? { ...this.state.value, Camera: track } : { ...this.state.value, Microphone: track });
    }
}

/** Meters that record the stream they listen to and whether they were closed. */
function meters() {
    const made: { Stream: MediaStream; Closed: boolean }[] = [];
    const MeterFor = (s: MediaStream): IRealtimeAudioMeter => {
        const meter = { Stream: s, Closed: false };
        made.push(meter);
        return { Level: () => 0.4, Bins: () => [], Close: () => (meter.Closed = true) };
    };
    return { made, MeterFor };
}

/** A started preview on a fake controller. */
async function started(options: Omit<MediaPreviewOptions, 'MeterFor'> = {}) {
    const controller = new FakeController();
    const { made, MeterFor } = meters();
    const preview = new MediaPreview(controller, { ...options, MeterFor });
    await preview.Start();
    return { controller, preview, made };
}

describe('MediaPreview: the camera and microphone in a lobby', () => {
    it('starts the microphone and not the camera, then lists the devices; the choices are the device in use, else the first listed', async () => {
        const { controller, preview } = await started();
        expect(controller.Calls).toEqual(['start microphone default', 'list']);
        expect(preview.State.CameraSource).toBeNull();
        expect(preview.State.Devices).toEqual(DEVICES);
        expect(preview.State.Choices).toEqual({ MicrophoneOn: true, CameraOn: false, MicrophoneDeviceID: 'microphone-default', CameraDeviceID: 'cam-1' });
        expect(preview.ReadMicrophoneLevel()).toBe(0.4);
    });

    it('starts the camera too when asked, as a stream to show', async () => {
        const { controller, preview } = await started({ CameraOn: true });
        expect(preview.State.CameraSource).toEqual({ Kind: 'stream', Stream: controller.Streams.camera });
        expect(preview.State.Choices.CameraOn).toBe(true);
    });

    it('turns the camera on and off', async () => {
        const { controller, preview } = await started();
        await preview.SetCameraOn(true);
        expect(preview.State.CameraSource).toEqual({ Kind: 'stream', Stream: controller.Streams.camera });
        await preview.SetCameraOn(false);
        expect(controller.Calls).toContain('stop camera');
        expect(preview.State.CameraSource).toBeNull();
        expect(preview.State.Choices.CameraOn).toBe(false);
    });

    it('turns the microphone off, closing its meter, and back on with a new one', async () => {
        const { preview, made } = await started();
        await preview.SetMicrophoneOn(false);
        expect(made[0].Closed).toBe(true);
        expect(preview.ReadMicrophoneLevel()).toBe(0);
        expect(preview.State.Choices.MicrophoneOn).toBe(false);
        await preview.SetMicrophoneOn(true);
        expect(made).toHaveLength(2);
        expect(preview.ReadMicrophoneLevel()).toBe(0.4);
    });

    it('moves a live device at once: the microphone gets a new meter, the camera keeps its source', async () => {
        const { controller, preview, made } = await started({ CameraOn: true });
        const source = preview.State.CameraSource;
        await preview.SelectDevice({ Kind: 'microphone', DeviceID: 'mic-2' });
        await preview.SelectDevice({ Kind: 'camera', DeviceID: 'cam-2' });
        expect(controller.Calls).toEqual(expect.arrayContaining(['switch microphone mic-2', 'switch camera cam-2']));
        expect(made.map((m) => m.Closed)).toEqual([true, false]);
        expect(preview.State.CameraSource).toBe(source);
        expect(preview.State.Choices).toMatchObject({ MicrophoneDeviceID: 'mic-2', CameraDeviceID: 'cam-2' });
    });

    it('remembers a device picked for a kind that is off, and starts on it later', async () => {
        const { controller, preview } = await started();
        await preview.SelectDevice({ Kind: 'camera', DeviceID: 'cam-2' });
        expect(controller.Calls).not.toContain('switch camera cam-2');
        expect(preview.State.Choices.CameraDeviceID).toBe('cam-2');
        await preview.SetCameraOn(true);
        expect(controller.Calls).toContain('start camera cam-2');
    });

    it('turns a kind off in the choices when it fails to start, with the reason in its state', async () => {
        const { controller, preview } = await started();
        controller.Failing.add('camera');
        await preview.SetCameraOn(true);
        expect(preview.State.Choices.CameraOn).toBe(false);
        expect(preview.State.Camera).toMatchObject({ Status: 'failed', Failure: 'denied' });
        expect(preview.State.CameraSource).toBeNull();
    });

    it('ignores a speaker', async () => {
        const { controller, preview } = await started();
        const calls = controller.Calls.length;
        await preview.SelectDevice({ Kind: 'speaker', DeviceID: 'speaker-1' });
        expect(controller.Calls).toHaveLength(calls);
    });

    it('releases everything when disposed: the meter, the controller, and its state stream', async () => {
        const { controller, preview, made } = await started({ CameraOn: true });
        let completed = false;
        preview.State$.subscribe({ complete: () => (completed = true) });
        preview.Dispose();
        expect(made[0].Closed).toBe(true);
        expect(controller.Disposed).toBe(true);
        expect(completed).toBe(true);
        expect(preview.ReadMicrophoneLevel()).toBe(0);
    });
});
