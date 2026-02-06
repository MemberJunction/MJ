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

MemberJunction uses a modular monorepo architecture with 100+ TypeScript packages. Each package is designed to be used independently or as part of the complete platform.

### 📁 Repository Organization

```
MJ/
├── packages/           # All npm packages
│   ├── Actions/       # Action framework packages
│   ├── AI/            # AI integration packages
│   ├── Angular/       # UI components
│   ├── Communication/ # Messaging packages
│   └── ...           # Core and utility packages
├── SQL Scripts/       # Database setup and migrations
├── migrations/        # Flyway migration scripts
└── docs/             # Additional documentation
```

### 🎯 Core Framework

- **[@memberjunction/global](./packages/MJGlobal)** - Foundation utilities, class factory, singleton management
- **[@memberjunction/core](./packages/MJCore)** - Metadata engine, entity management, data access
- **[@memberjunction/core-entities](./packages/MJCoreEntities)** - Strongly-typed entity classes
- **[@memberjunction/server](./packages/MJServer)** - GraphQL API server with authentication
- **[@memberjunction/sqlserver-dataprovider](./packages/SQLServerDataProvider)** - SQL Server data access layer

### 🤖 AI Framework

See the dedicated [AI Capabilities](#-ai-capabilities) section above for full details. Key packages:

- **[@memberjunction/ai](./packages/AI/Core)** - Provider-agnostic AI abstractions (works standalone!)
- **[@memberjunction/aiengine](./packages/AI/Engine)** - High-level AI orchestration
- **[@memberjunction/ai-agents](./packages/AI/Agents)** - Agent framework with sub-agent orchestration
- **[@memberjunction/ai-prompts](./packages/AI/Prompts)** - Prompt management and execution engine
- **[@memberjunction/ai-mcp-server](./packages/AI/MCPServer)** - MCP protocol server
- **15+ [AI Providers](./packages/AI/Providers)** - OpenAI, Anthropic, Google, Groq, Mistral, and more

### 💬 Communication Framework

Multi-channel messaging with template support:

- **[@memberjunction/communication-engine](./packages/Communication/engine)** - Core messaging engine
- **Email Providers** - SendGrid, Microsoft Graph, Gmail
- **SMS/Messaging** - Twilio (SMS, WhatsApp, Messenger)
- **Entity Communications** - Bulk messaging to entity record sets

### ⚡ Actions Framework

Extensible business logic execution:

- **[@memberjunction/actions](./packages/Actions/Engine)** - Action execution engine
- **[@memberjunction/core-actions](./packages/Actions/CoreActions)** - Built-in actions
- **Scheduled Actions** - Cron-based action scheduling
- **Entity Actions** - Lifecycle event handlers

### 🎨 UI Components

100+ Angular 21 components for rapid development (ESBuild/Vite powered):

- **[@memberjunction/ng-explorer-core](./packages/Angular/Explorer/explorer-core)** - Explorer application shell
- **Data Components** - Grids, forms, charts, timelines
- **AI Components** - Chat interfaces, Skip integration
- **Generic Components** - Reusable UI building blocks

### 🔧 Developer Tools

- **[@memberjunction/cli](./packages/MJCLI)** - Command-line tools
- **[@memberjunction/codegen-lib](./packages/CodeGenLib)** - Code generation library
- **Templates Engine** - Nunjucks-based templating
- **Queue System** - Background job processing

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

<p align="center">
  Built with ❤️ by the MemberJunction community
</p>
