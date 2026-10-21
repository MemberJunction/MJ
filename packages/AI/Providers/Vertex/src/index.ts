export * from './vertexCredentials';
export * from './vertexAuthClient';
export * from './vertexAccessToken';
export * from './models/vertexLLM';
export * from './models/geminiEnterpriseRealtime';
// Note: vertexEmbedding.ts removed - it used deprecated @google-cloud/vertexai SDK
// and only returned mock embeddings. The new @google/genai SDK doesn't yet support
// embeddings. Will be re-implemented when embedding support is added to @google/genai.
