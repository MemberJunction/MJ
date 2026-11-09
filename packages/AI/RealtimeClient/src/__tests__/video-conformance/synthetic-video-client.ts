/**
 * A synthetic video provider's client driver, for the conformance kit's own tests and as the worked example of a video
 * driver (G-5: any model with video output plugs in). It is built only on what the package exports to any provider:
 * `BaseRealtimeClient`, the PCM playback contract and its clock, `/media`'s player and source types, and Core's frame
 * types and fMP4 reader. Nothing outside this file changes for it.
 *
 * Its model talks over an in-memory wire (`synthetic-wire.ts`) that carries typed frames: fragmented MP4, encoded chunks
 * or images. The server's grant is the pact's `avatar` block. In `'playout'` mode the driver plays the frames through a
 * player it creates with {@link SyntheticVideoClient.CreateVideoPlayout}; when the pact says the voice is timed, it
 * queues each PCM chunk at its media time and gives the player its voice playback as the clock, so the face moves with the
 * voice. In `'stream'` mode the video arrives as a live stream, as a WebRTC provider's does. The model's answer is under
 * way from its transcript or its voice until the turn's generation completes: video outside an answer (a provider may
 * stream it between answers) plays, but is not the agent speaking. Each `SyntheticFaults` switch breaks one rule, so the
 * kit's tests show each check fails a driver that breaks it.
 *
 * Registered with no ClassFactory key: it is never resolved by a host.
 */
import {
    DEFAULT_REALTIME_AUDIO_TRACKS,
    Fmp4PieceToVideoFrame,
    Fmp4VideoSeconds,
    IsPcmAudioMimeType,
    ReadFmp4Init,
    SniffFmp4Piece,
    type ClientRealtimeSessionConfig,
    type Fmp4Init,
    type RealtimeTrackDescriptor,
    type RealtimeVideoFrame,
} from '@memberjunction/ai';
import { BaseRealtimeClient } from '../../generic/baseRealtimeClient';
import { RealtimePcmPlayback, type IRealtimePcmPlayback } from '../../audio/pcmPlayback';
import type { IPlaybackClock } from '../../media/playbackClock';
import { VideoPlayout, type IAvatarVideoPlayout, type VideoPlayoutOptions } from '../../media/videoPlayout';
import {
    ReadRequestedTracks,
    ReadSyntheticGrant,
    type SyntheticFaults,
    type SyntheticGrant,
    type SyntheticModelMessage,
    type SyntheticWire,
} from './synthetic-wire';

/** How the agent's video reaches the host. */
export type SyntheticVideoMode = 'playout' | 'stream';

/** What the current turn has done. */
interface SyntheticTurn {
    HasVideo: boolean;
    HasVoice: boolean;
    VideoEnded: boolean;
    /** From `interrupted` to `turn-complete`: the turn's late media is dropped. */
    Dropping: boolean;
    GenerationComplete: boolean;
}

function newTurn(): SyntheticTurn {
    return { HasVideo: false, HasVoice: false, VideoEnded: false, Dropping: false, GenerationComplete: false };
}

/** Whether a voice playback is also a clock a video player can follow. */
function isPlaybackClock(voice: IRealtimePcmPlayback): voice is IRealtimePcmPlayback & IPlaybackClock {
    return 'CurrentTimeMs' in voice;
}

/** The synthetic provider's client driver. */
export class SyntheticVideoClient extends BaseRealtimeClient {
    private voice: IRealtimePcmPlayback | null = null;
    private player: IAvatarVideoPlayout | null = null;
    private stream: MediaStream | null = null;
    private micStream: MediaStream | null = null;
    private grant: SyntheticGrant | null = null;
    private turn: SyntheticTurn = newTurn();
    private init: Fmp4Init | null = null;
    private pendingSeconds = 0;
    /** Seconds reported for the current turn, for the {@link SyntheticFaults.SecondsTwice} fault. */
    private turnSecondsReported = 0;
    private responseActive = false;
    /** Whether the model's answer is under way: video outside it is idle. */
    private answering = false;
    /** Frames handed to the player so far. */
    private framesHanded = 0;
    /** {@link framesHanded} just after the latest frame of an answer. 0 until one. */
    private answerEndsAtFrame = 0;
    private handedOverAgain = false;
    private readonly reported = new Set<string>();

    constructor(private readonly wire: SyntheticWire, private readonly mode: SyntheticVideoMode = 'playout', private readonly faults: SyntheticFaults = {}) {
        super();
    }

    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.AssertTransportSupported(config);
        this.micStream = micStream;
        this.emitStateChange('connecting');
        this.grant = ReadSyntheticGrant(config.SessionConfig);
        const requested = ReadRequestedTracks(config.SessionConfig);
        this.negotiate(requested);
        this.voice = this.CreatePlayback();
        this.prepareVideo(requested?.some((t) => t.Direction === 'outbound' && t.Modality === 'video') ?? false);
        const showsVideo = this.player !== null || this.stream !== null;
        this.wire.Attach(showsVideo && !this.faults.AsksForAudioOnly, (message) => this.handle(message));
        this.emitStateChange('connected');
        this.handOver();
        this.emitStateChange('listening');
    }

    public async Disconnect(): Promise<void> {
        if (!this.faults.NoSecondsAtDisconnect) {
            this.reportSeconds();
        }
        if (!this.faults.KeepsPlayerOnDisconnect) {
            this.player?.Dispose();
        }
        this.player = null;
        this.stream = null;
        this.voice?.Close();
        this.voice = null;
        this.wire.Detach();
        this.micStream?.getTracks().forEach((track) => track.stop());
        this.micStream = null;
        this.emitStateChange('closed');
    }

    public CancelActiveResponse(): void {
        this.voice?.Flush();
        this.player?.Flush();
        this.responseActive = false;
        this.answering = false;
    }

    public SendText(_text: string): void {
        // The synthetic model takes no typed input.
    }
    public SendContextNote(_text: string): void {
        // Nor context notes.
    }
    public RequestSpokenUpdate(_instructions: string): void {
        // Nor spoken updates.
    }
    public SendToolResult(_callID: string, _outputJson: string): void {
        // Nor tools.
    }
    public SetMuted(muted: boolean): void {
        this.micStream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
    }

    public get IsBusy(): boolean {
        return this.responseActive;
    }

    /** The voice, or the avatar's video while some of an answer's frames are still ahead of its playhead. */
    public get IsAudioPlaying(): boolean {
        return (this.voice?.IsPlaying ?? false) || this.answerVideoPlaying();
    }

    // ── Creation seams (a test wires its recorders in here) ──────────────────────────────────────────────────────

    /** The voice playback. Production: Web Audio at the provider's 24 kHz, which is also the voice's clock. */
    protected CreatePlayback(): IRealtimePcmPlayback {
        return new RealtimePcmPlayback(24000);
    }

    /** The avatar's video player. Production: `VideoPlayout`, which picks the decoder for each frame's type. */
    protected CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        return new VideoPlayout(options);
    }

    /** Whether this browser can play the avatar's type. */
    protected CanPlay(mimeType: string): boolean {
        return VideoPlayout.IsSupported(mimeType);
    }

    /** The avatar's live stream, in stream mode. Production would take it from the peer connection. */
    protected CreateRemoteStream(): MediaStream {
        throw new Error('SyntheticVideoClient: stream mode needs a remote stream');
    }

    // ── Connect ──────────────────────────────────────────────────────────────────────────────────────────────────

    /** Audio, plus the outbound video track the grant offers when the browser can play it. */
    private negotiate(requested: RealtimeTrackDescriptor[] | undefined): void {
        const grant = this.grant;
        const supported: RealtimeTrackDescriptor[] = [...DEFAULT_REALTIME_AUDIO_TRACKS];
        const offersVideo = grant ? this.mode === 'stream' || this.CanPlay(grant.Encoding) || !!this.faults.IgnoresPlayability : !!this.faults.TrackLiveWithoutGrant;
        if (offersVideo) {
            supported.push({ Modality: 'video', Direction: 'outbound', Encoding: grant?.Encoding, UsageBasis: ['seconds'] });
        }
        this.negotiateTracks(requested, supported, 0);
    }

    /** Sets up the granted avatar when the host shows it (the track is live): a player, or the live stream. */
    private prepareVideo(hostAskedForVideo: boolean): void {
        const grant = this.grant;
        if (!grant) {
            return;
        }
        const ignoredHost = !!this.faults.IgnoresHost && !hostAskedForVideo;
        if (!this.IsTrackEstablished('video', 'outbound') && !ignoredHost) {
            console.warn('[SyntheticVideoClient] The granted avatar is not used: the host shows no agent video, or this browser cannot play it.');
            return;
        }
        if (this.mode === 'stream') {
            this.stream = this.CreateRemoteStream();
            return;
        }
        this.player = this.CreateVideoPlayout({ MimeType: grant.Encoding, CarriesVoice: grant.CarriesVoice, ...this.clockOption(grant) });
    }

    /** The voice as the player's clock, when the voice and the video share a timeline. */
    private clockOption(grant: SyntheticGrant): Pick<VideoPlayoutOptions, 'Clock'> {
        const voice = this.voice;
        return grant.TimedVoice && !this.faults.NoClock && voice && isPlaybackClock(voice) ? { Clock: voice } : {};
    }

    /** Hands the avatar's video to the host, once, when connected. */
    private handOver(): void {
        if (this.player) {
            this.emitRemoteVideo(this.player.Source);
        } else if (this.stream) {
            this.emitRemoteVideo(this.stream);
        }
    }

    // ── The model's messages ─────────────────────────────────────────────────────────────────────────────────────

    private handle(message: SyntheticModelMessage): void {
        switch (message.Kind) {
            case 'frame':
                this.handleFrame(message.Frame);
                break;
            case 'voice':
                this.handleVoice(message.Data, message.MediaTimeMs);
                break;
            case 'part':
                this.handlePart(message.MimeType, message.Data);
                break;
            case 'transcript':
                this.handleTranscript();
                break;
            case 'generation-complete':
                this.handleGenerationComplete();
                break;
            case 'turn-complete':
                this.handleTurnComplete();
                break;
            case 'interrupted':
                this.handleInterrupted();
                break;
            case 'moved':
                this.handleMoved();
                break;
        }
    }

    /** Routes a part by the type it names: video as a frame, PCM to the voice, anything else nowhere (said once). */
    private handlePart(mimeType: string, data: ArrayBuffer): void {
        const frame = /^video\//i.test(mimeType.trim()) ? Fmp4PieceToVideoFrame(data, mimeType, this.init) : null;
        if (frame) {
            this.handleFrame(frame);
        } else if (IsPcmAudioMimeType(mimeType)) {
            this.handleVoice(data, undefined);
        } else if (this.faults.PlaysUnknownParts && this.player) {
            this.player.Append({ Kind: 'image', Data: data, MimeType: mimeType });
        } else {
            this.reportOnce(`type:${mimeType}`, `[SyntheticVideoClient] Dropped model output of type ${mimeType}: only video and PCM audio play.`);
        }
    }

    /** A frame of video: to the player, unless the session shows none or the turn was interrupted. */
    private handleFrame(frame: RealtimeVideoFrame): void {
        if (this.turn.Dropping && !this.faults.PlaysLateMedia) {
            if (this.faults.CountsLateFrames) {
                this.countVideo(frame);
            }
            return;
        }
        if (!this.player) {
            this.handleFrameWithoutPlayer(frame);
            return;
        }
        if (!this.turn.HasVideo) {
            this.startTurnVideo();
        }
        this.turn.VideoEnded = false;
        if (this.appendToPlayer(this.player, frame)) {
            this.framesHanded++;
            if (this.answering) {
                this.answerEndsAtFrame = this.framesHanded;
            }
        }
        if (this.faults.VideoToVoice) {
            this.voice?.Enqueue(frame.Data);
        }
        if (!this.turn.Dropping) {
            this.countVideo(frame);
        }
        if (this.answering || this.faults.IdleVideoIsSpeech) {
            this.markSpeaking();
        }
    }

    /** The model's words: its answer is under way. */
    private handleTranscript(): void {
        this.answering = true;
        this.markSpeaking();
    }

    /** Video in a session that shows none: dropped, said once per type. */
    private handleFrameWithoutPlayer(frame: RealtimeVideoFrame): void {
        if (this.faults.PlaysVideoPartsAsVoice) {
            this.playVoice(frame.Data, undefined);
            return;
        }
        this.reportOnce(`type:${frame.MimeType}`, `[SyntheticVideoClient] Dropped model output of type ${frame.MimeType}: this session shows no avatar.`);
    }

    /** Hands the player the frame as the model sent it (the faults change what it gets). Returns whether it handed one over. */
    private appendToPlayer(player: IAvatarVideoPlayout, frame: RealtimeVideoFrame): boolean {
        if (this.faults.DropsInitSegment && frame.Kind === 'fmp4' && frame.Piece === 'init') {
            return false;
        }
        if (this.faults.MislabelsPieces && frame.Kind === 'fmp4') {
            player.Append({ ...frame, Piece: 'fragment' });
        } else if (this.faults.RetimesFrames && frame.Kind !== 'fmp4') {
            player.Append({ ...frame, PresentationTimeMs: 0, KeyFrame: true });
        } else if (this.faults.RelabelsChunks && frame.Kind === 'chunk') {
            player.Append({ ...frame, Kind: 'image' });
        } else {
            player.Append(frame);
        }
        return true;
    }

    /** The turn's first video: when it carries the voice, the PCM the turn queued would double it, so it stops. */
    private startTurnVideo(): void {
        this.turn.HasVideo = true;
        if (this.faults.HandsOverTwice && !this.handedOverAgain && this.player) {
            this.handedOverAgain = true;
            this.emitRemoteVideo(this.player.Source);
        }
        if (this.grant?.CarriesVoice && this.turn.HasVoice) {
            this.voice?.Flush();
        }
    }

    /** A chunk of the voice: plays, unless the turn was interrupted or its video already carries the voice. */
    private handleVoice(pcm: ArrayBuffer, mediaTimeMs: number | undefined): void {
        if (this.turn.Dropping && !this.faults.PlaysLateMedia) {
            return;
        }
        if (this.player && this.grant?.CarriesVoice && this.turn.HasVideo && !this.faults.PlaysVoiceTwice) {
            this.reportOnce('pcm-with-video', '[SyntheticVideoClient] Dropped PCM in a turn whose video carries the voice.');
            return;
        }
        this.playVoice(pcm, mediaTimeMs);
    }

    /** Queues the voice, at its media time when the voice is timed. The voice means the answer is under way. */
    private playVoice(pcm: ArrayBuffer, mediaTimeMs: number | undefined): void {
        const timed = this.grant?.TimedVoice && !this.faults.UntimedVoice;
        this.voice?.Enqueue(pcm, timed ? mediaTimeMs : undefined);
        this.turn.HasVoice = true;
        this.answering = true;
        this.markSpeaking();
    }

    private handleGenerationComplete(): void {
        this.turn.GenerationComplete = true;
        this.answering = false;
        if (!this.faults.NoEndOfTurn) {
            this.endTurnVideo();
        }
        this.reportSeconds();
    }

    private handleTurnComplete(): void {
        if (!this.faults.NoEndOfTurn) {
            this.endTurnVideo();
        }
        this.reportTurnSecondsAgain();
        this.reportSeconds();
        this.startNewTurn();
        this.emitStateChange('listening');
    }

    /** Barge-in: the video and the voice stop now, and the turn's late media is dropped until its turn complete. */
    private handleInterrupted(): void {
        this.voice?.Flush();
        if (!this.faults.KeepsVideoOnBargeIn) {
            this.player?.Flush();
        }
        this.turn.VideoEnded = true;
        this.turn.Dropping = true;
        this.responseActive = false;
        this.answering = false;
        this.emitInterruption();
        this.emitStateChange('listening');
    }

    /** A resume: the cut turn's video plays out what arrived (no flush), its seconds are reported, a new turn starts. */
    private handleMoved(): void {
        this.emitStateChange('connecting');
        if (this.faults.FlushOnResume) {
            this.player?.Flush();
        }
        this.endTurnVideo();
        this.reportSeconds();
        this.startNewTurn();
        this.emitStateChange('listening');
    }

    private endTurnVideo(): void {
        if (this.player && this.turn.HasVideo && !this.turn.VideoEnded) {
            this.turn.VideoEnded = true;
            this.player.EndOfTurn();
        }
    }

    /** A new turn: nothing played, nothing reported, no answer under way. */
    private startNewTurn(): void {
        this.turn = newTurn();
        this.turnSecondsReported = 0;
        this.responseActive = false;
        this.answering = false;
    }

    // ── Usage ────────────────────────────────────────────────────────────────────────────────────────────────────

    /**
     * Counts a frame's seconds while the turn generates: an fMP4 fragment by its samples (timed by the latest init
     * segment, which counts none), a chunk or an image as one frame at the pact's rate.
     */
    private countVideo(frame: RealtimeVideoFrame): void {
        if (frame.Kind === 'fmp4' && SniffFmp4Piece(frame.Data) === 'init') {
            this.init = ReadFmp4Init(frame.Data) ?? this.init;
            return;
        }
        if (this.turn.GenerationComplete) {
            return;
        }
        if (frame.Kind === 'fmp4') {
            this.pendingSeconds += this.init ? (Fmp4VideoSeconds(frame.Data, this.init) ?? 0) : 0;
            return;
        }
        this.pendingSeconds += 1 / (this.grant?.FrameRate ?? 24);
    }

    /** Reports the seconds generated since the last report, in an update of their own. */
    private reportSeconds(): void {
        const seconds = this.pendingSeconds;
        this.pendingSeconds = 0;
        if (seconds > 0) {
            this.turnSecondsReported += seconds;
            this.emitUsage({ OutputTokenDetails: { VideoSeconds: seconds } });
        }
    }

    /** The {@link SyntheticFaults.SecondsTwice} fault: what this turn already reported, reported again. */
    private reportTurnSecondsAgain(): void {
        if (this.faults.SecondsTwice && this.turnSecondsReported > 0) {
            this.emitUsage({ OutputTokenDetails: { VideoSeconds: this.turnSecondsReported } });
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────

    private markSpeaking(): void {
        this.responseActive = true;
        this.emitStateChange('speaking');
    }

    /** Whether the player plays with some of an answer's frames still ahead of its playhead (any video, with the fault). */
    private answerVideoPlaying(): boolean {
        const player = this.player;
        if (!player?.IsPlaying) {
            return false;
        }
        if (this.faults.IdleVideoIsSpeech) {
            return true;
        }
        return this.answerEndsAtFrame > 0 && this.framesHanded - player.FramesAhead < this.answerEndsAtFrame;
    }

    private reportOnce(key: string, message: string): void {
        if (!this.reported.has(key)) {
            this.reported.add(key);
            console.warn(message);
        }
    }
}
