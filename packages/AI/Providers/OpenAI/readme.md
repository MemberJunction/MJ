# @memberjunction/ai-openai

A comprehensive wrapper for OpenAI's API and models that seamlessly integrates with the MemberJunction AI framework, providing a standardized interface for GPT and other OpenAI models.

## Features

- **OpenAI Integration**: Full integration with OpenAI's chat completion models
- **Standardized Interface**: Follows MemberJunction's BaseLLM abstract class for consistency
- **Message Formatting**: Handles conversion between MemberJunction and OpenAI message formats
- **Response Format Support**: Support for different response formats (Text, JSON, etc.)
- **Error Handling**: Comprehensive error handling with detailed reporting
- **Token Usage Tracking**: Automatic tracking of prompt and completion tokens
- **Chat Completion**: Chat-based interaction with models like GPT-4 and GPT-3.5
- **Text Summarization**: Summarize text content using OpenAI models

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
  responseFormat: 'Text'
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

### JSON Response Format

```typescript
const jsonParams: ChatParams = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
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

### Direct Access to OpenAI Client

```typescript
// Access the underlying OpenAI client for advanced usage
const openAIClient = openAI.OpenAI;

// Use the client directly if needed
const embeddings = await openAIClient.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'The quick brown fox jumps over the lazy dog'
});
```

## API Reference

### OpenAILLM Class

A class that extends BaseLLM to provide OpenAI-specific functionality.

#### Constructor

```typescript
new OpenAILLM(apiKey: string)
```

#### Properties

- `OpenAI`: (read-only) Returns the underlying OpenAI client instance

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Summarize text
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Classify text (not implemented)
- `ConvertMJToOpenAIChatMessages(messages: ChatMessage[]): ChatCompletionMessageParam[]` - Convert MemberJunction messages to OpenAI messages
- `ConvertMJToOpenAIRole(role: string): string` - Convert MemberJunction roles to OpenAI roles

## Response Formats

The OpenAILLM class supports various response formats:

- `Text`: Regular text responses (default)
- `JSON`: Structured JSON responses
- `Markdown`: Markdown-formatted responses
- `ModelSpecific`: Custom formats supported by specific models

Example with JSON response:

```typescript
const params: ChatParams = {
  // ...other parameters
  responseFormat: 'JSON'
};
```

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

## Dependencies

- `openai`: Official OpenAI Node.js SDK (v4.x)
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## License

ISC