import { BaseModel } from "./baseModel";
import type { AudioModel, PronounciationDictionary, SpeechResult, TextToSpeechParams, VoiceInfo } from "./baseAudio";

/**
 * Base class for text-to-speech models: text in, audio out. Drivers are resolved through the
 * ClassFactory for `MJ: AI Models` of type `TTS`, keyed by the model vendor's `DriverClass`, and
 * are run by `AITextToSpeechRunner` in `@memberjunction/ai-prompts`.
 *
 * Split from `BaseAudioGenerator`, which also carries speech-to-text. A driver that does both
 * registers against this class and `BaseSpeechToText` under the same key.
 */
export abstract class BaseTextToSpeech extends BaseModel {
    /**
     * Speaks `params.text` in `params.voice`. On success the audio is in `SpeechResult.data`, and
     * base 64 encoded in `SpeechResult.content`.
     */
    public abstract CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult>;

    /** The voices the driver can speak in. */
    public abstract GetVoices(): Promise<VoiceInfo[]>;

    /** The driver's speech models. */
    public abstract GetModels(): Promise<AudioModel[]>;

    /** The pronunciation dictionaries available to the driver; empty when it has none. */
    public abstract GetPronounciationDictionaries(): Promise<PronounciationDictionary[]>;

    /** The names of the methods this driver implements. */
    public abstract GetSupportedMethods(): Promise<string[]>;
}
