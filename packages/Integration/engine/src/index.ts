// Entity type interfaces (local replacements for not-yet-generated core-entities types)
export type { IIntegrationSourceType, ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap, ICompanyIntegrationSyncWatermark } from './entity-types.js';

// Types
export type {
  SyncDirection,
  SyncTriggerType,
  WatermarkType,
  ConflictResolution,
  DeleteBehavior,
  RecordChangeType,
  IntegrationRunStatus,
  ExternalRecord,
  MappedRecord,
  SyncResult,
  SyncRecordError,
  DefaultFieldMapping,
  SyncErrorCode,
  ErrorSeverity,
  SyncProgress,
  SyncProgressSnapshot,
  OnProgressCallback,
  SyncNotificationEvent,
  SyncNotificationSeverity,
  SyncNotification,
  OnNotificationCallback,
  IntegrationSyncOptions,
  EntityMapSyncResult,
  SourceSchemaInfo,
  SourceObjectInfo,
  SourceFieldInfo,
  SourceRelationshipInfo,
  IntrospectSchemaOptions,
  CRUDContext,
  CreateRecordContext,
  UpdateRecordContext,
  DeleteRecordContext,
  GetRecordContext,
  CRUDResult,
  SearchContext,
  SearchResult,
  ListContext,
  ListResult,
} from './types.js';

// Error classification helpers
export { IsRetryableError, ClassifyError } from './types.js';

// Transforms
export type {
  TransformType,
  TransformOnError,
  TransformStep,
  TransformConfig,
  DirectConfig,
  RegexConfig,
  SplitConfig,
  CombineConfig,
  LookupConfig,
  FormatConfig,
  CoerceConfig,
  SubstringConfig,
  CustomConfig,
} from './transforms.js';

// Connector
export { BaseIntegrationConnector, WithTimeout, DEFAULT_OPERATION_TIMEOUTS } from './BaseIntegrationConnector.js';
export type {
  ConnectionTestResult,
  ExternalObjectSchema,
  ExternalFieldSchema,
  FetchContext,
  FetchBatchResult,
  FetchWarning,
  RateLimitPolicy,
  OperationTimeouts,
  DefaultIntegrationConfig,
  DefaultObjectConfig,
} from './BaseIntegrationConnector.js';

// REST Connector Base
export { BaseRESTIntegrationConnector } from './BaseRESTIntegrationConnector.js';
export type { RESTAuthContext, RESTResponse, PaginationState, PaginationType } from './BaseRESTIntegrationConnector.js';

// Factory
export { ConnectorFactory } from './ConnectorFactory.js';

// Engines
export { FieldMappingEngine } from './FieldMappingEngine.js';
export { MatchEngine } from './MatchEngine.js';

// Services
export { WatermarkService } from './WatermarkService.js';

// Content hashing — watermark-less change detection key
export { computeContentHash, CONTENT_HASH_COLUMN } from './ContentHash.js';

// Partitioned / Merkle-style hash-diff — find changed partitions cheaply when no incremental cursor exists
export { partitionRecords, partitionRollupHash, diffPartitions, partitionKeyForIdentity } from './HashDiff.js';
export type { PartitionDiff } from './HashDiff.js';

// MostRecent conflict resolution recency comparison
export { mostRecentWinner, parseTimestamp } from './ConflictRecency.js';
export type { RecencyWinner } from './ConflictRecency.js';

// Lightweight post-discovery constraint enrichment (deterministic FK inference + AI-optional descriptions)
export { EnrichSchemaConstraints } from './EnrichSchemaConstraints.js';
export type { EnrichOptions, EnrichResult, DescribeFn } from './EnrichSchemaConstraints.js';

// Retry
export { WithRetry, DEFAULT_RETRY_CONFIG } from './RetryRunner.js';
export type { RetryConfig } from './RetryRunner.js';

// Adaptive per-key token-bucket rate limiter (peak-aware rate limiting, plan.md §7)
export { RateLimiter } from './RateLimiter.js';
export type { RateLimiterOptions, RateLimiterKeyState, NowFn, SleepFn } from './RateLimiter.js';

// Action Metadata Generator
export { ActionMetadataGenerator } from './ActionMetadataGenerator.js';
export type { IntegrationObjectInfo, IntegrationFieldInfo, ActionGeneratorConfig, GeneratedActionMetadata } from './ActionMetadataGenerator.js';

// Integration Engine (server-side, wraps IntegrationEngineBase via composition)
// NOTE: For IntegrationEngineBase (client-safe metadata), import from @memberjunction/integration-engine-base
export { IntegrationEngine } from './IntegrationEngine.js';

// Schema persistence — upserts dynamically discovered objects/fields to IntegrationObject/Field tables
export { IntegrationSchemaSync } from './IntegrationSchemaSync.js';
export type { PersistSchemaOptions, PersistSchemaResult, FieldMergeLog, ObjectMergeLog } from './IntegrationSchemaSync.js';

// Creation pipeline — orchestrates connect→introspect→persist→PK-classify with structured progress
export { IntegrationConnectorCreationPipeline } from './IntegrationConnectorCreationPipeline.js';
export type { ConnectorCreationPipelineOptions, ConnectorCreationPipelineResult } from './IntegrationConnectorCreationPipeline.js';

// Adaptive concurrency — AIMD controller for §7 smart peak parallelization
export { AdaptiveConcurrencyController, RunAdaptive } from './AdaptiveConcurrency.js';
export type { AdaptiveConcurrencyOptions, AdaptiveItemOutcome, AdaptiveRunResult } from './AdaptiveConcurrency.js';
