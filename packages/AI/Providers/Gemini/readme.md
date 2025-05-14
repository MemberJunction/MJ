# @memberjunction/ai-gemini

A comprehensive wrapper for Google's Gemini AI models that seamlessly integrates with the MemberJunction AI framework, providing access to Google's powerful generative AI capabilities.

## Features

- **Google Gemini Integration**: Connect to Google's state-of-the-art Gemini models using the official @google/genai SDK
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Message Formatting**: Handles conversion between MemberJunction and Gemini message formats
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Support**: Full support for chat-based interactions with Gemini models
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
  model: 'gemini-pro',  // or 'gemini-pro-vision' for images, 'gemini-ultra' for more advanced capabilities
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

### Direct Access to Gemini Client

```typescript
// Access the underlying GoogleGenAI client for advanced usage
const geminiClient = geminiLLM.GeminiClient;

// Use the client directly if needed
const result = await geminiClient.models.generateContent({
  model: 'gemini-pro',
  contents: 'Tell me a short joke about programming'
});
console.log(result.candidates[0].content.parts[0].text);
```

## Supported Models

Google Gemini provides several models with different capabilities:

- `gemini-pro`: General-purpose text model
- `gemini-pro-vision`: Multimodal model that can process images and text
- `gemini-ultra`: Google's most advanced model (if available)

Check the [Google AI documentation](https://ai.google.dev/models/gemini) for the latest list of supported models.

## API Reference

### GeminiLLM Class

A class that extends BaseLLM to provide Google Gemini-specific functionality.

#### Constructor

```typescript
new GeminiLLM(apiKey: string)
```

#### Properties

- `GeminiClient`: (read-only) Returns the underlying GoogleGenAI client instance

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Not implemented yet
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Not implemented yet

#### Static Methods

- `MapMJMessageToGeminiHistoryEntry(message: ChatMessage): Content` - Converts MemberJunction messages to Gemini format

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
- Messages are properly spaced to ensure alternating roles as required by Gemini

## Limitations

Currently, the wrapper implements:
- Chat completion functionality

Future implementations may include:
- `SummarizeText` functionality
- `ClassifyText` functionality
- Token counting and usage reporting
- Image processing with `gemini-pro-vision`
- Function calling

## Dependencies

- `@google/genai`: Official Google GenAI SDK (replaces the deprecated @google/generative-ai)
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## License

ISC