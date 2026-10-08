/**
 * @fileoverview Participant video inside the agent's bot: which cameras and screens it may read, which ones it reads,
 * how often it samples them, and teardown.
 *
 * ## Rules
 * - **Eligible:** a remote participant who is not an agent (`agent-*`) and whose `mj.agentCanSee` attribute is `'true'`
 *   (`AllowsAgentVision`; any other value means no), publishing an unmuted camera (when `Cameras`) or screen share
 *   (when `Screens`).
 * - **Selection:** up to `Streams` sources at once. A free slot takes an eligible track as it is subscribed, or the
 *   first eligible source in the room (participants in join order, their tracks in publish order). A source is kept
 *   until it ends (opt-out, leave, unpublish, unsubscribe, mute, its stream ending, or LiveKit refusing its
 *   subscription); its slot then takes the next.
 * - **Subscriptions:** the bot joins with `autoSubscribe` (its hearing needs it), so every video track arrives
 *   subscribed. The watcher unsubscribes every video track it does not read, and subscribes a source when a scan of the
 *   room selects it; reading starts when that subscription arrives.
 * - **Reading and pacing:** one `VideoStream` per selected source, drained frame by frame (the SDK enqueues every frame
 *   without backpressure, so the reader never waits for an encode). A frame is sent to the encoder only when the
 *   session's frame interval has passed since that source's last sent frame (the pacing anchor is set when a frame is
 *   sent), and only when no earlier frame of that source is still being encoded; a due frame that arrives meanwhile is
 *   dropped and counted.
 * - **Consent wins:** eligibility is checked before a frame is sent to the encoder (a frame of someone who no longer lets
 *   agents see is never copied) and again when its JPEG returns, so an opt-out during an encode drops that frame.
 * - **Ended:** when a source that sent at least one frame stops, {@link RoomVideoWatcherOptions.OnSourceEnded} reports
 *   it (so the engine can tell the model). A source counts as having sent a frame only once one was emitted.
 *   {@link RoomVideoWatcher.Stop} (the bot leaving) reports nothing.
 *
 * Frames are read, sampled and checked on the thread that hosts the room (MJAPI's main loop in-process, or the media
 * worker with `MJ_LIVEKIT_WORKER_MEDIA=on`), and encoded through {@link RoomVideoWatcherOptions.Encoder}: by default on
 * that same thread, and on the encode worker's thread when the client was given {@link VideoEncodeWorkerHost} (the module
 * factory does). Room telemetry reports the cost.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 * @author MemberJunction.com
 */

import { performance } from 'node:perf_hooks';
import { LogError, LogStatusEx } from '@memberjunction/core';
import { AllowsAgentVision, RealtimeVideoFrameIntervalMs } from '@memberjunction/ai';
import {
    IsAgentParticipantIdentity,
    type NativeRoomVideoFrame,
    type NativeRoomVideoOptions,
    type NativeRoomVideoSourceEnd,
    type NativeRoomVideoSourceKind,
} from '@memberjunction/ai-bridge-livekit';
import type {
    RtcNodeModule,
    RtcParticipant,
    RtcTrack,
    RtcTrackPublication,
    RtcVideoFrameEvent,
    RtcVideoStreamReader,
} from './livekit-rtc-node-room';
import type { RoomVideoTelemetry } from './room-telemetry';
import {
    DEFAULT_CAMERA_MAX_DIMENSION,
    DEFAULT_JPEG_QUALITY,
    DEFAULT_SCREEN_MAX_DIMENSION,
    InProcessVideoFrameEncoder,
    type IRoomVideoFrameEncoder,
    type RoomVideoFrameEncodeOptions,
    type TimedEncodedVideoFrame,
} from './video-frame-encoder';
import type { VideoRotationDegrees } from './video-frame-pixels';

/** What a {@link RoomVideoWatcher} needs from the room client that owns it. */
export interface RoomVideoWatcherOptions {
    /** What the agent may read (from the bridge: the session's stream count and rate, the provider's flags). */
    Video: NativeRoomVideoOptions;
    /** The loaded `@livekit/rtc-node` module: `VideoStream` and the enum constants. */
    Rtc: RtcNodeModule;
    /** The room's remote participants, in join order. */
    ListParticipants: () => RtcParticipant[];
    /** Receives each sampled, encoded frame. */
    OnFrame: (frame: NativeRoomVideoFrame) => void;
    /** Receives each source that stopped after sending at least one frame. */
    OnSourceEnded: (source: NativeRoomVideoSourceEnd) => void;
    /**
     * Where sampled frames are encoded. Default: an {@link InProcessVideoFrameEncoder} on the thread that hosts the room,
     * timed with {@link Now}.
     */
    Encoder?: IRoomVideoFrameEncoder;
    /** Monotonic millisecond clock for pacing, the encode round trip and the default encoder's timing. Default `performance.now()`. */
    Now?: () => number;
}

/** One selected source: subscribed (or being subscribed) and read. */
interface WatchedSource {
    participant: RtcParticipant;
    publication: RtcTrackPublication;
    kind: NativeRoomVideoSourceKind;
    /** The reader of its `VideoStream`; absent while the subscription the watcher asked for is on its way. */
    reader?: RtcVideoStreamReader;
    /** When a frame of this source was last sent to the encoder: the pacing anchor. */
    lastSampledAtMs?: number;
    /** Whether a frame of this source is being encoded. Kept across a reader replacement, so a source never has two. */
    encoding: boolean;
    /** Whether this source has emitted a frame, so its end is worth reporting. */
    sentAny: boolean;
}

/** A frame sent to the encoder, and what its reply needs. */
interface SentFrame {
    source: WatchedSource;
    /** The reader it came from: the reply is emitted only while the source is still read through it. */
    reader: RtcVideoStreamReader;
    /** When it arrived and was sent, on the watcher's monotonic clock: the round trip starts here. */
    sentAtMs: number;
    /** The wall clock when it arrived: the frame's timestamp. */
    timestampMs: number;
}

/** The counters the watcher keeps; {@link RoomVideoWatcher.GetTelemetry} adds the selection and the encoder's own. */
interface WatcherCounters {
    framesReceived: number;
    framesSent: number;
    framesSkippedNotDue: number;
    framesSkippedEncoding: number;
    framesDroppedAfterEncode: number;
    encodeFailures: number;
    encodeInFlight: number;
    encodeMsLast?: number;
    encodeMsMax: number;
    encodeRoundTripMsLast?: number;
    encodeRoundTripMsMax: number;
    encodeDispatchMsMax: number;
    bytesSent: number;
}

/** A source found by a scan of the room. */
interface EligibleSource {
    participant: RtcParticipant;
    publication: RtcTrackPublication;
}

/**
 * Stops the server sending a video track to the bot (best-effort). Every video track the bot does not read is dropped
 * this way: privacy (no one's video reaches the host unless they allowed it and it is being read) and CPU.
 */
export function DropVideoSubscription(publication: RtcTrackPublication): void {
    try {
        publication.setSubscribed?.(false);
    } catch (err) {
        LogError(`[RoomVideoWatcher] unsubscribing a video track failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** A positive finite number, or the fallback. */
function positiveOr(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Owns participant video inside the bot. One instance per room session; see the file header for its rules. */
export class RoomVideoWatcher {
    private readonly rtc: RtcNodeModule;
    private readonly video: NativeRoomVideoOptions;
    private readonly streams: number;
    private readonly intervalMs: number;
    private readonly cameraMaxDimension: number;
    private readonly screenMaxDimension: number;
    private readonly jpegQuality: number;
    private readonly listParticipants: () => RtcParticipant[];
    private readonly onFrame: (frame: NativeRoomVideoFrame) => void;
    private readonly onSourceEnded: (source: NativeRoomVideoSourceEnd) => void;
    private readonly now: () => number;
    private readonly encoder: IRoomVideoFrameEncoder;
    private readonly sources: WatchedSource[] = [];
    private stopped = false;
    private readonly telemetry: WatcherCounters = {
        framesReceived: 0,
        framesSent: 0,
        framesSkippedNotDue: 0,
        framesSkippedEncoding: 0,
        framesDroppedAfterEncode: 0,
        encodeFailures: 0,
        encodeInFlight: 0,
        encodeMsMax: 0,
        encodeRoundTripMsMax: 0,
        encodeDispatchMsMax: 0,
        bytesSent: 0,
    };

    constructor(options: RoomVideoWatcherOptions) {
        this.rtc = options.Rtc;
        this.video = options.Video;
        this.streams = Number.isFinite(options.Video.Streams) ? Math.max(0, Math.floor(options.Video.Streams)) : 0;
        this.intervalMs = RealtimeVideoFrameIntervalMs(options.Video.Rate);
        this.cameraMaxDimension = positiveOr(options.Video.CameraMaxDimension, DEFAULT_CAMERA_MAX_DIMENSION);
        this.screenMaxDimension = positiveOr(options.Video.ScreenMaxDimension, DEFAULT_SCREEN_MAX_DIMENSION);
        this.jpegQuality = positiveOr(options.Video.JpegQuality, DEFAULT_JPEG_QUALITY);
        this.listParticipants = options.ListParticipants;
        this.onFrame = options.OnFrame;
        this.onSourceEnded = options.OnSourceEnded;
        this.now = options.Now ?? (() => performance.now());
        this.encoder = options.Encoder ?? new InProcessVideoFrameEncoder(this.now);
    }

    // ── room events ──────────────────────────────────────────────────────────────

    /** A video track reached the bot: read it when it is selected (or takes a free slot), else unsubscribe it. */
    public HandleTrackSubscribed(track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        const source = this.findSource(publication, participant) ?? this.claimFreeSlot(publication, participant);
        if (source) {
            // Keep the SDK's current objects: after a full reconnect the same track sid may arrive on new ones.
            // VERIFY against @livekit/rtc-node: whether a full reconnect re-emits TrackSubscribed for subscribed tracks.
            source.publication = publication;
            source.participant = participant;
            this.startReading(source, track);
        } else {
            DropVideoSubscription(publication);
        }
    }

    /** A track stopped reaching the bot. Ends the source it carried; a source still waiting for its subscription stays. */
    public HandleTrackUnsubscribed(publication: RtcTrackPublication, participant: RtcParticipant): void {
        const source = this.findSource(publication, participant);
        if (!this.stopped && source?.reader) {
            this.endSource(source, 'unsubscribed');
            this.fillFreeSlots(publication);
        }
    }

    /**
     * LiveKit refused a subscription the watcher asked for (`TrackSubscriptionFailed`, which names the track by sid). The
     * slot is released and the next eligible source picked; the refused one can be picked again on a later scan.
     */
    public HandleTrackSubscriptionFailed(trackSid: string, participant: RtcParticipant, error?: string): void {
        const source = this.sources.find((s) => s.publication.sid === trackSid && s.participant.identity === participant.identity);
        if (this.stopped || !source) {
            return;
        }
        LogError(`[RoomVideoWatcher] LiveKit refused the subscription to '${participant.identity}' ${source.kind}${error ? `: ${error}` : ''}`);
        this.endSource(source, 'subscription refused');
        this.fillFreeSlots(source.publication);
    }

    /** A participant unpublished a track. */
    public HandleTrackUnpublished(publication: RtcTrackPublication, participant: RtcParticipant): void {
        const source = this.findSource(publication, participant);
        if (!this.stopped && source) {
            this.endSource(source, 'unpublished');
            this.fillFreeSlots(publication);
        }
    }

    /** A participant muted a track: a muted source is not read, nor received. */
    public HandleTrackMuted(publication: RtcTrackPublication, participant: RtcParticipant): void {
        const source = this.findSource(publication, participant);
        if (!this.stopped && source) {
            this.endSource(source, 'muted');
            DropVideoSubscription(publication);
            this.fillFreeSlots(publication);
        }
    }

    /** A participant unmuted a track: it may fill a free slot. */
    public HandleTrackUnmuted(): void {
        this.fillFreeSlots();
    }

    /** A participant's attributes changed: an opt-out stops their sources at once; an opt-in may fill a free slot. */
    public HandleAttributesChanged(participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        if (!this.isEligibleParticipant(participant)) {
            for (const source of this.sourcesOf(participant)) {
                this.endSource(source, 'no longer lets agents see');
                DropVideoSubscription(source.publication);
            }
        }
        this.fillFreeSlots();
    }

    /** A participant left. */
    public HandleParticipantDisconnected(participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        for (const source of this.sourcesOf(participant)) {
            this.endSource(source, 'left');
        }
        this.fillFreeSlots();
    }

    /** The bot is leaving: cancels every reader. Reports no ended sources; frames being encoded are dropped on return. Idempotent. */
    public Stop(): void {
        this.stopped = true;
        for (const source of this.sources.splice(0)) {
            this.cancelReader(source);
        }
    }

    /** Participant-video counters, with where frames are encoded and the encoder's own counters. */
    public GetTelemetry(): RoomVideoTelemetry {
        const encoderStats = this.encoder.GetStats();
        return {
            ...this.telemetry,
            selectedSources: this.sources.length,
            encoder: this.encoder.Location,
            encodeQueueDepth: encoderStats.QueueDepth,
            encodeWorkerRestarts: encoderStats.WorkerRestarts,
        };
    }

    // ── eligibility and selection ────────────────────────────────────────────────

    /** Not an agent, and lets agents see (only the attribute value `'true'` counts). */
    private isEligibleParticipant(participant: RtcParticipant): boolean {
        return !IsAgentParticipantIdentity(participant.identity) && AllowsAgentVision(participant.attributes);
    }

    /** An unmuted camera or screen share of a kind the agent may read. */
    private isEligiblePublication(publication: RtcTrackPublication): boolean {
        const kind = this.kindOf(publication);
        if (publication.muted === true || kind === undefined) {
            return false;
        }
        return kind === 'camera' ? this.video.Cameras : this.video.Screens;
    }

    private isEligible(publication: RtcTrackPublication, participant: RtcParticipant): boolean {
        return this.isEligibleParticipant(participant) && this.isEligiblePublication(publication);
    }

    /** `camera` or `screen` from the publication's track source; anything else is not read. */
    private kindOf(publication: RtcTrackPublication): NativeRoomVideoSourceKind | undefined {
        if (publication.source === this.rtc.TrackSource.SOURCE_CAMERA) {
            return 'camera';
        }
        return publication.source === this.rtc.TrackSource.SOURCE_SCREENSHARE ? 'screen' : undefined;
    }

    /** The selected source carrying this publication (the same object, or the same participant and track sid). */
    private findSource(publication: RtcTrackPublication, participant: RtcParticipant): WatchedSource | undefined {
        return this.sources.find(
            (s) =>
                s.publication === publication ||
                (publication.sid !== undefined && s.publication.sid === publication.sid && s.participant.identity === participant.identity),
        );
    }

    private sourcesOf(participant: RtcParticipant): WatchedSource[] {
        return this.sources.filter((s) => s.participant.identity === participant.identity);
    }

    /** Selects an arriving track when a slot is free and it is eligible. */
    private claimFreeSlot(publication: RtcTrackPublication, participant: RtcParticipant): WatchedSource | undefined {
        if (this.sources.length >= this.streams || !this.isEligible(publication, participant)) {
            return undefined;
        }
        return this.addSource(publication, participant);
    }

    private addSource(publication: RtcTrackPublication, participant: RtcParticipant): WatchedSource {
        const source: WatchedSource = {
            participant,
            publication,
            kind: this.kindOf(publication) ?? 'camera',
            encoding: false,
            sentAny: false,
        };
        this.sources.push(source);
        return source;
    }

    /**
     * Fills free slots from a scan of the room, subscribing each pick (reading starts when its track arrives).
     * `justEnded` is passed over in this scan: it was the source that just stopped, so the slot moves on to the next.
     */
    private fillFreeSlots(justEnded?: RtcTrackPublication): void {
        const passed = new Set<RtcTrackPublication>(justEnded ? [justEnded] : []);
        while (!this.stopped && this.sources.length < this.streams) {
            const next = this.nextEligible(passed);
            if (!next) {
                return;
            }
            passed.add(next.publication);
            this.subscribe(this.addSource(next.publication, next.participant));
        }
    }

    /** The first eligible, unselected source in the room: participants in join order, their tracks in publish order. */
    private nextEligible(passed: Set<RtcTrackPublication>): EligibleSource | undefined {
        for (const participant of this.listParticipants()) {
            if (!this.isEligibleParticipant(participant)) {
                continue;
            }
            for (const publication of participant.trackPublications?.values() ?? []) {
                if (!passed.has(publication) && !this.findSource(publication, participant) && this.isEligiblePublication(publication)) {
                    return { participant, publication };
                }
            }
        }
        return undefined;
    }

    /** Asks the server to send a selected source. A failed request releases the slot. */
    private subscribe(source: WatchedSource): void {
        try {
            source.publication.setSubscribed?.(true);
        } catch (err) {
            LogError(`[RoomVideoWatcher] subscribing a video track failed: ${err instanceof Error ? err.message : String(err)}`);
            this.endSource(source, 'subscribe failed');
        }
    }

    /** Stops a source: frees its slot, cancels its reader, and reports it when it sent a frame. */
    private endSource(source: WatchedSource, reason: string): void {
        const index = this.sources.indexOf(source);
        if (index < 0) {
            return;
        }
        this.sources.splice(index, 1);
        this.cancelReader(source);
        LogStatusEx({
            message: `[RoomVideoWatcher] stopped reading '${source.participant.identity}' ${source.kind} (${reason})`,
            verboseOnly: true,
        });
        if (source.sentAny) {
            const ended: NativeRoomVideoSourceEnd = {
                participantIdentity: source.participant.identity,
                name: source.participant.name,
                source: source.kind,
            };
            this.deliver('source-ended', () => this.onSourceEnded(ended));
        }
    }

    // ── reading ──────────────────────────────────────────────────────────────────

    /** Opens a `VideoStream` on the source's track and drains it. Replaces any reader the source already had. */
    private startReading(source: WatchedSource, track: RtcTrack): void {
        this.cancelReader(source);
        let reader: RtcVideoStreamReader;
        try {
            reader = new this.rtc.VideoStream(track).getReader();
        } catch (err) {
            LogError(`[RoomVideoWatcher] could not open a video stream: ${err instanceof Error ? err.message : String(err)}`);
            this.retireSource(source, 'stream failed to open');
            return;
        }
        source.reader = reader;
        LogStatusEx({ message: `[RoomVideoWatcher] reading '${source.participant.identity}' ${source.kind}`, verboseOnly: true });
        void this.pump(source, reader);
    }

    /** Drains every frame of one stream until it ends or the watcher cancels it. */
    private async pump(source: WatchedSource, reader: RtcVideoStreamReader): Promise<void> {
        try {
            for (;;) {
                const result = await reader.read();
                if (result.done) {
                    break;
                }
                this.handleFrame(source, reader, result.value);
            }
        } catch (err) {
            if (source.reader === reader) {
                LogError(`[RoomVideoWatcher] video stream of '${source.participant.identity}' failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (source.reader === reader) {
            this.retireSource(source, 'stream ended'); // ended on its own (not cancelled by the watcher)
        }
    }

    /** A source whose stream failed or ended on its own: stop it, drop its subscription, and move on. */
    private retireSource(source: WatchedSource, reason: string): void {
        this.endSource(source, reason);
        DropVideoSubscription(source.publication);
        this.fillFreeSlots(source.publication);
    }

    /**
     * Samples one frame: counts it, drops it when the source's next frame is not due or an earlier frame of the source is
     * still being encoded, checks consent, and sends it to the encoder. Never waits for the encode: the stream keeps
     * being drained while it runs.
     */
    private handleFrame(source: WatchedSource, reader: RtcVideoStreamReader, event: RtcVideoFrameEvent): void {
        this.telemetry.framesReceived++;
        const arrivedAt = this.now();
        if (source.lastSampledAtMs !== undefined && arrivedAt - source.lastSampledAtMs < this.intervalMs) {
            this.telemetry.framesSkippedNotDue++;
            return;
        }
        if (source.encoding) {
            this.telemetry.framesSkippedEncoding++;
            return;
        }
        if (!this.mayEmit(source, reader)) {
            return; // consent first: a frame of someone who no longer lets agents see is never copied or sent
        }
        this.send({ source, reader, sentAtMs: arrivedAt, timestampMs: Date.now() }, event);
    }

    /**
     * Sends one frame to the encoder: anchors the source's pacing, marks it in flight, and settles the reply later. The
     * encode promise always gets a rejection handler (an unhandled one would end a media worker).
     */
    private send(sent: SentFrame, event: RtcVideoFrameEvent): void {
        sent.source.lastSampledAtMs = sent.sentAtMs;
        sent.source.encoding = true;
        this.telemetry.encodeInFlight++;
        let encoding: Promise<TimedEncodedVideoFrame>;
        try {
            encoding = this.encoder.Encode(event.frame, this.encodeOptionsFor(sent.source, event));
        } catch (err) {
            encoding = Promise.reject(err);
        }
        this.telemetry.encodeDispatchMsMax = Math.max(this.telemetry.encodeDispatchMsMax, this.now() - sent.sentAtMs);
        void encoding.then(
            (encoded) => this.finishEncode(sent, encoded),
            (err: unknown) => this.failEncode(sent, err),
        );
    }

    private encodeOptionsFor(source: WatchedSource, event: RtcVideoFrameEvent): RoomVideoFrameEncodeOptions {
        return {
            RotationDegrees: this.rotationDegreesOf(event.rotation),
            MaxDimension: source.kind === 'screen' ? this.screenMaxDimension : this.cameraMaxDimension,
            Quality: this.jpegQuality,
            I420Type: this.rtc.VideoBufferType.I420,
        };
    }

    /** A JPEG came back: emitted only if the source is still read through the same reader and consent still holds. */
    private finishEncode(sent: SentFrame, encoded: TimedEncodedVideoFrame): void {
        this.settleEncode(sent);
        const roundTripMs = this.now() - sent.sentAtMs;
        this.telemetry.encodeMsLast = encoded.EncodeMs;
        this.telemetry.encodeMsMax = Math.max(this.telemetry.encodeMsMax, encoded.EncodeMs);
        this.telemetry.encodeRoundTripMsLast = roundTripMs;
        this.telemetry.encodeRoundTripMsMax = Math.max(this.telemetry.encodeRoundTripMsMax, roundTripMs);
        if (this.mayEmit(sent.source, sent.reader)) {
            this.emit(sent, encoded);
        } else {
            this.telemetry.framesDroppedAfterEncode++;
        }
    }

    /** The frame could not be encoded: logged; the source waits out the interval (anchored when it was sent). */
    private failEncode(sent: SentFrame, err: unknown): void {
        this.settleEncode(sent);
        this.telemetry.encodeFailures++;
        LogError(`[RoomVideoWatcher] encoding a frame of '${sent.source.participant.identity}' failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    private settleEncode(sent: SentFrame): void {
        sent.source.encoding = false;
        this.telemetry.encodeInFlight--;
    }

    /**
     * Checked before a frame is sent to the encoder and again when its JPEG returns: the watcher is running, the source is
     * still read through this reader, and the participant still lets agents see. An opt-out during an encode wins.
     */
    private mayEmit(source: WatchedSource, reader: RtcVideoStreamReader): boolean {
        return !this.stopped && source.reader === reader && this.isEligible(source.publication, source.participant);
    }

    private emit(sent: SentFrame, encoded: TimedEncodedVideoFrame): void {
        const source = sent.source;
        source.sentAny = true;
        this.telemetry.framesSent++;
        this.telemetry.bytesSent += encoded.Data.byteLength;
        const frame: NativeRoomVideoFrame = {
            data: encoded.Data,
            mimeType: 'image/jpeg',
            participantIdentity: source.participant.identity,
            name: source.participant.name,
            source: source.kind,
            width: encoded.Width,
            height: encoded.Height,
            timestampMs: sent.timestampMs,
        };
        this.deliver('frame', () => this.onFrame(frame));
    }

    /** The SDK's rotation enum as clockwise degrees (WebRTC's convention). VERIFY against @livekit/rtc-node. */
    private rotationDegreesOf(rotation: number): VideoRotationDegrees {
        const r = this.rtc.VideoRotation;
        if (rotation === r.VIDEO_ROTATION_90) {
            return 90;
        }
        if (rotation === r.VIDEO_ROTATION_180) {
            return 180;
        }
        return rotation === r.VIDEO_ROTATION_270 ? 270 : 0;
    }

    /** Cancels a source's reader (best-effort); its pending `read()` then resolves `done`. */
    private cancelReader(source: WatchedSource): void {
        const reader = source.reader;
        source.reader = undefined;
        if (!reader) {
            return;
        }
        const logFailure = (err: unknown): void =>
            LogError(`[RoomVideoWatcher] cancelling a video stream failed: ${err instanceof Error ? err.message : String(err)}`);
        try {
            reader.cancel('video source stopped').catch(logFailure);
        } catch (err) {
            logFailure(err);
        }
    }

    /** Runs a consumer callback; a throwing consumer must not stop the source. */
    private deliver(what: string, callback: () => void): void {
        try {
            callback();
        } catch (err) {
            LogError(`[RoomVideoWatcher] the ${what} handler threw: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
