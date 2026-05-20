export * from './generic/search.types';
export * from './generic/ISearchProvider';
export * from './generic/SearchFusion';
export * from './generic/SearchEnricher';
export * from './generic/EntitySearchProvider';
export * from './generic/VectorSearchProvider';
export * from './generic/FullTextSearchProvider';
export * from './generic/StorageSearchProvider';
export * from './generic/SearchEngine';
export * from './generic/BaseReRanker';
export * from './generic/NoopReRanker';
export * from './generic/ScopeTemplateRenderer';
export * from './permissions/SearchScopePermissionResolver';

// Phase 2D real rerankers — exported here so consumers' module evaluation runs the
// `@RegisterClass` decorators and ClassFactory can resolve them by DriverClass at runtime.
export * from './rerankers/CohereReRanker';
export * from './rerankers/VoyageReRanker';
export * from './rerankers/OpenAIReRanker';
export * from './rerankers/BGEReRanker';
export * from './rerankers/RerankerBudgetGuard';

// Phase 5 external search providers — same reason. Each provider gracefully self-
// disables (CheckAvailability + IsAvailable) when its optional peer dep or config
// is missing, so importing them is safe even when no scope uses them.
export * from './providers/ElasticsearchSearchProvider';
export * from './providers/TypesenseSearchProvider';
export * from './providers/AzureAISearchProvider';
export * from './providers/OpenSearchSearchProvider';
