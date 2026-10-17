import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeModel, RealtimeVoiceOption } from '@memberjunction/ai';
import {
    OpenAIRealtime,
    OpenAIRealtimeSession,
    OpenAIRealtimeProfile,
    IOpenAIRealtimeConnection,
    MapEffortLevelToOpenAIRealtime,
    MapNormalizedTurnDetection,
} from '@memberjunction/ai-openai';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';

/**
 * xAI's Grok Voice Agent API is OpenAI-Realtime-API compatible. Pointing the `openai` SDK's
 * client at this base URL makes its realtime WebSocket builder (`buildRealtimeURL`) derive the
 * provider socket — `wss://api.x.ai/v1/realtime?model=…` — directly from `client.baseURL`, so the
 * driver inherits the SDK's entire battle-tested OpenAI-realtime event protocol for free.
 */
const XAI_BASE_URL = 'https://api.x.ai/v1';

/**
 * The ASR model used to transcribe the USER's audio input. Grok Voice (like OpenAI Realtime)
 * accepts audio natively, so input transcription is a separate, opt-in pass — without it only the
 * assistant-side transcripts flow. Opting in server-bridged keeps the {@link IRealtimeSession}
 * contract's promise of BOTH-role transcripts.
 *
 * `grok-transcribe` is xAI's own realtime ASR (the `grok-voice-transcribe` family) and the only model
 * that honors the `language_hint` and `keyterms` this profile sends; it streams the user caption as
 * cumulative `conversation.item.input_audio_transcription.updated` snapshots before the final
 * `.completed`, which {@link xAIRealtimeSession} folds into the same in-place caption the repeated
 * `.completed` frames already produced. Deployments may override it via the session
 * {@link RealtimeSessionParams.Config} bag (`inputTranscriptionModel`).
 */
const XAI_INPUT_TRANSCRIPTION_MODEL = 'grok-transcribe';

/** The cumulative user-transcription snapshot xAI streams before the final `.completed` (not in the OpenAI SDK union). */
const XAI_TRANSCRIPTION_UPDATED_EVENT = 'conversation.item.input_audio_transcription.updated';

/** The field of an xAI {@link XAI_TRANSCRIPTION_UPDATED_EVENT} frame the session reads: the caption so far. */
interface XaiTranscriptionUpdatedFields {
    transcript?: string;
}

/**
 * Grok Voice's built-in voices. IDs are case-insensitive on the wire, and the endpoint also takes
 * custom voice IDs from xAI's Custom Voices API, so a configured voice outside this list is sent as
 * is — this list only feeds the voice picker. Absent a configured voice, xAI uses its default (`eve`).
 */
export const XAI_REALTIME_VOICES: readonly string[] = [
    'ara', 'eve', 'leo', 'rex', 'sal',
    'altair', 'atlas', 'carina', 'castor', 'celeste', 'cosmo', 'helios', 'helix', 'iris', 'kepler',
    'lumen', 'luna', 'lux', 'naksh', 'orion', 'perseus', 'rigel', 'sirius', 'ursa', 'zagan', 'zenith',
];

/**
 * Maps MJ's normalized effort level onto Grok Voice's reasoning switch. Grok Voice has exactly two
 * levels: `high` (reasoning on — the model's default) and `none` (reasoning off, for faster turns).
 *
 * `none`, `minimal`, and a numeric value of 1–20 (the band OpenAI's mapping calls `minimal`) turn
 * reasoning OFF — each asks for the least thinking the model offers. Every other recognized level
 * turns it on. Unrecognized values return `undefined` and are dropped with a diag log, never sent raw.
 *
 * @param effortLevel The MJ-normalized effort level (numeric 1–100 or named), or a provider-native `high`/`none`.
 * @returns `'high'`, `'none'`, or `undefined` when the value cannot be mapped.
 */
export function MapEffortLevelToGrokRealtime(effortLevel: string): 'high' | 'none' | undefined {
    const named = effortLevel.trim().toLowerCase();
    if (named === 'none') {
        return 'none';
    }
    const openAILevel = MapEffortLevelToOpenAIRealtime(named);
    if (!openAILevel) {
        return undefined;
    }
    return openAILevel === 'minimal' ? 'none' : 'high';
}

/**
 * Function names each provider-hosted xAI tool answers to once enabled. A client function with one
 * of these names makes the first `response.create` fail with `server_error` (measured against
 * `grok-voice-latest` by the LiveKit xAI plugin), so the shared driver drops the colliding hosted
 * tool instead.
 */
const XAI_PROVIDER_TOOL_RESERVED_NAMES: Readonly<Record<string, readonly string[]>> = {
    web_search: ['web_search', 'browse_page'],
    x_search: ['x_keyword_search', 'x_semantic_search', 'x_user_search', 'x_thread_fetch'],
    file_search: ['collections_search', 'file_search'],
};

/**
 * The Grok Voice provider profile — the per-provider knobs the shared {@link OpenAIRealtime}
 * protocol implementation runs with when driving xAI.
 *
 * Where Grok Voice departs from OpenAI's GA wire shape, and what it adds (verified against the
 * LiveKit, Pipecat and Pydantic AI xAI integrations, which all agree):
 * - `voice` and `turn_detection` sit at the session TOP LEVEL, not under `audio`;
 * - reasoning is a switch, `reasoning.effort` `high` | `none` ({@link MapEffortLevelToGrokRealtime});
 * - output speed is `audio.output.speed`, 0.7–1.5;
 * - `grok-transcribe` takes a BCP-47 `language_hint` and up to 100 `keyterms` of 50 characters;
 * - server VAD takes `idle_timeout_ms`, after which the model re-engages the user;
 * - xAI hosts `web_search`, `x_search` and `file_search` (collections) tools, plus remote MCP servers.
 *
 * `parallel_tool_calls` stays OFF: no xAI integration documents it for Grok Voice.
 */
export const XAI_REALTIME_PROFILE: OpenAIRealtimeProfile = {
    providerKey: 'xai',
    inputTranscriptionModel: XAI_INPUT_TRANSCRIPTION_MODEL,
    // xAI's socket accepts session.update immediately after connect (observed in production), so
    // the config is sent synchronously — honoring driver obligation #7 ("Ready" only after the
    // session config is applied) without waiting on a session.created frame.
    deferInitialConfigUntilSessionCreated: false,
    foldInitialContextIntoPrompt: false,
    supportsReasoningEffort: true,
    supportsParallelToolCalls: false,
    supportsMcpTools: true,
    supportsVoiceOutput: true,
    audioControlsPlacement: 'sessionTopLevel',
    supportsIdleTimeout: true,
    voiceSpeedRange: { min: 0.7, max: 1.5 },
    supportsTranscriptionLanguageHint: true,
    transcriptionKeyterms: { maxCount: 100, maxLength: 50 },
    providerToolReservedNames: XAI_PROVIDER_TOOL_RESERVED_NAMES,
    supportsLiveReconfigure: true,
    supportsDynamicToolSet: true,
    unexpectedCloseMessage: 'xAI Grok Voice realtime connection closed unexpectedly',
    // server_vad is the only turn mode xAI documents on Grok Voice (through Grok Voice 3.0). Grok is
    // NOT full-duplex in MJ's sense — it does not listen while it speaks or backchannel; it takes turns
    // on server VAD with barge-in — so the catalog leaves `FullDuplex` off. If xAI ships a native
    // duplex/smarter turn mode, add 'native' here and extend the mapping below — the model CATALOG
    // then opts models in via ModelConfiguration metadata, with no further driver changes.
    supportedTurnModes: ['serverVad'],
    // Explicit server-VAD with create_response is REQUIRED on Grok: without it the model hears +
    // transcribes the user (speech_started + input_audio_transcription.* arrive) but never
    // auto-generates a reply — no response.created/audio. Meeting mode (disableAutoResponse) keeps
    // detection but hands the speak decision to the bridge. A normalized request maps first
    // (serverVad tuning knobs apply); the required explicit block is the unconditional fallback.
    buildTurnDetection: (disableAutoResponse, requested) =>
        MapNormalizedTurnDetection(XAI_REALTIME_PROFILE, disableAutoResponse, requested)
        ?? {
            type: 'server_vad',
            create_response: !disableAutoResponse,
            interrupt_response: true,
        },
    mapEffortLevel: MapEffortLevelToGrokRealtime,
};

/**
 * Minimal connection surface the {@link xAIRealtime} driver depends on.
 *
 * This is the **injectable seam** for testing. It is a structural subset of the SDK's
 * `OpenAIRealtimeWebSocket` (which extends `OpenAIRealtimeEmitter`): the driver only ever uses
 * `on`, `off`, `send`, and `close`. Because the driver creates its connection through the
 * overridable {@link OpenAIRealtime.createConnection} method, unit tests subclass the driver and
 * return a fake connection implementing this interface — no network and no real WebSocket.
 *
 * The shape is structurally identical to the OpenAI provider's `IOpenAIRealtimeConnection`
 * because Grok Voice speaks the same wire protocol; it is redeclared here (not re-exported from
 * the OpenAI provider) to keep this package's public surface self-contained per the no-re-exports
 * rule — structural typing makes the two interchangeable.
 */
export interface IxAIRealtimeConnection {
    /**
     * Registers a listener for a server event type (`'event'` for the catch-all firehose).
     *
     * Return type is `void` because the driver never uses the chained return value, even though the
     * SDK's `EventEmitter` returns `this` for chaining. A void-returning method is assignable from a
     * value-returning one, so a real `OpenAIRealtimeWebSocket` still satisfies this interface.
     */
    on(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    /**
     * Registers a listener for connection errors. The SDK routes BOTH transport-level failures
     * (socket error, unparseable frame, failed send — `error.error` is undefined) and provider
     * `error` server frames (`error.error` carries the payload) through this channel; the driver
     * classifies fatality from that distinction.
     */
    on(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    /** Removes a previously-registered listener. See {@link IxAIRealtimeConnection.on} re: return type. */
    off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    /** Removes a previously-registered error listener. */
    off(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    /** Sends a client event to the realtime API. */
    send(event: RealtimeClientEvent): void;
    /** Closes the underlying socket. */
    close(props?: { code: number; reason: string }): void;
    /**
     * Optional raw WebSocket surface (present on the real `OpenAIRealtimeWebSocket`, which exposes
     * its underlying `socket`). Used solely to detect UNEXPECTED closure — the SDK emitter has no
     * close event of its own. The driver feature-detects; fakes may omit it.
     */
    socket?: { addEventListener(type: 'close', listener: () => void): void };
}

/**
 * xAI Grok Voice implementation of the {@link BaseRealtimeModel} primitive.
 *
 * xAI's Grok Voice Agent API is **OpenAI-Realtime-API compatible** (WebSocket endpoint
 * `wss://api.x.ai/v1/realtime`, Base64-encoded PCM16 @ 24 kHz audio, the same client/server event
 * protocol and tool-calling shape) apart from the differences {@link XAI_REALTIME_PROFILE} lists.
 * Every Grok Voice generation (`grok-voice`, Think Fast 2.0, `grok-voice-3.0`) runs on this driver;
 * the model is chosen by the catalog's API name, which rides the socket URL. This driver therefore **subclasses {@link OpenAIRealtime}**
 * with the SDK client pointed at xAI's base URL — inheriting the shared protocol implementation
 * (session config, tool loop, barge-in gating, error classification, client-direct minting) and
 * every future GA feature, gated per-provider by {@link XAI_REALTIME_PROFILE}, instead of
 * maintaining a near-identical clone of the driver.
 *
 * **Tool results** complete the tool-call loop: the returned session implements the Core
 * `IRealtimeSession.SendToolResult` contract method, which the agent layer calls after executing a
 * tool to feed its result back to the model.
 *
 * Registered as `GrokRealtime` via `@RegisterClass(BaseRealtimeModel, 'GrokRealtime')`; the
 * associated `MJ: AI Model` is typed with the `Realtime` `AIModelType`.
 */
@RegisterClass(BaseRealtimeModel, 'GrokRealtime')
export class xAIRealtime extends OpenAIRealtime {  // case-violation-ok-legacy-back-compat: the vendor spells its own name "xAI"; this identifier is also the class-factory registration key
    public static override readonly SupportsDynamicToolSet = XAI_REALTIME_PROFILE.supportsDynamicToolSet;

    /**
     * @param apiKey The xAI API key used to authenticate the Grok Voice realtime socket.
     */
    constructor(apiKey: string) {
        // Reuse the OpenAI SDK with the base URL redirected to xAI — the SDK's buildRealtimeURL()
        // derives the wss:// realtime endpoint from client.baseURL, so this is all that is needed
        // to target Grok Voice over the OpenAI-realtime-compatible protocol.
        super(apiKey, XAI_BASE_URL);
    }

    /** The Grok Voice knobs + GA feature gates the shared protocol implementation runs with. */
    protected override get Profile(): OpenAIRealtimeProfile {
        return XAI_REALTIME_PROFILE;
    }

    /** Returns the xAI-branded session subclass so instanceof checks and logs stay provider-true. */
    protected override createSessionInstance(connection: IOpenAIRealtimeConnection): OpenAIRealtimeSession {
        return new xAIRealtimeSession(connection);
    }

    /** Grok Voice's built-in voices ({@link XAI_REALTIME_VOICES}), replacing the OpenAI list this class would inherit. */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return XAI_REALTIME_VOICES.map((id) => ({ ID: id, Name: id.charAt(0).toUpperCase() + id.slice(1) }));
    }
}

/**
 * Live realtime session for Grok Voice — the shared {@link OpenAIRealtimeSession} protocol
 * implementation bound to {@link XAI_REALTIME_PROFILE}. Exists as a named subclass so tests and
 * logs identify xAI sessions, and so direct construction (`new xAIRealtimeSession(connection)`)
 * keeps working exactly as it did when this was a standalone clone.
 */
export class xAIRealtimeSession extends OpenAIRealtimeSession {  // case-violation-ok-legacy-back-compat: the vendor spells its own name "xAI"; this identifier is also the class-factory registration key
    /**
     * @param connection The injectable provider-connection seam (a real `OpenAIRealtimeWebSocket`
     * in production, a fake in tests).
     */
    constructor(connection: IxAIRealtimeConnection) {
        super(connection, XAI_REALTIME_PROFILE);
    }

    /**
     * @inheritdoc
     *
     * Adds xAI's streamed user caption: each cumulative `input_audio_transcription.updated` snapshot
     * goes through the same handling as the repeated `.completed` frames Grok already sends, which
     * collapses them into ONE in-place caption per turn. The final `.completed` then replaces it.
     */
    protected override dispatch(event: RealtimeServerEvent): void {
        const eventType: string = event.type;
        if (eventType !== XAI_TRANSCRIPTION_UPDATED_EVENT) {
            super.dispatch(event);
            return;
        }
        const transcript = (event as RealtimeServerEvent & XaiTranscriptionUpdatedFields).transcript;
        if (typeof transcript === 'string' && transcript.trim().length > 0) {
            this.handleUserTranscription(transcript);
        }
    }
}
