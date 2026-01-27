# @memberjunction/server

The `@memberjunction/server` library provides a comprehensive API server for MemberJunction, featuring both GraphQL and REST APIs. It includes all the functions required to start up the server, manage authentication, handle database connections, and provide a robust interface for accessing and managing metadata within MemberJunction.

## Key Features

- **Dual API Support**: Both GraphQL and REST APIs with consistent authentication
- **Multi-Database Support**: Read-write and optional read-only database connections
- **Advanced Authentication**: Support for MSAL (Azure AD) and Auth0 authentication providers
- **Transaction Management**: Automatic transaction wrapper for GraphQL mutations
- **Type-Safe Resolvers**: Full TypeScript support with type-graphql integration
- **Entity Management**: Comprehensive CRUD operations with change tracking
- **Real-time Support**: WebSocket subscriptions for GraphQL
- **Compression**: Built-in response compression for better performance
- **Extensible Architecture**: Support for custom resolvers and entity subclasses
- **AI Integration**: Built-in support for AI operations, prompts, agents, and embeddings
- **Security Features**: Entity-level and schema-level access control for REST API
- **SQL Logging**: Runtime SQL logging configuration and session management for debugging

## Installation

```shell
npm install @memberjunction/server
```

## Dependencies

This package depends on several core MemberJunction packages:
- `@memberjunction/core`: Core functionality and metadata management
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `@memberjunction/graphql-dataprovider`: GraphQL data provider
- `@memberjunction/ai`: AI engine integration
- Various other MJ packages for specific functionality

## Configuration

The server uses configuration from its environment

| Env variable             | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| DB_HOST                  | The hostname for the common data store database              |
| DB_PORT                  | The port for the common data store database (default 1433)   |
| DB_USERNAME              | The username used to authenticate with the common data store |
| DB_PASSWORD              | The password used to authenticate with the common data store |
| DB_DATABASE              | The common data store database name                          |
| PORT                     | The port used by the server (default 4000)                   |
| ROOT_PATH                | The GraphQL root path (default /)                            |
| WEB_CLIENT_ID            | The client ID used for MSAL authentication                   |
| TENANT_ID                | The tenant ID used for MSAL authentication                   |
| ENABLE_INTROSPECTION     | A flag to allow GraphQL introspection (default false)        |
| WEBSITE_RUN_FROM_PACKAGE | An Azure flag to indicate a read-only file system            |
| AUTH0_DOMAIN             | The Auth0 domain                                             |
| AUTH0_CLIENT_ID          | The Auth0 Client ID                                          |
| AUTH0_CLIENT_SECRET      | The Auth0 Client secret                                      |
| MJ_CORE_SCHEMA           | The core schema to use for the data provider                 |
| CONFIG_FILE              | An absolute path to the config file json                     |
| DB_READ_ONLY_USERNAME    | Username for read-only database connection (optional)        |
| DB_READ_ONLY_PASSWORD    | Password for read-only database connection (optional)        |

### REST API

In addition to the GraphQL API, MemberJunction provides a REST API for applications that prefer RESTful architecture. By default, the REST API is enabled but can be disabled.

For comprehensive documentation on the REST API, including configuration options, security controls, and available endpoints, see [REST_API.md](./REST_API.md).

The REST API supports:
- Standard CRUD operations for entities
- View operations for data retrieval
- Metadata exploration
- Wildcard pattern matching for entity filtering
- Schema-level access control
- Comprehensive security configuration


## Usage

### Basic Server Setup

Import the `serve` function from the package and run it as part of the server's main function. The function accepts an array of absolute paths to the resolver code.

```ts
import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';

const localPath = (p: string) => resolve(__dirname, p);

const resolverPaths = [
  'resolvers/**/*Resolver.{js,ts}',
  'generic/*Resolver.{js,ts}',
  'generated/generated.ts',
]

serve(resolverPaths.map(localPath));
```

### Advanced Server Options

The `serve` function accepts an optional `MJServerOptions` object:

```typescript
import { serve, MJServerOptions } from '@memberjunction/server';

const options: MJServerOptions = {
  onBeforeServe: async () => {
    // Custom initialization logic
    console.log('Server is about to start...');
  },
  restApiOptions: {
    enabled: true,
    includeEntities: ['User*', 'Entity*'],
    excludeEntities: ['Password', 'APIKey*'],
    includeSchemas: ['public'],
    excludeSchemas: ['internal']
  }
};

serve(resolverPaths.map(localPath), createApp(), options);
```

### Transaction Management

MJServer provides automatic transaction management for all GraphQL mutations with full support for multi-user environments through per-request provider instances.

#### Per-Request Provider Architecture

Each GraphQL request receives its own SQLServerDataProvider instance, ensuring complete isolation between concurrent requests:

```typescript
// Each request automatically:
// 1. Creates a new SQLServerDataProvider instance
// 2. Reuses cached metadata for fast initialization
// 3. Has isolated transaction state within the provider
// 4. Gets garbage collected after request completion

mutation {
  CreateUser(input: { FirstName: "John", LastName: "Doe" }) {
    ID
  }
  CreateUserRole(input: { UserID: "...", RoleID: "..." }) {
    ID
  }
}
// Both operations execute within the same provider's transaction
// Success: Both committed together
// Error: Both rolled back together
```

#### Key Transaction Features

- **Provider Isolation**: Each request has its own data provider instance
- **Automatic Management**: Transactions are automatically started, committed, or rolled back
- **Multi-User Safety**: Concurrent requests have completely isolated provider instances
- **Zero Configuration**: No transaction IDs or scope management needed
- **Efficient**: Metadata caching makes provider creation lightweight
- **Nested Support**: Providers use SQL Server savepoints for nested transaction logic

### Provider Configuration

MJServer automatically creates per-request SQLServerDataProvider instances for optimal isolation and performance:

```typescript
// In each GraphQL request context:
const provider = new SQLServerDataProvider();
await provider.Config({
  connectionPool: pool,
  MJCoreSchemaName: '__mj',
  ignoreExistingMetadata: false  // Reuse cached metadata
});

// Provider is included in AppContext
context.providers = [{
  provider: provider,
  type: 'Read-Write'
}];
```

#### Provider Types

The AppContext supports multiple providers with different access levels:

```typescript
export type AppContext = {
  dataSource: sql.ConnectionPool;  // Legacy, for backward compatibility
  userPayload: UserPayload;
  dataSources: DataSourceInfo[];
  providers: Array<ProviderInfo>;  // Per-request provider instances
};

export class ProviderInfo {
  provider: DatabaseProviderBase;
  type: 'Admin' | 'Read-Write' | 'Read-Only' | 'Other';
}
```

### Custom New User Behavior

The behavior to handle new users can be customized by subclassing the `NewUserBase` class. The subclass can pre-process, post-process or entirely override the base class behavior as needed. Import the class before calling `serve` to ensure the class is registered.

`index.ts`

```ts
import { serve } from '@memberjunction/server';
import { resolve } from 'node:path';

import './auth/exampleNewUserSubClass'; // make sure this new class gets registered

// ...
```


`auth/exampleNewUserSubClass.ts`

```ts
import { LogError, Metadata, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { NewUserBase, configInfo } from '@memberjunction/server';
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

/**
 * This example class subclasses the @NewUserBase class and overrides the createNewUser method to create a new person record and then call the base class to create the user record. In this example there is an entity
 * called "Persons" that is mapped to the User table in the core MemberJunction schema. You can sub-class the NewUserBase to do whatever behavior you want and pre-process, post-process or entirely override the base
 * class behavior.
 */
@RegisterClass(NewUserBase, undefined, 1) /*by putting 1 into the priority setting, MJGlobal ClassFactory will use this instead of the base class as that registration had no priority*/
export class ExampleNewUserSubClass extends NewUserBase {
    public override async createNewUser(firstName: string, lastName: string, email: string) {
        try {
            const md = new Metadata();
            const contextUser = UserCache.Instance.Users.find(u => u.Email.trim().toLowerCase() === configInfo?.userHandling?.contextUserForNewUserCreation?.trim().toLowerCase())
            if(!contextUser) {
                LogError(`Failed to load context user ${configInfo?.userHandling?.contextUserForNewUserCreation}, if you've not specified this on your config.json you must do so. This is the user that is contextually used for creating a new user record dynamically.`);
                return undefined;
            }

            const pEntity = md.Entities.find(e => e.Name === 'Persons'); // look up the entity info for the Persons entity
            if (!pEntity) {
                LogError('Failed to find Persons entity');
                return undefined;
            }

            let personId;
            // this block of code only executes if we have an entity called Persons
            const rv = new RunView();
            const viewResults = await rv.RunView({
                EntityName: 'Persons',
                ExtraFilter: `Email = '${email}'`
            }, contextUser)
    
            if (viewResults && viewResults.Success && Array.isArray(viewResults.Results) && viewResults.Results.length > 0) {
                // we have a match so use it
                const row = (viewResults.Results as { ID: number }[])[0]; // we know the rows will have an ID number
                personId = row['ID'];
            }
    
            if (!personId) {
                // we don't have a match so create a new person record
                const p = await md.GetEntityObject('Persons', contextUser);
                p.NewRecord(); // assumes we have an entity called Persons that has FirstName/LastName/Email fields
                p.FirstName = firstName;
                p.LastName = lastName;
                p.Email = email;
                p.Status = 'active';
                if (await p.Save()) {
                    personId = p.ID;
                }   
                else {
                    LogError(`Failed to create new person ${firstName} ${lastName} ${email}`)
                }
            }
    
            // now call the base class to create the user, and pass in our LinkedRecordType and ID
            return super.createNewUser(firstName, lastName, email, 'Other', pEntity?.ID, personId);        
        }
        catch (e) {
            LogError(`Error creating new user ${email} ${e}`);
            return undefined;
        }
    }
}
```

## API Documentation

### Core Exports

The package exports numerous utilities and types:

#### Server Functions
- `serve(resolverPaths: string[], app?: Express, options?: MJServerOptions)`: Main server initialization
- `createApp()`: Creates an Express application instance

#### Authentication
- `NewUserBase`: Base class for custom new user handling
- `TokenExpiredError`: Token expiration error class
- `getSystemUser(dataSource?: DataSource)`: Get system user for operations

#### Resolvers and Base Classes
- `ResolverBase`: Base class for custom resolvers
- `RunViewResolver`: Base resolver for view operations
- `PushStatusResolver`: Status update resolver base

#### Type Definitions
- `AppContext`: GraphQL context type
- `DataSourceInfo`: Database connection information
- `KeyValuePairInput`: Generic key-value input type
- `DeleteOptionsInput`: Delete operation options

#### Utility Functions
- `GetReadOnlyDataSource(dataSources: DataSourceInfo[])`: Get read-only data source
- `GetReadWriteDataSource(dataSources: DataSourceInfo[])`: Get read-write data source

### Entity Subclasses

The server includes specialized entity subclasses:
- `UserViewEntityServer`: Server-side user view handling
- `EntityPermissionsEntityServer`: Entity permission management
- `DuplicateRunEntityServer`: Duplicate detection operations
- `ReportEntityServer`: Report generation and management

## AI Integration

The server includes built-in AI capabilities:

### Learning Cycle Scheduler

The server can automatically run AI learning cycles:

```typescript
import { LearningCycleScheduler } from '@memberjunction/server/scheduler';

// In your server initialization
const scheduler = LearningCycleScheduler.Instance;
scheduler.setDataSources(dataSources);
scheduler.start(60); // Run every 60 minutes
```

### AI Resolvers

The server includes comprehensive AI resolvers for various AI operations:

#### RunAIPromptResolver
Handles AI prompt execution with multiple methods:

- `RunAIPrompt`: Execute stored AI prompts with full parameter support
  - Supports temperature, topP, topK, and other model parameters
  - Handles conversation messages and system prompt overrides
  - Returns parsed results, token usage, and execution metadata

- `ExecuteSimplePrompt`: Execute ad-hoc prompts without stored configuration
  - Direct system prompt and message execution
  - Smart model selection based on preferences or power level
  - Automatic JSON extraction from responses
  - Available for both regular users and system users

- `EmbedText`: Generate text embeddings using local models
  - Batch processing support for multiple texts
  - Model size selection (small/medium)
  - Returns vector dimensions and model information
  - Available for both regular users and system users

#### RunAIAgentResolver
- `RunAIAgent`: Execute AI agents for conversational interactions
  - Session management for conversation context
  - Streaming support for real-time responses
  - Progress tracking and partial results
  - Available for both regular users and system users

#### System User Variants
All AI operations have system user variants (queries) that use the `@RequireSystemUser` decorator:
- `RunAIPromptSystemUser`
- `ExecuteSimplePromptSystemUser`
- `EmbedTextSystemUser`
- `RunAIAgentSystemUser`

These allow server-to-server operations with elevated privileges.

#### AskSkipResolver
- `AskSkipResolver`: Handle Skip AI queries

### SQL Logging Resolver

- `SqlLoggingConfigResolver`: Manage SQL logging configuration and sessions

## SQL Logging Management

The server includes a comprehensive SQL logging management system that allows Owner-level users to control SQL statement capture in real-time.

### Key Features

- **Owner-only Access**: SQL logging requires `Type = 'Owner'` privileges
- **Session Management**: Create, monitor, and stop multiple concurrent logging sessions
- **User Filtering**: Capture SQL statements from specific users only
- **Multiple Formats**: Standard SQL logs or migration-ready files
- **Real-time Control**: Start/stop sessions via GraphQL API
- **Automatic Cleanup**: Sessions auto-expire and clean up empty files

### GraphQL Operations

#### Query Configuration

```graphql
query {
  sqlLoggingConfig {
    enabled
    activeSessionCount
    maxActiveSessions
    allowedLogDirectory
    sessionTimeout
    defaultOptions {
      prettyPrint
      statementTypes
      formatAsMigration
      logRecordChangeMetadata
    }
  }
}
```

#### List Active Sessions

```graphql
query {
  activeSqlLoggingSessions {
    id
    sessionName
    filePath
    startTime
    statementCount
    filterByUserId
    options {
      prettyPrint
      statementTypes
      formatAsMigration
    }
  }
}
```

#### Start a New Session

```graphql
mutation {
  startSqlLogging(input: {
    fileName: "debug-session.sql"
    filterToCurrentUser: true
    options: {
      sessionName: "Debug Session"
      prettyPrint: true
      statementTypes: "both"
      formatAsMigration: false
    }
  }) {
    id
    filePath
    sessionName
    startTime
  }
}
```

#### Stop Sessions

```graphql
# Stop specific session
mutation {
  stopSqlLogging(sessionId: "session-id-here")
}

# Stop all sessions
mutation {
  stopAllSqlLogging
}
```

### Security Requirements

All SQL logging operations require:
1. **Authentication**: Valid user session or API key
2. **Authorization**: User must have `Type = 'Owner'` in the Users table
3. **Configuration**: SQL logging must be enabled in server config

### Configuration

SQL logging is configured in `mj.config.cjs`:

```javascript
sqlLogging: {
  enabled: true,  // Master switch
  allowedLogDirectory: './logs/sql',
  maxActiveSessions: 5,
  sessionTimeout: 3600000, // 1 hour
  autoCleanupEmptyFiles: true,
  defaultOptions: {
    formatAsMigration: false,
    statementTypes: 'both',
    prettyPrint: true,
    logRecordChangeMetadata: false,
    retainEmptyLogFiles: false
  }
}
```

## Security Configuration

### Authentication Providers

The server supports multiple authentication providers:

1. **Azure AD (MSAL)**:
   - Set `TENANT_ID` and `WEB_CLIENT_ID` environment variables
   - Supports Microsoft identity platform

2. **Auth0**:
   - Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET`
   - Supports Auth0 authentication

### API Key Authentication

The server supports two types of API key authentication:

#### User API Keys (`X-API-Key` header)

Per-user API keys that authenticate as a specific user. These follow the `mj_sk_*` format and are created via the EncryptionEngine:

```typescript
import { EncryptionEngine } from '@memberjunction/encryption';

// Create a new API key for a user
const result = await EncryptionEngine.Instance.CreateAPIKey({
    userId: 'user-guid-here',
    label: 'My Integration',
    description: 'API key for external integration',
    expiresAt: new Date('2025-12-31') // Optional
}, contextUser);

if (result.success) {
    console.log('API Key:', result.rawKey); // Save this - cannot be recovered!
}
```

Usage:
```bash
curl -H "X-API-Key: mj_sk_abc123..." https://api.example.com/graphql
```

Features:
- Authenticates as the specific user who owns the key
- Supports expiration dates
- Can be revoked individually
- Usage is logged for audit purposes
- `apiKeyId` is included in the request context

#### System API Key (`x-mj-api-key` header)

A single shared API key for system-level operations, configured via the `MJ_API_KEY` environment variable:

```bash
curl -H "x-mj-api-key: your-system-key" https://api.example.com/graphql
```

Features:
- Authenticates as the system user
- Used for server-to-server communication
- Has elevated privileges for system operations
- `isSystemUser: true` is set in the request context

### Access Control

For REST API access control, see the comprehensive documentation in [REST_API.md](./REST_API.md).

## Performance Optimization

### Compression

The server includes built-in compression middleware:
- Responses larger than 1KB are compressed
- Binary files are excluded from compression
- Uses compression level 6 for optimal balance

### Connection Pooling

Database connections are managed with TypeORM's connection pooling. Configure pool size in your TypeORM configuration.

### Caching

The server uses LRU caching for frequently accessed data. Configure cache settings in your `mj.config.cjs`:

```javascript
databaseSettings: {
  metadataCacheRefreshInterval: 300000 // 5 minutes
}
```

## Advanced Configuration

### Custom Directives

The server includes custom GraphQL directives:
- `@RequireSystemUser`: Requires system user permissions
- `@Public`: Makes endpoints publicly accessible

### SQL Logging Integration

The server integrates with the SQLServerDataProvider's logging capabilities:
- Session management through GraphQL resolvers
- Owner-level access control validation
- Real-time session monitoring and control
- Integration with MemberJunction Explorer UI

### WebSocket Configuration

For real-time subscriptions:

```typescript
const webSocketServer = new WebSocketServer({ 
  server: httpServer, 
  path: graphqlRootPath 
});
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure all required environment variables are set
2. **Database Connection**: Verify connection string and credentials
3. **Module Loading**: Check resolver paths are correct and accessible
4. **Transaction Errors**: Review mutation logic for proper error handling
5. **SQL Logging Access**: Ensure user has Owner privileges and logging is enabled in config

### Debug Mode

Enable detailed logging by setting environment variables:
```shell
DEBUG=mj:*
NODE_ENV=development
```

## Best Practices

1. **Use Read-Only Connections**: Configure read-only database connections for query operations
2. **Implement Custom User Handling**: Extend `NewUserBase` for organization-specific user creation
3. **Monitor Performance**: Use the built-in timing logs for transaction monitoring
4. **Secure Your REST API**: Always configure entity and schema filters for production
5. **Handle Errors Gracefully**: Implement proper error handling in custom resolvers

## Contributing

When contributing to this package:
1. Follow the existing code style and patterns
2. Add appropriate TypeScript types
3. Include tests for new functionality
4. Update documentation as needed

## License

ISC