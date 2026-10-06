/**
 * @fileoverview LOCAL MEDIA CONTROLLER: the user's camera and microphone. It lists devices, starts and stops
 * each kind, moves a live kind to another device, follows device changes, and reports all of it through
 * {@link LocalMediaController.State$}.
 *
 * - **It never starts on its own.** Every capture begins with an explicit {@link LocalMediaController.Start}.
 *   Whether frames or audio reach the model is decided where they are sent (the runtime, after the camera
 *   check), not here.
 * - **A device switch keeps the stream.** The new track replaces the old one inside the `MediaStream` that
 *   {@link LocalMediaController.GetStream} handed out, so a `<video>` self-view or a `FrameSampler` keeps
 *   working. Consumers bound to a track rather than a stream (a Web Audio source node, a WebRTC sender) must
 *   rebind when `State$` reports the new device; a realtime client does it in `ReplaceMicrophone`. The new
 *   track keeps the old one's `enabled` flag, so a muted microphone stays muted. The current device is
 *   released before the new one opens, because mobile browsers open one camera at a time; if the new one
 *   fails, the previous one is reopened.
 * - **A lost device falls back to the default.** When the device in use goes away (unplugged, Bluetooth
 *   dropped), the kind restarts on the system default device. Only when none is left does it report `failed`.
 * - **Capture runs at the device's native frame rate**; pace what the model receives with a `FrameSampler`.
 *
 * Screen sharing is `RequestDisplayCapture`'s job, not this controller's.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import { BehaviorSubject, type Observable } from 'rxjs';
import type { LocalMediaFailure, LocalMediaKind, LocalMediaResult, LocalMediaState, LocalTrackState, MediaDevice } from './model';

export interface LocalMediaControllerOptions {
    /** Camera constraints other than the device. Defaults to 1280×720 (ideal) at the camera's native frame rate. */
    CameraConstraints?: MediaTrackConstraints;
    /** Microphone constraints other than the device. Defaults to echo cancellation, noise suppression and auto gain. */
    MicrophoneConstraints?: MediaTrackConstraints;
}

const DEFAULT_CAMERA_CONSTRAINTS: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
const DEFAULT_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const OFF: LocalTrackState = { Status: 'off' };

/** One request to the browser: the stream and track it opened, or why it failed. */
type Acquired = { Status: 'started'; Stream: MediaStream; Track: MediaStreamTrack } | Extract<LocalMediaResult, { Status: 'failed' }>;

/** A live capture: its stream (kept across device switches) and the track now in it. */
interface LiveCapture {
    Stream: MediaStream;
    Track: MediaStreamTrack;
    /** Removes this capture's `ended` listener from its track. */
    Unwatch: () => void;
}

/** The camera and microphone of one browser session. */
export class LocalMediaController {
    private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: OFF, Microphone: OFF, Devices: [] });
    private readonly live: Record<LocalMediaKind, LiveCapture | null> = { camera: null, microphone: null };
    private readonly pending: Record<LocalMediaKind, Promise<LocalMediaResult> | null> = { camera: null, microphone: null };
    /** Bumped by every Stop, so a start that resolves after it knows it was cancelled. */
    private readonly generation: Record<LocalMediaKind, number> = { camera: 0, microphone: 0 };
    private readonly onDeviceChange = (): void => void this.RefreshDevices();
    private disposed = false;

    constructor(private readonly options: LocalMediaControllerOptions = {}) {
        mediaDevices()?.addEventListener('devicechange', this.onDeviceChange);
    }

    /** The current state. */
    public get State(): LocalMediaState {
        return this.state.value;
    }

    /** The state, now and on every change. Completes on {@link Dispose}. */
    public get State$(): Observable<LocalMediaState> {
        return this.state.asObservable();
    }

    /** The live stream of a kind, or `null` while it is off. The same object across device switches. */
    public GetStream(kind: LocalMediaKind): MediaStream | null {
        return this.live[kind]?.Stream ?? null;
    }

    /**
     * Lists the input devices. Labels stay empty until the user has allowed this site that kind of device. If
     * the browser cannot list them, the last list is kept.
     */
    public async RefreshDevices(): Promise<MediaDevice[]> {
        const devices = mediaDevices();
        if (!devices?.enumerateDevices) {
            return this.State.Devices;
        }
        try {
            const listed = await devices.enumerateDevices();
            const inputs = listed.flatMap((info): MediaDevice[] => {
                const kind = localKindOf(info.kind);
                return kind ? [{ DeviceID: info.deviceId, Kind: kind, Label: info.label, GroupID: info.groupId }] : [];
            });
            this.publish({ Devices: inputs });
            return inputs;
        } catch (err) {
            console.warn('[LocalMediaController] Could not list devices:', err);
            return this.State.Devices;
        }
    }

    /**
     * Starts capturing a kind: on `deviceId` when it is available, otherwise on the system default. If the
     * kind is already on, returns its stream.
     */
    public Start(kind: LocalMediaKind, deviceId?: string): Promise<LocalMediaResult> {
        const current = this.live[kind];
        if (current) {
            return Promise.resolve({ Status: 'started', Stream: current.Stream });
        }
        let pending = this.pending[kind];
        if (!pending) {
            pending = this.startCapture(kind, deviceId).finally(() => {
                this.pending[kind] = null;
            });
            this.pending[kind] = pending;
        }
        return pending;
    }

    /**
     * Moves a live kind to another device, keeping the same stream. The current device is released first; if
     * the new device fails, the previous one is reopened. A kind that is off is started on that device instead.
     */
    public async SwitchDevice(kind: LocalMediaKind, deviceId: string): Promise<LocalMediaResult> {
        const current = this.live[kind];
        if (!current) {
            return this.Start(kind, deviceId);
        }
        const previous = current.Track.getSettings().deviceId;
        const generation = this.beginChange(kind, current);
        const switched = await this.acquire(kind, { exact: deviceId });
        if (!this.isLatest(kind, generation, switched)) {
            return { Status: 'failed', Reason: 'error', Message: 'Stopped or changed again before the switch finished.' };
        }
        if (switched.Status === 'started') {
            this.insertTrack(kind, current, switched.Track);
            return { Status: 'started', Stream: current.Stream };
        }
        await this.reopenOrFail(kind, current, previous ? { exact: previous } : undefined, generation);
        return switched;
    }

    /** Stops a kind and releases its device. */
    public Stop(kind: LocalMediaKind): void {
        this.generation[kind]++;
        const current = this.live[kind];
        this.live[kind] = null;
        if (current) {
            current.Unwatch();
            current.Stream.getTracks().forEach((track) => track.stop());
        }
        this.publishTrack(kind, OFF);
    }

    /** Stops both kinds, stops following device changes, and completes {@link State$}. */
    public Dispose(): void {
        if (this.disposed) {
            return;
        }
        this.Stop('camera');
        this.Stop('microphone');
        mediaDevices()?.removeEventListener('devicechange', this.onDeviceChange);
        this.disposed = true;
        this.state.complete();
    }

    private async startCapture(kind: LocalMediaKind, deviceId: string | undefined): Promise<LocalMediaResult> {
        const generation = this.generation[kind];
        this.publishTrack(kind, { Status: 'starting' });
        const acquired = await this.acquire(kind, deviceId ? { ideal: deviceId } : undefined);
        if (!this.isLatest(kind, generation, acquired)) {
            return { Status: 'failed', Reason: 'error', Message: 'Stopped before the device started.' };
        }
        if (acquired.Status === 'failed') {
            this.publishTrack(kind, { Status: 'failed', Failure: acquired.Reason, Message: acquired.Message });
            return acquired;
        }
        const stream = acquired.Stream;
        this.live[kind] = { Stream: stream, Track: acquired.Track, Unwatch: this.watch(kind, acquired.Track) };
        this.publishTrack(kind, onState(acquired.Track));
        // Labels appear once the user has allowed the device.
        void this.RefreshDevices();
        return { Status: 'started', Stream: stream };
    }

    /** Asks the browser for one track of a kind. */
    private async acquire(kind: LocalMediaKind, deviceId: ConstrainDOMString | undefined): Promise<Acquired> {
        const devices = mediaDevices();
        if (!devices?.getUserMedia) {
            return { Status: 'failed', Reason: 'unsupported', Message: 'This browser cannot capture a camera or microphone.' };
        }
        const constraints = { ...this.constraintsFor(kind), ...(deviceId ? { deviceId } : {}) };
        try {
            const stream = await devices.getUserMedia(kind === 'camera' ? { video: constraints } : { audio: constraints });
            const track = (kind === 'camera' ? stream.getVideoTracks() : stream.getAudioTracks())[0];
            if (!track) {
                stream.getTracks().forEach((t) => t.stop());
                return { Status: 'failed', Reason: 'error', Message: `The browser returned no ${kind} track.` };
            }
            return { Status: 'started', Stream: stream, Track: track };
        } catch (err) {
            return { Status: 'failed', Reason: failureOf(err), Message: err instanceof Error ? err.message : String(err) };
        }
    }

    private constraintsFor(kind: LocalMediaKind): MediaTrackConstraints {
        return kind === 'camera'
            ? (this.options.CameraConstraints ?? DEFAULT_CAMERA_CONSTRAINTS)
            : (this.options.MicrophoneConstraints ?? DEFAULT_MICROPHONE_CONSTRAINTS);
    }

    /**
     * Releases a live capture's device ahead of opening another one, and reports the kind as starting.
     *
     * @returns The change's generation: a later change, or a Stop, makes it stale.
     */
    private beginChange(kind: LocalMediaKind, current: LiveCapture): number {
        current.Unwatch();
        current.Stream.removeTrack(current.Track);
        current.Track.stop();
        this.publishTrack(kind, { Status: 'starting' });
        return ++this.generation[kind];
    }

    /** Whether a change is still the latest for its kind. If not, the device it opened is released. */
    private isLatest(kind: LocalMediaKind, generation: number, acquired: Acquired): boolean {
        if (generation === this.generation[kind]) {
            return true;
        }
        if (acquired.Status === 'started') {
            acquired.Track.stop();
        }
        return false;
    }

    /**
     * Puts a track in the stream of the capture it replaces and reports its device. The track takes over the
     * old one's `enabled` flag, so a muted microphone stays muted on the new device.
     */
    private insertTrack(kind: LocalMediaKind, replacing: LiveCapture, track: MediaStreamTrack): void {
        track.enabled = replacing.Track.enabled;
        replacing.Stream.addTrack(track);
        this.live[kind] = { Stream: replacing.Stream, Track: track, Unwatch: this.watch(kind, track) };
        this.publishTrack(kind, onState(track));
    }

    /** Opens a device in place of a released capture; if that fails, stops the kind and reports why. */
    private async reopenOrFail(kind: LocalMediaKind, replacing: LiveCapture, deviceId: ConstrainDOMString | undefined, generation: number): Promise<void> {
        const reopened = await this.acquire(kind, deviceId);
        if (!this.isLatest(kind, generation, reopened)) {
            return;
        }
        if (reopened.Status === 'started') {
            this.insertTrack(kind, replacing, reopened.Track);
            return;
        }
        this.Stop(kind);
        this.publishTrack(kind, { Status: 'failed', Failure: reopened.Reason, Message: reopened.Message });
    }

    /** Follows a live track: when it ends without being stopped here, its device went away. */
    private watch(kind: LocalMediaKind, track: MediaStreamTrack): () => void {
        const onEnded = (): void => void this.recoverFromLostDevice(kind, track);
        track.addEventListener('ended', onEnded);
        return () => track.removeEventListener('ended', onEnded);
    }

    /** Restarts a kind whose device went away on the system default, or reports that none is left. */
    private async recoverFromLostDevice(kind: LocalMediaKind, lost: MediaStreamTrack): Promise<void> {
        const current = this.live[kind];
        if (!current || current.Track !== lost) {
            return;
        }
        const generation = this.beginChange(kind, current);
        await this.reopenOrFail(kind, current, undefined, generation);
    }

    private publishTrack(kind: LocalMediaKind, track: LocalTrackState): void {
        this.publish(kind === 'camera' ? { Camera: track } : { Microphone: track });
    }

    private publish(change: Partial<LocalMediaState>): void {
        if (!this.disposed) {
            this.state.next({ ...this.state.value, ...change });
        }
    }
}

/** The browser's media devices, or `undefined` where there are none (Node, some embedded views). */
function mediaDevices(): MediaDevices | undefined {
    return typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
}

/** The local kind of a browser device kind; `null` for outputs. */
function localKindOf(kind: MediaDeviceKind): LocalMediaKind | null {
    if (kind === 'videoinput') {
        return 'camera';
    }
    return kind === 'audioinput' ? 'microphone' : null;
}

/** The `on` state for a live track: its device and name. */
function onState(track: MediaStreamTrack): LocalTrackState {
    return { Status: 'on', DeviceID: track.getSettings().deviceId, Label: track.label };
}

/** Maps a `getUserMedia` rejection to a failure reason. */
function failureOf(err: unknown): LocalMediaFailure {
    switch (err instanceof Error ? err.name : '') {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'denied';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'not-found';
        case 'NotReadableError':
        case 'AbortError':
            return 'in-use';
        default:
            return 'error';
    }
}
