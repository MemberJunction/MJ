# @memberjunction/ai-groq

A comprehensive wrapper for Groq's LPU (Language Processing Unit) inference engine, providing high-performance AI model access within the MemberJunction framework.

## Features

- **High-Performance Integration**: Connect to Groq's ultra-fast LPU inference API
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Streaming Support**: Full support for streaming responses for real-time interactions
- **Message Formatting**: Handles conversion between MemberJunction and Groq message formats
- **Error Handling**: Robust error handling with detailed reporting
- **Token Usage Tracking**: Track token consumption for monitoring
- **Chat Completion**: Interactive chat completions with various LLMs hosted on Groq
- **Model Support**: Compatible with Llama, Mixtral, Gemma, and other models hosted on Groq
- **Response Format Control**: Support for JSON, text, and model-specific response formats

## Installation

```bash
npm install @memberjunction/ai-groq
```

## Requirements

- Node.js 16+
- A Groq API key
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { GroqLLM } from '@memberjunction/ai-groq';

// Initialize with your Groq API key
const groqLLM = new GroqLLM('your-groq-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'llama2-70b-4096',  // or other models like 'mixtral-8x7b-32768'
  messages: [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    { role: 'user', content: 'Explain how LPUs differ from traditional GPUs for AI inference.' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

// Get a response
try {
  const response = await groqLLM.ChatCompletion(chatParams);
  if (response.success) {
    console.log('Response:', response.data.choices[0].message.content);
    console.log('Token Usage:', response.data.usage);
    console.log('Time Elapsed (ms):', response.timeElapsed);
  } else {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

### Streaming Responses

```typescript
import { ChatParams, ChatResult } from '@memberjunction/ai';

// Enable streaming in the chat parameters
const streamingParams: ChatParams = {
  model: 'llama3-70b-8192',
  messages: [
    { role: 'user', content: 'Write a short story about AI.' }
  ],
  stream: true,
  onStream: (content: string) => {
    // Handle each chunk of streamed content
    process.stdout.write(content);
  },
  maxOutputTokens: 2000
};

// The response will stream to the onStream callback
const response = await groqLLM.ChatCompletion(streamingParams);
console.log('\n\nFinal response:', response.data.choices[0].message.content);
```

### Response Format Control

```typescript
// Request JSON formatted response
const jsonParams: ChatParams = {
  model: 'mixtral-8x7b-32768',
  messages: [
    { role: 'system', content: 'You are a helpful assistant that responds in JSON format.' },
    { role: 'user', content: 'List 3 benefits of using Groq in JSON format with keys: benefit, description' }
  ],
  responseFormat: 'JSON',
  maxOutputTokens: 1000
};

const jsonResponse = await groqLLM.ChatCompletion(jsonParams);
const benefits = JSON.parse(jsonResponse.data.choices[0].message.content);
```

### Direct Access to Groq Client

```typescript
// Access the underlying Groq client for advanced usage
const groqClient = groqLLM.GroqClient;
// or use the alias
const client = groqLLM.client;

// Use the client directly if needed
const customResponse = await groqClient.chat.completions.create({
  model: 'mixtral-8x7b-32768',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 500
});
```

## Supported Models

Groq provides access to various open models with optimized inference:

- **Llama Models**:
  - `llama3-70b-8192` - Llama 3 70B with 8K context
  - `llama3-8b-8192` - Llama 3 8B with 8K context
  - `llama2-70b-4096` - Llama 2 70B with 4K context
  
- **Mixtral Models**:
  - `mixtral-8x7b-32768` - Mixtral 8x7B with 32K context
  
- **Gemma Models**:
  - `gemma-7b-it` - Gemma 7B Instruct
  - `gemma2-9b-it` - Gemma 2 9B Instruct

Check the [Groq documentation](https://console.groq.com/docs/models) for the latest list of supported models and their capabilities.

## API Reference

### GroqLLM Class

A class that extends BaseLLM to provide Groq-specific functionality.

#### Constructor

```typescript
new GroqLLM(apiKey: string)
```

#### Properties

- `GroqClient`: (read-only) Returns the underlying Groq client instance
- `client`: (read-only) Alias for GroqClient
- `SupportsStreaming`: (read-only) Returns `true` - Groq supports streaming responses

#### Methods

##### ChatCompletion
```typescript
ChatCompletion(params: ChatParams): Promise<ChatResult>
```
Perform a chat completion with support for both streaming and non-streaming responses.

##### SummarizeText
```typescript
SummarizeText(params: SummarizeParams): Promise<SummarizeResult>
```
*Note: Not yet implemented*

##### ClassifyText
```typescript
ClassifyText(params: ClassifyParams): Promise<ClassifyResult>
```
*Note: Not yet implemented*

## Performance Considerations

Groq is known for its extremely fast inference times:

- Response generation is typically 5-10x faster than traditional GPU-based inference
- Lower latency means better interactive experiences
- Benchmark different models to find the best performance/quality balance for your use case

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await groqLLM.ChatCompletion(params);
  if (!response.success) {
    console.error('Error:', response.errorMessage);
    console.error('Status:', response.statusText);
    console.error('Time Elapsed:', response.timeElapsed, 'ms');
  }
} catch (error) {
  console.error('Exception occurred:', error);
}
```

## Integration with MemberJunction

This package seamlessly integrates with the MemberJunction AI framework:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseLLM } from '@memberjunction/ai';
import { GroqLLM } from '@memberjunction/ai-groq';

// The GroqLLM class is automatically registered with the MemberJunction class factory
// You can retrieve it using the class factory pattern
const llm = RegisterClass.GetRegisteredClass(BaseLLM, 'GroqLLM', 'your-api-key');
```

## Advanced Features

### Effort Level Support

For models that support reasoning effort levels (experimental):

```typescript
const params: ChatParams = {
  model: 'llama3-70b-8192',
  messages: [{ role: 'user', content: 'Solve this complex problem...' }],
  effortLevel: 'high', // Experimental feature
  maxOutputTokens: 2000
};
```

### Handling Groq-Specific Requirements

The wrapper automatically handles Groq's requirement that the last message must be from a user. If your message chain ends with an assistant message, the wrapper will automatically append a dummy user message to satisfy this requirement.

## Dependencies

- `groq-sdk` (0.21.0): Official Groq SDK
- `@memberjunction/ai` (2.43.0): MemberJunction AI core framework
- `@memberjunction/global` (2.43.0): MemberJunction global utilities

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm start
```

## Contributing

When contributing to this package:

1. Follow the MemberJunction coding standards
2. Ensure all TypeScript types are properly defined
3. Update tests when adding new features
4. Document any Groq-specific behaviors or limitations

## License

ISC