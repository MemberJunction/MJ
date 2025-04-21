# @memberjunction/ai-groq

A comprehensive wrapper for Groq's LPU (Language Processing Unit) inference engine, providing high-performance AI model access within the MemberJunction framework.

## Features

- **High-Performance Integration**: Connect to Groq's ultra-fast LPU inference API
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Message Formatting**: Handles conversion between MemberJunction and Groq message formats
- **Error Handling**: Robust error handling with detailed reporting
- **Token Usage Tracking**: Track token consumption for monitoring
- **Chat Completion**: Interactive chat completions with various LLMs hosted on Groq
- **Model Support**: Compatible with LLama-2, Mixtral, and other models hosted on Groq

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

### Direct Access to Groq Client

```typescript
// Access the underlying Groq client for advanced usage
const groqClient = groqLLM.GroqClient;

// Use the client directly if needed
const customResponse = await groqClient.chat.completions.create({
  model: 'mixtral-8x7b-32768',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 500
});
```

## Supported Models

Groq provides access to various open models with optimized inference:

- `llama2-70b-4096`
- `mixtral-8x7b-32768`
- `gemma-7b-it`

Check the [Groq documentation](https://console.groq.com/docs/models) for the latest list of supported models.

## API Reference

### GroqLLM Class

A class that extends BaseLLM to provide Groq-specific functionality.

#### Constructor

```typescript
new GroqLLM(apiKey: string)
```

#### Properties

- `GroqClient`: (read-only) Returns the underlying Groq client instance

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Summarize text
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Classify text (not implemented)
- `ConvertMJToGroqChatMessages(messages: ChatMessage[]): any[]` - Convert MemberJunction messages to Groq format

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

## Dependencies

- `groq-sdk`: Official Groq SDK
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## License

ISC