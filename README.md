![](https://memberjunction.com/wp-content/uploads/2022/05/Member-Junction-WEB.jpg)

# MemberJunction (MJ)

MemberJunction (MJ) is an open-source Common Data Platform (CDP) designed to simplify and unify data ingestion from a wide array of sources and types into a singular data repository. Our platform features:

- Rich metadata layer enhancing data utility for analytics, reporting, and AI applications
- MemberJunction Explorer, an advanced tool for power users to navigate, browse, and search unified data
- AI integration with multiple models and providers
- Comprehensive communication framework
- Robust authentication options (MSAL and Auth0)
- Modular monorepo architecture for maintainability and extensibility

MJ is free to use and was specifically designed to support non-profits and associations!

## 📚 Documentation

Extensive documentation is available at [https://docs.memberjunction.org](https://docs.memberjunction.org)

## 🚀 Quick Start

### Prerequisites

- Node.js and npm
- TypeScript
- Angular CLI
- SQL Server database

### Installation

1. Configure your environment by editing `install.config.json` with your database and authentication settings
2. Run the installation script:
   ```
   node InstallMJ.js
   ```

## 🏗️ Monorepo Structure

MemberJunction uses a monorepo structure with multiple packages organized under the `/packages` directory:

### Core Packages

- **@memberjunction/global** - Foundation package required by all MJ components
- **@memberjunction/core** - Main metadata access library
- **@memberjunction/core-entities** - Strongly-typed entity classes
- **@memberjunction/server** - GraphQL API server implementation
- **@memberjunction/cli** - Command-line interface for installation and management

### Data Access

- **@memberjunction/sqlserver-dataprovider** - SQL Server implementation
- **@memberjunction/graphql-dataprovider** - Client-side GraphQL data provider

### AI Framework

- **@memberjunction/ai** - Generic layer for AI model integration
- **AI Providers** - Implementations for OpenAI, Mistral, Anthropic, and others
- **@memberjunction/aiengine** - Higher-level AI functionality
- **Vector Processing** - Tools for working with vector embeddings

### UI Components

- **@memberjunction/ng-explorer-core** - Main Explorer UI package
- **Angular Explorer Components** - Form handling, data grids, and UI utilities
- **Generic UI Components** - Reusable components for custom applications

### Action System

- **@memberjunction/actions** - Base classes for the action system
- **@memberjunction/core-actions** - Standard actions included with MemberJunction
- **Specialized Action Packages** - Content auto-tagging, scheduled actions, etc.

### Communication Framework

- **@memberjunction/communication-types** - Base types for communication
- **@memberjunction/communication-engine** - Processing engine for communications
- **Communication Providers** - Implementations for SendGrid, MSGraph, Gmail, etc.

### Utilities

- **@memberjunction/storage** - File storage utilities
- **@memberjunction/data-context** - Data context management
- **@memberjunction/doc-utils** - Document processing utilities
- **@memberjunction/queue** - Queue management for async processing

## 🛠️ Development

### Build Commands

- Build all packages: `npm run build`
- Build specific packages: `turbo build --filter="@memberjunction/package-name"`
- Watch mode: `npm run watch`
- Start API server: `npm run start:api`
- Start Explorer UI: `npm run start:explorer`

### Lint & Format

- Check with ESLint: `npx eslint packages/path/to/file.ts`
- Format with Prettier: `npx prettier --write packages/path/to/file.ts`

## 🧪 Code Style Guide

- Use TypeScript strict mode and explicit typing
- No explicit `any` types (enforced by ESLint)
- Follow existing naming conventions (PascalCase for classes, camelCase for variables)
- Group imports by type (external, internal, relative)
- Document public APIs with TSDoc comments
- Error handling with meaningful messages
- Follow single responsibility principle

## 🐳 Docker

MemberJunction provides Docker support for deployment:

- Dockerfile for MJAPI in the `docker/MJAPI` directory
- Includes SQL Server tools and Flyway for database migrations
- Configured to use environment variables for customization

## 🔄 Migrations

Database migrations are located in the `migrations` directory and use Flyway:

- Structure files for database schema changes
- Data files for seed and reference data
- Version-controlled migration path

## 🤝 Contributing

We embrace a diverse community of developers and users. Join the discussion at [our forum](https://docs.memberjunction.org/discuss).

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.