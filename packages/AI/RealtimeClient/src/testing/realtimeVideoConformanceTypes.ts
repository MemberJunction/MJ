/**
 * @fileoverview The contract between the video conformance kit and a provider's test: the harness a provider writes
 * (what its server mints, its client driver with a fake transport, and the model's side of the wire), and what the kit
 * reports back.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import type { ClientRealtimeSessionConfig, RealtimeVideoFrame, RealtimeVideoFrameKind } from '@memberjunction/ai';
import type { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import type { VideoPlayoutOptions } from '../media/videoPlayout';
import type { RecordingPcmPlayback, RecordingVideoPlayout } from './recordingPlayout';

/** What the provider's server granted the session: an avatar or not. The kit adds the host's track request itself. */
export interface RealtimeVideoConformanceGrant {
    /** The server granted an avatar: the model will send the agent's video. */
    Avatar: boolean;
    /**
     * The avatar's video carries the voice (a muxed MP4); otherwise the voice comes separately, as PCM. Default: whether
     * the provider's video can carry the voice ({@link RealtimeVideoConformanceTraits.VideoCanCarryVoice}).
     */
    VideoCarriesVoice?: boolean;
}

/** What a provider can do. A check that needs something the provider can't do is skipped with the reason. */
export interface RealtimeVideoConformanceTraits {
    /**
     * How the agent's video reaches the host: a player the driver creates through its creation seam (`'playout'`, the
     * kit records it), a live `MediaStream` (`'stream'`, as a WebRTC provider hands over), or never (`'none'`, audio
     * only).
     */
    AgentVideo: 'playout' | 'stream' | 'none';
    /** Whether this provider's server can grant an avatar at all. The Gemini Developer API can't. */
    GrantsAvatar: boolean;
    /** Who plays the agent's voice: the driver's PCM playback (the kit's recorder), or the transport (WebRTC). */
    Voice: 'pcm' | 'transport';
    /** Whether the avatar's video can carry the voice, so the kit checks the voice never plays twice. */
    VideoCanCarryVoice: boolean;
    /** Whether the driver reports the seconds of video the model generated (`OutputTokenDetails.VideoSeconds`). */
    VideoUsage: boolean;
    /**
     * The form the model's video comes in, as Core's `RealtimeVideoFrame` kinds: fragmented MP4 (a Gemini avatar), encoded
     * chunks, or images. The kit sends frames of this kind. Default `'fmp4'`.
     */
    VideoFrameKind?: RealtimeVideoFrameKind;
    /**
     * Whether the model's voice and video share one media timeline that the driver keeps: it queues each PCM chunk with
     * its media time and hands its voice playback to the video player as the clock (`VideoPlayoutOptions.Clock`), so the
     * face moves with the voice. Default `false` (Gemini's PCM carries no media time).
     */
    TimedVoice?: boolean;
    /**
     * Checks this test environment can't run faithfully, by id, with the reason. They are reported skipped; a skip here
     * says nothing about the provider.
     */
    EnvironmentSkips?: Readonly<Record<string, string>>;
}

/** What the kit hands a harness to wire into its driver's creation seams. */
export interface RealtimeVideoConformanceMedia {
    /** A microphone stream with one audio track, to connect with. */
    readonly Microphone: MediaStream;
    /** The agent's voice playback, for a driver that plays PCM itself. */
    readonly Voice: RecordingPcmPlayback;
    /** Creates the avatar's video player, for a driver that plays the video itself; each one records what it is given. */
    CreateVideoPlayer(options: VideoPlayoutOptions): RecordingVideoPlayout;
}

/**
 * One provider, set up for one check: the factory makes a new one per check, and once more to read its traits and
 * methods when the checks are listed. Keep construction free of side effects (install fakes in {@link CreateClient}, undo
 * them in {@link Dispose}).
 *
 * Methods marked optional gate checks: a check that needs one the harness lacks is skipped with the reason.
 */
export interface IRealtimeVideoConformanceHarness {
    /** The run's name, for messages, e.g. `'gemini-enterprise'`. */
    readonly Name: string;
    readonly Traits: RealtimeVideoConformanceTraits;
    /** The session config the provider's server mints for the grant. The kit adds the host's track request to it. */
    Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig;
    /**
     * A client driver with a fake transport, its creation seams wired to `media`. Register no handlers on it: the kit
     * registers its own. A check may run two sessions one after the other, so a second call starts over with a new client.
     */
    CreateClient(media: RealtimeVideoConformanceMedia): BaseRealtimeClient;
    /** Connects the client, and opens whatever the fake transport needs, until the session listens. */
    Connect(client: BaseRealtimeClient, config: ClientRealtimeSessionConfig, microphone: MediaStream): Promise<void>;
    /** Makes this browser unable to play the provider's video, before the next connect. Returns the undo. */
    RefusePlayback?(): () => void;
    /** Whether the last connect asked the provider for video: an avatar nobody sees is still generated, and billed. */
    AskedProviderForVideo?(): boolean;
    /**
     * The model sends a frame of the agent's video, of the provider's kind ({@link RealtimeVideoConformanceTraits.VideoFrameKind}),
     * as Core's `RealtimeVideoFrame`: the harness puts it on its wire as the provider would. Resolves once the client has
     * handled it.
     */
    SendVideo(frame: RealtimeVideoFrame): Promise<void>;
    /**
     * The model sends PCM16 of the agent's voice. Resolves once the client has handled it.
     *
     * @param pcm16 The chunk.
     * @param mediaTimeMs Where the chunk starts on the stream's media timeline, for a provider with
     *   {@link RealtimeVideoConformanceTraits.TimedVoice}; a provider whose wire has no time ignores it.
     */
    SendVoice(pcm16: ArrayBuffer, mediaTimeMs?: number): Promise<void>;
    /** The model sends a part of any MIME type, as the provider's wire names it. */
    SendPart?(mimeType: string, data: ArrayBuffer): Promise<void>;
    /**
     * The model starts speaking its answer: its first words, as the provider transcribes them (Gemini: the output
     * transcription). The video that follows is the answer's until the turn's generation completes; video outside an
     * answer (an avatar's between answers, which Vertex AI streams) plays, but is not the agent speaking. Without it the
     * kit can't tell the two apart, and VC13 leaves that part out.
     */
    AnswerStarted?(): Promise<void>;
    /** The model has generated the whole turn; its media may still be arriving. Without it the kit uses {@link TurnComplete}. */
    GenerationComplete?(): Promise<void>;
    /** The model's turn is over. */
    TurnComplete(): Promise<void>;
    /** The user barged in: the provider stopped the model's turn. */
    Interrupted(): Promise<void>;
    /** A planned move to a new connection, mid-turn (the provider's session resumption). Resolves once the session listens again. */
    Resume?(): Promise<void>;
    /** Releases what the harness set up. Called once after each check, failed ones too. */
    Dispose?(): void | Promise<void>;
}

/** Makes a new harness for each check. */
export type RealtimeVideoConformanceDriverFactory = () => IRealtimeVideoConformanceHarness;

/** The outcome of one check. */
export interface RealtimeVideoConformanceResult {
    Id: string;
    Title: string;
    Status: 'Passed' | 'Failed' | 'Skipped';
    /** Why it failed, or why it was skipped; `null` when it passed. */
    Detail: string | null;
    DurationMs: number;
}

/** One check: a scripted session against a harness, with plain assertions. */
export interface RealtimeVideoConformanceCheck {
    /** `VC01`, `VC02`, ... */
    Id: string;
    Title: string;
    /** Why the check can't run against this harness, or `null` when it can. */
    Gate(harness: IRealtimeVideoConformanceHarness): string | null;
    /** Runs the check. Rejects with a `RealtimeVideoConformanceError` naming the rule a driver broke. */
    Run(harness: IRealtimeVideoConformanceHarness): Promise<void>;
}

/** A check bound to a driver factory, for a test runner: one test per check. */
export interface RealtimeVideoConformanceCheckRun {
    Id: string;
    Title: string;
    /** Why the check is skipped for this driver (register the test as skipped), or `null`. */
    SkipReason: string | null;
    /**
     * Runs the check on a new harness and disposes it. Rejects with a `RealtimeVideoConformanceError` on a failure.
     * Does nothing when {@link SkipReason} is set.
     */
    Run(): Promise<void>;
}
