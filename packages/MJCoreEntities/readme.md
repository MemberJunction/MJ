# @memberjunction/core-entities

A comprehensive library of strongly-typed entity classes for MemberJunction's core metadata schema. This package provides type-safe access to all MemberJunction system entities with built-in validation, custom business logic, and seamless integration with the MemberJunction framework.

## Overview

The `@memberjunction/core-entities` package contains:
- **178+ Generated Entity Classes**: Strongly-typed TypeScript classes for all core MemberJunction entities
- **Extended Entity Classes**: Custom subclasses with specialized business logic
- **Artifact Extraction System**: Metadata-driven attribute extraction with hierarchical inheritance
- **Resource Permission Engine**: Comprehensive permission management system
- **Zod Schema Validation**: Built-in runtime validation for all entity types
- **Type Definitions**: Full TypeScript type definitions for enhanced IDE support

## Installation

```bash
npm install @memberjunction/core-entities
```

## Key Features

### 1. Strongly-Typed Entity Classes
Every MemberJunction core entity has a corresponding TypeScript class with:
- Full type safety for all properties
- Automatic validation using Zod schemas
- Relationship navigation properties
- Built-in CRUD operations

### 2. Extended Entity Classes
Several entities have custom extended classes that provide additional functionality:

- **UserViewEntityExtended**: Enhanced view management with filter and column parsing
- **DashboardEntityExtended**: Dashboard configuration management
- **AIModelEntityExtended**: AI model utilities and helpers
- **AIPromptEntityExtended**: Prompt management functionality
- **ArtifactVersionExtended**: Automatic content hashing and attribute extraction
- **ListDetailEntityExtended**: List view enhancements
- **ScheduledActionExtended**: Scheduled task management
- **ResourcePermissionEntity**: Resource access control

### 3. Artifact Extraction System
A powerful metadata-driven system for extracting structured attributes from artifact content:
- Hierarchical extract rule inheritance
- Declarative JavaScript-based extractors
- Automatic SHA-256 content hashing
- Standard property mappings for UI rendering
- Type-safe attribute storage and retrieval

### 4. Resource Permission Engine
A sophisticated permission system for managing access to various resources:
- Role-based permissions
- Resource type definitions
- Permission inheritance
- Cached permission lookups

## Usage

### Basic Entity Usage

```typescript
import { Metadata } from '@memberjunction/core';
import { UserEntity, ApplicationEntity } from '@memberjunction/core-entities';

// Always use Metadata to create entity instances
const md = new Metadata();

// Load a user by ID
const user = await md.GetEntityObject<UserEntity>('Users');
await user.Load('user-id-here');

// Access strongly-typed properties
console.log(user.Email);
console.log(user.FirstName);

// Create a new application
const app = await md.GetEntityObject<ApplicationEntity>('Applications');
app.NewRecord();
app.Name = 'My New Application';
app.Description = 'A test application';
await app.Save();
```

(continuing in next command due to size...)

## Artifact Extraction System

The artifact extraction system enables declarative extraction of structured attributes from artifact content with hierarchical inheritance.

### Overview

Artifacts in MemberJunction can have **extract rules** defined in their `ArtifactType` that specify how to extract attributes from the artifact content. These rules:
- Are stored as JSON in the `ArtifactType.ExtractRules` column
- Support hierarchical inheritance (child types inherit and override parent rules)
- Execute JavaScript code in a controlled environment
- Map extracted values to standard properties (name, description, display formats)
- Are automatically executed when artifact versions are saved

### Defining Extract Rules

Extract rules are defined in the `ArtifactType.ExtractRules` JSON field:

```json
[
  {
    "name": "subject",
    "description": "Email subject line",
    "type": "string",
    "standardProperty": "name",
    "extractor": "const parsed = JSON.parse(content); return parsed.subject || 'Untitled';"
  },
  {
    "name": "recipientCount",
    "description": "Number of recipients",
    "type": "number",
    "extractor": "const parsed = JSON.parse(content); return parsed.recipients?.length || 0;"
  }
]
```

### Extract Rule Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Unique identifier for this rule |
| `description` | string | Human-readable description |
| `type` | string | TypeScript type (e.g., `'string'`, `'Array<{x: number}>'`) |
| `standardProperty` | string? | Maps to: `'name'`, `'description'`, `'displayMarkdown'`, `'displayHtml'` |
| `extractor` | string | JavaScript code that receives `content` and returns value |

### Using the ArtifactExtractor

```typescript
import { ArtifactExtractor } from '@memberjunction/core-entities';

// Resolve extract rules with inheritance
const rules = ArtifactExtractor.ResolveExtractRules(artifactTypeChain);

// Extract attributes from content
const result = await ArtifactExtractor.ExtractAttributes({
    content: artifactContent,
    extractRules: rules,
    throwOnError: false,
    timeout: 5000
});

// Get standard properties
const name = ArtifactExtractor.GetStandardProperty(result.attributes, 'name');
const description = ArtifactExtractor.GetStandardProperty(result.attributes, 'description');
```

### Automatic Extraction with ArtifactVersionExtended

```typescript
import { ArtifactVersionExtended } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

const md = new Metadata();
const version = await md.GetEntityObject<ArtifactVersionExtended>('MJ: Artifact Versions');
version.NewRecord();
version.Content = JSON.stringify({ subject: "Q4 Campaign", body: "..." });

// Save triggers automatic extraction:
// 1. Calculates SHA-256 hash → ContentHash
// 2. Resolves extract rules from ArtifactType hierarchy
// 3. Extracts attributes → Name and Description
// 4. Creates ArtifactVersionAttribute records
await version.Save();

console.log(version.Name); // "Q4 Campaign" (extracted)
console.log(version.ContentHash); // "a3f7e2..." (SHA-256)
```

For complete documentation, see the [Implementation Summary](../../IMPLEMENTATION_SUMMARY_v2.105.md).

## Best Practices

1. **Always use Metadata for entity creation**: Never instantiate entity classes directly
2. **Use RunView for bulk operations**: More efficient than loading entities individually
3. **Leverage TypeScript types**: Use exported types for function parameters
4. **Handle validation errors**: Wrap entity operations in try-catch blocks
5. **Use extended classes**: When available, use extended versions for additional functionality
6. **Import artifacts from core-entities**: Artifact extraction utilities are in this package

## Dependencies

- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/global`: Global utilities and decorators
- `zod`: Runtime type validation

## License

ISC - See LICENSE file for details

## Support

For issues, questions, or contributions, visit the [MemberJunction GitHub repository](https://github.com/MemberJunction/MJ).
