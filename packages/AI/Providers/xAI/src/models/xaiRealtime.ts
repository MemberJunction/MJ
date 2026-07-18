import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeModel, RealtimeVoiceOption } from '@memberjunction/ai';
import {
    OpenAIRealtime,
    OpenAIRealtimeSession,
    OpenAIRealtimeProfile,
    IOpenAIRealtimeConnection,
    MapEffortLevelToOpenAIRealtime,
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
 * contract's promise of BOTH-role transcripts. The value mirrors OpenAI's input-transcription
 * model name because the Grok Voice API is OpenAI-Realtime-compatible and accepts the same
 * `audio.input.transcription.model` field; deployments may override it via the session
 * {@link RealtimeSessionParams.Config} bag.
 */
const XAI_INPUT_TRANSCRIPTION_MODEL = 'whisper-1';

/**
 * The Grok Voice provider profile — the per-provider knobs the shared {@link OpenAIRealtime}
 * protocol implementation runs with when driving xAI.
 *
 * The GA feature gates (`reasoning.effort`, `parallel_tool_calls`, MCP tools) are OFF until xAI
 * documents support on the Grok Voice endpoint — the shared driver then honors them with a
 * one-line flip here, with no other xAI code changes. Feature keys arriving via the Config bag
 * are scrubbed (never sent raw), so a co-agent config carrying them is safe on Grok today.
 */
export const XAI_REALTIME_PROFILE: OpenAIRealtimeProfile = {
    providerKey: 'xai',
    inputTranscriptionModel: XAI_INPUT_TRANSCRIPTION_MODEL,
    // xAI's socket accepts session.update immediately after connect (observed in production), so
    // the config is sent synchronously — honoring driver obligation #7 ("Ready" only after the
    // session config is applied) without waiting on a session.created frame.
    deferInitialConfigUntilSessionCreated: false,
    foldInitialContextIntoPrompt: false,
    supportsReasoningEffort: false,
    supportsParallelToolCalls: false,
    supportsMcpTools: false,
    supportsVoiceOutput: false,
    unexpectedCloseMessage: 'xAI Grok Voice realtime connection closed unexpectedly',
    // Explicit server-VAD with create_response is REQUIRED on Grok: without it the model hears +
    // transcribes the user (speech_started + input_audio_transcription.* arrive) but never
    // auto-generates a reply — no response.created/audio. Meeting mode (disableAutoResponse) keeps
    // detection but hands the speak decision to the bridge.
    buildTurnDetection: (disableAutoResponse) => ({
        type: 'server_vad',
        create_response: !disableAutoResponse,
        interrupt_response: true,
    }),
    // Not consulted while supportsReasoningEffort is false. When xAI documents reasoning effort on
    // Grok Voice, REVISIT: if Grok's level vocabulary differs from OpenAI's five levels, replace
    // this with a Grok-specific mapping instead of just flipping the gate.
    mapEffortLevel: MapEffortLevelToOpenAIRealtime,
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
 * protocol and tool-calling shape). This driver therefore **subclasses {@link OpenAIRealtime}**
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
export class xAIRealtime extends OpenAIRealtime {
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

    /**
     * Grok Voice does not (yet) document a selectable voice set on the realtime endpoint, so the
     * dev voice picker gets none — overriding away the OpenAI voice list this class would
     * otherwise inherit.
     */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return [];
    }
}

/**
 * Live realtime session for Grok Voice — the shared {@link OpenAIRealtimeSession} protocol
 * implementation bound to {@link XAI_REALTIME_PROFILE}. Exists as a named subclass so tests and
 * logs identify xAI sessions, and so direct construction (`new xAIRealtimeSession(connection)`)
 * keeps working exactly as it did when this was a standalone clone.
 */
export class xAIRealtimeSession extends OpenAIRealtimeSession {
    /**
     * @param connection The injectable provider-connection seam (a real `OpenAIRealtimeWebSocket`
     * in production, a fake in tests).
     */
    constructor(connection: IxAIRealtimeConnection) {
        super(connection, XAI_REALTIME_PROFILE);
    }
}
