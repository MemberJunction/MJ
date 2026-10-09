// Google Gemini Live API imports
import {
    GoogleGenAI,
    Modality,
    Behavior,
    FunctionResponseScheduling,
    type AuthToken,
    type CreateAuthTokenParameters,
    type LiveServerMessage,
    type LiveServerContent,
    type LiveConnectConfig,
    type ContextWindowCompressionConfig,
    type SpeechConfig,
    type FunctionDeclaration,
    type FunctionCall,
    type FunctionResponse,
    type Content,
    type Blob as GeminiBlob,
    type ActivityStart,
    type ActivityEnd,
    TurnCoverage,
    ThinkingLevel,
} from '@google/genai';

// MemberJunction AI core contract
import {
    BaseRealtimeModel,
    RealtimeDiagLog,
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
    type RealtimeVoiceOption,
    type RealtimeTrackDescriptor,
    type RealtimeUsageModalityDetail,
    REALTIME_SHARED_CONFIG_KEYS,
    ExtractToolSchedulingHint,
    ParseDurationToMs,
    IsPcmAudioMimeType,
    RealtimeSessionResumption,
    type RealtimeInputFrame,
    type RealtimeResumeAttempt,
    type RealtimeAvatarSettings,
    type RealtimeAvatarStatus,
    type RealtimeAvatarUnavailableReason,
    type RealtimeVideoFrame,
} from '@memberjunction/ai';
import {
    ResolveGeminiLiveProfile,
    ResolveGeminiMaxInboundVideoStreams,
    ResolveGeminiThinkingLevel,
    GEMINI_LIVE_FALLBACK_PROFILE,
    type GeminiThinkingLevel,
    type GeminiLiveModelProfile,
    type GeminiLiveEndpoint,
    type GeminiLiveResolvedProfile,
} from './geminiLiveProfiles';
import { GeminiBridgedAvatarOutput } from './geminiBridgedAvatar';
import { ResolveGeminiAvatarVideoBitrateBps } from './geminiAvatarVideoBitrate';
import { RegisterClass } from '@memberjunction/global';

/**
 * MIME type Gemini Live expects for client-streamed audio: 16-bit signed PCM at 16 kHz, mono.
 * Output audio from the model is 24 kHz PCM; the driver passes output frames through untouched as
 * raw `ArrayBuffer` and leaves resampling/playback to the consumer.
 */
const GEMINI_INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';

/** Image types Gemini Live accepts as video input frames. */
const GEMINI_VIDEO_INPUT_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

/** Meeting-mode watchdog: how long to wait for a turn after `activityEnd` before clearing a latched `responseActive` (shorter than the bridge's floor safety timer). */
const GEMINI_MEETING_RESPONSE_WATCHDOG_MS = 5000;

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
        /** One video frame: an encoded image (JPEG or PNG). */
        video?: GeminiBlob;
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

/** The callbacks a {@link GeminiRealtimeSession} hands its connector for one connection. */
type GeminiConnectionCallbacks = Pick<GeminiConnectArgs, 'OnMessage' | 'OnError' | 'OnClose'>;

/** A usage report's per-modality token counts (`promptTokensDetails`, `responseTokensDetails`). */
type GeminiModalityTokenCounts = NonNullable<LiveServerMessage['usageMetadata']>['promptTokensDetails'];

/**
 * The detail field each Gemini usage modality's token count goes into (the browser client keeps the same table); other
 * modalities are not kept.
 */
const GEMINI_MODALITY_TOKEN_FIELDS: Partial<Record<string, 'TextTokens' | 'AudioTokens' | 'ImageTokens' | 'VideoTokens'>> = {
    TEXT: 'TextTokens',
    AUDIO: 'AudioTokens',
    IMAGE: 'ImageTokens',
    VIDEO: 'VideoTokens',
};

/**
 * Opens one Live connection for a session, resuming an earlier one when `handle` is given. Built by
 * {@link GeminiRealtime.StartSession} around {@link GeminiRealtime.connectLiveSession}.
 */
type GeminiSessionConnector = (handle: string | undefined, callbacks: GeminiConnectionCallbacks) => Promise<GeminiLiveSession>;

/** A connection a {@link GeminiRealtimeSession} opened, with the number that marks it as current. */
interface GeminiOpenedConnection {
    Live: GeminiLiveSession;
    ConnectionNumber: number;
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
     * The voices Gemini Live can speak with — used to populate the voice picker.
     * Includes all 30 built-in Gemini voices supported in prebuiltVoiceConfig.
     */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return [
            { ID: 'Puck', Name: 'Puck' },
            { ID: 'Charon', Name: 'Charon' },
            { ID: 'Kore', Name: 'Kore' },
            { ID: 'Fenrir', Name: 'Fenrir' },
            { ID: 'Aoede', Name: 'Aoede' },
            { ID: 'Zephyr', Name: 'Zephyr' },
            { ID: 'Leda', Name: 'Leda' },
            { ID: 'Orus', Name: 'Orus' },
            { ID: 'Callirrhoe', Name: 'Callirrhoe' },
            { ID: 'Autonoe', Name: 'Autonoe' },
            { ID: 'Enceladus', Name: 'Enceladus' },
            { ID: 'Iapetus', Name: 'Iapetus' },
            { ID: 'Umbriel', Name: 'Umbriel' },
            { ID: 'Algieba', Name: 'Algieba' },
            { ID: 'Despina', Name: 'Despina' },
            { ID: 'Erinome', Name: 'Erinome' },
            { ID: 'Algenib', Name: 'Algenib' },
            { ID: 'Rasalgethi', Name: 'Rasalgethi' },
            { ID: 'Laomedeia', Name: 'Laomedeia' },
            { ID: 'Achernar', Name: 'Achernar' },
            { ID: 'Alnilam', Name: 'Alnilam' },
            { ID: 'Schedar', Name: 'Schedar' },
            { ID: 'Gacrux', Name: 'Gacrux' },
            { ID: 'Pulcherrima', Name: 'Pulcherrima' },
            { ID: 'Achird', Name: 'Achird' },
            { ID: 'Zubenelgenubi', Name: 'Zubenelgenubi' },
            { ID: 'Vindemiatrix', Name: 'Vindemiatrix' },
            { ID: 'Sadachbia', Name: 'Sadachbia' },
            { ID: 'Sadaltager', Name: 'Sadaltager' },
            { ID: 'Sulafat', Name: 'Sulafat' },
        ];
    }

    /**
     * Opens a Gemini Live session and returns the Core session handle that translates between the
     * provider's frames and the MemberJunction realtime contract.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const profile = ResolveGeminiLiveProfile(params.Model, this.Endpoint);
        const session = new GeminiRealtimeSession(profile);
        session.SetConnectTimeTools(params.Tools ?? []);
        const config = this.BuildConnectConfig(this.withoutAvatarOnServer(params));
        session.SetAvatar(this.serverAvatarStatus(params, config), profile.AvatarOutputEncoding);
        // Meeting mode (auto activity detection disabled) → the session must drive turns manually.
        session.SetMeetingMode(config.realtimeInputConfig?.automaticActivityDetection?.disabled === true);
        // The session opens its own connections through this seam, so it can resume on a new one
        // with Google's handle when a connection ends (goAway) or drops.
        session.SetConnector((handle, callbacks) =>
            this.connectLiveSession({
                Model: params.Model,
                Config: handle ? { ...config, sessionResumption: { ...config.sessionResumption, handle } } : config,
                ...callbacks,
            })
        );
        await session.Open();
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
     * The Gemini endpoint this driver talks to. The Developer API here; the Gemini Enterprise driver (Vertex AI)
     * overrides it. Every profile lookup passes it, because what a model renders depends on the endpoint (live avatars
     * are Enterprise only).
     */
    protected get Endpoint(): GeminiLiveEndpoint {
        return 'developer';
    }

    /**
     * Whether the model renders a live avatar on this driver's endpoint, from its Live profile: never on the Developer
     * API; on Gemini Enterprise for the models whose profile says so.
     *
     * @param model The model's API name.
     */
    public override SupportsAvatarOutput(model: string): boolean {
        return ResolveGeminiLiveProfile(model, this.Endpoint).SupportsAvatarOutput;
    }

    /**
     * Gemini Live sessions accept dynamically-defined tools at connect/mint time.
     */
    public static override readonly SupportsDynamicToolSet = true;

    /**
     * Mints an ephemeral, server-scoped Live credential for a **client-direct** session.
     *
     * The connect config is built EXACTLY as {@link StartSession} builds it (same
     * {@link BuildConnectConfig}: audio modality, input+output transcription, system instruction,
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
        const config = this.BuildConnectConfig(params);
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
        const avatarStatus = this.AvatarStatusFor(params, config);
        return {
            Provider: 'gemini',
            Model: params.Model,
            EphemeralToken: token.name,
            ExpiresAt: expireTime,
            // The browser passes the full config to live.connect; the token lock above makes its
            // values authoritative even if a client tampers.
            SessionConfig: this.SessionPactFor(params.Model, config),
            ...(avatarStatus ? { AvatarStatus: avatarStatus } : {}),
        };
    }

    /**
     * The minted session config, the private pact with the browser driver: a plain-JSON copy of the model and the config
     * the browser passes to `live.connect`, plus the model's facts on this driver's endpoint (idle signal, tooling, inbound
     * video limits, and the `avatar` block when the session renders one).
     *
     * @param model The model id.
     * @param config The session's connect config, as {@link BuildConnectConfig} built it. It decides the avatar block.
     * @param browserConfig The config the browser passes to `live.connect`: the full config here; a driver whose sessions
     *   go through MJAPI's relay, which writes the setup, passes a smaller one.
     */
    protected SessionPactFor(model: string, config: LiveConnectConfig, browserConfig: LiveConnectConfig = config): JSONObject {
        const profile = ResolveGeminiLiveProfile(model, this.Endpoint);
        return JSON.parse(
            JSON.stringify({
                model,
                config: browserConfig,
                idleSignal: profile.IdleSignal,
                supportsScheduling: profile.Tooling.SupportsScheduling,
                supportsBlocking: profile.Tooling.SupportsBlockingExecution,
                // Per-model video legality travels with the mint so the browser driver never
                // has to infer it from the model id. The client cannot import this profile
                // table (@memberjunction/ai-realtime-client does not depend on the provider
                // package, by design), so the mint is the seam that carries it.
                supportsInboundVideo: profile.SupportsInboundVideo,
                maxInboundVideoRate: profile.MaxInboundVideoRate,
                // How many concurrent inbound video streams the model accepts (0 without video support).
                // The browser's source arbiter maps live sources onto this many streams.
                maxInboundVideoStreams: ResolveGeminiMaxInboundVideoStreams(profile),
                ...this.AvatarPactFor(config, profile),
            })
        ) as JSONObject;
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
     * Projects the full connect config down to the fields Gemini's ephemeral-token API accepts
     * as `liveConnectConstraints.config`. The token mint converts the provided keys into a
     * field mask over `BidiGenerateContentSetup`, and only generation-level fields are valid
     * there — `systemInstruction`, `tools`, and the transcription configs are NOT, and their
     * presence 400s the entire mint. Only defined fields are copied (an absent key must stay
     * absent so it doesn't enter the mask).
     *
     * `contextWindowCompression` is left out on purpose. No test or doc shows the mask accepts
     * it, and a rejected mask would fail every client-direct session. The browser applies it from
     * `SessionConfig`, like the other server-built keys the token cannot lock.
     *
     * `sessionResumption: {}` is locked as in Google's ephemeral-token example. The browser adds
     * the handle when it resumes, and Google accepts the same token for that until `expireTime`.
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
        if (config.thinkingConfig) {
            constraint.thinkingConfig = config.thinkingConfig;
        }
        if (config.sessionResumption) {
            constraint.sessionResumption = config.sessionResumption;
        }
        return constraint;
    }

    /**
     * Translates the driver-NEUTRAL `voice` config-bag key into Gemini's nested speech shape
     * (`speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`).
     *
     * Every realtime driver in the family reads the same neutral `voice` key, which is what makes a
     * voice authorable without knowing which vendor will run the session (issue #3530). Gemini is the
     * one vendor whose SDK has no `voice` field, so the key has to be mapped here or it is dropped
     * before the wire (issue #3721).
     *
     * Precedence is per-key at the LEAF, not per-block: a caller-supplied raw `speechConfig` is the
     * more specific value and keeps whatever it says, but a raw block that only sets e.g.
     * `languageCode` still receives the authored voice. Block-level winner-takes-all would re-create
     * the same silent drop in a narrower case.
     *
     * @param voice The neutral voice id, already trimmed; `undefined` when none is authored.
     * @param existing Any raw `speechConfig` the caller merged in via the config bag.
     * @returns The speech config to apply (absent when there is nothing to say), plus the voice that
     *          was discarded because the raw block already decided it — the caller logs it, keeping
     *          this a pure calculation.
     */
    private static buildSpeechConfig(voice: string | undefined, existing: SpeechConfig | undefined): { SpeechConfig?: SpeechConfig; DroppedVoice?: string; MalformedExisting?: boolean } {
        // `existing` is DECLARED as SpeechConfig, but it reaches us from the open JSON config bag
        // through the `as Partial<LiveConnectConfig>` cast — the very cast that hid #3721 — so the
        // type is unenforced at runtime. Spreading a string below would emit `{0:'K',1:'o',…}` onto
        // the wire, so a non-object is discarded rather than trusted.
        const usableExisting = GeminiRealtime.isPlainObject(existing) ? existing : undefined;
        const malformedExisting = existing !== undefined && usableExisting === undefined;
        if (!voice) {
            return { SpeechConfig: usableExisting, MalformedExisting: malformedExisting };
        }
        // Does the raw block already decide the voice? Any of three shapes counts: a named prebuilt
        // voice, a cloned/replicated voice, or a multi-speaker config — the last is documented as
        // mutually exclusive with `voiceConfig`, so fabricating one beside it would be inventing a
        // shape the SDK rejects. Note the multi-speaker session is doomed either way: the SDK throws
        // on that key for ANY live session, on both topologies, whether or not `voiceConfig` is
        // present — so this branch neither causes nor avoids that, it just declines to add to it.
        // (The caller warns about the key separately, since the throw is what the author needs told.)
        const rawAlreadyDecidesVoice =
            usableExisting?.voiceConfig?.prebuiltVoiceConfig?.voiceName != null ||
            usableExisting?.voiceConfig?.replicatedVoiceConfig != null ||
            usableExisting?.multiSpeakerVoiceConfig != null;
        if (rawAlreadyDecidesVoice) {
            return { SpeechConfig: usableExisting, DroppedVoice: voice, MalformedExisting: malformedExisting };
        }
        return {
            SpeechConfig: {
                ...usableExisting,
                voiceConfig: { ...usableExisting?.voiceConfig, prebuiltVoiceConfig: { voiceName: voice } },
            },
            MalformedExisting: malformedExisting,
        };
    }

    /**
     * Keeps a config-bag `contextWindowCompression` only when it is an object. The bag is untyped
     * JSON, so a string, array or null would otherwise reach the wire and fail the session at
     * connect. A malformed value is replaced by the default and reported; a well-formed one wins
     * over the default, like every other bag key.
     */
    private static ensureContextWindowCompression(config: LiveConnectConfig): void {
        const compression: unknown = config.contextWindowCompression;
        if (GeminiRealtime.readObject(compression)) {
            return;
        }
        const got = compression === null ? 'null' : Array.isArray(compression) ? 'array' : typeof compression;
        console.warn(`[GeminiRealtime] Ignored the session config bag's \`contextWindowCompression\` because it is not an object (got ${got}); using the default sliding window.`);
        config.contextWindowCompression = GeminiRealtime.DefaultContextWindowCompression();
    }

    /** Narrows an unenforced config-bag value to a real object — not a string, array, or null. */
    private static isPlainObject(value: unknown): value is SpeechConfig {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * The context-window compression every Gemini Live session gets unless the config bag sets
     * its own: a server-side sliding window with Google's default trigger and target sizes.
     *
     * Without compression, Google ends a session when its context fills: about 15 minutes for
     * audio only and about 2 minutes for audio plus video (Google's Live API session-management
     * docs). With compression the server drops the oldest turns and the session continues.
     * Session resumption handles a different limit (a single connection lasts about 10 minutes)
     * and does not lift this one.
     *
     * Returns a new object on each call so no session shares mutable config with another.
     */
    public static DefaultContextWindowCompression(): ContextWindowCompressionConfig {
        return { slidingWindow: {} };
    }

    /**
     * Builds the {@link LiveConnectConfig} from the Core session params: audio response modality,
     * input/output transcription, system instruction, sliding-window context compression
     * ({@link GeminiRealtime.DefaultContextWindowCompression}), session resumption (unless the
     * session is zero-data-retention), mapped tools, the neutral `voice` key mapped via
     * {@link GeminiRealtime.buildSpeechConfig}, plus any provider-specific overrides from the open
     * config bag.
     */
    protected BuildConnectConfig(params: RealtimeSessionParams): LiveConnectConfig {
        const config: LiveConnectConfig = {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: params.SystemPrompt,
            contextWindowCompression: GeminiRealtime.DefaultContextWindowCompression(),
        };
        // Resumption handles let a session continue across Gemini's ~10-minute connection limit.
        // Zero-data-retention sessions never get them; see applyZeroDataRetention.
        if (!params.ZeroDataRetention) {
            config.sessionResumption = {};
        }
        if (params.Tools && params.Tools.length > 0) {
            const bag: Record<string, unknown> = (params.Config as Record<string, unknown> | undefined) ?? {};
            const tooling = GeminiRealtime.readObject(bag['tooling']);
            const requestedBehavior =
                GeminiRealtime.readString(tooling?.['Behavior']) ??
                GeminiRealtime.readString(bag['toolBehavior']) ??
                GeminiRealtime.readString(bag['functionCallingBehavior']);
            config.tools = [{ functionDeclarations: GeminiRealtime.MapToolsToFunctionDeclarations(params.Tools, params.Model, requestedBehavior) }];
        }
        // The open config bag is merged last so per-conversation overrides (generation parameters,
        // language, turn-taking) win over the defaults above. Cast through the shared JSON object
        // shape. Keys with a Gemini-native translation are consumed BEFORE the merge, never spread.
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
            delete cfg.tooling;
            delete cfg.toolBehavior;
            delete cfg.functionCallingBehavior;
            // Consume the driver-NEUTRAL `voice` key the same way: it is not a Gemini config field
            // (LiveConnectConfig has no `voice`), so spreading it raw sends nothing — the SDK's
            // config converter is a path allowlist and drops unknown keys silently. Gemini takes an
            // output voice at speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName instead.
            const rawVoice = cfg.voice;
            delete cfg.voice;
            const voice = typeof rawVoice === 'string' && rawVoice.trim().length > 0 ? rawVoice.trim() : undefined;
            if (rawVoice !== undefined && voice === undefined) {
                // Reported separately from the shared-key scrub below: `voice` IS meaningful to
                // Gemini, so describing it as a foreign OpenAI-protocol key would misdiagnose what is
                // simply a malformed value. BLANK counts as malformed for reporting even though it is
                // treated as absent — a cleared-but-not-removed metadata field is the likeliest way
                // this goes wrong, so it must not be the one case that disappears in silence.
                const reason = typeof rawVoice === 'string' ? 'blank' : `not a string (got ${typeof rawVoice})`;
                console.warn(`[GeminiRealtime] Ignored the session config bag's \`voice\` because it is ${reason} — expected a Gemini prebuilt voice name.`);
            }
            // Scrub the MJ-side keys shared across the realtime driver family (OpenAI-protocol
            // feature knobs + transport settings). They are NOT Gemini config keys — a co-agent
            // config carrying e.g. `effortLevel` or `mcpTools` must be SAFE on a Gemini session,
            // not spread raw into the Live SDK where strictness varies by version. Scrubbed keys
            // are diag-logged so config typos / cross-provider keys stop being silent.
            // The two keys Gemini translates natively (`disableAutoResponse`, `voice`) were already
            // consumed and deleted above, so the loop only ever sees keys with no Gemini mapping —
            // no per-key exemption needed here.
            //
            // This scrub NARROWS the silent-drop class of #3721; it does not close it. The list is an
            // allowlist of MJ-SHARED keys, not of non-Gemini keys, so anything outside it still rides
            // the `Object.assign` below and is dropped by the SDK's path allowlist exactly as `voice`
            // was. One live instance remains: `realtime.voice.providers.gemini.voiceId`, which #3530
            // deprecated but deliberately kept authorable in the agent-type ConfigSchema. Closing the
            // class means inverting this check to warn on any key that is not a known
            // `LiveConnectConfig` field — tracked separately rather than widened here.
            const scrubbed: string[] = [];
            for (const key of REALTIME_SHARED_CONFIG_KEYS) {
                if (key in cfg) {
                    delete cfg[key];
                    scrubbed.push(key);
                }
            }
            if (scrubbed.length > 0) {
                console.warn(`[GeminiRealtime] Scrubbed non-Gemini config key(s) from the session bag: ${scrubbed.join(', ')} — these are OpenAI-protocol/transport keys and do not apply to Gemini Live.`);
            }
            Object.assign(config, cfg as Partial<LiveConnectConfig>);
            GeminiRealtime.ensureContextWindowCompression(config);
            // Captured BEFORE the mapping below replaces or deletes it, so the warning can report the
            // type that was actually rejected rather than the type that replaced it.
            const rawSpeechConfig: unknown = config.speechConfig;
            const speech = GeminiRealtime.buildSpeechConfig(voice, config.speechConfig);
            if (speech.SpeechConfig) {
                config.speechConfig = speech.SpeechConfig;
            } else if (speech.MalformedExisting) {
                // Nothing usable to put back, and the raw value must not survive the merge.
                delete config.speechConfig;
            }
            if (speech.MalformedExisting) {
                console.warn(`[GeminiRealtime] Ignored the session config bag's \`speechConfig\` because it is not an object (got ${Array.isArray(rawSpeechConfig) ? 'array' : typeof rawSpeechConfig}) — expected a Gemini SpeechConfig.`);
            }
            // Independent of any voice mapping: the SDK rejects this key on EVERY live session, so a
            // config carrying it is already doomed on both topologies. Forwarding it in silence hands
            // the caller a dead session with no hint which key caused it.
            if (config.speechConfig?.multiSpeakerVoiceConfig != null) {
                console.warn('[GeminiRealtime] The session config bag sets `speechConfig.multiSpeakerVoiceConfig`, which the Gemini Live API does not support — the SDK throws on it for both server-bridged and client-direct sessions. Use `speechConfig.voiceConfig` (or the neutral `voice` key) instead.');
            }
            if (speech.DroppedVoice) {
                console.warn(`[GeminiRealtime] Ignored the neutral voice "${speech.DroppedVoice}" — the session config bag supplies its own speechConfig, which already names a voice. Author one or the other, not both.`);
            }
            if (disableAutoResponse) {
                config.realtimeInputConfig = {
                    ...(config.realtimeInputConfig ?? {}),
                    automaticActivityDetection: { ...(config.realtimeInputConfig?.automaticActivityDetection ?? {}), disabled: true },
                };
            }
        }
        // Applied LAST, deliberately: these are legality rules rather than preferences, so the open
        // config bag must not be able to reintroduce a key the target model has retired. Anything the
        // merge above put back is removed here.
        this.applyModelLegality(config, params);
        GeminiRealtime.applyZeroDataRetention(config, params);
        this.applyAvatarOutput(config, params);
        return config;
    }

    /**
     * Renders the requested avatar when the model can on this endpoint: video output and the avatar's name, at the
     * bitrate the deployment asks for (`MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS`, 2 Mbps by default; `0` leaves the field out).
     * Otherwise the session stays audio-only and one line says why. Either way a VIDEO modality or an `avatarConfig` from
     * the config bag is removed: an avatar comes only from the session's avatar request. Applied last, like the legality
     * rules. Every session's setup comes from here: the browser mint, the relay's setup and server-side sessions.
     */
    private applyAvatarOutput(config: LiveConnectConfig, params: RealtimeSessionParams): void {
        const request = params.Avatar;
        const reason = request ? this.avatarUnavailableReason(request, params.Model) : undefined;
        if (request && !reason) {
            const videoBitrateBps = ResolveGeminiAvatarVideoBitrateBps();
            config.responseModalities = [Modality.VIDEO];
            config.avatarConfig = videoBitrateBps === null ? { avatarName: request.AvatarID.trim() } : { avatarName: request.AvatarID.trim(), videoBitrateBps };
            return;
        }
        GeminiRealtime.removeVideoOutput(config, params.Model);
        if (request && reason) {
            console.warn(this.avatarUnavailableMessage(request, params.Model, reason));
        }
    }

    /** Why this session can't render the requested avatar, or `undefined` when it can. */
    private avatarUnavailableReason(request: RealtimeAvatarSettings, model: string): RealtimeAvatarUnavailableReason | undefined {
        if ((request.Kind ?? 'preset') === 'custom') {
            return 'custom-disabled';
        }
        if (!ResolveGeminiLiveProfile(model, this.Endpoint).SupportsAvatarOutput) {
            return 'endpoint';
        }
        return request.AvatarID?.trim() ? undefined : 'unknown-avatar';
    }

    /** The one log line for an avatar the session asked for and won't render. */
    private avatarUnavailableMessage(request: RealtimeAvatarSettings, model: string, reason: RealtimeAvatarUnavailableReason): string {
        const endpointName = this.Endpoint === 'enterprise' ? 'Gemini Enterprise' : 'the Gemini Developer API';
        const why: Record<RealtimeAvatarUnavailableReason, string> = {
            endpoint: `${model} on ${endpointName} renders no avatar`,
            bridged: "a session on the server (a meeting or a phone call) whose host can't publish video",
            'custom-disabled': 'custom avatars are not enabled',
            'unknown-avatar': 'the request names no avatar',
            'no-binding': 'the persona has no avatar on this vendor',
            host: 'the app showing the call asks for no agent video',
            browser: 'the browser cannot play the avatar',
            'decoder-missing': 'the meeting host has no usable video decoder',
            'decoder-failed': "the meeting bot's decoders kept failing",
            'publish-failed': 'the meeting room refused the video track',
        };
        const persona = request.PersonaName ? ` (persona ${request.PersonaName})` : '';
        return `[GeminiRealtime] Avatar "${request.AvatarID}"${persona} not used: ${why[reason]}. The call is audio only. Reason: ${reason}.`;
    }

    /** Removes a VIDEO response modality and any `avatarConfig` that came from somewhere other than an avatar request. */
    private static removeVideoOutput(config: LiveConnectConfig, model: string): void {
        if (config.avatarConfig !== undefined) {
            delete config.avatarConfig;
            console.warn(`[GeminiRealtime] Dropped \`avatarConfig\` from the session config for ${model}: an avatar comes only from the session's avatar request.`);
        }
        const modalities = config.responseModalities ?? [];
        if (modalities.includes(Modality.VIDEO)) {
            const rest = modalities.filter((m) => m !== Modality.VIDEO);
            config.responseModalities = rest.length > 0 ? rest : [Modality.AUDIO];
            console.warn(`[GeminiRealtime] Dropped the VIDEO response modality for ${model}: video output comes only from an avatar request the model can render.`);
        }
    }

    /**
     * A server-side session (a bridged meeting or phone call) asks for an avatar only when its host publishes the video
     * into a room (`Delivery: 'room'`, a meeting bot that decodes it). Anywhere else nothing on the server can show it:
     * returns the params without the request, logging the reason once.
     */
    private withoutAvatarOnServer(params: RealtimeSessionParams): RealtimeSessionParams {
        if (!params.Avatar || params.Avatar.Delivery === 'room') {
            return params;
        }
        console.warn(this.avatarUnavailableMessage(params.Avatar, params.Model, 'bridged'));
        return { ...params, Avatar: undefined };
    }

    /**
     * What the mint tells the call about the avatar the session asked for: granted, or audio only and why. `undefined` when
     * it asked for none. Read from the connect config {@link BuildConnectConfig} built, so it says what the session does:
     * an `avatarConfig` there is the grant. Every Gemini driver returns it on its minted config.
     *
     * @param params The session parameters (the avatar request).
     * @param config The connect config the session was built with.
     */
    protected AvatarStatusFor(params: RealtimeSessionParams, config: LiveConnectConfig): RealtimeAvatarStatus | undefined {
        const request = params.Avatar;
        if (!request) {
            return undefined;
        }
        if (config.avatarConfig) {
            return { Requested: true, Granted: true };
        }
        const reason = this.avatarUnavailableReason(request, params.Model);
        return reason ? { Requested: true, Granted: false, Reason: reason } : { Requested: true, Granted: false };
    }

    /**
     * What became of a server-side session's avatar request: {@link AvatarStatusFor}, except that a session whose host
     * can't publish the avatar (no `Delivery: 'room'`) is audio only as `bridged`. `undefined` without a request.
     *
     * @param params The session parameters as the host passed them (the avatar request included).
     * @param config The connect config the session was built with.
     */
    private serverAvatarStatus(params: RealtimeSessionParams, config: LiveConnectConfig): RealtimeAvatarStatus | undefined {
        const status = this.AvatarStatusFor(params, config);
        if (!status || status.Granted || params.Avatar?.Delivery === 'room') {
            return status;
        }
        return { ...status, Reason: 'bridged' };
    }

    /**
     * The minted session config's avatar block: present only when this session renders an avatar, so the browser driver
     * knows to expect video parts, their encoding, and whether they carry the voice.
     *
     * @param config The connect config the session was built with.
     * @param profile The model's profile on this driver's endpoint.
     */
    protected AvatarPactFor(config: LiveConnectConfig, profile: GeminiLiveResolvedProfile): JSONObject {
        if (!config.avatarConfig) {
            return {};
        }
        return { avatar: { output: true, encoding: profile.AvatarOutputEncoding ?? null, audioMuxed: profile.AvatarAudioMuxed ?? true } };
    }

    /**
     * Keeps session resumption off a zero-data-retention session, even when the config bag asks
     * for it: Google stores resumable session state, which such a model promises not to do.
     * Applied after the bag merge, like the legality rules, so the bag cannot turn it back on.
     */
    private static applyZeroDataRetention(config: LiveConnectConfig, params: RealtimeSessionParams): void {
        if (!params.ZeroDataRetention || config.sessionResumption === undefined) {
            return;
        }
        delete config.sessionResumption;
        console.warn(`[GeminiRealtime] Dropped \`sessionResumption\` for ${params.Model}: the model is served under zero data retention, and resumption stores session data on Google's side.`);
    }

    /**
     * Enforces what the TARGET model actually accepts, and states what MJ wants rather than
     * inheriting a provider default.
     *
     * Every rule here fails at SESSION MINT if broken — upstream of all UI code, the same failure
     * class as an illegal tool name — so none of it can be left to discover at connect time. Facts
     * come from the resolved {@link ResolveGeminiLiveProfile} table; see
     * `plans/realtime/gemini-3-8-live.md` §3 for their sourcing.
     */
    private applyModelLegality(config: LiveConnectConfig, params: RealtimeSessionParams): void {
        const profile = ResolveGeminiLiveProfile(params.Model, this.Endpoint);
        // The catalog's ModelConfiguration.Realtime reaches a driver folded into the session Config
        // BAG as neutral keys (the same route `turnDetection` already travels), not as a field on
        // RealtimeSessionParams — so read it from there.
        const bag: Record<string, unknown> = (params.Config as Record<string, unknown> | undefined) ?? {};
        const reasoning = GeminiRealtime.readObject(bag['reasoning']);
        const turnDetection = GeminiRealtime.readObject(bag['turnDetection']);
        // Structured `reasoning.Remote.Effort` first; fall back to `reasoning.Level` / `reasoning.Effort`
        // (e.g. from model catalog metadata) or flat legacy bag keys so every source resolves.
        const effort =
            GeminiRealtime.readString(GeminiRealtime.readObject(reasoning?.['Remote'])?.['Effort']) ??
            GeminiRealtime.readString(reasoning?.['Level']) ??
            GeminiRealtime.readString(reasoning?.['level']) ??
            GeminiRealtime.readString(reasoning?.['Effort']) ??
            GeminiRealtime.readString(reasoning?.['effort']) ??
            GeminiRealtime.readString(bag['effortLevel']) ??
            GeminiRealtime.readString(bag['reasoningEffort']);
        const includeThoughts =
            reasoning?.['IncludeThoughtSummaries'] === true ||
            reasoning?.['includeThoughtSummaries'] === true ||
            reasoning?.['IncludeThoughts'] === true ||
            reasoning?.['includeThoughts'] === true ||
            bag['includeThoughts'] === true ||
            bag['includeThoughtSummaries'] === true;
        const coverageSetting = GeminiRealtime.readString(turnDetection?.['Coverage']);

        // C1 — affective dialogue is REMOVED from the API on the 3.8 family; sending it errors. The
        // SDK still declares `enableAffectiveDialog` (it remains valid for 3.1), so it will not stop
        // us and the guard has to be ours.
        if (profile.AffectiveDialogRemoved && config.enableAffectiveDialog !== undefined) {
            delete config.enableAffectiveDialog;
            console.warn(
                `[GeminiRealtime] Dropped \`enableAffectiveDialog\` for ${params.Model}: affective dialogue is removed from the API on this model and sending it returns an error.`
            );
        }

        // C2 — proactive audio is permanently ON; `proactiveAudio: false` is an error, not a default.
        if (profile.ProactiveAudioAlwaysOn && config.proactivity?.proactiveAudio === false) {
            delete config.proactivity;
            console.warn(
                `[GeminiRealtime] Dropped \`proactivity.proactiveAudio: false\` for ${params.Model}: proactive audio is permanently enabled on this model and disabling it returns an error.`
            );
        }

        // C3 — thinking level, per model. `gemini-3.8-live` documents that thinkingConfig must be
        // omitted ENTIRELY; Extended Thinking takes low/medium/high and rejects minimal.
        const thinking = ResolveGeminiThinkingLevel(effort, profile);
        if (thinking.Warning) {
            console.warn(`[GeminiRealtime] ${thinking.Warning}`);
        }
        const effectiveLevel = thinking.Level ?? profile.DefaultThinkingLevel;
        const wantSummaries = profile.SupportsThoughtSummaries && includeThoughts;
        if (!profile.SupportsThinkingLevel && !wantSummaries) {
            // Omit the whole block, as the model page instructs — not merely the level.
            delete config.thinkingConfig;
        } else if (effectiveLevel || wantSummaries) {
            config.thinkingConfig = {
                ...(effectiveLevel ? { thinkingLevel: GeminiRealtime.MapThinkingLevel(effectiveLevel) } : {}),
                ...(wantSummaries ? { includeThoughts: true } : {}),
            };
        } else {
            delete config.thinkingConfig;
        }

        // C4 — turn coverage is STATED, never inherited. The SDK's enum doc says coverage defaults to
        // TURN_INCLUDES_ONLY_ACTIVITY while the 3.8 model page says the default includes all video;
        // sending it explicitly makes that contradiction irrelevant. Absent config means audio-only,
        // because video frames are billed and consume context, so the expensive option must be asked
        // for rather than inherited.
        const coverage = coverageSetting ?? 'audioActivityOnly';
        config.realtimeInputConfig = {
            ...(config.realtimeInputConfig ?? {}),
            turnCoverage:
                coverage === 'audioActivityAndAllVideo'
                    ? TurnCoverage.TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO
                    : TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
        };

        // C5 / C5a / C5b — state behavior on every declaration, whatever its origin.
        // Drops the !SupportsBlockingExecution gate so 3.8-live bag tools are stated too.
        if (config.tools) {
            for (const toolGroup of config.tools) {
                if ('functionDeclarations' in toolGroup && toolGroup.functionDeclarations) {
                    for (const fn of toolGroup.functionDeclarations) {
                        const rawBehavior = fn.behavior ? String(fn.behavior).trim().toUpperCase() : undefined;
                        if (!profile.Tooling.SupportsBlockingExecution) {
                            if (rawBehavior === Behavior.BLOCKING || rawBehavior === 'BLOCKING') {
                                console.warn(
                                    `[GeminiRealtime] Forcing \`behavior: NON_BLOCKING\` for tool "${fn.name}" on ${params.Model}: ` +
                                    `blocking tool execution is not supported on this model and returns a hard error.`
                                );
                                fn.behavior = Behavior.NON_BLOCKING;
                            } else if (!rawBehavior || rawBehavior === Behavior.NON_BLOCKING || rawBehavior === 'NON_BLOCKING') {
                                fn.behavior = Behavior.NON_BLOCKING;
                            } else {
                                console.warn(
                                    `[GeminiRealtime] Unrecognized behavior value "${fn.behavior}" for tool "${fn.name}". Forcing NON_BLOCKING.`
                                );
                                fn.behavior = Behavior.NON_BLOCKING;
                            }
                        } else {
                            if (!rawBehavior) {
                                fn.behavior = Behavior.NON_BLOCKING;
                            } else if (rawBehavior === Behavior.BLOCKING || rawBehavior === 'BLOCKING') {
                                fn.behavior = Behavior.BLOCKING;
                            } else if (rawBehavior === Behavior.NON_BLOCKING || rawBehavior === 'NON_BLOCKING') {
                                fn.behavior = Behavior.NON_BLOCKING;
                            } else {
                                console.warn(
                                    `[GeminiRealtime] Unrecognized behavior value "${fn.behavior}" for tool "${fn.name}". Defaulting to NON_BLOCKING.`
                                );
                                fn.behavior = Behavior.NON_BLOCKING;
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Narrows a bag value to a plain object, or `undefined`.
     *
     * The session Config bag is `JSONObject`, so every nested read needs narrowing. Returning
     * `undefined` rather than throwing is deliberate: a malformed catalog value must degrade to "that
     * setting is absent" and never cost the user their voice session.
     */
    private static readObject(value: unknown): Record<string, unknown> | undefined {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    }

    /** Narrows a bag value to a non-blank trimmed string, or `undefined`. */
    private static readString(value: unknown): string | undefined {
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    /** Maps MJ's lowercase thinking level onto the SDK's uppercase {@link ThinkingLevel} enum. */
    public static MapThinkingLevel(level: GeminiThinkingLevel): ThinkingLevel {
        switch (level) {
            case 'minimal':
                return ThinkingLevel.MINIMAL;
            case 'low':
                return ThinkingLevel.LOW;
            case 'medium':
                return ThinkingLevel.MEDIUM;
            case 'high':
                return ThinkingLevel.HIGH;
        }
    }

    /**
     * Maps Core {@link RealtimeToolDefinition}s up to Gemini {@link FunctionDeclaration}s.
     *
     * The Core `ParametersSchema` is a JSON-schema object, so it rides in `parametersJsonSchema`
     * (the SDK's JSON-schema slot) rather than the OpenAPI-style `parameters` slot.
     *
     * In Gemini Live, function calling defaults to asynchronous execution (`Behavior.NON_BLOCKING`).
     * On models that forbid synchronous blocking execution (e.g. `gemini-3.8-live-extended-thinking`),
     * `Behavior.BLOCKING` is refused locally and forced to `Behavior.NON_BLOCKING` with a warning,
     * preventing a hard error from the Live API server.
     */
    public static MapToolsToFunctionDeclarations(
        tools: RealtimeToolDefinition[],
        model?: string,
        requestedBehavior?: Behavior | string
    ): FunctionDeclaration[] {
        const profile = ResolveGeminiLiveProfile(model);
        const normalized = typeof requestedBehavior === 'string' ? requestedBehavior.trim().toUpperCase() : requestedBehavior;
        let behavior: Behavior;

        if (normalized === Behavior.BLOCKING || normalized === 'BLOCKING') {
            if (!profile.Tooling.SupportsBlockingExecution) {
                console.warn(
                    `[GeminiRealtime] Forcing \`behavior: NON_BLOCKING\` for tools on ${model ?? 'model'}: ` +
                    `blocking tool execution is not supported on this model and returns a hard error.`
                );
                behavior = Behavior.NON_BLOCKING;
            } else {
                behavior = Behavior.BLOCKING;
            }
        } else if (normalized === Behavior.NON_BLOCKING || normalized === 'NON_BLOCKING') {
            behavior = Behavior.NON_BLOCKING;
        } else if (normalized) {
            console.warn(
                `[GeminiRealtime] Unrecognized behavior value "${requestedBehavior}". Defaulting to NON_BLOCKING.`
            );
            behavior = Behavior.NON_BLOCKING;
        } else {
            behavior = Behavior.NON_BLOCKING;
        }

        return tools.map((tool) => ({
            name: tool.Name,
            description: tool.Description,
            parametersJsonSchema: tool.ParametersSchema,
            behavior,
        }));
    }

    /**
     * Extracts scheduling hints (`__mj_scheduling` or legacy `scheduling`) from the tool output,
     * strips both keys so they do not leak into the model's response payload, resolves the scheduling
     * directive accepting both 'INTERRUPT' and 'INTERRUPTED', and warns on unrecognized values or
     * unsupported models (delegates normalization to Core `ExtractToolSchedulingHint`).
     */
    public static ExtractAndResolveScheduling(
        parsed: Record<string, unknown>,
        supportsScheduling: boolean,
        toolName: string
    ): FunctionResponseScheduling | undefined {
        const hint = ExtractToolSchedulingHint(parsed, toolName, 'GeminiRealtime');
        if (!hint) {
            return undefined;
        }

        const schedStr = hint === 'silent' ? 'SILENT' : hint === 'whenIdle' ? 'WHEN_IDLE' : 'INTERRUPT';
        if (!supportsScheduling) {
            console.warn(
                `[GeminiRealtime] Dropping scheduling hint "${schedStr}" for tool "${toolName}": ` +
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
    private profile: GeminiLiveModelProfile;

    constructor(profile?: GeminiLiveModelProfile) {
        this.profile = profile ?? GEMINI_LIVE_FALLBACK_PROFILE;
    }

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private videoFrameHandler: ((frame: RealtimeVideoFrame) => void) | null = null;
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

    /** Accumulates in-flight thought text deltas until finalized on turn completion. */
    private pendingThoughtText = '';

    /** MIME types of model output this session dropped, so each is reported once. */
    private droppedOutputTypes = new Set<string>();

    /** Kinds and MIME types of input this session dropped, so each is reported once. */
    private droppedInputTypes = new Set<string>();

    /**
     * Fingerprint of the tool set bound at connect time (set via {@link SetConnectTimeTools});
     * {@link RegisterTools} compares against it to no-op identical re-registrations.
     * Defaults to the empty set's fingerprint for sessions started without tools.
     */
    private connectTimeToolsFingerprint = GeminiRealtimeSession.toolSetFingerprint([]);

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

    /** Meeting-mode watchdog: clears a latched {@link responseActive} if an `activityEnd` elicits no turn. */
    private meetingResponseWatchdog?: ReturnType<typeof setTimeout>;

    /** Opens this session's Live connections; set by the driver before {@link Open}. */
    private connector: GeminiSessionConnector | null = null;

    /**
     * Routes model parts, turn boundaries and avatar usage when the driver granted an avatar to a host that publishes it
     * into a room; null on every other session, whose output is PCM only.
     */
    private avatarOutput: GeminiBridgedAvatarOutput | null = null;

    /** The MSE type of a granted avatar's pieces, from the model's profile; declared on the outbound video track. */
    private avatarEncoding?: string;

    /** What became of the session's avatar request (see {@link IRealtimeSession.AvatarStatus}); set by the driver. */
    public AvatarStatus?: RealtimeAvatarStatus;

    /**
     * Moves the session to a new connection with Google's resumption handle: when Google announces
     * the connection is ending (`goAway`, about 60 s before the ~10-minute connection limit) and
     * after an unexpected drop. Created by {@link Open}.
     */
    private resumption: RealtimeSessionResumption | null = null;

    /** Last connection number handed out by {@link openConnection}. */
    private issuedConnections = 0;

    /**
     * Number of the connection in use. Callbacks from any other connection (one that was replaced,
     * closed, or is still opening) are ignored, so a replaced socket's close can't end the session
     * that replaced it. `0` while no connection is in use.
     */
    private currentConnection = 0;

    /** Sets how this session opens its Live connections. Called by the driver before {@link Open}. */
    public SetConnector(connector: GeminiSessionConnector): void {
        this.connector = connector;
    }

    /**
     * Records what became of the session's avatar request. A granted one (a server-side session whose host publishes the
     * avatar into a room) sends the model's MP4 pieces as frames to {@link OnVideoFrame}, keeps PCM to turns without
     * video, and reports the avatar's video seconds through {@link OnUsage}. Called by the driver before {@link Open}.
     *
     * @param status The avatar status, or `undefined` when the session asked for no avatar.
     * @param encoding The avatar's MSE type from the model's profile.
     */
    public SetAvatar(status: RealtimeAvatarStatus | undefined, encoding: string | undefined): void {
        this.AvatarStatus = status;
        this.avatarEncoding = encoding;
        this.avatarOutput = status?.Granted
            ? new GeminiBridgedAvatarOutput({
                  OnVideoFrame: (frame) => this.videoFrameHandler?.(frame),
                  OnPcm: (pcm) => this.outputHandler?.(pcm),
                  OnVideoSeconds: (seconds) => this.usageHandler?.({ InputTokens: 0, OutputTokens: 0, OutputTokenDetails: { VideoSeconds: seconds } }),
                  Report: (message) => console.warn(message),
              })
            : null;
    }

    /** Opens the first connection. Called by the driver once the session is configured. */
    public async Open(): Promise<void> {
        this.resumption = new RealtimeSessionResumption({
            Reconnect: (handle, attempt) => this.resume(handle, attempt),
            OnReconnecting: (reason) => RealtimeDiagLog(`[GeminiRealtime] Resuming the session on a new connection (${reason})`),
            OnReconnected: () => this.handleResumed(),
            OnReconnectFailed: (error) => this.handleResumeFailed(error),
            Log: (message) => RealtimeDiagLog(message),
        });
        this.useConnection(await this.openConnection(undefined));
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
        const inbound: RealtimeTrackDescriptor[] = [{ Modality: 'audio', Direction: 'inbound' }];
        if (this.profile.SupportsInboundVideo) {
            inbound.push({
                Modality: 'video',
                Direction: 'inbound',
                Encoding: 'image/jpeg',
                // The model's own ceiling from the profile table; a bridged host paces frames to it.
                Rate: this.profile.MaxInboundVideoRate,
                UsageBasis: ['tokens', 'frames'] as const,
                RequiresConsent: true,
            });
        }
        const outbound: RealtimeTrackDescriptor[] = [{ Modality: 'audio', Direction: 'outbound' }];
        if (this.avatarOutput) {
            // A granted avatar: its MP4 pieces reach the host as frames through OnVideoFrame.
            outbound.push({ Modality: 'video', Direction: 'outbound', ...(this.avatarEncoding ? { Encoding: this.avatarEncoding } : {}) });
        }
        return {
            CanReconfigureTurnMode: false,
            // Proactive audio is permanently on for the 3.8 line: the model listens while speaking and decides
            // for itself when to speak. A meeting-mode session (auto activity detection off) is turn-based.
            FullDuplex: this.profile.ProactiveAudioAlwaysOn && !this.meetingMode,
            SupportsDynamicToolSet: GeminiRealtime.SupportsDynamicToolSet,
            SupportedInboundTracks: inbound,
            MaxInboundVideoStreams: ResolveGeminiMaxInboundVideoStreams(this.profile),
            SupportedOutboundTracks: outbound,
            ProvidesThoughtSummaries: this.profile.SupportsThoughtSummaries,
            SupportsAsynchronousReasoning: !this.profile.Tooling.SupportsBlockingExecution,
            UsageBases: this.profile.SupportsInboundVideo ? ['tokens', 'seconds', 'frames'] : ['tokens', 'seconds'],
        };
    }

    /**
     * Seeds the conversation with prior context as a client-content turn (not turn-complete), so the
     * model has the same starting history a loop agent would assemble.
     */
    public SeedInitialContext(context: string): void {
        const turns: Content[] = [{ role: 'user', parts: [{ text: context }] }];
        this.requireLive().sendClientContent({ turns, turnComplete: false });
    }

    /**
     * @inheritdoc
     *
     * Audio goes out as `audio` in the frame's PCM format (16 kHz PCM when the frame names none).
     * Video goes out as `video` when the frame is a JPEG or PNG image, the types Gemini Live accepts.
     * Anything else is dropped and reported once per type, never sent as the wrong kind.
     */
    public SendInput(frame: RealtimeInputFrame): void {
        if (frame.Kind === 'video') {
            this.sendVideoInput(frame);
            return;
        }
        this.sendAudioInput(frame);
    }

    private sendAudioInput(frame: RealtimeInputFrame): void {
        const mimeType = frame.MimeType ?? GEMINI_INPUT_AUDIO_MIME_TYPE;
        if (!IsPcmAudioMimeType(mimeType)) {
            this.reportDroppedInput('audio', mimeType);
            return;
        }
        const live = this.requireLive();
        // Meeting mode: automatic activity detection is OFF, so audio is only processed inside an explicit
        // activity window. Open one lazily on the first audio after the last turn was committed — the window
        // stays open (accumulating what the agent hears) until RequestSpokenUpdate sends `activityEnd`.
        // Only audio opens it: a video frame is not speech.
        if (this.meetingMode && !this.manualActivityOpen) {
            live.sendRealtimeInput({ activityStart: {} });
            this.manualActivityOpen = true;
            RealtimeDiagLog('[GeminiRealtime][diag] meeting: activityStart — opened input window on first audio (now accumulating room audio)');
        }
        live.sendRealtimeInput({ audio: { data: GeminiRealtimeSession.arrayBufferToBase64(frame.Data), mimeType } });
    }

    private sendVideoInput(frame: RealtimeInputFrame): void {
        const mimeType = frame.MimeType?.trim().toLowerCase();
        if (!mimeType || !GEMINI_VIDEO_INPUT_MIME_TYPES.has(mimeType)) {
            this.reportDroppedInput('video', mimeType ?? '(no type)');
            return;
        }
        this.requireLive().sendRealtimeInput({ video: { data: GeminiRealtimeSession.arrayBufferToBase64(frame.Data), mimeType } });
    }

    /** Reports each kind and type of dropped input once per session, not once per frame. */
    private reportDroppedInput(kind: RealtimeInputFrame['Kind'], mimeType: string): void {
        const key = `${kind}:${mimeType}`;
        if (this.droppedInputTypes.has(key)) {
            return;
        }
        this.droppedInputTypes.add(key);
        console.warn(`[GeminiRealtime] Dropped ${kind} input of type ${mimeType}: Gemini Live takes PCM audio and JPEG or PNG video frames.`);
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
        if (GeminiRealtimeSession.toolSetFingerprint(tools) === this.connectTimeToolsFingerprint) {
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
        this.connectTimeToolsFingerprint = GeminiRealtimeSession.toolSetFingerprint(tools);
    }

    /** Canonical, order-insensitive fingerprint of a tool set for identity comparison. */
    private static toolSetFingerprint(tools: RealtimeToolDefinition[]): string {
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
    public OnVideoFrame(handler: (frame: RealtimeVideoFrame) => void): void {
        this.videoFrameHandler = handler;
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
     * When the session can be resumed, the error is only logged: a websocket `error` is always
     * followed by a `close`, and {@link HandleTransportClose} resumes from there.
     */
    public HandleTransportError(message: string): void {
        if (this.resumption?.Handle) {
            RealtimeDiagLog(`[GeminiRealtime] Transport error, resuming on close: ${message}`);
            return;
        }
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * Handles a close of the current connection that the consumer did not ask for. When Google
     * issued a resumption handle, the session reconnects with it; otherwise the close surfaces as a
     * fatal error, as before (expected closes, after {@link Close}, stay silent).
     */
    public HandleTransportClose(code?: number, reason?: string): void {
        if (this.closedByConsumer) {
            return;
        }
        if (this.resumption?.ConnectionLost()) {
            return;
        }
        const detail = [code != null ? `code ${code}` : null, reason || null].filter(Boolean).join(' — ');
        this.errorHandler?.({ Message: `Gemini Live session closed unexpectedly${detail ? ` (${detail})` : ''}`, Fatal: true });
    }

    /**
     * Opens a connection through the driver's connector. Its callbacks act only while it is the
     * connection in use, so events from one that was replaced, closed, or is still opening are
     * dropped. It becomes the connection in use through {@link useConnection}, which lets the old
     * connection keep delivering events while a planned move is in progress.
     */
    private async openConnection(handle: string | undefined): Promise<GeminiOpenedConnection> {
        if (!this.connector) {
            throw new Error('Gemini realtime session has no connector; the driver must call SetConnector before Open.');
        }
        const number = ++this.issuedConnections;
        const isCurrent = (): boolean => number === this.currentConnection;
        const live = await this.connector(handle, {
            OnMessage: (message) => {
                if (isCurrent()) {
                    this.HandleServerMessage(message);
                }
            },
            OnError: (event) => {
                if (isCurrent()) {
                    this.HandleTransportError(event?.message ?? 'Gemini Live websocket error');
                }
            },
            OnClose: (event) => {
                if (isCurrent()) {
                    this.HandleTransportClose(event?.code, event?.reason);
                }
            },
        });
        return { Live: live, ConnectionNumber: number };
    }

    /** Makes an opened connection the one in use. */
    private useConnection(opened: GeminiOpenedConnection): void {
        this.live = opened.Live;
        this.currentConnection = opened.ConnectionNumber;
    }

    /**
     * Opens a replacement connection that resumes the session from `handle`, switches to it and
     * closes the old one. Rejects when the connection can't be opened, so
     * {@link RealtimeSessionResumption} can retry. A connection that opens after the attempt was
     * abandoned (timeout, or {@link Close}) is closed instead of used.
     */
    private async resume(handle: string, attempt: RealtimeResumeAttempt): Promise<void> {
        const opened = await this.openConnection(handle);
        if (attempt.Abandoned || this.closedByConsumer) {
            GeminiRealtimeSession.closeQuietly(opened.Live);
            return;
        }
        const previous = this.live;
        this.useConnection(opened);
        if (previous) {
            GeminiRealtimeSession.closeQuietly(previous);
        }
    }

    /**
     * The session continues on a new connection. It has no open meeting-mode activity window, and
     * a turn cut off by a drop never completes there, so the turn is ended the way `turnComplete`
     * ends one: thought text emitted, the busy flag cleared, queued sends drained onto the new connection.
     */
    private handleResumed(): void {
        this.manualActivityOpen = false;
        this.avatarOutput?.Resumed();
        this.completeTurn();
    }

    /** Every resume attempt failed: the session ends with a fatal error. */
    private handleResumeFailed(error: Error): void {
        if (this.closedByConsumer) {
            return;
        }
        this.errorHandler?.({ Message: `Gemini Live connection was lost and could not be resumed: ${error.message}`, Fatal: true });
    }

    /** Closes a connection the session no longer uses; it may already be closed. */
    private static closeQuietly(live: GeminiLiveSession): void {
        try {
            live.close();
        } catch (err) {
            RealtimeDiagLog(`[GeminiRealtime] Closing a replaced connection failed: ${err instanceof Error ? err.message : String(err)}`);
        }
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
        const parsed = this.parseToolOutput(output);
        const sched = GeminiRealtime.ExtractAndResolveScheduling(
            parsed,
            this.profile.Tooling.SupportsScheduling ?? false,
            name
        );
        const functionResponse: FunctionResponse = {
            id: callID,
            name,
            response: parsed,
            ...(sched ? { scheduling: sched } : {}),
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
    public RequestSpokenUpdate(instructions: string): boolean {
        RealtimeDiagLog(`[GeminiRealtime][diag] RequestSpokenUpdate called (meetingMode=${this.meetingMode}, responseActive=${this.responseActive}, manualActivityOpen=${this.manualActivityOpen})`);
        // MEETING mode: the bridge is the sole speech trigger and a single addressed turn = one reply. A
        // duplicate trigger while a reply is already active (e.g. two agents re-transcribed the same address)
        // is dropped, NOT queued — queuing would make the agent answer the same address twice. Mirrors the
        // OpenAI driver's disposable-interim-update contract. Returns false so the bridge releases the floor.
        if (this.meetingMode && this.responseActive) {
            RealtimeDiagLog('[GeminiRealtime][diag] meeting: RequestSpokenUpdate SKIPPED — a response is already active (duplicate addressed trigger dropped)');
            return false;
        }
        let committed = false;
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
                // If no activity window is open (no fresh room audio since the last commit — e.g. a back-to-back
                // continuation right after this agent spoke), OPEN one first. Otherwise the `activityEnd` closes
                // nothing, Gemini never forms a turn → no `turnComplete`, and the bridge's floor would wedge.
                if (!this.manualActivityOpen) {
                    live.sendRealtimeInput({ activityStart: {} });
                }
                live.sendRealtimeInput({ activityEnd: {} });
                this.manualActivityOpen = false;
                this.armMeetingResponseWatchdog();
                committed = true;
                RealtimeDiagLog('[GeminiRealtime][diag] meeting: activityEnd SENT — committed the turn, expecting ONE model response now');
                return;
            }
            live.sendRealtimeInput({ text: instructions });
        });
        // Meeting mode: report whether we actually committed a turn (so the bridge can release the floor if
        // not). Non-meeting (narration) always reports sent — it queues rather than wedges a floor.
        return this.meetingMode ? committed : true;
    }

    /**
     * Watchdog for the manual-activity meeting trigger: if Gemini produces NO turn after an `activityEnd`
     * (no `turnComplete` clears {@link responseActive}), force-clear it after a bounded wait so the agent can
     * be triggered again instead of going permanently silent. Shorter than the bridge's floor safety timer so
     * the model recovers before the floor does. Cleared by {@link completeTurn} on a real turn boundary.
     */
    private armMeetingResponseWatchdog(): void {
        if (this.meetingResponseWatchdog) {
            clearTimeout(this.meetingResponseWatchdog);
        }
        this.meetingResponseWatchdog = setTimeout(() => {
            this.meetingResponseWatchdog = undefined;
            if (this.responseActive) {
                RealtimeDiagLog('[GeminiRealtime][diag] meeting WATCHDOG fired — no turn produced after activityEnd; clearing responseActive so the agent isn’t stuck silent');
                this.completeTurn();
            }
        }, GEMINI_MEETING_RESPONSE_WATCHDOG_MS);
    }

    /**
     * Runs a client-content send immediately when no turn is in flight; otherwise queues it for
     * the next turn boundary. Gemini-specific collision rule: ANY client content interrupts
     * in-flight generation on the Live API, so deferral (not skipping) is the safe default.
     */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            RealtimeDiagLog(`[GeminiRealtime][diag] send QUEUED behind in-flight turn (responseActive=true, queueLen=${this.queuedSends.length}) — will not fire until a turn boundary clears the flag`);
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
        if (this.meetingResponseWatchdog) {
            clearTimeout(this.meetingResponseWatchdog);
            this.meetingResponseWatchdog = undefined;
        }
        if (this.pendingThoughtText.trim().length > 0) {
            const text = this.pendingThoughtText;
            this.pendingThoughtText = '';
            this.transcriptHandler?.({
                Role: 'assistant',
                Text: text,
                IsFinal: true,
                Kind: 'narration',
                IsThought: true,
            });
        }
        RealtimeDiagLog(`[GeminiRealtime][diag] turn boundary — clearing responseActive (was ${this.responseActive}), draining ${this.queuedSends.length} queued send(s)`);
        this.responseActive = false;
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /** @inheritdoc */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        // Stop resuming before the socket closes, and drop events still in flight from it.
        this.resumption?.Dispose();
        this.currentConnection = 0;
        this.live?.close();
        this.live = null;
        this.avatarOutput?.Close(); // reports the avatar seconds generated and not yet reported, while the handler is set
        this.clearHandlers();
    }

    /**
     * Entry point for an inbound {@link LiveServerMessage}. Fans the message out to the focused
     * per-concern handlers so each translation unit stays small and testable.
     */
    public HandleServerMessage(message: LiveServerMessage): void {
        // Session continuity. `resumable: false` (mid-turn, mid-tool-call) arrives with no handle;
        // an update without the flag is treated as resumable.
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
            this.handleToolCall(message.toolCall.functionCalls);
        }
        if (message.usageMetadata) {
            this.handleUsage(message.usageMetadata);
        }
    }

    /**
     * Translates a {@link LiveServerContent} frame: model audio output, input/output transcription,
     * and interruption.
     */
    private handleServerContent(content: LiveServerContent): void {
        if (content.interrupted) {
            this.avatarOutput?.Interrupted(); // before the parts of this message: the turn's late media is dropped
            this.interruptionHandler?.();
            this.completeTurn();
        }
        if (content.modelTurn) {
            // First model output of a turn marks generation in flight (Gemini emits no explicit
            // "response started" frame), so interim-update sends defer instead of interrupting.
            if (!this.responseActive) {
                RealtimeDiagLog('[GeminiRealtime][diag] modelTurn — model is GENERATING output (the activityEnd worked)');
            }
            this.responseActive = true;
            this.emitModelMedia(content.modelTurn);
            this.emitThoughtOutput(content.modelTurn);
        }
        if (content.generationComplete) {
            this.avatarOutput?.GenerationComplete();
        }
        if (content.turnComplete) {
            this.avatarOutput?.TurnComplete();
            this.completeTurn();
        }
        if (content.inputTranscription) {
            this.emitTranscript('user', content.inputTranscription.text, content.inputTranscription.finished, 'normal');
        }
        if (content.outputTranscription) {
            this.emitTranscript('assistant', content.outputTranscription.text, content.outputTranscription.finished, 'normal');
        }
    }

    /**
     * Forwards the model turn's inline media parts. Thought parts (`part.thought === true`) are skipped — thoughts are
     * reasoning summaries, not synthesized media. A session with a granted avatar routes each part through its avatar
     * output (MP4 pieces to the host, PCM only before the turn's video); every other session plays PCM only.
     */
    private emitModelMedia(modelTurn: Content): void {
        for (const part of modelTurn.parts ?? []) {
            const inline = part.inlineData;
            if (part.thought || !inline?.data) {
                continue;
            }
            if (this.avatarOutput) {
                this.avatarOutput.Accept(inline.mimeType, GeminiRealtimeSession.base64ToArrayBuffer(inline.data));
            } else {
                this.emitAudioOutput(inline.mimeType, inline.data);
            }
        }
    }

    /**
     * Forwards one inline part as raw PCM. A part that names a non-PCM type (e.g. video/mp4 avatar frames) must never
     * reach the audio output, where it would play as noise. A part with no type plays, as it always has.
     */
    private emitAudioOutput(mimeType: string | undefined, data: string): void {
        if (!this.outputHandler) {
            return;
        }
        if (mimeType && !IsPcmAudioMimeType(mimeType)) {
            this.reportDroppedOutput(mimeType);
            return;
        }
        this.outputHandler(GeminiRealtimeSession.base64ToArrayBuffer(data));
    }

    /** Reports each MIME type of dropped model output once per session, not once per part. */
    private reportDroppedOutput(mimeType: string): void {
        if (this.droppedOutputTypes.has(mimeType)) {
            return;
        }
        this.droppedOutputTypes.add(mimeType);
        console.warn(`[GeminiRealtime] Dropped model output of type ${mimeType}: only PCM audio is played on this session.`);
    }

    /**
     * Extracts thought parts (`part.thought === true`) from the model turn and emits each
     * as an interim narration transcript (`Kind: 'narration'`).
     */
    private emitThoughtOutput(modelTurn: Content): void {
        if (!this.transcriptHandler || !modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            if (part.thought && part.text) {
                this.pendingThoughtText += part.text;
                this.transcriptHandler({
                    Role: 'assistant',
                    Text: part.text,
                    IsFinal: false,
                    Kind: 'narration',
                    IsThought: true,
                });
            }
        }
    }

    /**
     * Emits a transcript event, defaulting missing text to empty and `finished` to a partial update.
     */
    private emitTranscript(
        role: 'user' | 'assistant',
        text: string | undefined,
        finished: boolean | undefined,
        kind?: 'normal' | 'narration',
    ): void {
        if (!this.transcriptHandler) {
            return;
        }
        const t: RealtimeTranscript = { Role: role, Text: text ?? '', IsFinal: finished ?? false };
        if (kind === 'narration') {
            t.Kind = 'narration';
        }
        this.transcriptHandler(t);
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
     * Emits an incremental usage update, defaulting missing token counts to zero, with the per-modality breakdown
     * (text, audio, image, video) of the prompt and of the response when Google reports one. A generated avatar's tokens
     * arrive as the response's VIDEO.
     */
    private handleUsage(usageMetadata: LiveServerMessage['usageMetadata']): void {
        if (!usageMetadata) {
            return;
        }
        const inputDetails = this.modalityTokenDetails(usageMetadata.promptTokensDetails);
        const outputDetails = this.modalityTokenDetails(usageMetadata.responseTokensDetails);
        this.usageHandler?.({
            InputTokens: usageMetadata.promptTokenCount ?? 0,
            OutputTokens: usageMetadata.responseTokenCount ?? 0,
            ...(inputDetails ? { InputTokenDetails: inputDetails } : {}),
            ...(outputDetails ? { OutputTokenDetails: outputDetails } : {}),
        });
    }

    /**
     * Sums a usage report's per-modality token counts into the fields {@link GEMINI_MODALITY_TOKEN_FIELDS} names.
     * `undefined` when the report has no count for a modality the table names.
     */
    private modalityTokenDetails(counts: GeminiModalityTokenCounts): RealtimeUsageModalityDetail | undefined {
        if (!Array.isArray(counts)) {
            return undefined;
        }
        let details: RealtimeUsageModalityDetail | undefined;
        for (const count of counts) {
            const field = GEMINI_MODALITY_TOKEN_FIELDS[String(count.modality ?? '').toUpperCase()];
            if (field && typeof count.tokenCount === 'number') {
                details = details ?? {};
                details[field] = (details[field] ?? 0) + count.tokenCount;
            }
        }
        return details;
    }

    /** Drops all registered handlers so a closed session can't fire stale callbacks. */
    private clearHandlers(): void {
        this.outputHandler = null;
        this.videoFrameHandler = null;
        this.transcriptHandler = null;
        this.toolCallHandler = null;
        this.interruptionHandler = null;
        this.usageHandler = null;
        this.pendingToolCallNames.clear();
        this.queuedSends = [];
        this.responseActive = false;
        this.pendingThoughtText = '';
    }

    /** Returns the bound live session or throws if it was never attached / already closed. */
    private requireLive(): GeminiLiveSession {
        if (!this.live) {
            throw new Error('Gemini realtime session is not open (no live session attached or it was closed).');
        }
        return this.live;
    }

    /** Encodes an `ArrayBuffer` of raw bytes to a base64 string for Gemini's `Blob.data`. */
    private static arrayBufferToBase64(buffer: ArrayBuffer): string {
        return Buffer.from(new Uint8Array(buffer)).toString('base64');
    }

    /** Decodes a base64 `Blob.data` string from Gemini into a raw `ArrayBuffer`. */
    private static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        // Copy into a freshly-allocated ArrayBuffer so we never leak the surrounding Node pool buffer
        // (and so the result is a plain ArrayBuffer, not ArrayBufferLike).
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}
