import { BaseModel, BaseParams } from "./baseModel";
import { ChatResult } from "./chat.types";

/**
 * Base class for all audio generation models. Each AI model will have a sub-class implementing the abstract methods in this base class. Not all 
 * sub-classes will support all methods. If a method is not supported an exception will be thrown, use the GetSupportedMethods method to determine
 * what methods are supported by a specific sub-class.
 */
export abstract class BaseAudioGenerator extends BaseModel {
    public abstract CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult>;
    public abstract SpeechToText(params: SpeechToTextParams): Promise<SpeechResult>;
    public abstract GetVoices(): Promise<VoiceInfo[]>;
    public abstract GetModels(): Promise<AudioModel[]>
    public abstract GetPronounciationDictionaries(): Promise<PronounciationDictionary[]>
    public abstract GetSupportedMethods(): Promise<string[]>
}

/**
 * Return payload for each CreateSpeech request
 */
export class SpeechResult {
    /**
     * True if the request was successful, false otherwise
     */
    success: boolean;
    /**
     * If the request failed, this will contain the error message
     */
    errorMessage?: string;
    /**
     * If the request was successful, this will contain the results. For CreateSpeech requests, an audio file in a base 64 encoded string and for
     * SpeechToText requests, the text that was transcribed.
     */
    content: string;
    data?: Buffer;
}

export class SpeechToTextParams extends BaseParams {
    /**
     * Base 64 encoded audio file to convert to text
     */
    audioFile: string;    
}

/**
 * Interface defining voice configuration settings for text-to-speech generation
 */
export interface VoiceSettings {
    /** Stability of the voice (0-1), higher values result in more consistent/stable voice output */
    stability: number;
    /** Similarity boost to original voice (0-1), higher values make the voice more similar to the original */
    similarity_boost: number;
    /** Style parameter (0-1) affecting the speech style characteristics */
    style: number;
    /** Whether to enhance speaker clarity and target voice characteristics */
    use_speaker_boost: boolean;
    /** Speed of speech (0-1), higher values result in faster speech */
    speed: number;
}

/**
 * Parameters for text-to-speech generation requests
 */
export interface TextToSpeechParams {
    /** Voice ID or name to use for speech generation */
    voice: string;
    /** Text content to convert to speech */
    text: string;
    
    /** Model ID to use, defaults to "eleven_monolingual_v1" */
    model_id?: string;
    /** Whether to stream the response */
    stream?: boolean;
    /** Voice configuration settings */
    voice_settings?: VoiceSettings;
    /** Output format specified as codec_samplerate_bitrate (e.g., "mp3_44100_128") */
    output_format?: string;
    /** Optimization level (0-4), where 0 is no optimization and 4 is maximum optimization */
    latency?: number;
    /** Text that came before this generation, used for maintaining continuity */
    previous_text?: string;
    /** ID of the previous generation request */
    previous_request_id?: string;
    /** Array of IDs for next generations */
    next_request_ids?: string[];
    /** ISO 639-1 language code for the speech generation */
    language_code?: string;
    /** Text normalization setting to control how numbers and special characters are handled */
    apply_text_normalization?: "auto" | "on" | "off";
    /** Array of pronunciation dictionary locators for custom word pronunciations */
    pronunciation_dictionary_locators?: any[];
    /** Special instructions for the voice generation */
    instructions?: string;
}

/**
 * Contains information about a specific voice that can be used for audio generation
 */
export class VoiceInfo {
    /**
     * The ID of the voice
     */
    id: string

    /**
     * The name of the voice
     */
    name: string

    /**
     * Detailed text description of the voice
     */
    description?: string;

    /**
     * Optional, array of labels for the voice
     */
    labels?: object[];

    /**
     * User defined category for managing voices
     */
    category?: string

    stability?: number
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: number;

    /**
     * An optional array of samples audio for the voice
     */
    samples?: VoiceSample[];

    /**
     * The URL to a preview of the voice
     */
    previewUrl?: string;
}

/**
 * Information about an individual voice sample associated with a voice
 */
export class VoiceSample {
    id: string;
    fileName: string;
    mimeType: string;
    sizeInBytes: number;
    hash: string;
}

export class AudioModel {
    /**
     * The ID of the model
     */
    id: string

    /**
     * The name of the model
     */
    name: string

    /**
     * Determines if the model supports text-to-speech
     */
    supportsTextToSpeech: boolean
    /**
     * Determines if the model supports voice conversion
     */
    supportsVoiceConversion: boolean
    /**
     * Determines if the model supports style adjustment
     */
    supportsStyle: boolean
    /**
     * Determines if the model supports speaker boost
     */
    supportsSpeakerBoost: boolean
    /**
     * Determines if the model supports fine tuning
     */
    supportsFineTuning: boolean
    /**
     * Optional, array of supported languages for the model
     */
    languages?: AudioLanguage[]
}

export class AudioLanguage {
    /**
     * The ID of the language
     */
    id: string
    /**
     * The name of the language
     */
    name: string
}

/**
 * Some models support using pronounciation dictionaries to provide audio generation cues for specific words and phrases
 */
export class PronounciationDictionary {
    id: string
    name: string;
    description?: string;
    latestVersionId: string;
    createdBy: string;
    creationTimeStamp: number;
}