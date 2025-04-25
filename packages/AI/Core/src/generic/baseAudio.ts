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

// Define the interface for TextToSpeechParams
export interface VoiceSettings {
    stability: number;          // 0-1, higher means more stable/consistent
    similarity_boost: number;   // 0-1, higher means more similar to original voice
    style: number;              // 0-1, speech style
    use_speaker_boost: boolean; // Enhance speaker clarity and target voice
    speed: number;              // 0-1, higher means faster
  }
  
export interface TextToSpeechParams {
    // Required parameters
    voice: string;              // Voice ID or name
    text: string;               // Text to convert to speech
    
    // Optional parameters
    model_id?: string;          // Model ID, default is "eleven_monolingual_v1"
    stream?: boolean;           // Whether to stream the response
    voice_settings?: VoiceSettings; // Voice configuration
    output_format?: string;     // Format as codec_samplerate_bitrate (e.g., "mp3_44100_128")
    latency?: number;           // 0-4, optimization level (0 = no optimization, 4 = max)
    previous_text?: string;     // Text that came before this generation (for continuity)
    previous_request_id?: string; // ID of previous generation
    next_request_ids?: string[]; // IDs of next generations
    language_code?: string;     // ISO 639-1 language code
    apply_text_normalization?: "auto" | "on" | "off"; // Text normalization setting (spell out numbers, etc)
    pronunciation_dictionary_locators?: any[]; // Pronunciation dictionary locators
    instructions?: string; // Instructions for the voice
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