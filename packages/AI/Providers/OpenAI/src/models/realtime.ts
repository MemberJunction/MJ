// OpenAI GPT Realtime (bidirectional speech-to-speech) driver.
//
// Implements MJ's `BaseRealtimeSpeech` duplex contract on top of the OpenAI
// Realtime API via `OpenAIRealtimeWebSocket` (an event emitter). Audio in is
// sent as base64 PCM16 (`input_audio_buffer.append`); audio out, transcripts,
// and tool calls arrive as typed server events. Tool results are returned via
// a `function_call_output` conversation item.
//
// Audio format: PCM 16-bit LE @ 24kHz mono, both directions.

import { OpenAI } from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime';
import {
    BaseRealtimeSpeech,
    type RealtimeSpeechConnectOptions,
    type RealtimeSpeechSession,
    type AudioFrame,
    type ToolCall,
    type ToolResult,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** Default model when the bound `AIModel.APIName` isn't supplied. */
const DEFAULT_OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview';
/** OpenAI Realtime uses 24kHz mono PCM16 both directions. */
const OPENAI_REALTIME_SAMPLE_RATE_HZ = 24000;

type AudioListener = (chunk: AudioFrame) => void;
type TranscriptListener = (text: string, role: 'user' | 'assistant', isFinal: boolean) => void;
type ToolListener = (call: ToolCall) => Promise<ToolResult>;

/**
 * A live OpenAI Realtime session wrapping `OpenAIRealtimeWebSocket`. Created in
 * `Connect()`; the server-event handlers are registered there, while the
 * audio/transcript/tool listeners are set by the channel runtime after
 * `Connect()` returns (messages only flow afterward — deferred wiring is safe).
 */
class OpenAIRealtimeSession implements RealtimeSpeechSession {
    private audioCb: AudioListener | null = null;
    private transcriptCb: TranscriptListener | null = null;
    private toolCb: ToolListener | null = null;
    private closed = false;

    constructor(private readonly rt: OpenAIRealtimeWebSocket) {}

    public SendAudio(chunk: AudioFrame): void {
        if (this.closed) {
            return;
        }
        this.rt.send({
            type: 'input_audio_buffer.append',
            audio: Buffer.from(chunk.data).toString('base64'),
        });
    }

    public SendText(text: string): void {
        if (this.closed || text.length === 0) {
            return;
        }
        // Add the user text as a conversation item, then ask for a response.
        // The model replies with audio (output_modalities includes 'audio').
        this.rt.send({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        });
        this.rt.send({ type: 'response.create' });
    }

    public OnAudio(cb: AudioListener): void {
        this.audioCb = cb;
    }

    public OnTranscript(cb: TranscriptListener): void {
        this.transcriptCb = cb;
    }

    public OnToolCall(cb: ToolListener): void {
        this.toolCb = cb;
    }

    /** Barge-in: cancel the in-flight assistant response. */
    public CancelCurrentResponse(): void {
        if (this.closed) {
            return;
        }
        try {
            this.rt.send({ type: 'response.cancel' });
        } catch {
            // No active response to cancel — benign.
        }
    }

    public async Close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        try {
            this.rt.close();
        } catch (err) {
            console.warn(`[OpenAIRealtimeSpeech] close error: ${String(err)}`);
        }
    }

    // ── server-event handlers (registered in Connect) ──

    public HandleAudioDelta(base64Audio: string): void {
        if (!base64Audio) {
            return;
        }
        this.audioCb?.({
            data: new Uint8Array(Buffer.from(base64Audio, 'base64')),
            sampleRateHz: OPENAI_REALTIME_SAMPLE_RATE_HZ,
            channelCount: 1,
            mediaType: 'audio/pcm',
        });
    }

    public HandleAssistantTranscriptDelta(delta: string): void {
        if (delta) {
            this.transcriptCb?.(delta, 'assistant', false);
        }
    }

    public HandleUserTranscript(text: string): void {
        if (text) {
            this.transcriptCb?.(text, 'user', true);
        }
    }

    public async HandleFunctionCall(callId: string, name: string, argsJson: string): Promise<void> {
        if (!this.toolCb) {
            return;
        }
        let args: Record<string, unknown> = {};
        try {
            args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
        } catch {
            args = {};
        }
        let result: ToolResult;
        try {
            result = await this.toolCb({ Name: name, Arguments: args, CallID: callId });
        } catch (err) {
            result = { CallID: callId, Error: String(err) };
        }
        if (this.closed) {
            return;
        }
        this.rt.send({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify(result.Error ? { error: result.Error } : { output: result.Result }),
            },
        });
        // Prompt the model to continue now that it has the tool result.
        this.rt.send({ type: 'response.create' });
    }

    public HandleError(err: unknown): void {
        console.error(`[OpenAIRealtimeSpeech] session error: ${String(err)}`);
    }
}

/**
 * `BaseRealtimeSpeech` driver for OpenAI GPT Realtime. Registered as
 * `OpenAIRealtimeSpeech` — bind an `AIModel` of type RealtimeSpeech with this
 * DriverClass and APIName set to a realtime model id (e.g. `gpt-4o-realtime-preview`).
 */
@RegisterClass(BaseRealtimeSpeech, 'OpenAIRealtimeSpeech')
export class OpenAIRealtimeSpeech extends BaseRealtimeSpeech {
    constructor(apiKey: string) {
        super(apiKey);
    }

    public async Connect(opts: RealtimeSpeechConnectOptions): Promise<RealtimeSpeechSession> {
        const client = new OpenAI({ apiKey: this.apiKey });
        const model = opts.ModelAPIName || DEFAULT_OPENAI_REALTIME_MODEL;

        const rt = await OpenAIRealtimeWebSocket.create(client, { model });
        const session = new OpenAIRealtimeSession(rt);

        // Register server-event handlers up front (safe before the socket opens).
        rt.on('response.output_audio.delta', (e) => session.HandleAudioDelta(e.delta));
        rt.on('response.output_audio_transcript.delta', (e) =>
            session.HandleAssistantTranscriptDelta(e.delta)
        );
        rt.on('conversation.item.input_audio_transcription.completed', (e) =>
            session.HandleUserTranscript(e.transcript)
        );
        rt.on('response.function_call_arguments.done', (e) => {
            void session.HandleFunctionCall(e.call_id, e.name, e.arguments);
        });
        rt.on('error', (e) => session.HandleError(e));

        // `create()` resolves before the WebSocket is actually open — sending
        // immediately throws "Sent before connected". Wait for the server's
        // `session.created` acknowledgement (or a connection error) first.
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            rt.on('session.created', () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            });
            rt.on('error', (e) => {
                if (!settled) {
                    settled = true;
                    reject(e instanceof Error ? e : new Error(String(e)));
                }
            });
        });

        // Configure the session: instructions + audio output + tools (so the
        // model can call them; the engine routes the call to real MJ work).
        const sessionConfig: RealtimeSessionCreateRequest = {
            type: 'realtime',
            instructions: opts.SystemPrompt,
            output_modalities: ['audio'],
        };
        if (opts.Tools && opts.Tools.length > 0) {
            sessionConfig.tools = opts.Tools.map((t) => ({
                type: 'function' as const,
                name: t.Name,
                description: t.Description,
                parameters: t.ParametersSchema,
            }));
        }
        rt.send({ type: 'session.update', session: sessionConfig });

        return session;
    }
}
