# @memberjunction/ai-elevenlabs

A comprehensive wrapper for ElevenLabs' audio generation API, enabling high-quality text-to-speech functionality within the MemberJunction framework.

## Features

- **Text-to-Speech**: Convert text to natural-sounding speech with advanced voice settings
- **Voice Library**: Access to ElevenLabs' extensive voice collection
- **Model Selection**: Support for different ElevenLabs speech generation models
- **Pronunciation Dictionaries**: Manage custom pronunciation dictionaries
- **Voice Customization**: Fine-tune voice parameters including stability, similarity boost, style, and speaker boost
- **Standardized Interface**: Implements MemberJunction's BaseAudioGenerator abstract class pattern
- **Streaming Support**: Generate audio with streaming capabilities
- **Multi-language Support**: Access to models with multiple language capabilities

## Installation

```bash
npm install @memberjunction/ai-elevenlabs
```

## Requirements

- Node.js 16+
- An ElevenLabs API key
- MemberJunction Core libraries (`@memberjunction/ai`, `@memberjunction/global`)

## Usage

### Initialize the ElevenLabs Client

```typescript
import { ElevenLabsAudioGenerator } from '@memberjunction/ai-elevenlabs';

// Initialize with your API key
const elevenLabs = new ElevenLabsAudioGenerator('your-elevenlabs-api-key');
```

### Get Available Voices

Retrieve the list of available voices:

```typescript
const voices = await elevenLabs.GetVoices();

// Display available voices
voices.forEach(voice => {
  console.log(`Voice: ${voice.name} (ID: ${voice.id})`);
  console.log(`Description: ${voice.description}`);
  console.log(`Category: ${voice.category}`);
  console.log(`Preview URL: ${voice.previewUrl}`);
  console.log('Labels:');
  voice.labels?.forEach(label => {
    console.log(`  ${label.key}: ${label.value}`);
  });
  console.log('---');
});
```

### Get Available Models

Retrieve information about the available speech models:

```typescript
const models = await elevenLabs.GetModels();

// Display available models
models.forEach(model => {
  console.log(`Model: ${model.name} (ID: ${model.id})`);
  console.log(`Supports TTS: ${model.supportsTextToSpeech}`);
  console.log(`Supports Voice Conversion: ${model.supportsVoiceConversion}`);
  console.log(`Supports Style: ${model.supportsStyle}`);
  console.log(`Supports Speaker Boost: ${model.supportsSpeakerBoost}`);
  console.log(`Supports Fine Tuning: ${model.supportsFineTuning}`);
  console.log(`Languages: ${model.languages?.map(l => l.name).join(', ')}`);
  console.log('---');
});
```

### Generate Speech from Text

Convert text to spoken audio:

```typescript
import { TextToSpeechParams, VoiceSettings } from '@memberjunction/ai';

// Configure voice settings (optional)
const voiceSettings: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0
};

// Configure speech generation parameters
const speechParams: TextToSpeechParams = {
  text: 'Hello, this is a test of the ElevenLabs text-to-speech system.',
  voice: 'voice-id-from-getvoices', // Use voice ID from GetVoices()
  model_id: 'eleven_monolingual_v1', // Optional, defaults to "eleven_monolingual_v1"
  voice_settings: voiceSettings, // Optional voice customization
  apply_text_normalization: 'auto', // Optional: "auto", "on", or "off"
  output_format: 'mp3_44100_128', // Optional, format as codec_samplerate_bitrate
  language_code: 'en', // Optional ISO 639-1 language code
  previous_text: 'Previously generated text...', // Optional, for context continuity
  instructions: 'Special voice generation instructions' // Optional
};

// Generate the speech
const result = await elevenLabs.CreateSpeech(speechParams);

if (result.success) {
  console.log('Speech generation successful!');
  // result.content contains the base64-encoded audio data
  // result.data contains the raw Buffer
  
  // Example: Save to a file (in Node.js)
  const fs = require('fs');
  
  // Option 1: Save from base64
  fs.writeFileSync('output.mp3', Buffer.from(result.content, 'base64'));
  
  // Option 2: Save from Buffer (if available)
  if (result.data) {
    fs.writeFileSync('output.mp3', result.data);
  }
} else {
  console.error('Error generating speech:', result.errorMessage);
}
```

### Get Pronunciation Dictionaries

Retrieve available pronunciation dictionaries:

```typescript
const dictionaries = await elevenLabs.GetPronounciationDictionaries();

// Display available dictionaries
dictionaries.forEach(dict => {
  console.log(`Dictionary: ${dict.name} (ID: ${dict.id})`);
  console.log(`Description: ${dict.description}`);
  console.log(`Latest Version ID: ${dict.latestVersionId}`);
  console.log(`Created by: ${dict.createdBy}`);
  console.log(`Created at: ${new Date(dict.creationTimeStamp * 1000).toLocaleString()}`);
  console.log('---');
});
```

### Check Supported Methods

Check which methods are supported by the current implementation:

```typescript
const supportedMethods = await elevenLabs.GetSupportedMethods();
console.log('Supported methods:', supportedMethods);
// Output: ["CreateSpeech", "GetVoices", "GetModels", "GetPronounciationDictionaries"]
```

## API Reference

### ElevenLabsAudioGenerator Class

A class that extends BaseAudioGenerator to provide ElevenLabs-specific audio generation functionality.

#### Constructor

```typescript
new ElevenLabsAudioGenerator(apiKey: string)
```

#### Methods

##### `CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult>`
Generate speech from text with extensive customization options.

##### `SpeechToText(params: SpeechToTextParams): Promise<SpeechResult>`
Convert speech to text. **Note**: This method is not yet implemented and will throw an error.

##### `GetVoices(): Promise<VoiceInfo[]>`
Retrieve a list of all available voices from your ElevenLabs account.

##### `GetModels(): Promise<AudioModel[]>`
Get information about available speech generation models.

##### `GetPronounciationDictionaries(): Promise<PronounciationDictionary[]>`
Retrieve custom pronunciation dictionaries associated with your account.

##### `GetSupportedMethods(): Promise<string[]>`
Returns an array of method names that are currently implemented and supported.

### Interface Reference

#### TextToSpeechParams

Parameters for text-to-speech generation:

```typescript
interface TextToSpeechParams {
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
```

#### VoiceSettings

Voice configuration settings:

```typescript
interface VoiceSettings {
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
```

#### SpeechResult

Result of speech generation operations:

```typescript
class SpeechResult {
  /** True if the request was successful, false otherwise */
  success: boolean;
  
  /** If the request failed, this will contain the error message */
  errorMessage?: string;
  
  /** Base64-encoded audio content (if successful) */
  content: string;
  
  /** Raw audio data as a Buffer (if successful) */
  data?: Buffer;
}
```

#### VoiceInfo

Information about an available voice:

```typescript
class VoiceInfo {
  /** Unique identifier for the voice */
  id: string;
  
  /** Display name of the voice */
  name: string;
  
  /** Detailed text description of the voice */
  description?: string;
  
  /** Array of labels with key-value pairs for voice metadata */
  labels?: object[];
  
  /** User-defined category for managing voices */
  category?: string;
  
  /** URL to a preview audio file for the voice */
  previewUrl?: string;
  
  /** Optional voice parameter presets */
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: number;
  
  /** Array of sample audio files for the voice */
  samples?: VoiceSample[];
}
```

#### AudioModel

Information about an available audio model:

```typescript
class AudioModel {
  /** Unique identifier for the model */
  id: string;
  
  /** Display name of the model */
  name: string;
  
  /** Whether the model supports text-to-speech */
  supportsTextToSpeech: boolean;
  
  /** Whether the model supports voice conversion */
  supportsVoiceConversion: boolean;
  
  /** Whether the model supports style adjustment */
  supportsStyle: boolean;
  
  /** Whether the model supports speaker boost */
  supportsSpeakerBoost: boolean;
  
  /** Whether the model supports fine-tuning */
  supportsFineTuning: boolean;
  
  /** Array of supported languages */
  languages?: AudioLanguage[];
}
```

#### PronounciationDictionary

Information about a pronunciation dictionary:

```typescript
class PronounciationDictionary {
  /** Unique identifier for the dictionary */
  id: string;
  
  /** Name of the dictionary */
  name: string;
  
  /** Description of the dictionary */
  description?: string;
  
  /** ID of the latest version of the dictionary */
  latestVersionId: string;
  
  /** User who created the dictionary */
  createdBy: string;
  
  /** Unix timestamp of creation */
  creationTimeStamp: number;
}
```

## Integration with MemberJunction

This package follows the standard MemberJunction AI provider pattern:

1. **Class Registration**: The `ElevenLabsAudioGenerator` class is automatically registered with the MemberJunction global class factory using the `@RegisterClass` decorator.

2. **Base Class Implementation**: Extends `BaseAudioGenerator` from `@memberjunction/ai`, ensuring consistency with other audio generation providers.

3. **Type Safety**: Fully typed with TypeScript, providing excellent IDE support and compile-time type checking.

## Error Handling

All methods include proper error handling:

- Failed API calls return a `SpeechResult` with `success: false` and an `errorMessage`
- Methods that retrieve data (GetVoices, GetModels, etc.) log errors to console and return empty arrays on failure
- The SpeechToText method throws an error as it's not yet implemented

## Performance Considerations

- **Streaming**: The underlying ElevenLabs client supports streaming responses, which are converted to buffers for consistency
- **Base64 Encoding**: Audio data is provided both as raw Buffer and base64-encoded string for flexibility
- **Error Recovery**: Methods gracefully handle API failures without throwing unhandled exceptions

## ElevenLabs API Integration

This package uses the official ElevenLabs Node.js client library (`elevenlabs` npm package) to integrate with the ElevenLabs API.

For more details on the underlying API, model capabilities, and voice options, refer to the [ElevenLabs API documentation](https://docs.elevenlabs.io/api-reference/quick-start/introduction).

## Dependencies

- `@memberjunction/ai`: ^2.43.0 - MemberJunction AI core framework
- `@memberjunction/global`: ^2.43.0 - MemberJunction global utilities and class registration
- `elevenlabs`: ^1.51.0 - Official ElevenLabs Node.js client

## Development

### Building the Package

```bash
npm run build
```

### Development Mode

```bash
npm run start
```

## License

ISC