import { RegisterClass } from "@memberjunction/global";
import { AudioSplitter, BaseAudioGenerator, TextToSpeechParams, SpeechResult, SpeechToTextParams, TranscriptionPiece, VoiceInfo, AudioModel, ModelUsage, PronounciationDictionary, ErrorAnalyzer } from "@memberjunction/ai";
import { OpenAI, toFile } from "openai";

/**
 * OpenAI's documented upload ceiling for the transcription endpoint. Requests above it are
 * rejected outright, so it is a hard boundary rather than a tuning knob.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Leave headroom under the ceiling: multipart framing and the form fields ride along with the
 * audio, and a piece sized exactly at the limit fails for the overhead alone.
 */
const SPLIT_TARGET_BYTES = 24 * 1024 * 1024;

/**
 * OpenAI's transcription model. Note this endpoint serves Whisper large-v2 weights, not the v3
 * checkpoint other providers host under the "Whisper Large v3" name.
 */
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

/**
 * Whether a transcription model accepts `response_format: 'verbose_json'`.
 *
 * Only the Whisper endpoint does. OpenAI's GPT-4o transcription models accept `json` and `text`
 * ONLY and reject `verbose_json` outright, so asking for it unconditionally would turn a working
 * transcription into a 400 for anyone passing one of those model names. They report no duration
 * either way, so those runs stay uncosted — which is the honest outcome, and far better than
 * failing the transcription to chase a number the endpoint never returns.
 */
function supportsVerboseJson(model: string): boolean {
    return model.toLowerCase().startsWith("whisper");
}

@RegisterClass(BaseAudioGenerator, "OpenAIAudioGenerator")
export class OpenAIAudioGenerator extends BaseAudioGenerator {
    private _openAI: OpenAI;

    constructor(apiKey: string) {
        super(apiKey);
        this._openAI = new OpenAI({apiKey: apiKey});
    }

    /**
     * Optional splitter used only when audio exceeds OpenAI's upload ceiling. See
     * {@link AudioSplitter} for why splitting is injected rather than bundled.
     */
    public Splitter: AudioSplitter | null = null;

    public async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        const speechResult = new SpeechResult();
        try {
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
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI TTS');
            speechResult.success = false;
            speechResult.errorMessage = error?.message || 'Unknown error occurred';
            console.error(`OpenAI TTS error:`, error, errorInfo);
        }
        return speechResult;
    }

    /**
     * Transcribes audio to text using OpenAI's Whisper endpoint.
     *
     * Audio above the 25MB upload ceiling requires an {@link AudioSplitter} on {@link Splitter};
     * without one, oversized audio fails with a message naming the option rather than silently
     * transcribing a truncated prefix. Pieces are transcribed sequentially — see
     * {@link BaseAudioGenerator.TranscribeWithSplitting}.
     */
    public async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
        const result = new SpeechResult();
        try {
            const audio = this.resolveAudio(params);
            const model = params.model || DEFAULT_TRANSCRIPTION_MODEL;

            const transcription = await this.TranscribeWithSplitting(
                audio,
                MAX_UPLOAD_BYTES,
                SPLIT_TARGET_BYTES,
                this.Splitter,
                "OpenAI",
                (piece) => this.transcribeOne(piece, model, params)
            );

            if (transcription.text.trim().length === 0) {
                // Whisper returns an empty string both for silence and for audio it could not
                // decode. Reported as success, an empty transcript gets stored as if it were
                // the content.
                throw new Error("Transcription returned no text; the audio may be silent or in an unsupported format");
            }

            result.success = true;
            result.content = transcription.text;
            if (transcription.durationSeconds != null) {
                // OpenAI bills whisper-1 per minute of audio, so duration is the billable
                // quantity — without it a transcription run prices as free.
                result.usage = ModelUsage.ForMedia("Seconds", transcription.durationSeconds);
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI Whisper');
            result.success = false;
            result.errorMessage = error?.message || 'Unknown error occurred';
            console.error(`OpenAI Whisper error:`, error, errorInfo);
        }
        return result;
    }

    /**
     * Resolve the audio bytes from whichever of the two input forms the caller used.
     */
    private resolveAudio(params: SpeechToTextParams): Buffer {
        if (params.audioData && params.audioData.byteLength > 0) {
            return params.audioData;
        }
        if (params.audioFile && params.audioFile.length > 0) {
            return Buffer.from(params.audioFile, 'base64');
        }
        throw new Error('SpeechToText requires either audioData (Buffer) or audioFile (base 64 string)');
    }

    private async transcribeOne(audio: Buffer, model: string, params: SpeechToTextParams): Promise<TranscriptionPiece> {
        // `verbose_json` rather than `json` purely for the `duration` field — the quantity OpenAI
        // bills by. The transcript text is identical between the two formats. Models that reject
        // verbose_json fall back to `json` and simply report no duration.
        const response = await this._openAI.audio.transcriptions.create({
            file: await toFile(audio, params.fileName || 'audio.mp3'),
            model,
            response_format: supportsVerboseJson(model) ? 'verbose_json' : 'json',
            language: params.language,
            prompt: params.prompt,
            temperature: params.temperature
        });

        // `> 0`, not `>= 0`: a zero duration is not a billable quantity. Accepting it produces
        // `ForMedia('Seconds', 0)`, which the pricing layer then refuses as "a measure with no
        // quantity" and logs as an error — the right outcome reached by a route that reports
        // genuinely silent audio as a fault. Leaving usage undefined says the same thing quietly.
        const reported = (response as { duration?: number }).duration;
        const duration = typeof reported === 'number' && isFinite(reported) && reported > 0
            ? reported
            : undefined;

        return { text: response.text ?? '', durationSeconds: duration };
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
            },
            {
                id: DEFAULT_TRANSCRIPTION_MODEL,
                name: "Whisper 1",
                supportsTextToSpeech: false,
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
        return ["CreateSpeech", "SpeechToText", "GetVoices", "GetModels"];
    }
}