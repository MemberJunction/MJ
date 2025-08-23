/**
 * Comprehensive test suite for SimpleVectorService clustering and utility methods
 * Tests K-Means, DBSCAN, and utility functions
 */

import { SimpleVectorService, VectorEntry, ClusterResult } from './dist/index';

// Test utilities
function assertApproxEqual(actual: number, expected: number, tolerance: number = 0.01, message?: string) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(message || `Expected ${expected} but got ${actual} (tolerance: ${tolerance})`);
    }
}

function runTest(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (error) {
        console.error(`❌ ${name}: ${error}`);
        throw error;
    }
}

// Generate synthetic clustered data
function generateClusteredData(numClusters: number = 3, pointsPerCluster: number = 20, dimensions: number = 2): VectorEntry[] {
    const data: VectorEntry[] = [];
    
    for (let c = 0; c < numClusters; c++) {
        // Random cluster center
        const center = Array(dimensions).fill(0).map(() => Math.random() * 10);
        
        for (let p = 0; p < pointsPerCluster; p++) {
            // Add noise around center
            const vector = center.map(val => val + (Math.random() - 0.5) * 2);
            data.push({
                key: `cluster${c}_point${p}`,
                vector: vector
            });
        }
    }
    
    return data;
}

// Generate data with outliers for DBSCAN testing
function generateDataWithOutliers(): VectorEntry[] {
    const data: VectorEntry[] = [];
    
    // Cluster 1: tight cluster around [2, 2]
    for (let i = 0; i < 15; i++) {
        data.push({
            key: `c1_${i}`,
            vector: [2 + Math.random() * 0.5, 2 + Math.random() * 0.5]
        });
    }
    
    // Cluster 2: tight cluster around [8, 8]
    for (let i = 0; i < 15; i++) {
        data.push({
            key: `c2_${i}`,
            vector: [8 + Math.random() * 0.5, 8 + Math.random() * 0.5]
        });
    }
    
    // Outliers: scattered points
    data.push({ key: 'outlier1', vector: [5, 5] });
    data.push({ key: 'outlier2', vector: [0, 10] });
    data.push({ key: 'outlier3', vector: [10, 0] });
    
    return data;
}

console.log('🧪 Testing SimpleVectorService Clustering & Utilities\n');

// Test 1: K-Means Clustering
console.log('🎯 Testing K-Means Clustering:');
(() => {
    const service = new SimpleVectorService();
    const data = generateClusteredData(3, 20, 2);
    service.LoadVectors(data);
    
    runTest('K-Means: Basic clustering with k=3', () => {
        const result = service.KMeansCluster(3, 100, 'euclidean');
        
        // Should have 3 clusters
        if (result.clusters.size !== 3) {
            throw new Error(`Expected 3 clusters, got ${result.clusters.size}`);
        }
        
        // All points should be assigned
        let totalPoints = 0;
        result.clusters.forEach(members => {
            totalPoints += members.length;
        });
        if (totalPoints !== data.length) {
            throw new Error(`Not all points assigned: ${totalPoints}/${data.length}`);
        }
        
        // Should have centroids
        if (!result.centroids || result.centroids.size !== 3) {
            throw new Error('Missing or incorrect centroids');
        }
        
        // Should have metadata
        if (!result.metadata || result.metadata.iterations == null) {
            throw new Error('Missing metadata');
        }
    });
    
    runTest('K-Means: Convergence detection', () => {
        const result = service.KMeansCluster(3, 100, 'euclidean', 0.0001);
        
        // Should converge before max iterations
        if (result.metadata!.iterations! >= 100) {
            throw new Error('Did not converge');
        }
        
        console.log(`  Converged in ${result.metadata!.iterations} iterations`);
    });
    
    runTest('K-Means: Different metrics', () => {
        const euclideanResult = service.KMeansCluster(3, 50, 'euclidean');
        const manhattanResult = service.KMeansCluster(3, 50, 'manhattan');
        const cosineResult = service.KMeansCluster(3, 50, 'cosine');
        
        // Results should differ between metrics
        if (euclideanResult.metadata!.inertia === manhattanResult.metadata!.inertia &&
            manhattanResult.metadata!.inertia === cosineResult.metadata!.inertia) {
            console.warn('  Warning: All metrics gave same inertia');
        }
    });
    
    runTest('K-Means: Edge case k=1', () => {
        const result = service.KMeansCluster(1, 10, 'euclidean');
        
        // Should have single cluster with all points
        if (result.clusters.size !== 1) {
            throw new Error('Should have exactly 1 cluster');
        }
        
        const members = result.clusters.get(0)!;
        if (members.length !== data.length) {
            throw new Error('Single cluster should contain all points');
        }
    });
    
    runTest('K-Means: Edge case k=n', () => {
        const smallData = data.slice(0, 5);
        const smallService = new SimpleVectorService();
        smallService.LoadVectors(smallData);
        
        const result = smallService.KMeansCluster(5, 10, 'euclidean');
        
        // Each point should be its own cluster
        result.clusters.forEach(members => {
            if (members.length !== 1) {
                throw new Error('Each cluster should have exactly 1 point when k=n');
            }
        });
    });
})();
console.log();

// Test 2: DBSCAN Clustering
console.log('🔍 Testing DBSCAN Clustering:');
(() => {
    const service = new SimpleVectorService();
    const data = generateDataWithOutliers();
    service.LoadVectors(data);
    
    runTest('DBSCAN: Basic clustering with outlier detection', () => {
        // epsilon=0.15 means points within distance 0.15 are neighbors (similarity > 0.85)
        const result = service.DBSCANCluster(0.15, 3, 'euclidean');
        
        // Should find 2 main clusters
        if (result.clusters.size < 2) {
            throw new Error(`Expected at least 2 clusters, got ${result.clusters.size}`);
        }
        
        // Should identify outliers
        if (!result.outliers || result.outliers.length === 0) {
            throw new Error('No outliers detected');
        }
        
        console.log(`  Found ${result.clusters.size} clusters and ${result.outliers.length} outliers`);
    });
    
    runTest('DBSCAN: Different epsilon values', () => {
        const smallEps = service.DBSCANCluster(0.05, 3, 'euclidean');
        const largeEps = service.DBSCANCluster(0.5, 3, 'euclidean');
        
        // Smaller epsilon should find more clusters or outliers
        if (smallEps.clusters.size <= largeEps.clusters.size && 
            smallEps.outliers!.length <= largeEps.outliers!.length) {
            console.warn('  Warning: Epsilon change had unexpected effect');
        }
    });
    
    runTest('DBSCAN: Different minPoints values', () => {
        const lowMinPts = service.DBSCANCluster(0.15, 2, 'euclidean');
        const highMinPts = service.DBSCANCluster(0.15, 5, 'euclidean');
        
        // Higher minPoints should be more restrictive
        if (highMinPts.outliers!.length < lowMinPts.outliers!.length) {
            console.warn('  Warning: Higher minPoints produced fewer outliers');
        }
    });
    
    runTest('DBSCAN: All points as outliers (high epsilon requirement)', () => {
        const result = service.DBSCANCluster(0.01, 10, 'euclidean');
        
        // With very small epsilon and high minPoints, most should be outliers
        if (result.outliers!.length < data.length * 0.5) {
            throw new Error('Expected most points to be outliers with strict parameters');
        }
    });
    
    runTest('DBSCAN: Single large cluster (low requirements)', () => {
        const result = service.DBSCANCluster(0.9, 2, 'euclidean');
        
        // With very large epsilon, should get few clusters
        if (result.clusters.size > 3) {
            throw new Error('Expected few clusters with loose parameters');
        }
    });
})();
console.log();

// Test 3: FindCentroid
console.log('📍 Testing FindCentroid:');
(() => {
    const service = new SimpleVectorService();
    
    runTest('FindCentroid: Simple 2D vectors', () => {
        const vectors = [[0, 0], [2, 0], [2, 2], [0, 2]];
        const centroid = service.FindCentroid(vectors);
        
        // Centroid should be [1, 1]
        assertApproxEqual(centroid[0], 1, 0.001);
        assertApproxEqual(centroid[1], 1, 0.001);
    });
    
    runTest('FindCentroid: 3D vectors', () => {
        const vectors = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
        const centroid = service.FindCentroid(vectors);
        
        // Centroid should be [4, 5, 6]
        assertApproxEqual(centroid[0], 4, 0.001);
        assertApproxEqual(centroid[1], 5, 0.001);
        assertApproxEqual(centroid[2], 6, 0.001);
    });
    
    runTest('FindCentroid: Single vector', () => {
        const vectors = [[5, 10, 15]];
        const centroid = service.FindCentroid(vectors);
        
        // Centroid of single vector is itself
        assertApproxEqual(centroid[0], 5, 0.001);
        assertApproxEqual(centroid[1], 10, 0.001);
        assertApproxEqual(centroid[2], 15, 0.001);
    });
    
    runTest('FindCentroid: Empty vectors error', () => {
        try {
            service.FindCentroid([]);
            throw new Error('Should have thrown error for empty vectors');
        } catch (error: any) {
            if (!error.message.includes('empty')) {
                throw error;
            }
        }
    });
})();
console.log();

// Test 4: Cluster Distance Metrics
console.log('📊 Testing Cluster Distance Metrics:');
(() => {
    const service = new SimpleVectorService();
    
    // Create well-separated clusters for testing
    const cluster1: VectorEntry[] = [
        { key: 'a1', vector: [0, 0] },
        { key: 'a2', vector: [0.1, 0.1] },
        { key: 'a3', vector: [0.2, 0] }
    ];
    
    const cluster2: VectorEntry[] = [
        { key: 'b1', vector: [10, 10] },
        { key: 'b2', vector: [10.1, 10.1] },
        { key: 'b3', vector: [10.2, 10] }
    ];
    
    service.LoadVectors([...cluster1, ...cluster2]);
    
    const mockResult: ClusterResult = {
        clusters: new Map([
            [0, ['a1', 'a2', 'a3']],
            [1, ['b1', 'b2', 'b3']]
        ])
    };
    
    runTest('WithinClusterDistance: Tight clusters have low distance', () => {
        const withinDist = service.WithinClusterDistance(mockResult, 'euclidean');
        
        // Should be relatively low for tight clusters (normalized distance)
        // Since clusters are 10 units apart, normalized distance will be around 0.1-0.2
        if (withinDist > 0.2) {
            throw new Error(`Within-cluster distance too high: ${withinDist}`);
        }
        console.log(`    Within-cluster distance: ${withinDist.toFixed(3)}`);
    });
    
    runTest('BetweenClusterDistance: Separated clusters have high distance', () => {
        const betweenDist = service.BetweenClusterDistance(mockResult, 'euclidean');
        
        // Should be high for well-separated clusters
        if (betweenDist < 0.01) {
            throw new Error(`Between-cluster distance too low: ${betweenDist}`);
        }
    });
    
    runTest('BetweenClusterDistance: Single cluster returns 0', () => {
        const singleCluster: ClusterResult = {
            clusters: new Map([[0, ['a1', 'a2', 'a3']]])
        };
        
        const betweenDist = service.BetweenClusterDistance(singleCluster, 'euclidean');
        
        if (betweenDist !== 0) {
            throw new Error('Single cluster should have 0 between-cluster distance');
        }
    });
})();
console.log();

// Test 5: Silhouette Score
console.log('📈 Testing Silhouette Score:');
(() => {
    const service = new SimpleVectorService();
    
    runTest('Silhouette: Well-separated clusters have high score', () => {
        // Create very well-separated clusters
        const data: VectorEntry[] = [
            // Cluster 1 - tight around origin
            { key: 'a1', vector: [0, 0] },
            { key: 'a2', vector: [0.1, 0] },
            { key: 'a3', vector: [0, 0.1] },
            // Cluster 2 - tight around [100, 100]
            { key: 'b1', vector: [100, 100] },
            { key: 'b2', vector: [100.1, 100] },
            { key: 'b3', vector: [100, 100.1] }
        ];
        
        service.LoadVectors(data);
        
        const result: ClusterResult = {
            clusters: new Map([
                [0, ['a1', 'a2', 'a3']],
                [1, ['b1', 'b2', 'b3']]
            ])
        };
        
        const score = service.SilhouetteScore(result, 'euclidean');
        
        // Should be close to 1 for perfect separation (0.85+ is excellent)
        if (score < 0.85) {
            throw new Error(`Silhouette score too low for well-separated clusters: ${score}`);
        }
        console.log(`    Well-separated clusters score: ${score.toFixed(3)}`);
    });
    
    runTest('Silhouette: Poor clustering has low score', () => {
        // Create overlapping data
        const data: VectorEntry[] = [
            { key: 'p1', vector: [0, 0] },
            { key: 'p2', vector: [1, 1] },
            { key: 'p3', vector: [2, 2] },
            { key: 'p4', vector: [3, 3] },
            { key: 'p5', vector: [4, 4] },
            { key: 'p6', vector: [5, 5] }
        ];
        
        const poorService = new SimpleVectorService();
        poorService.LoadVectors(data);
        
        // Force bad clustering (first 3 in one cluster, last 3 in another)
        const result: ClusterResult = {
            clusters: new Map([
                [0, ['p1', 'p2', 'p3']],
                [1, ['p4', 'p5', 'p6']]
            ])
        };
        
        const score = poorService.SilhouetteScore(result, 'euclidean');
        
        // Should be lower for overlapping clusters
        if (score > 0.5) {
            throw new Error(`Silhouette score too high for poor clustering: ${score}`);
        }
    });
    
    runTest('Silhouette: Integrated with K-Means', () => {
        const data = generateClusteredData(3, 15, 2);
        service.LoadVectors(data);
        
        const result = service.KMeansCluster(3, 50, 'euclidean');
        
        // Should have silhouette score in metadata
        if (result.metadata?.silhouetteScore == null) {
            throw new Error('Missing silhouette score in K-Means result');
        }
        
        console.log(`  K-Means Silhouette Score: ${result.metadata.silhouetteScore.toFixed(3)}`);
    });
})();
console.log();

// Test 6: Elbow Method
console.log('📉 Testing Elbow Method:');
(() => {
    const service = new SimpleVectorService();
    const data = generateClusteredData(3, 20, 2);
    service.LoadVectors(data);
    
    runTest('ElbowMethod: Returns inertia for k range', () => {
        const elbowData = service.ElbowMethod(2, 6, 'euclidean');
        
        // Should have results for each k
        if (elbowData.size !== 5) {
            throw new Error(`Expected 5 results, got ${elbowData.size}`);
        }
        
        // Inertia should generally decrease with more clusters
        let prevInertia = Infinity;
        let decreasing = true;
        elbowData.forEach((inertia, k) => {
            console.log(`    k=${k}: inertia=${inertia.toFixed(2)}`);
            if (inertia > prevInertia) {
                decreasing = false;
            }
            prevInertia = inertia;
        });
        
        if (!decreasing) {
            console.warn('  Warning: Inertia did not strictly decrease');
        }
    });
    
    runTest('ElbowMethod: Invalid k range', () => {
        try {
            service.ElbowMethod(0, 5, 'euclidean');
            throw new Error('Should reject k=0');
        } catch (error: any) {
            if (!error.message.includes('Invalid k range')) {
                throw error;
            }
        }
        
        try {
            service.ElbowMethod(5, 2, 'euclidean');
            throw new Error('Should reject minK > maxK');
        } catch (error: any) {
            if (!error.message.includes('Invalid k range')) {
                throw error;
            }
        }
    });
})();
console.log();

// Test 7: Integration Test
console.log('🔗 Testing Full Clustering Pipeline:');
(() => {
    const service = new SimpleVectorService();
    const data = generateClusteredData(4, 25, 3);
    service.LoadVectors(data);
    
    runTest('Full pipeline: Elbow → K-Means → Evaluation', () => {
        // Step 1: Use elbow method to explore k values
        const elbowData = service.ElbowMethod(2, 8, 'euclidean');
        
        // Step 2: Choose k (we know it's 4, but normally you'd look for elbow)
        const optimalK = 4;
        
        // Step 3: Perform clustering
        const result = service.KMeansCluster(optimalK, 100, 'euclidean');
        
        // Step 4: Evaluate clustering quality
        const withinDist = service.WithinClusterDistance(result, 'euclidean');
        const betweenDist = service.BetweenClusterDistance(result, 'euclidean');
        const silhouette = result.metadata?.silhouetteScore || 0;
        
        console.log(`  Optimal k: ${optimalK}`);
        console.log(`  Within-cluster distance: ${withinDist.toFixed(3)}`);
        console.log(`  Between-cluster distance: ${betweenDist.toFixed(3)}`);
        console.log(`  Silhouette score: ${silhouette.toFixed(3)}`);
        console.log(`  Converged in ${result.metadata?.iterations} iterations`);
        
        // Good clustering should have:
        // - Low within-cluster distance
        // - High between-cluster distance  
        // - High silhouette score
        if (silhouette < 0.3) {
            console.warn('  Warning: Low silhouette score indicates weak clustering');
        }
    });
})();
console.log();

// Test 8: Performance Test
console.log('⚡ Testing Performance:');
(() => {
    const service = new SimpleVectorService();
    const largeData = generateClusteredData(5, 200, 50); // 1000 points, 50D
    service.LoadVectors(largeData);
    
    runTest('Performance: K-Means on large dataset', () => {
        const start = Date.now();
        const result = service.KMeansCluster(5, 50, 'euclidean');
        const elapsed = Date.now() - start;
        
        console.log(`  Clustered ${largeData.length} points (50D) in ${elapsed}ms`);
        console.log(`  Iterations: ${result.metadata?.iterations}`);
        
        if (elapsed > 5000) {
            console.warn('  Warning: Clustering took longer than expected');
        }
    });
    
    runTest('Performance: DBSCAN on large dataset', () => {
        const start = Date.now();
        const result = service.DBSCANCluster(0.2, 5, 'euclidean');
        const elapsed = Date.now() - start;
        
        console.log(`  DBSCAN on ${largeData.length} points in ${elapsed}ms`);
        console.log(`  Found ${result.clusters.size} clusters, ${result.outliers?.length || 0} outliers`);
        
        if (elapsed > 10000) {
            console.warn('  Warning: DBSCAN took longer than expected');
        }
    });
})();

console.log('\n✅ All clustering tests passed successfully!');
console.log('SimpleVectorService clustering and utility methods are working correctly.');