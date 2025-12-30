# @memberjunction/ai-vertex

✅ **Status: Production Ready** (v2.129.0+)

**New Implementation**: VertexLLM now extends [@memberjunction/ai-gemini](../Gemini) and inherits all its functionality including:
- ✅ Chat completion (streaming and non-streaming)
- ✅ Thinking/reasoning support (Gemini 2.5+ models)
- ✅ Multimodal content (images, audio, video)
- ✅ Complete parameter mapping
- ✅ Message alternation and system instructions
- ✅ Comprehensive error handling

A streamlined wrapper for Google Vertex AI services, providing enterprise-grade access to Gemini models through Google Cloud Platform.

## Features

- **Google Vertex AI Integration**: Connect to Google Cloud's Vertex AI platform and access a variety of foundation models
- **Standardized Interface**: Implements MemberJunction's BaseLLM and BaseEmbeddings abstract classes
- **Model Diversity**: Access models like PaLM, Gemini, and third-party models through a unified interface
- **Token Usage Tracking**: Automatic tracking of prompt and completion tokens
- **Response Format Control**: Support for various response formats including text and structured data
- **Error Handling**: Robust error handling with detailed reporting
- **Chat Completion**: Full support for chat-based interactions with supported models
- **Embedding Generation**: Generate text embeddings for semantic search and other applications (currently simulated, pending full Vertex AI embedding API support)
- **Streaming Support**: Stream responses for real-time UI experiences

## Installation

```bash
npm install @memberjunction/ai-vertex
```

## Requirements

- Node.js 16+
- Google Cloud credentials with Vertex AI access
- MemberJunction Core libraries

## Migration from v2.128.x

**Breaking Change**: Constructor signature has changed to support flexible authentication.

### Old (v2.128.x and earlier):
```typescript
const llm = new VertexLLM('/path/to/key.json', 'project-id', 'us-central1');
```

### New (v2.129.0+):
```typescript
const llm = new VertexLLM(JSON.stringify({
  keyFilePath: '/path/to/key.json',
  project: 'project-id',
  location: 'us-central1'
}));
```

## Usage

### Basic Setup

```typescript
import { VertexLLM, VertexAICredentials } from '@memberjunction/ai-vertex';

// Option 1: Application Default Credentials (Recommended for Production)
// Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json or use gcloud auth
const llm = new VertexLLM(JSON.stringify({
  project: 'your-google-cloud-project-id',
  location: 'us-central1' // Optional, defaults to 'us-central1'
}));

// Option 2: Service Account JSON String
const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
const llm2 = new VertexLLM(serviceAccountJson);

// Option 3: Key File Path
const llm3 = new VertexLLM(JSON.stringify({
  keyFilePath: '/path/to/service-account-key.json',
  project: 'your-project',
  location: 'us-central1'
}));
```

### Chat Completion with PaLM Models

```typescript
import { ChatParams } from '@memberjunction/ai';

// Create chat parameters for PaLM on Vertex AI
const chatParams: ChatParams = {
  model: 'text-bison',  // Use the Vertex AI model name
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What are the main features of Google Vertex AI?' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

// Get a response
try {
  const response = await vertexLLM.ChatCompletion(chatParams);
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

### Chat Completion with Gemini Models

```typescript
// Example with Google's Gemini model (access through Vertex)
const geminiParams: ChatParams = {
  model: 'gemini-pro',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain the concept of foundation models.' }
  ],
  temperature: 0.5,
  maxOutputTokens: 800
};

const geminiResponse = await vertexLLM.ChatCompletion(geminiParams);
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
  model: 'gemini-pro',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Write a short story about cloud computing.' }
  ],
  streaming: true,
  streamingCallbacks: callbacks
};

// Start streaming
await vertexLLM.ChatCompletion(streamingParams);
```

### Text Embedding

**Note**: The embedding functionality is currently simulated as the Google Vertex AI SDK for Node.js does not yet provide direct access to embedding endpoints. This will be updated once the SDK supports native embedding generation.

```typescript
import { EmbedTextParams, EmbedTextsParams } from '@memberjunction/ai';

// Embed a single text
const embedParams: EmbedTextParams = {
  model: 'textembedding-gecko',
  text: 'This is a sample text to embed.'
};

const embedResult = await vertexEmbedding.EmbedText(embedParams);
console.log('Embedding vector length:', embedResult.vector.length);
console.log('Tokens used:', embedResult.ModelUsage.promptTokens);

// Embed multiple texts
const multiEmbedParams: EmbedTextsParams = {
  model: 'textembedding-gecko',
  texts: [
    'First text to embed.',
    'Second text to embed.',
    'Third text to embed.'
  ]
};

const multiEmbedResult = await vertexEmbedding.EmbedTexts(multiEmbedParams);
console.log('Number of embeddings:', multiEmbedResult.vectors.length);
```

## Supported Models

Google Vertex AI offers a variety of foundation models. Here are some of the key models:

### Text/Chat Models
- **PaLM 2 Family**: text-bison, chat-bison, text-unicorn
- **Gemini Family**: gemini-pro, gemini-pro-vision, gemini-ultra
- **Code Generation**: code-bison, codechat-bison
- **Third-party Models**: Models from other providers may be available through Vertex AI

### Embedding Models (Simulated)
- **Text Embeddings**: textembedding-gecko, textembedding-gecko-multilingual
  - *Note: Currently simulated pending SDK support*

### Multimodal Models
- **Gemini Vision**: gemini-pro-vision
- **Imagen**: imagegeneration@005

Check the [Google Vertex AI documentation](https://cloud.google.com/vertex-ai/docs/generative-ai/models/overview) for the latest list of supported models.

## API Reference

### VertexLLM Class

A class that extends BaseLLM to provide Google Vertex AI-specific functionality.

#### Constructor

```typescript
new VertexLLM(apiKey: string, projectId: string, location: string = 'us-central1')
```

- `apiKey`: Path to the Google Cloud service account key file
- `projectId`: Your Google Cloud project ID
- `location`: The Google Cloud region for Vertex AI (defaults to 'us-central1')

#### Properties

- `Client`: (read-only) Returns the underlying Vertex AI client instance
- `SupportsStreaming`: (read-only) Returns `true` - Google Vertex AI supports streaming

#### Methods

- `ChatCompletion(params: ChatParams): Promise<ChatResult>` - Perform a chat completion with optional streaming support
- `SummarizeText(params: SummarizeParams): Promise<SummarizeResult>` - Not implemented yet
- `ClassifyText(params: ClassifyParams): Promise<ClassifyResult>` - Not implemented yet

### VertexEmbedding Class

A class that extends BaseEmbeddings to provide Google Vertex AI embedding functionality.

#### Constructor

```typescript
new VertexEmbedding(apiKey: string, projectId: string, location: string = 'us-central1')
```

- `apiKey`: Path to the Google Cloud service account key file
- `projectId`: Your Google Cloud project ID
- `location`: The Google Cloud region for Vertex AI (defaults to 'us-central1')

#### Properties

- `Client`: (read-only) Returns the underlying Vertex AI client instance

#### Methods

- `EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>` - Generate embeddings for a single text (currently simulated)
- `EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>` - Generate embeddings for multiple texts (currently simulated)
- `GetEmbeddingModels(): Promise<any>` - Get available embedding models

### Loader Functions

The package exports loader functions to prevent tree-shaking of the registered classes:

```typescript
import { LoadVertexLLM, LoadVertexEmbedding } from '@memberjunction/ai-vertex';

// Call these functions if you need to ensure the classes are registered
LoadVertexLLM();
LoadVertexEmbedding();
```

These functions are typically not needed in normal usage as importing the classes will automatically register them.

## Error Handling

The wrapper provides detailed error information:

```typescript
try {
  const response = await vertexLLM.ChatCompletion(params);
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
const response = await vertexLLM.ChatCompletion(params);
if (response.success) {
  console.log('Prompt Tokens:', response.data.usage.promptTokens);
  console.log('Completion Tokens:', response.data.usage.completionTokens);
  console.log('Total Tokens:', response.data.usage.totalTokens);
}
```

## Testing

### Setup Test Environment

```bash
# Set environment variables
export VERTEX_PROJECT_ID="your-project-id"
export VERTEX_SERVICE_ACCOUNT_KEY_PATH="/path/to/key.json"
export VERTEX_LOCATION="us-central1"  # Optional

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

See [CODE_REVIEW.md](CODE_REVIEW.md) for detailed testing information.

## Limitations and Known Issues

⚠️ **Current Limitations** (see [CODE_REVIEW.md](CODE_REVIEW.md) for complete details):

1. **Authentication**: Only service account key file authentication is currently supported (ADC coming soon)
2. **Multimodal Content**: Text-only support (images, audio, video not yet implemented)
3. **Thinking Support**: Gemini 2.5+ thinking/reasoning features not yet implemented
4. **Incomplete Parameters**: Some ChatParams (responseFormat, stopSequences, seed) not yet wired up
5. **System Messages**: Not using systemInstruction parameter (bundled in conversation instead)
6. **No Message Alternation**: May fail with consecutive same-role messages

Currently, the wrapper implements:
- ✅ Basic chat completion functionality with token usage tracking
- ✅ Streaming response support
- ✅ Comprehensive test suite
- ⚠️ Simulated embedding functionality (pending native SDK support)

Future implementations may include:
- 🚧 Thinking/reasoning support for Gemini 2.5+ models
- 🚧 Multimodal content (images, audio, video)
- 🚧 Complete parameter mapping
- 🚧 ADC authentication support
- 🚧 Native embedding functionality
- 🚧 `SummarizeText` functionality
- 🚧 `ClassifyText` functionality

## Dependencies

- `@google-cloud/vertexai`: Google Cloud SDK for Vertex AI
- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities

## Integration with MemberJunction

This package integrates seamlessly with the MemberJunction AI framework:

1. **Standardized Interface**: Implements the same interface as other AI providers in the MemberJunction ecosystem
2. **Provider Registration**: Classes are automatically registered using the `@RegisterClass` decorator
3. **Model Management**: Compatible with MemberJunction's AI model management system
4. **Token Tracking**: Integrates with MemberJunction's usage tracking and billing systems

### Using with MemberJunction AI Core

```typescript
import { GetAIAPIKey } from '@memberjunction/ai';
import { VertexLLM } from '@memberjunction/ai-vertex';

// Get API key from MemberJunction configuration
const apiKey = GetAIAPIKey('vertex');
const projectId = 'your-project-id';

// Create provider instance
const vertex = new VertexLLM(apiKey, projectId);

// Use with MemberJunction AI services
// The provider will be automatically available through the AI factory system
```

## Implementation Notes

### Authentication
The package expects the `apiKey` parameter to be a path to a Google Cloud service account key file, not an API key string. This file should contain the credentials for accessing Vertex AI services.

### Model Name Mapping
The package automatically handles different model types based on their name prefix:
- Models starting with `gemini-` are handled as Gemini models
- Models starting with `text-` are handled as text generation models
- Models starting with `code-` are handled as code generation models

### Message Role Mapping
The package maps MemberJunction message roles to Vertex AI format:
- `system` → `system`
- `assistant` → `model`
- `user` → `user`

## Building and Development

```bash
# Build the package
npm run build

# Watch mode for development
npm run watch

# Run type checking
tsc --noEmit
```

## License

See the [repository root](../../../LICENSE) for license information.