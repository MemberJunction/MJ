# @memberjunction/ai-vectors

The MemberJunction AI Vectors Core package provides the foundational abstractions and base classes for working with vector embeddings, vector databases, and vector operations within the MemberJunction ecosystem.

## Features

- **Core Interfaces**: Fundamental interface definitions for vector operations
- **Base Classes**: Base implementation patterns for vector-related functionality
- **Database Abstraction**: Interface for vector database operations
- **Embedding Abstraction**: Interface for text embedding generation
- **Entity Integration**: Seamless integration with MemberJunction entities
- **Pagination Support**: Efficiently retrieve and process large sets of records
- **Type Definitions**: Comprehensive TypeScript types for vector operations

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

## Usage

### Extending the Base Class

Create specialized vector operation classes by extending `VectorBase`:

```typescript
import { VectorBase } from '@memberjunction/ai-vectors';

export class MyVectorProcessor extends VectorBase {
  async processEntityRecords(entityId: string): Promise<void> {
    // Get entity records
    const records = await this.GetRecordsByEntityID(entityId);
    
    // Process each record
    for (const record of records) {
      // Your vector processing logic here
    }
  }
  
  async paginatedProcess(entityId: string): Promise<void> {
    // Process records page by page
    const params = {
      EntityID: entityId,
      PageNumber: 1,
      PageSize: 100,
      ResultType: 'entity_object'
    };
    
    const records = await this.PageRecordsByEntityID(params);
    // Process paged records
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

class EntityVectorizer extends VectorBase {
  async vectorizeEntities(entityId: string): Promise<void> {
    // Get AI model for embeddings
    const embeddingModel = this.GetAIModel();
    
    // Get vector database
    const vectorDb = this.GetVectorDatabase();
    
    // Process records in pages
    let pageNumber = 1;
    let hasMoreRecords = true;
    
    while (hasMoreRecords) {
      const params: PageRecordsParams = {
        EntityID: entityId,
        PageNumber: pageNumber,
        PageSize: 50,
        ResultType: 'entity_object'
      };
      
      const records = await this.PageRecordsByEntityID(params);
      hasMoreRecords = records.length === params.PageSize;
      pageNumber++;
      
      // Process the current page of records
      // ...
    }
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

## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/aiengine`: MemberJunction AI engine
- `@memberjunction/ai`: MemberJunction AI abstractions
- `@memberjunction/ai-vectordb`: Vector database interfaces

## License

ISC