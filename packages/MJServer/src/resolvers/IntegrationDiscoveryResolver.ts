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
    TargetColumnConfig
} from "@memberjunction/integration-schema-builder";
import type { RSUPipelineStep } from "@memberjunction/schema-engine";
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
    @Field({ nullable: true }) TotalEntityMaps?: number;
    @Field({ nullable: true }) ActiveEntityMaps?: number;
    @Field({ nullable: true }) LastRunStatus?: string;
    @Field({ nullable: true }) LastRunStartedAt?: string;
    @Field({ nullable: true }) LastRunEndedAt?: string;
    @Field({ nullable: true }) ScheduleEnabled?: boolean;
}

@ObjectType()
class SyncRunSummaryOutput {
    @Field() ID: string;
    @Field({ nullable: true }) Status?: string;
    @Field({ nullable: true }) StartedAt?: string;
    @Field({ nullable: true }) EndedAt?: string;
    @Field({ nullable: true }) TotalRecords?: number;
    @Field({ nullable: true }) RunByUserID?: string;
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
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, validatedPlatform);

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
        platform: 'sqlserver' | 'postgresql'
    ): TargetTableConfig[] {
        const mapper = new TypeMapper();

        return objects.map(obj => {
            const sourceObj = sourceSchema.Objects.find(o => o.ExternalName === obj.SourceObjectName);
            const columns: TargetColumnConfig[] = (sourceObj?.Fields ?? []).map(f => ({
                SourceFieldName: f.Name,
                TargetColumnName: f.Name.replace(/[^A-Za-z0-9_]/g, '_'),
                TargetSqlType: mapper.MapSourceType(f.SourceType, platform, f),
                IsNullable: !f.IsRequired,
                MaxLength: f.MaxLength,
                Precision: f.Precision,
                Scale: f.Scale,
                DefaultValue: f.DefaultValue
            }));

            const primaryKeyFields = (sourceObj?.Fields ?? [])
                .filter(f => f.IsPrimaryKey)
                .map(f => f.Name.replace(/[^A-Za-z0-9_]/g, '_'));

            return {
                SourceObjectName: obj.SourceObjectName,
                SchemaName: obj.SchemaName,
                TableName: obj.TableName,
                EntityName: obj.EntityName,
                Columns: columns,
                PrimaryKeyFields: primaryKeyFields.length > 0 ? primaryKeyFields : ['ID'],
                SoftForeignKeys: []
            };
        });
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

    // ── CONNECTION LIFECYCLE ─────────────────────────────────────────────

    /**
     * Lists all CompanyIntegrations (optionally filtered by active status).
     * Returns key fields for dashboard display without requiring a raw RunView call.
     */
    @Query(() => ListConnectionsOutput)
    async IntegrationListConnections(
        @Arg("activeOnly", { defaultValue: true }) activeOnly: boolean,
        @Ctx() ctx: AppContext
    ): Promise<ListConnectionsOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const rv = new RunView();
            const filter = activeOnly ? `IsActive=1` : '';
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
        @Ctx() ctx: AppContext
    ): Promise<MutationResultOutput> {
        try {
            const user = this.getAuthenticatedUser(ctx);
            const md = new Metadata();
            const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
            const loaded = await ci.InnerLoad(CompositeKey.FromID(companyIntegrationID));
            if (!loaded) return { Success: false, Message: 'CompanyIntegration not found' };

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
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, validatedPlatform);

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

            return {
                Success: true,
                Message: 'OK',
                IsActive: ci.IsActive ?? false,
                IntegrationName: ci.Integration,
                TotalEntityMaps: maps.length,
                ActiveEntityMaps: maps.filter(m => m.Status === 'Active').length,
                LastRunStatus: lastRun?.Status,
                LastRunStartedAt: lastRun?.StartedAt,
                LastRunEndedAt: lastRun?.EndedAt,
                ScheduleEnabled: ci.ScheduleEnabled
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
