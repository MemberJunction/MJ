# @memberjunction/ai-mcp-server

MemberJunction's implementation of the Model Context Protocol (MCP) server, providing a standardized interface for LLMs to interact with MemberJunction data and capabilities.

## Overview

The MCP (Model Context Protocol) Server enables AI models to interact with MemberJunction entities through a standardized tool interface. It dynamically generates tools based on configuration, allowing AI models to perform CRUD operations, run views, and access metadata across your MemberJunction database.

## Features

- **MCP Implementation**: Full implementation of the Model Context Protocol (MCP) for AI model tool integration
- **Entity Access**: Expose MemberJunction entities to AI models through a consistent tooling interface
- **Configurable Tools**: Generate tools dynamically based on configuration with wildcard support
- **CRUD Operations**: Support for creating, reading, updating, and deleting entity records
- **View Execution**: Run entity views with filtering, sorting, and field selection
- **Metadata Access**: Built-in tool to retrieve all entity metadata including fields and relationships
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **SSE Transport**: Server-Sent Events based communication for real-time interactions

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

### Binary Execution

When installed globally or locally, the package provides a `MemberJunction` executable that starts the MCP server. The server automatically initializes when the module is loaded.

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

The server generates tools with naming conventions (using the entity's ClassName property):

- `Get_EntityName_Record`: Retrieve a record by primary key
- `Create_EntityName_Record`: Create a new record
- `Update_EntityName_Record`: Update an existing record
- `Delete_EntityName_Record`: Delete a record
- `Run_EntityName_View`: Run a view against the entity

#### Tool Parameters and Responses

**Get Tool**
- Parameters: Primary key field(s) of the entity
- Returns: JSON object of the record or empty object if not found

**Create Tool**
- Parameters: All non-readonly fields (primary keys excluded)
- Returns: `{ success: boolean, record?: object, errorMessage?: string }`

**Update Tool**
- Parameters: Primary key field(s) + all non-readonly fields
- Returns: `{ success: boolean, record?: object, errorMessage?: string }`

**Delete Tool**
- Parameters: Primary key field(s)
- Returns: `{ success: boolean, record?: object, errorMessage?: string }`

**RunView Tool**
- Parameters:
  - `extraFilter` (optional): SQL WHERE clause filter
  - `orderBy` (optional): SQL ORDER BY clause
  - `fields` (optional): Array of field names to include
- Returns: JSON object with view results

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

## Built-in Tools

The server includes a built-in tool that's always available:

### Get_All_Entities

- **Description**: Retrieves all Entities including entity fields and relationships from the MemberJunction Metadata
- **Parameters**: None
- **Returns**: JSON representation of all entity metadata including fields, relationships, and permissions

Example response structure:
```json
[
  {
    "ID": "entity-id",
    "Name": "Users",
    "SchemaName": "__mj",
    "ClassName": "UserEntity",
    "Fields": [...],
    "PrimaryKeys": [...],
    "RelatedEntities": [...]
  }
]
```

## API Details

### GET /mcp

The primary endpoint for Server-Sent Events (SSE) based MCP protocol communication. This endpoint handles:

- Tool discovery requests
- Tool execution requests
- Server capability negotiations
- Real-time bidirectional communication with AI models

The MCP protocol uses JSON-RPC 2.0 over Server-Sent Events for communication.

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

## Complete Example

Here's a complete example of setting up and using the MCP server:

### 1. Create Configuration File (mj.config.cjs)

```javascript
module.exports = {
  // Database connection
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '1433'),
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbDatabase: process.env.DB_DATABASE,
  dbTrustServerCertificate: true,
  mjCoreSchema: '__mj',
  
  databaseSettings: {
    connectionTimeout: 30000,
    requestTimeout: 30000
  },
  
  // MCP Server Configuration
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    
    entityTools: [
      // Expose all entities with all operations
      {
        entityName: '*',
        schemaName: '*',
        get: true,
        create: true,
        update: true,
        delete: true,
        runView: true
      },
      
      // Override: Users entity with limited operations
      {
        entityName: 'Users',
        schemaName: '__mj',
        get: true,
        runView: true,
        create: false,
        update: false,
        delete: false
      }
    ]
  }
}
```

### 2. Start the Server

```bash
# Using the CLI
MemberJunction

# Or programmatically
node -e "import('@memberjunction/ai-mcp-server').then(m => m.initializeServer())"
```

### 3. Connect Your AI Model

Configure your AI model client to connect to:
```
http://localhost:3100/mcp
```

### 4. Available Tools Example

With the above configuration, your AI model will have access to tools like:

- `Get_All_Entities` - Get all entity metadata
- `Get_UserEntity_Record` - Get a user by ID
- `Run_UserEntity_View` - Query users with filters
- `Get_CompanyEntity_Record` - Get a company by ID
- `Create_CompanyEntity_Record` - Create a new company
- `Update_CompanyEntity_Record` - Update a company
- `Delete_CompanyEntity_Record` - Delete a company
- `Run_CompanyEntity_View` - Query companies
- And many more for all entities in your database

## Field Type Support

The server automatically handles different field types with appropriate Zod validation:

- **String Fields**: Basic strings or enums (if entity field values are defined)
- **Number Fields**: Numeric validation
- **Boolean Fields**: Boolean validation
- **Date Fields**: Date validation
- **Value Lists**: Automatically creates enums for fields with predefined values
- **Optional Fields**: Non-primary key fields can be optional for updates

## Dependencies

- `@memberjunction/core`: Core MemberJunction library
- `@memberjunction/core-entities`: MemberJunction entity management
- `@memberjunction/global`: Global utilities and types
- `@memberjunction/sqlserver-dataprovider`: SQL Server data provider
- `@modelcontextprotocol/sdk`: MCP protocol SDK
- `fastmcp`: Fast implementation of MCP
- `cosmiconfig`: Configuration management
- `dotenv`: Environment variable support
- `typeorm`: ORM for database access
- `zod`: Schema validation

## Troubleshooting

### Server Won't Start

1. **Check Configuration**: Ensure `enableMCPServer` is set to `true` in your config
2. **Database Connection**: Verify database credentials and connectivity
3. **Port Conflicts**: Check if port 3100 (or your configured port) is available
4. **Missing Dependencies**: Run `npm install` to ensure all dependencies are installed

### Tools Not Appearing

1. **Entity Matching**: Check that your entityName/schemaName patterns match existing entities
2. **Permissions**: Ensure the database user has appropriate permissions
3. **Configuration**: Verify the entityTools array is properly configured

### Common Issues

- **"Config file not found"**: Create a `mj.config.cjs` file in your project root
- **Database timeout**: Increase `connectionTimeout` and `requestTimeout` in config
- **Authentication errors**: Check database credentials and SQL Server authentication mode

## Development Notes

### Building from Source

```bash
# Clone the repository
git clone https://github.com/MemberJunction/MJ.git
cd MJ/packages/AI/MCPServer

# Install dependencies
npm install

# Build the package
npm run build

# Start the server
npm start
```

### Architecture

The MCP Server is built on:
- **FastMCP**: Provides the MCP protocol implementation and SSE transport
- **MemberJunction Core**: Handles entity metadata and database operations
- **TypeORM**: Manages database connections
- **Zod**: Validates tool parameters and configuration

**Note**: The server automatically initializes when the module is imported, making it suitable for use as both a library and a CLI tool. The `initializeServer()` function is called at module load time in `Server.ts`.

### Extending the Server

To add custom tools or modify behavior:

1. Fork the repository
2. Modify `src/Server.ts` to add custom tools
3. Use the `server.addTool()` method to register new tools
4. Build and test your changes

## License

ISC