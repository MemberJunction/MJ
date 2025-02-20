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
}

export class SpeechToTextParams extends BaseParams {
    /**
     * Base 64 encoded audio file to convert to text
     */
    audioFile: string;    
}

export class TextToSpeechParams extends BaseParams {
    /**
     * The text to convert to audio
     */
    text: string

    /**
     * The ID for the voice to use - each text-to-audio system has its own catalog of possible voices
     */
    voiceId: string

    /**
     * The ID for the model to use for audio generation
     */
    modelId: string

    stability?: number;
    similarityBoost?: number;
    style?: number;
    speakerBoost?: number;

    pronounciationDictionaries?: PronounciationDictionary[];

    /**
     * The speed of the audio, in words per minute
     */
    speed: 'slow' | 'normal' | 'fast';

    /**
     * Base format type
     */

    outputFormat?: 'mp3' | 'pcm' | 'ulaw';
    /**
     * Additional output format information such as mp3_22050_32 or pcm_16000
     */
    outputFormatDetails?: string; 
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
    labels?: string[];

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