# MemberJunction SQL Server Data Provider

A robust SQL Server data provider implementation for MemberJunction applications, providing seamless database connectivity, query execution, and entity management.

## Overview

The `@memberjunction/sqlserver-dataprovider` package implements MemberJunction's data provider interface specifically for Microsoft SQL Server databases. It serves as the bridge between your MemberJunction application and SQL Server, handling data access, entity operations, view execution, and more.

## Key Features

- **Full CRUD Operations**: Complete Create, Read, Update, Delete operations for all entities
- **Transaction Support**: Manage atomic operations with transaction groups
- **View Execution**: Run database views with filtering, sorting, and pagination
- **Report Generation**: Execute reports with parameters
- **Query Execution**: Run raw SQL queries with parameter support
- **Connection Pooling**: Efficient database connection management
- **Entity Relationships**: Handle complex entity relationships automatically
- **User/Role Management**: Integrated with MemberJunction's security model
- **Type-Safe Operations**: Fully TypeScript compatible
- **AI Integration**: Support for AI-powered features through entity actions
- **Duplicate Detection**: Built-in support for duplicate record detection
- **Audit Logging**: Comprehensive audit trail capabilities
- **Row-Level Security**: Enforce data access controls at the database level
- **SQL Logging**: Real-time SQL statement capture for debugging and migration generation
- **Session Management**: Multiple concurrent SQL logging sessions with user filtering

## Installation

```bash
npm install @memberjunction/sqlserver-dataprovider
```

## Dependencies

This package relies on the following key dependencies:
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/global`: Shared utilities and constants
- `@memberjunction/actions`: Action execution framework
- `@memberjunction/ai`: AI integration capabilities
- `@memberjunction/ai-vector-dupe`: Duplicate detection using AI vectors
- `@memberjunction/aiengine`: AI engine integration
- `@memberjunction/queue`: Queue management for async operations
- `mssql`: SQL Server client for Node.js (v11+)
- `typeorm`: ORM for database operations (v0.3+)

## Usage

### Basic Setup

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { ConfigHelper } from '@memberjunction/global';

// Configure database connection
const config = {
  host: 'your-server.database.windows.net',
  port: 1433,
  database: 'YourMJDatabase',
  user: 'your-username',
  password: 'your-password',
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Create data provider instance
const dataProvider = new SQLServerDataProvider(config);

// Or using environment variables
const dataProvider = new SQLServerDataProvider({
  host: ConfigHelper.getConfigValue('MJ_HOST'),
  port: ConfigHelper.getConfigValue('MJ_PORT', 1433),
  database: ConfigHelper.getConfigValue('MJ_DATABASE'),
  user: ConfigHelper.getConfigValue('MJ_USER'),
  password: ConfigHelper.getConfigValue('MJ_PASSWORD')
});

// Initialize the data provider (connects to the database)
await dataProvider.initialize();
```

### Working with Entities

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, CompositeKey, UserInfo } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Get entity metadata
const md = new Metadata();
const userEntity = md.EntityByName('User');

// Load an entity by ID
const userKey = new CompositeKey([{ FieldName: 'ID', Value: 1 }]);
const userResult = await dataProvider.Get(userEntity, userKey);

if (userResult.Success) {
  const user = userResult.Entity;
  console.log(`Loaded user: ${user.FirstName} ${user.LastName}`);
  
  // Update the entity
  user.Email = 'new.email@example.com';
  const saveResult = await dataProvider.Save(user, contextUser);
  
  if (saveResult.Success) {
    console.log(`User updated successfully, ID: ${saveResult.Entity.ID}`);
  }
}

// Create a new entity
const newUserEntity = await md.GetEntityObject<UserEntity>('User');
newUserEntity.FirstName = 'John';
newUserEntity.LastName = 'Doe';
newUserEntity.Email = 'john.doe@example.com';
// set other required fields...

const createResult = await dataProvider.Save(newUserEntity, contextUser);
if (createResult.Success) {
  console.log(`New user created with ID: ${createResult.Entity.ID}`);
}

// Delete an entity
const deleteKey = new CompositeKey([{ FieldName: 'ID', Value: 5 }]);
const deleteResult = await dataProvider.Delete(userEntity, deleteKey, contextUser);
if (deleteResult.Success) {
  console.log('User deleted successfully');
}
```

### Transaction Management

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { SQLServerTransactionGroup } from '@memberjunction/sqlserver-dataprovider';
import { Metadata } from '@memberjunction/core';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Create a transaction group
const transaction = new SQLServerTransactionGroup('CreateOrderWithItems');

// Get entity objects
const md = new Metadata();
const orderEntity = await md.GetEntityObject('Order');
const orderItemEntity1 = await md.GetEntityObject('Order Item');
const orderItemEntity2 = await md.GetEntityObject('Order Item');

// Set up the order
orderEntity.CustomerID = 123;
orderEntity.OrderDate = new Date();
orderEntity.Status = 'New';

// Add to transaction - this will get ID after save
await transaction.AddTransaction(orderEntity);

// Set up order items with references to the order
orderItemEntity1.OrderID = '@Order.1'; // Reference to the first Order in this transaction
orderItemEntity1.ProductID = 456;
orderItemEntity1.Quantity = 2;
orderItemEntity1.Price = 29.99;

orderItemEntity2.OrderID = '@Order.1'; // Same order reference
orderItemEntity2.ProductID = 789;
orderItemEntity2.Quantity = 1;
orderItemEntity2.Price = 49.99;

// Add items to transaction
await transaction.AddTransaction(orderItemEntity1);
await transaction.AddTransaction(orderItemEntity2);

// Execute the transaction group
const results = await transaction.Submit();

// Check results
const success = results.every(r => r.Success);
if (success) {
  console.log('Transaction completed successfully');
  const orderResult = results.find(r => r.Entity.EntityInfo.Name === 'Order');
  console.log('Order ID:', orderResult?.Entity.ID);
} else {
  console.error('Transaction failed');
  results.filter(r => !r.Success).forEach(r => {
    console.error(`Failed: ${r.Entity.EntityInfo.Name}`, r.Message);
  });
}
```

### Running Views and Reports

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { RunViewParams, RunReportParams } from '@memberjunction/core';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Run a view with filtering and pagination
const viewOptions: RunViewParams = {
  EntityName: 'vwActiveUsers',
  ExtraFilter: "Role = 'Administrator'",
  OrderBy: 'LastName, FirstName',
  PageSize: 10,
  PageNumber: 1
};

const viewResult = await dataProvider.RunView(viewOptions);

if (viewResult.success) {
  console.log(`Found ${viewResult.Results.length} users`);
  console.log(`Total matching records: ${viewResult.TotalRowCount}`);
  
  viewResult.Results.forEach(user => {
    console.log(`${user.FirstName} ${user.LastName} (${user.Email})`);
  });
}

// Run a report
const reportParams: RunReportParams = {
  ReportID: 'report-id-here',
  // Other parameters as needed
};

const reportResult = await dataProvider.RunReport(reportParams);

if (reportResult.Success) {
  console.log('Report data:', reportResult.Results);
  console.log('Row count:', reportResult.RowCount);
  console.log('Execution time:', reportResult.ExecutionTime, 'ms');
}
```

### Executing Raw Queries

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { RunQueryParams } from '@memberjunction/core';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Execute raw SQL with parameters
const sqlResult = await dataProvider.ExecuteSQL(
  'SELECT * FROM Users WHERE Department = @dept AND HireDate > @date',
  {
    dept: 'Engineering',
    date: '2022-01-01'
  }
);

console.log(`Query returned ${sqlResult.length} rows`);
sqlResult.forEach(row => {
  console.log(row);
});

// Execute a stored procedure
const spResult = await dataProvider.ExecuteSQL(
  'EXEC sp_GetUserPermissions @UserID',
  {
    UserID: 123
  }
);

console.log('User permissions:', spResult);

// Using RunQuery for pre-defined queries
const queryParams: RunQueryParams = {
  QueryID: 'query-id-here', // or use QueryName
  // CategoryID: 'optional-category-id',
  // CategoryName: 'optional-category-name'
};

const queryResult = await dataProvider.RunQuery(queryParams);

if (queryResult.Success) {
  console.log('Query results:', queryResult.Results);
  console.log('Execution time:', queryResult.ExecutionTime, 'ms');
}
```

### User Management and Caching

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Set current user context
dataProvider.setCurrentUser(123); // User ID

// Get current user
const currentUser = dataProvider.getCurrentUser();
console.log(`Current user: ${currentUser.FirstName} ${currentUser.LastName}`);

// User caching is handled automatically by the provider
// but you can clear the cache if needed
dataProvider.clearUserCache();
```

## Configuration Options

The SQL Server data provider accepts the following configuration options:

| Option | Description | Default |
|--------|-------------|---------|
| `host` | SQL Server hostname or IP | required |
| `port` | SQL Server port | 1433 |
| `database` | Database name | required |
| `user` | Username | required |
| `password` | Password | required |
| `connectionTimeout` | Connection timeout in ms | 15000 |
| `requestTimeout` | Request timeout in ms | 15000 |
| `pool.max` | Maximum pool size | 10 |
| `pool.min` | Minimum pool size | 0 |
| `pool.idleTimeoutMillis` | Pool idle timeout | 30000 |
| `options.encrypt` | Use encryption | true |
| `options.trustServerCertificate` | Trust server certificate | false |
| `options.enableArithAbort` | Enable arithmetic abort | true |

## Advanced Usage

### Custom SQL Execution Hooks

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

class CustomSQLProvider extends SQLServerDataProvider {
  // Override to add custom logging or modifications
  async ExecuteSQL(sql: string, params?: any, maxRows?: number): Promise<any> {
    console.log(`Executing SQL: ${sql}`);
    console.log('Parameters:', params);
    
    // Add timing
    const startTime = Date.now();
    const result = await super.ExecuteSQL(sql, params, maxRows);
    const duration = Date.now() - startTime;
    
    console.log(`Query executed in ${duration}ms`);
    console.log(`Rows returned: ${result?.length || 0}`);
    
    return result;
  }
  
  // Custom error handling
  protected async HandleExecuteSQLError(error: any, sql: string): Promise<void> {
    console.error('SQL Error:', error);
    console.error('Failed SQL:', sql);
    // Add custom error handling logic here
    await super.HandleExecuteSQLError(error, sql);
  }
}
```

### Error Handling

The SQL Server Data Provider includes comprehensive error handling:

```typescript
try {
  const result = await dataProvider.Save(entity, user);
  if (!result.Success) {
    console.error('Save failed:', result.ErrorMessage);
    // Handle validation or business logic errors
  }
} catch (error) {
  console.error('Unexpected error:', error);
  // Handle system-level errors
}
```

## Build & Development

### Building the Package

```bash
# From the package directory
npm run build

# Or from the repository root
turbo build --filter="@memberjunction/sqlserver-dataprovider"
```

### Development Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run the package with ts-node-dev for development

### TypeScript Configuration

This package is configured with TypeScript strict mode enabled. The compiled output is placed in the `dist/` directory with declaration files for type support.

## API Reference

### SQLServerDataProvider

The main class that implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, and IRunQueryProvider interfaces.

#### Key Methods

- `Config(configData: SQLServerProviderConfigData): Promise<boolean>` - Configure the provider with connection details
- `Get(entity: EntityInfo, CompositeKey: CompositeKey, user?: UserInfo): Promise<BaseEntityResult>` - Load an entity by primary key
- `Save(entity: BaseEntity, user: UserInfo, options?: EntitySaveOptions): Promise<BaseEntityResult>` - Save (create/update) an entity
- `Delete(entity: EntityInfo, CompositeKey: CompositeKey, user?: UserInfo, options?: EntityDeleteOptions): Promise<BaseEntityResult>` - Delete an entity
- `RunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult>` - Execute a database view
- `RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult>` - Execute a report
- `RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult>` - Execute a query
- `ExecuteSQL(sql: string, params?: any, maxRows?: number): Promise<any[]>` - Execute raw SQL
- `createSqlLogger(filePath: string, options?: SqlLoggingOptions): Promise<SqlLoggingSession>` - Create a new SQL logging session
- `getActiveSqlLoggingSessions(): SqlLoggingSession[]` - Get all active logging sessions
- `disposeAllSqlLoggingSessions(): Promise<void>` - Stop and clean up all logging sessions
- `isSqlLoggingEnabled(): boolean` - Check if SQL logging is available

### SQLServerProviderConfigData

Configuration class for the SQL Server provider.

#### Properties

- `DataSource: DataSource` - TypeORM DataSource instance
- `CurrentUserEmail: string` - Email of the current user
- `CheckRefreshIntervalSeconds: number` - Interval for checking metadata refresh (0 to disable)
- `MJCoreSchemaName: string` - Schema name for MJ core tables (default: '__mj')
- `IncludeSchemas?: string[]` - List of schemas to include
- `ExcludeSchemas?: string[]` - List of schemas to exclude

### SQLServerTransactionGroup

SQL Server implementation of TransactionGroupBase for managing database transactions.

#### Methods

- `HandleSubmit(): Promise<TransactionResult[]>` - Execute all pending transactions in the group

### UserCache

Server-side cache for user and role information.

#### Static Methods

- `Instance: UserCache` - Get singleton instance
- `Users: UserInfo[]` - Get all cached users

#### Instance Methods

- `Refresh(dataSource: DataSource, autoRefreshIntervalMS?: number): Promise<void>` - Refresh user cache
- `UserByName(name: string, caseSensitive?: boolean): UserInfo | undefined` - Find user by name

### setupSQLServerClient

Helper function to initialize and configure the SQL Server data provider.

```typescript
setupSQLServerClient(config: SQLServerProviderConfigData): Promise<SQLServerDataProvider>
```

## SQL Logging

The SQL Server Data Provider includes comprehensive SQL logging capabilities that allow you to capture SQL statements in real-time. This feature supports both programmatic access and runtime control through the MemberJunction UI.

### Key Features

- **Real-time SQL capture** - Monitor SQL statements as they execute
- **Session-based logging** with unique identifiers and names
- **User filtering** - Capture SQL from specific users only
- **Multiple output formats** - Standard SQL logs or migration-ready files
- **Runtime control** - Start/stop sessions through GraphQL API and UI
- **Owner-level security** - Only users with Owner privileges can access SQL logging
- **Automatic cleanup** - Sessions auto-expire and clean up empty files
- **Concurrent sessions** - Support multiple active logging sessions
- **Parameter capture** - Logs both SQL statements and their parameters

### Programmatic Usage

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Create a SQL logging session
const logger = await dataProvider.createSqlLogger('./logs/sql/operations.sql', {
  formatAsMigration: false,
  sessionName: 'User registration operations',
  filterByUserId: 'user@example.com',  // Only log SQL from this user
  prettyPrint: true,
  statementTypes: 'both'  // Log both queries and mutations
});

// Perform your database operations - they will be automatically logged
await dataProvider.ExecuteSQL('INSERT INTO Users (Name, Email) VALUES (@name, @email)', {
  name: 'John Doe',
  email: 'john@example.com'
});

// Check session status
console.log(`Session ${logger.id} has captured ${logger.statementCount} statements`);

// Clean up the logging session
await logger.dispose();
```

### Runtime Control via GraphQL

```typescript
// Start a new logging session
const mutation = `
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
    }
  }
`;

// List active sessions
const query = `
  query {
    activeSqlLoggingSessions {
      id
      sessionName
      startTime
      statementCount
      filterByUserId
    }
  }
`;

// Stop a session
const stopMutation = `
  mutation {
    stopSqlLogging(sessionId: "session-id-here")
  }
`;
```

### UI Integration

SQL logging can be controlled through the MemberJunction Explorer UI:

1. **Settings Panel**: Navigate to Settings > SQL Logging (Owner access required)
2. **Session Management**: Start/stop sessions with custom options
3. **Real-time Monitoring**: View active sessions and statement counts
4. **User Filtering**: Option to capture only your SQL statements
5. **Log Viewing**: Preview log file contents (implementation dependent)

### Migration-Ready Format

```typescript
// Create logger with migration formatting
const migrationLogger = await dataProvider.createSqlLogger('./migrations/V20241215120000__User_Operations.sql', {
  formatAsMigration: true,
  sessionName: 'User management operations for deployment',
  batchSeparator: 'GO',
  logRecordChangeMetadata: true
});

// Your operations are logged in Flyway-compatible format
// with proper headers and schema placeholders
```

### Session Management Methods

```typescript
// Get all active sessions
const activeSessions = dataProvider.getActiveSqlLoggingSessions();
console.log(`${activeSessions.length} sessions currently active`);

// Dispose all sessions
await dataProvider.disposeAllSqlLoggingSessions();

// Check if logging is enabled
if (dataProvider.isSqlLoggingEnabled()) {
  console.log('SQL logging is available');
}
```

> **Security Note**: SQL logging requires Owner-level privileges in the MemberJunction system. Only users with `Type = 'Owner'` can create, manage, or access SQL logging sessions.

## Troubleshooting

### Common Issues

1. **Connection Timeout Errors**
   - Increase `connectionTimeout` and `requestTimeout` in configuration
   - Verify network connectivity to SQL Server
   - Check SQL Server firewall rules

2. **Authentication Failures**
   - Ensure correct username/password or Windows authentication
   - Verify user has appropriate database permissions
   - Check if encryption settings match server requirements

3. **Schema Not Found**
   - Verify `MJCoreSchemaName` matches your database schema (default: `__mj`)
   - Ensure user has access to the schema
   - Check if MemberJunction tables are properly installed

4. **Transaction Rollback Issues**
   - Check for constraint violations in related entities
   - Verify all required fields are populated
   - Review transaction logs for specific error details

5. **Performance Issues**
   - Adjust connection pool settings (`pool.max`, `pool.min`)
   - Enable query logging to identify slow queries
   - Consider adding database indexes for frequently queried fields

### Debug Logging

Enable detailed logging by setting environment variables:

```bash
# Enable SQL query logging
export MJ_LOG_SQL=true

# Enable detailed error logging
export MJ_LOG_LEVEL=debug
```

## License

ISC

## SQL Server Connection Pooling and Best Practices

### Overview

The MemberJunction SQL Server Data Provider is designed to support high-performance parallel database operations through proper connection pool management. The underlying `mssql` driver (node-mssql) is expressly designed to handle many concurrent database calls efficiently.

### How MemberJunction Handles Parallelism

1. **Single Shared Connection Pool**: MemberJunction creates one connection pool at server startup and reuses it throughout the application lifecycle. This pool is passed to the SQLServerDataProvider and used for all database operations.

2. **Request-Per-Query Pattern**: Each database operation creates a new `sql.Request` object from the shared pool, allowing multiple queries to execute in parallel without blocking each other.

3. **Configurable Pool Size**: The connection pool can be configured via `mj.config.cjs` to support your specific concurrency needs:

```javascript
// In your mj.config.cjs at the root level
module.exports = {
  databaseSettings: {
    connectionPool: {
      max: 50,              // Maximum connections (default: 50)
      min: 5,               // Minimum connections (default: 5)
      idleTimeoutMillis: 30000,    // Idle timeout (default: 30s)
      acquireTimeoutMillis: 30000  // Acquire timeout (default: 30s)
    }
  }
};
```

### Best Practices Implementation

MemberJunction follows SQL Server connection best practices:

#### ✅ What We Do Right

1. **Create Pool Once**: The pool is created during server initialization and never recreated
2. **Never Close Pool in Handlers**: The pool remains open for the server's lifetime
3. **Fresh Request Per Query**: Each query gets its own `sql.Request` object
4. **Proper Error Handling**: Connection failures are caught and logged appropriately
5. **Read-Only Pool Option**: Separate pool for read operations if configured

#### ❌ Anti-Patterns We Avoid

1. We don't create new connections for each request
2. We don't open/close the pool repeatedly
3. We don't share Request objects between queries
4. We don't use hardcoded pool limits

### Recommended Pool Settings

Based on your environment and load:

#### Development Environment
```javascript
connectionPool: {
  max: 10,
  min: 2,
  idleTimeoutMillis: 60000,
  acquireTimeoutMillis: 15000
}
```

#### Production - Standard Load
```javascript
connectionPool: {
  max: 50,      // 2-4× CPU cores of your API server
  min: 5,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 30000
}
```

#### Production - High Load
```javascript
connectionPool: {
  max: 100,     // Monitor SQL Server wait types to tune
  min: 10,
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 30000
}
```

### Performance Considerations

1. **Pool Size**: The practical concurrency limit equals your pool size. With default settings (max: 50), you can have up to 50 concurrent SQL operations.

2. **Connection Reuse**: The mssql driver efficiently reuses connections from the pool, minimizing connection overhead.

3. **Queue Management**: When all connections are busy, additional requests queue in FIFO order until a connection becomes available.

4. **Monitoring**: Watch for these SQL Server wait types to identify if pool size is too large:
   - `RESOURCE_SEMAPHORE`: Memory pressure
   - `THREADPOOL`: Worker thread exhaustion

### Troubleshooting Connection Pool Issues

If you experience "connection pool exhausted" errors:

1. **Increase Pool Size**: Adjust `max` in your configuration
2. **Check for Leaks**: Ensure all queries complete properly
3. **Monitor Long Queries**: Identify and optimize slow queries that hold connections
4. **Review Concurrent Load**: Ensure pool size matches your peak concurrency needs

### Technical Implementation Details

The connection pool is created in `/packages/MJServer/src/index.ts`:

```typescript
const pool = new sql.ConnectionPool(createMSSQLConfig());
await pool.connect();
```

And used in SQLServerDataProvider for each query:

```typescript
const request = new sql.Request(this._pool);
const result = await request.query(sql);
```

#### **Important** 
If you are using `SQLServerDataProvider` outside of the context of MJServer/MJAPI it is your responsibility to create connection pool in alignment with whatever practices make sense for your project and pass that along to the SQLServerDataProvider configuration process.

This pattern ensures maximum parallelism while maintaining connection efficiency, allowing MemberJunction applications to scale to handle hundreds of concurrent database operations without blocking the Node.js event loop.