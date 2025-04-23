# @memberjunction/ai-anthropic

A comprehensive wrapper for Anthropic's AI models (Claude) to provide a standardized interface within the MemberJunction AI framework.

## Features

- **Seamless Integration**: Connects directly with Anthropic's Claude models
- **Standardized Interface**: Follows MemberJunction's BaseLLM abstract class patterns
- **Message Formatting**: Handles conversion between MemberJunction and Anthropic message formats
- **Error Handling**: Robust error handling with detailed error reporting
- **Token Usage Tracking**: Tracks and reports token usage for monitoring and billing
- **Chat Completion**: Full support for chat-based interactions with Claude models
- **Summarization**: Text summarization capabilities using Claude's language understanding

## Installation

```bash
npm install @memberjunction/ai-anthropic
```

## Requirements

- Node.js 16+
- An Anthropic API key
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { AnthropicLLM } from '@memberjunction/ai-anthropic';

// Initialize with your API key
const anthropicLLM = new AnthropicLLM('your-anthropic-api-key');
```

### Chat Completion

```typescript
import { ChatMessage, ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'claude-3-opus-20240229',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, can you help me understand how AI works?' }
  ],
  maxOutputTokens: 1000,
  temperature: 0.7
};

// Get a response
try {
  const response = await anthropicLLM.ChatCompletion(chatParams);
  if (response.success) {
    console.log('AI Response:', response.data.choices[0].message.content);
    console.log('Token Usage:', response.data.usage);
  } else {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

### Text Summarization

```typescript
import { SummarizeParams } from '@memberjunction/ai';

const text = `Long text that you want to summarize...`;

const summarizeParams: SummarizeParams = {
  text: text,
  model: 'claude-2.1',
  temperature: 0.3,
  maxWords: 100
};

const summary = await anthropicLLM.SummarizeText(summarizeParams);
console.log('Summary:', summary.summary);
```

### Direct Access to Anthropic Client

```typescript
// Access the underlying Anthropic client for advanced usage
const anthropicClient = anthropicLLM.AnthropicClient;

// Use the client directly if needed
const customResponse = await anthropicClient.messages.create({
  model: 'claude-3-sonnet-20240229',
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 500
});
```

## API Reference

### AnthropicLLM Class

A class that extends BaseLLM to provide Anthropic-specific functionality.

#### Constructor

```typescript
new AnthropicLLM(apiKey: string)
```

#### Properties

- `AnthropicClient`: (read-only) Returns the underlying Anthropic client instance

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Summarize text
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Classify text (not implemented)
- `ConvertMJToAnthropicRole(role: ChatMessageRole): 'assistant' | 'user'` - Convert MemberJunction roles to Anthropic roles

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await anthropicLLM.ChatCompletion(params);
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

- `@anthropic-ai/sdk`: Official Anthropic SDK
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## License

ISC