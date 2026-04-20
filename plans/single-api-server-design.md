# Single API Server with Server Extensions Architecture

## Overview

This document outlines a design for unifying MemberJunction's multiple server implementations (MJAPI/MJServer, MCP Server, A2A Server) into a single process using a pluggable **Server Extensions** architecture. This approach consolidates infrastructure, simplifies deployment, and provides a consistent pattern for adding new protocol handlers.

## Current State

MemberJunction currently has three separate server implementations:

| Server | Package | Port | Purpose |
|--------|---------|------|---------|
| MJAPI (MJServer) | `@memberjunction/server` | 4000 | GraphQL API, primary data access |
| MCP Server | `@memberjunction/ai-mcp-server` | 3100 | Model Context Protocol for AI tools |
| A2A Server | `@memberjunction/a2aserver` | 3200 | Google Agent-to-Agent protocol |

### Problems with Current Architecture

1. **Redundant Infrastructure**: Each server independently initializes:
   - Database connection pools
   - TypeORM DataSource
   - MemberJunction metadata
   - UserCache
   - Configuration loading

2. **Resource Waste**: Three separate processes consume:
   - 3x memory for metadata caching
   - 3x database connections (pooled)
   - 3x startup time

3. **Deployment Complexity**: Requires managing three services with:
   - Separate environment configurations
   - Independent health checks
   - Multiple port mappings

4. **Inconsistent Patterns**: Each server has different:
   - Authentication middleware
   - Error handling
   - Logging approaches

## Proposed Architecture: Server Extensions

### Core Concept

Transform MJServer into a **host process** that loads protocol handlers as **Server Extensions**. Each extension:
- Registers itself via `@RegisterClass` decorator
- Receives the shared Express app instance
- Mounts its routes at a designated root path
- Shares all core infrastructure (database, metadata, UserCache)

### Database Schema

```sql
-- New table: __mj.ServerExtension
CREATE TABLE ${flyway:defaultSchema}.ServerExtension (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',  -- Pending, Active, Terminated
    DriverClass NVARCHAR(255) NOT NULL,
    RootPath NVARCHAR(100) NOT NULL,  -- e.g., '/mcp', '/a2a'
    Priority INT NOT NULL DEFAULT 100,  -- Load order (lower = earlier)
    Configuration NVARCHAR(MAX) NULL,  -- JSON config specific to extension
    CONSTRAINT PK_ServerExtension PRIMARY KEY (ID),
    CONSTRAINT UQ_ServerExtension_Name UNIQUE (Name),
    CONSTRAINT UQ_ServerExtension_RootPath UNIQUE (RootPath),
    CONSTRAINT CK_ServerExtension_Status CHECK (Status IN ('Pending', 'Active', 'Terminated'))
);
```

### Entity Definition

```typescript
// Entity: MJ: Server Extensions
// Table: __mj.ServerExtension

export interface ServerExtensionFields {
    ID: string;
    Name: string;
    Description: string | null;
    Status: 'Pending' | 'Active' | 'Terminated';
    DriverClass: string;
    RootPath: string;
    Priority: number;
    Configuration: string | null;  // JSON
}
```

### Base Class

```typescript
// packages/MJServer/src/extensions/BaseServerExtension.ts

import { Express, Router } from 'express';
import { UserInfo } from '@memberjunction/core';
import { DataSource } from 'typeorm';

/**
 * Configuration passed to server extensions during initialization
 */
export interface ServerExtensionConfig {
    /** The shared Express application instance */
    app: Express;

    /** TypeORM DataSource for database operations */
    dataSource: DataSource;

    /** Extension-specific configuration from database */
    extensionConfig: Record<string, unknown> | null;

    /** Root path where extension should mount routes */
    rootPath: string;

    /** System user for server-side operations */
    systemUser: UserInfo;
}

/**
 * Result of extension initialization
 */
export interface ExtensionInitResult {
    success: boolean;
    error?: string;
    routesRegistered?: string[];
}

/**
 * Base class for all server extensions.
 * Extensions handle specific protocols (MCP, A2A, etc.) and mount their
 * routes on the shared Express server.
 */
export abstract class BaseServerExtension {
    protected config: ServerExtensionConfig;
    protected router: Router;

    /**
     * Display name of the extension for logging
     */
    abstract get Name(): string;

    /**
     * Version of the extension
     */
    abstract get Version(): string;

    /**
     * Initialize the extension.
     * Called once during server startup with shared infrastructure.
     *
     * @param config - Shared configuration including Express app and DataSource
     * @returns Result indicating success/failure and registered routes
     */
    abstract Initialize(config: ServerExtensionConfig): Promise<ExtensionInitResult>;

    /**
     * Graceful shutdown handler.
     * Called when server is shutting down to clean up extension resources.
     */
    abstract Shutdown(): Promise<void>;

    /**
     * Health check for the extension.
     * Called by the main health endpoint to aggregate extension status.
     */
    abstract HealthCheck(): Promise<{ healthy: boolean; details?: Record<string, unknown> }>;

    /**
     * Optional: Handle configuration updates at runtime.
     * Called when extension configuration is modified in database.
     */
    OnConfigurationChange?(newConfig: Record<string, unknown>): Promise<void>;
}
```

### Extension Registration

```typescript
// packages/AI/MCPServer/src/MCPServerExtension.ts

import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ExtensionInitResult
} from '@memberjunction/server';

@RegisterClass(BaseServerExtension, 'MCPServerExtension')
export class MCPServerExtension extends BaseServerExtension {
    get Name(): string { return 'MCP Server'; }
    get Version(): string { return '1.0.0'; }

    async Initialize(config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        this.config = config;
        this.router = Router();

        try {
            // Register MCP-specific routes
            this.router.get('/sse', this.handleSSE.bind(this));
            this.router.post('/message', this.handleMessage.bind(this));

            // Mount router at root path (e.g., '/mcp')
            config.app.use(config.rootPath, this.router);

            return {
                success: true,
                routesRegistered: [
                    `${config.rootPath}/sse`,
                    `${config.rootPath}/message`
                ]
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to initialize MCP extension: ${error.message}`
            };
        }
    }

    async Shutdown(): Promise<void> {
        // Close any active SSE connections
        // Clean up resources
    }

    async HealthCheck(): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
        return {
            healthy: true,
            details: {
                activeConnections: this.activeConnections.size,
                version: this.Version
            }
        };
    }

    // MCP-specific handlers...
    private handleSSE(req: Request, res: Response): void { /* ... */ }
    private handleMessage(req: Request, res: Response): void { /* ... */ }
}
```

```typescript
// packages/AI/A2AServer/src/A2AServerExtension.ts

@RegisterClass(BaseServerExtension, 'A2AServerExtension')
export class A2AServerExtension extends BaseServerExtension {
    get Name(): string { return 'A2A Server'; }
    get Version(): string { return '1.0.0'; }

    async Initialize(config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        this.config = config;
        this.router = Router();

        try {
            // Register A2A-specific routes
            this.router.get('/agent-card', this.handleAgentCard.bind(this));
            this.router.post('/tasks/send', this.handleTaskSend.bind(this));
            this.router.post('/tasks/sendSubscribe', this.handleTaskSendSubscribe.bind(this));
            this.router.get('/tasks/:taskId', this.handleGetTask.bind(this));
            this.router.post('/tasks/:taskId/cancel', this.handleCancelTask.bind(this));

            // Mount router at root path (e.g., '/a2a')
            config.app.use(config.rootPath, this.router);

            return {
                success: true,
                routesRegistered: [
                    `${config.rootPath}/agent-card`,
                    `${config.rootPath}/tasks/send`,
                    `${config.rootPath}/tasks/sendSubscribe`,
                    `${config.rootPath}/tasks/:taskId`,
                    `${config.rootPath}/tasks/:taskId/cancel`
                ]
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to initialize A2A extension: ${error.message}`
            };
        }
    }

    // A2A-specific handlers...
}
```

### Extension Loader (MJServer)

```typescript
// packages/MJServer/src/extensions/ExtensionLoader.ts

import { ClassFactory } from '@memberjunction/global';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ServerExtensionEntity } from '@memberjunction/core-entities';
import { Express } from 'express';
import { DataSource } from 'typeorm';
import { BaseServerExtension, ServerExtensionConfig } from './BaseServerExtension';
import { LogError, LogStatus } from '@memberjunction/core';

interface LoadedExtension {
    entity: ServerExtensionEntity;
    instance: BaseServerExtension;
}

export class ExtensionLoader {
    private loadedExtensions: LoadedExtension[] = [];

    constructor(
        private app: Express,
        private dataSource: DataSource,
        private systemUser: UserInfo
    ) {}

    /**
     * Load and initialize all active server extensions from the database
     */
    async LoadExtensions(): Promise<void> {
        LogStatus('Loading server extensions...');

        // Query active extensions ordered by priority
        const rv = new RunView();
        const result = await rv.RunView<ServerExtensionEntity>({
            EntityName: 'MJ: Server Extensions',
            ExtraFilter: `Status = 'Active'`,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object'
        }, this.systemUser);

        if (!result.Success) {
            LogError(`Failed to load server extensions: ${result.ErrorMessage}`);
            return;
        }

        const extensions = result.Results;
        LogStatus(`Found ${extensions.length} active server extension(s)`);

        for (const extensionEntity of extensions) {
            await this.LoadSingleExtension(extensionEntity);
        }

        LogStatus(`Successfully loaded ${this.loadedExtensions.length} extension(s)`);
    }

    private async LoadSingleExtension(entity: ServerExtensionEntity): Promise<void> {
        try {
            LogStatus(`Loading extension: ${entity.Name} (${entity.DriverClass})`);

            // Use ClassFactory to instantiate the extension
            const instance = ClassFactory.CreateInstance<BaseServerExtension>(
                BaseServerExtension,
                entity.DriverClass
            );

            if (!instance) {
                LogError(`Failed to create instance of ${entity.DriverClass}`);
                return;
            }

            // Parse extension-specific configuration
            let extensionConfig: Record<string, unknown> | null = null;
            if (entity.Configuration) {
                try {
                    extensionConfig = JSON.parse(entity.Configuration);
                } catch (e) {
                    LogError(`Invalid JSON configuration for ${entity.Name}`);
                }
            }

            // Initialize the extension
            const config: ServerExtensionConfig = {
                app: this.app,
                dataSource: this.dataSource,
                extensionConfig,
                rootPath: entity.RootPath,
                systemUser: this.systemUser
            };

            const initResult = await instance.Initialize(config);

            if (initResult.success) {
                this.loadedExtensions.push({ entity, instance });
                LogStatus(`Extension ${entity.Name} initialized successfully`);
                if (initResult.routesRegistered) {
                    LogStatus(`  Routes: ${initResult.routesRegistered.join(', ')}`);
                }
            } else {
                LogError(`Extension ${entity.Name} failed to initialize: ${initResult.error}`);
            }
        } catch (error) {
            LogError(`Error loading extension ${entity.Name}: ${error.message}`);
        }
    }

    /**
     * Graceful shutdown of all loaded extensions
     */
    async ShutdownAll(): Promise<void> {
        LogStatus('Shutting down server extensions...');

        for (const { entity, instance } of this.loadedExtensions) {
            try {
                await instance.Shutdown();
                LogStatus(`Extension ${entity.Name} shut down successfully`);
            } catch (error) {
                LogError(`Error shutting down ${entity.Name}: ${error.message}`);
            }
        }
    }

    /**
     * Aggregate health check across all extensions
     */
    async HealthCheck(): Promise<Record<string, { healthy: boolean; details?: Record<string, unknown> }>> {
        const health: Record<string, { healthy: boolean; details?: Record<string, unknown> }> = {};

        for (const { entity, instance } of this.loadedExtensions) {
            try {
                health[entity.Name] = await instance.HealthCheck();
            } catch (error) {
                health[entity.Name] = { healthy: false, details: { error: error.message } };
            }
        }

        return health;
    }

    /**
     * Get list of loaded extensions
     */
    get LoadedExtensions(): ReadonlyArray<LoadedExtension> {
        return this.loadedExtensions;
    }
}
```

### Integration with MJServer Startup

```typescript
// packages/MJServer/src/index.ts (modified startup)

import { ExtensionLoader } from './extensions/ExtensionLoader';

async function startServer(): Promise<void> {
    // Existing initialization...
    const app = express();

    // Initialize core infrastructure (database, metadata, etc.)
    await initializeDatabase();
    await initializeMetadata();
    const systemUser = await getSystemUser();

    // Set up GraphQL (existing MJAPI functionality)
    await setupGraphQL(app);

    // Load and initialize server extensions
    const extensionLoader = new ExtensionLoader(app, dataSource, systemUser);
    await extensionLoader.LoadExtensions();

    // Aggregate health endpoint
    app.get('/health', async (req, res) => {
        const coreHealth = await checkCoreHealth();
        const extensionHealth = await extensionLoader.HealthCheck();

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            core: coreHealth,
            extensions: extensionHealth
        });
    });

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
        await extensionLoader.ShutdownAll();
        await shutdownDatabase();
        process.exit(0);
    });

    app.listen(config.port, () => {
        console.log(`MemberJunction Server running on port ${config.port}`);
    });
}
```

## Route Structure

With extensions loaded, the unified server exposes:

```
http://localhost:4000/
├── /graphql           # GraphQL API (MJAPI core)
├── /health            # Aggregate health endpoint
├── /mcp/              # MCP Server Extension
│   ├── /sse          # Server-Sent Events endpoint
│   └── /message      # Message endpoint
└── /a2a/              # A2A Server Extension
    ├── /agent-card   # Agent discovery
    ├── /tasks/send   # Task creation
    └── /tasks/:id    # Task management
```

## Shared Infrastructure

All extensions benefit from shared:

### 1. Database Connection Pool
```typescript
// Single pool shared across all extensions
const pool = new sql.ConnectionPool({
    max: 50,
    min: 5,
    idleTimeoutMillis: 30000
});
```

### 2. Metadata Cache
```typescript
// Single metadata instance
const metadata = new Metadata();
// All extensions use same cached entity definitions
```

### 3. UserCache
```typescript
// Single user cache for authentication
import { UserCache } from '@memberjunction/server';
// Extensions validate API keys against same cache
```

### 4. API Key Authorization
```typescript
// Shared APIKeyEngine instance
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
const engine = GetAPIKeyEngine();
// All extensions use same authorization logic
```

## Configuration

### mj.config.cjs

```javascript
module.exports = {
    // Core server settings
    graphqlPort: 4000,

    // Extension-specific settings (optional overrides)
    serverExtensions: {
        'MCP Server': {
            // MCP-specific config
            maxConnections: 100
        },
        'A2A Server': {
            // A2A-specific config
            agentName: 'MemberJunction',
            streamingEnabled: true
        }
    }
};
```

### Database Records

```sql
-- MCP Server Extension
INSERT INTO __mj.ServerExtension (ID, Name, Description, Status, DriverClass, RootPath, Priority, Configuration)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'MCP Server',
    'Model Context Protocol server for AI tool integration',
    'Active',
    'MCPServerExtension',
    '/mcp',
    10,
    '{"maxConnections": 100}'
);

-- A2A Server Extension
INSERT INTO __mj.ServerExtension (ID, Name, Description, Status, DriverClass, RootPath, Priority, Configuration)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'A2A Server',
    'Google Agent-to-Agent protocol server',
    'Active',
    'A2AServerExtension',
    '/a2a',
    20,
    '{"agentName": "MemberJunction", "streamingEnabled": true}'
);
```

## Extension Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     MJServer Startup                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. Initialize Express app                                        │
│ 2. Connect to database, create connection pool                   │
│ 3. Initialize TypeORM DataSource                                 │
│ 4. Load MemberJunction metadata                                  │
│ 5. Set up GraphQL (core MJAPI)                                  │
│ 6. Create ExtensionLoader                                        │
│    └─> Query __mj.ServerExtension WHERE Status = 'Active'        │
│    └─> For each extension (ordered by Priority):                 │
│        ├─> ClassFactory.CreateInstance(DriverClass)              │
│        ├─> extension.Initialize(config)                          │
│        │   └─> Extension registers routes on shared app          │
│        └─> Track loaded extension                                │
│ 7. Start listening on configured port                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Runtime Operation                            │
├─────────────────────────────────────────────────────────────────┤
│ • Requests routed to appropriate handler based on path           │
│ • /graphql → MJAPI GraphQL resolver                              │
│ • /mcp/* → MCPServerExtension handlers                           │
│ • /a2a/* → A2AServerExtension handlers                           │
│ • All extensions share same DB pool, metadata, UserCache         │
│ • API key validation uses shared APIKeyEngine                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Graceful Shutdown                            │
├─────────────────────────────────────────────────────────────────┤
│ 1. Receive SIGTERM/SIGINT                                        │
│ 2. ExtensionLoader.ShutdownAll()                                 │
│    └─> For each loaded extension:                                │
│        └─> extension.Shutdown()                                  │
│            ├─> Close active connections                          │
│            └─> Clean up resources                                │
│ 3. Close database connection pool                                │
│ 4. Exit process                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Benefits

### 1. Resource Efficiency
- **Single connection pool**: 50 connections shared vs 150 across 3 servers
- **Single metadata cache**: ~50MB saved per instance
- **Single process**: Reduced memory footprint and container resources

### 2. Simplified Deployment
- **One service to manage**: Single health check, single log stream
- **Single port**: Easier firewall/load balancer configuration
- **Unified configuration**: One config file for all protocols

### 3. Consistent Patterns
- **Shared middleware**: Authentication, logging, error handling
- **Unified health checks**: Single endpoint for all protocols
- **Common authorization**: API key scopes enforced consistently

### 4. Extensibility
- **Easy to add new protocols**: Just create new extension class
- **Database-driven**: Enable/disable extensions without code changes
- **Hot-reloadable**: Future support for runtime extension updates

## Migration Path

### Phase 1: Create Infrastructure
1. Create `__mj.ServerExtension` table and entity
2. Implement `BaseServerExtension` class
3. Implement `ExtensionLoader` in MJServer
4. Add extension loading to MJServer startup

### Phase 2: Refactor MCP Server
1. Create `MCPServerExtension` class extending `BaseServerExtension`
2. Move MCP route handlers to extension methods
3. Remove standalone server initialization
4. Test MCP functionality via unified server

### Phase 3: Refactor A2A Server
1. Create `A2AServerExtension` class extending `BaseServerExtension`
2. Move A2A route handlers to extension methods
3. Remove standalone server initialization
4. Test A2A functionality via unified server

### Phase 4: Cleanup
1. Deprecate standalone MCP and A2A server entry points
2. Update documentation
3. Remove redundant initialization code from packages
4. Update deployment configurations

## Future Enhancements

### Runtime Extension Management
- Hot-reload extensions without server restart
- Enable/disable extensions via API
- Extension metrics and monitoring

### Extension Dependencies
- Declare dependencies between extensions
- Automatic load ordering based on dependencies
- Shared services between extensions

### Extension Marketplace
- Package and distribute custom extensions
- Version management for extensions
- Extension update mechanism

## Conclusion

The Server Extensions architecture transforms MJServer into a unified, extensible platform that can host multiple protocol handlers while sharing core infrastructure. This approach reduces resource consumption, simplifies deployment, and provides a consistent pattern for adding new capabilities to MemberJunction.

The design leverages existing MemberJunction patterns (`@RegisterClass`, `ClassFactory`, entity system) to maintain consistency with the broader codebase while enabling a more efficient and maintainable server architecture.
