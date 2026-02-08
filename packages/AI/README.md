# AI Packages

MemberJunction's artificial intelligence infrastructure -- model abstractions, provider implementations, vector operations, agent management, and supporting tools.

## Directory Structure

### Core Packages

| Package | npm | Description |
|---------|-----|-------------|
| [Core](./Core/README.md) | `@memberjunction/ai` | Base AI abstractions and interfaces for LLMs, embeddings, audio/video generation; zero MJ dependencies beyond `@memberjunction/global` |
| [CorePlus](./CorePlus/README.md) | `@memberjunction/ai-core-plus` | Extended AI components that require MJ entity concepts; usable on both server and client |
| [BaseAIEngine](./BaseAIEngine/README.md) | `@memberjunction/ai-engine-base` | Base AI engine with extended types and data caching; usable anywhere |
| [Engine](./Engine/README.md) | `@memberjunction/aiengine` | AI orchestration engine handling automatic execution of Entity AI Actions using AI Models |
| [Prompts](./Prompts/README.md) | `@memberjunction/ai-prompts` | Prompt execution engine with hierarchical template composition, system placeholders, parallel execution, and output validation |
| [Agents](./Agents/README.md) | `@memberjunction/ai-agents` | AI agent execution and management with metadata-driven agent types and sub-agent delegation |
| [Reranker](./Reranker/README.md) | `@memberjunction/ai-reranker` | AI reranker service and LLM-based reranking for two-stage retrieval |

### Protocol and Server Packages

| Package | npm | Description |
|---------|-----|-------------|
| [A2AServer](./A2AServer/README.md) | `@memberjunction/a2aserver` | Agent-to-Agent (A2A) protocol server for AI agent interoperability via Google's A2A protocol |
| [MCPServer](./MCPServer/README.md) | `@memberjunction/ai-mcp-server` | Model Context Protocol (MCP) server providing entity CRUD and AI agent execution to MCP-compatible clients |
| [MCPClient](./MCPClient/README.md) | `@memberjunction/ai-mcp-client` | MCP client implementation for consuming external MCP servers |

### CLI

| Package | npm | Description |
|---------|-----|-------------|
| [AICLI](./AICLI/README.md) | `@memberjunction/ai-cli` | AI agent, prompt, and action execution CLI integrated with the main MJ CLI |

---

### [Providers](./Providers/README.md)

LLM, embedding, cloud-platform, local-inference, and specialty AI provider implementations.

#### LLM Providers

Direct integrations with large language model APIs.

| Package | npm | Description |
|---------|-----|-------------|
| [Anthropic](./Providers/Anthropic/README.md) | `@memberjunction/ai-anthropic` | Wrapper for Anthropic AI Models (Claude) |
| [Gemini](./Providers/Gemini/README.md) | `@memberjunction/ai-gemini` | Wrapper for Google Gemini AI Models |
| [Groq](./Providers/Groq/README.md) | `@memberjunction/ai-groq` | Wrapper for Groq AI LPU inference engine |
| [Mistral](./Providers/Mistral/README.md) | `@memberjunction/ai-mistral` | Wrapper for Mistral AI Models |
| [OpenAI](./Providers/OpenAI/README.md) | `@memberjunction/ai-openai` | Wrapper for OpenAI AI Models (GPT-4, etc.) |
| [xAI](./Providers/xAI/README.md) | `@memberjunction/ai-xai` | Wrapper for xAI models (Grok) |

#### Cloud Platform Providers

Managed AI services offered through major cloud platforms.

| Package | npm | Description |
|---------|-----|-------------|
| [Azure](./Providers/Azure/README.md) | `@memberjunction/ai-azure` | Azure AI Provider for MemberJunction |
| [Bedrock](./Providers/Bedrock/README.md) | `@memberjunction/ai-bedrock` | Wrapper for Amazon Bedrock AI Models |
| [Vertex](./Providers/Vertex/README.md) | `@memberjunction/ai-vertex` | Wrapper for Google Vertex AI Models |

#### Inference Routers and Aggregators

Services that provide access to multiple models through a single API.

| Package | npm | Description |
|---------|-----|-------------|
| [Fireworks](./Providers/Fireworks/README.md) | `@memberjunction/ai-fireworks` | Wrapper for Fireworks.ai AI Models |
| [OpenRouter](./Providers/OpenRouter/README.md) | `@memberjunction/ai-openrouter` | Wrapper for OpenRouter AI inference services |

#### Local Inference

Run models locally without external API calls.

| Package | npm | Description |
|---------|-----|-------------|
| [LMStudio](./Providers/LMStudio/README.md) | `@memberjunction/ai-lmstudio` | Wrapper for LM Studio AI - Local Inference Engine |
| [Ollama](./Providers/Ollama/README.md) | `@memberjunction/ai-ollama` | Wrapper for Ollama - Local Inference |

#### Specialized Providers

Providers focused on specific AI capabilities beyond general-purpose LLMs.

| Package | npm | Description |
|---------|-----|-------------|
| [BettyBot](./Providers/BettyBot/README.md) | `@memberjunction/ai-betty-bot` | Wrapper for Betty Bot conversational AI |
| [BlackForestLabs](./Providers/BlackForestLabs/README.md) | `@memberjunction/ai-blackforestlabs` | Wrapper for Black Forest Labs FLUX Image Generation Models |
| [Cerebras](./Providers/Cerebras/README.md) | `@memberjunction/ai-cerebras` | Wrapper for Cerebras AI inference engine |
| [Cohere](./Providers/Cohere/README.md) | `@memberjunction/ai-cohere` | Cohere AI Provider - Semantic reranking using Cohere's Rerank API |
| [ElevenLabs](./Providers/ElevenLabs/README.md) | `@memberjunction/ai-elevenlabs` | Wrapper for ElevenLabs Audio Generation (TTS) |
| [HeyGen](./Providers/HeyGen/README.md) | `@memberjunction/ai-heygen` | Wrapper for HeyGen Video Generation |
| [LocalEmbeddings](./Providers/LocalEmbeddings/README.md) | `@memberjunction/ai-local-embeddings` | Local Embeddings Models via Xenova/Transformers |

#### Vector Database Providers

| Package | npm | Description |
|---------|-----|-------------|
| [Vectors-Pinecone](./Providers/Vectors-Pinecone/README.md) | `@memberjunction/ai-vectors-pinecone` | Pinecone Implementation for AI Vectors |

#### Recommendation Providers

| Package | npm | Description |
|---------|-----|-------------|
| [Recommendations-Rex](./Providers/Recommendations-Rex/README.md) | `@memberjunction/ai-recommendations-rex` | Recommendations Provider for rasa.io Rex engine |

#### Meta / Utility

| Package | npm | Description |
|---------|-----|-------------|
| [Bundle](./Providers/Bundle/README.md) | `@memberjunction/ai-provider-bundle` | Loads all standard AI providers to prevent tree-shaking |

---

### [Vectors](./Vectors/README.md)

Vector storage, search, and synchronization.

| Package | npm | Description |
|---------|-----|-------------|
| [Core](./Vectors/Core/README.md) | `@memberjunction/ai-vectors` | Core vector operations and abstractions for entity vectorization |
| [Database](./Vectors/Database/README.md) | `@memberjunction/ai-vectordb` | Vector database abstraction layer (index management, query operations) |
| [Dupe](./Vectors/Dupe/README.md) | `@memberjunction/ai-vector-dupe` | Duplicate record detection using vector similarity |
| [Memory](./Vectors/Memory/README.md) | `@memberjunction/ai-vectors-memory` | In-memory vector utilities |
| [Sync](./Vectors/Sync/README.md) | `@memberjunction/ai-vector-sync` | Synchronization between MemberJunction entities and vector databases |

---

### [AgentManager](./AgentManager/README.md)

Meta-agent system for creating, managing, and orchestrating AI agents.

| Package | npm | Description |
|---------|-----|-------------|
| [core](./AgentManager/core/README.md) | `@memberjunction/ai-agent-manager` | Core interfaces, types, and the `AgentSpec` class for agent metadata management |
| [actions](./AgentManager/actions/README.md) | `@memberjunction/ai-agent-manager-actions` | Agent management actions (create, update, list, deactivate, export, etc.) |

---

### [Recommendations](./Recommendations/README.md)

Provider-agnostic recommendation engine framework.

| Package | npm | Description |
|---------|-----|-------------|
| [Engine](./Recommendations/Engine/README.md) | `@memberjunction/ai-recommendations` | Core recommendation engine with provider pattern, run tracking, and entity integration |
