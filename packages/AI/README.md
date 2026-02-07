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

### Sub-Directories

| Directory | Packages | Description |
|-----------|----------|-------------|
| [Providers](./Providers/README.md) | 23 | LLM, embedding, cloud-platform, local-inference, and specialty AI provider implementations |
| [Vectors](./Vectors/README.md) | 5 | Vector storage, search, in-memory utilities, duplicate detection, and entity synchronization |
| [AgentManager](./AgentManager/README.md) | 2 | Meta-agent system for creating, managing, and orchestrating AI agents |
| [Recommendations](./Recommendations/README.md) | 1 | Provider-agnostic recommendation engine framework |