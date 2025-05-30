# MemberJunction CodeGen API

A specialized API server for handling MemberJunction code generation operations, specifically focused on generating SQL code for entity permissions.

## Overview

The `mj_codegen_api` package provides a lightweight Express-based API server that exposes endpoints for generating SQL code based on MemberJunction entity metadata. It serves as a crucial component in the MemberJunction ecosystem by automating the generation of SQL stored procedures and permission structures for entities.

## Key Features

- **Entity Permission SQL Generation**: Automatically generate SQL stored procedures for entity CRUD operations with proper permissions
- **Metadata Refresh**: Force metadata refresh before generating SQL to ensure up-to-date entity information
- **Selective Entity Processing**: Generate SQL for specific entities based on their IDs
- **Integration with MJ Core**: Deep integration with MemberJunction core components and SQL code generation library

## Installation

### Prerequisites

- Node.js 16+ (18+ recommended)
- SQL Server database with MemberJunction schema installed
- Access to MemberJunction core packages

### Setup

1. Clone the repository and navigate to the package directory:

```bash
cd packages/MJCodeGenAPI
```

2. Configure environment variables (create a `.env` file in the package directory):

```
# Server Configuration
PORT=3999

# Database Configuration (inherited from MemberJunction configuration)
# These should match your MemberJunction database setup
MJ_CORE_DATASOURCE_HOST=your_db_host
MJ_CORE_DATASOURCE_PORT=1433
MJ_CORE_DATASOURCE_USERNAME=your_db_user
MJ_CORE_DATASOURCE_PASSWORD=your_db_password
MJ_CORE_DATASOURCE_DATABASE=your_db_name
```

3. Install dependencies (from the repository root):

```bash
npm install
```

4. Build the project:

```bash
npm run build
```

5. Start the API server:

```bash
npm start
```

## Configuration

The API server uses the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 3999 |

The database configuration is inherited from the MemberJunction codegen library configuration. The server will use the standard MemberJunction database connection settings.

## API Endpoints

### Entity Permissions SQL Generation

#### `POST /api/entity-permissions`

Generate SQL stored procedures for entity permissions. This endpoint refreshes metadata and generates SQL code for the specified entities.

**Request Body:**
```json
{
  "entityIDArray": [1, 2, 3]
}
```

**Parameters:**
- `entityIDArray` (required): Array of entity IDs to generate SQL permissions for

**Response (Success):**
```json
{
  "status": "ok"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "errorMessage": "Error message details"
}
```

**Example Usage:**
```typescript
import axios from 'axios';

const response = await axios.post('http://localhost:3999/api/entity-permissions', {
  entityIDArray: [1, 2, 3] // Entity IDs for User, Role, UserRole
});

if (response.data.status === 'ok') {
  console.log('Entity permissions updated successfully');
}
```

**What it does:**
1. Validates the request contains a valid `entityIDArray`
2. Forces a metadata refresh to ensure entity information is up-to-date
3. Filters entities based on the provided IDs
4. Generates SQL stored procedures for CRUD operations with proper permissions
5. Executes the generated SQL directly in the database (does not write files to disk)

**Note**: The current implementation has `writeFiles: false` and `skipExecution: false`, which means:
- SQL is generated and executed directly in the database
- No SQL files are written to the filesystem
- Only permission-related SQL is generated (`onlyPermissions: true`)

## Development

### Running in Development Mode

```bash
npm run dev
```

For debugging:

```bash
npm run dev:debug
```

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
```

## Integration with MemberJunction

This API server is designed to work closely with other MemberJunction packages:

- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/global`: Shared utilities and types
- `@memberjunction/core-entities`: Base entity definitions
- `@memberjunction/codegen-lib`: Code generation library
- `@memberjunction/sqlserver-dataprovider`: SQL Server data access

## Architecture

The API server is built on top of several key MemberJunction components:

- **Express Server**: Simple HTTP server handling POST requests
- **MJGlobal ClassFactory**: Dynamic instantiation of code generation classes
- **SQLCodeGenBase**: Core SQL code generation functionality
- **Metadata Management**: Automatic refresh before code generation
- **TypeORM Integration**: Database connectivity through MemberJunction's data layer

## Use Cases

1. **Database Schema Updates**: Regenerate SQL procedures when entity schemas change
2. **Permission Management**: Update entity-level CRUD permissions through SQL generation
3. **CI/CD Integration**: Automate SQL code generation in deployment pipelines
4. **Development Workflow**: Quick regeneration of SQL procedures during development

## Error Handling

The API implements comprehensive error handling:
- **400 Bad Request**: Invalid request body or missing `entityIDArray`
- **500 Internal Server Error**: Failed to create code generation instance or SQL generation errors
- All errors include descriptive messages in the response body

## Notes

- This API generates and executes SQL permission procedures directly in the database
- It specifically generates permission-related SQL only (`onlyPermissions: true`)
- No SQL files are written to disk in the current implementation
- Metadata is always refreshed before generation to ensure accuracy
- The API runs on port 3999 by default (configurable via PORT environment variable)
- To modify the behavior (e.g., write files, generate full SQL), adjust the parameters in the `generateAndExecuteEntitySQLToSeparateFiles` call

## License

ISC