# MemberJunction CodeGen API

A specialized API server for handling MemberJunction code generation operations, particularly focused on entity permissions and metadata generation.

## Overview

The `mj_codegen_api` package provides a lightweight Express-based API server that exposes endpoints for generating TypeScript code based on MemberJunction database metadata. It serves as a crucial component in the MemberJunction ecosystem by automating the creation of entity classes, permission structures, and related code artifacts.

## Key Features

- **Permission Code Generation**: Automatically generate TypeScript code for entity permissions
- **Entity Class Generation**: Generate TypeScript classes for database entities
- **Metadata Management**: API endpoints for working with entity metadata
- **Code Synchronization**: Keep generated code in sync with database schema changes
- **REST API**: Simple REST interface for integration with development workflows
- **Integration with MJ Core**: Deep integration with MemberJunction core components

## Installation

### Prerequisites

- Node.js 16+ (18+ recommended)
- SQL Server database with MemberJunction schema installed
- Access to MemberJunction core packages

### Setup

1. Install the package:

```bash
npm install mj_codegen_api
```

2. Configure environment variables (create a `.env` file):

```
MJ_DBDRIVER=SQLServerDataProvider
MJ_HOST=your_db_host
MJ_PORT=1433
MJ_USER=your_db_user
MJ_PASSWORD=your_db_password
MJ_DATABASE=your_db_name
MJ_APIPORT=3001
MJ_CODEGEN_OUTPUT_DIR=./generated
```

3. Build the project:

```bash
npm run build
```

4. Start the API server:

```bash
npm start
```

## Configuration

The API server can be configured through environment variables or a configuration file:

| Variable | Description | Default |
|----------|-------------|---------|
| `MJ_DBDRIVER` | Database provider | SQLServerDataProvider |
| `MJ_HOST` | Database host | localhost |
| `MJ_PORT` | Database port | 1433 |
| `MJ_USER` | Database username | - |
| `MJ_PASSWORD` | Database password | - |
| `MJ_DATABASE` | Database name | - |
| `MJ_APIPORT` | API server port | 3001 |
| `MJ_CODEGEN_OUTPUT_DIR` | Output directory for generated code | ./generated |
| `MJ_CODEGEN_TEMPLATES_DIR` | Templates directory | ./templates |

## API Endpoints

### Permissions Generation

#### `POST /api/codegen/permissions`

Generate TypeScript code for entity permissions.

**Request Body:**
```json
{
  "entities": ["User", "Role", "UserRole"],
  "outputPath": "./src/generated/permissions"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Permissions generated successfully",
  "files": [
    "UserPermissions.ts",
    "RolePermissions.ts",
    "UserRolePermissions.ts"
  ]
}
```

### Entity Generation

#### `POST /api/codegen/entities`

Generate TypeScript entity classes for database tables.

**Request Body:**
```json
{
  "entities": ["User", "Role"],
  "outputPath": "./src/generated/entities",
  "includeValidation": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Entity classes generated successfully",
  "files": [
    "User.entity.ts",
    "Role.entity.ts"
  ]
}
```

### Metadata Operations

#### `GET /api/metadata/entities`

Get all available entity metadata.

**Response:**
```json
{
  "success": true,
  "entities": [
    {
      "ID": 1,
      "Name": "User",
      "SchemaName": "dbo",
      "BaseTable": "Users",
      "Description": "System user information"
    },
    // ...more entities
  ]
}
```

#### `GET /api/metadata/entity/:name`

Get metadata for a specific entity.

**Response:**
```json
{
  "success": true,
  "entity": {
    "ID": 1,
    "Name": "User",
    "SchemaName": "dbo",
    "BaseTable": "Users",
    "Description": "System user information",
    "Fields": [
      {
        "ID": 1,
        "Name": "ID",
        "DataType": "int",
        "IsPrimaryKey": true
      },
      // ...more fields
    ]
  }
}
```

### Code Generation Operations

#### `POST /api/codegen/run`

Run a complete code generation process.

**Request Body:**
```json
{
  "outputDirectory": "./src/generated",
  "includeEntities": true,
  "includePermissions": true,
  "includeActions": true,
  "entities": ["User", "Role"] // Optional, if omitted all entities will be included
}
```

**Response:**
```json
{
  "success": true,
  "message": "Code generation completed successfully",
  "generatedFiles": [
    "./src/generated/entities/User.entity.ts",
    "./src/generated/entities/Role.entity.ts",
    "./src/generated/permissions/UserPermissions.ts",
    "./src/generated/permissions/RolePermissions.ts",
    "./src/generated/actions/UserActions.ts",
    "./src/generated/actions/RoleActions.ts"
  ]
}
```

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

## Use Cases

1. **Development Workflow Integration**: Automate code generation during development
2. **CI/CD Pipelines**: Generate type-safe code during builds
3. **Database Schema Updates**: Update generated code when database schema changes
4. **Permission Management**: Maintain entity permissions in sync with business rules

## License

ISC