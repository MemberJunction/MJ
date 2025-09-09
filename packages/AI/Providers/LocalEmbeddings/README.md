# MemberJunction Local Embeddings Provider

A local embeddings provider for MemberJunction that runs embedding models directly on your machine using [Transformers.js](https://github.com/xenova/transformers.js), eliminating the need for external API calls.

## Features

- **Offline Operation**: Run embedding models locally without internet connectivity
- **No API Keys Required**: Eliminate dependency on external services
- **Cost-Effective**: No per-token charges for embeddings
- **Privacy-Focused**: Data never leaves your infrastructure
- **Multiple Models**: Support for various sentence-transformer models
- **Automatic Caching**: Models are downloaded once and cached locally
- **Batch Processing**: Efficient batch embedding capabilities

## Supported Models

The provider includes several pre-configured models:

| Model | Dimensions | Max Tokens | Description |
|-------|------------|------------|-------------|
| `all-MiniLM-L6-v2` | 384 | 256 | Lightweight general-purpose embeddings |
| `all-MiniLM-L12-v2` | 384 | 256 | Higher quality with more layers |
| `all-mpnet-base-v2` | 768 | 384 | Best quality general-purpose embeddings |
| `paraphrase-multilingual-MiniLM-L12-v2` | 384 | 128 | Multilingual support for 50+ languages |
| `gte-small` | 384 | 512 | General Text Embeddings - efficient model |
| `bge-small-en-v1.5` | 384 | 512 | BAAI General Embeddings - English |

## Installation

```bash
npm install @memberjunction/ai-local-embeddings
```

## Usage

### Basic Usage

```typescript
import { LocalEmbedding } from '@memberjunction/ai-local-embeddings';

// Create instance
const embedder = new LocalEmbedding();

// Embed single text
const result = await embedder.EmbedText({
    text: "Your text to embed",
    model: 'all-MiniLM-L6-v2' // optional, defaults to all-MiniLM-L6-v2
});

console.log(result.vector); // Array of numbers representing the embedding
```

### Batch Embedding

```typescript
// Embed multiple texts efficiently
const results = await embedder.EmbedTexts({
    texts: [
        "First text",
        "Second text",
        "Third text"
    ],
    model: 'all-MiniLM-L6-v2'
});

console.log(results.vectors); // Array of embedding vectors
```

### Configuration

```typescript
// Configure cache directory and other settings
embedder.SetAdditionalSettings({
    cacheDir: '/path/to/model/cache',  // Where to store downloaded models
    useQuantized: true                  // Use quantized models for better performance
});
```

### Model Management

```typescript
// Get list of available models
const models = await embedder.GetEmbeddingModels();

// Preload a model for faster first inference
await embedder.preloadModel('all-mpnet-base-v2');

// Clear model cache to free memory
embedder.clearCache();
```

## Environment Variables

- `TRANSFORMERS_CACHE_DIR`: Directory for storing downloaded models (default: `./.cache/transformers`)
- `TRANSFORMERS_LOCAL_URL`: Optional local URL for model files

## Performance Considerations

1. **First Run**: Initial model download may take a few minutes depending on model size and internet speed
2. **Model Loading**: First embedding request loads the model into memory (takes a few seconds)
3. **Memory Usage**: Models typically use 50-500MB of RAM depending on size
4. **CPU vs GPU**: Runs on CPU by default; GPU acceleration available if configured
5. **Batch Processing**: Process multiple texts together for better throughput

## Integration with MemberJunction

The LocalEmbedding provider integrates seamlessly with MemberJunction's AI framework:

```typescript
// Register in your AI configuration
import { AIEngine } from '@memberjunction/aiengine';
import { LocalEmbedding } from '@memberjunction/ai-local-embeddings';

// The provider auto-registers via @RegisterClass decorator
// It will be available as 'LocalEmbedding' in your AI model configurations
```

## Comparison with API-based Providers

| Feature | Local Embeddings | API Providers (OpenAI, etc.) |
|---------|------------------|------------------------------|
| Internet Required | No (after initial download) | Yes |
| API Key | Not needed | Required |
| Cost | Free (compute only) | Per-token charges |
| Privacy | Complete | Data sent to provider |
| Latency | Low (local) | Network dependent |
| Model Selection | Limited | Extensive |
| Model Quality | Good | Excellent |
| Scalability | Hardware limited | Provider managed |

## Use Cases

Ideal for:
- Development and testing environments
- Air-gapped or restricted networks
- Privacy-sensitive applications
- High-volume embedding tasks
- Cost-conscious deployments
- Edge computing scenarios

## ESM/CommonJS Compatibility Note

### Current Implementation (CommonJS with Dynamic Imports)
This package is built as CommonJS to maintain consistency with 96% of the MemberJunction codebase. However, the underlying `@xenova/transformers` library is ESM-only. We use dynamic imports as a workaround:

```javascript
// Current workaround in localEmbedding.ts
const transformers = await eval('import("@xenova/transformers")');
```

This is the **official recommended approach** by HuggingFace for using their ESM library in CommonJS environments and works perfectly in production.

### Future ESM Migration
If/when MemberJunction migrates to ESM, this workaround should be reverted to standard imports:

**Step 1: Update package.json**
```json
{
  "type": "module"
}
```

**Step 2: Update tsconfig.json**
```json
{
  "compilerOptions": {
    "module": "ESNext" // or "NodeNext"
  }
}
```

**Step 3: Revert to standard imports in localEmbedding.ts**
```typescript
// Remove the dynamic import workaround:
// DELETE: const transformers = await eval('import("@xenova/transformers")');
// DELETE: The entire loadTransformers() function

// Replace with standard ESM import at top of file:
import { pipeline, env } from '@xenova/transformers';

// Update initialization to use imports directly without the loadTransformers() call
```

**Note for AI Assistants**: If you're migrating this package to ESM, remember to:
1. Remove the entire `loadTransformers()` function and its interfaces
2. Replace all dynamic import logic with standard ESM imports
3. Remove null checks for `pipeline` and `env` as they'll be available at import time
4. Update all dependent packages that import this module

## Troubleshooting

### Model Download Issues
If models fail to download:
1. Check internet connectivity
2. Verify firewall allows access to Hugging Face
3. Try setting `TRANSFORMERS_CACHE_DIR` to a writable location

### Out of Memory Errors
If you encounter memory issues:
1. Use smaller models (e.g., MiniLM instead of MPNet)
2. Reduce batch sizes
3. Call `clearCache()` between different models
4. Consider using quantized models

### Performance Issues
For better performance:
1. Preload models before use
2. Process texts in batches
3. Use appropriate model for your needs (smaller = faster)
4. Consider GPU acceleration if available

## License

This package is part of the MemberJunction project and follows the same licensing terms.