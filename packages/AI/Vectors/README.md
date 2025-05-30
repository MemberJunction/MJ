# MemberJunction Vector Operations

This directory contains packages for working with vector embeddings and vector databases within the MemberJunction AI framework. These packages enable semantic search, similarity detection, and AI-powered data analysis.

## Overview

Vector operations are fundamental to modern AI applications, enabling:
- Semantic search across your data
- Finding similar records
- Content recommendations
- Duplicate detection
- Knowledge retrieval for AI agents

## Package Structure

### Core Packages

- **[@memberjunction/ai-vectors](./Core)** - Core vector operations and abstractions
  - Base classes for vector operations
  - Entity vectorization interfaces
  - Pagination and filtering utilities
  - Integration with MemberJunction metadata

- **[@memberjunction/ai-vectordb](./Database)** - Vector database abstraction layer
  - Common interface for vector stores
  - Index management
  - Query operations
  - Metadata handling

### Synchronization & Processing

- **[@memberjunction/ai-vector-sync](./Sync)** - Entity vectorization and synchronization
  - Batch processing of entities
  - Template-based document generation
  - Incremental updates
  - Worker pool management
  - Progress tracking

- **[@memberjunction/ai-vector-dupe](./Dupe)** - Duplicate detection using vectors
  - Similarity-based duplicate finding
  - Configurable thresholds
  - Batch processing
  - Integration with entity system

## Key Concepts

### Embeddings
Embeddings are numerical representations of text that capture semantic meaning:
- Generated using AI models (OpenAI, Mistral, etc.)
- Typically 768-3072 dimensional vectors
- Enable mathematical operations on text

### Vector Databases
Specialized databases optimized for similarity search:
- Store and index high-dimensional vectors
- Perform fast nearest-neighbor searches
- Support metadata filtering
- Scale to millions of vectors

### Entity Vectorization
The process of creating searchable embeddings for MemberJunction entities:
1. Extract text from entity fields
2. Apply templates for formatting
3. Generate embeddings using AI models
4. Store in vector database with metadata
5. Enable semantic search across entities

## Getting Started

### Basic Vector Search

```typescript
import { VectorBase } from '@memberjunction/ai-vectors';

// Get vector instance (configured via MemberJunction)
const vectors = VectorBase.Instance;

// Search for similar content
const results = await vectors.search({
    entityName: 'Products',
    searchText: 'comfortable running shoes',
    top: 10
});
```

### Entity Vectorization

```typescript
import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';

// Create syncer instance
const syncer = new EntityVectorSyncer();

// Vectorize all products
await syncer.vectorizeEntity({
    entity: 'Products',
    templateId: 'product-template-id'
});
```

### Duplicate Detection

```typescript
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';

// Create detector
const detector = new DuplicateRecordDetector({
    ModelID: 'model-id',
    EntityID: 'entity-id',
    ThresholdPercentage: 85
});

// Find duplicates
const duplicates = await detector.getDuplicateRecordsFromEntity(
    entityId,
    recordId
);
```

## Architecture

### Vector Pipeline
```
Entity Data → Template Processing → Text Generation → Embedding → Vector Store
     ↓              ↓                    ↓                ↓            ↓
   Fields      Formatting           Documents        Vectors      Search
```

### Components
1. **Entity Source** - MemberJunction entities with text data
2. **Template Engine** - Formats entity data for embedding
3. **Embedding Provider** - Converts text to vectors (OpenAI, etc.)
4. **Vector Store** - Persists and indexes vectors (Pinecone, etc.)
5. **Search Interface** - Query and retrieve similar content

## Use Cases

### Semantic Search
Find records based on meaning, not just keywords:
```typescript
// Find products similar to a description
const similar = await vectors.search({
    entityName: 'Products',
    searchText: 'lightweight laptop for students',
    top: 20
});
```

### Duplicate Detection
Identify potential duplicate records:
```typescript
// Find duplicate customer records
const duplicates = await detector.findDuplicates('Customers', {
    threshold: 0.9,
    fields: ['Name', 'Email', 'Address']
});
```

### Content Recommendations
Suggest related content:
```typescript
// Get similar articles
const related = await vectors.getSimilar({
    entityName: 'Articles',
    recordId: currentArticleId,
    top: 5
});
```

### Knowledge Base for AI
Provide context to AI models:
```typescript
// Get relevant context for AI prompt
const context = await vectors.search({
    entityName: 'Documentation',
    searchText: userQuestion,
    top: 3
});

// Use in AI prompt
const prompt = `Context: ${context.map(c => c.text).join('\n')}
Question: ${userQuestion}`;
```

## Configuration

### Vector Database Setup
Configure your vector database in MemberJunction:
1. Add vector database provider credentials
2. Configure index settings
3. Set embedding model preferences
4. Define vectorization templates

### Embedding Models
Choose appropriate embedding models:
- **text-embedding-ada-002** (OpenAI) - General purpose, good quality
- **mistral-embed** (Mistral) - Open source alternative
- **text-embedding-3-large** (OpenAI) - Higher dimension, better quality

### Templates
Create templates to control how entities are converted to text:
```handlebars
{{Name}}
Category: {{Category}}
Description: {{Description}}
Features: {{#each Features}}{{this}}, {{/each}}
```

## Performance Considerations

1. **Batch Processing** - Vectorize in batches for efficiency
2. **Incremental Updates** - Only re-vectorize changed records
3. **Caching** - Cache embeddings to avoid regeneration
4. **Index Optimization** - Configure vector indices appropriately
5. **Dimension Selection** - Balance quality vs. performance

## Best Practices

1. **Template Design**
   - Include relevant fields for search
   - Format consistently
   - Avoid redundant information
   - Consider search use cases

2. **Embedding Strategy**
   - Choose appropriate models
   - Consider multilingual needs
   - Monitor embedding costs
   - Validate quality

3. **Search Optimization**
   - Use metadata filters when possible
   - Tune similarity thresholds
   - Implement result ranking
   - Cache frequent queries

4. **Data Management**
   - Regular cleanup of old vectors
   - Monitor index size
   - Plan for scaling
   - Backup vector data

## Troubleshooting

Common issues and solutions:
- **Poor search results** - Review templates and embedding model
- **Slow performance** - Check batch sizes and index configuration
- **High costs** - Optimize vectorization frequency and model selection
- **Duplicate false positives** - Adjust similarity thresholds

## Contributing

When contributing to vector packages:
1. Maintain provider abstraction
2. Include performance benchmarks
3. Document configuration options
4. Add integration tests
5. Consider backward compatibility

## License

All vector packages follow the same licensing as the MemberJunction project.