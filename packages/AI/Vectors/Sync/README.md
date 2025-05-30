# @memberjunction/ai-vector-sync

A robust MemberJunction package for synchronizing entities with vector databases by transforming entity records into vector representations using embedding models.

## Overview

The `@memberjunction/ai-vector-sync` package provides a comprehensive solution for:
- Converting MemberJunction entities into vector embeddings
- Storing embeddings in vector databases (currently supports Pinecone)
- Managing the synchronization lifecycle between entities and their vector representations
- Supporting batch processing for large datasets
- Providing template-based document generation for vectorization

## Installation

```bash
npm install @memberjunction/ai-vector-sync
```

## Prerequisites

Before using this package, ensure you have:

1. **SQL Database with MemberJunction Framework**  
   A properly configured SQL database with the MemberJunction framework installed.

2. **API Keys**  
   - Embedding model API key (supports OpenAI, Mistral, etc.)
   - Vector database API key (currently supports Pinecone)

3. **Entity Configuration**  
   - Entity Document record defined in MemberJunction
   - Associated template for specifying which entity properties to vectorize

## Core Features

### Entity Vectorization
Transform entity records into high-dimensional vectors that capture the semantic meaning of the data.

### Batch Processing
Efficiently handle large datasets with configurable batch sizes for:
- Record fetching
- Vectorization
- Database upsertion

### Template-Based Processing
Use MemberJunction templates to define which entity fields and relationships to include in vectorization.

### Vector Database Integration
Seamlessly integrate with vector databases through the MemberJunction AI infrastructure.

## Usage

### Basic Entity Vectorization

```typescript
import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { UserInfo } from '@memberjunction/core';

// Initialize the syncer
const syncer = new EntityVectorSyncer();

// Configure the syncer (required before first use)
await syncer.Config(false, contextUser);

// Vectorize an entity
const params = {
  entityID: 'your-entity-id',
  entityDocumentID: 'your-entity-document-id',
  listBatchCount: 50,        // Optional: records per batch (default: 50)
  VectorizeBatchCount: 50,   // Optional: vectorization batch size (default: 50)
  UpsertBatchCount: 50,      // Optional: upsert batch size (default: 50)
  StartingOffset: 0          // Optional: skip records for resuming
};

// Start vectorization (runs asynchronously)
syncer.VectorizeEntity(params, contextUser);
```

### Vectorizing a Specific List

```typescript
// Vectorize only records within a specific list
const params = {
  entityID: 'your-entity-id',
  entityDocumentID: 'your-entity-document-id',
  listID: 'your-list-id',    // Only vectorize records in this list
  listBatchCount: 100
};

await syncer.VectorizeEntity(params, contextUser);
```

### Working with Entity Documents

```typescript
// Get entity document by ID
const entityDoc = await syncer.GetEntityDocument('document-id');

// Get entity document by name
const entityDoc = await syncer.GetEntityDocumentByName('Document Name', contextUser);

// Get all active entity documents
const activeDocs = await syncer.GetActiveEntityDocuments();

// Get active documents for specific entities
const specificDocs = await syncer.GetActiveEntityDocuments(['Entity1', 'Entity2']);
```

### Creating Default Entity Documents

```typescript
import { VectorDatabaseEntity, AIModelEntity } from '@memberjunction/core-entities';

// Create a default entity document when one doesn't exist
const entityDoc = await syncer.CreateDefaultEntityDocument(
  entityID,
  vectorDatabase,  // VectorDatabaseEntity instance
  aiModel         // AIModelEntity instance
);
```

## API Reference

### EntityVectorSyncer

The main class for entity vectorization operations.

#### Methods

##### `Config(forceRefresh: boolean, contextUser?: UserInfo): Promise<void>`
Configures the syncer and initializes required engines.
- `forceRefresh`: Force refresh of caches and engines
- `contextUser`: User context for operations

##### `VectorizeEntity(params: VectorizeEntityParams, contextUser?: UserInfo): Promise<VectorizeEntityResponse>`
Vectorizes entities based on provided parameters.
- `params`: Configuration for vectorization
- `contextUser`: Required user context

##### `GetEntityDocument(entityDocumentID: string): Promise<EntityDocumentEntity | null>`
Retrieves an entity document by ID.

##### `GetEntityDocumentByName(entityDocumentName: string, contextUser?: UserInfo): Promise<EntityDocumentEntity | null>`
Retrieves an entity document by name.

##### `GetActiveEntityDocuments(entityNames?: string[]): Promise<EntityDocumentEntity[]>`
Gets all active entity documents, optionally filtered by entity names.

##### `CreateDefaultEntityDocument(entityID: string, vectorDatabase: VectorDatabaseEntity, aiModel: AIModelEntity): Promise<EntityDocumentEntity>`
Creates a default entity document for the specified entity.

### Types

#### VectorizeEntityParams
```typescript
type VectorizeEntityParams = {
  entityID: string;              // Required: Entity to vectorize
  entityDocumentID?: string;     // Entity document configuration
  listID?: string;               // Optional: Specific list to vectorize
  listBatchCount?: number;       // Records per fetch batch (default: 50)
  VectorizeBatchCount?: number;  // Vectorization batch size (default: 50)
  UpsertBatchCount?: number;     // Database upsert batch size (default: 50)
  StartingOffset?: number;       // Skip records for resuming
  CurrentUser?: UserInfo;        // User context
  options?: any;                 // Additional options
}
```

#### EntitySyncConfig
```typescript
type EntitySyncConfig = {
  EntityDocumentID: string;      // Entity document to use
  Interval: number;              // Sync interval in seconds
  RunViewParams: RunViewParams;  // View parameters for fetching records
  IncludeInSync: boolean;        // Include in sync process
  LastRunDate: string;           // Last sync timestamp
  VectorIndexID: number;         // Vector index ID
  VectorID: number;              // Vector database ID
}
```

## Architecture

### Process Flow

1. **Entity Document Retrieval**: Fetches configuration from Entity Document record
2. **Model and Database Configuration**: Sets up embedding model and vector database
3. **Data Fetching**: Retrieves entity records in batches
4. **Vectorization**: Transforms records using embedding model
5. **Vector Upsertion**: Stores vectors in database
6. **EntityRecordDocument Creation**: Creates tracking records

### Worker Architecture

The package uses a multi-worker architecture for efficient processing:
- **VectorizeTemplates Worker**: Handles template-based text generation and embedding
- **UpsertVectors Worker**: Manages vector database operations
- **EntityRecordDocument Worker**: Tracks vector-entity relationships

## Configuration

### Environment Variables

Create a `.env` file with:

```env
# Database Configuration
DB_HOST=your-database-host
DB_PORT=1433
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_DATABASE=your-database

# API Keys
OPENAI_API_KEY=your-openai-key
MISTRAL_API_KEY=your-mistral-key
PINECONE_API_KEY=your-pinecone-key
PINECONE_HOST=your-pinecone-host
PINECONE_DEFAULT_INDEX=your-default-index

# User Configuration
CURRENT_USER_EMAIL=user@example.com
```

## Performance Considerations

- **Long-Running Processes**: Vectorization can take hours for large datasets
- **Batch Sizes**: Adjust batch sizes based on your system resources
- **Asynchronous Processing**: Consider running vectorization in background processes
- **Memory Usage**: Monitor memory usage for large batch sizes

## Integration with MemberJunction

This package integrates seamlessly with:
- `@memberjunction/core`: Core entity and metadata functionality
- `@memberjunction/ai`: AI model abstractions
- `@memberjunction/ai-vectordb`: Vector database abstractions
- `@memberjunction/templates`: Template processing engine

## Error Handling

The package includes comprehensive error handling:
- Validation of entity documents and templates
- Graceful handling of API failures
- Detailed logging through MemberJunction's logging system

## Best Practices

1. **Start with Small Batches**: Test with small batch sizes before processing large datasets
2. **Monitor Progress**: Use MemberJunction's logging to track vectorization progress
3. **Handle Interruptions**: Use `StartingOffset` to resume interrupted processes
4. **Template Design**: Design templates to include relevant fields for semantic search
5. **Resource Management**: Consider database and API rate limits when setting batch sizes

## License

ISC - See LICENSE file for details

## Author

MemberJunction.com