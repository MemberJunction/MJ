# @memberjunction/ai-vectors-memory

The MemberJunction AI Vectors Memory package provides lightweight, in-memory vector similarity search capabilities without requiring external vector databases. Perfect for small to medium-sized datasets where vectors can be stored in memory.

## Overview

This package offers a simple, efficient solution for vector similarity search that is:
- **Storage-agnostic**: Load vectors from any source (database, files, APIs)
- **Zero-dependency**: No external vector database required
- **Fast**: Optimized in-memory cosine similarity calculations
- **Flexible**: Use any string identifier for your vectors
- **Metadata-rich**: Attach arbitrary metadata to each vector

## Installation

```bash
npm install @memberjunction/ai-vectors-memory
```

## Quick Start

```typescript
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';

// Create service instance
const vectorService = new SimpleVectorService();

// Load vectors with metadata
const entries = [
  { 
    key: 'doc1', 
    vector: [0.1, 0.2, 0.3, 0.4], 
    metadata: { title: 'Document 1', category: 'tech' } 
  },
  { 
    key: 'doc2', 
    vector: [0.4, 0.3, 0.2, 0.1], 
    metadata: { title: 'Document 2', category: 'science' } 
  }
];

vectorService.LoadVectors(entries);

// Find nearest neighbors
const queryVector = [0.15, 0.25, 0.35, 0.45];
const similar = vectorService.FindNearest(queryVector, 5);

similar.forEach(result => {
  console.log(`${result.key}: ${result.score.toFixed(4)} - ${result.metadata.title}`);
});
```

## API Reference

### SimpleVectorService

The main class providing in-memory vector similarity search.

#### Methods

##### `LoadVectors(entries: VectorEntry[] | Map<string, number[]>): void`
Load vectors into memory. Accepts either an array of VectorEntry objects or a Map.

```typescript
// Load from array with metadata
vectorService.LoadVectors([
  { key: 'item1', vector: [0.1, 0.2], metadata: { name: 'Item 1' } }
]);

// Load from Map (without metadata)
const map = new Map();
map.set('item1', [0.1, 0.2]);
vectorService.LoadVectors(map);
```

##### `AddVector(key: string, vector: number[], metadata?: any): void`
Add or update a single vector.

```typescript
vectorService.AddVector('product123', [0.1, 0.2, 0.3], {
  name: 'Product Name',
  category: 'Electronics'
});
```

##### `FindNearest(queryVector: number[], topK?: number): VectorSearchResult[]`
Find the K nearest neighbors to a query vector using cosine similarity.

```typescript
const results = vectorService.FindNearest([0.1, 0.2, 0.3], 10);
// Returns top 10 most similar vectors
```

##### `FindSimilar(key: string, topK?: number): VectorSearchResult[]`
Find vectors similar to an existing vector (excludes the source vector).

```typescript
const similar = vectorService.FindSimilar('product123', 5);
// Returns 5 most similar items to product123
```

##### `Similarity(key1: string, key2: string): number`
Calculate cosine similarity between two vectors (returns value between -1 and 1).

```typescript
const score = vectorService.Similarity('item1', 'item2');
console.log(`Similarity: ${score}`);
```

##### `GetVector(key: string): number[] | undefined`
Retrieve a specific vector by its key.

```typescript
const vector = vectorService.GetVector('product123');
```

##### `GetMetadata(key: string): any | undefined`
Retrieve metadata for a specific vector.

```typescript
const metadata = vectorService.GetMetadata('product123');
console.log(metadata.name);
```

##### `RemoveVector(key: string): boolean`
Remove a vector from the service.

```typescript
const removed = vectorService.RemoveVector('product123');
```

##### `Clear(): void`
Clear all vectors from memory.

```typescript
vectorService.Clear();
```

##### `ExportVectors(): VectorEntry[]`
Export all vectors for persistence.

```typescript
const allVectors = vectorService.ExportVectors();
// Save to database or file
await saveToDatabase(allVectors);
```

##### `Size: number`
Get the current number of vectors (read-only property).

```typescript
console.log(`Total vectors: ${vectorService.Size}`);
```

##### `Has(key: string): boolean`
Check if a vector exists.

```typescript
if (vectorService.Has('product123')) {
  console.log('Vector exists');
}
```

##### `GetAllKeys(): string[]`
Get all vector keys.

```typescript
const keys = vectorService.GetAllKeys();
console.log(`Keys: ${keys.join(', ')}`);
```

## Types

### VectorEntry
```typescript
interface VectorEntry {
  key: string;           // Unique identifier
  vector: number[];      // Embedding array
  metadata?: any;        // Optional metadata
}
```

### VectorSearchResult
```typescript
interface VectorSearchResult {
  key: string;           // Vector identifier
  score: number;         // Similarity score (0-1)
  metadata?: any;        // Associated metadata
}
```

## Use Cases

### 1. Semantic Search with MemberJunction Entities

```typescript
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { RunView } from '@memberjunction/core';

const vectorService = new SimpleVectorService();
const rv = new RunView();

// Load components with embeddings from database
const components = await rv.RunView({
  EntityName: 'Components',
  ResultType: 'entity_object'
});

// Load vectors with metadata
const entries = components.Results.map(comp => ({
  key: comp.ID,
  vector: JSON.parse(comp.EmbeddingVector),
  metadata: {
    name: comp.Name,
    description: comp.Description,
    type: comp.ComponentType
  }
}));

vectorService.LoadVectors(entries);

// Search for similar components
const queryEmbedding = await generateEmbedding('dashboard visualization');
const similar = vectorService.FindNearest(queryEmbedding, 10);
```

### 2. Document Similarity

```typescript
// Load document embeddings
const documents = [
  { id: 'doc1', content: 'Machine learning basics', embedding: [...] },
  { id: 'doc2', content: 'Deep learning tutorial', embedding: [...] },
  { id: 'doc3', content: 'Neural networks guide', embedding: [...] }
];

const entries = documents.map(doc => ({
  key: doc.id,
  vector: doc.embedding,
  metadata: { content: doc.content }
}));

vectorService.LoadVectors(entries);

// Find documents similar to doc1
const similarDocs = vectorService.FindSimilar('doc1', 2);
```

### 3. Product Recommendations

```typescript
// Load product embeddings
const products = await loadProductsWithEmbeddings();

vectorService.LoadVectors(
  products.map(p => ({
    key: p.sku,
    vector: p.embedding,
    metadata: {
      name: p.name,
      price: p.price,
      category: p.category
    }
  }))
);

// Get recommendations for a user based on their viewed product
const recommendations = vectorService.FindSimilar(viewedProductSku, 10)
  .filter(r => r.metadata.category === targetCategory)
  .slice(0, 5);
```

### 4. Duplicate Detection

```typescript
// Check for duplicate content
const entries = contentItems.map(item => ({
  key: item.id,
  vector: item.embedding,
  metadata: { title: item.title, createdAt: item.createdAt }
}));

vectorService.LoadVectors(entries);

// Find potential duplicates (high similarity threshold)
const potentialDuplicates = [];
for (const key of vectorService.GetAllKeys()) {
  const similar = vectorService.FindSimilar(key, 5);
  const duplicates = similar.filter(s => s.score > 0.95);
  if (duplicates.length > 0) {
    potentialDuplicates.push({ original: key, duplicates });
  }
}
```

## Performance Considerations

### Memory Usage
- Each vector consumes approximately `4 bytes × dimensions` of memory
- Example: 10,000 vectors of 768 dimensions ≈ 30 MB
- Metadata adds additional overhead depending on content

### Computational Complexity
- `FindNearest`: O(n × d) where n = number of vectors, d = dimensions
- `AddVector`: O(1)
- `RemoveVector`: O(1)
- `Similarity`: O(d) where d = dimensions

### Recommendations
- **Optimal for**: < 100,000 vectors with < 1,536 dimensions
- **Consider alternatives**: For millions of vectors or real-time updates at scale
- **Batch operations**: Load all vectors at once rather than individual adds
- **Memory monitoring**: Monitor process memory when working with large datasets

## Integration with MemberJunction

This package integrates seamlessly with the MemberJunction ecosystem:

```typescript
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { RunView } from '@memberjunction/core';
import { LocalEmbedding } from '@memberjunction/local-embeddings';

// Use local embeddings
const embedder = new LocalEmbedding();
const vectorService = new SimpleVectorService();

// Load entities and generate embeddings
const rv = new RunView();
const entities = await rv.RunView({
  EntityName: 'Products',
  ResultType: 'entity_object'
});

// Generate embeddings and load into service
const entries = await Promise.all(
  entities.Results.map(async (entity) => ({
    key: entity.ID,
    vector: await embedder.EmbedText({ 
      text: `${entity.Name} ${entity.Description}`,
      model: 'all-MiniLM-L6-v2'
    }),
    metadata: entity.GetAll()
  }))
);

vectorService.LoadVectors(entries);
```

## Error Handling

The service provides clear error messages:

```typescript
try {
  vectorService.AddVector('', [1, 2, 3]);
} catch (error) {
  // Error: Key cannot be null or undefined
}

try {
  vectorService.FindSimilar('nonexistent');
} catch (error) {
  // Error: Vector with key "nonexistent" not found
}

try {
  vectorService.Similarity('key1', 'key2');
} catch (error) {
  // Error: Vectors must have same dimensions. Got 384 and 768
}
```

## Contributing

When contributing to this package:
1. Follow MemberJunction coding standards
2. Use PascalCase for public methods and classes
3. Add comprehensive TypeScript types
4. Include JSDoc comments for public APIs
5. Test with various vector dimensions and sizes

## License

ISC