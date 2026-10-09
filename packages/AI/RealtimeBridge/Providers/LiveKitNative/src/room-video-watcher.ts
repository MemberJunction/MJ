/**
 * @fileoverview Participant video inside the agent's bot: which cameras and screens it may read, which ones it shows the
 * model, how often it samples them, and teardown.
 *
 * ## Rules
 * - **Eligible:** a remote participant who is not an agent (`agent-*`) and whose `mj.agentCanSee` attribute is `'true'`
 *   (`AllowsAgentVision`; any other value means no), publishing an unmuted camera (when `Cameras`) or screen share
 *   (when `Screens`).
 * - **Selection:** up to `Streams` sources at once, ranked by `video-source-policy.ts`: a shared screen first (the most
 *   recent), else the active speaker's camera once they have led the room's active-speaker list for the onset, else the
 *   camera being read, else the camera of whoever spoke last, else the first eligible camera in room order. A camera
 *   stays in view for the dwell after its first frame before another camera replaces it; a screen never waits. The
 *   ranking runs on every room event that can change it and on each active-speaker update; when the hold delays a
 *   change, one timer runs it again when the change falls due.
 * - **Speakers:** LiveKit's active-speaker list, people only. The bot itself and other agents never count.
 * - **Switching:** a source the ranking drops ends at once: its reader is cancelled, its subscription dropped, and it is
 *   reported ended when it sent a frame. The new one is subscribed, and reading starts when its track arrives (at once
 *   when it has just arrived). A source also ends when its owner stops letting agents see them, leaves, unpublishes or
 *   mutes it, when its stream ends, or when LiveKit refuses its subscription; none of these waits for the hold. A refused
 *   source, or one whose stream ended on its own, is passed over for {@link PASSED_OVER_MS} or until its publication or
 *   its owner's consent changes.
 * - **Subscriptions:** the bot joins with `autoSubscribe` (its hearing needs it), so every video track arrives
 *   subscribed. The watcher unsubscribes every video track it does not read.
 * - **Reading and pacing:** one `VideoStream` per selected source, drained frame by frame (the SDK enqueues every frame
 *   without backpressure, so the reader never waits for an encode). A frame is sent to the encoder only when the
 *   session's frame interval has passed since that source's last sent frame (the pacing anchor is set when a frame is
 *   sent), and only when no earlier frame of that source is still being encoded; a due frame that arrives meanwhile is
 *   dropped and counted.
 * - **Consent wins:** eligibility is checked before a frame is sent to the encoder (a frame of someone who no longer lets
 *   agents see is never copied) and again when its JPEG returns, so an opt-out during an encode drops that frame.
 * - **Ended:** when a source that sent at least one frame stops, for any reason including a switch,
 *   {@link RoomVideoWatcherOptions.OnSourceEnded} reports it (so the engine can tell the model). A source counts as
 *   having sent a frame only once one was emitted. {@link RoomVideoWatcher.Stop} (the bot leaving) reports nothing.
 *
 * Frames are read, sampled and checked on the thread that hosts the room (MJAPI's main loop in-process, or the media
 * worker with `MJ_LIVEKIT_WORKER_MEDIA=on`), and encoded through {@link RoomVideoWatcherOptions.Encoder}: by default on
 * that same thread, and on the encode worker's thread when the client was given {@link VideoEncodeWorkerHost} (the module
 * factory does). Room telemetry reports the cost and the switches.
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
import {
    ChooseVideoSources,
    DEFAULT_SPEAKER_HOLD_MS,
    DEFAULT_SPEAKER_ONSET_MS,
    NextVideoSpeakerLeader,
    type VideoSourceCandidate,
    type VideoSourcePick,
    type VideoSourcePolicyResult,
    type VideoSpeakerLeader,
} from './video-source-policy';

/** How long (ms) a source LiveKit refused, or whose stream ended on its own, is passed over before it may be picked again. */
export const PASSED_OVER_MS = 10_000;

/** The most ranking passes one room event runs: a pick that fails at once (a subscription that throws) tries the next. */
const MAX_RANKING_PASSES = 8;

/** Added to a delayed change's wait, so the ranking it triggers is never a hair early on a clock that ticks coarsely. */
const TIMER_SLACK_MS = 1;

/** Runs a callback once after a delay (ms); returns a function that cancels it. */
export type RoomVideoWatcherTimer = (callback: () => void, delayMs: number) => () => void;

/** The default {@link RoomVideoWatcherTimer}: `setTimeout`, `unref`'d so it never keeps the process alive. */
function defaultTimer(callback: () => void, delayMs: number): () => void {
    const handle = setTimeout(callback, delayMs);
    handle.unref?.();
    return () => clearTimeout(handle);
}

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
    /**
     * Monotonic millisecond clock for pacing, the hold, the encode round trip and the default encoder's timing. Default
     * `performance.now()`.
     */
    Now?: () => number;
    /** Schedules the ranking a delayed switch needs, on the {@link Now} clock. Default: an `unref`'d `setTimeout`. */
    Timer?: RoomVideoWatcherTimer;
}

/** One selected source: subscribed (or being subscribed) and read. */
interface WatchedSource {
    /** The key the policy picked it under: the participant and the track sid. */
    key: string;
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
    /** When the policy picked it: the switch gap runs from here to its first frame. */
    chosenAtMs: number;
    /** When its first frame was emitted: the dwell starts here. */
    firstFrameAtMs?: number;
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
    sourceSwitches: number;
    switchesHeld: number;
    activeSpeakerUpdates: number;
    switchGapMsLast?: number;
    switchGapMsMax: number;
}

/** A source in the room the policy may pick, with the SDK objects behind it. */
interface EligibleSource {
    participant: RtcParticipant;
    publication: RtcTrackPublication;
}

/** One scan of the room: the policy's candidates, and the SDK objects behind each. */
interface RoomScan {
    candidates: VideoSourceCandidate[];
    sources: Map<string, EligibleSource>;
}

/** A track that has just arrived while the room is ranked: read at once if it is picked. */
interface ArrivingTrack {
    track: RtcTrack;
    publication: RtcTrackPublication;
    participant: RtcParticipant;
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
    private readonly onsetMs: number;
    private readonly holdMs: number;
    private readonly listParticipants: () => RtcParticipant[];
    private readonly onFrame: (frame: NativeRoomVideoFrame) => void;
    private readonly onSourceEnded: (source: NativeRoomVideoSourceEnd) => void;
    private readonly now: () => number;
    private readonly timer: RoomVideoWatcherTimer;
    private readonly encoder: IRoomVideoFrameEncoder;
    private readonly sources: WatchedSource[] = [];
    private stopped = false;

    /** When the bot learned of each screen share, by key: a higher number is more recent. */
    private readonly shareOrder = new Map<string, number>();
    private nextShareOrder = 1;
    /** The latest active-speaker list, people only, in LiveKit's order. */
    private speakerIdentities: string[] = [];
    /** Each person's last time in the active-speaker list. */
    private readonly lastSpokeAt = new Map<string, number>();
    /** The person leading the speaker list among those whose camera can be read, and since when. */
    private leader?: VideoSpeakerLeader;
    /** Sources passed over until a time, by key: refused, or their stream ended on its own. */
    private readonly passedOver = new Map<string, number>();
    /** Keys for publications that report no track sid (a fake, or an SDK change): one per object. */
    private readonly unnamedPublications = new WeakMap<RtcTrackPublication, number>();
    private nextUnnamed = 1;
    /** Cancels the pending ranking a delayed change needs; with when it is due. */
    private cancelTimer?: () => void;
    private timerDueAtMs?: number;
    /** The change the hold is delaying now, so each one is counted once. */
    private heldTarget?: string;
    /** A track that has just arrived and is being ranked. */
    private arriving?: ArrivingTrack;
    /** Whether a ranking is running, and whether another pass was asked for meanwhile. */
    private ranking = false;
    private rankAgain = false;

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
        sourceSwitches: 0,
        switchesHeld: 0,
        activeSpeakerUpdates: 0,
        switchGapMsMax: 0,
    };

    constructor(options: RoomVideoWatcherOptions) {
        this.rtc = options.Rtc;
        this.video = options.Video;
        this.streams = Number.isFinite(options.Video.Streams) ? Math.max(0, Math.floor(options.Video.Streams)) : 0;
        this.intervalMs = RealtimeVideoFrameIntervalMs(options.Video.Rate);
        this.cameraMaxDimension = positiveOr(options.Video.CameraMaxDimension, DEFAULT_CAMERA_MAX_DIMENSION);
        this.screenMaxDimension = positiveOr(options.Video.ScreenMaxDimension, DEFAULT_SCREEN_MAX_DIMENSION);
        this.jpegQuality = positiveOr(options.Video.JpegQuality, DEFAULT_JPEG_QUALITY);
        this.onsetMs = positiveOr(options.Video.SpeakerOnsetMs, DEFAULT_SPEAKER_ONSET_MS);
        this.holdMs = positiveOr(options.Video.SpeakerHoldMs, DEFAULT_SPEAKER_HOLD_MS);
        this.listParticipants = options.ListParticipants;
        this.onFrame = options.OnFrame;
        this.onSourceEnded = options.OnSourceEnded;
        this.now = options.Now ?? (() => performance.now());
        this.timer = options.Timer ?? defaultTimer;
        this.encoder = options.Encoder ?? new InProcessVideoFrameEncoder(this.now);
    }

    // ── room events ──────────────────────────────────────────────────────────────

    /** A video track reached the bot: read it when it is selected or the ranking picks it, else unsubscribe it. */
    public HandleTrackSubscribed(track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        this.noteShare(publication, participant);
        const source = this.findSource(publication, participant);
        if (source) {
            // Keep the SDK's current objects: after a full reconnect the same track sid may arrive on new ones.
            // VERIFY against @livekit/rtc-node: whether a full reconnect re-emits TrackSubscribed for subscribed tracks.
            source.publication = publication;
            source.participant = participant;
            this.startReading(source, track);
            return;
        }
        this.arriving = { track, publication, participant };
        try {
            this.rank();
        } finally {
            this.arriving = undefined;
        }
        if (!this.findSource(publication, participant)) {
            DropVideoSubscription(publication);
        }
    }

    /** A track stopped reaching the bot. Ends the source it carried; a source still waiting for its subscription stays. */
    public HandleTrackUnsubscribed(publication: RtcTrackPublication, participant: RtcParticipant): void {
        const source = this.findSource(publication, participant);
        if (!this.stopped && source?.reader) {
            this.endSource(source, 'unsubscribed');
            this.passOver(source.key);
            this.rank();
        }
    }

    /**
     * LiveKit refused a subscription the watcher asked for (`TrackSubscriptionFailed`, which names the track by sid). The
     * source is passed over for a while, and the next one is picked.
     */
    public HandleTrackSubscriptionFailed(trackSid: string, participant: RtcParticipant, error?: string): void {
        const source = this.sources.find((s) => s.publication.sid === trackSid && s.participant.identity === participant.identity);
        if (this.stopped || !source) {
            return;
        }
        LogError(`[RoomVideoWatcher] LiveKit refused the subscription to '${participant.identity}' ${source.kind}${error ? `: ${error}` : ''}`);
        this.endSource(source, 'subscription refused');
        this.passOver(source.key);
        this.rank();
    }

    /** A participant published a track: a screen share is stamped as the most recent, then the room is ranked. */
    public HandleTrackPublished(publication: RtcTrackPublication, participant: RtcParticipant | undefined): void {
        if (this.stopped || !participant) {
            return;
        }
        this.noteShare(publication, participant);
        this.rank();
    }

    /** A participant unpublished a track. */
    public HandleTrackUnpublished(publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        const key = this.keyOf(publication, participant);
        this.shareOrder.delete(key);
        this.passedOver.delete(key);
        const source = this.findSource(publication, participant);
        if (source) {
            this.endSource(source, 'unpublished');
        }
        this.rank();
    }

    /** A participant muted a track: a muted source is not read, nor received. */
    public HandleTrackMuted(publication: RtcTrackPublication, participant: RtcParticipant): void {
        const source = this.findSource(publication, participant);
        if (!this.stopped && source) {
            this.endSource(source, 'muted');
            DropVideoSubscription(publication);
            this.rank();
        }
    }

    /** A participant unmuted a track: it may be picked again at once. */
    public HandleTrackUnmuted(publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        this.passedOver.delete(this.keyOf(publication, participant));
        this.rank();
    }

    /** A participant's attributes changed: an opt-out stops their sources at once; an opt-in may be picked. */
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
        this.forgetPassedOver(participant);
        this.rank();
    }

    /** A participant left. */
    public HandleParticipantDisconnected(participant: RtcParticipant): void {
        if (this.stopped) {
            return;
        }
        for (const source of this.sourcesOf(participant)) {
            this.endSource(source, 'left');
        }
        this.forgetParticipant(participant);
        this.rank();
    }

    /**
     * LiveKit's active-speaker list changed (loudest first, VERIFY). Only people count: the bot itself and other agents are
     * dropped, and so is anyone not in the room's remote participants.
     */
    public HandleActiveSpeakersChanged(speakers: readonly RtcParticipant[]): void {
        if (this.stopped) {
            return;
        }
        this.telemetry.activeSpeakerUpdates++;
        const now = this.now();
        const present = new Set(this.listParticipants().map((p) => p.identity));
        this.speakerIdentities = speakers.map((p) => p.identity).filter((id) => present.has(id) && !IsAgentParticipantIdentity(id));
        for (const identity of this.speakerIdentities) {
            this.lastSpokeAt.set(identity, now);
        }
        this.rank(now);
    }

    /** The bot is leaving: cancels every reader and the pending ranking. Reports no ended sources. Idempotent. */
    public Stop(): void {
        this.stopped = true;
        this.cancelPendingRanking();
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

    // ── eligibility ──────────────────────────────────────────────────────────────

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

    /** A publication's key: its owner's prefix ({@link ownerPrefix}) and its track sid (or, without a sid, the object). */
    private keyOf(publication: RtcTrackPublication, participant: RtcParticipant): string {
        if (publication.sid !== undefined) {
            return `${this.ownerPrefix(participant)}${publication.sid}`;
        }
        let id = this.unnamedPublications.get(publication);
        if (id === undefined) {
            id = this.nextUnnamed++;
            this.unnamedPublications.set(publication, id);
        }
        return `${this.ownerPrefix(participant)}#${id}`;
    }

    /** The start of every key of a participant's publications; the length makes it unambiguous for any identity. */
    private ownerPrefix(participant: RtcParticipant): string {
        return `${participant.identity.length}:${participant.identity}/`;
    }

    // ── what the policy needs ────────────────────────────────────────────────────

    /** Stamps a screen share the first time the bot learns of it, so the newest share ranks first. */
    private noteShare(publication: RtcTrackPublication, participant: RtcParticipant): void {
        const key = this.keyOf(publication, participant);
        if (this.kindOf(publication) === 'screen' && !this.shareOrder.has(key)) {
            this.shareOrder.set(key, this.nextShareOrder++);
        }
    }

    /** Skips a source for {@link PASSED_OVER_MS}: it was refused, or its stream ended on its own. */
    private passOver(key: string): void {
        this.passedOver.set(key, this.now() + PASSED_OVER_MS);
    }

    private isPassedOver(key: string, nowMs: number): boolean {
        const until = this.passedOver.get(key);
        if (until !== undefined && nowMs >= until) {
            this.passedOver.delete(key);
        }
        return until !== undefined && nowMs < until;
    }

    /** A consent change: the participant's passed-over sources may be picked again. */
    private forgetPassedOver(participant: RtcParticipant): void {
        this.deleteKeysOf(this.passedOver, participant);
    }

    /** A participant left: drop what the watcher remembers about them. */
    private forgetParticipant(participant: RtcParticipant): void {
        this.deleteKeysOf(this.shareOrder, participant);
        this.forgetPassedOver(participant);
        this.lastSpokeAt.delete(participant.identity);
        this.speakerIdentities = this.speakerIdentities.filter((id) => id !== participant.identity);
    }

    /** Deletes every entry of a map keyed by publication key that belongs to the participant. */
    private deleteKeysOf<T>(map: Map<string, T>, participant: RtcParticipant): void {
        const prefix = this.ownerPrefix(participant);
        for (const key of [...map.keys()]) {
            if (key.startsWith(prefix)) {
                map.delete(key);
            }
        }
    }

    /**
     * The sources the policy may pick: every eligible camera and screen in the room, participants in join order and their
     * tracks in publish order, less those passed over. A share first seen here is stamped in that order.
     */
    private scanRoom(nowMs: number): RoomScan {
        const scan: RoomScan = { candidates: [], sources: new Map() };
        for (const participant of this.listParticipants()) {
            if (!this.isEligibleParticipant(participant)) {
                continue;
            }
            for (const publication of participant.trackPublications?.values() ?? []) {
                const key = this.keyOf(publication, participant);
                const kind = this.kindOf(publication);
                if (kind === undefined || !this.isEligiblePublication(publication) || this.isPassedOver(key, nowMs)) {
                    continue;
                }
                this.noteShare(publication, participant);
                scan.candidates.push({ Key: key, OwnerIdentity: participant.identity, Kind: kind, ShareOrder: this.shareOrder.get(key) ?? 0, RoomOrder: scan.candidates.length });
                scan.sources.set(key, { participant, publication });
            }
        }
        return scan;
    }

    // ── ranking and switching ────────────────────────────────────────────────────

    /**
     * Ranks the room and applies the picks. Re-entrant calls (a pick that ends at once, a handler that calls back) run as
     * another pass of the ranking already under way, never inside it.
     */
    private rank(nowMs?: number): void {
        if (this.stopped) {
            return;
        }
        if (this.ranking) {
            this.rankAgain = true;
            return;
        }
        this.ranking = true;
        try {
            let passes = 0;
            do {
                this.rankAgain = false;
                this.rankOnce(passes === 0 && nowMs !== undefined ? nowMs : this.now());
                passes++;
            } while (this.rankAgain && !this.stopped && passes < MAX_RANKING_PASSES);
        } finally {
            this.ranking = false;
        }
    }

    /** One pass: scan, update the speaker leader, ask the policy, switch, and schedule what the hold delays. */
    private rankOnce(nowMs: number): void {
        const scan = this.scanRoom(nowMs);
        const cameraOwners = new Set(scan.candidates.filter((c) => c.Kind === 'camera').map((c) => c.OwnerIdentity));
        this.leader = NextVideoSpeakerLeader(this.leader, this.speakerIdentities, cameraOwners, nowMs);
        const result = ChooseVideoSources({
            Candidates: scan.candidates,
            Selected: this.sources.map((s) => ({ Key: s.key, Kind: s.kind, FirstFrameAtMs: s.firstFrameAtMs })),
            Leader: this.leader,
            LastSpokeAtMs: this.lastSpokeAt,
            NowMs: nowMs,
            Streams: this.streams,
            OnsetMs: this.onsetMs,
            HoldMs: this.holdMs,
        });
        this.switchTo(result.Picks, scan, nowMs);
        this.countHeld(result);
        if (!this.stopped) {
            this.scheduleRanking(result.NextChangeAtMs, nowMs);
        }
    }

    /**
     * Ends every selected source the picks dropped (reported when it sent a frame; unsubscribed) and starts every pick not
     * yet selected. A dropped source that could still be read counts as a switch.
     */
    private switchTo(picks: readonly VideoSourcePick[], scan: RoomScan, nowMs: number): void {
        const picked = new Set(picks.map((p) => p.Key));
        const dropped = this.sources.filter((s) => !picked.has(s.key));
        const replaced = dropped.filter((s) => scan.sources.has(s.key));
        for (const source of dropped) {
            this.endSource(source, scan.sources.has(source.key) ? 'replaced' : 'no longer eligible');
            DropVideoSubscription(source.publication);
        }
        const added: Array<{ source: WatchedSource; reason: string }> = [];
        for (const pick of picks) {
            const eligible = scan.sources.get(pick.Key);
            if (eligible && !this.sources.some((s) => s.key === pick.Key)) {
                added.push({ source: this.addSource(eligible, pick.Key, nowMs), reason: pick.Reason });
            }
        }
        this.telemetry.sourceSwitches += replaced.length;
        this.logSwitch(replaced, added);
        for (const { source } of added) {
            this.startSource(source);
        }
    }

    private addSource(eligible: EligibleSource, key: string, nowMs: number): WatchedSource {
        const source: WatchedSource = {
            key,
            participant: eligible.participant,
            publication: eligible.publication,
            kind: this.kindOf(eligible.publication) ?? 'camera',
            encoding: false,
            sentAny: false,
            chosenAtMs: nowMs,
        };
        this.sources.push(source);
        return source;
    }

    /** Reads a picked source at once when its track has just arrived; otherwise asks the server for it. */
    private startSource(source: WatchedSource): void {
        const arriving = this.arriving;
        if (arriving && this.keyOf(arriving.publication, arriving.participant) === source.key) {
            source.publication = arriving.publication;
            source.participant = arriving.participant;
            this.startReading(source, arriving.track);
        } else {
            this.subscribe(source);
        }
    }

    /** Counts a change the hold delays, once per change. */
    private countHeld(result: VideoSourcePolicyResult): void {
        const target = result.NextChangeAtMs === undefined ? undefined : result.UnheldPicks.map((p) => p.Key).sort().join('|');
        if (target !== undefined && target !== this.heldTarget) {
            this.telemetry.switchesHeld++;
        }
        this.heldTarget = target;
    }

    /** Runs the ranking again when the change the hold delays falls due; cancels it when nothing is delayed. */
    private scheduleRanking(nextChangeAtMs: number | undefined, nowMs: number): void {
        if (nextChangeAtMs === this.timerDueAtMs) {
            return;
        }
        this.cancelPendingRanking();
        if (nextChangeAtMs === undefined) {
            return;
        }
        this.timerDueAtMs = nextChangeAtMs;
        this.cancelTimer = this.timer(() => {
            this.cancelTimer = undefined;
            this.timerDueAtMs = undefined;
            this.rank();
        }, Math.max(0, nextChangeAtMs - nowMs) + TIMER_SLACK_MS);
    }

    private cancelPendingRanking(): void {
        this.cancelTimer?.();
        this.cancelTimer = undefined;
        this.timerDueAtMs = undefined;
    }

    /** One verbose line per switch: what was dropped while it could still be read, what was picked, and why. */
    private logSwitch(replaced: readonly WatchedSource[], added: ReadonlyArray<{ source: WatchedSource; reason: string }>): void {
        if (replaced.length === 0) {
            return;
        }
        const from = replaced.map((s) => `'${s.participant.identity}' ${s.kind}`).join(', ');
        const to = added.map(({ source, reason }) => `'${source.participant.identity}' ${source.kind} (${reason})`).join(', ') || 'nothing';
        LogStatusEx({ message: `[RoomVideoWatcher] switching from ${from} to ${to}`, verboseOnly: true });
    }

    /** Asks the server to send a selected source. A failed request ends it, passes it over, and ranks again. */
    private subscribe(source: WatchedSource): void {
        try {
            source.publication.setSubscribed?.(true);
        } catch (err) {
            LogError(`[RoomVideoWatcher] subscribing a video track failed: ${err instanceof Error ? err.message : String(err)}`);
            this.endSource(source, 'subscribe failed');
            this.passOver(source.key);
            this.rank();
        }
    }

    /** Stops a source: frees its place, cancels its reader, and reports it when it sent a frame. */
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

    /** A source whose stream failed or ended on its own: stop it, drop its subscription, pass it over, and move on. */
    private retireSource(source: WatchedSource, reason: string): void {
        this.endSource(source, reason);
        DropVideoSubscription(source.publication);
        this.passOver(source.key);
        this.rank();
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
        if (!source.sentAny) {
            this.noteFirstFrame(source);
        }
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

    /** A source's first frame: its dwell starts, and the gap since it was picked is measured. */
    private noteFirstFrame(source: WatchedSource): void {
        const now = this.now();
        source.firstFrameAtMs = now;
        const gapMs = now - source.chosenAtMs;
        this.telemetry.switchGapMsLast = gapMs;
        this.telemetry.switchGapMsMax = Math.max(this.telemetry.switchGapMsMax, gapMs);
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
