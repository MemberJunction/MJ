/**
 * @fileoverview {@link AvatarPublisher}: the meeting bot shows an agent's live avatar. It takes the model's avatar pieces
 * (fragmented MP4), reads them with Core's fMP4 reader, feeds two long-lived ffmpeg decoders (H.264 Annex B → I420,
 * AAC with ADTS → PCM), queues the voice on the bot's existing audio track and shows each frame on a camera track when
 * the voice's playout reaches the frame's timestamp ({@link AvatarMediaClock}).
 *
 * - **Publishing.** The camera track is published at the first decoded frame, so nobody sees a black tile before the
 *   agent first speaks. After a barge-in, and between turns, the last frame stays on screen.
 * - **Pacing.** A frame is shown when the voice's playout reaches it; when several are due at once only the newest is
 *   shown, and one more than {@link AVATAR_MAX_LATE_MS} late is dropped (late frames are never burst out).
 * - **Back-pressure.** At most {@link AVATAR_FRAME_QUEUE_LIMIT} decoded frames wait; then the video decoder's output is
 *   paused, so ffmpeg stops reading and the compressed backlog waits in Node.
 * - **Barge-in** ({@link AvatarPublisher.Flush}): queued frames are dropped and both decoders are fenced, so frames and
 *   voice decoded from before the barge-in are discarded as they come out.
 * - **Failure.** A decoder that dies is restarted (the video one resumes at the next key frame). After
 *   {@link AVATAR_DECODER_MAX_FAILURES} failures of one decoder within {@link AVATAR_DECODER_FAILURE_WINDOW_MS}, or when the
 *   room refuses the camera track, the avatar goes audio only: the video track is unpublished, the bot's `mj.agentAvatar`
 *   attribute says why, and the status reaches the engine, which replaces the model session with an audio-only one.
 *
 * Runs on the thread that hosts the room (MJAPI's main thread, or the media worker); the decoders are child processes.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import {
    AdtsHeader,
    AgentAvatarAudioOnlyAttributes,
    AvccToAnnexB,
    ReadFmp4Fragment,
    ReadFmp4Init,
    SniffFmp4Piece,
    type Fmp4Init,
    type Fmp4Sample,
    type Fmp4Track,
} from '@memberjunction/ai';
import type { NativeAvatarFailure, NativeAvatarMediaChunk, NativeAvatarStatus } from '@memberjunction/ai-bridge-livekit';
import { LogError, LogStatus } from '@memberjunction/core';
import { AvatarAacDecoder, type AvatarAudioDecoderOptions, type AvatarPcmChunk, type IAvatarAudioDecoder } from './avatar-aac-decoder';
import { AvatarH264Decoder, type AvatarVideoDecoderOptions, type AvatarVideoFrame, type IAvatarVideoDecoder } from './avatar-h264-decoder';
import { AvatarMediaClock } from './avatar-media-clock';
import { FfmpegLocator, type FfmpegProbeResult } from './ffmpeg-locator';

/** Decoded frames that may wait to be shown; then the video decoder's output is paused. */
export const AVATAR_FRAME_QUEUE_LIMIT = 24;
/** Failures of one decoder within {@link AVATAR_DECODER_FAILURE_WINDOW_MS} that take the avatar down. */
export const AVATAR_DECODER_MAX_FAILURES = 3;
/** The window (ms) over which a decoder's failures are counted. */
export const AVATAR_DECODER_FAILURE_WINDOW_MS = 60_000;
/** How often (ms) queued frames are checked against the voice's playout. */
export const AVATAR_FRAME_TICK_MS = 10;
/**
 * A frame this late (ms past its time in the voice's playout) is dropped rather than shown. ffmpeg holds a turn's last
 * frames until more video comes, so they come out when the next turn starts; showing them then would snap the face back
 * to the previous turn's last pose.
 */
export const AVATAR_MAX_LATE_MS = 500;
/** Avatar pieces held while ffmpeg is probed (about 4 s of avatar); older ones are dropped. */
const MAX_PIECES_BEFORE_PROBE = 200;

/** A usable ffmpeg, as the probe found it. */
export type AvailableFfmpeg = Extract<FfmpegProbeResult, { Available: true }>;

/** The bot's voice queue, which the avatar's voice joins and whose playout is the avatar's clock. */
export interface AvatarVoiceQueue {
    /** How much audio (ms) the queue has taken in all, flushed audio excluded. */
    EnqueuedMs(): number;
    /** How much of it (ms) has played: what the audio source took, less what still waits in it. */
    PlayedMs(): number;
    /** Queues decoded voice behind whatever is already queued. */
    Enqueue(samples: Int16Array): void;
}

/** The room side of the avatar's video: the camera track and the bot's attributes. */
export interface AvatarVideoOutlet {
    /** Publishes the camera track for frames of this size. Rejects when the room refuses it. */
    Publish(width: number, height: number): Promise<void>;
    /** Shows one frame on the published track. */
    Capture(frame: AvatarVideoFrame): void;
    /** Takes the camera track down. */
    Unpublish(): Promise<void>;
    /** Sets the bot's participant attributes. */
    SetAttributes(attributes: Record<string, string>): Promise<void>;
}

/** Creates the two decoders (tests pass fakes). */
export interface AvatarDecoderFactory {
    Video(options: AvatarVideoDecoderOptions, ffmpeg: AvailableFfmpeg): IAvatarVideoDecoder;
    Audio(options: AvatarAudioDecoderOptions, ffmpeg: AvailableFfmpeg): IAvatarAudioDecoder;
}

/** The real decoders: ffmpeg child processes. */
export const FfmpegAvatarDecoders: AvatarDecoderFactory = {
    Video: (options, ffmpeg) => new AvatarH264Decoder(options, ffmpeg.Path, ffmpeg.Version),
    Audio: (options, ffmpeg) => new AvatarAacDecoder(options, ffmpeg.Path),
};

/** What an {@link AvatarPublisher} works with. */
export interface AvatarPublisherOptions {
    /** The bot's voice queue. */
    Voice: AvatarVoiceQueue;
    /** The room side of the video. */
    Video: AvatarVideoOutlet;
    /** The voice track's rate (Hz): the voice decoder's output rate. */
    SampleRate: number;
    /** Receives each change in what the room is shown. */
    OnStatus: (status: NativeAvatarStatus) => void;
    /** Finds ffmpeg. Default: this thread's {@link FfmpegLocator}. */
    Probe?: () => Promise<FfmpegProbeResult>;
    /** Creates the decoders. Default {@link FfmpegAvatarDecoders}. */
    Decoders?: AvatarDecoderFactory;
    /** Monotonic clock (ms). Default `performance.now()`. */
    Now?: () => number;
    /** How much earlier than its audio a frame is shown (ms). Default 0. */
    LeadMs?: number;
}

/** A decoded frame waiting to be shown. */
interface QueuedFrame {
    Frame: AvatarVideoFrame;
    ArrivedAt: number;
}

/** Whether a queued frame is shown now, waits, or is dropped. */
type FrameVerdict = 'show' | 'wait' | 'drop';

/** Where the publisher stands: starting (ffmpeg being probed), showing the avatar, or audio only; retired drops everything. */
type PublisherState = 'starting' | 'running' | 'audio-only' | 'retired';

/** One room client's avatar: decoders, clock, frame queue and camera track. */
export class AvatarPublisher {
    private state: PublisherState = 'starting';
    private ffmpeg: AvailableFfmpeg | null = null;
    private readonly waiting: Uint8Array[] = [];
    private init: Fmp4Init | null = null;
    private videoTrack: Fmp4Track | null = null;
    private audioTrack: Fmp4Track | null = null;
    private pendingMoof: Uint8Array | null = null;
    private video: IAvatarVideoDecoder | null = null;
    private audio: IAvatarAudioDecoder | null = null;
    private readonly failures: Record<'video' | 'audio', number[]> = { video: [], audio: [] };
    private needKeyFrame = true;
    private nextSeq = 0;
    private readonly clock: AvatarMediaClock;
    private frames: QueuedFrame[] = [];
    private outputPaused = false;
    private publishing: 'no' | 'pending' | 'yes' = 'no';
    private pendingShow: AvatarVideoFrame | null = null;
    private unsyncedAnchor: { Epoch: number; Time: number; At: number } | null = null;
    private ticker: ReturnType<typeof setTimeout> | null = null;
    private readonly reported = new Set<string>();
    private readonly now: () => number;
    private readonly decoders: AvatarDecoderFactory;

    /** Starts probing ffmpeg at once; pieces that arrive meanwhile wait. */
    constructor(private readonly options: AvatarPublisherOptions) {
        this.now = options.Now ?? (() => performance.now());
        this.decoders = options.Decoders ?? FfmpegAvatarDecoders;
        this.clock = new AvatarMediaClock(options.LeadMs ?? 0);
        void (options.Probe ?? (() => FfmpegLocator.Instance.Probe()))().then((result) => this.start(result));
    }

    /** Whether the avatar was taken down: the agent is heard without it. */
    public get IsAudioOnly(): boolean {
        return this.state === 'audio-only' || this.state === 'retired';
    }

    /** How many decoded frames wait to be shown (telemetry, tests). */
    public get QueuedFrames(): number {
        return this.frames.length;
    }

    /**
     * Takes one avatar piece: an init segment (re)configures the decoders; a fragment's samples go to them. Never throws.
     *
     * @param chunk The piece.
     */
    public Accept(chunk: NativeAvatarMediaChunk): void {
        const bytes = new Uint8Array(chunk.data);
        if (this.state === 'retired') {
            return;
        }
        if (this.state === 'starting') {
            this.waiting.push(bytes);
            this.waiting.splice(0, Math.max(0, this.waiting.length - MAX_PIECES_BEFORE_PROBE));
            return;
        }
        this.acceptSafely(bytes);
    }

    /**
     * A barge-in: drops the frames waiting to be shown and fences both decoders, so what was decoded from before the
     * barge-in is discarded. The last frame shown stays on screen. Pieces held while ffmpeg is probed are dropped too,
     * except the newest init segment, which the next fragments may still need.
     */
    public Flush(): void {
        this.frames = [];
        this.pendingShow = null;
        this.pendingMoof = null;
        this.unsyncedAnchor = null;
        this.dropWaitingMedia();
        this.video?.Fence();
        this.audio?.Fence();
        this.clock.Reset();
        this.resumeOutput();
    }

    /**
     * No more avatar: the audio-only replacement session's voice is playing, or a media worker rejoined after the avatar
     * was taken down. The decoders stop and later pieces are dropped.
     */
    public Retire(): void {
        this.Dispose();
        this.state = 'retired';
    }

    /** Stops the decoders and the frame clock. The room's teardown takes the track down. */
    public Dispose(): void {
        this.stopTicker();
        this.video?.Dispose();
        this.audio?.Dispose();
        this.video = null;
        this.audio = null;
        this.frames = [];
        this.waiting.length = 0;
    }

    // ── Start ───────────────────────────────────────────────────────────────────

    /** The probe answered: with a usable ffmpeg the pieces that waited are taken; without one the avatar goes audio only. */
    private start(result: FfmpegProbeResult): void {
        if (this.state !== 'starting') {
            return;
        }
        if (result.Available === false) {
            LogError(`[AvatarPublisher] no usable ffmpeg on this thread (${result.Reason}); the avatar is taken down.`);
            this.fallBack('decoder-failed');
            return;
        }
        this.ffmpeg = result;
        this.state = 'running';
        for (const bytes of this.waiting.splice(0)) {
            this.acceptSafely(bytes);
        }
    }

    /** Drops the pieces held while ffmpeg is probed, all but the newest init segment. */
    private dropWaitingMedia(): void {
        const init = [...this.waiting].reverse().find((piece) => SniffFmp4Piece(piece) === 'init');
        this.waiting.length = 0;
        if (init) {
            this.waiting.push(init);
        }
    }

    // ── Pieces ──────────────────────────────────────────────────────────────────

    private acceptSafely(bytes: Uint8Array): void {
        try {
            this.acceptPiece(bytes);
        } catch (err) {
            this.reportOnce('piece-error', `[AvatarPublisher] an avatar piece could not be read: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private acceptPiece(received: Uint8Array): void {
        const bytes = this.pendingMoof ? concatBytes(this.pendingMoof, received) : received;
        this.pendingMoof = null;
        const kind = SniffFmp4Piece(bytes);
        if (kind === 'init') {
            this.applyInit(bytes);
        } else if (kind === 'fragment') {
            this.applyFragment(bytes);
        } else {
            this.reportOnce('not-mp4', '[AvatarPublisher] dropped an avatar piece that is not fragmented MP4.');
        }
    }

    /** A new init segment: a new stream on the timeline, and new decoders where the configuration changed. */
    private applyInit(bytes: Uint8Array): void {
        const init = ReadFmp4Init(bytes);
        if (!init) {
            this.reportOnce('bad-init', '[AvatarPublisher] dropped an unreadable init segment.');
            return;
        }
        const video = init.Tracks.find((t) => t.Handler === 'vide' && t.Avc && t.Width && t.Height && t.Timescale) ?? null;
        const audio = init.Tracks.find((t) => t.Handler === 'soun' && t.Aac && t.Timescale) ?? null;
        if (!sameVideoConfig(this.videoTrack, video)) {
            this.replaceVideoDecoder(video);
        }
        if (!sameAudioConfig(this.audioTrack, audio)) {
            this.replaceAudioDecoder(audio);
        }
        this.init = init;
        this.videoTrack = video;
        this.audioTrack = audio;
        this.clock.NewStream();
    }

    /** A media fragment: each sample to its decoder; a `moof` that came without its `mdat` waits for the next piece. */
    private applyFragment(bytes: Uint8Array): void {
        const fragment = ReadFmp4Fragment(bytes, this.init);
        if (!fragment) {
            this.reportOnce('bad-fragment', '[AvatarPublisher] dropped an unreadable media fragment.');
            return;
        }
        if (fragment.Samples.some((s) => s.Data === null)) {
            if (isLoneMoof(bytes)) {
                this.pendingMoof = bytes; // its mdat comes in the next piece
            } else {
                this.reportOnce('short-mdat', "[AvatarPublisher] dropped a media fragment whose samples run past its mdat.");
            }
            return;
        }
        for (const sample of fragment.Samples) {
            if (sample.TrackID === this.videoTrack?.TrackID) {
                this.decodeVideo(sample, this.videoTrack);
            } else if (sample.TrackID === this.audioTrack?.TrackID) {
                this.decodeAudio(sample, this.audioTrack);
            }
        }
    }

    private decodeVideo(sample: Fmp4Sample, track: Fmp4Track): void {
        if (this.state !== 'running' || !this.video || !track.Avc || !sample.Data) {
            return;
        }
        const unit = AvccToAnnexB(sample.Data, track.Avc);
        if (!unit || (this.needKeyFrame && !unit.IsKeyFrame)) {
            return; // a decoder (re)starts at a key frame
        }
        this.needKeyFrame = false;
        const time = presentationTime(sample, track);
        this.video.Decode({ Seq: this.nextSeq++, Epoch: this.clock.EpochFor('video', time), Time: time, Data: unit.Data });
    }

    private decodeAudio(sample: Fmp4Sample, track: Fmp4Track): void {
        const header = track.Aac && sample.Data ? AdtsHeader(track.Aac, sample.Data.length) : null;
        if (!this.audio || !header || !sample.Data || !track.Timescale) {
            return;
        }
        const time = presentationTime(sample, track);
        const rate = this.options.SampleRate;
        const decoded = Math.round(((track.Aac?.FrameLength ?? 1024) * rate) / (track.Aac?.SampleRate ?? rate));
        const declared = Math.round((sample.Duration / track.Timescale) * rate);
        this.audio.Decode({ Seq: this.nextSeq++, Epoch: this.clock.EpochFor('audio', time), Time: time, DecodedSamples: decoded, Samples: declared, Data: concatBytes(header, sample.Data) });
    }

    // ── Decoders ────────────────────────────────────────────────────────────────

    private replaceVideoDecoder(track: Fmp4Track | null): void {
        this.video?.Dispose();
        this.video = null;
        this.needKeyFrame = true;
        if (track && this.ffmpeg && this.state === 'running') {
            this.video = this.decoders.Video(
                { Width: track.Width!, Height: track.Height!, OnFrame: (frame) => this.onFrame(frame), OnFailure: (reason) => this.onDecoderFailure('video', reason) },
                this.ffmpeg,
            );
        }
    }

    private replaceAudioDecoder(track: Fmp4Track | null): void {
        this.audio?.Dispose();
        this.audio = null;
        if (track && this.ffmpeg && this.state !== 'retired') {
            this.audio = this.decoders.Audio(
                { SampleRate: this.options.SampleRate, OnPcm: (chunk) => this.onPcm(chunk), OnFailure: (reason) => this.onDecoderFailure('audio', reason) },
                this.ffmpeg,
            );
        }
    }

    /**
     * A decoder died: restarted, unless it failed {@link AVATAR_DECODER_MAX_FAILURES} times within the window, which takes
     * the avatar down (a dead voice decoder too: the audio-only session brings the voice back as PCM).
     */
    private onDecoderFailure(kind: 'video' | 'audio', reason: string): void {
        LogError(`[AvatarPublisher] ${reason}`);
        const at = this.now();
        const recent = this.failures[kind].filter((t) => at - t < AVATAR_DECODER_FAILURE_WINDOW_MS);
        recent.push(at);
        this.failures[kind] = recent;
        if (recent.length >= AVATAR_DECODER_MAX_FAILURES) {
            this.fallBack('decoder-failed', kind);
            return;
        }
        if (kind === 'video') {
            this.replaceVideoDecoder(this.videoTrack);
        } else {
            this.replaceAudioDecoder(this.audioTrack);
        }
    }

    // ── Voice ───────────────────────────────────────────────────────────────────

    /** Decoded voice joins the bot's voice queue, anchored on the clock where it entered. */
    private onPcm(chunk: AvatarPcmChunk): void {
        if (this.clock.IsStale(chunk.Epoch) || this.state === 'retired') {
            return;
        }
        this.clock.NoteAudio(chunk.Epoch, chunk.Time, chunk.Pcm.length / this.options.SampleRate, this.options.Voice.EnqueuedMs());
        this.options.Voice.Enqueue(chunk.Pcm);
        if (this.frames.length > 0) {
            this.ensureTicker(); // frames that waited for this audio may be due now
        }
    }

    // ── Frames ──────────────────────────────────────────────────────────────────

    private onFrame(frame: AvatarVideoFrame): void {
        if (this.clock.IsStale(frame.Epoch) || this.state !== 'running') {
            return;
        }
        this.frames.push({ Frame: frame, ArrivedAt: this.now() });
        if (this.frames.length >= AVATAR_FRAME_QUEUE_LIMIT && !this.outputPaused) {
            this.outputPaused = true;
            this.video?.PauseOutput();
        }
        this.ensureTicker();
    }

    /** Shows the newest frame that is due; earlier due frames are dropped (late frames are not burst out). */
    private tick(): void {
        this.ticker = null;
        const played = this.options.Voice.PlayedMs();
        const now = this.now();
        let due: AvatarVideoFrame | null = null;
        while (this.frames.length > 0) {
            const verdict = this.verdict(this.frames[0], played, now);
            if (verdict === 'wait') {
                break;
            }
            const entry = this.frames.shift()!;
            due = verdict === 'show' ? entry.Frame : due;
        }
        if (due) {
            this.show(due);
        }
        if (this.frames.length < AVATAR_FRAME_QUEUE_LIMIT) {
            this.resumeOutput();
        }
        if (this.frames.length > 0) {
            this.ensureTicker();
        }
    }

    private verdict(entry: QueuedFrame, played: number, now: number): FrameVerdict {
        const { Epoch: epoch, Time: time } = entry.Frame;
        const timing = this.clock.Timing(epoch, time, now - entry.ArrivedAt);
        switch (timing.Kind) {
            case 'stale':
                return 'drop';
            case 'waiting':
                return 'wait';
            case 'synced':
                this.unsyncedAnchor = null;
                if (played - timing.DueAtPlayedMs > AVATAR_MAX_LATE_MS) {
                    return 'drop';
                }
                return played >= timing.DueAtPlayedMs ? 'show' : 'wait';
            default:
                return this.unsyncedVerdict(epoch, time, now);
        }
    }

    /** A frame no audio comes for: paced by its own timestamps from the first such frame shown. */
    private unsyncedVerdict(epoch: number, time: number, now: number): FrameVerdict {
        const anchor = this.unsyncedAnchor;
        if (!anchor || anchor.Epoch !== epoch || time < anchor.Time) {
            this.unsyncedAnchor = { Epoch: epoch, Time: time, At: now };
            return 'show';
        }
        return now - anchor.At >= (time - anchor.Time) * 1000 ? 'show' : 'wait';
    }

    /** Shows a frame; the first one publishes the camera track. */
    private show(frame: AvatarVideoFrame): void {
        if (this.publishing === 'yes') {
            this.options.Video.Capture(frame);
            return;
        }
        this.pendingShow = frame;
        if (this.publishing === 'no') {
            this.publishing = 'pending';
            this.options.Video.Publish(frame.Width, frame.Height).then(
                () => this.onPublished(),
                (err: unknown) => this.onPublishFailed(err),
            );
        }
    }

    private onPublished(): void {
        if (this.state !== 'running') {
            void this.options.Video.Unpublish().catch(() => undefined);
            return;
        }
        this.publishing = 'yes';
        LogStatus("[AvatarPublisher] the agent's avatar is published in the room");
        this.options.OnStatus({ state: 'on' });
        if (this.pendingShow) {
            this.options.Video.Capture(this.pendingShow);
            this.pendingShow = null;
        }
    }

    private onPublishFailed(err: unknown): void {
        LogError(`[AvatarPublisher] the room refused the avatar's camera track: ${err instanceof Error ? err.message : String(err)}`);
        this.publishing = 'no';
        this.fallBack('publish-failed');
    }

    // ── Audio only ──────────────────────────────────────────────────────────────

    /**
     * Takes the avatar down: no more frames, the camera track unpublished, the bot's attribute set, the engine told. The
     * voice decoder keeps the agent audible unless it is the one that failed.
     */
    private fallBack(reason: NativeAvatarFailure, failed?: 'video' | 'audio'): void {
        if (this.state === 'audio-only' || this.state === 'retired') {
            return;
        }
        this.state = 'audio-only';
        this.stopTicker();
        this.video?.Dispose();
        this.video = null;
        this.frames = [];
        if (failed === 'audio' || !this.ffmpeg) {
            this.audio?.Dispose();
            this.audio = null;
        }
        if (this.publishing === 'yes') {
            void this.options.Video.Unpublish().catch((err: unknown) => LogError(`[AvatarPublisher] unpublishing the avatar failed: ${err instanceof Error ? err.message : String(err)}`));
        }
        void this.options.Video.SetAttributes(AgentAvatarAudioOnlyAttributes(reason)).catch((err: unknown) =>
            LogError(`[AvatarPublisher] setting the bot's avatar attribute failed: ${err instanceof Error ? err.message : String(err)}`),
        );
        LogStatus(`[AvatarPublisher] the avatar is taken down (${reason}); the agent goes on audio only.`);
        this.options.OnStatus({ state: 'audio-only', reason });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private ensureTicker(): void {
        if (!this.ticker && this.state === 'running') {
            this.ticker = setTimeout(() => this.tick(), AVATAR_FRAME_TICK_MS);
            this.ticker.unref?.();
        }
    }

    private stopTicker(): void {
        if (this.ticker) {
            clearTimeout(this.ticker);
            this.ticker = null;
        }
    }

    private resumeOutput(): void {
        if (this.outputPaused) {
            this.outputPaused = false;
            this.video?.ResumeOutput();
        }
    }

    private reportOnce(key: string, message: string): void {
        if (!this.reported.has(key)) {
            this.reported.add(key);
            LogError(message);
        }
    }
}

/** A sample's presentation time in seconds on its track's timeline. */
function presentationTime(sample: Fmp4Sample, track: Fmp4Track): number {
    return (sample.DecodeTime + sample.CompositionOffset) / (track.Timescale ?? 1);
}

/** Whether a piece is one `moof` box and nothing else: its `mdat` comes in the next piece. */
function isLoneMoof(bytes: Uint8Array): boolean {
    const size = bytes.length >= 8 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) : 0;
    return size === bytes.length && String.fromCharCode(...bytes.subarray(4, 8)) === 'moof';
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

function sameBytes(a: Uint8Array[] | undefined, b: Uint8Array[] | undefined): boolean {
    return (a ?? []).length === (b ?? []).length && (a ?? []).every((x, i) => x.length === b![i].length && x.every((v, j) => v === b![i][j]));
}

/** Whether two video tracks decode the same way: same size and parameter sets. */
function sameVideoConfig(a: Fmp4Track | null, b: Fmp4Track | null): boolean {
    if (!a || !b) {
        return a === b;
    }
    return a.Width === b.Width && a.Height === b.Height && a.Avc?.NalLengthSize === b.Avc?.NalLengthSize && sameBytes(a.Avc?.Sps, b.Avc?.Sps) && sameBytes(a.Avc?.Pps, b.Avc?.Pps);
}

/** Whether two audio tracks decode the same way: same object type, rate and channels. */
function sameAudioConfig(a: Fmp4Track | null, b: Fmp4Track | null): boolean {
    if (!a || !b) {
        return a === b;
    }
    return a.Aac?.ObjectType === b.Aac?.ObjectType && a.Aac?.SampleRate === b.Aac?.SampleRate && a.Aac?.Channels === b.Aac?.Channels;
}
