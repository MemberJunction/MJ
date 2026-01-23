# @memberjunction/ai-mcp-server

MemberJunction's implementation of the Model Context Protocol (MCP) server, providing a standardized interface for LLMs to interact with MemberJunction data and capabilities.

## Overview

The MCP (Model Context Protocol) Server enables AI models to interact with MemberJunction entities through a standardized tool interface. It dynamically generates tools based on configuration, allowing AI models to perform CRUD operations, run views, and access metadata across your MemberJunction database.

## Features

- **MCP Implementation**: Full implementation of the Model Context Protocol (MCP) for AI model tool integration
- **Entity Access**: Expose MemberJunction entities to AI models through a consistent tooling interface
- **Agent Execution**: Execute MemberJunction AI agents with conversation history and template data support
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
    actionTools: [],
    
    // Configure agent tools
    agentTools: [
      {
        // Expose all agents
        agentName: '*',
        discover: true,
        execute: true,
        status: true,
        cancel: true
      }
    ]
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

### Agent Tools

Agent tools allow AI models to discover and execute MemberJunction AI agents.

```javascript
agentTools: [
  {
    // Agent matching (supports wildcards)
    agentName: 'DataAnalysis*',  // Agent name pattern (use '*' for all agents)
    
    // Operations to enable
    discover: true,   // Enable agent discovery
    execute: true,    // Enable agent execution
    status: true,     // Enable run status checking
    cancel: true      // Enable run cancellation
  }
]
```

#### Agent Tool Naming

The server generates tools with these naming conventions:

- `Discover_Agents`: Lists available agents based on a name pattern
- `Run_Agent`: General tool to execute any agent by name or ID
- `Execute_[AgentName]_Agent`: Specific tools for each configured agent
- `Get_Agent_Run_Status`: Check the status of an agent execution
- `Cancel_Agent_Run`: Cancel a running agent execution

#### Agent Tool Parameters and Responses

**Discover_Agents**
- Parameters: `pattern` (optional) - Wildcard pattern to match agent names
- Returns: Array of agent metadata (ID, name, description, typeID, parentID)

**Run_Agent**
- Parameters:
  - `agentNameOrId`: Agent name or ID to execute
  - `conversationHistory` (optional): Array of chat messages
  - `templateData` (optional): Data to pass to agent templates
  - `waitForCompletion` (optional): Whether to wait for completion
- Returns: `{ success: boolean, runId?: string, status?: string, returnValues?: any, errorMessage?: string }`

**Execute_[AgentName]_Agent**
- Parameters: Same as Run_Agent minus agentNameOrId
- Returns: Same as Run_Agent

**Get_Agent_Run_Status**
- Parameters: `runId` - The ID of the agent run to check
- Returns: `{ status: string, completedAt?: string, errorMessage?: string }`

**Cancel_Agent_Run**
- Parameters: `runId` - The ID of the agent run to cancel
- Returns: `{ success: boolean, errorMessage?: string }`

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

## Security and Authentication

The MCP Server uses API key authentication to secure access. All requests must include a valid API key in the request headers.

### Authentication Overview

- **Authentication Method**: API Key via HTTP headers or Bearer token
- **Supported Headers**:
  - `x-api-key` - Primary header
  - `x-mj-api-key` - Alternative header
  - `Authorization: Bearer <key>` - OAuth-style Bearer token
- **Query Parameter Fallback**: `?apiKey=<key>` or `?api_key=<key>`
- **Key Format**: `mj_sk_` prefix followed by 64 hex characters (e.g., `mj_sk_abc123...`)
- **Storage**: Keys are stored as SHA-256 hashes in the database for security
- **User Context**: Each API key is associated with a MemberJunction user account - all tool operations execute with that user's permissions

### Creating API Keys

API keys are managed through the `EncryptionEngine` class in the `@memberjunction/encryption` package. This provides a clean, type-safe API using MemberJunction's BaseEntity pattern.

```typescript
import { EncryptionEngine } from '@memberjunction/encryption';

// Create an API key for a user
const result = await EncryptionEngine.Instance.CreateAPIKey({
  userId: 'user-guid-here',
  label: 'MCP Server Integration',
  description: 'Used for Claude Desktop MCP connections',
  expiresAt: new Date('2025-12-31') // Optional - omit for non-expiring keys
}, contextUser);

if (result.success) {
  // IMPORTANT: Save this key immediately - it cannot be recovered!
  console.log('Your API Key:', result.rawKey);
  console.log('API Key ID:', result.apiKeyId);
} else {
  console.error('Failed to create API key:', result.error);
}
```

The `CreateAPIKey` method:
- Generates a secure key with format `mj_sk_[64 hex characters]`
- Stores only the SHA-256 hash in the database (never the raw key)
- Creates the database record using proper BaseEntity patterns
- Returns the raw key exactly once - it cannot be retrieved later

#### Other API Key Methods

The `EncryptionEngine` also provides these API key management methods:

```typescript
// Generate a key without storing it (for manual storage scenarios)
const { raw, hash } = EncryptionEngine.Instance.GenerateAPIKey();

// Hash a key for validation
const keyHash = EncryptionEngine.Instance.HashAPIKey(rawKey);

// Validate key format
const isValid = EncryptionEngine.Instance.IsValidAPIKeyFormat(rawKey);

// Validate a key and get the associated user
const validation = await EncryptionEngine.Instance.ValidateAPIKey(rawKey, contextUser);
if (validation.isValid) {
  console.log('User:', validation.user);
  console.log('API Key ID:', validation.apiKeyId);
}

// Revoke an API key
const revoked = await EncryptionEngine.Instance.RevokeAPIKey(apiKeyId, contextUser);
```

### API Key Schema

The API Key system uses four tables:

**APIKey Table:**
- `ID`: Unique identifier
- `Hash`: SHA-256 hash of the raw API key (64 hex characters)
- `UserID`: Foreign key to User - the account context for this key
- `Label`: Friendly name (e.g., "Production MCP Client", "CI/CD Pipeline")
- `Description`: Optional detailed description
- `Status`: `Active` or `Revoked`
- `ExpiresAt`: Optional expiration timestamp (NULL = never expires)
- `LastUsedAt`: Automatically updated on each use
- `CreatedByUserID`: User who created the key

**APIScope Table:**
- Defines reusable permission definitions (e.g., `entities:read`, `agents:execute`)
- Organized by category (Entities, Agents, Admin)

**APIKeyScope Table:**
- Junction table linking API keys to scopes
- Enables fine-grained permission control (coming soon)

**APIKeyUsageLog Table:**
- Tracks API key usage for analytics and debugging
- Records endpoint, operation, response time, IP address, etc.

### Using API Keys

#### With HTTP Headers

```bash
# Using x-api-key header (recommended)
curl -H "x-api-key: mj_sk_YOUR_API_KEY_HERE" \
  http://localhost:3100/mcp

# Using x-mj-api-key header (alternative)
curl -H "x-mj-api-key: mj_sk_YOUR_API_KEY_HERE" \
  http://localhost:3100/mcp

# Using Authorization Bearer token (OAuth-style)
curl -H "Authorization: Bearer mj_sk_YOUR_API_KEY_HERE" \
  http://localhost:3100/mcp

# Using query parameter (useful for SSE connections)
curl "http://localhost:3100/mcp?apiKey=mj_sk_YOUR_API_KEY_HERE"
```

#### With MCP Clients

Configure your MCP client to include the API key in headers:

```typescript
// Example MCP client configuration
const client = new MCPClient({
  url: 'http://localhost:3100/mcp',
  headers: {
    'x-api-key': 'mj_sk_YOUR_API_KEY_HERE'
  }
});
```

#### With Claude Desktop

Add to your Claude Desktop MCP server configuration:

```json
{
  "mcpServers": {
    "memberjunction": {
      "command": "npx",
      "args": ["-y", "@memberjunction/ai-mcp-server"],
      "env": {
        "X_API_KEY": "mj_sk_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### System API Key (Development Mode)

For backward compatibility and development, you can configure a system API key in your `mj.config.cjs`:

```javascript
module.exports = {
  mcpServerSettings: {
  systemApiKey: true,  // Allows requests without API key header
    // ... other settings
  }
}
```

**⚠️ Warning**: System API key mode is for development only. Always use proper API key authentication in production.
 
### Security Best Practices

1. **Never Commit Keys**: Add API keys to `.gitignore` and use environment variables
2. **Rotate Keys**: Regularly rotate keys, especially for production systems
3. **Use Expiration**: Set expiration dates for temporary or test keys
4. **Monitor Usage**: Review APIKeyUsageLog for suspicious activity
5. **Label Keys**: Use descriptive labels to track what each key is used for
6. **Revoke Unused Keys**: Clean up keys that are no longer needed
7. **Store Securely**: Save raw keys in a secure password manager or secrets vault

### Authentication Flow

1. Client sends request with API key via header, Bearer token, or query parameter
2. Server extracts API key from (in order of priority):
   - `x-api-key` header
   - `x-mj-api-key` header
   - `Authorization: Bearer <key>` header
   - `apiKey` or `api_key` query parameter
3. Server validates key format (must match `mj_sk_[64 hex chars]`)
4. Server hashes the key (SHA-256) and looks up in CredentialEngine cache
5. Server checks:
   - Key exists and hash matches
   - Status is `Active`
   - Not expired (ExpiresAt is NULL or in future)
   - Associated user account is active
6. Server loads the full user from the database using the key's UserID
7. Server updates `LastUsedAt` timestamp and logs usage
8. Session is created with the authenticated user context
9. All tool executions use this user's permissions

### Troubleshooting Authentication

**"API key required"**
- Ensure you're including the `x-api-key`, `x-mj-api-key`, or `Authorization: Bearer` header
- Check that the header value is not empty
- Try using the query parameter: `?apiKey=mj_sk_...`

**"Invalid API key format"**
- Key must start with `mj_sk_` prefix
- Key must be exactly 70 characters total (`mj_sk_` + 64 hex chars)

**"API key not found"**
- The key hash doesn't match any record in the database
- Verify you're using the raw key, not the hash
- Check that the key was inserted into `__mj.APIKey`

**"API key has been revoked"**
- The key's Status field is set to 'Revoked'
- Create a new key or update the Status back to 'Active'

**"API key has expired"**
- The ExpiresAt timestamp is in the past
- Update the expiration date or create a new key

**"User account is inactive"**
- The associated user's IsActive field is false
- Activate the user account or create a key for an active user

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

**Entity Tools:**
- `Get_All_Entities` - Get all entity metadata
- `Get_UserEntity_Record` - Get a user by ID
- `Run_UserEntity_View` - Query users with filters
- `Get_CompanyEntity_Record` - Get a company by ID
- `Create_CompanyEntity_Record` - Create a new company
- `Update_CompanyEntity_Record` - Update a company
- `Delete_CompanyEntity_Record` - Delete a company
- `Run_CompanyEntity_View` - Query companies
- And many more for all entities in your database

**Agent Tools:**
- `Discover_Agents` - Find available agents
- `Run_Agent` - Execute any agent by name or ID
- `Execute_DataAnalysisAgent_Agent` - Execute the Data Analysis agent
- `Execute_ReportGeneratorAgent_Agent` - Execute the Report Generator agent
- `Get_Agent_Run_Status` - Check agent execution status
- `Cancel_Agent_Run` - Cancel a running agent

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