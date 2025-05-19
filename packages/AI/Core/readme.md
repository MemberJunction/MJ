# @memberjunction/ai

The MemberJunction AI Core package provides a comprehensive abstraction layer for working with various AI models (LLMs, Video and Audio Generation, Text-To-Speech (TTS), embedding models, etc.) in a provider-agnostic way, allowing your application to easily switch between different AI providers without refactoring your code.

## Standalone Usage

**IMPORTANT**: This package can be used completely independently from the rest of the MemberJunction framework:

- **Zero** database setup required
- No environment variables or other settings expected (you are responsible for this and pass in API keys to the constructors)
- Works in any TypeScript environment that can safely make API calls (e.g. don't use in browsers)
- Perfect for server-side applications, backend services, and CLI tools

The `@memberjunction/ai` package and all provider packages in `@memberjunction/ai-*` are designed to be lightweight, standalone modules that can be used in any TypeScript project.

## Features

- **Provider Abstraction**: Work with AI models without tightly coupling to specific vendor APIs
- **Runtime Optionality**: Switch between AI providers at runtime based on configuration
- **Base Classes**: Abstract base classes for different AI model types (LLMs, embedding models, etc.)
- **Standard Interfaces**: Consistent interfaces for common AI operations like chat, summarization, and classification
- **Streaming Support**: Stream responses from supported LLM providers for real-time UIs
- **Type Definitions**: Comprehensive TypeScript type definitions for all AI operations
- **Error Handling**: Standardized error handling and reporting across all providers
- **Token Usage Tracking**: Consistent tracking of token usage across providers

## Installation

```bash
npm install @memberjunction/ai
```

Then install one or more provider packages:

```bash
npm install @memberjunction/ai-openai
npm install @memberjunction/ai-anthropic
npm install @memberjunction/ai-mistral
# etc.
```

## Usage

### Provider-Agnostic Usage (Recommended)

For maximum flexibility, use the class factory approach to select the provider at runtime:

```typescript
import { BaseLLM, ChatParams } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

// Required to stop tree-shaking of the MistralLLM - since there's no static code path to this class when using Class Factory pattern, you need this to prevent some bundlers from tree-shaking optimization on this class.
import { LoadMistralLLM } from '@memberjunction/ai-mistral';
LoadMistralLLM(); 

// Get an implementation of BaseLLM by provider name
const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
  BaseLLM, 
  'MistralLLM',  // Provider class name
  'your-api-key'
);

// Use the abstracted interface
const params: ChatParams = {
  model: 'mistral-large-latest',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is AI abstraction?' }
  ]
};

const result = await llm.ChatCompletion(params);
```

### Environment-Based Provider Selection

Use environment variables or configuration to select the provider:

```typescript
import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import dotenv from 'dotenv';

// Required to stop tree-shaking of the OpenAILLM - since there's no static code path to this class when using Class Factory pattern, you need this to prevent some bundlers from tree-shaking optimization on this class.
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
LoadOpenAILLM(); 

dotenv.config();

const providerName = process.env.AI_PROVIDER || 'OpenAILLM';
const apiKey = process.env.AI_API_KEY;

const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
  BaseLLM, 
  providerName,
  apiKey
);
```

### Direct Provider Usage

When necessary, you can directly use a specific AI provider:

```typescript
import { OpenAILLM } from '@memberjunction/ai-openai';

// Note with direct use of the OpenAILLM class no need for the LoadOpenAILLM call to prevent tree shaking since there is a static code path to the class
// Create an instance with your API key
const llm = new OpenAILLM('your-openai-api-key');

// Use the provider-specific implementation
const result = await llm.ChatCompletion({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is AI abstraction?' }
  ]
});

console.log(result.data.choices[0].message.content);
```

## Core Abstractions

### Base Models

- `BaseModel`: The foundational abstract class for all AI models
- `BaseLLM`: Abstract class for text generation models like GPT, Claude, etc.
- `BaseEmbedding`: Abstract class for text embedding models
- `BaseDiffusion`: Abstract class for image generation models
- `BaseAudio`: Abstract class for speech and audio processing models
- `BaseVideo`: Abstract class for video generation models

## LLM Operations

### Standard Chat Completion

For interactive conversations with AI models:

```typescript
import { ChatParams, ChatResult, ChatMessage } from '@memberjunction/ai';

const params: ChatParams = {
  model: 'your-model-name',
  messages: [
    { role: 'system', content: 'System instruction' },
    { role: 'user', content: 'User message' },
    { role: 'assistant', content: 'Assistant response' }
  ],
  temperature: 0.7,
  maxOutputTokens: 1000
};

const result: ChatResult = await llm.ChatCompletion(params);
```

### Streaming Chat Completion

For real-time streaming of responses:

```typescript
import { ChatParams, ChatResult, ChatMessage, StreamingChatCallbacks } from '@memberjunction/ai';

// Define the streaming callbacks
const callbacks: StreamingChatCallbacks = {
  // Called when a new chunk arrives
  OnContent: (chunk: string, isComplete: boolean) => {
    if (isComplete) {
      console.log("\nStream completed!");
    } else {
      // Print chunks as they arrive (or add to UI)
      process.stdout.write(chunk);
    }
  },
  
  // Called when the complete response is available
  OnComplete: (finalResponse: ChatResult) => {
    console.log("\nFull response:", finalResponse.data.choices[0].message.content);
    console.log("Total tokens:", finalResponse.data.usage.totalTokens);
  },
  
  // Called if an error occurs during streaming
  OnError: (error: any) => {
    console.error("Streaming error:", error);
  }
};

// Create streaming chat parameters
const params: ChatParams = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Write a short poem about AI, one line at a time.' }
  ],
  streaming: true, // Enable streaming
  streamingCallbacks: callbacks
};

// The ChatCompletion API remains the same, but will stream results
await llm.ChatCompletion(params);
```

### Text Summarization

For summarizing longer text content:

```typescript
import { SummarizeParams, SummarizeResult } from '@memberjunction/ai';

const params: SummarizeParams = {
  text: 'Long text to summarize...',
  model: 'your-model-name',
  maxWords: 100
};

const result: SummarizeResult = await llm.SummarizeText(params);
console.log(result.summary);
```

### Text Classification

For categorizing text into predefined classes:

```typescript
import { ClassifyParams, ClassifyResult } from '@memberjunction/ai';

const params: ClassifyParams = {
  text: 'Text to classify',
  model: 'your-model-name',
  classes: ['Category1', 'Category2', 'Category3']
};

const result: ClassifyResult = await llm.ClassifyText(params);
console.log(result.classification);
```

## Response Format Control

Control the format of AI responses:

```typescript
const params: ChatParams = {
  // ...other parameters
  responseFormat: 'JSON',  // 'Any', 'Text', 'Markdown', 'JSON', or 'ModelSpecific'
};

// For provider-specific response formats
const customFormatParams: ChatParams = {
  // ...other parameters
  responseFormat: 'ModelSpecific',
  modelSpecificResponseFormat: {
    // Provider-specific format options
  }
};
```

## Error Handling

All operations return a standardized result format with error information:

```typescript
const result = await llm.ChatCompletion(params);

if (!result.success) {
  console.error('Error:', result.errorMessage);
  console.error('Status Text:', result.statusText);
  console.error('Exception:', result.exception);
  console.error('Time Elapsed:', result.timeElapsed, 'ms');
} else {
  console.log('Success! Response time:', result.timeElapsed, 'ms');
}
```

## Token Usage Tracking

Monitor token usage consistently across different providers:

```typescript
const result = await llm.ChatCompletion(params);
console.log('Prompt Tokens:', result.data.usage.promptTokens);
console.log('Completion Tokens:', result.data.usage.completionTokens);
console.log('Total Tokens:', result.data.usage.totalTokens);
```

## Available Providers

The following provider packages implement the MemberJunction AI abstractions:

- [`@memberjunction/ai-openai`](../Providers/OpenAI/readme.md) - OpenAI (GPT models)
- [`@memberjunction/ai-anthropic`](../Providers/Anthropic/readme.md) - Anthropic (Claude models)
- [`@memberjunction/ai-mistral`](../Providers/Mistral/readme.md) - Mistral AI
- [`@memberjunction/ai-gemini`](../Providers/Gemini/readme.md) - Google's Gemini models
- [`@memberjunction/ai-vertex`](../Providers/Vertex/readme.md) - Google Vertex AI (various models including PaLM)
- [`@memberjunction/ai-bedrock`](../Providers/Bedrock/readme.md) - Amazon Bedrock (Claude, Llama, Titan, etc.)
- [`@memberjunction/ai-groq`](../Providers/Groq/readme.md) - Groq's optimized inference (https://www.groq.com)
- [`@memberjunction/ai-bettybot`](../Providers/BettyBot/readme.md) - Betty AI (https://www.meetbetty.ai)
- [`@memberjunction/ai-azure`](../Providers/Azure/readme.md) - Azure AI Foundry with support for OpenAI, Mistral, Phi, more
- [`@memberjunction/ai-cerebras`](../Providers/Cerebras/readme.md) - Cerebras models
- [`@memberjunction/ai-elevenlabs`](../Providers/ElevenLabs/readme.md) - ElevenLabs audio models
- [`@memberjunction/ai-heygen`](../Providers/HeyGen/readme.md) - HeyGen video models

Note: Each provider implements the features they support. See individual provider documentation for specific capabilities.

## Implementation Details

### Streaming Architecture

The BaseLLM class uses a template method pattern for handling streaming:

1. The main `ChatCompletion` method checks if streaming is requested and supported
2. If streaming is enabled, it calls the template method `handleStreamingChatCompletion`
3. Provider implementations supply three key methods:
   - `createStreamingRequest`: Creates the provider-specific streaming request
   - `processStreamingChunk`: Processes individual chunks from the stream
   - `finalizeStreamingResponse`: Creates the final response object

This architecture allows for a clean separation between common streaming logic and provider-specific implementations.

## Dependencies

- `@memberjunction/global` - MemberJunction global utilities including class factory
- `rxjs` - Reactive extensions for JavaScript

## License
See the [repository root](../../../LICENSE) for license information.
