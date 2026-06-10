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
     * a {@link ClientRealtimeSessionConfig} whose `SessionConfig` the browser applies verbatim. This
     * keeps prompt/tool authority server-side even though the media plane is client-direct.
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
}

/**
 * The server-minted configuration a browser needs to open a **client-direct** realtime session.
 *
 * Returned by {@link BaseRealtimeModel.CreateClientSession}. The browser authenticates to the
 * provider with {@link ClientRealtimeSessionConfig.EphemeralToken} and applies
 * {@link ClientRealtimeSessionConfig.SessionConfig} verbatim — so the server retains control of the
 * prompt and tool set even though the browser owns the socket.
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
     * The provider-native session config the browser must apply when it opens its socket
     * (instructions/system prompt, tools, audio formats, turn detection). Because the server builds
     * this, prompt and tool authority stay server-side even in the client-direct topology. Typed as
     * a JSON object so it stays serializable across the server→client boundary.
     */
    SessionConfig: JSONObject;
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
     * Sends a client media frame to the model (audio now, video later).
     *
     * Fire-and-forget: frames are streamed straight to the provider with no JSON intermediation.
     *
     * @param chunk A raw media frame as an `ArrayBuffer`.
     */
    SendInput(chunk: ArrayBuffer): void;

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
     * @param tools The tools to expose to the model.
     */
    RegisterTools(tools: RealtimeToolDefinition[]): Promise<void>;

    /**
     * Registers a handler for model media output frames (the media plane).
     *
     * @param handler Invoked with each output media frame as an `ArrayBuffer`.
     */
    OnOutput(handler: (chunk: ArrayBuffer) => void): void;

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
     * Registers a handler for provider-detected interruptions (barge-in).
     *
     * Turn detection / VAD is owned by the provider. The agent layer uses this hook to cancel
     * the model's current turn **and** to fire the `cancellationToken` of any in-flight
     * delegated agent run — a stale delegated result must never be narrated into a conversation
     * that has moved on.
     *
     * @param handler Invoked when the provider reports an interruption.
     */
    OnInterruption(handler: () => void): void;

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
     * The transcribed text. For partial transcripts this is the best-effort text so far.
     */
    Text: string;

    /**
     * Whether this is the final transcript for the turn (`true`) or an interim/partial update (`false`).
     */
    IsFinal: boolean;
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
