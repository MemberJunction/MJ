# AI Providers

This directory contains all provider-specific implementations of the MemberJunction AI framework interfaces. Each provider package implements the abstract base classes defined in `@memberjunction/ai` to integrate with a specific AI service, translating MJ's common interfaces into provider-specific API calls.

There are 23 packages in total, grouped by category below.

## Packages

### LLM Providers

Direct integrations with large language model APIs.

| Package | npm | Description |
|---------|-----|-------------|
| [Anthropic](./Anthropic/README.md) | `@memberjunction/ai-anthropic` | Wrapper for Anthropic AI Models (Claude) |
| [Gemini](./Gemini/README.md) | `@memberjunction/ai-gemini` | Wrapper for Google Gemini AI Models |
| [Groq](./Groq/README.md) | `@memberjunction/ai-groq` | Wrapper for Groq AI LPU inference engine |
| [Mistral](./Mistral/README.md) | `@memberjunction/ai-mistral` | Wrapper for Mistral AI Models |
| [OpenAI](./OpenAI/README.md) | `@memberjunction/ai-openai` | Wrapper for OpenAI AI Models (GPT-4, etc.) |
| [xAI](./xAI/README.md) | `@memberjunction/ai-xai` | Wrapper for xAI models (Grok) |

### Cloud Platform Providers

Managed AI services offered through major cloud platforms.

| Package | npm | Description |
|---------|-----|-------------|
| [Azure](./Azure/README.md) | `@memberjunction/ai-azure` | Azure AI Provider for MemberJunction |
| [Bedrock](./Bedrock/README.md) | `@memberjunction/ai-bedrock` | Wrapper for Amazon Bedrock AI Models |
| [Vertex](./Vertex/README.md) | `@memberjunction/ai-vertex` | Wrapper for Google Vertex AI Models |

### Inference Routers and Aggregators

Services that provide access to multiple models through a single API.

| Package | npm | Description |
|---------|-----|-------------|
| [Fireworks](./Fireworks/README.md) | `@memberjunction/ai-fireworks` | Wrapper for Fireworks.ai AI Models |
| [OpenRouter](./OpenRouter/README.md) | `@memberjunction/ai-openrouter` | Wrapper for OpenRouter AI inference services |

### Local Inference

Run models locally without external API calls.

| Package | npm | Description |
|---------|-----|-------------|
| [LMStudio](./LMStudio/README.md) | `@memberjunction/ai-lmstudio` | Wrapper for LM Studio AI - Local Inference Engine |
| [Ollama](./Ollama/README.md) | `@memberjunction/ai-ollama` | Wrapper for Ollama - Local Inference |

### Specialized Providers

Providers focused on specific AI capabilities beyond general-purpose LLMs.

| Package | npm | Description |
|---------|-----|-------------|
| [BettyBot](./BettyBot/README.md) | `@memberjunction/ai-betty-bot` | Wrapper for Betty Bot conversational AI |
| [BlackForestLabs](./BlackForestLabs/README.md) | `@memberjunction/ai-blackforestlabs` | Wrapper for Black Forest Labs FLUX Image Generation Models |
| [Cerebras](./Cerebras/README.md) | `@memberjunction/ai-cerebras` | Wrapper for Cerebras AI inference engine |
| [Cohere](./Cohere/README.md) | `@memberjunction/ai-cohere` | Cohere AI Provider - Semantic reranking using Cohere's Rerank API |
| [ElevenLabs](./ElevenLabs/README.md) | `@memberjunction/ai-elevenlabs` | Wrapper for ElevenLabs Audio Generation (TTS) |
| [HeyGen](./HeyGen/README.md) | `@memberjunction/ai-heygen` | Wrapper for HeyGen Video Generation |
| [LocalEmbeddings](./LocalEmbeddings/README.md) | `@memberjunction/ai-local-embeddings` | Local Embeddings Models via Xenova/Transformers |

### Vector Database Providers

| Package | npm | Description |
|---------|-----|-------------|
| [Vectors-Pinecone](./Vectors-Pinecone/README.md) | `@memberjunction/ai-vectors-pinecone` | Pinecone Implementation for AI Vectors |

### Recommendation Providers

| Package | npm | Description |
|---------|-----|-------------|
| [Recommendations-Rex](./Recommendations-Rex/) (no README) | `@memberjunction/ai-recommendations-rex` | Recommendations Provider for rasa.io Rex engine |

### Meta / Utility

| Package | npm | Description |
|---------|-----|-------------|
| [Bundle](./Bundle/README.md) | `@memberjunction/ai-provider-bundle` | Loads all standard AI providers to prevent tree-shaking |
