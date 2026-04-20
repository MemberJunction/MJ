[Back to AI Framework Overview](../README.md)

# @memberjunction/ai

Core abstractions and base classes for the MemberJunction AI Framework. This package defines provider-agnostic interfaces for Large Language Models, embeddings, image generation, audio, video, reranking, and more.

**Zero MemberJunction dependencies** beyond `@memberjunction/global` (which itself has no transitive dependencies). This package works in any TypeScript or JavaScript project -- no database, no metadata layer, no MJ runtime required.

## Installation

```bash
npm install @memberjunction/ai
```

## Base Classes

Every AI capability is represented by an abstract base class. Provider packages (OpenAI, Anthropic, Gemini, etc.) extend these to implement the actual API calls.

| Class | Purpose | Key Methods |
|-------|---------|-------------|
| `BaseLLM` | Chat completions (text generation) | `ChatCompletion()`, `ChatCompletions()` (parallel batch) |
| `BaseEmbeddings` | Text-to-vector embeddings | `EmbedText()`, `EmbedTexts()` |
| `BaseImageGenerator` | Image generation, editing, variations | `GenerateImage()`, `EditImage()`, `CreateVariation()` |
| `BaseAudio` | Text-to-speech and speech-to-text | `TextToSpeech()`, `SpeechToText()` |
| `BaseVideo` | Video generation from text/images | `GenerateVideo()` |
| `BaseReranker` | Document reranking for retrieval | `Rerank()` |

All inherit from `BaseModel`, which manages API key storage and provides the `@RegisterClass` integration point.

## Type Definitions

### Chat Types

| Type | Description |
|------|-------------|
| `ChatParams` | Full parameter set for chat requests: messages, model, temperature, topP, topK, streaming, effort level, response format, and more |
| `ChatResult` | Completion result with choices, token usage, cost tracking, and timing |
| `ChatMessage` | Single message with role, content (text or multimodal blocks), and optional metadata |
| `ChatMessageContentBlock` | Multimodal content: text, image (base64/URL), video, audio, or file |
| `StreamingChatCallbacks` | Callbacks for real-time streaming: `OnContent`, `OnComplete`, `OnError` |
| `ParallelChatCompletionsCallbacks` | Callbacks for batch parallel completions |
| `ChatMessageRole` | Enum: `system`, `user`, `assistant` |

### Embedding Types

| Type | Description |
|------|-------------|
| `EmbedTextParams` / `EmbedTextResult` | Single text embedding request and response |
| `EmbedTextsParams` / `EmbedTextsResult` | Batch text embedding request and response |

### Other Types

| Type | Description |
|------|-------------|
| `ImageGenerationParams` / `ImageGenerationResult` | Image generation parameters and results |
| `SummarizeParams` / `SummarizeResult` | Text summarization |
| `ClassifyParams` / `ClassifyResult` | Text classification |
| `RerankParams` / `RerankResult` | Document reranking |
| `ModelUsage` | Token counts and cost tracking (prompt tokens, completion tokens, total cost, currency) |
| `BaseResult` | Common result base with success flag, timing, and error info |

## Utilities

| Export | Description |
|--------|-------------|
| `AIAPIKeys` / `GetAIAPIKey()` | API key resolution from environment variables (`AI_VENDOR_API_KEY__<DRIVER>`) with optional runtime overrides |
| `ErrorAnalyzer` | Classifies provider errors into structured types with severity, retry hints, and failover recommendations |
| `AIErrorInfo` / `AIErrorType` | Structured error types: rate limit, authentication, context length, content filter, etc. |
| `serializeMessageContent()` / `deserializeMessageContent()` | Content block serialization for database storage |
| `parseBase64DataUrl()` / `createBase64DataUrl()` | Base64 data URL utilities |

## Usage Examples

### Chat Completion

```typescript
import { ChatParams, ChatMessageRole } from "@memberjunction/ai";
import { OpenAILLM } from "@memberjunction/ai-openai";

const llm = new OpenAILLM("your-api-key");

const result = await llm.ChatCompletion({
    model: "gpt-4.1",
    messages: [
        { role: ChatMessageRole.system, content: "You are a helpful assistant." },
        { role: ChatMessageRole.user, content: "What is the capital of France?" },
    ],
    temperature: 0.7,
    maxOutputTokens: 500,
});

console.log(result.data.choices[0].message.content);
```

### Streaming

```typescript
await llm.ChatCompletion({
    model: "gpt-4.1",
    messages: [{ role: ChatMessageRole.user, content: "Explain quantum computing." }],
    streaming: true,
    streamingCallbacks: {
        OnContent: (chunk, isComplete) => process.stdout.write(chunk),
        OnComplete: (result) => console.log("\nDone!"),
        OnError: (error) => console.error("Stream error:", error),
    },
});
```

### Parallel Completions

```typescript
const paramSets = [
    { ...base, temperature: 0.3 },
    { ...base, temperature: 0.7 },
    { ...base, temperature: 1.0 },
];

const results = await llm.ChatCompletions(paramSets, {
    OnCompletion: (result, index) => console.log(`Completion ${index} done`),
    OnAllCompleted: (results) => console.log(`All ${results.length} complete`),
});
```

### Multimodal Content

```typescript
const result = await llm.ChatCompletion({
    model: "gpt-4.1",
    messages: [{
        role: ChatMessageRole.user,
        content: [
            { type: "text", content: "What is in this image?" },
            { type: "image_url", content: "data:image/png;base64,..." },
        ],
    }],
});
```

### Text Embeddings

```typescript
import { OpenAIEmbedding } from "@memberjunction/ai-openai";

const embedder = new OpenAIEmbedding("your-api-key");
const result = await embedder.EmbedText({
    model: "text-embedding-3-small",
    text: "Sample text to embed",
});
console.log(`Dimensions: ${result.vector.length}`);
```

### API Key Resolution

```typescript
import { GetAIAPIKey } from "@memberjunction/ai";

// Reads AI_VENDOR_API_KEY__OPENAILLM from environment
const key = GetAIAPIKey("OpenAILLM");

// With runtime override
const key2 = GetAIAPIKey("AnthropicLLM", [
    { driverClass: "AnthropicLLM", apiKey: "sk-ant-..." },
]);
```

## Implementing a New Provider

Extend the base class for the capability you want to support:

```typescript
import { BaseLLM, ChatParams, ChatResult, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, "MyProviderLLM")
export class MyProviderLLM extends BaseLLM {
    // Required: implement non-streaming chat
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        // Your API call here
    }

    // Optional: implement text classification
    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> { /* ... */ }

    // Optional: implement summarization
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> { /* ... */ }

    // Optional: enable streaming by overriding these
    public get SupportsStreaming(): boolean { return true; }
    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<unknown>> { /* ... */ }
    protected processStreamingChunk(chunk: unknown): { content: string } { /* ... */ }
    protected finalizeStreamingResponse(content: string, lastChunk: unknown, usage: unknown): ChatResult { /* ... */ }
}
```

See the [full provider list](../Providers/README.md) for working examples across 25+ implementations.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/global` | Class factory and global utilities (zero transitive dependencies) |
| `dotenv` | Environment variable loading |
| `rxjs` | Reactive extensions (internal use) |

## Related Packages

- **[AI Framework Overview](../README.md)** -- Architecture, provider matrix, and quick start
- **[Providers](../Providers/README.md)** -- All 25+ provider implementations
- **[Prompts](../Prompts/README.md)** -- MJ-integrated prompt template engine
- **[Agents](../Agents/README.md)** -- Agent execution framework
