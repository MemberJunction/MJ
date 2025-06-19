# @memberjunction/ai-azure

Azure AI Provider integration for MemberJunction, providing access to Microsoft Azure AI services including Azure OpenAI models, embeddings, and the Phi-4 reasoning model.

## Overview

This package implements the MemberJunction AI provider interfaces for Azure AI services, enabling seamless integration of Azure's language models and embedding services into your MemberJunction applications. It supports both standard Azure OpenAI deployments and Azure AI Studio models.

## Features

- **Chat Completions**: Full support for Azure-hosted language models including GPT-4, GPT-3.5-Turbo, and Phi-4
- **Streaming Support**: Real-time streaming responses for enhanced user experience
- **Text Embeddings**: Generate vector embeddings for semantic search and similarity matching
- **Dual Authentication**: Support for both API key and Azure Active Directory (Entra ID) authentication
- **Text Processing**: Built-in text summarization and classification capabilities
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Factory Pattern**: Seamless integration with MemberJunction's AI factory system

## Installation

```bash
npm install @memberjunction/ai-azure
```

## Configuration

### Prerequisites

1. An Azure subscription with Azure AI or Azure OpenAI service deployed
2. Either:
   - An API key for your Azure AI resource, or
   - Azure AD credentials configured for your application
3. The endpoint URL for your Azure AI resource

### Authentication Methods

#### API Key Authentication
```typescript
import { LLMFactory } from '@memberjunction/ai';
import { LoadAzureLLM } from '@memberjunction/ai-azure';

// Register the Azure provider
LoadAzureLLM();

// Create instance with API key
const azureLLM = LLMFactory.Create("AzureLLM", "your-api-key");

// Configure endpoint
azureLLM.SetAdditionalSettings({ 
    endpoint: "https://your-resource.openai.azure.com/"
});
```

#### Azure AD Authentication
```typescript
import { LLMFactory } from '@memberjunction/ai';
import { LoadAzureLLM } from '@memberjunction/ai-azure';

// Register the Azure provider
LoadAzureLLM();

// Create instance (empty string for API key when using Azure AD)
const azureLLM = LLMFactory.Create("AzureLLM", "");

// Configure for Azure AD
azureLLM.SetAdditionalSettings({ 
    endpoint: "https://your-resource.openai.azure.com/",
    useAzureAD: true
});
```

## Usage Examples

### Basic Chat Completion

```typescript
import { LLMFactory } from '@memberjunction/ai';
import { LoadAzureLLM } from '@memberjunction/ai-azure';

// Setup
LoadAzureLLM();
const azureLLM = LLMFactory.Create("AzureLLM", "your-api-key");
azureLLM.SetAdditionalSettings({ 
    endpoint: "https://your-resource.openai.azure.com/"
});

// Simple chat completion
const result = await azureLLM.ChatCompletion({
    model: "gpt-4", // or "gpt-35-turbo", "phi-4", etc.
    messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Explain the theory of relativity in simple terms." }
    ],
    maxOutputTokens: 500,
    temperature: 0.7
});

if (result.success) {
    console.log(result.data.choices[0].message.content);
    console.log(`Tokens used: ${result.data.usage.totalTokens}`);
}

// Clean up when done
azureLLM.ClearAdditionalSettings();
```

### Streaming Responses

```typescript
const streamResult = await azureLLM.ChatCompletion({
    model: "gpt-4",
    messages: [
        { role: "user", content: "Write a detailed story about space exploration." }
    ],
    streaming: true,
    streamingCallbacks: {
        OnContent: (content, isComplete) => {
            // Handle each chunk of content as it arrives
            process.stdout.write(content);
        },
        OnComplete: (finalResult) => {
            console.log("\n\nStreaming complete!");
            console.log(`Total tokens: ${finalResult.data.usage.totalTokens}`);
        },
        OnError: (error) => {
            console.error("Streaming error:", error);
        }
    }
});
```

### JSON Response Format

```typescript
const jsonResult = await azureLLM.ChatCompletion({
    model: "gpt-4",
    messages: [
        { 
            role: "user", 
            content: "List 3 benefits of exercise as a JSON array with 'benefit' and 'description' fields." 
        }
    ],
    responseFormat: "JSON"
});

if (jsonResult.success) {
    const benefits = JSON.parse(jsonResult.data.choices[0].message.content);
    console.log(benefits);
}
```

### Text Summarization

```typescript
const summary = await azureLLM.SummarizeText({
    model: "gpt-35-turbo",
    messages: [
        { 
            role: "user", 
            content: "[Your long text to summarize here...]" 
        }
    ],
    maxOutputTokens: 150
});

if (summary.success) {
    console.log("Summary:", summary.summary);
}
```

### Text Classification

```typescript
const classification = await azureLLM.ClassifyText({
    model: "gpt-35-turbo",
    messages: [
        { 
            role: "user", 
            content: "I absolutely loved this product! Best purchase ever!" 
        }
    ]
});

if (classification.success) {
    console.log("Category:", classification.tags[0].name);
    console.log("Confidence:", classification.tags[0].confidence);
}
```

### Embeddings Generation

```typescript
import { EmbeddingModelFactory } from '@memberjunction/ai';
import { LoadAzureEmbedding } from '@memberjunction/ai-azure';

// Setup
LoadAzureEmbedding();
const embedder = EmbeddingModelFactory.Create("AzureEmbedding", "your-api-key");
embedder.SetAdditionalSettings({ 
    endpoint: "https://your-resource.openai.azure.com/"
});

// Single text embedding
const embedding = await embedder.EmbedText({
    model: "text-embedding-ada-002",
    text: "The quick brown fox jumps over the lazy dog."
});

console.log(`Embedding dimension: ${embedding.vector.length}`);
console.log(`First 5 values: ${embedding.vector.slice(0, 5)}`);

// Batch embeddings
const batchEmbeddings = await embedder.EmbedTexts({
    model: "text-embedding-ada-002",
    texts: [
        "First document to embed",
        "Second document to embed",
        "Third document to embed"
    ]
});

console.log(`Generated ${batchEmbeddings.vectors.length} embeddings`);

// Clean up
embedder.ClearAdditionalSettings();
```

## API Reference

### AzureLLM Class

#### Constructor
```typescript
constructor(apiKey: string)
```

#### Methods

##### SetAdditionalSettings
```typescript
SetAdditionalSettings(settings: Record<string, any>): void
```
Configures Azure-specific settings including endpoint and authentication method.

##### ClearAdditionalSettings
```typescript
ClearAdditionalSettings(): void
```
Clears all additional settings and resets the client connection.

##### ChatCompletion
```typescript
ChatCompletion(params: ChatParams): Promise<ChatResult>
```
Performs a chat completion request with optional streaming support.

##### SummarizeText
```typescript
SummarizeText(params: SummarizeParams): Promise<SummarizeResult>
```
Summarizes the provided text using the specified model.

##### ClassifyText
```typescript
ClassifyText(params: ClassifyParams): Promise<ClassifyResult>
```
Classifies the provided text into categories.

#### Properties

##### SupportsStreaming
```typescript
get SupportsStreaming(): boolean
```
Returns `true` - Azure AI supports streaming responses.

##### Endpoint
```typescript
get Endpoint(): string
```
Returns the configured Azure endpoint URL.

### AzureEmbedding Class

#### Methods

##### EmbedText
```typescript
EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>
```
Generates an embedding vector for a single text.

##### EmbedTexts
```typescript
EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>
```
Generates embedding vectors for multiple texts in a single request.

##### GetEmbeddingModels
```typescript
GetEmbeddingModels(): Promise<any>
```
Returns available embedding models.

## Configuration Options

### Additional Settings

| Setting | Type | Required | Default | Description |
|---------|------|----------|---------|-------------|
| `endpoint` | `string` | Yes | - | Your Azure AI resource endpoint URL |
| `useAzureAD` | `boolean` | No | `false` | Use Azure AD authentication instead of API key |

## Supported Models

### Language Models
- **GPT-4**: Latest GPT-4 models including GPT-4-Turbo
- **GPT-3.5**: GPT-3.5-Turbo models
- **Phi-4**: Microsoft's efficient reasoning model
- Any other models deployed in your Azure AI resource

### Embedding Models
- **text-embedding-ada-002**: 1536-dimensional embeddings
- Other embedding models available in your Azure deployment

## Dependencies

- `@azure-rest/ai-inference`: Azure AI inference REST client
- `@azure/core-auth`: Azure authentication core
- `@azure/identity`: Azure identity and credential management
- `@memberjunction/ai`: Core MemberJunction AI interfaces
- `@memberjunction/global`: MemberJunction global utilities

## Integration with MemberJunction

This package integrates seamlessly with other MemberJunction AI packages:

- **@memberjunction/ai**: Implements core interfaces like `BaseLLM` and `BaseEmbeddings`
- **@memberjunction/ai-vectors**: Can be used with Azure embeddings for vector storage
- **@memberjunction/ai-prompts**: Compatible with prompt templates and management
- **@memberjunction/ai-agents**: Can power AI agents with Azure models

## Error Handling

```typescript
try {
    const result = await azureLLM.ChatCompletion({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }]
    });
    
    if (!result.success) {
        console.error("Request failed:", result.errorMessage);
    }
} catch (error) {
    console.error("Exception occurred:", error);
}
```

## Best Practices

1. **Always set endpoint**: The endpoint must be configured before making any requests
2. **Clean up settings**: Call `ClearAdditionalSettings()` when switching configurations
3. **Handle errors**: Always check the `success` property of results
4. **Use appropriate models**: Choose models based on your task requirements and cost considerations
5. **Batch requests**: Use `EmbedTexts` for multiple embeddings to reduce API calls
6. **Monitor usage**: Track token usage through the `usage` property in results

## Troubleshooting

### Common Issues

1. **"Azure client not initialized"**: Ensure `SetAdditionalSettings` is called with a valid endpoint
2. **Authentication failures**: Verify your API key or Azure AD credentials
3. **Model not found**: Ensure the model is deployed in your Azure resource
4. **Rate limiting**: Implement retry logic for high-volume applications

## Supported Parameters

The Azure provider supports the following LLM parameters (same as OpenAI since it uses OpenAI models):

**Supported:**
- `temperature` - Controls randomness in the output (0.0-2.0)
- `maxOutputTokens` - Maximum number of tokens to generate
- `topP` - Nucleus sampling threshold (0.0-1.0)
- `frequencyPenalty` - Reduces repetition of token sequences (-2.0 to 2.0)
- `presencePenalty` - Reduces repetition of specific tokens (-2.0 to 2.0)
- `seed` - For deterministic outputs
- `stopSequences` - Array of sequences where the API will stop generating
- `includeLogProbs` - Whether to return log probabilities
- `responseFormat` - Output format (Text, JSON, Markdown, etc.)

**Not Supported:**
- `topK` - Not available in Azure OpenAI API
- `minP` - Not available in Azure OpenAI API

## License

MIT - See LICENSE file in the repository root

## Additional Resources

- [Azure AI Documentation](https://learn.microsoft.com/en-us/azure/ai-services/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/)
- [MemberJunction Documentation](https://docs.memberjunction.com)
- [Azure AI Studio](https://ai.azure.com)