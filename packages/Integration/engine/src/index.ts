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
    SourceSchemaInfo,
    SourceObjectInfo,
    SourceFieldInfo,
    SourceRelationshipInfo,
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

// Integration Engine (server-side, wraps IntegrationEngineBase via composition)
// NOTE: For IntegrationEngineBase (client-safe metadata), import from @memberjunction/integration-engine-base
export { IntegrationEngine } from './IntegrationEngine.js';
