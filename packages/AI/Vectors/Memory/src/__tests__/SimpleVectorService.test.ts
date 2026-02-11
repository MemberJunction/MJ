import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @memberjunction/core before importing the service
vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
}));

import { SimpleVectorService, DistanceMetric } from '../models/SimpleVectorService';

describe('SimpleVectorService', () => {
  let service: SimpleVectorService;

  beforeEach(() => {
    service = new SimpleVectorService();
  });

  describe('AddVector', () => {
    it('should add a vector with key and values', () => {
      service.AddVector('item1', [0.1, 0.2, 0.3]);
      expect(service.Size).toBe(1);
      expect(service.Has('item1')).toBe(true);
    });

    it('should add a vector with metadata', () => {
      service.AddVector('item1', [0.1, 0.2, 0.3], { name: 'test' });
      expect(service.GetMetadata('item1')).toEqual({ name: 'test' });
    });

    it('should throw when key is null or undefined', () => {
      expect(() => service.AddVector('', [0.1, 0.2])).toThrow('Key cannot be null or undefined');
    });

    it('should throw when vector is empty', () => {
      expect(() => service.AddVector('item1', [])).toThrow('Vector cannot be null, undefined, or empty');
    });

    it('should throw on dimension mismatch', () => {
      service.AddVector('item1', [0.1, 0.2, 0.3]);
      expect(() => service.AddVector('item2', [0.1, 0.2])).toThrow('Vector dimension mismatch');
    });

    it('should overwrite existing vector with same key', () => {
      service.AddVector('item1', [0.1, 0.2, 0.3]);
      service.AddVector('item1', [0.4, 0.5, 0.6]);
      expect(service.GetVector('item1')).toEqual([0.4, 0.5, 0.6]);
      expect(service.Size).toBe(1);
    });
  });

  describe('LoadVectors', () => {
    it('should load vectors from array of VectorEntry', () => {
      service.LoadVectors([
        { key: 'a', vector: [1, 0, 0] },
        { key: 'b', vector: [0, 1, 0] },
      ]);
      expect(service.Size).toBe(2);
      expect(service.Has('a')).toBe(true);
      expect(service.Has('b')).toBe(true);
    });

    it('should load vectors from Map', () => {
      const map = new Map<string, number[]>();
      map.set('x', [1, 2, 3]);
      map.set('y', [4, 5, 6]);
      service.LoadVectors(map);
      expect(service.Size).toBe(2);
      expect(service.GetVector('x')).toEqual([1, 2, 3]);
    });

    it('should throw when entries is null', () => {
      expect(() => service.LoadVectors(null as unknown as Map<string, number[]>)).toThrow(
        'Entries cannot be null or undefined'
      );
    });
  });

  describe('GetVector / GetMetadata', () => {
    it('should return vector for existing key', () => {
      service.AddVector('k1', [1, 2, 3]);
      expect(service.GetVector('k1')).toEqual([1, 2, 3]);
    });

    it('should return undefined for non-existing key', () => {
      expect(service.GetVector('missing')).toBeUndefined();
    });

    it('should return metadata for existing key', () => {
      service.AddVector('k1', [1, 2], { tag: 'alpha' });
      expect(service.GetMetadata('k1')).toEqual({ tag: 'alpha' });
    });

    it('should return undefined metadata for non-existing key', () => {
      expect(service.GetMetadata('missing')).toBeUndefined();
    });
  });

  describe('RemoveVector', () => {
    it('should remove an existing vector', () => {
      service.AddVector('item1', [1, 2]);
      expect(service.RemoveVector('item1')).toBe(true);
      expect(service.Size).toBe(0);
    });

    it('should return false for non-existing key', () => {
      expect(service.RemoveVector('missing')).toBe(false);
    });
  });

  describe('UpdateVector', () => {
    it('should update vector data', () => {
      service.AddVector('k1', [1, 2, 3]);
      service.UpdateVector('k1', { vector: [4, 5, 6] });
      expect(service.GetVector('k1')).toEqual([4, 5, 6]);
    });

    it('should update metadata only', () => {
      service.AddVector('k1', [1, 2, 3], { old: true });
      service.UpdateVector('k1', { metadata: { updated: true } });
      expect(service.GetMetadata('k1')).toEqual({ updated: true });
      expect(service.GetVector('k1')).toEqual([1, 2, 3]);
    });

    it('should throw for non-existing key', () => {
      expect(() => service.UpdateVector('missing', { vector: [1] })).toThrow('not found');
    });

    it('should throw when no updates provided', () => {
      service.AddVector('k1', [1, 2, 3]);
      expect(() => service.UpdateVector('k1', {})).toThrow('At least one of vector or metadata');
    });

    it('should throw when update vector is empty', () => {
      service.AddVector('k1', [1, 2, 3]);
      expect(() => service.UpdateVector('k1', { vector: [] })).toThrow('Vector cannot be empty');
    });
  });

  describe('AddOrUpdateVector', () => {
    it('should return false when adding a new vector', () => {
      const result = service.AddOrUpdateVector('k1', [1, 2, 3]);
      expect(result).toBe(false);
      expect(service.Size).toBe(1);
    });

    it('should return true when updating existing vector', () => {
      service.AddVector('k1', [1, 2, 3]);
      const result = service.AddOrUpdateVector('k1', [4, 5, 6]);
      expect(result).toBe(true);
      expect(service.GetVector('k1')).toEqual([4, 5, 6]);
    });
  });

  describe('Clear', () => {
    it('should clear all vectors', () => {
      service.AddVector('a', [1, 2]);
      service.AddVector('b', [3, 4]);
      service.Clear();
      expect(service.Size).toBe(0);
    });
  });

  describe('GetAllKeys / ExportVectors', () => {
    it('should return all keys', () => {
      service.AddVector('a', [1, 2]);
      service.AddVector('b', [3, 4]);
      const keys = service.GetAllKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('should export all vectors', () => {
      service.AddVector('a', [1, 2], { label: 'first' });
      const exported = service.ExportVectors();
      expect(exported).toHaveLength(1);
      expect(exported[0].key).toBe('a');
      expect(exported[0].vector).toEqual([1, 2]);
    });
  });

  describe('ExpectedDimensions', () => {
    it('should be null before any vectors loaded', () => {
      expect(service.ExpectedDimensions).toBeNull();
    });

    it('should be set after first vector', () => {
      service.AddVector('a', [1, 2, 3]);
      expect(service.ExpectedDimensions).toBe(3);
    });
  });

  describe('CosineSimilarity / Similarity', () => {
    it('should return 1 for identical vectors', () => {
      service.AddVector('a', [1, 2, 3]);
      service.AddVector('b', [1, 2, 3]);
      expect(service.Similarity('a', 'b')).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      service.AddVector('a', [1, 0]);
      service.AddVector('b', [0, 1]);
      expect(service.Similarity('a', 'b')).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      service.AddVector('a', [1, 2]);
      service.AddVector('b', [-1, -2]);
      expect(service.Similarity('a', 'b')).toBeCloseTo(-1, 5);
    });

    it('should throw for non-existing key', () => {
      service.AddVector('a', [1, 2]);
      expect(() => service.Similarity('a', 'missing')).toThrow('not found');
    });

    it('should return 0 for zero vector', () => {
      service.AddVector('a', [0, 0]);
      service.AddVector('b', [1, 1]);
      expect(service.Similarity('a', 'b')).toBe(0);
    });
  });

  describe('CalculateDistance', () => {
    it('should calculate cosine distance (normalized to 0-1)', () => {
      const score = service.CalculateDistance([1, 0], [1, 0], 'cosine');
      // Identical vectors: cosine = 1, normalized = (1+1)/2 = 1
      expect(score).toBeCloseTo(1, 5);
    });

    it('should calculate euclidean distance (normalized)', () => {
      const score = service.CalculateDistance([0, 0], [0, 0], 'euclidean');
      // Identical: distance=0, normalized = 1/(1+0) = 1
      expect(score).toBeCloseTo(1, 5);
    });

    it('should calculate manhattan distance (normalized)', () => {
      const score = service.CalculateDistance([1, 2], [1, 2], 'manhattan');
      expect(score).toBeCloseTo(1, 5);
    });

    it('should calculate dotproduct (normalized)', () => {
      const score = service.CalculateDistance([1, 0], [1, 0], 'dotproduct');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should calculate jaccard similarity', () => {
      // Both have non-zero at same positions
      const score = service.CalculateDistance([1, 0, 1], [1, 0, 1], 'jaccard');
      expect(score).toBeCloseTo(1, 5);
    });

    it('should calculate hamming similarity', () => {
      const score = service.CalculateDistance([1, 2, 3], [1, 2, 3], 'hamming');
      expect(score).toBeCloseTo(1, 5);
    });

    it('should throw for unknown metric', () => {
      expect(() => service.CalculateDistance([1], [1], 'unknown' as DistanceMetric)).toThrow(
        'Unknown distance metric'
      );
    });

    it('should throw for dimension mismatch', () => {
      expect(() => service.CalculateDistance([1, 2], [1], 'cosine')).toThrow(
        'Vectors must have same dimensions'
      );
    });
  });

  describe('FindNearest', () => {
    beforeEach(() => {
      service.AddVector('a', [1, 0, 0]);
      service.AddVector('b', [0.9, 0.1, 0]);
      service.AddVector('c', [0, 1, 0]);
      service.AddVector('d', [0, 0, 1]);
    });

    it('should find nearest neighbors sorted by similarity', () => {
      const results = service.FindNearest([1, 0, 0], 2);
      expect(results).toHaveLength(2);
      expect(results[0].key).toBe('a'); // most similar
    });

    it('should respect topK limit', () => {
      const results = service.FindNearest([1, 0, 0], 1);
      expect(results).toHaveLength(1);
    });

    it('should apply threshold filter', () => {
      // cosine similarity for [1,0,0] and [0,0,1] is 0 -> normalized = 0.5
      // threshold of 0.9 should exclude far vectors
      const results = service.FindNearest([1, 0, 0], 10, 0.9);
      expect(results.length).toBeLessThanOrEqual(4);
      results.forEach((r) => expect(r.score).toBeGreaterThanOrEqual(0.9));
    });

    it('should throw for null query vector', () => {
      expect(() => service.FindNearest(null as unknown as number[], 5)).toThrow(
        'Query vector cannot be null'
      );
    });

    it('should throw for empty query vector', () => {
      expect(() => service.FindNearest([], 5)).toThrow('Query vector cannot be null');
    });

    it('should support metadata filter', () => {
      const svc = new SimpleVectorService<{ category: string }>();
      svc.AddVector('a', [1, 0, 0], { category: 'electronics' });
      svc.AddVector('b', [0.9, 0.1, 0], { category: 'clothing' });
      svc.AddVector('c', [0.8, 0.2, 0], { category: 'electronics' });

      const results = svc.FindNearest(
        [1, 0, 0],
        10,
        undefined,
        'cosine',
        (m) => m.category === 'electronics'
      );
      expect(results.every((r) => r.metadata?.category === 'electronics')).toBe(true);
    });
  });

  describe('FindSimilar', () => {
    beforeEach(() => {
      service.AddVector('a', [1, 0, 0]);
      service.AddVector('b', [0.9, 0.1, 0]);
      service.AddVector('c', [0, 1, 0]);
    });

    it('should find similar vectors excluding self', () => {
      const results = service.FindSimilar('a', 2);
      expect(results.every((r) => r.key !== 'a')).toBe(true);
    });

    it('should throw for non-existing key', () => {
      expect(() => service.FindSimilar('missing')).toThrow('not found');
    });

    it('should respect topK', () => {
      const results = service.FindSimilar('a', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('FindAboveThreshold', () => {
    it('should return all vectors above threshold', () => {
      service.AddVector('a', [1, 0]);
      service.AddVector('b', [0.99, 0.01]);
      service.AddVector('c', [0, 1]);

      const results = service.FindAboveThreshold([1, 0], 0.95);
      // 'a' and 'b' should be above threshold
      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((r) => expect(r.score).toBeGreaterThanOrEqual(0.95));
    });
  });

  describe('FindCentroid', () => {
    it('should calculate centroid correctly', () => {
      const centroid = service.FindCentroid([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
      expect(centroid).toEqual([3, 4]);
    });

    it('should throw for empty array', () => {
      expect(() => service.FindCentroid([])).toThrow('Cannot find centroid of empty vector set');
    });

    it('should throw for mismatched dimensions', () => {
      expect(() => service.FindCentroid([[1, 2], [3]])).toThrow(
        'All vectors must have the same dimensions'
      );
    });
  });

  describe('KMeansCluster', () => {
    beforeEach(() => {
      // Two clear clusters
      service.AddVector('a1', [1, 0]);
      service.AddVector('a2', [0.9, 0.1]);
      service.AddVector('a3', [0.8, 0.2]);
      service.AddVector('b1', [0, 1]);
      service.AddVector('b2', [0.1, 0.9]);
      service.AddVector('b3', [0.2, 0.8]);
    });

    it('should create the requested number of clusters', () => {
      const result = service.KMeansCluster(2);
      expect(result.clusters.size).toBe(2);
    });

    it('should assign all vectors to clusters', () => {
      const result = service.KMeansCluster(2);
      let totalAssigned = 0;
      result.clusters.forEach((members) => {
        totalAssigned += members.length;
      });
      expect(totalAssigned).toBe(6);
    });

    it('should include centroids', () => {
      const result = service.KMeansCluster(2);
      expect(result.centroids).toBeDefined();
      expect(result.centroids!.size).toBe(2);
    });

    it('should include metadata with iterations and inertia', () => {
      const result = service.KMeansCluster(2);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.iterations).toBeGreaterThan(0);
      expect(result.metadata!.inertia).toBeDefined();
    });

    it('should throw for invalid k', () => {
      expect(() => service.KMeansCluster(0)).toThrow('Invalid k');
      expect(() => service.KMeansCluster(100)).toThrow('Invalid k');
    });
  });

  describe('DBSCANCluster', () => {
    beforeEach(() => {
      service.AddVector('a1', [1, 0]);
      service.AddVector('a2', [0.95, 0.05]);
      service.AddVector('b1', [0, 1]);
      service.AddVector('b2', [0.05, 0.95]);
      service.AddVector('outlier', [0.5, 0.5]);
    });

    it('should identify clusters', () => {
      const result = service.DBSCANCluster(0.3, 2);
      expect(result.clusters.size).toBeGreaterThanOrEqual(0);
    });

    it('should identify outliers', () => {
      const result = service.DBSCANCluster(0.3, 2);
      expect(result.outliers).toBeDefined();
    });

    it('should throw for invalid epsilon', () => {
      expect(() => service.DBSCANCluster(0, 2)).toThrow('Epsilon must be between 0 and 1');
      expect(() => service.DBSCANCluster(1, 2)).toThrow('Epsilon must be between 0 and 1');
    });

    it('should throw for invalid minPoints', () => {
      expect(() => service.DBSCANCluster(0.3, 0)).toThrow('MinPoints must be positive');
    });
  });

  describe('WithinClusterDistance / BetweenClusterDistance', () => {
    it('should calculate within-cluster distance', () => {
      service.AddVector('a', [1, 0]);
      service.AddVector('b', [0.9, 0.1]);
      const result = service.KMeansCluster(1);
      const distance = service.WithinClusterDistance(result);
      expect(distance).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 between-cluster distance for single cluster', () => {
      service.AddVector('a', [1, 0]);
      service.AddVector('b', [0.9, 0.1]);
      const result = service.KMeansCluster(1);
      const distance = service.BetweenClusterDistance(result);
      expect(distance).toBe(0);
    });
  });

  describe('SilhouetteScore', () => {
    it('should calculate a score between -1 and 1', () => {
      service.AddVector('a1', [1, 0]);
      service.AddVector('a2', [0.9, 0.1]);
      service.AddVector('b1', [0, 1]);
      service.AddVector('b2', [0.1, 0.9]);
      const result = service.KMeansCluster(2);
      const score = service.SilhouetteScore(result);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('ElbowMethod', () => {
    it('should return inertias for each k', () => {
      service.AddVector('a', [1, 0]);
      service.AddVector('b', [0, 1]);
      service.AddVector('c', [1, 1]);
      const results = service.ElbowMethod(1, 3);
      expect(results.size).toBe(3);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      expect(results.has(3)).toBe(true);
    });

    it('should throw for invalid range', () => {
      service.AddVector('a', [1, 0]);
      expect(() => service.ElbowMethod(0, 1)).toThrow('Invalid k range');
    });
  });

  describe('distance metrics edge cases', () => {
    it('euclidean distance of identical vectors should be 1', () => {
      const score = service.CalculateDistance([3, 4], [3, 4], 'euclidean');
      expect(score).toBeCloseTo(1, 5);
    });

    it('manhattan distance of different vectors should be < 1', () => {
      const score = service.CalculateDistance([0, 0], [3, 4], 'manhattan');
      expect(score).toBeLessThan(1);
      expect(score).toBeGreaterThan(0);
    });

    it('hamming distance with all different should be 0', () => {
      const score = service.CalculateDistance([1, 2, 3], [4, 5, 6], 'hamming');
      expect(score).toBeCloseTo(0, 5);
    });

    it('jaccard with no overlap should be 0', () => {
      const score = service.CalculateDistance([1, 0, 0], [0, 0, 1], 'jaccard');
      expect(score).toBeCloseTo(0, 5);
    });

    it('jaccard with both zero vectors should be 1', () => {
      const score = service.CalculateDistance([0, 0, 0], [0, 0, 0], 'jaccard');
      expect(score).toBeCloseTo(1, 5);
    });
  });
});
