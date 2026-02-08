# MemberJunction GraphQL Data Provider

A comprehensive GraphQL client for MemberJunction that provides a complete data access layer for connecting applications to MemberJunction APIs.

## Overview

The `@memberjunction/graphql-dataprovider` package is a full-featured GraphQL client implementation for MemberJunction applications. It provides a standardized way to interact with MemberJunction's GraphQL API, handling queries, mutations, subscriptions, and complex operations like transaction groups and entity relationships.

This data provider is designed for both frontend and backend applications that need to communicate with a MemberJunction API server, offering a consistent interface regardless of the underlying database technology.

## Installation

```bash
npm install @memberjunction/graphql-dataprovider
```

## Key Features

- **Complete Entity Operations**: CRUD operations for all MemberJunction entities
- **View and Report Execution**: Run database views and reports with parameters
- **Query Execution**: Execute custom queries with full parameter support
- **Transaction Support**: Execute complex operations as atomic transactions
- **Action Execution**: Execute entity actions and general actions through GraphQL
- **WebSocket Subscriptions**: Real-time data updates via GraphQL subscriptions
- **Offline Caching**: IndexedDB-based caching for offline functionality
- **Type Safety**: Full TypeScript support with generated types
- **Authentication Integration**: Works with MemberJunction's authentication system
- **Field Mapping**: Automatic mapping between client and server field names
- **Session Management**: Persistent session IDs with automatic storage
- **System User Client**: Specialized client for server-to-server communication
- **Duplicate Detection**: Built-in support for finding and merging duplicate records
- **AI Operations**: Execute AI prompts and generate embeddings through GraphQL
- **Simple Prompts**: Run ad-hoc AI prompts without stored configurations

## Usage

### Setting up the GraphQL Client

```typescript
import { setupGraphQLClient, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';

// Create configuration
const config = new GraphQLProviderConfigData(
  'your-jwt-token',
  'https://api.example.com/graphql',
  'wss://api.example.com/graphql',
  async () => {
    // Refresh token function - called when JWT expires
    const newToken = await refreshAuthToken();
    return newToken;
  },
  '__mj', // Optional: MJ Core schema name (defaults to '__mj')
  ['schema1', 'schema2'], // Optional: Include only these schemas
  ['excluded_schema'], // Optional: Exclude these schemas
  'mj-api-key' // Optional: For server-to-server communication
);

// Setup the client (returns configured instance)
const dataProvider = await setupGraphQLClient(config);

// Or create and configure manually
const dataProvider = new GraphQLDataProvider();
await dataProvider.Config(config);
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
  const entityData = {
    ID: 0, // 0 indicates a new entity
    FirstName: userData.firstName,
    LastName: userData.lastName,
    Email: userData.email,
    // other fields...
  };
  
  const options = {
    IgnoreDirtyFields: false, // Save all fields
    SkipValidation: false // Run validation before save
  };
  
  const result = await dataProvider.SaveEntity(
    entityData,
    'User',
    options
  );
  return result;
}

// Update an existing entity
async function updateUser(userId: number, updatedData: any) {
  // Load the entity
  const entity = await dataProvider.GetEntityObject(
    'User',
    { ID: userId }
  );
  
  if (entity) {
    // Update fields
    Object.assign(entity.GetData(), updatedData);
    
    // Save changes
    const result = await dataProvider.SaveEntity(
      entity.GetData(),
      'User'
    );
    return result;
  }
  
  return { Success: false, Message: 'User not found' };
}

// Delete an entity
async function deleteUser(userId: number) {
  const options = {
    IgnoreWarnings: false // Show warnings if any
  };
  
  const result = await dataProvider.DeleteEntity(
    'User',
    { ID: userId },
    options
  );
  return result;
}
```

### Executing Views and Reports

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunViewParams } from '@memberjunction/core';

const dataProvider = new GraphQLDataProvider();

// Execute a view
async function getActiveUsers() {
  const params: RunViewParams = {
    EntityName: 'Users',
    ExtraFilter: "Status = 'Active'",
    OrderBy: 'LastName, FirstName',
    Fields: ['ID', 'FirstName', 'LastName', 'Email'], // Optional: specific fields
    IgnoreMaxRows: false,
    MaxRows: 50,
    ResultType: 'entity_object', // or 'simple' for raw data
    ForceAuditLog: true,
    AuditLogDescription: 'Loading active users for report'
  };
  
  const result = await dataProvider.RunView(params);
  return result.Success ? result.Results : [];
}

// Execute multiple views in parallel
async function getMultipleDatasets() {
  const viewParams: RunViewParams[] = [
    { EntityName: 'Users', ExtraFilter: "Status = 'Active'" },
    { EntityName: 'Orders', ExtraFilter: "OrderDate >= '2024-01-01'" }
  ];
  
  const results = await dataProvider.RunViews(viewParams);
  return results;
}

// Execute a report
async function getSalesReport(reportId: string) {
  const params = {
    ReportID: reportId
  };
  
  const result = await dataProvider.RunReport(params);
  return result.Success ? result.Results : [];
}

// Execute a query
async function runCustomQuery(queryId: string, parameters: any) {
  const params = {
    QueryID: queryId,
    Parameters: parameters
  };
  
  const result = await dataProvider.RunQuery(params);
  return result;
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
  const transaction = await dataProvider.CreateTransactionGroup();
  
  // Create order entity
  const orderEntity = await dataProvider.GetEntityObject('Order');
  orderEntity.NewRecord();
  orderEntity.Set('CustomerID', orderData.customerId);
  orderEntity.Set('OrderDate', new Date());
  orderEntity.Set('Status', 'New');
  
  // Add to transaction
  const orderItem = transaction.AddTransaction(orderEntity, 'create');
  
  // Add order items with references
  for (const item of items) {
    const itemEntity = await dataProvider.GetEntityObject('OrderItem');
    itemEntity.NewRecord();
    itemEntity.Set('ProductID', item.productId);
    itemEntity.Set('Quantity', item.quantity);
    itemEntity.Set('Price', item.price);
    
    // Reference the order using a variable
    const orderTransaction = transaction.AddTransaction(itemEntity, 'create');
    transaction.AddVariable(
      'orderID',
      'ID',
      'FieldValue',
      orderItem.BaseEntity,
      orderTransaction.BaseEntity,
      'OrderID'
    );
  }
  
  // Execute transaction
  const results = await transaction.Submit();
  return results;
}
```

### Executing Actions

```typescript
import { GraphQLActionClient } from '@memberjunction/graphql-dataprovider';
import { ActionParam } from '@memberjunction/actions-base';

const actionClient = new GraphQLActionClient(dataProvider);

// Execute a standalone action
async function runAction(actionId: string) {
  const params: ActionParam[] = [
    { Name: 'parameter1', Value: 'value1', Type: 'Input' },
    { Name: 'parameter2', Value: 123, Type: 'Input' }
  ];
  
  const result = await actionClient.RunAction(
    actionId,
    params,
    false // skipActionLog
  );
  
  if (result.Success) {
    console.log('Action result:', result.ResultCode);
  }
  return result;
}

// Execute an entity action
async function runEntityAction() {
  const params = {
    EntityAction: entityAction, // EntityActionEntity instance
    InvocationType: { Name: 'SingleRecord' },
    EntityObject: userEntity, // BaseEntity instance
    ContextUser: currentUser // UserInfo instance
  };
  
  const result = await actionClient.RunEntityAction(params);
  return result;
}
```

### Field Mapping

```typescript
import { FieldMapper } from '@memberjunction/graphql-dataprovider';

// The GraphQL provider automatically handles field mapping for system fields
// __mj_CreatedAt <-> _mj__CreatedAt
// __mj_UpdatedAt <-> _mj__UpdatedAt  
// __mj_DeletedAt <-> _mj__DeletedAt

// You can also use the FieldMapper directly
const mapper = new FieldMapper();

// Map fields in an object
const mappedData = mapper.MapFields({
  __mj_CreatedAt: '2024-01-01',
  Name: 'John Doe'
});
// Result: { _mj__CreatedAt: '2024-01-01', Name: 'John Doe' }

// Map individual field names
const mappedField = mapper.MapFieldName('__mj_CreatedAt');
// Result: '_mj__CreatedAt'

// Reverse mapping
const originalField = mapper.ReverseMapFieldName('_mj__CreatedAt');
// Result: '__mj_CreatedAt'
```

### WebSocket Subscriptions

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Observable } from 'rxjs';

const dataProvider = new GraphQLDataProvider();

// Subscribe to record changes
function subscribeToRecordChanges() {
  const observable: Observable<RecordChange[]> = 
    await dataProvider.GetRecordChanges(
      'User',
      { ID: 123 },
      ['update', 'delete'], // Watch for these operations
      true // Return initial values
    );
  
  const subscription = observable.subscribe(changes => {
    console.log('Record changes:', changes);
    // Handle changes
  });
  
  // Later, unsubscribe
  subscription.unsubscribe();
}
```

### AI Operations

The GraphQL provider includes a comprehensive AI client for executing prompts and generating embeddings.

```typescript
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

const dataProvider = new GraphQLDataProvider();
const aiClient = dataProvider.AI; // Access the AI client

// Execute a stored AI prompt
async function runAIPrompt() {
  const result = await aiClient.RunAIPrompt({
    promptId: 'prompt-123',
    data: { context: 'user specific data' },
    temperature: 0.7,
    topP: 0.9,
    responseFormat: 'json'
  });
  
  if (result.success) {
    console.log('AI Response:', result.output);
    console.log('Parsed Result:', result.parsedResult);
    console.log('Tokens Used:', result.tokensUsed);
  }
  return result;
}

// Execute a simple prompt without stored configuration
async function runSimplePrompt() {
  const result = await aiClient.ExecuteSimplePrompt({
    systemPrompt: 'You are a helpful data analyst',
    messages: [
      { message: 'What are the key trends?', role: 'user' },
      { message: 'Based on the data...', role: 'assistant' },
      { message: 'Can you elaborate?', role: 'user' }
    ],
    preferredModels: ['gpt-4', 'claude-3'],
    modelPower: 'medium', // 'lowest', 'medium', or 'highest'
    responseFormat: 'json'
  });
  
  if (result.success) {
    console.log('Response:', result.result);
    console.log('Model Used:', result.modelName);
    
    // If response contains JSON
    if (result.resultObject) {
      console.log('Parsed JSON:', result.resultObject);
    }
  }
  return result;
}

// Generate text embeddings
async function generateEmbeddings() {
  // Single text embedding
  const single = await aiClient.EmbedText({
    textToEmbed: 'This is a sample text',
    modelSize: 'small' // 'small' or 'medium'
  });
  
  console.log('Embedding:', single.embeddings); // number[]
  console.log('Dimensions:', single.vectorDimensions);
  
  // Multiple text embeddings (batch)
  const batch = await aiClient.EmbedText({
    textToEmbed: [
      'First text to embed',
      'Second text to embed',
      'Third text to embed'
    ],
    modelSize: 'medium'
  });
  
  console.log('Embeddings:', batch.embeddings); // number[][]
  console.log('Model:', batch.modelName);
  
  return batch;
}

// Run an AI agent for conversational interactions
async function runAIAgent() {
  const result = await aiClient.RunAIAgent({
    agentId: 'agent-456',
    messages: [
      { role: 'user', content: 'Hello, I need help with data analysis' },
      { role: 'assistant', content: 'I can help you analyze your data' },
      { role: 'user', content: 'What patterns do you see?' }
    ],
    sessionId: 'session-789',
    data: { contextData: 'relevant information' }
  });
  
  if (result.success) {
    console.log('Agent Response:', result.payload);
    console.log('Execution Time:', result.executionTimeMs, 'ms');
  }
  return result;
}
```

### System User Client

```typescript
import { GraphQLSystemUserClient } from '@memberjunction/graphql-dataprovider';

// Create system user client for server-to-server communication
const systemClient = new GraphQLSystemUserClient(
  'https://api.example.com/graphql',
  '', // No JWT token needed
  'session-id',
  'mj-api-key' // Shared secret key
);

// Execute queries as system user
const queries = [
  'SELECT * FROM Users WHERE Active = 1',
  'SELECT COUNT(*) as Total FROM Orders'
];

const result = await systemClient.GetData(
  queries,
  'access-token' // Short-lived access token
);

if (result.Success) {
  console.log('Query results:', result.Results);
}

// AI Operations with system privileges
async function systemAIOperations() {
  // Run AI prompt as system user
  const promptResult = await systemClient.RunAIPrompt({
    promptId: 'system-prompt-123',
    skipValidation: true,
    data: { systemContext: 'internal data' }
  });
  
  // Execute simple prompt as system user
  const simpleResult = await systemClient.ExecuteSimplePrompt({
    systemPrompt: 'Analyze system performance',
    modelPower: 'highest'
  });
  
  // Generate embeddings as system user
  const embeddings = await systemClient.EmbedText({
    textToEmbed: ['System log entry 1', 'System log entry 2'],
    modelSize: 'medium'
  });
  
  return { promptResult, simpleResult, embeddings };
}

// Run AI agent as system user
async function systemAgentOperation() {
  const result = await systemClient.RunAIAgent({
    agentId: 'system-agent-123',
    messages: [
      { role: 'system', content: 'Process batch data' }
    ],
    sessionId: 'system-session-456'
  });
  
  return result;
}

// Sync roles and users
const syncResult = await systemClient.SyncRolesAndUsers({
  Roles: [
    { ID: '1', Name: 'Admin', Description: 'Administrator role' }
  ],
  Users: [
    { 
      ID: '1',
      Name: 'john.doe',
      Email: 'john@example.com',
      Type: 'User',
      FirstName: 'John',
      LastName: 'Doe',
      Roles: [{ ID: '1', Name: 'Admin', Description: 'Administrator role' }]
    }
  ]
});
```

## IS-A Type Relationship Support

The GraphQL data provider provides transparent handling of IS-A type relationships (entity inheritance) on the client side. When working with IS-A child entities, the provider seamlessly manages the complexity of parent-child field coordination.

### How IS-A Relationships Work

For IS-A child entities:
- **GraphQL Input Types**: Include ALL fields (both parent and child fields) in a single mutation
- **Client Simplicity**: The client sends one mutation with all fields combined
- **Server Responsibility**: The GraphQL resolver on the server side handles:
  - Splitting fields between parent and child entities
  - Orchestrating parent saves before child saves
  - Managing transaction boundaries
  - Rolling back changes if any operation fails

### Client-Side Behavior

```typescript
// Example: Saving an AIPrompt (child of Template)
const aiPrompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');
aiPrompt.NewRecord();

// Set both parent fields (from Template)
aiPrompt.Name = 'Customer Analysis Prompt';
aiPrompt.Description = 'Analyzes customer behavior patterns';

// Set child fields (from AIPrompt)
aiPrompt.AIModelID = 'gpt-4-model-id';
aiPrompt.PromptRole = 'User';

// Save - client sends all fields in one mutation
await aiPrompt.Save();
// The server handles splitting and saving parent first, then child
```

### Transaction Management

Important aspects of transaction handling with IS-A relationships:

- **No Client-Side Transactions**: `BaseEntity.ProviderTransaction` remains null on the client side
- **Server-Side Orchestration**: The GraphQL resolver creates and manages transactions internally
- **Automatic Rollback**: If either parent or child save fails, all changes are rolled back
- **Transparent to Client**: The client code doesn't need to manage these complexities

### Load Operations

When loading IS-A child entities:
- The GraphQL query returns a merged view with both parent and child fields
- All fields appear as properties on the entity object
- No special handling required in client code
- Field access is seamless regardless of whether it's a parent or child field

```typescript
// Loading returns merged parent + child view
const prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts', contextUser);
await prompt.Load('prompt-id');

// Access parent fields
console.log(prompt.Name); // From Template

// Access child fields
console.log(prompt.PromptRole); // From AIPrompt

// Both appear as regular properties with no distinction
```

### Related Documentation

For comprehensive information about IS-A relationships in MemberJunction:
- [IS-A Relationships Architecture](../../MJCore/docs/isa-relationships.md) - Server-side implementation details, entity structure, and transaction management

## Key Classes and Types

| Class/Type | Description |
|-------|-------------|
| `GraphQLDataProvider` | Main class implementing IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, and IRunQueryProvider interfaces |
| `GraphQLProviderConfigData` | Configuration class for setting up the GraphQL provider with authentication and connection details |
| `GraphQLActionClient` | Client for executing actions and entity actions through GraphQL |
| `GraphQLAIClient` | Client for AI operations including prompts, agents, and embeddings |
| `GraphQLSystemUserClient` | Specialized client for server-to-server communication using API keys |
| `GraphQLTransactionGroup` | Manages complex multi-entity transactions with variable support |
| `FieldMapper` | Handles automatic field name mapping between client and server |
| `setupGraphQLClient` | Helper function to quickly setup and configure the GraphQL client |

## API Documentation

### Core Methods

#### Entity Operations
- `GetEntityObject(entityName: string, compositeKey?: CompositeKey)` - Get an entity object instance
- `SaveEntity(entityData: any, entityName: string, options?: EntitySaveOptions)` - Save entity data
- `DeleteEntity(entityName: string, compositeKey: CompositeKey, options?: EntityDeleteOptions)` - Delete an entity
- `GetRecordChanges(entityName: string, compositeKey: CompositeKey, operations: string[], includeInitial: boolean)` - Subscribe to entity changes

#### View and Query Operations  
- `RunView(params: RunViewParams)` - Execute a single view
- `RunViews(params: RunViewParams[])` - Execute multiple views in parallel
- `RunReport(params: RunReportParams)` - Execute a report
- `RunQuery(params: RunQueryParams)` - Execute a custom query

#### Transaction Operations
- `CreateTransactionGroup()` - Create a new transaction group
- `ExecuteTransaction(transaction: TransactionGroupBase)` - Execute a transaction group

#### Duplicate Detection
- `GetRecordDuplicates(request: PotentialDuplicateRequest)` - Find potential duplicate records
- `MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions)` - Merge duplicate records with optional transaction scope support

#### Metadata Operations
- `GetEntityRecordName(entityName: string, compositeKey: CompositeKey)` - Get display name for a record
- `GetEntityRecordNames(info: EntityRecordNameInput[])` - Get display names for multiple records
- `GetEntityDependencies(entityName: string, compositeKey: CompositeKey)` - Get record dependencies

#### AI Operations (via GraphQLAIClient)
- `RunAIPrompt(params: RunAIPromptParams)` - Execute a stored AI prompt with parameters
- `RunAIAgent(params: RunAIAgentParams)` - Run an AI agent for conversational interactions
- `ExecuteSimplePrompt(params: ExecuteSimplePromptParams)` - Execute ad-hoc prompts without stored configuration
- `EmbedText(params: EmbedTextParams)` - Generate text embeddings using local models

## Dependencies

- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/actions-base` - Action system base classes
- `@memberjunction/global` - Global utilities
- `graphql` - GraphQL language and execution
- `graphql-request` - Minimal GraphQL client
- `graphql-ws` - GraphQL WebSocket client for subscriptions
- `@tempfix/idb` - IndexedDB wrapper for offline storage
- `rxjs` - Reactive extensions for subscriptions
- `uuid` - UUID generation for session IDs

## Requirements

- Node.js 16+
- Modern browser with WebSocket support (for subscriptions)
- MemberJunction GraphQL API endpoint
- Valid JWT token or MJ API key for authentication

## License

ISC