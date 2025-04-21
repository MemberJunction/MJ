# @memberjunction/ai-elevenlabs

A comprehensive wrapper for ElevenLabs' audio generation API, enabling high-quality text-to-speech functionality within the MemberJunction framework.

## Features

- **Text-to-Speech**: Convert text to natural-sounding speech
- **Voice Library**: Access to ElevenLabs' extensive voice collection
- **Model Selection**: Support for different ElevenLabs speech generation models
- **Pronunciation Dictionaries**: Manage custom pronunciation dictionaries
- **Voice Customization**: Control various voice parameters and styles
- **Standardized Interface**: Follows MemberJunction's BaseAudioGenerator abstract class pattern

## Installation

```bash
npm install @memberjunction/ai-elevenlabs
```

## Requirements

- Node.js 16+
- An ElevenLabs API key
- MemberJunction Core libraries

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
  voice.labels.forEach(label => {
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
  console.log(`Supports Style: ${model.supportsStyle}`);
  console.log(`Supports Speaker Boost: ${model.supportsSpeakerBoost}`);
  console.log(`Languages: ${model.languages.map(l => l.name).join(', ')}`);
  console.log('---');
});
```

### Generate Speech from Text

Convert text to spoken audio:

```typescript
import { TextToSpeechParams } from '@memberjunction/ai';

// Configure speech generation parameters
const speechParams: TextToSpeechParams = {
  text: 'Hello, this is a test of the ElevenLabs text-to-speech system.',
  voiceId: 'voice-id-from-getvoices',
  modelId: 'model-id-from-getmodels',
  stability: 0.5,
  similarityBoost: 0.75
};

// Generate the speech
const result = await elevenLabs.CreateSpeech(speechParams);

if (result.success) {
  console.log('Speech generation successful!');
  // result.content contains the base64-encoded audio data
  // You can save it to a file or use it directly
  
  // Example: Save to a file (in Node.js)
  const fs = require('fs');
  fs.writeFileSync('output.mp3', Buffer.from(result.content, 'base64'));
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
  console.log(`Created by: ${dict.createdBy}`);
  console.log('---');
});
```

### Check Supported Methods

Check which methods are supported by the current implementation:

```typescript
const supportedMethods = await elevenLabs.GetSupportedMethods();
console.log('Supported methods:', supportedMethods);
```

## API Reference

### ElevenLabsAudioGenerator Class

A class that extends BaseAudioGenerator to provide ElevenLabs-specific audio generation functionality.

#### Constructor

```typescript
new ElevenLabsAudioGenerator(apiKey: string)
```

#### Methods

- `CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult>` - Generate speech from text
- `SpeechToText(params: SpeechToTextParams): Promise<SpeechResult>` - (Not yet implemented)
- `GetVoices(): Promise<VoiceInfo[]>` - Get a list of available voices
- `GetModels(): Promise<AudioModel[]>` - Get a list of available speech models
- `GetPronounciationDictionaries(): Promise<PronounciationDictionary[]>` - Get a list of pronunciation dictionaries
- `GetSupportedMethods(): Promise<string[]>` - Get a list of supported methods

### TextToSpeechParams Interface

Parameters for text-to-speech conversion:

- `text`: Text to convert to speech
- `voiceId`: ID of the voice to use (from GetVoices)
- `modelId`: ID of the model to use (from GetModels)
- `stability`: Voice stability (0.0 to 1.0) - optional
- `similarityBoost`: Voice similarity boost (0.0 to 1.0) - optional
- `style`: Style parameter (0.0 to 1.0) - optional
- `speakerBoost`: Enable/disable speaker boost - optional

### SpeechResult Object

Result of speech generation operations:

- `success`: Boolean indicating if the operation was successful
- `content`: Base64-encoded audio content (if successful)
- `errorMessage`: Error message (if unsuccessful)

### VoiceInfo Object

Information about an available voice:

- `id`: Unique identifier for the voice
- `name`: Display name of the voice
- `description`: Description of the voice
- `category`: Category of the voice (e.g., "premade", "cloned")
- `previewUrl`: URL to a preview audio file for the voice
- `labels`: Array of key-value pairs with additional voice metadata

### AudioModel Object

Information about an available audio model:

- `id`: Unique identifier for the model
- `name`: Display name of the model
- `supportsTextToSpeech`: Whether the model supports text-to-speech
- `supportsVoiceConversion`: Whether the model supports voice conversion
- `supportsStyle`: Whether the model supports style parameters
- `supportsSpeakerBoost`: Whether the model supports speaker boost
- `supportsFineTuning`: Whether the model supports fine-tuning
- `languages`: Array of supported languages with their IDs and names

### PronounciationDictionary Object

Information about a pronunciation dictionary:

- `id`: Unique identifier for the dictionary
- `name`: Name of the dictionary
- `description`: Description of the dictionary
- `latestVersionId`: ID of the latest version of the dictionary
- `createdBy`: User who created the dictionary
- `creationTimeStamp`: Unix timestamp of when the dictionary was created

## ElevenLabs API Integration

This package uses the official ElevenLabs Node.js client library to integrate with the ElevenLabs API.

For more details on the underlying API and additional capabilities, refer to the [ElevenLabs API documentation](https://docs.elevenlabs.io/api-reference/quick-start/introduction).

## Dependencies

- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities
- `elevenlabs`: Official ElevenLabs Node.js client

## License

ISC