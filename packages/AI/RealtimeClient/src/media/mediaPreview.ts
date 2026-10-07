/**
 * @fileoverview MEDIA PREVIEW: the user's camera and microphone before they join a call or a meeting. It gives a
 * camera to see themselves in, a microphone level, the devices to choose from, and what they chose, for a lobby such
 * as `mj-camera-check` to show. It drives an {@link ILocalMediaController} (the browser's `LocalMediaController`, or a
 * fake in tests) and a microphone meter, owns both, and releases them when disposed, so the call or the meeting opens
 * the chosen devices itself.
 *
 * - **What starts.** The microphone starts on and the camera off, unless the options say otherwise.
 * - **Devices.** Picking a device moves a live kind to it at once; a kind that is off starts on it later. Until the
 *   user picks, the choice is the device in use, else the first one listed.
 * - **Failures.** A kind that fails to start is turned off in the choices, with the reason in its state.
 *
 * The realtime call checks the camera inside the call instead (`RealtimeCaptures`), since its stream carries on into
 * the call; this preview is for a lobby whose devices are released before joining.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { RealtimeAudioMeter, type IRealtimeAudioMeter } from '../audio/audioMeter';
import type { ILocalMediaController } from './localMediaController';
import type { LocalMediaKind, LocalMediaState, LocalTrackState, MediaDevice, MediaDeviceSelection, MediaVideoSource } from './model';

/** What the user chose in the preview, for the call or the meeting to open. */
export interface MediaPreviewChoices {
    MicrophoneOn: boolean;
    CameraOn: boolean;
    /** The microphone to use, or `null` when none is listed. */
    MicrophoneDeviceID: string | null;
    /** The camera to use, or `null` when none is listed. */
    CameraDeviceID: string | null;
}

/** How a preview starts. */
export interface MediaPreviewOptions {
    /** Whether the microphone starts on. Defaults to `true`. */
    MicrophoneOn?: boolean;
    /** Whether the camera starts on. Defaults to `false`. */
    CameraOn?: boolean;
    /** Meters the microphone's stream. Defaults to `RealtimeAudioMeter.ForMicStream`; a test passes its own. */
    MeterFor?: (stream: MediaStream) => IRealtimeAudioMeter | null;
}

/** The preview now: what a lobby shows. */
export interface MediaPreviewState {
    /** The camera to show, while it is on. The same object across device switches. */
    CameraSource: MediaVideoSource | null;
    /** The microphones and cameras to choose from. */
    Devices: readonly MediaDevice[];
    /** What the user chose. */
    Choices: MediaPreviewChoices;
    /** The camera's capture, for a failure to show. */
    Camera: LocalTrackState;
    /** The microphone's capture, for a failure to show. */
    Microphone: LocalTrackState;
}

/** The user's camera and microphone in a lobby: see the file header. */
export class MediaPreview {
    private readonly state: BehaviorSubject<MediaPreviewState>;
    private readonly watch: Subscription;
    private readonly meterFor: (stream: MediaStream) => IRealtimeAudioMeter | null;
    private meter: IRealtimeAudioMeter | null = null;
    private cameraSource: MediaVideoSource | null = null;
    private choices: MediaPreviewChoices;

    /**
     * @param controller The camera and microphone. The preview owns it from here, and disposes it with itself.
     * @param options What starts, and how the microphone is metered.
     */
    constructor(
        private readonly controller: ILocalMediaController,
        options: MediaPreviewOptions = {}
    ) {
        this.meterFor = options.MeterFor ?? ((stream) => RealtimeAudioMeter.ForMicStream(stream));
        this.choices = { MicrophoneOn: options.MicrophoneOn ?? true, CameraOn: options.CameraOn ?? false, MicrophoneDeviceID: null, CameraDeviceID: null };
        this.state = new BehaviorSubject(this.snapshot(controller.State));
        this.watch = controller.State$.subscribe((media) => this.publish(media));
    }

    /** The preview now. */
    public get State(): MediaPreviewState {
        return this.state.value;
    }

    /** The preview, now and on every change. Completes on {@link Dispose}. */
    public get State$(): Observable<MediaPreviewState> {
        return this.state.asObservable();
    }

    /** The microphone's level now, 0 to 1; 0 while it is off or cannot be metered. Pass it to a meter as its reader. */
    public readonly ReadMicrophoneLevel = (): number => this.meter?.Level() ?? 0;

    /** Starts the kinds the user starts with, then lists the devices (their names appear once access is allowed). */
    public async Start(): Promise<void> {
        if (this.choices.MicrophoneOn) {
            await this.startKind('microphone');
        }
        if (this.choices.CameraOn) {
            await this.startKind('camera');
        }
        await this.controller.RefreshDevices();
        this.publish(this.controller.State);
    }

    /** Turns the camera on or off. */
    public async SetCameraOn(on: boolean): Promise<void> {
        await this.setOn('camera', on);
    }

    /** Turns the microphone on or off. */
    public async SetMicrophoneOn(on: boolean): Promise<void> {
        await this.setOn('microphone', on);
    }

    /** Picks a device. A live kind moves to it at once; a kind that is off starts on it later. Speakers are ignored. */
    public async SelectDevice(selection: MediaDeviceSelection): Promise<void> {
        if (selection.Kind === 'speaker') {
            return;
        }
        const kind = selection.Kind;
        this.choices = kind === 'camera' ? { ...this.choices, CameraDeviceID: selection.DeviceID } : { ...this.choices, MicrophoneDeviceID: selection.DeviceID };
        if (trackOf(this.controller.State, kind).Status === 'on') {
            const result = await this.controller.SwitchDevice(kind, selection.DeviceID);
            // The meter listens to a copy of the old track, so it follows the switch only when rebuilt.
            if (kind === 'microphone' && result.Status === 'started') {
                this.remeter(result.Stream);
            }
        }
        this.publish(this.controller.State);
    }

    /** Stops the camera and the microphone, closes the meter, disposes the controller, and completes {@link State$}. */
    public Dispose(): void {
        this.watch.unsubscribe();
        this.closeMeter();
        this.cameraSource = null;
        this.controller.Dispose();
        this.state.complete();
    }

    private async setOn(kind: LocalMediaKind, on: boolean): Promise<void> {
        this.choices = kind === 'camera' ? { ...this.choices, CameraOn: on } : { ...this.choices, MicrophoneOn: on };
        if (on) {
            await this.startKind(kind);
        } else {
            this.stopKind(kind);
        }
        this.publish(this.controller.State);
    }

    /** Starts a kind on the chosen device; a failure turns it off in the choices. */
    private async startKind(kind: LocalMediaKind): Promise<void> {
        const deviceId = kind === 'camera' ? this.choices.CameraDeviceID : this.choices.MicrophoneDeviceID;
        const result = await this.controller.Start(kind, deviceId ?? undefined);
        if (result.Status !== 'started') {
            this.choices = kind === 'camera' ? { ...this.choices, CameraOn: false } : { ...this.choices, MicrophoneOn: false };
            return;
        }
        if (kind === 'camera') {
            this.cameraSource = { Kind: 'stream', Stream: result.Stream };
        } else {
            this.remeter(result.Stream);
        }
    }

    private stopKind(kind: LocalMediaKind): void {
        this.controller.Stop(kind);
        if (kind === 'camera') {
            this.cameraSource = null;
        } else {
            this.closeMeter();
        }
    }

    private remeter(stream: MediaStream): void {
        this.closeMeter();
        this.meter = this.meterFor(stream);
    }

    private closeMeter(): void {
        this.meter?.Close();
        this.meter = null;
    }

    /** Publishes the state; after {@link Dispose} the completed subject ignores it. */
    private publish(media: LocalMediaState): void {
        this.state.next(this.snapshot(media));
    }

    /** The state from the controller's: the choices fall back to the device in use, else the first one listed. */
    private snapshot(media: LocalMediaState): MediaPreviewState {
        const devices = media.Devices;
        const firstOf = (kind: LocalMediaKind): string | null => devices.find((d) => d.Kind === kind)?.DeviceID ?? null;
        return {
            CameraSource: this.cameraSource,
            Devices: devices,
            Choices: {
                ...this.choices,
                MicrophoneDeviceID: this.choices.MicrophoneDeviceID ?? media.Microphone.DeviceID ?? firstOf('microphone'),
                CameraDeviceID: this.choices.CameraDeviceID ?? media.Camera.DeviceID ?? firstOf('camera'),
            },
            Camera: media.Camera,
            Microphone: media.Microphone,
        };
    }
}

function trackOf(media: LocalMediaState, kind: LocalMediaKind): LocalTrackState {
    return kind === 'camera' ? media.Camera : media.Microphone;
}
