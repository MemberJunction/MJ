import {
    ClientRealtimeSessionConfig,
    DEFAULT_REALTIME_AUDIO_TRACKS,
    JSONObject,
    RealtimeTrack,
    RealtimeTrackDescriptor,
    RealtimeTrackDirection,
    RealtimeTrackKey,
    ResolveRequestedTracks,
    RealtimeUsageModalityDetail,
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
 * The session config as the PROVIDER must receive it: the server-built config minus the
 * client-only hints the runtime adds. Drivers that send the config on the wire go through this —
 * OpenAI's Realtime API rejects the WHOLE `session.update` on an unknown key
 * (`unknown_parameter: 'session.requestedTracks'`), so one stray hint costs the session its
 * instructions and every tool.
 */
export function ToProviderSessionConfig(sessionConfig: JSONObject): JSONObject {
    const { [REQUESTED_TRACKS_SESSION_KEY]: _clientOnly, ...providerConfig } = sessionConfig;
    return providerConfig;
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
 *   (`promptTokenCount` / `responseTokenCount` are per-response counts, not cumulative).
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
    /** Per-modality breakdown of output tokens (text, audio). */
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
 */
export abstract class BaseRealtimeClient {
    // ── Registered handlers (single-handler style, like IRealtimeSession) ─────
    private transcriptHandler?: (transcript: RealtimeClientTranscript) => void;
    private toolCallHandler?: (call: RealtimeClientToolCall) => void;
    private stateChangeHandler?: (state: RealtimeClientState) => void;
    private errorHandler?: (error: RealtimeClientError) => void;
    private interruptionHandler?: () => void;
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
     * @param config The server-minted client session config (provider, model, ephemeral token, session config).
     * @param micStream The user's microphone capture stream. The caller acquires it (so IT owns
     *   the permission prompt UX); the client attaches it to the transport and stops its tracks
     *   on {@link Disconnect}.
     * @param cameraStream OPTIONAL camera capture stream for a VIDEO session (the model "sees" the
     *   user). Only attached by video-capable drivers; audio-only drivers ignore it (back-compatible —
     *   existing callers and drivers need not pass or read it). The model/avatar's video comes BACK via
     *   {@link OnRemoteVideo}.
     */
    public abstract Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream, cameraStream?: MediaStream): Promise<void>;

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
     * Feeds an executed tool's result back to the model, correlated by `callID`, and ensures
     * the model SPEAKS the result as soon as possible: immediately when idle, otherwise
     * queued behind the in-flight response (e.g. a progress narration) so the trigger is
     * never dropped by the provider.
     *
     * @param callID The `CallID` from the originating {@link RealtimeClientToolCall}.
     * @param outputJson The tool's result as a JSON-stringified string.
     */
    public abstract SendToolResult(callID: string, outputJson: string): void;

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
     * but hosts must not assume video arrives. Video-capable drivers ({@link BaseRealtimeModel.SupportsVideo})
     * call {@link emitRemoteVideo} when it is live.
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

    // ── Protected emit helpers for concrete drivers ───────────────────────────

    /** Emits a track state change to the registered handler (if any). */
    protected emitTrackStateChange(track: RealtimeTrack): void {
        this.trackHandler?.(track);
    }

    /** Emits a transcript event to the registered handler (if any). */
    protected emitTranscript(transcript: RealtimeClientTranscript): void {
        this.transcriptHandler?.(transcript);
    }

    /** Emits a tool-call request to the registered handler (if any). */
    protected emitToolCall(call: RealtimeClientToolCall): void {
        this.toolCallHandler?.(call);
    }

    /** Emits a state change to the registered handler (if any). */
    protected emitStateChange(state: RealtimeClientState): void {
        this.stateChangeHandler?.(state);
    }

    /** Emits an error to the registered handler (if any). */
    protected emitError(error: RealtimeClientError): void {
        this.errorHandler?.(error);
    }

    /** Emits a true barge-in interruption to the registered handler (if any). */
    protected emitInterruption(): void {
        this.interruptionHandler?.();
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
