// Eleven Realtime — ElevenLabs' OpenAI-Realtime-compatible speech-to-speech models.
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    RealtimeDriverFactsOf,
    type RealtimeDriverFacts,
    type ClientRealtimeSessionConfig,
    type JSONObject,
    type IRealtimeSession,
    type RealtimeSessionParams,
    type RealtimeTurnDetectionSettings,
    type RealtimeVoiceOption,
} from '@memberjunction/ai';
import {
    OpenAIRealtime,
    OpenAIRealtimeSession,
    type OpenAIRealtimeProfile,
    type IOpenAIRealtimeConnection,
    MapEffortLevelToOpenAIRealtime,
    MapNormalizedTurnDetection,
} from '@memberjunction/ai-openai';
import { OpenAI } from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeAudioInputTurnDetection } from 'openai/resources/realtime/realtime';
import type { ClientSecretCreateParams, ClientSecretCreateResponse } from 'openai/resources/realtime/client-secrets';
import { ElevenLabsPremadeVoices } from './elevenLabsVoices';

/**
 * The `openai` SDK base URL for Eleven Realtime. The SDK derives both endpoints from it:
 * `buildRealtimeURL` appends `/realtime` → `wss://api.elevenlabs.io/v1/convai/realtime?model=…`,
 * and `realtime.clientSecrets.create` posts to `…/v1/convai/realtime/client_secrets` — the two
 * endpoints ElevenLabs publishes (`@elevenlabs/elevenlabs-js` 2.74.0,
 * `conversationalAi.realtime.createClientSecret`).
 */
export const ELEVEN_REALTIME_BASE_URL = 'https://api.elevenlabs.io/v1/convai';

/** The header ElevenLabs authenticates REST calls with. It does not take `Authorization: Bearer`. */
const ELEVENLABS_API_KEY_HEADER = 'xi-api-key';

/**
 * Above this, an epoch timestamp is milliseconds rather than seconds: as seconds it would be the
 * year 5138, as milliseconds it is 1973. OpenAI's `expires_at` is seconds and the shared driver
 * multiplies by 1000; ElevenLabs types its `expires_at` as a bare number with no unit, so the
 * driver normalizes rather than trusting either reading.
 */
const EPOCH_MILLISECONDS_THRESHOLD = 1e11;

/**
 * Maps MJ's normalized `Eagerness` onto Eleven Realtime's `semantic_vad` eagerness.
 *
 * Eleven Realtime accepts `low` / `medium` / `high` only. MJ's vocabulary is `low` / `auto` /
 * `high`, and the family-wide mapper forwards it raw — so `auto` would reach ElevenLabs as a value
 * it does not define. OpenAI documents `auto` as equivalent to `medium`, which is the mapping here.
 *
 * Returns `undefined` for absent or unrecognised input, so the provider default applies.
 */
export function MapElevenRealtimeEagerness(eagerness: RealtimeTurnDetectionSettings['Eagerness']): 'low' | 'medium' | 'high' | undefined {
    switch (eagerness) {
        case 'low': return 'low';
        case 'auto': return 'medium';
        case 'high': return 'high';
        default: return undefined;
    }
}

/**
 * Builds Eleven Realtime's `audio.input.turn_detection` block.
 *
 * A normalized request maps through the family mapper with its eagerness withheld, then gets the
 * Eleven-vocabulary eagerness (see {@link MapElevenRealtimeEagerness}). With no request the block
 * is omitted so ElevenLabs' own turn-taking applies — the product's turn model is a large part of
 * why it is chosen. Meeting mode still needs `create_response: false`; `semantic_vad` is used for
 * it because it is the closer of the two documented modes to ElevenLabs' native turn model.
 */
export function BuildElevenRealtimeTurnDetection(
    disableAutoResponse: boolean,
    requested?: RealtimeTurnDetectionSettings,
): RealtimeAudioInputTurnDetection | undefined {
    const withoutEagerness: RealtimeTurnDetectionSettings | undefined = requested ? { ...requested, Eagerness: undefined } : undefined;
    const block = MapNormalizedTurnDetection(ELEVEN_REALTIME_PROFILE, disableAutoResponse, withoutEagerness);
    if (block?.type === 'semantic_vad') {
        const eagerness = MapElevenRealtimeEagerness(requested?.Eagerness);
        return eagerness ? { ...block, eagerness } : block;
    }
    if (block) {
        return block;
    }
    return disableAutoResponse ? { type: 'semantic_vad', create_response: false, interrupt_response: true } : undefined;
}

/**
 * Converts an epoch timestamp of unknown unit to seconds (see {@link EPOCH_MILLISECONDS_THRESHOLD}).
 */
export function NormalizeEpochToSeconds(epoch: number): number {
    return epoch > EPOCH_MILLISECONDS_THRESHOLD ? Math.floor(epoch / 1000) : epoch;
}

/**
 * The Eleven Realtime provider profile — the knobs the shared {@link OpenAIRealtime} protocol
 * implementation runs with. Each gate is read off ElevenLabs' published session schema
 * (`OpenAiSessionConfigInput` / `OpenAiSessionConfigOutput` in `@elevenlabs/elevenlabs-js` 2.74.0):
 *
 * - **No input-transcription model.** The models are cascaded, so the user's speech is transcribed
 *   by their own ASR stage; `audio.input.transcription` takes only a `language`, and sending
 *   OpenAI's `model` key there would be an unknown field.
 * - **No reasoning effort, no parallel tool calls.** Both are accepted on input but absent from the
 *   session the server echoes back, i.e. accepted for SDK compatibility and ignored. Max reasons
 *   internally; how hard is not a session knob. Sending them would be the transmitted-then-discarded
 *   pattern #3374 exists to prevent.
 * - **MCP tools and an output voice: yes.** Both survive into the echoed session. The voice is an
 *   ElevenLabs voice id.
 * - **`server_vad` and `semantic_vad`**, with `create_response`, so meeting mode and live
 *   reconfiguration both have a field to drive.
 */
export const ELEVEN_REALTIME_PROFILE: OpenAIRealtimeProfile = {
    providerKey: 'eleven-realtime',
    // The OpenAI GA convention — the server opens with session.created, and config sent before it
    // can be dropped. Waiting costs one frame and fails loudly on the readiness timer if it never
    // comes, where sending early would fail silently with a default prompt.
    deferInitialConfigUntilSessionCreated: true,
    foldInitialContextIntoPrompt: false,
    supportsReasoningEffort: false,
    supportsParallelToolCalls: false,
    supportsMcpTools: true,
    supportsVoiceOutput: true,
    supportsLiveReconfigure: true,
    supportsDynamicToolSet: true,
    unexpectedCloseMessage: 'Eleven Realtime connection closed unexpectedly',
    supportedTurnModes: ['serverVad', 'semanticVad'],
    buildTurnDetection: BuildElevenRealtimeTurnDetection,
    // Not consulted while supportsReasoningEffort is false.
    mapEffortLevel: MapEffortLevelToOpenAIRealtime,
};

/**
 * Eleven Realtime implementation of the {@link BaseRealtimeModel} primitive —
 * `eleven_realtime_v1_mini` and `eleven_realtime_v1_max`.
 *
 * Eleven Realtime is a **cascaded** stack (ASR → LLM → TTS with ElevenLabs' turn-taking) sold as a
 * single speech-to-speech model, and its API **follows the OpenAI Realtime spec over a WebSocket**.
 * So, like xAI's Grok Voice, this driver subclasses {@link OpenAIRealtime} and inherits the whole
 * protocol implementation — session config, tool loop, barge-in, error classification, client-direct
 * minting — with {@link ELEVEN_REALTIME_PROFILE} gating the features.
 *
 * It is a different product from {@link ElevenLabsRealtime}, which drives the ElevenLabs Agents
 * Platform's own protocol against a server-side agent. Here there is no agent to provision: the
 * session carries the prompt and tools, exactly as it does for OpenAI.
 *
 * Two things differ from OpenAI:
 *
 * 1. **Authentication.** ElevenLabs takes its API key as `xi-api-key`, never as a bearer token, and
 *    documents the realtime socket as authenticated by an ephemeral client secret passed where an
 *    OpenAI client would put its API key. So {@link mintClientSecret} sends `xi-api-key`, and the
 *    server-bridged {@link StartSession} mints a secret first and opens the socket with it — the
 *    same documented path the browser uses, rather than guessing whether the socket also accepts a
 *    raw key.
 * 2. **Turn eagerness** uses `medium` where MJ says `auto` (see {@link MapElevenRealtimeEagerness}).
 *
 * `max_duration_seconds` (an ElevenLabs extension: the server closes the session with code 1000
 * once it is exceeded) is `min(provider cap, MaxSessionSeconds, Config-bag value)` through the one
 * clamp in {@link BaseRealtimeModel}. Only a positive-integer number in the bag counts; any other
 * bag value (e.g. the string `"600"`) is ignored AND never sent as-is. With no provider cap known,
 * no host `MaxSessionSeconds` and no usable bag value the field is removed, so ElevenLabs applies
 * its own ceiling. The bag is adjusted in {@link ElevenRealtime.withClampedMaxDuration} before the
 * shared OpenAI payload builder runs, on both the mint ({@link ElevenRealtime.CreateClientSession})
 * and the server-bridged ({@link ElevenRealtime.StartSession}) paths, so no payload code is duplicated.
 *
 * Registered as `ElevenRealtime`; the matching `MJ: AI Model Vendors` rows name it as their
 * `DriverClass`.
 */
@RegisterClass(BaseRealtimeModel, 'ElevenRealtime')
export class ElevenRealtime extends OpenAIRealtime {
    /** The provider's session ceiling is not documented in-repo (`max_duration_seconds` is a per-session setting, not a ceiling), so it stays unknown. */
    public static override readonly DriverFacts: Readonly<RealtimeDriverFacts> = {
        // What BuildElevenRealtimeTurnDetection maps: serverVad/semanticVad modes, eagerness (auto becomes
        // medium, the documented equivalent), and the server-VAD threshold and silence duration.
        SupportedTurnSettings: { Mode: 'exact', Eagerness: 'exact', SilenceDurationMs: 'exact', Threshold: 'exact' },
    };

    public static override readonly SupportsDynamicToolSet = ELEVEN_REALTIME_PROFILE.supportsDynamicToolSet;

    /**
     * @param apiKey The ElevenLabs API key. It is only ever sent as `xi-api-key` to mint client
     * secrets; the realtime socket itself is opened with a minted secret.
     */
    constructor(apiKey: string) {
        super(apiKey, ELEVEN_REALTIME_BASE_URL);
    }

    /** The Eleven Realtime knobs + feature gates the shared protocol implementation runs with. */
    protected override get Profile(): OpenAIRealtimeProfile {
        return ELEVEN_REALTIME_PROFILE;
    }

    /** Returns the Eleven-branded session subclass so instanceof checks and logs stay provider-true. */
    protected override createSessionInstance(connection: IOpenAIRealtimeConnection): OpenAIRealtimeSession {
        return new ElevenRealtimeSession(connection, RealtimeDriverFactsOf(this));
    }

    /**
     * ElevenLabs' premade voices, by voice id — the voice picker's list. Any voice id in the
     * account's library also works through the Config bag's `voice` key.
     */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return ElevenLabsPremadeVoices();
    }

    /**
     * Opens a server-bridged session: mints a client secret for the model, opens the socket with
     * it, then applies the full session config as the shared driver does. The minted secret carries
     * only the model — the prompt and tools arrive in the `session.update` that follows, as on every
     * driver in the family.
     */
    public override async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const secret = await this.mintClientSecret({ session: { type: 'realtime', model: params.Model } });
        const connection = this.createAuthenticatedConnection(params.Model, secret.value);
        const session = this.createSessionInstance(connection);
        session.applyInitialConfig(this.withClampedMaxDuration(params));
        return session;
    }

    /**
     * Client-direct mint: the shared OpenAI flow, with `max_duration_seconds` clamped first (see {@link withClampedMaxDuration}).
     * The clamp is computed once: when it yields a wire value, that same value becomes `MaxSessionSeconds` for the
     * shared flow, so the ClientConfig reports exactly what went on the wire (bag clamp included).
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const clamped = this.withClampedMaxDuration(params);
        const wireValue = (clamped.Config as JSONObject | undefined)?.['max_duration_seconds'];
        return super.CreateClientSession(typeof wireValue === 'number' ? { ...clamped, MaxSessionSeconds: wireValue } : clamped);
    }

    /**
     * Returns `params` with the Config bag's `max_duration_seconds` replaced by
     * `min(provider cap, params.MaxSessionSeconds, bag value)`, or removed when none of those is a
     * usable positive integer (a non-number bag value is dropped, never forwarded). The caller's
     * bag is copied, not mutated.
     */
    private withClampedMaxDuration(params: RealtimeSessionParams): RealtimeSessionParams {
        const { max_duration_seconds: bagValue, ...bag } = (params.Config ?? {}) as JSONObject;
        const clamped = this.ClampSessionSeconds(
            RealtimeDriverFactsOf(this).ProviderMaxSessionSeconds,
            params.MaxSessionSeconds,
            typeof bagValue === 'number' ? bagValue : undefined,
        );
        return { ...params, Config: clamped === undefined ? bag : { ...bag, max_duration_seconds: clamped } };
    }

    /**
     * Mints an Eleven Realtime client secret. The `openai` client already resolves the right URL and
     * types the request and response; this only swaps the bearer header for `xi-api-key`, and reads
     * `expires_at` in seconds whichever unit ElevenLabs returns it in.
     */
    protected override async mintClientSecret(body: ClientSecretCreateParams): Promise<ClientSecretCreateResponse> {
        const response = await this.OpenAI.realtime.clientSecrets.create(body, {
            headers: { [ELEVENLABS_API_KEY_HEADER]: this.apiKey, Authorization: null },
        });
        return { ...response, expires_at: NormalizeEpochToSeconds(response.expires_at) };
    }

    /**
     * Opens the realtime socket authenticated by a minted client secret. The SDK puts the secret in
     * the `openai-insecure-api-key.` subprotocol — the "use the OpenAI SDK as is" path ElevenLabs
     * documents. Overridable seam: unit tests return a fake connection.
     */
    protected createAuthenticatedConnection(model: string, clientSecret: string): IOpenAIRealtimeConnection {
        const client = new OpenAI({ apiKey: clientSecret, baseURL: ELEVEN_REALTIME_BASE_URL });
        return new OpenAIRealtimeWebSocket({ model }, client);
    }
}

/**
 * Live realtime session for Eleven Realtime — the shared {@link OpenAIRealtimeSession} protocol
 * implementation bound to {@link ELEVEN_REALTIME_PROFILE}. A named subclass so tests and logs can
 * tell Eleven sessions apart.
 */
export class ElevenRealtimeSession extends OpenAIRealtimeSession {
    /**
     * @param connection The provider connection (a real `OpenAIRealtimeWebSocket` in production, a
     * fake in tests).
     * @param driverFacts The creating driver's static facts; defaults to Eleven Realtime's for direct construction.
     */
    constructor(connection: IOpenAIRealtimeConnection, driverFacts: Readonly<RealtimeDriverFacts> = ElevenRealtime.DriverFacts) {
        super(connection, ELEVEN_REALTIME_PROFILE, driverFacts);
    }
}
