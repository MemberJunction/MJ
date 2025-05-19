# @memberjunction/ai-bedrock

A comprehensive wrapper for Amazon Bedrock AI services, enabling seamless integration with the MemberJunction AI framework for a wide range of AI models hosted on AWS Bedrock.

## Features

- **Amazon Bedrock Integration**: Connect to AWS Bedrock's suite of foundation models from providers like Amazon, Anthropic, AI21 Labs, Cohere, and more
- **Standardized Interface**: Implements MemberJunction's BaseLLM and BaseEmbeddings abstract classes
- **Model Diversity**: Access a wide range of models without changing your application code
- **Token Usage Tracking**: Automatic tracking of prompt and completion tokens
- **Response Format Control**: Support for standard text and JSON response formats
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Completion**: Full support for chat-based interactions with supported models
- **Embedding Generation**: Generate text embeddings for semantic search and other applications
- **Streaming Support**: Stream responses for real-time UI experiences

## Installation

```bash
npm install @memberjunction/ai-bedrock
```

## Requirements

- Node.js 16+
- AWS credentials with Bedrock access
- MemberJunction Core libraries

## Usage

### Basic Setup

```typescript
import { BedrockLLM, BedrockEmbedding } from '@memberjunction/ai-bedrock';

// Format should be "ACCESS_KEY:SECRET_KEY"
const credentials = 'YOUR_AWS_ACCESS_KEY:YOUR_AWS_SECRET_KEY';

// Initialize with your AWS credentials (and optionally region)
const bedrockLLM = new BedrockLLM(credentials, 'us-east-1');
const bedrockEmbedding = new BedrockEmbedding(credentials, 'us-east-1');
```

### Chat Completion with Claude Models

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters for Anthropic Claude on Bedrock
const chatParams: ChatParams = {
  model: 'anthropic.claude-v2',  // Use the Bedrock model ID
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What are the main features of Amazon Bedrock?' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

// Get a response
try {
  const response = await bedrockLLM.ChatCompletion(chatParams);
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

### Chat Completion with Amazon Titan

```typescript
// Example with Amazon's Titan model
const titanParams: ChatParams = {
  model: 'amazon.titan-text-express-v1',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain the concept of foundation models.' }
  ],
  temperature: 0.5,
  maxOutputTokens: 800
};

const titanResponse = await bedrockLLM.ChatCompletion(titanParams);
```

### Streaming Chat Completion

```typescript
import { ChatParams, StreamingChatCallbacks } from '@memberjunction/ai';

// Define streaming callbacks
const callbacks: StreamingChatCallbacks = {
  OnContent: (chunk: string, isComplete: boolean) => {
    process.stdout.write(chunk);
  },
  OnComplete: (finalResponse) => {
    console.log('\nTotal tokens:', finalResponse.data.usage.totalTokens);
  },
  OnError: (error) => {
    console.error('Streaming error:', error);
  }
};

// Create streaming chat parameters
const streamingParams: ChatParams = {
  model: 'anthropic.claude-v2',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Write a short story about cloud computing.' }
  ],
  streaming: true,
  streamingCallbacks: callbacks
};

// Start streaming
await bedrockLLM.ChatCompletion(streamingParams);
```

### Text Embedding

```typescript
import { EmbedTextParams, EmbedTextsParams } from '@memberjunction/ai';

// Embed a single text
const embedParams: EmbedTextParams = {
  model: 'amazon.titan-embed-text-v1',
  text: 'This is a sample text to embed.'
};

const embedResult = await bedrockEmbedding.EmbedText(embedParams);
console.log('Embedding vector length:', embedResult.vector.length);
console.log('Tokens used:', embedResult.ModelUsage.promptTokens);

// Embed multiple texts
const multiEmbedParams: EmbedTextsParams = {
  model: 'amazon.titan-embed-text-v1',
  texts: [
    'First text to embed.',
    'Second text to embed.',
    'Third text to embed.'
  ]
};

const multiEmbedResult = await bedrockEmbedding.EmbedTexts(multiEmbedParams);
console.log('Number of embeddings:', multiEmbedResult.vectors.length);
```

## Supported Models

Amazon Bedrock offers foundation models from multiple providers. Here are some of the key models:

### Text/Chat Models
- **Anthropic Claude Family**: anthropic.claude-v2, anthropic.claude-instant-v1, etc.
- **Amazon Titan Text**: amazon.titan-text-express-v1, amazon.titan-text-lite-v1
- **AI21 Labs Jurassic**: ai21.j2-ultra, ai21.j2-mid
- **Cohere Command**: cohere.command-text-v14, cohere.command-light-text-v14
- **Meta Llama 2**: meta.llama2-13b-chat-v1, meta.llama2-70b-chat-v1

### Embedding Models
- **Amazon Titan Embeddings**: amazon.titan-embed-text-v1
- **Cohere Embeddings**: cohere.embed-english-v3, cohere.embed-multilingual-v3

### Image Models
- **Stability AI**: stability.stable-diffusion-xl-v1
- **Amazon Titan Image**: amazon.titan-image-generator-v1

Check the [Amazon Bedrock documentation](https://docs.aws.amazon.com/bedrock/) for the latest list of supported models.

## API Reference

### BedrockLLM Class

A class that extends BaseLLM to provide Amazon Bedrock-specific functionality.

#### Constructor

```typescript
new BedrockLLM(apiKey: string, region: string = 'us-east-1')
```

#### Properties

- `Client`: (read-only) Returns the underlying Bedrock client instance

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Not implemented yet
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Not implemented yet

### BedrockEmbedding Class

A class that extends BaseEmbeddings to provide Amazon Bedrock embedding functionality.

#### Constructor

```typescript
new BedrockEmbedding(apiKey: string, region: string = 'us-east-1')
```

#### Properties

- `Client`: (read-only) Returns the underlying Bedrock client instance

#### Methods

- `EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>` - Generate embeddings for a single text
- `EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>` - Generate embeddings for multiple texts
- `GetEmbeddingModels(): Promise<any>` - Get available embedding models

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await bedrockLLM.ChatCompletion(params);
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
const response = await bedrockLLM.ChatCompletion(params);
if (response.success) {
  console.log('Prompt Tokens:', response.data.usage.promptTokens);
  console.log('Completion Tokens:', response.data.usage.completionTokens);
  console.log('Total Tokens:', response.data.usage.totalTokens);
}
```

## Limitations

Currently, the wrapper implements:
- Chat completion functionality with token usage tracking
- Embedding functionality
- Streaming response support

Future implementations may include:
- `SummarizeText` functionality
- `ClassifyText` functionality
- Support for image generation models

## Dependencies

- `@aws-sdk/client-bedrock-runtime`: AWS SDK for Amazon Bedrock
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

See the [repository root](../../../LICENSE) for license information.