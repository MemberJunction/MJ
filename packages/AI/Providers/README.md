# MemberJunction AI Providers

This directory contains provider-specific implementations of the MemberJunction AI framework interfaces. Each provider package implements the abstract base classes defined in `@memberjunction/ai` to integrate with various AI services.

## Overview

AI Providers enable the MemberJunction AI framework to work with different AI services while maintaining a consistent API. Each provider translates the common MemberJunction AI interfaces into provider-specific API calls.

## Available Providers

### Large Language Models (LLMs)

- **[@memberjunction/ai-openai](./OpenAI)** - OpenAI GPT models (GPT-4, GPT-3.5-turbo)
  - Chat completions with streaming
  - Text embeddings (ada-002)
  - Text-to-speech (TTS)
  - Function calling support

- **[@memberjunction/ai-anthropic](./Anthropic)** - Anthropic Claude models
  - Claude 3 family (Opus, Sonnet, Haiku)
  - Streaming support
  - Advanced caching capabilities
  - Thinking/reasoning models

- **[@memberjunction/ai-mistral](./Mistral)** - Mistral AI models
  - Open-source and commercial models
  - Embeddings support
  - Multi-lingual capabilities

- **[@memberjunction/ai-groq](./Groq)** - Groq's ultra-fast inference
  - Llama, Mixtral, and other open models
  - Extremely low latency
  - High throughput

- **[@memberjunction/ai-gemini](./Gemini)** - Google Gemini models
  - Gemini Pro and Flash variants
  - Native multimodal support
  - Long context windows

- **[@memberjunction/ai-cerebras](./Cerebras)** - Cerebras fast inference
  - Optimized for speed
  - Compatible with OpenAI API

### Cloud Platform Providers

- **[@memberjunction/ai-azure](./Azure)** - Azure OpenAI Service
  - Enterprise-grade security
  - Regional deployments
  - Azure AD authentication
  - Content filtering

- **[@memberjunction/ai-bedrock](./Bedrock)** - Amazon Bedrock
  - Multiple model families (Claude, Titan, Llama, etc.)
  - AWS integration
  - Private model deployments

- **[@memberjunction/ai-vertex](./Vertex)** - Google Cloud Vertex AI
  - PaLM and Gemini models
  - Google Cloud integration
  - Service account authentication

### Specialized Providers

- **[@memberjunction/ai-betty-bot](./BettyBot)** - BettyBot conversational AI
  - Customer service focused
  - Pre-trained domain models
  - Conversation management

- **[@memberjunction/ai-elevenlabs](./ElevenLabs)** - Text-to-Speech
  - High-quality voice synthesis
  - Multiple voice options
  - Emotional control

- **[@memberjunction/ai-heygen](./HeyGen)** - AI Video Generation
  - Avatar-based videos
  - Script to video conversion
  - Multiple languages

### Vector Database Providers

- **[@memberjunction/ai-vectors-pinecone](./Vectors-Pinecone)** - Pinecone vector database
  - Serverless vector storage
  - Semantic search
  - Metadata filtering
  - High-performance similarity search

### Recommendation Providers

- **[@memberjunction/ai-recommendations-rex](./Recommendations-Rex)** - Rex by rasa.io
  - Content recommendations
  - Personalization engine
  - Interest tracking

## Provider Capabilities

Different providers support different capabilities:

| Provider | Chat | Embeddings | TTS | STT | Images | Video | Streaming |
|----------|------|------------|-----|-----|---------|--------|-----------|
| OpenAI | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Anthropic | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mistral | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Azure | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Bedrock | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Gemini | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Groq | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Vertex | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ |
| ElevenLabs | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| HeyGen | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

*Limited or simulated support

## Adding a New Provider

To add a new AI provider:

1. Create a new package directory following the naming convention: `ai-<provider-name>`

2. Implement the required base classes from `@memberjunction/ai`:
   ```typescript
   import { BaseLLM } from '@memberjunction/ai';
   import { RegisterClass } from '@memberjunction/global';

   @RegisterClass(BaseLLM, 'MyProviderLLM')
   export class MyProviderLLM extends BaseLLM {
       // Implement required methods
   }
   ```

3. Add configuration support:
   ```typescript
   export const MYPROVIDER_API_KEY = process.env.MYPROVIDER_API_KEY;
   ```

4. Include a loader function:
   ```typescript
   export function LoadMyProviderLLM() {
       // This prevents tree-shaking
   }
   ```

5. Create comprehensive documentation in a README.md

6. Add tests for your implementation

7. Update this README to include your provider

## Provider Selection

The MemberJunction AI framework can automatically select providers based on:
- **Capabilities** - What features are needed
- **Performance** - Response time requirements
- **Cost** - Token pricing optimization
- **Availability** - Regional availability
- **Compliance** - Data residency requirements

## Configuration

Most providers require API keys or other credentials:

```typescript
// Environment variables (recommended)
process.env.OPENAI_API_KEY = 'sk-...';
process.env.ANTHROPIC_API_KEY = 'sk-ant-...';

// Or pass directly (not recommended for production)
const llm = new OpenAILLM({
    apiKey: 'sk-...'
});
```

## Best Practices

1. **Error Handling** - Each provider should gracefully handle API errors
2. **Rate Limiting** - Implement appropriate rate limiting and retries
3. **Logging** - Use consistent logging for debugging
4. **Type Safety** - Maintain strong typing throughout
5. **Documentation** - Keep provider documentation up to date

## Testing

Each provider should include:
- Unit tests for basic functionality
- Integration tests with actual APIs (using test keys)
- Mock tests for CI/CD environments
- Performance benchmarks

## License

All provider packages follow the same licensing as the MemberJunction project.