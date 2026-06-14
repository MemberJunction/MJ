import { Resolver, Query, Mutation, Arg, Ctx, ObjectType, Field, InputType, Int, Float } from "type-graphql";
import { CompositeKey, DatabaseProviderBase, LocalCacheManager, Metadata, RunView, UserInfo, LogError, LogStatus, IMetadataProvider, TransactionGroupBase } from "@memberjunction/core";
import { GetReadOnlyProvider, GetReadWriteProvider } from "../util.js";
import { CronExpressionHelper } from "@memberjunction/scheduling-engine";
import {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
    MJIntegrationObjectEntity,
    MJCredentialEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationRunEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
    MJCompanyIntegrationRecordMapEntity,
    MJScheduledJobEntity,
    MJScheduledJobTypeEntity,
    MJScheduledJobRunEntity,
    MJCompanyIntegrationRunDetailEntity,
    MJEmployeeCompanyIntegrationEntity
} from "@memberjunction/core-entities";
import {
    BaseIntegrationConnector,
    ConnectorFactory,
    ExternalObjectSchema,
    ExternalFieldSchema,
    ConnectionTestResult,
    IntegrationEngine,
    IntegrationSyncOptions,
    SourceSchemaInfo,
    IntegrationSchemaSync,
    decideSchemaLimitViolations,
    IntegrationConnectorCreationPipeline,
    IntegrationActionGenerator
} from "@memberjunction/integration-engine";
import type {
    IntegrationActionVerb,
    GenerateIntegrationActionResult
} from "@memberjunction/integration-engine";
import { IntegrationEngineBase } from "@memberjunction/integration-engine-base";
import {
    SchemaBuilder,
    TypeMapper,
    SchemaBuilderInput,
    TargetTableConfig,
    TargetColumnConfig,
    ExistingTableInfo,
    SchemaEvolution
} from "@memberjunction/integration-schema-builder";
import { RuntimeSchemaManager, type RSUPipelineStep, type RSUPipelineInput } from "@memberjunction/schema-engine";
import type { SchemaBuilderOutput } from "@memberjunction/integration-schema-builder";
import { IntegrationProgressReader } from "@memberjunction/integration-progress-artifacts";
import type { IntegrationRunSnapshot, IntegrationRunKind } from "@memberjunction/integration-progress-artifacts";
import { ResolverBase } from "../generic/ResolverBase.js";
import { IntegrationCustomColumnPromoter } from "../integration/CustomColumnPromoter.js";
import { AppContext } from "../types.js";
import { RequireSystemUser } from "../directives/RequireSystemUser.js";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

// ─── RSU Pipeline Output Types ──────────────────────────────────────────────

@ObjectType()
class RSUStepOutput {
    @Field() Name: string;
    @Field() Status: string;
    @Field() DurationMs: number;
    @Field() Message: string;
}

@ObjectType()
class ApplySchemaOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [RSUStepOutput], { nullable: true }) Steps?: RSUStepOutput[];
    @Field({ nullable: true }) MigrationFilePath?: string;
    @Field({ nullable: true }) EntitiesProcessed?: number;
    @Field({ nullable: true }) GitCommitSuccess?: boolean;
    @Field({ nullable: true }) APIRestarted?: boolean;
    @Field(() => [String], { nullable: true }) Warnings?: string[];
}

@InputType()
class ApplySchemaBatchItemInput {
    @Field() CompanyIntegrationID: string;
    @Field(() => [SchemaPreviewObjectInput]) Objects: SchemaPreviewObjectInput[];
}

// ─── Apply All Input/Output Types ───────────────────────────────────────────

@InputType()
class SourceObjectInput {
    @Field({ nullable: true, description: 'Existing IntegrationObject.ID. Either SourceObjectID or SourceObjectName must be provided; if both, ID wins.' }) SourceObjectID?: string;
    @Field({ nullable: true, description: 'External object name (e.g. "Account"). Use when the object has no IntegrationObject row yet — the server will create one via describe+persist.' }) SourceObjectName?: string;
    @Field(() => [String], { nullable: true, description: 'Optional field selection. Empty/null = all fields (including any new ones). Only specified fields get field maps.' }) Fields?: string[];
}

@InputType()
class ApplyAllInput {
    @Field() CompanyIntegrationID: string;
    @Field(() => [SourceObjectInput]) SourceObjects: SourceObjectInput[];
    @Field({ nullable: true }) CronExpression?: string;
    @Field({ nullable: true }) ScheduleTimezone?: string;
    @Field(() => Boolean, { nullable: true, defaultValue: true, description: 'If false, skips the sync step after schema + entity maps are created' }) StartSync?: boolean;
    @Field(() => Boolean, { nullable: true, defaultValue: false, description: 'If true, ignores watermarks and does a full re-fetch' }) FullSync?: boolean;
    @Field({ nullable: true, defaultValue: 'created', description: 'Sync scope: "created" = only newly created entity maps, "all" = all maps for the connector' }) SyncScope?: string;
    @Field({ nullable: true, defaultValue: 'Pull', description: 'SyncDirection applied to all created entity maps: Pull | Push | Bidirectional. Defaults to Pull.' }) DefaultSyncDirection?: string;
}

@ObjectType()
class ApplyAllEntityMapCreated {
    @Field() SourceObjectName: string;
    @Field() EntityName: string;
    @Field() EntityMapID: string;
    @Field() FieldMapCount: number;
}

@ObjectType()
class ApplyAllOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [RSUStepOutput], { nullable: true }) Steps?: RSUStepOutput[];
    @Field(() => [ApplyAllEntityMapCreated], { nullable: true }) EntityMapsCreated?: ApplyAllEntityMapCreated[];
    @Field({ nullable: true }) SyncRunID?: string;
    @Field({ nullable: true }) ScheduledJobID?: string;
    @Field({ nullable: true }) GitCommitSuccess?: boolean;
    @Field({ nullable: true }) APIRestarted?: boolean;
    @Field(() => [String], { nullable: true }) Warnings?: string[];
}

@ObjectType()
class ApplySchemaBatchItemOutput {
    @Field() CompanyIntegrationID: string;
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [String], { nullable: true }) Warnings?: string[];
}

@ObjectType()
class ApplySchemaBatchOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ApplySchemaBatchItemOutput]) Items: ApplySchemaBatchItemOutput[];
    @Field(() => [RSUStepOutput], { nullable: true }) Steps?: RSUStepOutput[];
    @Field({ nullable: true }) GitCommitSuccess?: boolean;
    @Field({ nullable: true }) APIRestarted?: boolean;
}

// ─── Apply All Batch Input/Output Types ──────────────────────────────────────

@InputType()
class ApplyAllBatchConnectorInput {
    @Field() CompanyIntegrationID: string;
    @Field(() => [SourceObjectInput]) SourceObjects: SourceObjectInput[];
    /** Optional per-connector schedule. Applied on success. */
    @Field({ nullable: true }) CronExpression?: string;
    @Field({ nullable: true }) ScheduleTimezone?: string;
    @Field({ nullable: true, defaultValue: 'Pull', description: 'SyncDirection applied to all created entity maps for this connector: Pull | Push | Bidirectional. Defaults to Pull.' }) DefaultSyncDirection?: string;
}

@InputType()
class ApplyAllBatchInput {
    @Field(() => [ApplyAllBatchConnectorInput]) Connectors: ApplyAllBatchConnectorInput[];
    @Field(() => Boolean, { nullable: true, defaultValue: true, description: 'If false, skips sync after schema + entity maps' }) StartSync?: boolean;
    @Field(() => Boolean, { nullable: true, defaultValue: false, description: 'If true, ignores watermarks and does a full re-fetch' }) FullSync?: boolean;
    @Field({ nullable: true, defaultValue: 'created', description: 'Sync scope: "created" = only newly created entity maps, "all" = all maps for the connector' }) SyncScope?: string;
    @Field({ nullable: true, description: 'Override sync direction for the initial sync: Pull | Push | Bidirectional. Defaults to entity map SyncDirection.' }) SyncDirection?: string;
    @Field({ nullable: true, description: 'Override sync direction stored in the created schedule: Pull | Push | Bidirectional.' }) ScheduleSyncDirection?: string;
}

@ObjectType()
class ApplyAllBatchConnectorResult {
    @Field() CompanyIntegrationID: string;
    @Field() IntegrationName: string;
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ApplyAllEntityMapCreated], { nullable: true }) EntityMapsCreated?: ApplyAllEntityMapCreated[];
    @Field({ nullable: true }) SyncRunID?: string;
    @Field({ nullable: true }) ScheduledJobID?: string;
    @Field(() => [String], { nullable: true }) Warnings?: string[];
}

@ObjectType()
class ApplyAllBatchOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ApplyAllBatchConnectorResult]) ConnectorResults: ApplyAllBatchConnectorResult[];
    @Field(() => [RSUStepOutput], { nullable: true }) PipelineSteps?: RSUStepOutput[];
    @Field({ nullable: true }) GitCommitSuccess?: boolean;
    @Field({ nullable: true }) APIRestarted?: boolean;
    @Field() SuccessCount: number;
    @Field() FailureCount: number;
}

// ─── Delete Connection Output ────────────────────────────────────────────────

@ObjectType()
class DeleteConnectionOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) EntityMapsDeleted?: number;
    @Field({ nullable: true }) FieldMapsDeleted?: number;
    @Field({ nullable: true }) SchedulesDeleted?: number;
    @Field({ nullable: true }) CredentialDeleted?: boolean;
}

// ─── Schema Evolution Output ─────────────────────────────────────────────────

@ObjectType()
class SchemaEvolutionOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field() HasChanges: boolean;
    @Field({ nullable: true }) AddedColumns?: number;
    @Field({ nullable: true }) ModifiedColumns?: number;
    @Field(() => [RSUStepOutput], { nullable: true }) Steps?: RSUStepOutput[];
    @Field({ nullable: true }) GitCommitSuccess?: boolean;
    @Field({ nullable: true }) APIRestarted?: boolean;
    @Field(() => [String], { nullable: true }) Warnings?: string[];
}

// ─── Connector Capabilities Output Type ─────────────────────────────────────

@ObjectType()
class ConnectorCapabilitiesOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) SupportsGet?: boolean;
    @Field({ nullable: true }) SupportsCreate?: boolean;
    @Field({ nullable: true }) SupportsUpdate?: boolean;
    @Field({ nullable: true }) SupportsDelete?: boolean;
    @Field({ nullable: true }) SupportsSearch?: boolean;
}

// --- Connector Discovery Output Types ---

@ObjectType()
class ConnectorInfoOutput {
    @Field() IntegrationID: string;
    @Field() Name: string;
    @Field({ nullable: true }) Description?: string;
    @Field({ nullable: true }) ClassName?: string;
    @Field() IsActive: boolean;
}

@ObjectType()
class DiscoverConnectorsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ConnectorInfoOutput], { nullable: true }) Connectors?: ConnectorInfoOutput[];
}

// --- Field Map List Output Types ---

@ObjectType()
class FieldMapSummaryOutput {
    @Field() ID: string;
    @Field() EntityMapID: string;
    @Field({ nullable: true }) SourceFieldName?: string;
    @Field({ nullable: true }) DestinationFieldName?: string;
    @Field({ nullable: true }) Status?: string;
}

@ObjectType()
class ListFieldMapsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [FieldMapSummaryOutput], { nullable: true }) FieldMaps?: FieldMapSummaryOutput[];
}

// --- Output Types ---

@ObjectType()
class ExternalObjectOutput {
    @Field({ nullable: true })
    ID?: string;

    @Field()
    Name: string;

    @Field()
    Label: string;

    @Field()
    SupportsIncrementalSync: boolean;

    @Field()
    SupportsWrite: boolean;
}

@ObjectType()
class DiscoverObjectsOutput {
    @Field()
    Success: boolean;

    @Field()
    Message: string;

    @Field(() => [ExternalObjectOutput], { nullable: true })
    Objects?: ExternalObjectOutput[];
}

@ObjectType()
class ExternalFieldOutput {
    @Field()
    Name: string;

    @Field()
    Label: string;

    @Field()
    DataType: string;

    @Field()
    IsRequired: boolean;

    @Field()
    IsUniqueKey: boolean;

    @Field()
    IsReadOnly: boolean;
}

@ObjectType()
class DiscoverFieldsOutput {
    @Field()
    Success: boolean;

    @Field()
    Message: string;

    @Field(() => [ExternalFieldOutput], { nullable: true })
    Fields?: ExternalFieldOutput[];
}

@ObjectType()
class ConnectionTestOutput {
    @Field()
    Success: boolean;

    @Field()
    Message: string;

    @Field(() => String, { nullable: true })
    ServerVersion?: string;
}

// ─── Refresh Connector Schema (Phase 0 v5.39.x) ─────────────────────────────
// Invokes IntegrationConnectorCreationPipeline.Run() which drives
// TestConnection → IntrospectSchema (parallel describe) →
// PersistDiscoveredSchema (overlay precedence: declared wins for semantic,
// discovered wins for technical) → SoftPKClassifier (4-tier cascade) and emits
// structured progress events the operator can grep in the MJAPI log file:
//   "event":"discovery.object.added"  with source: Declared | Discovered | Custom
//   "event":"discovery.field.added"   ditto
//   "event":"pk.classifier.invoked"   per object missing an explicit PK
//   "event":"pk.classifier.result"    the classifier's verdict + strategy + reason
//   "event":"entity.generated"        IO has a PK → eligible for MJ entity generation
//   "event":"entity.skipped-no-pk"    IO has NO PK → not eligible, deferred
//
// Per-run JSONL artifacts also land at:
//   <cwd>/logs/integration-runs/<runID>/{manifest,progress,result}.json

@ObjectType()
class RefreshConnectorSchemaPKVerdictOutput {
    @Field() ObjectName: string;
    @Field() Confident: boolean;
    @Field({ nullable: true }) Nominee?: string;
    @Field() Confidence: number;
    @Field() Strategy: string;
    @Field() Reason: string;
}

@ObjectType()
class RefreshConnectorSchemaOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field() RunID: string;
    @Field({ nullable: true }) ObjectsCreated?: number;
    @Field({ nullable: true }) ObjectsUpdated?: number;
    @Field({ nullable: true }) FieldsCreated?: number;
    @Field({ nullable: true }) FieldsUpdated?: number;
    @Field(() => [RefreshConnectorSchemaPKVerdictOutput], { nullable: true }) PKVerdicts?: RefreshConnectorSchemaPKVerdictOutput[];
    @Field(() => [String], { nullable: true }) UnresolvedObjects?: string[];
    @Field({ nullable: true }) FailureMessage?: string;
}

// ─── Generate Integration Action (on-demand Integration-as-Actions) ─────────
// Generates + persists a strongly-typed Action (DriverClass='IntegrationActionExecutor')
// for one integration/object/verb (or all applicable verbs when verb is omitted) via
// the engine's IntegrationActionGenerator. Idempotent on the deterministic Action Name
// "<Integration> - <Verb> <DisplayName>": a matching Action is reused (AlreadyExisted=true)
// and its params/result codes reconciled rather than duplicated.

@ObjectType()
class IntegrationGenerateActionResult {
    @Field() Success: boolean;
    @Field({ nullable: true }) ActionID?: string;
    @Field({ nullable: true }) ActionName?: string;
    @Field() AlreadyExisted: boolean;
    @Field({ nullable: true }) Verb?: string;
    @Field({ nullable: true }) ObjectName?: string;
    @Field() Message: string;
}

@ObjectType()
class IntegrationGenerateActionOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [IntegrationGenerateActionResult], { nullable: true }) Results?: IntegrationGenerateActionResult[];
}

// --- Preview Data Types ---

@ObjectType()
class PreviewRecordOutput {
    @Field(() => String)
    Data: string; // JSON-serialized record fields
}

@ObjectType()
class PreviewDataOutput {
    @Field()
    Success: boolean;

    @Field()
    Message: string;

    @Field(() => [PreviewRecordOutput], { nullable: true })
    Records?: PreviewRecordOutput[];
}

// --- Schema Preview Types ---

@InputType()
class SchemaPreviewObjectInput {
    @Field({ nullable: true, description: 'Source object name. Required if SourceObjectID is not provided.' })
    SourceObjectName: string;

    @Field({ nullable: true, description: 'Source object ID (IntegrationObject.ID). Takes priority over SourceObjectName when provided.' })
    SourceObjectID?: string;

    @Field()
    SchemaName: string;

    @Field()
    TableName: string;

    @Field()
    EntityName: string;

    @Field(() => [String], { nullable: true, description: 'Optional field selection. If provided, only these source fields are included. Default = all fields.' })
    Fields?: string[];
}

@ObjectType()
class SchemaPreviewFileOutput {
    @Field()
    FilePath: string;

    @Field()
    Content: string;

    @Field()
    Description: string;
}

@ObjectType()
class SchemaPreviewOutput {
    @Field()
    Success: boolean;

    @Field()
    Message: string;

    @Field(() => [SchemaPreviewFileOutput], { nullable: true })
    Files?: SchemaPreviewFileOutput[];

    @Field(() => [String], { nullable: true })
    Warnings?: string[];
}

// --- Default Configuration Types ---

@ObjectType()
class DefaultFieldMappingOutput {
    @Field()
    SourceFieldName: string;

    @Field()
    DestinationFieldName: string;

    @Field({ nullable: true })
    IsKeyField?: boolean;
}

@ObjectType()
class DefaultObjectConfigOutput {
    @Field()
    SourceObjectName: string;

    @Field()
    TargetTableName: string;

    @Field()
    TargetEntityName: string;

    @Field()
    SyncEnabled: boolean;

    @Field(() => [DefaultFieldMappingOutput])
    FieldMappings: DefaultFieldMappingOutput[];
}

@ObjectType()
class DefaultConfigOutput {
    @Field()
    Success: boolean;

    @Field()
    Message: string;

    @Field({ nullable: true })
    DefaultSchemaName?: string;

    @Field(() => [DefaultObjectConfigOutput], { nullable: true })
    DefaultObjects?: DefaultObjectConfigOutput[];
}

// ─── Integration Management Input/Output Types ─────────────────────────────

@InputType()
class CreateConnectionInput {
    @Field() IntegrationID: string;
    @Field() CompanyID: string;
    @Field() CredentialTypeID: string;
    @Field() CredentialName: string;
    @Field() CredentialValues: string;
    @Field({ nullable: true }) ExternalSystemID?: string;
    @Field({ nullable: true }) Configuration?: string;
}

@ObjectType()
class CreateConnectionPipelineSummary {
    @Field() RunID: string;
    @Field() ObjectsCreated: number;
    @Field() ObjectsUpdated: number;
    @Field() FieldsCreated: number;
    @Field() FieldsUpdated: number;
    @Field(() => [String]) UnresolvedObjects: string[];
    @Field(() => [RefreshConnectorSchemaPKVerdictOutput], { nullable: true }) PKVerdicts?: RefreshConnectorSchemaPKVerdictOutput[];
}

@ObjectType()
class CreateConnectionOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) CompanyIntegrationID?: string;
    @Field({ nullable: true }) CredentialID?: string;
    @Field({ nullable: true }) ConnectionTestSuccess?: boolean;
    @Field({ nullable: true }) ConnectionTestMessage?: string;
    /**
     * Schema-refresh pipeline result. Populated when the resolver auto-runs
     * IntegrationConnectorCreationPipeline after a successful TestConnection.
     * Use to drive the wizard's next step (show user how many IOs were live-
     * discovered, what's still PK-less, etc).
     */
    @Field(() => CreateConnectionPipelineSummary, { nullable: true }) SchemaRefresh?: CreateConnectionPipelineSummary;
}

@ObjectType()
class MutationResultOutput {
    @Field() Success: boolean;
    @Field() Message: string;
}

// ─── Typed sync-config (rate-limit / concurrency / time-budget as STRUCTURED fields, not a raw
//     Configuration JSON blob). These map to the CompanyIntegration.Configuration keys the engine
//     reads at runtime, so they are customizable per-connection via the API instead of hidden code
//     constants. Set merges (preserves other Configuration keys); Get reads them back typed. ──────
@InputType()
class IntegrationSyncConfigInput {
    @Field(() => Int, { nullable: true, description: 'Entity maps processed concurrently within a dependency layer (clamped 1-16). Default 1 (sequential).' }) SyncConcurrency?: number;
    @Field(() => Int, { nullable: true, description: 'Upper bound the per-layer AIMD controller ramps toward. Default = connector MaxConcurrencyHint.' }) MaxConcurrency?: number;
    @Field(() => Float, { nullable: true, description: 'Override the source rate limit (requests/sec). Default = connector RateLimitPolicy / derived.' }) RateLimitTokensPerSec?: number;
    @Field(() => Int, { nullable: true, description: 'Override the rate-limiter burst capacity (tokens).' }) RateLimitBurst?: number;
    @Field(() => Boolean, { nullable: true, description: '§4 cross-layer pipelining: a child map starts when ITS parents finish, not the whole layer.' }) CrossLayerPipeline?: boolean;
    @Field(() => Boolean, { nullable: true, description: 'Merkle/partition hash-diff reconcile for watermark-less change detection (buffers the set in RAM).' }) PartitionReconcile?: boolean;
    @Field(() => Int, { nullable: true, description: 'Time budget (ms) for stage-2 streaming field discovery before it stops and uses what it gathered.' }) DiscoveryTimeBudgetMs?: number;
    @Field(() => Int, { nullable: true, description: 'Batch size for stage-2 streaming field discovery (records per FetchChanges page). Default 500.' }) DiscoveryBatchSize?: number;
    @Field(() => Int, { nullable: true, description: 'Max records sampled in stage-2 streaming field discovery (a column corpus + PK guess; NOT a full scan). Default 500.' }) DiscoveryMaxRecords?: number;
    @Field(() => Boolean, { nullable: true, description: '§7 Comprehensive refresh deactivates Declared objects/fields ABSENT from an AUTHORITATIVE discovery (reversible). Default false.' }) DeactivateAbsent?: boolean;
    // NOTE: §B table/column caps (MJ_INTEGRATION_MAX_TABLES / _MAX_COLUMNS_PER_TABLE) are DELIBERATELY NOT here —
    // they are operator/env guardrails, not per-connection user settings (a user-raisable cap is toothless).
}

@ObjectType()
class IntegrationSyncConfigOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => Int, { nullable: true }) SyncConcurrency?: number;
    @Field(() => Int, { nullable: true }) MaxConcurrency?: number;
    @Field(() => Float, { nullable: true }) RateLimitTokensPerSec?: number;
    @Field(() => Int, { nullable: true }) RateLimitBurst?: number;
    @Field(() => Boolean, { nullable: true }) CrossLayerPipeline?: boolean;
    @Field(() => Boolean, { nullable: true }) PartitionReconcile?: boolean;
    @Field(() => Int, { nullable: true }) DiscoveryTimeBudgetMs?: number;
    @Field(() => Int, { nullable: true }) DiscoveryBatchSize?: number;
    @Field(() => Int, { nullable: true }) DiscoveryMaxRecords?: number;
    @Field(() => Boolean, { nullable: true }) DeactivateAbsent?: boolean;
}

@ObjectType()
class CustomColumnCandidate {
    @Field() EntityName: string;
    /** The source field key as captured in the overflow column. */
    @Field() SourceKey: string;
    /** The sanitized, collision-resolved column name that would be created. */
    @Field() ColumnName: string;
    /** Inferred schema-field type family ('string' | 'number' | 'boolean' | 'datetime'). */
    @Field() InferredType: string;
    /** true = the real column does not exist yet (ADD COLUMN); false = recovery (column exists, mapping missing). */
    @Field() NeedsColumn: boolean;
}

@ObjectType()
class CustomColumnCandidatesOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [CustomColumnCandidate]) Candidates: CustomColumnCandidate[];
}

@ObjectType()
class PromotedColumn {
    @Field() EntityName: string;
    @Field() ColumnName: string;
}

@ObjectType()
class PromoteCustomColumnsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field() Promoted: boolean;
    @Field(() => [PromotedColumn]) ColumnsAdded: PromotedColumn[];
    /** true when an RSU schema change ran (a server restart may be pending to expose the new columns). */
    @Field() SchemaUpdatePending: boolean;
}

@InputType()
class FieldMapInput {
    @Field() SourceFieldName: string;
    @Field() DestinationFieldName: string;
    @Field({ nullable: true, defaultValue: false }) IsKeyField?: boolean;
    @Field({ nullable: true, defaultValue: false }) IsRequired?: boolean;
}

@InputType()
class EntityMapInput {
    @Field() ExternalObjectName: string;
    @Field({ nullable: true }) EntityName?: string;
    @Field({ nullable: true }) EntityID?: string;
    @Field({ nullable: true, defaultValue: 'Pull' }) SyncDirection?: string;
    @Field({ nullable: true, defaultValue: 0 }) Priority?: number;
    /** Per-map engine config JSON (e.g. {"partitionReconcile":true,"partitionCount":256}). GQL-set so it's the source of truth. */
    @Field({ nullable: true }) Configuration?: string;
    @Field(() => [FieldMapInput], { nullable: true }) FieldMaps?: FieldMapInput[];
}

@ObjectType()
class EntityMapCreatedOutput {
    @Field() EntityMapID: string;
    @Field() ExternalObjectName: string;
    @Field() FieldMapCount: number;
}

@ObjectType()
class CreateEntityMapsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [EntityMapCreatedOutput], { nullable: true }) Created?: EntityMapCreatedOutput[];
}

@ObjectType()
class StartSyncOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) RunID?: string;
}

@ObjectType()
class WriteRecordOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) ExternalID?: string;
    @Field({ nullable: true }) StatusCode?: number;
}

@InputType()
class CreateScheduleInput {
    @Field() CompanyIntegrationID: string;
    @Field() Name: string;
    @Field() CronExpression: string;
    @Field({ nullable: true }) Timezone?: string;
    @Field({ nullable: true }) Description?: string;
    @Field({ nullable: true }) SyncDirection?: string;
    @Field({ nullable: true }) FullSync?: boolean;
    /** §13 — 'sync' (default; moves data via RunSync) or 'discovery' (schema-only RefreshConnectorSchema on cron, evolving the IO/IOF catalog — no RSU, no data sync). */
    @Field({ nullable: true, defaultValue: 'sync' }) JobKind?: string;
    /** Discovery-job only: deactivate objects/fields absent from an authoritative refresh (reversible). Default true. */
    @Field({ nullable: true }) DeactivateAbsent?: boolean;
}

@ObjectType()
class CreateScheduleOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) ScheduledJobID?: string;
}

@ObjectType()
class ScheduleSummaryOutput {
    @Field() ID: string;
    @Field() Name: string;
    @Field({ nullable: true }) Status?: string;
    @Field({ nullable: true }) CronExpression?: string;
    @Field({ nullable: true }) Timezone?: string;
    @Field({ nullable: true }) NextRunAt?: string;
    @Field({ nullable: true }) LastRunAt?: string;
    @Field({ nullable: true }) RunCount?: number;
    @Field({ nullable: true }) SuccessCount?: number;
    @Field({ nullable: true }) FailureCount?: number;
}

@ObjectType()
class ListSchedulesOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ScheduleSummaryOutput], { nullable: true }) Schedules?: ScheduleSummaryOutput[];
}

@InputType()
class EntityMapUpdateInput {
    @Field() EntityMapID: string;
    @Field({ nullable: true }) SyncDirection?: string;
    @Field({ nullable: true }) Priority?: number;
    @Field({ nullable: true }) Status?: string;
    /** Per-map engine config JSON (e.g. {"partitionReconcile":true}). GQL is the source of truth. */
    @Field({ nullable: true }) Configuration?: string;
}

@ObjectType()
class EntityMapSummaryOutput {
    @Field() ID: string;
    @Field({ nullable: true }) EntityID?: string;
    @Field({ nullable: true }) Entity?: string;
    @Field({ nullable: true }) ExternalObjectName?: string;
    @Field({ nullable: true }) SyncDirection?: string;
    @Field({ nullable: true }) Priority?: number;
    @Field({ nullable: true }) Status?: string;
    /** Per-map engine config JSON (partitionReconcile, etc.) so callers can read the source of truth. */
    @Field({ nullable: true }) Configuration?: string;
}

@ObjectType()
class ListEntityMapsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [EntityMapSummaryOutput], { nullable: true }) EntityMaps?: EntityMapSummaryOutput[];
}

@ObjectType()
class IntegrationStatusOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) IsActive?: boolean;
    @Field({ nullable: true }) IntegrationName?: string;
    @Field({ nullable: true }) CompanyIntegrationID?: string;
    @Field({ nullable: true }) TotalEntityMaps?: number;
    @Field({ nullable: true }) ActiveEntityMaps?: number;
    @Field({ nullable: true }) LastRunStatus?: string;
    @Field({ nullable: true }) LastRunStartedAt?: string;
    @Field({ nullable: true }) LastRunEndedAt?: string;
    @Field({ nullable: true }) ScheduleEnabled?: boolean;
    // RSU pipeline state
    @Field({ nullable: true }) RSUEnabled?: boolean;
    @Field({ nullable: true }) RSURunning?: boolean;
    @Field({ nullable: true }) RSUOutOfSync?: boolean;
    @Field({ nullable: true }) RSULastRunAt?: string;
    @Field({ nullable: true }) RSULastRunResult?: string;
}

@ObjectType()
class SyncRunEntityDetail {
    @Field() EntityName: string;
    @Field() InsertCount: number;
    @Field() UpdateCount: number;
    @Field() SkipCount: number;
    @Field() ErrorCount: number;
}

@ObjectType()
class SyncRunSummaryOutput {
    @Field() ID: string;
    @Field({ nullable: true }) Status?: string;
    @Field({ nullable: true }) StartedAt?: string;
    @Field({ nullable: true }) EndedAt?: string;
    @Field({ nullable: true }) TotalRecords?: number;
    @Field({ nullable: true }) RunByUserID?: string;
    @Field(() => [SyncRunEntityDetail], { nullable: true }) EntityDetails?: SyncRunEntityDetail[];
}

@ObjectType()
class SyncHistoryOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [SyncRunSummaryOutput], { nullable: true }) Runs?: SyncRunSummaryOutput[];
}

@ObjectType()
class OperationProgressOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) OperationType?: string; // 'sync' | 'rsu' | 'none'
    @Field({ nullable: true }) IsRunning?: boolean;
    @Field({ nullable: true }) CurrentEntity?: string;
    @Field({ nullable: true }) EntityMapsTotal?: number;
    @Field({ nullable: true }) EntityMapsCompleted?: number;
    @Field({ nullable: true }) RecordsProcessed?: number;
    @Field({ nullable: true }) RecordsCreated?: number;
    @Field({ nullable: true }) RecordsUpdated?: number;
    @Field({ nullable: true }) RecordsErrored?: number;
    @Field({ nullable: true }) RSUStep?: string;
    @Field({ nullable: true }) RSURunning?: boolean;
    @Field({ nullable: true }) ElapsedMs?: number;
    @Field({ nullable: true }) StartedAt?: string;
}

// ── STRUCTURED RUN ARTIFACTS (durable JSONL progress streams) ─────────
// These expose the IntegrationProgressReader over GraphQL so a tenant can ask,
// at any time, "what exactly happened (or is happening) on this run?" — backed
// by the append-only <cwd>/logs/integration-runs/<runID>/progress.jsonl files
// that survive an MJAPI restart and grow as the run progresses. Poll
// IntegrationTailRunEvents(runID, sinceSeq) to follow a live run incrementally.

@ObjectType()
class IntegrationRunCountsOutput {
    @Field({ nullable: true }) Processed?: number;
    @Field({ nullable: true }) Succeeded?: number;
    @Field({ nullable: true }) Failed?: number;
    @Field({ nullable: true }) Skipped?: number;
    @Field({ nullable: true }) TotalKnown?: number;
}

@ObjectType()
class IntegrationRunSummaryArtifactOutput {
    @Field() RunID: string;
    @Field() RunKind: string;
    @Field({ nullable: true }) IntegrationID?: string;
    @Field({ nullable: true }) CompanyIntegrationID?: string;
    @Field({ nullable: true }) ObjectName?: string;
    @Field({ nullable: true }) TriggerType?: string;
    @Field() StartedAt: string;
    @Field() IsInFlight: boolean;
    @Field() EventCount: number;
    @Field({ nullable: true }) Success?: boolean;
    @Field({ nullable: true }) ExitReason?: string;
    @Field({ nullable: true }) CompletedAt?: string;
    @Field({ nullable: true }) DurationMs?: number;
    @Field({ nullable: true }) LatestEventType?: string;
    @Field({ nullable: true }) LatestMessage?: string;
    @Field(() => IntegrationRunCountsOutput, { nullable: true }) Counts?: IntegrationRunCountsOutput;
    /** Count of non-fatal warnings surfaced during the run (e.g. a second-layer object that found zero parents). Warnings never fail the run, but they make silent-empty conditions visible. */
    @Field({ nullable: true }) WarningCount?: number;
    /** Human-readable warnings ("[CODE] stage: message") so a tenant can see exactly what was flagged without paging the full event stream. */
    @Field(() => [String], { nullable: true }) Warnings?: string[];
}

@ObjectType()
class IntegrationRunEventOutput {
    @Field() Ts: string;
    @Field() Seq: number;
    @Field() EventType: string;
    @Field({ nullable: true }) Level?: string;
    @Field({ nullable: true }) Stage?: string;
    @Field({ nullable: true }) Message?: string;
    @Field(() => IntegrationRunCountsOutput, { nullable: true }) Counts?: IntegrationRunCountsOutput;
    /** Subsystem-specific payload, JSON-encoded (clients JSON.parse). */
    @Field({ nullable: true }) DataJSON?: string;
    /** Resumable-state payload on checkpoint events, JSON-encoded. */
    @Field({ nullable: true }) ResumableStateJSON?: string;
}

@ObjectType()
class IntegrationListRunsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [IntegrationRunSummaryArtifactOutput], { nullable: true }) Runs?: IntegrationRunSummaryArtifactOutput[];
}

@ObjectType()
class IntegrationRunDetailOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => IntegrationRunSummaryArtifactOutput, { nullable: true }) Run?: IntegrationRunSummaryArtifactOutput;
    @Field(() => [String], { nullable: true }) Errors?: string[];
}

@ObjectType()
class IntegrationRunEventsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [IntegrationRunEventOutput], { nullable: true }) Events?: IntegrationRunEventOutput[];
    /** Highest sequence returned — pass back as sinceSeq to poll for more. */
    @Field() LatestSeq: number;
    /** True while the run is still active — keep polling until false. */
    @Field() IsInFlight: boolean;
}

// Sync progress is now tracked inside IntegrationEngine itself via IntegrationEngine.GetSyncProgress()

@ObjectType()
class ConnectionSummaryOutput {
    @Field() ID: string;
    @Field() IntegrationName: string;
    @Field() IntegrationID: string;
    @Field() CompanyID: string;
    @Field({ nullable: true }) Company?: string;
    @Field() IsActive: boolean;
    @Field() ScheduleEnabled: boolean;
    @Field({ nullable: true }) CronExpression?: string;
    @Field() CreatedAt: string;
}

@ObjectType()
class ListConnectionsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ConnectionSummaryOutput], { nullable: true }) Connections?: ConnectionSummaryOutput[];
}

// --- Resolver ---

// ── Validation helpers for entity map union types ──────────────────────
const VALID_SYNC_DIRECTIONS = ['Bidirectional', 'Pull', 'Push'] as const;
type SyncDirection = typeof VALID_SYNC_DIRECTIONS[number];

function isValidSyncDirection(value: string): value is SyncDirection {
    return (VALID_SYNC_DIRECTIONS as readonly string[]).includes(value);
}

const VALID_ENTITY_MAP_STATUSES = ['Active', 'Inactive'] as const;
type EntityMapStatus = typeof VALID_ENTITY_MAP_STATUSES[number];

function isValidEntityMapStatus(value: string): value is EntityMapStatus {
    return (VALID_ENTITY_MAP_STATUSES as readonly string[]).includes(value);
}

// IntegrationActionVerb is the engine-defined union ('Get'|'Create'|'Update'|'Delete'|'Search'|'List').
const VALID_INTEGRATION_ACTION_VERBS = ['Get', 'Create', 'Update', 'Delete', 'Search', 'List'] as const;

function isValidIntegrationActionVerb(value: string): value is IntegrationActionVerb {
    return (VALID_INTEGRATION_ACTION_VERBS as readonly string[]).includes(value);
}

// ─── List Source Objects (Full-Catalog Picker) ──────────────────────────────
// Returns every object the source system exposes (e.g. all ~1,800 Salesforce
// sobjects), merged with any existing IntegrationObject metadata so the UI
// can show which objects are already registered versus newly discoverable.
// Intentionally cheap: one global describe call, no per-object describes.

@ObjectType()
class ListSourceObjectsItem {
    @Field() Name: string;
    @Field() Label: string;
    @Field({ nullable: true }) Description?: string;
    @Field() SupportsIncrementalSync: boolean;
    @Field() SupportsWrite: boolean;
    /** True when an IntegrationObject row already exists for this object. */
    @Field() AlreadyPersisted: boolean;
    /** IntegrationObject.ID — populated only when AlreadyPersisted is true. */
    @Field({ nullable: true }) IntegrationObjectID?: string;
    /** True when the source system flags this as user/custom (e.g. SF __c names). */
    @Field() IsCustom: boolean;
}

@ObjectType()
class ListSourceObjectsOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field(() => [ListSourceObjectsItem], { nullable: true }) Objects?: ListSourceObjectsItem[];
}

/**
 * GraphQL resolver for integration discovery operations.
 * Provides endpoints to test connections, discover objects, and discover fields
 * on external systems via their registered connectors.
 */
@Resolver()
export class IntegrationDiscoveryResolver extends ResolverBase {

    /**
     * Lists all registered integration connectors (active by default).
     * Useful for populating connector selection UIs.
     */
    @Query(() => DiscoverConnectorsOutput)
    async IntegrationDiscoverConnectors(
        @Arg("companyID", { nullable: true }) companyID: string,
        @Ctx() ctx: AppContext
    ): Promise<DiscoverConnectorsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            const result = await rv.RunView<MJIntegrationEntity>({
                EntityName: 'MJ: Integrations',
                ExtraFilter: '',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            }, user);

            if (!result.Success) return { Success: false, Message: result.ErrorMessage || 'Query failed' };

            return {
                Success: true,
                Message: `${result.Results.length} connectors available`,
                Connectors: result.Results
                    .map(r => ({
                        IntegrationID: r.ID,
                        Name: r.Name,
                        Description: r.Description,
                        ClassName: r.ClassName,
                        IsActive: true
                    }))
            };
        } catch (e) {
            LogError(`IntegrationDiscoverConnectors error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Discovers available objects/tables in the external system.
     */
    @Query(() => DiscoverObjectsOutput)
    async IntegrationDiscoverObjects(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<DiscoverObjectsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            // Cast through unknown to bridge duplicate package type declarations
            // (integration-engine resolves its own node_modules copies of core/core-entities)
            const discoverObjects = connector.DiscoverObjects.bind(connector) as
                (ci: unknown, u: unknown) => Promise<ExternalObjectSchema[]>;
            const objects = await discoverObjects(companyIntegration, user);

            return {
                Success: true,
                Message: `Discovered ${objects.length} objects`,
                Objects: objects.map(o => ({
                    ID: o.ID,
                    Name: o.Name,
                    Label: o.Label,
                    SupportsIncrementalSync: o.SupportsIncrementalSync,
                    SupportsWrite: o.SupportsWrite
                }))
            };
        } catch (e) {
            return this.handleDiscoveryError(e);
        }
    }

    /**
     * Full-catalog picker endpoint: returns every object the source system
     * exposes (e.g. all ~1,800 Salesforce sobjects) merged with flags showing
     * which ones already have IntegrationObject rows in MJ. Cheap by design —
     * one global discovery call per source, no per-object describes. Per-object
     * describe runs later, at selection time, inside IntegrationApplyAllBatch.
     */
    @Query(() => ListSourceObjectsOutput)
    async IntegrationListSourceObjects(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<ListSourceObjectsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            // Use the engine cache for already-persisted IntegrationObject
            // rows — single in-memory read instead of a per-call DB roundtrip.
            await IntegrationEngine.Instance.Config(false, user);
            const existingObjects = IntegrationEngineBase.Instance
                .GetIntegrationObjectsByIntegrationID(companyIntegration.IntegrationID);

            const discoverObjects = connector.DiscoverObjects.bind(connector) as
                (ci: unknown, u: unknown) => Promise<ExternalObjectSchema[]>;
            const liveObjects = await discoverObjects(companyIntegration, user);

            const existingByName = new Map<string, { ID: string; IsCustom: boolean }>();
            for (const row of existingObjects) {
                existingByName.set(row.Name, { ID: row.ID, IsCustom: !!row.IsCustom });
            }

            // Live is SoT. When the probe succeeds, show only live objects
            // (the persisted IntegrationObject ID is overlaid by name when
            // there's a match). When the probe returns nothing (transient
            // SI failure, rate limit, expired session), fall back to the
            // engine cache so the user isn't stuck with an empty picker.
            const sourceObjects = liveObjects.length > 0
                ? liveObjects
                : existingObjects.map(row => ({
                    Name: row.Name,
                    Label: row.Name,
                    Description: undefined,
                    SupportsIncrementalSync: true,
                    SupportsWrite: true,
                  }) as ExternalObjectSchema);

            const merged: ListSourceObjectsItem[] = sourceObjects.map(o => {
                const existing = existingByName.get(o.Name);
                return {
                    Name: o.Name,
                    Label: o.Label,
                    Description: o.Description,
                    SupportsIncrementalSync: o.SupportsIncrementalSync,
                    SupportsWrite: o.SupportsWrite,
                    AlreadyPersisted: existing != null,
                    IntegrationObjectID: existing?.ID,
                    IsCustom: this.isCustomObjectName(o.Name, existing?.IsCustom),
                };
            });
            merged.sort((a, b) => a.Name.localeCompare(b.Name));

            return {
                Success: true,
                Message: `Listed ${merged.length} source objects (${liveObjects.length} from live probe, ${existingByName.size} already persisted)`,
                Objects: merged,
            };
        } catch (e) {
            LogError(`IntegrationListSourceObjects error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    private async loadIntegrationObjectsByIntegrationID(
        integrationID: string,
        user: UserInfo
    ): Promise<Array<{ ID: string; Name: string; IsCustom: boolean }>> {
        const rv = new RunView();
        const result = await rv.RunView<MJIntegrationObjectEntity>({
            EntityName: 'MJ: Integration Objects',
            ExtraFilter: `IntegrationID='${integrationID}'`,
            ResultType: 'entity_object',
        }, user);
        if (!result.Success) {
            LogError(`loadIntegrationObjectsByIntegrationID failed: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results.map(r => ({
            ID: r.ID,
            Name: r.Name,
            IsCustom: r.IsCustom === true,
        }));
    }

    /**
     * Heuristic for flagging custom objects in the UI. Existing rows carry an
     * IsCustom column; newly-discovered ones don't, so fall back to the SF
     * `__c` suffix convention (harmless on systems where it doesn't apply).
     */
    private isCustomObjectName(name: string, existingIsCustom: boolean | undefined): boolean {
        if (existingIsCustom != null) return existingIsCustom;
        return name.endsWith('__c');
    }

    /**
     * Discovers fields on a specific external object.
     */
    @Query(() => DiscoverFieldsOutput)
    async IntegrationDiscoverFields(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("objectName") objectName: string,
        @Ctx() ctx: AppContext
    ): Promise<DiscoverFieldsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            // Cast through unknown to bridge duplicate package type declarations
            const discoverFields = connector.DiscoverFields.bind(connector) as
                (ci: unknown, obj: string, u: unknown) => Promise<ExternalFieldSchema[]>;
            const fields = await discoverFields(companyIntegration, objectName, user);

            return {
                Success: true,
                Message: `Discovered ${fields.length} fields on "${objectName}"`,
                Fields: fields.map(f => ({
                    Name: f.Name,
                    Label: f.Label,
                    DataType: f.DataType,
                    IsRequired: f.IsRequired,
                    IsUniqueKey: f.IsUniqueKey,
                    IsReadOnly: f.IsReadOnly
                }))
            };
        } catch (e) {
            return this.handleDiscoveryError(e);
        }
    }

    /**
     * Tests connectivity to the external system.
     */
    @Query(() => ConnectionTestOutput)
    async IntegrationTestConnection(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<ConnectionTestOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            // Cast through unknown to bridge duplicate package type declarations
            const testConnection = connector.TestConnection.bind(connector) as
                (ci: unknown, u: unknown) => Promise<ConnectionTestResult>;
            const result = await testConnection(companyIntegration, user);

            return {
                Success: result.Success,
                Message: result.Message,
                ServerVersion: result.ServerVersion
            };
        } catch (e) {
            LogError(`IntegrationTestConnection error: ${this.formatError(e)}`);
            return {
                Success: false,
                Message: `Error: ${this.formatError(e)}`
            };
        }
    }

    /**
     * Refreshes the connector's IntegrationObject + IntegrationObjectField
     * catalog by running the Phase 0 v5.39.x IntegrationConnectorCreationPipeline.
     * The pipeline:
     *   1. TestConnection      — validates credentials before any heavy work.
     *   2. IntrospectSchema    — parallel describe across all objects.
     *   3. PersistDiscoveredSchema — overlay-aware upsert (declared wins for
     *      semantic, discovered wins for technical attributes), populates
     *      MetadataSource and per-attribute AttributeWinners.
     *   4. PKClassify          — SoftPKClassifier 4-tier cascade for any IO
     *      that still lacks an explicit PK marker.
     *
     * Structured progress events ride the IntegrationProgressEmitter and land
     * both on stdout (visible in the MJAPI log file) and in a per-run
     * `<cwd>/logs/integration-runs/<runID>/progress.jsonl` artifact.
     */
    @Mutation(() => RefreshConnectorSchemaOutput)
    async IntegrationRefreshConnectorSchema(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("universalPKConvention", { nullable: true, description: "Optional vendor-wide PK convention hint (e.g. 'id' for HubSpot)" }) universalPKConvention: string | undefined,
        @Arg("deactivateAbsent", { nullable: true, description: "Comprehensive refresh (default true): objects/fields ABSENT from this discovery are deactivated (Status='Disabled', never deleted, reversible on a later rediscovery). Pass false for a scoped/partial discovery so it never disables what it didn't probe." }) deactivateAbsent: boolean | undefined,
        @Ctx() ctx: AppContext
    ): Promise<RefreshConnectorSchemaOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            const pipeline = new IntegrationConnectorCreationPipeline();
            // Cast through unknown — duplicate package type declarations
            // between integration-engine's resolved core-entities and this
            // resolver's resolved core-entities (same shape, different
            // identities at type level).
            const runOpts = {
                Connector: connector,
                CompanyIntegration: companyIntegration,
                ContextUser: user,
                Provider: provider,
                UniversalPKConvention: universalPKConvention || undefined,
                ConsoleMirror: true,
                TriggerType: 'Manual' as const,
                // §7 — explicit RefreshConnectorSchema is a comprehensive re-discovery: default to
                // deactivating objects/fields the source no longer exposes (reversible). Precedence:
                // explicit arg > persisted Configuration.deactivateAbsent (set via IntegrationSetSyncConfig) >
                // comprehensive default (true). Caller can opt out per-call or per-connection.
                DeactivateAbsent: deactivateAbsent ?? this.readConfigBool(companyIntegration.Configuration, 'deactivateAbsent') ?? true,
            };
            const result = await pipeline.Run(runOpts as unknown as Parameters<typeof pipeline.Run>[0]);

            // Refresh the metadata cache so subsequent reads see the new IO/IOF
            // rows the pipeline just wrote.  Without this the engine returns the
            // pre-pipeline snapshot until the next process bootstrap.
            const md = provider ?? new Metadata();
            await md.Refresh();
            await IntegrationEngine.Instance.Config(true, user, provider);

            return {
                Success: result.Success,
                Message: result.Success
                    ? `Refresh complete: ${result.PersistResult?.ObjectsCreated ?? 0} created, ${result.PersistResult?.ObjectsUpdated ?? 0} updated, ${result.UnresolvedObjects.length} IOs still PK-less (deferred to additionalSchemaInfo authoring)`
                    : `Refresh failed: ${result.FailureMessage ?? 'unknown error'}`,
                RunID: result.RunID,
                ObjectsCreated: result.PersistResult?.ObjectsCreated,
                ObjectsUpdated: result.PersistResult?.ObjectsUpdated,
                FieldsCreated: result.PersistResult?.FieldsCreated,
                FieldsUpdated: result.PersistResult?.FieldsUpdated,
                PKVerdicts: result.PKVerdicts.map(v => ({
                    ObjectName: v.ObjectName,
                    Confident: v.Confident,
                    Nominee: v.Nominee,
                    Confidence: v.Confidence,
                    Strategy: v.Strategy,
                    Reason: v.Reason,
                })),
                UnresolvedObjects: result.UnresolvedObjects,
                FailureMessage: result.FailureMessage,
            };
        } catch (e) {
            LogError(`IntegrationRefreshConnectorSchema error: ${this.formatError(e)}`);
            return {
                Success: false,
                Message: `Error: ${this.formatError(e)}`,
                RunID: 'error',
            };
        }
    }

    /**
     * Generates + persists strongly-typed Action metadata on demand for an
     * integration object. When `verb` is supplied, a single Action is generated
     * for that (integration, object, verb); when omitted, all applicable verbs
     * for the object are generated (Get/Search/List always, Create/Update/Delete
     * only when the object supports writes).
     *
     * Idempotent: each generated Action is keyed on the deterministic Name
     * "<Integration> - <Verb> <DisplayName>". An existing Action with that Name is
     * reused (AlreadyExisted=true) and its params/result codes reconciled rather
     * than duplicated. Generated Actions use DriverClass='IntegrationActionExecutor'
     * and carry routing info ({IntegrationName, ObjectName, Verb}) in Action.Config_;
     * the IntegrationActionExecutor (CoreActions) is the single runtime dispatcher.
     */
    @Mutation(() => IntegrationGenerateActionOutput)
    async IntegrationGenerateAction(
        @Arg("integrationName") integrationName: string,
        @Arg("objectName") objectName: string,
        @Arg("verb", { nullable: true, description: "Optional CRUD verb (Get|Create|Update|Delete|Search|List). Omit to generate all applicable verbs for the object." }) verb: string | undefined,
        @Ctx() ctx: AppContext
    ): Promise<IntegrationGenerateActionOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers) as unknown as IMetadataProvider;

            const generator = new IntegrationActionGenerator();
            const results = await this.runActionGenerator(generator, integrationName, objectName, verb, user, provider);

            return this.mapGenerateActionResults(results);
        } catch (e) {
            LogError(`IntegrationGenerateAction error: ${this.formatError(e)}`);
            return { Success: false, Message: `Error: ${this.formatError(e)}` };
        }
    }

    /**
     * Drives the engine's IntegrationActionGenerator: one verb when `verb` is a
     * valid value, all applicable verbs when it is omitted. Casts user/provider
     * through `unknown` at the boundary — integration-engine resolves its own copy
     * of core/core-entities, so the types are structurally identical but nominally
     * distinct (same bridge pattern used by IntegrationRefreshConnectorSchema).
     */
    private async runActionGenerator(
        generator: IntegrationActionGenerator,
        integrationName: string,
        objectName: string,
        verb: string | undefined,
        user: UserInfo,
        provider: IMetadataProvider
    ): Promise<GenerateIntegrationActionResult[]> {
        const u = user as unknown as Parameters<IntegrationActionGenerator['GenerateAction']>[3];
        const p = provider as unknown as Parameters<IntegrationActionGenerator['GenerateAction']>[4];

        if (verb != null && verb.length > 0) {
            if (!isValidIntegrationActionVerb(verb)) {
                throw new Error(`Invalid verb "${verb}". Must be one of: ${VALID_INTEGRATION_ACTION_VERBS.join(', ')}`);
            }
            const single = await generator.GenerateAction(integrationName, objectName, verb, u, p);
            return [single];
        }
        return generator.GenerateActionsForObject(integrationName, objectName, u, p);
    }

    /** Maps engine GenerateIntegrationActionResult[] into the GraphQL output shape. */
    private mapGenerateActionResults(results: GenerateIntegrationActionResult[]): IntegrationGenerateActionOutput {
        const mapped: IntegrationGenerateActionResult[] = results.map(r => ({
            Success: r.Success,
            ActionID: r.ActionID,
            ActionName: r.ActionName,
            AlreadyExisted: r.AlreadyExisted,
            Verb: r.Verb,
            ObjectName: r.ObjectName,
            Message: r.Message,
        }));

        const successCount = mapped.filter(r => r.Success).length;
        const overallSuccess = mapped.length > 0 && mapped.every(r => r.Success);

        return {
            Success: overallSuccess,
            Message: `Generated ${successCount}/${mapped.length} action(s)`,
            Results: mapped,
        };
    }

    /**
     * Returns the connector's default configuration for quick setup.
     * Not all connectors provide defaults — returns Success: false if unavailable.
     */
    @Query(() => DefaultConfigOutput)
    async IntegrationGetDefaultConfig(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<DefaultConfigOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector } = await this.resolveConnector(companyIntegrationID, user, provider);

            const config = connector.GetDefaultConfiguration();
            if (!config) {
                return {
                    Success: false,
                    Message: 'This connector does not provide a default configuration'
                };
            }

            return {
                Success: true,
                Message: `Default configuration with ${config.DefaultObjects.length} objects`,
                DefaultSchemaName: config.DefaultSchemaName,
                DefaultObjects: config.DefaultObjects.map(o => ({
                    SourceObjectName: o.SourceObjectName,
                    TargetTableName: o.TargetTableName,
                    TargetEntityName: o.TargetEntityName,
                    SyncEnabled: o.SyncEnabled,
                    FieldMappings: o.FieldMappings.map(f => ({
                        SourceFieldName: f.SourceFieldName,
                        DestinationFieldName: f.DestinationFieldName,
                        IsKeyField: f.IsKeyField
                    }))
                }))
            };
        } catch (e) {
            LogError(`IntegrationGetDefaultConfig error: ${this.formatError(e)}`);
            return {
                Success: false,
                Message: `Error: ${this.formatError(e)}`
            };
        }
    }

    /**
     * Generates a DDL preview for creating tables from discovered external objects.
     * Introspects the source schema and runs SchemaBuilder to produce migration SQL.
     */
    @Query(() => SchemaPreviewOutput)
    async IntegrationSchemaPreview(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("objects", () => [SchemaPreviewObjectInput]) objects: SchemaPreviewObjectInput[],
        @Arg("platform", { defaultValue: "sqlserver" }) platform: string,
        @Ctx() ctx: AppContext
    ): Promise<SchemaPreviewOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            // Introspect schema from the external system
            const introspect = connector.IntrospectSchema.bind(connector) as
                (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
            const sourceSchema = await introspect(companyIntegration, user);

            await this.resolveObjectInputs(objects, sourceSchema, user);

            const requestedNames = new Set(objects.map(o => o.SourceObjectName));
            const filteredSchema: SourceSchemaInfo = {
                Objects: sourceSchema.Objects.filter(o => requestedNames.has(o.ExternalName))
            };

            const validatedPlatform = this.validatePlatform(platform);
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, validatedPlatform, connector);

            // Run SchemaBuilder
            const input: SchemaBuilderInput = {
                SourceSchema: filteredSchema,
                TargetConfigs: targetConfigs,
                Platform: validatedPlatform,
                MJVersion: process.env.MJ_VERSION ?? '5.11.0',
                SourceType: companyIntegration.Integration,
                AdditionalSchemaInfoPath: process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH ?? 'additionalSchemaInfo.json',
                MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/rsu',
                MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
                ExistingTables: this.buildExistingTables(targetConfigs, provider),
                EntitySettingsForTargets: {}
            };

            const builder = new SchemaBuilder();
            const output = builder.BuildSchema(input);

            if (output.Errors.length > 0) {
                return {
                    Success: false,
                    Message: `Schema generation failed: ${output.Errors.join('; ')}`,
                    Warnings: output.Warnings
                };
            }

            const allFiles = [
                ...output.MigrationFiles,
                ...(output.AdditionalSchemaInfoUpdate ? [output.AdditionalSchemaInfoUpdate] : []),
                ...output.MetadataFiles
            ];

            return {
                Success: true,
                Message: `Generated ${allFiles.length} files`,
                Files: allFiles.map(f => ({
                    FilePath: f.FilePath,
                    Content: f.Content,
                    Description: f.Description
                })),
                Warnings: output.Warnings.length > 0 ? output.Warnings : undefined
            };
        } catch (e) {
            LogError(`IntegrationSchemaPreview error: ${this.formatError(e)}`);
            return {
                Success: false,
                Message: `Error: ${this.formatError(e)}`
            };
        }
    }

    /**
     * Fetches a small sample of records from an external object for preview purposes.
     * Uses the connector's FetchChanges with a small batch size and no watermark.
     */
    @Query(() => PreviewDataOutput)
    async IntegrationPreviewData(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("objectName") objectName: string,
        @Arg("limit", { defaultValue: 5 }) limit: number,
        @Ctx() ctx: AppContext
    ): Promise<PreviewDataOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            const fetchChanges = connector.FetchChanges.bind(connector) as
                (ctx: unknown) => Promise<{ Records: Array<{ ExternalID: string; ObjectType: string; Fields: Record<string, unknown> }>; HasMore: boolean }>;

            const result = await fetchChanges({
                CompanyIntegration: companyIntegration,
                ObjectName: objectName,
                WatermarkValue: null,
                BatchSize: Math.min(limit, 10),
                ContextUser: user
            });

            const truncated = result.Records.slice(0, limit);
            return {
                Success: true,
                Message: `Fetched ${truncated.length} preview records${result.Records.length > limit ? ` (truncated from ${result.Records.length})` : ''}`,
                Records: truncated.map(r => ({
                    Data: JSON.stringify(r.Fields)
                }))
            };
        } catch (e) {
            LogError(`IntegrationPreviewData error: ${this.formatError(e)}`);
            return {
                Success: false,
                Message: `Error: ${this.formatError(e)}`
            };
        }
    }

    // --- Private Helpers ---

    private buildTargetConfigs(
        objects: SchemaPreviewObjectInput[],
        sourceSchema: SourceSchemaInfo,
        platform: 'sqlserver' | 'postgresql',
        connector?: BaseIntegrationConnector
    ): TargetTableConfig[] {
        const mapper = new TypeMapper();

        // Build a lookup from the connector's static metadata for descriptions.
        // DB entities may not have Description populated yet on first run,
        // but the connector's GetIntegrationObjects() always has them.
        const connectorDescriptions = this.buildDescriptionLookup(connector);

        // Track all drop reasons so we can emit one summary line at the end
        // instead of forcing the caller to scan O(N) LogError lines to figure
        // out how many selections actually made it. The picker → ApplyAll →
        // RSU pipeline already had three layers of silent O(N) drops; this
        // makes them at least summarised.
        const droppedNotInSchema: string[] = [];
        const droppedNoFields: string[] = [];
        const droppedNoPrimaryKey: string[] = [];

        const results: TargetTableConfig[] = [];
        for (const obj of objects) {
            const sourceObj = sourceSchema.Objects.find(o => o.ExternalName.toLowerCase() === obj.SourceObjectName.toLowerCase());
            const objDescriptions = connectorDescriptions.get(obj.SourceObjectName.toLowerCase());

            // If the object wasn't discovered in IntrospectSchema (e.g. API error), skip it
            // rather than generating a broken table with no columns and a fallback PK.
            if (!sourceObj) {
                droppedNotInSchema.push(obj.SourceObjectName);
                LogError(`[buildTargetConfigs] Skipping "${obj.SourceObjectName}" — not found in source schema (IntrospectSchema may have failed for this object)`);
                continue;
            }

            // Filter fields if caller specified a subset
            const selectedFieldSet = obj.Fields?.length
                ? new Set(obj.Fields.map(f => f.toLowerCase()))
                : null;
            const sourceFields = sourceObj.Fields.filter(f =>
                !selectedFieldSet || selectedFieldSet.has(f.Name.toLowerCase()) || f.IsPrimaryKey
            );

            const columns: TargetColumnConfig[] = sourceFields.map(f => {
                const targetSqlType = mapper.MapSourceType(f.SourceType, platform, f);
                return {
                    SourceFieldName: f.Name,
                    TargetColumnName: f.Name.replace(/[^A-Za-z0-9_]/g, '_'),
                    TargetSqlType: targetSqlType,
                    // Synced shadow tables must NOT enforce NOT NULL on ANY
                    // column — including the PK. The external system (SF, HubSpot,
                    // GrowthZone, etc.) is the source of truth for business data,
                    // not for MJ's schema constraints — and its describe output
                    // often declares fields required when real records actually
                    // have nulls (deprecated, calculated, or edge-case fields).
                    // Integration PKs are SOFT (tracked via SchemaBuilder.SoftPrimaryKeys
                    // for upsert/dedup; identity falls back to a content-hash when the
                    // PK is null/partial — §4). Emitting the PK column NOT NULL breaks
                    // that fallback: a source row with a null PK (e.g. nested/derived
                    // records like event sponsors, contact phones) aborts the insert
                    // before content-hash can save it. So the soft-PK column is nullable
                    // too; uniqueness/identity is enforced logically, not by the DDL.
                    IsNullable: true,
                    MaxLength: f.MaxLength,
                    Precision: f.Precision,
                    Scale: f.Scale,
                    DefaultValue: this.formatSqlDefault(f.DefaultValue, targetSqlType),
                    Description: f.Description ?? objDescriptions?.fields.get(f.Name.toLowerCase()),
                };
            });

            const primaryKeyFields = sourceObj.Fields
                .filter(f => f.IsPrimaryKey)
                .map(f => f.Name.replace(/[^A-Za-z0-9_]/g, '_'));

            // If no columns were discovered, skip rather than generating a broken table
            // (DDL with UNIQUE ([ID]) on a non-existent column will always fail).
            if (columns.length === 0 && primaryKeyFields.length === 0) {
                droppedNoFields.push(obj.SourceObjectName);
                LogError(`[buildTargetConfigs] Skipping "${obj.SourceObjectName}" — 0 fields discovered (live API likely failed and no DB-cached fields available)`);
                continue;
            }

            // Provable-only: no PK we could prove from the streamed data (single OR composite) means
            // the object is NOT added — and we say so clearly. We never fabricate a key (e.g. "all
            // columns as the PK"); a wrong identity is worse than an honest omission. The fix for a
            // missing PK is to STREAM MORE DATA at discovery time so the stats can prove one, not to
            // invent a key here.
            if (primaryKeyFields.length === 0 && columns.length > 0) {
                droppedNoPrimaryKey.push(obj.SourceObjectName);
                const fieldNames = sourceObj.Fields.map(f => `${f.Name}(pk=${f.IsPrimaryKey})`).join(', ');
                LogError(`[buildTargetConfigs] Skipping "${obj.SourceObjectName}" — ${columns.length} columns but NO provable primary key. Fields: [${fieldNames}]`);
                continue;
            }

            results.push({
                SourceObjectName: obj.SourceObjectName,
                SchemaName: obj.SchemaName,
                TableName: obj.TableName,
                EntityName: obj.EntityName,
                Description: sourceObj.Description ?? objDescriptions?.objectDescription,
                Columns: columns,
                PrimaryKeyFields: primaryKeyFields,
                SoftForeignKeys: []
            });
        }

        // Single-line summary of every drop that happened during this call.
        // Without this, callers see N individual LogError lines and have to
        // count them by hand to know how much got lost. With it, the gap
        // between "selections requested" and "tables generated" is a one-line
        // grep target (`buildTargetConfigs summary`) that names which objects
        // were lost and why.
        const totalRequested = objects.length;
        const totalAccepted = results.length;
        const totalDropped = totalRequested - totalAccepted;
        if (totalDropped > 0) {
            const fmt = (arr: string[]): string =>
                arr.length === 0
                    ? '0'
                    : `${arr.length} (${arr.slice(0, 5).join(', ')}${arr.length > 5 ? `, +${arr.length - 5} more` : ''})`;
            console.warn(
                `[buildTargetConfigs summary] requested=${totalRequested}, accepted=${totalAccepted}, dropped=${totalDropped} ` +
                `(notInSchema=${fmt(droppedNotInSchema)}, noFields=${fmt(droppedNoFields)}, noPK=${fmt(droppedNoPrimaryKey)})`
            );
        } else {
            console.log(`[buildTargetConfigs summary] requested=${totalRequested}, accepted=${totalAccepted} (all selections produced target configs)`);
        }
        return results;
    }

    /** Builds a lookup of object name → { objectDescription, fields: fieldName → description } from the connector's static metadata. */
    /** Build ExistingTableInfo[] from MJ Metadata for tables that already exist in the target schemas. */
    private buildExistingTables(targetConfigs: TargetTableConfig[], provider: IMetadataProvider): ExistingTableInfo[] {
        const result: ExistingTableInfo[] = [];
        for (const config of targetConfigs) {
            const entity = provider.Entities.find(e =>
                e.SchemaName.toLowerCase() === config.SchemaName.toLowerCase() &&
                e.BaseTable.toLowerCase() === config.TableName.toLowerCase()
            );
            if (entity) {
                result.push({
                    SchemaName: config.SchemaName,
                    TableName: config.TableName,
                    Columns: entity.Fields.map(f => ({
                        Name: f.Name,
                        SqlType: f.SQLFullType || 'NVARCHAR(MAX)',
                        IsNullable: f.AllowsNull,
                        MaxLength: f.MaxLength,
                        Precision: f.Precision,
                        Scale: f.Scale,
                    }))
                });
            }
        }
        return result;
    }

    /**
     * Format a raw default-value from source schema (SF describe, etc.) into a
     * SQL-literal string appropriate for the target column's SQL type.
     *
     * The DDLGenerator splats DefaultValue raw into `... DEFAULT ${value}`, so
     * the caller MUST pre-quote/pre-coerce. Previously this layer passed SF's
     * `String(defaultValue)` through unchanged, which produced invalid T-SQL
     * like `DEFAULT false` on BIT columns and `DEFAULT Diagonal` on strings.
     *
     * Rules:
     *  - null/undefined/empty → undefined (no DEFAULT clause emitted)
     *  - Known SQL expressions (GETDATE(), CURRENT_TIMESTAMP, NEWID(), NULL) → pass through
     *  - Numeric-looking strings → pass through
     *  - Booleans on BIT/BOOLEAN columns → '1' / '0'
     *  - Everything else → quoted string literal with single-quote escaping
     */
    private formatSqlDefault(raw: string | null | undefined, targetSqlType: string): string | undefined {
        if (raw == null) return undefined;
        const trimmed = String(raw).trim();
        if (trimmed === '') return undefined;

        const upperType = targetSqlType.toUpperCase();
        const isBit = upperType.includes('BIT') || upperType.includes('BOOLEAN');

        // Preserve SQL keywords / well-known function calls
        const sqlFunctionRegex = /^(NULL|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|GETDATE\(\)|GETUTCDATE\(\)|SYSUTCDATETIME\(\)|SYSDATETIME\(\)|NEWID\(\)|NEWSEQUENTIALID\(\))$/i;
        if (sqlFunctionRegex.test(trimmed)) return trimmed.toUpperCase();

        // Booleans
        if (/^(true|false)$/i.test(trimmed)) {
            const isTrue = trimmed.toLowerCase() === 'true';
            if (isBit) return isTrue ? '1' : '0';
            // Non-bit column holding a boolean word — quote it as a string
            return isTrue ? "'true'" : "'false'";
        }

        // Numeric literal (int, decimal, scientific notation)
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return trimmed;

        // String literal — escape single quotes by doubling them
        return `'${trimmed.replace(/'/g, "''")}'`;
    }

    private buildDescriptionLookup(connector?: BaseIntegrationConnector): Map<string, { objectDescription?: string; fields: Map<string, string> }> {
        const result = new Map<string, { objectDescription?: string; fields: Map<string, string> }>();
        if (!connector) return result;

        const staticObjects = connector.GetIntegrationObjects();
        for (const obj of staticObjects) {
            const fieldMap = new Map<string, string>();
            for (const f of obj.Fields) {
                if (f.Description) fieldMap.set(f.Name.toLowerCase(), f.Description);
            }
            result.set(obj.Name.toLowerCase(), { objectDescription: obj.Description, fields: fieldMap });
        }
        return result;
    }

    /**
     * Decides whether an apply call should use the filtered-introspection flow.
     * Salesforce has ~1,800 sobjects and the global describe is prohibitively
     * expensive; other connectors have dozens and the legacy "describe all then
     * pick" behavior is fine. The flow also engages when the client opts in by
     * sending a SourceObjectName (which the SF full-catalog picker does).
     */
    private shouldUseFilteredIntrospection(
        connector: BaseIntegrationConnector,
        sourceObjects: SourceObjectInput[]
    ): boolean {
        const isSalesforce = connector.IntegrationName === 'Salesforce';
        const clientSentNames = sourceObjects.some(so => !!so.SourceObjectName);
        return isSalesforce && clientSentNames;
    }

    /**
     * Builds a selection plan from SourceObjectInput[] for the filtered flow.
     * Each entry resolves to { Name, Fields }, with Name coming from either:
     *   - SourceObjectName directly (newly-picked from full-catalog picker), or
     *   - A one-shot DB lookup of SourceObjectID → IntegrationObject.Name
     * Never fails on missing rows — such entries are silently dropped (the
     * caller raises on empty selection).
     */
    private async resolveSelectionPlan(
        sourceObjects: SourceObjectInput[],
        user: UserInfo
    ): Promise<Array<{ Name: string; Fields?: string[] }>> {
        const idsToLookup = sourceObjects
            .filter(so => !so.SourceObjectName && so.SourceObjectID)
            .map(so => so.SourceObjectID!);

        const idToName = new Map<string, string>();
        if (idsToLookup.length > 0) {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Integration Objects',
                ExtraFilter: idsToLookup.map(id => `ID='${id}'`).join(' OR '),
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
            }, user);
            if (result.Success) {
                for (const row of result.Results) {
                    idToName.set(row.ID.toUpperCase(), row.Name);
                }
            }
        }

        const plan: Array<{ Name: string; Fields?: string[] }> = [];
        for (const so of sourceObjects) {
            const name = so.SourceObjectName
                ?? (so.SourceObjectID ? idToName.get(so.SourceObjectID.toUpperCase()) : undefined);
            if (name) plan.push({ Name: name, Fields: so.Fields });
        }
        return plan;
    }

    /**
     * Aligns caller-supplied names to the source schema's ExternalName casing.
     * Keeps the original when no match is found so downstream steps can still
     * raise a targeted error rather than silently drop the object.
     */
    private normalizeNamesAgainstSchema(names: string[], sourceSchema: SourceSchemaInfo): string[] {
        const map = new Map(sourceSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.ExternalName]));
        return names.map(n => map.get(n.toLowerCase()) ?? n);
    }

    /**
     * Resolves source object IDs to exact names from the DB, and normalizes names
     * to match the source schema's ExternalName casing. Call once at each entry point.
     */
    private async resolveSourceObjectNames(
        ids: string[] | undefined,
        names: string[] | undefined,
        sourceSchema: SourceSchemaInfo,
        integrationID: string,
        user: UserInfo
    ): Promise<string[]> {
        // PRESERVED for backward compat with older call sites; new code should
        // use resolveSourceObjectsToNames which handles per-item ID/Name fallback
        // without silently dropping items that have a name but no ID (or an ID
        // that doesn't match an IntegrationObject row yet — the picker can send
        // newly-discovered objects with no persisted row).
        void integrationID;
        if (ids && ids.length > 0) {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Integration Objects',
                ExtraFilter: ids.map(id => `ID='${id}'`).join(' OR '),
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
            }, user);
            if (result.Success) {
                return result.Results.map(r => r.Name);
            }
        }
        if (names && names.length > 0) {
            const nameMap = new Map(sourceSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.ExternalName]));
            return names.map(n => nameMap.get(n.toLowerCase()) ?? n);
        }
        return [];
    }

    /**
     * Per-item ID/name resolver for picker selections.
     *
     * Each `SourceObjectInput` from the picker may carry SourceObjectID
     * (for objects with an existing IntegrationObject row), SourceObjectName
     * (for newly-discovered objects with no persisted row yet), or both.
     *
     * The legacy `resolveSourceObjectNames` only honored the IDs path:
     * `ids.map(...)` produced a SQL `WHERE ID IN (...)` and returned only
     * the matched rows — name-only selections and ID-misses were silently
     * dropped, with no surfaced log line. On real syncs this collapsed
     * 1156 picker selections to 420 IntegrationObjects to 181 generated
     * tables. Two silent O(N) data losses, invisible to users.
     *
     * This resolver:
     *   - looks up names for selections that have an ID
     *   - falls back to the SourceObjectName for selections without an ID
     *     (or whose ID didn't match) — normalizing case against the source
     *     schema when available
     *   - LogErrors loudly when a selection truly can't be resolved (no ID
     *     match AND no name) so the drop is visible in the run output
     *   - returns names in the same order as the input, with the count of
     *     dropped items so the caller can decide whether to abort or warn
     */
    private async resolveSourceObjectsToNames(
        sourceObjects: SourceObjectInput[],
        sourceSchema: SourceSchemaInfo,
        user: UserInfo
    ): Promise<{ names: string[]; droppedCount: number; sourceObjects: SourceObjectInput[] }> {
        // Look up names for any selections with an ID
        const idsToLookup = sourceObjects
            .map(so => so.SourceObjectID)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        const idToName = new Map<string, string>();
        if (idsToLookup.length > 0) {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Integration Objects',
                ExtraFilter: idsToLookup.map(id => `ID='${id}'`).join(' OR '),
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
            }, user);
            if (result.Success) {
                for (const r of result.Results) idToName.set(r.ID, r.Name);
            }
        }

        const schemaNameMap = new Map(sourceSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.ExternalName]));
        const resolvedNames: string[] = [];
        const resolvedSourceObjects: SourceObjectInput[] = [];
        const dropped: SourceObjectInput[] = [];
        for (const so of sourceObjects) {
            let name: string | undefined;
            if (so.SourceObjectID && idToName.has(so.SourceObjectID)) {
                name = idToName.get(so.SourceObjectID);
            } else if (so.SourceObjectName) {
                // Normalize case against the schema when the connector reports it
                name = schemaNameMap.get(so.SourceObjectName.toLowerCase()) ?? so.SourceObjectName;
            }
            if (name) {
                resolvedNames.push(name);
                resolvedSourceObjects.push(so);
            } else {
                dropped.push(so);
            }
        }
        if (dropped.length > 0) {
            const sample = dropped.slice(0, 5).map(d => `{id=${d.SourceObjectID ?? '∅'}, name=${d.SourceObjectName ?? '∅'}}`).join(', ');
            LogError(
                `[resolveSourceObjectsToNames] Dropped ${dropped.length} of ${sourceObjects.length} selection(s) ` +
                `— neither SourceObjectID matched an IntegrationObject row nor was a SourceObjectName provided. ` +
                `Sample: ${sample}${dropped.length > 5 ? ` (+${dropped.length - 5} more)` : ''}.`
            );
        }
        return { names: resolvedNames, droppedCount: dropped.length, sourceObjects: resolvedSourceObjects };
    }

    /**
     * Resolves SourceObjectID/SourceObjectName on SchemaPreviewObjectInput array.
     * Mutates the objects in place — sets SourceObjectName from ID if provided.
     */
    private async resolveObjectInputs(
        objects: SchemaPreviewObjectInput[],
        sourceSchema: SourceSchemaInfo,
        user: UserInfo
    ): Promise<void> {
        const idsToResolve = objects.filter(o => o.SourceObjectID && !o.SourceObjectName).map(o => o.SourceObjectID!);
        if (idsToResolve.length > 0) {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Integration Objects',
                ExtraFilter: idsToResolve.map(id => `ID='${id}'`).join(' OR '),
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
            }, user);
            if (result.Success) {
                const idToName = new Map(result.Results.map(r => [r.ID.toUpperCase(), r.Name]));
                for (const obj of objects) {
                    if (obj.SourceObjectID) {
                        const resolved = idToName.get(obj.SourceObjectID.toUpperCase());
                        if (resolved) obj.SourceObjectName = resolved;
                    }
                }
            }
        }

        // Normalize remaining names to match source schema casing
        const nameMap = new Map(sourceSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.ExternalName]));
        for (const obj of objects) {
            if (obj.SourceObjectName) {
                const exact = nameMap.get(obj.SourceObjectName.toLowerCase());
                if (exact) obj.SourceObjectName = exact;
            }
        }
    }

    private getAuthenticatedUser(ctx: AppContext): UserInfo {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            throw new Error("User is not authenticated");
        }
        return user;
    }

    /** Get system user for server-side operations that need elevated permissions (cascade deletes, etc.) */
    private getSystemUser(): UserInfo {
        const sysUser = UserCache.Instance.GetSystemUser();
        if (!sysUser) throw new Error('System user not available');
        return sysUser;
    }

    /**
     * Per-company read-authorization check for run artifacts.
     *
     * Reuses MJ's established row-level-security pattern: a `RunView` on
     * `MJ: Company Integrations` executed under the *calling user's* context.
     * The data provider applies the same read-permission / RLS filtering it
     * applies to every other user-context read, so the record only comes back
     * when the caller is genuinely authorized to see that CompanyIntegration.
     * No row returned ⇒ either the ID doesn't exist or the caller has no rights
     * to it — in both cases we treat the caller as unauthorized.
     *
     * Results are memoized per call via the supplied `cache` map so a list of
     * many runs sharing a CompanyIntegrationID incurs at most one lookup each.
     */
    private async userCanReadCompanyIntegration(
        companyIntegrationID: string,
        user: UserInfo,
        cache: Map<string, boolean>
    ): Promise<boolean> {
        const cached = cache.get(companyIntegrationID);
        if (cached !== undefined) {
            return cached;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `ID='${companyIntegrationID}'`,
            MaxRows: 1,
            ResultType: 'simple',
            Fields: ['ID']
        }, user);

        const authorized = result.Success && result.Results.length > 0;
        cache.set(companyIntegrationID, authorized);
        return authorized;
    }

    /**
     * Authorizes the caller for a single run artifact based on the run's
     * manifest CompanyIntegrationID. Returns true when the run is tenant-scoped
     * and the caller is authorized for that CompanyIntegration. Returns false
     * for tenant-scoped runs the caller may not read, OR for runs with no
     * CompanyIntegrationID (non-tenant-scoped artifacts are not exposed through
     * these per-company endpoints).
     */
    private async userCanReadRunArtifact(
        snap: IntegrationRunSnapshot,
        user: UserInfo,
        cache: Map<string, boolean>
    ): Promise<boolean> {
        const ciID = snap.manifest.companyIntegrationID;
        if (!ciID) {
            return false;
        }
        return this.userCanReadCompanyIntegration(ciID, user, cache);
    }

    /** Standard authorization-failure message for run-artifact endpoints. */
    private notAuthorizedForCompanyIntegrationMessage(companyIntegrationID: string): string {
        return `Not authorized to access runs for CompanyIntegration '${companyIntegrationID}'`;
    }

    /**
     * Loads the CompanyIntegration + its parent Integration, then resolves the
     * appropriate connector via ConnectorFactory.
     *
     * NOTE: Entity objects loaded here come from the MJServer's copy of core-entities.
     * The integration-engine package may resolve its own copy of core-entities, causing
     * TypeScript nominal type mismatches. At runtime the objects are structurally identical,
     * so we cast through `unknown` at the boundary calls.
     */
    private async resolveConnector(
        companyIntegrationID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<{ connector: BaseIntegrationConnector; companyIntegration: MJCompanyIntegrationEntity }> {
        const md = provider;

        // Load the CompanyIntegration record
        const companyIntegration = await md.GetEntityObject<MJCompanyIntegrationEntity>(
            'MJ: Company Integrations',
            contextUser
        );
        const loaded = await companyIntegration.Load(companyIntegrationID);
        if (!loaded) {
            throw new Error(`CompanyIntegration with ID "${companyIntegrationID}" not found`);
        }

        // Load the parent Integration record
        const integration = await md.GetEntityObject<MJIntegrationEntity>(
            'MJ: Integrations',
            contextUser
        );
        const integrationLoaded = await integration.Load(companyIntegration.IntegrationID);
        if (!integrationLoaded) {
            throw new Error(`Integration with ID "${companyIntegration.IntegrationID}" not found`);
        }

        // ConnectorFactory.Resolve expects MJIntegrationEntity, which is the same type loaded above.
        // Both this file and ConnectorFactory import from @memberjunction/core-entities.
        const connector = ConnectorFactory.Resolve(integration);

        return { connector, companyIntegration };
    }

    private handleDiscoveryError(e: unknown): DiscoverObjectsOutput & DiscoverFieldsOutput {
        LogError(`Integration discovery error: ${this.formatError(e)}`);
        return {
            Success: false,
            Message: `Error: ${this.formatError(e)}`
        };
    }

    private formatError(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

    private static readonly VALID_PLATFORMS = new Set<string>(['sqlserver', 'postgresql']);

    /** Validates and narrows a platform string to the supported union type. */
    private validatePlatform(platform: string): 'sqlserver' | 'postgresql' {
        if (!IntegrationDiscoveryResolver.VALID_PLATFORMS.has(platform)) {
            throw new Error(`Unsupported platform "${platform}". Must be one of: ${[...IntegrationDiscoveryResolver.VALID_PLATFORMS].join(', ')}`);
        }
        return platform as 'sqlserver' | 'postgresql';
    }

    // ── CONNECTION TEST HELPERS ────────────────────────────────────────────

    /**
     * Tests connectivity for a given CompanyIntegration, reusing the same pattern as IntegrationTestConnection.
     */
    private async testConnectionForCI(
        companyIntegrationID: string,
        user: UserInfo,
        provider: IMetadataProvider
    ): Promise<ConnectionTestResult> {
        const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);
        const testFn = connector.TestConnection.bind(connector) as
            (ci: unknown, u: unknown) => Promise<ConnectionTestResult>;
        return testFn(companyIntegration, user);
    }

    /**
     * Runs IntegrationConnectorCreationPipeline + refreshes the metadata cache.
     * Shared by IntegrationCreateConnection's auto-refresh path and the
     * standalone IntegrationRefreshConnectorSchema mutation.
     */
    /**
     * Reconstructs a `SourceSchemaInfo` from already-persisted IntegrationObject
     * and IntegrationObjectField rows held by `IntegrationEngineBase`'s
     * in-memory cache.
     *
     * Why this exists: after the Phase 0 v5.39.x `MJCompanyIntegrationEntityServer`
     * hook fires the pipeline on `IsActive false→true`, the IO/IOF rows are
     * already fresh.  The legacy `IntegrationApplyAllBatch` / `ApplyAll` /
     * `ApplySchema` resolvers then called `connector.IntrospectSchema()` AGAIN
     * to feed `SchemaBuilder`, which produced a second full vendor-API
     * roundtrip (HubSpot 130 objects × 60+ DiscoverFields probes, ~100s
     * wasted on the user's HubSpot run).  Using the persisted rows skips
     * that round-trip entirely.
     *
     * Caveats:
     *   - The persisted `Type` is the MJ canonical type (string / int / datetime / …),
     *     NOT the original vendor source type.  `TypeMapper` in SchemaBuilder
     *     accepts canonical types so DDL generation still works; if a connector
     *     has unusual nuances around its source-type strings, fall back to live
     *     introspect (the caller can pass `forceLive: true`).
     *   - PrimaryKeyFields are recomputed from the IOF rows where
     *     `IsPrimaryKey=true`.
     *   - Foreign-key relationships are reconstructed from
     *     `RelatedIntegrationObjectID` lookups against the same cache.
     */
    private buildSourceSchemaFromPersistedRows(
        integrationID: string,
        requestedNames?: string[],
    ): SourceSchemaInfo {
        const engine = IntegrationEngineBase.Instance;
        // ACTIVE-only materialization: an object/field a given tenant doesn't expose is marked
        // Status='Inactive' by discovery (the phantom-skip), and MUST NOT be materialized — creating
        // empty tables/columns for absent objects wastes storage AND, more importantly, blows up the
        // per-entity CodeGen + advancedGen (AI form-layout) time on every ApplyAll. The sync path
        // already filters active (GetActiveIntegrationObjects); this build site now matches it.
        const ios = engine.GetActiveIntegrationObjects(integrationID);
        const filter = requestedNames && requestedNames.length > 0
            ? new Set(requestedNames.map(n => n.toLowerCase()))
            : null;

        // Cache (id → name) for FK relationship reconstruction.  Same-integration
        // only — cross-integration relationships are not modeled in the slot table.
        const ioByID = new Map<string, string>();
        for (const io of ios) ioByID.set(io.ID, io.Name);

        const result: SourceSchemaInfo = { Objects: [] };
        for (const io of ios) {
            if (filter && !filter.has(io.Name.toLowerCase())) continue;
            // Active fields only — an inactive (source-absent / deactivated) field is not materialized.
            const iofs = engine.GetIntegrationObjectFields(io.ID).filter(iof => iof.Status === 'Active');

            const fields = iofs.map(iof => {
                const targetIOName = iof.RelatedIntegrationObjectID
                    ? ioByID.get(iof.RelatedIntegrationObjectID) ?? null
                    : null;
                return {
                    Name: iof.Name,
                    Label: iof.DisplayName ?? iof.Name,
                    Description: iof.Description ?? undefined,
                    SourceType: iof.Type ?? 'string',
                    IsRequired: iof.IsRequired ?? false,
                    AllowsNull: iof.AllowsNull ?? undefined,
                    MaxLength: iof.Length ?? null,
                    Precision: iof.Precision ?? null,
                    Scale: iof.Scale ?? null,
                    DefaultValue: iof.DefaultValue ?? null,
                    IsPrimaryKey: iof.IsPrimaryKey ?? false,
                    IsUniqueKey: iof.IsUniqueKey ?? false,
                    IsReadOnly: iof.IsReadOnly ?? false,
                    IsForeignKey: !!iof.RelatedIntegrationObjectID,
                    ForeignKeyTarget: targetIOName,
                };
            });

            result.Objects.push({
                ExternalName: io.Name,
                ExternalLabel: io.DisplayName ?? io.Name,
                Description: io.Description ?? undefined,
                Fields: fields,
                PrimaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                Relationships: fields
                    .filter(f => f.IsForeignKey && f.ForeignKeyTarget)
                    .map(f => ({
                        FieldName: f.Name,
                        TargetObject: f.ForeignKeyTarget!,
                        TargetField: 'ID',
                    })),
                IncrementalWatermarkField: io.IncrementalWatermarkField ?? undefined,
            });
        }
        return result;
    }

    private async runSchemaRefreshPipeline(
        companyIntegrationID: string,
        user: UserInfo,
        provider: IMetadataProvider,
        universalPKConvention?: string,
    ): Promise<CreateConnectionPipelineSummary> {
        const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);
        const pipeline = new IntegrationConnectorCreationPipeline();
        const runOpts = {
            Connector: connector,
            CompanyIntegration: companyIntegration,
            ContextUser: user,
            Provider: provider,
            UniversalPKConvention: universalPKConvention || undefined,
            ConsoleMirror: true,
            TriggerType: 'Manual' as const,
        };
        const result = await pipeline.Run(runOpts as unknown as Parameters<typeof pipeline.Run>[0]);

        // Refresh in-memory caches so downstream queries (object picker,
        // ApplyAll, etc.) see the just-written IO/IOF rows.
        await (provider ?? new Metadata()).Refresh();
        await IntegrationEngine.Instance.Config(true, user, provider);

        return {
            RunID: result.RunID,
            ObjectsCreated: result.PersistResult?.ObjectsCreated ?? 0,
            ObjectsUpdated: result.PersistResult?.ObjectsUpdated ?? 0,
            FieldsCreated: result.PersistResult?.FieldsCreated ?? 0,
            FieldsUpdated: result.PersistResult?.FieldsUpdated ?? 0,
            UnresolvedObjects: result.UnresolvedObjects,
            PKVerdicts: result.PKVerdicts.map(v => ({
                ObjectName: v.ObjectName,
                Confident: v.Confident,
                Nominee: v.Nominee,
                Confidence: v.Confidence,
                Strategy: v.Strategy,
                Reason: v.Reason,
            })),
        };
    }

    /**
     * Rolls back a freshly created connection by deleting both the CompanyIntegration and Credential records.
     */
    private async rollbackCreatedConnection(
        ci: MJCompanyIntegrationEntity,
        credential: MJCredentialEntity
    ): Promise<void> {
        try { await ci.Delete(); } catch (e) { LogError(`Rollback: failed to delete CompanyIntegration: ${this.formatError(e)}`); }
        try { await credential.Delete(); } catch (e) { LogError(`Rollback: failed to delete Credential: ${this.formatError(e)}`); }
    }

    /**
     * Cascades the deletion of a CompanyIntegration's linked Credential as part of the
     * supplied TransactionGroup, so the encrypted-credential row is removed atomically
     * with the rest of the connection cascade (rolls back together on tg failure).
     *
     * Safety:
     *  - No-op when {@link credentialID} is null/empty.
     *  - Skips the delete when ANOTHER CompanyIntegration still references the same
     *    CredentialID (shared credential) — only the sole referencer may delete it.
     *
     * @returns true if the credential was attached to the tg for deletion; false otherwise.
     */
    private async cascadeDeleteCredential(
        credentialID: string | null | undefined,
        companyIntegrationID: string,
        tg: TransactionGroupBase,
        rv: RunView,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<boolean> {
        if (!credentialID) return false; // no linked credential — nothing to do

        // Shared-credential safety: do not delete if any OTHER CompanyIntegration uses it.
        const sharedResult = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CredentialID='${credentialID}' AND ID<>'${companyIntegrationID}'`,
            ResultType: 'simple',
            Fields: ['ID']
        }, user);
        if (sharedResult.Success && sharedResult.Results.length > 0) {
            LogStatus(`IntegrationDeleteConnection: credential ${credentialID} is shared by ${sharedResult.Results.length} other connection(s); leaving it in place`);
            return false;
        }

        const credential = await provider.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
        const loaded = await credential.InnerLoad(CompositeKey.FromID(credentialID));
        if (!loaded) return false; // already gone — treat as nothing to cascade

        credential.TransactionGroup = tg;
        await credential.Delete();
        return true;
    }

    /**
     * Snapshots the current credential Values for a given credential ID so they can be restored on rollback.
     */
    private async snapshotCredentialValues(
        credentialID: string | undefined,
        user: UserInfo,
        provider: IMetadataProvider
    ): Promise<string | undefined> {
        if (!credentialID) return undefined;
        const credential = await provider.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
        const loaded = await credential.InnerLoad(CompositeKey.FromID(credentialID));
        return loaded ? credential.Values : undefined;
    }

    /**
     * Reverts an update to a CompanyIntegration by restoring old configuration, externalSystemID,
     * and credential values.
     */
    private async revertUpdateConnection(
        ci: MJCompanyIntegrationEntity,
        oldConfiguration: string | undefined,
        oldExternalSystemID: string | undefined,
        oldCredentialValues: string | undefined,
        user: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        try {
            // Revert CI fields
            let dirty = false;
            if (oldConfiguration !== undefined) { ci.Configuration = oldConfiguration; dirty = true; }
            if (oldExternalSystemID !== undefined) { ci.ExternalSystemID = oldExternalSystemID; dirty = true; }
            if (dirty) await ci.Save();

            // Revert credential values
            if (oldCredentialValues !== undefined && ci.CredentialID) {
                const credential = await provider.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
                const loaded = await credential.InnerLoad(CompositeKey.FromID(ci.CredentialID));
                if (loaded) {
                    credential.Values = oldCredentialValues;
                    await credential.Save();
                }
            }
        } catch (e) {
            LogError(`Revert update connection failed: ${this.formatError(e)}`);
        }
    }

    // ── CONNECTION LIFECYCLE ─────────────────────────────────────────────

    /**
     * Lists all CompanyIntegrations (optionally filtered by active status).
     * Returns key fields for dashboard display without requiring a raw RunView call.
     */
    @Query(() => ListConnectionsOutput)
    async IntegrationListConnections(
        @Arg("activeOnly", { defaultValue: true }) activeOnly: boolean,
        @Arg("companyID", { nullable: true }) companyID: string,
        @Ctx() ctx: AppContext
    ): Promise<ListConnectionsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            // Boolean literal goes through the active provider's dialect:
            //   SQL Server emits `= 1`, PostgreSQL emits `= TRUE`.
            // Filter stays server-side; no client-side `.filter()` post-pass.
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as DatabaseProviderBase;
            const filters: string[] = [];
            if (companyID) filters.push(`CompanyID='${companyID}'`);
            if (activeOnly) filters.push(`IsActive = ${provider.Dialect.BooleanLiteral(true)}`);
            const filter = filters.join(' AND ');
            const result = await rv.RunView<MJCompanyIntegrationEntity>({
                EntityName: 'MJ: Company Integrations',
                ExtraFilter: filter,
                OrderBy: 'Integration ASC',
                ResultType: 'simple',
                Fields: [
                    'ID', 'Integration', 'IntegrationID', 'CompanyID', 'Company',
                    'IsActive', 'ScheduleEnabled', 'CronExpression',
                    'ExternalSystemID', '__mj_CreatedAt'
                ]
            }, user);

            if (!result.Success) return { Success: false, Message: result.ErrorMessage || 'Query failed' };

            const filteredResults = result.Results;

            return {
                Success: true,
                Message: `${filteredResults.length} connections`,
                Connections: filteredResults.map(ci => ({
                    ID: ci.ID,
                    IntegrationName: ci.Integration,
                    IntegrationID: ci.IntegrationID,
                    CompanyID: ci.CompanyID,
                    Company: ci.Company,
                    IsActive: ci.IsActive,
                    ScheduleEnabled: ci.ScheduleEnabled ?? false,
                    CronExpression: ci.CronExpression ?? undefined,
                    CreatedAt: ci.__mj_CreatedAt?.toISOString() ?? '',
                }))
            };
        } catch (e) {
            LogError(`IntegrationListConnections error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Creates a CompanyIntegration with a linked Credential entity for encrypted credential storage.
     */
    @Mutation(() => CreateConnectionOutput)
    async IntegrationCreateConnection(
        @Arg("input") input: CreateConnectionInput,
        @Arg("testConnection", () => Boolean, { defaultValue: false }) testConnection: boolean,
        @Arg("runSchemaRefresh", () => Boolean, { defaultValue: true, description: "When true (default) and TestConnection succeeds, automatically runs IntegrationConnectorCreationPipeline (live introspect → persist Declared/Discovered/Custom → SoftPKClassifier). The intermittent server-side work the wizard's Forward step represents." }) runSchemaRefresh: boolean,
        @Arg("universalPKConvention", { nullable: true, description: "Optional vendor-wide PK hint (e.g. 'id' for HubSpot). Improves SoftPKClassifier convergence." }) universalPKConvention: string | undefined,
        @Ctx() ctx: AppContext
    ): Promise<CreateConnectionOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;

            // 1. Create Credential record with encrypted values
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
            credential.NewRecord();
            credential.CredentialTypeID = input.CredentialTypeID;
            credential.Name = input.CredentialName;
            credential.Values = input.CredentialValues;
            credential.IsActive = true;

            const credSaved = await credential.Save();
            if (!credSaved) {
                const err = credential.LatestResult?.Message || 'Unknown error';
                return { Success: false, Message: `Failed to create Credential: ${err}` };
            }
            const credentialID = credential.ID;

            // 2. Create CompanyIntegration linked to the Credential
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            ci.NewRecord();
            ci.IntegrationID = input.IntegrationID;
            ci.CompanyID = input.CompanyID;
            ci.CredentialID = credentialID;
            ci.IsActive = true;
            ci.Name = input.CredentialName; // Name is required on CompanyIntegration
            if (input.ExternalSystemID) ci.ExternalSystemID = input.ExternalSystemID;
            if (input.Configuration) ci.Configuration = input.Configuration;

            const saved = await ci.Save();
            if (!saved) {
                const validationErrors = ci.LatestResult?.Message || 'Unknown validation error';
                return { Success: false, Message: `Failed to save CompanyIntegration: ${validationErrors}` };
            }

            // 3. Optionally test the connection; rollback on failure
            let testPassed: boolean = !testConnection; // if no test asked, treat as "passed" so the refresh below still runs
            let testMessage = '';
            if (testConnection) {
                const testResult = await this.testConnectionForCI(ci.ID, user, md);
                if (!testResult.Success) {
                    await this.rollbackCreatedConnection(ci, credential);
                    return {
                        Success: false,
                        Message: `Connection test failed: ${testResult.Message}. Connection was not saved.`,
                        ConnectionTestSuccess: false,
                        ConnectionTestMessage: testResult.Message
                    };
                }
                testPassed = true;
                testMessage = testResult.Message;
            }

            // 4. Auto-run schema refresh pipeline (intermittent server-side period).
            // Fires whenever runSchemaRefresh=true, regardless of whether the
            // caller also asked for a test.  The wizard may have tested separately
            // and just be hitting Create to save.
            let schemaRefreshSummary: CreateConnectionPipelineSummary | undefined;
            if (runSchemaRefresh) {
                try {
                    const refreshResult = await this.runSchemaRefreshPipeline(
                        ci.ID, user, md, universalPKConvention
                    );
                    schemaRefreshSummary = refreshResult;
                } catch (refreshErr) {
                    // Refresh failure does NOT roll back the connection —
                    // user can re-run via IntegrationRefreshConnectorSchema.
                    LogError(`IntegrationCreateConnection: pipeline error — ${refreshErr}`);
                }
            }

            if (testConnection || schemaRefreshSummary) {
                return {
                    Success: true,
                    Message: schemaRefreshSummary
                        ? `Connection created${testConnection ? ', test passed' : ''}, schema refresh: ${schemaRefreshSummary.ObjectsCreated} created, ${schemaRefreshSummary.ObjectsUpdated} updated, ${schemaRefreshSummary.UnresolvedObjects.length} PK-unresolved`
                        : 'Connection created and test passed',
                    CompanyIntegrationID: ci.ID,
                    CredentialID: credentialID,
                    ConnectionTestSuccess: testPassed,
                    ConnectionTestMessage: testMessage,
                    SchemaRefresh: schemaRefreshSummary,
                };
            }

            return {
                Success: true,
                Message: 'Connection created',
                CompanyIntegrationID: ci.ID,
                CredentialID: credentialID
            };
        } catch (e) {
            LogError(`IntegrationCreateConnection error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Updates credential values and/or configuration on an existing CompanyIntegration.
     */
    @Mutation(() => MutationResultOutput)
    async IntegrationUpdateConnection(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("credentialValues", { nullable: true }) credentialValues: string,
        @Arg("configuration", { nullable: true }) configuration: string,
        @Arg("externalSystemID", { nullable: true }) externalSystemID: string,
        @Arg("testConnection", () => Boolean, { defaultValue: false }) testConnection: boolean,
        @Arg("runSchemaRefresh", () => Boolean, { defaultValue: true, description: "When true (default) and TestConnection succeeds, automatically runs IntegrationConnectorCreationPipeline. Same intermittent server-side step as the create flow." }) runSchemaRefresh: boolean,
        @Arg("universalPKConvention", { nullable: true, description: "Optional vendor-wide PK hint (e.g. 'id' for HubSpot)" }) universalPKConvention: string | undefined,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'CompanyIntegration not found' };

            // Snapshot old values for rollback if testConnection is requested
            const oldCredentialValues = credentialValues ? await this.snapshotCredentialValues(ci.CredentialID, user, md) : undefined;
            const oldConfiguration = ci.Configuration;
            const oldExternalSystemID = ci.ExternalSystemID;

            // Update linked Credential values if provided
            if (credentialValues) {
                const credentialID = ci.CredentialID;
                if (!credentialID) {
                    return { Success: false, Message: 'No linked Credential — use IntegrationCreateConnection first' };
                }
                const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
                const credLoaded = await credential.InnerLoad(CompositeKey.FromID(credentialID));
                if (!credLoaded) return { Success: false, Message: 'Linked Credential not found' };
                credential.Values = credentialValues;
                if (!await credential.Save()) return { Success: false, Message: 'Failed to update Credential' };
            }

            let dirty = false;
            if (configuration !== undefined && configuration !== null) { ci.Configuration = configuration; dirty = true; }
            if (externalSystemID !== undefined && externalSystemID !== null) { ci.ExternalSystemID = externalSystemID; dirty = true; }

            if (dirty && !await ci.Save()) return { Success: false, Message: 'Failed to save CompanyIntegration' };

            // Optionally test the connection; revert on failure
            if (testConnection) {
                const testResult = await this.testConnectionForCI(companyIntegrationID, user, md);
                if (!testResult.Success) {
                    await this.revertUpdateConnection(ci, oldConfiguration, oldExternalSystemID, oldCredentialValues, user, md);
                    return { Success: false, Message: `Connection test failed: ${testResult.Message}. Changes have been reverted.` };
                }
            }

            // Auto-run schema refresh pipeline (intermittent server-side period).
            // Fires whenever runSchemaRefresh=true, regardless of whether the
            // caller also asked for a test — the wizard may have tested separately
            // already and is just hitting Update to save edits.
            if (runSchemaRefresh) {
                try {
                    const refreshResult = await this.runSchemaRefreshPipeline(
                        companyIntegrationID, user, md, universalPKConvention
                    );
                    return {
                        Success: true,
                        Message: `Updated, schema refresh: ${refreshResult.ObjectsCreated} created, ${refreshResult.ObjectsUpdated} updated, ${refreshResult.UnresolvedObjects.length} PK-unresolved`,
                    };
                } catch (refreshErr) {
                    LogError(`IntegrationUpdateConnection: pipeline error — ${refreshErr}`);
                    return { Success: true, Message: `Updated (schema refresh failed: ${this.formatError(refreshErr)})` };
                }
            }

            return { Success: true, Message: 'Updated' };
        } catch (e) {
            LogError(`IntegrationUpdateConnection error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Sets the per-connection sync tuning (rate limit, concurrency, time budget, pipeline flags) as
     * STRUCTURED typed fields, merged into CompanyIntegration.Configuration (other keys preserved).
     * These are the exact keys the IntegrationEngine reads at runtime, so they become customizable
     * via the API instead of hidden code constants. Returns the merged config typed.
     */
    @Mutation(() => IntegrationSyncConfigOutput)
    async IntegrationSetSyncConfig(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("config", () => IntegrationSyncConfigInput) config: IntegrationSyncConfigInput,
        @Ctx() ctx: AppContext
    ): Promise<IntegrationSyncConfigOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            if (!await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID))) {
                return { Success: false, Message: 'CompanyIntegration not found' };
            }
            let cfg: Record<string, unknown> = {};
            try { if (ci.Configuration) cfg = JSON.parse(ci.Configuration) as Record<string, unknown>; } catch { cfg = {}; }
            const set = (key: string, val: unknown) => { if (val !== undefined && val !== null) cfg[key] = val; };
            set('syncConcurrency', config.SyncConcurrency);
            set('maxConcurrency', config.MaxConcurrency);
            set('rateLimitTokensPerSec', config.RateLimitTokensPerSec);
            set('rateLimitBurst', config.RateLimitBurst);
            set('crossLayerPipeline', config.CrossLayerPipeline);
            set('partitionReconcile', config.PartitionReconcile);
            set('discoveryTimeBudgetMs', config.DiscoveryTimeBudgetMs);
            set('discoveryBatchSize', config.DiscoveryBatchSize);
            set('discoveryMaxRecords', config.DiscoveryMaxRecords);
            set('deactivateAbsent', config.DeactivateAbsent);
            ci.Configuration = JSON.stringify(cfg);
            if (!await ci.Save()) return { Success: false, Message: `Failed to save: ${ci.LatestResult?.CompleteMessage ?? 'unknown'}` };
            return { Success: true, Message: 'Sync config updated', ...this.readSyncConfig(cfg) };
        } catch (e) {
            LogError(`IntegrationSetSyncConfig error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /** Reads the per-connection sync tuning back as STRUCTURED typed fields. */
    @Query(() => IntegrationSyncConfigOutput)
    async IntegrationGetSyncConfig(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<IntegrationSyncConfigOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            if (!await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID))) {
                return { Success: false, Message: 'CompanyIntegration not found' };
            }
            let cfg: Record<string, unknown> = {};
            try { if (ci.Configuration) cfg = JSON.parse(ci.Configuration) as Record<string, unknown>; } catch { cfg = {}; }
            return { Success: true, Message: 'OK', ...this.readSyncConfig(cfg) };
        } catch (e) {
            LogError(`IntegrationGetSyncConfig error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /** Reads a single boolean key from a CompanyIntegration.Configuration JSON string (undefined if absent/malformed). */
    private readConfigBool(configuration: string | null | undefined, key: string): boolean | undefined {
        try {
            if (!configuration) return undefined;
            const v = (JSON.parse(configuration) as Record<string, unknown>)[key];
            return typeof v === 'boolean' ? v : undefined;
        } catch { return undefined; }
    }

    /** Extracts the typed sync-config fields from a parsed Configuration object (type-guarded). */
    private readSyncConfig(cfg: Record<string, unknown>): Partial<IntegrationSyncConfigOutput> {
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
        const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
        return {
            SyncConcurrency: num(cfg.syncConcurrency),
            MaxConcurrency: num(cfg.maxConcurrency),
            RateLimitTokensPerSec: num(cfg.rateLimitTokensPerSec),
            RateLimitBurst: num(cfg.rateLimitBurst),
            CrossLayerPipeline: bool(cfg.crossLayerPipeline),
            PartitionReconcile: bool(cfg.partitionReconcile),
            DiscoveryTimeBudgetMs: num(cfg.discoveryTimeBudgetMs),
            DiscoveryBatchSize: num(cfg.discoveryBatchSize),
            DiscoveryMaxRecords: num(cfg.discoveryMaxRecords),
            DeactivateAbsent: bool(cfg.deactivateAbsent),
        };
    }

    /** The MJ entity names this connection has entity maps for (for whole-connection scope). */
    private async getMappedEntityNames(companyIntegrationID: string, user: UserInfo): Promise<string[]> {
        const rv = new RunView();
        const res = await rv.RunView<{ Entity: string }>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
            Fields: ['Entity'],
            ResultType: 'simple',
        }, user);
        if (!res.Success) return [];
        return Array.from(new Set((res.Results ?? []).map(r => r.Entity).filter((e): e is string => !!e)));
    }

    /**
     * Lists the custom-column CANDIDATES captured in the overflow column awaiting promotion — the "new
     * columns found" for a connection. READ-ONLY (no schema change, no RSU). Scope to one entity via
     * entityName, or omit to list across all the connection's mapped entities. Computed live (overflow keys
     * minus already-mapped/already-a-column), so it is inherently deduped against anything a concurrent
     * discovery already promoted.
     */
    @Query(() => CustomColumnCandidatesOutput)
    async IntegrationListCustomColumnCandidates(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("entityName", { nullable: true }) entityName: string | undefined,
        @Ctx() ctx: AppContext
    ): Promise<CustomColumnCandidatesOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const promoter = new IntegrationCustomColumnPromoter(user, provider);
            const entityNames = entityName ? [entityName] : await this.getMappedEntityNames(companyIntegrationID, user);
            const candidates: CustomColumnCandidate[] = [];
            for (const en of entityNames) {
                candidates.push(...await promoter.ListCandidates(companyIntegrationID, en));
            }
            return { Success: true, Message: `${candidates.length} candidate column(s) found`, Candidates: candidates };
        } catch (e) {
            LogError(`IntegrationListCustomColumnCandidates error: ${e}`);
            return { Success: false, Message: this.formatError(e), Candidates: [] };
        }
    }

    /**
     * On-demand promotion of captured custom columns: runs RSU (ADD COLUMN + register EntityField + field map),
     * which may require a server restart to expose them over GraphQL. This is the USER-ACCEPTED trigger — by
     * default a sync only CAPTURES to the overflow column (auto-promote is opt-in per connection via
     * Configuration.autoPromoteCustomColumns). Scope via entityNames, or omit to promote across all mapped
     * entities. Idempotent: already-promoted/mapped keys are skipped (safe to re-run / run alongside discovery).
     */
    @Mutation(() => PromoteCustomColumnsOutput)
    async IntegrationPromoteCustomColumns(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("entityNames", () => [String], { nullable: true }) entityNames: string[] | undefined,
        @Ctx() ctx: AppContext
    ): Promise<PromoteCustomColumnsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers) as unknown as IMetadataProvider;
            const targets = (entityNames && entityNames.length > 0) ? entityNames : await this.getMappedEntityNames(companyIntegrationID, user);
            if (targets.length === 0) {
                return { Success: true, Message: 'No mapped entities to promote', Promoted: false, ColumnsAdded: [], SchemaUpdatePending: false };
            }
            const promoter = new IntegrationCustomColumnPromoter(user, provider);
            const result = await promoter.PromoteForSync(companyIntegrationID, targets);
            return {
                Success: true,
                Message: result.Promoted ? `Promoted ${result.ColumnsAdded.length} column(s)` : 'No columns required promotion',
                Promoted: result.Promoted,
                ColumnsAdded: result.ColumnsAdded.map(c => ({ EntityName: c.EntityName, ColumnName: c.ColumnName })),
                SchemaUpdatePending: result.SchemaUpdatePending,
            };
        } catch (e) {
            LogError(`IntegrationPromoteCustomColumns error: ${e}`);
            return { Success: false, Message: this.formatError(e), Promoted: false, ColumnsAdded: [], SchemaUpdatePending: false };
        }
    }

    /**
     * Soft-deletes a CompanyIntegration by setting IsActive=false.
     */
    @Mutation(() => MutationResultOutput)
    async IntegrationDeactivateConnection(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'CompanyIntegration not found' };
            ci.IsActive = false;
            if (!await ci.Save()) return { Success: false, Message: 'Failed to deactivate' };
            return { Success: true, Message: 'Deactivated' };
        } catch (e) {
            LogError(`IntegrationDeactivateConnection error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Reactivates a previously deactivated CompanyIntegration by setting IsActive=true.
     */
    @Mutation(() => MutationResultOutput)
    async IntegrationReactivateConnection(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'CompanyIntegration not found' };
            ci.IsActive = true;
            if (!await ci.Save()) return { Success: false, Message: `Failed to reactivate: ${ci.LatestResult?.Message ?? 'Unknown error'}` };
            return { Success: true, Message: 'Reactivated' };
        } catch (e) {
            LogError(`IntegrationReactivateConnection error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── ENTITY MAPS ─────────────────────────────────────────────────────

    /**
     * Batch creates entity maps by entity name (resolved by lookup).
     * Call AFTER the schema pipeline has created the target entities.
     */
    @Mutation(() => CreateEntityMapsOutput)
    async IntegrationCreateEntityMaps(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("entityMaps", () => [EntityMapInput]) entityMaps: EntityMapInput[],
        @Ctx() ctx: AppContext
    ): Promise<CreateEntityMapsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;

            // Batch resolve entity names → IDs using cached Metadata
            const namesToResolve = entityMaps.filter(m => m.EntityName && !m.EntityID).map(m => m.EntityName as string);
            const nameToID = new Map<string, string>();

            if (namesToResolve.length > 0) {
                const uniqueNames = [...new Set(namesToResolve)];
                for (const name of uniqueNames) {
                    const entity = md.EntityByName(name);
                    if (entity) {
                        nameToID.set(name, entity.ID);
                    }
                }
                const unresolved = uniqueNames.filter(n => !nameToID.has(n));
                if (unresolved.length > 0) {
                    return {
                        Success: false,
                        Message: `Entities not found: ${unresolved.join(', ')}. Run the schema pipeline first.`
                    };
                }
            }

            const created: EntityMapCreatedOutput[] = [];
            for (const mapDef of entityMaps) {
                const entityID = mapDef.EntityID || nameToID.get(mapDef.EntityName || '');
                if (!entityID) {
                    return { Success: false, Message: `No EntityID or EntityName for "${mapDef.ExternalObjectName}"`, Created: created };
                }

                const syncDir = mapDef.SyncDirection || 'Pull';
                if (!isValidSyncDirection(syncDir)) {
                    return { Success: false, Message: `Invalid SyncDirection "${syncDir}" for "${mapDef.ExternalObjectName}". Must be one of: ${VALID_SYNC_DIRECTIONS.join(', ')}`, Created: created };
                }

                // Create-or-reuse by (connection, external object) — same idempotency rule as ApplyAll's
                // createSingleEntityMap. A blind NewRecord() here duplicates maps on every re-apply.
                const escapedObjectName = mapDef.ExternalObjectName.replace(/'/g, "''");
                const existingMapResult = await new RunView().RunView<MJCompanyIntegrationEntityMapEntity>({
                    EntityName: 'MJ: Company Integration Entity Maps',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND ExternalObjectName='${escapedObjectName}'`,
                    OrderBy: '__mj_CreatedAt ASC',
                    MaxRows: 1,
                    ResultType: 'entity_object',
                    BypassCache: true, // idempotency must read COMMITTED state, not a possibly-stale filtered cache
                }, user);

                let em: MJCompanyIntegrationEntityMapEntity;
                if (existingMapResult.Success && existingMapResult.Results.length > 0) {
                    em = existingMapResult.Results[0];
                } else {
                    em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', user);
                    em.NewRecord();
                    em.CompanyIntegrationID = companyIntegrationID;
                    em.ExternalObjectName = mapDef.ExternalObjectName;
                }
                em.EntityID = entityID;
                em.SyncDirection = syncDir;
                em.Priority = mapDef.Priority || 0;
                em.Status = 'Active';
                if (mapDef.Configuration != null) em.Configuration = mapDef.Configuration;

                if (!await em.Save()) {
                    return { Success: false, Message: `Failed to create map for ${mapDef.ExternalObjectName}`, Created: created };
                }
                const entityMapID = em.ID;

                // Create field maps if provided (skip ones already mapped for this entity map)
                if (mapDef.FieldMaps) {
                    const existingFieldMaps = await new RunView().RunView<{ SourceFieldName: string }>({
                        EntityName: 'MJ: Company Integration Field Maps',
                        ExtraFilter: `EntityMapID='${entityMapID}'`,
                        Fields: ['SourceFieldName'],
                        ResultType: 'simple',
                        BypassCache: true, // read committed field-map state for the idempotency skip
                    }, user);
                    const alreadyMapped = new Set(
                        (existingFieldMaps.Results ?? []).map(r => (r.SourceFieldName ?? '').toLowerCase())
                    );
                    for (const fmDef of mapDef.FieldMaps) {
                        if (alreadyMapped.has((fmDef.SourceFieldName ?? '').toLowerCase())) continue;
                        const fm = await md.GetEntityObject<MJCompanyIntegrationFieldMapEntity>('MJ: Company Integration Field Maps', user);
                        fm.NewRecord();
                        fm.EntityMapID = entityMapID;
                        fm.SourceFieldName = fmDef.SourceFieldName;
                        fm.DestinationFieldName = fmDef.DestinationFieldName;
                        fm.IsKeyField = fmDef.IsKeyField || false;
                        fm.IsRequired = fmDef.IsRequired || false;
                        fm.Status = 'Active';
                        await fm.Save();
                    }
                }

                created.push({
                    EntityMapID: entityMapID,
                    ExternalObjectName: mapDef.ExternalObjectName,
                    FieldMapCount: mapDef.FieldMaps?.length || 0
                });
            }

            return { Success: true, Message: `Created ${created.length} entity maps`, Created: created };
        } catch (e) {
            LogError(`IntegrationCreateEntityMaps error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── SCHEMA EXECUTION ────────────────────────────────────────────────

    /**
     * Generates schema artifacts from connector introspection and runs the full
     * RSU pipeline: write migration file → execute SQL → run CodeGen →
     * compile TypeScript → restart MJAPI → git commit (if enabled).
     *
     * Replaces the old two-step IntegrationSchemaPreview + IntegrationWriteSchemaFiles
     * pattern. Use IntegrationSchemaPreview to preview generated SQL without applying.
     */
    @Mutation(() => ApplySchemaOutput)
    async IntegrationApplySchema(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("objects", () => [SchemaPreviewObjectInput]) objects: SchemaPreviewObjectInput[],
        @Arg("platform", { defaultValue: "sqlserver" }) platform: string,
        @Arg("skipGitCommit", { defaultValue: false }) skipGitCommit: boolean,
        @Arg("skipRestart", { defaultValue: false }) skipRestart: boolean,
        @Ctx() ctx: AppContext
    ): Promise<ApplySchemaOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

            // Reconstruct source schema from the IO/IOF rows already persisted by
            // the Phase 0 v5.39.x Save hook.  Fall back to live IntrospectSchema only
            // for direct-API callers bypassing the wizard (empty IO cache).
            const requestedNames = new Set(objects.map(o => o.SourceObjectName));
            let sourceSchema: SourceSchemaInfo = this.buildSourceSchemaFromPersistedRows(
                companyIntegration.IntegrationID,
                Array.from(requestedNames),
            );
            if (sourceSchema.Objects.length === 0) {
                LogError(`[IntegrationApplySchema] Persisted IO cache empty for ${companyIntegration.Integration}; falling back to live introspect.`);
                const introspect = connector.IntrospectSchema.bind(connector) as
                    (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
                sourceSchema = await introspect(companyIntegration, user);
            } else {
                console.log(
                    `[IntegrationApplySchema] Reusing ${sourceSchema.Objects.length} persisted IOs for ${companyIntegration.Integration} ` +
                    `— skipped duplicate IntrospectSchema (Save-hook already discovered).`
                );
            }

            await this.resolveObjectInputs(objects, sourceSchema, user);

            const filteredSchema: SourceSchemaInfo = {
                Objects: sourceSchema.Objects.filter(o => requestedNames.has(o.ExternalName))
            };

            const validatedPlatform = this.validatePlatform(platform);
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, validatedPlatform, connector);

            const input: SchemaBuilderInput = {
                SourceSchema: filteredSchema,
                TargetConfigs: targetConfigs,
                Platform: validatedPlatform,
                MJVersion: process.env.MJ_VERSION ?? '5.11.0',
                SourceType: companyIntegration.Integration,
                AdditionalSchemaInfoPath: process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH ?? 'additionalSchemaInfo.json',
                MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/rsu',
                MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
                ExistingTables: this.buildExistingTables(targetConfigs, provider),
                EntitySettingsForTargets: {}
            };

            const builder = new SchemaBuilder();
            const { SchemaOutput, PipelineResult } = await builder.RunSchemaPipeline(input, {
                SkipGitCommit: skipGitCommit,
                SkipRestart: skipRestart,
            });

            return {
                Success: PipelineResult.Success,
                Message: PipelineResult.Success
                    ? `Schema applied — ${PipelineResult.EntitiesProcessed ?? 0} entities processed`
                    : `Pipeline failed at '${PipelineResult.ErrorStep}': ${PipelineResult.ErrorMessage}`,
                Steps: PipelineResult.Steps.map((s: RSUPipelineStep) => ({
                    Name: s.Name,
                    Status: s.Status,
                    DurationMs: s.DurationMs,
                    Message: s.Message,
                })),
                MigrationFilePath: PipelineResult.MigrationFilePath,
                EntitiesProcessed: PipelineResult.EntitiesProcessed,
                GitCommitSuccess: PipelineResult.GitCommitSuccess,
                APIRestarted: PipelineResult.APIRestarted,
                Warnings: SchemaOutput.Warnings.length > 0 ? SchemaOutput.Warnings : undefined,
            };
        } catch (e) {
            LogError(`IntegrationApplySchema error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Batch apply schema for multiple connectors in one RSU pipeline run.
     * Each item specifies a companyIntegrationID + source objects to create tables for.
     * All migrations run sequentially, then ONE CodeGen, ONE compile, ONE git PR, ONE restart.
     */
    @Mutation(() => ApplySchemaBatchOutput)
    async IntegrationApplySchemaBatch(
        @Arg("items", () => [ApplySchemaBatchItemInput]) items: ApplySchemaBatchItemInput[],
        @Arg("platform", { defaultValue: "sqlserver" }) platform: string,
        @Arg("skipGitCommit", { defaultValue: false }) skipGitCommit: boolean,
        @Arg("skipRestart", { defaultValue: false }) skipRestart: boolean,
        @Ctx() ctx: AppContext
    ): Promise<ApplySchemaBatchOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const validatedPlatform = this.validatePlatform(platform);
            const pipelineInputs: RSUPipelineInput[] = [];
            const itemResults: ApplySchemaBatchItemOutput[] = [];

            // Phase 1: Build schema artifacts for each connector's objects
            for (const item of items) {
                try {
                    const { schemaOutput, rsuInput } = await this.buildSchemaForConnector(
                        item.CompanyIntegrationID, item.Objects, validatedPlatform, user, skipGitCommit, skipRestart, provider
                    );
                    pipelineInputs.push(rsuInput);
                    itemResults.push({
                        CompanyIntegrationID: item.CompanyIntegrationID,
                        Success: true,
                        Message: `Schema generated for ${item.Objects.length} object(s)`,
                        Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
                    });
                } catch (e) {
                    itemResults.push({
                        CompanyIntegrationID: item.CompanyIntegrationID,
                        Success: false,
                        Message: this.formatError(e),
                    });
                }
            }

            // Phase 2: Run all successful migrations through one pipeline batch
            if (pipelineInputs.length === 0) {
                return { Success: false, Message: 'No valid schema inputs to process', Items: itemResults };
            }

            const rsm = RuntimeSchemaManager.Instance;
            const batchResult = await rsm.RunPipelineBatch(pipelineInputs);

            return {
                Success: batchResult.SuccessCount > 0,
                Message: `Batch complete: ${batchResult.SuccessCount} succeeded, ${batchResult.FailureCount} failed`,
                Items: itemResults,
                Steps: batchResult.Results[0]?.Steps.map((s: RSUPipelineStep) => ({
                    Name: s.Name, Status: s.Status, DurationMs: s.DurationMs, Message: s.Message,
                })),
                GitCommitSuccess: batchResult.Results[0]?.GitCommitSuccess,
                APIRestarted: batchResult.Results[0]?.APIRestarted,
            };
        } catch (e) {
            LogError(`IntegrationApplySchemaBatch error: ${e}`);
            return { Success: false, Message: this.formatError(e), Items: [] };
        }
    }

    // ── APPLY ALL (Full Automatic Flow) ──────────────────────────────────

    /**
     * Full automatic "Apply All" flow for MJ integrations.
     * 1. Auto-generates schema/table names from the integration name + source object names
     * 2. Builds DDL + additionalSchemaInfo
     * 3. Runs RSU pipeline (migration → CodeGen → compile → git → restart)
     * 4. Creates CompanyIntegrationEntityMap records for each object
     * 5. Creates CompanyIntegrationFieldMap records for each field (1:1 mapping)
     * 6. Starts sync for the integration
     */
    @Mutation(() => ApplyAllOutput)
    async IntegrationApplyAll(
        @Arg("input") input: ApplyAllInput,
        @Arg("platform", { defaultValue: "sqlserver" }) platform: string,
        @Arg("skipGitCommit", { defaultValue: false }) skipGitCommit: boolean,
        @Arg("skipRestart", { defaultValue: false }) skipRestart: boolean,
        @Ctx() ctx: AppContext
    ): Promise<ApplyAllOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const validatedPlatform = this.validatePlatform(platform);

            // Step 1: Resolve connector and derive schema name
            const { connector, companyIntegration } = await this.resolveConnector(input.CompanyIntegrationID, user, provider);
            const schemaName = this.deriveSchemaName(companyIntegration.Integration);

            // Step 1b: Ensure IntegrationEngine cache is populated so the persisted
            // IO/IOF rows are available for reconstruction below.
            await IntegrationEngine.Instance.Config(false, user);

            // Step 2: Reconstruct SourceSchemaInfo from the persisted IO/IOF rows
            // (already freshened by the Phase 0 v5.39.x MJCompanyIntegrationEntityServer
            // Save hook on IsActive false→true).  Avoids the duplicate vendor-API
            // introspect that used to fire here.
            let sourceSchema: SourceSchemaInfo = this.buildSourceSchemaFromPersistedRows(companyIntegration.IntegrationID);
            if (sourceSchema.Objects.length === 0) {
                // Fallback: the engine cache is empty (Save hook didn't run, or this
                // is a direct-API caller bypassing the wizard).  Do a one-time live
                // introspect + persist + action-generation so the apply still proceeds.
                LogError(`[IntegrationApplyAll] Persisted IO cache empty for ${companyIntegration.Integration}; falling back to live introspect.`);
                sourceSchema = await (connector.IntrospectSchema.bind(connector) as
                    (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>)(companyIntegration, user);
                try {
                    const persistResult = await IntegrationSchemaSync.PersistDiscoveredSchema({
                        IntegrationID: companyIntegration.IntegrationID,
                        SourceSchema: sourceSchema,
                        ContextUser: user,
                    });
                    if (persistResult.ObjectsCreated > 0 || persistResult.FieldsCreated > 0) {
                        console.log(
                            `[IntegrationApplyAll] Fallback persist: ` +
                            `${persistResult.ObjectsCreated} new objects, ${persistResult.FieldsCreated} new fields, ` +
                            `${persistResult.ObjectsUpdated} updated objects, ${persistResult.FieldsUpdated} updated fields`
                        );
                    }
                    if (persistResult.ObjectsCreated > 0) {
                        try {
                            const engineObjects = IntegrationEngine.Instance
                                .GetIntegrationObjectsByIntegrationID(companyIntegration.IntegrationID);
                            const customObjects = sourceSchema.Objects
                                .filter(o => !engineObjects
                                    .some(ex => ex.Name.toLowerCase() === o.ExternalName.toLowerCase() && !ex.IsCustom))
                                .map(o => ({
                                    Name: o.ExternalName,
                                    DisplayName: o.ExternalLabel || o.ExternalName,
                                    Description: o.Description,
                                    SupportsWrite: false,
                                    Fields: o.Fields.map(f => ({
                                        Name: f.Name,
                                        DisplayName: f.Label || f.Name,
                                        Description: f.Description || '',
                                        Type: f.SourceType || 'string',
                                        IsRequired: f.IsRequired,
                                        IsReadOnly: false,
                                        IsPrimaryKey: f.IsPrimaryKey,
                                    })),
                                }));
                            await IntegrationSchemaSync.GenerateActionsForCustomObjects({
                                IntegrationName: companyIntegration.Integration,
                                CustomObjects: customObjects,
                                SupportsSearch: connector.SupportsSearch,
                                SupportsListing: connector.SupportsListing,
                                ContextUser: user,
                            });
                        } catch (actionErr) {
                            const msg = actionErr instanceof Error ? actionErr.message : String(actionErr);
                            console.warn(`[IntegrationApplyAll] Action generation warning (non-fatal): ${msg}`);
                        }
                    }
                } catch (persistErr) {
                    const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
                    console.warn(`[IntegrationApplyAll] Schema persistence warning (non-fatal): ${msg}`);
                }
            } else {
                console.log(
                    `[IntegrationApplyAll] Reusing ${sourceSchema.Objects.length} persisted IOs for ${companyIntegration.Integration} ` +
                    `— skipped duplicate IntrospectSchema (Save-hook already discovered).`
                );
            }

            const resolved = await this.resolveSourceObjectsToNames(input.SourceObjects, sourceSchema, user);
            const resolvedNames = resolved.names;

            // Build SchemaPreviewObjectInput with Fields from the matching
            // SourceObjectInput (resolved.sourceObjects is order-aligned with names).
            // Previously this stripped to IDs only, which silently dropped any
            // selection without an IntegrationObject row yet (newly discovered).
            const objects = resolvedNames.map((name, i) => {
                const obj = new SchemaPreviewObjectInput();
                obj.SourceObjectName = name;
                obj.SchemaName = schemaName;
                obj.TableName = name.replace(/[^A-Za-z0-9_]/g, '_');
                obj.EntityName = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
                obj.Fields = resolved.sourceObjects[i].Fields ?? undefined;
                return obj;
            });

            // Step 3: Build schema and RSU pipeline input
            const { schemaOutput, rsuInput } = await this.buildSchemaForConnector(
                input.CompanyIntegrationID, objects, validatedPlatform, user, skipGitCommit, skipRestart, provider
            );

            // Step 4: Inject integration post-restart payload into RSU input.
            const { join } = await import('node:path');
            const rsuWorkDir = process.env.RSU_WORK_DIR || process.cwd();
            const pendingWorkDir = join(rsuWorkDir, '.rsu_pending');
            const pendingFilePath = join(pendingWorkDir, `${Date.now()}.json`);

            // Build per-object field map for pending file (null = all fields).
            // resolved.sourceObjects is order-aligned with resolvedNames after the
            // resolveSourceObjectsToNames refactor — pair them directly instead
            // of looking up by ID (which broke for name-only selections).
            const sourceObjectFields: Record<string, string[] | null> = {};
            for (let i = 0; i < resolvedNames.length; i++) {
                sourceObjectFields[resolvedNames[i]] = resolved.sourceObjects[i].Fields ?? null;
            }

            const pendingPayload = {
                CompanyIntegrationID: input.CompanyIntegrationID,
                SourceObjectNames: resolvedNames,
                SourceObjectFields: sourceObjectFields,
                SchemaName: schemaName,
                CronExpression: input.CronExpression,
                ScheduleTimezone: input.ScheduleTimezone,
                StartSync: input.StartSync,
                FullSync: input.FullSync ?? false,
                SyncScope: input.SyncScope ?? 'created',
                CreatedAt: new Date().toISOString(),
            };
            rsuInput.PostRestartFiles = [
                { Path: pendingFilePath, Content: JSON.stringify(pendingPayload, null, 2) }
            ];

            // Step 5: Run pipeline (restart kills process at the end)
            const rsm = RuntimeSchemaManager.Instance;
            const batchResult = await rsm.RunPipelineBatch([rsuInput]);

            const migrationSucceeded = batchResult.SuccessCount > 0;
            const pipelineSteps = batchResult.Results[0]?.Steps.map((s: RSUPipelineStep) => ({
                Name: s.Name, Status: s.Status, DurationMs: s.DurationMs, Message: s.Message,
            }));

            // If pipeline failed, clean up pending file and return error
            if (!migrationSucceeded) {
                try { (await import('node:fs')).unlinkSync(pendingFilePath); } catch { /* may not exist */ }
                return {
                    Success: false,
                    Message: `Pipeline failed: ${batchResult.Results[0]?.ErrorMessage ?? 'unknown error'}`,
                    Steps: pipelineSteps,
                    Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
                };
            }

            // If we get here, pipeline succeeded but restart may or may not have happened yet.
            // If restart happened, this code never executes (process died).
            // If skipRestart=true, we can do entity maps now.
            if (skipRestart) {
                await provider.Refresh();
                const entityMapsCreated = await this.createEntityAndFieldMaps(
                    input.CompanyIntegrationID, objects, connector, companyIntegration, schemaName, user, provider,
                    input.DefaultSyncDirection ?? 'Pull'
                );
                const createdMapIDs = entityMapsCreated.map(em => em.EntityMapID).filter(Boolean);
                const scopedMapIDs = input.SyncScope === 'all' ? undefined : createdMapIDs;
                // Skip sync when SyncScope='created' but 0 new maps were
                // created — otherwise empty EntityMapIDs falls through engine's
                // `length > 0` gate and runs a full integration sync against
                // every existing entity map (the 459-record-on-0-map-apply bug).
                const shouldStartSync = input.StartSync !== false &&
                    (input.SyncScope === 'all' || createdMapIDs.length > 0);
                const syncRunID = shouldStartSync
                    ? await this.startSyncAfterApply(input.CompanyIntegrationID, user, scopedMapIDs, input.FullSync)
                    : null;

                // Create schedule if requested
                let scheduledJobID: string | undefined;
                if (input.CronExpression) {
                    try {
                        scheduledJobID = await this.createScheduleForConnector(
                            input.CompanyIntegrationID,
                            companyIntegration.Integration,
                            input.CronExpression,
                            input.ScheduleTimezone,
                            user,
                            provider
                        ) ?? undefined;
                    } catch (schedErr) {
                        console.warn(`[Integration] Schedule creation failed: ${schedErr}`);
                    }
                }

                try { (await import('node:fs')).unlinkSync(pendingFilePath); } catch { /* already consumed */ }

                return {
                    Success: true,
                    Message: `Applied ${objects.length} object(s) — ${entityMapsCreated.length} entity maps created${syncRunID ? ', sync started' : ''}${scheduledJobID ? ', schedule created' : ''}`,
                    Steps: pipelineSteps,
                    EntityMapsCreated: entityMapsCreated,
                    SyncRunID: syncRunID ?? undefined,
                    ScheduledJobID: scheduledJobID,
                    GitCommitSuccess: batchResult.Results[0]?.GitCommitSuccess,
                    APIRestarted: false,
                    Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
                };
            }

            // If restart is enabled, this return may or may not execute
            // (depends on whether PM2 kills process before GraphQL response is sent)
            return {
                Success: true,
                Message: `Applied ${objects.length} object(s) — entity maps will be created after restart`,
                Steps: pipelineSteps,
                GitCommitSuccess: batchResult.Results[0]?.GitCommitSuccess,
                APIRestarted: true,
                Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
            };
        } catch (e) {
            LogError(`IntegrationApplyAll error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /** Derives a SQL-safe schema name from the integration name (e.g., "HubSpot" → "hubspot"). */
    private deriveSchemaName(integrationName: string): string {
        return (integrationName || 'integration').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }

    /** Builds SchemaPreviewObjectInput[] from source object name strings, using auto-derived schema/table names. */
    private buildObjectInputsFromNames(sourceObjectNames: string[], schemaName: string): SchemaPreviewObjectInput[] {
        return sourceObjectNames.map(name => {
            const obj = new SchemaPreviewObjectInput();
            obj.SourceObjectName = name;
            obj.SchemaName = schemaName;
            obj.TableName = name.replace(/[^A-Za-z0-9_]/g, '_');
            obj.EntityName = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
            return obj;
        });
    }

    /**
     * After pipeline success, creates CompanyIntegrationEntityMap + CompanyIntegrationFieldMap
     * records for each source object by matching schema + table name to newly created entities.
     */
    private async createEntityAndFieldMaps(
        companyIntegrationID: string,
        objects: SchemaPreviewObjectInput[],
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        schemaName: string,
        user: UserInfo,
        provider: IMetadataProvider,
        defaultSyncDirection: string = 'Pull'
    ): Promise<ApplyAllEntityMapCreated[]> {
        const results: ApplyAllEntityMapCreated[] = [];

        for (const obj of objects) {
            const entityMapResult = await this.createSingleEntityMap(
                companyIntegrationID, obj, connector, companyIntegration, schemaName, user, provider, defaultSyncDirection
            );
            if (entityMapResult) {
                results.push(entityMapResult);
            }
        }
        return results;
    }

    /** Creates a single entity map + field maps for one source object. */
    private async createSingleEntityMap(
        companyIntegrationID: string,
        obj: SchemaPreviewObjectInput,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        schemaName: string,
        user: UserInfo,
        md: IMetadataProvider,
        defaultSyncDirection: string = 'Pull'
    ): Promise<ApplyAllEntityMapCreated | null> {
        // Find the entity by schema + table name
        const entityInfo = md.Entities.find(
            e => e.SchemaName.toLowerCase() === schemaName.toLowerCase()
              && e.BaseTable.toLowerCase() === obj.TableName.toLowerCase()
        );
        if (!entityInfo) {
            LogError(`IntegrationApplyAll: entity not found for ${schemaName}.${obj.TableName}`);
            return null;
        }

        // Create-or-reuse the entity map. Idempotency is REQUIRED here: ApplyAll is re-run on
        // every wizard re-apply (and by the test harness on every pull). Blindly NewRecord()-ing
        // multiplies the maps in lockstep (N applies → N duplicate maps per object), which
        // silently corrupts the record-map 1:1 completeness gate and makes the forward sync
        // process each object N times. Reuse the existing (connection, external object) map instead.
        const escapedObjectName = obj.SourceObjectName.replace(/'/g, "''");
        const existingMapResult = await new RunView().RunView<MJCompanyIntegrationEntityMapEntity>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND ExternalObjectName='${escapedObjectName}'`,
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: 1,
            ResultType: 'entity_object',
            BypassCache: true, // idempotency must read COMMITTED state, not a possibly-stale filtered cache
        }, user);

        let em: MJCompanyIntegrationEntityMapEntity;
        if (existingMapResult.Success && existingMapResult.Results.length > 0) {
            em = existingMapResult.Results[0]; // reuse — keeps the map stable across re-applies
        } else {
            em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', user);
            em.NewRecord();
            em.CompanyIntegrationID = companyIntegrationID;
            em.ExternalObjectName = obj.SourceObjectName;
        }
        em.EntityID = entityInfo.ID;
        em.SyncDirection = isValidSyncDirection(defaultSyncDirection) ? defaultSyncDirection : 'Pull';
        em.Priority = obj.SourceObjectName.startsWith('assoc_') ? 10 : 0;
        em.Status = 'Active';
        em.SyncEnabled = true;

        if (!await em.Save()) {
            LogError(`IntegrationApplyAll: failed to save entity map for ${obj.SourceObjectName}`);
            return null;
        }

        // Discover fields from the source and create 1:1 field maps
        const fieldMapCount = await this.createFieldMapsForEntityMap(
            em.ID, obj.SourceObjectName, connector, companyIntegration, user, md
        );

        return {
            SourceObjectName: obj.SourceObjectName,
            EntityName: entityInfo.Name,
            EntityMapID: em.ID,
            FieldMapCount: fieldMapCount,
        };
    }

    /** Discovers fields from the source object and creates 1:1 field maps. */
    private async createFieldMapsForEntityMap(
        entityMapID: string,
        sourceObjectName: string,
        connector: BaseIntegrationConnector,
        companyIntegration: MJCompanyIntegrationEntity,
        user: UserInfo,
        md: IMetadataProvider
    ): Promise<number> {
        let fieldCount = 0;
        try {
            const discoverFields = connector.DiscoverFields.bind(connector) as
                (ci: unknown, obj: string, u: unknown) => Promise<ExternalFieldSchema[]>;
            const fields = await discoverFields(companyIntegration, sourceObjectName, user);

            // Idempotency (mirrors the entity-map reuse above): don't re-create field maps that
            // already exist for this entity map, or re-applies multiply them in lockstep.
            const existingFieldMaps = await new RunView().RunView<{ SourceFieldName: string }>({
                EntityName: 'MJ: Company Integration Field Maps',
                ExtraFilter: `EntityMapID='${entityMapID}'`,
                Fields: ['SourceFieldName'],
                ResultType: 'simple',
                BypassCache: true, // read committed field-map state for the idempotency skip
            }, user);
            const alreadyMapped = new Set(
                (existingFieldMaps.Results ?? []).map(r => (r.SourceFieldName ?? '').toLowerCase())
            );

            for (const field of fields) {
                if (alreadyMapped.has(field.Name.toLowerCase())) {
                    fieldCount++; // already present — count it so the reported total stays stable
                    continue;
                }
                const fm = await md.GetEntityObject<MJCompanyIntegrationFieldMapEntity>('MJ: Company Integration Field Maps', user);
                fm.NewRecord();
                fm.EntityMapID = entityMapID;
                fm.SourceFieldName = field.Name;
                fm.DestinationFieldName = field.Name.replace(/[^A-Za-z0-9_]/g, '_');
                fm.IsKeyField = field.IsUniqueKey;
                fm.IsRequired = field.IsRequired;
                fm.Direction = 'SourceToDest';
                fm.Status = 'Active';
                fm.Priority = 0;

                if (await fm.Save()) {
                    fieldCount++;
                }
            }
        } catch (e) {
            LogError(`IntegrationApplyAll: failed to discover/create field maps for ${sourceObjectName}: ${this.formatError(e)}`);
        }
        return fieldCount;
    }

    /** Starts sync after a successful apply-all pipeline, returning the run ID if available. */
    private async startSyncAfterApply(companyIntegrationID: string, user: UserInfo, entityMapIDs?: string[], fullSync?: boolean): Promise<string | null> {
        try {
            await IntegrationEngine.Instance.Config(false, user);
            const options: IntegrationSyncOptions = {};
            if (entityMapIDs?.length) options.EntityMapIDs = entityMapIDs;
            if (fullSync) options.FullSync = true;
            const finalOptions = Object.keys(options).length > 0 ? options : undefined;
            const syncPromise = IntegrationEngine.Instance.RunSync(companyIntegrationID, user, 'Manual', undefined, undefined, finalOptions);

            // Fire and forget — don't block the response
            syncPromise.catch(err => {
                LogError(`IntegrationApplyAll: background sync failed for ${companyIntegrationID}: ${err}`);
            });

            // Small delay to let the run record get created
            await new Promise(resolve => setTimeout(resolve, 200));

            const rv = new RunView();
            const runResult = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Company Integration Runs',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND Status='In Progress'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
                Fields: ['ID']
            }, user);

            return (runResult.Success && runResult.Results.length > 0) ? runResult.Results[0].ID : null;
        } catch (e) {
            LogError(`IntegrationApplyAll: sync start failed: ${this.formatError(e)}`);
            return null;
        }
    }

    /**
     * Build schema artifacts for a single connector's objects.
     * Shared by IntegrationApplySchema (single) and IntegrationApplySchemaBatch (batch).
     */
    /**
     * §B — enforce OPTIONAL table/column caps at the create-tables (RSU) gate. These are OPERATOR
     * (deployment) guardrails read from ENV — `MJ_INTEGRATION_MAX_TABLES` / `MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE`
     * (absent or ≤0 = unbounded, the common case). They are DELIBERATELY env-only, NOT per-connection
     * `Configuration`/GraphQL: a guardrail a user can raise via the same API they apply with is toothless.
     * THROWS a clear error when the selection exceeds a cap so NOTHING partial is created — the caller surfaces
     * it and the user narrows the selection (the cap itself is an operator concern). NEVER truncates. Discovery
     * still surfaces every object/field; only materialization is capped. Per-table column count = the selected
     * field subset, or the object's full discovered field count when all fields are selected.
     */
    private enforceSchemaLimits(
        objects: SchemaPreviewObjectInput[],
        filteredSchema: SourceSchemaInfo,
    ): void {
        const envInt = (name: string): number | null => {
            const v = parseInt(process.env[name] ?? '', 10);
            return Number.isFinite(v) && v > 0 ? v : null;
        };
        const fullCountByName = new Map(filteredSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.Fields.length]));
        // Delegate the cap decision to the engine's pure, unit-tested decideSchemaLimitViolations.
        const violations = decideSchemaLimitViolations({
            TableCount: objects.length,
            ColumnCountByTable: objects.map(o => ({
                Name: o.SourceObjectName,
                ColumnCount: o.Fields?.length ?? fullCountByName.get(o.SourceObjectName.toLowerCase()) ?? 0,
            })),
            MaxTables: envInt('MJ_INTEGRATION_MAX_TABLES'),
            MaxColumnsPerTable: envInt('MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE'),
        });
        if (violations.length > 0) throw new Error(violations.join(' '));
    }

    private async buildSchemaForConnector(
        companyIntegrationID: string,
        objects: SchemaPreviewObjectInput[],
        platform: 'sqlserver' | 'postgresql',
        user: UserInfo,
        skipGitCommit: boolean,
        skipRestart: boolean,
        provider: IMetadataProvider,
        prefetchedSourceSchema?: SourceSchemaInfo
    ): Promise<{ schemaOutput: SchemaBuilderOutput; rsuInput: RSUPipelineInput }> {
        const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, provider);

        // Source-schema resolution order:
        //   1. Use prefetched schema if the caller passed one (legacy ApplyAllBatch path).
        //   2. Reconstruct from persisted IO/IOF rows — the Phase 0 v5.39.x Save hook
        //      already discovered + persisted everything when the wizard flipped
        //      `IsActive false→true`.  No need to re-hit the vendor API.
        //   3. Only when both above are empty do we fall back to live IntrospectSchema
        //      (direct-API callers bypassing the wizard).
        //
        // Pre-Phase-0 the legacy path ran introspect TWICE per apply — once in the
        // resolver and once here — which doubled probe time on connectors like Sage
        // Intacct AND silently dropped selections when the second pass returned
        // fewer objects than the first (rate limits, transient errors).
        let sourceSchema: SourceSchemaInfo;
        if (prefetchedSourceSchema) {
            sourceSchema = prefetchedSourceSchema;
        } else {
            const requestedNamesForReuse = objects.map(o => o.SourceObjectName);
            sourceSchema = this.buildSourceSchemaFromPersistedRows(
                companyIntegration.IntegrationID,
                requestedNamesForReuse,
            );
            if (sourceSchema.Objects.length === 0) {
                LogError(`[buildSchemaForConnector] Persisted IO cache empty for ${companyIntegration.Integration}; falling back to live introspect.`);
                const introspect = connector.IntrospectSchema.bind(connector) as
                    (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
                sourceSchema = await introspect(companyIntegration, user);
            } else {
                console.log(
                    `[buildSchemaForConnector] Reusing ${sourceSchema.Objects.length} persisted IOs for ${companyIntegration.Integration} ` +
                    `— skipped duplicate IntrospectSchema (Save-hook already discovered).`
                );
            }
        }

        // Normalize names to match source schema casing
        const nameMap = new Map(sourceSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.ExternalName]));
        for (const obj of objects) {
            const exact = nameMap.get(obj.SourceObjectName.toLowerCase());
            if (exact) obj.SourceObjectName = exact;
        }

        const requestedNames = new Set(objects.map(o => o.SourceObjectName));
        const filteredSchema: SourceSchemaInfo = {
            Objects: sourceSchema.Objects.filter(o => requestedNames.has(o.ExternalName))
        };

        // §B — reject an over-limit table/column SELECTION before ANY table is materialized. This is the
        // single shared gate for ApplyAll / ApplyAllBatch / ApplySchemaBatch (all route through here).
        // Caps are operator/env guardrails (MJ_INTEGRATION_MAX_TABLES / _MAX_COLUMNS_PER_TABLE).
        this.enforceSchemaLimits(objects, filteredSchema);

        const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, platform, connector);

        const input: SchemaBuilderInput = {
            SourceSchema: filteredSchema,
            TargetConfigs: targetConfigs,
            Platform: platform,
            MJVersion: process.env.MJ_VERSION ?? '5.11.0',
            SourceType: companyIntegration.Integration,
            AdditionalSchemaInfoPath: process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH ?? 'additionalSchemaInfo.json',
            MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/rsu',
            MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
            ExistingTables: this.buildExistingTables(targetConfigs, provider),
            EntitySettingsForTargets: {}
        };

        const builder = new SchemaBuilder();
        const schemaOutput = builder.BuildSchema(input);

        if (schemaOutput.Errors.length > 0) {
            throw new Error(`Schema generation failed: ${schemaOutput.Errors.join('; ')}`);
        }

        const rsuInput = builder.BuildRSUInput(schemaOutput, input, { SkipGitCommit: skipGitCommit, SkipRestart: skipRestart });
        return { schemaOutput, rsuInput };
    }

    // ── SYNC ────────────────────────────────────────────────────────────

    /**
     * Starts an async integration sync. Returns immediately with the run ID.
     * Sends a webhook to the registered callback when complete.
     */
    @Mutation(() => StartSyncOutput)
    async IntegrationStartSync(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("webhookURL", { nullable: true }) webhookURL: string,
        @Arg("fullSync", () => Boolean, { defaultValue: false, description: 'If true, ignores watermarks and re-fetches all records from the source' }) fullSync: boolean,
        @Arg("entityMapIDs", () => [String], { nullable: true, description: 'Optional: sync only these entity maps. If omitted, syncs all maps for the connector.' }) entityMapIDs: string[],
        @Arg("syncDirection", () => String, { nullable: true, description: 'Override sync direction: Pull | Push | Bidirectional. If omitted, each entity map\'s own SyncDirection is used.' }) syncDirection: 'Pull' | 'Push' | 'Bidirectional' | undefined,
        @Ctx() ctx: AppContext
    ): Promise<StartSyncOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            await IntegrationEngine.Instance.Config(false, user);

            // Reject upfront if the connector is deactivated. The engine also gates this
            // authoritatively (no run record is created), but returning Success:false here gives the
            // client immediate, unambiguous feedback instead of an optimistic fire-and-forget that
            // silently no-ops. IsActive is boolean|null — only an explicit false rejects (null/unset
            // connections predating the flag are unaffected).
            const ciProvider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const ciCheck = await ciProvider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            if (await ciCheck.InnerLoad(CompositeKey.FromID(companyIntegrationID)) && ciCheck.IsActive === false) {
                return { Success: false, Message: 'Connector is deactivated (IsActive=false); sync not started' };
            }

            const syncOptions: { FullSync?: boolean; EntityMapIDs?: string[]; SyncDirection?: 'Pull' | 'Push' | 'Bidirectional' } = {};
            if (fullSync) syncOptions.FullSync = true;
            if (entityMapIDs?.length) syncOptions.EntityMapIDs = entityMapIDs;
            if (syncDirection) syncOptions.SyncDirection = syncDirection;

            // Capture the fire instant BEFORE launching the sync. The run-record lookup below
            // finds the run by recency (StartedAt >= firedAt) rather than by transient status, so
            // a fast run (0-record / empty connector / quick failure) that finishes before we poll
            // is still reported with its real RunID instead of an untrackable null. RunSync stamps
            // StartedAt with an app-side `new Date()`, so this clock is consistent with the row.
            const firedAt = new Date();

            // Fire and forget — progress is tracked inside IntegrationEngine
            const syncPromise = IntegrationEngine.Instance.RunSync(
                companyIntegrationID,
                user,
                'Manual',
                undefined,
                undefined,
                Object.keys(syncOptions).length > 0 ? syncOptions : undefined
            );

            syncPromise
                .then(async (result) => {
                    if (webhookURL) {
                        await this.sendWebhook(webhookURL, {
                            event: result.Success ? 'sync_complete' : 'sync_failed',
                            companyIntegrationID,
                            success: result.Success,
                            recordsProcessed: result.RecordsProcessed,
                            recordsCreated: result.RecordsCreated,
                            recordsUpdated: result.RecordsUpdated,
                            recordsErrored: result.RecordsErrored,
                            errorCount: result.Errors.length
                        });
                    }
                })
                .catch(async (err) => {
                    console.error(`[Integration] Background sync failed for ${companyIntegrationID}:`, err);
                    if (webhookURL) {
                        await this.sendWebhook(webhookURL, {
                            event: 'sync_failed',
                            companyIntegrationID,
                            success: false,
                            error: err instanceof Error ? err.message : String(err)
                        });
                    }
                });

            // Resolve the run record by RECENCY, not by transient 'In Progress' status. The prior
            // implementation slept a fixed 200ms then filtered Status='In Progress' — when the run
            // finished in under 200ms (an empty connector, a 0-record sync, or a fast synchronous
            // failure) there was no 'In Progress' row to find, so it returned Success:true with a
            // null RunID: an optimistic, untrackable result that read as "started" when nothing
            // could be followed. Poll briefly for ANY run for this connector stamped at/after the
            // fire instant; that catches both the still-running and the already-finished cases.
            const firedAtFilter = firedAt.toISOString();
            let run: { ID: string; Status: string } | null = null;
            for (let attempt = 0; attempt < 15 && !run; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 200));
                const rv = new RunView();
                const runResult = await rv.RunView<MJCompanyIntegrationRunEntity>({
                    EntityName: 'MJ: Company Integration Runs',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND StartedAt >= '${firedAtFilter}'`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 1,
                    ResultType: 'simple',
                    Fields: ['ID', 'Status', 'StartedAt']
                }, user);
                if (runResult.Success && runResult.Results.length > 0) {
                    run = runResult.Results[0];
                }
            }

            // No run record after the poll window ⇒ the sync genuinely did not start (it no-op'd
            // before creating a run). Report that honestly rather than claiming Success with a null
            // RunID — a caller/scheduler can act on a false, but a true+null silently strands it.
            if (!run) {
                return {
                    Success: false,
                    Message: 'Sync did not start — no run record was created (the connector may be gated or misconfigured)'
                };
            }

            return {
                Success: true,
                Message: 'Sync started',
                RunID: run.ID
            };
        } catch (e) {
            LogError(`IntegrationStartSync error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Cancels a running sync by marking its status as Cancelled.
     */
    @Mutation(() => MutationResultOutput)
    async IntegrationCancelSync(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            this.getAuthenticatedUser(ctx);

            // Signal the engine to abort the running sync
            const cancelled = IntegrationEngine.CancelSync(companyIntegrationID);
            if (!cancelled) {
                return { Success: false, Message: 'No active sync found for this connector' };
            }

            return { Success: true, Message: 'Sync cancellation signalled — will stop after current batch completes' };
        } catch (e) {
            LogError(`IntegrationCancelSync error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Writes a single record to an external system via the integration connector.
     * Supports create, update, and delete operations.
     */
    @Mutation(() => WriteRecordOutput)
    async IntegrationWriteRecord(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("objectName") objectName: string,
        @Arg("operation", () => String, { description: 'create, update, or delete' }) operation: string,
        @Arg("externalID", { nullable: true, description: 'Required for update/delete' }) externalID: string,
        @Arg("attributes", () => String, { nullable: true, description: 'JSON object of field values for create/update' }) attributesJson: string,
        @Ctx() ctx: AppContext
    ): Promise<WriteRecordOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            await IntegrationEngine.Instance.Config(false, user);

            const rv = new RunView();
            const ciResult = await rv.RunView<MJCompanyIntegrationEntity>({
                EntityName: 'MJ: Company Integrations',
                ExtraFilter: `ID='${companyIntegrationID}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            }, user);

            if (!ciResult.Success || ciResult.Results.length === 0) {
                return { Success: false, Message: `Company Integration not found: ${companyIntegrationID}` };
            }

            const companyIntegration = ciResult.Results[0];

            // Load the Integration entity to get the ClassName for connector resolution.
            // Entity is registered as 'MJ: Integrations' (the "MJ: " prefix is required — the sibling
            // CompanyIntegration lookup above uses 'MJ: Company Integrations'); the bare 'Integrations'
            // name is not in metadata, which dead-lettered the entire IntegrationWriteRecord (push) path.
            const integResult = await rv.RunView<MJIntegrationEntity>({
                EntityName: 'MJ: Integrations',
                ExtraFilter: `ID='${companyIntegration.IntegrationID}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            }, user);
            if (!integResult.Success || integResult.Results.length === 0) {
                return { Success: false, Message: `Integration not found: ${companyIntegration.IntegrationID}` };
            }
            const connector = ConnectorFactory.Resolve(integResult.Results[0]);

            const attributes = attributesJson ? JSON.parse(attributesJson) as Record<string, unknown> : {};
            const crudBase = { CompanyIntegration: companyIntegration, ObjectName: objectName, ContextUser: user };

            let result: { Success: boolean; ExternalID?: string; ErrorMessage?: string; StatusCode: number };

            switch (operation.toLowerCase()) {
                case 'create':
                    if (!connector.SupportsCreate) return { Success: false, Message: 'Connector does not support create' };
                    result = await connector.CreateRecord({ ...crudBase, Attributes: attributes });
                    break;
                case 'update':
                    if (!connector.SupportsUpdate) return { Success: false, Message: 'Connector does not support update' };
                    if (!externalID) return { Success: false, Message: 'externalID is required for update' };
                    result = await connector.UpdateRecord({ ...crudBase, ExternalID: externalID, Attributes: attributes });
                    break;
                case 'delete':
                    if (!connector.SupportsDelete) return { Success: false, Message: 'Connector does not support delete' };
                    if (!externalID) return { Success: false, Message: 'externalID is required for delete' };
                    result = await connector.DeleteRecord({ ...crudBase, ExternalID: externalID });
                    break;
                default:
                    return { Success: false, Message: `Invalid operation: ${operation}. Must be create, update, or delete` };
            }

            return {
                Success: result.Success,
                Message: result.Success ? `${operation} succeeded` : (result.ErrorMessage ?? `${operation} failed`),
                ExternalID: result.ExternalID,
                StatusCode: result.StatusCode,
            };
        } catch (e) {
            LogError(`IntegrationWriteRecord error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── SCHEDULE ────────────────────────────────────────────────────────

    @Mutation(() => CreateScheduleOutput)
    async IntegrationCreateSchedule(
        @Arg("input") input: CreateScheduleInput,
        @Ctx() ctx: AppContext
    ): Promise<CreateScheduleOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const rv = new RunView();

            // §13 — select the driver by job-kind: 'discovery' = schema-only refresh on a cron;
            // 'sync' (default) = the data-moving RunSync job.
            const jobKind = (input.JobKind ?? 'sync').toLowerCase();
            const driverClass = jobKind === 'discovery'
                ? 'IntegrationDiscoveryScheduledJobDriver'
                : 'IntegrationSyncScheduledJobDriver';

            const jobTypeResult = await rv.RunView<MJScheduledJobTypeEntity>({
                EntityName: 'MJ: Scheduled Job Types',
                ExtraFilter: `DriverClass='${driverClass}'`,
                MaxRows: 1,
                ResultType: 'simple',
                Fields: ['ID']
            }, user);
            if (!jobTypeResult.Success || jobTypeResult.Results.length === 0) {
                return { Success: false, Message: `Scheduled job type not found for driver '${driverClass}' (kind='${jobKind}')` };
            }
            const jobTypeID = jobTypeResult.Results[0].ID;

            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
            job.NewRecord();
            job.JobTypeID = jobTypeID;
            job.Name = input.Name;
            if (input.Description) job.Description = input.Description;
            job.CronExpression = input.CronExpression;
            job.Timezone = input.Timezone || 'UTC';
            job.Status = 'Active';
            job.OwnerUserID = user.ID;
            const jobConfig: Record<string, unknown> = { CompanyIntegrationID: input.CompanyIntegrationID };
            if (jobKind === 'discovery') {
                // Discovery job: schema-only. SyncDirection/FullSync are meaningless here; carry the
                // deactivate toggle instead (driver defaults it to true when omitted).
                if (input.DeactivateAbsent !== undefined && input.DeactivateAbsent !== null) jobConfig.DeactivateAbsent = input.DeactivateAbsent;
            } else {
                if (input.SyncDirection) jobConfig.SyncDirection = input.SyncDirection;
                if (input.FullSync) jobConfig.FullSync = input.FullSync;
            }
            job.Configuration = JSON.stringify(jobConfig);
            job.NextRunAt = CronExpressionHelper.GetNextRunTime(input.CronExpression, input.Timezone || 'UTC');

            if (!await job.Save()) return { Success: false, Message: 'Failed to create schedule' };

            // Link to CompanyIntegration
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const ciLoaded = await ci.InnerLoad(CompositeKey.FromID(input.CompanyIntegrationID));
            if (ciLoaded) {
                ci.ScheduleEnabled = true;
                ci.ScheduleType = 'Cron';
                ci.CronExpression = input.CronExpression;
                await ci.Save();
            }

            return { Success: true, Message: 'Schedule created', ScheduledJobID: job.ID };
        } catch (e) {
            LogError(`IntegrationCreateSchedule error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Mutation(() => MutationResultOutput)
    async IntegrationUpdateSchedule(
        @Arg("scheduledJobID") scheduledJobID: string,
        @Arg("cronExpression", { nullable: true }) cronExpression: string,
        @Arg("timezone", { nullable: true }) timezone: string,
        @Arg("name", { nullable: true }) name: string,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
            const loaded = await job.InnerLoad(CompositeKey.FromID(scheduledJobID));
            if (!loaded) return { Success: false, Message: 'ScheduledJob not found' };

            if (cronExpression) job.CronExpression = cronExpression;
            if (timezone) job.Timezone = timezone;
            if (name) job.Name = name;
            if (cronExpression || timezone) {
                job.NextRunAt = CronExpressionHelper.GetNextRunTime(job.CronExpression, job.Timezone || 'UTC');
            }

            if (!await job.Save()) return { Success: false, Message: 'Failed to update' };
            return { Success: true, Message: 'Updated' };
        } catch (e) {
            LogError(`IntegrationUpdateSchedule error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Mutation(() => MutationResultOutput)
    async IntegrationToggleSchedule(
        @Arg("scheduledJobID") scheduledJobID: string,
        @Arg("enabled", () => Boolean) enabled: boolean,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            this.getAuthenticatedUser(ctx); // verify caller is authenticated
            const sysUser = this.getSystemUser();
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', sysUser);
            const loaded = await job.InnerLoad(CompositeKey.FromID(scheduledJobID));
            if (!loaded) return { Success: false, Message: 'ScheduledJob not found' };
            job.Status = enabled ? 'Active' : 'Paused';
            if (!await job.Save()) {
                const err = job.LatestResult?.Message || 'Unknown error';
                return { Success: false, Message: `Failed to toggle: ${err}` };
            }
            return { Success: true, Message: enabled ? 'Activated' : 'Paused' };
        } catch (e) {
            LogError(`IntegrationToggleSchedule error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Mutation(() => MutationResultOutput)
    async IntegrationDeleteSchedule(
        @Arg("scheduledJobID") scheduledJobID: string,
        @Arg("companyIntegrationID", { nullable: true }) companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            this.getAuthenticatedUser(ctx); // verify caller is authenticated
            const sysUser = this.getSystemUser(); // use system user for delete operations
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;

            // Unlink from CI if provided
            if (companyIntegrationID) {
                const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', sysUser);
                const ciLoaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
                if (ciLoaded) {
                    ci.ScheduleEnabled = false;
                    ci.CronExpression = null;
                    await ci.Save();
                }
            }

            const rv = new RunView();

            // Clear ScheduledJobID on any CompanyIntegration that references this job
            const ciResult = await rv.RunView<MJCompanyIntegrationEntity>({
                EntityName: 'MJ: Company Integrations',
                ExtraFilter: `ScheduledJobID='${scheduledJobID}'`,
                ResultType: 'entity_object',
            }, sysUser);
            if (ciResult.Success) {
                for (const refCI of ciResult.Results) {
                    refCI.ScheduledJobID = null;
                    refCI.ScheduleEnabled = false;
                    refCI.CronExpression = null;
                    await refCI.Save();
                }
            }

            // Null out ScheduledJobRunID on CompanyIntegrationRuns that reference this job's runs
            const jobRunsResult = await rv.RunView<MJScheduledJobRunEntity>({
                EntityName: 'MJ: Scheduled Job Runs',
                ExtraFilter: `ScheduledJobID='${scheduledJobID}'`,
                ResultType: 'entity_object',
            }, sysUser);
            if (jobRunsResult.Success) {
                for (const jr of jobRunsResult.Results) {
                    // Find CompanyIntegrationRuns referencing this job run and null the FK
                    const ciRunsResult = await rv.RunView<MJCompanyIntegrationRunEntity>({
                        EntityName: 'MJ: Company Integration Runs',
                        ExtraFilter: `ScheduledJobRunID='${jr.ID}'`,
                        ResultType: 'entity_object',
                    }, sysUser);
                    if (ciRunsResult.Success) {
                        for (const ciRun of ciRunsResult.Results) {
                            ciRun.ScheduledJobRunID = null;
                            await ciRun.Save();
                        }
                    }
                }
            }

            // Now delete job runs + job in a transaction
            const tg = await md.CreateTransactionGroup();
            if (jobRunsResult.Success) {
                for (const run of jobRunsResult.Results) {
                    run.TransactionGroup = tg;
                    await run.Delete();
                }
            }

            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', sysUser);
            const loaded = await job.InnerLoad(CompositeKey.FromID(scheduledJobID));
            if (!loaded) return { Success: false, Message: 'ScheduledJob not found' };
            job.TransactionGroup = tg;
            await job.Delete();
            const deleted = await tg.Submit();
            if (!deleted) {
                const err = job.LatestResult?.Message || 'Unknown error';
                return { Success: false, Message: `Failed to delete: ${err}` };
            }
            return { Success: true, Message: `Deleted (${jobRunsResult.Results?.length ?? 0} runs removed)` };
        } catch (e) {
            LogError(`IntegrationDeleteSchedule error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Query(() => ListSchedulesOutput)
    async IntegrationListSchedules(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<ListSchedulesOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string; Status: string; CronExpression: string; Timezone: string; NextRunAt: string; LastRunAt: string; RunCount: number; SuccessCount: number; FailureCount: number }>({
                EntityName: 'MJ: Scheduled Jobs',
                ExtraFilter: `Configuration LIKE '%"CompanyIntegrationID":"${companyIntegrationID}"%'`,
                OrderBy: '__mj_CreatedAt DESC',
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'Status', 'CronExpression', 'Timezone', 'NextRunAt', 'LastRunAt', 'RunCount', 'SuccessCount', 'FailureCount']
            }, user);

            if (!result.Success) return { Success: false, Message: result.ErrorMessage || 'Query failed' };
            return {
                Success: true,
                Message: `${result.Results.length} schedule(s)`,
                Schedules: result.Results.map(r => ({
                    ID: r.ID,
                    Name: r.Name,
                    Status: r.Status,
                    CronExpression: r.CronExpression,
                    Timezone: r.Timezone,
                    NextRunAt: r.NextRunAt ?? undefined,
                    LastRunAt: r.LastRunAt ?? undefined,
                    RunCount: r.RunCount,
                    SuccessCount: r.SuccessCount,
                    FailureCount: r.FailureCount,
                }))
            };
        } catch (e) {
            LogError(`IntegrationListSchedules error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── ENTITY MAP MANAGEMENT ──────────────────────────────────────────

    @Query(() => ListEntityMapsOutput)
    async IntegrationListEntityMaps(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<ListEntityMapsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            const result = await rv.RunView<EntityMapSummaryOutput>({
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                OrderBy: 'Priority ASC',
                ResultType: 'simple',
                Fields: ['ID', 'EntityID', 'Entity', 'ExternalObjectName', 'SyncDirection', 'Priority', 'Status', 'Configuration'],
                BypassCache: true, // operational list must reflect COMMITTED state (wizard/lifecycle act on it)
            }, user);

            if (!result.Success) return { Success: false, Message: result.ErrorMessage || 'Query failed' };
            return {
                Success: true,
                Message: `${result.Results.length} entity maps`,
                EntityMaps: result.Results
            };
        } catch (e) {
            LogError(`IntegrationListEntityMaps error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Query(() => ListFieldMapsOutput)
    async IntegrationListFieldMaps(
        @Arg("entityMapID") entityMapID: string,
        @Ctx() ctx: AppContext
    ): Promise<ListFieldMapsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            const result = await rv.RunView<FieldMapSummaryOutput>({
                EntityName: 'MJ: Company Integration Field Maps',
                ExtraFilter: `EntityMapID='${entityMapID}'`,
                OrderBy: 'SourceFieldName',
                ResultType: 'simple',
                BypassCache: true, // operational list must reflect COMMITTED state
                Fields: ['ID', 'EntityMapID', 'SourceFieldName', 'DestinationFieldName', 'Status']
            }, user);

            if (!result.Success) return { Success: false, Message: result.ErrorMessage || 'Query failed' };
            return {
                Success: true,
                Message: `${result.Results.length} field maps`,
                FieldMaps: result.Results
            };
        } catch (e) {
            LogError(`IntegrationListFieldMaps error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Mutation(() => MutationResultOutput)
    async IntegrationUpdateEntityMaps(
        @Arg("updates", () => [EntityMapUpdateInput]) updates: EntityMapUpdateInput[],
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const errors: string[] = [];

            for (const update of updates) {
                const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', user);
                const loaded = await em.InnerLoad(CompositeKey.FromID(update.EntityMapID));
                if (!loaded) { errors.push(`${update.EntityMapID}: not found`); continue; }

                if (update.SyncDirection != null) {
                    if (!isValidSyncDirection(update.SyncDirection)) {
                        errors.push(`${update.EntityMapID}: invalid SyncDirection "${update.SyncDirection}"`);
                        continue;
                    }
                    em.SyncDirection = update.SyncDirection;
                }
                if (update.Priority != null) em.Priority = update.Priority;
                if (update.Configuration != null) em.Configuration = update.Configuration;
                if (update.Status != null) {
                    if (!isValidEntityMapStatus(update.Status)) {
                        errors.push(`${update.EntityMapID}: invalid Status "${update.Status}"`);
                        continue;
                    }
                    em.Status = update.Status;
                }

                if (!await em.Save()) errors.push(`${update.EntityMapID}: failed to save — ${em.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            if (errors.length > 0) return { Success: false, Message: `Errors: ${errors.join('; ')}` };
            return { Success: true, Message: `Updated ${updates.length} entity maps` };
        } catch (e) {
            LogError(`IntegrationUpdateEntityMaps error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Mutation(() => MutationResultOutput)
    async IntegrationDeleteEntityMaps(
        @Arg("entityMapIDs", () => [String]) entityMapIDs: string[],
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            this.getAuthenticatedUser(ctx);
            const sysUser = this.getSystemUser();
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const rv = new RunView();
            const tg = await md.CreateTransactionGroup();
            const errors: string[] = [];

            for (const entityMapID of entityMapIDs) {
                const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', sysUser);
                const loaded = await em.InnerLoad(CompositeKey.FromID(entityMapID));
                if (!loaded) { errors.push(`${entityMapID}: not found`); continue; }

                // Delete field maps
                const fmResult = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
                    EntityName: 'MJ: Company Integration Field Maps',
                    ExtraFilter: `EntityMapID='${entityMapID}'`,
                    ResultType: 'entity_object'
                }, sysUser);
                if (fmResult.Success) {
                    for (const fm of fmResult.Results) { fm.TransactionGroup = tg; await fm.Delete(); }
                }

                // Delete watermarks
                const wmResult = await rv.RunView<MJCompanyIntegrationSyncWatermarkEntity>({
                    EntityName: 'MJ: Company Integration Sync Watermarks',
                    ExtraFilter: `EntityMapID='${entityMapID}'`,
                    ResultType: 'entity_object'
                }, sysUser);
                if (wmResult.Success) {
                    for (const wm of wmResult.Results) { wm.TransactionGroup = tg; await wm.Delete(); }
                }

                // Delete record maps for THIS entity only (filter by CI + EntityID)
                const rmResult = await rv.RunView<MJCompanyIntegrationRecordMapEntity>({
                    EntityName: 'MJ: Company Integration Record Maps',
                    ExtraFilter: `CompanyIntegrationID='${em.CompanyIntegrationID}' AND EntityID='${em.EntityID}'`,
                    ResultType: 'entity_object'
                }, sysUser);
                if (rmResult.Success) {
                    for (const rm of rmResult.Results) { rm.TransactionGroup = tg; await rm.Delete(); }
                }

                em.TransactionGroup = tg;
                await em.Delete();
            }

            const submitted = await tg.Submit();
            if (!submitted) return { Success: false, Message: 'Transaction failed — all deletes rolled back' };
            if (errors.length > 0) return { Success: false, Message: `Partial: ${errors.join('; ')}` };
            return { Success: true, Message: `Deleted ${entityMapIDs.length} entity maps (with field maps, watermarks, record maps)` };
        } catch (e) {
            LogError(`IntegrationDeleteEntityMaps error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── OPERATION PROGRESS (polling) ──────────────────────────────────

    @Query(() => OperationProgressOutput)
    async IntegrationGetRSUProgress(
        @Ctx() ctx: AppContext
    ): Promise<OperationProgressOutput> {
        try {
            this.getAuthenticatedUser(ctx);
            const rsm = RuntimeSchemaManager.Instance;
            const rsuStatus = rsm.GetStatus();
            if (rsuStatus.Running) {
                return {
                    Success: true,
                    Message: 'RSU pipeline in progress',
                    OperationType: 'rsu',
                    IsRunning: true,
                    RSURunning: true,
                    RSUStep: rsuStatus.LastRunResult ?? 'running',
                    StartedAt: rsuStatus.LastRunAt?.toISOString(),
                    ElapsedMs: rsuStatus.LastRunAt ? Date.now() - rsuStatus.LastRunAt.getTime() : undefined,
                };
            }
            return { Success: true, Message: 'No RSU pipeline running', OperationType: 'none', IsRunning: false };
        } catch (e) {
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Query(() => OperationProgressOutput)
    async IntegrationGetSyncProgress(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<OperationProgressOutput> {
        try {
            this.getAuthenticatedUser(ctx);
            const syncProgress = IntegrationEngine.GetSyncProgress(companyIntegrationID);
            if (syncProgress) {
                return {
                    Success: true,
                    Message: `Sync in progress (${syncProgress.TriggerType})`,
                    OperationType: 'sync',
                    IsRunning: true,
                    CurrentEntity: syncProgress.CurrentEntity,
                    EntityMapsTotal: syncProgress.EntityMapsTotal,
                    EntityMapsCompleted: syncProgress.EntityMapsCompleted,
                    RecordsProcessed: syncProgress.RecordsProcessed,
                    RecordsCreated: syncProgress.RecordsCreated,
                    RecordsUpdated: syncProgress.RecordsUpdated,
                    RecordsErrored: syncProgress.RecordsErrored,
                    StartedAt: syncProgress.StartedAt.toISOString(),
                    ElapsedMs: Date.now() - syncProgress.StartedAt.getTime(),
                };
            }
            return { Success: true, Message: 'No sync running for this connector', OperationType: 'none', IsRunning: false };
        } catch (e) {
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── STATUS & HISTORY (not polling — for page loads) ─────────────────

    @Query(() => IntegrationStatusOutput)
    async IntegrationGetStatus(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<IntegrationStatusOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'Not found' };

            const rv = new RunView();
            const [mapsResult, runsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Company Integration Entity Maps',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                    ResultType: 'simple',
                    Fields: ['ID', 'Status'],
                    // Status must reflect the live state immediately after a deselect/reselect
                    // (UpdateEntityMaps). Bypass the server RunView cache so ActiveEntityMaps never
                    // reports a stale count right after a map's Status is toggled.
                    BypassCache: true
                },
                {
                    EntityName: 'MJ: Company Integration Runs',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 1,
                    ResultType: 'simple',
                    Fields: ['ID', 'Status', 'StartedAt', 'EndedAt', 'TotalRecords'],
                    BypassCache: true
                }
            ], user);

            const maps = mapsResult.Success ? mapsResult.Results as Array<{ ID: string; Status: string }> : [];
            const lastRun = runsResult.Success && runsResult.Results.length > 0
                ? runsResult.Results[0] as { ID: string; Status: string; StartedAt: string; EndedAt: string; TotalRecords: number }
                : null;

            // RSU pipeline state
            const rsuStatus = RuntimeSchemaManager.Instance.GetStatus();

            return {
                Success: true,
                Message: 'OK',
                IsActive: ci.IsActive ?? false,
                IntegrationName: ci.Integration,
                CompanyIntegrationID: companyIntegrationID,
                TotalEntityMaps: maps.length,
                ActiveEntityMaps: maps.filter(m => m.Status === 'Active').length,
                LastRunStatus: lastRun?.Status,
                LastRunStartedAt: lastRun?.StartedAt,
                LastRunEndedAt: lastRun?.EndedAt,
                ScheduleEnabled: ci.ScheduleEnabled,
                RSUEnabled: rsuStatus.Enabled,
                RSURunning: rsuStatus.Running,
                RSUOutOfSync: rsuStatus.OutOfSync,
                RSULastRunAt: rsuStatus.LastRunAt?.toISOString(),
                RSULastRunResult: rsuStatus.LastRunResult,
            };
        } catch (e) {
            LogError(`IntegrationGetStatus error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    @Query(() => SyncHistoryOutput)
    async IntegrationGetSyncHistory(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("limit", { defaultValue: 20 }) limit: number,
        @Ctx() ctx: AppContext
    ): Promise<SyncHistoryOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            const result = await rv.RunView<SyncRunSummaryOutput>({
                EntityName: 'MJ: Company Integration Runs',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                OrderBy: 'StartedAt DESC',
                MaxRows: limit,
                ResultType: 'simple',
                Fields: ['ID', 'Status', 'StartedAt', 'EndedAt', 'TotalRecords', 'RunByUserID']
            }, user);

            if (!result.Success) return { Success: false, Message: result.ErrorMessage || 'Query failed' };
            return {
                Success: true,
                Message: `${result.Results.length} runs`,
                Runs: result.Results
            };
        } catch (e) {
            LogError(`IntegrationGetSyncHistory error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── STRUCTURED RUN ARTIFACTS (durable, growing JSONL streams) ────────

    /**
     * Lists integration runs (sync, connector-creation, RSU, discovery, …) from the
     * durable progress-artifact store, newest-first. Use this to render run history
     * with live status for a multi-tenant control surface. Optionally scope to a
     * single connector and/or run kind, or to only in-flight runs.
     */
    @Query(() => IntegrationListRunsOutput)
    async IntegrationListRuns(
        @Ctx() ctx: AppContext,
        @Arg("companyIntegrationID", { nullable: true }) companyIntegrationID?: string,
        @Arg("runKind", { nullable: true }) runKind?: string,
        @Arg("inFlightOnly", { nullable: true }) inFlightOnly?: boolean,
        @Arg("limit", { defaultValue: 50 }) limit?: number,
    ): Promise<IntegrationListRunsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);

            // When a specific connector is requested, authorize it up front so an
            // unauthorized caller gets a clear denial rather than an empty list.
            const authCache = new Map<string, boolean>();
            if (companyIntegrationID) {
                const authorized = await this.userCanReadCompanyIntegration(companyIntegrationID, user, authCache);
                if (!authorized) {
                    return { Success: false, Message: this.notAuthorizedForCompanyIntegrationMessage(companyIntegrationID) };
                }
            }

            const reader = new IntegrationProgressReader();
            const snaps = await reader.ListRuns({
                companyIntegrationID,
                runKind: runKind as IntegrationRunKind | undefined,
                inFlightOnly: inFlightOnly ?? false,
            }, limit ?? 50);

            // Filter to only the runs the caller is authorized to read. When
            // scoped to a single (already-authorized) connector this is a no-op;
            // for the cross-connector listing it prevents one tenant from seeing
            // another tenant's runs.
            const authorizedSnaps = await this.filterAuthorizedRuns(snaps, user, authCache);
            return { Success: true, Message: `${authorizedSnaps.length} run(s)`, Runs: authorizedSnaps.map(s => this.toRunSummaryArtifact(s)) };
        } catch (e) {
            LogError(`IntegrationListRuns error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /** Returns only the run snapshots the caller is authorized to read. */
    private async filterAuthorizedRuns(
        snaps: IntegrationRunSnapshot[],
        user: UserInfo,
        authCache: Map<string, boolean>
    ): Promise<IntegrationRunSnapshot[]> {
        const authorized: IntegrationRunSnapshot[] = [];
        for (const snap of snaps) {
            if (await this.userCanReadRunArtifact(snap, user, authCache)) {
                authorized.push(snap);
            }
        }
        return authorized;
    }

    /**
     * Returns the summary of a single run (manifest + terminal result + latest counts).
     * Pair with IntegrationTailRunEvents to read the full event stream.
     */
    @Query(() => IntegrationRunDetailOutput)
    async IntegrationGetRun(
        @Arg("runID") runID: string,
        @Ctx() ctx: AppContext,
    ): Promise<IntegrationRunDetailOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const reader = new IntegrationProgressReader();
            const snap = await reader.GetRun(runID);
            if (!snap) return { Success: false, Message: `Run '${runID}' not found` };

            const authorized = await this.userCanReadRunArtifact(snap, user, new Map<string, boolean>());
            if (!authorized) {
                const ciID = snap.manifest.companyIntegrationID;
                return {
                    Success: false,
                    Message: ciID
                        ? this.notAuthorizedForCompanyIntegrationMessage(ciID)
                        : `Not authorized to access run '${runID}'`,
                };
            }

            return {
                Success: true,
                Message: 'OK',
                Run: this.toRunSummaryArtifact(snap),
                Errors: snap.result?.errors?.map(er => er.stage ? `[${er.stage}] ${er.message}` : er.message),
            };
        } catch (e) {
            LogError(`IntegrationGetRun error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    /**
     * Tails a run's structured event stream from a given sequence number. The stream
     * grows over the life of the run, so a client polls with the last LatestSeq it
     * saw to fetch only the new events. IsInFlight=false signals the run is terminal
     * and polling can stop.
     */
    @Query(() => IntegrationRunEventsOutput)
    async IntegrationTailRunEvents(
        @Arg("runID") runID: string,
        @Ctx() ctx: AppContext,
        @Arg("sinceSeq", { defaultValue: 0 }) sinceSeq?: number,
    ): Promise<IntegrationRunEventsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const reader = new IntegrationProgressReader();
            const snap = await reader.GetRun(runID);
            if (!snap) return { Success: false, Message: `Run '${runID}' not found`, LatestSeq: sinceSeq ?? 0, IsInFlight: false };

            const authorized = await this.userCanReadRunArtifact(snap, user, new Map<string, boolean>());
            if (!authorized) {
                const ciID = snap.manifest.companyIntegrationID;
                return {
                    Success: false,
                    Message: ciID
                        ? this.notAuthorizedForCompanyIntegrationMessage(ciID)
                        : `Not authorized to access run '${runID}'`,
                    LatestSeq: sinceSeq ?? 0,
                    IsInFlight: false,
                };
            }

            const events = await reader.Tail(runID, sinceSeq ?? 0);
            const latestSeq = events.length > 0 ? events[events.length - 1].seq : (sinceSeq ?? 0);
            return {
                Success: true,
                Message: `${events.length} event(s)`,
                Events: events.map(ev => ({
                    Ts: ev.ts,
                    Seq: ev.seq,
                    EventType: ev.eventType,
                    Level: ev.level,
                    Stage: ev.stage,
                    Message: ev.message,
                    Counts: this.toCountsOutput(ev.counts),
                    DataJSON: ev.data ? JSON.stringify(ev.data) : undefined,
                    ResumableStateJSON: ev.resumableState ? JSON.stringify(ev.resumableState) : undefined,
                })),
                LatestSeq: latestSeq,
                IsInFlight: snap.isInFlight,
            };
        } catch (e) {
            LogError(`IntegrationTailRunEvents error: ${e}`);
            return { Success: false, Message: this.formatError(e), LatestSeq: sinceSeq ?? 0, IsInFlight: false };
        }
    }

    /** Maps a reader snapshot to the GraphQL summary shape. */
    private toRunSummaryArtifact(s: IntegrationRunSnapshot): IntegrationRunSummaryArtifactOutput {
        return {
            RunID: s.manifest.runID,
            RunKind: s.manifest.runKind,
            IntegrationID: s.manifest.integrationID,
            CompanyIntegrationID: s.manifest.companyIntegrationID,
            ObjectName: s.manifest.objectName,
            TriggerType: s.manifest.triggerType,
            StartedAt: s.manifest.startedAt,
            IsInFlight: s.isInFlight,
            EventCount: s.eventCount,
            Success: s.result?.success,
            ExitReason: s.result?.exitReason,
            CompletedAt: s.result?.completedAt,
            DurationMs: s.result?.durationMs,
            LatestEventType: s.latestEvent?.eventType,
            LatestMessage: s.latestEvent?.message,
            Counts: this.toCountsOutput(s.counts),
            WarningCount: s.warningCount,
            Warnings: s.warnings?.map(w => `[${w.code}] ${w.stage}: ${w.message}`),
        };
    }

    /** Maps the reader's lowercase counts shape to the PascalCase GraphQL output. */
    private toCountsOutput(c?: { processed?: number; succeeded?: number; failed?: number; skipped?: number; totalKnown?: number }): IntegrationRunCountsOutput | undefined {
        if (!c) return undefined;
        return {
            Processed: c.processed,
            Succeeded: c.succeeded,
            Failed: c.failed,
            Skipped: c.skipped,
            TotalKnown: c.totalKnown,
        };
    }

    // ── CONNECTOR CAPABILITIES ──────────────────────────────────────────

    /**
     * Returns the CRUD capability flags for the connector bound to a CompanyIntegration.
     * Use this to determine which operations (Create/Update/Delete/Search) are supported
     * before attempting point-action calls.
     */
    @Query(() => ConnectorCapabilitiesOutput)
    async IntegrationGetConnectorCapabilities(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Ctx() ctx: AppContext
    ): Promise<ConnectorCapabilitiesOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true }) as unknown as IMetadataProvider;
            const { connector } = await this.resolveConnector(companyIntegrationID, user, provider);

            return {
                Success: true,
                Message: 'OK',
                SupportsGet: connector.SupportsGet,
                SupportsCreate: connector.SupportsCreate,
                SupportsUpdate: connector.SupportsUpdate,
                SupportsDelete: connector.SupportsDelete,
                SupportsSearch: connector.SupportsSearch,
            };
        } catch (e) {
            LogError(`IntegrationGetConnectorCapabilities error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── APPLY ALL BATCH ─────────────────────────────────────────────────

    /**
     * Batch "Apply All" for multiple connectors in a single RSU pipeline run.
     * For each connector: introspect → build schema → collect RSU input.
     * Then run ONE pipeline batch for all connectors.
     * Post-pipeline: create entity/field maps and start sync for each success.
     */
    @Mutation(() => ApplyAllBatchOutput)
    async IntegrationApplyAllBatch(
        @Arg("input") input: ApplyAllBatchInput,
        @Arg("platform", { defaultValue: "sqlserver" }) platform: string,
        @Arg("skipGitCommit", { defaultValue: false }) skipGitCommit: boolean,
        @Arg("skipRestart", { defaultValue: false }) skipRestart: boolean,
        @Ctx() ctx: AppContext
    ): Promise<ApplyAllBatchOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const provider = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const validatedPlatform = this.validatePlatform(platform);

            // Bust RunView caches for integration metadata BEFORE Config(true).
            // mj sync push writes records via stored procedures which do NOT fire
            // BaseEntity change events, so the RunView cache is never auto-invalidated.
            // Explicitly clearing these entries ensures Config(true) re-queries the DB.
            await LocalCacheManager.Instance.InvalidateEntityCaches('MJ: Integration Objects');
            await LocalCacheManager.Instance.InvalidateEntityCaches('MJ: Integration Object Fields');

            // Force-refresh integration metadata cache so IntrospectSchema
            // picks up any IntegrationObject/Field changes made via mj sync push
            await IntegrationEngine.Instance.Config(true, user);

            // Phase 1: Build schema for each connector in parallel
            const buildResults = await Promise.allSettled(
                input.Connectors.map(async (connInput) => {
                    const { connector, companyIntegration } = await this.resolveConnector(connInput.CompanyIntegrationID, user, provider);
                    const schemaName = this.deriveSchemaName(companyIntegration.Integration);
                    console.log(
                        `[IntegrationApplyAllBatch] connector=${companyIntegration.Integration} ` +
                        `received ${connInput.SourceObjects.length} selections: ` +
                        connInput.SourceObjects.map(so =>
                            `{id=${so.SourceObjectID ?? '∅'}, name=${so.SourceObjectName ?? '∅'}}`
                        ).slice(0, 30).join(', ') +
                        (connInput.SourceObjects.length > 30 ? `, ... (+${connInput.SourceObjects.length - 30} more)` : '')
                    );

                    // Branch: Salesforce's full-catalog picker sends SourceObjectName
                    // for freshly-discovered objects and uses the filtered describe
                    // path to avoid a ~70s global describe on every apply. Other
                    // connectors (HubSpot, YourMembership, etc.) retain the legacy
                    // ID-only flow that describes and persists the entire schema.
                    const useFilteredFlow = this.shouldUseFilteredIntrospection(connector, connInput.SourceObjects);

                    let sourceSchema: SourceSchemaInfo;
                    let resolvedNames: string[];
                    const fieldsByName = new Map<string, string[] | null | undefined>();

                    if (useFilteredFlow) {
                        // Salesforce path — describe only selected objects, persist only those
                        const selectionPlan = await this.resolveSelectionPlan(connInput.SourceObjects, user);
                        const selectionNames = selectionPlan.map(p => p.Name);
                        if (selectionNames.length === 0) {
                            throw new Error('No source objects selected — every SourceObject must have either SourceObjectID or SourceObjectName set');
                        }

                        sourceSchema = await (connector.IntrospectSchema.bind(connector) as
                            (ci: unknown, u: unknown, opts: { ObjectNames?: string[] }) => Promise<SourceSchemaInfo>)(
                                companyIntegration, user, { ObjectNames: selectionNames }
                            );

                        try {
                            const persistResult = await IntegrationSchemaSync.PersistDiscoveredSchema({
                                IntegrationID: companyIntegration.IntegrationID,
                                SourceSchema: sourceSchema,
                                ContextUser: user,
                            });
                            console.log(
                                `[IntegrationApplyAllBatch] Persisted describe for ${companyIntegration.Integration} (${selectionNames.length} selected): ` +
                                `${persistResult.ObjectsCreated} new, ${persistResult.FieldsCreated} new fields, ` +
                                `${persistResult.ObjectsUpdated} updated, ${persistResult.FieldsUpdated} updated fields`
                            );
                        } catch (persistErr) {
                            LogError(`IntegrationApplyAllBatch: PersistDiscoveredSchema failed for ${companyIntegration.Integration}: ${persistErr}`);
                        }

                        resolvedNames = this.normalizeNamesAgainstSchema(selectionNames, sourceSchema);
                        for (const p of selectionPlan) {
                            fieldsByName.set(p.Name.toLowerCase(), p.Fields);
                        }
                    } else {
                        // Legacy path (HubSpot, YourMembership, Sage Intacct, etc.).
                        //
                        // Phase 0 v5.39.x change: the `MJCompanyIntegrationEntityServer.Save()`
                        // hook already ran the full discovery + persist pipeline when
                        // the wizard's Finish flipped `IsActive false→true`.  The IO/IOF
                        // rows in `IntegrationEngineBase`'s cache are already fresh.
                        // Calling `connector.IntrospectSchema()` again here just to feed
                        // `SchemaBuilder` doubles the vendor-API roundtrip — on HubSpot
                        // (130 objects, 60+ DiscoverFields probes) that's an extra ~100s
                        // wasted per Apply.  Reconstruct `SourceSchemaInfo` from the
                        // persisted rows instead.
                        //
                        // Persist is also skipped here — the Save hook already did it.
                        sourceSchema = this.buildSourceSchemaFromPersistedRows(companyIntegration.IntegrationID);
                        if (sourceSchema.Objects.length === 0) {
                            // Defensive fallback: if the engine cache is empty (hook
                            // didn't run, or this is a direct-API caller that bypasses
                            // the wizard), do a one-time live introspect + persist so
                            // the apply still proceeds.  Rare.
                            LogError(`[IntegrationApplyAllBatch] Persisted IO cache empty for ${companyIntegration.Integration}; falling back to live introspect.`);
                            sourceSchema = await (connector.IntrospectSchema.bind(connector) as
                                (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>)(companyIntegration, user);
                            try {
                                await IntegrationSchemaSync.PersistDiscoveredSchema({
                                    IntegrationID: companyIntegration.IntegrationID,
                                    SourceSchema: sourceSchema,
                                    ContextUser: user,
                                });
                            } catch (persistErr) {
                                LogError(`IntegrationApplyAllBatch: PersistDiscoveredSchema fallback failed for ${companyIntegration.Integration}: ${persistErr}`);
                            }
                        } else {
                            console.log(
                                `[IntegrationApplyAllBatch] Reusing ${sourceSchema.Objects.length} persisted IOs for ${companyIntegration.Integration} ` +
                                `— skipped duplicate IntrospectSchema (Save-hook already discovered).`
                            );
                        }

                        // Resolve names from BOTH ID lookups and direct names.
                        // Direct names skip the IntegrationObject DB roundtrip
                        // since the selection plan already has the API code.
                        const idsOnly = connInput.SourceObjects.map(so => so.SourceObjectID).filter((x): x is string => !!x);
                        const directNames = connInput.SourceObjects.map(so => so.SourceObjectName).filter((x): x is string => !!x);
                        const namesFromIds = idsOnly.length > 0
                            ? await this.resolveSourceObjectNames(idsOnly, undefined, sourceSchema, companyIntegration.IntegrationID, user)
                            : [];
                        const normalizedDirect = this.normalizeNamesAgainstSchema(directNames, sourceSchema);

                        // Preserve original picker order while deduping
                        const seen = new Set<string>();
                        resolvedNames = [];
                        const orderedSources: SourceObjectInput[] = [];
                        let idCursor = 0;
                        let nameCursor = 0;
                        for (const so of connInput.SourceObjects) {
                            const resolved = so.SourceObjectName
                                ? normalizedDirect[nameCursor++]
                                : (so.SourceObjectID ? namesFromIds[idCursor++] : undefined);
                            if (!resolved) continue;
                            const key = resolved.toLowerCase();
                            if (seen.has(key)) continue;
                            seen.add(key);
                            resolvedNames.push(resolved);
                            orderedSources.push(so);
                        }
                        for (let i = 0; i < resolvedNames.length; i++) {
                            fieldsByName.set(resolvedNames[i].toLowerCase(), orderedSources[i].Fields);
                        }
                    }

                    const objects = resolvedNames.map(name => {
                        const obj = new SchemaPreviewObjectInput();
                        obj.SourceObjectName = name;
                        obj.SchemaName = schemaName;
                        obj.TableName = name.replace(/[^A-Za-z0-9_]/g, '_');
                        obj.EntityName = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
                        obj.Fields = fieldsByName.get(name.toLowerCase()) ?? undefined;
                        return obj;
                    });

                    const { schemaOutput, rsuInput } = await this.buildSchemaForConnector(
                        connInput.CompanyIntegrationID, objects, validatedPlatform, user, skipGitCommit, skipRestart, provider, sourceSchema
                    );

                    // Build per-object field map for pending file
                    const sourceObjectFields: Record<string, string[] | null> = {};
                    for (const name of resolvedNames) {
                        sourceObjectFields[name] = fieldsByName.get(name.toLowerCase()) ?? null;
                    }

                    // Inject post-restart pending work payload
                    const { join } = await import('node:path');
                    const rsuWorkDir = process.env.RSU_WORK_DIR || process.cwd();
                    const pendingWorkDir = join(rsuWorkDir, '.rsu_pending');
                    const pendingFilePath = join(pendingWorkDir, `${Date.now()}_${connInput.CompanyIntegrationID}.json`);
                    const pendingPayload = {
                        CompanyIntegrationID: connInput.CompanyIntegrationID,
                        SourceObjectNames: resolvedNames,
                        SourceObjectFields: sourceObjectFields,
                        SchemaName: schemaName,
                        CronExpression: connInput.CronExpression,
                        ScheduleTimezone: connInput.ScheduleTimezone,
                        StartSync: input.StartSync,
                        FullSync: input.FullSync ?? false,
                        SyncScope: input.SyncScope ?? 'created',
                        SyncDirection: input.SyncDirection,
                        ScheduleSyncDirection: input.ScheduleSyncDirection,
                        CreatedAt: new Date().toISOString(),
                    };
                    rsuInput.PostRestartFiles = [
                        { Path: pendingFilePath, Content: JSON.stringify(pendingPayload, null, 2) }
                    ];

                    return {
                        connInput,
                        connector,
                        companyIntegration,
                        schemaName,
                        objects,
                        schemaOutput,
                        rsuInput,
                        pendingFilePath,
                    };
                })
            );

            // Separate successes and failures
            const successfulBuilds: Array<{
                connInput: ApplyAllBatchConnectorInput;
                connector: BaseIntegrationConnector;
                companyIntegration: MJCompanyIntegrationEntity;
                schemaName: string;
                objects: SchemaPreviewObjectInput[];
                schemaOutput: SchemaBuilderOutput;
                rsuInput: RSUPipelineInput;
                pendingFilePath: string;
            }> = [];
            const connectorResults: ApplyAllBatchConnectorResult[] = [];

            for (let i = 0; i < buildResults.length; i++) {
                const result = buildResults[i];
                const connInput = input.Connectors[i];
                if (result.status === 'fulfilled') {
                    successfulBuilds.push(result.value);
                } else {
                    LogError(`IntegrationApplyAllBatch: build failed for ${connInput.CompanyIntegrationID}: ${result.reason}`);
                    connectorResults.push({
                        CompanyIntegrationID: connInput.CompanyIntegrationID,
                        IntegrationName: 'Unknown',
                        Success: false,
                        Message: result.reason instanceof Error ? result.reason.message : String(result.reason),
                    });
                }
            }

            if (successfulBuilds.length === 0) {
                return {
                    Success: false,
                    Message: 'All connectors failed during schema build phase',
                    ConnectorResults: connectorResults,
                    SuccessCount: 0,
                    FailureCount: connectorResults.length,
                };
            }

            // Phase 2: Run all successful RSU inputs through one pipeline batch
            const pipelineInputs = successfulBuilds.map(b => b.rsuInput);
            const rsm = RuntimeSchemaManager.Instance;
            const batchResult = await rsm.RunPipelineBatch(pipelineInputs);

            // Phase 3: Post-pipeline — create entity maps, field maps, schedules for each success
            for (let i = 0; i < successfulBuilds.length; i++) {
                const build = successfulBuilds[i];
                const pipelineResult = batchResult.Results[i];
                const integrationName = build.companyIntegration.Integration;

                if (!pipelineResult || !pipelineResult.Success) {
                    connectorResults.push({
                        CompanyIntegrationID: build.connInput.CompanyIntegrationID,
                        IntegrationName: integrationName,
                        Success: false,
                        Message: pipelineResult?.ErrorMessage ?? 'Pipeline failed',
                        Warnings: build.schemaOutput.Warnings.length > 0 ? build.schemaOutput.Warnings : undefined,
                    });
                    // Clean up pending file on failure
                    try { (await import('node:fs')).unlinkSync(build.pendingFilePath); } catch { /* may not exist */ }
                    continue;
                }

                const connResult: ApplyAllBatchConnectorResult = {
                    CompanyIntegrationID: build.connInput.CompanyIntegrationID,
                    IntegrationName: integrationName,
                    Success: true,
                    Message: `Applied ${build.objects.length} object(s)`,
                    Warnings: build.schemaOutput.Warnings.length > 0 ? build.schemaOutput.Warnings : undefined,
                };

                if (skipRestart) {
                    // Entity maps, field maps, sync
                    await provider.Refresh();
                    const entityMapsCreated = await this.createEntityAndFieldMaps(
                        build.connInput.CompanyIntegrationID, build.objects, build.connector,
                        build.companyIntegration, build.schemaName, user, provider,
                        build.connInput.DefaultSyncDirection ?? 'Pull'
                    );
                    connResult.EntityMapsCreated = entityMapsCreated;

                    const createdMapIDs = entityMapsCreated.map(em => em.EntityMapID).filter(Boolean);
                    const scopedMapIDs = input.SyncScope === 'all' ? undefined : createdMapIDs;

                    // Skip sync entirely when SyncScope='created' (default) but
                    // no new maps were created. Otherwise the engine sees an
                    // empty EntityMapIDs array, falls through its `length > 0`
                    // gate, and runs a FULL integration sync — silently re-
                    // pulling every existing map. That's why a 0-new-map apply
                    // could trigger a 459-record sync against the 71 existing.
                    const shouldStartSync = input.StartSync !== false &&
                        (input.SyncScope === 'all' || createdMapIDs.length > 0);
                    const syncRunID = shouldStartSync
                        ? await this.startSyncAfterApply(build.connInput.CompanyIntegrationID, user, scopedMapIDs, input.FullSync)
                        : null;
                    if (syncRunID) connResult.SyncRunID = syncRunID;

                    // Create schedule if CronExpression provided
                    if (build.connInput.CronExpression) {
                        const scheduleResult = await this.createScheduleForConnector(
                            build.connInput.CompanyIntegrationID, integrationName,
                            build.connInput.CronExpression, build.connInput.ScheduleTimezone, user, provider
                        );
                        if (scheduleResult) connResult.ScheduledJobID = scheduleResult;
                    }

                    // Clean up pending file
                    try { (await import('node:fs')).unlinkSync(build.pendingFilePath); } catch { /* already consumed */ }

                    connResult.Message = `Applied ${build.objects.length} object(s) — ${entityMapsCreated.length} entity maps created${syncRunID ? ', sync started' : ''}`;
                }

                connectorResults.push(connResult);
            }

            const pipelineSteps = batchResult.Results[0]?.Steps.map((s: RSUPipelineStep) => ({
                Name: s.Name, Status: s.Status, DurationMs: s.DurationMs, Message: s.Message,
            }));

            const successCount = connectorResults.filter(r => r.Success).length;
            const failureCount = connectorResults.filter(r => !r.Success).length;

            return {
                Success: successCount > 0,
                Message: `Batch complete: ${successCount} succeeded, ${failureCount} failed`,
                ConnectorResults: connectorResults,
                PipelineSteps: pipelineSteps,
                GitCommitSuccess: batchResult.Results[0]?.GitCommitSuccess,
                APIRestarted: batchResult.Results[0]?.APIRestarted,
                SuccessCount: successCount,
                FailureCount: failureCount,
            };
        } catch (e) {
            LogError(`IntegrationApplyAllBatch error: ${e}`);
            return {
                Success: false, Message: this.formatError(e),
                ConnectorResults: [], SuccessCount: 0, FailureCount: 0,
            };
        }
    }

    /** Helper: creates a schedule for a connector, returns ScheduledJobID or null. */
    private async createScheduleForConnector(
        companyIntegrationID: string,
        integrationName: string,
        cronExpression: string,
        timezone: string | undefined,
        user: UserInfo,
        provider: IMetadataProvider
    ): Promise<string | null> {
        try {
            const md = provider;
            const rv = new RunView();

            // Find IntegrationSync job type
            const jobTypeResult = await rv.RunView<MJScheduledJobTypeEntity>({
                EntityName: 'MJ: Scheduled Job Types',
                ExtraFilter: `DriverClass='IntegrationSyncScheduledJobDriver'`,
                MaxRows: 1,
                ResultType: 'simple',
                Fields: ['ID']
            }, user);
            if (!jobTypeResult.Success || jobTypeResult.Results.length === 0) {
                LogError('IntegrationApplyAllBatch: IntegrationSync scheduled job type not found');
                return null;
            }
            const jobTypeID = jobTypeResult.Results[0].ID;

            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
            job.NewRecord();
            job.JobTypeID = jobTypeID;
            job.Name = `${integrationName} Sync`;
            job.CronExpression = cronExpression;
            job.Timezone = timezone || 'UTC';
            job.Status = 'Active';
            job.OwnerUserID = user.ID;
            job.Configuration = JSON.stringify({ CompanyIntegrationID: companyIntegrationID });

            if (!await job.Save()) return null;

            // Link to CompanyIntegration
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const ciLoaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (ciLoaded) {
                ci.ScheduleEnabled = true;
                ci.ScheduleType = 'Cron';
                ci.CronExpression = cronExpression;
                await ci.Save();
            }

            return job.ID;
        } catch (e) {
            LogError(`IntegrationApplyAllBatch: schedule creation failed: ${this.formatError(e)}`);
            return null;
        }
    }

    // ── DELETE CONNECTION ────────────────────────────────────────────────

    /**
     * Hard-deletes a CompanyIntegration and all associated entity maps, field maps,
     * and scheduled jobs. Does NOT drop database tables (flagged for future).
     */
    @Mutation(() => DeleteConnectionOutput)
    async IntegrationDeleteConnection(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("deleteData", { defaultValue: false }) deleteData: boolean,
        @Ctx() ctx: AppContext
    ): Promise<DeleteConnectionOutput> {
        try {
            this.getAuthenticatedUser(ctx); // verify caller is authenticated
            const sysUser = this.getSystemUser(); // use system user for cascade delete
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const rv = new RunView();

            // Step 1: Load CompanyIntegration
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', sysUser);
            const ciLoaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!ciLoaded) return { Success: false, Message: 'CompanyIntegration not found' };

            // Cascade delete in FK-safe order using TransactionGroup
            const tg = await md.CreateTransactionGroup();
            let fieldMapsDeleted = 0;
            let entityMapsDeleted = 0;
            let schedulesDeleted = 0;

            // Step 2: Null out ScheduledJobRunID on CompanyIntegrationRuns (break FK before deleting job runs)
            const ciRunsResult = await rv.RunView<MJCompanyIntegrationRunEntity>({
                EntityName: 'MJ: Company Integration Runs',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                ResultType: 'entity_object'
            }, sysUser);
            if (ciRunsResult.Success) {
                for (const ciRun of ciRunsResult.Results) {
                    if (ciRun.ScheduledJobRunID) {
                        ciRun.ScheduledJobRunID = null;
                        await ciRun.Save();
                    }
                }
            }

            // Step 3: Delete scheduled job runs + jobs (reference CI via Configuration JSON)
            const jobsResult = await rv.RunView<MJScheduledJobEntity>({
                EntityName: 'MJ: Scheduled Jobs',
                ExtraFilter: `Configuration LIKE '%${companyIntegrationID}%'`,
                ResultType: 'entity_object'
            }, sysUser);
            if (jobsResult.Success) {
                for (const job of jobsResult.Results) {
                    try {
                        const config = JSON.parse(job.Configuration || '{}') as Record<string, unknown>;
                        if (config.CompanyIntegrationID === companyIntegrationID) {
                            const jobRunsResult = await rv.RunView<MJScheduledJobRunEntity>({
                                EntityName: 'MJ: Scheduled Job Runs',
                                ExtraFilter: `ScheduledJobID='${job.ID}'`,
                                ResultType: 'entity_object'
                            }, sysUser);
                            if (jobRunsResult.Success) {
                                for (const jr of jobRunsResult.Results) {
                                    jr.TransactionGroup = tg;
                                    await jr.Delete();
                                }
                            }
                            job.TransactionGroup = tg;
                            await job.Delete();
                            schedulesDeleted++;
                        }
                    } catch { /* skip invalid config */ }
                }
            }

            // Step 4: Delete run details then runs (reuse ciRunsResult from Step 2)
            if (ciRunsResult.Success) {
                for (const run of ciRunsResult.Results) {
                    // Delete run details first
                    const detailsResult = await rv.RunView<MJCompanyIntegrationRunDetailEntity>({
                        EntityName: 'MJ: Company Integration Run Details',
                        ExtraFilter: `CompanyIntegrationRunID='${run.ID}'`,
                        ResultType: 'entity_object'
                    }, sysUser);
                    if (detailsResult.Success) {
                        for (const detail of detailsResult.Results) {
                            detail.TransactionGroup = tg;
                            await detail.Delete();
                        }
                    }
                    run.TransactionGroup = tg;
                    await run.Delete();
                }
            }

            // Step 4: Delete entity map children (field maps, watermarks, record maps)
            const entityMapsResult = await rv.RunView<MJCompanyIntegrationEntityMapEntity>({
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                ResultType: 'entity_object'
            }, sysUser);
            const entityMaps = entityMapsResult.Success ? entityMapsResult.Results : [];

            for (const em of entityMaps) {
                const fmResult = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
                    EntityName: 'MJ: Company Integration Field Maps',
                    ExtraFilter: `EntityMapID='${em.ID}'`,
                    ResultType: 'entity_object'
                }, sysUser);
                if (fmResult.Success) {
                    for (const fm of fmResult.Results) {
                        fm.TransactionGroup = tg;
                        if (await fm.Delete()) fieldMapsDeleted++;
                    }
                }

                const wmResult = await rv.RunView<MJCompanyIntegrationSyncWatermarkEntity>({
                    EntityName: 'MJ: Company Integration Sync Watermarks',
                    ExtraFilter: `EntityMapID='${em.ID}'`,
                    ResultType: 'entity_object'
                }, sysUser);
                if (wmResult.Success) {
                    for (const wm of wmResult.Results) {
                        wm.TransactionGroup = tg;
                        await wm.Delete();
                    }
                }

                const rmResult = await rv.RunView<MJCompanyIntegrationRecordMapEntity>({
                    EntityName: 'MJ: Company Integration Record Maps',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                    ResultType: 'entity_object'
                }, sysUser);
                if (rmResult.Success) {
                    for (const rm of rmResult.Results) {
                        rm.TransactionGroup = tg;
                        await rm.Delete();
                    }
                }
            }

            // Step 5: Delete entity maps
            for (const em of entityMaps) {
                em.TransactionGroup = tg;
                if (await em.Delete()) entityMapsDeleted++;
            }

            // Step 6: Delete employee-company integration links
            const empResult = await rv.RunView<MJEmployeeCompanyIntegrationEntity>({
                EntityName: 'MJ: Employee Company Integrations',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                ResultType: 'entity_object'
            }, sysUser);
            if (empResult.Success) {
                for (const emp of empResult.Results) {
                    emp.TransactionGroup = tg;
                    await emp.Delete();
                }
            }

            // Step 7: Delete the CompanyIntegration itself FIRST, so its CredentialID FK reference
            // is gone before we delete the Credential. (Deleting the Credential first violates the
            // CompanyIntegration.CredentialID foreign key — the constraint is checked per-statement
            // inside the transaction — and rolls back the entire cascade.) Capture CredentialID
            // before Delete() since we still need it for Step 8.
            const linkedCredentialID = ci.CredentialID;
            ci.TransactionGroup = tg;
            await ci.Delete();

            // Step 8: Delete the linked Credential (encrypted-credential row) in the SAME
            // transaction group so it commits/rolls back atomically with the cascade — now safe
            // because the referencing CompanyIntegration delete is queued ahead of it. Skips
            // silently when there is no CredentialID, and refuses to delete a credential still
            // referenced by ANOTHER CompanyIntegration (shared credential).
            const credentialDeleted = await this.cascadeDeleteCredential(
                linkedCredentialID, companyIntegrationID, tg, rv, md, sysUser
            );

            // Submit the transaction
            const submitted = await tg.Submit();
            if (!submitted) {
                return { Success: false, Message: 'Transaction failed — all deletes rolled back' };
            }

            // deleteData=true asks us to also DROP the physical mirror tables. We deliberately do NOT:
            // RuntimeSchemaManager rejects DROP TABLE on the __mj schema by design (a destructive-op
            // safety guard), and there is no DROP generator. Dropping integration tables is real data
            // loss and must be an explicit, separately-designed operation — not a silent side effect of
            // removing a connection. So we delete the connection + all METADATA (maps/fields/schedules/
            // credential) and RETAIN the data tables, and we say so honestly rather than claim otherwise.
            const dataNote = deleteData
                ? ' The physical data tables were RETAINED (dropping integration tables is not performed automatically — it is a separate, explicit operation).'
                : '';

            return {
                Success: true,
                Message: `Deleted connection and all associated metadata records.${dataNote}`,
                EntityMapsDeleted: entityMapsDeleted,
                FieldMapsDeleted: fieldMapsDeleted,
                SchedulesDeleted: schedulesDeleted,
                CredentialDeleted: credentialDeleted,
            };
        } catch (e) {
            LogError(`IntegrationDeleteConnection error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
        }
    }

    // ── SCHEMA EVOLUTION ────────────────────────────────────────────────

    /**
     * Detects schema changes (new/modified columns) in the external system and
     * applies ALTER TABLE migrations via the RSU pipeline.
     * Compares the current connector introspection against existing MJ entities.
     */
    @Mutation(() => SchemaEvolutionOutput)
    async IntegrationSchemaEvolution(
        @Arg("companyIntegrationID") companyIntegrationID: string,
        @Arg("platform", { defaultValue: "sqlserver" }) platform: string,
        @Arg("skipGitCommit", { defaultValue: false }) skipGitCommit: boolean,
        @Arg("skipRestart", { defaultValue: false }) skipRestart: boolean,
        @Ctx() ctx: AppContext
    ): Promise<SchemaEvolutionOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const validatedPlatform = this.validatePlatform(platform);
            const md = GetReadWriteProvider(ctx.providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user, md);
            const schemaName = this.deriveSchemaName(companyIntegration.Integration);
            const rv = new RunView();

            // Step 1: Get existing entity maps for this CompanyIntegration
            const entityMapsResult = await rv.RunView<MJCompanyIntegrationEntityMapEntity>({
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                ResultType: 'simple',
                Fields: ['ID', 'ExternalObjectName', 'EntityID']
            }, user);

            if (!entityMapsResult.Success || entityMapsResult.Results.length === 0) {
                return {
                    Success: false, Message: 'No entity maps found — nothing to evolve',
                    HasChanges: false,
                };
            }

            const sourceObjectNames = entityMapsResult.Results.map(em => em.ExternalObjectName);
            const objects = this.buildObjectInputsFromNames(sourceObjectNames, schemaName);

            // Step 2: Build ExistingTables from Metadata.Entities matching the schema
            const existingTables: ExistingTableInfo[] = [];
            for (const obj of objects) {
                const entityInfo = md.Entities.find(
                    e => e.SchemaName.toLowerCase() === schemaName.toLowerCase()
                      && e.BaseTable.toLowerCase() === obj.TableName.toLowerCase()
                );
                if (entityInfo) {
                    existingTables.push({
                        SchemaName: entityInfo.SchemaName,
                        TableName: entityInfo.BaseTable,
                        Columns: entityInfo.Fields.map(f => ({
                            Name: f.Name,
                            SqlType: f.SQLFullType || f.Type,
                            IsNullable: f.AllowsNull,
                            MaxLength: f.MaxLength > 0 ? f.MaxLength : null,
                            Precision: f.Precision > 0 ? f.Precision : null,
                            Scale: f.Scale > 0 ? f.Scale : null,
                        })),
                    });
                }
            }

            // Step 3: Introspect current schema from connector
            const introspect = connector.IntrospectSchema.bind(connector) as
                (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
            const sourceSchema = await introspect(companyIntegration, user);

            // Normalize names to match source schema casing
            const nameMap = new Map(sourceSchema.Objects.map(o => [o.ExternalName.toLowerCase(), o.ExternalName]));
            const normalizedNames = sourceObjectNames.map(n => nameMap.get(n.toLowerCase()) ?? n);
            // Also normalize the objects array SourceObjectName
            for (const obj of objects) {
                const exact = nameMap.get(obj.SourceObjectName.toLowerCase());
                if (exact) obj.SourceObjectName = exact;
            }

            const requestedNames = new Set(normalizedNames);
            const filteredSchema: SourceSchemaInfo = {
                Objects: sourceSchema.Objects.filter(o => requestedNames.has(o.ExternalName))
            };

            // Step 4: Build target configs and SchemaBuilder input with ExistingTables
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, validatedPlatform, connector);

            const schemaInput: SchemaBuilderInput = {
                SourceSchema: filteredSchema,
                TargetConfigs: targetConfigs,
                Platform: validatedPlatform,
                MJVersion: process.env.MJ_VERSION ?? '5.11.0',
                SourceType: companyIntegration.Integration,
                AdditionalSchemaInfoPath: process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH ?? 'additionalSchemaInfo.json',
                MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/rsu',
                MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
                ExistingTables: existingTables,
                EntitySettingsForTargets: {}
            };

            // Step 5: Build schema — SchemaBuilder handles evolution (ALTER TABLE) internally
            const builder = new SchemaBuilder();
            const schemaOutput = builder.BuildSchema(schemaInput);

            if (schemaOutput.Errors.length > 0) {
                return {
                    Success: false,
                    Message: `Schema evolution failed: ${schemaOutput.Errors.join('; ')}`,
                    HasChanges: false,
                    Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
                };
            }

            // Step 6: Check if any migration SQL was generated
            if (schemaOutput.MigrationFiles.length === 0) {
                return {
                    Success: true,
                    Message: 'No schema changes detected',
                    HasChanges: false,
                    Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
                };
            }

            // Step 7: Count added/modified columns by re-diffing
            let addedColumns = 0;
            let modifiedColumns = 0;
            const evolution = new SchemaEvolution();
            for (const existing of existingTables) {
                const config = targetConfigs.find(
                    c => c.SchemaName.toLowerCase() === existing.SchemaName.toLowerCase()
                      && c.TableName.toLowerCase() === existing.TableName.toLowerCase()
                );
                if (!config) continue;
                const sourceObj = filteredSchema.Objects.find(o => o.ExternalName.toLowerCase() === config.SourceObjectName.toLowerCase());
                if (!sourceObj) continue;
                const diff = evolution.DiffSchema(sourceObj, config, existing, validatedPlatform);
                addedColumns += diff.AddedColumns.length;
                modifiedColumns += diff.ModifiedColumns.length;
            }

            // Step 8: Run RSU pipeline
            const rsuInput = builder.BuildRSUInput(schemaOutput, schemaInput, {
                SkipGitCommit: skipGitCommit,
                SkipRestart: skipRestart,
            });

            const rsm = RuntimeSchemaManager.Instance;
            const batchResult = await rsm.RunPipelineBatch([rsuInput]);

            const pipelineResult = batchResult.Results[0];
            const pipelineSteps = pipelineResult?.Steps.map((s: RSUPipelineStep) => ({
                Name: s.Name, Status: s.Status, DurationMs: s.DurationMs, Message: s.Message,
            }));

            return {
                Success: pipelineResult?.Success ?? false,
                Message: pipelineResult?.Success
                    ? `Schema evolution applied — ${addedColumns} column(s) added, ${modifiedColumns} column(s) modified`
                    : `Pipeline failed: ${pipelineResult?.ErrorMessage ?? 'unknown error'}`,
                HasChanges: true,
                AddedColumns: addedColumns,
                ModifiedColumns: modifiedColumns,
                Steps: pipelineSteps,
                GitCommitSuccess: pipelineResult?.GitCommitSuccess,
                APIRestarted: pipelineResult?.APIRestarted,
                Warnings: schemaOutput.Warnings.length > 0 ? schemaOutput.Warnings : undefined,
            };
        } catch (e) {
            LogError(`IntegrationSchemaEvolution error: ${e}`);
            return { Success: false, Message: this.formatError(e), HasChanges: false };
        }
    }

    // ── WEBHOOK HELPER ──────────────────────────────────────────────────

    private async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                console.error(`[Integration] Webhook POST to ${url} returned ${response.status}`);
            }
        } catch (e) {
            console.error(`[Integration] Webhook POST to ${url} failed:`, e);
        }
    }
}
