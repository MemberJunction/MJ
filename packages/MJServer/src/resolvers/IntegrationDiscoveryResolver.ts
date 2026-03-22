import { Resolver, Query, Mutation, Arg, Ctx, ObjectType, Field, InputType } from "type-graphql";
import { CompositeKey, Metadata, RunView, UserInfo, LogError } from "@memberjunction/core";
import {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
    MJCredentialEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationRunEntity,
    MJScheduledJobEntity,
    MJScheduledJobTypeEntity
} from "@memberjunction/core-entities";
import {
    BaseIntegrationConnector,
    ConnectorFactory,
    ExternalObjectSchema,
    ExternalFieldSchema,
    ConnectionTestResult,
    IntegrationEngine,
    SourceSchemaInfo
} from "@memberjunction/integration-engine";
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
import { ResolverBase } from "../generic/ResolverBase.js";
import { AppContext } from "../types.js";
import { RequireSystemUser } from "../directives/RequireSystemUser.js";

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
class ApplyAllInput {
    @Field() CompanyIntegrationID: string;
    @Field(() => [String]) SourceObjectNames: string[];
    @Field({ nullable: true }) CronExpression?: string;
    @Field({ nullable: true }) ScheduleTimezone?: string;
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
    @Field(() => [String]) SourceObjectNames: string[];
    /** Optional per-connector schedule. Applied on success. */
    @Field({ nullable: true }) CronExpression?: string;
    @Field({ nullable: true }) ScheduleTimezone?: string;
}

@InputType()
class ApplyAllBatchInput {
    @Field(() => [ApplyAllBatchConnectorInput]) Connectors: ApplyAllBatchConnectorInput[];
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
    @Field()
    SourceObjectName: string;

    @Field()
    SchemaName: string;

    @Field()
    TableName: string;

    @Field()
    EntityName: string;
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
class CreateConnectionOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) CompanyIntegrationID?: string;
    @Field({ nullable: true }) CredentialID?: string;
    @Field({ nullable: true }) ConnectionTestSuccess?: boolean;
    @Field({ nullable: true }) ConnectionTestMessage?: string;
}

@ObjectType()
class MutationResultOutput {
    @Field() Success: boolean;
    @Field() Message: string;
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

@InputType()
class CreateScheduleInput {
    @Field() CompanyIntegrationID: string;
    @Field() Name: string;
    @Field() CronExpression: string;
    @Field({ nullable: true }) Timezone?: string;
    @Field({ nullable: true }) Description?: string;
}

@ObjectType()
class CreateScheduleOutput {
    @Field() Success: boolean;
    @Field() Message: string;
    @Field({ nullable: true }) ScheduledJobID?: string;
}

@InputType()
class EntityMapUpdateInput {
    @Field() EntityMapID: string;
    @Field({ nullable: true }) SyncDirection?: string;
    @Field({ nullable: true }) Priority?: number;
    @Field({ nullable: true }) Status?: string;
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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

            // Cast through unknown to bridge duplicate package type declarations
            // (integration-engine resolves its own node_modules copies of core/core-entities)
            const discoverObjects = connector.DiscoverObjects.bind(connector) as
                (ci: unknown, u: unknown) => Promise<ExternalObjectSchema[]>;
            const objects = await discoverObjects(companyIntegration, user);

            return {
                Success: true,
                Message: `Discovered ${objects.length} objects`,
                Objects: objects.map(o => ({
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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

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
            const { connector } = await this.resolveConnector(companyIntegrationID, user);

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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

            // Introspect schema from the external system
            const introspect = connector.IntrospectSchema.bind(connector) as
                (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
            const sourceSchema = await introspect(companyIntegration, user);

            // Filter to only requested objects
            const requestedNames = new Set(objects.map(o => o.SourceObjectName));
            const filteredSchema: SourceSchemaInfo = {
                Objects: sourceSchema.Objects.filter(o => requestedNames.has(o.ExternalName))
            };

            // Validate platform before use
            const validatedPlatform = this.validatePlatform(platform);

            // Build target configs from user input + source schema
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, validatedPlatform, connector);

            // Run SchemaBuilder
            const input: SchemaBuilderInput = {
                SourceSchema: filteredSchema,
                TargetConfigs: targetConfigs,
                Platform: validatedPlatform,
                MJVersion: process.env.MJ_VERSION ?? '5.11.0',
                SourceType: companyIntegration.Integration,
                AdditionalSchemaInfoPath: process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH ?? 'additionalSchemaInfo.json',
                MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/v5',
                MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
                ExistingTables: [],
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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

            const fetchChanges = connector.FetchChanges.bind(connector) as
                (ctx: unknown) => Promise<{ Records: Array<{ ExternalID: string; ObjectType: string; Fields: Record<string, unknown> }>; HasMore: boolean }>;

            const result = await fetchChanges({
                CompanyIntegration: companyIntegration,
                ObjectName: objectName,
                WatermarkValue: null,
                BatchSize: Math.min(limit, 10),
                ContextUser: user
            });

            return {
                Success: true,
                Message: `Fetched ${result.Records.length} preview records`,
                Records: result.Records.map(r => ({
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

        return objects.map(obj => {
            const sourceObj = sourceSchema.Objects.find(o => o.ExternalName === obj.SourceObjectName);
            const objDescriptions = connectorDescriptions.get(obj.SourceObjectName);

            const columns: TargetColumnConfig[] = (sourceObj?.Fields ?? []).map(f => ({
                SourceFieldName: f.Name,
                TargetColumnName: f.Name.replace(/[^A-Za-z0-9_]/g, '_'),
                TargetSqlType: mapper.MapSourceType(f.SourceType, platform, f),
                IsNullable: !f.IsRequired,
                MaxLength: f.MaxLength,
                Precision: f.Precision,
                Scale: f.Scale,
                DefaultValue: f.DefaultValue,
                Description: f.Description ?? objDescriptions?.fields.get(f.Name),
            }));

            const primaryKeyFields = (sourceObj?.Fields ?? [])
                .filter(f => f.IsPrimaryKey)
                .map(f => f.Name.replace(/[^A-Za-z0-9_]/g, '_'));

            return {
                SourceObjectName: obj.SourceObjectName,
                SchemaName: obj.SchemaName,
                TableName: obj.TableName,
                EntityName: obj.EntityName,
                Description: sourceObj?.Description ?? objDescriptions?.objectDescription,
                Columns: columns,
                PrimaryKeyFields: primaryKeyFields.length > 0 ? primaryKeyFields : ['ID'],
                SoftForeignKeys: []
            };
        });
    }

    /** Builds a lookup of object name → { objectDescription, fields: fieldName → description } from the connector's static metadata. */
    private buildDescriptionLookup(connector?: BaseIntegrationConnector): Map<string, { objectDescription?: string; fields: Map<string, string> }> {
        const result = new Map<string, { objectDescription?: string; fields: Map<string, string> }>();
        if (!connector) return result;

        const staticObjects = connector.GetIntegrationObjects();
        for (const obj of staticObjects) {
            const fieldMap = new Map<string, string>();
            for (const f of obj.Fields) {
                if (f.Description) fieldMap.set(f.Name, f.Description);
            }
            result.set(obj.Name, { objectDescription: obj.Description, fields: fieldMap });
        }
        return result;
    }

    private getAuthenticatedUser(ctx: AppContext): UserInfo {
        const user = ctx.userPayload.userRecord;
        if (!user) {
            throw new Error("User is not authenticated");
        }
        return user;
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
        contextUser: UserInfo
    ): Promise<{ connector: BaseIntegrationConnector; companyIntegration: MJCompanyIntegrationEntity }> {
        const md = new Metadata();

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
        user: UserInfo
    ): Promise<ConnectionTestResult> {
        const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);
        const testFn = connector.TestConnection.bind(connector) as
            (ci: unknown, u: unknown) => Promise<ConnectionTestResult>;
        return testFn(companyIntegration, user);
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
     * Snapshots the current credential Values for a given credential ID so they can be restored on rollback.
     */
    private async snapshotCredentialValues(
        credentialID: string | undefined,
        user: UserInfo
    ): Promise<string | undefined> {
        if (!credentialID) return undefined;
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
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
        user: UserInfo
    ): Promise<void> {
        try {
            // Revert CI fields
            let dirty = false;
            if (oldConfiguration !== undefined) { ci.Configuration = oldConfiguration; dirty = true; }
            if (oldExternalSystemID !== undefined) { ci.ExternalSystemID = oldExternalSystemID; dirty = true; }
            if (dirty) await ci.Save();

            // Revert credential values
            if (oldCredentialValues !== undefined && ci.CredentialID) {
                const md = new Metadata();
                const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
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
            const filters: string[] = [];
            if (activeOnly) filters.push('IsActive=1');
            if (companyID) filters.push(`CompanyID='${companyID}'`);
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

            return {
                Success: true,
                Message: `${result.Results.length} connections`,
                Connections: result.Results.map(ci => ({
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
        @Ctx() ctx: AppContext
    ): Promise<CreateConnectionOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();

            // 1. Create Credential record with encrypted values
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
            credential.NewRecord();
            credential.CredentialTypeID = input.CredentialTypeID;
            credential.Name = input.CredentialName;
            credential.Values = input.CredentialValues;
            credential.IsActive = true;

            const credSaved = await credential.Save();
            if (!credSaved) {
                return { Success: false, Message: 'Failed to create Credential record' };
            }
            const credentialID = credential.ID;

            // 2. Create CompanyIntegration linked to the Credential
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            ci.NewRecord();
            ci.IntegrationID = input.IntegrationID;
            ci.CompanyID = input.CompanyID;
            ci.CredentialID = credentialID;
            ci.IsActive = true;
            if (input.ExternalSystemID) ci.ExternalSystemID = input.ExternalSystemID;
            if (input.Configuration) ci.Configuration = input.Configuration;

            const saved = await ci.Save();
            if (!saved) return { Success: false, Message: 'Failed to save CompanyIntegration' };

            // 3. Optionally test the connection; rollback on failure
            if (testConnection) {
                const testResult = await this.testConnectionForCI(ci.ID, user);
                if (!testResult.Success) {
                    await this.rollbackCreatedConnection(ci, credential);
                    return {
                        Success: false,
                        Message: `Connection test failed: ${testResult.Message}. Connection was not saved.`,
                        ConnectionTestSuccess: false,
                        ConnectionTestMessage: testResult.Message
                    };
                }
                return {
                    Success: true,
                    Message: 'Connection created and test passed',
                    CompanyIntegrationID: ci.ID,
                    CredentialID: credentialID,
                    ConnectionTestSuccess: true,
                    ConnectionTestMessage: testResult.Message
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
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'CompanyIntegration not found' };

            // Snapshot old values for rollback if testConnection is requested
            const oldCredentialValues = credentialValues ? await this.snapshotCredentialValues(ci.CredentialID, user) : undefined;
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
                const testResult = await this.testConnectionForCI(companyIntegrationID, user);
                if (!testResult.Success) {
                    await this.revertUpdateConnection(ci, oldConfiguration, oldExternalSystemID, oldCredentialValues, user);
                    return { Success: false, Message: `Connection test failed: ${testResult.Message}. Changes have been reverted.` };
                }
                return { Success: true, Message: 'Updated and connection test passed' };
            }

            return { Success: true, Message: 'Updated' };
        } catch (e) {
            LogError(`IntegrationUpdateConnection error: ${e}`);
            return { Success: false, Message: this.formatError(e) };
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
            const md = new Metadata();
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
            const md = new Metadata();

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

                const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', user);
                em.NewRecord();
                em.CompanyIntegrationID = companyIntegrationID;
                em.ExternalObjectName = mapDef.ExternalObjectName;
                em.EntityID = entityID;
                const syncDir = mapDef.SyncDirection || 'Pull';
                if (!isValidSyncDirection(syncDir)) {
                    return { Success: false, Message: `Invalid SyncDirection "${syncDir}" for "${mapDef.ExternalObjectName}". Must be one of: ${VALID_SYNC_DIRECTIONS.join(', ')}`, Created: created };
                }
                em.SyncDirection = syncDir;
                em.Priority = mapDef.Priority || 0;
                em.Status = 'Active';

                if (!await em.Save()) {
                    return { Success: false, Message: `Failed to create map for ${mapDef.ExternalObjectName}`, Created: created };
                }
                const entityMapID = em.ID;

                // Create field maps if provided
                if (mapDef.FieldMaps) {
                    for (const fmDef of mapDef.FieldMaps) {
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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

            const introspect = connector.IntrospectSchema.bind(connector) as
                (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
            const sourceSchema = await introspect(companyIntegration, user);

            const requestedNames = new Set(objects.map(o => o.SourceObjectName));
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
                MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/v5',
                MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
                ExistingTables: [],
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
            const validatedPlatform = this.validatePlatform(platform);
            const pipelineInputs: RSUPipelineInput[] = [];
            const itemResults: ApplySchemaBatchItemOutput[] = [];

            // Phase 1: Build schema artifacts for each connector's objects
            for (const item of items) {
                try {
                    const { schemaOutput, rsuInput } = await this.buildSchemaForConnector(
                        item.CompanyIntegrationID, item.Objects, validatedPlatform, user, skipGitCommit, skipRestart
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
            const validatedPlatform = this.validatePlatform(platform);

            // Step 1: Resolve connector and derive schema name
            const { connector, companyIntegration } = await this.resolveConnector(input.CompanyIntegrationID, user);
            const schemaName = this.deriveSchemaName(companyIntegration.Integration);

            // Step 2: Build SchemaPreviewObjectInput for each source object
            const objects = this.buildObjectInputsFromNames(input.SourceObjectNames, schemaName);

            // Step 3: Build schema and RSU pipeline input
            const { schemaOutput, rsuInput } = await this.buildSchemaForConnector(
                input.CompanyIntegrationID, objects, validatedPlatform, user, skipGitCommit, skipRestart
            );

            // Step 4: Inject integration post-restart payload into RSU input.
            // RSU writes this file to disk before restart — it doesn't read or interpret it.
            // The integration layer's startup hook picks it up after restart.
            const { join } = await import('node:path');
            const rsuWorkDir = process.env.RSU_WORK_DIR || process.cwd();
            const pendingWorkDir = join(rsuWorkDir, '.rsu_pending');
            const pendingFilePath = join(pendingWorkDir, `${Date.now()}.json`);
            const pendingPayload = {
                CompanyIntegrationID: input.CompanyIntegrationID,
                SourceObjectNames: input.SourceObjectNames,
                SchemaName: schemaName,
                CronExpression: input.CronExpression,
                ScheduleTimezone: input.ScheduleTimezone,
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
                await Metadata.Provider.Refresh();
                const entityMapsCreated = await this.createEntityAndFieldMaps(
                    input.CompanyIntegrationID, objects, connector, companyIntegration, schemaName, user
                );
                const syncRunID = await this.startSyncAfterApply(input.CompanyIntegrationID, user);

                // Create schedule if requested
                let scheduledJobID: string | undefined;
                if (input.CronExpression) {
                    try {
                        scheduledJobID = await this.createScheduleForConnector(
                            input.CompanyIntegrationID,
                            companyIntegration.Integration,
                            input.CronExpression,
                            input.ScheduleTimezone,
                            user
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
        user: UserInfo
    ): Promise<ApplyAllEntityMapCreated[]> {
        const md = new Metadata();
        const results: ApplyAllEntityMapCreated[] = [];

        for (const obj of objects) {
            const entityMapResult = await this.createSingleEntityMap(
                companyIntegrationID, obj, connector, companyIntegration, schemaName, user, md
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
        md: Metadata
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

        // Create entity map
        const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', user);
        em.NewRecord();
        em.CompanyIntegrationID = companyIntegrationID;
        em.ExternalObjectName = obj.SourceObjectName;
        em.EntityID = entityInfo.ID;
        em.SyncDirection = 'Pull';
        em.Priority = 0;
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
        md: Metadata
    ): Promise<number> {
        let fieldCount = 0;
        try {
            const discoverFields = connector.DiscoverFields.bind(connector) as
                (ci: unknown, obj: string, u: unknown) => Promise<ExternalFieldSchema[]>;
            const fields = await discoverFields(companyIntegration, sourceObjectName, user);

            for (const field of fields) {
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
    private async startSyncAfterApply(companyIntegrationID: string, user: UserInfo): Promise<string | null> {
        try {
            await IntegrationEngine.Instance.Config(false, user);
            const syncPromise = IntegrationEngine.Instance.RunSync(companyIntegrationID, user, 'Manual');

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
    private async buildSchemaForConnector(
        companyIntegrationID: string,
        objects: SchemaPreviewObjectInput[],
        platform: 'sqlserver' | 'postgresql',
        user: UserInfo,
        skipGitCommit: boolean,
        skipRestart: boolean
    ): Promise<{ schemaOutput: SchemaBuilderOutput; rsuInput: RSUPipelineInput }> {
        const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);

        const introspect = connector.IntrospectSchema.bind(connector) as
            (ci: unknown, u: unknown) => Promise<SourceSchemaInfo>;
        const sourceSchema = await introspect(companyIntegration, user);

        const requestedNames = new Set(objects.map(o => o.SourceObjectName));
        const filteredSchema: SourceSchemaInfo = {
            Objects: sourceSchema.Objects.filter(o => requestedNames.has(o.ExternalName))
        };

        const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, platform, connector);

        const input: SchemaBuilderInput = {
            SourceSchema: filteredSchema,
            TargetConfigs: targetConfigs,
            Platform: platform,
            MJVersion: process.env.MJ_VERSION ?? '5.11.0',
            SourceType: companyIntegration.Integration,
            AdditionalSchemaInfoPath: process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH ?? 'additionalSchemaInfo.json',
            MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/v5',
            MetadataDir: process.env.RSU_METADATA_DIR ?? 'metadata',
            ExistingTables: [],
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
        @Ctx() ctx: AppContext
    ): Promise<StartSyncOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            await IntegrationEngine.Instance.Config(false, user);

            // Fire and forget
            const syncPromise = IntegrationEngine.Instance.RunSync(
                companyIntegrationID,
                user,
                'Manual'
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

            // Small delay to let the run record get created
            await new Promise(resolve => setTimeout(resolve, 200));

            const rv = new RunView();
            const runResult = await rv.RunView<MJCompanyIntegrationRunEntity>({
                EntityName: 'MJ: Company Integration Runs',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND Status='In Progress'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
                Fields: ['ID', 'Status', 'StartedAt']
            }, user);

            const run = runResult.Success && runResult.Results.length > 0 ? runResult.Results[0] : null;

            return {
                Success: true,
                Message: 'Sync started',
                RunID: run?.ID
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
        @Arg("runID") runID: string,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();
            const run = await md.GetEntityObject<MJCompanyIntegrationRunEntity>('MJ: Company Integration Runs', user);
            const loaded = await run.InnerLoad(CompositeKey.FromID(runID));
            if (!loaded) return { Success: false, Message: 'Run not found' };

            if (run.Status !== 'In Progress') {
                return { Success: false, Message: `Cannot cancel run with status '${run.Status}'` };
            }
            // TODO: 'Cancelled' is not yet in the Status value list ('Failed' | 'In Progress' | 'Pending' | 'Success').
            // A migration should add 'Cancelled' to the allowed values and CodeGen must regenerate types before this can be set.
            // Until then, mark the run as 'Failed' (closest available status) with a cancellation note.
            run.Status = 'Failed';
            run.Comments = (run.Comments ? run.Comments + '\n' : '') + 'Cancelled by user';
            run.EndedAt = new Date();
            if (!await run.Save()) return { Success: false, Message: 'Failed to cancel' };
            return { Success: true, Message: 'Cancelled' };
        } catch (e) {
            LogError(`IntegrationCancelSync error: ${e}`);
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
            const md = new Metadata();
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
                return { Success: false, Message: 'IntegrationSync scheduled job type not found' };
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
            job.Configuration = JSON.stringify({ CompanyIntegrationID: input.CompanyIntegrationID });

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
            const md = new Metadata();
            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
            const loaded = await job.InnerLoad(CompositeKey.FromID(scheduledJobID));
            if (!loaded) return { Success: false, Message: 'ScheduledJob not found' };

            if (cronExpression) job.CronExpression = cronExpression;
            if (timezone) job.Timezone = timezone;
            if (name) job.Name = name;

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
        @Arg("enabled") enabled: boolean,
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();
            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
            const loaded = await job.InnerLoad(CompositeKey.FromID(scheduledJobID));
            if (!loaded) return { Success: false, Message: 'ScheduledJob not found' };
            job.Status = enabled ? 'Active' : 'Paused';
            if (!await job.Save()) return { Success: false, Message: 'Failed to toggle' };
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
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();

            // Unlink from CI if provided
            if (companyIntegrationID) {
                const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
                const ciLoaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
                if (ciLoaded) {
                    ci.ScheduleEnabled = false;
                    ci.CronExpression = null;
                    await ci.Save();
                }
            }

            const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
            const loaded = await job.InnerLoad(CompositeKey.FromID(scheduledJobID));
            if (!loaded) return { Success: false, Message: 'ScheduledJob not found' };
            if (!await job.Delete()) return { Success: false, Message: 'Failed to delete' };
            return { Success: true, Message: 'Deleted' };
        } catch (e) {
            LogError(`IntegrationDeleteSchedule error: ${e}`);
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
                Fields: ['ID', 'EntityID', 'Entity', 'ExternalObjectName', 'SyncDirection', 'Priority', 'Status']
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
            const md = new Metadata();
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
                if (update.Status != null) {
                    if (!isValidEntityMapStatus(update.Status)) {
                        errors.push(`${update.EntityMapID}: invalid Status "${update.Status}"`);
                        continue;
                    }
                    em.Status = update.Status;
                }

                if (!await em.Save()) errors.push(`${update.EntityMapID}: failed to save`);
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
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();
            const rv = new RunView();
            const errors: string[] = [];

            for (const entityMapID of entityMapIDs) {
                const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', user);
                const loaded = await em.InnerLoad(CompositeKey.FromID(entityMapID));
                if (!loaded) { errors.push(`${entityMapID}: not found`); continue; }

                // Delete associated field maps first
                const fieldMapsResult = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
                    EntityName: 'MJ: Company Integration Field Maps',
                    ExtraFilter: `EntityMapID='${entityMapID}'`,
                    ResultType: 'entity_object'
                }, user);

                if (fieldMapsResult.Success) {
                    for (const fm of fieldMapsResult.Results) {
                        await fm.Delete();
                    }
                }

                if (!await em.Delete()) errors.push(`${entityMapID}: failed to delete`);
            }

            if (errors.length > 0) return { Success: false, Message: `Errors: ${errors.join('; ')}` };
            return { Success: true, Message: `Deleted ${entityMapIDs.length} entity maps (including field maps)` };
        } catch (e) {
            LogError(`IntegrationDeleteEntityMaps error: ${e}`);
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
            const md = new Metadata();
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'Not found' };

            const rv = new RunView();
            const [mapsResult, runsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Company Integration Entity Maps',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                    ResultType: 'simple',
                    Fields: ['ID', 'Status']
                },
                {
                    EntityName: 'MJ: Company Integration Runs',
                    ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 1,
                    ResultType: 'simple',
                    Fields: ['ID', 'Status', 'StartedAt', 'EndedAt', 'TotalRecords']
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
            const { connector } = await this.resolveConnector(companyIntegrationID, user);

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
            const validatedPlatform = this.validatePlatform(platform);

            // Phase 1: Build schema for each connector in parallel
            const buildResults = await Promise.allSettled(
                input.Connectors.map(async (connInput) => {
                    const { connector, companyIntegration } = await this.resolveConnector(connInput.CompanyIntegrationID, user);
                    const schemaName = this.deriveSchemaName(companyIntegration.Integration);
                    const objects = this.buildObjectInputsFromNames(connInput.SourceObjectNames, schemaName);
                    const { schemaOutput, rsuInput } = await this.buildSchemaForConnector(
                        connInput.CompanyIntegrationID, objects, validatedPlatform, user, skipGitCommit, skipRestart
                    );

                    // Inject post-restart pending work payload
                    const { join } = await import('node:path');
                    const rsuWorkDir = process.env.RSU_WORK_DIR || process.cwd();
                    const pendingWorkDir = join(rsuWorkDir, '.rsu_pending');
                    const pendingFilePath = join(pendingWorkDir, `${Date.now()}_${connInput.CompanyIntegrationID}.json`);
                    const pendingPayload = {
                        CompanyIntegrationID: connInput.CompanyIntegrationID,
                        SourceObjectNames: connInput.SourceObjectNames,
                        SchemaName: schemaName,
                        CronExpression: connInput.CronExpression,
                        ScheduleTimezone: connInput.ScheduleTimezone,
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
                    await Metadata.Provider.Refresh();
                    const entityMapsCreated = await this.createEntityAndFieldMaps(
                        build.connInput.CompanyIntegrationID, build.objects, build.connector,
                        build.companyIntegration, build.schemaName, user
                    );
                    connResult.EntityMapsCreated = entityMapsCreated;

                    const syncRunID = await this.startSyncAfterApply(build.connInput.CompanyIntegrationID, user);
                    if (syncRunID) connResult.SyncRunID = syncRunID;

                    // Create schedule if CronExpression provided
                    if (build.connInput.CronExpression) {
                        const scheduleResult = await this.createScheduleForConnector(
                            build.connInput.CompanyIntegrationID, integrationName,
                            build.connInput.CronExpression, build.connInput.ScheduleTimezone, user
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
        user: UserInfo
    ): Promise<string | null> {
        try {
            const md = new Metadata();
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
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();
            const rv = new RunView();

            // Step 1: Load CompanyIntegration
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const ciLoaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!ciLoaded) return { Success: false, Message: 'CompanyIntegration not found' };

            // Step 2: Load all entity maps
            const entityMapsResult = await rv.RunView<MJCompanyIntegrationEntityMapEntity>({
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}'`,
                ResultType: 'entity_object'
            }, user);

            const entityMaps = entityMapsResult.Success ? entityMapsResult.Results : [];
            let fieldMapsDeleted = 0;

            // Step 3: Delete all field maps for each entity map
            for (const em of entityMaps) {
                const fieldMapsResult = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
                    EntityName: 'MJ: Company Integration Field Maps',
                    ExtraFilter: `EntityMapID='${em.ID}'`,
                    ResultType: 'entity_object'
                }, user);

                if (fieldMapsResult.Success) {
                    for (const fm of fieldMapsResult.Results) {
                        if (await fm.Delete()) fieldMapsDeleted++;
                    }
                }
            }

            // Step 4: Delete all entity maps
            let entityMapsDeleted = 0;
            for (const em of entityMaps) {
                if (await em.Delete()) entityMapsDeleted++;
            }

            // Step 5: Delete scheduled jobs linked to this CompanyIntegration
            // ScheduledJob stores CompanyIntegrationID in its Configuration JSON
            const jobsResult = await rv.RunView<MJScheduledJobEntity>({
                EntityName: 'MJ: Scheduled Jobs',
                ExtraFilter: `Configuration LIKE '%${companyIntegrationID}%'`,
                ResultType: 'entity_object'
            }, user);

            let schedulesDeleted = 0;
            if (jobsResult.Success) {
                for (const job of jobsResult.Results) {
                    // Verify the job's Configuration actually references this CompanyIntegrationID
                    try {
                        const config = JSON.parse(job.Configuration || '{}') as Record<string, unknown>;
                        if (config.CompanyIntegrationID === companyIntegrationID) {
                            if (await job.Delete()) schedulesDeleted++;
                        }
                    } catch {
                        // If Configuration isn't valid JSON, skip
                    }
                }
            }

            // Step 6: Delete the CompanyIntegration itself
            if (!await ci.Delete()) {
                return { Success: false, Message: 'Failed to delete CompanyIntegration' };
            }

            // Note: deleteData=true does not drop tables yet — flagged for future implementation
            if (deleteData) {
                LogError(`IntegrationDeleteConnection: deleteData=true requested but table deletion not yet implemented for ${companyIntegrationID}`);
            }

            return {
                Success: true,
                Message: `Deleted connection and all associated records`,
                EntityMapsDeleted: entityMapsDeleted,
                FieldMapsDeleted: fieldMapsDeleted,
                SchedulesDeleted: schedulesDeleted,
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
            const { connector, companyIntegration } = await this.resolveConnector(companyIntegrationID, user);
            const schemaName = this.deriveSchemaName(companyIntegration.Integration);
            const md = new Metadata();
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

            const requestedNames = new Set(sourceObjectNames);
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
                MigrationsDir: process.env.RSU_MIGRATIONS_PATH ?? 'migrations/v5',
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
                const sourceObj = filteredSchema.Objects.find(o => o.ExternalName === config.SourceObjectName);
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
