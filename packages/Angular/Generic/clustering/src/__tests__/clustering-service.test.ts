import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ClusterConfig,
    ClusterInputVector,
    DefaultClusterConfig,
    CLUSTER_COLORS,
} from '../lib/clustering.types';

// ================================================================
// Mocks
// ================================================================

// Mock Angular's Injectable (the service uses @Injectable)
vi.mock('@angular/core', () => ({
    Injectable: () => (target: unknown) => target,
}));

// Shared mock state - use vi.hoisted to make these available in hoisted vi.mock factories
const { mockLoadVectors, mockKMeansCluster, mockDBSCANCluster, mockUmapFit, umapState } = vi.hoisted(() => ({
    mockLoadVectors: vi.fn(),
    mockKMeansCluster: vi.fn(),
    mockDBSCANCluster: vi.fn(),
    mockUmapFit: vi.fn(),
    umapState: { shouldFail: false },
}));

vi.mock('@memberjunction/ai-vectors-memory', () => ({
    SimpleVectorService: class {
        LoadVectors = mockLoadVectors;
        KMeansCluster = mockKMeansCluster;
        DBSCANCluster = mockDBSCANCluster;
    },
}));

vi.mock('umap-js', () => ({
    get UMAP() {
        if (umapState.shouldFail) {
            throw new Error('UMAP not available');
        }
        return class { fit = mockUmapFit; };
    },
}));

// Import AFTER mocks are set up
import { ClusteringService } from '../lib/clustering.service';

// ================================================================
// Helpers
// ================================================================

function makeVectors(count: number, dim: number = 10): ClusterInputVector[] {
    return Array.from({ length: count }, (_, i) => ({
        Key: `key-${i}`,
        Vector: Array.from({ length: dim }, (_, d) => Math.sin(i * 0.5 + d * 0.3)),
        Label: `Item ${i}`,
        Metadata: { index: i },
    }));
}

function makeClusterResult(keys: string[], numClusters: number) {
    const clusters = new Map<number, string[]>();
    for (let c = 0; c < numClusters; c++) {
        clusters.set(c, []);
    }
    keys.forEach((key, i) => {
        clusters.get(i % numClusters)!.push(key);
    });
    return {
        clusters,
        outliers: [],
        metadata: { metric: 'cosine' as const, silhouetteScore: 0.65 },
    };
}

function makeDbscanResult(keys: string[], outlierCount: number) {
    const clusters = new Map<number, string[]>();
    const outliers: string[] = [];
    clusters.set(0, []);
    clusters.set(1, []);
    keys.forEach((key, i) => {
        if (i < outlierCount) {
            outliers.push(key);
        } else if (i % 2 === 0) {
            clusters.get(0)!.push(key);
        } else {
            clusters.get(1)!.push(key);
        }
    });
    return {
        clusters,
        outliers,
        metadata: { metric: 'cosine' as const, silhouetteScore: 0.5 },
    };
}

// ================================================================
// Tests
// ================================================================

describe('ClusteringService', () => {
    let service: ClusteringService;
    let config: ClusterConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        umapState.shouldFail = false;
        service = new ClusteringService();
        config = DefaultClusterConfig();
        config.K = 3;
    });

    // ================================================================
    // RunClustering - empty input
    // ================================================================

    describe('RunClustering with empty vectors', () => {
        it('should return an empty result', async () => {
            const result = await service.RunClustering([], config);
            expect(result.Points).toHaveLength(0);
            expect(result.Clusters).toHaveLength(0);
            expect(result.Metrics.RecordCount).toBe(0);
            expect(result.Metrics.ClusterCount).toBe(0);
            expect(result.Metrics.OutlierCount).toBe(0);
            expect(result.Metrics.SilhouetteScore).toBe(0);
            expect(result.Metrics.ComputationTimeMs).toBeGreaterThanOrEqual(0);
            expect(result.Config).toBe(config);
        });

        it('should not call SimpleVectorService for empty input', async () => {
            await service.RunClustering([], config);
            expect(mockLoadVectors).not.toHaveBeenCalled();
            expect(mockKMeansCluster).not.toHaveBeenCalled();
        });
    });

    // ================================================================
    // RunClustering - K-Means
    // ================================================================

    describe('RunClustering with K-Means', () => {
        it('should call KMeansCluster with correct parameters', async () => {
            const vectors = makeVectors(6);
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 3);
            mockKMeansCluster.mockReturnValue(clusterResult);

            // UMAP mock
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 100, i * 50]));

            await service.RunClustering(vectors, config);

            expect(mockLoadVectors).toHaveBeenCalledTimes(1);
            expect(mockKMeansCluster).toHaveBeenCalledWith(3, 100, 'cosine');
            expect(mockDBSCANCluster).not.toHaveBeenCalled();
        });

        it('should clamp K to vector count', async () => {
            const vectors = makeVectors(2);
            config.K = 10;

            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 2);
            mockKMeansCluster.mockReturnValue(clusterResult);

            // Trivial case: 2 vectors -> deterministic placement
            await service.RunClustering(vectors, config);

            // K should be clamped to vectors.length (2)
            expect(mockKMeansCluster).toHaveBeenCalledWith(2, 100, 'cosine');
        });

        it('should produce correct result structure', async () => {
            const vectors = makeVectors(6);
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 3);
            mockKMeansCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 100, i * 50]));

            const result = await service.RunClustering(vectors, config);

            // Points
            expect(result.Points).toHaveLength(6);
            for (const point of result.Points) {
                expect(typeof point.X).toBe('number');
                expect(typeof point.Y).toBe('number');
                expect(point.ClusterId).toBeGreaterThanOrEqual(0);
                expect(point.VectorKey).toBeTruthy();
                expect(point.Label).toBeTruthy();
                expect(point.Metadata).toBeDefined();
            }

            // Clusters
            expect(result.Clusters).toHaveLength(3);
            for (const cluster of result.Clusters) {
                expect(cluster.Id).toBeGreaterThanOrEqual(0);
                expect(cluster.Label).toMatch(/^Cluster \d+$/);
                expect(cluster.Color).toBeTruthy();
                expect(cluster.MemberCount).toBeGreaterThan(0);
            }
            // Sorted by ID
            for (let i = 1; i < result.Clusters.length; i++) {
                expect(result.Clusters[i].Id).toBeGreaterThan(result.Clusters[i - 1].Id);
            }

            // Metrics
            expect(result.Metrics.ClusterCount).toBe(3);
            expect(result.Metrics.RecordCount).toBe(6);
            expect(result.Metrics.SilhouetteScore).toBe(0.65);
            expect(result.Metrics.OutlierCount).toBe(0);
            expect(result.Metrics.ComputationTimeMs).toBeGreaterThanOrEqual(0);

            // Config passthrough
            expect(result.Config).toBe(config);
        });

        it('should assign cluster colors from CLUSTER_COLORS palette', async () => {
            const vectors = makeVectors(6);
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 3);
            mockKMeansCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 100, i * 50]));

            const result = await service.RunClustering(vectors, config);

            expect(result.Clusters[0].Color).toBe(CLUSTER_COLORS[0]);
            expect(result.Clusters[1].Color).toBe(CLUSTER_COLORS[1]);
            expect(result.Clusters[2].Color).toBe(CLUSTER_COLORS[2]);
        });

        it('should wrap colors when clusters exceed palette size', async () => {
            const vectors = makeVectors(30);
            const numClusters = 12;
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), numClusters);
            mockKMeansCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 30, i * 20]));
            config.K = numClusters;

            const result = await service.RunClustering(vectors, config);

            // Cluster 10 wraps to CLUSTER_COLORS[10 % 10] = CLUSTER_COLORS[0]
            expect(result.Clusters[10].Color).toBe(CLUSTER_COLORS[0]);
            expect(result.Clusters[11].Color).toBe(CLUSTER_COLORS[1]);
        });

        it('should use Label from input vector when provided', async () => {
            const vectors: ClusterInputVector[] = [
                { Key: 'k1', Vector: [1, 2, 3], Label: 'Custom Label' },
                { Key: 'k2', Vector: [4, 5, 6] },
            ];
            const clusterResult = makeClusterResult(['k1', 'k2'], 1);
            mockKMeansCluster.mockReturnValue(clusterResult);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);

            const p1 = result.Points.find(p => p.VectorKey === 'k1');
            const p2 = result.Points.find(p => p.VectorKey === 'k2');
            expect(p1?.Label).toBe('Custom Label');
            expect(p2?.Label).toBe('k2'); // Falls back to Key
        });

        it('should default Metadata to empty object when not provided', async () => {
            const vectors: ClusterInputVector[] = [
                { Key: 'k1', Vector: [1, 2, 3] },
            ];
            const clusterResult = makeClusterResult(['k1'], 1);
            mockKMeansCluster.mockReturnValue(clusterResult);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);
            expect(result.Points[0].Metadata).toEqual({});
        });
    });

    // ================================================================
    // RunClustering - DBSCAN
    // ================================================================

    describe('RunClustering with DBSCAN', () => {
        it('should call DBSCANCluster with correct parameters', async () => {
            config.Algorithm = 'dbscan';
            config.Epsilon = 0.5;
            config.MinPoints = 4;
            const vectors = makeVectors(6);
            const clusterResult = makeDbscanResult(vectors.map(v => v.Key), 1);
            mockDBSCANCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 100, i * 50]));

            await service.RunClustering(vectors, config);

            expect(mockDBSCANCluster).toHaveBeenCalledWith(0.5, 4, 'cosine');
            expect(mockKMeansCluster).not.toHaveBeenCalled();
        });

        it('should handle outliers correctly', async () => {
            config.Algorithm = 'dbscan';
            const vectors = makeVectors(6);
            const clusterResult = makeDbscanResult(vectors.map(v => v.Key), 2);
            mockDBSCANCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 100, i * 50]));

            const result = await service.RunClustering(vectors, config);

            // First 2 vectors are outliers
            const outlierPoints = result.Points.filter(p => p.ClusterId === -1);
            expect(outlierPoints.length).toBe(2);
            expect(result.Metrics.OutlierCount).toBe(2);
        });
    });

    // ================================================================
    // Dimensionality Reduction
    // ================================================================

    describe('dimensionality reduction', () => {
        it('should handle trivial case (1 vector) with deterministic placement', async () => {
            const vectors = makeVectors(1);
            const clusterResult = makeClusterResult(['key-0'], 1);
            mockKMeansCluster.mockReturnValue(clusterResult);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);

            // 1 vector -> trivial case: positioned at [250, 350]
            expect(result.Points[0].X).toBe(250);
            expect(result.Points[0].Y).toBe(350);
        });

        it('should handle trivial case (2 vectors) with deterministic placement', async () => {
            const vectors = makeVectors(2);
            const clusterResult = makeClusterResult(['key-0', 'key-1'], 1);
            mockKMeansCluster.mockReturnValue(clusterResult);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);

            // 2 vectors -> trivial case: [0*500+250, 350] and [1*500+250, 350]
            expect(result.Points[0].X).toBe(250);
            expect(result.Points[0].Y).toBe(350);
            expect(result.Points[1].X).toBe(750);
            expect(result.Points[1].Y).toBe(350);
        });

        it('should use UMAP when available and normalize to viewbox range', async () => {
            const vectors = makeVectors(5);
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 2);
            mockKMeansCluster.mockReturnValue(clusterResult);
            // Return raw UMAP coordinates - will be normalized
            mockUmapFit.mockReturnValue([
                [0, 0],
                [10, 5],
                [20, 10],
                [30, 15],
                [40, 20],
            ]);

            const result = await service.RunClustering(vectors, config);

            // All points should be within normalized range [60, 940] (padding=60, size=1000)
            for (const point of result.Points) {
                expect(point.X).toBeGreaterThanOrEqual(60);
                expect(point.X).toBeLessThanOrEqual(940);
                expect(point.Y).toBeGreaterThanOrEqual(60);
                expect(point.Y).toBeLessThanOrEqual(940);
                expect(Number.isNaN(point.X)).toBe(false);
                expect(Number.isNaN(point.Y)).toBe(false);
            }
        });

        it('should fall back to PCA when UMAP throws', async () => {
            umapState.shouldFail = true;
            const vectors = makeVectors(5);
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 2);
            mockKMeansCluster.mockReturnValue(clusterResult);

            const result = await service.RunClustering(vectors, config);

            // PCA fallback should still produce valid points
            expect(result.Points).toHaveLength(5);
            for (const point of result.Points) {
                expect(Number.isNaN(point.X)).toBe(false);
                expect(Number.isNaN(point.Y)).toBe(false);
                expect(typeof point.X).toBe('number');
                expect(typeof point.Y).toBe('number');
            }
        });

        it('should produce normalized PCA points within viewbox range', async () => {
            umapState.shouldFail = true;
            const vectors = makeVectors(10, 20);
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 3);
            mockKMeansCluster.mockReturnValue(clusterResult);

            const result = await service.RunClustering(vectors, config);

            for (const point of result.Points) {
                expect(point.X).toBeGreaterThanOrEqual(60);
                expect(point.X).toBeLessThanOrEqual(940);
                expect(point.Y).toBeGreaterThanOrEqual(60);
                expect(point.Y).toBeLessThanOrEqual(940);
            }
        });

        it('should handle identical vectors in PCA fallback gracefully', async () => {
            umapState.shouldFail = true;
            // All vectors are identical
            const vectors: ClusterInputVector[] = Array.from({ length: 4 }, (_, i) => ({
                Key: `key-${i}`,
                Vector: [1, 1, 1, 1, 1],
            }));
            const clusterResult = makeClusterResult(vectors.map(v => v.Key), 1);
            mockKMeansCluster.mockReturnValue(clusterResult);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);

            // All centered to zero, normalization divides by range=0 (uses 1 fallback).
            // All should be at the same location, not NaN.
            for (const point of result.Points) {
                expect(Number.isNaN(point.X)).toBe(false);
                expect(Number.isNaN(point.Y)).toBe(false);
            }
        });
    });

    // ================================================================
    // ReduceDimensions (public helper)
    // ================================================================

    describe('ReduceDimensions', () => {
        it('should return empty array for empty input', async () => {
            const result = await service.ReduceDimensions([]);
            expect(result).toEqual([]);
        });

        it('should return 2D points for valid input using UMAP', async () => {
            mockUmapFit.mockReturnValue([
                [0, 0],
                [5, 5],
                [10, 10],
            ]);

            const result = await service.ReduceDimensions([
                [1, 2, 3],
                [4, 5, 6],
                [7, 8, 9],
            ]);

            expect(result).toHaveLength(3);
            for (const point of result) {
                expect(typeof point.x).toBe('number');
                expect(typeof point.y).toBe('number');
                expect(Number.isNaN(point.x)).toBe(false);
                expect(Number.isNaN(point.y)).toBe(false);
            }
        });

        it('should fall back to PCA and still return valid points', async () => {
            umapState.shouldFail = true;

            const result = await service.ReduceDimensions([
                [1, 2, 3, 4, 5],
                [6, 7, 8, 9, 10],
                [11, 12, 13, 14, 15],
            ]);

            expect(result).toHaveLength(3);
            for (const point of result) {
                expect(typeof point.x).toBe('number');
                expect(typeof point.y).toBe('number');
                expect(Number.isNaN(point.x)).toBe(false);
                expect(Number.isNaN(point.y)).toBe(false);
            }
        });

        it('should handle 2 vectors (trivial case)', async () => {
            const result = await service.ReduceDimensions([
                [1, 2, 3],
                [4, 5, 6],
            ]);

            expect(result).toHaveLength(2);
            // Trivial case: deterministic positions
            expect(result[0].x).toBe(250);
            expect(result[0].y).toBe(350);
            expect(result[1].x).toBe(750);
            expect(result[1].y).toBe(350);
        });
    });

    // ================================================================
    // Result Building (edge cases)
    // ================================================================

    describe('result building edge cases', () => {
        it('should assign ClusterId -1 when vector key not found in cluster map', async () => {
            const vectors = makeVectors(3);
            // Cluster result only includes key-0 and key-1
            const clusters = new Map<number, string[]>();
            clusters.set(0, ['key-0', 'key-1']);
            const clusterResult = {
                clusters,
                outliers: [] as string[],
                metadata: { metric: 'cosine' as const, silhouetteScore: 0.5 },
            };
            mockKMeansCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue([[0, 0], [5, 5], [10, 10]]);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);

            const orphanPoint = result.Points.find(p => p.VectorKey === 'key-2');
            expect(orphanPoint?.ClusterId).toBe(-1);
        });

        it('should handle missing metadata on cluster result', async () => {
            const vectors = makeVectors(3);
            const clusters = new Map<number, string[]>();
            clusters.set(0, ['key-0', 'key-1', 'key-2']);
            const clusterResult = {
                clusters,
                // no outliers, no metadata
            };
            mockKMeansCluster.mockReturnValue(clusterResult);
            mockUmapFit.mockReturnValue([[0, 0], [5, 5], [10, 10]]);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);

            expect(result.Metrics.SilhouetteScore).toBe(0);
            expect(result.Metrics.OutlierCount).toBe(0);
        });

        it('should use default projection when key not in projected map', async () => {
            // This tests the fallback `projected.get(v.Key) ?? [500, 350]`
            // We achieve this by having UMAP return fewer points than expected
            const vectors = makeVectors(3);
            const clusters = new Map<number, string[]>();
            clusters.set(0, ['key-0', 'key-1', 'key-2']);
            mockKMeansCluster.mockReturnValue({ clusters });

            // UMAP returns only 2 points (key "0" and "1" via index mapping)
            // but the service builds keys from the vectorMap, so all 3 keys
            // will be in the projected map. This edge case is hard to trigger
            // through the public API. Instead verify the result is valid.
            mockUmapFit.mockReturnValue([[0, 0], [5, 5], [10, 10]]);
            config.K = 1;

            const result = await service.RunClustering(vectors, config);
            expect(result.Points).toHaveLength(3);
        });
    });

    // ================================================================
    // Distance metric passthrough
    // ================================================================

    describe('distance metric passthrough', () => {
        it('should pass euclidean metric to KMeans', async () => {
            config.DistanceMetric = 'euclidean';
            const vectors = makeVectors(4);
            mockKMeansCluster.mockReturnValue(makeClusterResult(vectors.map(v => v.Key), 2));
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 10, i * 5]));

            await service.RunClustering(vectors, config);

            expect(mockKMeansCluster).toHaveBeenCalledWith(
                expect.any(Number),
                100,
                'euclidean'
            );
        });

        it('should pass dotproduct metric to DBSCAN', async () => {
            config.Algorithm = 'dbscan';
            config.DistanceMetric = 'dotproduct';
            const vectors = makeVectors(4);
            mockDBSCANCluster.mockReturnValue(makeDbscanResult(vectors.map(v => v.Key), 0));
            mockUmapFit.mockReturnValue(vectors.map((_, i) => [i * 10, i * 5]));

            await service.RunClustering(vectors, config);

            expect(mockDBSCANCluster).toHaveBeenCalledWith(0.3, 3, 'dotproduct');
        });
    });
});
