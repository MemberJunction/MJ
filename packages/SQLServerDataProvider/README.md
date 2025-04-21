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

## Installation

```bash
npm install @memberjunction/sqlserver-dataprovider
```

## Dependencies

This package relies on the following key dependencies:
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/global`: Shared utilities and constants
- `mssql`: SQL Server client for Node.js
- `typeorm`: ORM for database operations

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
import { EntityInfo } from '@memberjunction/core';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Load an entity
const userResult = await dataProvider.loadEntity('User', 1);
if (userResult.success) {
  const user = userResult.entity;
  console.log(`Loaded user: ${user.FirstName} ${user.LastName}`);
  
  // Update the entity
  user.Email = 'new.email@example.com';
  const saveResult = await dataProvider.saveEntity('User', user);
  
  if (saveResult.success) {
    console.log(`User updated successfully, ID: ${saveResult.entity.ID}`);
  }
}

// Create a new entity
const newUser = {
  ID: 0, // 0 indicates a new entity
  FirstName: 'John',
  LastName: 'Doe',
  Email: 'john.doe@example.com',
  // other required fields...
};

const createResult = await dataProvider.saveEntity('User', newUser);
if (createResult.success) {
  console.log(`New user created with ID: ${createResult.entity.ID}`);
}

// Delete an entity
const deleteResult = await dataProvider.deleteEntity('User', 5);
if (deleteResult.success) {
  console.log('User deleted successfully');
}
```

### Transaction Management

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { TransactionGroupBase } from '@memberjunction/core';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Create a transaction group
class OrderTransactionGroup extends TransactionGroupBase {
  constructor() {
    super('CreateOrderWithItems');
  }
}

const transaction = new OrderTransactionGroup();

// Add multiple entities to the transaction
transaction.addEntity('Order', {
  ID: 0,
  CustomerID: 123,
  OrderDate: new Date(),
  Status: 'New'
});

// Reference previous entities in the same transaction
transaction.addEntity('OrderItem', {
  ID: 0,
  OrderID: '@Order.1', // Reference to the first Order in this transaction
  ProductID: 456,
  Quantity: 2,
  Price: 29.99
});

transaction.addEntity('OrderItem', {
  ID: 0,
  OrderID: '@Order.1',
  ProductID: 789,
  Quantity: 1,
  Price: 49.99
});

// Execute the transaction group
const result = await dataProvider.executeTransactionGroup(transaction);

if (result.success) {
  console.log('Transaction completed successfully');
  console.log('Order ID:', result.results.find(r => r.entityName === 'Order')?.entity.ID);
} else {
  console.error('Transaction failed:', result.error);
}
```

### Running Views and Reports

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { RunViewOptions } from '@memberjunction/core';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Run a view with filtering and pagination
const viewOptions: RunViewOptions = {
  EntityName: 'vwActiveUsers',
  ExtraFilter: "Role = 'Administrator'",
  OrderBy: 'LastName, FirstName',
  PageSize: 10,
  PageNumber: 1
};

const viewResult = await dataProvider.runView(viewOptions);

if (viewResult.success) {
  console.log(`Found ${viewResult.Results.length} users`);
  console.log(`Total matching records: ${viewResult.TotalRowCount}`);
  
  viewResult.Results.forEach(user => {
    console.log(`${user.FirstName} ${user.LastName} (${user.Email})`);
  });
}

// Run a report
const reportResult = await dataProvider.runReport('SalesReport', {
  StartDate: '2023-01-01',
  EndDate: '2023-12-31',
  Format: 'JSON'
});

if (reportResult.success) {
  console.log('Report data:', reportResult.results);
}
```

### Executing Raw Queries

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

// Setup data provider
const dataProvider = new SQLServerDataProvider(/* config */);
await dataProvider.initialize();

// Execute a parameterized query
const queryResult = await dataProvider.executeQuery(
  'SELECT * FROM Users WHERE Department = @dept AND HireDate > @date',
  {
    dept: 'Engineering',
    date: '2022-01-01'
  }
);

if (queryResult.success) {
  console.log(`Query returned ${queryResult.results.length} rows`);
  queryResult.results.forEach(row => {
    console.log(row);
  });
}

// Execute a stored procedure
const spResult = await dataProvider.executeQuery(
  'EXEC sp_GetUserPermissions @UserID',
  {
    UserID: 123
  }
);

if (spResult.success) {
  console.log('User permissions:', spResult.results);
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
  async executeQuery(sql: string, params?: any): Promise<any> {
    console.log(`Executing SQL: ${sql}`);
    console.log('Parameters:', params);
    
    // Add timing
    const startTime = Date.now();
    const result = await super.executeQuery(sql, params);
    const duration = Date.now() - startTime;
    
    console.log(`Query executed in ${duration}ms`);
    
    return result;
  }
}
```

## License

ISC