// Entity type interfaces (local replacements for not-yet-generated core-entities types)
export type {
    IIntegrationSourceType,
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
    ICompanyIntegrationSyncWatermark,
} from './entity-types.js';

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
export {
    BaseIntegrationConnector,
    WithTimeout,
    DEFAULT_OPERATION_TIMEOUTS,
} from './BaseIntegrationConnector.js';
export type {
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
    FetchContext,
    FetchBatchResult,
    OperationTimeouts,
    DefaultIntegrationConfig,
    DefaultObjectConfig,
} from './BaseIntegrationConnector.js';

// REST Connector Base
export { BaseRESTIntegrationConnector } from './BaseRESTIntegrationConnector.js';
export type {
    RESTAuthContext,
    RESTResponse,
    PaginationState,
    PaginationType,
} from './BaseRESTIntegrationConnector.js';

// Factory
export { ConnectorFactory } from './ConnectorFactory.js';

// Engines
export { FieldMappingEngine } from './FieldMappingEngine.js';
export { MatchEngine } from './MatchEngine.js';

// Services
export { WatermarkService } from './WatermarkService.js';

// Retry
export { WithRetry, DEFAULT_RETRY_CONFIG } from './RetryRunner.js';
export type { RetryConfig } from './RetryRunner.js';

// Action Metadata Generator
export { ActionMetadataGenerator } from './ActionMetadataGenerator.js';
export type {
    IntegrationObjectInfo,
    IntegrationFieldInfo,
    ActionGeneratorConfig,
    GeneratedActionMetadata,
} from './ActionMetadataGenerator.js';

// Strategy Interfaces
export type {
    TargetDatabasePlatform,
    TransformRule,
    TransformPipeline,
} from './strategies/index.js';
export type {
    PaginationType as StrategyPaginationType,
    PaginationState as StrategyPaginationState,
    PaginationStrategy,
} from './strategies/index.js';
export type {
    BatchOperationType,
    BatchingStrategy,
} from './strategies/index.js';
export type {
    AuthType,
    AuthContext,
    AuthStrategy,
} from './strategies/index.js';
export type { RateLimitStrategy } from './strategies/index.js';
export type { WritebackStrategy } from './strategies/index.js';
export type {
    TraversalType,
    EndpointTraversal,
} from './strategies/index.js';
export type {
    IncrementalWatermarkType,
    IncrementalSyncStrategy,
} from './strategies/index.js';
export type {
    BatchApplyResult,
    IntegrationLogger,
    TransactionLogger,
} from './strategies/index.js';

// Built-in Strategy Implementations
export { DefaultTransformPipeline } from './strategies/builtin/transforms/DefaultTransformPipeline.js';
export { EmptyStringToNullRule } from './strategies/builtin/transforms/shared/EmptyStringToNull.js';
export { TrimWhitespaceRule } from './strategies/builtin/transforms/shared/TrimWhitespace.js';
export { NormalizeUUIDUppercaseRule } from './strategies/builtin/transforms/sqlserver/NormalizeUUIDUppercase.js';
export { NormalizeUUIDLowercaseRule } from './strategies/builtin/transforms/postgresql/NormalizeUUIDLowercase.js';
export { ValidateJsonbRule } from './strategies/builtin/transforms/postgresql/ValidateJsonb.js';
export { CoerceBooleanStringsRule } from './strategies/builtin/transforms/postgresql/CoerceBooleanStrings.js';
export { CoerceTimestamptzRule } from './strategies/builtin/transforms/postgresql/CoerceTimestamptz.js';
export { CursorPagination } from './strategies/builtin/pagination/CursorPagination.js';
export { OffsetPagination } from './strategies/builtin/pagination/OffsetPagination.js';
export { PageNumberPagination } from './strategies/builtin/pagination/PageNumberPagination.js';
export { NoPagination } from './strategies/builtin/pagination/NoPagination.js';
export { SimpleBatching } from './strategies/builtin/batching/SimpleBatching.js';
export { NoBatching } from './strategies/builtin/batching/NoBatching.js';
export { ExponentialBackoff } from './strategies/builtin/ratelimit/ExponentialBackoff.js';
export { FixedInterval } from './strategies/builtin/ratelimit/FixedInterval.js';
export { NoRateLimit } from './strategies/builtin/ratelimit/NoRateLimit.js';
export { TimestampWatermark } from './strategies/builtin/incremental/TimestampWatermark.js';
export { NoIncrementalSync } from './strategies/builtin/incremental/NoIncrementalSync.js';

// Integration Engine (server-side, wraps IntegrationEngineBase via composition)
// NOTE: For IntegrationEngineBase (client-safe metadata), import from @memberjunction/integration-engine-base
export { IntegrationEngine } from './IntegrationEngine.js';
