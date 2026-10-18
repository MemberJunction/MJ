/**
 * @fileoverview One conformance session: the harness's client connected with the kit's recorders, the host's track
 * request, every event the client emits, and the warnings and info lines logged meanwhile, all on one timeline. A check
 * drives the model's side through it and reads the timeline back.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import {
    DEFAULT_REALTIME_AUDIO_TRACKS,
    type ClientRealtimeSessionConfig,
    type JSONObject,
    type JSONValue,
    type RealtimeTrack,
    type RealtimeVideoFrame,
} from '@memberjunction/ai';
import { BaseRealtimeClient, REQUESTED_TRACKS_SESSION_KEY, type RealtimeClientState } from '../generic/baseRealtimeClient';
import type { MediaVideoSource } from '../media/model';
import type { VideoPlayoutOptions } from '../media/videoPlayout';
import { Fail, RealtimeVideoConformanceError } from './conformanceAssertions';
import { CreateConformanceMicrophone } from './conformanceMicrophone';
import {
    RealtimeVideoConformanceTimeline,
    type RealtimeVideoConformanceEvent,
    type RealtimeVideoConformanceEventKind,
    type RealtimeVideoConformanceEventOf,
} from './conformanceTimeline';
import { ConformanceVideoStream } from './conformanceVideoStream';
import { RecordingPcmPlayback, RecordingVideoPlayout } from './recordingPlayout';
import type { IRealtimeVideoConformanceHarness, RealtimeVideoConformanceGrant, RealtimeVideoConformanceMedia } from './realtimeVideoConformanceTypes';

/** How many logged lines a failure's message carries. */
const MAX_LOGGED_LINES_IN_FAILURE = 8;

/** What a session starts with. */
export interface ConformanceSessionSetup {
    /** What the provider's server grants. */
    Grant: RealtimeVideoConformanceGrant;
    /** Whether the host shows the agent's video: its Avatar channel asks for the outbound video track. Default `true`. */
    ShowAgentVideo?: boolean;
}

/** One connected session of a check, recorded on one timeline. */
export class ConformanceSession {
    public readonly Timeline = new RealtimeVideoConformanceTimeline();
    public readonly Microphone: MediaStream = CreateConformanceMicrophone();
    public readonly Voice: RecordingPcmPlayback;
    /** The video the model sends, in the provider's form. */
    public readonly Video: ConformanceVideoStream;
    private readonly players: RecordingVideoPlayout[] = [];
    private client: BaseRealtimeClient | null = null;
    private disconnected = false;

    constructor(public readonly Harness: IRealtimeVideoConformanceHarness, public readonly Setup: ConformanceSessionSetup) {
        this.Voice = new RecordingPcmPlayback(this.Timeline);
        this.Video = new ConformanceVideoStream(Harness.Traits.VideoFrameKind ?? 'fmp4', this.VideoCarriesVoice);
    }

    /** The video players the driver created, in order. */
    public get Players(): readonly RecordingVideoPlayout[] {
        return this.players;
    }

    /** The connected client. */
    public get Client(): BaseRealtimeClient {
        if (!this.client) {
            throw new RealtimeVideoConformanceError('the session has no client: Start() did not run');
        }
        return this.client;
    }

    /** Whether the avatar's video carries the voice: as the grant says, else whenever the provider's video can. */
    public get VideoCarriesVoice(): boolean {
        return this.Setup.Grant.VideoCarriesVoice ?? this.Harness.Traits.VideoCanCarryVoice;
    }

    /** Mints, adds the host's track request, creates the client with the recorders, observes it, and connects. */
    public async Start(): Promise<void> {
        const grant: RealtimeVideoConformanceGrant = { ...this.Setup.Grant, VideoCarriesVoice: this.VideoCarriesVoice };
        const config = WithHostTrackRequest(this.Harness.Mint(grant), this.Setup.ShowAgentVideo !== false);
        const client = this.Harness.CreateClient(this.media());
        if (!(client instanceof BaseRealtimeClient)) {
            Fail('the harness', `${this.Harness.Name}'s CreateClient returned something that is not a BaseRealtimeClient`);
        }
        this.client = client;
        this.observe(client);
        await this.Harness.Connect(client, config, this.Microphone);
    }

    /** Disconnects the client, as the host does when the call ends. */
    public async Disconnect(): Promise<void> {
        this.disconnected = true;
        await this.client?.Disconnect();
    }

    /** Ends the session after the check: disconnects the client if the check didn't. Never throws. */
    public async Close(): Promise<void> {
        if (this.disconnected || !this.client) {
            return;
        }
        try {
            await this.Disconnect();
        } catch (error) {
            this.Timeline.Record({ Kind: 'warn', Message: `Disconnect after the check failed: ${describe(error)}` });
        }
    }

    // ── The model's side ─────────────────────────────────────────────────────────────────────────────────────────

    /**
     * The model starts its video: an fMP4 init segment (with the voice's audio track when the video carries it), or the
     * first chunk (a key frame) or image. Returns the frame sent.
     */
    public async StartVideo(): Promise<RealtimeVideoFrame> {
        const frame = this.Video.Start();
        await this.Harness.SendVideo(frame);
        return frame;
    }

    /** The model sends the stream's next `count` video frames. Returns them. */
    public async SendFrames(count: number): Promise<RealtimeVideoFrame[]> {
        const frames = this.Video.Frames(count);
        for (const frame of frames) {
            await this.Harness.SendVideo(frame);
        }
        return frames;
    }

    /**
     * The model sends a chunk of its voice: timed at the video's next frame when the provider keeps one timeline
     * (`TimedVoice`), else untimed. Returns the media time sent, or `undefined`.
     */
    public async SendVoice(pcm16: ArrayBuffer): Promise<number | undefined> {
        const mediaTimeMs = this.Harness.Traits.TimedVoice ? this.Video.NextTimeMs : undefined;
        await this.Harness.SendVoice(pcm16, mediaTimeMs);
        return mediaTimeMs;
    }

    /** The model ends its turn: generation complete when the harness has it, then turn complete. */
    public async EndTurn(): Promise<void> {
        await this.Harness.GenerationComplete?.();
        await this.Harness.TurnComplete();
    }

    /** Models the agent's media playing out: every video player and the voice reach the end of what they were given. */
    public FinishPlaying(): void {
        for (const player of this.players) {
            player.FinishPlaying();
        }
        this.Voice.FinishPlaying();
    }

    // ── Reading the timeline ─────────────────────────────────────────────────────────────────────────────────────

    /** The states the client reported, from a mark on. */
    public States(since: number = 0): RealtimeClientState[] {
        return this.Timeline.Of('state', since).map((event) => event.State);
    }

    /** How many events of a kind happened from a mark on. */
    public Count(kind: RealtimeVideoConformanceEventKind, since: number = 0): number {
        return this.Timeline.Of(kind, since).length;
    }

    /** The events of a kind that one player recorded, from a mark on. */
    public PlayerEvents<K extends 'player-append' | 'player-end-of-turn' | 'player-flush' | 'player-dispose'>(
        kind: K,
        player: number,
        since: number = 0
    ): RealtimeVideoConformanceEventOf<K>[] {
        return this.Timeline.Of(kind, since).filter((event) => playerOf(event) === player);
    }

    /** The frames one player was given, from a mark on. */
    public AppendedFrames(player: number, since: number = 0): RealtimeVideoFrame[] {
        return this.PlayerEvents('player-append', player, since).map((event) => event.Frame);
    }

    /** The agent's video the client handed over, from a mark on. */
    public RemoteVideos(since: number = 0): MediaVideoSource[] {
        return this.Timeline.Of('remote-video', since).map((event) => event.Video);
    }

    /** The PCM the driver queued, from a mark on. */
    public VoiceEnqueued(since: number = 0): ArrayBuffer[] {
        return this.Timeline.Of('voice-enqueue', since).map((event) => event.Data);
    }

    /** The last state the client reported, or `null`. */
    public LastState(): RealtimeClientState | null {
        return this.Timeline.Of('state').at(-1)?.State ?? null;
    }

    /** The agent's video track (outbound video), as the client reports it now; `undefined` when it has none. */
    public OutboundVideoTrack(): RealtimeTrack | undefined {
        return this.Client.AllTracks.find((track) => track.Descriptor.Direction === 'outbound' && String(track.Descriptor.Modality).trim().toLowerCase() === 'video');
    }

    /** The seconds of generated video the client reported (`OutputTokenDetails.VideoSeconds`), from a mark on. */
    public VideoSeconds(since: number = 0): number {
        return this.Timeline.Of('usage', since).reduce((sum, event) => sum + (event.Usage.OutputTokenDetails?.VideoSeconds ?? 0), 0);
    }

    /** How many usage updates carried video seconds, from a mark on. */
    public VideoSecondsReports(since: number = 0): number {
        return this.Timeline.Of('usage', since).filter((event) => (event.Usage.OutputTokenDetails?.VideoSeconds ?? 0) > 0).length;
    }

    /** How many warnings mention `text`, from a mark on. */
    public Warnings(text: string, since: number = 0): number {
        return this.Timeline.Of('warn', since).filter((event) => event.Message.includes(text)).length;
    }

    /** The warning and info lines logged so far, for a failure's message. */
    public LoggedLines(): string[] {
        return this.Timeline.Entries.flatMap((event) => (event.Kind === 'warn' || event.Kind === 'info' ? [`${event.Kind}: ${event.Message}`] : []));
    }

    // ── Internals ────────────────────────────────────────────────────────────────────────────────────────────────

    /** What the harness wires into the driver: the microphone, the voice recorder, and a recorder per player. */
    private media(): RealtimeVideoConformanceMedia {
        return {
            Microphone: this.Microphone,
            Voice: this.Voice,
            CreateVideoPlayer: (options: VideoPlayoutOptions) => {
                const player = new RecordingVideoPlayout(options, this.Timeline, this.players.length);
                this.players.push(player);
                return player;
            },
        };
    }

    /** Registers the kit's handlers: every emission goes on the timeline. */
    private observe(client: BaseRealtimeClient): void {
        client.OnStateChange((state) => this.Timeline.Record({ Kind: 'state', State: state }));
        client.OnRemoteVideo((video) => this.Timeline.Record({ Kind: 'remote-video', Video: video }));
        client.OnInterruption(() => this.Timeline.Record({ Kind: 'interruption' }));
        client.OnUsage((usage) => this.Timeline.Record({ Kind: 'usage', Usage: usage }));
        client.OnTrackStateChange((track) => this.Timeline.Record({ Kind: 'track', Track: track }));
        client.OnError((error) => this.Timeline.Record({ Kind: 'error', Error: error }));
    }
}

/**
 * Runs `body` on a started session with the console captured onto its timeline, then disconnects the client (if `body`
 * didn't) and restores the console, failed or not. A failure's message gains the lines logged during the session.
 */
export async function WithConformanceSession(
    harness: IRealtimeVideoConformanceHarness,
    setup: ConformanceSessionSetup,
    body: (session: ConformanceSession) => Promise<void>
): Promise<void> {
    const session = new ConformanceSession(harness, setup);
    const restoreConsole = CaptureConsole(session.Timeline);
    try {
        await session.Start();
        await body(session);
    } catch (error) {
        throw withLoggedLines(error, session.LoggedLines());
    } finally {
        await session.Close();
        restoreConsole();
    }
}

/**
 * The config with the host's track request added, as the realtime runtime builds it when a channel shows the agent's
 * video: the audio floor, what the mint requested, and the agent's outbound video, one each. Unchanged when the host
 * shows no agent video.
 */
export function WithHostTrackRequest(config: ClientRealtimeSessionConfig, showAgentVideo: boolean): ClientRealtimeSessionConfig {
    if (!showAgentVideo) {
        return config;
    }
    const minted = config.SessionConfig[REQUESTED_TRACKS_SESSION_KEY];
    const requested = new Map<string, JSONValue>();
    for (const track of DEFAULT_REALTIME_AUDIO_TRACKS) {
        requested.set(`${track.Direction}:audio`, { Modality: 'audio', Direction: track.Direction });
    }
    for (const raw of Array.isArray(minted) ? minted : []) {
        requested.set(trackKeyOf(raw) ?? `minted:${requested.size}`, raw);
    }
    requested.set('outbound:video', { Modality: 'video', Direction: 'outbound' });
    return { ...config, SessionConfig: { ...config.SessionConfig, [REQUESTED_TRACKS_SESSION_KEY]: Array.from(requested.values()) } };
}

/** The number of the player an event is about, or `null` for an event about no player. */
function playerOf(event: RealtimeVideoConformanceEvent): number | null {
    return 'Player' in event ? event.Player : null;
}

/** `direction:modality` of a requested track in the config, or `null` when it names neither. */
function trackKeyOf(raw: JSONValue): string | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const track: JSONObject = raw;
    const modality = track['Modality'];
    const direction = track['Direction'];
    return typeof modality === 'string' && typeof direction === 'string' ? `${direction}:${modality.trim().toLowerCase()}` : null;
}

/**
 * Sends `console.warn` and `console.info` to the timeline instead of the output, for "reported once" and quiet test
 * output. Returns the function that restores them.
 */
export function CaptureConsole(timeline: RealtimeVideoConformanceTimeline): () => void {
    const warn = console.warn;
    const info = console.info;
    // `unknown`: the console takes values of any type, and each is only turned into text here.
    console.warn = (...values: unknown[]) => timeline.Record({ Kind: 'warn', Message: values.map(describe).join(' ') });
    console.info = (...values: unknown[]) => timeline.Record({ Kind: 'info', Message: values.map(describe).join(' ') });
    return () => {
        console.warn = warn;
        console.info = info;
    };
}

/** A logged value, or a thrown one, as text. */
function describe(value: unknown): string {
    return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
}

/** The error with the session's logged lines appended to its message; its kind and name kept. */
function withLoggedLines(error: unknown, lines: string[]): unknown {
    if (lines.length === 0) {
        return error;
    }
    const logged = ` (logged: ${lines.slice(-MAX_LOGGED_LINES_IN_FAILURE).join(' | ')})`;
    if (error instanceof RealtimeVideoConformanceError) {
        return new RealtimeVideoConformanceError(`${error.message}${logged}`);
    }
    const wrapped = new Error(`${error instanceof Error ? error.message : String(error)}${logged}`);
    wrapped.name = error instanceof Error ? error.name : 'Error';
    return wrapped;
}
