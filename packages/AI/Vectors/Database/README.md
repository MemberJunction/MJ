# @memberjunction/ai-vectordb

The MemberJunction AI Vector Database package provides a standardized interface and base classes for working with vector databases in the MemberJunction ecosystem. This package serves as a common abstraction layer that allows different vector database implementations to be used interchangeably.

## Features

- **Abstract Base Class**: Common API for all vector database implementations
- **Index Management**: Create, list, edit, and delete vector indexes
- **Record Operations**: Comprehensive CRUD operations for vector records
- **Query Capabilities**: Flexible vector similarity search with filtering
- **Type Definitions**: Comprehensive TypeScript type definitions
- **Provider Agnostic**: Works with any vector database that implements the interface
- **Standardized Response Format**: Consistent response format across providers
- **Secure API Key Management**: Protected API key handling with validation

## Installation

```bash
npm install @memberjunction/ai-vectordb
```

## Core Components

### VectorDBBase

The abstract base class that all vector database providers must implement:

```typescript
export abstract class VectorDBBase {
  // Protected getter for API key access by subclasses
  protected get apiKey(): string;
  
  constructor(apiKey: string);
  
  // Index operations
  abstract listIndexes(): IndexList | Promise<IndexList>;
  abstract getIndex(params: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
  abstract createIndex(params: CreateIndexParams): BaseResponse | Promise<BaseResponse>;
  abstract deleteIndex(params: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
  abstract editIndex(params: EditIndexParams): BaseResponse | Promise<BaseResponse>;
  abstract queryIndex(params: QueryOptions): BaseResponse | Promise<BaseResponse>;
  
  // Record operations
  abstract createRecord(record: VectorRecord): BaseResponse | Promise<BaseResponse>;
  abstract createRecords(record: VectorRecord[]): BaseResponse | Promise<BaseResponse>;
  abstract getRecord(param: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
  abstract getRecords(params: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
  abstract updateRecord(record: UpdateOptions): BaseResponse | Promise<BaseResponse>;
  abstract updateRecords(records: UpdateOptions): BaseResponse | Promise<BaseResponse>;
  abstract deleteRecord(record: VectorRecord): BaseResponse | Promise<BaseResponse>;
  abstract deleteRecords(records: VectorRecord[]): BaseResponse | Promise<BaseResponse>;
}
```

### Key Types and Interfaces

#### Vector Records

```typescript
export type VectorRecord<T extends RecordMetadata = RecordMetadata> = {
  id: string;                 // Unique identifier for the record
  values: RecordValues;       // Vector embedding values (array of numbers)
  sparseValues?: RecordSparseValues; // Optional sparse representation for hybrid search
  metadata?: T;               // Optional metadata for filtering and identification
};

export type RecordValues = Array<number>;

export type RecordSparseValues = {
  indices: Array<number>;     // List of indices where non-zero values are present
  values: Array<number>;      // The values that correspond to the positions in indices
};

export type RecordMetadataValue = string | boolean | number | Array<string>;
export type RecordMetadata = Record<string, RecordMetadataValue>;
```

#### Index Description

```typescript
export type IndexDescription = {
  name: string;               // Name of the index
  dimension: number;          // Vector dimension size
  metric: IndexModelMetricEnum; // Distance metric: 'cosine', 'euclidean', or 'dotproduct'
  host: string;               // Host where the index is located
};
```

#### Query Options

For similarity search in vector databases:

```typescript
// Base query parameters
export type QueryParamsBase = {
  topK: number;              // Number of results to return
  includeValues?: boolean;   // Whether to include vector values in results
  includeMetadata?: boolean; // Whether to include metadata in results
  filter?: object;           // Metadata filter to apply
};

// Query by vector values
export type QueryByVectorValues = QueryParamsBase & {
  vector: RecordValues;      // The query vector to find similar vectors for
};

// Query by record ID
export type QueryByRecordId = QueryParamsBase & {
  id: string;                // Use an existing record's vector to query
};

// Combined query options type
export type QueryOptions = QueryByRecordId | QueryByVectorValues;
```

#### Query Response

```typescript
export type QueryResponse<T extends RecordMetadata = RecordMetadata> = {
  matches: Array<ScoredRecord<T>>; // Results sorted by similarity
  namespace: string;               // Namespace where query was executed
  usage?: OperationUsage;          // Usage information
};

export interface ScoredRecord<T extends RecordMetadata = RecordMetadata> extends VectorRecord<T> {
  score?: number;                  // Similarity score (interpretation depends on metric)
}

export type OperationUsage = {
  readUnits?: number;              // Number of read units consumed by operation
};
```

## Usage Examples

While this package primarily provides interfaces and base classes, here's how it would be used with a concrete implementation:

### Implementing a Vector Database Provider

Create a provider by implementing the `VectorDBBase` abstract class:

```typescript
import { VectorDBBase, VectorRecord, BaseResponse, CreateIndexParams } from '@memberjunction/ai-vectordb';

class MyVectorDBProvider extends VectorDBBase {
  constructor(apiKey: string) {
    super(apiKey);
  }
  
  async listIndexes() {
    // Implementation for listing indexes
    return {
      indexes: [
        // Index descriptions
      ]
    };
  }
  
  async createIndex(params: CreateIndexParams): Promise<BaseResponse> {
    // Implementation for creating an index
    try {
      // Provider-specific code
      return {
        success: true,
        message: 'Index created successfully',
        data: { /* index info */ }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        data: null
      };
    }
  }
  
  // Implement remaining methods...
}
```

### Using a Vector Database Provider

Once a provider is implemented, you can use it with a consistent API:

```typescript
import { VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { MyVectorDBProvider } from './my-vector-db-provider';

async function workWithVectors() {
  // Initialize the provider
  const vectorDB: VectorDBBase = new MyVectorDBProvider('your-api-key');
  
  // Create an index
  const createResult = await vectorDB.createIndex({
    id: 'my-index',
    dimension: 1536,
    metric: 'cosine' as IndexModelMetricEnum
  });
  
  if (createResult.success) {
    console.log('Index created:', createResult.data);
  }
  
  // Insert a vector
  const insertResult = await vectorDB.createRecord({
    id: 'record-1',
    values: [0.1, 0.2, 0.3, /* ... */],
    metadata: {
      category: 'document',
      title: 'Sample Document'
    }
  });
  
  // Query for similar vectors
  const queryResult = await vectorDB.queryIndex({
    vector: [0.1, 0.2, 0.3, /* ... */],
    topK: 5,
    includeMetadata: true,
    filter: {
      category: 'document'
    }
  });
  
  if (queryResult.success) {
    console.log('Similar vectors:', queryResult.data.matches);
  }
}
```

## Provider Implementations

MemberJunction provides implementations for popular vector databases:

- `@memberjunction/ai-vectors-pinecone` - Implementation for Pinecone vector database

You can also create your own implementation for any vector database service by extending the `VectorDBBase` class.

## Integration with MemberJunction Ecosystem

This package integrates with the broader MemberJunction AI vector ecosystem:

- `@memberjunction/ai-vectors` - Core vector functionality
- `@memberjunction/ai-vectors-sync` - Synchronize entity data to vector databases
- `@memberjunction/ai-vectors-dupe` - Duplicate detection using vector similarity

## Error Handling

The VectorDBBase constructor validates the API key and throws an error if it's empty or invalid:

```typescript
try {
  const vectorDB = new MyVectorDBProvider('');
} catch (error) {
  // Error: API key cannot be empty
}
```

All methods return a standardized `BaseResponse` format:

```typescript
export type BaseResponse = {
  success: boolean;  // Whether the operation succeeded
  message: string;   // Human-readable message about the operation
  data: any;         // Operation-specific response data
};
```

## Additional Types

### Request Parameters

```typescript
export type BaseRequestParams = {
  id: string;
  data?: any;
};

export type CreateIndexParams = BaseRequestParams & {
  dimension: number;
  metric: IndexModelMetricEnum;
  additionalParams?: any;
};

export type EditIndexParams = BaseRequestParams & {
  // Additional fields specific to the provider
};
```

## Dependencies

- `@memberjunction/core`: ^2.43.0 - MemberJunction core library
- `@memberjunction/global`: ^2.43.0 - MemberJunction global utilities
- `dotenv`: ^16.4.1 - Environment variable management

## Development Dependencies

- `@types/node`: 20.14.2
- `ts-node-dev`: ^2.0.0
- `typescript`: ^5.4.5

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run the development server with ts-node-dev
- `npm test` - Run tests (currently not implemented)

## License

ISC