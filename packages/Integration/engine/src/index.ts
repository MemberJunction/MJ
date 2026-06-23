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
  UpsertRecordContext,
  DeleteRecordContext,
  GetRecordContext,
  CRUDResult,
  SearchContext,
  SearchResult,
  ListContext,
  ListResult,
  SchemaPromotionResult,
  PostSyncSchemaPromotionCallback,
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
  OperationTimeouts,
  DefaultIntegrationConfig,
  DefaultObjectConfig,
  RateLimitPolicy,
} from './BaseIntegrationConnector.js';

// REST Connector Base
export { BaseRESTIntegrationConnector } from './BaseRESTIntegrationConnector.js';
export type { RESTAuthContext, RESTResponse, PaginationState, PaginationType } from './BaseRESTIntegrationConnector.js';

// Factory
export { ConnectorFactory } from './ConnectorFactory.js';

// Engines
export { FieldMappingEngine } from './FieldMappingEngine.js';
export { MatchEngine } from './MatchEngine.js';
export { serializeKeyValue } from './KeySerialization.js';

// Services
export { WatermarkService } from './WatermarkService.js';

// Retry
export { WithRetry, DEFAULT_RETRY_CONFIG } from './RetryRunner.js';
export type { RetryConfig } from './RetryRunner.js';

// Action Metadata Generator
export { ActionMetadataGenerator } from './ActionMetadataGenerator.js';
export type { IntegrationObjectInfo, IntegrationFieldInfo, ActionGeneratorConfig, GeneratedActionMetadata } from './ActionMetadataGenerator.js';

// On-demand Integration-as-Actions persister — generates + persists ONE action (integration/object/verb), idempotent
export { IntegrationActionGenerator } from './IntegrationActionGenerator.js';
export type { IntegrationActionVerb, GenerateIntegrationActionResult } from './IntegrationActionGenerator.js';

// Integration Engine (server-side, wraps IntegrationEngineBase via composition)
// NOTE: For IntegrationEngineBase (client-safe metadata), import from @memberjunction/integration-engine-base
export { IntegrationEngine } from './IntegrationEngine.js';

// Schema persistence — upserts dynamically discovered objects/fields to IntegrationObject/Field tables
export { IntegrationSchemaSync } from './IntegrationSchemaSync.js';
export type { PersistSchemaOptions, PersistSchemaResult } from './IntegrationSchemaSync.js';

// ── Restored module exports dropped by the origin/next index.ts merge (union) ──
export { computeContentHash, CONTENT_HASH_COLUMN } from './ContentHash.js';
export { CUSTOM_OVERFLOW_COLUMN, computeUnmappedFields, hasUnmappedFields } from './CustomOverflow.js';
export { planPromotions, inferColumnTypeFromSamples, buildOverflowStats, sanitizeColumnName } from './CustomColumnPromotion.js';
export { discoverFromStream, pickPrimaryKeyFromStats } from './StreamingDiscovery.js';
export type { StreamDiscoveryOptions, DiscoveredColumnStat, StreamDiscoveryResult, PkPickOptions, PkStatVerdict } from './StreamingDiscovery.js';
export type { InferredColumnType, OverflowKeyStats, PromotionCandidate, PromotionPlanOptions } from './CustomColumnPromotion.js';
export { partitionRecords, partitionRollupHash, diffPartitions, partitionKeyForIdentity } from './HashDiff.js';
export type { PartitionDiff } from './HashDiff.js';
export { mostRecentWinner, parseTimestamp } from './ConflictRecency.js';
export type { RecencyWinner } from './ConflictRecency.js';
export { EnrichSchemaConstraints } from './EnrichSchemaConstraints.js';
export type { EnrichOptions, EnrichResult, DescribeFn } from './EnrichSchemaConstraints.js';
export { RateLimiter } from './RateLimiter.js';
export type { RateLimiterOptions, RateLimiterKeyState, NowFn, SleepFn } from './RateLimiter.js';
export { IntegrationConnectorCreationPipeline } from './IntegrationConnectorCreationPipeline.js';
export type { ConnectorCreationPipelineOptions, ConnectorCreationPipelineResult } from './IntegrationConnectorCreationPipeline.js';
export { AdaptiveConcurrencyController, RunAdaptive } from './AdaptiveConcurrency.js';
export type { AdaptiveConcurrencyOptions, AdaptiveItemOutcome, AdaptiveRunResult } from './AdaptiveConcurrency.js';
export type { FetchWarning } from './BaseIntegrationConnector.js';
export type { FieldMergeLog, ObjectMergeLog } from './IntegrationSchemaSync.js';
export { decideSchemaLimitViolations } from './IntegrationSchemaSync.js';
export type { SchemaLimitInput } from './IntegrationSchemaSync.js';

// ── Auth helpers (shared OAuth2/token primitives for connectors) ──
export { OAuth2TokenManager } from './auth-helpers/index.js';
export type { OAuth2GrantType, OAuth2TokenRequest, OAuth2Token } from './auth-helpers/index.js';
export { OAuth1aSigner, percentEncodeRFC3986 } from './auth-helpers/index.js';
export type { OAuth1aSignRequest, OAuth1aSignatureMethod } from './auth-helpers/index.js';
export { buildBasicAuthHeaderValue, buildBasicAuthHeader } from './auth-helpers/index.js';
export type { BasicAuthRequest } from './auth-helpers/index.js';
