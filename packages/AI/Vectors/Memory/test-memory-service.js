// Test script for SimpleVectorService in ai-vectors-memory package
const { SimpleVectorService } = require('./dist/index');

function testMemoryVectorService() {
    console.log('Testing @memberjunction/ai-vectors-memory package...\n');
    
    // Create service instance
    const service = new SimpleVectorService();
    
    // Test 1: LoadVectors with Map
    console.log('1. Testing LoadVectors with Map:');
    const vectorMap = new Map();
    vectorMap.set('doc1', [0.1, 0.2, 0.3, 0.4]);
    vectorMap.set('doc2', [0.4, 0.3, 0.2, 0.1]);
    vectorMap.set('doc3', [0.2, 0.4, 0.1, 0.3]);
    
    service.LoadVectors(vectorMap);
    console.log(`Loaded ${service.Size} vectors\n`);
    
    // Test 2: AddVector with metadata
    console.log('2. Testing AddVector with metadata:');
    service.AddVector('doc4', [0.15, 0.25, 0.35, 0.45], {
        title: 'Document 4',
        category: 'Technical'
    });
    console.log(`Total vectors: ${service.Size}\n`);
    
    // Test 3: FindNearest
    console.log('3. Testing FindNearest:');
    const queryVector = [0.12, 0.22, 0.32, 0.42];
    const nearest = service.FindNearest(queryVector, 3);
    
    console.log('Nearest neighbors:');
    nearest.forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.key}: ${result.score.toFixed(4)}`);
    });
    console.log();
    
    // Test 4: FindSimilar
    console.log('4. Testing FindSimilar to doc1:');
    const similar = service.FindSimilar('doc1', 2);
    similar.forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.key}: ${result.score.toFixed(4)}`);
    });
    console.log();
    
    // Test 5: Similarity between specific items
    console.log('5. Testing Similarity:');
    const sim12 = service.Similarity('doc1', 'doc2');
    const sim13 = service.Similarity('doc1', 'doc3');
    const sim14 = service.Similarity('doc1', 'doc4');
    console.log(`  doc1 vs doc2: ${sim12.toFixed(4)}`);
    console.log(`  doc1 vs doc3: ${sim13.toFixed(4)}`);
    console.log(`  doc1 vs doc4: ${sim14.toFixed(4)}`);
    console.log();
    
    // Test 6: Package info
    console.log('6. Package verification:');
    console.log('  Package: @memberjunction/ai-vectors-memory');
    console.log('  Main export: SimpleVectorService');
    console.log('  Status: ✅ Successfully imported and tested');
    console.log();
    
    console.log('All tests completed successfully!');
    console.log('SimpleVectorService has been successfully moved to ai-vectors-memory package.');
}

// Run tests
try {
    testMemoryVectorService();
} catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
}