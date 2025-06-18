# @memberjunction/ai-mistral

A comprehensive wrapper for Mistral AI's models, enabling seamless integration with the MemberJunction AI framework for natural language processing and embedding tasks.

## Features

- **Mistral AI Integration**: Connect to Mistral's powerful language models and embedding models
- **Standardized Interface**: Implements MemberJunction's BaseLLM and BaseEmbeddings abstract classes
- **Streaming Support**: Full support for streaming chat completions
- **Token Usage Tracking**: Automatic tracking of prompt and completion tokens
- **Response Format Control**: Support for standard text and JSON response formats
- **Multi-Modal Support**: Handles text, images, and documents in chat messages
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Completion**: Full support for chat-based interactions with Mistral models
- **Text Embeddings**: Generate vector embeddings for text using Mistral's embedding models

## Installation

```bash
npm install @memberjunction/ai-mistral
```

## Requirements

- Node.js 16+
- TypeScript 5.4.5+
- A Mistral AI API key
- MemberJunction Core libraries (@memberjunction/ai, @memberjunction/global)

## Usage

### Basic Setup

```typescript
import { MistralLLM } from '@memberjunction/ai-mistral';

// Initialize with your Mistral API key
const mistralLLM = new MistralLLM('your-mistral-api-key');
```

### Chat Completion

```typescript
import { ChatParams, ChatMessageRole } from '@memberjunction/ai';

// Create chat parameters
const chatParams: ChatParams = {
  model: 'mistral-large-latest',  // or other models like 'open-mistral-7b', 'mistral-small-latest'
  messages: [
    { role: ChatMessageRole.system, content: 'You are a helpful assistant.' },
    { role: ChatMessageRole.user, content: 'What are the main principles of machine learning?' }
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
    { role: ChatMessageRole.system, content: 'You are a helpful assistant that responds in JSON format.' },
    { role: ChatMessageRole.user, content: 'Give me data about the top 3 machine learning algorithms in JSON format' }
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

### Streaming Chat Completion

```typescript
// Mistral supports streaming responses
const streamParams: ChatParams = {
  model: 'mistral-large-latest',
  messages: [
    { role: ChatMessageRole.system, content: 'You are a helpful assistant.' },
    { role: ChatMessageRole.user, content: 'Write a short story about AI' }
  ],
  maxOutputTokens: 1000,
  stream: true,  // Enable streaming
  streamCallback: (content: string) => {
    // Handle each chunk of streamed content
    process.stdout.write(content);
  }
};

const streamResponse = await mistralLLM.ChatCompletion(streamParams);
console.log('\nStreaming complete!');
console.log('Total tokens:', streamResponse.data.usage);
```

### Multi-Modal Messages

```typescript
// Mistral supports images and documents in messages
const multiModalParams: ChatParams = {
  model: 'mistral-large-latest',
  messages: [
    {
      role: ChatMessageRole.user,
      content: [
        { type: 'text', content: 'What do you see in this image?' },
        { type: 'image_url', content: 'https://example.com/image.jpg' }
      ]
    }
  ],
  maxOutputTokens: 1000
};

// For documents
const documentParams: ChatParams = {
  model: 'mistral-large-latest',
  messages: [
    {
      role: ChatMessageRole.user,
      content: [
        { type: 'text', content: 'Summarize this document' },
        { type: 'file_url', content: 'https://example.com/document.pdf' }  // Converted to document_url for Mistral
      ]
    }
  ],
  maxOutputTokens: 1000
};
```

### Text Embeddings

```typescript
import { MistralEmbedding } from '@memberjunction/ai-mistral';
import { EmbedTextParams, EmbedTextsParams } from '@memberjunction/ai';

// Initialize the embedding client
const mistralEmbedding = new MistralEmbedding('your-mistral-api-key');

// Embed a single text
const embedParams: EmbedTextParams = {
  text: 'Machine learning is a subset of artificial intelligence.',
  model: 'mistral-embed'  // Optional, defaults to 'mistral-embed'
};

const embedResult = await mistralEmbedding.EmbedText(embedParams);
console.log('Embedding vector dimensions:', embedResult.vector.length);  // 1024 dimensions
console.log('Token usage:', embedResult.ModelUsage);

// Embed multiple texts
const multiEmbedParams: EmbedTextsParams = {
  texts: [
    'Natural language processing enables computers to understand human language.',
    'Deep learning uses neural networks with multiple layers.',
    'Computer vision allows machines to interpret visual information.'
  ],
  model: 'mistral-embed'
};

const multiEmbedResult = await mistralEmbedding.EmbedTexts(multiEmbedParams);
console.log('Number of embeddings:', multiEmbedResult.vectors.length);
console.log('Total token usage:', multiEmbedResult.ModelUsage);

// Get available embedding models
const embeddingModels = await mistralEmbedding.GetEmbeddingModels();
console.log('Available models:', embeddingModels);
```

### Direct Access to Mistral Client

```typescript
// Access the underlying Mistral client for advanced usage
const mistralClient = mistralLLM.Client;

// Use the client directly if needed
const modelList = await mistralClient.models.list();
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
- `SupportsStreaming`: (read-only) Returns `true` - Mistral supports streaming

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion (supports both streaming and non-streaming)
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Not implemented yet
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Not implemented yet

### MistralEmbedding Class

A class that extends BaseEmbeddings to provide Mistral embedding functionality.

#### Constructor

```typescript
new MistralEmbedding(apiKey: string)
```

#### Properties

- `Client`: (read-only) Returns the underlying Mistral client instance

#### Methods

- `EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>` - Generate embedding for a single text
- `EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>` - Generate embeddings for multiple texts
- `GetEmbeddingModels(): Promise<any>` - Get list of available embedding models

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

## Special Behaviors

### Message Formatting
- The wrapper automatically ensures Mistral's requirement that the last message must be from 'user' or 'tool'
- If the last message is not from a user, a placeholder user message "ok" is automatically appended

### Multi-Modal Content
- Image URLs are passed through as `image_url` type
- File URLs are converted to `document_url` type for Mistral compatibility
- Unsupported content types are filtered out with a warning

## Limitations

Currently, the wrapper implements:
- Chat completion functionality with full streaming support
- Text embedding functionality with single and batch processing
- Token usage tracking for both chat and embeddings

Not yet implemented:
- `SummarizeText` functionality
- `ClassifyText` functionality
- `effortLevel`/`reasoning_effort` parameter (not currently supported by Mistral API)

## Integration with MemberJunction

This package is designed to work seamlessly with the MemberJunction AI framework:

### Class Registration
Both `MistralLLM` and `MistralEmbedding` are automatically registered with the MemberJunction class factory using the `@RegisterClass` decorator:

```typescript
// Classes are registered and can be instantiated via the class factory
import { ClassFactory } from '@memberjunction/global';

const mistralLLM = ClassFactory.CreateInstance<BaseLLM>(BaseLLM, 'MistralLLM', apiKey);
const mistralEmbedding = ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, 'MistralEmbedding', apiKey);
```

### Tree-Shaking Prevention
The package exports loader functions to prevent tree-shaking:

```typescript
import { LoadMistralLLM, LoadMistralEmbedding } from '@memberjunction/ai-mistral';

// Call these in your application initialization to ensure classes are registered
LoadMistralLLM();
LoadMistralEmbedding();
```

## Dependencies

- `@mistralai/mistralai`: ^1.6.0 - Official Mistral AI Node.js SDK
- `@memberjunction/ai`: 2.43.0 - MemberJunction AI core framework
- `@memberjunction/global`: 2.43.0 - MemberJunction global utilities
- `axios-retry`: 4.3.0 - Retry mechanism for API calls

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm start
```

## Supported Parameters

The Mistral provider supports the following LLM parameters:

**Supported:**
- `temperature` - Controls randomness in the output (0.0-1.0)
- `maxOutputTokens` - Maximum number of tokens to generate
- `topP` - Nucleus sampling threshold (0.0-1.0)
- `topK` - Limits vocabulary to top K tokens
- `seed` - For deterministic outputs (passed as `randomSeed` to Mistral API)
- `stopSequences` - Array of sequences where the API will stop generating
- `responseFormat` - Output format (Text or JSON)

**Not Supported:**
- `frequencyPenalty` - Not available in Mistral API
- `presencePenalty` - Not available in Mistral API
- `minP` - Not available in Mistral API

## License

ISC

## Contributing

When contributing to this package:
1. Follow the MemberJunction code style guide
2. Ensure all TypeScript types are properly defined
3. Add appropriate error handling
4. Update documentation for any new features
5. Test with various Mistral models