# MemberJunction Azure AI Provider

This package provides integration with Microsoft Azure AI services for MemberJunction, including support for the Phi-4 reasoning model.

## Features

- Chat completions with Azure AI models, including Phi-4
- Streaming support for real-time responses
- Classification and summarization capabilities
- Embeddings generation
- Support for both API key and Azure AD authentication

## Installation

```bash
npm install @memberjunction/ai-azure
```

## Usage

### Basic Usage with Factory Pattern

```typescript
import { LLMFactory } from '@memberjunction/ai';
import { LoadAzureLLM } from '@memberjunction/ai-azure';

// Ensure Azure provider is registered
LoadAzureLLM();

// Create with factory (API key only at this stage)
const azureLLM = LLMFactory.Create("AzureLLM", "your-api-key");

// Set required additional settings
azureLLM.SetAdditionalSettings({ 
    endpoint: "https://your-azure-endpoint.com",
    useAzureAD: false // Optional, defaults to false
});

// Use for chat completion
const result = await azureLLM.ChatCompletion({
  model: "phi-4",
  messages: [
    { role: "user", content: "Explain quantum computing in simple terms" }
  ]
});

console.log(result.data.choices[0].message.content);

// When you're done or want to use different settings
azureLLM.ClearAdditionalSettings();
```

### Using with Azure AD Authentication

```typescript
import { LLMFactory } from '@memberjunction/ai';
import { LoadAzureLLM } from '@memberjunction/ai-azure';

// Ensure Azure provider is registered
LoadAzureLLM();

// When using Azure AD, the API key can be an empty string
const azureLLM = LLMFactory.Create("AzureLLM", "");

// Set up with Azure AD authentication
azureLLM.SetAdditionalSettings({ 
    endpoint: "https://your-azure-endpoint.com",
    useAzureAD: true
});

// Now use as normal
const result = await azureLLM.ChatCompletion({...});
```

### Streaming Chat Example

```typescript
const result = await azureLLM.ChatCompletion({
  model: "phi-4",
  messages: [
    { role: "user", content: "Write a story about a space adventure" }
  ],
  streaming: true,
  streamingCallbacks: {
    OnContent: (content, isComplete) => {
      // Process each chunk as it arrives
      process.stdout.write(content);
    },
    OnComplete: (finalResult) => {
      console.log("\nStreaming completed!");
    }
  }
});
```

### Creating Embeddings

```typescript
import { EmbeddingModelFactory, Embeddings } from '@memberjunction/ai';
import { LoadAzureEmbedding } from '@memberjunction/ai-azure';

// Ensure Azure embedding provider is registered
LoadAzureEmbedding();

// Create with factory (API key only at this stage)
const azureEmbedding = EmbeddingModelFactory.Create("AzureEmbedding", "your-api-key") as Embeddings;

// Set required additional settings
azureEmbedding.SetAdditionalSettings({ 
    endpoint: "https://your-azure-endpoint.com"
});

// Single text embedding
const singleResult = await azureEmbedding.EmbedText({
  model: "text-embedding-ada-002",
  text: "This is a sample text to embed"
});

console.log("Embedding vector:", singleResult.vector);

// Multiple text embeddings
const batchResult = await azureEmbedding.EmbedTexts({
  model: "text-embedding-ada-002",
  texts: ["First text to embed", "Second text to embed"]
});

console.log("Embedding vectors:", batchResult.vectors);

// Reset settings when done
azureEmbedding.ClearAdditionalSettings();
```

## Supported Models

### Chat Models
- phi-4 (reasoning model)
- Other models available through Azure AI services

### Embedding Models
- text-embedding-ada-002

## Authentication

This provider supports two authentication methods:

1. **API Key**: Standard API key authentication
2. **Azure Active Directory (Entra ID)**: For integrated Azure authentication

## Additional Settings

When using the `SetAdditionalSettings` method, the following options are available:

| Setting     | Type    | Required | Description                           |
|-------------|---------|----------|---------------------------------------|
| endpoint    | string  | Yes      | Azure AI endpoint URL                 |
| useAzureAD  | boolean | No       | Use Azure AD auth instead of API key  |

For more information, refer to the [Azure AI documentation](https://learn.microsoft.com/en-us/azure/ai-services/).