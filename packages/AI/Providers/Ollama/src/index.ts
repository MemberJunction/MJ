export * from './models/ollama-llm';
export * from './models/ollama-embeddings';

import { LoadOllamaLLM } from './models/ollama-llm';
import { LoadOllamaEmbedding } from './models/ollama-embeddings';

// Prevent tree shaking
LoadOllamaLLM();
LoadOllamaEmbedding();