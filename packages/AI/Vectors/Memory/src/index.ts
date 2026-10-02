/**
 * @module @memberjunction/ai-vectors-memory
 * @description In-memory vector similarity search service for MemberJunction
 */

export {
  SimpleVectorService,
  SimpleVectorServiceOptions,
  VectorEntry,
  VectorSearchResult,
  ClusterResult
} from './models/SimpleVectorService';

export * from './models/VectorKernels';
export * from './models/VectorStore';
export * from './models/VectorAccelerator';

export { SimpleVectorDatabase, LoadSimpleVectorDatabase } from './models/SimpleVectorDatabase';
export { SimpleVectorServiceProvider, SimpleVectorIndexCache, LoadSimpleVectorServiceProvider } from './models/SimpleVectorServiceProvider';