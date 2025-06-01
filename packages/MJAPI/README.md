# @memberjunction/server API (MJAPI)

The MemberJunction API (MJAPI) is a lightweight wrapper application that leverages the `@memberjunction/server` package to expose MemberJunction's functionality through GraphQL and REST interfaces. This server provides a comprehensive API for accessing and manipulating data within the MemberJunction ecosystem.

## Overview

MJAPI serves as the primary interface between client applications and the MemberJunction data layer. It provides:

- A GraphQL API for entity operations, view execution, and report generation
- REST API endpoints for all entity operations
- Support for executing entity actions and workflows
- Authentication and authorization mechanisms
- Real-time data updates via WebSocket subscriptions
- Integration with MemberJunction's AI capabilities
- External change detection and synchronization

## Key Features

- **GraphQL API**: Comprehensive GraphQL schema for all MemberJunction entities
- **REST API**: Full REST endpoints for entity CRUD operations
- **Entity Operations**: CRUD operations for all entities with transaction support
- **View Execution**: Run database views with filtering, sorting, and pagination
- **Report Generation**: Execute reports with parameters and formatting options
- **Transaction Support**: Group multiple operations into atomic transactions
- **Subscriptions**: Real-time data updates via WebSocket
- **Authentication**: JWT-based authentication with role-based access control
- **AI Integration**: Built-in support for MemberJunction's AI capabilities
- **Docker Support**: Easy deployment with Docker containers
- **External Change Detection**: Automatic detection and synchronization of external data changes
- **Multi-DataSource Support**: Read-write and read-only database connections

## Prerequisites

- Node.js 18+ (20+ recommended)
- SQL Server database with MemberJunction schema installed
- Access to required services (email, storage, etc.)
- TypeScript 5.4+
- npm 8+

## Installation

### Local Development

1. Clone the repository (if not already part of your project)

2. Install dependencies from the workspace root:
```bash
# From the MemberJunction root directory
npm install
```

3. Create a configuration file (`mj.config.js`, `mj.config.cjs`, or `.mjrc.json`):
```javascript
// mj.config.cjs example
module.exports = {
  dbHost: 'localhost',
  dbPort: 1433,
  dbDatabase: 'MemberJunction',
  dbUsername: 'your_username',
  dbPassword: 'your_password',
  mjCoreSchema: '__mj',
  graphqlPort: 4000,
  databaseSettings: {
    connectionTimeout: 30000,
    requestTimeout: 30000,
    metadataCacheRefreshInterval: 60000
  },
  userHandling: {
    autoCreateNewUsers: false,
    contextUserForNewUserCreation: 'admin@example.com'
  }
};
```

4. Build the project:
```bash
# From the workspace root
npm run build

# Or build just the API
npm run build:api
```

5. Start the server:
```bash
# From the MJAPI directory
npm start
```

### Docker Deployment

1. Build the Docker image:
```bash
docker build -t memberjunction/api -f Dockerfile .
```

2. Run the container:
```bash
docker run -p 4000:4000 --env-file .env memberjunction/api
```

## Configuration

The API server is configured through a configuration file (searched for using [cosmiconfig](https://github.com/davidtheclark/cosmiconfig)) in the following order:
- `mj.config.js`
- `mj.config.cjs`
- `.mjrc.json`
- `.mjrc.yaml`
- `.mjrc.yml`
- `package.json` (in `"mj"` field)

### MJ Server Configuration (mjServerConfig Section)

The MJAPI server uses the `mjServerConfig` section from the unified configuration file (`mj.config.cjs`) in the repository root. This section contains all settings specific to the MemberJunction server functionality.

#### Database Configuration

##### Core Database Settings
- **`dbHost`** (string, default: 'localhost'): Database server hostname
- **`dbPort`** (number, default: 1433): Database server port
- **`dbDatabase`** (string): Database name to connect to
- **`dbUsername`** (string): Primary database username for read-write operations
- **`dbPassword`** (string): Primary database password
- **`dbReadOnlyUsername`** (string, optional): Username for read-only database connections. When provided with `dbReadOnlyPassword`, creates a separate read-only DataSource for query operations
- **`dbReadOnlyPassword`** (string, optional): Password for read-only database connections
- **`dbTrustServerCertificate`** (boolean, default: false): Whether to trust SQL Server certificates without validation
- **`dbInstanceName`** (string, optional): SQL Server instance name for named instances
- **`mjCoreSchema`** (string, default: '__mj'): Name of the MemberJunction core schema

##### Database Performance Settings
- **`databaseSettings.connectionTimeout`** (number): Milliseconds to wait for initial database connection. Used in TypeORM configuration
- **`databaseSettings.requestTimeout`** (number): Milliseconds to wait for individual database queries to complete
- **`databaseSettings.metadataCacheRefreshInterval`** (number): Milliseconds between automatic metadata cache refreshes. Controls how often the system refreshes entity metadata from the database

#### Server Configuration

- **`graphqlPort`** (number, default: 4000): Port for the GraphQL server to listen on
- **`graphqlRootPath`** (string, default: '/'): Root path for GraphQL endpoint
- **`enableIntrospection`** (boolean, default: false): Whether to enable GraphQL introspection in Apollo Server. Should be disabled in production for security
- **`apiKey`** (string, optional): Master API key for server-to-server authentication

#### User Management

##### User Creation and Registration
- **`userHandling.autoCreateNewUsers`** (boolean, default: false): When true, automatically creates new user records in the database when a valid JWT token is received for a user that doesn't exist locally
- **`userHandling.newUserLimitedToAuthorizedDomains`** (boolean, default: false): When true, restricts auto-creation of new users to specific domains defined in `newUserAuthorizedDomains`
- **`userHandling.newUserAuthorizedDomains`** (string[], default: []): Array of domain patterns (supports wildcards like "*.company.com") that are allowed for auto-creating new users
- **`userHandling.newUserRoles`** (string[], default: []): Array of role names to automatically assign to newly created users. Creates UserRole records linking the new user to these roles
- **`userHandling.contextUserForNewUserCreation`** (string, default: ''): Email/username of an existing user to use as the context for creating new users. Falls back to any user with 'Owner' role if not found

##### User Application Access
- **`userHandling.CreateUserApplicationRecords`** (boolean, default: false): When true, automatically creates UserApplication records for new users, giving them access to specified applications
- **`userHandling.UserApplications`** (string[], default: []): Array of application names to grant access to for newly created users when `CreateUserApplicationRecords` is true

##### Cache Management
- **`userHandling.updateCacheWhenNotFound`** (boolean, default: false): When true, refreshes the UserCache when a user is not found, potentially loading recently created users from the database
- **`userHandling.updateCacheWhenNotFoundDelay`** (number, default: 30000): Milliseconds to wait during cache refresh operations. Maximum enforced limit of 30 seconds

#### REST API Configuration

- **`restApiOptions.enabled`** (boolean, default: true): Whether to enable REST API endpoints at all. When false, no REST endpoints are created
- **`restApiOptions.basePath`** (string, default: '/rest'): Base path for REST API endpoints

##### Entity and Schema Filtering
- **`restApiOptions.includeEntities`** (string[], optional): Whitelist of entity names to expose via REST API. Supports wildcards (e.g., "User*"). Only these entities will be accessible
- **`restApiOptions.excludeEntities`** (string[], optional): Blacklist of entity names to exclude from REST API. Supports wildcards. Takes precedence over includeEntities
- **`restApiOptions.includeSchemas`** (string[], optional): Whitelist of database schema names to expose via REST API. Only entities in these schemas will be accessible
- **`restApiOptions.excludeSchemas`** (string[], optional): Blacklist of schema names to exclude from REST API. Takes precedence over includeSchemas

#### UI and Data Viewing

- **`viewingSystem.enableSmartFilters`** (boolean, optional): Enables advanced filtering capabilities in the viewing system

#### Authentication Providers

##### Auth0 Integration
- **`auth0Domain`** (string, optional): Auth0 domain for authentication
- **`auth0WebClientID`** (string, optional): Auth0 web client ID
- **`auth0ClientSecret`** (string, optional): Auth0 client secret

##### Azure AD Integration
- **`webClientID`** (string, optional): Azure AD web client ID for authentication
- **`tenantID`** (string, optional): Azure AD tenant ID for authentication

#### AI Integration (Ask Skip System)

##### Core AI Settings
- **`askSkip.apiKey`** (string, optional): API key for authenticating with Skip AI services
- **`askSkip.orgID`** (string, optional): Organization ID for Skip AI integration
- **`askSkip.organizationInfo`** (string, optional): Additional organization information sent to Skip AI
- **`askSkip.chatURL`** (string, optional): URL endpoint for Skip AI chat interactions

##### Learning Cycle Configuration
- **`askSkip.learningCycleEnabled`** (boolean, default: false): Whether learning cycles are enabled at all
- **`askSkip.learningCycleRunUponStartup`** (boolean, default: false): Whether to start a learning cycle immediately when the server starts
- **`askSkip.learningCycleURL`** (string, optional): URL endpoint for Skip AI learning cycle operations
- **`askSkip.learningCycleIntervalInMinutes`** (number, optional): Minutes between automatic learning cycle runs

##### Entity Data Sharing
- **`askSkip.entitiesToSend.excludeSchemas`** (string[], optional): Schema names to exclude when sending entity metadata to Skip AI
- **`askSkip.entitiesToSend.includeEntitiesFromExcludedSchemas`** (string[], optional): Specific entities to include even if their schema is excluded

#### CodeGen Integration (Internal Use)

- **`___codeGenAPIURL`** (string, optional): URL for CodeGen API submissions (internal use)
- **`___codeGenAPIPort`** (number, default: 3999): Port for CodeGen API (internal use)
- **`___codeGenAPISubmissionDelay`** (number, default: 5000): Delay in milliseconds for CodeGen API submissions

#### Development and Debugging

- **`websiteRunFromPackage`** (number, optional): Controls whether to emit schema files during build
- **`userEmailMap`** (object, optional): JSON object mapping external email addresses to internal ones for development/testing

### Configuration Schema

```typescript
interface MJServerConfig {
  // Database Configuration
  dbHost: string;
  dbPort: number;
  dbDatabase: string;
  dbUsername: string;
  dbPassword: string;
  dbReadOnlyUsername?: string;
  dbReadOnlyPassword?: string;
  dbTrustServerCertificate?: boolean;
  dbInstanceName?: string;
  mjCoreSchema: string;
  
  // Server Configuration
  graphqlPort: number;
  graphqlRootPath?: string;
  enableIntrospection?: boolean;
  apiKey?: string;
  
  // Database Settings
  databaseSettings: {
    connectionTimeout: number;
    requestTimeout: number;
    metadataCacheRefreshInterval: number;
  };
  
  // User Handling
  userHandling: {
    autoCreateNewUsers?: boolean;
    newUserLimitedToAuthorizedDomains?: boolean;
    newUserAuthorizedDomains?: string[];
    newUserRoles?: string[];
    updateCacheWhenNotFound?: boolean;
    updateCacheWhenNotFoundDelay?: number;
    contextUserForNewUserCreation?: string;
    CreateUserApplicationRecords?: boolean;
    UserApplications?: string[];
  };
  
  // Viewing System
  viewingSystem?: {
    enableSmartFilters?: boolean;
  };
  
  // REST API Options
  restApiOptions?: {
    enabled: boolean;
    basePath?: string;
    includeEntities?: string[];
    excludeEntities?: string[];
    includeSchemas?: string[];
    excludeSchemas?: string[];
  };
  
  // Authentication
  auth0Domain?: string;
  auth0WebClientID?: string;
  auth0ClientSecret?: string;
  webClientID?: string;
  tenantID?: string;
  
  // AI Integration (Ask Skip)
  askSkip?: {
    apiKey?: string;
    orgID?: string;
    organizationInfo?: string;
    chatURL?: string;
    learningCycleEnabled?: boolean;
    learningCycleRunUponStartup?: boolean;
    learningCycleURL?: string;
    learningCycleIntervalInMinutes?: number;
    entitiesToSend?: {
      excludeSchemas?: string[];
      includeEntitiesFromExcludedSchemas?: string[];
    };
  };
  
  // CodeGen Integration
  ___codeGenAPIURL?: string;
  ___codeGenAPIPort?: number;
  ___codeGenAPISubmissionDelay?: number;
  
  // Development
  websiteRunFromPackage?: number;
  userEmailMap?: object;
}
```

### Environment Variable Overrides

Some configuration options can be overridden via environment variables:
- `MJ_REST_API_ENABLED`: Enable/disable REST API
- `MJ_REST_API_INCLUDE_ENTITIES`: Comma-separated list of entities to include
- `MJ_REST_API_EXCLUDE_ENTITIES`: Comma-separated list of entities to exclude

## Package Structure

```
packages/MJAPI/
├── src/
│   ├── index.ts              # Main entry point
│   ├── auth/                 # Authentication customizations
│   │   └── exampleNewUserSubClass.ts
│   └── generated/            # Generated GraphQL resolvers
│       └── generated.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Usage

### Starting the Server

```bash
# Using npm script
npm start

# With environment variables
MJ_REST_API_ENABLED=true npm start

# With custom config file location
node --experimental-specifier-resolution=node --import ./register.js -r dotenv/config ./src/index.ts
```

### GraphQL API

The GraphQL API is accessible at `http://localhost:4000/graphql` by default (or your configured host/port). The GraphQL Playground is available at the same URL for interactive exploration.

#### Example Queries

**Fetch User Data:**
```graphql
query {
  entity_User(ID: 1) {
    ID
    FirstName
    LastName
    Email
    Roles {
      ID
      Name
      Description
    }
  }
}
```

**Run a View:**
```graphql
query {
  runView(
    options: {
      EntityName: "vwUsers",
      ExtraFilter: "Status = 'Active'",
      OrderBy: "LastName, FirstName",
      PageSize: 10,
      PageNumber: 1
    }
  ) {
    Success
    RowCount
    TotalRowCount
    Results
  }
}
```

**Execute a Report:**
```graphql
query {
  runReport(
    reportName: "UserActivityReport",
    parameters: {
      StartDate: "2023-01-01",
      EndDate: "2023-12-31"
    }
  ) {
    Success
    Results
    ErrorMessage
  }
}
```

#### Example Mutations

**Create a User:**
```graphql
mutation {
  saveEntity_User(
    entity: {
      ID: 0,
      FirstName: "John",
      LastName: "Doe",
      Email: "john.doe@example.com",
      Status: "Active"
    }
  ) {
    Success
    Entity {
      ID
      FirstName
      LastName
    }
    ErrorMessage
  }
}
```

**Execute an Entity Action:**
```graphql
mutation {
  executeAction(
    entityName: "User",
    actionName: "SendWelcomeEmail",
    entityID: 1,
    parameters: {
      templateID: 123,
      includeAttachments: true
    }
  ) {
    Success
    Results
    ErrorMessage
  }
}
```

### REST API

The REST API is enabled by default and provides comprehensive endpoints for entity operations:

#### Entity Operations
- `GET /api/entity/:entityName/:id` - Get entity by ID
- `POST /api/entity/:entityName` - Create or update entity
- `DELETE /api/entity/:entityName/:id` - Delete entity
- `GET /api/entities/:entityName` - List entities with pagination
- `POST /api/entities/:entityName/bulk` - Bulk operations

#### Views and Reports
- `POST /api/view` - Execute a view with filters
- `GET /api/view/:viewName` - Execute a named view
- `POST /api/report/:reportName` - Run a report
- `GET /api/reports` - List available reports

#### Actions and Workflows
- `POST /api/action/:entityName/:actionName/:id?` - Execute an action
- `GET /api/actions/:entityName` - List available actions for an entity

#### Authentication Headers
All REST API requests require authentication:
```http
Authorization: Bearer <jwt-token>
X-Session-ID: <session-id>
X-MJ-API-Key: <api-key>
```

## Architecture

MJAPI is built as a thin wrapper around the `@memberjunction/server` package, which provides:

- **GraphQL Schema Generation**: Automatic schema generation from MemberJunction metadata
- **Entity Resolvers**: Auto-generated resolvers for all entities
- **Authentication Middleware**: JWT-based authentication and authorization
- **Database Connection Management**: Multi-datasource support with connection pooling
- **REST API Generation**: Automatic REST endpoint generation from entity metadata
- **WebSocket Support**: Real-time subscriptions via GraphQL subscriptions

### Core Dependencies

- `@memberjunction/server`: Core server functionality and GraphQL setup
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `@memberjunction/ai`: AI capabilities integration
- `mj_generatedentities`: Generated entity classes
- `mj_generatedactions`: Generated action classes

## Extending the API

### Adding Custom Resolvers

Create a new resolver file in the `src/resolvers` directory:

```typescript
// src/resolvers/CustomResolver.ts
import { Resolver, Query, Arg } from 'type-graphql';

@Resolver()
export class CustomResolver {
  @Query(() => String)
  async customQuery(@Arg('input') input: string): Promise<string> {
    // Implement your custom logic
    return `Processed: ${input}`;
  }
}
```

Register your resolver in `src/server.ts`:

```typescript
import { CustomResolver } from './resolvers/CustomResolver';

// Add to the resolvers array in buildSchema()
const schema = await buildSchema({
  resolvers: [
    // ... existing resolvers
    CustomResolver
  ],
  // ...
});
```

### Customizing User Creation

The API includes an example of customizing user creation behavior:

```typescript
// Uncomment the import in src/index.ts to enable
import './auth/exampleNewUserSubClass';

// The ExampleNewUserSubClass shows how to:
// - Create related records (e.g., Person) when creating users
// - Override default user creation behavior
// - Link users to other entities
```

### Adding Custom Providers

The API loads various providers at startup:

```typescript
// Communication providers
import { LoadProvider } from '@memberjunction/communication-sendgrid';
LoadProvider();

// Add your custom providers
import { LoadCustomProvider } from './providers/custom';
LoadCustomProvider();
```

## Docker Support

The API server includes comprehensive Docker support for production deployment.

### Docker Build

The Dockerfile includes:
- Node.js 20 runtime
- Flyway for database migrations
- SQL Server tools for database operations
- PM2 for process management
- SSH support for debugging (port 2222)

### Building the Docker Image

```bash
# From the repository root
docker build -t memberjunction/api -f docker/MJAPI/Dockerfile .
```

### Running with Docker

```bash
# Using docker-compose (recommended)
docker-compose up -d

# Or using docker run
docker run -p 4000:4000 -p 2222:2222 \
  -v $(pwd)/mj.config.cjs:/app/mj.config.cjs \
  memberjunction/api
```

### Docker Configuration

The Docker container uses:
- `docker.config.cjs` for container-specific configuration
- Flyway migrations from the `/migrations` directory
- PM2 for process management and auto-restart
- Environment variables can override config file settings

## API Documentation

The API includes built-in GraphQL documentation accessible through the GraphQL playground at `http://localhost:4000/graphql`.

### Available GraphQL Operations

- **Queries**: Entity queries, view execution, report generation
- **Mutations**: Entity CRUD, action execution, transaction management
- **Subscriptions**: Real-time entity updates

### Authentication

The API supports multiple authentication methods:
1. **JWT Tokens**: Bearer tokens in Authorization header
2. **Session IDs**: Via X-Session-ID header
3. **API Keys**: Via X-MJ-API-Key header

### Error Handling

The API returns standardized error responses:
```json
{
  "success": false,
  "errorMessage": "Detailed error message",
  "errorCode": "ERROR_CODE"
}
```

## Performance Optimization

The API includes several performance optimizations:

- **Compression**: Automatic response compression for better throughput
- **Connection Pooling**: Efficient database connection management
- **Metadata Caching**: Configurable metadata cache with refresh intervals
- **Read-Only Connections**: Separate read-only database connections for queries
- **Request Batching**: GraphQL query batching support

## Deployment Best Practices

1. **Database Configuration**
   - Use separate read-only credentials for query operations
   - Configure appropriate connection timeouts
   - Set metadata cache refresh intervals based on change frequency

2. **Security**
   - Always use HTTPS in production
   - Configure strong JWT secrets
   - Limit CORS origins appropriately
   - Disable GraphQL introspection in production

3. **Monitoring**
   - Enable request logging
   - Monitor database connection pools
   - Track GraphQL query performance
   - Set up health check endpoints

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify SQL Server is running and accessible
   - Check firewall rules
   - Confirm credentials and database name
   - For named instances, use `dbInstanceName` config

2. **Authentication Failures**
   - Ensure JWT secret is configured
   - Verify Auth0 configuration if using external auth
   - Check token expiration settings

3. **Performance Issues**
   - Enable compression
   - Use read-only connections for queries
   - Optimize metadata cache intervals
   - Consider implementing query depth limits

## Related Packages

- `@memberjunction/server`: Core server functionality providing GraphQL and REST APIs
- `@memberjunction/core`: Core functionality and entity definitions
- `@memberjunction/global`: Shared utilities and constants
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `@memberjunction/ai`: AI capabilities integration
- `@memberjunction/communication-sendgrid`: SendGrid email provider
- `mj_generatedentities`: Generated entity classes
- `mj_generatedactions`: Generated action classes

## Contributing

When contributing to MJAPI:

1. Follow the TypeScript coding standards
2. Add tests for new functionality
3. Update documentation as needed
4. Ensure all builds pass before submitting PRs

## License

ISC

## Support

For issues and questions:
- GitHub Issues: [MemberJunction Repository](https://github.com/MemberJunction/MJ)
- Documentation: [MemberJunction Docs](https://docs.memberjunction.org)