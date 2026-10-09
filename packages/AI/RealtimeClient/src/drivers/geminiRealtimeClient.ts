import { RegisterClass } from '@memberjunction/global';
import {
    ClientRealtimeSessionConfig,
    JSONObject,
    JSONValue,
    RealtimeDiagLog,
    RealtimeIdleSignal,
    IsPcmAudioMimeType,
    ParseDurationToMs,
    RealtimeSessionResumption,
    RealtimeToolBatchBarrier,
    RealtimeTrackDescriptor,
    ExtractToolSchedulingHint,
    type RealtimeAvatarUnavailableReason,
    type RealtimeResumeAttempt,
} from '@memberjunction/ai';
import {
    GoogleGenAI,
    FunctionResponseScheduling,
    Modality,
    type Blob as GeminiBlob,
    type Content,
    type FunctionCall,
    type FunctionResponse,
    type LiveConnectConfig,
    type LiveServerContent,
    type LiveServerMessage,
    type ModalityTokenCount,
    type Transcription,
} from '@google/genai';
import { BaseRealtimeClient, RealtimeClientState, REQUESTED_TRACKS_SESSION_KEY } from '../generic/baseRealtimeClient';
import { Base64ToArrayBuffer } from '../audio/pcmUtils';
import { IRealtimePcmPlayback, RealtimePcmPlayback } from '../audio/pcmPlayback';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { CreatePcmMicCapture, IPcmMicCapture } from '../audio/micCapture';
import { FrameSampler } from '../media/frameSampler';
import { DEFAULT_INBOUND_VIDEO_RATE, MinVideoFrameSpacingMs } from '../media/videoPacing';
import { VideoSourceArbiter } from '../media/videoSourceArbiter';
import { GEMINI_AVATAR_MP4_TYPE, VideoPlayout, type IAvatarVideoPlayout, type VideoPlayoutOptions } from '../media/videoPlayout';
import { GeminiAvatarOutput, type GeminiAvatarGrant } from './geminiAvatarOutput';
import type { RealtimeUsageModalityDetail } from '@memberjunction/ai';

// ── Audio constants (Gemini Live wire formats) ─────────────────────────────────

/** Gemini Live expects client audio as 16-bit signed PCM, 16 kHz, mono. */
const GEMINI_INPUT_SAMPLE_RATE = 16000;
/** MIME type stamped on every streamed mic chunk. */
const GEMINI_INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';
/** Gemini Live emits model audio as 16-bit signed PCM, 24 kHz, mono. */
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

/** The detail field each Gemini `usageMetadata` modality's token count goes into; other modalities are not kept. */
const GEMINI_MODALITY_TOKEN_FIELDS: Partial<Record<string, 'TextTokens' | 'AudioTokens' | 'ImageTokens' | 'VideoTokens'>> = {
    TEXT: 'TextTokens',
    AUDIO: 'AudioTokens',
    IMAGE: 'ImageTokens',
    VIDEO: 'VideoTokens',
};

// ── Legacy video-capability fallback ───────────────────────────────────────────
//
// Video capability and its rate ceiling are per-model data, minted from the provider's profile
// table into the session config. A mint from a server that predates those fields sends neither,
// and this client must still negotiate video for the models that had it — so these two values
// reproduce the behaviour that shipped before the fields existed, and NOTHING ELSE should read
// them. They are reachable only against an older server; delete both once no supported server
// mints a session config without `supportsInboundVideo`.

/** Model-id prefix that identified a video-capable Live model before the profile carried the flag. */
const LEGACY_VIDEO_MODEL_PREFIX = 'gemini-3.8-live';
/** The frame-rate ceiling this client hardcoded before `MaxInboundVideoRate` was minted. */
const LEGACY_VIDEO_MODEL_RATE = 1;

/** The arbiter source id of the camera stream passed to `Connect`. */
const CONNECT_CAMERA_SOURCE_ID = 'connect-camera';

// ── Structural transport seams (typed subsets — fakes in tests, SDK in prod) ──

/**
 * The minimal subset of `@google/genai`'s `Session` this client depends on. Declaring the seam
 * as an interface (rather than the concrete SDK `Session`) lets unit tests inject a fully
 * in-memory fake that captures outbound sends and drives the registered message callback with
 * Gemini-shaped frames — no websocket, no network. (Mirrors the server driver's
 * `GeminiLiveSession` seam.)
 */
export interface GeminiLiveClientSession {
    /**
     * Streams realtime user input to the model — mic audio frames, inbound video frames,
     * and mid-session text.
     */
    sendRealtimeInput(params: { audio?: GeminiBlob; text?: string; media?: GeminiBlob; video?: GeminiBlob }): void;
    /** Appends client content WITHOUT triggering generation (context notes, history seeding). */
    sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void;
    /** Replies to a server tool call with one or more function responses. */
    sendToolResponse(params: { functionResponses: FunctionResponse[] }): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Arguments handed to {@link GeminiRealtimeClient.connectLiveSession}. Bundles the resolved
 * model + connect config (from the server-minted `SessionConfig`), the ephemeral token, and the
 * lifecycle callbacks so the seam owns the entire `live.connect` call and tests can substitute
 * it wholesale.
 */
export interface GeminiClientConnectArgs {
    /** The Gemini Live model id to open the session against. */
    Model: string;
    /** The server-built connect config (system instruction, tools, modalities, transcription). */
    Config: LiveConnectConfig;
    /** The server-minted ephemeral auth token (used as the API key on a `v1alpha` client). */
    EphemeralToken: string;
    /** Invoked for every {@link LiveServerMessage} the server emits over the session. */
    OnMessage: (message: LiveServerMessage) => void;
    /** Invoked on a websocket-level error (fatal). */
    OnError: (event: ErrorEvent) => void;
    /** Invoked when the websocket closes. */
    OnClose: (event: CloseEvent) => void;
}

/** What a connection is opened against; a resume reuses it with the new handle in `Config`. */
type GeminiConnectTarget = Pick<GeminiClientConnectArgs, 'Model' | 'Config' | 'EphemeralToken'>;

/** What {@link GeminiRealtimeClient} reads from the server-minted `SessionConfig`. */
interface GeminiParsedSessionConfig {
    model: string;
    liveConfig: LiveConnectConfig;
    idleSignal: RealtimeIdleSignal;
    supportsScheduling: boolean;
    supportsBlocking: boolean;
    supportsInboundVideo?: boolean;
    maxInboundVideoRate?: number;
    maxInboundVideoStreams?: number;
    requestedTracks?: readonly RealtimeTrackDescriptor[];
    /** The avatar the server granted this session, or `null` when it granted none. */
    avatar: GeminiAvatarGrant | null;
}

/** A connection {@link GeminiRealtimeClient} opened, with the number that marks it as current. */
interface GeminiOpenedConnection {
    Session: GeminiLiveClientSession;
    ConnectionNumber: number;
}

/**
 * Handle returned by the mic-capture seam: the only operation the driver needs is teardown.
 * Production wraps an `AudioContext` + `AudioWorkletNode` pipeline; tests return a no-op fake.
 *
 * Back-compat alias for the shared {@link IPcmMicCapture} (the capture pipeline now lives in
 * `src/audio/micCapture.ts`, shared with the ElevenLabs driver).
 */
export type IGeminiMicCapture = IPcmMicCapture;

/**
 * The playback seam: schedules raw PCM16 chunks for gapless playout and reports whether audio
 * is AUDIBLY playing. Production is {@link GeminiPcmPlayback} (Web Audio, playhead-clock
 * scheduling); tests inject a fake with a controllable `IsPlaying`.
 *
 * Back-compat alias for the shared {@link IRealtimePcmPlayback} (the playout engine now lives
 * in `src/audio/pcmPlayback.ts`, shared with the ElevenLabs driver).
 */
export type IGeminiAudioPlayback = IRealtimePcmPlayback;

// ── Production playback engine ─────────────────────────────────────────────────

/**
 * Web Audio playout scheduler for Gemini's 24 kHz PCM16 model audio.
 *
 * A thin specialization of the shared {@link RealtimePcmPlayback} (playhead-clock scheduling,
 * gapless playout, honest `IsPlaying`) fixed at Gemini Live's 24 kHz output rate. Kept as a
 * named export for back-compat with existing consumers.
 */
export class GeminiPcmPlayback extends RealtimePcmPlayback {
    constructor() {
        super(GEMINI_OUTPUT_SAMPLE_RATE);
    }
}

// ── The driver ─────────────────────────────────────────────────────────────────

/**
 * Google Gemini implementation of {@link BaseRealtimeClient}: a **browser-direct** Gemini Live
 * websocket session authenticated with the server-minted ephemeral auth token (`v1alpha`
 * `auth_tokens` mechanism — the token is passed as the SDK `apiKey`).
 *
 * Registered with the ClassFactory under the key `'gemini'` — the `Provider` string the
 * server's `GeminiRealtime` driver stamps on its `ClientRealtimeSessionConfig` — so hosts
 * resolve it without referencing this class directly.
 *
 * Owns ALL Gemini wire concerns (the behavioral twin of {@link OpenAIRealtimeClient}, adapted
 * to Gemini's client-owned audio plane — there is no WebRTC here):
 * - **Audio in**: mic PCM16 @ 16 kHz captured via an inline-Blob `AudioWorklet`
 *   ({@link createMicCapture} seam) and streamed with `sendRealtimeInput`.
 * - **Audio out**: model PCM16 @ 24 kHz chunks scheduled through {@link GeminiPcmPlayback}
 *   ({@link createPlayback} seam); {@link IsAudioPlaying} is computed from the playout clock.
 * - **Avatar out**: when the minted config grants an avatar and the host shows it (the outbound
 *   video track is live), fragmented MP4 parts play through a {@link VideoPlayout}
 *   ({@link CreateVideoPlayout} seam) handed to the host at connect, whose audio routes into the
 *   PCM playback's graph; PCM follows the avatar's voice rule (see `GeminiAvatarOutput`). A host
 *   that shows no avatar gets an audio-only session.
 * - **Event translation** (Gemini → contract): `inputTranscription` → User deltas/finals,
 *   `outputTranscription` → Assistant deltas/finals (accumulated like the OpenAI driver),
 *   `toolCall.functionCalls` → {@link OnToolCall} (callID→name cached for
 *   {@link SendToolResult}), `interrupted` → playback flush + `'listening'`,
 *   `turnComplete` → busy cleared + queued sends flushed, `usageMetadata` → {@link OnUsage}
 *   (per-turn prompt/response token deltas with their modality split — see {@link handleUsageMetadata}).
 *   An avatar's generated video seconds go to {@link OnUsage} in updates of their own
 *   (`OutputTokenDetails.VideoSeconds`) at each turn boundary.
 * - **Busy mapping**: Gemini has no `response.created` frame, so `IsBusy` is set EAGERLY when
 *   this client triggers a response (text / narration / tool result) and on the first model
 *   output of a turn (audio part or output-transcription delta); cleared on `turnComplete`,
 *   and on a `toolCall` frame (the model has yielded the floor pending the tool result — so a
 *   slow `turnComplete` can never deadlock the queued result).
 * - **Collision safety**: ANY `sendClientContent` interrupts in-flight Gemini generation (per
 *   the Live API contract), so text / narration / context-note / tool-result sends issued
 *   while a turn is in flight are queued and flushed in order on `turnComplete` (the flush
 *   stops at the first send that starts a new response).
 * - **Open-turn commit**: context notes ride as `turnComplete: false` client content, which
 *   tells the Live API MORE INPUT IS COMING — the server holds ALL generation (including the
 *   normally-automatic continuation after a tool response) until a `turnComplete: true`
 *   commit. {@link SendToolResult} therefore follows `sendToolResponse` with an empty-turn
 *   commit whenever a note left the turn open, so the model speaks the result immediately
 *   (the behavioral equivalent of the OpenAI driver's explicit `response.create`).
 - **Triggering turns ride realtime text**: typed text ({@link SendText}) and narration
 *   triggers ({@link RequestSpokenUpdate}) are sent via `sendRealtimeInput({ text })` — the
 *   Live API's documented in-conversation text path. Native-audio Live models treat
 *   `sendClientContent` as initial-history seeding only: a mid-call `turnComplete: true`
 *   client turn appends to history WITHOUT starting generation (the model stays silent until
 *   the user's next spoken turn), while realtime text triggers an immediate response on every
 *   model generation. Context notes stay on `sendClientContent` (`turnComplete: false`) — the
 *   silent history-append is exactly the contract they want.
 * - **Narration tagging**: {@link RequestSpokenUpdate} has no per-response-instructions
 *   equivalent on Gemini, so it is emulated as a realtime-text user turn carrying the
 *   instructions; the response kind is stamped `'narration'` at send time (sends ARE
 *   the turn triggers on Gemini, unlike OpenAI where `response.created` confirms) and reset to
 *   `'normal'` when the turn completes.
 */
@RegisterClass(BaseRealtimeClient, 'gemini')
export class GeminiRealtimeClient extends BaseRealtimeClient {
    public static readonly ASSISTANT_SAFETY_BACKSTOP_MS = 15000;

    // ── Transport / audio resources ────────────────────────────────────────────
    private session: GeminiLiveClientSession | null = null;
    private micStream: MediaStream | null = null;
    private cameraStream: MediaStream | null = null;
    private micCapture: IGeminiMicCapture | null = null;
    private cameraSampler: FrameSampler | null = null;
    private playback: IGeminiAudioPlayback | null = null;
    /**
     * The avatar half of the session: created at connect when the server granted an avatar and the host shows it (the
     * outbound video track is live). `null` otherwise, and the session then plays model output as it always has.
     */
    private avatarOutput: GeminiAvatarOutput | null = null;
    private firstVideoSendTimestamp = 0;
    private lastVideoSendTimestamp = 0;
    protected videoFramesSent = 0;
    /**
     * Moves the session to a new connection with Google's resumption handle: when Google
     * announces the connection is ending (`goAway`, about 60 s before the ~10-minute connection
     * limit) and after an unexpected drop. Created per {@link Connect}.
     */
    private resumption: RealtimeSessionResumption | null = null;
    /** Model, config and token of the current connection; a resume reuses them with the new handle. */
    private connectTarget: GeminiConnectTarget | null = null;
    /** Last connection number handed out by {@link openConnection}. */
    private issuedConnections = 0;
    /**
     * Number of the connection in use. Callbacks from any other connection (one that was
     * replaced, closed, or is still opening) are ignored, so a replaced socket's close can't end
     * the session that replaced it. `0` while no connection is in use.
     */
    private currentConnection = 0;

    /** Returns the latest session resumption handle reported by the server, if any. */
    public get ResumptionHandle(): string | null {
        return this.resumption?.Handle ?? null;
    }

    /** Returns the count of video frames successfully sent over the established video track. */
    public get VideoFramesSent(): number {
        return this.videoFramesSent;
    }

    /**
     * Returns the cumulative active video duration in seconds across sent video frames.
     * Represents the wall-clock span between first and last sent frames (span-not-sum) for stream telemetry.
     * Provider-reported ImageTokens remains the authoritative financial billing basis.
     */
    public get VideoSeconds(): number {
        if (this.firstVideoSendTimestamp === 0 || this.lastVideoSendTimestamp === 0) {
            return 0;
        }
        return Math.max(1, Math.round((this.lastVideoSendTimestamp - this.firstVideoSendTimestamp) / 1000) + 1);
    }

    // ── Model capability & profile state ───────────────────────────────────────
    private idleSignal: RealtimeIdleSignal = 'turnComplete';
    private supportsScheduling = true;
    private supportsBlocking = true;
    private interactionInProgress = false;
    private toolBatchBarrier = new RealtimeToolBatchBarrier();
    private assistantSafetyBackstopTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Whether the active model session enforces asynchronous non-blocking tool execution.
     * Derived from model tooling capability (!supportsBlocking), separated from the idle signal (Reviewer Item 19).
     */
    private get isNonBlocking(): boolean {
        return !this.supportsBlocking;
    }

    // ── Response state machine ─────────────────────────────────────────────────
    /** Accumulates the in-flight assistant transcript across delta frames. */
    private pendingAssistantText = '';
    /** Accumulates the in-flight user transcription across delta frames. */
    private pendingUserText = '';
    /** Accumulates in-flight thought text deltas until finalized on turn completion. */
    private pendingThoughtText = '';
    /** MIME types of model output this session dropped, so each is reported once. */
    private droppedOutputTypes = new Set<string>();
    /** True while a model turn is in flight; gates (queues) client-triggered sends. */
    private responseActive = false;
    /** The kind of the turn currently in flight; stamped at send time, reset on turnComplete. */
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    /** Sends deferred while a turn is in flight; drained in order on turnComplete. */
    private queuedSends: Array<() => void> = [];
    /**
     * Maps each pending tool call's `CallID` to its function name: Gemini's `sendToolResponse`
     * requires the function name, which the {@link SendToolResult} contract does not carry.
     */
    private pendingToolCallNames = new Map<string, string>();
    /**
     * True while client content sent with `turnComplete: false` (context notes) has not yet
     * been committed. Per the Live API, an open client turn tells the server MORE INPUT IS
     * COMING — clientContent-driven generation (notably the normally-automatic continuation
     * after a tool response) holds until a `turnComplete: true` arrives. Set by
     * {@link SendContextNote}; cleared by the empty-turn commit in
     * {@link sendToolResponseTurn} and on a model `turnComplete` (the generation consumed the
     * open content). Realtime-text triggers ({@link sendTriggeringUserTurn}) do NOT commit
     * client content and leave this flag untouched.
     */
    private openClientTurn = false;
    /**
     * The client's own view of the session state — mirrors what was last emitted, EXCEPT after
     * a tool call: the host typically shows its own busy indicator then, so the client silently
     * leaves `'speaking'` (no emission) until the result reply's first output re-asserts it.
     */
    private currentState: RealtimeClientState = 'closed';

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the client-direct Gemini Live session: creates the playout engine, connects with
     * the ephemeral token + the server-built `SessionConfig` (`{ model, config }` — the same
     * values the server LOCKED into the token, so tampering is ignored by the API), negotiates
     * tracks, then wires the mic-capture worklet and optional video capture.
     * Reports `'listening'` once audio is flowing.
     *
     * When the server granted an avatar (the minted `avatar` block) and the host shows it (the
     * outbound video track is live), the avatar's video goes to the host once the connection is
     * open. When the host doesn't show it, the session connects audio only.
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream, cameraStream?: MediaStream): Promise<void> {
        this.resetForConnect(micStream, cameraStream);
        this.setState('connecting');
        const session = this.parseSessionConfig(config);
        this.idleSignal = session.idleSignal;
        this.supportsScheduling = session.supportsScheduling;
        this.supportsBlocking = session.supportsBlocking;
        this.negotiateSessionTracks(session);
        const playback = this.createPlayback();
        this.playback = playback;
        // The agent voice plays through Web Audio only; publish it so a host recorder can mix
        // it in (issue #5153). Null for playbacks with no output stream (fakes, no WebAudio).
        this.publishRemoteMediaStream(playback.GetOutputStream?.() ?? null);
        const liveConfig = this.prepareAvatar(session, playback);
        this.resumption?.Dispose();
        this.resumption = this.createResumption();
        this.connectTarget = { Model: session.model, Config: liveConfig, EphemeralToken: config.EphemeralToken };
        this.useConnection(await this.openConnection(this.connectTarget));
        this.setState('connected');
        // Handed over now rather than at the first part, so the avatar's tile is up before the agent speaks.
        if (this.avatarOutput) {
            this.emitRemoteVideo(this.avatarOutput.Source);
        }
        await this.startLocalCapture(micStream);
        this.setState('listening');
    }

    /** Takes the streams for a new connect and clears what an earlier one left behind. */
    private resetForConnect(micStream: MediaStream, cameraStream?: MediaStream): void {
        this.micStream = micStream;
        this.cameraStream = cameraStream ?? null;
        this.clearSafetyBackstop();
        this.toolBatchBarrier.Clear();
        this.firstVideoSendTimestamp = 0;
        this.lastVideoSendTimestamp = 0;
        this.videoFramesSent = 0;
        this.disposeAvatarOutput();
    }

    /**
     * Negotiates tracks. Video capability and its frame-rate ceiling are PER-MODEL DATA, minted
     * from the provider's profile table (GeminiLiveModelProfile.SupportsInboundVideo /
     * .MaxInboundVideoRate) and carried in the session config. Deriving either from the model
     * id would put a second answer to the same question in a second place: the two agreed only
     * because the model names happened to line up, and the next model to break that pattern
     * would diverge silently. A granted avatar adds an outbound video track when this browser
     * can play it.
     */
    private negotiateSessionTracks(session: GeminiParsedSessionConfig): void {
        const isVideoModel = session.supportsInboundVideo ?? session.model.toLowerCase().startsWith(LEGACY_VIDEO_MODEL_PREFIX);
        const supportedTracks: RealtimeTrackDescriptor[] = [
            { Modality: 'audio', Direction: 'inbound' },
            { Modality: 'audio', Direction: 'outbound' },
        ];
        if (isVideoModel) {
            supportedTracks.push({
                Modality: 'video',
                Direction: 'inbound',
                Encoding: 'image/jpeg',
                // The model's own ceiling. ResolveRequestedTracks takes the more restrictive of
                // this and what the session requested, so this is what bounds the live track.
                Rate: session.maxInboundVideoRate ?? LEGACY_VIDEO_MODEL_RATE,
                UsageBasis: ['tokens', 'frames'] as const,
                RequiresConsent: true,
            });
        }
        const avatarTrack = session.avatar ? GeminiRealtimeClient.avatarTrackFor(session.avatar) : null;
        if (avatarTrack) {
            supportedTracks.push(avatarTrack);
        }
        // How many inbound video streams the model takes, minted from the profile like the rate. A mint
        // that predates the field falls back to one stream for a video model (every model that had video
        // took exactly one) and none otherwise.
        this.negotiateTracks(session.requestedTracks, supportedTracks, isVideoModel ? (session.maxInboundVideoStreams ?? 1) : 0);
    }

    /** The outbound video track a granted avatar offers, or `null` when this browser can't play its type through MSE. */
    private static avatarTrackFor(grant: GeminiAvatarGrant): RealtimeTrackDescriptor | null {
        const encoding = grant.Encoding ?? GEMINI_AVATAR_MP4_TYPE;
        if (!VideoPlayout.IsSupported(encoding)) {
            return null;
        }
        return { Modality: 'video', Direction: 'outbound', Encoding: encoding, UsageBasis: ['seconds'] as const };
    }

    /**
     * Sets up the avatar the server granted, when the host shows it (the outbound video track is
     * live). Otherwise the session runs audio only: the config sent at connect asks for audio and
     * no avatar, and one line says why. Returns the config to connect with.
     */
    private prepareAvatar(session: GeminiParsedSessionConfig, playback: IGeminiAudioPlayback): LiveConnectConfig {
        const grant = session.avatar;
        if (!grant) {
            return session.liveConfig;
        }
        if (!this.IsTrackEstablished('video', 'outbound')) {
            console.warn(this.avatarDowngradeMessage(session.liveConfig, grant));
            return GeminiRealtimeClient.withoutAvatar(session.liveConfig);
        }
        const playout = this.CreateVideoPlayout({
            MimeType: grant.Encoding ?? GEMINI_AVATAR_MP4_TYPE,
            CarriesVoice: grant.AudioMuxed,
            // The avatar's voice plays through the PCM engine's graph, so the meter and the recording carry it.
            OnElementAttached: (element) => playback.ConnectMediaElement?.(element),
        });
        this.avatarOutput = new GeminiAvatarOutput(playout, playback, grant);
        return session.liveConfig;
    }

    /**
     * The one line for a granted avatar this session won't show, in the server driver's format: `browser` when the host
     * asked for the agent's video and this browser can't play it, `host` when the host asked for none.
     */
    private avatarDowngradeMessage(config: LiveConnectConfig, grant: GeminiAvatarGrant): string {
        const requested = this.AllTracks.some(
            (t) => t.Descriptor.Direction === 'outbound' && String(t.Descriptor.Modality).trim().toLowerCase() === 'video'
        );
        const why = requested ? `this browser cannot play ${grant.Encoding ?? GEMINI_AVATAR_MP4_TYPE}` : 'the host shows no agent video';
        const reason: RealtimeAvatarUnavailableReason = requested ? 'browser' : 'host';
        return `[GeminiRealtimeClient] Avatar "${config.avatarConfig?.avatarName ?? ''}" not used: ${why}. The call is audio only. Reason: ${reason}.`;
    }

    /** The connect config of a session whose avatar won't show: audio out, and no avatar. */
    private static withoutAvatar(config: LiveConnectConfig): LiveConnectConfig {
        const { avatarConfig: _avatar, ...rest } = config;
        return { ...rest, responseModalities: [Modality.AUDIO] };
    }

    /** Starts the microphone capture, the camera passed to `Connect` when inbound video is live, and both audio meters. */
    private async startLocalCapture(micStream: MediaStream): Promise<void> {
        this.micCapture = await this.createMicCapture(micStream, (base64Pcm16) => this.sendMicChunk(base64Pcm16));
        if (this.cameraStream && this.IsTrackEstablished('video', 'inbound')) {
            this.cameraSampler = this.startConnectCamera(this.cameraStream);
        }
        // Audio-activity capability (base obligation #9): agent side taps the playout
        // engine's master gain; user side meters the mic stream. Null-safe — test fakes /
        // no-WebAudio environments simply leave the session un-metered.
        this.attachOutputAudioMeter(this.playback?.CreateMeter?.() ?? null);
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
    }

    /**
     * Stops the avatar's video and releases its element; the session then has no avatar. The video it generated and
     * did not yet report is emitted first.
     */
    private disposeAvatarOutput(): void {
        this.emitAvatarVideoSeconds();
        this.avatarOutput?.Dispose();
        this.avatarOutput = null;
    }

    /**
     * Samples the camera passed to {@link Connect} at the rate the video track negotiated and feeds it to
     * the session's {@link VideoSourceArbiter} as a `'camera'` source. The arbiter stays the only writer of
     * inbound video, and it tells the model when it switches to the camera.
     */
    private startConnectCamera(stream: MediaStream): FrameSampler {
        const arbiter = VideoSourceArbiter.ForSink(this);
        arbiter.RegisterSource({ SourceID: CONNECT_CAMERA_SOURCE_ID, Label: 'Camera', Kind: 'camera' });
        const sampler = new FrameSampler(stream, {
            Rate: this.InboundVideoRate ?? DEFAULT_INBOUND_VIDEO_RATE,
            OnFrame: (frame) => arbiter.PushFrame(CONNECT_CAMERA_SOURCE_ID, frame.Data, frame.MimeType),
        });
        sampler.Start();
        return sampler;
    }

    /** Stops sampling the `Connect` camera and removes it from the arbiter. Does not stop its tracks. */
    private stopConnectCamera(): void {
        if (!this.cameraSampler) {
            return;
        }
        this.cameraSampler.Stop();
        this.cameraSampler = null;
        VideoSourceArbiter.ForSink(this).UnregisterSource(CONNECT_CAMERA_SOURCE_ID);
    }

    /**
     * Tears down the session, mic capture, mic tracks, camera capture, and playout engine,
     * resets the response state machine, and emits a final `'closed'` (unless already `'error'`).
     * Safe to call more than once.
     */
    public async Disconnect(): Promise<void> {
        this.closeAudioMeters();
        this.clearSafetyBackstop();
        this.toolBatchBarrier.Clear();
        this.micStream?.getTracks().forEach((track) => track.stop());
        this.micStream = null;
        this.stopConnectCamera();
        this.cameraStream?.getTracks().forEach((track) => track.stop());
        this.cameraStream = null;
        this.micCapture?.Stop();
        this.micCapture = null;
        this.disposeAvatarOutput();
        this.playback?.Close();
        this.playback = null;
        // Stop resuming before the socket closes, and drop events still in flight from it.
        this.resumption?.Dispose();
        this.resumption = null;
        this.connectTarget = null;
        this.currentConnection = 0;
        this.clearRemoteMediaStream();
        this.firstVideoSendTimestamp = 0;
        this.lastVideoSendTimestamp = 0;
        this.videoFramesSent = 0;
        if (this.session) {
            try {
                this.session.close();
            } catch {
                /* already closing */
            }
            this.session = null;
        }
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── BaseRealtimeClient: outbound actions ──────────────────────────────────

    /**
     * Injects typed text as a realtime-text user turn (`sendRealtimeInput({ text })` —
     * Gemini's "respond now" trigger on every Live model generation, including native-audio
     * models that ignore mid-call `sendClientContent`). No-op when the session is not open.
     *
     * **SendText implies barge-in** (base-contract rule): an active spoken response is
     * cancelled via {@link CancelActiveResponse} first — playback flushed, turn marked
     * inactive, queued sends drained — so the typed turn takes the floor immediately. If a
     * drained queued send (e.g. a pending tool result) starts a new turn, the text queues
     * behind it, preserving the tool-result delivery invariant. On the wire, sending the
     * user turn itself interrupts any residual server-side generation (Gemini Live's
     * any-client-content-interrupts contract), so no explicit cancel frame exists or is
     * needed.
     */
    public SendText(text: string): void {
        if (!this.session) {
            return;
        }
        this.CancelActiveResponse();
        this.enqueueOrRun(() => this.sendTriggeringUserTurn(text, 'normal', true));
    }

    /**
     * Streams one base64 image frame over the established inbound video track.
     *
     * Enforces a minimum inter-frame spacing as a backstop with deliberate jitter headroom for the
     * upstream pacers (the source arbiter, `ChannelInboundVideoBridge`, `frameCapture`, channel-level
     * gates such as `OnScreencastFrame`). The spacing is derived from the rate the track NEGOTIATED
     * ({@link MinVideoFrameSpacingMs} of {@link BaseRealtimeClient.InboundVideoRate}), so it follows the
     * model's profile rather than a constant: at the 1 fps every Live model accepts today it is the
     * 750 ms gate this driver has always applied, and a faster model needs no change here. Upstream
     * generators are the primary enforcers of the nominal rate; this gate absorbs event-loop and async
     * dispatch jitter without dropping intended frames, while preventing an unpaced caller from bursting.
     *
     * Gemini accepts ONE inbound video stream, so `sourceId` is ignored: choosing which source feeds that
     * stream is the arbiter's job, and by the time a frame arrives here the choice is made.
     *
     * If inbound video is not established, returns `false` without error or frame sends (fallback).
     *
     * @returns `true` if the frame was dispatched to the session; `false` if dropped (throttled
     *   or track unestablished).
     */
    public override SendVideoFrame(base64Image: string, mimeType: string = 'image/jpeg', _sourceId?: string): boolean {
        if (!this.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        const now = Date.now();
        if (this.lastVideoSendTimestamp > 0 && now - this.lastVideoSendTimestamp < MinVideoFrameSpacingMs(this.InboundVideoRate)) {
            return false; // Throttled: jitter-headroom backstop for upstream pacers (Reviewer Items 25, 30, 33)
        }
        this.lastVideoSendTimestamp = now;
        if (this.firstVideoSendTimestamp === 0) {
            this.firstVideoSendTimestamp = now;
        }
        this.videoFramesSent++;
        // Reviewer Item 31: Send `video` alone — do not populate sibling `media` slot to avoid duplicate bytes & billing
        this.session?.sendRealtimeInput({
            video: { data: base64Image, mimeType },
        });
        return true;
    }

    /**
     * @inheritdoc
     *
     * Gemini has no explicit cancel frame — the client OWNS the audio plane, so cancelling
     * means: flush the local playout queue ({@link GeminiPcmPlayback}) so speech stops
     * immediately, mark the in-flight turn inactive, and drain queued sends (a queued tool
     * result or context note takes the floor next — tool-result delivery is never dropped
     * by a cancel). Server-side, the next client content sent naturally interrupts any
     * residual generation per the Live API contract. The interrupted turn's accumulated
     * transcript is kept — the provider's trailing frames finalize what WAS spoken. No-op
     * when nothing is active. An avatar's video stops with the voice.
     */
    public CancelActiveResponse(): void {
        if (!this.session) {
            return;
        }
        if (!this.responseActive && !this.IsAudioPlaying && !this.interactionInProgress) {
            return; // nothing active — no-op by contract
        }
        this.clearSafetyBackstop();
        this.playback?.Flush();
        this.avatarOutput?.Cancel();
        this.responseActive = false;
        this.interactionInProgress = false;
        this.activeResponseKind = 'normal';
        this.flushQueuedSends();
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /**
     * Injects background context as a user turn with `turnComplete: false` — appended to the
     * conversation WITHOUT starting generation, so the model draws on it the next time it
     * speaks. Gemini Live turns have no system role, so the user role carries it (the host owns
     * prefixing policy). Queued while a turn is in flight because ANY client content interrupts
     * in-flight generation on Gemini (a divergence from the OpenAI driver, which can inject
     * items mid-response safely).
     *
     * SIDE EFFECT: `turnComplete: false` leaves the client content turn OPEN — the server
     * holds generation until a `turnComplete: true` commit arrives. {@link openClientTurn}
     * tracks this so {@link SendToolResult} can commit the turn and unblock the spoken reply.
     */
    public SendContextNote(text: string): void {
        if (!this.session) {
            return;
        }
        this.enqueueOrRun(() => {
            this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false });
            this.openClientTurn = true;
        });
    }

    /**
     * Triggers ONE short spoken update. Gemini has no per-response instructions (OpenAI's
     * `response.create.instructions`), so this is EMULATED: the instructions ride as a
     * realtime-text user turn (`sendRealtimeInput({ text })` — the path that triggers
     * generation on native-audio models, where mid-call `sendClientContent` is inert), and
     * the resulting turn is stamped `Kind: 'narration'` at send time (reset on
     * `turnComplete`) — mirroring the OpenAI driver's narration semantics. Queued behind any
     * in-flight turn so it can never interrupt a pending reply.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (!this.session) {
            return;
        }
        this.enqueueOrRun(() => this.sendTriggeringUserTurn(instructions, 'narration', false));
    }

    /**
     * Feeds an executed tool's result back via `sendToolResponse`, supplying the function name
     * cached from the originating tool call (Gemini requires it; the contract only carries the
     * callID). Sent immediately when idle — Gemini speaks the result as its next turn —
     * otherwise queued until the in-flight turn (e.g. a progress narration) completes.
     *
     * If context notes left a client content turn OPEN (`turnComplete: false`), the tool
     * response is followed by an empty-turn commit (`sendClientContent({ turnComplete: true })`)
     * — without it the server keeps waiting for more client input and NEVER starts the spoken
     * reply (observed live as the model staying silent after a delegated agent's result).
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (!this.session) {
            return;
        }
        const name = this.pendingToolCallNames.get(callID) ?? '';
        if (this.isNonBlocking) {
            this.sendToolResponseTurn(callID, name, outputJson);
        } else {
            this.enqueueOrRun(() => this.sendToolResponseTurn(callID, name, outputJson));
        }
    }

    /**
     * Mutes / unmutes by toggling the mic tracks' `enabled` flag: the capture pipeline stays
     * up and streams SILENCE while muted (chosen over gating the worklet send so the provider's
     * VAD sees a continuous stream and the un-mute is glitch-free — same policy as the OpenAI
     * client driver).
     */
    public SetMuted(muted: boolean): void {
        const tracks = this.micStream?.getAudioTracks() ?? [];
        for (const track of tracks) {
            track.enabled = !muted;
        }
    }

    /** Rebinds the PCM capture and the input meter to the stream's current track (obligation #10); the socket stays open. */
    public async ReplaceMicrophone(micStream: MediaStream): Promise<void> {
        if (!this.micCapture) {
            return;
        }
        this.micCapture.Rebind(micStream);
        this.micStream = micStream;
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));
    }

    /** @inheritdoc */
    public get IsBusy(): boolean {
        if (this.isNonBlocking) {
            return (
                this.responseActive ||
                this.interactionInProgress ||
                !this.toolBatchBarrier.IsEmpty
            );
        }
        return this.responseActive || this.interactionInProgress;
    }

    /**
     * @inheritdoc
     *
     * Computed directly from the playout engine's playhead clock — this client OWNS the output
     * buffer (no WebRTC playback events exist on Gemini), so "audibly playing" is precisely
     * "scheduled audio extends beyond the audio context's current time". In an avatar session
     * the avatar's video counts too, while it plays with media ahead of its playhead: its MP4
     * usually carries the voice.
     */
    public get IsAudioPlaying(): boolean {
        return (this.playback?.IsPlaying ?? false) || (this.avatarOutput?.IsPlaying ?? false);
    }

    // ── Overridable creation seams (tests inject fakes — no network / audio) ──

    /**
     * Creation seam for the Gemini Live session. Production constructs a `GoogleGenAI` client
     * with the **ephemeral token as the API key** on the `v1alpha` API version (the only
     * version that accepts `auth_tokens`), then opens `live.connect` with the server-built
     * model + config. Unit tests override this to return an in-memory fake.
     */
    protected async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        const ai = new GoogleGenAI({ apiKey: args.EphemeralToken, httpOptions: { apiVersion: 'v1alpha' } });
        return ai.live.connect({
            model: args.Model,
            config: args.Config,
            callbacks: {
                onmessage: args.OnMessage,
                onerror: args.OnError,
                onclose: args.OnClose,
            },
        });
    }

    /**
     * Creation seam for the mic-capture pipeline. Production delegates to the shared
     * {@link createPcmMicCapture} (a 16 kHz `AudioContext`, inline-Blob capture worklet, and a
     * zero-gain tail; each worklet block is PCM16-encoded and handed to `onPcmChunk` as base64).
     * Unit tests override this with a no-op fake (and may capture `onPcmChunk` to simulate mic
     * frames).
     */
    protected async createMicCapture(
        micStream: MediaStream,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IGeminiMicCapture> {
        return CreatePcmMicCapture(micStream, GEMINI_INPUT_SAMPLE_RATE, onPcmChunk);
    }

    /** Creation seam for the playout engine. Production returns {@link GeminiPcmPlayback}. */
    protected createPlayback(): IGeminiAudioPlayback {
        return new GeminiPcmPlayback();
    }

    /**
     * Creation seam for the avatar's video player, called at connect when the server granted an
     * avatar and the host shows it. Production returns {@link VideoPlayout} (Media Source
     * Extensions); unit tests return a fake.
     *
     * @param options The type the grant names, whether the video carries the voice, and the hook
     *   that routes the element's audio into the PCM playback's Web Audio graph.
     */
    protected CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        return new VideoPlayout(options);
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /**
     * Extracts the model + Live connect config from the server-minted `SessionConfig`
     * (shaped `{ model, config }` by the server's `GeminiRealtime.CreateClientSession`).
     * Falls back to the top-level `Model` / an empty config if a field is missing — the
     * server locked the real config into the token, so the session still behaves correctly.
     */
    private parseSessionConfig(config: ClientRealtimeSessionConfig): GeminiParsedSessionConfig {
        const sessionConfig: JSONObject = config.SessionConfig ?? {};
        const model = typeof sessionConfig['model'] === 'string' ? sessionConfig['model'] : config.Model;
        const raw = sessionConfig['config'];
        const liveConfig =
            raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as LiveConnectConfig) : {};
        const rawIdle = sessionConfig['idleSignal'];
        const idleSignal: RealtimeIdleSignal =
            rawIdle === 'interactionStatus' ? 'interactionStatus' : 'turnComplete';
        const supportsScheduling = sessionConfig['supportsScheduling'] !== false;
        const supportsBlocking = sessionConfig['supportsBlocking'] !== false;
        // Per-model video legality, minted from the provider's profile table. Left undefined by a
        // mint that predates these fields — see LEGACY_VIDEO_MODEL_PREFIX at the call site.
        const supportsInboundVideo =
            typeof sessionConfig['supportsInboundVideo'] === 'boolean' ? sessionConfig['supportsInboundVideo'] : undefined;
        const rawMaxVideoRate = sessionConfig['maxInboundVideoRate'];
        const maxInboundVideoRate =
            typeof rawMaxVideoRate === 'number' && rawMaxVideoRate > 0 ? rawMaxVideoRate : undefined;
        const rawMaxStreams = sessionConfig['maxInboundVideoStreams'];
        const maxInboundVideoStreams =
            typeof rawMaxStreams === 'number' && Number.isInteger(rawMaxStreams) && rawMaxStreams >= 0 ? rawMaxStreams : undefined;
        return {
            model, liveConfig, idleSignal, supportsScheduling, supportsBlocking, supportsInboundVideo, maxInboundVideoRate,
            maxInboundVideoStreams,
            requestedTracks: GeminiRealtimeClient.readRequestedTracks(sessionConfig[REQUESTED_TRACKS_SESSION_KEY]),
            avatar: GeminiRealtimeClient.readAvatarGrant(sessionConfig['avatar']),
        };
    }

    /** The tracks the runtime asks the session for (`requestedTracks`); `undefined` when it sent no list. */
    private static readRequestedTracks(raw: JSONValue | undefined): readonly RealtimeTrackDescriptor[] | undefined {
        if (!Array.isArray(raw)) {
            return undefined;
        }
        const list: RealtimeTrackDescriptor[] = [];
        for (const item of raw) {
            if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                const modality = typeof item['Modality'] === 'string' ? item['Modality'] : undefined;
                const direction = item['Direction'];
                if (modality && (direction === 'inbound' || direction === 'outbound')) {
                    list.push({
                        Modality: modality,
                        Direction: direction,
                        Encoding: typeof item['Encoding'] === 'string' ? item['Encoding'] : undefined,
                        Rate: typeof item['Rate'] === 'number' ? item['Rate'] : undefined,
                        RequiresConsent:
                            typeof item['RequiresConsent'] === 'boolean' ? item['RequiresConsent'] : undefined,
                        SourceID: typeof item['SourceID'] === 'string' ? item['SourceID'] : undefined,
                        Label: typeof item['Label'] === 'string' ? item['Label'] : undefined,
                    });
                }
            }
        }
        return list;
    }

    /**
     * The avatar the server granted: the minted `avatar` block (`{ output: true, encoding, audioMuxed }`), which the
     * server writes only when the session renders one. `audioMuxed` defaults to true, as the server's profile does.
     */
    private static readAvatarGrant(raw: JSONValue | undefined): GeminiAvatarGrant | null {
        const block = GeminiRealtimeClient.readObject(raw);
        if (block?.['output'] !== true) {
            return null;
        }
        return { Encoding: GeminiRealtimeClient.readString(block['encoding']) ?? null, AudioMuxed: block['audioMuxed'] !== false };
    }

    /** Streams one base64 PCM16 mic chunk to the model (no-op once the session is gone, closed, or in error). */
    private sendMicChunk(base64Pcm16: string): void {
        if (!this.session || this.currentState === 'closed' || this.currentState === 'error') {
            return;
        }
        try {
            this.session.sendRealtimeInput({
                audio: { data: base64Pcm16, mimeType: GEMINI_INPUT_AUDIO_MIME_TYPE },
            });
        } catch (err) {
            RealtimeDiagLog(`[GeminiRealtimeClient] sendMicChunk failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Surfaces a fatal websocket error and marks the session unusable. When the session can be
     * resumed, the error is only logged: a websocket `error` is always followed by a `close`,
     * and {@link handleTransportClose} resumes from there.
     */
    private handleTransportError(event: ErrorEvent): void {
        const detail = event.message || (event.error instanceof Error ? event.error.message : String(event.error ?? 'unknown'));
        RealtimeDiagLog(`[GeminiRealtimeClient] Transport error: ${detail}`);
        if (this.resumption?.Handle) {
            return;
        }
        this.emitError({ Message: `Gemini Live transport error: ${detail}`, Fatal: true });
        this.setState('error');
    }

    /**
     * Handles a close of the current connection that the consumer did not ask for. When Google
     * issued a resumption handle, the session reconnects with it; otherwise the close ends the
     * session, as an error when it was abnormal.
     */
    private handleTransportClose(event?: CloseEvent): void {
        const code = event?.code;
        const reason = event?.reason;
        const wasClean = event?.wasClean;
        RealtimeDiagLog(`[GeminiRealtimeClient] Transport closed: code=${code} reason=${reason} wasClean=${wasClean}`);
        if (this.currentState === 'error' || this.currentState === 'closed') {
            return;
        }
        if (this.resumption?.ConnectionLost()) {
            return;
        }
        const isAbnormal = (code !== undefined && code !== 0 && code !== 1000 && code !== 1005) || (wasClean === false && code !== 1000 && code !== 0 && code !== 1005 && code !== undefined);
        if (isAbnormal) {
            this.emitError({
                Message: `Gemini Live connection closed (${code}): ${reason || 'unexpected disconnect'}`,
                Fatal: true,
            });
            this.setState('error');
            return;
        }
        this.setState('closed');
    }

    // ── Inbound message translation ────────────────────────────────────────────

    /**
     * Entry point for every inbound {@link LiveServerMessage}; fans out to per-concern
     * handlers, including `usageMetadata` → {@link emitUsage}.
     */
    private handleServerMessage(message: LiveServerMessage): void {
        this.checkInteractionStatus(message);

        // Session continuity (F7). `resumable: false` (mid-turn, mid-tool-call) arrives with no
        // handle; an update without the flag is treated as resumable.
        if (message.sessionResumptionUpdate) {
            const update = message.sessionResumptionUpdate;
            this.resumption?.RecordHandle(update.newHandle, update.resumable !== false);
        }
        if (message.goAway) {
            this.resumption?.ConnectionEnding(ParseDurationToMs(message.goAway.timeLeft));
        }

        if (message.serverContent) {
            this.handleServerContent(message.serverContent);
        }
        if (message.toolCall) {
            this.handleToolCallFrame(message.toolCall.functionCalls);
        }
        if (message.usageMetadata) {
            this.handleUsageMetadata(message.usageMetadata);
        }
    }

    /**
     * Opens a replacement connection that resumes the session from `handle`, switches to it and
     * closes the old one. Mic capture and playout carry over untouched. Rejects when the
     * connection can't be opened, so {@link RealtimeSessionResumption} can retry.
     *
     * The resume reuses the session's ephemeral token, which Google accepts until the token's
     * `expireTime` (the server driver mints 30 minutes). After that every attempt fails and the
     * session ends with a fatal error.
     *
     * @param handle The resumption handle Google issued.
     * @param attempt Marks the attempt abandoned after a timeout or a consumer close; a
     *                connection that opens after that is closed instead of used.
     */
    protected async resumeSession(handle: string, attempt: RealtimeResumeAttempt): Promise<void> {
        const target = this.connectTarget;
        if (!target) {
            throw new Error('there is no Gemini Live session to resume');
        }
        const resumeTarget: GeminiConnectTarget = {
            ...target,
            Config: { ...target.Config, sessionResumption: { ...target.Config.sessionResumption, handle } },
        };
        const opened = await this.openConnection(resumeTarget);
        if (attempt.Abandoned || this.connectTarget !== target) {
            GeminiRealtimeClient.closeQuietly(opened.Session);
            return;
        }
        const previous = this.session;
        this.useConnection(opened);
        this.connectTarget = resumeTarget;
        if (previous) {
            GeminiRealtimeClient.closeQuietly(previous);
        }
    }

    /**
     * Opens a connection through {@link connectLiveSession}. Its callbacks act only while it is the
     * connection in use, so events from one that was replaced, closed, or is still opening are
     * dropped. It becomes the connection in use through {@link useConnection}, which lets the old
     * connection keep delivering events while a planned move is in progress.
     */
    private async openConnection(target: GeminiConnectTarget): Promise<GeminiOpenedConnection> {
        const number = ++this.issuedConnections;
        const isCurrent = (): boolean => number === this.currentConnection;
        const session = await this.connectLiveSession({
            ...target,
            OnMessage: (message) => {
                if (isCurrent()) {
                    this.handleServerMessage(message);
                }
            },
            OnError: (event) => {
                if (isCurrent()) {
                    this.handleTransportError(event);
                }
            },
            OnClose: (event) => {
                if (isCurrent()) {
                    this.handleTransportClose(event);
                }
            },
        });
        return { Session: session, ConnectionNumber: number };
    }

    /** Makes an opened connection the one in use. */
    private useConnection(opened: GeminiOpenedConnection): void {
        this.session = opened.Session;
        this.currentConnection = opened.ConnectionNumber;
    }

    /** Builds the resumption helper for a newly connected session; see {@link resumption}. */
    private createResumption(): RealtimeSessionResumption {
        return new RealtimeSessionResumption({
            Reconnect: (handle, attempt) => this.resumeSession(handle, attempt),
            OnReconnecting: (reason) => {
                RealtimeDiagLog(`[GeminiRealtimeClient] Resuming the session on a new connection (${reason})`);
                this.setState('connecting');
            },
            OnReconnected: () => this.handleResumed(),
            OnReconnectFailed: (error) => this.handleResumeFailed(error),
            Log: (message) => RealtimeDiagLog(message),
        });
    }

    /**
     * The session continues on a new connection. A turn cut off by a drop never completes
     * there, so the turn state is reset (its partial transcripts are emitted as final) and sends
     * queued behind it go out on the new connection. An avatar's video plays out what arrived
     * of that turn and holds its last frame.
     */
    private handleResumed(): void {
        this.avatarOutput?.Resumed();
        this.emitAvatarVideoSeconds();
        this.finalizeUserTranscript();
        this.finalizeAssistantTranscript();
        this.responseActive = false;
        this.interactionInProgress = false;
        this.activeResponseKind = 'normal';
        this.clearSafetyBackstop();
        this.setState('listening');
        this.flushQueuedSends();
    }

    /** Every resume attempt failed: the session ends with a fatal error. */
    private handleResumeFailed(error: Error): void {
        if (this.currentState === 'closed' || this.currentState === 'error') {
            return;
        }
        this.emitError({ Message: `Gemini Live connection was lost and could not be resumed: ${error.message}`, Fatal: true });
        this.setState('error');
    }

    /** Closes a socket the session no longer uses; it may already be closed. */
    private static closeQuietly(session: GeminiLiveClientSession): void {
        try {
            session.close();
        } catch (err) {
            RealtimeDiagLog(`[GeminiRealtimeClient] Closing a replaced connection failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }


    /**
     * Inspects inbound frames for the untyped `interaction_status` / `interactionStatus` wire field
     * documented for Gemini Live Extended Thinking (V3). Narrowed via null-safe object/string helpers.
     */
    private checkInteractionStatus(message: LiveServerMessage): void {
        const msgObj = GeminiRealtimeClient.readObject(message);
        const contentObj = GeminiRealtimeClient.readObject(message.serverContent);
        const rawStatus =
            GeminiRealtimeClient.readString(msgObj?.['interaction_status']) ??
            GeminiRealtimeClient.readString(msgObj?.['interactionStatus']) ??
            GeminiRealtimeClient.readString(contentObj?.['interaction_status']) ??
            GeminiRealtimeClient.readString(contentObj?.['interactionStatus']);

        if (!rawStatus) {
            return;
        }

        const status = rawStatus.toUpperCase();
        if (status === 'IN_PROGRESS') {
            this.interactionInProgress = true;
            this.responseActive = true;
            if (this.idleSignal === 'interactionStatus') {
                this.scheduleSafetyBackstop();
            }
        } else if (status === 'IDLE') {
            this.clearSafetyBackstop();
            if (this.idleSignal === 'interactionStatus') {
                this.handleIdleTerminal();
            } else {
                this.interactionInProgress = false;
            }
        }
    }

    /**
     * Emits a usage update from a server message's `usageMetadata`.
     *
     * **Delta-vs-cumulative (verified against the `@google/genai` SDK types):** `UsageMetadata`
     * documents `promptTokenCount` as "Number of tokens in the prompt" and `responseTokenCount`
     * as "Total number of tokens across all the generated response candidates" — i.e. PER-RESPONSE
     * counts for the turn this message reports, NOT a session-cumulative running total. Each
     * emission is therefore already a delta, matching the `OnUsage` contract — and matching how
     * the server-bridged `GeminiRealtime` driver forwards the same payload to `IRealtimeSession.OnUsage`.
     */
    private handleUsageMetadata(usageMetadata: NonNullable<LiveServerMessage['usageMetadata']>): void {
        let inputDetails = GeminiRealtimeClient.modalityTokens(usageMetadata.promptTokensDetails);
        // The response side: TEXT and AUDIO, and VIDEO for a generated avatar (when Google reports it).
        const outputDetails = GeminiRealtimeClient.modalityTokens(usageMetadata.responseTokensDetails);
        /**
         * Cost Attribution Note (F6 & Reviewer Item 29):
         * Inbound video frames are sent as individual JPEG images (V5) and billed on the video pricing tier
         * ($0.002 / min, or $1.00 / 1M tokens). The Gemini Live API reports token consumption via
         * usageMetadata.promptTokensDetails partitioned into AUDIO, TEXT, and IMAGE (where video frame tokens
         * are accounted under IMAGE).
         *
         * We expose two candidate cost and telemetry signals:
         * 1. Authoritative Vendor Signal: InputTokenDetails.ImageTokens from promptTokensDetails represents
         *    the actual token consumption billed by the Google inference provider.
         * 2. Track-Level Video Telemetry: VideoFrames (cumulative frames sent) and VideoSeconds (cumulative
         *    active video duration) client-side counters provide fine-grained telemetry and rate attribution.
         *
         * Logging both signals enables operational drift detection: divergence between client-sent VideoFrames
         * and provider-received ImageTokens immediately surfaces frame drops or network throttling in production.
         */
        if (this.videoFramesSent > 0) {
            inputDetails = { ...inputDetails, VideoFrames: this.videoFramesSent, VideoSeconds: this.VideoSeconds };
        }
        this.emitUsage({
            InputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : undefined,
            OutputTokens: typeof usageMetadata.responseTokenCount === 'number' ? usageMetadata.responseTokenCount : undefined,
            ...(inputDetails ? { InputTokenDetails: inputDetails } : {}),
            ...(outputDetails ? { OutputTokenDetails: outputDetails } : {}),
            ...(this.videoFramesSent > 0 ? {
                VideoFrames: this.videoFramesSent,
                VideoSeconds: this.VideoSeconds,
            } : {}),
            Raw: usageMetadata,
        });
    }

    /**
     * Gemini's per-modality token counts (`promptTokensDetails` or `responseTokensDetails`) as a detail block: TEXT,
     * AUDIO, IMAGE and VIDEO. `undefined` when Gemini sent no count for a modality it names.
     */
    private static modalityTokens(details: ModalityTokenCount[] | undefined): RealtimeUsageModalityDetail | undefined {
        if (!Array.isArray(details)) {
            return undefined;
        }
        let block: RealtimeUsageModalityDetail | undefined;
        for (const detail of details) {
            const field = GEMINI_MODALITY_TOKEN_FIELDS[String(detail.modality ?? '').toUpperCase()];
            if (field && typeof detail.tokenCount === 'number') {
                block = block ?? {};
                block[field] = (block[field] ?? 0) + detail.tokenCount;
            }
        }
        return block;
    }

    /**
     * Emits the avatar video generated since the last emission as an update of its own
     * (`OutputTokenDetails.VideoSeconds`, an amount): called where a turn's counting ends (generation complete,
     * turn complete, resumed; an interrupted turn ends at its turn complete) and before the avatar output is
     * disposed, so every second is emitted once, whenever Google's `usageMetadata` arrives.
     */
    private emitAvatarVideoSeconds(): void {
        const seconds = this.avatarOutput?.TakeVideoSeconds() ?? 0;
        if (seconds > 0) {
            this.emitUsage({ OutputTokenDetails: { VideoSeconds: seconds } });
        }
    }

    /** Translates one {@link LiveServerContent} frame in provider-documented signal order. */
    private handleServerContent(content: LiveServerContent): void {
        if (content.interrupted) {
            this.handleInterruption();
        }
        if (content.modelTurn) {
            this.handleModelMedia(content.modelTurn);
            this.handleModelThoughts(content.modelTurn);
        }
        if (content.inputTranscription) {
            this.handleUserTranscription(content.inputTranscription);
        }
        if (content.outputTranscription) {
            this.handleAssistantTranscription(content.outputTranscription);
        }
        if (content.generationComplete) {
            this.handleGenerationComplete();
        }
        if (content.turnComplete) {
            this.handleTurnComplete();
        }
    }

    /**
     * generationComplete: indicates the model has finished generating all tokens for the turn.
     * Playout may still be active (the delay between generationComplete and turnComplete).
     *
     * Per Reviewer Item 20: Draining the queue happens on turnComplete or true IDLE, not prematurely
     * on generationComplete. We set responseActive = false so busy state reflects token completion.
     * An avatar's video gets its end of turn here: playback runs to the true end and holds the
     * last frame.
     */
    private handleGenerationComplete(): void {
        this.avatarOutput?.GenerationComplete();
        this.emitAvatarVideoSeconds();
        if (this.idleSignal === 'turnComplete') {
            this.responseActive = false;
        }
    }

    /**
     * Barge-in: the provider stopped generating because the user spoke. Flush every scheduled
     * playout source (per the Live API contract, `interrupted` is the signal to empty the
     * client's audio queue), surface the TRUE barge-in to the host (Gemini only emits
     * `interrupted` when user input actually cut off in-flight generation — no extra gating
     * needed), and give the floor back. The interrupted turn's accumulated transcript is
     * kept — the following `turnComplete` finalizes what WAS spoken. In an avatar session the
     * video stops too, and the turn's late parts are dropped until its `turnComplete`.
     */
    private handleInterruption(): void {
        this.playback?.Flush();
        this.avatarOutput?.Interrupted();
        this.finalizeThoughtTranscript();
        this.emitInterruption();
        this.setState('listening');
    }

    /**
     * Plays inline model parts. In an avatar session the avatar output routes each part to the
     * video, to the PCM playback or nowhere; otherwise base64 PCM16 @ 24 kHz parts go to the
     * playout queue.
     */
    private handleModelMedia(modelTurn: Content): void {
        if (!modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            if (part.thought) {
                continue; // Thoughts are reasoning summaries, never spoken audio
            }
            const inline = part.inlineData;
            if (!inline?.data) {
                continue;
            }
            if (this.avatarOutput) {
                if (this.avatarOutput.Accept(inline.mimeType, Base64ToArrayBuffer(inline.data))) {
                    this.markGenerationStarted();
                }
                continue;
            }
            // A part that names a non-PCM type (e.g. video/mp4 avatar frames) must never reach PCM
            // playback, where it would play as noise. A part with no type plays, as it always has.
            if (inline.mimeType && !IsPcmAudioMimeType(inline.mimeType)) {
                this.reportDroppedOutput(inline.mimeType);
                continue;
            }
            this.markGenerationStarted();
            this.playback?.Enqueue(Base64ToArrayBuffer(inline.data));
        }
    }

    /** Reports each MIME type of dropped model output once per session, not once per part. */
    private reportDroppedOutput(mimeType: string): void {
        if (this.droppedOutputTypes.has(mimeType)) {
            return;
        }
        this.droppedOutputTypes.add(mimeType);
        console.warn(`[GeminiRealtimeClient] Dropped model output of type ${mimeType}: only PCM audio is played on this session.`);
    }

    /**
     * Extracts thought parts (`part.thought === true`) from model turns and emits them
     * as narration transcript deltas (`Kind: 'narration'`). Thought summaries are reasoning
     * notes, never synthesized as assistant speech.
     */
    private handleModelThoughts(modelTurn: Content): void {
        if (!modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            if (part.thought && part.text) {
                this.pendingThoughtText += part.text;
                this.emitTranscript({
                    Role: 'Assistant',
                    Text: part.text,
                    IsFinal: false,
                    Kind: 'narration',
                    IsThought: true,
                });
            }
        }
    }

    /**
     * User transcription: each frame's `text` is an incremental DELTA (emitted with
     * `IsFinal: false`); the accumulated turn text is finalized on the `finished` flag — or,
     * because the user's turn is over once the model starts answering, by
     * {@link markGenerationStarted}.
     */
    private handleUserTranscription(transcription: Transcription): void {
        if (transcription.text) {
            this.pendingUserText += transcription.text;
            this.emitTranscript({ Role: 'User', Text: transcription.text, IsFinal: false, Kind: 'normal' });
        }
        if (transcription.finished) {
            this.finalizeUserTranscript();
        }
    }

    /**
     * Assistant transcription: deltas accumulate (like the OpenAI driver) and are emitted with
     * the ACTIVE response kind so narration turns are tagged correctly; the turn finalizes on
     * the `finished` flag, with {@link handleTurnComplete} as the fallback.
     */
    private handleAssistantTranscription(transcription: Transcription): void {
        this.markGenerationStarted();
        if (transcription.text) {
            this.pendingAssistantText += transcription.text;
            this.emitTranscript({
                Role: 'Assistant',
                Text: transcription.text,
                IsFinal: false,
                Kind: this.activeResponseKind,
            });
        }
        if (transcription.finished) {
            this.finalizeAssistantTranscript();
        }
    }

    /**
     * Surfaces the model's tool calls to the host and caches each callID→name for
     * {@link SendToolResult}.
     *
     * In synchronous BLOCKING mode (e.g. 3.1 preview), the model yields the floor pending
     * the tool result: `responseActive` is cleared so the tool response can take the floor,
     * and the client silently leaves 'speaking'.
     *
     * In asynchronous NON_BLOCKING mode (Extended Thinking and 3.8 default), the model keeps
     * generating and reasoning in the background. We must NOT set `responseActive = false`,
     * as the model is not idle and still generating. The tool batch barrier tracks the call.
     */
    private handleToolCallFrame(functionCalls: FunctionCall[] | undefined): void {
        if (!functionCalls || functionCalls.length === 0) {
            return;
        }
        if (!this.isNonBlocking) {
            if (this.currentState === 'speaking') {
                this.currentState = 'connected';
            }
            this.responseActive = false;
        }
        for (const call of functionCalls) {
            const callID = call.id ?? '';
            const toolName = call.name ?? '';
            this.pendingToolCallNames.set(callID, toolName);
            this.toolBatchBarrier.TrackPendingCall(callID, () => {
                this.handleToolBatchTimeout();
            });
            this.emitToolCall({ CallID: callID, ToolName: toolName, ArgumentsJson: JSON.stringify(call.args ?? {}) });
        }
    }

    /**
     * Turn boundary: finalize any un-finished assistant transcript.
     * Under 'turnComplete' idle signal, release the busy lock, reset response kind,
     * drain queued sends, and return the floor to the user.
     * Under 'interactionStatus' (Extended Thinking), turnComplete does NOT indicate idle:
     * background reasoning or async tool calls may still be in flight, so the busy lock
     * and queued sends remain held until the true IDLE signal lands.
     */
    private handleTurnComplete(): void {
        this.avatarOutput?.TurnComplete();
        this.emitAvatarVideoSeconds();
        this.finalizeAssistantTranscript();
        this.finalizeThoughtTranscript();
        if (this.idleSignal === 'turnComplete') {
            this.responseActive = false;
            this.activeResponseKind = 'normal';
            this.openClientTurn = false; // the completed generation consumed any open client content
            this.flushQueuedSends();
            if (this.currentState === 'speaking') {
                this.setState('listening');
            }
        } else {
            // Extended Thinking: turn complete within active interaction — re-arm liveness guard
            this.scheduleSafetyBackstop();
        }
    }

    /**
     * Reached when the server emits true IDLE (interactionStatus) or the safety backstop fires.
     * Releases busy state, commits any deferred open client turns without cutting off generation,
     * drains queued sends, and returns the floor.
     */
    private handleIdleTerminal(): void {
        this.clearSafetyBackstop();
        this.interactionInProgress = false;
        this.responseActive = false;
        this.activeResponseKind = 'normal';
        this.finalizeThoughtTranscript();
        if (this.openClientTurn) {
            this.session?.sendClientContent({ turnComplete: true });
            this.openClientTurn = false;
        }
        this.flushQueuedSends();
        if (this.currentState === 'speaking' && !this.IsAudioPlaying) {
            this.setState('listening');
        }
    }

    /**
     * First model output of a turn (audio part or transcription delta): the user's turn is
     * over (finalize their pending transcript), the model is busy, and the client is audibly /
     * imminently `'speaking'`.
     */
    private markGenerationStarted(): void {
        this.finalizeUserTranscript();
        this.responseActive = true;
        if (this.idleSignal === 'interactionStatus') {
            this.interactionInProgress = true;
            this.scheduleSafetyBackstop();
        }
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
    }

    /** Emits the accumulated user turn as final (if non-empty) and clears the accumulator. */
    private finalizeUserTranscript(): void {
        const text = this.pendingUserText;
        this.pendingUserText = '';
        if (text.trim().length > 0) {
            this.emitTranscript({ Role: 'User', Text: text, IsFinal: true, Kind: 'normal' });
        }
    }

    /** Emits the accumulated assistant turn as final (if non-empty), tagged with its kind. */
    private finalizeAssistantTranscript(): void {
        const text = this.pendingAssistantText;
        this.pendingAssistantText = '';
        if (text.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: text, IsFinal: true, Kind: this.activeResponseKind });
        }
    }

    /** Emits the accumulated thought turn as final (if non-empty) with Kind: 'narration' and IsThought: true. */
    private finalizeThoughtTranscript(): void {
        const text = this.pendingThoughtText;
        this.pendingThoughtText = '';
        if (text.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: text, IsFinal: true, Kind: 'narration', IsThought: true });
        }
    }

    // ── Collision-safe send machinery ──────────────────────────────────────────

    /**
     * Runs a send immediately when no turn is in flight; otherwise queues it for the next
     * `turnComplete`. This is Gemini's equivalent of the OpenAI driver's
     * queue-behind-active-response rule — stricter here because ANY client content interrupts
     * in-flight generation on the Live API.
     */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /**
     * Drains queued sends in order on a turn boundary, stopping as soon as one starts a new
     * turn (sets {@link responseActive}) — the rest wait for that turn's completion.
     */
    private flushQueuedSends(): void {
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /**
     * Sends a user turn that TRIGGERS generation (`turnComplete: true`), stamping the upcoming
     * turn's kind at send time and eagerly marking the model busy. `emitSpeaking` mirrors the
     * OpenAI driver: typed-text / tool-result replies reflect `'speaking'` immediately;
     * narration waits for the first model output.
     */
    private sendTriggeringUserTurn(text: string, kind: 'normal' | 'narration', emitSpeaking: boolean): void {
        const session = this.session;
        if (!session) {
            return;
        }
        // REALTIME text, not clientContent: native-audio Live models only honor clientContent
        // for history seeding — a mid-call `turnComplete: true` user turn lands in history but
        // does NOT start generation (the model stays silent until the user's next spoken turn
        // commits via VAD). `sendRealtimeInput({ text })` is the documented in-conversation
        // text path and triggers an immediate response on every Live model generation.
        // NOTE: realtime text does NOT commit an open clientContent turn (context notes), so
        // `openClientTurn` is left as-is — the model `turnComplete` that follows clears it.
        session.sendRealtimeInput({ text });
        this.responseActive = true;
        if (this.idleSignal === 'interactionStatus') {
            this.interactionInProgress = true;
            this.scheduleSafetyBackstop();
        }
        this.activeResponseKind = kind;
        if (emitSpeaking) {
            this.setState('speaking');
        }
    }

    /**
     * Sends the tool response (Gemini continues the turn with it) and marks the model busy.
     *
     * In BLOCKING mode (legacy 3.1), if context notes have left a client content turn open
     * ({@link openClientTurn}), the tool response alone does NOT start generation — the Live API
     * holds for more client input until the turn is committed. The empty-turn commit
     * (`sendClientContent({ turnComplete: true })`) releases generation.
     *
     * In NON_BLOCKING mode (Extended Thinking and 3.8 default), setting `turnComplete: true`
     * unconditionally interrupts active model generation mid-sentence. We must NOT commit
     * openClientTurn here; it is deferred until true IDLE (or a subsequent user turn commit).
     */
    /**
     * Extracts scheduling hints (`__mj_scheduling` or legacy `scheduling`) from the tool output,
     * strips both keys so they do not leak into the model's response payload, resolves the scheduling
     * directive accepting both 'INTERRUPT' and 'INTERRUPTED', and warns on unrecognized values or
     * unsupported models (delegates normalization to Core `ExtractToolSchedulingHint`).
     */
    private resolveFunctionScheduling(
        parsed: Record<string, unknown>,
        toolName: string
    ): FunctionResponseScheduling | undefined {
        const hint = ExtractToolSchedulingHint(parsed, toolName, 'GeminiRealtimeClient');
        if (!hint) {
            return undefined;
        }

        const schedStr = hint === 'silent' ? 'SILENT' : hint === 'whenIdle' ? 'WHEN_IDLE' : 'INTERRUPT';
        if (!this.supportsScheduling) {
            console.warn(
                `[GeminiRealtimeClient] Dropping scheduling hint "${schedStr}" for tool "${toolName}": ` +
                `function scheduling is only supported on gemini-3.8-live.`
            );
            return undefined;
        }

        switch (hint) {
            case 'silent':
                return FunctionResponseScheduling.SILENT;
            case 'whenIdle':
                return FunctionResponseScheduling.WHEN_IDLE;
            case 'interrupt':
                return FunctionResponseScheduling.INTERRUPT;
        }
    }

    private sendToolResponseTurn(callID: string, name: string, outputJson: string): void {
        const session = this.session;
        if (!session) {
            return;
        }
        this.toolBatchBarrier.RecordResult(callID);
        const parsed = this.parseToolOutput(outputJson);
        const sched = this.resolveFunctionScheduling(parsed as Record<string, unknown>, name);
        const functionResponse: FunctionResponse = {
            id: callID,
            name,
            response: parsed,
            ...(sched ? { scheduling: sched } : {}),
        };

        session.sendToolResponse({
            functionResponses: [functionResponse],
        });

        if (!this.isNonBlocking) {
            if (this.openClientTurn) {
                session.sendClientContent({ turnComplete: true });
                this.openClientTurn = false;
            }
            this.responseActive = true;
            this.activeResponseKind = 'normal';
            this.setState('speaking');
        }

        this.pendingToolCallNames.delete(callID);
    }

    /**
     * Parses a JSON-stringified tool result into the structured object Gemini's
     * function-response slot expects, wrapping non-object output as `{ result: <value> }` so a
     * free-text result still round-trips (same fallback as the server driver).
     */
    private parseToolOutput(output: string): JSONObject {
        try {
            const parsed: unknown = JSON.parse(output);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as JSONObject;
            }
            return { result: parsed as JSONValue };
        } catch {
            return { result: output };
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private scheduleSafetyBackstop(delayMs = GeminiRealtimeClient.ASSISTANT_SAFETY_BACKSTOP_MS): void {
        this.clearSafetyBackstop();
        this.assistantSafetyBackstopTimer = setTimeout(() => {
            this.assistantSafetyBackstopTimer = null;
            this.handleSafetyBackstopTrigger();
        }, delayMs);
    }

    private clearSafetyBackstop(): void {
        if (this.assistantSafetyBackstopTimer) {
            clearTimeout(this.assistantSafetyBackstopTimer);
            this.assistantSafetyBackstopTimer = null;
        }
    }

    private handleSafetyBackstopTrigger(): void {
        this.handleIdleTerminal();
    }

    private handleToolBatchTimeout(): void {
        if (this.idleSignal === 'turnComplete') {
            this.flushQueuedSends();
        }
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.pendingAssistantText = '';
        this.pendingUserText = '';
        this.pendingThoughtText = '';
        this.responseActive = false;
        this.interactionInProgress = false;
        this.activeResponseKind = 'normal';
        this.openClientTurn = false;
        this.queuedSends = [];
        this.pendingToolCallNames.clear();
        this.toolBatchBarrier.Clear();
        this.clearSafetyBackstop();
    }

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }

    private static readObject(value: unknown): Record<string, unknown> | undefined {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    }

    private static readString(value: unknown): string | undefined {
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link GeminiRealtimeClient} is
 * instantiated dynamically through the ClassFactory, so a consumer must call this no-op
 * to create a static code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadGeminiRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
