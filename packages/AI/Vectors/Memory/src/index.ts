/**
 * @module @memberjunction/ai-vectors-memory
 * @description In-memory vector similarity search service for MemberJunction
 */

export {
  SimpleVectorService,
  VectorEntry,
  VectorSearchResult,
  DistanceMetric,
  ClusterResult
} from './models/SimpleVectorService';

export { SimpleVectorDatabase, LoadSimpleVectorDatabase } from './models/SimpleVectorDatabase';
export { SimpleVectorServiceProvider, LoadSimpleVectorServiceProvider } from './models/SimpleVectorServiceProvider';