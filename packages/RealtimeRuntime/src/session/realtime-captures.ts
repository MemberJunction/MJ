/**
 * @fileoverview The camera and the screen share of one realtime session: what the user chooses to show the agent
 * besides the channels' own surfaces.
 *
 * A capture starts only when the user asks (a click in the host's UI) and in this order:
 * 0. the session's policy must allow it ({@link RealtimeCapturesOptions.Admit}: the runtime admits a capture only while
 *    the channel that fronts it is in the session and lets the agent see pixels);
 * 1. the model must be able to take it: an inbound video track is already live, or one is added now
 *    (`AddTrack`; a session never requests video before anyone shares, so it is not billed or limited for it);
 * 2. the device or surface is opened: the camera through the host's `ILocalMediaController`, a screen, window or
 *    tab through the host's `RequestDisplayCapture`;
 * 3. it becomes a source of the session's video source arbiter, which decides what the model sees and tells it
 *    when that changes, and frames are sampled at the rate the track negotiated.
 *
 * With the camera check on ({@link RealtimeCapturesOptions.CameraCheck}), the first camera start waits between 2 and 3:
 * the camera is open for the user to look at, and becomes a source only once the user confirms
 * ({@link RealtimeCaptures.ConfirmCamera}).
 *
 * Stopping undoes all three. The track is removed again only when this class added it and no capture is left, so
 * a video track the session was minted with (a channel's) stays. A camera that goes away (unplugged) or a share
 * the user ends from the browser's own bar stops the capture the same way.
 *
 * @module @memberjunction/realtime-runtime
 */

import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { RealtimeTrackDescriptor } from '@memberjunction/ai';
import {
    FrameSampler,
    VideoSourceArbiter,
    type BaseRealtimeClient,
    type CapturedDisplaySurface,
    type DisplayCaptureFailure,
    type DisplayCaptureOptions,
    type ILocalMediaController,
    type LocalMediaState,
    type MediaDevice,
    type SampledFrame,
} from '@memberjunction/ai-realtime-client';
import type { IRealtimeMediaHost } from '../hosts/IRealtimeMediaHost';

/** What the user can show the agent besides a channel's surface. */
export type RealtimeCaptureKind = 'camera' | 'screen';

/** Why a capture did not start. */
export type RealtimeCaptureFailure =
    /** There is no live session to show it to. */
    | 'no-session'
    /** The model takes no (more) video, or the host cannot open this kind of capture. */
    | 'unsupported'
    /** The user, the operating system or the page's permissions policy refused. */
    | 'denied'
    /** There is no camera, or not the one asked for. */
    | 'not-found'
    /** The camera exists, but another application is using it. */
    | 'in-use'
    /** The user closed the browser's share picker without choosing. */
    | 'cancelled'
    /** The call's policy does not allow it: the channel that fronts it is not in the call, or may not show the agent video. */
    | 'policy'
    /** Anything else; see the message. */
    | 'error';

/** One capture. */
export interface RealtimeCaptureState {
    Status: 'off' | 'starting' | 'on' | 'failed';
    /**
     * The camera is open for the user to check, and the agent sees nothing until {@link RealtimeCaptures.ConfirmCamera}.
     * Set only on a starting camera.
     */
    Checking?: boolean;
    /**
     * The live stream while on, or while the user checks the camera: the camera (show it mirrored) or the shared surface
     * (show it as is).
     */
    Stream?: MediaStream;
    /** What a screen share shows, while on. */
    Surface?: CapturedDisplaySurface;
    /** The camera in use, while the camera is open (being checked or on). */
    DeviceID?: string;
    /**
     * The cameras the browser lists, while the camera is open: what {@link RealtimeCaptures.SwitchCamera} can move it to.
     * A browser gives their names only once the user has allowed the camera.
     */
    Devices?: MediaDevice[];
    /** Why the last start failed, while failed. */
    Failure?: RealtimeCaptureFailure;
    /** What to tell the user about the failure. */
    Message?: string;
}

/** Both captures. */
export interface RealtimeCaptureStates {
    Camera: RealtimeCaptureState;
    Screen: RealtimeCaptureState;
}

/** Which captures a call offers the user: those it could start now. */
export interface RealtimeCaptureOffers {
    Camera: boolean;
    Screen: boolean;
}

/** Neither capture offered: what a host shows outside a call. */
export const REALTIME_CAPTURE_OFFERS_NONE: RealtimeCaptureOffers = Object.freeze({ Camera: false, Screen: false });

/** Samples frames from a stream; the default draws through the DOM, and a test passes one that needs none. */
export type RealtimeFrameSamplerFactory = (
    stream: MediaStream,
    rate: number,
    onFrame: (frame: SampledFrame) => void
) => { Start(): boolean; Stop(): void };

/**
 * The session's policy for one capture: refused with a reason for the user, or admitted with the channel it belongs to
 * and whether the agent may see it yet.
 */
export type RealtimeCaptureAdmission =
    | { Admitted: false; Message: string }
    | {
          Admitted: true;
          /** The channel that fronts the capture: the user's "agent can see" choice for it is kept under this key. */
          ChannelKey?: string;
          /** Whether the agent may see it now. When not, it runs for the user only until {@link RealtimeCaptures.SetVisibleToAgent}. */
          VisibleToAgent: boolean;
      };

export interface RealtimeCapturesOptions {
    /** The session's realtime client: the arbiter's sink and the owner of the video track. */
    Client: BaseRealtimeClient;
    /** The host's camera-and-microphone controller; without one there is no camera. */
    LocalMedia: ILocalMediaController | null;
    /** The host, for screen sharing (`RequestDisplayCapture`); without it there is no screen share. */
    Host: IRealtimeMediaHost;
    /** Defaults to a DOM {@link FrameSampler}. */
    CreateSampler?: RealtimeFrameSamplerFactory;
    /** Asked before each start, before anything is added or opened. Default: admitted, visible, with no channel. */
    Admit?: (kind: RealtimeCaptureKind) => RealtimeCaptureAdmission;
    /**
     * Hold the first camera start for the user's check: the camera opens, and reaches the agent only after
     * {@link RealtimeCaptures.ConfirmCamera}. Later starts skip the check. Default: off.
     */
    CameraCheck?: boolean;
}

const OFF: RealtimeCaptureState = { Status: 'off' };

/** What a capture gets when the session sets no policy. */
const ADMITTED: RealtimeCaptureAdmission = { Admitted: true, VisibleToAgent: true };

/** Both captures off: what a host shows outside a session. */
export const REALTIME_CAPTURES_OFF: RealtimeCaptureStates = Object.freeze({ Camera: OFF, Screen: OFF });

/** The arbiter source ids, prefixed so they never meet a channel's (`Key#instance`). */
const SOURCE_IDS: Record<RealtimeCaptureKind, string> = { camera: 'capture:camera', screen: 'capture:screen' };

/** The names the model is told it is looking at, and the "agent can see" list shows. */
const LABELS: Record<RealtimeCaptureKind, string> = { camera: 'Camera', screen: 'Shared screen' };

/**
 * The inbound video track a capture needs. No rate: the model's own ceiling applies. The user's click is the
 * consent the track asks for.
 */
const CAPTURE_VIDEO_TRACK: RealtimeTrackDescriptor = {
    Modality: 'video',
    Direction: 'inbound',
    Encoding: 'image/jpeg',
    UsageBasis: ['tokens', 'frames'],
    RequiresConsent: true,
};

/** A device or surface that was opened, or why it was not. */
type Acquired =
    | { Status: 'started'; Stream: MediaStream; Surface?: CapturedDisplaySurface; Release: () => void }
    | { Status: 'failed'; Failure: RealtimeCaptureFailure; Message: string };

/** A capture whose device or surface is open: what has to be undone to stop it. */
interface LiveCapture {
    Stream: MediaStream;
    /** Samples it for the agent; `null` while the user checks the camera. */
    Sampler: { Stop(): void } | null;
    Release: () => void;
}

/** The camera and the screen share of one session. Created once the session is connected; disposed at its end. */
export class RealtimeCaptures {
    private readonly states = new BehaviorSubject<RealtimeCaptureStates>(REALTIME_CAPTURES_OFF);
    private readonly live: Record<RealtimeCaptureKind, LiveCapture | null> = { camera: null, screen: null };
    /** Bumped by every Stop, so a start that resolves after it knows it was cancelled. */
    private readonly generation: Record<RealtimeCaptureKind, number> = { camera: 0, screen: 0 };
    /** Whether this class added the session's inbound video track, and so may remove it. */
    private addedVideoTrack = false;
    /** Whether the user has confirmed the camera check; later camera starts skip it. */
    private cameraChecked = false;
    private disposed = false;
    /** How each capture is shown to the agent: set at its start, kept up to date by {@link SetVisibleToAgent}. */
    private readonly showing: Record<RealtimeCaptureKind, { ChannelKey?: string; VisibleToAgent: boolean }> = {
        camera: { VisibleToAgent: true },
        screen: { VisibleToAgent: true },
    };

    constructor(private readonly options: RealtimeCapturesOptions) {}

    /** Both captures now. */
    public get States(): RealtimeCaptureStates {
        return this.states.value;
    }

    /** Both captures, now and on every change. Completes on {@link Dispose}. */
    public get States$(): Observable<RealtimeCaptureStates> {
        return this.states.asObservable();
    }

    /**
     * Starts a capture and shows it to the agent. Already starting or on, it returns where it is. Always resolves;
     * a failure is a state, with a message for the user. A camera that waits for the user's check resolves still
     * starting, with `Checking` set and the stream to preview.
     *
     * @param kind The camera or a screen share.
     * @param options The camera's device id, or what the share picker offers first (and a panel to share).
     */
    public Start(kind: 'camera', options?: { DeviceID?: string }): Promise<RealtimeCaptureState>;
    public Start(kind: 'screen', options?: DisplayCaptureOptions): Promise<RealtimeCaptureState>;
    public async Start(kind: RealtimeCaptureKind, options?: { DeviceID?: string } | DisplayCaptureOptions): Promise<RealtimeCaptureState> {
        const current = this.stateOf(kind);
        if (this.disposed || current.Status === 'starting' || current.Status === 'on') {
            return current;
        }
        const admission = this.options.Admit?.(kind) ?? ADMITTED;
        if (!admission.Admitted) {
            return this.fail(kind, 'policy', admission.Message);
        }
        this.showing[kind] = { ChannelKey: admission.ChannelKey, VisibleToAgent: admission.VisibleToAgent };
        const generation = ++this.generation[kind];
        this.setState(kind, { Status: 'starting' });
        const refusal = this.ensureVideoTrack();
        if (refusal) {
            return this.fail(kind, 'unsupported', refusal);
        }
        const acquired = kind === 'camera' ? await this.openCamera(options as { DeviceID?: string } | undefined) : await this.openScreen(options as DisplayCaptureOptions | undefined);
        if (generation !== this.generation[kind]) {
            // Stopped (or disposed) while opening: let go of what just opened.
            if (acquired.Status === 'started') {
                acquired.Release();
            }
            return this.stateOf(kind);
        }
        if (acquired.Status === 'failed') {
            // Failed first, so this capture no longer counts as starting when the track is given back.
            const failed = this.fail(kind, acquired.Failure, acquired.Message);
            this.releaseVideoTrack();
            return failed;
        }
        if (kind === 'camera' && this.options.CameraCheck && !this.cameraChecked) {
            this.live.camera = { Stream: acquired.Stream, Sampler: null, Release: acquired.Release };
            return this.setState('camera', { Status: 'starting', Checking: true, Stream: acquired.Stream, ...this.cameraDevices() });
        }
        this.live[kind] = { Stream: acquired.Stream, Sampler: this.showToAgent(kind, acquired.Stream), Release: acquired.Release };
        return this.setState(kind, {
            Status: 'on',
            Stream: acquired.Stream,
            ...(acquired.Surface ? { Surface: acquired.Surface } : {}),
            ...(kind === 'camera' ? this.cameraDevices() : {}),
        });
    }

    /**
     * The user checked the camera and turned it on: it is shown to the agent from now on, and later camera starts skip the
     * check. Returns the camera's state; unless the camera is waiting for its check, nothing changes.
     */
    public ConfirmCamera(): RealtimeCaptureState {
        const live = this.live.camera;
        if (!live || !this.States.Camera.Checking) {
            return this.States.Camera;
        }
        this.cameraChecked = true;
        live.Sampler = this.showToAgent('camera', live.Stream);
        return this.setState('camera', { Status: 'on', Stream: live.Stream, ...this.cameraDevices() });
    }

    /**
     * Moves the open camera (being checked or on) to another of its {@link RealtimeCaptureState.Devices}. The stream stays
     * the same, so the preview and the agent's frames carry on from the new camera. When the new camera cannot open, the
     * host's controller goes back to the one in use; when that fails too, the camera stops. Resolves with the camera's
     * state; nothing changes while the camera is not open.
     */
    public async SwitchCamera(deviceId: string): Promise<RealtimeCaptureState> {
        const controller = this.options.LocalMedia;
        if (this.live.camera && controller) {
            await controller.SwitchDevice('camera', deviceId);
        }
        return this.States.Camera;
    }

    /**
     * Lets the agent see a capture, or hides it from the agent while it keeps running for the user (the policy of the
     * channel that fronts it changed). Applies to a capture that is still starting too. Quiet: the channel tells the model.
     */
    public SetVisibleToAgent(kind: RealtimeCaptureKind, visible: boolean): void {
        this.showing[kind] = { ...this.showing[kind], VisibleToAgent: visible };
        if (this.live[kind]) {
            VideoSourceArbiter.ForSink(this.options.Client).SetSourceEnabled(SOURCE_IDS[kind], visible, false);
        }
    }

    /** Stops a capture: no more frames, out of the arbiter, the device or share released. Safe when it is off. */
    public Stop(kind: RealtimeCaptureKind): void {
        this.generation[kind]++;
        const live = this.live[kind];
        this.live[kind] = null;
        if (live) {
            live.Sampler?.Stop();
            VideoSourceArbiter.ForSink(this.options.Client).UnregisterSource(SOURCE_IDS[kind]);
            live.Release();
        }
        if (this.stateOf(kind).Status !== 'off') {
            this.setState(kind, OFF);
        }
        this.releaseVideoTrack();
    }

    /** Stops both captures and completes {@link States$}. */
    public Dispose(): void {
        if (this.disposed) {
            return;
        }
        this.Stop('camera');
        this.Stop('screen');
        this.disposed = true;
        this.states.complete();
    }

    private stateOf(kind: RealtimeCaptureKind): RealtimeCaptureState {
        return kind === 'camera' ? this.states.value.Camera : this.states.value.Screen;
    }

    private setState(kind: RealtimeCaptureKind, state: RealtimeCaptureState): RealtimeCaptureState {
        if (!this.disposed) {
            this.states.next(kind === 'camera' ? { ...this.states.value, Camera: state } : { ...this.states.value, Screen: state });
        }
        return state;
    }

    private fail(kind: RealtimeCaptureKind, failure: RealtimeCaptureFailure, message: string): RealtimeCaptureState {
        return this.setState(kind, { Status: 'failed', Failure: failure, Message: message });
    }

    /** The camera in use and the cameras to choose from, as the host's controller reports them now. */
    private cameraDevices(): CameraDevices {
        return cameraDevicesOf(this.options.LocalMedia?.State);
    }

    /**
     * Keeps the open camera's device and list current as the controller reports them: a switch, a camera plugged in or
     * removed, names that appear once the user allows the camera. While a switch is under way the device in use stays.
     */
    private followCamera(media: LocalMediaState): void {
        const current = this.States.Camera;
        const next = cameraDevicesOf(media, current.DeviceID);
        if (next.DeviceID !== current.DeviceID || !sameDevices(next.Devices, current.Devices ?? [])) {
            this.setState('camera', { ...current, ...next });
        }
    }

    /**
     * Makes sure an inbound video track is live: the one the session already has, or one added now.
     *
     * @returns Why the model cannot take video, or `null` when it can.
     */
    private ensureVideoTrack(): string | null {
        const client = this.options.Client;
        if (client.IsTrackEstablished('video', 'inbound')) {
            return null;
        }
        const track = client.AddTrack(CAPTURE_VIDEO_TRACK);
        if (!track || track.State !== 'live') {
            return track?.Reason ?? 'This model cannot see video.';
        }
        this.addedVideoTrack = true;
        return null;
    }

    /** Removes the video track this class added, once no capture is on or starting. */
    private releaseVideoTrack(): void {
        const busy = [this.states.value.Camera, this.states.value.Screen].some((s) => s.Status === 'on' || s.Status === 'starting');
        if (!this.addedVideoTrack || busy) {
            return;
        }
        this.addedVideoTrack = false;
        this.options.Client.RemoveTrack(CAPTURE_VIDEO_TRACK);
    }

    /** Registers the capture with the arbiter, as its channel's and as visible as the policy allows, and samples it at the negotiated rate. */
    private showToAgent(kind: RealtimeCaptureKind, stream: MediaStream): { Stop(): void } {
        const arbiter = VideoSourceArbiter.ForSink(this.options.Client);
        const sourceId = SOURCE_IDS[kind];
        const { ChannelKey, VisibleToAgent } = this.showing[kind];
        arbiter.RegisterSource({ SourceID: sourceId, Label: LABELS[kind], Kind: kind, Enabled: VisibleToAgent, ...(ChannelKey ? { ChannelKey } : {}) });
        const create = this.options.CreateSampler ?? createDomSampler;
        const sampler = create(stream, this.options.Client.InboundVideoRate ?? 1, (frame) => arbiter.PushFrame(sourceId, frame.Data, frame.MimeType));
        sampler.Start();
        return sampler;
    }

    /** Opens the camera through the host's controller, and stops the capture if the camera goes away. */
    private async openCamera(options: { DeviceID?: string } | undefined): Promise<Acquired> {
        const controller = this.options.LocalMedia;
        if (!controller) {
            return { Status: 'failed', Failure: 'unsupported', Message: 'This app cannot open a camera.' };
        }
        const result = await controller.Start('camera', options?.DeviceID);
        if (result.Status === 'failed') {
            return { Status: 'failed', Failure: result.Reason, Message: result.Message };
        }
        const watch: Subscription = controller.State$.subscribe((state) => {
            if (state.Camera.Status === 'off' || state.Camera.Status === 'failed') {
                this.Stop('camera');
            } else if (this.live.camera) {
                this.followCamera(state);
            }
        });
        return {
            Status: 'started',
            Stream: result.Stream,
            Release: () => {
                watch.unsubscribe();
                controller.Stop('camera');
            },
        };
    }

    /** Asks the host for a screen, window or tab, and stops the capture when the share ends. */
    private async openScreen(options: DisplayCaptureOptions | undefined): Promise<Acquired> {
        const host = this.options.Host;
        if (!host.RequestDisplayCapture) {
            return { Status: 'failed', Failure: 'unsupported', Message: 'This app cannot share a screen.' };
        }
        const result = await host.RequestDisplayCapture(options);
        if (result.Status === 'cancelled') {
            return { Status: 'failed', Failure: 'cancelled', Message: 'Sharing was cancelled.' };
        }
        if (result.Status === 'failed') {
            return { Status: 'failed', Failure: screenFailure(result.Reason), Message: result.Message };
        }
        const capture = result.Capture;
        const stopWatching = capture.OnEnded(() => this.Stop('screen'));
        return {
            Status: 'started',
            Stream: capture.Stream,
            Surface: capture.Surface,
            Release: () => {
                stopWatching();
                capture.Stop();
            },
        };
    }
}

/** What an open camera's state says about its devices. */
type CameraDevices = { DeviceID?: string; Devices: MediaDevice[] };

/**
 * The camera in use and the cameras among the devices, as a controller reports them. The camera in use is known while
 * the controller reports it on; otherwise it is `inUse`, the one the capture already names.
 */
function cameraDevicesOf(media: LocalMediaState | undefined, inUse?: string): CameraDevices {
    const deviceId = (media?.Camera.Status === 'on' ? media.Camera.DeviceID : undefined) ?? inUse;
    return { ...(deviceId ? { DeviceID: deviceId } : {}), Devices: media?.Devices.filter((d) => d.Kind === 'camera') ?? [] };
}

/** Whether two lists name the same devices in the same order. */
function sameDevices(a: readonly MediaDevice[], b: readonly MediaDevice[]): boolean {
    return a.length === b.length && a.every((d, i) => d.DeviceID === b[i].DeviceID && d.Label === b[i].Label);
}

/** A DOM frame sampler at the given rate. */
function createDomSampler(stream: MediaStream, rate: number, onFrame: (frame: SampledFrame) => void): FrameSampler {
    return new FrameSampler(stream, { Rate: rate, OnFrame: onFrame });
}

/** A share failure as a capture failure: a panel the browser cannot narrow to is unsupported; a wrong one an error. */
function screenFailure(reason: DisplayCaptureFailure): RealtimeCaptureFailure {
    switch (reason) {
        case 'unsupported':
        case 'panel-unsupported':
            return 'unsupported';
        case 'denied':
            return 'denied';
        default:
            return 'error';
    }
}
