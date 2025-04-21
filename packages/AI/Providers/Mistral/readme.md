# @memberjunction/ai-mistral

A comprehensive wrapper for Mistral AI's models, enabling seamless integration with the MemberJunction AI framework for natural language processing tasks.

## Features

- **Mistral AI Integration**: Connect to Mistral's powerful language models
- **Standardized Interface**: Implements MemberJunction's BaseLLM abstract class
- **Token Usage Tracking**: Automatic tracking of prompt and completion tokens
- **Response Format Control**: Support for standard text and JSON response formats
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Completion**: Full support for chat-based interactions with Mistral models

## Installation

```bash
npm install @memberjunction/ai-mistral
```

## Requirements

- Node.js 16+
- A Mistral AI API key
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { MistralLLM } from '@memberjunction/ai-mistral';

// Initialize with your Mistral API key
const mistralLLM = new MistralLLM('your-mistral-api-key');
```

### Chat Completion

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'mistral-large-latest',  // or other models like 'open-mistral-7b', 'mistral-small-latest'
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What are the main principles of machine learning?' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

// Get a response
try {
  const response = await mistralLLM.ChatCompletion(chatParams);
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

### JSON Response Format

```typescript
// Request a structured JSON response
const jsonParams: ChatParams = {
  model: 'mistral-large-latest',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Give me data about the top 3 machine learning algorithms in JSON format' }
  ],
  maxOutputTokens: 1000,
  responseFormat: 'JSON'  // This will add the appropriate response_format parameter
};

const jsonResponse = await mistralLLM.ChatCompletion(jsonParams);

// Parse the JSON response
if (jsonResponse.success) {
  const structuredData = JSON.parse(jsonResponse.data.choices[0].message.content);
  console.log('Structured Data:', structuredData);
}
```

### Direct Access to Mistral Client

```typescript
// Access the underlying Mistral client for advanced usage
const mistralClient = mistralLLM.Client;

// Use the client directly if needed
const modelList = await mistralClient.listModels();
console.log('Available models:', modelList);
```

## Supported Models

Mistral AI offers several models with different capabilities and price points:

- `mistral-large-latest`: Mistral's most powerful model (at the time of writing)
- `mistral-medium-latest`: Mid-tier model balancing performance and cost
- `mistral-small-latest`: Smaller, more efficient model
- `open-mistral-7b`: Open-source 7B parameter model
- `open-mixtral-8x7b`: Open-source mixture-of-experts model

Check the [Mistral AI documentation](https://docs.mistral.ai/) for the latest list of supported models.

## API Reference

### MistralLLM Class

A class that extends BaseLLM to provide Mistral-specific functionality.

#### Constructor

```typescript
new MistralLLM(apiKey: string)
```

#### Properties

- `Client`: (read-only) Returns the underlying Mistral client instance

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Not implemented yet
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Not implemented yet

## Response Format Control

The wrapper supports different response formats:

```typescript
// For JSON responses
const params: ChatParams = {
  // ...other parameters
  responseFormat: 'JSON'
};

// For regular text responses (default)
const textParams: ChatParams = {
  // ...other parameters
  // No need to specify responseFormat for regular text
};
```

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await mistralLLM.ChatCompletion(params);
  if (!response.success) {
    console.error('Error:', response.errorMessage);
    console.error('Status:', response.statusText);
    console.error('Exception:', response.exception);
  }
} catch (error) {
  console.error('Exception occurred:', error);
}
```

## Token Usage Tracking

Monitor token usage for billing and quota management:

```typescript
const response = await mistralLLM.ChatCompletion(params);
if (response.success) {
  console.log('Prompt Tokens:', response.data.usage.promptTokens);
  console.log('Completion Tokens:', response.data.usage.completionTokens);
  console.log('Total Tokens:', response.data.usage.totalTokens);
}
```

## Limitations

Currently, the wrapper implements:
- Chat completion functionality with token usage tracking

Future implementations may include:
- `SummarizeText` functionality
- `ClassifyText` functionality
- Streaming responses

## Dependencies

- `@mistralai/mistralai`: Official Mistral AI Node.js SDK
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities
- `axios-retry`: Retry mechanism for API calls

## License

ISC