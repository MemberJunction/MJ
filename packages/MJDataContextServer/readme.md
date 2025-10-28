# @memberjunction/data-context-server

This library provides a server-side implementation of the `DataContextItem` class from `@memberjunction/data-context` that can handle the server-side only use case of loading data into a context using raw SQL statements.

## Overview

The `@memberjunction/data-context-server` package extends the base `DataContextItem` class to provide server-side functionality for executing SQL queries directly against a database. This is particularly useful when you need to load data contexts that include custom SQL statements, which cannot be executed on the client side.

## Installation

```bash
npm install @memberjunction/data-context-server
```

## Purpose and Functionality

This package serves a critical role in the MemberJunction ecosystem by:

1. **Enabling SQL Execution**: Provides the ability to execute raw SQL statements through data contexts on the server side
2. **TypeORM Integration**: Uses TypeORM's DataSource for database operations
3. **Automatic Registration**: Registers itself with higher priority (2) to override the base implementation when running on the server
4. **Tree-Shaking Prevention**: Includes a utility function to ensure the class isn't removed during build optimization

## Usage

### Basic Setup

First, ensure the server-side implementation is loaded to prevent tree-shaking:

```typescript
import { LoadDataContextItemsServer } from '@memberjunction/data-context-server';

// Call this once in your server initialization code
LoadDataContextItemsServer();
```

### Loading Data Contexts with SQL Items

```typescript
import { DataContext } from '@memberjunction/data-context';
import { DataSource } from 'typeorm';
import { UserInfo } from '@memberjunction/core';

// Assume you have a TypeORM DataSource configured
const dataSource: DataSource = /* your configured data source */;

// Load a data context that includes SQL-type items
const context = new DataContext();
const user = /* current user context */;

// Load metadata and data in one operation
const success = await context.Load(
  dataContextId,
  dataSource,  // Pass the TypeORM DataSource
  false,       // forceRefresh
  false,       // loadRelatedDataOnSingleRecords
  0,           // maxRecordsPerRelationship
  user         // contextUser
);

if (success) {
  // Access the loaded data
  context.Items.forEach(item => {
    if (item.Type === 'sql' && item.DataLoaded) {
      console.log(`SQL Item Data:`, item.Data);
    }
  });
}
```

### Creating SQL Data Context Items

```typescript
import { DataContext } from '@memberjunction/data-context';

const context = new DataContext();
const sqlItem = context.AddDataContextItem();

// Configure as SQL type
sqlItem.Type = 'sql';
sqlItem.SQL = 'SELECT * FROM Customers WHERE Country = @country';
sqlItem.RecordName = 'US Customers';
sqlItem.AdditionalDescription = 'All customers from the United States';

// Load the data
const dataSource = /* your TypeORM DataSource */;
const loaded = await sqlItem.LoadData(dataSource);

if (loaded) {
  console.log('SQL Results:', sqlItem.Data);
} else {
  console.error('Loading failed:', sqlItem.DataLoadingError);
}
```

## API Documentation

### DataContextItemServer Class

The `DataContextItemServer` class extends `DataContextItem` and overrides the `LoadFromSQL` method.

#### Protected Methods

##### `LoadFromSQL(dataSource: any, contextUser?: UserInfo): Promise<boolean>`

Executes a SQL statement and loads the results into the DataContextItem.

**Parameters:**
- `dataSource` (any): The TypeORM DataSource object used to execute queries
- `contextUser` (UserInfo, optional): The user context for the operation

**Returns:**
- `Promise<boolean>`: Returns `true` if successful, `false` if an error occurs

**Error Handling:**
- Catches and logs any SQL execution errors
- Sets the `DataLoadingError` property with error details
- Returns `false` on failure

### Utility Functions

#### `LoadDataContextItemsServer(): void`

Prevents tree-shaking from removing the `DataContextItemServer` class during build optimization.

**Usage:**
Call this function after importing the package in your server application to ensure the class registration takes effect.

## Integration with MemberJunction Packages

This package integrates seamlessly with:

- **@memberjunction/data-context**: Provides the base `DataContextItem` class and `DataContext` functionality
- **@memberjunction/global**: Uses the class registration system for runtime polymorphism
- **@memberjunction/core**: Leverages logging utilities and user context
- **typeorm**: Utilizes TypeORM's DataSource for database operations

## Dependencies

```json
{
  "@memberjunction/data-context": "2.43.0",
  "@memberjunction/global": "2.43.0",
  "typeorm": "^0.3.20"
}
```

## Configuration

No special configuration is required. The package automatically registers itself with the MemberJunction class factory system when imported.

## Build and Development

### Scripts

- `npm run build`: Compiles TypeScript to JavaScript
- `npm start`: Runs the TypeScript code directly using ts-node-dev

### TypeScript Configuration

The package uses a standard TypeScript configuration that compiles to ES modules and includes type definitions.

## Important Notes

1. **Server-Side Only**: This package is designed for server-side use only. Client-side applications should not include this package.

2. **Class Registration Priority**: The `DataContextItemServer` class registers with priority 2, ensuring it overrides the base implementation when present.

3. **Error Handling**: SQL execution errors are caught and stored in the `DataLoadingError` property rather than throwing exceptions.

4. **Data Loading**: The `LoadFromSQL` method stores query results directly in the `Data` property as an array of objects.

## Example: Complete Server Application

```typescript
import { DataContext } from '@memberjunction/data-context';
import { LoadDataContextItemsServer } from '@memberjunction/data-context-server';
import { createConnection, DataSource } from 'typeorm';
import { Metadata } from '@memberjunction/core';

// Initialize the server-side data context support
LoadDataContextItemsServer();

// Configure your database connection
const dataSource = new DataSource({
  type: 'mssql',
  host: 'localhost',
  username: 'your_username',
  password: 'your_password',
  database: 'your_database',
  // ... other TypeORM configuration
});

async function loadDataContextWithSQL() {
  await dataSource.initialize();
  
  const context = new DataContext();
  const user = await Metadata.Provider.GetCurrentUser();
  
  // Create a SQL-based data context item
  const item = context.AddDataContextItem();
  item.Type = 'sql';
  item.SQL = `
    SELECT 
      c.CustomerID,
      c.CompanyName,
      COUNT(o.OrderID) as OrderCount,
      SUM(od.Quantity * od.UnitPrice) as TotalRevenue
    FROM Customers c
    LEFT JOIN Orders o ON c.CustomerID = o.CustomerID
    LEFT JOIN [Order Details] od ON o.OrderID = od.OrderID
    GROUP BY c.CustomerID, c.CompanyName
    ORDER BY TotalRevenue DESC
  `;
  item.RecordName = 'Customer Revenue Summary';
  
  // Load the data
  const success = await item.LoadData(dataSource, false, false, 0, user);
  
  if (success) {
    console.log('Customer revenue data:', item.Data);
    
    // Save the context if needed
    await context.SaveItems(user, true); // true to persist the data
  }
  
  await dataSource.destroy();
}
```

## License

This package is part of the MemberJunction framework and follows the same licensing terms.