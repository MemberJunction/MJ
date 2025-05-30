# @memberjunction/ai-anthropic

A comprehensive wrapper for Anthropic's AI models (Claude) that provides a standardized interface within the MemberJunction AI framework. This package enables seamless integration with Claude models while maintaining consistency with MemberJunction's AI abstraction layer.

## Features

- **Seamless Integration**: Direct integration with Anthropic's Claude models
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Streaming Support**: Full support for streaming responses
- **Advanced Caching**: Ephemeral caching support for improved performance
- **Thinking/Reasoning**: Support for Claude's thinking/reasoning capabilities with configurable token budgets
- **Message Formatting**: Automatic handling of message format conversions and role mappings
- **Error Handling**: Comprehensive error handling with detailed error reporting
- **Token Usage Tracking**: Detailed token usage tracking including cached tokens
- **Multiple Models**: Support for all Claude model variants (Opus, Sonnet, Haiku, etc.)

## Installation

```bash
npm install @memberjunction/ai-anthropic
```

## Requirements

- Node.js 16+
- An Anthropic API key
- MemberJunction Core libraries (`@memberjunction/ai`, `@memberjunction/global`)

## Usage

### Basic Setup

```typescript
import { AnthropicLLM } from '@memberjunction/ai-anthropic';

// Initialize with your API key
const anthropicLLM = new AnthropicLLM('your-anthropic-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'claude-3-opus-20240229',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, can you help me understand how AI works?' }
  ],
  maxOutputTokens: 1000,
  temperature: 0.7,
  enableCaching: true // Enable ephemeral caching
};

// Get a response
try {
  const response = await anthropicLLM.ChatCompletion(chatParams);
  if (response.success) {
    console.log('AI Response:', response.data.choices[0].message.content);
    console.log('Token Usage:', response.data.usage);
    
    // Check cache info if available
    if (response.cacheInfo) {
      console.log('Cache Hit:', response.cacheInfo.cacheHit);
      console.log('Cached Tokens:', response.cacheInfo.cachedTokenCount);
    }
  } else {
    console.error('Error:', response.errorMessage);
  }
} catch (error) {
  console.error('Exception:', error);
}
```

### Streaming Chat Completion

```typescript
const streamParams: ChatParams = {
  model: 'claude-3-sonnet-20240229',
  messages: [
    { role: 'user', content: 'Write a short story about AI' }
  ],
  maxOutputTokens: 2000,
  streaming: true,
  streamCallback: (content: string) => {
    // Handle streaming chunks as they arrive
    process.stdout.write(content);
  }
};

const response = await anthropicLLM.ChatCompletion(streamParams);
```

### Using Thinking/Reasoning Models

```typescript
const reasoningParams: ChatParams = {
  model: 'claude-3-opus-20240229',
  messages: [
    { role: 'user', content: 'Solve this complex math problem: ...' }
  ],
  effortLevel: 'high',
  reasoningBudgetTokens: 5000, // Allow up to 5000 tokens for reasoning
  maxOutputTokens: 2000
};

const response = await anthropicLLM.ChatCompletion(reasoningParams);
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

// Use the client directly if needed for features not exposed by the wrapper
const customResponse = await anthropicClient.messages.create({
  model: 'claude-3-haiku-20240307',
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 500
});
```

## API Reference

### AnthropicLLM Class

Extends `BaseLLM` from `@memberjunction/ai` to provide Anthropic-specific functionality.

#### Constructor

```typescript
new AnthropicLLM(apiKey: string)
```

Creates a new instance of the AnthropicLLM wrapper.

**Parameters:**
- `apiKey`: Your Anthropic API key

#### Properties

- `AnthropicClient`: (read-only) Returns the underlying Anthropic SDK client instance
- `SupportsStreaming`: (read-only) Returns `true` - Anthropic supports streaming

#### Methods

##### ChatCompletion(params: ChatParams): Promise<ChatResult>

Performs a chat completion using Claude models.

**Parameters:**
- `params`: ChatParams object containing:
  - `model`: The model to use (e.g., 'claude-3-opus-20240229')
  - `messages`: Array of chat messages
  - `maxOutputTokens`: Maximum tokens to generate (default: 64000)
  - `temperature`: Temperature for randomness (0-1)
  - `enableCaching`: Enable ephemeral caching (default: true)
  - `streaming`: Enable streaming responses
  - `streamCallback`: Callback for streaming chunks
  - `effortLevel`: Enable thinking/reasoning mode
  - `reasoningBudgetTokens`: Token budget for reasoning (min: 1)

**Returns:** `ChatResult` with response data, usage info, and timing metrics

##### SummarizeText(params: SummarizeParams): Promise<SummarizeResult>

Summarizes text using Claude's completion API.

**Parameters:**
- `params`: SummarizeParams object containing:
  - `text`: Text to summarize
  - `model`: Model to use (default: 'claude-2.1')
  - `temperature`: Temperature setting
  - `maxWords`: Maximum words in summary

**Returns:** `SummarizeResult` with the generated summary

##### ConvertMJToAnthropicRole(role: ChatMessageRole): 'assistant' | 'user'

Converts MemberJunction chat roles to Anthropic-compatible roles.

**Parameters:**
- `role`: MemberJunction role ('system', 'user', 'assistant')

**Returns:** Anthropic role ('assistant' or 'user')

## Advanced Features

### Caching

The wrapper supports Anthropic's ephemeral caching feature, which can significantly improve performance for repeated queries:

```typescript
const params: ChatParams = {
  model: 'claude-3-opus-20240229',
  messages: [...],
  enableCaching: true // Caching is enabled by default
};
```

Caching is automatically applied to the last message in the conversation for optimal performance.

### Message Format Handling

The wrapper automatically handles:
- Conversion of system messages to Anthropic's format
- Prevention of consecutive messages with the same role
- Proper formatting of content blocks
- Automatic insertion of filler messages when needed

### Error Handling

The wrapper provides comprehensive error information:

```typescript
try {
  const response = await anthropicLLM.ChatCompletion(params);
  if (!response.success) {
    console.error('Error:', response.errorMessage);
    console.error('Status:', response.statusText);
    console.error('Time Elapsed:', response.timeElapsed, 'ms');
    console.error('Exception Details:', response.exception);
  }
} catch (error) {
  console.error('Exception occurred:', error);
}
```

## Integration with MemberJunction

This package is designed to work seamlessly with the MemberJunction AI framework:

1. **Consistent Interface**: Implements the same methods as other AI providers
2. **Type Safety**: Full TypeScript support with proper typing
3. **Global Registration**: Automatically registers with MemberJunction's class factory using `@RegisterClass` decorator
4. **Standardized Results**: Returns standardized result objects compatible with MemberJunction's AI abstraction

## Dependencies

- `@anthropic-ai/sdk` (^0.50.4): Official Anthropic SDK
- `@memberjunction/ai` (^2.43.0): MemberJunction AI core framework
- `@memberjunction/global` (^2.43.0): MemberJunction global utilities

## Development

### Building

```bash
npm run build
```

### Running in Development

```bash
npm start
```

## License

ISC

## Support

For issues and questions:
- GitHub Issues: [MemberJunction Repository](https://github.com/MemberJunction/MJ)
- Documentation: [MemberJunction Docs](https://docs.memberjunction.com)