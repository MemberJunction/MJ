import { BaseModel } from "./baseModel";
import type { RealtimeReasoningPlane } from "./modelConfiguration";
import type { RealtimeTrackDescriptor, RealtimeTrackUsageBasis } from "./realtimeTracks";
import type { RealtimeVideoFrame } from "./realtimeVideoOutput";

/**
 * A JSON-serializable value. Used to type open configuration bags and JSON-schema
 * objects at the Core layer without resorting to `any`.
 */
export type JSONValue =
    | string
    | number
    | boolean
    | null
    | JSONValue[]
    | { [key: string]: JSONValue };

/**
 * A JSON object — the common shape for a JSON-schema document or an open,
 * provider-specific configuration bag.
 */
export type JSONObject = { [key: string]: JSONValue };

/**
 * Base class for real-time, full-duplex, tool-calling models.
 *
 * `BaseRealtimeModel` is the lowest-level primitive for streaming, bidirectional models
 * (e.g. Google Gemini Live, OpenAI GPT Realtime, and — as a fast-follow — the Eleven Labs
 * stack). It is a sibling of {@link BaseModel}-derived capability classes such as `BaseLLM`
 * and `BaseAudioGenerator`, and is resolved through the MemberJunction `ClassFactory` by
 * `AIModelType` + `DriverClass`.
 *
 * The contract is deliberately **modality-agnostic** — *streaming, full-duplex, tool-calling* —
 * so the same primitive covers voice now and video later. It is distinct from
 * `BaseAudioGenerator`, which is request/response STT/TTS (a different shape, not the
 * real-time path).
 *
 * **Driver registration:** Concrete drivers ship in the respective `@memberjunction/ai-*`
 * provider packages and self-register via the class factory, e.g.
 * `@RegisterClass(BaseRealtimeModel, 'GeminiRealtime')`. The associated `MJ: AI Models`
 * are typed with the `AIModelType` value **`Realtime`**.
 *
 * ## DRIVER AUTHOR OBLIGATIONS
 *
 * Hard-won, provider-independent rules every server-side realtime driver (and its
 * client-direct twin — see `BaseRealtimeClient` in `@memberjunction/ai-realtime-client`)
 * MUST honor. Most were paid for in live debugging; do not relearn them:
 *
 * 1. **Silent exit from "speaking" after a tool call.** When the model emits a tool call,
 *    the host typically shows its own busy ("thinking") indicator while the tool executes.
 *    A driver that surfaces UI state must leave any "speaking" state *silently* (no state
 *    emission) at tool-call time so the turn's trailing frames don't clobber the host's
 *    indicator.
 * 2. **Busy-flag release on tool-call emission (deadlock guard).** A tool-call frame means
 *    the model has yielded the floor pending the result. Any internal "response active" /
 *    busy flag MUST be cleared at that point — otherwise the eventual `SendToolResult` (or
 *    a queued send) deadlocks waiting for a turn boundary that will never arrive until
 *    after the result is sent.
 * 3. **Playback flush + honest playback reporting on interruption.** On a true barge-in the
 *    driver (or its client twin) must flush any locally-owned audio playback and report
 *    "audio playing = false" promptly — stale queued audio after an interruption is a
 *    product bug, not a nicety.
 * 4. **Text injection must NOT echo a user transcript.** A "send typed text" capability
 *    must not synthesize a user-role transcript event for the injected text — the host owns
 *    the local echo and would render the message twice.
 * 5. **Tool-result delivery invariant.** Every tool result fed back via
 *    {@link IRealtimeSession.SendToolResult} must EVENTUALLY be voiced/processed by the
 *    model and must never be dropped. If the provider rejects overlapping generation
 *    triggers, the driver queues the result's trigger behind the in-flight response and
 *    flushes it at the next turn boundary.
 * 6. **Token/credential expiry surfaces as a FATAL error.** When the session's credential
 *    dies (ephemeral token expiry, auth revocation), the driver must surface it through
 *    {@link IRealtimeSession.OnError} with `Fatal: true` so the consumer finalizes cleanly
 *    instead of idling forever on a dead socket.
 * 7. **"Ready" only after the session config is applied.** A driver (or client twin) must
 *    not report the session as live/listening until the server-built session config
 *    (system prompt + tools) has actually been applied to the provider socket — otherwise
 *    early turns run against an unconfigured model.
 * 8. **`SessionConfig` is a private pact.** The {@link ClientRealtimeSessionConfig.SessionConfig}
 *    payload a server driver mints is consumed ONLY by the same-keyed client driver. Hosts
 *    and intermediaries treat it as an opaque blob; its shape may change between the two
 *    driver halves without notice.
 *
 * @abstract
 */

/**
 * Emits a realtime-driver diagnostic line, but ONLY when verbose logging is enabled
 * (`MJ_VERBOSE=true|1|yes`). These traces — turn boundaries, activity windows, response gating,
 * barge-in — are invaluable when debugging a live session but far too chatty for normal operation,
 * so they stay dark unless verbose mode is explicitly turned on. Shared here so every realtime driver
 * and its session twin (OpenAI, Gemini, …) gate diagnostics through one consistent switch. The truthy
 * set matches `@memberjunction/core`'s `IsVerboseLoggingEnabled` so a single `MJ_VERBOSE` flag governs
 * verbose output across the whole stack.
 *
 * @param message The diagnostic message, already prefixed by the caller (e.g. `[GeminiRealtime][diag] …`).
 */
export function RealtimeDiagLog(message: string): void {
    // Browser client drivers (e.g. GeminiRealtimeClient's transport handlers) call this too, and a
    // browser has no `process`: an unguarded read throws and aborts the caller before it can surface
    // the provider's close/error. No `process` means no MJ_VERBOSE, so diagnostics stay dark.
    if (typeof process === 'undefined' || !process.env) {
        return;
    }
    const v = (process.env.MJ_VERBOSE ?? '').toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') {
        // Strip all control characters (C0/C1, incl. CR/LF/VT/FF/ESC/NEL) plus Unicode
        // line/paragraph separators, to prevent log injection (CWE-117).
        const sanitized = message.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
        // eslint-disable-next-line no-console
        console.log(sanitized);
    }
}

export abstract class BaseRealtimeModel extends BaseModel {
    /**
     * Whether this driver subclass supports dynamic, multi-tool sets projected into the realtime
     * session (e.g. direct action invocation on realtime co-agents).
     *
     * Static capability descriptor read before a session instance exists.
     * Default: absent / false. Subclasses that support dynamic toolsets declare `public static readonly SupportsDynamicToolSet = true;`.
     */
    public static readonly SupportsDynamicToolSet?: boolean = false;

    /**
     * Opens a stateful duplex session with the provider.
     *
     * The returned {@link IRealtimeSession} is the long-lived handle that streams media and
     * transcripts in both directions, surfaces tool calls and usage telemetry, and reports
     * provider-detected interruptions (barge-in). The caller is responsible for closing the
     * session via {@link IRealtimeSession.Close}.
     *
     * @param params Configuration for the session (system prompt, tools, initial context, model, and an open config bag).
     * @returns A promise resolving to the live session handle.
     */
    public abstract StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession>;

    /**
     * Whether this driver can mint an ephemeral, server-scoped client credential for a
     * **client-direct** realtime session (the browser opens its own provider socket using a
     * short-lived token the server minted).
     *
     * Defaults to `false`. Providers that support browser-direct sessions override this to `true`
     * and implement {@link CreateClientSession}. The server-bridged topology (where the provider
     * socket lives on the server, via {@link StartSession}) is supported by every driver regardless
     * of this flag.
     *
     * @returns `true` if {@link CreateClientSession} is supported; `false` otherwise.
     */
    public get SupportsClientDirect(): boolean {
        return false;
    }

    /**
     * Mints an ephemeral, server-scoped client credential plus a provider-native session config for
     * a **client-direct** realtime session.
     *
     * In the client-direct topology the browser owns the provider socket (e.g. WebRTC), but the
     * **server** still controls the prompt and tool set: it mints a short-lived token and hands back
     * a {@link ClientRealtimeSessionConfig} whose `SessionConfig` the matching client driver applies
     * when it opens its socket. This keeps prompt/tool authority server-side even though the media
     * plane is client-direct.
     *
     * Not every provider supports this (some only expose a server-bridged socket), so this is a
     * concrete method that throws by default rather than an abstract one — that would force every
     * existing and future driver to implement it. Providers that support it override
     * {@link SupportsClientDirect} to `true` and override this method.
     *
     * @param _params The session parameters (system prompt, tools, model, config bag).
     * @returns A promise resolving to the minted {@link ClientRealtimeSessionConfig}.
     * @throws Always, unless overridden by a provider that supports client-direct sessions.
     */
    public async CreateClientSession(_params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        throw new Error(`${this.constructor.name} does not support client-direct realtime sessions`);
    }

    /**
     * Whether this driver's sessions carry a **video** track in addition to audio — i.e. the model
     * accepts video input (it can "see" the user's camera) and/or emits video output (a talking-head
     * avatar / generated video), in sync with audio.
     *
     * Defaults to `false` (audio-only — today's realtime models). Video-capable drivers (a native
     * multimodal realtime model, or an avatar provider) override this to `true`. The session's media
     * plane is media-tagged ({@link IRealtimeSession.SendInput} takes a {@link RealtimeInputFrame} with a {@link RealtimeMediaKind};
     * {@link IRealtimeSession.OnVideoFrame} delivers video-out as typed frames), so a video session reuses the entire
     * realtime contract — only the media frames gain a `video` kind. Resolution prefers a video-capable
     * model when an agent requests video, and degrades to audio-only otherwise.
     *
     * @returns `true` if sessions can carry video; `false` (audio-only) otherwise.
     */
    public get SupportsVideo(): boolean {
        return false;
    }

    /**
     * Whether this driver's sessions can render a live avatar for the model, on the endpoint the driver serves.
     *
     * Defaults to `false`: a driver whose models render no avatar says nothing more, and may ignore an avatar request. A
     * driver that renders one for some models (Gemini Enterprise) overrides it. The client-session service reads it to
     * tell a call or a meeting that asked for an avatar "this voice model can't show an avatar"
     * ({@link RealtimeAvatarUnavailableReason} `'endpoint'`), whichever driver serves it.
     *
     * @param _model The provider's API name for the model.
     * @returns `true` when sessions on this model can render a live avatar; `false` otherwise.
     */
    public SupportsAvatarOutput(_model: string): boolean {
        return false;
    }

    /**
     * Static fallback list of provider-native voices supported by this driver when metadata personas
     * are not present or sparse.
     *
     * NOTE: Database metadata (`MJ: AI Personas` + `AI Model Personas`) is authoritative where configured.
     * At runtime, `GetRealtimeModelVoices` unions metadata personas with this driver fallback list so that
     * newly uncatalogued provider voices remain selectable while catalogued personas carry curated names/descriptions.
     *
     * @returns The supported voice ids (id + human label), or `[]` when none are declared.
     */
    public get SupportedVoices(): RealtimeVoiceOption[] {
        return [];
    }

    /**
     * Optional WebRTC SDP exchange seam for drivers that support server-brokered WebRTC topologies.
     *
     * @param _offerSdp The local SDP offer generated by the browser.
     * @param _sessionConfig The session configuration to initialize the session with.
     * @returns The answer SDP, provider session ID, and any prebill accounting.
     */
    public async ExchangeWebRtcSdp?(
        _offerSdp: string,
        _sessionConfig?: Record<string, unknown>
    ): Promise<{ answerSdp: string; sessionId: string; prebillSeconds: number }>;
}

/**
 * The MJ-side Config-bag keys shared across the realtime driver family that are NEVER provider
 * wire fields: feature knobs the OpenAI-protocol family translates (and gates per profile) plus
 * transport settings for self-hosted/proxied drivers. NON-OpenAI-protocol drivers (Gemini,
 * ElevenLabs, AssemblyAI, Inworld) MUST scrub these before forwarding an open config bag to their
 * SDK/wire — a co-agent config carrying them must be safe on every provider.
 *
 * **Registering a key here is what makes it safe; forgetting to is a wire leak.** A co-agent
 * config is authored WITHOUT knowing which vendor will run, so an agnostic key is filed onto
 * whichever driver resolves — including every driver that does not consume it. Unregistered, it
 * survives each driver's residual-bag spread and reaches the provider as an unknown field; on the
 * OpenAI-protocol endpoints a malformed session object is rejected WHOLESALE, taking the prompt
 * and tools with it. So any key added to the neutral vocabulary belongs in this list at the same
 * time, and the OpenAI family's own scrub in `ExtractRealtimeFeatures` must delete it too — that
 * function enumerates its deletes explicitly and does NOT read this list.
 */
export const REALTIME_SHARED_CONFIG_KEYS: readonly string[] = [
    'effortLevel',
    'reasoningEffort',
    'parallelToolCalls',
    'mcpTools',
    'inputTranscriptionModel',
    'voice',
    'firstMessage',
    'disableAutoResponse',
    'turnDetection',
    'reasoning',
    'endpoint',
    'sampleRate',
    'proxyBaseUrl',
    'tooling',
    'toolBehavior',
] as const;

/** A selectable provider-native voice — `ID` is sent to the provider, `Name` is the human label. */
export interface RealtimeVoiceOption {
    /** The provider-native voice id (e.g. `echo`) — what gets written to the session config. */
    ID: string;
    /** The human-friendly label for the picker (e.g. `Echo`). */
    Name: string;
}

/**
 * The media plane a realtime frame belongs to. The realtime contract is otherwise media-agnostic — a
 * `video` session reuses every method (tools, transcript, usage, turn-taking); only the media frames
 * carry this tag so audio and video can be disambiguated on the same session.
 */
export type RealtimeMediaKind = 'audio' | 'video';

/**
 * One frame of media a host streams into a realtime session through {@link IRealtimeSession.SendInput}.
 */
export interface RealtimeInputFrame {
    /** The frame's bytes: raw audio samples, or one encoded video frame (for example a JPEG image). */
    Data: ArrayBuffer;
    /** The media plane the frame belongs to. */
    Kind: RealtimeMediaKind;
    /**
     * The frame's format, for example `'audio/pcm;rate=16000'` or `'image/jpeg'`. When absent, an
     * audio frame is in the session's declared input format ({@link IRealtimeSession.AudioFormat}); a
     * video frame with no type cannot be sent by a driver that needs one, and is dropped.
     */
    MimeType?: string;
    /** Epoch-millisecond capture time, when the host knows it. */
    TimestampMs?: number;
}

/**
 * How a client-direct session's browser reaches the provider ({@link ClientRealtimeSessionConfig.Transport}):
 * - `'direct'`: the browser opens the provider's socket itself, authenticated with
 *   {@link ClientRealtimeSessionConfig.EphemeralToken};
 * - `'relay'`: the browser connects to MJAPI's realtime relay at {@link ClientRealtimeSessionConfig.RelayUrl}, and
 *   MJAPI holds the provider credential and opens the provider's socket.
 */
export type RealtimeClientTransport = 'direct' | 'relay';

/**
 * Reads a {@link RealtimeClientTransport} from untyped data, such as the mint result's `Transport` field.
 *
 * @param value The value to read.
 * @returns The transport, or `undefined` when the value is absent or not a known transport (read as direct).
 */
export function ParseRealtimeClientTransport(value: unknown): RealtimeClientTransport | undefined {
    return value === 'direct' || value === 'relay' ? value : undefined;
}

/**
 * The server-minted configuration a browser needs to open a **client-direct** realtime session.
 *
 * Returned by {@link BaseRealtimeModel.CreateClientSession}. The browser authenticates to the
 * provider with {@link ClientRealtimeSessionConfig.EphemeralToken} (or, on a relay session, connects to
 * {@link ClientRealtimeSessionConfig.RelayUrl}) and hands {@link ClientRealtimeSessionConfig.SessionConfig}
 * to the matching client driver — so the server retains control of the prompt and tool set even though the
 * browser owns the socket.
 *
 * **`SessionConfig` is a private pact between same-keyed driver halves.** The server driver that
 * minted it (selected by {@link ClientRealtimeSessionConfig.Provider}) and the client driver
 * registered under the same key are the ONLY parties that understand its shape. Hosts and any
 * transport in between must treat it as an opaque, serializable blob — never inspect, edit, or
 * depend on its fields. {@link ClientRealtimeSessionConfig.Transport} and
 * {@link ClientRealtimeSessionConfig.RelayUrl} are not part of the pact: hosts carry them to the client
 * driver as they are.
 */
export interface ClientRealtimeSessionConfig {
    /**
     * The provider that minted the credential (e.g. `'openai'`). Lets the browser select the
     * correct provider-direct client implementation.
     */
    Provider: string;

    /**
     * The provider realtime model id the session is scoped to (e.g. `gpt-realtime`).
     */
    Model: string;

    /**
     * The short-lived client secret the browser presents to the provider to authenticate its
     * direct session. Server-scoped and expiring (see {@link ClientRealtimeSessionConfig.ExpiresAt}).
     * Empty on a relay session ({@link ClientRealtimeSessionConfig.Transport} `'relay'`): the browser
     * holds no provider credential, and {@link ClientRealtimeSessionConfig.RelayUrl} carries the relay's ticket.
     */
    EphemeralToken: string;

    /**
     * ISO-8601 timestamp at which {@link ClientRealtimeSessionConfig.EphemeralToken} (or a relay
     * session's ticket) expires.
     */
    ExpiresAt: string;

    /**
     * How the browser reaches the provider (see {@link RealtimeClientTransport}). Absent means `'direct'`,
     * as for every session minted before this field existed.
     */
    Transport?: RealtimeClientTransport;

    /**
     * Where a relay session's browser connects: MJAPI's realtime relay, `wss://<mjapi>/realtime/relay/<ticket>`.
     * Present only when {@link ClientRealtimeSessionConfig.Transport} is `'relay'`. The URL carries the
     * session's ticket, so it is a credential: never log it or put it in an error message.
     */
    RelayUrl?: string;

    /**
     * The provider-native session config the matching client driver applies when it opens its
     * socket (instructions/system prompt, tools, audio formats, turn detection). Because the server
     * builds this, prompt and tool authority stay server-side even in the client-direct topology.
     * Typed as a JSON object so it stays serializable across the server→client boundary — but its
     * SHAPE is a private pact between the same-keyed server and client drivers; hosts must treat it
     * opaquely and never read or rewrite its fields.
     */
    SessionConfig: JSONObject;

    /**
     * The driver's decision at mint about the live avatar the session asked for: granted, or audio only and why. Unlike
     * {@link SessionConfig} it is not part of the driver pact, so the server can merge it with its own reasons and hand
     * it to the call. Absent when the session asked for no avatar, and from drivers that render none.
     */
    AvatarStatus?: RealtimeAvatarStatus;
}

/**
 * Static capability flags of a live {@link IRealtimeSession}, for container introspection (the realtime-
 * session analogue of `IBridgeProviderFeatures`). Grow this as providers gain runtime abilities — each new
 * flag defaults to "unsupported" for any driver that hasn't declared it, so the container stays safe.
 */
export interface RealtimeSessionCapabilities {
    /**
     * Whether the session can change its turn-taking / auto-response mode on a **live** socket (no
     * reconnect) via {@link IRealtimeSession.Reconfigure}. `true` for providers with a runtime-mutable
     * session config (OpenAI `session.update`); `false` where it's fixed at connect (Gemini Live).
     */
    CanReconfigureTurnMode: boolean;

    /**
     * Which reasoning planes this driver supports (e.g. `['local']`, `['remote']`, or `['local', 'remote']`).
     */
    SupportedReasoningPlanes?: readonly RealtimeReasoningPlane[];

    /**
     * Whether delegation mode can be reconfigured mid-session.
     */
    CanReconfigureDelegationMode?: boolean;

    /**
     * Whether the model is **full-duplex**: it keeps listening while it speaks, can emit short
     * backchannel acknowledgements, and judges for itself whether speech was directed at it. A bridge uses
     * this to prefer the model's own addressing judgement over a name-pattern match and to treat the room's
     * floor coordinator as a safety net rather than the primary gate. Absent/`false` = turn-based.
     */
    FullDuplex?: boolean;

    /**
     * Whether the provider emits a discrete user-interruption signal when user barge-in occurs.
     */
    EmitsUserInterruptionSignal?: boolean;

    /**
     * Whether the provider emits a discrete signal when model generation is cut off.
     */
    EmitsProviderCutoffSignal?: boolean;

    /**
     * Whether the provider emits a response-complete signal when a turn ends.
     */
    EmitsResponseComplete?: boolean;

    /**
     * The units this provider uses to measure and bill usage.
     *
     * A LIST rather than an enum because a provider can meter in more than one basis at once —
     * GPT-Live reports voice seconds and delegated reasoning tokens from different places, so an
     * exclusive enum would force us to drop one. Shares
     * {@link import('./realtimeTracks').RealtimeTrackUsageBasis} with the media plane so cost has one
     * vocabulary; `'frames'` and `'bytes'` exist for non-audio tracks.
     */
    UsageBases?: readonly RealtimeTrackUsageBasis[];

    /**
     * Whether this driver provides speech-to-text transcript events for user audio input.
     */
    ProvidesInputTranscription?: boolean;

    /**
     * Whether this driver provides text transcript events for model audio output.
     */
    ProvidesOutputTranscription?: boolean;

    /**
     * Whether this driver surfaces model-authored summaries of the model's own reasoning
     * (Gemini `thinkingConfig.includeThoughts`).
     *
     * Sibling of {@link ProvidesInputTranscription} / {@link ProvidesOutputTranscription}: it
     * declares a transcript STREAM the driver can produce. Thought summaries are narration, not
     * spoken response — a host rendering them as assistant speech would attribute the model's
     * scratch reasoning to it as an answer.
     */
    ProvidesThoughtSummaries?: boolean;

    /**
     * Whether this driver correctly handles a session whose reasoning outlives its turn — i.e.
     * where a turn-terminal frame does NOT mean the server is idle, and further tool calls or
     * audio may still arrive.
     *
     * This is a statement about the DRIVER, not the model: a driver that keys "work finished" off
     * the turn-terminal frame must declare `false`, because on such a model it would flush deferred
     * work early and report itself not-busy while the server is still going. Which signal a given
     * model actually uses is model metadata
     * (`ModelConfiguration.Realtime.IdleSignal`), not a driver capability.
     */
    SupportsAsynchronousReasoning?: boolean;

    /**
     * Whether the provider supports receiving multiple parallel tool calls and batched results (gpt-live-1.md §4.2).
     */
    SupportsParallelToolCalls?: boolean;

    /**
     * Whether this driver supports dynamic, multi-tool sets projected into the realtime session
     * (e.g. direct action invocation on realtime co-agents).
     *
     * When `true`, allowed target agent actions can be registered as direct tools on the realtime model.
     * When absent or `false`, only single/co-agent delegation tools (`invoke-target-agent`) are registered.
     */
    SupportsDynamicToolSet?: boolean;

    /**
     * Maximum number of concurrent delegations supported by the provider, or undefined if unbounded.
     */
    MaxConcurrentDelegations?: number;

    /**
     * Media tracks this model can RECEIVE (user -> model).
     *
     * Absent or empty is read as "inbound audio only", which is every model MJ spoke to before
     * Gemini 3.8 Live — so an existing driver that declares nothing keeps working unchanged.
     *
     * This is the supply side of track negotiation: the caller requests
     * (`ModelConfiguration.Realtime.RequestedTracks`), this declares, and
     * {@link import('./realtimeTracks').ResolveRequestedTracks} intersects them. A requested track
     * absent here resolves to `'unsupported'` rather than being dropped, so a host can fall back
     * deliberately instead of wondering why no samples arrive.
     */
    SupportedInboundTracks?: readonly RealtimeTrackDescriptor[];

    /**
     * How many concurrent inbound VIDEO streams this model accepts: `0` when it accepts none, `1` for every
     * model shipped so far, more for a future model that can look at several things at once. Absent
     * means "derive it from {@link SupportedInboundTracks}" — one when an inbound video track is
     * declared, none otherwise (see `ResolveMaxInboundVideoStreams`).
     *
     * A source arbiter maps however many live video sources exist onto this many streams: with `1` it
     * picks one and tells the model when it switches; with enough streams for every source it passes
     * them through untouched.
     */
    MaxInboundVideoStreams?: number;

    /**
     * Media tracks this model can EMIT (model -> user). Absent or empty is read as "outbound audio
     * only". Non-audio outbound tracks (avatar video, haptics) are admitted by the contract because
     * direction is a property of a track rather than part of its type. A session that emits video
     * through {@link IRealtimeSession.OnVideoFrame} declares an outbound video track whose `Encoding`
     * names its frames' type, such as `'video/mp4; codecs="avc1.42c01f, mp4a.40.2"'` for a Gemini avatar.
     */
    SupportedOutboundTracks?: readonly RealtimeTrackDescriptor[];
}

/** Parameters for {@link IRealtimeSession.Reconfigure} — a live turn-taking change. */
export interface RealtimeReconfigureParams {
    /** Switch the model's blind auto-response OFF (meeting mode) or ON (1:1). */
    DisableAutoResponse?: boolean;
}

/**
 * A long-lived, full-duplex session handle returned by {@link BaseRealtimeModel.StartSession}.
 *
 * All `On*` methods register a single handler invoked as the corresponding provider events
 * arrive. Drivers must be written against this interface so a mock provider socket can be
 * substituted for deterministic, network-free testing.
 */
export interface IRealtimeSession {
    /**
     * The PCM sample rate (Hz) this model **consumes** on {@link IRealtimeSession.SendInput} — its audio
     * INPUT format. Optional; consumers default to 24000 (OpenAI Realtime). **Gemini Live = 16000.** A
     * server-bridged host (LiveKit/Zoom/Teams) MUST resample inbound room audio to this rate or the model
     * receives mis-rated audio it can't parse (the symptom: the agent never responds on the bridge while
     * the same model works client-direct, where the browser negotiates the rate itself).
     */
    InputSampleRate?: number;

    /**
     * The PCM sample rate (Hz) this model **emits** on {@link IRealtimeSession.OnOutput} — its audio OUTPUT
     * format. Optional; consumers default to 24000 (both OpenAI and Gemini Live emit 24 kHz today).
     */
    OutputSampleRate?: number;

    /**
     * Audio encoding and sample rate format supported or negotiated for this session.
     */
    AudioFormat?: { Codec: 'pcm16' | 'g711_ulaw' | 'g711_alaw'; SampleRate: number } | 'negotiated';

    /**
     * Sends a client media frame to the model.
     *
     * Fire-and-forget: frames are streamed straight to the provider with no JSON intermediation.
     * {@link RealtimeInputFrame.Kind} tags the media plane: `'audio'`, or `'video'` for a camera or
     * screen frame to a video-capable model (one that {@link BaseRealtimeModel.SupportsVideo}).
     * {@link RealtimeInputFrame.MimeType} says what format the frame is in. A driver drops a frame
     * it cannot send rather than sending it as something else.
     *
     * @param frame The media frame, with its kind and (when known) its format.
     */
    SendInput(frame: RealtimeInputFrame): void;

    /**
     * Registers the set of tools the model may call, translating them into the provider's
     * native function-calling format.
     *
     * The Core-level {@link RealtimeToolDefinition} is intentionally minimal: `BaseRealtimeModel`
     * lives in the lowest AI layer and cannot depend on the richer tool metadata defined in
     * higher packages (the agent layer) — doing so would create an illegal upward/circular
     * dependency. The agent layer is responsible for **mapping its richer tool metadata down**
     * to this Core type before calling `RegisterTools`, and the concrete driver maps this Core
     * type **up** to the provider's native function-calling schema.
     *
     * Note that some providers (e.g. Eleven Labs) bind to a pre-declared tool set on a
     * server-side agent configuration; for those, the driver maps these definitions onto the
     * pre-declared tool names rather than registering arbitrary schemas at session start.
     *
     * **Idempotency rule:** a post-start registration of a set IDENTICAL to the set supplied at
     * connect time (via {@link RealtimeSessionParams.Tools}) MUST be a no-op. Providers that bind
     * their tool set at connect time and cannot re-declare schemas on an open session MUST no-op
     * (and may log) rather than degrade the conversation — e.g. by injecting schema text into the
     * conversation as content. A genuinely DIFFERENT post-start set on such a provider is
     * unsupported and should be surfaced as a warning, not silently mangled.
     *
     * @param tools The tools to expose to the model.
     */
    RegisterTools(tools: RealtimeToolDefinition[]): Promise<void>;

    /**
     * Registers a handler for model **audio** output frames (the audio media plane).
     *
     * @param handler Invoked with each output audio frame as an `ArrayBuffer`.
     */
    OnOutput(handler: (chunk: ArrayBuffer) => void): void;

    /**
     * Registers a handler for the model's **video** output as typed frames ({@link RealtimeVideoFrame}): pieces of
     * fragmented MP4, encoded chunks or images, in the order the model sent them. A driver that emits them declares an
     * outbound video track in {@link RealtimeSessionCapabilities.SupportedOutboundTracks} whose `Encoding` names the
     * frames' type. A Gemini Live session whose avatar was granted for a host that publishes it
     * ({@link RealtimeAvatarSettings.Delivery} `'room'`) sends the avatar's MP4 pieces here.
     *
     * An fMP4 piece may carry the voice on its audio track; while it does, the voice does not also come through
     * {@link OnOutput}. After {@link OnInterruption} the host drops video not yet shown, and the driver drops the
     * interrupted turn's late frames. The seconds of video the model generated reach {@link OnUsage}
     * (`OutputTokenDetails.VideoSeconds`).
     *
     * Optional: audio-only drivers don't implement it; call it null-safely (`session.OnVideoFrame?.(...)`).
     *
     * @param handler Invoked with each frame, in the order the model sent them.
     */
    OnVideoFrame?(handler: (frame: RealtimeVideoFrame) => void): void;

    /**
     * Registers a handler for the model's video output as untyped bytes. A driver implements this or
     * {@link OnVideoFrame}, not both.
     *
     * @deprecated Use {@link OnVideoFrame}, whose frames say what they are: a host can't tell an MP4 piece from an encoded
     * chunk or an image by its bytes. Hosts still forward it. Removed in the next major version.
     *
     * @param handler Invoked with each output video chunk as an `ArrayBuffer`.
     */
    OnVideoOutput?(handler: (chunk: ArrayBuffer) => void): void;

    /**
     * What became of the session's avatar request, as decided when the session opened. Its driver decides, except when
     * the driver has nothing to report: the session prep asked it for no avatar, or it renders no avatar and ignored the
     * request. The agent runtime then says why: a phone call (`'phone'`), no face for the model's vendor
     * (`'no-binding'`), an unknown avatar (`'unknown-avatar'`), a model that shows none (`'endpoint'`), or a host that
     * publishes no avatar into a room (`'bridged'`). Absent when the session asked for no avatar (the voiced agent's video
     * setting is off), or its driver reported nothing about one on a model that shows avatars.
     */
    AvatarStatus?: RealtimeAvatarStatus;

    /**
     * Registers a handler for transcript events (the text stream).
     *
     * Consumers typically forward these to the control plane and persist them as
     * `ConversationDetail` records.
     *
     * @param handler Invoked with each {@link RealtimeTranscript} (partial or final).
     */
    OnTranscript(handler: (t: RealtimeTranscript) => void): void;

    /**
     * Registers a handler for model tool-call requests.
     *
     * Consumers execute the requested tool (under the session's context user) and feed the
     * result back to the model.
     *
     * @param handler Invoked with each {@link RealtimeToolCall}.
     */
    OnToolCall(handler: (call: RealtimeToolCall) => void): void;

    /**
     * Send the result of an executed tool/function call back to the model so it can continue the
     * turn. `output` is the JSON-stringified tool result. Called by the agent layer after it handles
     * an {@link IRealtimeSession.OnToolCall}.
     *
     * @param callID The `CallID` from the originating {@link RealtimeToolCall}, used to correlate the result.
     * @param output The tool's result as a JSON-stringified string.
     * @param taskRevision Optional task revision counter from the tool call. If supplied and mismatched, stale results are discarded.
     * @returns A promise that resolves once the result has been sent to the provider.
     */
    SendToolResult(callID: string, output: string, taskRevision?: number): Promise<void>;

    /**
     * Current task revision counter for cancellation and supersede-and-discard.
     */
    CurrentTaskRevision?: number;

    /**
     * Advances the task revision counter, causing in-flight tool results from prior revisions to be discarded.
     */
    BumpTaskRevision?(): number;

    /**
     * **Optional capability** — injects background context (e.g. delegated-run progress, freshly
     * retrieved data, or a state change the model should be aware of) into the model's
     * conversation **without** forcing a spoken reply. The model simply has the note available
     * the next time it speaks.
     *
     * This is the server-side counterpart of the client-direct `BaseRealtimeClient.SendContextNote`
     * capability: in the server-bridged topology, the agent layer (e.g. a session runner observing
     * a delegated agent run) calls this to keep the realtime model informed of long-running work
     * so it can narrate naturally when asked or when it next takes the floor.
     *
     * Optionality models **capability**, not laziness: not every provider supports injecting
     * conversation items into an already-open session (some only accept media frames and tool
     * results mid-session). Drivers that cannot inject mid-session omit the member entirely, and
     * callers must feature-detect (`if (session.SendContextNote) { ... }`) rather than assume it.
     *
     * @param text The context note to append to the conversation (plain text; the caller owns any
     * prefixing/framing policy such as "[progress]" markers).
     */
    SendContextNote?(text: string): void;

    /**
     * **Optional capability** — asks the model to voice **one brief interim update** following the
     * given instructions (e.g. "In one short sentence, tell the user the report agent has finished
     * gathering data and is now drafting"). Used by the agent layer to narrate delegated-run
     * progress while a long-running tool/agent call is still in flight.
     *
     * Implementations **must not collide with an in-flight model response**: providers reject or
     * garble overlapping generation requests. A driver must either queue the request until the
     * current response completes or skip it outright — skipping is explicitly acceptable because
     * interim updates are disposable by contract (a stale "still working…" line has no value once
     * the real result lands; the next update or the final result supersedes it).
     *
     * Like {@link IRealtimeSession.SendContextNote}, this is optional because it models provider
     * capability: drivers whose provider cannot trigger an instructed, one-off spoken response
     * mid-session omit the member, and callers must feature-detect before invoking.
     *
     * @param instructions Instructions for the single spoken update (tone, brevity, content).
     * @returns `true` when a response was actually triggered, `false` when it was skipped (e.g. a response
     *   is already in flight). A bridge that claimed the speaking floor for this turn uses this to release the
     *   floor immediately on a skip — otherwise a skipped trigger would wedge the room until the safety timer.
     *   `void`/`undefined` from legacy drivers is treated as "triggered" for backward compatibility.
     */
    RequestSpokenUpdate?(instructions: string): boolean | void;

    /**
     * Mid-session instruction update (e.g. OpenAI `session.instructions.append`).
     *
     * @param instructions New or appended instructions for the ongoing session.
     */
    SendInstructions?(instructions: string): Promise<void>;

    /**
     * **Capability introspection.** A small, static description of what THIS live session can do, so the
     * container can ask "is it safe to call X?" instead of invoking optional methods that silently no-op (or
     * can't be supported) on some providers — the same role `IBridgeProviderFeatures` plays for bridges and
     * {@link BaseRealtimeModel.SupportsClientDirect} plays for minting. Optional: a driver that hasn't
     * declared its capabilities is treated **conservatively** (everything unsupported). As models gain
     * abilities, drivers just flip a flag — no container changes.
     */
    Capabilities?: RealtimeSessionCapabilities;

    /**
     * **Optional capability** (gate on {@link RealtimeSessionCapabilities.CanReconfigureTurnMode}) —
     * reconfigures a **live** session's turn-taking without reconnecting: e.g. switch a 1:1 agent to
     * meeting mode (auto-response off) when its room becomes multi-agent. Providers whose runtime config is
     * mutable mid-socket (OpenAI: `session.update`) implement this and report the capability `true`;
     * providers whose turn config is fixed at connect (Gemini Live's activity detection) report `false` and
     * omit the method. The container **must** check the capability before calling — never blind-invoke.
     *
     * @param params The reconfiguration to apply (e.g. `DisableAutoResponse`).
     */
    Reconfigure?(params: RealtimeReconfigureParams): void;

    /**
     * Registers a handler for provider-detected interruptions (barge-in).
     *
     * **True barge-in only:** the handler fires ONLY when user speech interrupts ACTIVE model
     * output — NOT on every user utterance. A user simply taking their normal turn while the
     * model is idle is not an interruption, and drivers must not report it as one (e.g. a raw
     * "speech started" frame must be gated on whether a model response is actually in flight).
     *
     * Turn detection / VAD is owned by the provider. The agent layer uses this hook to cancel
     * the model's current turn **and** to fire the `cancellationToken` of any in-flight
     * delegated agent run — a stale delegated result must never be narrated into a conversation
     * that has moved on.
     *
     * @param handler Invoked when the provider reports a true barge-in interruption.
     */
    OnInterruption(handler: () => void): void;

    /**
     * Registers a handler for session errors.
     *
     * Fatality semantics mirror the client-side `BaseRealtimeClient` contract:
     * - `Fatal: true` — the session is unusable (transport/socket failure, credential/token
     *   expiry, unexpected connection loss). The consumer should finalize the session (e.g.
     *   `RealtimeSessionRunner` calls `Stop()`) instead of idling forever on a dead socket.
     * - `Fatal: false` — a provider-reported, recoverable error frame; the session stays open
     *   and the consumer should log and continue.
     *
     * @param handler Invoked with each {@link RealtimeSessionError}.
     */
    OnError(handler: (error: RealtimeSessionError) => void): void;

    /**
     * **Optional capability** — registers a handler invoked when the underlying provider
     * connection closes WITHOUT the consumer having called {@link IRealtimeSession.Close}
     * (provider-side hangup, network drop). Not fired for a consumer-initiated `Close()` —
     * the caller already knows about that one.
     *
     * Optional because not every provider surface exposes a close signal cheaply; callers
     * must feature-detect (`if (session.OnClose) { ... }`). An unexpected close is typically
     * ALSO surfaced as a `Fatal` {@link IRealtimeSession.OnError}, which is the signal
     * consumers should drive finalization from.
     *
     * @param handler Invoked when the provider connection closes unexpectedly.
     */
    OnClose?(handler: () => void): void;

    /**
     * Registers a handler for usage/telemetry updates.
     *
     * Usage is checkpointed incrementally by the agent layer (debounced onto the prompt run) so
     * partial usage is never lost if the session is force-closed after a crash.
     *
     * @param handler Invoked with each {@link RealtimeUsage} update.
     */
    OnUsage(handler: (u: RealtimeUsage) => void): void;

    /**
     * Closes the session and releases the underlying provider connection.
     *
     * @returns A promise that resolves once the session is fully closed.
     */
    Close(): Promise<void>;
}

/**
 * Parameters used to open a {@link IRealtimeSession} via {@link BaseRealtimeModel.StartSession}.
 */
export interface RealtimeSessionParams {
    /**
     * The API name of the realtime model to use (the `MJ: AI Model Vendors` API name for the
     * driver's provider).
     */
    Model: string;

    /**
     * The system prompt that establishes the model's persona and behavior for the session.
     */
    SystemPrompt: string;

    /**
     * Optional set of tools to register at session start. Equivalent to calling
     * {@link IRealtimeSession.RegisterTools} immediately after the session opens; drivers may
     * register these eagerly when the provider accepts tool schemas at session start.
     */
    Tools?: RealtimeToolDefinition[];

    /**
     * Optional initial context to seed the conversation (e.g. the prior conversation history
     * and retrieved memory) so the model starts with the same context a loop agent assembles.
     */
    InitialContext?: string;

    /**
     * Optional open, provider-specific configuration bag (e.g. voice, language, turn-taking
     * settings, or per-conversation override fields). Typed as a JSON object rather than `any`
     * so it stays serializable and inspectable.
     */
    Config?: JSONObject;

    /**
     * Optional server-authoritative hard ceiling on the session's wall-clock duration, in seconds.
     * Set for abuse-sensitive deployments (e.g. a public web-widget guest's `VoiceMaxSessionMinutes`).
     * Drivers that support a provider-side session-duration / token-expiry bound SHOULD apply
     * `min(providerDefault, MaxSessionSeconds)` so the provider drops the connection at the cap;
     * drivers that don't simply ignore it. Independently, the server stamps the absolute deadline on
     * the session and the session janitor hard-closes (finalizing runs) at the cap regardless of
     * driver support, so this is enforced server-side even when the provider can't be told.
     *
     * When unset (`undefined`/null) there is NO MJ-imposed duration cap: drivers apply no `min(...)`
     * bound and the janitor stamps no extra deadline, so the session runs under the provider's own
     * default session/token limits and MJ's normal session lifecycle (manual end, disconnect, idle
     * cleanup). This is the default for authenticated/internal sessions, which don't need an abuse cap.
     */
    MaxSessionSeconds?: number;

    /**
     * Optional ID of the user requesting or owning the realtime session.
     * Used for auditing, rate limiting, and proxy ticket attribution.
     */
    UserID?: string;

    /**
     * Optional boolean indicating that the SystemPrompt already provides its own tool framing
     * (e.g. from BuildRealtimeAgentFraming in co-agent sessions). When true, drivers MUST NOT
     * append their own standalone delegation policy. When false or omitted, drivers may fall back
     * to heuristic substring sniffing or default policy compilation.
     */
    HasToolFraming?: boolean;

    /**
     * Whether the session model is served under zero data retention: its effective catalog
     * configuration declares `Privacy.ZeroDataRetention: true`. Drivers must not turn on provider
     * features that store session content when this is `true`. Gemini Live session resumption keeps
     * resumable session state on Google's side, so the Gemini driver leaves it off and such a
     * session ends at the provider's connection limit instead. Absent or `false` means "not declared".
     */
    ZeroDataRetention?: boolean;

    /**
     * A live avatar the session asks the model to render. A driver renders it only where its model and endpoint can;
     * anywhere else the session runs audio-only and the driver logs why ({@link RealtimeAvatarUnavailableReason}). Absent
     * means no avatar.
     */
    Avatar?: RealtimeAvatarSettings;
}

/**
 * A live avatar a session asks for. The tuning members carry the same names as a persona's avatar settings
 * (`IAIPersonaVendorSettings.Avatar`), which is where a request usually comes from.
 */
export interface RealtimeAvatarSettings {
    /** The vendor's avatar id: a preset name (for example Gemini's "Ben"), or a custom avatar's id. */
    AvatarID: string;
    /** `'preset'` (default): an avatar from the vendor's catalog. `'custom'`: one made from a reference image. */
    Kind?: 'preset' | 'custom';
    /** The MJ Storage file id of the reference image, when {@link Kind} is `'custom'`. */
    ReferenceImageFileID?: string;
    /** The preferred video resolution; a driver uses the nearest its vendor offers. */
    Resolution?: 'low' | 'standard' | 'high';
    /** What shows behind the avatar, when the vendor can change it: a named treatment, or an image from MJ Storage. */
    Background?: 'default' | 'transparent' | 'blur' | { ImageFileID: string };
    /** The persona the avatar belongs to, for logs. */
    PersonaName?: string;
    /** Where the request came from: the voiced agent's persona, or an explicit override. */
    Source?: 'persona' | 'override';
    /**
     * Who shows the avatar's video. `'room'`: a server-side session whose host publishes it into a meeting room (the
     * meeting bot decodes it and publishes a camera track), so the driver may render it there. `'client'` or absent: the
     * browser that opened the session shows it; a server-side session without `'room'` stays audio only (reason
     * `'bridged'`). A phone call never carries a request (reason `'phone'`).
     */
    Delivery?: 'client' | 'room';
}

/**
 * Why a session that asked for an avatar runs audio-only:
 * - `'endpoint'`: the model, on the endpoint serving it, renders no avatar;
 * - `'bridged'`: the session runs on the server (a meeting bot) and its host can't publish video into the room;
 * - `'phone'`: the session is a phone call (a carrier call, or one that reaches a meeting room through SIP): the caller
 *   hears the agent and sees no video, so the session asks the model for no avatar;
 * - `'custom-disabled'`: custom avatars are not enabled;
 * - `'unknown-avatar'`: the request names no avatar the vendor knows;
 * - `'no-binding'`: the persona has no avatar on this vendor;
 * - `'host'`: the app showing the call shows no agent video: it told the mint so (the embeddable widgets and the mobile
 *   app have no channel that shows it), so the session asked the model for none, or the avatar was granted and the app
 *   asked for no agent video when it connected;
 * - `'browser'`: the avatar was granted and the app asked for it, but the browser could not play it;
 * - `'decoder-missing'`: the meeting host has no usable decoder (no ffmpeg, one too old, or one without the H.264 and
 *   AAC decoders), so the meeting session asked for audio;
 * - `'decoder-failed'`: the meeting bot's decoders kept failing, so the avatar was taken down mid-meeting;
 * - `'publish-failed'`: the meeting room refused the bot's video track.
 */
export type RealtimeAvatarUnavailableReason =
    | 'endpoint'
    | 'bridged'
    | 'phone'
    | 'custom-disabled'
    | 'unknown-avatar'
    | 'no-binding'
    | 'host'
    | 'browser'
    | 'decoder-missing'
    | 'decoder-failed'
    | 'publish-failed';

/**
 * Whether a session asked for a live avatar and got one, and why not when it didn't. The mint returns it
 * ({@link ClientRealtimeSessionConfig.AvatarStatus}) and a server-side session reports it
 * ({@link IRealtimeSession.AvatarStatus}), so a call or a meeting that shows no avatar can say why.
 */
export interface RealtimeAvatarStatus {
    /** Whether the session asked for an avatar: the voiced agent's video setting is on. */
    Requested: boolean;
    /** Whether the model renders the avatar in this session. */
    Granted: boolean;
    /** Why the session runs audio-only, when it asked for an avatar and was not granted one. */
    Reason?: RealtimeAvatarUnavailableReason;
}

/**
 * A transcript event emitted by the model for either the user's speech or the assistant's
 * response.
 */
export interface RealtimeTranscript {
    /**
     * Whose turn this transcript belongs to.
     */
    Role: 'user' | 'assistant';

    /**
     * The transcribed text. For `IsFinal: false` events this is the incremental **DELTA** for
     * the in-flight turn (drivers emit each new fragment, not a re-send of the accumulated
     * text); for `IsFinal: true` it is the complete turn text.
     */
    Text: string;

    /**
     * Whether this is the final transcript for the turn (`true`) or an interim delta (`false`).
     */
    IsFinal: boolean;

    /**
     * When true, this FINAL transcript REPLACES the previous final for the same in-flight turn —
     * providers that STREAM their "completed" transcription (each event carrying the full growing
     * text, e.g. Grok) set this so consumers collapse the stream into one in-place-updating turn
     * instead of a stack of growing duplicates. Absent/false: a normal, append-worthy final.
     */
    ReplacesPrevious?: boolean;

    /**
     * `'normal'` for a regular conversation turn; `'narration'` for an ephemeral
     * spoken-progress update or model-authored reasoning thought. Absent/undefined defaults to `'normal'`.
     */
    Kind?: 'normal' | 'narration';

    /**
     * `true` when this transcript represents model-authored reasoning / thoughts rather than
     * spoken audio.
     */
    IsThought?: boolean;
}

/**
 * An error surfaced by a realtime session via {@link IRealtimeSession.OnError}.
 *
 * Mirrors the client-side `RealtimeClientError` shape: `Fatal: true` means the session is
 * unusable (transport failure, credential expiry, unexpected close) and the consumer should
 * finalize; `Fatal: false` is a provider-reported, recoverable error frame.
 */
export interface RealtimeSessionError {
    /** Human-readable error message. */
    Message: string;

    /** Optional provider-specific error code. */
    Code?: string;

    /** Whether the error terminated the session. */
    Fatal: boolean;
}

/**
 * A tool-call request emitted by the model.
 */
export interface RealtimeToolCall {
    /**
     * Provider-assigned identifier for this call, used to correlate the eventual tool result.
     */
    CallID: string;

    /**
     * The name of the tool the model is requesting to invoke.
     */
    ToolName: string;

    /**
     * The arguments for the call as a JSON string, exactly as the provider emitted them.
     * Consumers parse this into the tool's expected parameter shape.
     */
    Arguments: string;

    /**
     * Optional task revision at the time the tool call was emitted. Used to detect stale/superseded results.
     */
    TaskRevision?: number;
}

/**
 * Incremental usage/telemetry reported during a realtime session.
 *
 * This is the realtime-specific counterpart to Core's request/response `ModelUsage`. Because a
 * realtime session is long-lived and usage is reported in increments (and checkpointed
 * incrementally), this type carries the token deltas a provider emits over the life of the
 * session rather than a single final tally.
 */
export interface RealtimeUsage {
    /**
     * Number of input tokens reported in this usage update.
     */
    InputTokens: number;

    /**
     * Number of output tokens reported in this usage update.
     */
    OutputTokens: number;

    /**
     * Number of voice-duration seconds reported in this usage update (cumulative snapshot).
     */
    DurationSeconds?: number;

    /**
     * Per-modality breakdown of the input tokens, when the provider reports one. Realtime models
     * bill audio and text tokens at very different rates (e.g. GPT Realtime 2.1: $32/M audio in
     * vs $4/M text in), so cost attribution REQUIRES this split — the totals alone force a wrong
     * blended rate. Absent when the provider reports only totals.
     */
    InputTokenDetails?: RealtimeUsageModalityDetail;

    /**
     * Per-modality breakdown of the output tokens, when the provider reports one, and the seconds of
     * avatar video generated since the last update (`VideoSeconds`). An update may carry only those
     * seconds, with both token totals 0. See {@link RealtimeUsage.InputTokenDetails}.
     */
    OutputTokenDetails?: RealtimeUsageModalityDetail;
}

/**
 * Per-modality token counts inside a {@link RealtimeUsage} update. All fields optional — providers
 * report different subsets (OpenAI GA: text/audio/cached on input, text/audio on output; Gemini Live:
 * text/audio/image on input, text/audio/video on output).
 *
 * Every token field is an amount for this update, like the totals. The video fields differ by
 * direction: inbound they are the session's running totals (snapshots), outbound `VideoSeconds` is
 * an amount for this update.
 */
export interface RealtimeUsageModalityDetail {
    /** Text-modality tokens. */
    TextTokens?: number;
    /** Audio-modality tokens. */
    AudioTokens?: number;
    /**
     * Image-modality tokens (input only on current providers).
     * Authoritative financial billing basis reported by inference providers (e.g. Gemini Live reports
     * inbound video frames under promptTokensDetails.IMAGE).
     */
    ImageTokens?: number;
    /**
     * Video-modality tokens, as the provider reports them (Gemini Live: `responseTokensDetails` VIDEO for
     * a generated avatar's video). Part of the update's output total when the provider counts them there.
     */
    VideoTokens?: number;
    /** Tokens served from the provider's prompt cache (billed at the cached rate). */
    CachedTokens?: number;
    /**
     * Inbound only: the video frames sent so far on the session's video tracks (usage basis 'frames'),
     * a running total rather than an amount for this update. Client-side telemetry; comparing it
     * against ImageTokens surfaces dropped frames.
     */
    VideoFrames?: number;
    /**
     * Seconds of video (usage basis 'seconds'). The two directions mean different things:
     * - **Inbound** (`InputTokenDetails`): the wall-clock span between the first and last frame sent so
     *   far (span-not-sum), a running total for telemetry. Provider-reported ImageTokens remain the
     *   billing basis.
     * - **Outbound** (`OutputTokenDetails`): the seconds of video the model generated since the last
     *   update (an avatar's video, from its fragment durations), an amount like the token fields.
     *   Consumers add the updates up.
     */
    VideoSeconds?: number;
}

/**
 * Minimal, Core-level definition of a tool exposed to a realtime model.
 *
 * This type lives in the lowest AI layer and is intentionally provider- and agent-agnostic.
 * The agent layer maps its richer tool metadata **down** to this type before registering tools,
 * and each concrete driver maps this type **up** to the provider's native function-calling
 * schema. Keeping the Core type minimal avoids an illegal upward dependency from Core onto the
 * agent packages.
 */
export interface RealtimeToolDefinition {
    /**
     * The tool's name, used to match provider tool-call frames back to MJ tool execution.
     */
    Name: string;

    /**
     * A human-readable description of what the tool does. Surfaced to the model so it can decide
     * when to call the tool.
     */
    Description: string;

    /**
     * A JSON-schema object describing the tool's parameters. Drivers translate this into the
     * provider's native function-parameter schema.
     */
    ParametersSchema: JSONObject;
}

/**
 * Normalized representation of a realtime tool execution scheduling hint.
 *
 * Directs how the model should schedule its generation following a tool result:
 * - `'silent'`: Execute without model speaking response.
 * - `'whenIdle'`: Deliver tool output to model when conversational turn goes idle.
 * - `'interrupt'`: Immediately interrupt active generation to deliver tool output.
 */
export type RealtimeToolSchedulingHint = 'silent' | 'whenIdle' | 'interrupt';

/**
 * Extracts and normalizes scheduling hints (`__mj_scheduling` or legacy `scheduling`)
 * from a tool's parsed return dictionary.
 *
 * Strips both keys from `parsed` in-place so neither key leaks into the model's response payload.
 * Validates the value case-insensitively, accepting:
 * - 'SILENT' -> 'silent'
 * - 'WHEN_IDLE' -> 'whenIdle'
 * - 'INTERRUPT' | 'INTERRUPTED' -> 'interrupt'
 *
 * Warns on unrecognized values with `loggerTag` and returns `undefined`.
 *
 * @param parsed The tool output dictionary (mutated in-place to strip scheduling keys).
 * @param toolName The name of the tool being executed, for logging context.
 * @param loggerTag Optional logging tag prefix (defaults to 'Realtime').
 * @returns The normalized scheduling hint, or `undefined` if absent or unrecognized.
 */
export function ExtractToolSchedulingHint(
    parsed: Record<string, unknown>,
    toolName: string,
    loggerTag: string = 'Realtime'
): RealtimeToolSchedulingHint | undefined {
    const raw = parsed['__mj_scheduling'] ?? parsed['scheduling'];
    if ('__mj_scheduling' in parsed) {
        delete parsed['__mj_scheduling'];
    }
    if ('scheduling' in parsed) {
        delete parsed['scheduling'];
    }

    if (typeof raw !== 'string') {
        return undefined;
    }

    const schedStr = raw.trim().toUpperCase();
    if (schedStr.length === 0) {
        return undefined;
    }

    if (schedStr === 'SILENT') {
        return 'silent';
    } else if (schedStr === 'WHEN_IDLE') {
        return 'whenIdle';
    } else if (schedStr === 'INTERRUPT' || schedStr === 'INTERRUPTED') {
        return 'interrupt';
    } else {
        console.warn(`[${loggerTag}] Unrecognized function scheduling value "${raw}" for tool "${toolName}".`);
        return undefined;
    }
}
