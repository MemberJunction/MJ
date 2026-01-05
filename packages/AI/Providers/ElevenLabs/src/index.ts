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
            const audio = await this._elevenLabs.textToSpeech.convert(
                params.voice,
                {
                    text: params.text,
                    modelId: params.model_id,
                    voiceSettings: params.voice_settings,
                    pronunciationDictionaryLocators: params.pronunciation_dictionary_locators,
                }
            )
            const chunks: Uint8Array[] = [];
            for await (let chunk of audio) {
                chunks.push(chunk);
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
                voiceInfo.id = voice.voiceId;
                voiceInfo.name = voice.name;
                voiceInfo.description = voice.labels?.description;
                voiceInfo.labels = [];
                for (const label in voice.labels) {
                    voiceInfo.labels.push({key: label, value: voice.labels[label]});
                }
                voiceInfo.category = voice.category;
                voiceInfo.previewUrl = voice.previewUrl;
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
            const models = await this._elevenLabs.models.list();
            for (const model of models) {
                const audioModel = new AudioModel();
                audioModel.id = model.modelId;
                audioModel.name = model.name;
                audioModel.supportsTextToSpeech = model.canDoTextToSpeech;
                audioModel.supportsVoiceConversion = model.canDoVoiceConversion;
                audioModel.supportsStyle = model.canUseStyle;
                audioModel.supportsSpeakerBoost = model.canUseSpeakerBoost;
                audioModel.supportsFineTuning = model.canBeFinetuned;
                audioModel.languages = [];
                for (const language of model.languages || []) {
                    audioModel.languages.push({id: language.languageId, name: language.name});
                }

                result.push(audioModel);
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'ElevenLabs');
            console.error('ElevenLabs GetModels error:', errorInfo);
        }
        return result;
    }

    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        const result: PronounciationDictionary[] = [];
        try {
            const pronounciationDictionaries = await this._elevenLabs.pronunciationDictionaries.list();
            for (const pronounciationDictionary of pronounciationDictionaries.pronunciationDictionaries) {
                const dictionary = new PronounciationDictionary();
                dictionary.id = pronounciationDictionary.id;
                dictionary.name = pronounciationDictionary.name;
                dictionary.description = pronounciationDictionary.description;
                dictionary.latestVersionId = pronounciationDictionary.latestVersionId;
                dictionary.createdBy = pronounciationDictionary.createdBy;
                dictionary.creationTimeStamp = pronounciationDictionary.creationTimeUnix;
                result.push(dictionary);
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