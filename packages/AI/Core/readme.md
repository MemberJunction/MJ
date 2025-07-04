# @memberjunction/ai

The MemberJunction AI Core package provides a comprehensive abstraction layer for working with various AI models (LLMs, Video and Audio Generation, Text-To-Speech (TTS), embedding models, etc.) in a provider-agnostic way, allowing your application to easily switch between different AI providers without refactoring your code.

## Overview

This package serves as the foundation for all AI capabilities in the MemberJunction ecosystem. It defines abstract base classes and interfaces that are implemented by provider-specific packages, enabling seamless integration with various AI services while maintaining a consistent API.

### Type Organization Update (2025)

As part of a major type reorganization to improve code organization and reduce circular dependencies:
- **Core Package** now contains:
  - Base AI model abstractions (`BaseModel`, `BaseLLM`, `BaseEmbeddings`, etc.)
  - Core AI result types (`BaseResult`, `ChatResult`, `ModelUsage`, etc.)
  - Common interfaces and types used across all AI packages
- **Agent-specific types** have moved to `@memberjunction/ai-agents`
- **Prompt-specific types** remain in `@memberjunction/ai-prompts`
- **Engine-specific types** (like agent type definitions) are in `@memberjunction/aiengine`

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
- **Base Classes**: Abstract base classes for different AI model types (LLMs, embedding models, audio, video, etc.)
- **Standard Interfaces**: Consistent interfaces for common AI operations like chat, summarization, and classification
- **Streaming Support**: Stream responses from supported LLM providers for real-time UIs
- **Parallel Processing**: Execute multiple chat completions in parallel with progress callbacks
- **Multi-modal Support**: Handle text, images, videos, audio, and files in chat messages
- **Type Definitions**: Comprehensive TypeScript type definitions for all AI operations
- **Error Handling**: Standardized error handling and reporting across all providers
- **Token Usage Tracking**: Consistent tracking of token usage across providers
- **Response Format Control**: Specify output formats (Text, Markdown, JSON, or provider-specific)
- **Additional Settings**: Provider-specific configuration through a flexible settings system

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

#### BaseModel
The foundational abstract class for all AI models. Provides:
- Protected API key management
- Base parameter and result types
- Model usage tracking

#### BaseLLM
Abstract class for text generation models. Features:
- Standard and streaming chat completions
- Parallel chat completions with callbacks
- Text summarization
- Text classification
- Additional provider-specific settings management
- Response format control (Any, Text, Markdown, JSON, ModelSpecific)
- Support for reasoning budget tokens (for reasoning models)
- Advanced sampling parameters (see [Parameter Reference](#parameter-reference) below)

#### BaseEmbeddings
Abstract class for text embedding models. Provides:
- Single text embedding generation
- Batch text embedding generation
- Model listing capabilities
- Additional settings management

#### BaseAudioGenerator  
Abstract class for audio processing models. Supports:
- Text-to-speech generation
- Speech-to-text transcription
- Voice listing and management
- Model and pronunciation dictionary queries
- Configurable voice settings (stability, similarity, speed, etc.)

#### BaseVideoGenerator
Abstract class for video generation models. Enables:
- Avatar-based video creation
- Video translation capabilities
- Avatar management and listing

#### BaseDiffusion
Abstract class for image generation models (placeholder for future implementation)

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

### Cancellable Operations with AbortSignal

The MemberJunction AI Core package supports cancellation of long-running operations using the standard JavaScript `AbortSignal` pattern. This provides a clean, standardized way to cancel AI operations when needed.

#### Understanding the AbortSignal Pattern

The `AbortSignal` pattern uses a **separation of concerns** approach:

- **Controller (Caller)**: Creates the `AbortController` and decides **when** to cancel
- **Worker (AI Operations)**: Receives the `AbortSignal` token and handles **how** to cancel

#### Basic Cancellation Example

```typescript
import { ChatParams, BaseLLM } from '@memberjunction/ai';

async function cancellableAIChat() {
  // Create the cancellation controller (the "boss")
  const controller = new AbortController();
  
  // Set up automatic timeout cancellation
  const timeout = setTimeout(() => {
    controller.abort(); // Cancel after 30 seconds
  }, 30000);

  try {
    const params: ChatParams = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Write a very long story...' }
      ],
      cancellationToken: controller.signal // Pass the signal token
    };

    const result = await llm.ChatCompletion(params);
    clearTimeout(timeout); // Clear timeout if completed successfully
    return result;
    
  } catch (error) {
    if (error.message.includes('cancelled')) {
      console.log('Operation was cancelled');
    } else {
      console.error('Operation failed:', error);
    }
  }
}
```

#### User-Initiated Cancellation

Perfect for UI applications where users can cancel operations:

```typescript
class AIInterface {
  private currentController: AbortController | null = null;

  async startAIConversation() {
    // Create new controller for this conversation
    this.currentController = new AbortController();
    
    try {
      const result = await llm.ChatCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Generate a detailed report...' }],
        cancellationToken: this.currentController.signal
      });
      
      console.log('AI Response:', result.data.choices[0].message.content);
    } catch (error) {
      if (error.message.includes('cancelled')) {
        console.log('User cancelled the conversation');
      }
    } finally {
      this.currentController = null;
    }
  }

  // Called when user clicks "Cancel" button
  cancelConversation() {
    if (this.currentController) {
      this.currentController.abort(); // Instant cancellation
    }
  }
}
```

#### Multiple Cancellation Sources

One signal can be cancelled from multiple sources:

```typescript
async function smartAIExecution() {
  const controller = new AbortController();
  const signal = controller.signal;

  // 1. User cancel button
  document.getElementById('cancel')?.addEventListener('click', () => {
    controller.abort(); // User cancellation
  });

  // 2. Resource limit cancellation  
  if (await checkMemoryUsage() > MAX_MEMORY) {
    controller.abort(); // Resource limit cancellation
  }

  // 3. Window unload cancellation
  window.addEventListener('beforeunload', () => {
    controller.abort(); // Page closing cancellation
  });

  // 4. Timeout cancellation
  setTimeout(() => controller.abort(), 60000); // 1 minute timeout

  try {
    const result = await llm.ChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Complex analysis task...' }],
      cancellationToken: signal // One token, many cancel sources!
    });
    
    return result;
  } catch (error) {
    // The AI operation doesn't know WHY it was cancelled - just that it should stop
    console.log('AI operation was cancelled:', error.message);
  }
}
```

#### How It Works Internally

The AI Core package implements cancellation at multiple levels:

1. **BaseLLM Level**: Checks cancellation token before and during operations
2. **Provider Level**: Native cancellation support where available (e.g., fetch API)
3. **Fallback Pattern**: Promise.race for providers without native cancellation

```typescript
// Internal implementation example (simplified)
async ChatCompletion(params: ChatParams): Promise<ChatResult> {
  // Check if already cancelled before starting
  if (params.cancellationToken?.aborted) {
    throw new Error('Operation was cancelled');
  }

  // For providers with native cancellation support
  if (this.hasNativeCancellation) {
    return await this.callProviderAPI({
      ...params,
      signal: params.cancellationToken // Native fetch cancellation
    });
  }

  // Fallback: Promise.race pattern for other providers
  const promises = [
    this.callProviderAPI(params) // The actual AI call
  ];

  if (params.cancellationToken) {
    promises.push(
      new Promise<never>((_, reject) => {
        params.cancellationToken!.addEventListener('abort', () => {
          reject(new Error('Operation was cancelled'));
        });
      })
    );
  }

  return await Promise.race(promises);
}
```

#### Key Benefits

1. **🎯 Responsive UX**: Users can cancel long-running AI operations instantly
2. **💾 Resource Management**: Prevent runaway operations from consuming resources  
3. **🔄 Composable**: Easy to combine user actions, timeouts, and resource limits
4. **📱 Standard API**: Uses native JavaScript AbortSignal - no custom patterns
5. **🧹 Clean Cleanup**: Automatic resource cleanup when operations are cancelled

The cancellation token pattern provides a **robust, standardized way** to make AI operations responsive and resource-efficient!

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

### Enhanced Error Information (v2.47.0+)

The MemberJunction AI Core package now provides rich, structured error information to enable intelligent retry logic and provider failover. All operations return results extending `BaseResult` which now includes detailed error information.

#### Basic Error Handling

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

#### Advanced Error Handling with Error Info

```typescript
const result = await llm.ChatCompletion(params);

if (!result.success && result.errorInfo) {
  const { errorInfo } = result;
  
  console.log(`Error Type: ${errorInfo.errorType}`);
  console.log(`HTTP Status: ${errorInfo.httpStatusCode}`);
  console.log(`Severity: ${errorInfo.severity}`);
  console.log(`Can Failover: ${errorInfo.canFailover}`);
  
  // Handle based on error type
  switch (errorInfo.errorType) {
    case 'RateLimit':
      // Wait and retry or switch providers
      const delay = errorInfo.suggestedRetryDelaySeconds || 30;
      console.log(`Rate limited. Retry after ${delay} seconds`);
      break;
      
    case 'Authentication':
      // Fatal error - check API keys
      console.error('Authentication failed. Check API key configuration.');
      break;
      
    case 'ServiceUnavailable':
      // Try another provider
      if (errorInfo.canFailover) {
        console.log('Service unavailable. Switching to backup provider...');
      }
      break;
  }
}
```

### Error Types

The package categorizes errors into the following types:

- **`RateLimit`**: Rate limit exceeded (HTTP 429). Suggests switching providers or waiting
- **`Authentication`**: Auth failure (HTTP 401/403). Usually indicates invalid API key
- **`ServiceUnavailable`**: Service down (HTTP 503). Provider temporarily unavailable
- **`InternalServerError`**: Server error (HTTP 500). Problem on provider's side
- **`NetworkError`**: Connection issues, timeouts, DNS failures
- **`InvalidRequest`**: Bad request format (HTTP 400). Problem with request parameters
- **`ModelError`**: Model-specific issues (not found, overloaded)
- **`Unknown`**: Unclassified errors

### Error Severity Levels

Errors are classified by severity to guide retry strategies:

- **`Transient`**: Temporary error that may resolve with immediate retry
- **`Retriable`**: Error requiring waiting or provider switching before retry
- **`Fatal`**: Permanent error that won't be resolved by retrying

### Error Analysis Utility

The package includes an `ErrorAnalyzer` utility for providers to use:

```typescript
import { ErrorAnalyzer } from '@memberjunction/ai';

try {
  // Provider API call
} catch (error) {
  const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI');
  // errorInfo now contains structured error details
}
```

### Implementing Intelligent Failover

```typescript
import { BaseLLM, ChatParams, AIErrorInfo } from '@memberjunction/ai';

class ResilientAIClient {
  private providers: Array<{ name: string; llm: BaseLLM }> = [];
  
  async chatWithFailover(params: ChatParams): Promise<ChatResult> {
    for (const provider of this.providers) {
      try {
        const result = await provider.llm.ChatCompletion(params);
        
        if (result.success) {
          return result;
        }
        
        // Check if we should try another provider
        if (result.errorInfo?.canFailover) {
          console.log(`Provider ${provider.name} failed. Trying next...`);
          continue;
        } else {
          // Fatal error - don't try other providers
          return result;
        }
        
      } catch (error) {
        console.error(`Provider ${provider.name} threw exception:`, error);
      }
    }
    
    throw new Error('All providers failed');
  }
}
```

### Retry with Backoff

```typescript
async function retryWithBackoff(
  operation: () => Promise<ChatResult>,
  maxRetries: number = 3
): Promise<ChatResult> {
  let lastResult: ChatResult;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await operation();
    
    if (lastResult.success) {
      return lastResult;
    }
    
    const errorInfo = lastResult.errorInfo;
    if (!errorInfo || errorInfo.severity === 'Fatal') {
      // Don't retry fatal errors
      return lastResult;
    }
    
    // Calculate delay
    const delay = errorInfo.suggestedRetryDelaySeconds ||
                  Math.pow(2, attempt - 1) * 1000; // Exponential backoff
    
    console.log(`Retry ${attempt}/${maxRetries} after ${delay}s...`);
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }
  
  return lastResult!;
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
- [`@memberjunction/ai-vertex`](../Providers/Vertex/readme.md) - Google Vertex AI (various models including Gemini, others)
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

## Import Examples

```typescript
// Import base model classes
import { BaseLLM, BaseEmbeddings, BaseAudioGenerator } from '@memberjunction/ai';

// Import result types
import { ChatResult, ModelUsage, BaseResult } from '@memberjunction/ai';

// Import parameter types
import { ChatParams, ChatMessage, StreamingChatCallbacks } from '@memberjunction/ai';

// Import utility classes
import { AIAPIKeys, GetAIAPIKey } from '@memberjunction/ai';
```

## Dependencies

- `@memberjunction/global` - MemberJunction global utilities including class factory
- `rxjs` - Reactive extensions for JavaScript

## Type Exports

The Core package exports fundamental types used throughout the AI ecosystem:

### Base Model Classes
- `BaseModel` - Foundation class for all AI models
- `BaseLLM` - Base class for language models
- `BaseEmbeddings` - Base class for embedding models
- `BaseAudioGenerator` - Base class for audio models
- `BaseVideoGenerator` - Base class for video models
- `BaseDiffusion` - Base class for image generation models

### Core Result Types
- `BaseResult` - Base result structure for all AI operations
- `ChatResult` - Result from chat completions
- `ModelUsage` - Token/resource usage tracking
- `SummarizeResult` - Text summarization results
- `ClassifyResult` - Text classification results
- `EmbeddingResult` - Embedding generation results

### Common Interfaces
- `ChatMessage` - Message structure for conversations
- `ChatParams` - Parameters for chat operations
- `StreamingChatCallbacks` - Callbacks for streaming responses
- `ParallelChatCompletionsCallbacks` - Callbacks for parallel execution

## API Reference

### Result Types

#### BaseResult
All operations return results extending `BaseResult`:
```typescript
class BaseResult {
    success: boolean;
    startTime: Date;
    endTime: Date;
    errorMessage: string;
    exception: any;
    errorInfo?: AIErrorInfo; // Enhanced error details (v2.47.0+)
    timeElapsed: number; // Computed getter
}

// Enhanced error information structure
interface AIErrorInfo {
    httpStatusCode?: number;              // HTTP status code (429, 500, etc.)
    errorType: AIErrorType;               // Categorized error type
    severity: ErrorSeverity;              // Transient, Retriable, or Fatal
    suggestedRetryDelaySeconds?: number;  // Provider-suggested retry delay
    canFailover: boolean;                 // Whether switching providers might help
    providerErrorCode?: string;           // Original provider error code
    context?: Record<string, any>;        // Additional error context
}
```

#### ChatResult
Extends `BaseResult` with chat-specific data:
```typescript
class ChatResult extends BaseResult {
    data: {
        choices: Array<{
            message: ChatCompletionMessage;
            index: number;
            finishReason?: string;
        }>;
        usage: ModelUsage;
    };
    statusText?: string;
}
```

### Chat Message Types

#### ChatMessage
Supports multi-modal content:
```typescript
type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string | ChatMessageContentBlock[];
}

type ChatMessageContentBlock = {
    type: 'text' | 'image_url' | 'video_url' | 'audio_url' | 'file_url';
    content: string; // URL or base64 encoded content
}
```

### Streaming Callbacks

```typescript
interface StreamingChatCallbacks {
    OnContent?: (chunk: string, isComplete: boolean) => void;
    OnComplete?: (finalResponse: ChatResult) => void;
    OnError?: (error: any) => void;
}

interface ParallelChatCompletionsCallbacks {
    OnCompletion?: (response: ChatResult, index: number) => void;
    OnError?: (error: any, index: number) => void;
    OnAllCompleted?: (responses: ChatResult[]) => void;
}
```

## Configuration

### API Key Management

The package includes a flexible API key management system through the `AIAPIKeys` class:

```typescript
import { GetAIAPIKey } from '@memberjunction/ai';

// Get API key for a specific provider
const apiKey = GetAIAPIKey('OpenAI');
```

By default, it looks for environment variables with the pattern: `AI_VENDOR_API_KEY__[PROVIDER_NAME]`

Example:
```bash
AI_VENDOR_API_KEY__OPENAI=your-api-key
AI_VENDOR_API_KEY__ANTHROPIC=your-api-key
AI_VENDOR_API_KEY__MISTRAL=your-api-key
```

#### Custom API Key Management

You can extend the `AIAPIKeys` class to implement custom API key retrieval logic:

```typescript
import { AIAPIKeys, RegisterClass } from '@memberjunction/ai';

@RegisterClass(AIAPIKeys, 'CustomAPIKeys', 2) // Priority 2 overrides default
export class CustomAPIKeys extends AIAPIKeys {
  public GetAPIKey(AIDriverName: string): string {
    // Your custom logic here
    // Could retrieve from database, vault, etc.
    return super.GetAPIKey(AIDriverName); // Fallback to default
  }
}
```

#### Runtime API Key Override

As of v2.50.0, you can provide API keys at runtime without modifying environment variables or global configuration. This is useful for multi-tenant applications or testing with different API keys.

##### Direct Constructor Usage

When creating AI model instances directly, pass the API key to the constructor:

```typescript
import { OpenAILLM } from '@memberjunction/ai-openai';

const llm = new OpenAILLM('sk-your-runtime-api-key');
```

##### With Class Factory Pattern

When using the class factory pattern, the API key is passed as the second parameter:

```typescript
import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
  BaseLLM,
  'OpenAILLM',
  'sk-your-runtime-api-key' // Runtime API key
);
```

##### API Key Type Definition

The package exports an `AIAPIKey` interface for structured API key configuration:

```typescript
export interface AIAPIKey {
  /**
   * The driver class name (e.g., 'OpenAILLM', 'AnthropicLLM', 'GroqLLM')
   * This should match the exact driver class name used by the AI provider
   */
  driverClass: string;
  
  /**
   * The API key value for the specified driver class
   */
  apiKey: string;
}
```

### Provider-Specific Settings

Many providers support additional configuration beyond the API key:

```typescript
const llm = new SomeLLM('api-key');
llm.SetAdditionalSettings({
    baseURL: 'https://custom-endpoint.com',
    organization: 'my-org',
    // Provider-specific settings
});
```

## Integration with MemberJunction

While this package can be used standalone, it integrates seamlessly with the MemberJunction framework:

- Uses `@memberjunction/global` for class factory pattern and registration
- Compatible with MemberJunction's metadata system
- Can leverage MemberJunction's configuration management when available

## Dependencies

- `@memberjunction/global` (^2.43.0) - MemberJunction global utilities including class factory
- `rxjs` (^7.8.1) - Reactive extensions for JavaScript (used in streaming implementations)
- `dotenv` (^16.4.1) - Environment variable management
- `typeorm` (^0.3.20) - ORM functionality (optional, only if using with full MemberJunction)

## Development

### Building

```bash
cd packages/AI/Core
npm run build
```

### TypeScript Configuration

The package is configured with TypeScript strict mode and targets ES2022. See `tsconfig.json` for full compiler options.

## Best Practices

1. **Always use the class factory pattern** for maximum flexibility
2. **Handle errors gracefully** - check `result.success` before accessing data
3. **Monitor token usage** to manage costs and stay within limits
4. **Use streaming for long responses** to improve user experience
5. **Leverage parallel completions** for comparison or reliability
6. **Cache API keys** using the built-in caching mechanism
7. **Specify response formats** when you need structured output

## Troubleshooting

### Common Issues

1. **"API key cannot be empty" error**
   - Ensure you're passing a valid API key to the constructor
   - Check environment variables are properly set

2. **Provider not found when using class factory**
   - Make sure to import and call the provider's Load function
   - Verify the provider class name matches exactly

3. **Streaming not working**
   - Check if the provider supports streaming (`llm.SupportsStreaming`)
   - Ensure streaming callbacks are properly defined

4. **Type errors with content blocks**
   - Use the provided type guards and interfaces
   - Ensure content format matches the expected structure

## Parameter Reference

### ChatParams Parameters

The `ChatParams` class supports the following parameters for controlling LLM behavior:

#### Core Parameters (from BaseParams)
- `model` (required): The model name to use
- `temperature`: Controls randomness (0.0 = deterministic, 2.0 = very random)
- `maxOutputTokens`: Maximum tokens to generate in response
- `responseFormat`: Output format - 'Any', 'Text', 'Markdown', 'JSON', or 'ModelSpecific'
- `seed`: Random seed for reproducible outputs (provider-dependent)
- `stopSequences`: Array of sequences that will stop generation

#### Sampling Parameters
- `topP`: Top-p (nucleus) sampling (0-1). Alternative to temperature, considers cumulative probability
- `topK`: Top-k sampling. Limits to top K most likely tokens (provider-dependent)
- `minP`: Minimum probability threshold (0-1). Filters out low-probability tokens

#### Repetition Control
- `frequencyPenalty`: Reduce token repetition based on frequency (-2.0 to 2.0)
- `presencePenalty`: Encourage topic diversity (-2.0 to 2.0)

#### Advanced Features
- `streaming`: Enable streaming responses
- `includeLogProbs`: Request log probabilities for tokens
- `topLogProbs`: Number of top log probabilities to return (2-20)
- `effortLevel`: Model-specific effort/reasoning level
- `reasoningBudgetTokens`: Token budget for reasoning models
- `enableCaching`: Enable provider caching features
- `cancellationToken`: AbortSignal for cancelling operations

### Provider Support

Not all providers support all parameters. The framework will:
- Pass supported parameters to the provider
- Log warnings for unsupported parameters (visible in console)
- Continue execution without failing

Common support patterns:
- **OpenAI**: Supports most parameters except topK, minP
- **Anthropic**: Supports topP, topK, but not frequency/presence penalties
- **Google/Gemini**: Supports topP, topK, temperature
- **Others**: Vary by provider - check console warnings

## License

See the [repository root](../../../LICENSE) for license information.
