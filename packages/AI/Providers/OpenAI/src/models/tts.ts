import { RegisterClass } from "@memberjunction/global";
import { BaseAudioGenerator, TextToSpeechParams, SpeechResult, SpeechToTextParams, VoiceInfo, AudioModel, PronounciationDictionary } from "@memberjunction/ai";
import { OpenAI } from "openai";

@RegisterClass(BaseAudioGenerator, "OpenAIAudioGenerator")
export class OpenAIAudioGenerator extends BaseAudioGenerator {
    private _openAI: OpenAI;

    constructor(apiKey: string) {
        super(apiKey);
        this._openAI = new OpenAI({apiKey: apiKey});
    }

    public async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        const speechResult = new SpeechResult();
        const audio = await this._openAI.audio.speech.create({
            model: params.model_id || (await this.GetModels())[0].id,
            voice: params.voice || (await this.GetVoices())[0].id,
            input: params.text,
            instructions: params.instructions || "Speak in a cheerful and positive tone"
        });

        const arrayBuffer = await audio.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);
        speechResult.data = audioBuffer;
        speechResult.success = true;
        speechResult.content = audioBuffer.toString('base64');
        return speechResult;
    }

    public async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
        throw new Error("Method not implemented.");
    }

    public async GetVoices(): Promise<VoiceInfo[]> {
        return [
            { id: "alloy", name: "Alloy" },
            { id: "echo", name: "Echo" },
            { id: "fable", name: "Fable" },
            { id: "onyx", name: "Onyx" },
            { id: "nova", name: "Nova" },
            { id: "shimmer", name: "Shimmer" }
        ];
    }

    public async GetModels(): Promise<AudioModel[]> {
        return [
            { 
                id: "gpt-4o-mini-tts", 
                name: "GPT-4o Mini TTS",
                supportsTextToSpeech: true,
                supportsVoiceConversion: false,
                supportsStyle: false,
                supportsSpeakerBoost: false,
                supportsFineTuning: false
            }
        ];
    }

    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        return [];
    }

    public async GetSupportedMethods() {
        return ["CreateSpeech", "GetVoices", "GetModels"];
    }
}