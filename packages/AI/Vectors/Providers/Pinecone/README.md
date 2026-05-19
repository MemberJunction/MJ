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
- **Auto-registration**: Automatically registers with MemberJunction's class factory system

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

# Optional: Database configuration (if using with MemberJunction sync)
DB_HOST=your-database-host
DB_PORT=1433
DB_USERNAME=your-db-username
DB_PASSWORD=your-db-password
DB_DATABASE=your-database-name
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
// Create a new vector index with serverless configuration
const createResult = await pineconeDB.createIndex({
  id: 'my-new-index',
  dimension: 1536,  // Dimension for OpenAI embeddings
  metric: 'cosine', // 'cosine' | 'euclidean' | 'dotproduct'
  additionalParams: { 
    // Pinecone spec object
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

// Get index description
const description = await pineconeDB.getIndexDescription({ id: 'my-new-index' });
console.log('Index details:', description);
```

### Insert Vector Records

```typescript
import { VectorRecord } from '@memberjunction/ai-vectors';

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
// Fetch specific records by IDs
const getRecordResult = await pineconeDB.getRecord({
  id: 'my-index-name',  // Optional - uses default if not specified
  data: ['record-123']  // Array of record IDs to fetch
});

if (getRecordResult.success) {
  console.log('Retrieved records:', getRecordResult.data);
}

// Fetch multiple records at once
const getMultipleResult = await pineconeDB.getRecords({
  data: ['record-123', 'record-124', 'record-125']
});

if (getMultipleResult.success) {
  console.log('Retrieved records:', getMultipleResult.data);
}
```

### Update Records

```typescript
// Update a record's values and/or metadata
const updateResult = await pineconeDB.updateRecord({
  data: {
    id: 'record-123',
    values: [0.2, 0.3, 0.4, /* ... new vector values */],
    setMetadata: {
      // Metadata fields to update
      TemplateID: 'updated-template'
    }
  }
});

if (updateResult.success) {
  console.log('Record updated successfully');
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

### Working with Namespaces

Pinecone supports namespaces for organizing vectors within an index. This is useful for multi-tenancy or logical separation of data:

```typescript
// Query within a specific namespace
const namespaceQuery = await pineconeDB.queryIndex({
  vector: [/* query vector */],
  topK: 10,
  namespace: 'customer-data',
  includeMetadata: true
});

// Delete all records in a specific namespace
const deleteNamespace = await pineconeDB.deleteAllRecords({
  data: 'customer-data'  // Deletes only in this namespace
});
```

### Advanced Metadata Filtering

```typescript
// Query with complex metadata filters
const filteredQuery = await pineconeDB.queryIndex({
  vector: [/* query vector */],
  topK: 5,
  filter: {
    // Pinecone filter syntax
    $and: [
      { Entity: { $eq: 'Customer' } },
      { TemplateID: { $in: ['template-1', 'template-2'] } },
      { RecordID: { $gte: '100' } }
    ]
  },
  includeMetadata: true,
  includeValues: false  // Don't return vector values to save bandwidth
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
- `getRecord(params)`: Retrieve records by ID(s)
- `getRecords(params)`: Retrieve multiple records by ID(s)
- `updateRecord(params)`: Update a single record's values and/or metadata
- `deleteRecord(record)`: Delete a specific record
- `deleteRecords(records)`: Delete multiple records
- `deleteAllRecords(params)`: Delete all records in an index or namespace

##### Querying
- `queryIndex(params)`: Query vectors by similarity

##### Not Implemented
- `editIndex(params)`: Edit index configuration (throws error)
- `updateRecords(params)`: Batch update records (throws error)

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
  additionalParams?: any; // Additional Pinecone-specific parameters (spec object)
}
```

#### QueryOptions (Pinecone)

```typescript
interface QueryOptions {
  vector: number[];         // Query vector
  topK: number;             // Number of results to return
  filter?: object;          // Metadata filter
  includeValues?: boolean;  // Include vector values in response
  includeMetadata?: boolean;// Include metadata in response
  namespace?: string;       // Namespace to query
}
```

#### BaseMetadata

```typescript
type BaseMetadata = {
  RecordID: string;
  Entity: string;
  TemplateID: string;
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| PINECONE_API_KEY | Your Pinecone API key (required) |
| PINECONE_HOST | Your Pinecone host URL (optional) |
| PINECONE_DEFAULT_INDEX | Default index name to use if not specified (optional) |
| OPENAI_API_KEY | Optional: OpenAI API key for generating embeddings |
| DB_HOST | Optional: Database host for MemberJunction sync |
| DB_PORT | Optional: Database port (defaults to 1433) |
| DB_USERNAME | Optional: Database username |
| DB_PASSWORD | Optional: Database password |
| DB_DATABASE | Optional: Database name |
| CURRENT_USER_EMAIL | Optional: Current user email for context |
| MISTRAL_API_KEY | Optional: Mistral API key for embeddings |

## Integration with MemberJunction Vectors

This package works seamlessly with other MemberJunction vector packages:

```typescript
import { PineconeDatabase, LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { OpenAIEmbedding } from '@memberjunction/ai-openai';
import { VectorSync } from '@memberjunction/ai-vectors-sync';

// Ensure the PineconeDatabase class is registered
LoadPineconeVectorDB();

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

### Class Registration

The PineconeDatabase class automatically registers itself with MemberJunction's class factory system using the `@RegisterClass` decorator. This allows it to be dynamically instantiated by the MemberJunction framework when needed.

To ensure the class is not removed by tree shaking, import the `LoadPineconeVectorDB` function in your application initialization:

```typescript
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';

// Call this in your app initialization
LoadPineconeVectorDB();
```

## Error Handling and Best Practices

### Error Handling

All methods return a `BaseResponse` object with success/failure status:

```typescript
const result = await pineconeDB.createRecord(vectorRecord);

if (result.success) {
  console.log('Operation successful:', result.data);
} else {
  console.error('Operation failed:', result.message);
  // Handle error appropriately
}
```

### Best Practices

1. **Index Management**
   - Always check if an index exists before creating it
   - Use meaningful index names that reflect their purpose
   - Consider using namespaces for multi-tenant applications

2. **Vector Dimensions**
   - Ensure vector dimensions match your embedding model
   - OpenAI embeddings typically use 1536 dimensions
   - Mistral and other models may use different dimensions

3. **Metadata Design**
   - Keep metadata lightweight to optimize performance
   - Use the BaseMetadata type as a foundation
   - Add indexes on frequently queried metadata fields

4. **Batch Operations**
   - Use `createRecords()` for bulk inserts (more efficient than individual inserts)
   - Pinecone supports up to 100 vectors per batch operation
   - Consider chunking larger datasets

5. **Query Optimization**
   - Use metadata filters to reduce search space
   - Set `includeValues: false` if you don't need vector values
   - Adjust `topK` based on your use case

6. **Connection Management**
   - Reuse PineconeDatabase instances rather than creating new ones
   - The default index is cached after first retrieval

## Dependencies

- `@memberjunction/ai-vectors`: Base abstractions for vector databases
- `@memberjunction/aiengine`: MemberJunction AI Engine
- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities and class registration
- `@pinecone-database/pinecone`: Official Pinecone client (v2.2.2)
- `dotenv`: Environment variable management
- `openai`: OpenAI SDK for embeddings
- `rxjs`: Reactive programming library
- `typeorm`: TypeORM for database operations

## Troubleshooting

### Common Issues

1. **"PINECONE_API_KEY not found"**
   - Ensure your `.env` file is in the project root
   - Check that the environment variable is properly set
   - Verify the API key is valid in your Pinecone dashboard

2. **"Index not found"**
   - Verify the index exists using `listIndexes()`
   - Check that PINECONE_DEFAULT_INDEX matches an existing index
   - Ensure the index has finished initializing after creation

3. **"Dimension mismatch"**
   - Ensure your vector dimensions match the index configuration
   - OpenAI ada-002 embeddings are 1536 dimensions
   - Check your embedding model's output dimensions

4. **Connection timeouts**
   - Verify your network connectivity
   - Check Pinecone service status
   - Ensure your API key has proper permissions

5. **Tree shaking removes the class**
   - Always call `LoadPineconeVectorDB()` in your initialization code
   - This prevents the class from being removed during optimization

## License

ISC