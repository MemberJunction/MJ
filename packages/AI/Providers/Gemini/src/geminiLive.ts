// Google Gemini Live (bidirectional speech-to-speech) driver.
//
// Implements MJ's `BaseRealtimeSpeech` duplex contract on top of the
// `@google/genai` Live API (`client.live.connect`). Audio in is streamed as
// base64 PCM via `sendRealtimeInput`; audio out, transcripts, and tool calls
// arrive on a single `onmessage` callback. Tool calls are surfaced to the
// channel runtime (which routes them through BaseAgent) and the result is
// returned to the model via `sendToolResponse`.
//
// Audio formats (per Gemini Live docs): input PCM 16-bit LE @ 16kHz, output
// PCM 16-bit LE @ 24kHz, mono.

import {
    GoogleGenAI,
    Modality,
    type LiveServerMessage,
    type LiveConnectConfig,
    type Session,
    type FunctionDeclaration,
    type Schema,
} from '@google/genai';
import {
    BaseRealtimeSpeech,
    type RealtimeSpeechConnectOptions,
    type RealtimeSpeechSession,
    type AudioFrame,
    type ToolCall,
    type ToolResult,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** Default Gemini Live model when the bound `AIModel.APIName` isn't supplied. */
const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest';
/** Gemini Live emits 24kHz mono PCM. */
const GEMINI_OUTPUT_SAMPLE_RATE_HZ = 24000;
/** Gemini Live expects 16kHz mono PCM input. */
const GEMINI_INPUT_SAMPLE_RATE_HZ = 16000;

type AudioListener = (chunk: AudioFrame) => void;
type TranscriptListener = (text: string, role: 'user' | 'assistant', isFinal: boolean) => void;
type ToolListener = (call: ToolCall) => Promise<ToolResult>;

/**
 * A live Gemini session. Created before `client.live.connect` resolves so the
 * `onmessage` closure can forward into it; `Attach()` wires the underlying
 * genai session once connected. Listener setters are called by the channel
 * runtime after `Connect()` returns — messages only flow afterward, so the
 * deferred wiring is safe.
 */
class GeminiLiveSession implements RealtimeSpeechSession {
    private genai: Session | null = null;
    private audioCb: AudioListener | null = null;
    private transcriptCb: TranscriptListener | null = null;
    private toolCb: ToolListener | null = null;
    private closed = false;

    public Attach(session: Session): void {
        this.genai = session;
    }

    public SendAudio(chunk: AudioFrame): void {
        if (this.closed || !this.genai) {
            return;
        }
        this.genai.sendRealtimeInput({
            audio: {
                data: Buffer.from(chunk.data).toString('base64'),
                mimeType: `audio/pcm;rate=${chunk.sampleRateHz || GEMINI_INPUT_SAMPLE_RATE_HZ}`,
            },
        });
    }

    public SendText(text: string): void {
        if (this.closed || !this.genai || text.length === 0) {
            return;
        }
        // Send a COMPLETE text turn. `turnComplete: true` is required — it tells
        // Gemini Live to start generating from the accumulated prompt; without
        // it the server waits for more input and never responds. (Plain
        // `sendRealtimeInput({text})` does NOT mark a turn boundary.) The model
        // still replies with audio (responseModalities=[AUDIO]).
        this.genai.sendClientContent({
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
        });
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

    /**
     * Barge-in. Gemini Live performs automatic server-side VAD and interrupts
     * its own generation when fresh user audio arrives (surfaced as
     * `serverContent.interrupted`), so an explicit cancel is a no-op here —
     * the runtime stops local playback on the interrupt signal. A future
     * enhancement could send `activityEnd` for manual VAD modes.
     */
    public CancelCurrentResponse(): void {
        // intentional no-op — see method doc (server VAD drives interruption)
    }

    public async Close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        try {
            this.genai?.close();
        } catch (err) {
            console.warn(`[GeminiLiveRealtimeSpeech] close error: ${String(err)}`);
        }
    }

    /** Route a single server message to the registered listeners. */
    public HandleServerMessage(msg: LiveServerMessage): void {
        const content = msg.serverContent;
        if (content) {
            // Audio out: model-turn parts carry base64 PCM in inlineData.
            for (const part of content.modelTurn?.parts ?? []) {
                const data = part.inlineData?.data;
                if (data) {
                    this.audioCb?.({
                        data: new Uint8Array(Buffer.from(data, 'base64')),
                        sampleRateHz: GEMINI_OUTPUT_SAMPLE_RATE_HZ,
                        channelCount: 1,
                        mediaType: 'audio/pcm',
                    });
                }
            }
            const outText = content.outputTranscription?.text;
            if (outText) {
                this.transcriptCb?.(outText, 'assistant', content.outputTranscription?.finished === true);
            }
            const inText = content.inputTranscription?.text;
            if (inText) {
                this.transcriptCb?.(inText, 'user', content.inputTranscription?.finished === true);
            }
        }

        const calls = msg.toolCall?.functionCalls;
        if (calls && calls.length > 0) {
            for (const fc of calls) {
                void this.dispatchToolCall(fc.id ?? '', fc.name ?? '', fc.args ?? {});
            }
        }
    }

    public HandleError(err: unknown): void {
        const e = err as { message?: string; reason?: string; code?: number } | undefined;
        console.error(
            `[GeminiLiveRealtimeSpeech] session error: ${e?.message ?? e?.reason ?? String(err)}`
        );
    }

    public HandleClose(reason?: { code?: number; reason?: string }): void {
        this.closed = true;
        if (reason && (reason.code !== undefined || reason.reason)) {
            console.log(
                `[GeminiLiveRealtimeSpeech] closed code=${reason.code ?? '?'} reason='${reason.reason ?? ''}'`
            );
        }
    }

    /** Run a tool call through the registered handler and return the result to Gemini. */
    private async dispatchToolCall(id: string, name: string, args: Record<string, unknown>): Promise<void> {
        if (!this.toolCb || !this.genai) {
            return;
        }
        let result: ToolResult;
        try {
            result = await this.toolCb({ Name: name, Arguments: args, CallID: id });
        } catch (err) {
            result = { CallID: id, Error: String(err) };
        }
        if (this.closed || !this.genai) {
            return;
        }
        this.genai.sendToolResponse({
            functionResponses: [
                {
                    id,
                    name,
                    response: result.Error ? { error: result.Error } : { output: result.Result },
                },
            ],
        });
    }
}

/**
 * `BaseRealtimeSpeech` driver for Gemini Live. Registered as
 * `GeminiLiveRealtimeSpeech` — bind an `AIModel` of type RealtimeSpeech with
 * this DriverClass and APIName set to a Gemini Live model id.
 */
@RegisterClass(BaseRealtimeSpeech, 'GeminiLiveRealtimeSpeech')
export class GeminiLiveRealtimeSpeech extends BaseRealtimeSpeech {
    constructor(apiKey: string) {
        super(apiKey);
    }

    public async Connect(opts: RealtimeSpeechConnectOptions): Promise<RealtimeSpeechSession> {
        // The Live API (bidiGenerateContent) is served under the v1alpha API
        // version on the Gemini Developer API — the SDK defaults to v1beta,
        // where the live models return "not found / not supported for
        // bidiGenerateContent" (close code 1008).
        const client = new GoogleGenAI({
            apiKey: this.apiKey,
            httpOptions: { apiVersion: 'v1alpha' },
        });
        const model = opts.ModelAPIName || DEFAULT_GEMINI_LIVE_MODEL;

        const config: LiveConnectConfig = {
            responseModalities: [Modality.AUDIO],
            systemInstruction: opts.SystemPrompt,
            // Independent transcripts of both sides — drive the widget display.
            inputAudioTranscription: {},
            outputAudioTranscription: {},
        };

        if (opts.Tools && opts.Tools.length > 0) {
            const functionDeclarations: FunctionDeclaration[] = opts.Tools.map((t) => ({
                name: t.Name,
                description: t.Description,
                parameters: t.ParametersSchema as unknown as Schema,
            }));
            config.tools = [{ functionDeclarations }];
        }

        if (opts.Language) {
            config.speechConfig = { languageCode: opts.Language };
        }

        const liveSession = new GeminiLiveSession();
        const genaiSession = await client.live.connect({
            model,
            config,
            callbacks: {
                onopen: () => undefined,
                onmessage: (m: LiveServerMessage) => liveSession.HandleServerMessage(m),
                onerror: (e: unknown) => liveSession.HandleError(e),
                onclose: (e: { code?: number; reason?: string }) =>
                    liveSession.HandleClose({ code: e?.code, reason: e?.reason }),
            },
        });
        liveSession.Attach(genaiSession);
        return liveSession;
    }
}
