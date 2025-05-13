# @memberjunction/ai-cerebras

A comprehensive wrapper for Cerebras Cloud, providing high-performance AI model access within the MemberJunction framework.

## Features

- **High-Performance Integration**: Connect to Cerebras' ultra-fast inference API
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Message Formatting**: Handles conversion between MemberJunction and Cerebras message formats
- **Error Handling**: Robust error handling with detailed reporting
- **Token Usage Tracking**: Track token consumption for monitoring
- **Chat Completion**: Interactive chat completions with various LLMs hosted on Cerebras
- **Streaming Support**: Full support for streaming responses with real-time processing
- **Model Support**: Compatible with various models including llama3.1-8b and other models hosted on Cerebras

## Installation

```bash
npm install @memberjunction/ai-cerebras
```

## Requirements

- Node.js 16+
- A Cerebras API key
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { CerebrasLLM } from '@memberjunction/ai-cerebras';

// Initialize with your Cerebras API key
const cerebrasLLM = new CerebrasLLM('your-cerebras-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'llama3.1-8b',
  messages: [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    { role: 'user', content: 'Explain the benefits of specialized AI hardware like Cerebras WSE.' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

// Get a response
try {
  const response = await cerebrasLLM.ChatCompletion(chatParams);
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

### Streaming Chat Completion

```typescript
import { ChatParams, StreamingChatCallbacks } from '@memberjunction/ai';

// Define streaming callbacks
const callbacks: StreamingChatCallbacks = {
  onStart: () => console.log('Streaming started'),
  onUpdate: (content, isFinal) => {
    process.stdout.write(content);
    if (isFinal) console.log('\nStreaming complete');
  },
  onError: (error) => console.error('Streaming error:', error),
  onEnd: (finalContent) => console.log(`\nFinal content length: ${finalContent.length}`)
};

// Create chat parameters with streaming
const chatParams: ChatParams = {
  model: 'llama3.1-8b',
  messages: [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    { role: 'user', content: 'Write a short poem about artificial intelligence.' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000,
  streaming: true,
  streamingCallbacks: callbacks
};

// Start streaming response
await cerebrasLLM.ChatCompletion(chatParams);
```

### Direct Access to Cerebras Client

```typescript
// Access the underlying Cerebras client for advanced usage
const cerebrasClient = cerebrasLLM.CerebrasClient;

// Use the client directly if needed
const customResponse = await cerebrasClient.chat.completions.create({
  model: 'llama3.1-8b',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 500
});
```

## Supported Models

Cerebras provides access to various models with optimized inference:

- `llama3.1-8b`
- Other models (check Cerebras documentation for the latest list)

## API Reference

### CerebrasLLM Class

A class that extends BaseLLM to provide Cerebras-specific functionality.

#### Constructor

```typescript
new CerebrasLLM(apiKey: string)
```

#### Properties

- `CerebrasClient`: (read-only) Returns the underlying Cerebras client instance
- `SupportsStreaming`: (read-only) Returns true as Cerebras supports streaming

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Summarize text (not implemented)
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Classify text (not implemented)

## Performance Considerations

Cerebras hardware is optimized for high-performance AI inference:

- Fast response generation with low latency
- Efficient resource utilization
- Consider appropriate model sizes for your specific use case

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await cerebrasLLM.ChatCompletion(params);
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

- `@cerebras/cerebras_cloud_sdk`: Official Cerebras Cloud SDK
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## License

ISC