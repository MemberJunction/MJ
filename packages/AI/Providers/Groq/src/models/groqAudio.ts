import {
    AudioModel,
    AudioSplitter,
    BaseAudioGenerator,
    ErrorAnalyzer,
    ModelUsage,
    PronounciationDictionary,
    SpeechResult,
    SpeechToTextParams,
    TextToSpeechParams,
    TranscriptionPiece,
    VoiceInfo,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import Groq, { toFile } from 'groq-sdk';

/**
 * Groq's documented upload ceiling for the transcription endpoint. The request is rejected
 * outright above this, so it is a hard boundary rather than a tuning knob.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Leave headroom under the ceiling: multipart framing and the form fields ride along with
 * the audio, and a piece sized exactly at the limit fails for the overhead alone.
 */
const SPLIT_TARGET_BYTES = 24 * 1024 * 1024;

const DEFAULT_MODEL = 'whisper-large-v3';

/**
 * The `verbose_json` transcription response, which carries the audio duration Groq bills by.
 * Declared locally because groq-sdk's `Transcription` type covers only the `json` shape.
 */
type GroqVerboseTranscription = {
    text?: string;
    duration?: number;
};

/**
 * Whether a transcription model accepts `response_format: 'verbose_json'`.
 *
 * Groq's STT surface is Whisper-only today, so asking unconditionally happens to work — but the
 * moment a non-Whisper model appears, an unconditional request turns every transcription through it
 * into a hard API error. The sibling OpenAI provider already carries this guard because OpenAI's
 * GPT-4o transcription models reject `verbose_json` outright; the asymmetry was the bug, not the
 * behaviour.
 *
 * Matched with `includes` rather than `startsWith`: Groq serves `distil-whisper-large-v3-en`
 * alongside `whisper-large-v3`, and it is a Whisper model that supports `verbose_json`. A
 * `startsWith('whisper')` test would deny it the duration field and leave every run through it
 * uncosted — the exact failure this PR exists to remove.
 */
function supportsVerboseJson(model: string): boolean {
    return model.toLowerCase().includes('whisper');
}

/**
 * Groq implementation of {@link BaseAudioGenerator}, covering speech-to-text via Whisper.
 *
 * Groq offers no text-to-speech surface, so `CreateSpeech` and the voice/dictionary methods
 * are not supported — `GetSupportedMethods` reports exactly what works.
 *
 * Whisper on Groq does **not** do speaker diarization. There is no parameter for it and no
 * way to emulate it from the response, so a caller that needs speaker labels needs a
 * different provider (AssemblyAI, Deepgram) rather than a flag here.
 *
 * Audio above Groq's 25MB upload ceiling requires an {@link AudioSplitter}, assigned to
 * {@link Splitter}. Without one, oversized audio fails with a message naming the option
 * rather than silently transcribing a truncated prefix.
 */
@RegisterClass(BaseAudioGenerator, 'GroqAudioGenerator')
export class GroqAudioGenerator extends BaseAudioGenerator {
    private _client: Groq;

    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Groq({ apiKey: apiKey });
    }

    /**
     * Read only getter for the underlying Groq client instance
     */
    public get GroqClient(): Groq {
        return this._client;
    }

    /**
     * Optional splitter used only when the audio exceeds Groq's upload ceiling. See
     * {@link AudioSplitter} for why this is injected rather than bundled.
     */
    public Splitter: AudioSplitter | null = null;

    /**
     * Transcribes audio to text using one of Groq's Whisper models.
     *
     * Pieces of split audio are transcribed **sequentially**, not in parallel: Groq rate
     * limits by audio-seconds per minute, so firing an hour of audio at once buys nothing
     * but 429s, and a partial failure mid-way would leave a transcript with an unmarked
     * hole in it.
     */
    public async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
        const result = new SpeechResult();
        try {
            const audio = this.resolveAudio(params);
            const model = params.model || DEFAULT_MODEL;

            const transcription = await this.TranscribeWithSplitting(
                audio,
                MAX_UPLOAD_BYTES,
                SPLIT_TARGET_BYTES,
                this.Splitter,
                'Groq',
                (piece) => this.transcribeOne(piece, model, params),
            );

            if (transcription.text.trim().length === 0) {
                // Whisper returns an empty string for silence, and for audio it could not
                // decode. Both are failures from the caller's point of view — an empty
                // transcript reported as success gets stored as if it were the content.
                throw new Error('Transcription returned no text; the audio may be silent or in an unsupported format');
            }

            result.success = true;
            result.content = transcription.text;
            if (transcription.durationSeconds != null) {
                // Groq bills Whisper by audio-hour, so the duration is the billable quantity —
                // without it a transcription run prices as free.
                result.usage = ModelUsage.ForMedia('Seconds', transcription.durationSeconds);
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'Groq Whisper');
            result.success = false;
            result.errorMessage = error?.message || 'Unknown error occurred';
            console.error('Groq Whisper error:', error, errorInfo);
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
        // `verbose_json` rather than `json` purely for the `duration` field — the quantity Groq
        // bills by. The transcript text is identical between the two formats. Models that would
        // reject verbose_json fall back to `json` and simply report no duration.
        const response = await this._client.audio.transcriptions.create({
            file: await toFile(audio, params.fileName || 'audio.mp3'),
            model,
            response_format: supportsVerboseJson(model) ? 'verbose_json' : 'json',
            language: params.language,
            prompt: params.prompt,
            temperature: params.temperature,
        });

        // groq-sdk types the verbose response as the plain transcription shape, without `duration`.
        // Narrow it here and range-check rather than trusting the cast: an absent or nonsense
        // duration must leave usage unreported, not produce a NaN cost.
        //
        // `> 0`, not `>= 0`: a zero duration is not a billable quantity. Accepting it produces
        // `ForMedia('Seconds', 0)`, which the pricing layer then refuses as "a measure with no
        // quantity" and logs as an error — the right outcome reached by a route that reports
        // genuinely silent audio as a fault. Leaving usage undefined says the same thing quietly.
        const verbose = response as GroqVerboseTranscription;
        const duration = typeof verbose.duration === 'number' && isFinite(verbose.duration) && verbose.duration > 0
            ? verbose.duration
            : undefined;

        return { text: response.text ?? '', durationSeconds: duration };
    }

    public async CreateSpeech(_params: TextToSpeechParams): Promise<SpeechResult> {
        throw new Error('Groq does not offer a text-to-speech API');
    }

    public async GetVoices(): Promise<VoiceInfo[]> {
        // Transcription only — there are no voices to enumerate.
        return [];
    }

    public async GetModels(): Promise<AudioModel[]> {
        // Hardcoded rather than listed from the API: Groq's /models endpoint returns every
        // model on the platform, LLMs included, with nothing on the row to identify which
        // ones the transcription endpoint accepts.
        return [
            {
                id: 'whisper-large-v3',
                name: 'Whisper Large v3',
                supportsTextToSpeech: false,
                supportsVoiceConversion: false,
                supportsStyle: false,
                supportsSpeakerBoost: false,
                supportsFineTuning: false,
            },
            {
                id: 'whisper-large-v3-turbo',
                name: 'Whisper Large v3 Turbo',
                supportsTextToSpeech: false,
                supportsVoiceConversion: false,
                supportsStyle: false,
                supportsSpeakerBoost: false,
                supportsFineTuning: false,
            },
        ];
    }

    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        return [];
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ['SpeechToText', 'GetModels'];
    }
}
