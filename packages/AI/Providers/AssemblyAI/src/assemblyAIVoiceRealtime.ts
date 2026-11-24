// AssemblyAI voice: speech to text, LLM Gateway and text to speech, run as one realtime model.
import { randomUUID } from 'node:crypto';
import {
    BaseRealtimeModel,
    RealtimeDriverFactsOf,
    RealtimeProxyRegistry,
    REALTIME_PROXY_PATH,
    ResolveRealtimeProxyBaseWsUrl,
    ResolveRealtimeTiming,
    type ClientRealtimeSessionConfig,
    type JSONObject,
    type IRealtimeInProcessUpstream,
    type IRealtimeSession,
    type JSONValue,
    type RealtimeDriverFacts,
    type RealtimeInProcessPeer,
    type RealtimeSessionParams,
    type RealtimeTurnDetectionSettings,
    type RealtimeVoiceOption,
} from '@memberjunction/ai';
import { BaseSingleton, RegisterClass } from '@memberjunction/global';
import {
    ExtractRealtimeFeatures,
    MapEffortLevelToOpenAIRealtime,
    OpenAIRealtime,
    OpenAIRealtimeSession,
    type IOpenAIRealtimeConnection,
    type OpenAIRealtimeProfile,
} from '@memberjunction/ai-openai';
import { AssemblyAILLMGateway, ASSEMBLYAI_DEFAULT_LLM } from './voice/assemblyAILLMGateway';
import { ASSEMBLYAI_STT_MODEL, OpenAssemblyAISTT, type AssemblyAISTTMode } from './voice/assemblyAIStreamingSTT';
import { OpenAssemblyAITTS } from './voice/assemblyAIStreamingTTS';
import { OpenAssemblyAISocket } from './voice/assemblyAISocket';
import { AssemblyAIVoicePipeline, type VoicePipelineProviders } from './voice/assemblyAIVoicePipeline';
import { InProcessRealtimeConnection } from './voice/inProcessRealtimeConnection';

/** The key of the browser driver for these sessions. */
export const ASSEMBLYAI_VOICE_PROVIDER_KEY = 'assemblyai-voice';

/** PCM16 mono rate in both directions: the OpenAI Realtime default, which TTS also produces natively. */
export const ASSEMBLYAI_VOICE_SAMPLE_RATE = 24000;

/** The voice used when none is chosen. */
export const ASSEMBLYAI_DEFAULT_VOICE = 'aai-kyla';

/** How long a browser has to connect with its one-time ticket, in seconds. */
export const ASSEMBLYAI_VOICE_TICKET_TTL_SECONDS = 300;

/** A text-to-speech session ends after an hour, so MJ moves the call to new connections before that. */
const CONNECTION_MAX_SECONDS = 3600;

/** How long past that a connection may live if the browser has not moved, in seconds: nothing may bill forever. */
const CONNECTION_OVERRUN_SECONDS = 120;

/** The pact key that says which call a connection belongs to. */
const CALL_ID_KEY = 'callID';

/** A library voice's slug, or the UUID of a library or cloned voice. */
const VOICE_ID_PATTERN = /^(?:aai-[a-z0-9-]+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

/** What one call runs with, read from the session params. */
export interface AssemblyAIVoiceSettings {
    SpeechModel: string;
    LLMModel: string;
    VoiceID: string;
    Mode: AssemblyAISTTMode;
    MaxTurnSilenceMs?: number;
    VadThreshold?: number;
    Keyterms: string[];
    FirstMessage?: string;
    AutoRespond: boolean;
}

/** MJ's patient / normal / eager dial, as AssemblyAI's turn presets. */
const MODE_BY_EAGERNESS: Record<NonNullable<RealtimeTurnDetectionSettings['Eagerness']>, AssemblyAISTTMode> = {
    low: 'max_accuracy',
    auto: 'balanced',
    high: 'min_latency',
};

/**
 * Reads a call's settings from its params. Config keys: `voice`, `llmModel`, `keyterms`, `firstMessage`,
 * `disableAutoResponse`, and the normalized `turnDetection`.
 */
export function BuildAssemblyAIVoiceSettings(params: RealtimeSessionParams): AssemblyAIVoiceSettings {
    const config = params.Config ?? {};
    const features = ExtractRealtimeFeatures(params.Config);
    const turn = features.turnDetection;
    return {
        SpeechModel: params.Model.startsWith('assemblyai-stt-') ? params.Model : ASSEMBLYAI_STT_MODEL,
        LLMModel: trimmedText(config['llmModel']) ?? ASSEMBLYAI_DEFAULT_LLM,
        VoiceID: resolveVoice(features.voice),
        Mode: MODE_BY_EAGERNESS[turn?.Eagerness ?? 'auto'],
        MaxTurnSilenceMs: turn?.SilenceDurationMs,
        VadThreshold: turn?.Threshold,
        Keyterms: textList(config['keyterms']),
        FirstMessage: trimmedText(config['firstMessage']),
        AutoRespond: !features.disableAutoResponse,
    };
}

/**
 * MJ matches voice settings to a driver by name prefix, so `assemblyai` settings written for the Voice Agent API (its
 * voices are plain names) reach this driver too. The provider refuses a session with an unknown voice, so those fall
 * back to the default rather than fail the call.
 */
function resolveVoice(voice: string | undefined): string {
    if (!voice || VOICE_ID_PATTERN.test(voice)) {
        return voice ?? ASSEMBLYAI_DEFAULT_VOICE;
    }
    console.warn(`AssemblyAIVoiceRealtime: '${voice}' is not an AssemblyAI text-to-speech voice; using '${ASSEMBLYAI_DEFAULT_VOICE}'`);
    return ASSEMBLYAI_DEFAULT_VOICE;
}

function trimmedText(value: JSONValue | undefined): string | undefined {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length > 0 ? text : undefined;
}

function textList(value: JSONValue | undefined): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Params for a connection that continues a call: it has been greeted already. */
function withoutFirstMessage(params: RealtimeSessionParams): RealtimeSessionParams {
    const { firstMessage: _said, ...config } = params.Config ?? {};
    return { ...params, Config: config };
}

/** Params for a connection opened some time after its call began: the session cap counts from the beginning. */
function withRemainingTime(params: RealtimeSessionParams, maxSessionSeconds: number | undefined, beganAtMs: number): RealtimeSessionParams {
    if (maxSessionSeconds === undefined) {
        return params;
    }
    const elapsedSeconds = Math.floor((Date.now() - beganAtMs) / 1000);
    return { ...params, MaxSessionSeconds: Math.max(1, maxSessionSeconds - elapsedSeconds) };
}

/**
 * The browser connection each call runs on. A reconnect opens a second one while the first may still be billing, so the
 * first ends as soon as the second is ready, whether or not the browser closes it.
 */
class AssemblyAIVoiceCalls extends BaseSingleton<AssemblyAIVoiceCalls> {
    private readonly live = new Map<string, RealtimeInProcessPeer>();

    protected constructor() {
        super();
    }

    public static get Instance(): AssemblyAIVoiceCalls {
        return super.getInstance<AssemblyAIVoiceCalls>();
    }

    public Ready(callID: string, peer: RealtimeInProcessPeer): void {
        const previous = this.live.get(callID);
        this.live.set(callID, peer);
        if (previous && previous !== peer) {
            previous.Close(1000, 'Replaced by a new connection');
        }
    }

    public Ended(callID: string, peer: RealtimeInProcessPeer): void {
        if (this.live.get(callID) === peer) {
            this.live.delete(callID);
        }
    }
}

/** How the shared OpenAI-protocol session drives the pipeline. */
export const ASSEMBLYAI_VOICE_PROFILE: OpenAIRealtimeProfile = {
    providerKey: ASSEMBLYAI_VOICE_PROVIDER_KEY,
    // The pipeline transcribes; there is no separate transcription model to name.
    inputTranscriptionModel: undefined,
    deferInitialConfigUntilSessionCreated: true,
    foldInitialContextIntoPrompt: true,
    supportsReasoningEffort: false,
    supportsParallelToolCalls: false,
    supportsMcpTools: false,
    // The voice is fixed when the pipeline opens.
    supportsVoiceOutput: false,
    supportsLiveReconfigure: true,
    supportsDynamicToolSet: true,
    responseInstructionsAddToPrompt: true,
    unexpectedCloseMessage: 'AssemblyAI voice connection closed unexpectedly',
    // Turn settings go to speech to text when the pipeline opens, not over the protocol.
    supportedTurnModes: [],
    buildTurnDetection: (disableAutoResponse) =>
        disableAutoResponse ? { type: 'server_vad', create_response: false, interrupt_response: true } : undefined,
    mapEffortLevel: MapEffortLevelToOpenAIRealtime,
};

/**
 * AssemblyAI's current voice stack as a realtime model: STT 3.7 Realtime Agent hears, an LLM Gateway model thinks, and
 * TTS-1 speaks, on one AssemblyAI key. AssemblyAI sells the three separately and leaves the conversation to the caller,
 * so {@link AssemblyAIVoicePipeline} runs it inside MJAPI and speaks the OpenAI Realtime protocol. This replaces the
 * Voice Agent API that {@link AssemblyAIRealtime} drives, which AssemblyAI is retiring.
 *
 * - Browser sessions ({@link CreateClientSession}): the browser gets a one-time ticket for MJAPI's realtime proxy, whose
 *   upstream is a pipeline in this process. The prompt, tools and key never leave the server.
 * - Server sessions ({@link StartSession}): the shared OpenAI-protocol session over an in-memory connection.
 *
 * `Model` names the speech-to-text model. The LLM is the `llmModel` Config key.
 */
@RegisterClass(BaseRealtimeModel, 'AssemblyAIVoiceRealtime')
export class AssemblyAIVoiceRealtime extends OpenAIRealtime {
    public static override readonly DriverFacts: Readonly<RealtimeDriverFacts> = {
        SupportedTurnSettings: { Eagerness: 'approximate', SilenceDurationMs: 'exact', Threshold: 'exact' },
    };

    public static override readonly SupportsDynamicToolSet = ASSEMBLYAI_VOICE_PROFILE.supportsDynamicToolSet;

    /** @param apiKey The AssemblyAI API key (`AI_VENDOR_API_KEY__AssemblyAIVoiceRealtime`). */
    constructor(apiKey: string) {
        super(apiKey);
    }

    protected override get Profile(): OpenAIRealtimeProfile {
        return ASSEMBLYAI_VOICE_PROFILE;
    }

    public override get DefaultCallDurationSeconds(): number | undefined {
        return CONNECTION_MAX_SECONDS;
    }

    public override get TrustsNativeResumption(): boolean {
        return false;
    }

    /** A few of AssemblyAI's library voices. Any library or cloned voice also works through the `voice` Config key. */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return [
            { ID: 'aai-kyla', Name: 'Kyla' },
            { ID: 'aai-yasmin', Name: 'Yasmin' },
            { ID: 'aai-renae', Name: 'Renae' },
            { ID: 'aai-dewitt', Name: 'Dewitt' },
            { ID: 'aai-hank', Name: 'Hank' },
            { ID: 'aai-bradford', Name: 'Bradford' },
        ];
    }

    /** Opens a server session. Resolves once it can hear, speak and has its config; rejects with nothing left open. */
    public override async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const startedAtMs = Date.now();
        // Opened without tools: the session sends the current ones, and sends none when they were all removed.
        const open = (from: RealtimeSessionParams): IOpenAIRealtimeConnection =>
            new InProcessRealtimeConnection((peer) => this.openPipeline(peer, { ...from, Tools: [] }, { AcceptSessionUpdates: true }));
        const session = new AssemblyAIVoiceRealtimeSession(open(params), RealtimeDriverFactsOf(this), this);
        const maxSessionSeconds = this.ClampSessionSeconds(params.MaxSessionSeconds);
        session.SetConnectionFactory(() => open(withRemainingTime(withoutFirstMessage(params), maxSessionSeconds, startedAtMs)));
        session.applyInitialConfig(params);
        try {
            await session.WaitForConfigApplied();
        } catch (err) {
            await session.Close();
            throw err;
        }
        return session;
    }

    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /** Mints a browser session: a one-time proxy ticket whose call runs here, with the config the server decided. */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        return this.mintClientSession(params, randomUUID());
    }

    /** Mints a new connection for a call in progress, which replaces the old one once it is ready. */
    public override async RefreshClientSessionCredential(
        params: RealtimeSessionParams,
        existingSessionConfig?: JSONObject | null
    ): Promise<ClientRealtimeSessionConfig> {
        const callID = trimmedText(existingSessionConfig?.[CALL_ID_KEY]) ?? randomUUID();
        return this.mintClientSession(withoutFirstMessage(params), callID);
    }

    private mintClientSession(params: RealtimeSessionParams, callID: string): ClientRealtimeSessionConfig {
        const maxSessionSeconds = this.ClampSessionSeconds(params.MaxSessionSeconds);
        const mintedAtMs = Date.now();
        const ticket = RealtimeProxyRegistry.Instance.Issue({
            OpenInProcess: (peer) => this.openBrowserCall(peer, withRemainingTime(params, maxSessionSeconds, mintedAtMs), callID),
            UserID: params.UserID,
            DriverClass: this.constructor.name,
            TTLSeconds: Math.min(ASSEMBLYAI_VOICE_TICKET_TTL_SECONDS, maxSessionSeconds ?? ASSEMBLYAI_VOICE_TICKET_TTL_SECONDS),
        });
        const timing = ResolveRealtimeTiming({
            Config: params.Config,
            DriverDefaultConnectionSeconds: this.DefaultCallDurationSeconds,
            DriverDefaultBufferSeconds: this.ReconnectBufferSeconds,
            DefaultTrustNativeResumption: this.ClientSessionTrustsNativeResumption('direct'),
            ZeroDataRetention: params.ZeroDataRetention,
        });
        return {
            Provider: ASSEMBLYAI_VOICE_PROVIDER_KEY,
            Model: params.Model,
            EphemeralToken: `${ResolveRealtimeProxyBaseWsUrl(params)}${REALTIME_PROXY_PATH}?ticket=${encodeURIComponent(ticket.ID)}`,
            ExpiresAt: ticket.ExpiresAt,
            SessionConfig: { sampleRate: ASSEMBLYAI_VOICE_SAMPLE_RATE, [CALL_ID_KEY]: callID },
            ServerHeldConfig: true,
            MaxSessionSeconds: maxSessionSeconds,
            ...(timing.ConnectionMaxSeconds !== undefined ? { ConnectionMaxSeconds: timing.ConnectionMaxSeconds } : {}),
            ReconnectBufferSeconds: timing.ReconnectBufferSeconds,
            TrustNativeResumption: timing.TrustNativeResumption,
        };
    }

    private openBrowserCall(peer: RealtimeInProcessPeer, params: RealtimeSessionParams, callID: string): IRealtimeInProcessUpstream {
        const calls = AssemblyAIVoiceCalls.Instance;
        const pipeline = this.openPipeline(peer, params, { AcceptSessionUpdates: false, OnReady: () => calls.Ready(callID, peer) });
        return {
            Receive: (frame) => pipeline.Receive(frame),
            Closed: () => {
                calls.Ended(callID, peer);
                pipeline.Closed();
            },
        };
    }

    private openPipeline(
        peer: RealtimeInProcessPeer,
        params: RealtimeSessionParams,
        options: { AcceptSessionUpdates: boolean; OnReady?: () => void }
    ): AssemblyAIVoicePipeline {
        const settings = BuildAssemblyAIVoiceSettings(params);
        const context = params.InitialContext?.trim();
        const pipeline = new AssemblyAIVoicePipeline(
            peer,
            {
                Instructions: context ? `${params.SystemPrompt}\n\n## Prior context\n${context}` : params.SystemPrompt,
                Tools: params.Tools ?? [],
                LLMModel: settings.LLMModel,
                SampleRate: ASSEMBLYAI_VOICE_SAMPLE_RATE,
                AutoRespond: settings.AutoRespond,
                ...options,
                FirstMessage: settings.FirstMessage,
                MaxSessionSeconds: this.ClampSessionSeconds(params.MaxSessionSeconds),
                MaxConnectionSeconds: CONNECTION_MAX_SECONDS + CONNECTION_OVERRUN_SECONDS,
            },
            this.createProviders(settings)
        );
        pipeline.Start();
        return pipeline;
    }

    /** The three services for one call. The seam tests replace. */
    protected createProviders(settings: AssemblyAIVoiceSettings): VoicePipelineProviders {
        const gateway = AssemblyAILLMGateway.ForKey(this.apiKey);
        return {
            OpenSTT: (handlers, signal) =>
                OpenAssemblyAISTT(
                    {
                        APIKey: this.apiKey,
                        SpeechModel: settings.SpeechModel,
                        SampleRate: ASSEMBLYAI_VOICE_SAMPLE_RATE,
                        Mode: settings.Mode,
                        MaxTurnSilenceMs: settings.MaxTurnSilenceMs,
                        VadThreshold: settings.VadThreshold,
                        Keyterms: settings.Keyterms,
                    },
                    handlers,
                    OpenAssemblyAISocket,
                    signal
                ),
            OpenTTS: (handlers, signal) =>
                OpenAssemblyAITTS({ APIKey: this.apiKey, VoiceID: settings.VoiceID, SampleRate: ASSEMBLYAI_VOICE_SAMPLE_RATE }, handlers, OpenAssemblyAISocket, signal),
            StreamLLM: (request, signal) => gateway.Stream(request, signal),
        };
    }
}

/** The shared OpenAI-protocol session, bound to this provider so logs and checks name it. */
export class AssemblyAIVoiceRealtimeSession extends OpenAIRealtimeSession {
    constructor(
        connection: IOpenAIRealtimeConnection,
        driverFacts: Readonly<RealtimeDriverFacts> = AssemblyAIVoiceRealtime.DriverFacts,
        model?: BaseRealtimeModel
    ) {
        super(connection, ASSEMBLYAI_VOICE_PROFILE, driverFacts, model);
    }
}
