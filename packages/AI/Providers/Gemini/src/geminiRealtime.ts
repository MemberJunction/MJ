// Google Gemini Live API imports
import {
    GoogleGenAI,
    Modality,
    type AuthToken,
    type CreateAuthTokenParameters,
    type LiveServerMessage,
    type LiveServerContent,
    type LiveConnectConfig,
    type FunctionDeclaration,
    type FunctionCall,
    type FunctionResponse,
    type Content,
    type Blob as GeminiBlob,
    type ActivityStart,
    type ActivityEnd,
} from '@google/genai';

// MemberJunction AI core contract
import {
    BaseRealtimeModel,
    type ClientRealtimeSessionConfig,
    type IRealtimeSession,
    type RealtimeSessionParams,
    type RealtimeToolDefinition,
    type RealtimeTranscript,
    type RealtimeToolCall,
    type RealtimeUsage,
    type RealtimeSessionError,
    type JSONObject,
    type JSONValue,
    type RealtimeSessionCapabilities,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * MIME type Gemini Live expects for client-streamed audio: 16-bit signed PCM at 16 kHz, mono.
 * Output audio from the model is 24 kHz PCM; the driver passes output frames through untouched as
 * raw `ArrayBuffer` and leaves resampling/playback to the consumer.
 */
const GEMINI_INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';

/**
 * Window (ms) within which a client-direct browser must OPEN its Live session using a minted
 * ephemeral token. After this the token can no longer start a NEW session (an already-open
 * session continues until {@link GEMINI_CLIENT_TOKEN_EXPIRY_MS}).
 */
const GEMINI_CLIENT_TOKEN_NEW_SESSION_WINDOW_MS = 10 * 60 * 1000;

/**
 * Total lifetime (ms) of a minted client-direct ephemeral token: messages on a Live session
 * authenticated with the token are rejected after this point.
 */
const GEMINI_CLIENT_TOKEN_EXPIRY_MS = 30 * 60 * 1000;

/**
 * The minimal subset of `@google/genai`'s `Session` that the realtime driver depends on. Declaring
 * the seam as an interface (rather than the concrete SDK `Session`) lets unit tests inject a fully
 * in-memory fake that drives the registered callbacks with Gemini-shaped messages and captures
 * outbound calls — no websocket, no network.
 */
export interface GeminiLiveSession {
    /**
     * Streams realtime user input to the model — media frames (audio now) AND mid-session
     * text. Realtime text is the Live API's "respond now" path for in-conversation messages:
     * native-audio models treat {@link sendClientContent} as history seeding only and will
     * NOT generate from it mid-call, while realtime text triggers immediately.
     */
    sendRealtimeInput(params: {
        audio?: GeminiBlob;
        media?: GeminiBlob;
        text?: string;
        /** Manual activity markers — used in MEETING mode (automatic activity detection disabled). */
        activityStart?: ActivityStart;
        activityEnd?: ActivityEnd;
    }): void;
    /** Appends client content (used to seed initial context) to the conversation. */
    sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void;
    /** Replies to a server tool call with one or more function responses. */
    sendToolResponse(params: { functionResponses: FunctionResponse[] | FunctionResponse }): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Concrete arguments handed to {@link GeminiRealtime.connectLiveSession}. Bundles the resolved
 * connect config (system instruction, tools, modalities, transcription) and the message callback so
 * the seam owns the entire `ai.live.connect` call and tests can substitute it wholesale.
 */
export interface GeminiConnectArgs {
    /** The Gemini Live model id to open the session against. */
    Model: string;
    /** The fully-built connect config (system instruction, tools, modalities, transcription, plus the open config bag). */
    Config: LiveConnectConfig;
    /** Invoked for every {@link LiveServerMessage} the server emits over the session. */
    OnMessage: (message: LiveServerMessage) => void;
    /** Invoked on a websocket-level error (fatal — the session is unusable). Optional. */
    OnError?: (event: ErrorEvent) => void;
    /** Invoked when the websocket closes. Optional. */
    OnClose?: (event: CloseEvent) => void;
}

/**
 * Real-time, full-duplex driver for Google's **Gemini Live API**, implementing the Core
 * {@link BaseRealtimeModel} primitive.
 *
 * The driver opens a bidirectional Gemini Live session, streams client audio in, and translates the
 * provider's {@link LiveServerMessage} frames into the modality-agnostic Core events
 * ({@link RealtimeTranscript}, {@link RealtimeToolCall}, {@link RealtimeUsage}, output media, and
 * interruption). It registers via the MemberJunction class factory as `GeminiRealtime` and is
 * resolved for `MJ: AI Models` typed `Realtime`.
 *
 * **Testability:** the live-session creation is isolated behind the overridable
 * {@link connectLiveSession} seam, so unit tests inject a fake {@link GeminiLiveSession} and exercise
 * the full message→event translation with no network.
 */
@RegisterClass(BaseRealtimeModel, 'GeminiRealtime')
export class GeminiRealtime extends BaseRealtimeModel {
    private geminiClient: GoogleGenAI | null = null;
    private geminiTokenClient: GoogleGenAI | null = null;

    constructor(apiKey: string) {
        super(apiKey);
        // Client is created lazily in connectLiveSession so subclasses (and tests overriding the
        // seam) never trigger an unused live client construction.
    }

    /**
     * Opens a Gemini Live session and returns the Core session handle that translates between the
     * provider's frames and the MemberJunction realtime contract.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const session = new GeminiRealtimeSession();
        session.SetConnectTimeTools(params.Tools ?? []);
        const config = this.buildConnectConfig(params);
        // Meeting mode (auto activity detection disabled) → the session must drive turns manually.
        session.SetMeetingMode(config.realtimeInputConfig?.automaticActivityDetection?.disabled === true);
        const live = await this.connectLiveSession({
            Model: params.Model,
            Config: config,
            OnMessage: (message) => session.HandleServerMessage(message),
            OnError: (event) => session.HandleTransportError(event?.message ?? 'Gemini Live websocket error'),
            OnClose: (event) => session.HandleTransportClose(event?.code, event?.reason),
        });
        session.AttachLiveSession(live);
        // If the caller provided initial context, seed it as client content (without completing the
        // turn) so the model starts with the same history a loop agent would assemble.
        if (params.InitialContext && params.InitialContext.trim().length > 0) {
            session.SeedInitialContext(params.InitialContext);
        }
        return session;
    }

    /**
     * Gemini Live supports the client-direct topology: the server mints a short-lived ephemeral
     * auth token (`v1alpha` `auth_tokens` API) that the browser uses to open its OWN Live
     * websocket, while the server keeps prompt/tool authority by LOCKING the connect config into
     * the token via `liveConnectConstraints`.
     */
    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /**
     * Mints an ephemeral, server-scoped Live credential for a **client-direct** session.
     *
     * The connect config is built EXACTLY as {@link StartSession} builds it (same
     * {@link buildConnectConfig}: audio modality, input+output transcription, system instruction,
     * mapped tools) and is **locked into the token** via `liveConnectConstraints` +
     * `lockAdditionalFields: []` — so the API ignores any attempt by the browser to change the
     * locked fields. The same config is ALSO carried in `SessionConfig` (as `{ model, config }`)
     * because the SDK still expects the client to pass a model/config at `live.connect` time; the
     * token-side lock is what makes the server's prompt and tool set authoritative.
     *
     * Expiry: the browser must open its session within
     * {@link GEMINI_CLIENT_TOKEN_NEW_SESSION_WINDOW_MS}; the token (and thus the session's
     * ability to send messages) dies at {@link GEMINI_CLIENT_TOKEN_EXPIRY_MS}.
     *
     * @param params Session configuration (model, system prompt, tools, config bag).
     * @returns The minted {@link ClientRealtimeSessionConfig} the browser authenticates + applies.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const config = this.buildConnectConfig(params);
        const now = Date.now();
        const expireTime = new Date(now + GEMINI_CLIENT_TOKEN_EXPIRY_MS).toISOString();
        const newSessionExpireTime = new Date(now + GEMINI_CLIENT_TOKEN_NEW_SESSION_WINDOW_MS).toISOString();
        const token = await this.mintAuthToken({
            config: {
                uses: 1,
                expireTime,
                newSessionExpireTime,
                // Lock the model + the MASK-SAFE config subset into the token
                // (lockAdditionalFields: [] means "lock exactly the fields set in
                // liveConnectConstraints.config"). The token API only accepts a SUBSET of
                // LiveConnectConfig as constraints — systemInstruction / tools /
                // transcription keys make the generated field_mask invalid
                // ("field_mask is invalid for BidiGenerateContentSetup", 400), so those
                // travel ONLY via SessionConfig below. They remain server-authored: the
                // browser applies the server-built config verbatim at live.connect; the
                // token simply can't cryptographically pin them on Gemini today.
                liveConnectConstraints: { model: params.Model, config: GeminiRealtime.BuildConstraintConfig(config) },
                lockAdditionalFields: [],
            },
        });
        if (!token.name) {
            throw new Error('Gemini auth-token mint returned no token name');
        }
        return {
            Provider: 'gemini',
            Model: params.Model,
            EphemeralToken: token.name,
            ExpiresAt: expireTime,
            // Plain-JSON copy of what the browser passes to live.connect (model + config). The
            // token lock above makes these values authoritative even if a client tampers.
            SessionConfig: JSON.parse(JSON.stringify({ model: params.Model, config })) as JSONObject,
        };
    }

    /**
     * Mint seam for the ephemeral auth token. Production routes through the SDK's
     * `authTokens.create` on a `v1alpha` client (ephemeral tokens are v1alpha-only); unit tests
     * override this to return a fake token with no network.
     *
     * @param params The auth-token create parameters (expiry, uses, live-connect constraints).
     * @returns The created {@link AuthToken} (its `name` is the credential the browser presents).
     */
    protected async mintAuthToken(params: CreateAuthTokenParameters): Promise<AuthToken> {
        return this.ensureTokenClient().authTokens.create(params);
    }

    /**
     * Lazily constructs the `v1alpha` `GoogleGenAI` client used ONLY for auth-token minting
     * (the ephemeral-token API is exposed on `v1alpha`; the regular live client stays default).
     */
    private ensureTokenClient(): GoogleGenAI {
        if (!this.geminiTokenClient) {
            this.geminiTokenClient = new GoogleGenAI({ apiKey: this.apiKey, httpOptions: { apiVersion: 'v1alpha' } });
        }
        return this.geminiTokenClient;
    }

    /**
     * Creation seam for the underlying Gemini Live session.
     *
     * Production code routes through `ai.live.connect`; unit tests override this method to inject a
     * fake {@link GeminiLiveSession}. Kept as a thin, single-responsibility method so the network
     * boundary is the *only* thing tests need to replace.
     *
     * @param args Resolved model, connect config, and the server-message callback.
     * @returns A promise resolving to the live session handle.
     */
    protected async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        const client = this.ensureClient();
        return client.live.connect({
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
     * Lazily constructs the `GoogleGenAI` client from the driver's API key.
     */
    private ensureClient(): GoogleGenAI {
        if (!this.geminiClient) {
            this.geminiClient = new GoogleGenAI({ apiKey: this.apiKey });
        }
        return this.geminiClient;
    }

    /**
     * Builds the {@link LiveConnectConfig} from the Core session params: audio response modality,
     * input/output transcription, system instruction, mapped tools, plus any provider-specific
     * overrides from the open config bag.
     */
    /**
     * Projects the full connect config down to the fields Gemini's ephemeral-token API accepts
     * as `liveConnectConstraints.config`. The token mint converts the provided keys into a
     * field mask over `BidiGenerateContentSetup`, and only generation-level fields are valid
     * there — `systemInstruction`, `tools`, and the transcription configs are NOT, and their
     * presence 400s the entire mint. Only defined fields are copied (an absent key must stay
     * absent so it doesn't enter the mask).
     */
    public static BuildConstraintConfig(config: LiveConnectConfig): LiveConnectConfig {
        const constraint: LiveConnectConfig = {};
        if (config.responseModalities) {
            constraint.responseModalities = config.responseModalities;
        }
        if (config.speechConfig) {
            constraint.speechConfig = config.speechConfig;
        }
        if (config.temperature != null) {
            constraint.temperature = config.temperature;
        }
        if (config.topP != null) {
            constraint.topP = config.topP;
        }
        if (config.maxOutputTokens != null) {
            constraint.maxOutputTokens = config.maxOutputTokens;
        }
        if (config.sessionResumption) {
            constraint.sessionResumption = config.sessionResumption;
        }
        return constraint;
    }

    private buildConnectConfig(params: RealtimeSessionParams): LiveConnectConfig {
        const config: LiveConnectConfig = {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: params.SystemPrompt,
        };
        if (params.Tools && params.Tools.length > 0) {
            config.tools = [{ functionDeclarations: GeminiRealtime.MapToolsToFunctionDeclarations(params.Tools) }];
        }
        // The open config bag is merged last so per-conversation overrides (voice, language,
        // turn-taking) win over the defaults above. Cast through the shared JSON object shape.
        if (params.Config) {
            // Pull the host-NEUTRAL meeting flag out before merging — it is NOT a Gemini config key, and a
            // blind copy would send it raw. In meeting mode we disable Gemini's AUTOMATIC activity detection
            // so the model stops auto-responding to room audio; the bridge then drives turns manually
            // (activityStart on input, activityEnd on RequestSpokenUpdate). This is the Gemini-native
            // equivalent of OpenAI's `turn_detection.create_response=false`, kept entirely in this subclass.
            // See plans/realtime/multi-agent-meeting-turn-taking.md §4.
            const cfg = { ...(params.Config as Record<string, unknown>) };
            const disableAutoResponse = cfg.disableAutoResponse === true;
            delete cfg.disableAutoResponse;
            Object.assign(config, cfg as Partial<LiveConnectConfig>);
            if (disableAutoResponse) {
                config.realtimeInputConfig = {
                    ...(config.realtimeInputConfig ?? {}),
                    automaticActivityDetection: { ...(config.realtimeInputConfig?.automaticActivityDetection ?? {}), disabled: true },
                };
            }
        }
        return config;
    }

    /**
     * Maps Core {@link RealtimeToolDefinition}s up to Gemini {@link FunctionDeclaration}s.
     *
     * The Core `ParametersSchema` is a JSON-schema object, so it rides in `parametersJsonSchema`
     * (the SDK's JSON-schema slot) rather than the OpenAPI-style `parameters` slot.
     */
    public static MapToolsToFunctionDeclarations(tools: RealtimeToolDefinition[]): FunctionDeclaration[] {
        return tools.map((tool) => ({
            name: tool.Name,
            description: tool.Description,
            parametersJsonSchema: tool.ParametersSchema,
        }));
    }
}

/**
 * Concrete {@link IRealtimeSession} backed by a Gemini Live {@link GeminiLiveSession}.
 *
 * Owns the inbound translation (Gemini {@link LiveServerMessage} → Core events) and the outbound
 * translation (Core calls → Gemini send methods). It is created by {@link GeminiRealtime.StartSession}
 * and never instantiated directly by consumers.
 */
class GeminiRealtimeSession implements IRealtimeSession {
    /**
     * Gemini Live consumes **16 kHz** PCM input ({@link GEMINI_INPUT_AUDIO_MIME_TYPE}) and emits 24 kHz. A
     * server-bridged host reads these to resample room audio correctly — without it the bridge feeds Gemini
     * 24 kHz audio it can't parse, so the agent never responds (while client-direct works, as the browser
     * negotiates the rate). See `plans/realtime/realtime-core-host-convergence.md`.
     */
    public readonly InputSampleRate = 16000;
    public readonly OutputSampleRate = 24000;

    private live: GeminiLiveSession | null = null;

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private usageHandler: ((u: RealtimeUsage) => void) | null = null;
    private errorHandler: ((error: RealtimeSessionError) => void) | null = null;
    /** True once Close() ran — an expected close must not surface as a fatal error. */
    private closedByConsumer = false;

    /**
     * Maps each pending tool call's `CallID` to its function name. Gemini's `sendToolResponse`
     * requires the function name, but the Core {@link IRealtimeSession.SendToolResult} contract only
     * carries `callID` + `output`. We cache the name when a tool call arrives and clear the entry
     * once the result is sent.
     */
    private pendingToolCallNames = new Map<string, string>();

    /**
     * Fingerprint of the tool set bound at connect time (set via {@link SetConnectTimeTools});
     * {@link RegisterTools} compares against it to no-op identical re-registrations.
     * Defaults to the empty set's fingerprint for sessions started without tools.
     */
    private connectTimeToolsFingerprint = GeminiRealtimeSession.ToolSetFingerprint([]);

    /**
     * Whether a model turn is currently being generated. Minimal turn tracking mirroring the
     * client driver: set when model output arrives (Gemini has no `response.created`-style frame,
     * so the first `modelTurn` content is the signal) and eagerly when this session itself sends a
     * turn-triggering client content; cleared on `turnComplete`, `interrupted`, and a tool-call
     * frame (the model yields the floor pending the result). Consumed by {@link enqueueOrRun}:
     * on Gemini Live ANY client content sent mid-turn INTERRUPTS the in-flight generation, so
     * interim-update sends are deferred rather than sent into an active turn.
     */
    private responseActive = false;

    /**
     * Client-content sends deferred while a turn is in flight; drained in order when the turn
     * completes (the drain stops at the first send that itself starts a new turn). Cleared on
     * {@link Close} so a closed session never replays stale sends.
     */
    private queuedSends: Array<() => void> = [];

    /**
     * Whether this session runs in MEETING mode — Gemini's automatic activity detection is disabled, so the
     * model never auto-responds to room audio. The bridge drives turns manually instead: an `activityStart`
     * opens an input window on the first audio, and `RequestSpokenUpdate` sends `activityEnd` to commit the
     * turn and elicit one response. Set by the driver from the connect config. See the §4 design.
     */
    private meetingMode = false;

    /** In meeting mode, whether a manual input window (`activityStart` … pending `activityEnd`) is open. */
    private manualActivityOpen = false;

    /**
     * Binds the underlying live session. Called by the driver once `connect` resolves.
     */
    public AttachLiveSession(live: GeminiLiveSession): void {
        this.live = live;
    }

    /** Sets MEETING mode (manual turn-taking). Called by the driver from the connect config at start. */
    public SetMeetingMode(on: boolean): void {
        this.meetingMode = on;
    }

    /**
     * @inheritdoc — Gemini Live's activity detection is fixed at **connect** time, so the turn mode can't be
     * changed on a live socket (it would need a reconnect). Reported `false` so the container leaves a
     * Gemini agent in its start mode rather than calling an unsupported reconfigure. {@link Reconfigure} is
     * intentionally omitted.
     */
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false };
    }

    /**
     * Seeds the conversation with prior context as a client-content turn (not turn-complete), so the
     * model has the same starting history a loop agent would assemble.
     */
    public SeedInitialContext(context: string): void {
        const turns: Content[] = [{ role: 'user', parts: [{ text: context }] }];
        this.requireLive().sendClientContent({ turns, turnComplete: false });
    }

    /** @inheritdoc */
    public SendInput(chunk: ArrayBuffer): void {
        const live = this.requireLive();
        // Meeting mode: automatic activity detection is OFF, so audio is only processed inside an explicit
        // activity window. Open one lazily on the first audio after the last turn was committed — the window
        // stays open (accumulating what the agent hears) until RequestSpokenUpdate sends `activityEnd`.
        if (this.meetingMode && !this.manualActivityOpen) {
            live.sendRealtimeInput({ activityStart: {} });
            this.manualActivityOpen = true;
        }
        const audio: GeminiBlob = {
            data: GeminiRealtimeSession.ArrayBufferToBase64(chunk),
            mimeType: GEMINI_INPUT_AUDIO_MIME_TYPE,
        };
        live.sendRealtimeInput({ audio });
    }

    /**
     * @inheritdoc
     *
     * Gemini Live binds its tool set at connect time via {@link LiveConnectConfig.tools}; the
     * provider does not support re-declaring tool schemas on an already-open session. Per the
     * contract's idempotency rule:
     * - A post-start set IDENTICAL to the connect-time set (`params.Tools` at `StartSession`,
     *   compared order-insensitively) is a **silent no-op**.
     * - A DIFFERENT set is unsupported: it logs a clear warning and does **nothing** — it is
     *   never injected into the conversation as content (that would degrade the conversation
     *   without making the tools callable).
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        if (GeminiRealtimeSession.ToolSetFingerprint(tools) === this.connectTimeToolsFingerprint) {
            return; // identical to the connect-time set — silent no-op
        }
        console.warn(
            'GeminiRealtimeSession.RegisterTools: Gemini Live binds its tool set at connect time and cannot ' +
            're-declare schemas on an open session. The requested set differs from the connect-time set and is ' +
            'IGNORED — pass the full tool set via RealtimeSessionParams.Tools at StartSession.'
        );
    }

    /**
     * Records the tool set the driver bound at connect time so {@link RegisterTools} can
     * apply the contract's idempotency rule. Called by {@link GeminiRealtime.StartSession}.
     */
    public SetConnectTimeTools(tools: RealtimeToolDefinition[]): void {
        this.connectTimeToolsFingerprint = GeminiRealtimeSession.ToolSetFingerprint(tools);
    }

    /** Canonical, order-insensitive fingerprint of a tool set for identity comparison. */
    private static ToolSetFingerprint(tools: RealtimeToolDefinition[]): string {
        return JSON.stringify(
            [...tools]
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map((t) => ({ Name: t.Name, Description: t.Description, ParametersSchema: t.ParametersSchema }))
        );
    }

    /** @inheritdoc */
    public OnOutput(handler: (chunk: ArrayBuffer) => void): void {
        this.outputHandler = handler;
    }

    /** @inheritdoc */
    public OnTranscript(handler: (t: RealtimeTranscript) => void): void {
        this.transcriptHandler = handler;
    }

    /** @inheritdoc */
    public OnToolCall(handler: (call: RealtimeToolCall) => void): void {
        this.toolCallHandler = handler;
    }

    /** @inheritdoc */
    public OnInterruption(handler: () => void): void {
        this.interruptionHandler = handler;
    }

    /** @inheritdoc */
    public OnUsage(handler: (u: RealtimeUsage) => void): void {
        this.usageHandler = handler;
    }

    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this.errorHandler = handler;
    }

    /**
     * Surfaces a websocket-level failure as a FATAL session error — the transport is gone,
     * so the consumer (e.g. the session runner) should finalize cleanly instead of idling.
     */
    public HandleTransportError(message: string): void {
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * Surfaces an UNEXPECTED socket close as a fatal error (expected closes — the consumer
     * called {@link Close} — are silent). Gemini hard-closes at token expiry, so this is
     * also how credential death reaches the consumer.
     */
    public HandleTransportClose(code?: number, reason?: string): void {
        if (this.closedByConsumer) {
            return;
        }
        const detail = [code != null ? `code ${code}` : null, reason || null].filter(Boolean).join(' — ');
        this.errorHandler?.({ Message: `Gemini Live session closed unexpectedly${detail ? ` (${detail})` : ''}`, Fatal: true });
    }

    /**
     * @inheritdoc
     *
     * Completes the tool-call loop for Gemini. Gemini's `sendToolResponse` requires the function
     * *name*, which the Core contract does not pass — so the name is looked up from the
     * {@link pendingToolCallNames} cache populated when the originating tool call arrived. The
     * `output` JSON string is parsed into the structured response object Gemini expects, and the
     * cache entry is cleared once the response is sent.
     *
     * @param callID The originating tool call's id.
     * @param output The tool's result as a JSON-stringified string.
     */
    public async SendToolResult(callID: string, output: string): Promise<void> {
        const name = this.pendingToolCallNames.get(callID) ?? '';
        const functionResponse: FunctionResponse = {
            id: callID,
            name,
            response: this.parseToolOutput(output),
        };
        this.requireLive().sendToolResponse({ functionResponses: [functionResponse] });
        this.pendingToolCallNames.delete(callID);
    }

    /**
     * Parses a JSON-stringified tool result into the structured object Gemini's function-response
     * slot expects. Falls back to wrapping non-JSON output as `{ result: <text> }` so a free-text
     * result still round-trips without throwing.
     *
     * @param output The tool's result as a JSON-stringified string.
     * @returns The parsed response object.
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

    /**
     * @inheritdoc
     *
     * Injects background context as a **user turn with `turnComplete: false`** — appended to the
     * conversation WITHOUT starting generation, so the model draws on it the next time it speaks.
     * Gemini Live turns have no system role, so the user role carries it (the same mapping the
     * client-direct Gemini driver uses; the caller owns any prefixing policy).
     *
     * **Collision behavior: queue.** Any client content sent mid-turn interrupts in-flight
     * generation on Gemini Live, so the send is deferred until the active turn completes.
     *
     * @param text The context note to append to the conversation.
     */
    public SendContextNote(text: string): void {
        this.enqueueOrRun(() => {
            this.requireLive().sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false });
        });
    }

    /**
     * @inheritdoc
     *
     * Triggers ONE short spoken update. Gemini Live has no per-response-instructions slot
     * (OpenAI's `response.create.instructions`), so this is **emulated**: the instructions ride
     * as a realtime-text user turn (`sendRealtimeInput({ text })`) — the path that triggers
     * generation on every Live model generation, exactly as the client-direct Gemini driver
     * emulates it. (A mid-call `sendClientContent` with `turnComplete: true` lands in history
     * WITHOUT starting generation on native-audio models — the model would stay silent until
     * the user next speaks.)
     *
     * **Collision behavior: queue.** Deferred behind any in-flight turn (sending it mid-turn would
     * interrupt the pending reply); when it does send, the turn it triggers is marked active so
     * later queued sends wait for its completion.
     *
     * @param instructions Instructions for the single spoken update.
     */
    public RequestSpokenUpdate(instructions: string): void {
        this.enqueueOrRun(() => {
            this.responseActive = true;
            const live = this.requireLive();
            if (this.meetingMode) {
                // MEETING mode: the agent has been heard accumulating audio inside the open activity window
                // (no auto-response). Commit the turn with `activityEnd` to elicit exactly ONE response — the
                // bridge is the sole trigger. Any instructions ride as a realtime-text nudge first so the
                // model has the "respond now" framing, then the window is closed (reopened on next audio).
                if (instructions && instructions.trim().length > 0) {
                    live.sendRealtimeInput({ text: instructions });
                }
                live.sendRealtimeInput({ activityEnd: {} });
                this.manualActivityOpen = false;
                return;
            }
            live.sendRealtimeInput({ text: instructions });
        });
    }

    /**
     * Runs a client-content send immediately when no turn is in flight; otherwise queues it for
     * the next turn boundary. Gemini-specific collision rule: ANY client content interrupts
     * in-flight generation on the Live API, so deferral (not skipping) is the safe default.
     */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /**
     * Turn boundary (`turnComplete` or `interrupted`): releases the busy flag and drains queued
     * sends in order, stopping at the first send that itself starts a new turn (a queued
     * {@link RequestSpokenUpdate} re-sets {@link responseActive}).
     */
    private completeTurn(): void {
        this.responseActive = false;
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /** @inheritdoc */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        this.live?.close();
        this.live = null;
        this.clearHandlers();
    }

    /**
     * Entry point for an inbound {@link LiveServerMessage}. Fans the message out to the focused
     * per-concern handlers so each translation unit stays small and testable.
     */
    public HandleServerMessage(message: LiveServerMessage): void {
        if (message.serverContent) {
            this.handleServerContent(message.serverContent);
        }
        if (message.toolCall) {
            this.handleToolCall(message.toolCall.functionCalls);
        }
        if (message.usageMetadata) {
            this.handleUsage(message.usageMetadata.promptTokenCount, message.usageMetadata.responseTokenCount);
        }
    }

    /**
     * Translates a {@link LiveServerContent} frame: model audio output, input/output transcription,
     * and interruption.
     */
    private handleServerContent(content: LiveServerContent): void {
        if (content.interrupted) {
            this.interruptionHandler?.();
            this.completeTurn();
        }
        if (content.modelTurn) {
            // First model output of a turn marks generation in flight (Gemini emits no explicit
            // "response started" frame), so interim-update sends defer instead of interrupting.
            this.responseActive = true;
            this.emitAudioOutput(content.modelTurn);
        }
        if (content.turnComplete) {
            this.completeTurn();
        }
        if (content.inputTranscription) {
            this.emitTranscript('user', content.inputTranscription.text, content.inputTranscription.finished);
        }
        if (content.outputTranscription) {
            this.emitTranscript('assistant', content.outputTranscription.text, content.outputTranscription.finished);
        }
    }

    /**
     * Extracts inline audio parts from the model turn and forwards each as a raw `ArrayBuffer`.
     */
    private emitAudioOutput(modelTurn: Content): void {
        if (!this.outputHandler || !modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            const data = part.inlineData?.data;
            if (data) {
                this.outputHandler(GeminiRealtimeSession.Base64ToArrayBuffer(data));
            }
        }
    }

    /**
     * Emits a transcript event, defaulting missing text to empty and `finished` to a partial update.
     */
    private emitTranscript(role: 'user' | 'assistant', text: string | undefined, finished: boolean | undefined): void {
        if (!this.transcriptHandler) {
            return;
        }
        this.transcriptHandler({ Role: role, Text: text ?? '', IsFinal: finished ?? false });
    }

    /**
     * Translates Gemini {@link FunctionCall}s into Core {@link RealtimeToolCall}s, serializing the
     * arguments object to the JSON-string form the contract specifies.
     */
    private handleToolCall(functionCalls: FunctionCall[] | undefined): void {
        if (!functionCalls) {
            return;
        }
        // The model has yielded the floor pending the tool result — clear the busy flag (without
        // draining the queue; queued sends flush at the next real turn boundary) so the eventual
        // SendToolResult and any fresh context note are not deferred behind a turn that will not
        // complete until after the result is sent. Mirrors the client driver's deadlock guard.
        this.responseActive = false;
        for (const call of functionCalls) {
            const callID = call.id ?? '';
            const toolName = call.name ?? '';
            // Cache the call's name (regardless of whether a tool-call handler is registered) so
            // SendToolResult can supply it to Gemini's sendToolResponse, which requires the function
            // name the Core contract does not carry.
            this.pendingToolCallNames.set(callID, toolName);
            this.toolCallHandler?.({
                CallID: callID,
                ToolName: toolName,
                Arguments: JSON.stringify(call.args ?? {}),
            });
        }
    }

    /**
     * Emits an incremental usage update, defaulting missing token counts to zero.
     */
    private handleUsage(promptTokens: number | undefined, responseTokens: number | undefined): void {
        this.usageHandler?.({ InputTokens: promptTokens ?? 0, OutputTokens: responseTokens ?? 0 });
    }

    /** Drops all registered handlers so a closed session can't fire stale callbacks. */
    private clearHandlers(): void {
        this.outputHandler = null;
        this.transcriptHandler = null;
        this.toolCallHandler = null;
        this.interruptionHandler = null;
        this.usageHandler = null;
        this.pendingToolCallNames.clear();
        this.queuedSends = [];
        this.responseActive = false;
    }

    /** Returns the bound live session or throws if it was never attached / already closed. */
    private requireLive(): GeminiLiveSession {
        if (!this.live) {
            throw new Error('Gemini realtime session is not open (no live session attached or it was closed).');
        }
        return this.live;
    }

    /** Encodes an `ArrayBuffer` of raw bytes to a base64 string for Gemini's `Blob.data`. */
    private static ArrayBufferToBase64(buffer: ArrayBuffer): string {
        return Buffer.from(new Uint8Array(buffer)).toString('base64');
    }

    /** Decodes a base64 `Blob.data` string from Gemini into a raw `ArrayBuffer`. */
    private static Base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        // Copy into a freshly-allocated ArrayBuffer so we never leak the surrounding Node pool buffer
        // (and so the result is a plain ArrayBuffer, not ArrayBufferLike).
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}
