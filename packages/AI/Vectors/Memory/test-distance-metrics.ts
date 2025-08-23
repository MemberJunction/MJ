/**
 * Comprehensive test suite for SimpleVectorService distance metrics
 * Tests all 6 distance metrics with various scenarios
 */

import { SimpleVectorService, VectorEntry, DistanceMetric } from './src/index';

// Test utilities
function assertApproxEqual(actual: number, expected: number, tolerance: number = 0.0001, message?: string) {
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

// Test data
const testVectors: VectorEntry[] = [
    { key: 'identical', vector: [1, 2, 3, 4] },
    { key: 'scaled2x', vector: [2, 4, 6, 8] },
    { key: 'opposite', vector: [-1, -2, -3, -4] },
    { key: 'orthogonal', vector: [4, -3, 2, -1] },
    { key: 'similar', vector: [1.1, 2.1, 2.9, 4.1] },
    { key: 'different', vector: [5, 1, 7, 2] },  // Actually different direction, not just scaled
];

const binaryVectors: VectorEntry[] = [
    { key: 'binary1', vector: [1, 0, 1, 1, 0, 1, 0, 0] },
    { key: 'binary2', vector: [1, 1, 1, 0, 0, 1, 0, 0] },
    { key: 'binary3', vector: [0, 0, 0, 1, 1, 0, 1, 1] },
    { key: 'binary4', vector: [1, 0, 1, 1, 0, 1, 0, 0] }, // Same as binary1
];

const sparseVectors: VectorEntry[] = [
    { key: 'sparse1', vector: [0, 5, 0, 0, 3, 0, 0, 2] },
    { key: 'sparse2', vector: [0, 4, 0, 0, 0, 0, 0, 1] },
    { key: 'sparse3', vector: [1, 0, 0, 0, 3, 0, 7, 0] },
    { key: 'sparse4', vector: [0, 0, 0, 0, 0, 0, 0, 0] }, // All zeros
];

console.log('🧪 Testing SimpleVectorService Distance Metrics\n');

// Test 1: Cosine Similarity
console.log('📐 Testing Cosine Similarity:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(testVectors);
    
    runTest('Cosine: Identical vectors = 1', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [1, 2, 3, 4], 'cosine');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Cosine: Scaled vectors = 1 (direction same)', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [2, 4, 6, 8], 'cosine');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Cosine: Opposite vectors = 0', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [-1, -2, -3, -4], 'cosine');
        assertApproxEqual(score, 0.0);
    });
    
    runTest('Cosine: Orthogonal vectors ≈ 0.5', () => {
        const score = service.CalculateDistance([1, 0], [0, 1], 'cosine');
        assertApproxEqual(score, 0.5);
    });
    
    runTest('Cosine: FindNearest works with default metric', () => {
        const results = service.FindNearest([1, 2, 3, 4], 3);
        if (results[0].key !== 'identical') throw new Error('Expected identical as nearest');
        if (results[1].key !== 'scaled2x') throw new Error('Expected scaled2x as second');
    });
})();
console.log();

// Test 2: Euclidean Distance
console.log('📏 Testing Euclidean Distance:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(testVectors);
    
    runTest('Euclidean: Identical vectors = 1', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [1, 2, 3, 4], 'euclidean');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Euclidean: Small distance gives high score', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [1.1, 2.1, 2.9, 4.1], 'euclidean');
        // Distance = sqrt(0.01 + 0.01 + 0.01 + 0.01) = 0.2
        // Score = 1/(1 + 0.2) = 0.833...
        assertApproxEqual(score, 1 / (1 + 0.2), 0.001);
    });
    
    runTest('Euclidean: Large distance gives low score', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [10, 20, 30, 40], 'euclidean');
        // Much larger distance, score should be close to 0
        if (score >= 0.1) throw new Error(`Score too high: ${score}`);
    });
    
    runTest('Euclidean: FindNearest with metric parameter', () => {
        const results = service.FindNearest([1, 2, 3, 4], 3, undefined, 'euclidean');
        if (results[0].key !== 'identical') throw new Error('Expected identical as nearest');
        if (results[1].key !== 'similar') throw new Error('Expected similar as second');
    });
})();
console.log();

// Test 3: Manhattan Distance
console.log('🏙️ Testing Manhattan Distance:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(testVectors);
    
    runTest('Manhattan: Identical vectors = 1', () => {
        const score = service.CalculateDistance([1, 2, 3, 4], [1, 2, 3, 4], 'manhattan');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Manhattan: Unit differences', () => {
        const score = service.CalculateDistance([0, 0], [1, 1], 'manhattan');
        // Distance = |1-0| + |1-0| = 2
        // Score = 1/(1 + 2) = 0.333...
        assertApproxEqual(score, 1/3, 0.001);
    });
    
    runTest('Manhattan: Robust to outliers', () => {
        const score1 = service.CalculateDistance([1, 1, 1], [2, 2, 2], 'manhattan');
        const score2 = service.CalculateDistance([1, 1, 1], [2, 2, 10], 'manhattan');
        // Manhattan is more robust to outliers than Euclidean
        // score2 should still be reasonable despite the outlier
        if (score2 < 0.05) throw new Error('Manhattan should be robust to outliers');
    });
})();
console.log();

// Test 4: Dot Product
console.log('⚡ Testing Dot Product:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(testVectors);
    
    runTest('Dot Product: Aligned with magnitude', () => {
        const score = service.CalculateDistance([1, 1], [2, 2], 'dotproduct');
        // Both direction and magnitude align
        if (score < 0.5) throw new Error('Expected high score for aligned vectors');
    });
    
    runTest('Dot Product: Orthogonal ≈ 0.5', () => {
        const score = service.CalculateDistance([1, 0], [0, 1], 'dotproduct');
        // Dot product = 0, tanh(0) = 0, normalized = 0.5
        assertApproxEqual(score, 0.5, 0.1);
    });
    
    runTest('Dot Product: Opposite directions < 0.5', () => {
        const score = service.CalculateDistance([1, 1], [-1, -1], 'dotproduct');
        if (score >= 0.5) throw new Error('Expected low score for opposite vectors');
    });
})();
console.log();

// Test 5: Jaccard Similarity
console.log('🔗 Testing Jaccard Similarity:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(sparseVectors);
    
    runTest('Jaccard: Identical sets = 1', () => {
        const score = service.CalculateDistance([1, 0, 1, 0], [1, 0, 1, 0], 'jaccard');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Jaccard: No overlap = 0', () => {
        const score = service.CalculateDistance([1, 1, 0, 0], [0, 0, 1, 1], 'jaccard');
        assertApproxEqual(score, 0.0);
    });
    
    runTest('Jaccard: Partial overlap', () => {
        const score = service.CalculateDistance([1, 1, 0, 0], [1, 0, 1, 0], 'jaccard');
        // Intersection = 1 (first position), Union = 3 (positions 0, 1, 2)
        // Score = 1/3 = 0.333...
        assertApproxEqual(score, 1/3, 0.001);
    });
    
    runTest('Jaccard: Empty sets = 1', () => {
        const score = service.CalculateDistance([0, 0, 0], [0, 0, 0], 'jaccard');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Jaccard: Sparse vectors', () => {
        const results = service.FindNearest([0, 5, 0, 0, 3, 0, 0, 2], 3, undefined, 'jaccard');
        if (results[0].key !== 'sparse1') throw new Error('Expected sparse1 as nearest');
    });
})();
console.log();

// Test 6: Hamming Distance
console.log('🔢 Testing Hamming Distance:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(binaryVectors);
    
    runTest('Hamming: Identical vectors = 1', () => {
        const score = service.CalculateDistance([1, 0, 1], [1, 0, 1], 'hamming');
        assertApproxEqual(score, 1.0);
    });
    
    runTest('Hamming: Complete difference = 0', () => {
        const score = service.CalculateDistance([1, 1, 1], [0, 0, 0], 'hamming');
        assertApproxEqual(score, 0.0);
    });
    
    runTest('Hamming: One difference', () => {
        const score = service.CalculateDistance([1, 0, 1, 0], [1, 0, 0, 0], 'hamming');
        // 1 difference out of 4 positions = 3/4 = 0.75
        assertApproxEqual(score, 0.75);
    });
    
    runTest('Hamming: FindNearest for binary data', () => {
        const results = service.FindNearest([1, 0, 1, 1, 0, 1, 0, 0], 3, undefined, 'hamming');
        if (results[0].key !== 'binary1' && results[0].key !== 'binary4') {
            throw new Error('Expected binary1 or binary4 as nearest');
        }
    });
})();
console.log();

// Test 7: Dimension Validation
console.log('📊 Testing Dimension Validation:');
(() => {
    const service = new SimpleVectorService();
    
    runTest('Dimension validation: First vector sets dimensions', () => {
        service.AddVector('first', [1, 2, 3]);
        if (service.ExpectedDimensions !== 3) {
            throw new Error('Expected dimensions to be 3');
        }
    });
    
    runTest('Dimension validation: Reject mismatched dimensions', () => {
        try {
            service.AddVector('second', [1, 2, 3, 4]);
            throw new Error('Should have thrown dimension mismatch error');
        } catch (error: any) {
            if (!error.message.includes('dimension mismatch')) {
                throw error;
            }
        }
    });
    
    runTest('Dimension validation: Accept matching dimensions', () => {
        service.AddVector('third', [4, 5, 6]);
        if (service.Size !== 2) {
            throw new Error('Should have 2 vectors');
        }
    });
})();
console.log();

// Test 8: Threshold Filtering
console.log('🎯 Testing Threshold Filtering:');
(() => {
    const service = new SimpleVectorService();
    service.LoadVectors(testVectors);
    
    runTest('Threshold: High threshold returns fewer results', () => {
        const results = service.FindNearest([1, 2, 3, 4], 10, 0.95, 'cosine');
        // With 0.95 threshold, should get identical, scaled2x, and similar vectors only
        if (results.length > 4) {
            throw new Error(`High threshold should filter most results, got ${results.length}`);
        }
        // Verify all results are above threshold
        results.forEach(r => {
            if (r.score < 0.95) {
                throw new Error(`Result ${r.key} has score ${r.score} below threshold`);
            }
        });
    });
    
    runTest('Threshold: FindAboveThreshold returns all matching', () => {
        const results = service.FindAboveThreshold([1, 2, 3, 4], 0.8, 'cosine');
        results.forEach(r => {
            if (r.score < 0.8) {
                throw new Error(`Score ${r.score} below threshold`);
            }
        });
    });
    
    runTest('Threshold: Works with different metrics', () => {
        const euclideanResults = service.FindAboveThreshold([1, 2, 3, 4], 0.5, 'euclidean');
        const manhattanResults = service.FindAboveThreshold([1, 2, 3, 4], 0.5, 'manhattan');
        // Different metrics should give different results
        if (euclideanResults.length === manhattanResults.length && 
            euclideanResults.every((r, i) => r.key === manhattanResults[i].key)) {
            console.warn('Warning: Different metrics gave identical results');
        }
    });
})();
console.log();

// Test 9: Edge Cases
console.log('🔧 Testing Edge Cases:');
(() => {
    const service = new SimpleVectorService();
    
    runTest('Edge case: Empty service', () => {
        if (service.Size !== 0) throw new Error('Service should start empty');
    });
    
    runTest('Edge case: Single vector similarity to self', () => {
        service.AddVector('single', [1, 2, 3]);
        const similar = service.FindSimilar('single', 5);
        if (similar.length !== 0) {
            throw new Error('Should return empty array when only one vector exists');
        }
    });
    
    runTest('Edge case: Zero vectors', () => {
        service.Clear();
        service.AddVector('zero1', [0, 0, 0]);
        service.AddVector('zero2', [0, 0, 0]);
        const score = service.Similarity('zero1', 'zero2');
        // Cosine similarity of zero vectors should handle gracefully
        if (isNaN(score)) {
            throw new Error('Should handle zero vectors gracefully');
        }
    });
    
    runTest('Edge case: Very high dimensional vectors', () => {
        // Create a new service for high dimensional test
        const highDimService = new SimpleVectorService();
        const highDim1 = new Array(1000).fill(0).map(() => Math.random());
        const highDim2 = new Array(1000).fill(0).map(() => Math.random());
        highDimService.AddVector('high1', highDim1);
        highDimService.AddVector('high2', highDim2);
        const score = highDimService.Similarity('high1', 'high2');
        if (isNaN(score) || score < 0 || score > 1) {
            throw new Error('Should handle high dimensional vectors');
        }
    });
})();
console.log();

// Test 10: Performance with various metrics
console.log('⚡ Testing Performance:');
(() => {
    const service = new SimpleVectorService();
    const numVectors = 1000;
    const dimensions = 128;
    
    // Generate random vectors
    const vectors: VectorEntry[] = [];
    for (let i = 0; i < numVectors; i++) {
        vectors.push({
            key: `vec${i}`,
            vector: new Array(dimensions).fill(0).map(() => Math.random())
        });
    }
    
    service.LoadVectors(vectors);
    const queryVector = new Array(dimensions).fill(0).map(() => Math.random());
    
    const metrics: DistanceMetric[] = ['cosine', 'euclidean', 'manhattan', 'dotproduct', 'jaccard', 'hamming'];
    
    metrics.forEach(metric => {
        const start = Date.now();
        const results = service.FindNearest(queryVector, 10, undefined, metric);
        const elapsed = Date.now() - start;
        console.log(`  ${metric}: ${elapsed}ms for ${numVectors} vectors (${dimensions}D)`);
        
        if (results.length !== 10) {
            throw new Error(`Expected 10 results, got ${results.length}`);
        }
    });
})();

console.log('\n✅ All tests passed successfully!');
console.log('SimpleVectorService distance metrics are working correctly.');