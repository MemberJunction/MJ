# @memberjunction/ai-vectors-pinecone

A MemberJunction implementation of vector database services using Pinecone as the backend. This package provides a standardized interface for working with vector embeddings, vector search, and other vector operations within the MemberJunction ecosystem.

## Features

- **Pinecone Integration**: Seamless integration with Pinecone's vector database
- **Standardized Interface**: Follows MemberJunction's VectorDBBase abstract class
- **Index Management**: Create, delete, and query vector indexes
- **Record Operations**: Comprehensive CRUD operations for vector records
- **Namespace Support**: Work with namespaces for organization within indexes
- **Metadata Storage**: Store and query with metadata alongside vector embeddings
- **Configuration Management**: Environment-based configuration options

## Installation

```bash
npm install @memberjunction/ai-vectors-pinecone
```

## Requirements

- Node.js 16+
- A Pinecone API key and account
- MemberJunction Core libraries

## Configuration

Create a `.env` file with your Pinecone credentials:

```bash
# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_HOST=your-pinecone-host
PINECONE_DEFAULT_INDEX=your-default-index-name

# Optional: For embedding generation
OPENAI_API_KEY=your-openai-api-key
```

## Usage

### Initialize the Pinecone Client

```typescript
import { PineconeDatabase } from '@memberjunction/ai-vectors-pinecone';

// Initialize with your Pinecone API key
const pineconeDB = new PineconeDatabase('your-pinecone-api-key');
```

### List Available Indexes

```typescript
// Get a list of all available indexes
const indexList = await pineconeDB.listIndexes();
console.log('Available indexes:', indexList.indexes.map(idx => idx.name));
```

### Create a New Index

```typescript
// Create a new vector index
const createResult = await pineconeDB.createIndex({
  id: 'my-new-index',
  dimension: 1536,  // Dimension for OpenAI embeddings
  metric: 'cosine',
  additionalParams: { 
    serverless: { 
      cloud: 'aws', 
      region: 'us-west-2'
    }
  }
});

if (createResult.success) {
  console.log('Index created successfully');
} else {
  console.error('Failed to create index:', createResult.message);
}
```

### Insert Vector Records

```typescript
import { VectorRecord } from '@memberjunction/ai-vectordb';

// Create a single vector record
const vectorRecord: VectorRecord = {
  id: 'record-123',
  values: [0.1, 0.2, 0.3, /* ... rest of vector values */],
  metadata: {
    RecordID: '123',
    Entity: 'Customer',
    TemplateID: 'customer-profile',
    // Additional metadata as needed
  }
};

const insertResult = await pineconeDB.createRecord(vectorRecord);

if (insertResult.success) {
  console.log('Record inserted successfully');
}
```

### Insert Multiple Records at Once

```typescript
// Create multiple vector records in a single operation
const vectorRecords: VectorRecord[] = [
  {
    id: 'record-123',
    values: [/* vector values */],
    metadata: { RecordID: '123', Entity: 'Customer', TemplateID: 'template-1' }
  },
  {
    id: 'record-124',
    values: [/* vector values */],
    metadata: { RecordID: '124', Entity: 'Customer', TemplateID: 'template-1' }
  }
];

const batchInsertResult = await pineconeDB.createRecords(vectorRecords);
```

### Query Vector Records

```typescript
// Query vectors by similarity
const queryResult = await pineconeDB.queryIndex({
  vector: [0.1, 0.2, 0.3, /* ... rest of query vector */],
  topK: 5,
  includeMetadata: true,
  filter: {
    Entity: { $eq: 'Customer' }
  }
});

if (queryResult.success) {
  console.log('Query results:', queryResult.data.matches);
  
  // Process the matching records
  queryResult.data.matches.forEach(match => {
    console.log(`Match ID: ${match.id}, Score: ${match.score}`);
    console.log('Metadata:', match.metadata);
  });
}
```

### Retrieve Specific Records

```typescript
// Fetch a specific record by ID
const getRecordResult = await pineconeDB.getRecord({
  id: 'my-index-name',  // Optional - uses default if not specified
  data: 'record-123'    // The record ID to fetch
});

if (getRecordResult.success) {
  console.log('Retrieved record:', getRecordResult.data);
}
```

### Delete Records

```typescript
// Delete a single record
const deleteResult = await pineconeDB.deleteRecord({
  id: 'record-123'
});

// Delete multiple records
const deleteMultipleResult = await pineconeDB.deleteRecords([
  { id: 'record-123' },
  { id: 'record-124' }
]);

// Delete all records in an index or namespace
const deleteAllResult = await pineconeDB.deleteAllRecords({
  id: 'my-index-name',  // Optional - uses default if not specified
  data: 'my-namespace'  // Optional - if provided, only deletes in this namespace
});
```

## API Reference

### PineconeDatabase Class

The main class that implements the VectorDBBase abstract class for Pinecone.

#### Constructor

```typescript
new PineconeDatabase(apiKey: string)
```

#### Properties

- `pinecone`: Returns the underlying Pinecone client instance

#### Methods

##### Index Management
- `listIndexes()`: List all available indexes
- `getIndexDescription(params)`: Get detailed information about an index
- `createIndex(options)`: Create a new vector index
- `deleteIndex(params)`: Delete an index
- `getIndex(params?)`: Get a reference to an index (uses default if not specified)
- `getDefaultIndex()`: Get the default index based on config or first available

##### Record Operations
- `createRecord(params)`: Insert a single vector record
- `createRecords(records)`: Insert multiple vector records
- `getRecord(params)`: Retrieve a specific record by ID
- `getRecords(params)`: Retrieve multiple records by ID
- `updateRecord(params)`: Update a single record
- `deleteRecord(record)`: Delete a specific record
- `deleteRecords(records)`: Delete multiple records
- `deleteAllRecords(params)`: Delete all records in an index or namespace

##### Querying
- `queryIndex(params)`: Query vectors by similarity

### Key Interfaces

#### VectorRecord

```typescript
interface VectorRecord {
  id: string;
  values: number[];
  metadata?: RecordMetadata;
  sparseValues?: { indices: number[]; values: number[] };
}
```

#### BaseRequestParams

```typescript
interface BaseRequestParams {
  id?: string;     // Index name (uses default if not provided)
  data?: any;      // Additional data for the operation
}
```

#### CreateIndexParams

```typescript
interface CreateIndexParams {
  id: string;             // Index name
  dimension: number;      // Vector dimension
  metric?: string;        // Distance metric (cosine, euclidean, dotproduct)
  additionalParams?: any; // Additional Pinecone-specific parameters
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| PINECONE_API_KEY | Your Pinecone API key |
| PINECONE_HOST | Your Pinecone host URL |
| PINECONE_DEFAULT_INDEX | Default index name to use if not specified |
| OPENAI_API_KEY | Optional: OpenAI API key for generating embeddings |

## Integration with MemberJunction Vectors

This package works seamlessly with other MemberJunction vector packages:

```typescript
import { PineconeDatabase } from '@memberjunction/ai-vectors-pinecone';
import { OpenAIEmbedding } from '@memberjunction/ai-openai';
import { VectorSync } from '@memberjunction/ai-vectors-sync';

// Set up your vector database
const vectorDB = new PineconeDatabase(pineconeAPIKey);

// Set up your embedding provider
const embeddingProvider = new OpenAIEmbedding(openAIAPIKey);

// Use with VectorSync for entity synchronization
const vectorSync = new VectorSync({
  vectorDB: vectorDB,
  embeddingProvider: embeddingProvider,
  // other configuration...
});
```

## Dependencies

- `@memberjunction/ai-vectordb`: Base abstractions for vector databases
- `@memberjunction/aiengine`: MemberJunction AI Engine
- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities
- `@pinecone-database/pinecone`: Official Pinecone client

## License

ISC