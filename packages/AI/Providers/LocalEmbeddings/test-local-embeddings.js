// Simple test script for LocalEmbedding provider
const { LocalEmbedding } = require('./dist/models/localEmbedding');

async function testLocalEmbeddings() {
    console.log('Testing LocalEmbedding provider...\n');
    
    // Create instance
    const embedder = new LocalEmbedding();
    
    // Test 1: Get available models (now returns empty as models come from DB)
    console.log('1. Getting available models:');
    const models = await embedder.GetEmbeddingModels();
    console.log(`GetEmbeddingModels() returned ${models.length} models (expected 0 in standalone mode)`);
    console.log('Note: In production, models are configured in the MemberJunction database');
    console.log();
    
    // Test 2: Embed single text
    console.log('2. Testing single text embedding:');
    const text = "The quick brown fox jumps over the lazy dog";
    console.log(`Input text: "${text}"`);
    
    try {
        const result = await embedder.EmbedText({
            text: text,
            model: 'Xenova/all-MiniLM-L6-v2'  // Using the Hugging Face model ID directly
        });
        
        console.log(`Model used: ${result.model}`);
        console.log(`Vector dimension: ${result.vector.length}`);
        console.log(`First 5 values: [${result.vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        console.log(`Token usage: ${result.ModelUsage.promptTokens} tokens`);
    } catch (error) {
        console.error('Error embedding text:', error.message);
    }
    console.log();
    
    // Test 3: Embed multiple texts
    console.log('3. Testing batch text embedding:');
    const texts = [
        "Machine learning is fascinating",
        "Natural language processing enables computers to understand text",
        "Embeddings capture semantic meaning"
    ];
    
    try {
        const result = await embedder.EmbedTexts({
            texts: texts,
            model: 'Xenova/all-MiniLM-L6-v2'
        });
        
        console.log(`Embedded ${result.vectors.length} texts`);
        result.vectors.forEach((vec, i) => {
            console.log(`  Text ${i + 1}: "${texts[i].substring(0, 30)}..." -> ${vec.length} dimensions`);
        });
        console.log(`Total token usage: ${result.ModelUsage.promptTokens} tokens`);
    } catch (error) {
        console.error('Error embedding texts:', error.message);
    }
    console.log();
    
    // Test 4: Test similarity between embeddings
    console.log('4. Testing semantic similarity:');
    const similarTexts = [
        "Dogs are great pets",
        "Canines make wonderful companions",
        "The weather is nice today"
    ];
    
    try {
        const results = await embedder.EmbedTexts({
            texts: similarTexts,
            model: 'Xenova/all-MiniLM-L6-v2'
        });
        
        // Calculate cosine similarity
        const cosineSimilarity = (a, b) => {
            const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
            const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
            const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
            return dotProduct / (magnitudeA * magnitudeB);
        };
        
        console.log('Cosine similarities:');
        console.log(`  "${similarTexts[0]}" vs "${similarTexts[1]}": ${cosineSimilarity(results.vectors[0], results.vectors[1]).toFixed(4)}`);
        console.log(`  "${similarTexts[0]}" vs "${similarTexts[2]}": ${cosineSimilarity(results.vectors[0], results.vectors[2]).toFixed(4)}`);
        console.log(`  "${similarTexts[1]}" vs "${similarTexts[2]}": ${cosineSimilarity(results.vectors[1], results.vectors[2]).toFixed(4)}`);
        console.log('  (Higher values indicate more similar meanings)');
    } catch (error) {
        console.error('Error in similarity test:', error.message);
    }
    
    // Clear cache
    console.log('\n5. Clearing model cache...');
    embedder.clearCache();
    console.log('Cache cleared.');
}

// Run tests
testLocalEmbeddings().then(() => {
    console.log('\nTests completed!');
}).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});