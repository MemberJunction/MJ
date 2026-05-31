import { RegisterClass } from "@memberjunction/global";
import { BaseAudioGenerator, TextToSpeechParams, SpeechResult, SpeechToTextParams, VoiceInfo, AudioModel, PronounciationDictionary, ErrorAnalyzer, AudioFrame, StreamingTTSOptions } from "@memberjunction/ai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import WebSocket from "ws";
import { AsyncQueue } from "./helpers/AsyncQueue";

/**
 * Loose shape for inbound ElevenLabs WS messages. The server emits
 * `{ audio: <base64>, isFinal?: boolean }` for audio chunks; final messages
 * may omit `audio`. Other shapes (e.g. error envelopes) are tolerated.
 */
interface ElevenLabsInboundMessage {
    audio?: string | null;
    isFinal?: boolean;
    error?: string;
    message?: string;
}

@RegisterClass(BaseAudioGenerator, "ElevenLabsAudioGenerator")
export class ElevenLabsAudioGenerator extends BaseAudioGenerator {
    private _elevenLabs: ElevenLabsClient;

    public override SupportsStreaming = true;

    constructor(apiKey: string) {
        super(apiKey);
        this._elevenLabs = new ElevenLabsClient({apiKey: apiKey});
    }

    public async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        const speechResult = new SpeechResult();
        try {
            // New API uses textToSpeech.convert instead of generate
            const audioStream = await this._elevenLabs.textToSpeech.convert(
                params.voice,
                {
                    text: params.text,
                    modelId: params.model_id,
                    voiceSettings: params.voice_settings,
                    applyTextNormalization: params.apply_text_normalization,
                    pronunciationDictionaryLocators: params.pronunciation_dictionary_locators,
                }
            )

            // Convert ReadableStream to Buffer
            const chunks: Uint8Array[] = [];
            const reader = audioStream.getReader();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) chunks.push(value);
                }
            } finally {
                reader.releaseLock();
            }

            const audioBuffer = Buffer.concat(chunks as Uint8Array[]);
            speechResult.data = audioBuffer;
            speechResult.content = audioBuffer.toString('base64'); // Convert to base64 string
            speechResult.success = true;
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'ElevenLabs');
            speechResult.success = false;
            speechResult.errorMessage = error?.message || 'Unknown error occurred';
            console.error('ElevenLabs CreateSpeech error:', error, errorInfo);
        }
        return speechResult;
    }

    public async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
        throw new Error("Method not implemented.");
    }

    public async GetVoices(): Promise<VoiceInfo[]> {
        const result: VoiceInfo[] = [];
        try {
            const voices = await this._elevenLabs.voices.getAll();
            for (const voice of voices.voices) {
                const voiceInfo = new VoiceInfo();
                voiceInfo.id = voice.voiceId;  // Changed from voice_id to voiceId (camelCase)
                voiceInfo.name = voice.name;
                voiceInfo.description = voice.labels?.description;
                voiceInfo.labels = [];
                if (voice.labels) {
                    for (const label in voice.labels) {
                        voiceInfo.labels.push({key: label, value: voice.labels[label]});
                    }
                }
                voiceInfo.category = voice.category;
                voiceInfo.previewUrl = voice.previewUrl;  // Changed from preview_url to previewUrl (camelCase)
                result.push(voiceInfo);
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'ElevenLabs');
            console.error('ElevenLabs GetVoices error:', errorInfo);
        }
        return result;
    }

    public async GetModels(): Promise<AudioModel[]> {
        const result: AudioModel[] = [];
        try {
            // Changed from getAll() to list()
            const models = await this._elevenLabs.models.list();
            for (const model of models) {
                const audioModel = new AudioModel();
                // Handle both camelCase and snake_case property names
                audioModel.id = model.modelId || (model as any).model_id;
                audioModel.name = model.name;
                audioModel.supportsTextToSpeech = model.canDoTextToSpeech ?? (model as any).can_do_text_to_speech ?? false;
                audioModel.supportsVoiceConversion = model.canDoVoiceConversion ?? (model as any).can_do_voice_conversion ?? false;
                audioModel.supportsStyle = model.canUseStyle ?? (model as any).can_use_style ?? false;
                audioModel.supportsSpeakerBoost = model.canUseSpeakerBoost ?? (model as any).can_use_speaker_boost ?? false;
                audioModel.supportsFineTuning = model.canBeFinetuned ?? (model as any).can_be_finetuned ?? false;
                audioModel.languages = [];
                if (model.languages && Array.isArray(model.languages)) {
                    for (const language of model.languages) {
                        audioModel.languages.push({
                            id: (language as any).languageId || (language as any).language_id,
                            name: language.name
                        });
                    }
                }

                result.push(audioModel);
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'ElevenLabs');
            console.error('ElevenLabs GetModels error:', errorInfo);
        }
        return result;
    }

    /**
     * Retrieves all pronunciation dictionaries from ElevenLabs API.
     * Implements automatic pagination to fetch all available dictionaries across multiple pages.
     *
     * @returns Promise resolving to array of all pronunciation dictionaries
     */
    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        const result: PronounciationDictionary[] = [];
        try {
            let hasMore = true;
            let cursor: string | undefined = undefined;

            // Fetch all pages using pagination
            while (hasMore) {
                // Request with cursor for subsequent pages, max page size for efficiency
                const requestParams = cursor ? { cursor, pageSize: 100 } : { pageSize: 100 };
                const response = await this._elevenLabs.pronunciationDictionaries.list(requestParams);

                const dictionariesList = (response as any).pronunciationDictionaries ||
                                         (response as any).pronunciation_dictionaries ||
                                         [];

                // Convert API response to PronounciationDictionary objects
                for (const pronounciationDictionary of dictionariesList) {
                    const dictionary = new PronounciationDictionary();
                    dictionary.id = pronounciationDictionary.id;
                    dictionary.name = pronounciationDictionary.name;
                    dictionary.description = pronounciationDictionary.description;
                    // Handle both camelCase and snake_case
                    dictionary.latestVersionId = pronounciationDictionary.latestVersionId ||
                                               pronounciationDictionary.latest_version_id;
                    dictionary.createdBy = pronounciationDictionary.createdBy ||
                                          pronounciationDictionary.created_by;
                    dictionary.creationTimeStamp = pronounciationDictionary.creationTimeUnix ||
                                                  pronounciationDictionary.creation_time_unix;
                    result.push(dictionary);
                }

                // Check if there are more pages to fetch
                hasMore = (response as any).hasMore ?? false;
                cursor = (response as any).nextCursor;
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'ElevenLabs');
            console.error('ElevenLabs GetPronounciationDictionaries error:', errorInfo);
        }
        return result;
    }

    public async GetSupportedMethods() {
        return ["CreateSpeech", "SynthesizeStream", "GetVoices", "GetModels", "GetPronounciationDictionaries"];
    }

    /**
     * Resolves the ElevenLabs voice ID to use for a streaming request.
     * Order of precedence:
     *   1. `opts.VoiceProfile.ProviderOverridesJSON.elevenlabs.voiceId`
     *   2. Env var `ELEVENLABS_DEFAULT_VOICE_ID`
     *   3. First voice returned by `GetVoices()`
     */
    private async ResolveVoiceId(opts: StreamingTTSOptions): Promise<string> {
        // 1. ProviderOverridesJSON
        const overrides = opts.VoiceProfile?.ProviderOverridesJSON;
        if (overrides) {
            try {
                const parsed = JSON.parse(overrides) as { elevenlabs?: { voiceId?: string } };
                const voiceId = parsed?.elevenlabs?.voiceId;
                if (voiceId && typeof voiceId === 'string') return voiceId;
            } catch {
                // ignore malformed overrides; fall through to next strategy
            }
        }

        // 2. Env var
        const envVoiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
        if (envVoiceId) return envVoiceId;

        // 3. First listed voice
        const voices = await this.GetVoices();
        if (voices.length === 0) {
            throw new Error('ElevenLabs SynthesizeStream: no voices available — supply VoiceProfile.ProviderOverridesJSON.elevenlabs.voiceId or set ELEVENLABS_DEFAULT_VOICE_ID.');
        }
        return voices[0].id;
    }

    /**
     * Streaming text-to-speech via ElevenLabs WebSocket API. Consumes
     * `opts.TextStream` incrementally and yields PCM16 audio frames as the
     * server emits them. Uses Flash v2.5 by default (~75 ms first-chunk
     * latency) — override via `ELEVENLABS_TTS_MODEL` env var.
     *
     * Cleans up the WS connection when the caller stops iterating (via the
     * async iterator's `return()` hook).
     */
    public override async *SynthesizeStream(opts: StreamingTTSOptions): AsyncIterable<AudioFrame> {
        const voiceId = await this.ResolveVoiceId(opts);
        const modelId = process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
        const sampleRateHz = opts.SampleRateHz ?? 16000;
        const url = `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input?model_id=${encodeURIComponent(modelId)}&output_format=pcm_${sampleRateHz}`;

        const ws = new WebSocket(url);
        const audioQueue = new AsyncQueue<AudioFrame>();

        // Wait for the socket to open before sending anything.
        await new Promise<void>((resolve, reject) => {
            ws.once('open', () => resolve());
            ws.once('error', (err: Error) => reject(err));
        });

        // Send initial voice settings + auth in one frame (ElevenLabs accepts
        // xi_api_key on the first message instead of a header).
        ws.send(JSON.stringify({
            text: ' ', // ElevenLabs requires a non-empty first message; space is the documented init token
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
            xi_api_key: this.apiKey,
        }));

        // Wire up server -> queue plumbing.
        ws.on('message', (raw: WebSocket.RawData) => {
            try {
                const text = typeof raw === 'string' ? raw : raw.toString('utf8');
                const msg = JSON.parse(text) as ElevenLabsInboundMessage;
                if (msg.error) {
                    audioQueue.Fail(new Error(`ElevenLabs stream error: ${msg.error}${msg.message ? ` — ${msg.message}` : ''}`));
                    return;
                }
                if (msg.audio) {
                    const data = Buffer.from(msg.audio, 'base64');
                    audioQueue.Push({
                        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
                        sampleRateHz,
                        channelCount: 1,
                        mediaType: 'audio/pcm',
                    });
                }
                if (msg.isFinal === true) {
                    audioQueue.Close();
                }
            } catch (err) {
                audioQueue.Fail(err instanceof Error ? err : new Error(String(err)));
            }
        });

        ws.on('error', (err: Error) => {
            audioQueue.Fail(err);
        });

        ws.on('close', () => {
            audioQueue.Close();
        });

        // Drive the input stream in the background so we can yield audio
        // concurrently. Errors propagate via audioQueue.Fail().
        void (async () => {
            try {
                for await (const token of opts.TextStream) {
                    if (ws.readyState !== WebSocket.OPEN) break;
                    if (token.length === 0) continue;
                    ws.send(JSON.stringify({ text: token, try_trigger_generation: false }));
                }
                if (ws.readyState === WebSocket.OPEN) {
                    // End-of-input sentinel: per ElevenLabs's `stream-input`
                    // WebSocket API, an empty-string message terminates the
                    // input stream — ElevenLabs then sends final audio + an
                    // `isFinal: true` event and closes the socket.
                    //
                    // DO NOT include `flush: true` here. `flush: true` means
                    // "generate audio for the buffered text RIGHT NOW but
                    // keep accepting more text." We were sending both, which
                    // ElevenLabs interpreted as "flush, stay open"; the
                    // socket then idled for 20s and they fired
                    // `input_timeout_exceeded`. That surfaced to the engine
                    // as a turn-level error AFTER the user had already heard
                    // their reply — confusing and broken.
                    ws.send(JSON.stringify({ text: '' }));
                }
            } catch (err) {
                audioQueue.Fail(err instanceof Error ? err : new Error(String(err)));
                this.SafeCloseSocket(ws);
            }
        })();

        try {
            for await (const frame of audioQueue) {
                yield frame;
            }
        } finally {
            // Honor caller cancellation (early `break`) by closing the socket.
            this.SafeCloseSocket(ws);
        }
    }

    private SafeCloseSocket(ws: WebSocket): void {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            try { ws.close(); } catch { /* ignore */ }
        }
    }
}