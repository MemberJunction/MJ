# MemberJunction Documentation Utilities

A TypeScript library for dynamically retrieving, parsing, and caching MemberJunction documentation to support AI models and other documentation-driven features.

## Overview

The `@memberjunction/doc-utils` package provides functionality for accessing the official MemberJunction documentation. It can fetch documentation from the MemberJunction object model documentation site, parse the HTML content, and cache elements in memory for improved performance. This library is particularly useful when integrating with AI models that need context about the MemberJunction system.

## Installation

```bash
npm install @memberjunction/doc-utils
```

## Dependencies

This package depends on the following MemberJunction packages:
- `@memberjunction/core`
- `@memberjunction/core-entities`
- `@memberjunction/global`

External dependencies:
- `jsdom` - For HTML parsing
- `axios` - For HTTP requests

## Main Features

- **Documentation Retrieval**: Dynamically fetch documentation from the MemberJunction documentation site
- **HTML Parsing**: Extract relevant content from HTML documentation pages
- **Caching Mechanism**: Improve performance by caching documentation content in memory
- **Extended Entity Classes**: Access documentation for entities and their properties
- **Singleton Pattern**: Easy access to documentation functionality throughout your application

## Usage

### Basic Example

```typescript
import { DocumentationEngine } from '@memberjunction/doc-utils';

// Get the singleton instance
const docEngine = DocumentationEngine.getInstance();

// Get documentation for a specific entity
const entityDoc = await docEngine.getEntityDocumentation('User');
console.log(entityDoc.description);

// Get documentation for a specific entity field
const fieldDoc = await docEngine.getEntityFieldDocumentation('User', 'Email');
console.log(fieldDoc.description);
```

### Working with Entity Documentation

```typescript
import { DocumentationEngine } from '@memberjunction/doc-utils';

async function displayEntityInfo(entityName: string) {
  const docEngine = DocumentationEngine.getInstance();
  const entityDoc = await docEngine.getEntityDocumentation(entityName);
  
  console.log(`Entity: ${entityName}`);
  console.log(`Description: ${entityDoc.description}`);
  console.log(`Base Table: ${entityDoc.baseTable}`);
  console.log(`Schema: ${entityDoc.schemaName}`);
  
  // Get all fields for the entity
  const fields = await docEngine.getEntityFieldsDocumentation(entityName);
  
  console.log('Fields:');
  fields.forEach(field => {
    console.log(`- ${field.name}: ${field.description}`);
  });
}

// Example usage
displayEntityInfo('User');
```

### Customizing Caching Behavior

```typescript
import { DocumentationEngine } from '@memberjunction/doc-utils';

// Configure the documentation engine with custom settings
DocumentationEngine.configure({
  cacheTimeoutMinutes: 60, // Cache documentation for 1 hour
  baseDocumentationUrl: 'https://custom-docs.memberjunction.com'
});

// Get the configured instance
const docEngine = DocumentationEngine.getInstance();
```

## API Reference

### DocumentationEngine

The main class that provides access to documentation functionality.

#### Methods

- `getInstance()`: Returns the singleton instance of DocumentationEngine
- `configure(options)`: Configure the documentation engine with custom settings
- `getEntityDocumentation(entityName: string)`: Get documentation for a specific entity
- `getEntityFieldDocumentation(entityName: string, fieldName: string)`: Get documentation for a specific entity field
- `getEntityFieldsDocumentation(entityName: string)`: Get documentation for all fields of an entity
- `clearCache()`: Clear the documentation cache

### EntityDocumentation

Class representing documentation for an entity.

#### Properties

- `name`: The name of the entity
- `description`: The description of the entity
- `baseTable`: The base table name in the database
- `schemaName`: The database schema name
- `fields`: Array of field documentation objects

### EntityFieldDocumentation

Class representing documentation for an entity field.

#### Properties

- `name`: The name of the field
- `description`: The description of the field
- `dataType`: The data type of the field
- `length`: The length of the field (for string types)
- `isPrimaryKey`: Whether the field is a primary key
- `isNullable`: Whether the field can be null

## License

ISC