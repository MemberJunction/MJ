# MemberJunction AI Framework

This directory contains the packages that comprise the MemberJunction AI Framework, providing comprehensive artificial intelligence capabilities including large language models (LLMs), embeddings, vector databases, text-to-speech, recommendations, and more.

## Overview

The MemberJunction AI Framework offers a provider-agnostic abstraction layer that allows applications to leverage various AI services through a consistent API. The framework is designed to be modular, extensible, and can be used independently of the broader MemberJunction platform.

## Package Structure

### Core Packages

- **[@memberjunction/ai](./Core)** - Core abstractions and base classes for all AI functionality. Defines interfaces for LLMs, embeddings, audio/video generation, and more. This package can be used **standalone** without any MemberJunction dependencies.

- **[@memberjunction/aiengine](./Engine)** - The main AI orchestration engine that manages model selection, execution, and integration with MemberJunction's metadata system. Provides high-level APIs for common AI operations.

- **[@memberjunction/ai-prompts](./Prompts)** - Advanced prompt execution engine with hierarchical template composition, system placeholders, parallel execution, and intelligent output validation. Features include child-parent template composition patterns, automatic template variable injection, comprehensive execution tracking, and seamless AI agent integration.

- **[@memberjunction/ai-agents](./Agents)** - AI agent framework with hierarchical template composition and metadata-driven agent types. Provides BaseAgent class for agent execution using system prompt templates as composition wrappers for agent prompt templates. Supports dynamic agent type instantiation, sub-agent delegation, and action integration.

### Provider Packages

Located in the [Providers](./Providers) subdirectory:

- **[@memberjunction/ai-openai](./Providers/OpenAI)** - OpenAI integration (GPT-x, o-x, DALL-E, Whisper, embeddings)
- **[@memberjunction/ai-anthropic](./Providers/Anthropic)** - Anthropic Claude integration with streaming and caching support
- **[@memberjunction/ai-mistral](./Providers/Mistral)** - Mistral AI models including embeddings
- **[@memberjunction/ai-azure](./Providers/Azure)** - Azure OpenAI Service integration
- **[@memberjunction/ai-bedrock](./Providers/Bedrock)** - Amazon Bedrock multi-model support
- **[@memberjunction/ai-vertex](./Providers/Vertex)** - Google Vertex AI integration
- **[@memberjunction/ai-gemini](./Providers/Gemini)** - Google Gemini models with multimodal support
- **[@memberjunction/ai-groq](./Providers/Groq)** - Groq's ultra-fast inference platform
- **[@memberjunction/ai-cerebras](./Providers/Cerebras)** - Cerebras high-performance models
- **[@memberjunction/ai-betty-bot](./Providers/BettyBot)** - BettyBot conversational AI platform
- **[@memberjunction/ai-elevenlabs](./Providers/ElevenLabs)** - ElevenLabs text-to-speech
- **[@memberjunction/ai-heygen](./Providers/HeyGen)** - HeyGen AI video generation

### Vector & Embedding Packages

Located in the [Vectors](./Vectors) subdirectory:

- **[@memberjunction/ai-vectors](./Vectors/Core)** - Core vector operations and abstractions
- **[@memberjunction/ai-vectordb](./Vectors/Database)** - Vector database abstraction layer
- **[@memberjunction/ai-vectors-pinecone](./Providers/Vectors-Pinecone)** - Pinecone vector database integration
- **[@memberjunction/ai-vector-sync](./Vectors/Sync)** - Entity vectorization and synchronization
- **[@memberjunction/ai-vector-dupe](./Vectors/Dupe)** - Duplicate detection using vector similarity

### Recommendations

Located in the [Recommendations](./Recommendations) subdirectory:

- **[@memberjunction/ai-recommendations](./Recommendations/Engine)** - Recommendation engine framework
- **[@memberjunction/ai-recommendations-rex](./Providers/Recommendations-Rex)** - Rex (rasa.io) recommendation provider

### Server Components

- **[@memberjunction/a2aserver](./A2AServer)** - Agent-to-Agent (A2A) protocol server for AI agent interoperability
- **[@memberjunction/ai-mcp-server](./MCPServer)** - Model Context Protocol (MCP) server for tool integration

## Key Features

### Provider Agnostic Design
- Switch between AI providers without changing application code
- Support for multiple providers simultaneously
- Fallback and load balancing capabilities
- Provider-specific features accessible when needed

### Comprehensive AI Capabilities
- **Chat Completions** - Conversational AI with streaming support
- **Embeddings** - Text embeddings for semantic search and similarity
- **Text-to-Speech** - Natural voice synthesis
- **Speech-to-Text** - Audio transcription
- **Image Generation** - AI-powered image creation
- **Video Generation** - AI video synthesis
- **Summarization** - Automatic text summarization
- **Classification** - Text categorization and labeling

### Advanced Features
- **Hierarchical Template Composition** - Build complex prompts through template composition with child-parent template relationships
- **System Placeholders** - Automatic injection of common values (date/time, user context, etc.) into all templates
- **Streaming** - Real-time response streaming for better UX
- **Caching** - Intelligent caching to reduce costs and latency
- **Parallel Execution** - Run multiple AI operations concurrently
- **Token Management** - Track and optimize token usage
- **Response Formats** - Support for JSON, Markdown, and custom formats
- **Multimodal Support** - Handle text, images, audio, and video inputs
- **Validation & Retry** - Automatic output validation with configurable retry strategies
- **Cancellation Support** - Graceful cancellation of long-running operations

### Vector Operations
- **Semantic Search** - Find similar content using embeddings
- **Duplicate Detection** - Identify similar records automatically
- **Entity Vectorization** - Create searchable embeddings for any data
- **Multiple Vector Stores** - Support for various vector databases

## Getting Started

### Installation

```bash
# Install core package
npm install @memberjunction/ai

# Install desired provider(s)
npm install @memberjunction/ai-openai
npm install @memberjunction/ai-anthropic
# etc.
```

### Basic Usage

```typescript
import { ChatMessage, GetAIAPIKey } from '@memberjunction/ai';
import { OpenAILLM } from '@memberjunction/ai-openai';

// Create LLM instance
const llm = new OpenAILLM({
    apiKey: 'your-api-key'
});

// Simple completion
const result = await llm.ChatCompletion([
    { role: 'user', content: 'What is the capital of France?' }
]);

console.log(result.data.content);
```

### Using with MemberJunction

```typescript
import { AIEngine } from '@memberjunction/aiengine';

// AIEngine automatically manages providers based on configuration
const engine = AIEngine.Instance;

// Execute using the best available model
const result = await engine.ChatCompletion([
    { role: 'user', content: 'Explain quantum computing' }
], {
    modelName: 'gpt-4' // optional specific model
});
```

## Architecture

The AI Framework follows these principles:

1. **Modularity** - Each provider and capability is a separate package
2. **Abstraction** - Common interfaces hide provider-specific details
3. **Extensibility** - Easy to add new providers or capabilities
4. **Type Safety** - Full TypeScript support throughout
5. **Performance** - Optimized for production use with caching and batching
6. **Flexibility** - Use standalone or integrated with MemberJunction

## Provider Selection

The framework supports multiple strategies for provider selection:
- **Explicit** - Specify the exact provider and model
- **Capability-Based** - Select based on required features
- **Cost-Optimized** - Choose the most cost-effective option
- **Performance-Optimized** - Select the fastest provider
- **Fallback** - Automatic failover to alternate providers

## Best Practices

1. **API Key Management**
   - Use environment variables for API keys
   - Never commit keys to source control
   - Rotate keys regularly

2. **Error Handling**
   - Always handle API errors gracefully
   - Implement retry logic for transient failures
   - Log errors for debugging

3. **Cost Optimization**
   - Use appropriate models for each task
   - Implement caching where possible
   - Monitor token usage

4. **Performance**
   - Use streaming for long responses
   - Batch operations when possible
   - Consider edge deployment for latency

## Contributing

When contributing to the AI Framework:
1. Follow the established patterns in existing providers
2. Include comprehensive tests
3. Document all public APIs
4. Update relevant README files
5. Ensure backward compatibility

## Standalone Usage

The AI packages are designed to work independently:
- No database required
- No MemberJunction dependencies needed
- Works in any TypeScript/JavaScript environment
- Suitable for microservices, CLI tools, and standalone applications

## License

All packages in the AI Framework are part of the MemberJunction open-source project and follow the same licensing terms as the parent project.