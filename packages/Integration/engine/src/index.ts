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
} from './types.js';

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
} from './BaseIntegrationConnector.js';
export type {
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
    FetchContext,
    FetchBatchResult,
} from './BaseIntegrationConnector.js';

// Factory
export { ConnectorFactory } from './ConnectorFactory.js';

// Engines
export { FieldMappingEngine } from './FieldMappingEngine.js';
export { MatchEngine } from './MatchEngine.js';

// Services
export { WatermarkService } from './WatermarkService.js';

// Orchestrator
export { IntegrationOrchestrator } from './IntegrationOrchestrator.js';
