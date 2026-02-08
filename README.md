![](./MJ_logo.webp#gh-light-mode-only)
![](./MJ_logo_dark.png#gh-dark-mode-only)

# MemberJunction (MJ)

MemberJunction (MJ) is an open-source, AI-powered data platform that unifies data management, business logic, and intelligent interfaces through a metadata-driven architecture. Built with TypeScript, Angular 21, and SQL Server, MemberJunction combines enterprise-grade data capabilities with deep AI integration — supporting 15+ AI providers, vector operations, and an extensible agent framework — while remaining accessible to organizations of all sizes.

## Key Features

- **🤖 AI-Native Platform** - Deep integration with 15+ AI providers (OpenAI, Anthropic, Google, and more), vector operations, embeddings, and an extensible agent framework
- **🗄️ Unified Data Platform** - Integrate data from multiple sources into a singular, well-organized repository
- **📊 Rich Metadata Layer** - Comprehensive metadata system that drives UI generation, validation, and business logic
- **🔍 MemberJunction Explorer** - Powerful web application for browsing, searching, and managing your unified data
- **📨 Communication Framework** - Send emails, SMS, and messages through multiple providers with template support
- **⚡ Actions System** - Flexible framework for implementing and scheduling custom business logic
- **🔐 Enterprise Security** - Row-level security, field permissions, and integration with Auth0/MSAL
- **🛠️ Developer Friendly** - Full TypeScript, comprehensive APIs, and extensive documentation
- **📦 Modular Architecture** - 100+ npm packages that can be used independently or together

## 🤖 AI Capabilities

MemberJunction's AI framework is one of the most comprehensive open-source AI integration layers available. It provides a **provider-agnostic abstraction** that lets you swap AI providers without changing application code, plus a full agent framework for building autonomous workflows.

> **[Full AI Framework Documentation](./packages/AI)**

### AI Providers (15+)

Connect to any major AI service through a consistent API — switch providers with zero code changes:

| Provider | Capabilities | Package |
|----------|-------------|---------|
| **OpenAI** | GPT-4o, o1/o3 reasoning, DALL-E, Whisper, embeddings | [@memberjunction/ai-openai](./packages/AI/Providers/OpenAI) |
| **Anthropic** | Claude 4 family, streaming, prompt caching, extended thinking | [@memberjunction/ai-anthropic](./packages/AI/Providers/Anthropic) |
| **Google Gemini** | Gemini Pro/Flash, native multimodal, long context | [@memberjunction/ai-gemini](./packages/AI/Providers/Gemini) |
| **Azure OpenAI** | Enterprise Azure-hosted models | [@memberjunction/ai-azure](./packages/AI/Providers/Azure) |
| **Amazon Bedrock** | Multi-model access via AWS | [@memberjunction/ai-bedrock](./packages/AI/Providers/Bedrock) |
| **Google Vertex** | Vertex AI platform integration | [@memberjunction/ai-vertex](./packages/AI/Providers/Vertex) |
| **Mistral** | Open-source and commercial models, embeddings | [@memberjunction/ai-mistral](./packages/AI/Providers/Mistral) |
| **Groq** | Ultra-fast inference for Llama, Mixtral | [@memberjunction/ai-groq](./packages/AI/Providers/Groq) |
| **Cerebras** | High-performance inference | [@memberjunction/ai-cerebras](./packages/AI/Providers/Cerebras) |
| **OpenRouter** | Multi-provider routing | [@memberjunction/ai-openrouter](./packages/AI/Providers/OpenRouter) |
| **ElevenLabs** | Text-to-speech | [@memberjunction/ai-elevenlabs](./packages/AI/Providers/ElevenLabs) |
| **HeyGen** | AI video generation | [@memberjunction/ai-heygen](./packages/AI/Providers/HeyGen) |

> **[All AI Providers](./packages/AI/Providers)**

### Agent Framework

Build autonomous AI agents that orchestrate complex, multi-step workflows:

- **[BaseAgent](./packages/AI/Agents)** - Core agent execution engine with hierarchical prompt composition, sub-agent delegation, action integration, and automatic context compression
- **LoopAgentType** - Iterative agents that execute until task completion with ForEach/While operations (90% token reduction for batch tasks)
- **FlowAgentType** - Deterministic workflow agents using directed graphs with conditional branching, parallel execution, and hybrid AI/deterministic paths
- **AgentRunner** - Orchestrator that loads agent metadata, instantiates correct classes, and manages execution lifecycle

> **[Agent Framework Documentation](./packages/AI/Agents)**

### Prompt Management

Database-driven prompt templates with advanced features:

- **Hierarchical composition** - Parent/child template patterns for system + agent prompts
- **Dynamic context injection** - Automatic variable substitution and placeholder resolution
- **Effort level control** - Fine-grained reasoning intensity (1-100 scale) mapped per-provider
- **Intelligent model selection** - Automatic failover across configured models
- **Execution tracking** - Every prompt run logged to database for analysis

> **[Prompt Engine Documentation](./packages/AI/Prompts)**

### Vector Operations & Semantic Search

Full vector pipeline from embedding to search:

- **[Core vector operations](./packages/AI/Vectors/Core)** - Embeddings, similarity search, entity vectorization
- **[Vector database layer](./packages/AI/Vectors/Database)** - Abstraction supporting Pinecone and extensible to other stores
- **[Vector sync](./packages/AI/Vectors/Sync)** - Automatic entity vectorization with batch processing and incremental updates
- **[Duplicate detection](./packages/AI/Vectors/Dupe)** - Find duplicates across entities using vector similarity
- **[Memory vectors](./packages/AI/Vectors/Memory)** - In-memory vector operations

> **[Vector Operations Documentation](./packages/AI/Vectors)**

### Interoperability Protocols

Connect MJ to the broader AI ecosystem:

- **[MCP Server](./packages/AI/MCPServer)** - Model Context Protocol server exposing MJ entities and agents as tools for any MCP-compatible client (Claude Desktop, Cursor, etc.)
- **[MCP Client](./packages/AI/MCPClient)** - Consume tools from external MCP servers with multi-transport support, authentication, and rate limiting
- **[A2A Server](./packages/AI/A2AServer)** - Google Agent-to-Agent protocol for agent interoperability across platforms

### AI Recommendations

- **[Recommendation Engine](./packages/AI/Recommendations)** - Pluggable recommendation framework with entity-aware suggestions

---

## Why MemberJunction?

MemberJunction was designed to solve common challenges in data management and AI-powered application development:

- **Eliminate Data Silos** - Bring all your data together in one place
- **Add AI Without Complexity** - Plug in any AI provider through a unified abstraction layer
- **Build Intelligent Agents** - Create autonomous AI workflows with the agent framework
- **Reduce Development Time** - Auto-generate forms, APIs, and documentation from metadata
- **Ensure Consistency** - Single source of truth for data structure and business rules
- **Scale Efficiently** - From small non-profits to large enterprises
- **Stay Flexible** - Extend and customize every aspect of the platform

Originally created to support non-profits and associations, MemberJunction is free to use and open source!

## 📚 Documentation

Extensive documentation is available at [https://docs.memberjunction.org](https://docs.memberjunction.org)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ (22+ recommended)
- **npm** 9+
- **SQL Server** 2019+ (or Azure SQL Database)
- **Angular CLI** 21+
- **Git** for cloning the repository

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/MemberJunction/MJ.git
   cd MJ
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure your environment**
   - Copy `install.config.json.example` to `install.config.json`
   - Update with your database connection and authentication settings
   - Set up environment variables for API keys (if using AI features)

4. **Run the installation**
   ```bash
   node InstallMJ.js
   ```
   This will:
   - Create the MemberJunction database schema
   - Install base metadata
   - Generate entity classes and GraphQL types
   - Set up initial configuration

5. **Start the services**
   ```bash
   # Start the API server
   npm run start:api

   # In another terminal, start the Explorer UI
   npm run start:explorer
   ```

6. **Access MemberJunction Explorer**
   - Navigate to http://localhost:4200
   - Log in with your configured authentication provider

   > **⚠️ Important:** If you change the database connection information (switching to a different database while keeping the same API URL), you must clear the browser's IndexedDB cache to remove cached metadata from the previous connection.
   >
   > To clear the cache:
   > 1. Open browser DevTools → Application → Storage → IndexedDB
   > 2. Delete the `MJ_Metadata` database
   > 3. Refresh the page to rebuild the cache from the new database
   >
   > This is necessary because the current cache implementation uses only the API URL (not the database name) as the cache key, which can cause stale data issues when switching databases.

## 🏗️ Architecture & Package Structure

MemberJunction uses a modular monorepo architecture with 175 TypeScript packages. Each package is designed to be used independently or as part of the complete platform. See the [Full Package Directory](#-full-package-directory) at the bottom of this file for a complete, navigable listing of every package.

### 📁 Repository Organization

```
MJ/
├── packages/           # All npm packages (175 packages)
│   ├── Actions/       # Action framework (13 packages)
│   ├── AI/            # AI infrastructure (42 packages)
│   ├── Angular/       # UI components (61 packages)
│   ├── Communication/ # Messaging (10 packages)
│   ├── Scheduling/    # Job scheduling (4 packages)
│   └── ...           # Core, data, server, and utility packages
├── SQL Scripts/       # Database setup and migrations
├── migrations/        # Flyway migration scripts
└── docs/             # Additional documentation
```

### 🎯 Core Framework

- **[@memberjunction/global](./packages/MJGlobal)** - Foundation utilities, class factory, singleton management
- **[@memberjunction/core](./packages/MJCore)** - Metadata engine, entity management, data access
- **[@memberjunction/core-entities](./packages/MJCoreEntities)** - Strongly-typed entity classes
- **[@memberjunction/server](./packages/MJServer)** - GraphQL API server with authentication

### 🤖 AI Framework (42 packages)

Provider-agnostic AI with 23 providers, vector operations, agent orchestration, and MCP/A2A interoperability. See [AI Capabilities](#-ai-capabilities) above and the [Full AI listing](#ai).

### 💬 Communication & Actions

- **[Communication](./packages/Communication)** - Multi-channel messaging (email, SMS) with SendGrid, Microsoft Graph, Gmail, and Twilio providers
- **[Actions](./packages/Actions)** - Metadata-driven action framework with scheduling, BizApps integrations, and sandboxed code execution

### 🎨 UI Components (61 Angular packages)

100+ Angular 21 components (ESBuild/Vite powered) spanning Explorer, forms, grids, dashboards, chat, and more. See the [Full Angular listing](#angular).

### 🔧 Developer Tools

- **[@memberjunction/cli](./packages/MJCLI)** - Command-line tools
- **[@memberjunction/codegen-lib](./packages/CodeGenLib)** - Code generation library
- **[@memberjunction/templates](./packages/Templates/engine)** - Nunjucks-based templating with AI content generation

## 🛠️ Development

### Essential Commands

```bash
# Build everything
npm run build

# Build specific package (run from that package's directory)
cd packages/MJCore && npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Start services
npm run start:api        # Start API server (port 4000)
npm run start:explorer   # Start Explorer UI (port 4200)

# Code quality
npm run lint            # Run ESLint
npm run format          # Format with Prettier
npm test               # Run tests
```

### Development Workflow

1. **Make changes** in the relevant package under `/packages`
2. **Build the package** using `npm run build` in the package directory
3. **Test locally** using the watch mode for rapid development
4. **Run tests** to ensure nothing is broken
5. **Create a PR** with your changes

### Package Development

Each package follows a consistent structure:
```
packages/MyPackage/
├── src/               # TypeScript source files
├── dist/              # Compiled output
├── package.json       # Package configuration
├── tsconfig.json      # TypeScript configuration
├── README.md          # Package documentation
└── CHANGELOG.md       # Version history
```

## 📋 Key Concepts

### Metadata-Driven Development

MemberJunction's core philosophy is metadata-driven development:
- **Entities** define data structure and relationships
- **Fields** specify data types, validation, and UI hints
- **Views** control data access and filtering
- **Actions** implement business logic
- **Forms** are auto-generated or customized

### Entity System

Entities are the building blocks:
```typescript
// Never instantiate directly - use Metadata
const md = new Metadata();
const customer = await md.GetEntityObject<CustomerEntity>('Customers');
await customer.Load(customerId);
customer.Name = 'New Name';
await customer.Save();
```

### Code Generation

MemberJunction generates code from metadata:
- Entity subclasses with full TypeScript typing
- GraphQL schemas and resolvers
- SQL views and stored procedures
- API documentation

## 🧪 Code Style & Best Practices

### TypeScript Guidelines
- **Strict mode** enabled for all packages
- **No `any` types** - use proper typing or `unknown`
- **Explicit return types** for public methods
- **Interface-first** design for extensibility

### Naming Conventions
- **PascalCase** for classes, interfaces, and **public class members** (properties, methods)
- **camelCase** for private/protected members, local variables, and function parameters
- **UPPER_CASE** for constants
- **Descriptive names** over abbreviations

### Code Organization
- **Single responsibility** - one class, one purpose
- **Dependency injection** where appropriate
- **Error handling** with meaningful messages
- **Logging** at appropriate levels
- **Tests** for critical functionality

## 🐳 Deployment

### Docker Support

MemberJunction includes Docker configuration for containerized deployment:

```bash
# Build the Docker image
docker build -f docker/MJAPI/Dockerfile -t memberjunction/api .

# Run with docker-compose
docker-compose up -d
```

Features:
- Multi-stage build for optimal image size
- Includes SQL Server tools and Flyway migrations
- Environment-based configuration
- Health checks and logging

### Database Migrations

Database changes are managed through Flyway migrations:
- **Versioned migrations** in `/migrations/v2/`
- **Automatic execution** on startup
- **Rollback support** for safe deployments
- **Schema versioning** for upgrade paths

## 🔒 Security

MemberJunction includes enterprise-grade security features:

- **Authentication** - Auth0 and Azure AD (MSAL) support
- **Row-Level Security** - Fine-grained data access control
- **Field Permissions** - Control access to sensitive fields
- **API Security** - GraphQL query depth limiting and rate limiting
- **Audit Logging** - Complete audit trail of all changes

## 🚀 Use Cases

MemberJunction is ideal for:

- **AI-Powered Applications** - Build intelligent features with integrated AI providers, vector search, and agent orchestration
- **Non-Profit Organizations** - Manage members, donors, and programs
- **Associations** - Track memberships, events, and communications
- **Enterprise Applications** - Build custom business applications
- **Data Integration** - Unify data from multiple systems

## 🤝 Contributing

We welcome contributions from the community! 

- **Code Contributions** - See our [Contributing Guide](CONTRIBUTING.md)
- **Bug Reports** - Use [GitHub Issues](https://github.com/MemberJunction/MJ/issues)
- **Feature Requests** - Start a [Discussion](https://github.com/MemberJunction/MJ/discussions)
- **Documentation** - Help improve our docs
- **Community** - Join our [forum](https://docs.memberjunction.org/discuss)

## 📄 License

MemberJunction is open source software licensed under the ISC License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- **Contributors** - Thank you to all who have contributed code, documentation, and ideas
- **BrowserStack** - For providing testing infrastructure
- **Open Source Community** - For the amazing tools and libraries we build upon

## 📞 Support

- **Documentation** - [https://docs.memberjunction.org](https://docs.memberjunction.org)
- **GitHub Issues** - [Bug reports and feature requests](https://github.com/MemberJunction/MJ/issues)
- **Discussions** - [Community forum](https://github.com/MemberJunction/MJ/discussions)
- **Email** - support@memberjunction.org

---

## 📦 Full Package Directory

> Every package in the MemberJunction monorepo, organized by directory. Click any package to jump to its README.

### [Actions](./packages/Actions/README.md)

Metadata-driven action framework for workflows, agents, and automation (13 packages).

#### Core

| Package | npm | Description |
|---------|-----|-------------|
| [Engine](./packages/Actions/Engine/README.md) | `@memberjunction/actions` | Main library for MemberJunction Actions. This library is only intended to be imported on the server side. |
| [Base](./packages/Actions/Base/README.md) | `@memberjunction/actions-base` | Base classes and interfaces for the Actions framework. Used on both server and network nodes. |
| [CoreActions](./packages/Actions/CoreActions/README.md) | `@memberjunction/core-actions` | Library of generated and custom actions for the core MemberJunction framework, maintained by MemberJunction. |
| [CodeExecution](./packages/Actions/CodeExecution/README.md) | `@memberjunction/code-execution` | Sandboxed code execution service for MemberJunction actions and agents. |

#### Integrations

| Package | npm | Description |
|---------|-----|-------------|
| [ApolloEnrichment](./packages/Actions/ApolloEnrichment/README.md) | `@memberjunction/actions-apollo` | Action classes that wrap the Apollo.io data enrichment API for contacts and accounts. |
| [ContentAutotag](./packages/Actions/ContentAutotag/README.md) | `@memberjunction/actions-content-autotag` | Action classes that execute the content autotagging and vectorization actions. |

#### Scheduling

| Package | npm | Description |
|---------|-----|-------------|
| [ScheduledActions](./packages/Actions/ScheduledActions/README.md) | `@memberjunction/scheduled-actions` | Allows system administrators to schedule any MemberJunction action for recurring or one-time future execution. |
| [ScheduledActionsServer](./packages/Actions/ScheduledActionsServer/README.md) | `@memberjunction/scheduled-actions-server` | Simple application server that can be called via URL to invoke Scheduled Actions. |

#### [Actions / BizApps](./packages/Actions/BizApps/README.md)

Business application-specific actions for integrating with external business systems.

| Package | npm | Description |
|---------|-----|-------------|
| [Accounting](./packages/Actions/BizApps/Accounting/README.md) | `@memberjunction/actions-bizapps-accounting` | Accounting system integration actions (QuickBooks, NetSuite, Sage, Dynamics) |
| [CRM](./packages/Actions/BizApps/CRM/README.md) | `@memberjunction/actions-bizapps-crm` | CRM system integration actions (Salesforce, HubSpot, Dynamics, Pipedrive) |
| [FormBuilders](./packages/Actions/BizApps/FormBuilders/README.md) | `@memberjunction/actions-bizapps-formbuilders` | Form builder and survey platform integration actions (Typeform, Google Forms, Jotform) |
| [LMS](./packages/Actions/BizApps/LMS/README.md) | `@memberjunction/actions-bizapps-lms` | Learning management system integration actions (Moodle, Canvas, Blackboard, LearnDash) |
| [Social](./packages/Actions/BizApps/Social/README.md) | `@memberjunction/actions-bizapps-social` | Social media integration actions (Twitter, LinkedIn, Facebook, Instagram, TikTok, YouTube, HootSuite, Buffer) |

### [AI](./packages/AI/README.md)

AI infrastructure -- model abstractions, provider implementations, vector operations, agent management, and supporting tools (42 packages).

#### Core Packages

| Package | npm | Description |
|---------|-----|-------------|
| [Core](./packages/AI/Core/README.md) | `@memberjunction/ai` | Base AI abstractions and interfaces for LLMs, embeddings, audio/video generation; zero MJ dependencies beyond `@memberjunction/global` |
| [CorePlus](./packages/AI/CorePlus/README.md) | `@memberjunction/ai-core-plus` | Extended AI components that require MJ entity concepts; usable on both server and client |
| [BaseAIEngine](./packages/AI/BaseAIEngine/README.md) | `@memberjunction/ai-engine-base` | Base AI engine with extended types and data caching; usable anywhere |
| [Engine](./packages/AI/Engine/README.md) | `@memberjunction/aiengine` | AI orchestration engine handling automatic execution of Entity AI Actions using AI Models |
| [Prompts](./packages/AI/Prompts/README.md) | `@memberjunction/ai-prompts` | Prompt execution engine with hierarchical template composition, system placeholders, parallel execution, and output validation |
| [Agents](./packages/AI/Agents/README.md) | `@memberjunction/ai-agents` | AI agent execution and management with metadata-driven agent types and sub-agent delegation |
| [Reranker](./packages/AI/Reranker/README.md) | `@memberjunction/ai-reranker` | AI reranker service and LLM-based reranking for two-stage retrieval |

#### Protocol and Server Packages

| Package | npm | Description |
|---------|-----|-------------|
| [A2AServer](./packages/AI/A2AServer/README.md) | `@memberjunction/a2aserver` | Agent-to-Agent (A2A) protocol server for AI agent interoperability via Google's A2A protocol |
| [MCPServer](./packages/AI/MCPServer/README.md) | `@memberjunction/ai-mcp-server` | Model Context Protocol (MCP) server providing entity CRUD and AI agent execution to MCP-compatible clients |
| [MCPClient](./packages/AI/MCPClient/README.md) | `@memberjunction/ai-mcp-client` | MCP client implementation for consuming external MCP servers |

#### CLI

| Package | npm | Description |
|---------|-----|-------------|
| [AICLI](./packages/AI/AICLI/README.md) | `@memberjunction/ai-cli` | AI agent, prompt, and action execution CLI integrated with the main MJ CLI |

#### [AI / Providers](./packages/AI/Providers/README.md)

LLM, embedding, cloud-platform, local-inference, and specialty AI provider implementations (23 packages).

**LLM Providers**

| Package | npm | Description |
|---------|-----|-------------|
| [Anthropic](./packages/AI/Providers/Anthropic/README.md) | `@memberjunction/ai-anthropic` | Wrapper for Anthropic AI Models (Claude) |
| [Gemini](./packages/AI/Providers/Gemini/README.md) | `@memberjunction/ai-gemini` | Wrapper for Google Gemini AI Models |
| [Groq](./packages/AI/Providers/Groq/README.md) | `@memberjunction/ai-groq` | Wrapper for Groq AI LPU inference engine |
| [Mistral](./packages/AI/Providers/Mistral/README.md) | `@memberjunction/ai-mistral` | Wrapper for Mistral AI Models |
| [OpenAI](./packages/AI/Providers/OpenAI/README.md) | `@memberjunction/ai-openai` | Wrapper for OpenAI AI Models (GPT-4, etc.) |
| [xAI](./packages/AI/Providers/xAI/README.md) | `@memberjunction/ai-xai` | Wrapper for xAI models (Grok) |

**Cloud Platform Providers**

| Package | npm | Description |
|---------|-----|-------------|
| [Azure](./packages/AI/Providers/Azure/README.md) | `@memberjunction/ai-azure` | Azure AI Provider for MemberJunction |
| [Bedrock](./packages/AI/Providers/Bedrock/README.md) | `@memberjunction/ai-bedrock` | Wrapper for Amazon Bedrock AI Models |
| [Vertex](./packages/AI/Providers/Vertex/README.md) | `@memberjunction/ai-vertex` | Wrapper for Google Vertex AI Models |

**Inference Routers and Aggregators**

| Package | npm | Description |
|---------|-----|-------------|
| [Fireworks](./packages/AI/Providers/Fireworks/README.md) | `@memberjunction/ai-fireworks` | Wrapper for Fireworks.ai AI Models |
| [OpenRouter](./packages/AI/Providers/OpenRouter/README.md) | `@memberjunction/ai-openrouter` | Wrapper for OpenRouter AI inference services |

**Local Inference**

| Package | npm | Description |
|---------|-----|-------------|
| [LMStudio](./packages/AI/Providers/LMStudio/README.md) | `@memberjunction/ai-lmstudio` | Wrapper for LM Studio AI - Local Inference Engine |
| [Ollama](./packages/AI/Providers/Ollama/README.md) | `@memberjunction/ai-ollama` | Wrapper for Ollama - Local Inference |

**Specialized Providers**

| Package | npm | Description |
|---------|-----|-------------|
| [BettyBot](./packages/AI/Providers/BettyBot/README.md) | `@memberjunction/ai-betty-bot` | Wrapper for Betty Bot conversational AI |
| [BlackForestLabs](./packages/AI/Providers/BlackForestLabs/README.md) | `@memberjunction/ai-blackforestlabs` | Wrapper for Black Forest Labs FLUX Image Generation Models |
| [Cerebras](./packages/AI/Providers/Cerebras/README.md) | `@memberjunction/ai-cerebras` | Wrapper for Cerebras AI inference engine |
| [Cohere](./packages/AI/Providers/Cohere/README.md) | `@memberjunction/ai-cohere` | Cohere AI Provider - Semantic reranking using Cohere's Rerank API |
| [ElevenLabs](./packages/AI/Providers/ElevenLabs/README.md) | `@memberjunction/ai-elevenlabs` | Wrapper for ElevenLabs Audio Generation (TTS) |
| [HeyGen](./packages/AI/Providers/HeyGen/README.md) | `@memberjunction/ai-heygen` | Wrapper for HeyGen Video Generation |
| [LocalEmbeddings](./packages/AI/Providers/LocalEmbeddings/README.md) | `@memberjunction/ai-local-embeddings` | Local Embeddings Models via Xenova/Transformers |

**Vector Database Providers**

| Package | npm | Description |
|---------|-----|-------------|
| [Vectors-Pinecone](./packages/AI/Providers/Vectors-Pinecone/README.md) | `@memberjunction/ai-vectors-pinecone` | Pinecone Implementation for AI Vectors |

**Recommendation Providers**

| Package | npm | Description |
|---------|-----|-------------|
| [Recommendations-Rex](./packages/AI/Providers/Recommendations-Rex/README.md) | `@memberjunction/ai-recommendations-rex` | Recommendations Provider for rasa.io Rex engine |

**Meta / Utility**

| Package | npm | Description |
|---------|-----|-------------|
| [Bundle](./packages/AI/Providers/Bundle/README.md) | `@memberjunction/ai-provider-bundle` | Loads all standard AI providers to prevent tree-shaking |

#### [AI / Vectors](./packages/AI/Vectors/README.md)

Vector storage, search, and synchronization (5 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [Core](./packages/AI/Vectors/Core/README.md) | `@memberjunction/ai-vectors` | Core vector operations and abstractions for entity vectorization |
| [Database](./packages/AI/Vectors/Database/README.md) | `@memberjunction/ai-vectordb` | Vector database abstraction layer (index management, query operations) |
| [Dupe](./packages/AI/Vectors/Dupe/README.md) | `@memberjunction/ai-vector-dupe` | Duplicate record detection using vector similarity |
| [Memory](./packages/AI/Vectors/Memory/README.md) | `@memberjunction/ai-vectors-memory` | In-memory vector utilities |
| [Sync](./packages/AI/Vectors/Sync/README.md) | `@memberjunction/ai-vector-sync` | Synchronization between MemberJunction entities and vector databases |

#### [AI / AgentManager](./packages/AI/AgentManager/README.md)

Meta-agent system for creating, managing, and orchestrating AI agents (2 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [core](./packages/AI/AgentManager/core/README.md) | `@memberjunction/ai-agent-manager` | Core interfaces, types, and the `AgentSpec` class for agent metadata management |
| [actions](./packages/AI/AgentManager/actions/README.md) | `@memberjunction/ai-agent-manager-actions` | Agent management actions (create, update, list, deactivate, export, etc.) |

#### [AI / Recommendations](./packages/AI/Recommendations/README.md)

Provider-agnostic recommendation engine framework (1 package).

| Package | npm | Description |
|---------|-----|-------------|
| [Engine](./packages/AI/Recommendations/Engine/README.md) | `@memberjunction/ai-recommendations` | Core recommendation engine with provider pattern, run tracking, and entity integration |

### [Angular](./packages/Angular/README.md)

Angular UI framework -- the Bootstrap package, Explorer application components, and a comprehensive library of reusable generic components (61 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [Bootstrap](./packages/Angular/Bootstrap/README.md) | `@memberjunction/ng-bootstrap` | Angular bootstrap and class registration manifest |

#### [Angular / Explorer](./packages/Angular/Explorer/README.md)

The MJExplorer application -- MemberJunction's primary Angular-based UI for browsing, editing, and managing data (19 packages).

**Core / Shell**

| Package | npm | Description |
|---------|-----|-------------|
| [explorer-app](./packages/Angular/Explorer/explorer-app/README.md) | `@memberjunction/ng-explorer-app` | Complete branded entry point for Explorer-style applications |
| [explorer-core](./packages/Angular/Explorer/explorer-core/README.md) | `@memberjunction/ng-explorer-core` | Core Explorer framework: application shell, routing, resource containers, and navigation |
| [explorer-modules](./packages/Angular/Explorer/explorer-modules/README.md) | `@memberjunction/ng-explorer-modules` | Consolidated Explorer NgModule bundle that re-exports all Explorer feature modules |
| [kendo-modules](./packages/Angular/Explorer/kendo-modules/README.md) | `@memberjunction/ng-kendo-modules` | Consolidated Kendo UI NgModule bundle for shared Kendo component imports |
| [base-application](./packages/Angular/Explorer/base-application/README.md) | `@memberjunction/ng-base-application` | BaseApplication class system for app-centric navigation |
| [auth-services](./packages/Angular/Explorer/auth-services/README.md) | `@memberjunction/ng-auth-services` | Authentication services with Auth0, MSAL, and Okta provider support |
| [shared](./packages/Angular/Explorer/shared/README.md) | `@memberjunction/ng-shared` | Shared Explorer utilities, base components, services, and events used across Explorer packages |
| [workspace-initializer](./packages/Angular/Explorer/workspace-initializer/README.md) | `@memberjunction/ng-workspace-initializer` | Workspace initialization service and components for bootstrapping the Explorer environment |

**Forms & Entity Editing**

| Package | npm | Description |
|---------|-----|-------------|
| [base-forms](./packages/Angular/Explorer/base-forms/README.md) | `@memberjunction/ng-base-forms` | Base form components, field rendering, and validation framework |
| [core-entity-forms](./packages/Angular/Explorer/core-entity-forms/README.md) | `@memberjunction/ng-core-entity-forms` | Auto-generated and custom entity forms with dynamic form loading and registration |
| [entity-form-dialog](./packages/Angular/Explorer/entity-form-dialog/README.md) | `@memberjunction/ng-entity-form-dialog` | Modal dialog for displaying and editing any entity record |
| [form-toolbar](./packages/Angular/Explorer/form-toolbar/README.md) | `@memberjunction/ng-form-toolbar` | Form action toolbar providing save, cancel, delete, and navigation controls |

**Data Grids & Lists**

| Package | npm | Description |
|---------|-----|-------------|
| [list-detail-grid](./packages/Angular/Explorer/list-detail-grid/README.md) | `@memberjunction/ng-list-detail-grid` | Master-detail grid for displaying dynamic and saved list details |
| [simple-record-list](./packages/Angular/Explorer/simple-record-list/README.md) | `@memberjunction/ng-simple-record-list` | Lightweight component for displaying, editing, creating, and deleting records in any entity |

**Dashboards**

| Package | npm | Description |
|---------|-----|-------------|
| [dashboards](./packages/Angular/Explorer/dashboards/README.md) | `@memberjunction/ng-dashboards` | Dashboard components including AI model management, Entity Admin ERD, and Actions configuration |

**Utility & Navigation**

| Package | npm | Description |
|---------|-----|-------------|
| [link-directives](./packages/Angular/Explorer/link-directives/README.md) | `@memberjunction/ng-link-directives` | Directives for turning elements into email, web, or record links |
| [entity-permissions](./packages/Angular/Explorer/entity-permissions/README.md) | `@memberjunction/ng-entity-permissions` | Components for displaying and editing entity-level permissions |
| [explorer-settings](./packages/Angular/Explorer/explorer-settings/README.md) | `@memberjunction/ng-explorer-settings` | Reusable components for the Explorer settings section |
| [record-changes](./packages/Angular/Explorer/record-changes/README.md) | `@memberjunction/ng-record-changes` | Change-tracking dialog with diff visualization for individual records |

#### [Angular / Generic](./packages/Angular/Generic/README.md)

Reusable Angular components and services shared across MemberJunction applications (41 packages).

**Core & Base Types**

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./packages/Angular/Generic/base-types/README.md) | `@memberjunction/ng-base-types` | Simple types that are used across many generic Angular UI components for coordination |
| [shared](./packages/Angular/Generic/shared/README.md) | `@memberjunction/ng-shared-generic` | Utility services and reusable elements used in any Angular application |
| [container-directives](./packages/Angular/Generic/container-directives/README.md) | `@memberjunction/ng-container-directives` | Fill Container for auto-resizing and plain container directives for element identification/binding |
| [Testing](./packages/Angular/Generic/Testing/README.md) | `@memberjunction/ng-testing` | Testing components and utilities for Angular applications |

**AI & Chat**

| Package | npm | Description |
|---------|-----|-------------|
| [chat](./packages/Angular/Generic/chat/README.md) | `@memberjunction/ng-chat` | Reusable chat component for AI or peer-to-peer chat applications |
| [conversations](./packages/Angular/Generic/conversations/README.md) | `@memberjunction/ng-conversations` | Conversation, collection, and artifact management components |
| [agents](./packages/Angular/Generic/agents/README.md) | `@memberjunction/ng-agents` | Reusable components for AI Agent management including permissions panel, dialog, and slideover |
| [ai-test-harness](./packages/Angular/Generic/ai-test-harness/README.md) | `@memberjunction/ng-ai-test-harness` | Reusable component for testing AI agents and prompts with beautiful UX |
| [skip-chat](./packages/Angular/Generic/skip-chat/README.md) | `@memberjunction/ng-skip-chat` | **DEPRECATED** -- use `@memberjunction/ng-conversations` instead |
| [artifacts](./packages/Angular/Generic/artifacts/README.md) | `@memberjunction/ng-artifacts` | Artifact viewer plugin system for rendering different artifact types (JSON, Code, Markdown, HTML, SVG, Components) |

**Entity & Data**

| Package | npm | Description |
|---------|-----|-------------|
| [entity-viewer](./packages/Angular/Generic/entity-viewer/README.md) | `@memberjunction/ng-entity-viewer` | Components for viewing entity data in multiple formats (grid, cards) with filtering, selection, and shared data management |
| [entity-communication](./packages/Angular/Generic/entity-communication/README.md) | `@memberjunction/ng-entity-communications` | Components to allow a user to select templates, preview messages, and send them |
| [entity-relationship-diagram](./packages/Angular/Generic/entity-relationship-diagram/README.md) | `@memberjunction/ng-entity-relationship-diagram` | Entity Relationship Diagram (ERD) component for visualizing entity relationships using D3.js force-directed graphs |
| [data-context](./packages/Angular/Generic/data-context/README.md) | `@memberjunction/ng-data-context` | Component and pop-up window to display and edit the contents of a data context |
| [deep-diff](./packages/Angular/Generic/deep-diff/README.md) | `@memberjunction/ng-deep-diff` | Component to display the differences between two objects, using the non-visual functionality from `@memberjunction/global` |
| [record-selector](./packages/Angular/Generic/record-selector/README.md) | `@memberjunction/ng-record-selector` | Components to allow a user to select/deselect items from a possible set |
| [find-record](./packages/Angular/Generic/find-record/README.md) | `@memberjunction/ng-find-record` | Component to allow a user to find a single record in any entity |
| [join-grid](./packages/Angular/Generic/join-grid/README.md) | `@memberjunction/ng-join-grid` | Grid component for displaying/editing the relationship between two entities (e.g., Users + Roles in a single grid) |

**Actions & Workflows**

| Package | npm | Description |
|---------|-----|-------------|
| [actions](./packages/Angular/Generic/actions/README.md) | `@memberjunction/ng-actions` | Reusable components for testing and running actions with no Kendo dependencies |
| [action-gallery](./packages/Angular/Generic/action-gallery/README.md) | `@memberjunction/ng-action-gallery` | Filterable gallery component for browsing and selecting actions |
| [flow-editor](./packages/Angular/Generic/flow-editor/README.md) | `@memberjunction/ng-flow-editor` | Generic visual flow editor component powered by Foblex Flow, with an agent-specific Flow Agent Editor |
| [tasks](./packages/Angular/Generic/tasks/README.md) | `@memberjunction/ng-tasks` | Components for task visualization and management with Gantt chart support |

**Query & Reporting**

| Package | npm | Description |
|---------|-----|-------------|
| [query-grid](./packages/Angular/Generic/query-grid/README.md) | `@memberjunction/ng-query-grid` | Grid to display any MemberJunction Query |
| [query-viewer](./packages/Angular/Generic/query-viewer/README.md) | `@memberjunction/ng-query-viewer` | Components for viewing and executing stored queries with parameter input, interactive results grid, and entity linking |
| [filter-builder](./packages/Angular/Generic/filter-builder/README.md) | `@memberjunction/ng-filter-builder` | Modern, intuitive filter builder for creating complex boolean filter expressions with portable JSON format |

**Dashboard & Layout**

| Package | npm | Description |
|---------|-----|-------------|
| [dashboard-viewer](./packages/Angular/Generic/dashboard-viewer/README.md) | `@memberjunction/ng-dashboard-viewer` | Components for metadata-driven dashboards with Golden Layout panels, supporting views, queries, artifacts, and custom content |
| [tab-strip](./packages/Angular/Generic/tab-strip/README.md) | `@memberjunction/ng-tabstrip` | Simple tab strip component used in the MJ Explorer app and reusable anywhere else |
| [timeline](./packages/Angular/Generic/timeline/README.md) | `@memberjunction/ng-timeline` | Responsive timeline component; works with MemberJunction entities or plain JavaScript objects with no external dependencies |
| [trees](./packages/Angular/Generic/trees/README.md) | `@memberjunction/ng-trees` | Tree and tree-dropdown components for hierarchical entity selection |
| [markdown](./packages/Angular/Generic/markdown/README.md) | `@memberjunction/ng-markdown` | Lightweight markdown component with Prism.js highlighting, Mermaid diagrams, and extensible features |
| [notifications](./packages/Angular/Generic/notifications/README.md) | `@memberjunction/ng-notifications` | Simple library for displaying user notifications |

**Credentials & Permissions**

| Package | npm | Description |
|---------|-----|-------------|
| [credentials](./packages/Angular/Generic/credentials/README.md) | `@memberjunction/ng-credentials` | Components for credential management -- panels and dialogs for creating and editing credentials |
| [resource-permissions](./packages/Angular/Generic/resource-permissions/README.md) | `@memberjunction/ng-resource-permissions` | Generic components for displaying/editing permissions for a resource |

**UI Utilities**

| Package | npm | Description |
|---------|-----|-------------|
| [generic-dialog](./packages/Angular/Generic/generic-dialog/README.md) | `@memberjunction/ng-generic-dialog` | Component for a generic dialog |
| [code-editor](./packages/Angular/Generic/code-editor/README.md) | `@memberjunction/ng-code-editor` | Angular code editor component |
| [file-storage](./packages/Angular/Generic/file-storage/README.md) | `@memberjunction/ng-file-storage` | Components for managing files and related operations |
| [export-service](./packages/Angular/Generic/export-service/README.md) | `@memberjunction/ng-export-service` | Export service and dialog for exporting data to Excel, CSV, and JSON |
| [list-management](./packages/Angular/Generic/list-management/README.md) | `@memberjunction/ng-list-management` | Components for managing entity list membership with responsive UI |
| [react](./packages/Angular/Generic/react/README.md) | `@memberjunction/ng-react` | Angular components for hosting React components in MemberJunction applications |
| [user-avatar](./packages/Angular/Generic/user-avatar/README.md) | `@memberjunction/ng-user-avatar` | User Avatar Service -- manages user avatar synchronization from auth providers and avatar operations |
| [versions](./packages/Angular/Generic/versions/README.md) | `@memberjunction/ng-versions` | Version History Components -- label creation, detail viewing, and slide panel |

### [APIKeys](./packages/APIKeys/README.md)

Server-side API key authorization with hierarchical scopes and pattern-based access control (2 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [Base](./packages/APIKeys/Base/README.md) | `@memberjunction/api-keys-base` | Metadata caching for API scopes, applications, and key bindings (client or server) |
| [Engine](./packages/APIKeys/Engine/README.md) | `@memberjunction/api-keys` | Server-side authorization engine with hierarchical scopes and application-level restrictions |

### [Communication](./packages/Communication/README.md)

Multi-channel messaging -- message composition, delivery, and entity-level integration (10 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./packages/Communication/base-types/README.md) | `@memberjunction/communication-types` | Core interfaces, base provider abstract class, message/recipient types, and template integration types |
| [engine](./packages/Communication/engine/README.md) | `@memberjunction/communication-engine` | Main communication engine -- provider management, template rendering, message orchestration, and batch processing |
| [entity-comm-base](./packages/Communication/entity-comm-base/README.md) | `@memberjunction/entity-communications-base` | Base types for client/server use with the Entity Communications Engine |
| [entity-comm-client](./packages/Communication/entity-comm-client/README.md) | `@memberjunction/entity-communications-client` | Client-side GraphQL integration for entity communications and template preview |
| [entity-comm-server](./packages/Communication/entity-comm-server/README.md) | `@memberjunction/entity-communications-server` | Server-side bridge between the MJ entities framework and the communication framework |
| [notifications](./packages/Communication/notifications/README.md) | `@memberjunction/notifications` | Unified notification system with multi-channel delivery via the communication engine |

#### [Communication / Providers](./packages/Communication/providers/README.md)

Email and SMS delivery provider implementations.

| Package | npm | Description |
|---------|-----|-------------|
| [gmail](./packages/Communication/providers/gmail/README.md) | `@memberjunction/communication-gmail` | Gmail/Google Suite provider for MemberJunction Communication framework |
| [MSGraph](./packages/Communication/providers/MSGraph/README.md) | `@memberjunction/communication-ms-graph` | Microsoft Graph provider for the MJ Communication framework |
| [sendgrid](./packages/Communication/providers/sendgrid/README.md) | `@memberjunction/communication-sendgrid` | SendGrid provider for the MJ Communication framework |
| [twilio](./packages/Communication/providers/twilio/README.md) | `@memberjunction/communication-twilio` | Twilio provider for MemberJunction Communication framework |

### [Credentials](./packages/Credentials/)

Secure credential management (1 package).

| Package | npm | Description |
|---------|-----|-------------|
| [Engine](./packages/Credentials/Engine/) | `@memberjunction/credentials` | Credential Engine - secure credential management with caching, encryption, and audit logging |

### [React](./packages/React/README.md)

React component infrastructure for the MemberJunction platform (2 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [runtime](./packages/React/runtime/README.md) | `@memberjunction/react-runtime` | Platform-agnostic component runtime with Babel compilation, registry, and error boundaries |
| [test-harness](./packages/React/test-harness/README.md) | `@memberjunction/react-test-harness` | Playwright-based test harness for validating React components |

### [Scheduling](./packages/Scheduling/README.md)

Distributed scheduled-jobs system with cron-based scheduling and plugin-based execution (4 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./packages/Scheduling/base-types/README.md) | `@memberjunction/scheduling-base-types` | Core type definitions and interfaces for the scheduled jobs system (zero heavy dependencies) |
| [base-engine](./packages/Scheduling/base-engine/README.md) | `@memberjunction/scheduling-engine-base` | Metadata caching layer and adaptive polling interval calculation |
| [engine](./packages/Scheduling/engine/README.md) | `@memberjunction/scheduling-engine` | Server-side execution engine with distributed locking and driver-based job execution |
| [actions](./packages/Scheduling/actions/README.md) | `@memberjunction/scheduling-actions` | MJ Actions for programmatic job management (query, create, update, delete, execute, statistics) |

### [Templates](./packages/Templates/README.md)

Extensible templating engine with AI-powered content generation (2 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./packages/Templates/base-types/README.md) | `@memberjunction/templates-base-types` | Core types, base classes, and metadata management for client/server use |
| [engine](./packages/Templates/engine/README.md) | `@memberjunction/templates` | Template rendering engine with Nunjucks integration, AI prompts, and template embedding |

### [TestingFramework](./packages/TestingFramework/README.md)

Metadata-driven testing framework supporting agent evals and multi-oracle evaluation (3 packages).

| Package | npm | Description |
|---------|-----|-------------|
| [EngineBase](./packages/TestingFramework/EngineBase/README.md) | `@memberjunction/testing-engine-base` | Metadata cache for test types, suites, and tests (UI-safe, no execution logic) |
| [Engine](./packages/TestingFramework/Engine/README.md) | `@memberjunction/testing-engine` | Core test execution and evaluation engine supporting multiple test types |
| [CLI](./packages/TestingFramework/CLI/README.md) | `@memberjunction/testing-cli` | Command-line interface for test execution and management |

### Standalone Packages

Packages at the top level of the `packages/` directory, not part of a multi-package group.

#### Core Framework

| Package | npm | Description |
|---------|-----|-------------|
| [MJGlobal](./packages/MJGlobal/) | `@memberjunction/global` | Global class factory and event system -- required by all other MJ components |
| [MJCore](./packages/MJCore/) | `@memberjunction/core` | Core metadata engine, entity framework, and utilities |
| [MJCoreEntities](./packages/MJCoreEntities/) | `@memberjunction/core-entities` | Entity subclasses for the MJ metadata layer (core schema) |
| [MJCoreEntitiesServer](./packages/MJCoreEntitiesServer/) | `@memberjunction/core-entities-server` | Server-only entity subclasses for the MJ metadata layer |
| [Config](./packages/Config/) | `@memberjunction/config` | Central configuration with default configs and merge utilities |

#### Data Layer

| Package | npm | Description |
|---------|-----|-------------|
| [SQLServerDataProvider](./packages/SQLServerDataProvider/) | `@memberjunction/sqlserver-dataprovider` | SQL Server data provider |
| [GraphQLDataProvider](./packages/GraphQLDataProvider/) | `@memberjunction/graphql-dataprovider` | GraphQL client data provider |
| [MJDataContext](./packages/MJDataContext/) | `@memberjunction/data-context` | Runtime data context loading and cross-tier interaction types |
| [MJDataContextServer](./packages/MJDataContextServer/) | `@memberjunction/data-context-server` | Server-side data context implementation with raw SQL support |
| [MJStorage](./packages/MJStorage/) | `@memberjunction/storage` | Cloud storage provider interface for server-side API integration |

#### Server

| Package | npm | Description |
|---------|-----|-------------|
| [MJServer](./packages/MJServer/) | `@memberjunction/server` | GraphQL API access to the MemberJunction data store |
| [ServerBootstrap](./packages/ServerBootstrap/) | `@memberjunction/server-bootstrap` | Server initialization logic and class registration manifests |
| [ServerBootstrapLite](./packages/ServerBootstrapLite/) | `@memberjunction/server-bootstrap-lite` | Lightweight server bootstrap without ESM-incompatible dependencies |
| [MJAPI](./packages/MJAPI/) | `mj_api` | MemberJunction API server application |

#### Code Generation and Tooling

| Package | npm | Description |
|---------|-----|-------------|
| [CodeGenLib](./packages/CodeGenLib/) | `@memberjunction/codegen-lib` | Reusable code generation library for the MemberJunction platform |
| [MJCodeGenAPI](./packages/MJCodeGenAPI/) | `mj_codegen_api` | API engine for MemberJunction CodeGen |
| [GeneratedEntities](./packages/GeneratedEntities/) | `mj_generatedentities` | Auto-generated entity subclasses maintained by CodeGen |
| [GeneratedActions](./packages/GeneratedActions/) | `mj_generatedactions` | Auto-generated action subclasses maintained by CodeGen |

#### Client Applications

| Package | npm | Description |
|---------|-----|-------------|
| [MJExplorer](./packages/MJExplorer/) | `mj_explorer` | MemberJunction Explorer UI (Angular) |
| [MJCLI](./packages/MJCLI/) | `@memberjunction/cli` | MemberJunction command-line tools |
| [AngularElements](./packages/AngularElements/) | `mj_angular_elements_demo` | Angular Elements demo application |

#### Utilities

| Package | npm | Description |
|---------|-----|-------------|
| [ComponentRegistry](./packages/ComponentRegistry/) | `@memberjunction/component-registry-server` | Component registry server API implementation |
| [ComponentRegistryClientSDK](./packages/ComponentRegistryClientSDK/) | `@memberjunction/component-registry-client-sdk` | Component registry client SDK |
| [ContentAutotagging](./packages/ContentAutotagging/) | `@memberjunction/content-autotagging` | Content autotagging application |
| [DBAutoDoc](./packages/DBAutoDoc/) | `@memberjunction/db-auto-doc` | AI-powered database documentation generator for SQL Server, MySQL, and PostgreSQL |
| [DocUtils](./packages/DocUtils/) | `@memberjunction/doc-utils` | Dynamic retrieval and caching of MJ object model documentation |
| [Encryption](./packages/Encryption/) | `@memberjunction/encryption` | Field-level AES-256-GCM/CBC encryption with pluggable key sources |
| [ExternalChangeDetection](./packages/ExternalChangeDetection/) | `@memberjunction/external-change-detection` | Detection of entity changes made by external systems |
| [InteractiveComponents](./packages/InteractiveComponents/) | `@memberjunction/interactive-component-types` | Type specifications for MJ interactive UI components |
| [MetadataSync](./packages/MetadataSync/) | `@memberjunction/metadata-sync` | Metadata synchronization CLI tool |
| [MJExportEngine](./packages/MJExportEngine/) | `@memberjunction/export-engine` | Export engine for Excel, CSV, and JSON with sampling and formatting |
| [MJQueue](./packages/MJQueue/) | `@memberjunction/queue` | Server-side queue management |
| [QueryGen](./packages/QueryGen/) | `@memberjunction/query-gen` | AI-powered SQL query template generation with automatic testing and refinement |
| [SkipTypes](./packages/SkipTypes/) | `@memberjunction/skip-types` | Shared types for the Skip AI Assistant used across MJAPI, Skip API, and Explorer |
| [VersionHistory](./packages/VersionHistory/) | `@memberjunction/version-history` | Label-based versioning, dependency-graph snapshots, cross-entity diffs, and point-in-time restore |

---

<p align="center">
  Built with ❤️ by the MemberJunction community
</p>
