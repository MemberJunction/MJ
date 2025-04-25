import { RegisterClass } from "@memberjunction/global";
import { BaseAudioGenerator, TextToSpeechParams, SpeechResult, SpeechToTextParams, VoiceInfo, AudioModel, PronounciationDictionary } from "@memberjunction/ai";
import { ElevenLabsClient } from "elevenlabs";

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
            const audio = await this._elevenLabs.generate(
                {
                    text: params.text,
                    model_id: params.model_id,
                    voice_settings: params.voice_settings,
                    apply_text_normalization: params.apply_text_normalization,
                    pronunciation_dictionary_locators: params.pronunciation_dictionary_locators,
                }
            )
            const chunks: Uint8Array[] = [];
            for await (let chunk of audio) {
                chunks.push(chunk);
            }
            const audioBuffer = Buffer.concat(chunks);
            speechResult.data = audioBuffer;
            speechResult.success = true;
            speechResult.content = audioBuffer.toString('base64'); // Convert to base64 string
        } catch (error) {
            speechResult.success = false;
            speechResult.errorMessage = error.message;
            console.error(error);
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
                voiceInfo.id = voice.voice_id;
                voiceInfo.name = voice.name;
                voiceInfo.description = voice.labels.description;
                voiceInfo.labels = [];
                for (const label in voice.labels) {
                    voiceInfo.labels.push({key: label, value: voice.labels[label]});
                }
                voiceInfo.category = voice.category;
                voiceInfo.previewUrl = voice.preview_url;
                result.push(voiceInfo);
            }
        } catch (error) {
            console.error(error);
        }
        return result;
    }

    public async GetModels(): Promise<AudioModel[]> {
        const result: AudioModel[] = [];
        try {
            const models = await this._elevenLabs.models.getAll();
            for (const model of models) {
                const audioModel = new AudioModel();
                audioModel.id = model.model_id;
                audioModel.name = model.name;
                audioModel.supportsTextToSpeech = model.can_do_text_to_speech;
                audioModel.supportsVoiceConversion = model.can_do_voice_conversion;
                audioModel.supportsStyle = model.can_use_style;
                audioModel.supportsSpeakerBoost = model.can_use_speaker_boost;
                audioModel.supportsFineTuning = model.can_be_finetuned;
                audioModel.languages = [];
                for (const language of model.languages) {
                    audioModel.languages.push({id: language.language_id, name: language.name});
                }

                result.push(audioModel);
            }
        } catch (error) {
            console.error(error);
        }
        return result;
    }

    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        const result: PronounciationDictionary[] = [];
        try {
            const pronounciationDictionaries = await this._elevenLabs.pronunciationDictionary.getAll();
            for (const pronounciationDictionary of pronounciationDictionaries.pronunciation_dictionaries) {
                const dictionary = new PronounciationDictionary();
                dictionary.id = pronounciationDictionary.id;
                dictionary.name = pronounciationDictionary.name;
                dictionary.description = pronounciationDictionary.description;
                dictionary.latestVersionId = pronounciationDictionary.latest_version_id;
                dictionary.createdBy = pronounciationDictionary.created_by;
                dictionary.creationTimeStamp = pronounciationDictionary.creation_time_unix;
                result.push(dictionary);
            }
        } catch (error) {
            console.error(error);
        }
        return result;
    }

    public async GetSupportedMethods() {
        return ["CreateSpeech", "GetVoices", "GetModels", "GetPronounciationDictionaries"];
    }
}