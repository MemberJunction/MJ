![](./MJ_logo.webp#gh-light-mode-only)
![](./MJ_logo_dark.png#gh-dark-mode-only)

# MemberJunction (MJ)

MemberJunction (MJ) is an open-source, metadata-driven application development platform that unifies data management, business logic, and user interfaces through a comprehensive Common Data Platform (CDP). Built with TypeScript, Angular, and SQL Server, MemberJunction provides enterprise-grade capabilities while remaining accessible to organizations of all sizes.

## Key Features

- **🗄️ Unified Data Platform** - Integrate data from multiple sources into a singular, well-organized repository
- **📊 Rich Metadata Layer** - Comprehensive metadata system that drives UI generation, validation, and business logic
- **🔍 MemberJunction Explorer** - Powerful web application for browsing, searching, and managing your unified data
- **🤖 AI Integration** - Built-in support for 15+ AI providers including OpenAI, Anthropic, Google, and more
- **📨 Communication Framework** - Send emails, SMS, and messages through multiple providers with template support
- **⚡ Actions System** - Flexible framework for implementing and scheduling custom business logic
- **🔐 Enterprise Security** - Row-level security, field permissions, and integration with Auth0/MSAL
- **🛠️ Developer Friendly** - Full TypeScript, comprehensive APIs, and extensive documentation
- **📦 Modular Architecture** - 100+ npm packages that can be used independently or together

## Why MemberJunction?

MemberJunction was designed to solve common challenges in data management and application development:

- **Eliminate Data Silos** - Bring all your data together in one place
- **Reduce Development Time** - Auto-generate forms, APIs, and documentation from metadata
- **Ensure Consistency** - Single source of truth for data structure and business rules
- **Scale Efficiently** - From small non-profits to large enterprises
- **Stay Flexible** - Extend and customize every aspect of the platform

Originally created to support non-profits and associations, MemberJunction is free to use and open source!

## 📚 Documentation

Extensive documentation is available at [https://docs.memberjunction.org](https://docs.memberjunction.org)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm** 9+
- **SQL Server** 2019+ (or Azure SQL Database)
- **Angular CLI** 18+
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

Comprehensive AI integration supporting 15+ providers:

- **[@memberjunction/ai](./packages/AI/Core)** - Provider-agnostic AI abstractions (works standalone!)
- **[@memberjunction/aiengine](./packages/AI/Engine)** - High-level AI orchestration
- **AI Providers** - OpenAI, Anthropic, Google, Azure, Mistral, and more
- **Vector Operations** - Embeddings, similarity search, duplicate detection
- **Recommendations** - Pluggable recommendation engine

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

100+ Angular components for rapid development:

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

# Build specific package
turbo build --filter="@memberjunction/core"

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
- **PascalCase** for classes and interfaces
- **camelCase** for variables and functions
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

- **Non-Profit Organizations** - Manage members, donors, and programs
- **Associations** - Track memberships, events, and communications
- **Enterprise Applications** - Build custom business applications
- **Data Integration** - Unify data from multiple systems
- **AI Applications** - Build AI-powered features with integrated vector search

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
