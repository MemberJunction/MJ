import {
    ClampSessionSecondsValue,
    ClientRealtimeSessionConfig,
    DEFAULT_CREDENTIAL_REFRESH_LEAD_MS,
    DEFAULT_REALTIME_AUDIO_TRACKS,
    DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS,
    DEFAULT_REALTIME_SOFT_RECONNECT_WINDOW_SECONDS,
    ExtractRealtimeTimingConfig,
    JSONObject,
    REALTIME_SHARED_CONFIG_KEYS,
    RealtimeConversationMemory,
    RealtimeDiagLog,
    RealtimeMemorySeed,
    RealtimeReconnectContext,
    RealtimeReconnectController,
    RealtimeReconnectFailureCode,
    RealtimeReconnectReason,
    REALTIME_RESUMPTION_MAX_RETRY_DELAY_MS,
    REALTIME_RESUMPTION_PREPARE_TIMEOUT_MS,
    RealtimeTrack,
    RealtimeTrackDescriptor,
    RealtimeTrackDirection,
    RealtimeTrackKey,
    ResolveRequestedTracks,
    RealtimeUsageModalityDetail,
    ScrubRealtimeTimingConfigKeys,
} from '@memberjunction/ai';
import { IRealtimeAudioMeter, REALTIME_AUDIO_BIN_COUNT } from '../audio/audioMeter';
import type { MediaVideoSource } from '../media/model';

/**
 * Session-config key under which the realtime runtime hands a driver the tracks to negotiate
 * (`RealtimeSessionRuntime.BuildClientConfig` aggregates them from the active channels). It is a
 * CLIENT-side negotiation hint, never a provider field: a driver reads it (Gemini) or ignores it.
 */
export const REQUESTED_TRACKS_SESSION_KEY = 'requestedTracks';

/**
 * Shared catalog/timing session-config keys stripped by `ToProviderSessionConfig` before
 * forwarding to strict wire protocols (e.g. OpenAI Realtime `session.update`).
 */
export const REALTIME_SHARED_SESSION_CONFIG_KEYS = REALTIME_SHARED_CONFIG_KEYS;

/** Minimum microphone RMS level treated as active user speech when holding soft-window reconnects. */
export const DEFAULT_USER_SPEECH_ACTIVE_LEVEL_THRESHOLD = 0.02;

/**
 * How old a reconnect's credential refresh may be for a later attempt to join it instead of sending a new one: the
 * preparation limit of the attempt that started it, plus the longest wait before the next attempt. See
 * `joinOrStartReconnectRefresh`.
 */
const SHARED_REFRESH_MAX_JOIN_AGE_MS = REALTIME_RESUMPTION_PREPARE_TIMEOUT_MS + REALTIME_RESUMPTION_MAX_RETRY_DELAY_MS;

/** Options passed to `RealtimeClientTokenRefreshCallback`. */
export interface RealtimeClientTokenRefreshOptions {
    /**
     * When `true` on a relay session, requests that `ExtendRelaySession` re-arm a single handle-less
     * reopen window so a seed-fallback reconnect can open a fresh upstream connection.
     */
    readonly AllowFreshReopen?: boolean;
}

/** The catalog timing and resumption settings the server stamps on a minted or refreshed session. */
export type RealtimeClientTimingFields = Pick<
    ClientRealtimeSessionConfig,
    'ConnectionMaxSeconds' | 'SessionMaxSeconds' | 'ReconnectBufferSeconds' | 'TrustNativeResumption'
>;

/**
 * Fresh credential + session config returned by `RefreshRealtimeClientSessionToken`
 * when a browser client performs a mid-call credential refresh or reconnect. The timing fields
 * are the server's re-stamped catalog timing; absent ones leave the client's current values as they are.
 */
export interface RefreshedRealtimeClientCredential extends RealtimeClientTimingFields {
    readonly Kind?: 'token' | 'relay';
    readonly EphemeralToken: string;
    readonly ExpiresAt: string;
    readonly RelayUrl?: string;
    readonly SessionConfig?: JSONObject;
    readonly RemainingSessionSeconds?: number;
}

/**
 * Callback registered by `RealtimeSessionRuntime` so `BaseRealtimeClient` drivers
 * can mint a fresh single-use credential or extend a relay grant before expiry or reconnect.
 */
export type RealtimeClientTokenRefreshCallback = (
    options?: RealtimeClientTokenRefreshOptions
) => Promise<RefreshedRealtimeClientCredential>;

/**
 * Context passed to `BaseRealtimeClient.Reconnect(context)` on a scheduled or error-recovery
 * mid-call reconnect.
 */
export interface RealtimeClientReconnectContext extends RealtimeReconnectContext {
    readonly RefreshCredential: (options?: RealtimeClientTokenRefreshOptions) => Promise<RefreshedRealtimeClientCredential>;
    readonly Credential: RefreshedRealtimeClientCredential;
    readonly Seed: RealtimeMemorySeed;
}

/**
 * The session config as the PROVIDER must receive it: the server-built config minus the
 * client-only hints the runtime adds. Drivers that send the config on the wire go through this —
 * OpenAI's Realtime API rejects the WHOLE `session.update` on an unknown key
 * (`unknown_parameter: 'session.requestedTracks'`), so one stray hint costs the session its
 * instructions and every tool.
 */
export function ToProviderSessionConfig(sessionConfig: JSONObject): JSONObject {
    return ScrubRealtimeTimingConfigKeys(sessionConfig, [REQUESTED_TRACKS_SESSION_KEY]);
}

/**
 * A point-in-time snapshot of the session's audible activity, sampled by the host
 * (typically per animation frame) via {@link BaseRealtimeClient.GetAudioActivity} to drive
 * audio-reactive call visuals — the orb that vibrates with the agent's voice and the
 * true-spectrum EQ.
 *
 * CAPABILITY-SHAPED, like usage telemetry: every member is `null` when that direction has
 * no meter. Hosts must degrade gracefully — levels-without-bins renders envelope breathing,
 * full `null` falls back to turn-state-driven animation.
 */
export interface RealtimeAudioActivity {
    /** RMS level (0..1) of the USER's microphone, or `null` when un-metered. */
    InputLevel: number | null;
    /** RMS level (0..1) of the AGENT's audio output, or `null` when un-metered. */
    OutputLevel: number | null;
    /** Mic frequency spectrum as {@link REALTIME_AUDIO_BIN_COUNT} normalized bins, or `null`. */
    InputBins: number[] | null;
    /** Agent-output frequency spectrum as {@link REALTIME_AUDIO_BIN_COUNT} normalized bins, or `null`. */
    OutputBins: number[] | null;
}

/**
 * A transcript event emitted by a realtime client for either side of the conversation.
 *
 * `Kind` distinguishes NORMAL conversation turns from NARRATION turns — the brief,
 * ephemeral spoken updates a host requests via {@link BaseRealtimeClient.RequestSpokenUpdate}
 * while background (delegated) work runs. By product decision narration transcripts are
 * NOT captions and are never persisted; hosts surface them as a transient "live note".
 */
export interface RealtimeClientTranscript {
    /** Whose turn this transcript belongs to. */
    Role: 'User' | 'Assistant';
    /**
     * The transcribed text. For `IsFinal: false` events this is the incremental DELTA
     * for the in-flight turn; for `IsFinal: true` it is the complete turn text.
     */
    Text: string;
    /** Whether this is the final transcript for the turn (`true`) or an interim delta (`false`). */
    IsFinal: boolean;
    /**
     * `'normal'` for a regular conversation turn; `'narration'` for an ephemeral
     * spoken-progress update triggered by {@link BaseRealtimeClient.RequestSpokenUpdate}.
     */
    Kind: 'normal' | 'narration';
    /**
     * MACHINE-READABLE correction marker: `true` when this FINAL transcript SUPERSEDES the
     * session's immediately-preceding final transcript of the same role — e.g. ElevenLabs'
     * post-barge-in `agent_response_correction`, which re-finalizes the assistant turn with
     * the text that was ACTUALLY spoken before the interruption cut it off. Hosts that
     * persist finals must UPDATE the previous turn in place instead of appending a
     * duplicate. Absent/`false` on ordinary turns and on interim deltas.
     */
    ReplacesPrevious?: boolean;
    /**
     * `true` when this transcript represents model-authored reasoning / thought summaries
     * (e.g. Gemini Extended Thinking `part.thought === true`), rather than a spoken progress update.
     * Thought transcripts render into a narration delegation card and are never synthesized
     * as audio or chained into spoken narration history.
     */
    IsThought?: boolean;
    /**
     * The provider's id for the conversation item a user transcript belongs to, which matches the
     * id given to {@link BaseRealtimeClient.OnUserSpeechStart} for the same utterance. Absent on
     * drivers that do not send one.
     */
    ItemId?: string;
}

/**
 * A tool-call request emitted by the realtime model. The host executes the tool and feeds
 * the result back via {@link BaseRealtimeClient.SendToolResult}, correlated by `CallID`.
 */
export interface RealtimeClientToolCall {
    /** Provider-assigned identifier for this call, used to correlate the eventual tool result. */
    CallID: string;
    /** The name of the tool the model is requesting to invoke. */
    ToolName: string;
    /** The arguments for the call as a JSON string, exactly as the provider emitted them. */
    ArgumentsJson: string;
}

/**
 * A usage/telemetry update emitted by a realtime client.
 *
 * **Deltas preferred:** each emission SHOULD carry the incremental token counts for the
 * response/turn that just completed (not a session-cumulative running total), matching the
 * server-side `RealtimeUsage` contract — consumers accumulate. A driver whose provider only
 * reports cumulative totals must convert to deltas before emitting.
 *
 * **Per-driver availability** (capability, not laziness — providers without usage events
 * simply never emit):
 * - **OpenAI** — emits per-response deltas from the GA `response.done` frame's `usage` payload.
 * - **Gemini** — emits per-turn deltas from `LiveServerMessage.usageMetadata`
 *   (`promptTokenCount` / `responseTokenCount` are per-response counts, not cumulative), and,
 *   in an avatar session, the seconds of avatar video each turn generated, in updates of their
 *   own that carry only `OutputTokenDetails.VideoSeconds`.
 * - **ElevenLabs** — the Conversational AI socket exposes no usage events; never emits.
 * - **AssemblyAI** — the streaming STT socket exposes no token-usage events; never emits.
 */
export interface RealtimeClientUsage {
    /** Input tokens reported in this update (a delta for the completed response/turn). */
    InputTokens?: number;
    /** Output tokens reported in this update (a delta for the completed response/turn). */
    OutputTokens?: number;
    /**
     * Session duration in seconds reported by the provider or transport (e.g. OpenAI Live's
     * 15 s WebRTC session pre-bill and cumulative voice duration snapshots).
     */
    DurationSeconds?: number;
    /** Per-modality breakdown of input tokens (text, audio, image/video). */
    InputTokenDetails?: RealtimeUsageModalityDetail;
    /**
     * Per-modality breakdown of output tokens (text, audio, video), and the seconds of avatar video
     * generated since the last update (`VideoSeconds`, an amount like the tokens).
     */
    OutputTokenDetails?: RealtimeUsageModalityDetail;
    /** Cumulative video frames processed or sent across inbound video tracks. */
    VideoFrames?: number;
    /** Cumulative duration in seconds across inbound video tracks. */
    VideoSeconds?: number;
    /** The raw provider usage payload, for hosts that want provider-specific detail. */
    Raw?: unknown;
}

/**
 * Connection / turn state of a realtime client session.
 * - `connecting` — the provider connection is being negotiated
 * - `connected`  — the transport is up but the control channel is not yet open
 * - `listening`  — control channel open; mic live; waiting on / hearing the user
 * - `speaking`   — the model is producing (or about to produce) audible output
 * - `closed`     — the session has been torn down
 * - `error`      — a fatal transport error occurred; the session is no longer usable
 *
 * Note there is deliberately NO `thinking` state here: "the host is executing a tool" is
 * host policy, not wire state. Hosts that want a busy indicator set it themselves between
 * receiving a tool call and calling {@link BaseRealtimeClient.SendToolResult}.
 */
export type RealtimeClientState = 'connecting' | 'connected' | 'listening' | 'speaking' | 'closed' | 'error';

/**
 * The {@link RealtimeClientError.Code} of a call that ended because its session reached its time limit (MJAPI's relay
 * closed it with `REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE`), so a host can say so instead of showing a connection error.
 */
export const REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE = 'time-limit';

/**
 * An error surfaced by a realtime client. `Fatal: true` means the session is unusable
 * (transport failure); `Fatal: false` is a provider-reported, recoverable error frame.
 */
export interface RealtimeClientError {
    /** Human-readable error message. */
    Message: string;
    /** Optional provider-specific error code. */
    Code?: string;
    /** Whether the error terminated the session. */
    Fatal: boolean;
}

/**
 * Abstract base class for **browser-side, provider-direct** realtime (voice) clients.
 *
 * This is the client-side mirror of the server's `BaseRealtimeModel` pattern: the server
 * mints an ephemeral credential + session config (`ClientRealtimeSessionConfig`) via its
 * provider driver, and the browser resolves the matching CLIENT driver through the
 * MemberJunction `ClassFactory` using the config's `Provider` string as the registration
 * key (e.g. `'openai'`):
 *
 * ```typescript
 * const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(
 *     BaseRealtimeClient, startResult.Provider);
 * ```
 *
 * Concrete drivers (e.g. {@link OpenAIRealtimeClient}) own ALL provider wire concerns:
 * transport (WebRTC/WebSocket), event-name translation, the response state machine
 * (never letting a tool-result reply collide with an in-flight response), narration-kind
 * tagging, and audible-playback tracking. Hosts own POLICY: when to narrate, what
 * instructions to speak, transcript persistence, and UI state.
 *
 * All `On*` methods register a single handler (matching the server `IRealtimeSession`
 * style); registering again replaces the previous handler.
 *
 * ## DRIVER AUTHOR OBLIGATIONS
 *
 * Hard-won, provider-independent rules every client driver MUST honor (the client-side
 * mirror of the obligations documented on the server's `BaseRealtimeModel` in
 * `@memberjunction/ai`). Most were paid for in live debugging; do not relearn them:
 *
 * 1. **Silent exit from `'speaking'` after a tool call.** When the model emits a tool
 *    call, the host typically shows its own busy ("thinking") indicator while the tool
 *    executes. The driver must leave the `'speaking'` state *silently* (no state
 *    emission) at tool-call time so the turn's trailing frames don't clobber the host's
 *    indicator.
 * 2. **Busy-flag release on tool-call emission (deadlock guard).** A tool-call frame
 *    means the model has yielded the floor pending the result. Any internal "response
 *    active" flag MUST be cleared then — otherwise the eventual {@link SendToolResult}
 *    (or a queued send) deadlocks waiting for a turn boundary that will never arrive
 *    until after the result is sent.
 * 3. **Playback flush + honest {@link IsAudioPlaying} on interruption.** On a true
 *    barge-in the driver must flush any locally-owned audio playback and report
 *    `IsAudioPlaying === false` promptly — stale queued audio after an interruption is
 *    a product bug, not a nicety. The same flush applies to {@link CancelActiveResponse}.
 * 4. **{@link SendText} must NOT echo a user transcript — and implies barge-in.** The
 *    driver must not synthesize a user-role transcript event for injected text (the host
 *    owns the local echo and would render the message twice), and an active spoken
 *    response is cancelled via the driver's own cancel path before the text is injected
 *    (see {@link CancelActiveResponse}).
 * 5. **Tool-result delivery invariant.** Every result fed back via {@link SendToolResult}
 *    must EVENTUALLY be voiced/processed by the model and never dropped. If the provider
 *    rejects overlapping generation triggers, the driver queues the result's trigger
 *    behind the in-flight response and flushes it at the next turn boundary. The result
 *    must also EXPLICITLY trigger generation on providers that don't auto-continue after
 *    a tool response: OpenAI requires an explicit `response.create`; Gemini auto-continues
 *    UNLESS prior client content (a context note's `turnComplete: false`) left the turn
 *    open, in which case the driver must commit the turn or the model stays silent.
 * 6. **Token/credential expiry surfaces as a FATAL error.** When the ephemeral credential
 *    dies (expiry, revocation, unexpected socket loss), the driver must surface it through
 *    {@link OnError} with `Fatal: true` so the host tears down cleanly instead of idling
 *    forever on a dead connection.
 * 7. **`'listening'` only after the session config is applied.** The driver must not
 *    report the session as listening until the server-built session config (system prompt
 *    + tools) has actually been applied to the provider socket — otherwise early turns run
 *    against an unconfigured model.
 * 8. **`SessionConfig` is a private pact.** The `ClientRealtimeSessionConfig.SessionConfig`
 *    payload is authored by the same-keyed SERVER driver and consumed only by this client
 *    driver; its shape may change between the two driver halves without notice. Hosts and
 *    intermediaries treat it as an opaque blob — and so must any code outside the matching
 *    driver pair.
 * 9. **Audio metering is a CAPABILITY, not an obligation — but wire what you own.** A
 *    driver that owns (or can tap) an audio plane should attach
 *    {@link BaseRealtimeClient.attachInputAudioMeter} / {@link attachOutputAudioMeter} so
 *    {@link GetAudioActivity} reports real levels: the mic stream everywhere
 *    (`RealtimeAudioMeter.ForStream`), the shared `RealtimePcmPlayback.CreateMeter()` on
 *    client-owned-audio drivers, the remote WebRTC stream on peer-connection drivers.
 *    Meters must be released on disconnect ({@link closeAudioMeters}). A driver with no
 *    tappable plane simply attaches nothing — hosts fall back to turn-state animation.
 * 10. **Follow a replaced microphone track, when the transport can.** A device switch or a
 *    lost device swaps the track inside the mic stream, and anything bound to the old track (a
 *    WebRTC sender, a Web Audio source node, the input meter's clone) goes silent. A driver
 *    implements {@link BaseRealtimeClient.ReplaceMicrophone} to rebind them: `replaceTrack` on
 *    its senders, or `IPcmMicCapture.Rebind` on its PCM capture, and a new input meter.
 * 11. **Refuse a transport you don't speak.** A session minted to run through MJAPI's realtime
 *    relay (`ClientRealtimeSessionConfig.Transport` `'relay'`) has no provider token, only a relay
 *    URL. Every driver calls {@link BaseRealtimeClient.AssertTransportSupported} first in
 *    {@link BaseRealtimeClient.Connect}, so a driver that connects only to its provider refuses
 *    such a session with a clear error instead of failing at the provider. A driver that speaks
 *    its provider's protocol through the relay opts in by overriding
 *    {@link BaseRealtimeClient.SupportsRelayTransport}.
 * 12. **The agent's video keeps the voice's rules.** A driver whose model sends the agent's video
 *    hands it over through {@link emitRemoteVideo} once per session, and only while its outbound
 *    video track is live; an audio-only session hands over nothing and never plays a video part as
 *    audio. Its player gets each frame as the model sent it (a `RealtimeVideoFrame`, in order).
 *    Barge-in flushes the video with the voice (obligation #3) and the cut turn's late media never
 *    plays; a turn's end lets its video play out; a video that carries the voice never plays it
 *    twice; each second of generated video is reported once (`OutputTokenDetails.VideoSeconds`); the
 *    video a model streams between answers (Vertex AI's avatar does) plays, but is not the agent
 *    speaking: it reports no `'speaking'`, leaves {@link IsBusy} as it was, and does not keep
 *    {@link IsAudioPlaying} true once the answer's media has played; a resumed session keeps its
 *    video; `Disconnect` releases it. A driver whose voice and video share a media timeline queues
 *    its PCM at its media times and gives the player its voice playback as the clock
 *    (`VideoPlayoutOptions.Clock`). The video conformance kit
 *    (`@memberjunction/ai-realtime-client/testing`) checks each rule.
 */
export abstract class BaseRealtimeClient {
    // ── Registered handlers (single-handler style, like IRealtimeSession) ─────
    private transcriptHandler?: (transcript: RealtimeClientTranscript) => void;
    private toolCallHandler?: (call: RealtimeClientToolCall) => void;
    private stateChangeHandler?: (state: RealtimeClientState) => void;
    private errorHandler?: (error: RealtimeClientError) => void;
    private interruptionHandler?: () => void;
    private userSpeechStartHandler?: (itemId?: string) => void;
    private usageHandler?: (usage: RealtimeClientUsage) => void;
    private remoteVideoHandler?: (video: MediaVideoSource) => void;
    private trackHandler?: (track: RealtimeTrack) => void;

    // ── Media-track state and negotiation ──────────────────────────────────────
    /** Tracks requested, established, or denied on this session. */
    protected tracks: RealtimeTrack[] = [];

    /**
     * Established tracks on this session (tracks in the `'live'` state).
     */
    public get EstablishedTracks(): readonly RealtimeTrack[] {
        return this.tracks.filter((t) => t.State === 'live');
    }

    /**
     * All tracks evaluated for this session (including `'unsupported'` or `'denied'`).
     */
    public get AllTracks(): readonly RealtimeTrack[] {
        return this.tracks;
    }

    /** The model's declared inbound video stream ceiling, recorded by {@link negotiateTracks}; `undefined` until a driver declares one. */
    private inboundVideoStreamLimit: number | undefined;

    /** What the driver supports, recorded by {@link negotiateTracks} so {@link AddTrack} can resolve against it later. */
    private supportedTracks: readonly RealtimeTrackDescriptor[] | null = null;

    /** The index the next added track's id takes, so an added track never reuses an id. */
    private nextTrackIndex = 0;

    /**
     * How many concurrent inbound video streams the model accepts: the ceiling the driver declared when it
     * negotiated tracks, else `1` when an inbound video track is live and `0` when it is not.
     *
     * A source arbiter reads this to decide whether several live video sources must be narrowed to one
     * (with a note to the model on each switch) or passed through untouched.
     */
    public get MaxInboundVideoStreams(): number {
        if (typeof this.inboundVideoStreamLimit === 'number') {
            return this.IsTrackEstablished('video', 'inbound') ? this.inboundVideoStreamLimit : 0;
        }
        return this.IsTrackEstablished('video', 'inbound') ? 1 : 0;
    }

    /**
     * The frame rate (frames per second) the live inbound video track was negotiated at — the model's
     * ceiling or the session's request, whichever is lower — or `undefined` when no inbound video track
     * is live or none declared a rate. Anything pacing a video feed reads THIS, never a constant of its own.
     */
    public get InboundVideoRate(): number | undefined {
        const track = this.tracks.find(
            (t) => t.State === 'live' && t.Descriptor.Direction === 'inbound' && String(t.Descriptor.Modality).trim().toLowerCase() === 'video'
        );
        const rate = track?.Descriptor.Rate;
        return typeof rate === 'number' && rate > 0 ? rate : undefined;
    }

    /**
     * Whether the model takes inbound video on this session: the driver declared an inbound video track it supports when it
     * negotiated tracks, and a stream limit above zero. No video track need be live; one is added when a capture starts
     * ({@link AddTrack}). `false` before tracks are negotiated, and for a driver that does not negotiate them.
     */
    public get SupportsInboundVideo(): boolean {
        return (this.inboundVideoStreamLimit ?? 1) > 0 && (this.supportedTracks ?? []).some(isInboundVideo);
    }

    /**
     * Returns whether a track of the requested modality and direction is established and `'live'`.
     */
    public IsTrackEstablished(modality: string, direction: RealtimeTrackDirection): boolean {
        const mod = modality.trim().toLowerCase();
        return this.tracks.some(
            (t) => t.State === 'live' && String(t.Descriptor.Modality).trim().toLowerCase() === mod && t.Descriptor.Direction === direction
        );
    }

    /**
     * Negotiates requested tracks against model capability.
     * Audio (inbound + outbound) is the baseline floor of every realtime session;
     * any additional requested tracks (such as channel video) are unioned onto this baseline floor.
     */
    protected negotiateTracks(
        requested: readonly RealtimeTrackDescriptor[] | undefined,
        supported: readonly RealtimeTrackDescriptor[] | undefined,
        maxInboundVideoStreams?: number
    ): RealtimeTrack[] {
        // Keyed by direction + modality + SOURCE, so two requested inbound video streams fed by
        // different sources stay two tracks (a model that accepts several needs both), while two
        // descriptors that name no source still collapse to the one stream they always did.
        const trackMap = new Map<string, RealtimeTrackDescriptor>();
        for (const t of DEFAULT_REALTIME_AUDIO_TRACKS) {
            trackMap.set(RealtimeTrackKey(t), t);
        }
        if (requested) {
            for (const t of requested) {
                trackMap.set(RealtimeTrackKey(t), t);
            }
        }
        const effectiveRequested: readonly RealtimeTrackDescriptor[] = Array.from(trackMap.values());
        const effectiveSupported = supported ?? DEFAULT_REALTIME_AUDIO_TRACKS;
        this.inboundVideoStreamLimit = typeof maxInboundVideoStreams === 'number' ? maxInboundVideoStreams : undefined;
        const resolved = ResolveRequestedTracks(
            effectiveRequested,
            effectiveSupported,
            (d, i) => `${d.Direction}:${String(d.Modality)}:${i}`,
            { MaxInboundVideoStreams: this.inboundVideoStreamLimit }
        );
        this.tracks = resolved.map((t) => ({
            ...t,
            State: t.State === 'requested' ? 'live' : t.State,
        }));
        this.supportedTracks = effectiveSupported;
        this.nextTrackIndex = this.tracks.length;
        for (const track of this.tracks) {
            this.emitTrackStateChange(track);
        }
        return this.tracks;
    }

    /**
     * Adds a track to a running session, such as inbound video when the user starts their camera, resolved against
     * what the driver supported when it negotiated at connect. The new track is `'live'`, or `'unsupported'` with the
     * reason (the model takes no such track, or no more inbound video streams). A live track with the same
     * direction, modality and source is returned as it is. Other tracks keep their ids.
     *
     * The base re-negotiates locally, which is all a driver needs when its provider accepts the media without a
     * setup change (Gemini Live takes video frames at any time). A driver whose wire must change overrides this and
     * calls it.
     *
     * @returns The track, or `null` when the session has not negotiated tracks: before it connects, or with a driver
     *   that does not negotiate them (only the Gemini driver does today).
     */
    public AddTrack(descriptor: RealtimeTrackDescriptor): RealtimeTrack | null {
        if (!this.supportedTracks) {
            return null;
        }
        const key = RealtimeTrackKey(descriptor);
        const existing = this.tracks.find((t) => t.State === 'live' && RealtimeTrackKey(t.Descriptor) === key);
        if (existing) {
            return existing;
        }
        // Resolve after the live inbound video streams, so the stream cap and its reason count them.
        const liveVideo = this.tracks.filter((t) => t.State === 'live' && isInboundVideo(t.Descriptor)).map((t) => t.Descriptor);
        const index = this.nextTrackIndex++;
        const resolved = ResolveRequestedTracks(
            [...liveVideo, descriptor],
            this.supportedTracks,
            (d) => `${d.Direction}:${String(d.Modality)}:${index}`,
            { MaxInboundVideoStreams: this.inboundVideoStreamLimit }
        );
        const added = resolved[resolved.length - 1];
        const track: RealtimeTrack = { ...added, State: added.State === 'requested' ? 'live' : added.State };
        this.tracks = [...this.tracks.filter((t) => RealtimeTrackKey(t.Descriptor) !== key), track];
        this.emitTrackStateChange(track);
        return track;
    }

    /**
     * Ends a track on a running session, such as inbound video when the user stops their camera: the track is
     * reported `'ended'` and leaves {@link AllTracks}. Audio, the session's floor, cannot be removed.
     *
     * @returns Whether a track was ended.
     */
    public RemoveTrack(descriptor: Pick<RealtimeTrackDescriptor, 'Modality' | 'Direction' | 'SourceID'>): boolean {
        if (String(descriptor.Modality).trim().toLowerCase() === 'audio') {
            return false;
        }
        const key = RealtimeTrackKey(descriptor);
        const track = this.tracks.find((t) => RealtimeTrackKey(t.Descriptor) === key);
        if (!track) {
            return false;
        }
        this.tracks = this.tracks.filter((t) => t !== track);
        this.emitTrackStateChange({ ...track, State: 'ended' });
        return true;
    }

    // ── Audio-activity metering (capability surface — see driver obligation #9) ─
    /** Meter over the USER's microphone, when the driver attached one. */
    protected inputAudioMeter: IRealtimeAudioMeter | null = null;
    /** Meter over the AGENT's audio output, when the driver attached one. */
    protected outputAudioMeter: IRealtimeAudioMeter | null = null;

    /**
     * The session's current audible activity, or `null` when this driver attached no
     * meters at all (hosts then keep their turn-state-driven visuals). Sampled by hosts
     * per animation frame — implementations are cheap, allocation-light reads of an
     * `AnalyserNode`; no per-call provider traffic.
     */
    public GetAudioActivity(): RealtimeAudioActivity | null {
        if (!this.inputAudioMeter && !this.outputAudioMeter) {
            return null;
        }
        return {
            InputLevel: this.inputAudioMeter ? this.inputAudioMeter.Level() : null,
            OutputLevel: this.outputAudioMeter ? this.outputAudioMeter.Level() : null,
            InputBins: this.inputAudioMeter ? this.inputAudioMeter.Bins(REALTIME_AUDIO_BIN_COUNT) : null,
            OutputBins: this.outputAudioMeter ? this.outputAudioMeter.Bins(REALTIME_AUDIO_BIN_COUNT) : null
        };
    }

    /** Attaches (replacing + closing any previous) the USER-microphone meter. `null` detaches. */
    protected attachInputAudioMeter(meter: IRealtimeAudioMeter | null): void {
        this.inputAudioMeter?.Close();
        this.inputAudioMeter = meter;
    }

    /** Attaches (replacing + closing any previous) the AGENT-output meter. `null` detaches. */
    protected attachOutputAudioMeter(meter: IRealtimeAudioMeter | null): void {
        this.outputAudioMeter?.Close();
        this.outputAudioMeter = meter;
    }

    /** Releases both meters — every driver calls this from its disconnect/teardown path. */
    protected closeAudioMeters(): void {
        this.attachInputAudioMeter(null);
        this.attachOutputAudioMeter(null);
    }

    /**
     * Opens the provider connection using the server-minted ephemeral credential and applies
     * `config.SessionConfig` once the control channel is ready — so prompt and tool authority
     * stay server-side even though the browser owns the socket. The payload's SHAPE is a
     * private pact between this driver and the same-keyed server driver that minted it (see
     * driver obligation #8); how it is applied is entirely driver-specific.
     *
     * @param config The server-minted client session config (provider, model, ephemeral token or relay transport,
     *   session config). A driver refuses a transport it does not speak first (see {@link AssertTransportSupported}).
     * @param micStream The user's microphone capture stream. The caller acquires it (so IT owns
     *   the permission prompt UX); the client attaches it to the transport and stops its tracks
     *   on {@link Disconnect}.
     * @param cameraStream OPTIONAL camera capture stream for a VIDEO session (the model "sees" the
     *   user). Only attached by video-capable drivers; audio-only drivers ignore it (back-compatible —
     *   existing callers and drivers need not pass or read it). The model/avatar's video comes BACK via
     *   {@link OnRemoteVideo}.
     */
    public abstract Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream, cameraStream?: MediaStream): Promise<void>;

    /**
     * Whether this driver can open a relay session (`ClientRealtimeSessionConfig.Transport` `'relay'`): connect to
     * MJAPI's realtime relay at the session's `RelayUrl` rather than to its provider. `false` here; a driver that speaks
     * its provider's protocol through the relay opts in by overriding it (the Gemini Enterprise client does).
     */
    protected get SupportsRelayTransport(): boolean {
        return false;
    }

    /**
     * Refuses a session this driver cannot open: a relay session, unless the driver opts in through
     * {@link SupportsRelayTransport}. Every driver calls this first in {@link Connect}, before it touches the session's
     * media or opens a connection (driver obligation #11). The message names the provider key and never quotes the
     * relay URL, which carries the relay's ticket.
     *
     * @param config The session the host asked this driver to open.
     * @throws When the session runs through the relay and this driver does not support it.
     */
    protected AssertTransportSupported(config: ClientRealtimeSessionConfig): void {
        if (config.Transport === 'relay' && !this.SupportsRelayTransport) {
            throw new Error(
                `The '${config.Provider}' realtime client cannot open a session through MJAPI's relay (Transport 'relay'); it connects only to its provider.`
            );
        }
    }

    // ── Remote (agent) audio slot ──────────────────────────────────────────────
    // Lives here, not in each driver, so every driver that owns a tappable agent-audio plane
    // (a WebRTC remote track, or a PCM playout engine's output node) shares ONE lifecycle:
    // current stream + late-subscriber replay + isolated fan-out + reset on Disconnect.

    /** The agent's current remote-audio stream, or `null` until a driver publishes one. */
    private remoteMediaStream: MediaStream | null = null;
    /** Host handlers notified when the agent's stream lands (or immediately, if already present). */
    private remoteMediaStreamHandlers: Array<(stream: MediaStream) => void> = [];

    /**
     * Returns the AGENT's remote-audio {@link MediaStream} when this driver owns a tappable
     * agent-audio plane (a WebRTC driver's remote track, or a PCM driver's playout output),
     * or `null` otherwise. Hosts use it to MIX the agent's voice into a browser-side recording
     * alongside the mic; `null` (drivers with no tappable plane, or before the stream lands)
     * degrades gracefully to mic-only capture. Hosts may still call it as `client.GetRemoteMediaStream?.()`.
     * Pure read — never mutates.
     */
    public GetRemoteMediaStream(): MediaStream | null {
        return this.remoteMediaStream;
    }

    /**
     * Registers a handler invoked when the agent's remote-audio stream becomes available —
     * IMMEDIATELY (synchronously) if it has already landed, otherwise when the driver publishes
     * it (a WebRTC track typically lands AFTER {@link Connect} resolves). Lets a host attach the
     * agent voice to a recording that began before the stream landed. Handler errors are
     * isolated (logged) so a host bug never disturbs the call. Handlers are session-scoped:
     * {@link clearRemoteMediaStream} (called from `Disconnect`) drops them.
     */
    public OnRemoteMediaStream(handler: (stream: MediaStream) => void): void {
        this.remoteMediaStreamHandlers.push(handler);
        if (this.remoteMediaStream) {
            this.invokeRemoteMediaStreamHandler(handler, this.remoteMediaStream);
        }
    }

    /**
     * Driver hook: records the agent's remote-audio stream and fans it out to every registered
     * handler. Passing `null` (a driver with no tappable plane) just records `null` and
     * notifies nobody.
     */
    protected publishRemoteMediaStream(stream: MediaStream | null): void {
        this.remoteMediaStream = stream;
        if (!stream) return;
        for (const handler of this.remoteMediaStreamHandlers) {
            this.invokeRemoteMediaStreamHandler(handler, stream);
        }
    }

    /**
     * Driver hook for `Disconnect`: drops the stream AND the handlers. Handlers must not survive
     * into a later `Connect` on a reused instance, or a stale host callback would receive the
     * next session's stream.
     */
    protected clearRemoteMediaStream(): void {
        this.remoteMediaStream = null;
        this.remoteMediaStreamHandlers = [];
    }

    private invokeRemoteMediaStreamHandler(handler: (stream: MediaStream) => void, stream: MediaStream): void {
        try {
            handler(stream);
        } catch (error) {
            console.warn(`[${this.constructor.name}] remote-stream handler threw:`, error);
        }
    }

    /**
     * Injects typed text into the live session as a USER turn and asks the model to respond.
     * Implementations must route the reply through the same collision-safe path as tool
     * results so it never collides with an in-flight response. No-op when the control
     * channel is not open.
     *
     * **SendText implies barge-in:** an active spoken response is cancelled (via the
     * driver's own {@link CancelActiveResponse} path) before the text is injected, so the
     * typed turn takes the floor immediately instead of waiting behind stale speech.
     *
     * Implementations must NOT synthesize a user-role transcript event for the injected
     * text — the host owns the local echo (driver obligation #4).
     *
     * @param text The user's typed message (callers pass pre-trimmed, non-empty text).
     */
    public abstract SendText(text: string): void;

    /**
     * Cancels the model's ACTIVE spoken response and flushes pending playback so a new user
     * turn can take the floor immediately; no-op when nothing is active. MUST NOT affect
     * server-side delegated work — cancelling speech is a floor-control action, not an abort
     * of in-flight tools/agents (hosts abort delegated work from {@link OnInterruption} /
     * their own policy, never from this call).
     *
     * Implementations must leave {@link IsBusy} and {@link IsAudioPlaying} honest after the
     * cancel (response inactive, local playback flushed).
     */
    public abstract CancelActiveResponse(): void;

    /**
     * Injects background context into the model's conversation WITHOUT forcing a reply —
     * e.g. delegated-run progress the model can draw on the next time it speaks.
     *
     * @param text The context note text (the host owns any prefixing/formatting policy).
     */
    public abstract SendContextNote(text: string): void;

    /**
     * Asks the model for ONE brief interim utterance (e.g. a spoken progress update while
     * delegated work runs). Implementations MUST tag the resulting turn's transcripts with
     * `Kind: 'narration'` and MUST NOT let this response collide with a pending tool-result
     * reply — the tool result is queued and spoken as soon as the narration finishes.
     *
     * **Collision rule — drivers MUST queue or skip:** when a model response is already in
     * flight, the driver must either defer the update to the next turn boundary or skip it
     * outright (skipping is acceptable — narration is disposable by contract; a stale
     * "still working…" line has no value once the real result lands). Hosts SHOULD still
     * gate calls on {@link IsBusy} / {@link IsAudioPlaying} for timing quality — a
     * well-timed update beats a queued-then-stale one — but the driver is the safety net.
     *
     * @param instructions The exact provider instructions for the utterance. The instruction
     *   TEXT is host policy (e.g. first-person phrasing rules) — the client only carries it.
     */
    public abstract RequestSpokenUpdate(instructions: string): void;

    /**
     * Asks the model to speak ONE turn that is part of the conversation — captioned, transcribed and
     * persisted like any turn the model takes on its own (an interviewer's greeting, a guide's opening).
     *
     * The deliberate contrast with {@link RequestSpokenUpdate}: an update is disposable narration a
     * container throws away; a turn is the record (MJ#4591). Drivers implement it with the same wire
     * mechanics and collision rule as their spoken update, tagging the reply `Kind: 'normal'`.
     * Optional: a driver from before this capability existed omits it, and a container falls back to
     * the spoken update rather than going silent.
     *
     * @param instructions What to say, in the host's words; the model speaks in its own persona.
     */
    public RequestSpokenTurn?(instructions: string): void;

    /**
     * Feeds an executed tool's result back to the model, correlated by `callID`, and ensures
     * the model SPEAKS the result as soon as possible: immediately when idle, otherwise
     * queued behind the in-flight response (e.g. a progress narration) so the trigger is
     * never dropped by the provider.
     *
     * Template method: dispatches to {@link doSendToolResult} first (so the wire send happens
     * before soft-window reconnect evaluation and rejected/unknown call IDs can return `false`),
     * then records the result into {@link conversationMemory} via {@link recordToolResult}.
     *
     * @param callID The `CallID` from the originating {@link RealtimeClientToolCall}.
     * @param outputJson The tool's result as a JSON-stringified string.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        const accepted = this.doSendToolResult(callID, outputJson);
        if (accepted === false) {
            return;
        }
        this.recordToolResult(callID, outputJson);
    }

    /**
     * Concrete driver implementation for sending a tool result on the wire.
     * Return `false` if the `callID` was rejected/ignored (e.g. unknown or duplicate call ID)
     * so {@link SendToolResult} skips recording it into conversation memory.
     */
    protected doSendToolResult(_callID: string, _outputJson: string): boolean | void {
        throw new Error(`${this.constructor.name} must implement doSendToolResult(callID, outputJson)`);
    }

    /**
     * Mutes / unmutes the microphone (implementations toggle the mic tracks' `enabled` flag —
     * the transport stays up; the provider just receives silence while muted).
     *
     * @param muted `true` to mute the mic, `false` to unmute.
     */
    public abstract SetMuted(muted: boolean): void;

    /**
     * Moves a connected session onto the microphone stream's current audio track: call it after the
     * track changes (a device switch, or a lost device replaced by the default) or to use another
     * stream. The connection stays up and the provider hears the new track. The driver now owns this
     * stream as it owned the one given to {@link Connect}; the previous stream's tracks are the
     * caller's to stop.
     *
     * Mute follows the track: the new track's `enabled` flag decides it, so a caller replacing a
     * muted track carries `enabled` over (the `LocalMediaController` does).
     *
     * **Optional capability** (driver obligation #10): a driver that can't rebind its transport
     * leaves it undefined. Does nothing when the session isn't connected.
     *
     * @param micStream The stream to follow, usually the one given to {@link Connect} after the
     *   controller swapped its track.
     * @throws (rejects) When the stream has no audio track; the session keeps its current microphone.
     */
    public ReplaceMicrophone?(micStream: MediaStream): Promise<void>;

    /**
     * Tears down the provider connection and all client-held resources (control channel,
     * transport, mic tracks, audio sink) and emits a final `'closed'` state (unless the
     * session already ended in `'error'`). Safe to call more than once.
     */
    public abstract Disconnect(): Promise<void>;

    /**
     * `true` while a model response is in flight (generation started and not yet done).
     * Distinct from {@link IsAudioPlaying}: generation runs ahead of playback.
     * Hosts use this to gate interim narration so it never interrupts a reply.
     */
    public abstract get IsBusy(): boolean;

    /**
     * `true` while model audio is AUDIBLY playing in the browser. Distinct from
     * {@link IsBusy} — audio plays at realtime while generation finishes early, so the
     * model can be "idle" while speech is still coming out of the speaker. Hosts must
     * gate narration on BOTH, or queued utterances come out late and stale.
     */
    public abstract get IsAudioPlaying(): boolean;

    // ── Handler registration ──────────────────────────────────────────────────

    /**
     * Registers the (single) transcript handler. Receives interim deltas (`IsFinal: false`)
     * and final turn transcripts (`IsFinal: true`) for both roles, tagged with their
     * {@link RealtimeClientTranscript.Kind}.
     */
    public OnTranscript(handler: (transcript: RealtimeClientTranscript) => void): void {
        this.transcriptHandler = handler;
    }

    /**
     * Registers the (single) tool-call handler. The host executes the tool and calls
     * {@link SendToolResult} with the outcome.
     */
    public OnToolCall(handler: (call: RealtimeClientToolCall) => void): void {
        this.toolCallHandler = handler;
    }

    /**
     * Registers the (single) state-change handler. States may be re-emitted (e.g. repeated
     * `'listening'` on successive barge-ins); hosts should treat emissions as idempotent.
     */
    public OnStateChange(handler: (state: RealtimeClientState) => void): void {
        this.stateChangeHandler = handler;
    }

    /**
     * Registers the (single) error handler. Receives both fatal transport errors (which are
     * also followed by an `'error'` state change) and non-fatal provider error frames.
     */
    public OnError(handler: (error: RealtimeClientError) => void): void {
        this.errorHandler = handler;
    }

    /**
     * Registers the (single) interruption handler.
     *
     * **True barge-in only:** fires ONLY when USER INPUT CUT OFF ACTIVE MODEL OUTPUT — a
     * model response in flight or audio audibly playing when the user took the floor. A
     * user simply taking their normal turn while the model is idle is NOT an interruption,
     * and drivers must not report it as one (e.g. a raw "speech started" frame must be
     * gated on whether a response is actually active or audio is playing).
     *
     * On interruption, drivers must also flush locally-owned playback and report
     * {@link IsAudioPlaying} `=== false` promptly (driver obligation #3). Hosts typically
     * use this hook to abort in-flight delegated work so a stale result is never narrated
     * into a conversation that has moved on.
     */
    public OnInterruption(handler: () => void): void {
        this.interruptionHandler = handler;
    }

    /**
     * Registers the single handler invoked when the provider's voice-activity detection saw
     * the user start to speak. Fires once per detected onset and may fire again inside one
     * turn after a pause; it carries no text. When the provider's event names the conversation
     * item this speech belongs to (OpenAI-protocol `input_audio_buffer.speech_started.item_id`),
     * `itemId` carries that id so the host can pair the onset with the matching user
     * transcript (`RealtimeClientTranscript.ItemId`); otherwise `itemId` is `undefined`. Unlike
     * {@link OnInterruption}, it fires whether or not the model was speaking.
     */
    public OnUserSpeechStart(handler: (itemId?: string) => void): void {
        this.userSpeechStartHandler = handler;
    }

    /**
     * Registers the (single) usage handler.
     *
     * Emissions carry token **deltas** for the response/turn that just completed (see
     * {@link RealtimeClientUsage} — deltas preferred; cumulative-only providers must convert
     * in the driver). Hosts accumulate and relay/persist on their own cadence (e.g. the voice
     * session service debounces a `RelayRealtimeUsage` mutation onto the co-agent prompt run).
     *
     * **Optional capability:** drivers whose provider exposes no usage telemetry simply never
     * emit — registering a handler is always safe, but hosts must not assume emissions arrive.
     * See {@link RealtimeClientUsage} for per-driver availability.
     */
    public OnUsage(handler: (usage: RealtimeClientUsage) => void): void {
        this.usageHandler = handler;
    }

    /**
     * Registers the (single) remote-VIDEO handler — the model/avatar's video for a VIDEO session (a talking-head
     * the host renders, e.g. as the agent's tile). Invoked once the provider's video is available.
     *
     * The video is a {@link MediaVideoSource}: a live stream (a WebRTC track), or a player that must own the
     * `<video>` element (MSE or WebCodecs playout of encoded avatar video). Hosts show either with
     * `AttachVideoSource`.
     *
     * **Optional capability:** audio-only drivers (the default) never emit — registering is always safe,
     * but hosts must not assume video arrives. A driver whose model sends video (the server driver declares an
     * outbound video track in its session's `Capabilities.SupportedOutboundTracks`, or renders an avatar,
     * `BaseRealtimeModel.SupportsAvatarOutput`) calls {@link emitRemoteVideo} when it is live.
     *
     * @param handler Invoked with the remote video when it becomes available.
     */
    public OnRemoteVideo(handler: (video: MediaVideoSource) => void): void {
        this.remoteVideoHandler = handler;
    }

    /**
     * Registers the track-state-change handler — invoked when tracks transition in lifecycle
     * (e.g. established to `'live'`, `'denied'`, or `'unsupported'`).
     */
    public OnTrackStateChange(handler: (track: RealtimeTrack) => void): void {
        this.trackHandler = handler;
    }

    /**
     * Streams one video frame as base64-encoded image data to the model.
     * Optional capability — drivers that support inbound video tracks implement this.
     *
     * @param base64Image Base64-encoded image data.
     * @param mimeType Image MIME type (defaults to 'image/jpeg').
     * @param sourceId Which source this frame came from. A driver whose model takes ONE inbound video
     *   stream ignores it (the source arbiter already chose what to send); a driver whose model takes
     *   several routes the frame to the track bound to that `SourceID`.
     * @returns `true` if accepted and sent; `false` if dropped (throttled, unestablished, etc.).
     */
    public SendVideoFrame?(base64Image: string, mimeType?: string, sourceId?: string): boolean;

    // ── Conversation memory, resumption, and unified reconnect controller ────

    /** Rolling conversation memory used to re-seed provider context on reconnect. */
    protected readonly conversationMemory = new RealtimeConversationMemory({ Log: RealtimeDiagLog });
    /** Duration of a single provider connection in seconds from `ClientRealtimeSessionConfig.ConnectionMaxSeconds`. */
    protected configuredCallDurationSeconds: number | undefined;
    /** Credential/session token lifetime in seconds from `ClientRealtimeSessionConfig.SessionMaxSeconds` (or `MaxSessionSeconds`). */
    protected configuredSessionMaxSeconds: number | undefined;
    /** Buffer in seconds before `CallDurationSeconds` expiry at which `Reconnect` is triggered. */
    protected configuredReconnectBufferSeconds: number = DEFAULT_REALTIME_RECONNECT_BUFFER_SECONDS;
    /** Optional metadata override for whether native resumption is trusted on this endpoint. */
    protected configuredTrustNativeResumption: boolean | undefined;
    /** Optional callback installed by `RealtimeSessionRuntime` to refresh the provider token mid-call. */
    protected tokenRefreshCallback: RealtimeClientTokenRefreshCallback | null = null;
    /** Tool call IDs that were in flight when a non-native seed reconnect occurred. */
    protected callsFromBeforeReseed = new Set<string>();

    private readonly toolCallNamesById = new Map<string, string>();
    private readonly inFlightToolCallIds = new Set<string>();
    private readonly recordedToolCallIds = new Set<string>();
    private currentCredential: RefreshedRealtimeClientCredential = {
        Kind: 'token',
        EphemeralToken: '',
        ExpiresAt: '',
        SessionConfig: {},
    };
    private refreshedInActiveCycle = false;
    /**
     * The pre-reconnect credential refresh still in flight, if any, and when it started. A later attempt joins it
     * instead of minting a second credential (the refresh outlives the attempt that started it when that attempt's
     * preparation timed out), but only while it is younger than {@link SHARED_REFRESH_MAX_JOIN_AGE_MS}.
     */
    private reconnectCredentialRefresh: { readonly Promise: Promise<void>; readonly StartedAtMs: number } | null = null;
    /** Connections opened on {@link currentCredential}, counted against {@link CredentialConnectionLimit}. */
    private connectionsOnCredential = 0;
    /**
     * The credential the live connection opened on. It differs from {@link currentCredential} once a refresh mints a new
     * one; on a driver whose connections close when their credential expires, that expiry ends the live connection.
     */
    private connectionCredential: RefreshedRealtimeClientCredential = this.currentCredential;

    /** Unified I/O-free reconnect controller shared with server-side `BaseRealtimeSession`. */
    protected readonly reconnectController: RealtimeReconnectController = new RealtimeReconnectController({
        PrepareAttempt: (context) => this.prepareClientReconnectAttempt(context.Attempt),
        Reconnect: (context) => this.executeClientReconnectAttempt(context),
        // The network watch is started and stopped here, not in the hooks, so a driver override cannot skip it.
        OnReconnectFailed: (error, code) => {
            this.stopWatchingNetworkOnline();
            this.onReconnectFailed(error, code);
        },
        OnReconnecting: (reason) => {
            this.startWatchingNetworkOnline();
            this.onReconnecting(reason);
        },
        OnReconnected: (usedNativeResumption) => {
            this.stopWatchingNetworkOnline();
            this.onReconnected(usedNativeResumption);
        },
        ReturnToOldConnection: () => this.ResumeOnOldConnection(),
        BuildSeed: () => {
            const seed = this.conversationMemory.Seed();
            return seed.Entries.length > 0 ? seed : null;
        },
        IsIdle: () => !this.isTurnActiveForReconnect(),
        HoldsHardMove: () => this.holdsHardReconnectPoint(),
        TrustsNativeResumption: () => this.TrustsNativeResumption,
        RequiresPostTurnHandle: () => this.RequiresPostTurnResumptionHandle,
        Log: (msg) => RealtimeDiagLog(msg),
    });

    /**
     * Reads catalog-stamped timing and resumption settings from the typed fields of `config`, falling
     * back to `config.SessionConfig` (`connectionMaxSeconds`, `sessionMaxSeconds`, `reconnectBufferSeconds`,
     * `trustNativeResumption`), records the initial credential snapshot, and schedules proactive
     * credential/relay refresh.
     */
    public ApplySessionConfigTiming(config: ClientRealtimeSessionConfig): void {
        if (!this.IsReconnecting) {
            this.reconnectController.Reset();
        }
        this.currentCredential = {
            Kind: config.Transport === 'relay' ? 'relay' : 'token',
            EphemeralToken: config.EphemeralToken,
            ExpiresAt: config.ExpiresAt,
            ...(config.RelayUrl ? { RelayUrl: config.RelayUrl } : {}),
            SessionConfig: config.SessionConfig,
        };
        // The Connect that applies this credential opens the first connection on it.
        this.connectionsOnCredential = 1;
        this.connectionCredential = this.currentCredential;
        const fromSessionConfig = ExtractRealtimeTimingConfig(config.SessionConfig);
        this.applyTimingFields({
            ConnectionMaxSeconds: config.ConnectionMaxSeconds ?? fromSessionConfig.ConnectionMaxSeconds,
            SessionMaxSeconds: config.SessionMaxSeconds ?? config.MaxSessionSeconds ?? fromSessionConfig.SessionMaxSeconds,
            ReconnectBufferSeconds: config.ReconnectBufferSeconds ?? fromSessionConfig.ReconnectBufferSeconds,
            TrustNativeResumption: config.TrustNativeResumption ?? fromSessionConfig.TrustNativeResumption,
        });
        this.scheduleCredentialRefresh();
    }

    /** Records each timing setting that is present; an absent one keeps the client's current value. */
    private applyTimingFields(timing: RealtimeClientTimingFields): void {
        if (timing.ConnectionMaxSeconds !== undefined) {
            this.configuredCallDurationSeconds = timing.ConnectionMaxSeconds;
        }
        if (timing.SessionMaxSeconds !== undefined) {
            this.configuredSessionMaxSeconds = timing.SessionMaxSeconds;
        }
        if (timing.ReconnectBufferSeconds !== undefined) {
            this.configuredReconnectBufferSeconds = timing.ReconnectBufferSeconds;
        }
        if (timing.TrustNativeResumption !== undefined) {
            this.configuredTrustNativeResumption = timing.TrustNativeResumption;
        }
    }

    /**
     * Optional runtime ceiling override (e.g. Gemini's 120s ceiling when uncompressed video is active).
     * Narrowed against `DefaultCallDurationSeconds` and `configuredCallDurationSeconds` via `ClampSessionSecondsValue`.
     */
    protected get RuntimeCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /** Driver fallback connection ceiling in seconds when model metadata omits `connectionMaxSeconds`. */
    protected get DefaultCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /**
     * Effective connection ceiling in seconds. Metadata and runtime caps narrow the driver's
     * provider ceiling (`ClampSessionSecondsValue(DefaultCallDurationSeconds, RuntimeCallDurationSeconds, configuredCallDurationSeconds)`),
     * never widen it.
     */
    public get CallDurationSeconds(): number | undefined {
        return ClampSessionSecondsValue(
            this.DefaultCallDurationSeconds,
            this.RuntimeCallDurationSeconds,
            this.configuredCallDurationSeconds
        );
    }

    /** Seconds before {@link CallDurationSeconds} when the reconnect buffer window opens. */
    public get ReconnectBufferSeconds(): number {
        return this.configuredReconnectBufferSeconds;
    }

    /** Whether native provider resumption is trusted on the first reconnect attempt. */
    public get TrustsNativeResumption(): boolean {
        return this.configuredTrustNativeResumption ?? this.DefaultTrustsNativeResumption;
    }

    protected get DefaultTrustsNativeResumption(): boolean {
        return false;
    }

    /**
     * Whether this driver's provider emits a fresh resumable handle shortly after each `turnComplete`
     * (Gemini / Vertex AI Live), so planned moves wait for that post-turn handle.
     */
    protected get RequiresPostTurnResumptionHandle(): boolean {
        return false;
    }

    /** Whether this driver requires a freshly minted single-use credential on each reconnect. */
    protected get RequiresFreshTokenPerReconnect(): boolean {
        return true;
    }

    /**
     * How many connections `credential` may open, or `undefined` for no limit (the default). A driver whose provider
     * counts uses on a credential overrides it, so the client re-mints before it would open a connection the
     * credential has no use left for, instead of spending a failed attempt finding out.
     */
    protected CredentialConnectionLimit(_credential: RefreshedRealtimeClientCredential): number | undefined {
        return undefined;
    }

    /**
     * Whether the provider closes a connection when the credential it opened on expires, even after the client holds a
     * newer one. `false` (the default) for a credential that only gates opening the connection, as OpenAI's
     * `client_secret` does. A driver returning `true` gets a planned move onto the refreshed credential before the old
     * one expires (see {@link connectionDeadlineAtMs}), instead of a drop at the expiry.
     */
    protected ConnectionClosesAtCredentialExpiry(_credential: RefreshedRealtimeClientCredential): boolean {
        return false;
    }

    /**
     * When the provider will close the live connection before its duration limit: the expiry of the credential it
     * opened on, for a driver whose connections die with their credential. Only once a refresh has minted a credential
     * that outlives it: with nothing newer to move onto (the refresh failed, or the session cap bounds the new one too),
     * an early move would open on the same expiring credential, and moves would follow each other ever faster up to it.
     */
    private connectionDeadlineAtMs(): number | undefined {
        if (!this.ConnectionClosesAtCredentialExpiry(this.connectionCredential)) {
            return undefined;
        }
        const expiresAtMs = Date.parse(this.connectionCredential.ExpiresAt);
        const currentExpiresAtMs = Date.parse(this.currentCredential.ExpiresAt);
        if (!Number.isFinite(expiresAtMs) || !Number.isFinite(currentExpiresAtMs) || currentExpiresAtMs <= expiresAtMs) {
            return undefined;
        }
        return expiresAtMs;
    }

    /** True when the current credential has opened every connection it allows. */
    private isCredentialSpent(): boolean {
        const limit = this.CredentialConnectionLimit(this.currentCredential);
        return limit !== undefined && this.connectionsOnCredential >= limit;
    }

    /** Whether this concrete client subclass implements mid-call `Reconnect`. */
    protected get SupportsMidCallReconnect(): boolean {
        return this.Reconnect !== BaseRealtimeClient.prototype.Reconnect;
    }

    /** Accessor for the client's rolling conversation memory ledger. */
    public get ConversationMemory(): RealtimeConversationMemory {
        return this.conversationMemory;
    }

    /** True while a mid-call reconnect is actively in flight. */
    protected get IsReconnecting(): boolean {
        return this.reconnectController.IsReconnecting;
    }

    /** Latest recorded provider resumption handle or conversation ID. */
    public get ResumptionHandle(): string | null {
        return this.reconnectController.Handle;
    }

    /** Records a provider resumption handle or conversation ID, along with whether it is resumable now. */
    public RecordResumptionHandle(handle: string | null | undefined, resumable = true): void {
        this.reconnectController.RecordHandle(handle, resumable);
    }

    /** Registers the host callback used to mint a fresh credential before expiry or reconnect. */
    public SetTokenRefreshCallback(callback: RealtimeClientTokenRefreshCallback | null): void {
        this.tokenRefreshCallback = callback;
        this.scheduleCredentialRefresh();
    }

    /** Mints a fresh credential via the registered host callback, updates `currentCredential`, and re-arms the refresh timer. */
    protected async refreshCredentialForReconnect(
        options?: RealtimeClientTokenRefreshOptions
    ): Promise<RefreshedRealtimeClientCredential> {
        if (!this.tokenRefreshCallback) {
            return this.currentCredential;
        }
        const refreshed = await this.tokenRefreshCallback(options);
        this.applyTimingFields(refreshed);
        // A new token starts with all its uses; a relay grant extended in place (no token) keeps the count.
        if (refreshed.EphemeralToken && refreshed.EphemeralToken !== this.currentCredential.EphemeralToken) {
            this.connectionsOnCredential = 0;
        }
        this.currentCredential = {
            ...refreshed,
            EphemeralToken: refreshed.EphemeralToken || this.currentCredential.EphemeralToken,
            ...(refreshed.RelayUrl || this.currentCredential.RelayUrl
                ? { RelayUrl: refreshed.RelayUrl || this.currentCredential.RelayUrl }
                : {}),
        };
        this.scheduleCredentialRefresh();
        return this.currentCredential;
    }

    private scheduleCredentialRefresh(): void {
        if (!this.SupportsMidCallReconnect || !this.tokenRefreshCallback || this.reconnectController.IsDisposed) {
            return;
        }
        this.reconnectController.ScheduleCredentialRefresh(
            this.currentCredential.ExpiresAt,
            () => {
                void this.refreshCredentialProactively();
            },
            DEFAULT_CREDENTIAL_REFRESH_LEAD_MS,
            this.configuredSessionMaxSeconds
        );
    }

    private async refreshCredentialProactively(): Promise<void> {
        if (this.reconnectController.IsDisposed || !this.tokenRefreshCallback) {
            return;
        }
        try {
            await this.refreshCredentialForReconnect();
        } catch (err) {
            RealtimeDiagLog(
                `[${this.constructor.name}] proactive credential refresh failed: ${err instanceof Error ? err.message : String(err)}`
            );
            return;
        }
        // The live connection may close when the credential it opened on expires: with a newer one in hand, re-arm so
        // the planned move happens before that expiry. A reconnect in flight arms the timers once its connection opens.
        if (!this.IsReconnecting && this.reconnectController.HasDurationTimersArmed && this.connectionDeadlineAtMs() !== undefined) {
            this.ArmConnectionDurationTimer();
        }
    }

    /** Returns true when the current credential is expired or within `marginSeconds` of expiry. */
    protected isCredentialNearExpiry(marginSeconds = 60): boolean {
        if (!this.currentCredential.ExpiresAt) {
            return false;
        }
        const expiresAtMs = Date.parse(this.currentCredential.ExpiresAt);
        if (!Number.isFinite(expiresAtMs)) {
            return false;
        }
        return expiresAtMs - Date.now() <= marginSeconds * 1000;
    }

    /**
     * Arms (or re-arms) the soft and hard connection-ceiling timers for the current transport socket.
     * - Soft timer opens the turn-boundary window before `CallDurationSeconds`.
     * - Hard timer fires at `CallDurationSeconds - ReconnectBufferSeconds` and forces a reconnect; while the model is
     *   answering it waits for the turn to end, up to shortly before `CallDurationSeconds`.
     * Both measure from the connection deadline instead when it comes before `CallDurationSeconds`
     * ({@link connectionDeadlineAtMs}: the expiry of the credential the connection opened on, on a driver whose
     * connections close with it).
     */
    public ArmConnectionDurationTimer(): void {
        if (!this.SupportsMidCallReconnect || this.reconnectController.IsDisposed) {
            return;
        }
        this.reconnectController.ArmDurationTimers(
            this.CallDurationSeconds,
            this.ReconnectBufferSeconds,
            DEFAULT_REALTIME_SOFT_RECONNECT_WINDOW_SECONDS,
            this.connectionDeadlineAtMs()
        );
    }

    protected armCallDurationTimer(): void {
        this.ArmConnectionDurationTimer();
    }

    /** Clears both soft and hard call-duration timers and any pending boundary flag. */
    protected clearCallDurationTimer(): void {
        this.reconnectController.ArmDurationTimers(undefined, this.ReconnectBufferSeconds);
    }

    /** Cancels all reconnect and duration timers when the session is disconnected. */
    protected DisposeReconnectTimers(): void {
        this.stopWatchingNetworkOnline();
        this.reconnectController.InvalidateHandle();
        this.reconnectController.Dispose();
    }

    /** Lets a reconnect waiting out a retry delay try again as soon as the browser says the network is back. */
    private readonly onNetworkOnline = (): void => {
        this.reconnectController.NotifyNetworkOnline();
    };
    private watchingNetworkOnline = false;

    /**
     * Listens for the browser's `online` event while a reconnect runs. Outside a browser (a Node host or test) there is
     * no `window`, and the retry schedule alone drives the attempts. `online` only says a network interface is up, not
     * that the provider is reachable, so it starts one attempt early and never replaces the schedule.
     */
    private startWatchingNetworkOnline(): void {
        if (this.watchingNetworkOnline || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return;
        }
        window.addEventListener('online', this.onNetworkOnline);
        this.watchingNetworkOnline = true;
    }

    private stopWatchingNetworkOnline(): void {
        if (!this.watchingNetworkOnline) {
            return;
        }
        window.removeEventListener('online', this.onNetworkOnline);
        this.watchingNetworkOnline = false;
    }

    /**
     * Schedules a turn-boundary reconnect (e.g. on a provider `GoAway` frame).
     * Runs immediately if the session is idle at a turn boundary, or defers until the active turn ends.
     */
    public NotifyConnectionEnding(timeLeftMs?: number): void {
        this.reconnectController.ConnectionEnding(timeLeftMs);
    }

    protected scheduleSoftReconnect(reason: RealtimeReconnectReason = 'connection-ending'): void {
        if (reason === 'connection-ending') {
            this.reconnectController.ConnectionEnding();
            return;
        }
        if (this.isTurnActiveForReconnect()) {
            this.reconnectController.ConnectionEnding();
            return;
        }
        void this.TriggerReconnect(reason);
    }

    protected isTurnActiveForReconnect(): boolean {
        return (
            this.reconnectController.IsTurnOpen ||
            this.IsBusy ||
            this.IsAudioPlaying ||
            this.isUserSpeaking() ||
            this.inFlightToolCallIds.size > 0
        );
    }

    /** Whether the mic meter hears the user right now (always `false` when the driver attached no input meter). */
    protected isUserSpeaking(): boolean {
        return (
            this.inputAudioMeter !== null &&
            (this.inputAudioMeter.Level() ?? 0) >= DEFAULT_USER_SPEECH_ACTIVE_LEVEL_THRESHOLD
        );
    }

    /**
     * Whether the user said something the current connection has not answered yet, with no turn open for it. The
     * hard-point move then waits as it does for an open turn, until shortly before the provider limit. `false` here: a
     * driver whose provider opens the turn only once the answer starts overrides it, and calls
     * `reconnectController.NotifyIdleStateChanged()` when the hold ends without a turn.
     */
    protected holdsHardReconnectPoint(): boolean {
        return false;
    }

    private wasSpeaking = false;
    private toolResultSentWhileSpeaking = false;
    /** The last state emitted to the host; see {@link StateToRestoreOnOldConnection}. */
    private lastEmittedState: RealtimeClientState | null = null;
    /** {@link lastEmittedState} when the current move started. */
    private stateBeforeMove: RealtimeClientState | null = null;

    /**
     * Initiates an in-place reconnect that retries through its recovery window (`REALTIME_RESUMPTION_RECOVERY_WINDOW_MS`,
     * counted from the old connection's end for a planned move), with the rapid-reconnect circuit breaker and Attempt-2
     * fallback from native handle to history seeding.
     */
    public TriggerReconnect(reason: RealtimeReconnectReason): Promise<boolean> {
        return this.reconnectController.TriggerReconnect(reason);
    }

    /**
     * The attempt's preparation step, timed by the controller apart from the transport attempt: refreshes the
     * credential when this cycle has not refreshed yet and the reconnect needs it. The first attempt of a cycle
     * refreshes only when the token is single-use, near expiry or spent; a retry always refreshes once. A spent
     * credential is re-minted even after this cycle's refresh: a cycle can retry through an outage for tens of seconds,
     * and its failed attempts spend uses too.
     *
     * The attempt waits for the refresh only when it cannot connect without one ({@link reconnectWaitsForCredential}).
     * A retry's refresh on a still-valid, reusable credential runs in the background and serves the attempts after it:
     * a refresh request that never returns (sent into a dead HTTP/2 connection during the outage) must not hold every
     * attempt of the cycle at its preparation timeout while the credential in hand still works.
     */
    private prepareClientReconnectAttempt(attempt: number): Promise<void> {
        if (!this.tokenRefreshCallback) {
            return Promise.resolve();
        }
        const alreadyRefreshed = this.refreshedInActiveCycle && !this.isCredentialSpent();
        if (alreadyRefreshed || !this.reconnectNeedsCredentialRefresh(attempt)) {
            return Promise.resolve();
        }
        const refresh = this.joinOrStartReconnectRefresh();
        if (this.reconnectWaitsForCredential()) {
            return refresh;
        }
        refresh.catch((err: unknown) => {
            RealtimeDiagLog(
                `[${this.constructor.name}] background credential refresh for attempt ${attempt} failed: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        });
        return Promise.resolve();
    }

    /**
     * The refresh in flight when it is young enough to join, else a new one. The attempt that started a refresh times
     * out at its preparation limit, and the next attempt starts within a retry delay of that, so it still joins: a slow
     * server gets about two preparation limits to answer, and is not asked twice (F5). Any later attempt sends a new
     * request, so one that never returns costs the cycle two attempts, not all of them.
     */
    private joinOrStartReconnectRefresh(): Promise<void> {
        const inFlight = this.reconnectCredentialRefresh;
        if (inFlight && Date.now() - inFlight.StartedAtMs < SHARED_REFRESH_MAX_JOIN_AGE_MS) {
            return inFlight.Promise;
        }
        if (inFlight) {
            RealtimeDiagLog(
                `[${this.constructor.name}] the credential refresh in flight for ${Date.now() - inFlight.StartedAtMs} ms has not returned; sending a new one`
            );
        }
        const entry = {
            Promise: this.refreshCredentialBeforeReconnect().finally(() => {
                if (this.reconnectCredentialRefresh === entry) {
                    this.reconnectCredentialRefresh = null;
                }
            }),
            StartedAtMs: Date.now(),
        };
        this.reconnectCredentialRefresh = entry;
        return entry.Promise;
    }

    /**
     * Whether an attempt cannot connect without a fresh credential: the token is single-use, spent, or within a minute
     * of expiry. Otherwise the credential in hand still opens a connection, and a refresh is only an improvement.
     */
    private reconnectWaitsForCredential(): boolean {
        return this.RequiresFreshTokenPerReconnect || this.isCredentialNearExpiry() || this.isCredentialSpent();
    }

    private reconnectNeedsCredentialRefresh(attempt: number): boolean {
        return (
            this.RequiresFreshTokenPerReconnect ||
            this.isCredentialNearExpiry() ||
            this.isCredentialSpent() ||
            attempt > 1
        );
    }

    private async refreshCredentialBeforeReconnect(): Promise<void> {
        try {
            await this.refreshCredentialForReconnect();
            this.refreshedInActiveCycle = true;
        } catch (refreshErr) {
            if (this.RequiresFreshTokenPerReconnect || this.isCredentialNearExpiry(0) || this.isCredentialSpent()) {
                throw refreshErr instanceof Error ? refreshErr : new Error(String(refreshErr));
            }
            RealtimeDiagLog(
                `[${this.constructor.name}] credential refresh failed during reconnect, continuing with unexpired credential: ${
                    refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
                }`
            );
            this.refreshedInActiveCycle = true;
        }
    }

    private async executeClientReconnectAttempt(context: RealtimeReconnectContext): Promise<void> {
        const seed = context.ConversationSeed ?? this.conversationMemory.Seed();
        /** The credential this attempt opens on: the current one, or the one the driver re-mints inside `Reconnect`. */
        let openedOn = this.currentCredential;
        const clientContext: RealtimeClientReconnectContext = {
            Reason: context.Reason,
            Attempt: context.Attempt,
            MaxAttempts: context.MaxAttempts,
            ElapsedConnectionSeconds: context.ElapsedConnectionSeconds,
            ResumptionHandle: context.ResumptionHandle,
            UseNativeResumption: context.UseNativeResumption,
            ConversationSeed: context.ConversationSeed,
            get Abandoned(): boolean {
                return context.Abandoned;
            },
            Signal: context.Signal,
            Seed: seed,
            RefreshCredential: async (options?: RealtimeClientTokenRefreshOptions) => {
                openedOn = await this.refreshCredentialForReconnect(options);
                return openedOn;
            },
            Credential: openedOn,
        };

        try {
            await this.Reconnect(clientContext);
            // Not `currentCredential`: a scheduled refresh can land while the connection opens on the old token. The
            // connection then dies with the old token (F14), so it must be tracked against it.
            this.connectionCredential = openedOn;
        } finally {
            // A failed attempt counts too: the provider may have spent the use before it failed. Only a use of the
            // current credential counts against it; one of a credential a refresh has since replaced does not.
            if (openedOn === this.currentCredential) {
                this.connectionsOnCredential++;
            }
        }
    }

    protected onReconnecting(_reason: RealtimeReconnectReason): void {
        this.refreshedInActiveCycle = false;
        this.stateBeforeMove = this.lastEmittedState;
        this.emitStateChange('connecting');
    }

    /**
     * A planned move's attempt failed while the old connection still carries the call: go back to live on it (state,
     * held input) until the next attempt, which waits for the next idle boundary or the hard point, and return `true`.
     * Return `false` when the old connection cannot carry the call any more; the cycle then retries on its schedule.
     * `IsReconnecting` is already `false` when this runs, so sends go to the old connection. `false` here: a driver
     * opts in by overriding it. See `RealtimeReconnectControllerOptions.ReturnToOldConnection`.
     */
    protected ResumeOnOldConnection(): boolean {
        return false;
    }

    /**
     * The state to report again when {@link ResumeOnOldConnection} goes back to the old connection: the live state the
     * client was in when the move started, or `null` when the old connection has reported a state of its own since
     * (it keeps delivering events during the attempt), which is current.
     */
    protected get StateToRestoreOnOldConnection(): RealtimeClientState | null {
        if (this.lastEmittedState !== 'connecting') {
            return null;
        }
        const before = this.stateBeforeMove;
        return before === 'speaking' || before === 'connected' ? before : 'listening';
    }

    protected onReconnected(usedNativeResumption: boolean): void {
        if (!usedNativeResumption && this.inFlightToolCallIds.size > 0) {
            for (const callID of this.inFlightToolCallIds) {
                this.callsFromBeforeReseed.add(callID);
            }
        }
        this.ArmConnectionDurationTimer();
    }

    protected onReconnectFailed(error: Error, code: RealtimeReconnectFailureCode): void {
        this.emitError({ Message: error.message, Code: code, Fatal: true });
        this.emitStateChange('error');
    }

    /**
     * Re-establishes the underlying provider connection mid-call, either via native session
     * resumption or by re-seeding from `context.ConversationSeed`. Concrete drivers MUST override this method.
     */
    protected Reconnect(_context: RealtimeClientReconnectContext): Promise<void> {
        return Promise.reject(new Error(`${this.constructor.name} does not implement mid-call Reconnect()`));
    }

    /** Resolves the tool name recorded when `callID` was emitted, or `fallbackName ?? callID`. */
    protected resolveToolName(callID: string, fallbackName?: string): string {
        return fallbackName || this.toolCallNamesById.get(callID) || callID;
    }

    /**
     * Whether a tool result's payload requests `SILENT` scheduling (meaning no post-tool model reply is expected).
     * Subclasses that gate scheduling on model capability (e.g. `GeminiRealtimeClient.supportsScheduling`) can override.
     */
    protected isToolResultSilent(outputJson: string): boolean {
        try {
            const parsed: unknown = JSON.parse(outputJson);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return false;
            }
            const record = parsed as Record<string, unknown>;
            const raw = record['__mj_scheduling'] ?? record['scheduling'];
            return typeof raw === 'string' && raw.trim().toUpperCase() === 'SILENT';
        } catch {
            return false;
        }
    }

    /**
     * Records a completed tool result into {@link conversationMemory} and clears its in-flight guard.
     * Invoked automatically by the {@link SendToolResult} template method after {@link doSendToolResult} succeeds.
     */
    protected recordToolResult(callID: string, outputJson: string, toolName?: string): string {
        this.inFlightToolCallIds.delete(callID);
        const resolvedName = toolName ?? this.toolCallNamesById.get(callID) ?? callID;
        this.toolCallNamesById.delete(callID);
        if (!this.recordedToolCallIds.has(callID)) {
            this.recordedToolCallIds.add(callID);
            this.conversationMemory.Record({
                Kind: 'toolResult',
                Name: resolvedName,
                OutputJson: outputJson,
            });
        }
        if (this.inFlightToolCallIds.size === 0) {
            const expectsReply = !this.isToolResultSilent(outputJson);
            if (this.wasSpeaking) {
                this.toolResultSentWhileSpeaking = expectsReply;
            }
            this.reconnectController.ToolResultSent(expectsReply);
        } else {
            this.reconnectController.NotifyIdleStateChanged();
        }
        return resolvedName;
    }

    // ── Protected emit helpers for concrete drivers ───────────────────────────

    /** Emits a track state change to the registered handler (if any). */
    protected emitTrackStateChange(track: RealtimeTrack): void {
        this.trackHandler?.(track);
    }

    /** Emits a transcript event to the registered handler (if any) and records final normal turns in memory. */
    protected emitTranscript(transcript: RealtimeClientTranscript): void {
        // Blank text is recorded too: memory ignores it, except that a blank user transcript releases the place
        // reserved for its item (see RealtimeConversationMemory.ReserveUserTurn), so no empty turn waits in the seed.
        if (transcript.IsFinal && transcript.Kind === 'normal' && !transcript.IsThought) {
            if (transcript.Role === 'User') {
                this.conversationMemory.Record({
                    Kind: 'user',
                    Text: transcript.Text,
                    ReplacesPrevious: transcript.ReplacesPrevious,
                    ...(transcript.ItemId !== undefined ? { ItemId: transcript.ItemId } : {}),
                });
            } else {
                this.conversationMemory.Record({ Kind: 'assistant', Text: transcript.Text, ReplacesPrevious: transcript.ReplacesPrevious });
            }
        }
        this.transcriptHandler?.(transcript);
    }

    /** Emits a tool-call request to the registered handler (if any) and records it in memory. */
    protected emitToolCall(call: RealtimeClientToolCall): void {
        this.inFlightToolCallIds.add(call.CallID);
        this.recordedToolCallIds.delete(call.CallID);
        this.toolCallNamesById.set(call.CallID, call.ToolName);
        this.conversationMemory.Record({
            Kind: 'toolCall',
            Name: call.ToolName,
            ArgumentsJson: call.ArgumentsJson,
        });
        this.toolCallHandler?.(call);
    }

    /** Emits a state change to the registered handler (if any) and flushes any deferred turn-boundary reconnect. */
    protected emitStateChange(state: RealtimeClientState): void {
        this.lastEmittedState = state;
        if (state === 'closed' || state === 'error') {
            this.wasSpeaking = false;
            this.toolResultSentWhileSpeaking = false;
            this.DisposeReconnectTimers();
            this.inFlightToolCallIds.clear();
            this.recordedToolCallIds.clear();
            this.toolCallNamesById.clear();
        } else if (state === 'connecting') {
            this.wasSpeaking = false;
            this.toolResultSentWhileSpeaking = false;
        } else if (state === 'speaking') {
            this.wasSpeaking = true;
            this.toolResultSentWhileSpeaking = false;
            this.reconnectController.TurnStarted();
        } else if (
            state === 'listening' &&
            !this.reconnectController.HasDurationTimersArmed &&
            !this.reconnectController.IsReconnecting &&
            !this.reconnectController.IsInSoftWindow
        ) {
            this.ArmConnectionDurationTimer();
        }
        this.stateChangeHandler?.(state);
        if (state === 'listening') {
            const keepPostToolTurnWait = this.wasSpeaking && this.toolResultSentWhileSpeaking;
            this.wasSpeaking = false;
            this.toolResultSentWhileSpeaking = false;
            this.reconnectController.TurnEnded(keepPostToolTurnWait);
        }
    }

    /** Emits an error to the registered handler (if any). */
    protected emitError(error: RealtimeClientError): void {
        this.errorHandler?.(error);
    }

    /** Emits a true barge-in interruption to the registered handler (if any). */
    protected emitInterruption(): void {
        this.interruptionHandler?.();
    }

    /** Emits a user-speech-onset to the registered handler (if any). */
    protected emitUserSpeechStart(itemId?: string): void {
        this.userSpeechStartHandler?.(itemId);
    }

    /** Emits a usage update (token deltas for a completed response/turn) to the registered handler (if any). */
    protected emitUsage(usage: RealtimeClientUsage): void {
        this.usageHandler?.(usage);
    }

    /**
     * Emits the model/avatar's remote video to the registered handler (video drivers only). A driver with a plain
     * `MediaStream` passes it as it is; it is handed on as a `'stream'` source.
     */
    protected emitRemoteVideo(video: MediaVideoSource | MediaStream): void {
        this.remoteVideoHandler?.('Kind' in video ? video : { Kind: 'stream', Stream: video });
    }
}

/** Whether a descriptor is an inbound video track. */
function isInboundVideo(descriptor: RealtimeTrackDescriptor): boolean {
    return descriptor.Direction === 'inbound' && String(descriptor.Modality).trim().toLowerCase() === 'video';
}
