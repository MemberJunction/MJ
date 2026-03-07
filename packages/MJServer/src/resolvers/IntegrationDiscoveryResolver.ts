import { Resolver, Query, Arg, Ctx, ObjectType, Field, InputType } from "type-graphql";
import { Metadata, UserInfo, LogError } from "@memberjunction/core";
import { MJCompanyIntegrationEntity, MJIntegrationEntity } from "@memberjunction/core-entities";
import {
    BaseIntegrationConnector,
    ConnectorFactory,
    ExternalObjectSchema,
    ExternalFieldSchema,
    ConnectionTestResult,
    SourceSchemaInfo
} from "@memberjunction/integration-engine";
import {
    SchemaBuilder,
    TypeMapper,
    SchemaBuilderInput,
    TargetTableConfig,
    TargetColumnConfig
} from "@memberjunction/integration-schema-builder";
import { ResolverBase } from "../generic/ResolverBase.js";
import { AppContext } from "../types.js";

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

// --- Resolver ---

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
            const error = e as Error;
            LogError(`IntegrationTestConnection error: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`
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
            const error = e as Error;
            LogError(`IntegrationGetDefaultConfig error: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`
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

            // Build target configs from user input + source schema
            const targetConfigs = this.buildTargetConfigs(objects, filteredSchema, platform as 'sqlserver' | 'postgresql');

            // Run SchemaBuilder
            const input: SchemaBuilderInput = {
                SourceSchema: filteredSchema,
                TargetConfigs: targetConfigs,
                Platform: platform as 'sqlserver' | 'postgresql',
                MJVersion: '5.7.0',
                SourceType: companyIntegration.Integration,
                AdditionalSchemaInfoPath: 'additionalSchemaInfo.json',
                MigrationsDir: 'migrations/v2',
                MetadataDir: 'metadata',
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
            const error = e as Error;
            LogError(`IntegrationSchemaPreview error: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`
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
                    Data: JSON.stringify({ ExternalID: r.ExternalID, ...r.Fields })
                }))
            };
        } catch (e) {
            const error = e as Error;
            LogError(`IntegrationPreviewData error: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`
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

            return {
                SourceObjectName: obj.SourceObjectName,
                SchemaName: obj.SchemaName,
                TableName: obj.TableName,
                EntityName: obj.EntityName,
                Columns: columns,
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

        // ConnectorFactory expects its own copy of core-entities types — cast through unknown
        const connector = ConnectorFactory.Resolve(
            integration as unknown as Parameters<typeof ConnectorFactory.Resolve>[0]
        );

        return { connector, companyIntegration };
    }

    private handleDiscoveryError(e: unknown): DiscoverObjectsOutput & DiscoverFieldsOutput {
        const error = e as Error;
        LogError(`Integration discovery error: ${error}`);
        return {
            Success: false,
            Message: `Error: ${error.message}`
        };
    }
}
