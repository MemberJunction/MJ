# @memberjunction/ai-vectors

The MemberJunction AI Vectors Core package provides the foundational abstractions and base classes for working with vector embeddings, vector databases, and vector operations within the MemberJunction ecosystem.

## Overview

This package serves as the core foundation for vector-related operations in MemberJunction, providing:
- Abstract interfaces for vector database and embedding operations
- Base class implementation with entity integration
- Type definitions for pagination and data handling
- Seamless integration with MemberJunction's metadata system and AI engine

## Features

- **Core Interfaces**: Fundamental interface definitions for vector operations
- **Base Classes**: Base implementation patterns for vector-related functionality
- **Database Abstraction**: Interface for vector database operations
- **Embedding Abstraction**: Interface for text embedding generation
- **Entity Integration**: Seamless integration with MemberJunction entities
- **Pagination Support**: Efficiently retrieve and process large sets of records
- **Type Definitions**: Comprehensive TypeScript types for vector operations
- **AI Model Integration**: Built-in support for accessing embedding models
- **User Context Management**: Automatic handling of user context for entity operations

## Installation

```bash
npm install @memberjunction/ai-vectors
```

## Core Components

### Interfaces

The package defines several key interfaces for vector operations:

#### IEmbedding

Interface for text embedding generation:

```typescript
interface IEmbedding {
  createEmbedding(text: string, options?: any): any;
  createBatchEmbedding(text: string[], options?: any): any;
}
```

#### IVectorDatabase

Interface for vector database management:

```typescript
interface IVectorDatabase {
  listIndexes(options?: any): any;
  createIndex(options: any): any;
  deleteIndex(indexID: any, options?: any): any;
  editIndex(indexID: any, options?: any): any;
}
```

#### IVectorIndex

Interface for vector index operations:

```typescript
interface IVectorIndex {
  createRecord(record: any, options?: any): any;
  createRecords(records: any[], options?: any): any;
  getRecord(recordID: any, options?: any): any;
  getRecords(recordIDs: any[], options?: any): any;
  updateRecord(record: any, options?: any): any;
  updateRecords(records: any[], options?: any): any;
  deleteRecord(recordID: any, options?: any): any;
  deleteRecords(recordIDs: any[], options?: any): any;
}
```

### VectorBase Class

The `VectorBase` class serves as the foundation for vector operations, providing:

- Integration with MemberJunction's metadata system
- Entity record retrieval and manipulation
- Pagination support for handling large datasets
- Helper methods for AI model and vector database access
- Automatic user context management for entity operations
- Built-in RunView integration for flexible data querying

#### Key Methods

- `GetRecordsByEntityID(entityID: string, recordIDs?: CompositeKey[]): Promise<BaseEntity[]>` - Retrieve entity records with optional filtering
- `PageRecordsByEntityID<T>(params: PageRecordsParams): Promise<T[]>` - Paginated entity record retrieval
- `GetAIModel(id?: string): AIModelEntityExtended` - Access configured embedding models
- `GetVectorDatabase(id?: string): VectorDatabaseEntity` - Access configured vector databases
- `RunViewForSingleValue<T>(entityName: string, extraFilter: string): Promise<T | null>` - Query for single entity records
- `SaveEntity(entity: BaseEntity): Promise<boolean>` - Save entities with proper user context

### Type Definitions

#### PageRecordsParams

Type definition for paginated record retrieval:

```typescript
type PageRecordsParams = {
  EntityID: string | number;        // The ID of the entity to get records from
  PageNumber: number;               // Page number (1-based)
  PageSize: number;                 // Number of records per page
  ResultType: "entity_object" | "simple" | "count_only";  // Type of result
  Filter?: string;                  // Optional SQL filter
}
```

## Usage

### Extending the Base Class

Create specialized vector operation classes by extending `VectorBase`:

```typescript
import { VectorBase, PageRecordsParams } from '@memberjunction/ai-vectors';
import { BaseEntity } from '@memberjunction/core';

export class MyVectorProcessor extends VectorBase {
  async processEntityRecords(entityId: string): Promise<void> {
    // Get all entity records
    const records = await this.GetRecordsByEntityID(entityId);
    
    // Process each record
    for (const record of records) {
      // Your vector processing logic here
      console.log(`Processing ${record.EntityInfo.Name} record ${record.ID}`);
    }
  }
  
  async paginatedProcess(entityId: string): Promise<void> {
    // Process records page by page
    const params: PageRecordsParams = {
      EntityID: entityId,
      PageNumber: 1,
      PageSize: 100,
      ResultType: 'entity_object' as const
    };
    
    const records = await this.PageRecordsByEntityID<BaseEntity>(params);
    // Process paged records
    console.log(`Retrieved ${records.length} records`);
  }
}
```

### Implementing the Interfaces

Implement the interfaces to create specific provider implementations:

```typescript
import { IEmbedding } from '@memberjunction/ai-vectors';

export class OpenAIEmbedding implements IEmbedding {
  constructor(private apiKey: string) {}
  
  async createEmbedding(text: string): Promise<number[]> {
    // Implementation using OpenAI's embedding API
  }
  
  async createBatchEmbedding(texts: string[]): Promise<number[][]> {
    // Batch implementation
  }
}
```

### Working with Entity Records

The package provides utilities for working with MemberJunction entities:

```typescript
import { VectorBase, PageRecordsParams } from '@memberjunction/ai-vectors';
import { BaseEntity } from '@memberjunction/core';
import { AIModelEntityExtended, VectorDatabaseEntity } from '@memberjunction/core-entities';

class EntityVectorizer extends VectorBase {
  async vectorizeEntities(entityId: string): Promise<void> {
    // Get AI model for embeddings (defaults to first embedding model if no ID provided)
    const embeddingModel: AIModelEntityExtended = this.GetAIModel();
    console.log(`Using embedding model: ${embeddingModel.Name}`);
    
    // Get vector database (defaults to first configured vector DB)
    const vectorDb: VectorDatabaseEntity = this.GetVectorDatabase();
    console.log(`Using vector database: ${vectorDb.Name}`);
    
    // Process records in pages for memory efficiency
    let pageNumber = 1;
    let hasMoreRecords = true;
    
    while (hasMoreRecords) {
      const params: PageRecordsParams = {
        EntityID: entityId,
        PageNumber: pageNumber,
        PageSize: 50,
        ResultType: 'entity_object' as const,
        Filter: "IsActive = 1"  // Optional: add custom filtering
      };
      
      const records = await this.PageRecordsByEntityID<BaseEntity>(params);
      hasMoreRecords = records.length === params.PageSize;
      pageNumber++;
      
      // Process the current page of records
      for (const record of records) {
        // Your vectorization logic here
        // Example: Generate embeddings for record content
      }
    }
  }
  
  async saveVectorizedEntity(entity: BaseEntity): Promise<boolean> {
    // SaveEntity automatically adds user context
    return await this.SaveEntity(entity);
  }
}
```

### Advanced Entity Filtering

Use composite keys for complex filtering scenarios:

```typescript
import { VectorBase } from '@memberjunction/ai-vectors';
import { CompositeKey } from '@memberjunction/core';

class AdvancedVectorProcessor extends VectorBase {
  async getSpecificRecords(entityId: string): Promise<void> {
    // Build composite keys for specific records
    const compositeKeys: CompositeKey[] = [
      {
        KeyValuePairs: [
          { FieldName: 'Status', Value: 'Active' },
          { FieldName: 'CategoryID', Value: '123' }
        ]
      },
      {
        KeyValuePairs: [
          { FieldName: 'Status', Value: 'Pending' },
          { FieldName: 'CategoryID', Value: '456' }
        ]
      }
    ];
    
    // This will generate: (Status = 'Active' AND CategoryID = '123') OR (Status = 'Pending' AND CategoryID = '456')
    const records = await this.GetRecordsByEntityID(entityId, compositeKeys);
    console.log(`Found ${records.length} matching records`);
  }
}
```

## Integration with MemberJunction

This package works in harmony with other MemberJunction packages:

```typescript
import { VectorBase } from '@memberjunction/ai-vectors';
import { AIEngine } from '@memberjunction/aiengine';
import { Metadata, RunView } from '@memberjunction/core';

// Your vector processing will have access to:
// - Entity metadata
// - AI models configuration
// - Vector database configuration
// - User context
```

## Package Ecosystem

This core package serves as the foundation for a suite of vector-related packages:

- `@memberjunction/ai-vectors` - Core abstractions (this package)
- `@memberjunction/ai-vectordb` - Vector database interface
- `@memberjunction/ai-vectors-sync` - Entity synchronization with vector databases
- `@memberjunction/ai-vectors-pinecone` - Pinecone vector database implementation
- `@memberjunction/ai-vectors-dupe` - Duplicate detection using vector similarity

## Configuration

The package automatically integrates with MemberJunction's configuration system:

1. **AI Models**: Embedding models are configured in the MemberJunction metadata and accessed via `AIEngine.Instance`
2. **Vector Databases**: Vector databases are configured similarly and accessed through the AI engine
3. **User Context**: The current user context is automatically managed and passed to entity operations

## Best Practices

1. **Always extend VectorBase** for custom vector operations to ensure proper integration
2. **Use pagination** when processing large datasets to avoid memory issues
3. **Handle errors gracefully** - the base class methods throw exceptions that should be caught
4. **Set user context** - The base class automatically manages user context for entity operations
5. **Use type-safe generics** - When using `PageRecordsByEntityID`, specify the expected type

## Error Handling

The package provides clear error messages for common scenarios:

```typescript
try {
  const model = this.GetAIModel('specific-model-id');
} catch (error) {
  // Will throw if no embedding model is configured
  console.error('No AI Model Entity found');
}

try {
  const records = await this.GetRecordsByEntityID('invalid-id');
} catch (error) {
  // Will throw if entity ID doesn't exist
  console.error(`Entity with ID invalid-id not found.`);
}
```

## Dependencies

- `@memberjunction/core`: ^2.43.0 - Core MemberJunction functionality
- `@memberjunction/global`: ^2.43.0 - Global utilities
- `@memberjunction/core-entities`: ^2.43.0 - Entity definitions
- `@memberjunction/aiengine`: ^2.43.0 - AI engine integration
- `@memberjunction/ai`: ^2.43.0 - AI abstractions
- `@memberjunction/ai-vectordb`: ^2.43.0 - Vector database interfaces
- `openai`: ^4.28.4 - OpenAI SDK (for embedding implementations)
- `dotenv`: ^16.4.1 - Environment configuration

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run start
```

## Contributing

When contributing to this package:

1. Follow the MemberJunction coding standards
2. Ensure all interfaces remain generic and implementation-agnostic
3. Add comprehensive TypeScript types
4. Update this README with any new features or changes
5. Test integration with dependent packages

## License

ISC