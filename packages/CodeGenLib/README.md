# @memberjunction/codegen-lib

A comprehensive code generation library for the MemberJunction platform that provides reusable object models and utilities for generating TypeScript entity classes, GraphQL schemas, SQL scripts, Angular components, and more.

## Installation

```bash
npm install @memberjunction/codegen-lib
```

## Overview

The CodeGen Library is the core engine behind MemberJunction's code generation capabilities. It provides a programmatic API that can be integrated into any server-side application to generate various types of code based on your MemberJunction metadata.

## Key Features

- **Entity Subclass Generation** - Generate TypeScript classes for all entities in your metadata
- **Action Subclass Generation** - Generate TypeScript classes for custom actions
- **GraphQL Schema Generation** - Create GraphQL schemas and resolvers
- **SQL Script Generation** - Generate database scripts and stored procedures
- **Angular Component Generation** - Create Angular components for entity management
- **Configuration Management** - Flexible configuration system with cosmiconfig support
- **Database Schema Introspection** - Analyze and work with database schemas
- **Status Logging** - Built-in logging and progress tracking

## Usage

### Basic Setup

```typescript
import { initializeConfig, runCodeGen } from '@memberjunction/codegen-lib';

// Initialize configuration
await initializeConfig();

// Run code generation
await runCodeGen();
```

### Configuration

The library uses cosmiconfig to load configuration. Create a `.memberjunctionrc` file or add a `memberjunction` section to your `package.json`:

```json
{
  "memberjunction": {
    "database": {
      "server": "localhost",
      "database": "YourDatabase",
      "trustedConnection": true
    },
    "directories": {
      "output": "./generated",
      "entities": "./generated/entities",
      "actions": "./generated/actions"
    }
  }
}
```

### Entity Subclass Generation

```typescript
import { generateEntitySubClasses } from '@memberjunction/codegen-lib';

// Generate entity classes
const result = await generateEntitySubClasses({
  outputDirectory: './generated/entities',
  generateLoader: true,
  generateCustomEntityClasses: true
});
```

### Action Subclass Generation

```typescript
import { generateActionSubClasses } from '@memberjunction/codegen-lib';

// Generate action classes
const result = await generateActionSubClasses({
  outputDirectory: './generated/actions',
  generateLoader: true
});
```

### GraphQL Server Generation

```typescript
import { generateGraphQLServerCode } from '@memberjunction/codegen-lib';

// Generate GraphQL schema and resolvers
await generateGraphQLServerCode({
  outputDirectory: './generated/graphql',
  entities: entityMetadata
});
```

### SQL Code Generation

```typescript
import { generateSQLScripts } from '@memberjunction/codegen-lib';

// Generate SQL scripts
await generateSQLScripts({
  outputDirectory: './generated/sql',
  includeStoredProcedures: true,
  includeViews: true
});
```

### Angular Component Generation

```typescript
import { generateAllAngularEntityCode } from '@memberjunction/codegen-lib';

// Generate Angular components
await generateAllAngularEntityCode({
  outputDirectory: './generated/angular',
  entities: entityMetadata
});
```

## API Reference

### Core Functions

- `initializeConfig()` - Initialize the configuration system
- `runCodeGen()` - Execute all configured code generation tasks
- `generateEntitySubClasses()` - Generate TypeScript entity classes
- `generateActionSubClasses()` - Generate TypeScript action classes
- `generateGraphQLServerCode()` - Generate GraphQL schemas and resolvers
- `generateSQLScripts()` - Generate SQL database scripts
- `generateAllAngularEntityCode()` - Generate Angular components

### Configuration Types

- `Config` - Main configuration interface
- `DatabaseConfig` - Database connection settings
- `DirectoryConfig` - Output directory settings

### Database Schema Types

- `SchemaInfo` - Database schema information
- `TableInfo` - Table metadata
- `ColumnInfo` - Column metadata

### Utility Functions

- `runCommand()` - Execute shell commands
- `logStatus()` - Log generation progress
- `manageMetadata()` - Metadata management utilities

## Integration with AI

The library includes integration with MemberJunction's AI framework for intelligent code generation:

- Automatic code documentation
- Smart naming conventions
- Code pattern recognition
- Integration with multiple AI providers (OpenAI, Anthropic, Groq, Mistral)

## Working with Related Packages

This library works closely with:

- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/actions` - Action framework
- `@memberjunction/sqlserver-dataprovider` - Database connectivity
- `@memberjunction/ai` - AI integration framework

## Advanced Features

### Custom Templates

You can provide custom templates for code generation:

```typescript
import { setCustomTemplate } from '@memberjunction/codegen-lib';

setCustomTemplate('entity', myCustomEntityTemplate);
```

### Schema Analysis

```typescript
import { analyzeSchema } from '@memberjunction/codegen-lib';

const schemaInfo = await analyzeSchema(databaseConnection);
// Work with schema information
```

### Progress Tracking

```typescript
import { onProgress } from '@memberjunction/codegen-lib';

onProgress((status) => {
  console.log(`Progress: ${status.message} (${status.percentage}%)`);
});
```

## Error Handling

The library provides comprehensive error handling:

```typescript
try {
  await runCodeGen();
} catch (error) {
  if (error.code === 'CONFIG_NOT_FOUND') {
    // Handle missing configuration
  } else if (error.code === 'DB_CONNECTION_FAILED') {
    // Handle database connection errors
  }
}
```

## Best Practices

1. **Configuration Management** - Use environment-specific configuration files
2. **Output Organization** - Keep generated code in separate directories
3. **Version Control** - Consider excluding generated files from version control
4. **Regular Updates** - Regenerate code when metadata changes
5. **Custom Extensions** - Extend generated classes rather than modifying them

## Contributing

When contributing to this package:

1. Maintain backward compatibility
2. Add tests for new generation features
3. Update documentation for API changes
4. Follow the existing code patterns
5. Ensure generated code follows TypeScript best practices

## License

This package is part of the MemberJunction ecosystem and follows the same licensing terms.