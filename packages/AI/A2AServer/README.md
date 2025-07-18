# MemberJunction A2A Server

This package provides a Google Agent-to-Agent (A2A) protocol server implementation for MemberJunction. It allows MemberJunction to expose its capabilities as an A2A agent, enabling interoperability with other A2A-compliant agents.

## About Agent-to-Agent (A2A) Protocol

A2A is an open protocol developed by Google that enables communication and interoperability between opaque agentic applications. The protocol is designed to facilitate collaboration between AI agents built on different platforms and frameworks.

- Official A2A Documentation: [https://google.github.io/A2A/](https://google.github.io/A2A/)
- GitHub Repository: [https://github.com/google/A2A](https://github.com/google/A2A)
- Protocol Specification: [https://google.github.io/A2A/specification/](https://google.github.io/A2A/specification/)

## Features

- Implements the Google A2A protocol specification
- Exposes MemberJunction entities as agent capabilities
- Executes MemberJunction AI agents through A2A protocol
- Supports CRUD operations on entities (Get, Create, Update, Delete, Query)
- Task-based interaction model with message and artifact handling
- Server-Sent Events (SSE) support for streaming responses
- Configurable entity access permissions
- Wildcard pattern matching for entity and agent capability configuration
- Agent discovery, execution, monitoring, and cancellation

## Installation

```bash
npm install @memberjunction/a2aserver
```

## Configuration

The A2A server is configured through your MemberJunction configuration file (`mj.config.js` or similar). Add the following settings:

```javascript
// mj.config.js
module.exports = {
  // Database configuration
  dbHost: 'localhost',
  dbPort: 1433,
  dbDatabase: 'your_database',
  dbUsername: 'your_username',
  dbPassword: 'your_password',
  dbTrustServerCertificate: false,
  dbInstanceName: '', // Optional: SQL Server instance name
  mjCoreSchema: '__mj',
  
  databaseSettings: {
    connectionTimeout: 15000,
    requestTimeout: 15000,
    dbReadOnlyUsername: '', // Optional
    dbReadOnlyPassword: '', // Optional
  },
  
  // A2A Server configuration
  a2aServerSettings: {
    enableA2AServer: true,
    port: 3200,
    agentName: "MemberJunction",
    agentDescription: "MemberJunction A2A Agent",
    streamingEnabled: true,
    userEmail: "user@example.com", // Optional: specific user for entity operations
    entityCapabilities: [
      {
        entityName: "*",        // Wildcard patterns supported
        schemaName: "__mj",     // Schema name pattern
        get: true,
        create: false,
        update: false,
        delete: false,
        runView: true           // Enable query operations
      },
      {
        entityName: "User*",    // Pattern matching (e.g., Users, UserRoles)
        schemaName: "*",
        get: true,
        create: true,
        update: true,
        delete: false,
        runView: true
      }
    ],
    agentCapabilities: [
      {
        agentName: "*",          // Wildcard patterns supported
        discover: true,
        execute: true,
        monitor: true,
        cancel: true
      },
      {
        agentName: "Analysis*",  // Pattern matching (e.g., AnalysisAgent, AnalysisReportAgent)
        discover: true,
        execute: true,
        monitor: true,
        cancel: false
      }
    ]
  }
}
```

### Configuration Options

#### a2aServerSettings

- `enableA2AServer` (boolean): Enable/disable the A2A server. Default: `false`
- `port` (number): Port number for the A2A server. Default: `3200`
- `agentName` (string): Name of your A2A agent. Default: `"MemberJunction"`
- `agentDescription` (string): Description of your agent. Default: `"MemberJunction A2A Agent"`
- `streamingEnabled` (boolean): Enable SSE streaming responses. Default: `true`
- `userEmail` (string, optional): Email of the user context for entity operations
- `entityCapabilities` (array): Configure which entities and operations to expose
- `agentCapabilities` (array): Configure which AI agents and operations to expose

#### Entity Capabilities

Each capability configuration supports:
- `entityName` (string): Entity name pattern (supports wildcards: `*`, `prefix*`, `*suffix`, `*contains*`)
- `schemaName` (string): Schema name pattern (supports wildcards)
- `get` (boolean): Allow retrieving individual records
- `create` (boolean): Allow creating new records
- `update` (boolean): Allow updating existing records
- `delete` (boolean): Allow deleting records
- `runView` (boolean): Allow querying/listing records

#### Agent Capabilities

Each agent capability configuration supports:
- `agentName` (string): Agent name pattern (supports wildcards: `*`, `prefix*`, `*suffix`, `*contains*`)
- `discover` (boolean): Allow discovering available agents
- `execute` (boolean): Allow executing agents
- `monitor` (boolean): Allow monitoring agent run status
- `cancel` (boolean): Allow cancelling agent runs

## Usage

### Starting the Server

```typescript
import { initializeA2AServer } from '@memberjunction/a2aserver';

// Initialize and start the A2A server
await initializeA2AServer();

// The server will start on the configured port
// Agent card available at: http://localhost:3200/a2a/agent-card
```

### API Endpoints

The A2A server exposes the following endpoints:

#### GET `/a2a/agent-card`
Returns the agent card describing capabilities and endpoints.

#### POST `/a2a/tasks/send`
Send a message to create or update a task.

```typescript
// Request body
{
  "taskId": "optional-task-id", // Omit to create new task
  "message": {
    "parts": [
      {
        "type": "text",
        "content": "Get user with ID 123"
      }
    ]
  }
}

// Response
{
  "taskId": "generated-task-id",
  "status": "pending" | "in_progress" | "completed" | "cancelled" | "failed"
}
```

#### POST `/a2a/tasks/sendSubscribe`
Send a message and subscribe to updates via Server-Sent Events.

#### GET `/a2a/tasks/:taskId`
Get the current status and details of a task.

#### POST `/a2a/tasks/:taskId/cancel`
Cancel a running task.

### Message Format Examples

#### Agent Operations

```typescript
// Discover agents
{
  "message": {
    "parts": [{
      "type": "text",
      "content": "Discover agents matching 'Analysis*'"
    }]
  }
}

// Execute agent
{
  "message": {
    "parts": [{
      "type": "data",
      "content": {
        "operation": "executeAgent",
        "agentNameOrId": "DataAnalysisAgent",
        "parameters": {
          "conversationHistory": [
            { "role": "user", "content": "Analyze sales data for Q4" }
          ],
          "templateData": {
            "quarter": "Q4",
            "year": 2024
          },
          "waitForCompletion": true
        }
      }
    }]
  }
}

// Check agent run status
{
  "message": {
    "parts": [{
      "type": "data",
      "content": {
        "operation": "getAgentRunStatus",
        "runId": "run-123456"
      }
    }]
  }
}

// Cancel agent run
{
  "message": {
    "parts": [{
      "type": "data",
      "content": {
        "operation": "cancelAgentRun",
        "runId": "run-123456"
      }
    }]
  }
}
```

#### Text-based Operations

```typescript
// Get operation
{
  "message": {
    "parts": [{
      "type": "text",
      "content": "Get Users where ID = 123"
    }]
  }
}

// Query operation
{
  "message": {
    "parts": [{
      "type": "text",
      "content": "Query Employees where Department = 'Sales' order by LastName"
    }]
  }
}
```

#### Structured Data Operations

```typescript
// Create operation
{
  "message": {
    "parts": [{
      "type": "data",
      "content": {
        "operation": "create",
        "entity": "Users",
        "parameters": {
          "FirstName": "John",
          "LastName": "Doe",
          "Email": "john.doe@example.com"
        }
      }
    }]
  }
}

// Update operation
{
  "message": {
    "parts": [{
      "type": "data",
      "content": {
        "operation": "update",
        "entity": "Users",
        "parameters": {
          "ID": "123",
          "Email": "newemail@example.com"
        }
      }
    }]
  }
}
```

## API Documentation

### Classes

#### `AgentOperations`

Handles all agent-related operations for the A2A server.

**Methods:**

- `discoverAgents(pattern?: string): Promise<AgentInfo[]>` - Discover available agents
- `executeAgent(agentNameOrId: string, parameters: AgentExecutionParameters): Promise<AgentExecutionResult>` - Execute an agent
- `getAgentRunStatus(runId: string): Promise<AgentRunStatus>` - Get agent run status
- `cancelAgentRun(runId: string): Promise<CancelResult>` - Cancel an agent run
- `processOperation(operation: string, parameters: any): Promise<OperationResult>` - Process any agent operation

#### `EntityOperations`

Handles all entity-related operations for the A2A server.

**Methods:**

- `findEntity(entityName: string): EntityInfo | null` - Find an entity by name
- `getEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult>` - Get a single entity by primary key
- `createEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult>` - Create a new entity
- `updateEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult>` - Update an existing entity
- `deleteEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult>` - Delete an entity
- `queryEntity(entityName: string, parameters: OperationParameters): Promise<OperationResult>` - Query entities with filters
- `parseCommandFromText(textContent: string): { operation: string, entityName: string, parameters: OperationParameters }` - Parse natural language commands
- `processOperation(operation: string, entityName: string, parameters: OperationParameters): Promise<OperationResult>` - Process any operation

### Interfaces

#### `OperationResult`
```typescript
interface OperationResult {
  success: boolean;
  result?: any;
  errorMessage?: string;
}
```

#### `AgentExecutionParameters`
```typescript
interface AgentExecutionParameters {
  conversationHistory?: ChatMessage[];
  templateData?: Record<string, any>;
  waitForCompletion?: boolean;
}
```

#### `AgentExecutionResult`
```typescript
interface AgentExecutionResult {
  success: boolean;
  runId?: string;
  status?: string;
  returnValues?: any;
  errorMessage?: string;
}
```

#### `AgentRunStatus`
```typescript
interface AgentRunStatus {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  completedAt?: string;
  errorMessage?: string;
}
```

#### `OperationParameters`
```typescript
interface OperationParameters {
  [key: string]: any;
}
```

## Dependencies

- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/global`: Global utilities and types
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `express`: Web server framework
- `typeorm`: ORM for database operations
- `zod`: Schema validation
- `cosmiconfig`: Configuration file loader
- `dotenv`: Environment variable support

## Integration with MemberJunction

The A2A server integrates deeply with MemberJunction's systems:

1. **Entity System**: 
   - Automatically discovers and exposes configured entities
   - Uses MemberJunction's data access patterns for all operations
   - Respects user permissions and security model

2. **AI Agent System**:
   - Integrates with AIEngine for agent discovery
   - Uses AgentRunner for agent execution
   - Tracks runs with AIAgentRunEntity
   - Supports conversation history and template data

3. **Type Safety**: Leverages TypeScript for type-safe operations

## Error Handling

The server provides detailed error responses:

```typescript
{
  "error": {
    "code": 400 | 404 | 500,
    "message": "Descriptive error message"
  }
}
```

Common error scenarios:
- Entity not found
- Missing required parameters
- Permission denied
- Database connection errors
- Invalid operation for entity

## Development

### Building

```bash
npm run build
```

### TypeScript Configuration

The package uses ES modules and targets modern JavaScript environments. See `tsconfig.json` for detailed compiler options.

## License

MIT