# @memberjunction/ai-mcp-server

MemberJunction's implementation of the Model Context Protocol (MCP) server, providing a standardized interface for LLMs to interact with MemberJunction data and capabilities.

## Features

- **MCP Implementation**: Full implementation of the Model Context Protocol (MCP) for AI model tool integration
- **Entity Access**: Expose MemberJunction entities to AI models through a consistent tooling interface
- **Configurable Tools**: Generate tools dynamically based on configuration
- **CRUD Operations**: Support for creating, reading, updating, and deleting entity records
- **View Execution**: Run entity views with filtering and sorting
- **Secure Access**: Authentication and authorization support
- **SSE Transport**: Server-Sent Events based communication

## Installation

```bash
npm install @memberjunction/ai-mcp-server
```

## Requirements

- Node.js 16+
- SQL Server database with MemberJunction schema
- MemberJunction Core libraries
- Configuration file

## Configuration

The server reads configuration from a `mj.config.cjs` file using cosmiconfig. Create this file in your project root:

```javascript
module.exports = {
  // Database settings
  dbHost: 'localhost',
  dbPort: 1433,
  dbUsername: 'your_db_username',
  dbPassword: 'your_db_password',
  dbDatabase: 'your_database',
  dbInstanceName: '', // Optional
  dbTrustServerCertificate: true, // Optional
  mjCoreSchema: '__mj',
  
  // Database connection settings
  databaseSettings: {
    connectionTimeout: 30000,
    requestTimeout: 30000
  },
  
  // MCP server settings
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    
    // Configure entity tools
    entityTools: [
      {
        // Expose all entities
        entityName: '*',
        schemaName: '*',
        get: true,
        create: true,
        update: true,
        delete: true,
        runView: true
      },
      // Expose specific entity with specific operations
      {
        entityName: 'Users',
        schemaName: '__mj',
        get: true,
        runView: true
      }
    ],
    
    // Configure action tools (not yet implemented)
    actionTools: []
  }
}
```

You can also use environment variables with a `.env` file:

```
DB_HOST=localhost
DB_PORT=1433
DB_USERNAME=your_db_username
DB_PASSWORD=your_db_password
DB_DATABASE=your_database
```

## Usage

### Starting the Server

```bash
# Install globally
npm install -g @memberjunction/ai-mcp-server

# Run the server
MemberJunction

# Or via npx
npx @memberjunction/ai-mcp-server
```

### Import and Start Programmatically

```typescript
import { initializeServer } from '@memberjunction/ai-mcp-server';

// Start the server
await initializeServer();
```

## Tool Configuration

### Entity Tools

Entity tools allow AI models to interact with MemberJunction entities.

```javascript
entityTools: [
  {
    // Entity matching (supports wildcards)
    entityName: 'Users', // Entity name (use '*' for all entities)
    schemaName: '__mj',  // Schema name (use '*' for all schemas)
    
    // Operations to enable
    get: true,     // Get entity by primary key
    create: true,  // Create new entity record
    update: true,  // Update existing entity record
    delete: true,  // Delete entity record
    runView: true  // Run entity view with filtering
  }
]
```

#### Tool Naming

The server generates tools with naming conventions:

- `Get_EntityName_Record`: Retrieve a record by primary key
- `Create_EntityName_Record`: Create a new record
- `Update_EntityName_Record`: Update an existing record
- `Delete_EntityName_Record`: Delete a record
- `Run_EntityName_View`: Run a view against the entity

### Wildcard Support

You can use wildcards in `entityName` and `schemaName`:

- `*`: Match all entities/schemas
- `Users*`: Match entities/schemas starting with "Users"
- `*Users`: Match entities/schemas ending with "Users"
- `*Users*`: Match entities/schemas containing "Users"

## Connecting Models to the Server

The server endpoint is available at:

```
http://localhost:3100/mcp
```

You can connect any MCP-compatible client to this endpoint. The MCP protocol allows AI models to discover and use the available tools.

## API Details

### GET /mcp

The primary endpoint for Server-Sent Events (SSE) based MCP protocol communication.

## Security

By default, the server runs without authentication. For production, you should configure authentication in the server options:

```javascript
// Example using basic auth
const serverOptions = {
  transportType: "sse",
  sse: {
    endpoint: "/mcp",
    port: 3100
  },
  auth: {
    type: "basic",
    username: "user",
    password: "pass"
  }
};
```

## Dependencies

- `@memberjunction/core`: Core MemberJunction library
- `@memberjunction/core-entities`: MemberJunction entity management
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `@modelcontextprotocol/sdk`: MCP protocol SDK
- `fastmcp`: Fast implementation of MCP
- `cosmiconfig`: Configuration management
- `typeorm`: ORM for database access
- `zod`: Schema validation

## License

ISC