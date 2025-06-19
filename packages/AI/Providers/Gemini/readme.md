# @memberjunction/ai-gemini

A comprehensive wrapper for Google's Gemini AI models that seamlessly integrates with the MemberJunction AI framework, providing access to Google's powerful generative AI capabilities.

## Features

- **Google Gemini Integration**: Connect to Google's state-of-the-art Gemini models using the official @google/genai SDK
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Streaming Support**: Full support for streaming responses with real-time token generation
- **Multimodal Support**: Handle text, images, audio, video, and file content
- **Message Formatting**: Automatic conversion between MemberJunction and Gemini message formats
- **Effort Level Support**: Leverage Gemini's reasoning mode for higher-quality responses
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Support**: Full support for chat-based interactions with conversation history
- **Temperature Control**: Fine-tune generation creativity
- **Response Format Control**: Request specific response MIME types

## Installation

```bash
npm install @memberjunction/ai-gemini
```

## Requirements

- Node.js 16+
- A Google AI Studio API key
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { GeminiLLM } from '@memberjunction/ai-gemini';

// Initialize with your Google AI API key
const geminiLLM = new GeminiLLM('your-google-ai-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'gemini-pro',  // or 'gemini-pro-vision' for multimodal
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What are the key features of the Gemini AI model?' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

// Get a response
try {
  const response = await geminiLLM.ChatCompletion(chatParams);
  if (response.success) {
    console.log('Response:', response.data.choices[0].message.content);
    console.log('Time elapsed:', response.timeElapsed, 'ms');
  } else {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

### Streaming Chat Completion

```typescript
import { StreamingChatCallbacks } from '@memberjunction/ai';

// Define streaming callbacks
const streamCallbacks: StreamingChatCallbacks = {
  onToken: (token: string) => {
    process.stdout.write(token); // Print each token as it arrives
  },
  onComplete: (fullResponse: string) => {
    console.log('\n\nComplete response received');
  },
  onError: (error: Error) => {
    console.error('Streaming error:', error);
  }
};

// Use streaming
const streamParams: ChatParams = {
  model: 'gemini-pro',
  messages: [
    { role: 'user', content: 'Write a short story about a robot.' }
  ],
  streaming: true,
  streamingCallbacks: streamCallbacks
};

await geminiLLM.ChatCompletion(streamParams);
```

### Multimodal Content

```typescript
import { ChatMessageContent } from '@memberjunction/ai';

// Create multimodal content
const multimodalContent: ChatMessageContent = [
  { type: 'text', content: 'What do you see in this image?' },
  { type: 'image_url', content: 'base64_encoded_image_data_here' }
];

const multimodalParams: ChatParams = {
  model: 'gemini-pro-vision',
  messages: [
    { role: 'user', content: multimodalContent }
  ]
};

const response = await geminiLLM.ChatCompletion(multimodalParams);
```

### Enhanced Reasoning with Effort Level

```typescript
// Use effort level to enable Gemini's full reasoning mode
const reasoningParams: ChatParams = {
  model: 'gemini-pro',
  messages: [
    { role: 'user', content: 'Solve this complex logic puzzle...' }
  ],
  effortLevel: 'high' // Enables full reasoning mode
};

const response = await geminiLLM.ChatCompletion(reasoningParams);
```

### Direct Access to Gemini Client

```typescript
// Access the underlying GoogleGenAI client for advanced usage
const geminiClient = geminiLLM.GeminiClient;

// Use the client directly if needed for custom operations
const chat = geminiClient.chats.create({
  model: 'gemini-pro',
  history: []
});
```

## Supported Models

Google Gemini provides several models with different capabilities:

- `gemini-pro`: General-purpose text model
- `gemini-pro-vision`: Multimodal model that can process images and text
- `gemini-ultra`: Google's most advanced model (when available)

Check the [Google AI documentation](https://ai.google.dev/models/gemini) for the latest list of supported models.

## API Reference

### GeminiLLM Class

A class that extends BaseLLM to provide Google Gemini-specific functionality.

#### Constructor

```typescript
new GeminiLLM(apiKey: string)
```

Creates a new instance of the Gemini LLM wrapper.

**Parameters:**
- `apiKey`: Your Google AI Studio API key

#### Properties

- `GeminiClient`: (read-only) Returns the underlying GoogleGenAI client instance
- `SupportsStreaming`: (read-only) Returns `true` - Gemini supports streaming responses

#### Methods

##### ChatCompletion(params: ChatParams): Promise<ChatResult>

Perform a chat completion with Gemini models.

**Parameters:**
- `params`: Chat parameters including model, messages, temperature, etc.

**Returns:**
- Promise resolving to a `ChatResult` with the model's response

##### SummarizeText(params: SummarizeParams): Promise<SummarizeResult>

Not implemented yet - will throw an error if called.

##### ClassifyText(params: ClassifyParams): Promise<ClassifyResult>

Not implemented yet - will throw an error if called.

#### Static Methods

##### MapMJMessageToGeminiHistoryEntry(message: ChatMessage): Content

Converts a MemberJunction ChatMessage to Gemini's Content format.

**Parameters:**
- `message`: MemberJunction ChatMessage object

**Returns:**
- Gemini Content object with proper role mapping

##### MapMJContentToGeminiParts(content: ChatMessageContent): Array<Part>

Converts MemberJunction message content to Gemini Parts array.

**Parameters:**
- `content`: String or array of content parts

**Returns:**
- Array of Gemini Part objects

## Response Format Control

Control the format of Gemini responses using the `responseFormat` parameter:

```typescript
const params: ChatParams = {
  // ...other parameters
  responseFormat: 'text/plain',  // Regular text response
};

// For structured data
const jsonParams: ChatParams = {
  // ...other parameters
  responseFormat: 'application/json',  // Request JSON response
};
```

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await geminiLLM.ChatCompletion(params);
  if (!response.success) {
    console.error('Error:', response.errorMessage);
    console.error('Status:', response.statusText);
    console.error('Exception:', response.exception);
  }
} catch (error) {
  console.error('Exception occurred:', error);
}
```

## Message Handling

The wrapper handles proper message formatting and role conversion between MemberJunction's format and Google Gemini's expected format:

- MemberJunction's `system` and `user` roles are converted to Gemini's `user` role
- MemberJunction's `assistant` role is converted to Gemini's `model` role
- Messages are automatically spaced to ensure alternating roles as required by Gemini
- Multimodal content is properly converted with appropriate MIME types

## Content Type Support

The wrapper supports various content types with automatic MIME type mapping:

- **Text**: Standard text messages
- **Images**: `image_url` type → `image/jpeg` MIME type
- **Audio**: `audio_url` type → `audio/mpeg` MIME type
- **Video**: `video_url` type → `video/mp4` MIME type
- **Files**: `file_url` type → `application/octet-stream` MIME type

## Integration with MemberJunction

This package is designed to work seamlessly with the MemberJunction AI framework:

```typescript
import { AIEngine } from '@memberjunction/ai';
import { GeminiLLM } from '@memberjunction/ai-gemini';

// Register the Gemini provider with the AI engine
const aiEngine = new AIEngine();
const geminiProvider = new GeminiLLM('your-api-key');

// Use through the AI engine's unified interface
const result = await aiEngine.ChatCompletion({
  provider: 'GeminiLLM',
  model: 'gemini-pro',
  messages: [/* ... */]
});
```

## Performance Considerations

- **Streaming**: Use streaming for long responses to improve perceived performance
- **Effort Level**: Use the `effortLevel` parameter judiciously as it increases latency and cost
- **Model Selection**: Choose the appropriate model based on your needs (text-only vs multimodal)
- **Message Spacing**: The wrapper automatically handles message spacing, adding minimal overhead

## Limitations

Currently, the wrapper implements:
- ✅ Chat completion functionality (streaming and non-streaming)
- ✅ Multimodal content support
- ✅ Effort level configuration for enhanced reasoning
- ❌ `SummarizeText` functionality (not implemented)
- ❌ `ClassifyText` functionality (not implemented)
- ❌ Detailed token usage reporting (Gemini doesn't provide this)

## Dependencies

- `@google/genai` (v0.14.0): Official Google GenAI SDK
- `@memberjunction/ai` (v2.43.0): MemberJunction AI core framework
- `@memberjunction/global` (v2.43.0): MemberJunction global utilities

## Development

### Building

```bash
npm run build
```

### Testing

Tests are not currently implemented. To add tests:

```bash
npm test
```

## Supported Parameters

The Gemini provider supports the following LLM parameters:

**Supported:**
- `temperature` - Controls randomness in the output (0.0-1.0)
- `maxOutputTokens` - Maximum number of tokens to generate
- `topP` - Nucleus sampling threshold (0.0-1.0)
- `topK` - Limits vocabulary to top K tokens
- `seed` - For deterministic outputs
- `stopSequences` - Array of sequences where the API will stop generating
- `responseFormat` - Output format as MIME type (text/plain, application/json, etc.)

**Not Supported:**
- `frequencyPenalty` - Not available in Gemini API
- `presencePenalty` - Not available in Gemini API
- `minP` - Not available in Gemini API

## License

ISC

## Contributing

For bug reports, feature requests, or contributions, please visit the [MemberJunction repository](https://github.com/MemberJunction/MJ).