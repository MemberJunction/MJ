import { RegisterClass } from "@memberjunction/global";
import { BaseAudioGenerator, TextToSpeechParams, SpeechResult, SpeechToTextParams, VoiceInfo, AudioModel, PronounciationDictionary, ErrorAnalyzer } from "@memberjunction/ai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

@RegisterClass(BaseAudioGenerator, "ElevenLabsAudioGenerator")
export class ElevenLabsAudioGenerator extends BaseAudioGenerator {
    private _elevenLabs: ElevenLabsClient;

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

            const audioBuffer = Buffer.concat(chunks);
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
        return ["CreateSpeech", "GetVoices", "GetModels", "GetPronounciationDictionaries"];
    }
}

export function LoadElevenLabsAudioGenerator() {
    // does nothing, avoid tree shaking that will get rid of this class since there is no static link to this class in the code base as it is loaded dynamically
}