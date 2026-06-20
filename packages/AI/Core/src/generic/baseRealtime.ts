import { BaseModel } from "./baseModel";

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
export abstract class BaseRealtimeModel extends BaseModel {
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
     * plane is media-tagged ({@link IRealtimeSession.SendInput} takes a {@link RealtimeMediaKind};
     * {@link IRealtimeSession.OnVideoOutput} delivers video-out), so a video session reuses the entire
     * realtime contract — only the media frames gain a `video` kind. Resolution prefers a video-capable
     * model when an agent requests video, and degrades to audio-only otherwise.
     *
     * @returns `true` if sessions can carry video; `false` (audio-only) otherwise.
     */
    public get SupportsVideo(): boolean {
        return false;
    }

    /**
     * The provider-native voice ids this model can speak with (e.g. OpenAI `alloy`/`echo`/`shimmer`). The
     * model/driver is the authoritative owner of "what voices do I support", so each driver declares its
     * own — used to populate the dev voice picker. Default empty (a driver that hasn't declared voices
     * yields no picker options, falling back to the configured/default voice).
     *
     * NOTE: this is the near-term, driver-owned source of truth. Long term this should move to metadata so
     * providers that let users add their OWN voices (e.g. ElevenLabs) can be enumerated dynamically.
     *
     * @returns The supported voice ids (id + human label), or `[]` when none are declared.
     */
    public get SupportedVoices(): RealtimeVoiceOption[] {
        return [];
    }
}

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
 * The server-minted configuration a browser needs to open a **client-direct** realtime session.
 *
 * Returned by {@link BaseRealtimeModel.CreateClientSession}. The browser authenticates to the
 * provider with {@link ClientRealtimeSessionConfig.EphemeralToken} and hands
 * {@link ClientRealtimeSessionConfig.SessionConfig} to the matching client driver — so the server
 * retains control of the prompt and tool set even though the browser owns the socket.
 *
 * **`SessionConfig` is a private pact between same-keyed driver halves.** The server driver that
 * minted it (selected by {@link ClientRealtimeSessionConfig.Provider}) and the client driver
 * registered under the same key are the ONLY parties that understand its shape. Hosts and any
 * transport in between must treat it as an opaque, serializable blob — never inspect, edit, or
 * depend on its fields.
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
     */
    EphemeralToken: string;

    /**
     * ISO-8601 timestamp at which {@link ClientRealtimeSessionConfig.EphemeralToken} expires.
     */
    ExpiresAt: string;

    /**
     * The provider-native session config the matching client driver applies when it opens its
     * socket (instructions/system prompt, tools, audio formats, turn detection). Because the server
     * builds this, prompt and tool authority stay server-side even in the client-direct topology.
     * Typed as a JSON object so it stays serializable across the server→client boundary — but its
     * SHAPE is a private pact between the same-keyed server and client drivers; hosts must treat it
     * opaquely and never read or rewrite its fields.
     */
    SessionConfig: JSONObject;
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
     * Sends a client media frame to the model.
     *
     * Fire-and-forget: frames are streamed straight to the provider with no JSON intermediation. The
     * optional `kind` tags the media plane — `'audio'` (default, back-compatible: existing callers and
     * audio-only drivers need not pass or read it) or `'video'` for a camera frame to a video-capable
     * model (one that {@link BaseRealtimeModel.SupportsVideo}). Audio-only drivers ignore `'video'`
     * frames.
     *
     * @param chunk A raw media frame as an `ArrayBuffer`.
     * @param kind The media plane the frame belongs to. Defaults to `'audio'`.
     */
    SendInput(chunk: ArrayBuffer, kind?: RealtimeMediaKind): void;

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
     * Registers a handler for model **video** output frames — the talking-head avatar / generated
     * video a video-capable model emits, in sync with {@link IRealtimeSession.OnOutput}'s audio.
     *
     * Optional: audio-only drivers (the default) don't implement it, and consumers must call it
     * null-safely (`session.OnVideoOutput?.(...)`). A video-capable driver
     * ({@link BaseRealtimeModel.SupportsVideo}) implements it; the consumer (bridge / client) maps these
     * frames onto its `video-out` track exactly as it maps audio.
     *
     * @param handler Invoked with each output video frame as an `ArrayBuffer`.
     */
    OnVideoOutput?(handler: (chunk: ArrayBuffer) => void): void;

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
     * @returns A promise that resolves once the result has been sent to the provider.
     */
    SendToolResult(callID: string, output: string): Promise<void>;

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
     */
    RequestSpokenUpdate?(instructions: string): void;

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
