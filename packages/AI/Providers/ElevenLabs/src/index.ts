import { RegisterClass } from "@memberjunction/global";
import { AIErrorInfo, BaseAudioGenerator, BaseTextToSpeech, BuildCancellationErrorInfo, IsRequestAborted, ThrowIfAborted, TextToSpeechParams, SpeechResult, SpeechToTextParams, VoiceInfo, AudioModel, PronounciationDictionary, ErrorAnalyzer } from "@memberjunction/ai";
import { ElevenLabs, ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Realtime (Agents Platform) driver — BaseRealtimeModel implementation
export * from './elevenLabsRealtime';
// Eleven Realtime (OpenAI-Realtime-compatible speech-to-speech models) — BaseRealtimeModel implementation
export * from './elevenRealtime';
export * from './elevenLabsVoices';

/**
 * ElevenLabs text-to-speech, with voice and pronunciation-dictionary listing. It does not implement
 * speech-to-text.
 *
 * Registered against {@link BaseTextToSpeech} under the key model metadata names. It still extends,
 * and is registered against, `BaseAudioGenerator`, so callers that resolve it through the old base
 * keep working.
 */
@RegisterClass(BaseAudioGenerator, "ElevenLabsAudioGenerator")
@RegisterClass(BaseTextToSpeech, "ElevenLabsAudioGenerator")
export class ElevenLabsAudioGenerator extends BaseAudioGenerator {
    private _elevenLabs: ElevenLabsClient;

    constructor(apiKey: string) {
        super(apiKey);
        this._elevenLabs = new ElevenLabsClient({apiKey: apiKey});
    }

    /**
     * Speaks `params.text`. `params.CancellationToken` is passed to the request, and reading the audio
     * stops as soon as it aborts; the failure is then classified as a cancellation.
     *
     * When `params.IncludeTimestamps` is `true`, calls `textToSpeech.convertWithTimestamps` and populates
     * `SpeechResult.Alignment` alongside `content` and `data`.
     */
    public async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        const speechResult = new SpeechResult();
        const signal = params.CancellationToken;
        try {
            if (params.IncludeTimestamps) {
                const request: ElevenLabs.BodyTextToSpeechFullWithTimestamps = {
                    text: params.text,
                    modelId: params.model_id,
                    voiceSettings: params.voice_settings,
                    applyTextNormalization: params.apply_text_normalization,
                    pronunciationDictionaryLocators: params.pronunciation_dictionary_locators,
                };
                const response: ElevenLabs.AudioWithTimestampsResponse =
                    await this._elevenLabs.textToSpeech.convertWithTimestamps(
                        params.voice,
                        request,
                        { abortSignal: signal }
                    );
                ThrowIfAborted(signal, 'ElevenLabs');

                speechResult.content = response.audioBase64;
                speechResult.data = Buffer.from(response.audioBase64, 'base64');
                const alignment: ElevenLabs.CharacterAlignmentResponseModel | undefined =
                    response.alignment ?? response.normalizedAlignment;
                if (alignment) {
                    speechResult.Alignment = {
                        Characters: alignment.characters,
                        StartSeconds: alignment.characterStartTimesSeconds,
                        EndSeconds: alignment.characterEndTimesSeconds,
                    };
                }
                speechResult.success = true;
            } else {
                // New API uses textToSpeech.convert instead of generate
                const audioStream = await this._elevenLabs.textToSpeech.convert(
                    params.voice,
                    {
                        text: params.text,
                        modelId: params.model_id,
                        voiceSettings: params.voice_settings,
                        applyTextNormalization: params.apply_text_normalization,
                        pronunciationDictionaryLocators: params.pronunciation_dictionary_locators,
                    },
                    { abortSignal: signal }
                )

                const audioBuffer = await this.readAudio(audioStream, signal);
                speechResult.data = audioBuffer;
                speechResult.content = audioBuffer.toString('base64'); // Convert to base64 string
                speechResult.success = true;
            }
        } catch (error) {
            const errorInfo = this.classifySpeechError(error, signal);
            speechResult.success = false;
            speechResult.errorMessage = error?.message || 'Unknown error occurred';
            // Kept so a caller can tell a rejected request (a 422 for an unknown voice) from an
            // outage: the message alone loses the SDK error's HTTP status.
            speechResult.errorInfo = errorInfo;
            console.error('ElevenLabs CreateSpeech error:', error, errorInfo);
        }
        return speechResult;
    }

    /**
     * Reads the audio stream into one buffer. When `signal` aborts, the stream is cancelled, so the
     * pending read ends at once, and a cancellation error is thrown instead of returning partial audio.
     */
    private async readAudio(audioStream: ReadableStream<Uint8Array>, signal: AbortSignal | undefined): Promise<Buffer> {
        const chunks: Uint8Array[] = [];
        const reader = audioStream.getReader();
        const onAbort = (): void => {
            reader.cancel(signal?.reason).catch(() => undefined);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        let finished = false;
        try {
            while (true) {
                ThrowIfAborted(signal, 'ElevenLabs');
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }
            ThrowIfAborted(signal, 'ElevenLabs');
            finished = true;
        } finally {
            signal?.removeEventListener('abort', onAbort);
            // A read that stopped early — including an abort before the listener was attached — must
            // still cancel the stream, or the response body stays open until it is collected.
            if (!finished) {
                reader.cancel(signal?.reason).catch(() => undefined);
            }
            reader.releaseLock();
        }
        return Buffer.concat(chunks);
    }

    /**
     * Classifies a failed speech request. A request ended by its `CancellationToken` is a
     * cancellation (never failed over), or a network error when the signal was aborted by a timeout;
     * anything else is the analyzer's reading of the SDK's error, which keeps its HTTP status.
     */
    private classifySpeechError(error: unknown, signal: AbortSignal | undefined): AIErrorInfo {
        if (IsRequestAborted(error, signal)) {
            return BuildCancellationErrorInfo({ error, signal, provider: 'ElevenLabs' });
        }
        return ErrorAnalyzer.analyzeError(error, 'ElevenLabs');
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
        return ["CreateSpeech", "GetVoices", "GetModels", "GetPronounciationDictionaries"];
    }
}