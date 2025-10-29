# @memberjunction/ai-vectors-memory

A powerful, production-ready in-memory vector similarity search and clustering service for MemberJunction. This package provides comprehensive vector operations including 6 distance metrics, 2 clustering algorithms, and extensive utility methods for business applications.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Distance Metrics Guide](#distance-metrics-guide)
- [Clustering Algorithms](#clustering-algorithms)
- [Utility Methods](#utility-methods)
- [Business Use Cases](#business-use-cases)
- [API Reference](#api-reference)
- [Performance](#performance)
- [Best Practices](#best-practices)

## Features

### 🎯 Core Capabilities
- **In-memory vector storage** with O(1) lookups
- **6 distance/similarity metrics** (all normalized to 0-1 range)
- **K-nearest neighbor search** with threshold filtering
- **Metadata pre-filtering** for efficient scoped searches
- **Dimension validation** to ensure vector consistency
- **Generic TypeScript support** for metadata typing

### 📊 Distance Metrics
- **Cosine Similarity** - Semantic similarity, text embeddings
- **Euclidean Distance** - Physical measurements, specifications
- **Manhattan Distance** - Grid navigation, robust to outliers
- **Dot Product** - Recommendations with magnitude
- **Jaccard Similarity** - Set comparisons, categorical data
- **Hamming Distance** - Error detection, configuration drift

### 🔬 Clustering Algorithms
- **K-Means with K-Means++** - Fast, spherical clusters
- **DBSCAN** - Density-based, automatic outlier detection

### 🛠️ Utility Methods
- **Silhouette Score** - Evaluate clustering quality
- **Elbow Method** - Find optimal number of clusters
- **Centroid Calculation** - Find cluster centers
- **Within/Between Cluster Distance** - Measure cluster quality

## Installation

```bash
npm install @memberjunction/ai-vectors-memory
```

## Quick Start

```typescript
import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';

// Create service instance
const service = new SimpleVectorService();

// Load vectors with metadata
const vectors: VectorEntry[] = [
  { key: 'doc1', vector: [0.1, 0.2, 0.3], metadata: { title: 'Document 1' } },
  { key: 'doc2', vector: [0.4, 0.5, 0.6], metadata: { title: 'Document 2' } },
  { key: 'doc3', vector: [0.7, 0.8, 0.9], metadata: { title: 'Document 3' } }
];
service.LoadVectors(vectors);

// Find similar vectors
const queryVector = [0.15, 0.25, 0.35];
const results = service.FindNearest(queryVector, 2);

results.forEach(result => {
  console.log(`${result.key}: similarity=${result.score.toFixed(3)}`);
});
```

## Metadata Filtering

All search methods support optional metadata filtering for efficient scoped searches. Filtering happens **before** similarity calculation, making it 10-20x faster than post-search filtering.

### Basic Filtering

```typescript
interface DocumentMetadata {
  category: string;
  author: string;
  status: 'active' | 'archived';
}

const service = new SimpleVectorService<DocumentMetadata>();

// Find similar documents filtered by category
const results = service.FindNearest(
  queryVector,
  5,
  0.7,
  'cosine',
  (metadata) => metadata.category === 'Technology'
);

// Find similar documents by multiple criteria
const filtered = service.FindNearest(
  queryVector,
  10,
  0.5,
  'cosine',
  (metadata) =>
    metadata.status === 'active' &&
    metadata.author === 'John Doe'
);
```

### Advanced Filtering

```typescript
// Complex filtering logic
const results = service.FindNearest(
  queryVector,
  10,
  0.6,
  'cosine',
  (metadata) => {
    // Multi-condition filtering
    if (metadata.category === 'Premium') return true;
    if (metadata.views > 1000 && metadata.rating >= 4.5) return true;
    return false;
  }
);

// FindSimilar also supports filtering
const similar = service.FindSimilar(
  'doc123',
  5,
  0.7,
  'cosine',
  (metadata) => metadata.language === 'en'
);

// FindAboveThreshold with filtering
const matches = service.FindAboveThreshold(
  queryVector,
  0.8,
  'cosine',
  (metadata) => metadata.verified === true
);

// DBSCAN clustering with pre-filtering
const clusters = service.DBSCANCluster(
  0.3,
  3,
  'euclidean',
  (metadata) => metadata.active === true
);
```

### Performance Benefits

```typescript
// ❌ OLD WAY: Search 3x wider then filter (inefficient)
const wideResults = service.FindNearest(queryVector, topK * 3);
const filtered = wideResults
  .filter(r => r.metadata.agentId === 'agent-123')
  .slice(0, topK);

// ✅ NEW WAY: Filter before similarity calculation (10-20x faster!)
const filtered = service.FindNearest(
  queryVector,
  topK,
  undefined,
  'cosine',
  (metadata) => metadata.agentId === 'agent-123'
);
```

**Why it's faster:**
- For 1000 vectors with filter matching 50 items:
  - **Old way**: Calculate similarity for 1000 vectors, filter to 50, return topK
  - **New way**: Filter to 50 vectors (fast), calculate similarity for 50, return topK
  - **Speedup**: ~20x (similarity calculation is expensive vs metadata checks)

## Distance Metrics Guide

All metrics are normalized to 0-1 range where 1 = most similar/closest.

### Cosine Similarity (Default)

**Best for:** Text embeddings, semantic search, document similarity

```typescript
// Find semantically similar documents
const similar = service.FindNearest(docEmbedding, 5, undefined, 'cosine');

// Filter by minimum similarity (0.8 = 80% similar)
const highSimilarity = service.FindNearest(docEmbedding, 10, 0.8, 'cosine');
```

**When to use:**
- ✅ Text embeddings from LLMs
- ✅ Document/content similarity
- ✅ When magnitude doesn't matter
- ❌ Physical measurements

### Euclidean Distance

**Best for:** Physical measurements, product specifications, geographic data

```typescript
// Find products with similar specifications
const productFeatures = [size, weight, price, rating];
const similar = service.FindNearest(productFeatures, 5, undefined, 'euclidean');

// Find stores within distance threshold
const nearbyStores = service.FindAboveThreshold(location, 0.7, 'euclidean');
```

**When to use:**
- ✅ Physical dimensions (size, weight, distance)
- ✅ Continuous numeric features
- ✅ Quality control measurements
- ❌ High-dimensional sparse data

### Manhattan Distance

**Best for:** Grid systems, warehouse navigation, time series

```typescript
// Warehouse picking optimization
const currentLocation = [aisle, shelf, bin];
const nearestItems = service.FindNearest(currentLocation, 10, undefined, 'manhattan');

// Time series comparison (robust to outliers)
const trendSimilarity = service.FindSimilar('trend1', 5, undefined, 'manhattan');
```

**When to use:**
- ✅ Grid-based movement (warehouses, city blocks)
- ✅ When outliers should have linear impact
- ✅ Each dimension is independent
- ❌ Smooth gradients needed

### Dot Product

**Best for:** Recommendation systems, weighted scoring, revenue analysis

```typescript
// Product recommendations with popularity weighting
const userPreferences = [0.8, 0.2, 0.5, 0.9]; // Interest levels
const recommendations = service.FindNearest(userPreferences, 10, undefined, 'dotproduct');

// Revenue impact analysis (quantity × price)
const revenueVector = quantities.map((q, i) => q * prices[i]);
const similar = service.FindSimilar('product1', 5, undefined, 'dotproduct');
```

**When to use:**
- ✅ Magnitude matters (popularity, importance)
- ✅ Weighted feature comparisons
- ✅ Collaborative filtering
- ❌ Vectors with different scales

### Jaccard Similarity

**Best for:** Set comparisons, customer behavior, categorical data

```typescript
// Customer purchase patterns (1 = purchased, 0 = not purchased)
const customerPurchases = [1, 0, 1, 1, 0, 1, 0, 0];
const similarCustomers = service.FindNearest(customerPurchases, 10, undefined, 'jaccard');

// Document keyword comparison
const docKeywords = [1, 1, 0, 1, 0]; // Presence/absence of keywords
const similar = service.FindAboveThreshold(docKeywords, 0.5, 'jaccard');
```

**When to use:**
- ✅ Binary/categorical data
- ✅ Set membership comparisons
- ✅ Sparse vectors (many zeros)
- ❌ Continuous numeric features

### Hamming Distance

**Best for:** Error detection, configuration management, A/B testing

```typescript
// Configuration drift detection
const currentConfig = [1, 2, 3, 1, 2, 3];
const configs = service.FindNearest(currentConfig, 5, undefined, 'hamming');

// A/B test variant comparison
const variantA = [1, 0, 1, 1, 0]; // Feature flags
const similar = service.FindSimilar('variantA', 3, undefined, 'hamming');
```

**When to use:**
- ✅ Categorical data comparison
- ✅ Error detection
- ✅ Fixed-length codes
- ❌ Continuous values

## Clustering Algorithms

### K-Means Clustering

Fast algorithm for finding K spherical clusters.

```typescript
// Basic K-Means clustering
const result = service.KMeansCluster(
  3,           // k: number of clusters
  100,         // maxIterations
  'euclidean', // metric
  0.0001      // convergence tolerance
);

// Access results
result.clusters.forEach((members, clusterId) => {
  console.log(`Cluster ${clusterId}: ${members.length} members`);
  const centroid = result.centroids.get(clusterId);
  console.log(`Centroid: ${centroid}`);
});

// Evaluate clustering quality
console.log(`Silhouette Score: ${result.metadata.silhouetteScore}`);
console.log(`Converged in ${result.metadata.iterations} iterations`);
```

#### Finding Optimal K with Elbow Method

```typescript
// Test different k values
const elbowData = service.ElbowMethod(2, 10, 'euclidean');

// Plot or analyze the results
elbowData.forEach((inertia, k) => {
  console.log(`k=${k}: inertia=${inertia.toFixed(2)}`);
});
// Look for the "elbow" where inertia stops decreasing rapidly
```

### DBSCAN Clustering

Density-based clustering that automatically finds clusters and outliers.

```typescript
// DBSCAN with outlier detection
const result = service.DBSCANCluster(
  0.15,        // epsilon: max distance for neighbors (1-similarity)
  3,           // minPoints: minimum cluster size
  'euclidean'  // metric
);

// Process clusters
result.clusters.forEach((members, clusterId) => {
  console.log(`Cluster ${clusterId}: ${members.length} members`);
});

// Handle outliers
if (result.outliers && result.outliers.length > 0) {
  console.log(`Found ${result.outliers.length} outliers:`);
  result.outliers.forEach(key => {
    console.log(`  - ${key}`);
  });
}
```

## Utility Methods

### Evaluate Clustering Quality

```typescript
// After clustering, evaluate the results
const clusterResult = service.KMeansCluster(3);

// 1. Silhouette Score (-1 to 1, higher is better)
const silhouette = service.SilhouetteScore(clusterResult, 'euclidean');
console.log(`Silhouette: ${silhouette.toFixed(3)}`);
// > 0.7: Strong structure
// 0.5-0.7: Reasonable structure
// < 0.5: Weak structure

// 2. Within-cluster distance (lower is better)
const cohesion = service.WithinClusterDistance(clusterResult, 'euclidean');
console.log(`Cohesion: ${cohesion.toFixed(3)}`);

// 3. Between-cluster distance (higher is better)
const separation = service.BetweenClusterDistance(clusterResult, 'euclidean');
console.log(`Separation: ${separation.toFixed(3)}`);
```

### Find Centroids

```typescript
// Calculate centroid of a vector group
const vectors = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
];
const centroid = service.FindCentroid(vectors);
console.log(`Centroid: ${centroid}`); // [4, 5, 6]
```

## Business Use Cases

### Customer Segmentation

```typescript
// Load customer feature vectors
const customers: VectorEntry[] = [
  { 
    key: 'customer1', 
    vector: [purchaseFreq, avgOrderValue, recency, categories],
    metadata: { name: 'John Doe', tier: 'Gold' }
  },
  // ... more customers
];
service.LoadVectors(customers);

// Segment customers into groups
const segments = service.KMeansCluster(5, 100, 'euclidean');

// Analyze each segment
segments.clusters.forEach((members, segmentId) => {
  const centroid = segments.centroids.get(segmentId);
  console.log(`\nSegment ${segmentId}:`);
  console.log(`  Size: ${members.length} customers`);
  console.log(`  Avg Purchase Freq: ${centroid[0].toFixed(2)}`);
  console.log(`  Avg Order Value: ${centroid[1].toFixed(2)}`);
});
```

### Product Recommendations

```typescript
// Using dot product for popularity-weighted recommendations
const userInterests = [0.9, 0.3, 0.7, 0.1, 0.8]; // Interest in categories

// Find products that match interests AND are popular
const recommendations = service.FindNearest(
  userInterests, 
  10, 
  0.6,         // Minimum similarity threshold
  'dotproduct' // Considers both direction and magnitude
);

recommendations.forEach(rec => {
  const product = rec.metadata;
  console.log(`${product.name}: ${(rec.score * 100).toFixed(1)}% match`);
});
```

### Anomaly Detection

```typescript
// Using DBSCAN to find outliers in transaction data
const transactions: VectorEntry[] = transactionData.map(t => ({
  key: t.id,
  vector: [t.amount, t.frequency, t.timeOfDay, t.merchantCategory],
  metadata: t
}));

service.LoadVectors(transactions);

// Find anomalies
const result = service.DBSCANCluster(0.1, 5, 'euclidean');

// Process outliers as potential fraud
if (result.outliers) {
  result.outliers.forEach(transactionId => {
    const transaction = service.GetMetadata(transactionId);
    console.log(`Potential fraud: Transaction ${transactionId}`);
    // Send for review
  });
}
```

### Content Similarity

```typescript
// Find similar documents using cosine similarity
const docEmbedding = await generateEmbedding(documentText);

// Find related content
const similar = service.FindNearest(docEmbedding, 5, 0.7, 'cosine');

// Build recommendation list
const recommendations = similar.map(result => ({
  title: result.metadata.title,
  similarity: `${(result.score * 100).toFixed(1)}%`,
  url: result.metadata.url
}));
```

### Quality Control

```typescript
// Monitor product specifications
const targetSpecs = [10.0, 5.5, 3.2, 98.5]; // Target measurements

// Find products deviating from spec
const allProducts = service.FindAboveThreshold(targetSpecs, 0, 'euclidean');

// Sort by distance from target (ascending)
const deviations = allProducts
  .sort((a, b) => a.score - b.score)
  .slice(0, 10);

deviations.forEach(product => {
  const deviation = (1 - product.score) * 100;
  console.log(`${product.key}: ${deviation.toFixed(2)}% deviation`);
});
```

## API Reference

### Core Methods

#### `LoadVectors(entries: VectorEntry[] | Map<string, number[]>)`
Load vectors into the service.

#### `AddVector(key: string, vector: number[], metadata?: TMetadata)`
Add or update a single vector.

#### `FindNearest(queryVector: number[], topK: number, threshold?: number, metric?: DistanceMetric, filter?: (metadata: TMetadata) => boolean)`
Find K nearest neighbors to a query vector. Optional filter applies before similarity calculation for efficient scoped searches.

#### `FindSimilar(key: string, topK: number, threshold?: number, metric?: DistanceMetric, filter?: (metadata: TMetadata) => boolean)`
Find vectors similar to an existing vector. Optional filter applies before similarity calculation.

#### `FindAboveThreshold(queryVector: number[], threshold: number, metric?: DistanceMetric, filter?: (metadata: TMetadata) => boolean)`
Find all vectors above a similarity threshold. Optional filter applies before similarity calculation.

### Clustering Methods

#### `KMeansCluster(k: number, maxIterations?: number, metric?: DistanceMetric, tolerance?: number)`
Perform K-Means clustering.

#### `DBSCANCluster(epsilon: number, minPoints: number, metric?: DistanceMetric, filter?: (metadata: TMetadata) => boolean)`
Perform DBSCAN clustering. Optional filter applies to pre-filter the vector space before clustering.

#### `ElbowMethod(minK: number, maxK: number, metric?: DistanceMetric)`
Find optimal K using elbow method.

### Utility Methods

#### `SilhouetteScore(clusterResult: ClusterResult, metric?: DistanceMetric)`
Calculate silhouette score for clustering quality.

#### `WithinClusterDistance(clusterResult: ClusterResult, metric?: DistanceMetric)`
Calculate average within-cluster distance.

#### `BetweenClusterDistance(clusterResult: ClusterResult, metric?: DistanceMetric)`
Calculate average between-cluster distance.

#### `FindCentroid(vectors: number[][])`
Calculate the centroid of a vector set.

### Helper Methods

#### `Similarity(key1: string, key2: string)`
Calculate similarity between two stored vectors.

#### `GetVector(key: string)`
Retrieve a vector by key.

#### `GetMetadata(key: string)`
Retrieve metadata for a vector.

#### `RemoveVector(key: string)`
Remove a vector from the service.

#### `Clear()`
Remove all vectors.

#### `Size`
Get the number of vectors stored.

#### `ExpectedDimensions`
Get the expected vector dimensions.

## Performance

### Benchmarks

Based on testing with 1000 vectors of 128 dimensions:

| Operation | Time | Notes |
|-----------|------|-------|
| Load 1000 vectors | < 5ms | One-time operation |
| FindNearest (k=10) | ~1ms | All metrics similar |
| K-Means (k=5) | ~70ms | Includes convergence |
| DBSCAN | ~80ms | Includes neighborhood calc |
| Silhouette Score | ~15ms | For 5 clusters |

### Memory Usage

Approximate memory usage:
- Base overhead: ~1KB
- Per vector: 8 bytes × dimensions + ~100 bytes overhead
- Example: 10,000 vectors × 384 dimensions ≈ 31MB

### Optimization Tips

1. **Batch Operations**: Load vectors in bulk rather than one at a time
2. **Metric Selection**: Cosine is fastest for normalized vectors
3. **Threshold Filtering**: Use thresholds to reduce result set size
4. **Dimension Reduction**: Consider PCA/UMAP for very high dimensions
5. **Clustering**: Start with small K for ElbowMethod, increase gradually

## Best Practices

### 1. Choose the Right Metric

```typescript
// Text/semantic similarity
const textResults = service.FindNearest(embedding, 10, 0.7, 'cosine');

// Physical/numeric features
const productResults = service.FindNearest(features, 10, 0.8, 'euclidean');

// Categorical/binary data
const categoryResults = service.FindNearest(categories, 10, 0.6, 'jaccard');
```

### 2. Validate Dimensions

```typescript
// Service automatically validates dimensions
try {
  service.AddVector('key1', [1, 2, 3]);
  service.AddVector('key2', [4, 5, 6, 7]); // Error! Different dimensions
} catch (error) {
  console.error('Dimension mismatch:', error.message);
}
```

### 3. Use Metadata Effectively

```typescript
interface ProductMetadata {
  name: string;
  category: string;
  price: number;
  inStock: boolean;
}

const service = new SimpleVectorService<ProductMetadata>();

// Now TypeScript knows the metadata structure
const results = service.FindNearest(query, 5);
results.forEach(r => {
  console.log(`${r.metadata.name}: $${r.metadata.price}`);
});
```

### 4. Evaluate Clustering

```typescript
// Always evaluate clustering quality
function evaluateClustering(k: number) {
  const result = service.KMeansCluster(k);
  const score = result.metadata.silhouetteScore;
  
  if (score < 0.25) {
    console.warn('Poor clustering structure');
  } else if (score < 0.5) {
    console.log('Weak clustering structure');
  } else if (score < 0.7) {
    console.log('Reasonable clustering');
  } else {
    console.log('Strong clustering!');
  }
  
  return score;
}

// Try different K values
for (let k = 2; k <= 10; k++) {
  const score = evaluateClustering(k);
  console.log(`k=${k}: score=${score.toFixed(3)}`);
}
```

### 5. Handle Outliers

```typescript
// Use DBSCAN when outliers are expected
const result = service.DBSCANCluster(0.15, 3, 'euclidean');

// Separate processing for outliers
const normalData = [];
const anomalies = [];

result.clusters.forEach((members, id) => {
  normalData.push(...members);
});

if (result.outliers) {
  anomalies.push(...result.outliers);
  // Special handling for anomalies
  console.log(`Found ${anomalies.length} anomalies`);
}
```

## TypeScript Support

Full TypeScript support with generics for metadata:

```typescript
interface DocumentMetadata {
  title: string;
  author: string;
  date: Date;
  tags: string[];
}

const service = new SimpleVectorService<DocumentMetadata>();

// Type-safe metadata access
const results = service.FindNearest(queryVector, 5);
results.forEach(result => {
  // TypeScript knows result.metadata is DocumentMetadata
  console.log(`${result.metadata.title} by ${result.metadata.author}`);
});
```

## Error Handling

```typescript
try {
  // Dimension validation
  service.AddVector('key1', [1, 2, 3]);
  service.AddVector('key2', [4, 5]); // Error: dimension mismatch
} catch (error) {
  console.error('Dimension error:', error.message);
}

try {
  // Invalid parameters
  service.KMeansCluster(0); // Error: invalid k
} catch (error) {
  console.error('Parameter error:', error.message);
}

try {
  // Empty vector set
  service.FindCentroid([]); // Error: empty set
} catch (error) {
  console.error('Empty set error:', error.message);
}
```

## Contributing

This is part of the MemberJunction open-source project. Contributions are welcome!

## License

MIT License - see LICENSE file for details.

## Support

For issues, questions, or contributions, please visit:
https://github.com/MemberJunction/MJ

---

*Part of the MemberJunction AI ecosystem - Enterprise-grade vector operations for modern applications.*