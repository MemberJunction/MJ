# @memberjunction/ai-openai

A comprehensive wrapper for OpenAI's API and models that seamlessly integrates with the MemberJunction AI framework, providing a standardized interface for GPT, embedding, and text-to-speech models.

## Features

- **OpenAI Integration**: Full integration with OpenAI's chat completion, embedding, and TTS models
- **Standardized Interface**: Follows MemberJunction's BaseLLM, BaseEmbeddings, and BaseAudioGenerator abstract classes
- **Streaming Support**: Full support for streaming chat completions
- **Message Formatting**: Handles conversion between MemberJunction and OpenAI message formats
- **Multi-modal Support**: Supports text and image content in messages
- **Response Format Support**: Support for different response formats (Text, JSON, Markdown, ModelSpecific)
- **Reasoning Models**: Support for reasoning effort levels (o1 models)
- **Error Handling**: Comprehensive error handling with detailed reporting
- **Token Usage Tracking**: Automatic tracking of prompt and completion tokens
- **Embeddings**: Text embedding generation with multiple models
- **Text-to-Speech**: Generate speech from text using OpenAI's TTS models

## Installation

```bash
npm install @memberjunction/ai-openai
```

## Requirements

- Node.js 16+
- An OpenAI API key
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { OpenAILLM } from '@memberjunction/ai-openai';

// Initialize with your API key
const openAI = new OpenAILLM('your-openai-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is machine learning?' }
  ],
  temperature: 0.7,
  maxOutputTokens: 500,
  responseFormat: 'Text',
  includeLogProbs: false
};

// Get a response
try {
  const response = await openAI.ChatCompletion(chatParams);
  if (response.success) {
    console.log('Response:', response.data.choices[0].message.content);
    console.log('Token Usage:', response.data.usage);
  } else {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

### Streaming Chat Completion

```typescript
const streamingParams: ChatParams = {
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Tell me a story' }
  ],
  temperature: 0.8,
  maxOutputTokens: 1000
};

// Stream the response
await openAI.StreamingChatCompletion(streamingParams, {
  onStart: () => console.log('Streaming started...'),
  onContent: (content) => process.stdout.write(content),
  onComplete: (fullContent) => console.log('\n\nComplete:', fullContent),
  onError: (error) => console.error('Error:', error),
  onUsage: (usage) => console.log('Token usage:', usage)
});
```

### Multi-modal Messages (Text + Images)

```typescript
const multiModalParams: ChatParams = {
  model: 'gpt-4-vision-preview',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'What do you see in this image?' },
        { type: 'image_url', content: 'https://example.com/image.jpg' }
      ]
    }
  ],
  maxOutputTokens: 500
};

const response = await openAI.ChatCompletion(multiModalParams);
```

### JSON Response Format

```typescript
const jsonParams: ChatParams = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant that outputs JSON.' },
    { role: 'user', content: 'Generate a JSON object with name, age, and city for 3 fictional people.' }
  ],
  temperature: 0.3,
  maxOutputTokens: 500,
  responseFormat: 'JSON'
};

const jsonResponse = await openAI.ChatCompletion(jsonParams);
const jsonData = JSON.parse(jsonResponse.data.choices[0].message.content);
console.log('Structured Data:', jsonData);
```

### Reasoning Models (o1 series)

```typescript
const reasoningParams: ChatParams = {
  model: 'o1-preview',
  messages: [
    { role: 'user', content: 'Solve this complex math problem...' }
  ],
  effortLevel: 'high', // 'low', 'medium', or 'high'
  maxOutputTokens: 2000
};

const response = await openAI.ChatCompletion(reasoningParams);
```

### Text Summarization

```typescript
import { SummarizeParams } from '@memberjunction/ai';

const text = `Long text that you want to summarize...`;

const summarizeParams: SummarizeParams = {
  text: text,
  model: 'gpt-3.5-turbo',
  temperature: 0.3,
  maxWords: 100
};

const summary = await openAI.SummarizeText(summarizeParams);
console.log('Summary:', summary.summary);
```

### Text Embeddings

```typescript
import { OpenAIEmbedding } from '@memberjunction/ai-openai';

const embedding = new OpenAIEmbedding('your-openai-api-key');

// Embed a single text
const singleResult = await embedding.EmbedText({
  text: 'The quick brown fox jumps over the lazy dog',
  model: 'text-embedding-3-small' // or 'text-embedding-3-large', 'text-embedding-ada-002'
});
console.log('Embedding vector:', singleResult.vector);

// Embed multiple texts
const multiResult = await embedding.EmbedTexts({
  texts: ['First text', 'Second text', 'Third text'],
  model: 'text-embedding-3-large'
});
console.log('Embedding vectors:', multiResult.vectors);

// Get available models
const models = await embedding.GetEmbeddingModels();
console.log('Available models:', models);
```

### Text-to-Speech

```typescript
import { OpenAIAudioGenerator } from '@memberjunction/ai-openai';

const tts = new OpenAIAudioGenerator('your-openai-api-key');

// Generate speech
const speechResult = await tts.CreateSpeech({
  text: 'Hello, this is a test of OpenAI text-to-speech.',
  model_id: 'gpt-4o-mini-tts',
  voice: 'nova', // 'alloy', 'echo', 'fable', 'onyx', 'nova', or 'shimmer'
  instructions: 'Speak in a cheerful and positive tone'
});

if (speechResult.success) {
  // speechResult.data contains the audio buffer
  // speechResult.content contains base64-encoded audio
  fs.writeFileSync('output.mp3', speechResult.data);
}

// Get available voices and models
const voices = await tts.GetVoices();
const models = await tts.GetModels();
```

### Direct Access to OpenAI Client

```typescript
// Access the underlying OpenAI client for advanced usage
const openAIClient = openAI.OpenAI;

// Use the client directly for features not wrapped
const completion = await openAIClient.completions.create({
  model: 'gpt-3.5-turbo-instruct',
  prompt: 'Say this is a test',
  max_tokens: 7
});
```

## API Reference

### OpenAILLM Class

Extends `BaseLLM` to provide OpenAI-specific chat and completion functionality.

#### Constructor
```typescript
new OpenAILLM(apiKey: string)
```

#### Properties
- `OpenAI`: (read-only) Returns the underlying OpenAI client instance
- `SupportsStreaming`: (read-only) Returns `true` - OpenAI supports streaming

#### Methods
- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `StreamingChatCompletion(params: ChatParams, callbacks: StreamingChatCallbacks): Promise<void>` - Stream a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Summarize text
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Classify text (not implemented)
- `ConvertMJToOpenAIChatMessages(messages: ChatMessage[]): ChatCompletionMessageParam[]` - Convert MJ to OpenAI format
- `ConvertMJToOpenAIRole(role: string): 'system' | 'user' | 'assistant'` - Convert MJ roles to OpenAI roles

### OpenAIEmbedding Class

Extends `BaseEmbeddings` to provide OpenAI embedding functionality.

#### Constructor
```typescript
new OpenAIEmbedding(apiKey: string)
```

#### Methods
- `EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>` - Generate embedding for single text
- `EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>` - Generate embeddings for multiple texts
- `GetEmbeddingModels(): Promise<any>` - Get available embedding models

### OpenAIAudioGenerator Class

Extends `BaseAudioGenerator` to provide OpenAI text-to-speech functionality.

#### Constructor
```typescript
new OpenAIAudioGenerator(apiKey: string)
```

#### Methods
- `CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult>` - Generate speech from text
- `SpeechToText(params: SpeechToTextParams): Promise<SpeechResult>` - Convert speech to text (not implemented)
- `GetVoices(): Promise<VoiceInfo[]>` - Get available voices
- `GetModels(): Promise<AudioModel[]>` - Get available TTS models
- `GetPronounciationDictionaries(): Promise<PronounciationDictionary[]>` - Get pronunciation dictionaries (empty)
- `GetSupportedMethods(): Promise<string[]>` - Get supported methods

## Embedding Models

- **text-embedding-3-large**: Most capable model (3,072 dimensions)
- **text-embedding-3-small**: Balanced performance (1,536 dimensions)
- **text-embedding-ada-002**: Legacy 2nd generation model (1,536 dimensions)

## TTS Voices

- **alloy**: Neutral and balanced
- **echo**: Warm and conversational
- **fable**: Expressive and animated
- **onyx**: Deep and authoritative
- **nova**: Friendly and upbeat
- **shimmer**: Soft and gentle

## Response Formats

The OpenAILLM class supports various response formats:

- `Text`: Regular text responses (default)
- `JSON`: Structured JSON responses (requires compatible model)
- `Markdown`: Markdown-formatted responses
- `Any`: Model decides the format
- `ModelSpecific`: Custom formats with `modelSpecificResponseFormat` parameter

## Error Handling

The wrapper provides comprehensive error information:

```typescript
try {
  const response = await openAI.ChatCompletion(params);
  if (!response.success) {
    console.error('Error:', response.errorMessage);
    console.error('Status:', response.statusText);
    console.error('Time Elapsed:', response.timeElapsed, 'ms');
    console.error('Exception:', response.exception);
  }
} catch (error) {
  console.error('Exception occurred:', error);
}
```

## Integration with MemberJunction

This package seamlessly integrates with the MemberJunction AI framework:

```typescript
import { AIEngine } from '@memberjunction/ai';

// The OpenAI classes are automatically registered
const engine = new AIEngine();
const llm = engine.GetLLM('OpenAILLM', 'your-api-key');
const embeddings = engine.GetEmbedding('OpenAIEmbedding', 'your-api-key');
const tts = engine.GetAudioGenerator('OpenAIAudioGenerator', 'your-api-key');
```

## Dependencies

- `openai`: Official OpenAI Node.js SDK (v4.98.0)
- `@memberjunction/ai`: MemberJunction AI core framework (v2.43.0)
- `@memberjunction/global`: MemberJunction global utilities (v2.43.0)

## Supported Parameters

The OpenAI provider supports the following LLM parameters:

**Supported:**
- `temperature` - Controls randomness in the output (0.0-2.0)
- `maxOutputTokens` - Maximum number of tokens to generate
- `topP` - Nucleus sampling threshold (0.0-1.0)
- `frequencyPenalty` - Reduces repetition of token sequences (-2.0 to 2.0)
- `presencePenalty` - Reduces repetition of specific tokens (-2.0 to 2.0)
- `seed` - For deterministic outputs
- `stopSequences` - Array of sequences where the API will stop generating
- `includeLogProbs` - Whether to return log probabilities
- `responseFormat` - Output format (Text, JSON, Markdown, etc.)

**Not Supported:**
- `topK` - Not available in OpenAI API
- `minP` - Not available in OpenAI API

## License

ISC