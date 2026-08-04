// ElevenLabs Agents Platform — realtime (voice) driver.
import { ElevenLabs, ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

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
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * Lifetime of an ElevenLabs signed websocket URL: the browser (or server bridge) must OPEN the
 * conversation within ~15 minutes of minting; an already-open conversation continues past it.
 */
const ELEVENLABS_SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/**
 * Prefix of native ElevenLabs agent ids (e.g. `agent_3701k3ttaq12ewp8b7qv5rfyszkz`). When
 * `RealtimeSessionParams.Model` carries this prefix the driver treats it as a VERBATIM agent id
 * (a deployment-managed agent); otherwise it is the NAME of the driver-managed agent to ensure.
 */
const ELEVENLABS_AGENT_ID_PREFIX = 'agent_';

/**
 * Placeholder prompt stored on the MANAGED agent's server-side configuration. The real
 * per-session system prompt is supplied at conversation start via
 * `conversation_initiation_client_data.conversation_config_override.agent.prompt.prompt`,
 * which the managed agent's platform settings explicitly enable.
 */
const MANAGED_AGENT_BASE_PROMPT =
    'You are a MemberJunction realtime co-agent. The effective system prompt for each session is ' +
    'supplied at conversation start via the prompt override; this base prompt is a placeholder.';

// ── Tool-parameter schema sanitization (ElevenLabs client-tool validator quirks) ──

/**
 * JSON-schema keywords whose values are DATA, not subschemas — the sanitizer's walker must not
 * descend into them (an enum/default/example value that happens to look like a schema is data).
 */
const NON_SUBSCHEMA_KEYWORDS = new Set(['enum', 'const', 'default', 'examples', 'description', 'title', 'required']);

/**
 * Pure sanitizer for tool-parameter JSON schemas bound for the ElevenLabs Agents Platform.
 *
 * ElevenLabs validates client-tool `parameters` schemas STRICTLY and its schema model only
 * allows `enum` on **string-typed** properties — a numeric enum such as
 * `{ type: 'number', enum: [12, 14, 18, 24, 32] }` is rejected at agents.create/update with
 * "Expected string. Received 12.". This provider quirk is handled here in the driver (never in
 * the tool definitions): the schema is deep-cloned and walked (nested objects, array `items`,
 * composition keywords — anything subschema-shaped); any NON-string node carrying `enum` has
 * the enum REMOVED and its allowed values appended to the node's `description`
 * (`"Allowed values: 12, 14, 18, 24, 32."`) so the model still sees the constraint. String
 * enums and everything else pass through unchanged.
 *
 * Pure and idempotent: the input is never mutated, and re-sanitizing a sanitized schema is a
 * no-op — which is what lets {@link ElevenLabsRealtime.ToolSetFingerprint} hash the sanitized
 * form on both the local and the round-tripped remote side without PATCH loops.
 */
export function SanitizeToolParametersForElevenLabs(schema: JSONObject): JSONObject {
    const clone = JSON.parse(JSON.stringify(schema)) as JSONObject;
    sanitizeSchemaNode(clone);
    return clone;
}

/** Recursive walker behind {@link SanitizeToolParametersForElevenLabs} (mutates the clone). */
function sanitizeSchemaNode(node: JSONValue): void {
    if (node === null || typeof node !== 'object') {
        return;
    }
    if (Array.isArray(node)) {
        for (const item of node) {
            sanitizeSchemaNode(item);
        }
        return;
    }
    const obj = node as JSONObject;
    stripDisallowedEnum(obj);
    ensureLeafDescription(obj);
    for (const [key, value] of Object.entries(obj)) {
        if (!NON_SUBSCHEMA_KEYWORDS.has(key)) {
            sanitizeSchemaNode(value);
        }
    }
}

/**
 * ElevenLabs' schema model requires every VALUE-typed subschema to declare one of
 * `description` / `dynamic_variable` / `is_system_provided` / `constant_value` /
 * `is_omitted` — a bare `{ type: 'string' }` array-items node 422s agents.create with
 * "Must set one of: description, …". Whenever a typed node lacks all of those markers,
 * synthesize a short generic description from its type. Idempotent (only fills gaps).
 */
function ensureLeafDescription(obj: JSONObject): void {
    const type = obj['type'];
    if (typeof type !== 'string') {
        return;
    }
    const hasMarker = ['description', 'dynamic_variable', 'is_system_provided', 'constant_value', 'is_omitted']
        .some((key) => obj[key] !== undefined);
    if (!hasMarker) {
        const article = /^[aeiou]/i.test(type) ? 'An' : 'A';
        obj['description'] = `${article} ${type} value.`;
    }
}

/**
 * If this schema node carries an `enum` ElevenLabs would reject (any non-string type — number,
 * integer, boolean, object, array, or untyped), removes the enum and folds the allowed values
 * into the node's `description`.
 */
function stripDisallowedEnum(obj: JSONObject): void {
    const enumValues = obj['enum'];
    if (!Array.isArray(enumValues) || obj['type'] === 'string') {
        return;
    }
    delete obj['enum'];
    const allowed = `Allowed values: ${enumValues.map((v) => JSON.stringify(v)).join(', ')}.`;
    const existing = obj['description'];
    obj['description'] =
        typeof existing === 'string' && existing.trim().length > 0 ? `${existing.trim()} ${allowed}` : allowed;
}

// ── Wire-event shapes (snake_case, exactly as the Agents websocket emits/accepts) ──
// The websocket protocol is spoken RAW (the SDK's high-level Conversation wrapper owns audio
// devices, which a server bridge must not), so the minimal frame shapes are declared here.

/** A parsed inbound websocket frame. The protocol multiplexes on `type`. */
export interface ElevenLabsServerEvent {
    type?: string;
    conversation_initiation_metadata_event?: {
        conversation_id?: string;
        agent_output_audio_format?: string;
        user_input_audio_format?: string;
    };
    audio_event?: { audio_base_64?: string; event_id?: number };
    user_transcription_event?: { user_transcript?: string };
    agent_response_event?: { agent_response?: string };
    agent_response_correction_event?: { original_agent_response?: string; corrected_agent_response?: string };
    client_tool_call?: { tool_name?: string; tool_call_id?: string; parameters?: JSONObject };
    interruption_event?: { event_id?: number };
    ping_event?: { event_id?: number; ping_ms?: number };
    vad_score_event?: { vad_score?: number };
}

// ── Transport / REST seams (typed subsets — fakes in tests, SDK / raw WS in prod) ──

/**
 * The minimal outbound surface of the conversation websocket the session depends on. Declaring
 * the seam as an interface lets unit tests inject a fully in-memory fake that captures outbound
 * frames and drives {@link ElevenLabsRealtimeSession.HandleServerEvent} with ElevenLabs-shaped
 * events — no websocket, no network.
 */
export interface ElevenLabsRealtimeSocket {
    /** Sends one JSON-serialized client frame. */
    send(data: string): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Arguments handed to {@link ElevenLabsRealtime.connectConversation}: the signed URL plus the
 * lifecycle callbacks, so the seam owns the entire websocket dance and tests substitute it
 * wholesale.
 */
export interface ElevenLabsConnectArgs {
    /** The signed `wss://…&token=…` URL minted for the agent. */
    SignedUrl: string;
    /** Invoked with each parsed inbound frame. */
    OnMessage: (event: ElevenLabsServerEvent) => void;
    /** Invoked on a websocket-level error (fatal — the session is unusable). */
    OnError: (message: string) => void;
    /** Invoked when the websocket closes. */
    OnClose: (code?: number, reason?: string) => void;
}

/**
 * Structural subset of the global `WebSocket` constructor used by the production
 * {@link ElevenLabsRealtime.connectConversation} seam (global in browsers and Node 22+;
 * typed structurally so the package compiles without DOM lib types).
 */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null;
    send(data: string): void;
    close(): void;
}

/**
 * Real-time, full-duplex driver for the **ElevenLabs Agents Platform**, implementing the Core
 * {@link BaseRealtimeModel} primitive. Registers as `ElevenLabsRealtime` and is resolved for
 * `MJ: AI Models` typed `Realtime` (API-key env alias: `AI_VENDOR_API_KEY__ElevenLabsRealtime`).
 *
 * **Why an "agent", not a model:** ElevenLabs realtime is an orchestrated STT→LLM→TTS stack
 * exposed only through pre-configured server-side *agents* — there is no bare-model realtime
 * socket. The driver hides that behind the standard realtime contract with a **managed-agent
 * strategy** ({@link ensureAgent}):
 * - `params.Model` starting with `agent_` → used VERBATIM as a deployment-managed agent id.
 * - any other value → the NAME of the driver-managed agent: find-by-name; create-if-missing
 *   (with the session's client-tool set and the prompt-override enablement that lets each
 *   session supply its own system prompt); PATCH when the order-insensitive tool fingerprint
 *   differs or the prompt override is not enabled. Results are instance-cached per name+tools.
 *
 * **Per-session prompt authority** stays with MJ: the managed agent stores only a placeholder
 * prompt and explicitly enables `conversation_config_override.agent.prompt.prompt`; every
 * session (server-bridged or client-direct) sends the real system prompt in its
 * `conversation_initiation_client_data` frame.
 *
 * **Topologies:**
 * - Server-bridged ({@link StartSession}): the driver opens the conversation websocket itself
 *   (raw protocol behind the {@link connectConversation} seam) and returns an
 *   {@link ElevenLabsRealtimeSession}.
 * - Client-direct ({@link CreateClientSession}): the signed websocket URL IS the ephemeral
 *   credential — the browser opens its own socket with it (no API key ever leaves the server).
 *
 * **No usage events:** the Agents websocket reports no token usage; sessions never emit
 * {@link IRealtimeSession.OnUsage}. Usage accounting for ElevenLabs realtime lives in the
 * platform's own conversation dashboard / billing exports.
 */
@RegisterClass(BaseRealtimeModel, 'ElevenLabsRealtime')
export class ElevenLabsRealtime extends BaseRealtimeModel {
    private elevenClient: ElevenLabsClient | null = null;

    /**
     * Managed-agent ensure cache: managed agent NAME → the resolved agent id + the tool-set
     * fingerprint it was last ensured with. A cache hit with an identical fingerprint skips
     * the REST round-trips entirely; a different fingerprint re-runs the ensure flow.
     */
    private agentCache = new Map<string, { agentId: string; fingerprint: string }>();

    constructor(apiKey: string) {
        super(apiKey);
        // Client is created lazily so subclasses (and tests overriding the REST seams) never
        // trigger an unused SDK client construction.
    }

    /**
     * Opens a server-bridged conversation: ensures the agent, mints a signed URL, opens the
     * websocket (via the {@link connectConversation} seam), sends the
     * `conversation_initiation_client_data` frame carrying the per-session system prompt, and
     * resolves only once the server's `conversation_initiation_metadata` confirms the session
     * config is applied (driver obligation #7 — "ready only after the config is applied").
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const agentId = await this.ensureAgent(params);
        const signedUrl = await this.mintSignedUrl(agentId);
        const session = new ElevenLabsRealtimeSession();
        session.SetConnectTimeTools(params.Tools ?? []);
        const socket = await this.connectConversation({
            SignedUrl: signedUrl,
            OnMessage: (event) => session.HandleServerEvent(event),
            OnError: (message) => session.HandleTransportError(message),
            OnClose: (code, reason) => session.HandleTransportClose(code, reason),
        });
        session.AttachSocket(socket);
        session.SendInitiation(params.SystemPrompt, params.InitialContext);
        await session.WaitForMetadata();
        return session;
    }

    /**
     * ElevenLabs supports the client-direct topology natively: the signed websocket URL is a
     * short-lived, agent-scoped credential the browser can open directly.
     */
    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /**
     * Mints the client-direct config: ensures the managed agent, fetches a signed URL
     * (the ephemeral credential — connect window ≈ {@link ELEVENLABS_SIGNED_URL_TTL_MS}),
     * and packs the **private pact** `SessionConfig` the same-keyed `'elevenlabs'` client
     * driver consumes: `{ agentId, overrides, config }`, where `overrides` is the wire-shaped
     * `conversation_config_override` carrying the server-authored system prompt and `config`
     * passes `params.Config` through opaquely.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const agentId = await this.ensureAgent(params);
        const signedUrl = await this.mintSignedUrl(agentId);
        return {
            Provider: 'elevenlabs',
            Model: params.Model,
            EphemeralToken: signedUrl,
            ExpiresAt: new Date(Date.now() + ELEVENLABS_SIGNED_URL_TTL_MS).toISOString(),
            SessionConfig: {
                agentId,
                overrides: { agent: { prompt: { prompt: params.SystemPrompt } } },
                config: params.Config ?? {},
            },
        };
    }

    // ── Managed-agent strategy ─────────────────────────────────────────────────

    /**
     * Resolves `params.Model` to a concrete ElevenLabs agent id.
     *
     * - A verbatim agent id (`agent_…`) is returned as-is — the deployment owns that agent's
     *   configuration (including its tool set and override enablement).
     * - Anything else is the MANAGED agent name: find-by-name → create-if-missing → PATCH when
     *   the order-insensitive client-tool fingerprint differs or the per-session prompt
     *   override is not enabled. The resolution is instance-cached per name + fingerprint.
     */
    protected async ensureAgent(params: RealtimeSessionParams): Promise<string> {
        const model = params.Model;
        if (model.startsWith(ELEVENLABS_AGENT_ID_PREFIX)) {
            return model;
        }
        const tools = params.Tools ?? [];
        const fingerprint = ElevenLabsRealtime.ToolSetFingerprint(tools);
        const cached = this.agentCache.get(model);
        if (cached && cached.fingerprint === fingerprint) {
            return cached.agentId;
        }
        const agentId = await this.findCreateOrUpdateAgent(model, tools, fingerprint, params.Config);
        this.agentCache.set(model, { agentId, fingerprint });
        return agentId;
    }

    /** The uncached ensure flow: list-by-name, then create or (when drifted) update. */
    private async findCreateOrUpdateAgent(
        name: string,
        tools: RealtimeToolDefinition[],
        fingerprint: string,
        config?: JSONObject
    ): Promise<string> {
        const summaries = await this.listAgents(name);
        const existing = summaries.find((a) => a.name === name);
        if (!existing) {
            return this.createAgent(this.buildAgentBody(name, tools, config));
        }
        const detail = await this.getAgent(existing.agentId);
        const remoteFingerprint = ElevenLabsRealtime.ToolSetFingerprint(
            ElevenLabsRealtime.ExtractClientTools(detail)
        );
        if (remoteFingerprint !== fingerprint || !ElevenLabsRealtime.PromptOverrideEnabled(detail)) {
            await this.updateAgent(existing.agentId, this.buildAgentBody(name, tools, config));
        }
        return existing.agentId;
    }

    /**
     * Builds the create/update body for the managed agent: the placeholder base prompt, the
     * session tool set mapped to inline CLIENT tools (`expects_response: true` so the agent
     * blocks on — and then speaks — each result; max response timeout because MJ client tools
     * delegate to long-running agents), and the platform-settings enablement of the
     * per-session `agent.prompt.prompt` override.
     *
     * `params.Config.llm` (when a string) selects the agent's underlying LLM; all other
     * provider-level agent settings are deployment concerns (use a verbatim agent id for full
     * control).
     */
    protected buildAgentBody(
        name: string,
        tools: RealtimeToolDefinition[],
        config?: JSONObject
    ): ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost {
        const prompt: ElevenLabs.PromptAgentApiModelOutput = {
            prompt: MANAGED_AGENT_BASE_PROMPT,
            tools: tools.map((tool) => ElevenLabsRealtime.MapToolToClientTool(tool)),
        };
        const llm = config?.['llm'];
        if (typeof llm === 'string') {
            prompt.llm = llm as ElevenLabs.Llm;
        }
        return {
            name,
            conversationConfig: { agent: { prompt } },
            platformSettings: {
                overrides: {
                    conversationConfigOverride: { agent: { prompt: { prompt: true } } },
                },
            },
        };
    }

    /** Maps a Core tool definition up to an ElevenLabs inline CLIENT tool config. */
    public static MapToolToClientTool(tool: RealtimeToolDefinition): ElevenLabs.PromptAgentApiModelOutputToolsItem.Client {
        return {
            type: 'client',
            name: tool.Name,
            description: tool.Description,
            // The Core ParametersSchema is a JSON-schema object in the same SHAPE ElevenLabs'
            // client-tool `parameters` slot accepts — but their validator is STRICTER than
            // JSON Schema (e.g. enum is string-only), so the schema is SANITIZED first.
            // Provider quirk, handled in this driver only — other providers get the
            // original richer schemas.
            parameters: SanitizeToolParametersForElevenLabs(tool.ParametersSchema) as ElevenLabs.ObjectJsonSchemaPropertyOutput,
            expectsResponse: true,
            responseTimeoutSecs: 120,
        };
    }

    /**
     * Extracts the CLIENT tools from a fetched agent as Core tool definitions, for fingerprint
     * comparison against the requested set. Non-client tools (webhook/system/mcp) are ignored —
     * they are deployment-side additions the managed flow must not fight over.
     */
    public static ExtractClientTools(agent: ElevenLabs.GetAgentResponseModel): RealtimeToolDefinition[] {
        const tools = agent.conversationConfig?.agent?.prompt?.tools ?? [];
        const clientTools: RealtimeToolDefinition[] = [];
        for (const tool of tools) {
            if (tool.type === 'client') {
                clientTools.push({
                    Name: tool.name,
                    Description: tool.description,
                    ParametersSchema: (tool.parameters ?? {}) as JSONObject,
                });
            }
        }
        return clientTools;
    }

    /** Whether the agent's platform settings enable the per-session system-prompt override. */
    public static PromptOverrideEnabled(agent: ElevenLabs.GetAgentResponseModel): boolean {
        return agent.platformSettings?.overrides?.conversationConfigOverride?.agent?.prompt?.prompt === true;
    }

    /**
     * Canonical, order-insensitive fingerprint of a tool set (same scheme as the Gemini
     * realtime driver). A schema round-trip through ElevenLabs that fails exact equality
     * merely triggers a harmless idempotent PATCH.
     */
    public static ToolSetFingerprint(tools: RealtimeToolDefinition[]): string {
        return JSON.stringify(
            [...tools]
                .sort((a, b) => a.Name.localeCompare(b.Name))
                // Hash the SANITIZED schema: the remote agent stores the sanitized form, so
                // fingerprinting the raw form would see permanent drift and PATCH-loop.
                .map((t) => ({ Name: t.Name, Description: t.Description, ParametersSchema: SanitizeToolParametersForElevenLabs(t.ParametersSchema) }))
        );
    }

    // ── Overridable REST / transport seams (tests inject fakes — no network) ──

    /** REST seam: lists agents matching a name search. */
    protected async listAgents(search: string): Promise<ElevenLabs.AgentSummaryResponseModel[]> {
        const page = await this.ensureClient().conversationalAi.agents.list({ search, pageSize: 100 });
        return page.agents;
    }

    /** REST seam: fetches an agent's full configuration. */
    protected async getAgent(agentId: string): Promise<ElevenLabs.GetAgentResponseModel> {
        return this.ensureClient().conversationalAi.agents.get(agentId);
    }

    /** REST seam: creates an agent, returning its id. */
    protected async createAgent(body: ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost): Promise<string> {
        const created = await this.ensureClient().conversationalAi.agents.create(body);
        return created.agentId;
    }

    /** REST seam: PATCHes an agent's configuration. */
    protected async updateAgent(agentId: string, body: ElevenLabs.conversationalAi.UpdateAgentRequest): Promise<void> {
        await this.ensureClient().conversationalAi.agents.update(agentId, body);
    }

    /**
     * REST seam: mints the signed websocket URL for an agent
     * (`GET /v1/convai/conversation/get-signed-url?agent_id=…` with the `xi-api-key` header —
     * the SDK call below is that exact request).
     */
    protected async mintSignedUrl(agentId: string): Promise<string> {
        const response = await this.ensureClient().conversationalAi.conversations.getSignedUrl({ agentId });
        return response.signedUrl;
    }

    /**
     * Transport seam for the server-bridged conversation websocket. Production speaks the RAW
     * Agents protocol over the platform-global `WebSocket` (browsers / Node 22+) — the SDK's
     * high-level `Conversation` wrapper owns audio devices, which a server bridge must not.
     * Resolves once the socket is OPEN; unit tests override this to return an in-memory fake.
     */
    protected async connectConversation(args: ElevenLabsConnectArgs): Promise<ElevenLabsRealtimeSocket> {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error(
                'ElevenLabsRealtime.StartSession requires a global WebSocket (Node 22+ or a browser runtime).'
            );
        }
        return new Promise<ElevenLabsRealtimeSocket>((resolve, reject) => {
            const ws = new WS(args.SignedUrl);
            let opened = false;
            ws.onopen = () => {
                opened = true;
                resolve({ send: (data) => ws.send(data), close: () => ws.close() });
            };
            ws.onmessage = (event) => {
                try {
                    args.OnMessage(JSON.parse(String(event.data)) as ElevenLabsServerEvent);
                } catch {
                    /* non-JSON frame — ignore */
                }
            };
            ws.onerror = () => {
                args.OnError('ElevenLabs conversation websocket error');
                if (!opened) {
                    reject(new Error('ElevenLabs conversation websocket failed to open'));
                }
            };
            ws.onclose = (event) => {
                args.OnClose(event.code, event.reason);
                if (!opened) {
                    reject(new Error('ElevenLabs conversation websocket closed before opening'));
                }
            };
        });
    }

    /** Lazily constructs the `ElevenLabsClient` from the driver's API key. */
    private ensureClient(): ElevenLabsClient {
        if (!this.elevenClient) {
            this.elevenClient = new ElevenLabsClient({ apiKey: this.apiKey });
        }
        return this.elevenClient;
    }
}

/**
 * Concrete {@link IRealtimeSession} backed by a raw ElevenLabs Agents conversation websocket.
 *
 * Owns the inbound translation (snake_case wire events → Core events) and the outbound
 * translation (Core calls → wire frames). Created by {@link ElevenLabsRealtime.StartSession};
 * never instantiated directly by consumers.
 *
 * Provider-behavior notes (the contract deltas a consumer should know):
 * - **Transcripts are FINAL-only.** The Agents websocket emits whole-utterance
 *   `user_transcript` / `agent_response` events — there are no interim deltas, so every
 *   {@link RealtimeTranscript} this session emits has `IsFinal: true`.
 * - **`agent_response_correction` re-finalizes a truncated turn.** After a barge-in the
 *   platform sends the corrected (actually-spoken) agent text; the session emits it as a
 *   fresh FINAL assistant transcript — consumers persisting transcripts should treat a final
 *   assistant transcript arriving immediately after an interruption as the authoritative
 *   replacement for the previous one.
 * - **No usage events** — see the driver-level note.
 * - **{@link RequestSpokenUpdate} is emulated** with a `user_message` turn (ElevenLabs has no
 *   per-response-instructions channel), queued behind any in-flight response. Fidelity caveat:
 *   the instruction enters the conversation as a user turn, so the agent may occasionally
 *   reference it ("you asked me to give an update") — hosts should phrase instructions
 *   accordingly. {@link SendContextNote} is NATIVE (`contextual_update`) and never interrupts.
 */
export class ElevenLabsRealtimeSession implements IRealtimeSession {
    private socket: ElevenLabsRealtimeSocket | null = null;

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private errorHandler: ((error: RealtimeSessionError) => void) | null = null;
    /** True once Close() ran — an expected close must not surface as a fatal error. */
    private closedByConsumer = false;

    /** Resolves when `conversation_initiation_metadata` arrives; rejects on transport death. */
    private metadataPromise: Promise<void>;
    private resolveMetadata: (() => void) | null = null;
    private rejectMetadata: ((error: Error) => void) | null = null;
    private metadataReceived = false;

    /** Initial context to inject (as a contextual update) once the metadata confirms the session. */
    private pendingInitialContext: string | null = null;

    /**
     * Whether an agent response is currently in flight (first `audio` / `agent_response` of a
     * turn sets it; `agent_response_complete`, `interruption`, and a `client_tool_call` clear
     * it). Consumed by {@link enqueueOrRun} so the emulated {@link RequestSpokenUpdate} never
     * injects a user turn into — and thereby barges in on — an active response.
     */
    private responseActive = false;

    /** Sends deferred while a response is in flight; drained in order at the next boundary. */
    private queuedSends: Array<() => void> = [];

    /**
     * Fingerprint of the tool set bound at connect time (the managed agent's client tools);
     * {@link RegisterTools} compares against it to no-op identical re-registrations.
     */
    private connectTimeToolsFingerprint = ElevenLabsRealtime.ToolSetFingerprint([]);

    constructor() {
        this.metadataPromise = new Promise<void>((resolve, reject) => {
            this.resolveMetadata = resolve;
            this.rejectMetadata = reject;
        });
        // The promise is always consumed by WaitForMetadata before any rejection can fire
        // (StartSession awaits it immediately), but guard against unhandled-rejection noise
        // if a transport error lands between construction and the await.
        this.metadataPromise.catch(() => undefined);
    }

    /** Binds the underlying socket. Called by the driver once the websocket is open. */
    public AttachSocket(socket: ElevenLabsRealtimeSocket): void {
        this.socket = socket;
    }

    /**
     * Sends the `conversation_initiation_client_data` frame carrying the per-session system
     * prompt as the `agent.prompt.prompt` override (which the managed agent's platform
     * settings enable). `initialContext`, when provided, is held back and injected as a
     * native `contextual_update` once the metadata confirms the session — ElevenLabs has no
     * pre-turn history-seeding channel, so prior context rides the contextual-update lane.
     */
    public SendInitiation(systemPrompt: string, initialContext?: string): void {
        this.pendingInitialContext = initialContext && initialContext.trim().length > 0 ? initialContext : null;
        this.sendFrame({
            type: 'conversation_initiation_client_data',
            conversation_config_override: { agent: { prompt: { prompt: systemPrompt } } },
        });
    }

    /**
     * Resolves once the server's `conversation_initiation_metadata` arrives (the provider's
     * confirmation that the session — including the prompt override — is applied); rejects if
     * the transport dies first. Awaited by {@link ElevenLabsRealtime.StartSession} so the
     * session is never handed to a consumer before it is actually configured.
     */
    public WaitForMetadata(): Promise<void> {
        return this.metadataPromise;
    }

    /** @inheritdoc — streams one PCM16 mic frame as a base64 `user_audio_chunk`. */
    public SendInput(chunk: ArrayBuffer): void {
        this.sendFrame({ user_audio_chunk: Buffer.from(new Uint8Array(chunk)).toString('base64') });
    }

    /**
     * @inheritdoc
     *
     * ElevenLabs binds the tool set on the server-side AGENT configuration (the driver's
     * managed-agent ensure flow), not on the open conversation. Per the contract's idempotency
     * rule: an identical post-start set is a silent no-op; a different set is unsupported on an
     * open conversation — it logs a clear warning and does nothing (the NEXT session picks the
     * new set up via the ensure flow's fingerprint check).
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        if (ElevenLabsRealtime.ToolSetFingerprint(tools) === this.connectTimeToolsFingerprint) {
            return; // identical to the connect-time set — silent no-op
        }
        console.warn(
            'ElevenLabsRealtimeSession.RegisterTools: ElevenLabs binds the tool set on the server-side agent ' +
            'configuration and cannot re-declare it on an open conversation. The requested set differs from the ' +
            'connect-time set and is IGNORED for this session — the next StartSession/CreateClientSession ' +
            're-ensures the agent with the new set.'
        );
    }

    /** Records the tool set bound at connect time. Called by {@link ElevenLabsRealtime.StartSession}. */
    public SetConnectTimeTools(tools: RealtimeToolDefinition[]): void {
        this.connectTimeToolsFingerprint = ElevenLabsRealtime.ToolSetFingerprint(tools);
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

    /**
     * @inheritdoc
     *
     * Never fires: the Agents websocket reports no token usage (see the class-level note).
     */
    public OnUsage(_handler: (u: RealtimeUsage) => void): void {
        // intentionally unbound — no usage events exist on this provider surface
    }

    /** @inheritdoc */
    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this.errorHandler = handler;
    }

    /**
     * Surfaces a websocket-level failure as a FATAL session error — the transport is gone,
     * so the consumer should finalize cleanly instead of idling (driver obligation #6).
     */
    public HandleTransportError(message: string): void {
        this.failMetadataWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * Surfaces an UNEXPECTED socket close as a fatal error (expected closes — the consumer
     * called {@link Close} — are silent). ElevenLabs hard-closes at signed-URL expiry and when
     * the agent itself ends the conversation, so this is also how credential / conversation
     * death reaches the consumer.
     */
    public HandleTransportClose(code?: number, reason?: string): void {
        if (this.closedByConsumer) {
            return;
        }
        const detail = [code != null ? `code ${code}` : null, reason || null].filter(Boolean).join(' — ');
        const message = `ElevenLabs conversation closed unexpectedly${detail ? ` (${detail})` : ''}`;
        this.failMetadataWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * @inheritdoc
     *
     * Sends `client_tool_result` correlated by `tool_call_id`. Sent IMMEDIATELY (never queued):
     * the platform requested the result (`expects_response: true` blocks the conversation on
     * it) and handles its own continuation, so deferring it could only delay the spoken reply.
     * The result string is parsed to ride as structured JSON when possible; free-text results
     * pass through as-is.
     */
    public async SendToolResult(callID: string, output: string): Promise<void> {
        this.sendFrame({
            type: 'client_tool_result',
            tool_call_id: callID,
            result: ElevenLabsRealtimeSession.ParseToolOutput(output),
            is_error: false,
        });
    }

    /**
     * @inheritdoc
     *
     * NATIVE on this provider: `contextual_update` is ElevenLabs' purpose-built
     * non-interrupting context channel — sent immediately regardless of an in-flight response
     * (the platform guarantees it never triggers or disturbs generation).
     */
    public SendContextNote(text: string): void {
        this.sendFrame({ type: 'contextual_update', text });
    }

    /**
     * @inheritdoc
     *
     * EMULATED via a `user_message` turn (see the class-level fidelity caveat).
     * **Collision behavior: queue.** A `user_message` sent mid-response would barge in on the
     * in-flight reply (the platform treats it as the user taking the floor), so the send is
     * deferred until the active response completes.
     */
    public RequestSpokenUpdate(instructions: string): void {
        this.enqueueOrRun(() => {
            this.responseActive = true; // the emulated turn triggers a response of its own
            this.sendFrame({ type: 'user_message', text: instructions });
        });
    }

    /** @inheritdoc */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        this.failMetadataWait('session closed by consumer before initiation completed');
        this.socket?.close();
        this.socket = null;
        this.clearHandlers();
    }

    /**
     * Entry point for an inbound websocket frame. Multiplexes on `type` to focused
     * per-concern handlers so each translation unit stays small and testable.
     */
    public HandleServerEvent(event: ElevenLabsServerEvent): void {
        switch (event.type) {
            case 'conversation_initiation_metadata':
                this.handleInitiationMetadata();
                break;
            case 'audio':
                this.handleAudio(event.audio_event?.audio_base_64);
                break;
            case 'user_transcript':
                this.emitTranscript('user', event.user_transcription_event?.user_transcript);
                break;
            case 'agent_response':
                this.responseActive = true;
                this.emitTranscript('assistant', event.agent_response_event?.agent_response);
                break;
            case 'agent_response_correction':
                // Post-barge-in truncation: the corrected text is what was ACTUALLY spoken —
                // re-finalize the assistant turn with it (see the class-level note).
                this.emitTranscript('assistant', event.agent_response_correction_event?.corrected_agent_response);
                break;
            case 'agent_response_complete':
                this.completeResponse();
                break;
            case 'client_tool_call':
                this.handleClientToolCall(event.client_tool_call);
                break;
            case 'interruption':
                this.interruptionHandler?.();
                this.completeResponse();
                break;
            case 'ping':
                this.sendFrame({ type: 'pong', event_id: event.ping_event?.event_id ?? 0 });
                break;
            case 'vad_score':
                break; // continuous voice-activity telemetry — deliberately ignored
            case 'guardrail_triggered':
                console.warn('ElevenLabsRealtimeSession: agent guardrail triggered', event);
                break;
            default:
                break; // unknown / future frame types are ignored
        }
    }

    /** Marks the session configured, releases {@link WaitForMetadata}, injects initial context. */
    private handleInitiationMetadata(): void {
        this.metadataReceived = true;
        this.resolveMetadata?.();
        if (this.pendingInitialContext) {
            this.SendContextNote(this.pendingInitialContext);
            this.pendingInitialContext = null;
        }
    }

    /** Decodes one base64 model-audio frame and forwards it as a raw `ArrayBuffer`. */
    private handleAudio(audioBase64: string | undefined): void {
        if (!audioBase64) {
            return;
        }
        this.responseActive = true;
        this.outputHandler?.(ElevenLabsRealtimeSession.Base64ToArrayBuffer(audioBase64));
    }

    /**
     * Surfaces a `client_tool_call` to the consumer. The model has yielded the floor pending
     * the result, so the busy flag is cleared (deadlock guard — driver obligation #2) WITHOUT
     * draining the queue (a queued narration must not inject a user turn between the tool call
     * and its result; it drains at the next real response boundary).
     */
    private handleClientToolCall(call: { tool_name?: string; tool_call_id?: string; parameters?: JSONObject } | undefined): void {
        if (!call) {
            return;
        }
        this.responseActive = false;
        this.toolCallHandler?.({
            CallID: call.tool_call_id ?? '',
            ToolName: call.tool_name ?? '',
            Arguments: JSON.stringify(call.parameters ?? {}),
        });
    }

    /** Response boundary: releases the busy flag and drains queued sends in order. */
    private completeResponse(): void {
        this.responseActive = false;
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /** Emits a FINAL transcript (this provider has no interim deltas — see the class note). */
    private emitTranscript(role: 'user' | 'assistant', text: string | undefined): void {
        if (!this.transcriptHandler || !text || text.trim().length === 0) {
            return;
        }
        this.transcriptHandler({ Role: role, Text: text, IsFinal: true });
    }

    /** Runs a send immediately when idle; otherwise queues it for the next response boundary. */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /** JSON-serializes and sends one client frame (throws if the socket was never attached). */
    private sendFrame(frame: JSONObject): void {
        if (!this.socket) {
            throw new Error('ElevenLabs realtime session is not open (no socket attached or it was closed).');
        }
        this.socket.send(JSON.stringify(frame));
    }

    /** Rejects a still-pending metadata wait (transport death / consumer close during startup). */
    private failMetadataWait(message: string): void {
        if (!this.metadataReceived && this.rejectMetadata) {
            const reject = this.rejectMetadata;
            this.rejectMetadata = null;
            this.resolveMetadata = null;
            this.metadataReceived = true; // nothing further can resolve/reject it
            reject(new Error(message));
        }
    }

    /**
     * Parses a JSON-stringified tool result into a structured value for the `result` slot,
     * falling back to the raw string so a free-text result still round-trips.
     */
    public static ParseToolOutput(output: string): JSONValue {
        try {
            return JSON.parse(output) as JSONValue;
        } catch {
            return output;
        }
    }

    /** Drops all registered handlers so a closed session can't fire stale callbacks. */
    private clearHandlers(): void {
        this.outputHandler = null;
        this.transcriptHandler = null;
        this.toolCallHandler = null;
        this.interruptionHandler = null;
        this.queuedSends = [];
        this.responseActive = false;
    }

    /** Decodes a base64 audio payload into a freshly-allocated `ArrayBuffer`. */
    private static Base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}
