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
    /** The live stream while on: the camera (show it mirrored) or the shared surface (show it as is). */
    Stream?: MediaStream;
    /** What a screen share shows, while on. */
    Surface?: CapturedDisplaySurface;
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

/** A capture that is on: what has to be undone to stop it. */
interface LiveCapture {
    Sampler: { Stop(): void };
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
     * a failure is a state, with a message for the user.
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
        this.live[kind] = { Sampler: this.showToAgent(kind, acquired.Stream), Release: acquired.Release };
        return this.setState(kind, { Status: 'on', Stream: acquired.Stream, ...(acquired.Surface ? { Surface: acquired.Surface } : {}) });
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
            live.Sampler.Stop();
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
