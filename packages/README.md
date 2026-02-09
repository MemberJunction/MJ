# MemberJunction Packages

MemberJunction is an open-source platform for building intelligent, metadata-driven applications. This directory contains all packages in the MemberJunction monorepo.

## Directory Overview

### Package Groups (Multi-Package Directories)

| Directory | Packages | Description |
|-----------|----------|-------------|
| [Actions](./Actions/README.md) | 13 | Metadata-driven action framework for workflows, agents, and automation |
| [AI](./AI/README.md) | 42 | AI infrastructure — model abstractions, providers, vectors, agents, and tools |
| [Angular](./Angular/README.md) | 61 | Angular UI framework — Explorer app, reusable components, and Bootstrap |
| [APIKeys](./APIKeys/README.md) | 2 | Server-side API key authorization with hierarchical scopes and pattern-based access control |
| [Communication](./Communication/README.md) | 10 | Multi-channel messaging — message composition, delivery, and entity-level integration |
| [Credentials](./Credentials/) | 1 | Secure credential management with caching, encryption, and audit logging |
| [React](./React/README.md) | 2 | React component runtime and automated testing infrastructure |
| [Scheduling](./Scheduling/README.md) | 4 | Distributed scheduled-jobs system with cron-based scheduling and plugin-based execution |
| [Templates](./Templates/README.md) | 2 | Extensible templating engine with AI-powered content generation |
| [TestingFramework](./TestingFramework/README.md) | 3 | Metadata-driven testing framework supporting agent evals and multi-oracle evaluation |

### Standalone Packages

#### Core Framework

| Package | npm | Description |
|---------|-----|-------------|
| [MJGlobal](./MJGlobal/) | `@memberjunction/global` | Global class factory and event system — required by all other MJ components |
| [MJCore](./MJCore/) | `@memberjunction/core` | Core metadata engine, entity framework, and utilities |
| [MJCoreEntities](./MJCoreEntities/) | `@memberjunction/core-entities` | Entity subclasses for the MJ metadata layer (core schema) |
| [MJCoreEntitiesServer](./MJCoreEntitiesServer/) | `@memberjunction/core-entities-server` | Server-only entity subclasses for the MJ metadata layer |
| [Config](./Config/) | `@memberjunction/config` | Central configuration with default configs and merge utilities |

#### Data Layer

| Package | npm | Description |
|---------|-----|-------------|
| [SQLServerDataProvider](./SQLServerDataProvider/) | `@memberjunction/sqlserver-dataprovider` | SQL Server data provider |
| [GraphQLDataProvider](./GraphQLDataProvider/) | `@memberjunction/graphql-dataprovider` | GraphQL client data provider |
| [MJDataContext](./MJDataContext/) | `@memberjunction/data-context` | Runtime data context loading and cross-tier interaction types |
| [MJDataContextServer](./MJDataContextServer/) | `@memberjunction/data-context-server` | Server-side data context implementation with raw SQL support |
| [MJStorage](./MJStorage/) | `@memberjunction/storage` | Cloud storage provider interface for server-side API integration |

#### Server

| Package | npm | Description |
|---------|-----|-------------|
| [MJServer](./MJServer/) | `@memberjunction/server` | GraphQL API access to the MemberJunction data store |
| [ServerBootstrap](./ServerBootstrap/) | `@memberjunction/server-bootstrap` | Server initialization logic and class registration manifests |
| [ServerBootstrapLite](./ServerBootstrapLite/) | `@memberjunction/server-bootstrap-lite` | Lightweight server bootstrap without ESM-incompatible dependencies |
| [MJAPI](./MJAPI/) | `mj_api` | MemberJunction API server application |

#### Code Generation and Tooling

| Package | npm | Description |
|---------|-----|-------------|
| [CodeGenLib](./CodeGenLib/) | `@memberjunction/codegen-lib` | Reusable code generation library for the MemberJunction platform |
| [MJCodeGenAPI](./MJCodeGenAPI/) | `mj_codegen_api` | API engine for MemberJunction CodeGen |
| [GeneratedEntities](./GeneratedEntities/) | `mj_generatedentities` | Auto-generated entity subclasses maintained by CodeGen |
| [GeneratedActions](./GeneratedActions/) | `mj_generatedactions` | Auto-generated action subclasses maintained by CodeGen |

#### Client Applications

| Package | npm | Description |
|---------|-----|-------------|
| [MJExplorer](./MJExplorer/) | `mj_explorer` | MemberJunction Explorer UI (Angular) |
| [MJCLI](./MJCLI/) | `@memberjunction/cli` | MemberJunction command-line tools |
| [AngularElements](./AngularElements/) | `mj_angular_elements_demo` | Angular Elements demo application |

#### Utilities

| Package | npm | Description |
|---------|-----|-------------|
| [ComponentRegistry](./ComponentRegistry/) | `@memberjunction/component-registry-server` | Component registry server API implementation |
| [ComponentRegistryClientSDK](./ComponentRegistryClientSDK/) | `@memberjunction/component-registry-client-sdk` | Component registry client SDK |
| [ContentAutotagging](./ContentAutotagging/) | `@memberjunction/content-autotagging` | Content autotagging application |
| [DBAutoDoc](./DBAutoDoc/) | `@memberjunction/db-auto-doc` | AI-powered database documentation generator for SQL Server, MySQL, and PostgreSQL |
| [DocUtils](./DocUtils/) | `@memberjunction/doc-utils` | Dynamic retrieval and caching of MJ object model documentation |
| [Encryption](./Encryption/) | `@memberjunction/encryption` | Field-level AES-256-GCM/CBC encryption with pluggable key sources |
| [ExternalChangeDetection](./ExternalChangeDetection/) | `@memberjunction/external-change-detection` | Detection of entity changes made by external systems |
| [InteractiveComponents](./InteractiveComponents/) | `@memberjunction/interactive-component-types` | Type specifications for MJ interactive UI components |
| [MetadataSync](./MetadataSync/) | `@memberjunction/metadata-sync` | Metadata synchronization CLI tool |
| [MJExportEngine](./MJExportEngine/) | `@memberjunction/export-engine` | Export engine for Excel, CSV, and JSON with sampling and formatting |
| [MJQueue](./MJQueue/) | `@memberjunction/queue` | Server-side queue management |
| [QueryGen](./QueryGen/) | `@memberjunction/query-gen` | AI-powered SQL query template generation with automatic testing and refinement |
| [SkipTypes](./SkipTypes/) | `@memberjunction/skip-types` | Shared types for the Skip AI Assistant used across MJAPI, Skip API, and Explorer |
| [VersionHistory](./VersionHistory/) | `@memberjunction/version-history` | Label-based versioning, dependency-graph snapshots, cross-entity diffs, and point-in-time restore |

## Build System

This monorepo uses [Turborepo](https://turbo.build/) for orchestrating builds across all packages. Key commands from the repository root:

| Command | Purpose |
|---------|---------|
| `npm run build` | Build all packages in dependency order |
| `npm run watch` | Watch mode for development |
| `npm run start:api` | Start the MJAPI server |
| `npm run start:explorer` | Start the MJExplorer UI dev server |

To build an individual package, run `npm run build` from within that package's directory.

## Package Naming Conventions

- **`@memberjunction/*`** — Published framework packages intended for external consumption
- **`mj_*`** — Application-level packages (API server, Explorer, CodeGen output) not published to npm
