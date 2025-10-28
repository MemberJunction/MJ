# @memberjunction/ai-vector-dupe

A MemberJunction package for identifying and managing duplicate records using AI-powered vector similarity search. This package generates vector representations of records and uses similarity scoring to detect potential duplicates, with options for automatic merging.

## Overview

The AI Vector Dupe package provides sophisticated duplicate detection capabilities by:
- Converting records into vector embeddings using AI models
- Performing similarity searches in vector databases
- Tracking duplicate detection runs and results
- Optionally merging duplicates based on configurable thresholds

## Installation

```bash
npm install @memberjunction/ai-vector-dupe
```

## Prerequisites

1. **MemberJunction Framework**: A properly configured MemberJunction database with the core schema
2. **AI Model Provider**: API key for embedding models (OpenAI, Mistral, or other supported providers)
3. **Vector Database**: Currently supports Pinecone with appropriate API credentials
4. **Entity Documents**: Configured entity documents with templates for the entities you want to analyze

## Core Components

### DuplicateRecordDetector

The main class that handles duplicate detection operations.

```typescript
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { PotentialDuplicateRequest, UserInfo } from '@memberjunction/core';

const detector = new DuplicateRecordDetector();
```

### VectorSyncBase

Abstract base class providing utilities for vector synchronization operations.

```typescript
import { VectorSyncBase } from '@memberjunction/ai-vector-dupe';
```

### EntitySyncConfig

Type definition for entity synchronization configuration.

```typescript
import { EntitySyncConfig } from '@memberjunction/ai-vector-dupe';

const config: EntitySyncConfig = {
    EntityDocumentID: 'entity-doc-id',
    Interval: 3600,
    RunViewParams: { /* RunView parameters */ },
    IncludeInSync: true,
    LastRunDate: 'January 1, 2024 00:00:00',
    VectorIndexID: 1,
    VectorID: 1
};
```

## Usage

### Basic Duplicate Detection

```typescript
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { PotentialDuplicateRequest, UserInfo } from '@memberjunction/core';

// Initialize the detector
const detector = new DuplicateRecordDetector();

// Define the request parameters
const request: PotentialDuplicateRequest = {
    ListID: 'your-list-id',           // ID of the list containing records to check
    EntityID: 'your-entity-id',        // ID of the entity type
    EntityDocumentID: 'doc-id',        // ID of the entity document with template
    Options: {
        DuplicateRunID: 'run-id'       // Optional: existing duplicate run to continue
    }
};

// Execute duplicate detection
const response = await detector.getDuplicateRecords(request, currentUser);

if (response.Status === 'Success') {
    console.log(`Found ${response.PotentialDuplicateResult.length} records with potential duplicates`);
    
    for (const result of response.PotentialDuplicateResult) {
        console.log(`Record ${result.RecordCompositeKey.ToString()}:`);
        for (const duplicate of result.Duplicates) {
            console.log(`  - Potential duplicate: ${duplicate.ToString()} (${duplicate.ProbabilityScore * 100}% match)`);
        }
    }
}
```

### Advanced Configuration

```typescript
// Configure thresholds via Entity Document settings
// PotentialMatchThreshold: Minimum score to consider as potential duplicate (e.g., 0.8)
// AbsoluteMatchThreshold: Score at which automatic merging occurs (e.g., 0.95)

const entityDocument = await vectorizer.GetEntityDocument(entityDocumentID);
entityDocument.PotentialMatchThreshold = 0.8;  // 80% similarity
entityDocument.AbsoluteMatchThreshold = 0.95;   // 95% for auto-merge
await entityDocument.Save();
```

## API Reference

### DuplicateRecordDetector

#### `getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>`

Performs duplicate detection on records in a list.

**Parameters:**
- `params`: Request parameters including:
  - `ListID`: ID of the list containing records to analyze
  - `EntityID`: ID of the entity type
  - `EntityDocumentID`: ID of the entity document configuration
  - `Options`: Optional configuration including `DuplicateRunID`
- `contextUser`: Optional user context for permissions

**Returns:** `PotentialDuplicateResponse` containing:
- `Status`: 'Success' or 'Error'
- `ErrorMessage`: Error details if failed
- `PotentialDuplicateResult[]`: Array of results for each analyzed record

### VectorSyncBase

Base class providing utility methods:

- `parseStringTemplate(str: string, obj: any): string` - Parse template strings
- `timer(ms: number): Promise<unknown>` - Async delay utility
- `start()` / `end()` / `timeDiff()` - Timing utilities
- `saveJSONData(data: any, path: string)` - JSON file operations

## Workflow Details

The duplicate detection process follows these steps:

1. **Vectorization**: Records are converted to vector embeddings using the configured AI model
2. **Similarity Search**: Each vector is compared against others in the vector database
3. **Threshold Filtering**: Results are filtered based on the potential match threshold
4. **Result Tracking**: All operations are logged in duplicate run tables
5. **Optional Merging**: Records exceeding the absolute match threshold are automatically merged

## Database Schema Integration

The package integrates with these MemberJunction entities:

- **Duplicate Runs**: Master record for each duplicate detection execution
- **Duplicate Run Details**: Individual record analysis results
- **Duplicate Run Detail Matches**: Specific duplicate matches found
- **Lists**: Source lists containing records to analyze
- **List Details**: Individual records within lists
- **Entity Documents**: Configuration for entity vectorization

## Configuration

### Environment Variables

Create a `.env` file with:

```env
# AI Model Configuration
OPENAI_API_KEY=your-openai-key
MISTRAL_API_KEY=your-mistral-key

# Vector Database
PINECONE_API_KEY=your-pinecone-key
PINECONE_HOST=your-pinecone-host
PINECONE_DEFAULT_INDEX=your-index-name

# Database Connection
DB_HOST=your-sql-server
DB_PORT=1433
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_DATABASE=your-database

# User Context
CURRENT_USER_EMAIL=user@example.com
```

### Entity Document Templates

Entity documents use template syntax to define how records are converted to text for vectorization:

```javascript
// Example template
const template = "${FirstName} ${LastName} works at ${Company} as ${Title}";
```

## Dependencies

- `@memberjunction/ai`: AI model abstractions
- `@memberjunction/ai-vectordb`: Vector database interfaces
- `@memberjunction/ai-vectors`: Vector operations
- `@memberjunction/ai-vectors-pinecone`: Pinecone implementation
- `@memberjunction/ai-vector-sync`: Entity vectorization
- `@memberjunction/core`: Core MJ functionality
- `@memberjunction/core-entities`: Entity definitions

## Best Practices

1. **Batch Processing**: For large datasets, process records in batches to avoid timeouts
2. **Threshold Tuning**: Start with conservative thresholds and adjust based on results
3. **Template Design**: Create comprehensive templates that capture all relevant fields
4. **Regular Sync**: Keep vector databases synchronized with source data
5. **Monitor Performance**: Track processing times and optimize for large datasets

## Error Handling

The package provides detailed error messages for common issues:

```typescript
try {
    const response = await detector.getDuplicateRecords(request, user);
    if (response.Status === 'Error') {
        console.error('Duplicate detection failed:', response.ErrorMessage);
    }
} catch (error) {
    console.error('Unexpected error:', error.message);
}
```

## Limitations

- Currently supports duplicate detection within a single entity type only
- Requires pre-configured entity documents with templates
- Vector database support limited to Pinecone
- Performance depends on vector database query capabilities

## Future Enhancements

- Cross-entity duplicate detection
- Additional vector database providers
- Batch processing improvements
- Real-time duplicate prevention
- Advanced merge strategies

## Support

For issues, questions, or contributions, please refer to the [MemberJunction documentation](https://docs.memberjunction.org) or contact the development team.
