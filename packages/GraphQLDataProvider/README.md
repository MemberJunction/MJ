# MemberJunction GraphQL Data Provider

A flexible GraphQL client for MemberJunction that provides a complete data access layer for connecting applications to MemberJunction APIs.

## Overview

The `@memberjunction/graphql-dataprovider` package is a full-featured GraphQL client implementation for MemberJunction applications. It provides a standardized way to interact with MemberJunction's GraphQL API, handling queries, mutations, subscriptions, and complex operations like transaction groups and entity relationships.

This data provider is particularly useful for frontend applications that need to communicate with a MemberJunction backend API, offering a consistent interface regardless of the underlying database technology.

## Installation

```bash
npm install @memberjunction/graphql-dataprovider
```

## Key Features

- **Complete Entity Operations**: CRUD operations for all MemberJunction entities
- **View and Report Execution**: Run database views and reports with parameters
- **Transaction Support**: Execute complex operations as atomic transactions
- **WebSocket Subscriptions**: Real-time data updates via GraphQL subscriptions
- **Offline Caching**: IndexedDB-based caching for offline functionality
- **Type Safety**: Full TypeScript support with generated types
- **Authentication Integration**: Works with MemberJunction's authentication system
- **Field Mapping**: Automatic mapping between client and server field names

## Usage

### Setting up the GraphQL Client

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunViewOptions } from '@memberjunction/core';

// Create a data provider instance
const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
  subscriptionEndpoint: 'wss://api.example.com/graphql',
  authToken: 'your-auth-token', // Optional, can be updated later
});

// Set authentication token (e.g., after user login)
dataProvider.setAuthToken('updated-auth-token');
```

### Working with Entities

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
});

// Load an entity
async function getUserById(userId: number) {
  const result = await dataProvider.loadEntity('User', userId);
  return result.success ? result.entity : null;
}

// Create a new entity
async function createUser(userData: any) {
  const result = await dataProvider.saveEntity('User', {
    ID: 0, // 0 indicates a new entity
    FirstName: userData.firstName,
    LastName: userData.lastName,
    Email: userData.email,
    // other fields...
  });
  return result;
}

// Update an existing entity
async function updateUser(userId: number, updatedData: any) {
  const loadResult = await dataProvider.loadEntity('User', userId);
  
  if (loadResult.success) {
    const user = loadResult.entity;
    // Update fields
    Object.assign(user, updatedData);
    
    // Save changes
    const saveResult = await dataProvider.saveEntity('User', user);
    return saveResult;
  }
  
  return { success: false, error: 'User not found' };
}

// Delete an entity
async function deleteUser(userId: number) {
  const result = await dataProvider.deleteEntity('User', userId);
  return result;
}
```

### Executing Views and Reports

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunViewOptions } from '@memberjunction/core';

const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
});

// Execute a view
async function getActiveUsers() {
  const options: RunViewOptions = {
    EntityName: 'vwUsers',
    ExtraFilter: "Status = 'Active'",
    OrderBy: 'LastName, FirstName',
    PageSize: 50,
    PageNumber: 1
  };
  
  const result = await dataProvider.runView(options);
  return result.success ? result.Results : [];
}

// Execute a report
async function getSalesReport(startDate: Date, endDate: Date) {
  const result = await dataProvider.runReport('SalesReport', {
    StartDate: startDate,
    EndDate: endDate
  });
  
  return result.success ? result.results : [];
}
```

### Using Transaction Groups

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { TransactionGroupBase } from '@memberjunction/core';

const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
});

// Define a transaction group
class OrderTransactionGroup extends TransactionGroupBase {
  constructor() {
    super('CreateOrderWithItems');
  }
}

// Use the transaction group
async function createOrderWithItems(orderData: any, items: any[]) {
  // Create transaction group
  const transaction = new OrderTransactionGroup();
  
  // Add order
  transaction.addEntity('Order', {
    ID: 0,
    CustomerID: orderData.customerId,
    OrderDate: new Date(),
    Status: 'New',
    // other fields...
  });
  
  // Add order items
  for (const item of items) {
    transaction.addEntity('OrderItem', {
      ID: 0,
      OrderID: '@Order.1', // Reference to the first Order entity in this transaction
      ProductID: item.productId,
      Quantity: item.quantity,
      Price: item.price,
      // other fields...
    });
  }
  
  // Execute transaction
  const result = await dataProvider.executeTransactionGroup(transaction);
  return result;
}
```

### Executing Actions

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
});

// Execute an entity action
async function sendUserWelcomeEmail(userId: number) {
  const result = await dataProvider.executeAction('User', 'SendWelcomeEmail', userId, {
    templateId: 'welcome-template',
    includeSurvey: true
  });
  
  return result.success;
}

// Execute a general action (not tied to a specific entity record)
async function generateReport() {
  const result = await dataProvider.executeAction('ReportGenerator', 'GenerateMonthlyReport', null, {
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    format: 'PDF'
  });
  
  return result;
}
```

### Field Mapping

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
  // Configure field mapping for entities
  fieldMappings: {
    User: {
      // Map client field names to server field names
      firstName: 'FirstName',
      lastName: 'LastName',
      emailAddress: 'Email'
    }
  }
});

// Now you can use client field names in your code
async function createUser(userData: any) {
  const result = await dataProvider.saveEntity('User', {
    ID: 0,
    firstName: userData.firstName, // Will be mapped to FirstName
    lastName: userData.lastName,   // Will be mapped to LastName
    emailAddress: userData.email   // Will be mapped to Email
  });
  return result;
}
```

### WebSocket Subscriptions

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

const dataProvider = new GraphQLDataProvider({
  graphQLEndpoint: 'https://api.example.com/graphql',
  subscriptionEndpoint: 'wss://api.example.com/graphql'
});

// Subscribe to entity changes
function subscribeToUserChanges() {
  const subscription = dataProvider.subscribeToEntity('User', (entity) => {
    console.log('User entity updated:', entity);
    // Update UI or application state
  });
  
  // Later, unsubscribe when no longer needed
  subscription.unsubscribe();
}

// Subscribe to specific entity record changes
function subscribeToSpecificUser(userId: number) {
  const subscription = dataProvider.subscribeToEntityRecord('User', userId, (entity) => {
    console.log('Specific user updated:', entity);
    // Update UI or application state
  });
  
  // Later, unsubscribe when no longer needed
  subscription.unsubscribe();
}
```

## Key Classes

| Class | Description |
|-------|-------------|
| `GraphQLDataProvider` | Main class implementing the MemberJunction data provider interface |
| `GraphQLClient` | Handles GraphQL operations (queries, mutations, subscriptions) |
| `EntityMapper` | Maps between client-side and server-side entity structures |
| `SubscriptionManager` | Manages WebSocket connections and GraphQL subscriptions |
| `OfflineCache` | Provides IndexedDB-based caching for offline operations |
| `EntitySerializer` | Serializes and deserializes entity data for GraphQL operations |

## Requirements

- Node.js 16+
- Modern browser with WebSocket support (for subscriptions)
- MemberJunction GraphQL API endpoint

## License

ISC