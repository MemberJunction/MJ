/**
 * Deepgram STT provider — streaming Nova-3 transcription via WebSocket.
 *
 * Phase 1(e) of `plans/audio-agent-architecture.md`. Implements
 * `BaseAudioGenerator.TranscribeStream` so the cascaded voice channel
 * (STT → LLM → TTS) can resolve a low-latency streaming transcriber from
 * `AIModel.DriverClass`.
 *
 * Batch endpoints (`CreateSpeech`, `SpeechToText`, etc.) are intentionally
 * unimplemented — Deepgram's batch REST API can be added in a later round.
 *
 * Raw `ws` rather than `@deepgram/sdk` so we can plug straight into the
 * existing AsyncQueue pattern used by `WebSocketTransport` and keep the
 * dependency surface minimal.
 */
import WebSocket from 'ws';
import { RegisterClass } from '@memberjunction/global';
import {
    AudioFrame,
    AudioModel,
    BaseAudioGenerator,
    PronounciationDictionary,
    SpeechResult,
    SpeechToTextParams,
    StreamingSTTOptions,
    TextToSpeechParams,
    TranscriptEvent,
    VoiceInfo,
} from '@memberjunction/ai';

/**
 * Shape of the Deepgram realtime "Results" message. Loose typing because the
 * payload contains many provider-specific fields we don't consume. Only the
 * subset used here is enumerated.
 */
interface DeepgramResultsMessage {
    type?: string;
    is_final?: boolean;
    speech_final?: boolean;
    channel?: {
        alternatives?: Array<{
            transcript?: string;
            confidence?: number;
        }>;
    };
}

/**
 * Unbounded single-producer / single-consumer queue. Mirrors the pattern in
 * `WebSocketTransport.AsyncQueue` so behaviour is consistent across the
 * realtime stack.
 */
class TranscriptQueue implements AsyncIterable<TranscriptEvent> {
    private items: TranscriptEvent[] = [];
    private waiters: Array<(value: IteratorResult<TranscriptEvent>) => void> = [];
    private closed = false;
    private terminalError: Error | null = null;

    public Push(item: TranscriptEvent): void {
        if (this.closed) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }

    public Close(err?: Error): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (err) {
            this.terminalError = err;
        }
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) {
                w({ value: undefined as never, done: true });
            }
        }
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<TranscriptEvent> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<TranscriptEvent> {
                return this;
            },
            next(): Promise<IteratorResult<TranscriptEvent>> {
                if (self.items.length > 0) {
                    const value = self.items.shift() as TranscriptEvent;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    if (self.terminalError) {
                        return Promise.reject(self.terminalError);
                    }
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<TranscriptEvent>>((resolve) => self.waiters.push(resolve));
            },
        };
    }
}

/**
 * Map an inbound Deepgram Results message to a `TranscriptEvent`. Returns
 * `null` when the message has no transcript text (e.g. metadata / keepalives).
 */
function MapResultsMessage(msg: DeepgramResultsMessage): TranscriptEvent | null {
    const alt = msg.channel?.alternatives?.[0];
    const text = alt?.transcript;
    if (!text || text.length === 0) {
        return null;
    }
    const evt: TranscriptEvent = {
        Text: text,
        IsFinal: msg.is_final === true,
        Role: 'user',
    };
    if (typeof alt?.confidence === 'number') {
        evt.ConfidenceScore = alt.confidence;
    }
    return evt;
}

/**
 * Build the Deepgram WebSocket URL with all query parameters. Encoding /
 * sample rate are derived from `firstFrame` so we honour the actual on-wire
 * format rather than guessing.
 */
function BuildDeepgramURL(opts: StreamingSTTOptions, firstFrame: AudioFrame): string {
    const model = process.env.DEEPGRAM_MODEL ?? 'nova-3';
    const language = opts.Language ?? 'en-US';
    const includePartials = opts.IncludePartials ?? true;
    const encoding = MediaTypeToEncoding(firstFrame.mediaType);
    const sampleRate = firstFrame.sampleRateHz || 16000;
    const channels = firstFrame.channelCount || 1;

    const params = new URLSearchParams({
        model,
        language,
        punctuate: 'true',
        interim_results: includePartials ? 'true' : 'false',
        encoding,
        sample_rate: String(sampleRate),
        channels: String(channels),
        endpointing: '300',
        smart_format: 'true',
    });
    return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

/**
 * Translate an MJ AudioFrame `mediaType` into the Deepgram `encoding` query
 * parameter. Falls back to `linear16` (the most common cascaded-channel
 * default) for unknown media types.
 */
function MediaTypeToEncoding(mediaType: string): string {
    switch (mediaType) {
        case 'audio/pcm':
        case 'audio/L16':
            return 'linear16';
        case 'audio/mulaw':
        case 'audio/PCMU':
            return 'mulaw';
        case 'audio/opus':
            return 'opus';
        case 'audio/flac':
            return 'flac';
        default:
            return 'linear16';
    }
}

@RegisterClass(BaseAudioGenerator, 'DeepgramAudioGenerator')
export class DeepgramAudioGenerator extends BaseAudioGenerator {
    public SupportsStreaming = true;

    constructor(apiKey: string) {
        super(apiKey);
    }

    public override async *TranscribeStream(opts: StreamingSTTOptions): AsyncIterable<TranscriptEvent> {
        const apiKey = this.apiKey || process.env.DEEPGRAM_API_KEY || '';
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error('DeepgramAudioGenerator: missing API key. Set AIModel credentials or DEEPGRAM_API_KEY.');
        }

        const audioIter = opts.AudioStream[Symbol.asyncIterator]();
        const first = await audioIter.next();
        if (first.done) {
            return; // empty input — nothing to transcribe
        }
        const firstFrame = first.value;
        const url = BuildDeepgramURL(opts, firstFrame);

        const queue = new TranscriptQueue();
        const socket = new WebSocket(url, {
            headers: { Authorization: `Token ${apiKey}` },
        });
        socket.binaryType = 'arraybuffer';

        socket.on('message', (data, isBinary) => {
            if (isBinary) {
                return; // Deepgram only sends JSON downstream
            }
            const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
            let parsed: DeepgramResultsMessage | null = null;
            try {
                parsed = JSON.parse(text) as DeepgramResultsMessage;
            } catch {
                return;
            }
            if (!parsed || parsed.type === 'Metadata' || parsed.type === 'SpeechStarted') {
                return;
            }
            const evt = MapResultsMessage(parsed);
            if (evt) {
                queue.Push(evt);
            }
        });

        socket.on('error', (err: Error) => {
            queue.Close(err);
        });

        socket.on('close', () => {
            queue.Close();
        });

        // Wait for open, then start pumping audio. Pumping runs in the
        // background so we can yield transcripts concurrently below.
        await new Promise<void>((resolve, reject) => {
            const onOpen = (): void => {
                socket.removeListener('error', onErr);
                resolve();
            };
            const onErr = (err: Error): void => {
                socket.removeListener('open', onOpen);
                reject(err);
            };
            socket.once('open', onOpen);
            socket.once('error', onErr);
        });

        const pump = (async (): Promise<void> => {
            try {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(firstFrame.data);
                }
                while (true) {
                    const next = await audioIter.next();
                    if (next.done) {
                        break;
                    }
                    if (socket.readyState !== WebSocket.OPEN) {
                        break;
                    }
                    socket.send(next.value.data);
                }
                // Tell Deepgram we're done so it flushes its final results.
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'CloseStream' }));
                }
            } catch (err) {
                queue.Close(err instanceof Error ? err : new Error(String(err)));
            }
        })();

        try {
            for await (const evt of queue) {
                yield evt;
            }
        } finally {
            // Ensure socket is closed even if consumer breaks out early.
            try {
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close(1000, 'client-finished');
                }
            } catch {
                // best-effort
            }
            await pump.catch(() => undefined);
        }
    }

    // ── Batch methods — not implemented in Phase 1(e) ─────────────────────────

    public async CreateSpeech(_params: TextToSpeechParams): Promise<SpeechResult> {
        throw new Error('DeepgramAudioGenerator.CreateSpeech: Deepgram is STT-only; use a TTS provider.');
    }

    public async SpeechToText(_params: SpeechToTextParams): Promise<SpeechResult> {
        throw new Error('DeepgramAudioGenerator.SpeechToText: batch transcription not yet implemented. Use TranscribeStream for now.');
    }

    public async GetVoices(): Promise<VoiceInfo[]> {
        return [];
    }

    public async GetModels(): Promise<AudioModel[]> {
        return [];
    }

    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        return [];
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ['TranscribeStream'];
    }
}
