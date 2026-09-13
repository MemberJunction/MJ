import { randomUUID } from 'crypto';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    RealtimeDiagLog,
    IRealtimeSession,
    RealtimeSessionCapabilities,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeSessionError,
    RealtimeReasoningPlane,
    RealtimeRemoteReasoning,
    ClientRealtimeSessionConfig,
    JSONObject,
    RealtimeVoiceOption,
    RealtimeProxyRegistry,
    REALTIME_SDP_EXCHANGE_PATH,
    RealtimeToolBatchBarrier,
} from '@memberjunction/ai';
import { MapUsageModalityDetail } from './openAIRealtime.js';

/**
 * Structural interface for the underlying WebSocket transport (Node 22+ built-in or test mock).
 */
export interface ILiveWebSocketLike {
    addEventListener(type: 'open', listener: () => void): void;
    addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
    addEventListener(type: 'error', listener: (event: { message?: string; error?: unknown }) => void): void;
    addEventListener(type: 'close', listener: (event: { code?: number; reason?: string }) => void): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
}

/** Wire client events for OpenAI Live Realtime API. */
export type LiveClientEvent =
    | {
          event_id: string;
          type: 'session.start';
          session: {
              model: string;
              instructions?: string;
              audio?: {
                  format?: { type: string; rate?: number };
                  output?: { voice?: string };
              };
              parallel_tool_calls?: boolean;
              delegation?: {
                  type: 'client' | 'responses';
                  responses?: {
                      model: string;
                      reasoning?: {
                          effort?: string;
                      };
                      max_output_tokens?: number;
                      tools?: Array<{
                          type: 'function';
                          name: string;
                          description?: string;
                          parameters?: Record<string, unknown>;
                      }>;
                  };
              };
          };
      }
    | {
          event_id: string;
          type: 'session.input_audio.append';
          audio: string;
      }
    | {
          event_id: string;
          type: 'session.commentary.append';
          content: string;
          delegation_id: string | null;
      }
    | {
          event_id: string;
          type: 'session.thinking.append';
          content: string;
          delegation_id: string | null;
      }
    | {
          event_id: string;
          type: 'session.instructions.append';
          instructions: string;
      }
    | {
          event_id: string;
          type: 'response.item.create';
          item: {
              type: 'function_call_output';
              call_id: string;
              output: string;
          };
      }
    | {
          event_id: string;
          type: 'response.create';
      }
    | {
          event_id: string;
          type: 'session.close';
      };

/** Wire server events for OpenAI Live Realtime API. */
export interface LiveServerEvent {
    type: string;
    event_id?: string;
    session_id?: string;
    response_id?: string;
    delta?: string;
    audio?: string;
    start_ms?: number;
    end_ms?: number;
    usage?: {
        seconds?: number;
        input_tokens?: number;
        output_tokens?: number;
    };
    delegation_id?: string;
    reason?: string;
    error?: {
        message: string;
        code?: string;
        client_event_id?: string;
    };
    event?: {
        type: string;
        item?: {
            type?: string;
            name?: string;
            call_id?: string;
            arguments?: string;
        };
        response?: {
            id?: string;
            usage?: {
                input_tokens?: number;
                output_tokens?: number;
                input_token_details?: {
                    text_tokens?: number;
                    audio_tokens?: number;
                    cached_tokens?: number;
                };
                output_token_details?: {
                    text_tokens?: number;
                    audio_tokens?: number;
                };
            };
        };
    };
}

/** Options for configuring an OpenAILiveSession. */
export interface OpenAILiveSessionOptions {
    reasoningPlane?: RealtimeReasoningPlane;
    remoteSettings?: RealtimeRemoteReasoning;
    voice?: string;
    audioCodec?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
    sampleRate?: number;
    interruptionPolicy?: string;
    backchannelPolicy?: string;
    persona?: {
        StyleDescriptors?: string | Record<string, unknown> | null;
        StyleDescriptorsObject?: Record<string, unknown> | null;
        [key: string]: unknown;
    };
    styleDescriptors?: Record<string, unknown>;
}

/**
 * Live {@link IRealtimeSession} handle speaking the OpenAI Live wire protocol
 * (`wss://api.openai.com/v1/live/sessions`).
 */
export class OpenAILiveSession implements IRealtimeSession {
    public InputSampleRate: number;
    public OutputSampleRate: number;
    public AudioFormat?: { Codec: 'pcm16' | 'g711_ulaw' | 'g711_alaw'; SampleRate: number } | 'negotiated';
    public Capabilities: RealtimeSessionCapabilities;

    private _socket: ILiveWebSocketLike;
    private _params: RealtimeSessionParams;
    private _options: OpenAILiveSessionOptions;
    private _active = false;
    private _closed = false;
    private _closeRequested = false;
    private _trailingPcmBytes?: Uint8Array;
    private _lastReportedSeconds = 0;
    private _startPromise: Promise<void>;
    private _resolveStart!: () => void;
    private _rejectStart!: (err: Error) => void;
    private _closePromise?: Promise<void>;
    private _resolveClose?: () => void;
    private _countedResponseIds = new Set<string>();
    private _currentTaskRevision = 0;
    private _toolBatchBarrier = new RealtimeToolBatchBarrier();

    private _outputHandlers: Array<(chunk: ArrayBuffer) => void> = [];
    private _transcriptHandlers: Array<(t: RealtimeTranscript) => void> = [];
    private _toolCallHandlers: Array<(call: RealtimeToolCall) => void> = [];
    private _errorHandlers: Array<(error: RealtimeSessionError) => void> = [];
    private _usageHandlers: Array<(usage: RealtimeUsage) => void> = [];
    private _interruptionHandlers: Array<() => void> = [];
    private _closeHandlers: Array<() => void> = [];

    constructor(socket: ILiveWebSocketLike, params: RealtimeSessionParams, options: OpenAILiveSessionOptions = {}) {
        this._socket = socket;
        this._params = params;
        this._options = options;

        const codec = options.audioCodec ?? 'pcm16';
        const rate = options.sampleRate ?? (codec === 'g711_ulaw' || codec === 'g711_alaw' ? 8000 : 24000);
        this.InputSampleRate = rate;
        this.OutputSampleRate = rate;
        this.AudioFormat = { Codec: codec, SampleRate: rate };

        this.Capabilities = {
            CanReconfigureTurnMode: false,
            SupportedReasoningPlanes: ['local', 'remote'],
            CanReconfigureDelegationMode: false,
            EmitsUserInterruptionSignal: false,
            EmitsProviderCutoffSignal: true,
            EmitsResponseComplete: false,
            UsageBases: ['seconds', 'tokens'],
            ProvidesInputTranscription: true,
            ProvidesOutputTranscription: true,
            SupportsParallelToolCalls: true,
            SupportsDynamicToolSet: OpenAILiveRealtime.SupportsDynamicToolSet,
        };

        this._startPromise = new Promise<void>((resolve, reject) => {
            this._resolveStart = resolve;
            this._rejectStart = reject;
        });

        this.wireSocket();
    }

    /**
     * Current task revision counter for cancellation and supersede-and-discard.
     */
    public get CurrentTaskRevision(): number {
        return this._currentTaskRevision;
    }

    /**
     * Advances the task revision counter, causing in-flight tool results from prior revisions to be discarded.
     */
    public BumpTaskRevision(): number {
        this._toolBatchBarrier.Clear();
        return ++this._currentTaskRevision;
    }

    /**
     * Waits until the initial `session.started` confirmation frame arrives from the server.
     */
    public async WaitForStarted(): Promise<void> {
        return this._startPromise;
    }

    private wireSocket(): void {
        this._socket.addEventListener('open', () => {
            RealtimeDiagLog('[OpenAILiveSession][diag] Socket opened, sending session.start');
            this.sendSessionStart();
        });

        this._socket.addEventListener('message', (event) => {
            if (typeof event.data === 'string') {
                this.handleMessage(event.data);
            }
        });

        this._socket.addEventListener('error', (event) => {
            const msg = event.message ?? 'OpenAI Live socket error';
            RealtimeDiagLog(`[OpenAILiveSession][diag] Socket error: ${msg}`);
            if (!this._active) {
                this._rejectStart(new Error(msg));
            }
            this.dispatchError({
                Message: msg,
                Fatal: !this._active,
            });
        });

        this._socket.addEventListener('close', (event) => {
            const reason = event.reason || 'Socket closed';
            RealtimeDiagLog(`[OpenAILiveSession][diag] Socket closed: code=${event.code}, reason=${reason}`);
            this._closed = true;

            if (!this._active) {
                this._rejectStart(new Error(`Socket closed before session.started: ${reason}`));
            }

            if (this._closeRequested) {
                this._resolveClose?.();
            } else {
                for (const h of this._closeHandlers) {
                    h();
                }
                this.dispatchError({
                    Message: `OpenAI Live connection closed unexpectedly: ${reason}`,
                    Fatal: true,
                });
            }
        });
    }

    private sendSessionStart(): void {
        const compiledInstructions = this.buildInitialInstructions();
        const wireAudioFormat = this.resolveWireAudioFormat();
        const plane = this._options.reasoningPlane ?? 'local';

        const mappedTools = this._params.Tools?.map((t) => ({
            type: 'function' as const,
            name: t.Name,
            description: t.Description,
            parameters: t.ParametersSchema as Record<string, unknown> | undefined,
        }));
        const hasTools = !!(mappedTools && mappedTools.length > 0);

        const rawParallelToolCalls = this._params.Config?.['parallelToolCalls'] ?? this._params.Config?.['parallel_tool_calls'];
        const parallelToolCalls = typeof rawParallelToolCalls === 'boolean' ? rawParallelToolCalls : undefined;

        const startFrame: LiveClientEvent = {
            event_id: randomUUID(),
            type: 'session.start',
            session: {
                model: this._params.Model || 'gpt-live-1',
                instructions: compiledInstructions,
                audio: {
                    format: wireAudioFormat,
                    output: {
                        voice: this._options.voice ?? 'alloy',
                    },
                },
                ...(typeof parallelToolCalls === 'boolean' ? { parallel_tool_calls: parallelToolCalls } : {}),
                delegation: {
                    type: plane === 'remote' || hasTools ? 'responses' : 'client',
                    ...(plane === 'remote' || hasTools
                        ? {
                              responses: {
                                  model: this._options.remoteSettings?.Ref ?? 'gpt-4o',
                                  ...(this._options.remoteSettings?.Effort
                                      ? {
                                            reasoning: {
                                                effort: this._options.remoteSettings.Effort,
                                            },
                                        }
                                      : {}),
                                  ...(typeof this._options.remoteSettings?.MaxOutputTokens === 'number'
                                      ? {
                                            max_output_tokens: this._options.remoteSettings.MaxOutputTokens,
                                        }
                                      : {}),
                                  ...(mappedTools && mappedTools.length > 0 ? { tools: mappedTools } : {}),
                              },
                          }
                        : {}),
                },
            },
        };

        this.sendFrame(startFrame);
    }

    private resolveWireAudioFormat(): { type: string; rate?: number } {
        const codec = this.AudioFormat && typeof this.AudioFormat === 'object' ? this.AudioFormat.Codec : 'pcm16';
        if (codec === 'g711_ulaw') {
            return { type: 'audio/pcmu' };
        }
        if (codec === 'g711_alaw') {
            return { type: 'audio/pcma' };
        }
        return {
            type: 'audio/pcm',
            rate: this.InputSampleRate,
        };
    }

    private buildInitialInstructions(): string {
        const sections: string[] = [];
        if (this._params.SystemPrompt) {
            sections.push(this._params.SystemPrompt.trim());
        }
        if (this._params.InitialContext) {
            sections.push(this._params.InitialContext.trim());
        }
        if (this._params.Tools && this._params.Tools.length > 0) {
            sections.push(this.compileDelegationPolicy(this._params.Tools));
        }
        const interruptionPolicy = this.resolveInterruptionPolicy();
        if (interruptionPolicy) {
            sections.push(`Interruption policy:\n${interruptionPolicy}`);
        }
        const backchannelPolicy = this.resolveBackchannelPolicy();
        if (backchannelPolicy) {
            sections.push(`Backchannel policy:\n${backchannelPolicy}`);
        }
        return sections.join('\n\n');
    }

    private extractPolicyFromConfig(policyKey: 'interruptionPolicy' | 'backchannelPolicy'): string | undefined {
        const direct = this._options[policyKey];
        if (typeof direct === 'string' && direct.trim().length > 0) {
            return direct.trim();
        }

        const fromStyle = this._options.styleDescriptors?.[policyKey];
        if (typeof fromStyle === 'string' && fromStyle.trim().length > 0) {
            return fromStyle.trim();
        }

        // options.persona has an inline structural shape, so it may receive a plain deserialized
        // object where StyleDescriptors is already parsed as an object (e.g. in test fixtures or
        // JSON configs) rather than the entity class instance where StyleDescriptors is a raw
        // JSON string and StyleDescriptorsObject is the parsed accessor.
        const personaStyleObj =
            this._options.persona?.StyleDescriptorsObject ??
            (typeof this._options.persona?.['StyleDescriptors'] === 'object' && this._options.persona?.['StyleDescriptors'] !== null
                ? (this._options.persona['StyleDescriptors'] as Record<string, unknown>)
                : undefined);
        const fromPersona = personaStyleObj?.[policyKey];
        if (typeof fromPersona === 'string' && fromPersona.trim().length > 0) {
            return fromPersona.trim();
        }

        const config = this._params.Config;
        if (config) {
            const configDirect = config[policyKey];
            if (typeof configDirect === 'string' && configDirect.trim().length > 0) {
                return configDirect.trim();
            }

            const configStyle = config['styleDescriptors'];
            if (configStyle && typeof configStyle === 'object' && policyKey in configStyle) {
                const val = (configStyle as Record<string, unknown>)[policyKey];
                if (typeof val === 'string' && val.trim().length > 0) {
                    return val.trim();
                }
            }

            const configPersona = config['persona'];
            if (configPersona && typeof configPersona === 'object') {
                const p = configPersona as Record<string, unknown>;
                const sdo = p['StyleDescriptorsObject'] ?? (typeof p['StyleDescriptors'] === 'object' ? p['StyleDescriptors'] : undefined);
                if (sdo && typeof sdo === 'object' && sdo !== null && policyKey in sdo) {
                    const val = (sdo as Record<string, unknown>)[policyKey];
                    if (typeof val === 'string' && val.trim().length > 0) {
                        return val.trim();
                    }
                }
            }
        }

        return undefined;
    }

    private resolveInterruptionPolicy(): string | undefined {
        return this.extractPolicyFromConfig('interruptionPolicy');
    }

    private resolveBackchannelPolicy(): string | undefined {
        return this.extractPolicyFromConfig('backchannelPolicy');
    }

    private compileDelegationPolicy(tools: RealtimeToolDefinition[]): string {
        return OpenAILiveRealtime.CompileDelegationPolicy(tools);
    }

    private handleMessage(raw: string): void {
        let event: LiveServerEvent;
        try {
            event = JSON.parse(raw) as LiveServerEvent;
        } catch {
            RealtimeDiagLog(`[OpenAILiveSession][diag] Received non-JSON frame: ${raw.slice(0, 100)}`);
            return;
        }

        switch (event.type) {
            case 'session.started': {
                RealtimeDiagLog(`[OpenAILiveSession][diag] session.started (id: ${event.session_id})`);
                this._active = true;
                this._resolveStart();
                break;
            }

            case 'session.output_audio.delta': {
                if (event.delta) {
                    const buf = Buffer.from(event.delta, 'base64');
                    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                    for (const handler of this._outputHandlers) {
                        handler(arrayBuffer);
                    }
                }
                break;
            }

            case 'session.input_transcript.delta': {
                if (event.delta) {
                    const t: RealtimeTranscript = {
                        Text: event.delta,
                        IsFinal: false,
                        Role: 'user',
                    };
                    for (const handler of this._transcriptHandlers) {
                        handler(t);
                    }
                }
                break;
            }

            case 'session.output_transcript.delta': {
                if (event.delta) {
                    const t: RealtimeTranscript = {
                        Text: event.delta,
                        IsFinal: false,
                        Role: 'assistant',
                    };
                    for (const handler of this._transcriptHandlers) {
                        handler(t);
                    }
                }
                break;
            }

            case 'session.usage.updated': {
                if (typeof event.usage?.seconds === 'number') {
                    this._lastReportedSeconds = event.usage.seconds;
                    const u: RealtimeUsage = {
                        InputTokens: 0,
                        OutputTokens: 0,
                        DurationSeconds: this._lastReportedSeconds,
                    };
                    for (const handler of this._usageHandlers) {
                        handler(u);
                    }
                }
                break;
            }

            case 'session.delegation.created': {
                // In remote reasoning plane, session.delegation.created is remote lifecycle notice only.
                // Tool calls are dispatched via response.event (response.output_item.done).
                if (this._options.reasoningPlane !== 'remote' && event.delegation_id) {
                    const call: RealtimeToolCall = {
                        CallID: event.delegation_id,
                        ToolName: 'backend_delegation',
                        Arguments: JSON.stringify({ delegation_id: event.delegation_id }),
                        TaskRevision: this._currentTaskRevision,
                    };
                    for (const handler of this._toolCallHandlers) {
                        handler(call);
                    }
                }
                break;
            }

            case 'response.event': {
                if (!event.event) {
                    break;
                }
                // Trap 1: Read completed tool calls from nested response.output_item.done
                if (event.event.type === 'response.output_item.done') {
                    const item = event.event.item;
                    if (item?.type === 'function_call' && item.call_id && item.name) {
                        this._toolBatchBarrier.TrackPendingCall(item.call_id, () => {
                            RealtimeDiagLog(`[OpenAILiveSession][diag] Tool batch timed out with pending calls; flushing response.create`);
                            this.sendFrame({
                                event_id: randomUUID(),
                                type: 'response.create',
                            });
                        });
                        const call: RealtimeToolCall = {
                            CallID: item.call_id,
                            ToolName: item.name,
                            Arguments: item.arguments ?? '{}',
                            TaskRevision: this._currentTaskRevision,
                        };
                        for (const handler of this._toolCallHandlers) {
                            handler(call);
                        }
                    }
                } else if (event.event.type === 'response.completed') {
                    // Trap 2 & Trap 4: response.output is empty even with pending calls;
                    // Deduplicate token usage by response.id:
                    const resp = event.event.response;
                    if (resp?.id) {
                        if (this._countedResponseIds.has(resp.id)) {
                            break;
                        }
                        this._countedResponseIds.add(resp.id);
                    }
                    if (resp?.usage) {
                        const u: RealtimeUsage = {
                            InputTokens: resp.usage.input_tokens ?? 0,
                            OutputTokens: resp.usage.output_tokens ?? 0,
                            DurationSeconds: this._lastReportedSeconds,
                            InputTokenDetails: MapUsageModalityDetail(resp.usage.input_token_details),
                            OutputTokenDetails: MapUsageModalityDetail(resp.usage.output_token_details),
                        };
                        for (const handler of this._usageHandlers) {
                            handler(u);
                        }
                    }
                }
                break;
            }

            case 'error': {
                const err = event.error;
                const message = err?.message || 'Unknown OpenAI Live error';
                const isFatal = !this._active || err?.code === 'session_expired' || err?.code === 'unauthorized';
                RealtimeDiagLog(`[OpenAILiveSession][diag] Provider error: code=${err?.code}, msg=${message}`);

                if (err?.code === 'moderation_cutoff' || err?.code === 'provider_cutoff') {
                    this.BumpTaskRevision();
                    for (const handler of this._interruptionHandlers) {
                        handler();
                    }
                }

                this.dispatchError({
                    Message: message,
                    Code: err?.code,
                    Fatal: isFatal,
                });
                break;
            }

            case 'session.closed': {
                RealtimeDiagLog(`[OpenAILiveSession][diag] session.closed: reason=${event.reason}`);
                this._closed = true;
                if (this._closeRequested) {
                    this._resolveClose?.();
                } else {
                    for (const h of this._closeHandlers) {
                        h();
                    }
                    this.dispatchError({
                        Message: `Session closed by server: ${event.reason ?? 'unknown'}`,
                        Fatal: true,
                    });
                }
                try {
                    this._socket.close(1000, 'Closed');
                } catch {
                    // Ignore socket close failure on terminal frame
                }
                break;
            }

            default:
                break;
        }
    }

    private dispatchError(error: RealtimeSessionError): void {
        for (const handler of this._errorHandlers) {
            handler(error);
        }
    }

    private sendFrame(event: LiveClientEvent): void {
        if (this._closed) {
            RealtimeDiagLog(`[OpenAILiveSession][diag] Attempted to send frame on closed session: ${event.type}`);
            return;
        }
        try {
            this._socket.send(JSON.stringify(event));
        } catch (err) {
            RealtimeDiagLog(`[OpenAILiveSession][diag] Failed to send frame: ${err}`);
        }
    }

    // ─── IRealtimeSession Implementation ──────────────────────────────────────────

    public SendInput(chunk: ArrayBuffer, kind?: 'audio' | 'video'): void {
        if (kind === 'video') {
            return; // Audio-only driver ignores video frames
        }
        if (this._closed) {
            return;
        }

        const isG711 =
            this.AudioFormat &&
            typeof this.AudioFormat === 'object' &&
            (this.AudioFormat.Codec === 'g711_ulaw' || this.AudioFormat.Codec === 'g711_alaw');

        let bytes = new Uint8Array(chunk);
        if (!isG711) {
            if (this._trailingPcmBytes && this._trailingPcmBytes.length > 0) {
                const merged = new Uint8Array(this._trailingPcmBytes.length + bytes.length);
                merged.set(this._trailingPcmBytes, 0);
                merged.set(bytes, this._trailingPcmBytes.length);
                bytes = merged;
                this._trailingPcmBytes = undefined;
            }

            if (bytes.length % 2 !== 0) {
                this._trailingPcmBytes = bytes.slice(bytes.length - 1);
                bytes = bytes.slice(0, bytes.length - 1);
            }
        }

        if (bytes.length === 0) {
            return;
        }

        const b64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
        this.sendFrame({
            event_id: randomUUID(),
            type: 'session.input_audio.append',
            audio: b64,
        });
    }

    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        const policy = this.compileDelegationPolicy(tools);
        if (this._active) {
            await this.SendInstructions(policy);
        }
    }

    public OnOutput(handler: (chunk: ArrayBuffer) => void): void {
        this._outputHandlers.push(handler);
    }

    public OnTranscript(handler: (t: RealtimeTranscript) => void): void {
        this._transcriptHandlers.push(handler);
    }

    public OnToolCall(handler: (call: RealtimeToolCall) => void): void {
        this._toolCallHandlers.push(handler);
    }

    public async SendToolResult(callID: string, output: string, taskRevision?: number): Promise<void> {
        if (taskRevision !== undefined && taskRevision !== this._currentTaskRevision) {
            RealtimeDiagLog(
                `[OpenAILiveSession][diag] Discarding stale tool result for ${callID}: revision ${taskRevision} vs current ${this._currentTaskRevision}`
            );
            return;
        }

        if (this._options.reasoningPlane === 'remote') {
            // Trap 3: Appending a function result does not automatically continue the response:
            // response.create is a required separate step, and response.item.create has no success ack.
            // Requirement (§4.2): Exactly ONE response.create per batch, not per result.
            this.sendFrame({
                event_id: randomUUID(),
                type: 'response.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callID,
                    output,
                },
            });

            const isBatchComplete = this._toolBatchBarrier.RecordResult(callID);
            if (isBatchComplete) {
                this.sendFrame({
                    event_id: randomUUID(),
                    type: 'response.create',
                });
            }
        } else {
            this.sendFrame({
                event_id: randomUUID(),
                type: 'session.commentary.append',
                content: output,
                delegation_id: callID,
            });
        }
    }

    public SendContextNote(text: string): void {
        this.sendFrame({
            event_id: randomUUID(),
            type: 'session.thinking.append',
            content: text,
            delegation_id: null,
        });
    }

    public RequestSpokenUpdate(instructions: string): boolean {
        this.sendFrame({
            event_id: randomUUID(),
            type: 'session.commentary.append',
            content: instructions,
            delegation_id: null,
        });
        return true;
    }

    public async SendInstructions(instructions: string): Promise<void> {
        this.sendFrame({
            event_id: randomUUID(),
            type: 'session.instructions.append',
            instructions,
        });
    }

    public OnInterruption(handler: () => void): void {
        this._interruptionHandlers.push(handler);
    }

    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this._errorHandlers.push(handler);
    }

    public OnClose(handler: () => void): void {
        this._closeHandlers.push(handler);
    }

    public OnUsage(handler: (u: RealtimeUsage) => void): void {
        this._usageHandlers.push(handler);
    }

    public async Close(): Promise<void> {
        this._toolBatchBarrier.Clear();
        if (this._closed) {
            return;
        }
        this._closeRequested = true;

        this._closePromise = new Promise<void>((resolve) => {
            this._resolveClose = resolve;
        });

        this.sendFrame({
            event_id: randomUUID(),
            type: 'session.close',
        });

        // Race graceful server close against safety timer (5s)
        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(() => {
                try {
                    this._socket.close(1000, 'Close timeout');
                } catch {
                    // Ignore error on close
                }
                resolve();
            }, 5000);
        });

        await Promise.race([this._closePromise, timeoutPromise]);
        this._closed = true;
    }
}

/**
 * Driver class for OpenAI GPT-Live 1 full-duplex realtime models.
 */
@RegisterClass(BaseRealtimeModel, 'OpenAILiveRealtime')
export class OpenAILiveRealtime extends BaseRealtimeModel {
    public static override readonly SupportsDynamicToolSet = true;

    private _endpoint: string;

    constructor(apiKey: string, endpoint?: string) {
        super(apiKey);
        this._endpoint = endpoint ?? 'wss://api.openai.com/v1/live/sessions';
    }

    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return [
            { ID: 'alloy', Name: 'Alloy' },
            { ID: 'ash', Name: 'Ash' },
            { ID: 'ballad', Name: 'Ballad' },
            { ID: 'cedar', Name: 'Cedar' },
            { ID: 'coral', Name: 'Coral' },
            { ID: 'echo', Name: 'Echo' },
            { ID: 'marin', Name: 'Marin' },
            { ID: 'sage', Name: 'Sage' },
            { ID: 'shimmer', Name: 'Shimmer' },
            { ID: 'verse', Name: 'Verse' },
        ];
    }

    /**
     * Creation seam for the live WebSocket connection. Unit tests override this to return an in-memory mock.
     */
    protected createSocket(url: string, apiKey: string): ILiveWebSocketLike {
        const WS = (
            globalThis as unknown as {
                WebSocket: new (
                    url: string,
                    protocols?: unknown,
                    options?: { headers?: Record<string, string> }
                ) => ILiveWebSocketLike;
            }
        ).WebSocket;

        if (!WS) {
            throw new Error('OpenAILiveRealtime requires Node 22+ or an environment with global WebSocket support.');
        }

        return new WS(url, undefined, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
    }

    /**
     * Opens a duplex OpenAI Live session and awaits initialization.
     */
    public override async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const socket = this.createSocket(this._endpoint, this.apiKey);

        const config = params.Config as Record<string, unknown> | undefined;
        const reasoningConfig = config?.Reasoning as
            | {
                  Plane?: RealtimeReasoningPlane;
                  Remote?: RealtimeRemoteReasoning;
              }
            | undefined;

        let audioCodec: 'pcm16' | 'g711_ulaw' | 'g711_alaw' = 'pcm16';
        let sampleRate = 24000;

        if (config?.AudioFormat && typeof config.AudioFormat === 'object') {
            const af = config.AudioFormat as { Codec?: string; SampleRate?: number };
            if (af.Codec === 'g711_ulaw' || af.Codec === 'audio/pcmu') {
                audioCodec = 'g711_ulaw';
                sampleRate = af.SampleRate ?? 8000;
            } else if (af.Codec === 'g711_alaw' || af.Codec === 'audio/pcma') {
                audioCodec = 'g711_alaw';
                sampleRate = af.SampleRate ?? 8000;
            } else if (af.SampleRate) {
                sampleRate = af.SampleRate;
            }
        } else if (
            config?.AudioCodec === 'g711_ulaw' ||
            config?.AudioCodec === 'audio/pcmu' ||
            config?.audioCodec === 'g711_ulaw' ||
            config?.audioCodec === 'audio/pcmu'
        ) {
            audioCodec = 'g711_ulaw';
            sampleRate = 8000;
        } else if (
            config?.AudioCodec === 'g711_alaw' ||
            config?.AudioCodec === 'audio/pcma' ||
            config?.audioCodec === 'g711_alaw' ||
            config?.audioCodec === 'audio/pcma'
        ) {
            audioCodec = 'g711_alaw';
            sampleRate = 8000;
        }

        const options: OpenAILiveSessionOptions = {
            reasoningPlane: reasoningConfig?.Plane ?? 'local',
            remoteSettings: reasoningConfig?.Remote,
            voice: OpenAILiveRealtime.resolveVoice(config),
            audioCodec,
            sampleRate,
            persona: config?.['persona'] as OpenAILiveSessionOptions['persona'],
            styleDescriptors: config?.['styleDescriptors'] as OpenAILiveSessionOptions['styleDescriptors'],
            interruptionPolicy: typeof config?.['interruptionPolicy'] === 'string' ? config['interruptionPolicy'] : undefined,
            backchannelPolicy: typeof config?.['backchannelPolicy'] === 'string' ? config['backchannelPolicy'] : undefined,
        };

        const session = new OpenAILiveSession(socket, params, options);
        await session.WaitForStarted();
        return session;
    }

    /**
     * Whether this driver can mint an ephemeral, server-scoped client credential for a
     * **client-direct** realtime session (the browser opens its own provider socket).
     */
    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /**
     * Compiles the delegation policy block informing GPT-Live about available backend tools
     * and when to delegate to the reasoning model.
     */
    public static CompileDelegationPolicy(tools: RealtimeToolDefinition[]): string {
        const toolBullets = tools
            .map((t) => `- ${t.Name}: ${t.Description || 'Execute backend capability'}`)
            .join('\n');

        return (
            'Delegation policy:\n' +
            'Backend tools:\n' +
            toolBullets +
            '\n\n' +
            'Delegate to the backend when:\n' +
            '- The user asks for assistance or changes requiring backend capabilities.\n\n' +
            'Do not delegate to the backend when:\n' +
            '- The user greets you or asks you to repeat a result already provided.\n\n' +
            'Delegate before giving an answer that depends on backend work.\n' +
            'Do not guess the result while waiting, but brief spoken holding phrases while backend work proceeds are permitted.'
        );
    }

    /**
     * Mints a client session config for the browser-direct WebRTC topology.
     *
     * In the OpenAI Live WebRTC topology, the browser exchanges its offer SDP with the
     * trusted server broker (via {@link ExchangeWebRtcSdp}); the project API key stays server-side.
     * WebRTC omits audio.format entirely (negotiated via SDP).
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const config = params.Config as Record<string, unknown> | undefined;
        const reasoningConfig = config?.Reasoning as
            | {
                  Plane?: RealtimeReasoningPlane;
                  Remote?: RealtimeRemoteReasoning;
              }
            | undefined;

        const plane = reasoningConfig?.Plane ?? 'local';
        const mappedTools = params.Tools?.map((t) => ({
            type: 'function' as const,
            name: t.Name,
            description: t.Description,
            parameters: t.ParametersSchema as Record<string, unknown> | undefined,
        }));

        const hasTools = !!(mappedTools && mappedTools.length > 0);
        const delegationType = plane === 'remote' || hasTools ? 'responses' : 'client';

        const rawParallelToolCalls = config?.['parallelToolCalls'] ?? config?.['parallel_tool_calls'];
        const parallelToolCalls = typeof rawParallelToolCalls === 'boolean' ? rawParallelToolCalls : undefined;

        const sections: string[] = [];
        if (params.SystemPrompt) {
            sections.push(params.SystemPrompt.trim());
        }
        if (params.InitialContext) {
            sections.push(params.InitialContext.trim());
        }
        if (hasTools && params.Tools && params.Tools.length > 0) {
            sections.push(OpenAILiveRealtime.CompileDelegationPolicy(params.Tools));
        }
        const compiledInstructions = sections.join('\n\n');

        // WebRTC session config: omit audio.format entirely (negotiated via SDP)
        const sessionPayload: Record<string, unknown> = {
            model: params.Model || 'gpt-live-1',
            instructions: compiledInstructions,
            audio: {
                output: {
                    voice: OpenAILiveRealtime.resolveVoice(config),
                },
            },
            ...(typeof parallelToolCalls === 'boolean' ? { parallel_tool_calls: parallelToolCalls } : {}),
            delegation: {
                type: delegationType,
                ...(delegationType === 'responses'
                    ? {
                          responses: {
                              model: reasoningConfig?.Remote?.Ref ?? 'gpt-4o',
                              ...(reasoningConfig?.Remote?.Effort
                                  ? {
                                        reasoning: {
                                            effort: reasoningConfig.Remote.Effort,
                                        },
                                    }
                                  : {}),
                              ...(typeof reasoningConfig?.Remote?.MaxOutputTokens === 'number'
                                  ? {
                                        max_output_tokens: reasoningConfig.Remote.MaxOutputTokens,
                                    }
                                  : {}),
                              ...(hasTools ? { tools: mappedTools } : {}),
                          },
                      }
                    : {}),
            },
        };

        const ticket = RealtimeProxyRegistry.Instance.Issue({
            UpstreamUrl: this._endpoint,
            UpstreamAuthHeader: this.apiKey,
            DriverClass: 'OpenAILiveRealtime',
            UserID: params.UserID,
            SessionConfig: sessionPayload,
            TTLSeconds: 60,
        });

        const brokerUrl = this.resolveBrokerUrl(params, ticket.ID);

        return {
            Provider: 'openai-live',
            Model: params.Model || 'gpt-live-1',
            EphemeralToken: brokerUrl,
            ExpiresAt: ticket.ExpiresAt,
            SessionConfig: sessionPayload as JSONObject,
        };
    }

    /**
     * Resolves the configured voice name from `params.Config`, accepting either lowercase `voice`
     * (the driver-neutral standard) or uppercase `Voice`, defaulting to `'alloy'`.
     */
    private static resolveVoice(config: Record<string, unknown> | undefined): string {
        const raw = config?.['voice'] ?? config?.['Voice'];
        return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'alloy';
    }

    /**
     * Resolves the browser-facing HTTP(S) broker URL for the OpenAI Live WebRTC SDP exchange.
     */
    protected resolveBrokerUrl(params: RealtimeSessionParams, ticketId: string): string {
        const override = params.Config?.['proxyBaseUrl'] ?? params.Config?.['brokerBaseUrl'];
        const source =
            (typeof override === 'string' && override.trim().length > 0 ? override.trim() : '') ||
            process.env['MJAPI_PUBLIC_URL'] ||
            `${process.env['GRAPHQL_BASE_URL'] ?? 'http://localhost'}:${process.env['GRAPHQL_PORT'] ?? '4103'}`;
        let end = source.length;
        while (end > 0 && source.charCodeAt(end - 1) === 47 /* '/' */) {
            end--;
        }
        const baseUrl = source.slice(0, end);
        return `${baseUrl}${REALTIME_SDP_EXCHANGE_PATH}?ticket=${encodeURIComponent(ticketId)}`;
    }

    /**
     * Exchanges a client WebRTC offer SDP for an answer SDP via OpenAI's `POST /v1/live/sessions`,
     * using the server's project API key.
     *
     * In the OpenAI Live WebRTC topology, the browser never contacts api.openai.com directly;
     * the trusted application server exchanges the offer for an answer and starts the session.
     * Note: creating a WebRTC session pre-bills 15 seconds of voice duration.
     *
     * @param offerSdp The local SDP offer generated by the browser.
     * @param sessionConfig The session configuration to initialize the session with.
     * @returns The answer SDP, provider session ID, and the 15-second pre-bill accounting.
     */
    public async ExchangeWebRtcSdp(
        offerSdp: string,
        sessionConfig?: Record<string, unknown>
    ): Promise<{ answerSdp: string; sessionId: string; prebillSeconds: number }> {
        const payload = {
            session: sessionConfig ?? { model: 'gpt-live-1' },
            transport: {
                type: 'webrtc',
                sdp: offerSdp,
            },
        };

        const res = await this.postLiveSessions(payload);
        return {
            answerSdp: res.transport.sdp,
            sessionId: res.id,
            prebillSeconds: 15,
        };
    }

    /**
     * HTTP POST seam for `/v1/live/sessions` (unit tests override this to mock the HTTP call).
     */
    protected async postLiveSessions(payload: unknown): Promise<{ id: string; transport: { type: string; sdp: string } }> {
        const res = await fetch('https://api.openai.com/v1/live/sessions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`OpenAI Live WebRTC session exchange failed (${res.status}): ${text}`);
        }

        const data = (await res.json()) as { id: string; transport: { type: string; sdp: string } };
        return data;
    }
}
