import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/** Describes an object/table discovered in the external system */
export interface DiscoveredObjectResult {
    Name: string;
    Label: string;
    SupportsIncrementalSync: boolean;
    SupportsWrite: boolean;
}

/** Describes a field on an external object */
export interface DiscoveredFieldResult {
    Name: string;
    Label: string;
    DataType: string;
    IsRequired: boolean;
    IsUniqueKey: boolean;
    IsReadOnly: boolean;
}

/** Result wrapper for discovery operations */
export interface DiscoveryResult<T> {
    Success: boolean;
    Message: string;
    Data: T;
}

/** Input for a schema preview object */
export interface SchemaPreviewObjectInput {
    SourceObjectName: string;
    SchemaName: string;
    TableName: string;
    EntityName: string;
}

/** A generated file from the schema preview */
export interface SchemaPreviewFile {
    FilePath: string;
    Content: string;
    Description: string;
}

/** Result of a schema preview operation */
export interface SchemaPreviewResult {
    Success: boolean;
    Message: string;
    Files: SchemaPreviewFile[];
    Warnings: string[];
}

/** A single preview record from the external system */
export interface PreviewRecordResult {
    /** JSON-serialized record fields */
    Data: string;
}

/** Result of a data preview operation */
export interface PreviewDataResult {
    Success: boolean;
    Message: string;
    Records: PreviewRecordResult[];
}

/** A default field mapping from the connector's default configuration */
export interface DefaultFieldMappingResult {
    SourceFieldName: string;
    DestinationFieldName: string;
    IsKeyField?: boolean;
}

/** A default object configuration from the connector */
export interface DefaultObjectConfigResult {
    SourceObjectName: string;
    TargetTableName: string;
    TargetEntityName: string;
    SyncEnabled: boolean;
    FieldMappings: DefaultFieldMappingResult[];
}

/** Result of getting a connector's default configuration */
export interface DefaultConfigResult {
    Success: boolean;
    Message: string;
    DefaultSchemaName?: string;
    DefaultObjects?: DefaultObjectConfigResult[];
}

/** Generic mutation result */
export interface MutationResult {
    Success: boolean;
    Message: string;
}

/** A single entity map created during Apply All */
export interface ApplyAllEntityMapCreated {
    SourceObjectName: string;
    EntityName: string;
    EntityMapID: string;
    FieldMapCount: number;
}

/** Result of the full automatic Apply All flow */
export interface ApplyAllResult {
    Success: boolean;
    Message: string;
    Steps?: Array<{ Name: string; Status: string; DurationMs: number; Message: string }>;
    EntityMapsCreated?: ApplyAllEntityMapCreated[];
    SyncRunID?: string;
    GitCommitSuccess?: boolean;
    APIRestarted?: boolean;
    Warnings?: string[];
}

/** Composite integration status for dashboard */
export interface IntegrationStatusResult {
    Success: boolean;
    Message: string;
    IsActive?: boolean;
    IntegrationName?: string;
    TotalEntityMaps?: number;
    ActiveEntityMaps?: number;
    LastRunStatus?: string;
    LastRunStartedAt?: string;
    LastRunEndedAt?: string;
    ScheduleEnabled?: boolean;
}

/** Connector capability flags */
export interface ConnectorCapabilitiesResult {
    Success: boolean;
    Message: string;
    SupportsGet?: boolean;
    SupportsCreate?: boolean;
    SupportsUpdate?: boolean;
    SupportsDelete?: boolean;
    SupportsSearch?: boolean;
}

/** Result of a connection test */
export interface ConnectionTestGraphQLResult {
    Success: boolean;
    Message: string;
    ServerVersion: string | null;
}

/**
 * Client for invoking integration discovery operations through GraphQL.
 * Follows the same pattern as GraphQLActionClient and GraphQLAIClient.
 *
 * @example
 * ```typescript
 * const client = new GraphQLIntegrationClient(graphQLProvider);
 *
 * // Discover objects in an external system
 * const objects = await client.DiscoverObjects(companyIntegrationID);
 *
 * // Discover fields on an object
 * const fields = await client.DiscoverFields(companyIntegrationID, 'Members');
 *
 * // Test connection
 * const test = await client.TestConnection(companyIntegrationID);
 * ```
 */
export class GraphQLIntegrationClient {
    private _dataProvider: GraphQLDataProvider;

    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Discovers available objects/tables in the external system.
     * @param companyIntegrationID - ID of the CompanyIntegration record
     * @returns Discovery result containing an array of external objects
     */
    public async DiscoverObjects(
        companyIntegrationID: string
    ): Promise<DiscoveryResult<DiscoveredObjectResult[]>> {
        try {
            const query = gql`
                query IntegrationDiscoverObjects($companyIntegrationID: String!) {
                    IntegrationDiscoverObjects(companyIntegrationID: $companyIntegrationID) {
                        Success
                        Message
                        Objects {
                            Name
                            Label
                            SupportsIncrementalSync
                            SupportsWrite
                        }
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            const response = result?.IntegrationDiscoverObjects;
            if (!response) {
                throw new Error("Invalid response from server");
            }

            return {
                Success: response.Success,
                Message: response.Message,
                Data: response.Objects ?? []
            };
        } catch (e) {
            return this.handleError<DiscoveredObjectResult[]>(e, []);
        }
    }

    /**
     * Discovers fields on a specific external object.
     * @param companyIntegrationID - ID of the CompanyIntegration record
     * @param objectName - Name of the external object to inspect
     * @returns Discovery result containing an array of field schemas
     */
    public async DiscoverFields(
        companyIntegrationID: string,
        objectName: string
    ): Promise<DiscoveryResult<DiscoveredFieldResult[]>> {
        try {
            const query = gql`
                query IntegrationDiscoverFields($companyIntegrationID: String!, $objectName: String!) {
                    IntegrationDiscoverFields(companyIntegrationID: $companyIntegrationID, objectName: $objectName) {
                        Success
                        Message
                        Fields {
                            Name
                            Label
                            DataType
                            IsRequired
                            IsUniqueKey
                            IsReadOnly
                        }
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID, objectName });
            const response = result?.IntegrationDiscoverFields;
            if (!response) {
                throw new Error("Invalid response from server");
            }

            return {
                Success: response.Success,
                Message: response.Message,
                Data: response.Fields ?? []
            };
        } catch (e) {
            return this.handleError<DiscoveredFieldResult[]>(e, []);
        }
    }

    /**
     * Tests connectivity to the external system for a given company integration.
     * @param companyIntegrationID - ID of the CompanyIntegration record
     * @returns Connection test result
     */
    public async TestConnection(
        companyIntegrationID: string
    ): Promise<ConnectionTestGraphQLResult> {
        try {
            const query = gql`
                query IntegrationTestConnection($companyIntegrationID: String!) {
                    IntegrationTestConnection(companyIntegrationID: $companyIntegrationID) {
                        Success
                        Message
                        ServerVersion
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            const response = result?.IntegrationTestConnection;
            if (!response) {
                throw new Error("Invalid response from server");
            }

            return {
                Success: response.Success,
                Message: response.Message,
                ServerVersion: response.ServerVersion ?? null
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error testing integration connection: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`,
                ServerVersion: null
            };
        }
    }

    /**
     * Generates a DDL preview for creating tables from discovered external objects.
     * @param companyIntegrationID - ID of the CompanyIntegration record
     * @param objects - Objects to generate DDL for, with target schema/table names
     * @param platform - Target database platform ('sqlserver' or 'postgresql')
     * @returns Schema preview result containing generated SQL files
     */
    public async SchemaPreview(
        companyIntegrationID: string,
        objects: SchemaPreviewObjectInput[],
        platform: string = 'sqlserver'
    ): Promise<SchemaPreviewResult> {
        try {
            const query = gql`
                query IntegrationSchemaPreview(
                    $companyIntegrationID: String!,
                    $objects: [SchemaPreviewObjectInput!]!,
                    $platform: String!
                ) {
                    IntegrationSchemaPreview(
                        companyIntegrationID: $companyIntegrationID,
                        objects: $objects,
                        platform: $platform
                    ) {
                        Success
                        Message
                        Files {
                            FilePath
                            Content
                            Description
                        }
                        Warnings
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, {
                companyIntegrationID,
                objects,
                platform
            });
            const response = result?.IntegrationSchemaPreview;
            if (!response) {
                throw new Error("Invalid response from server");
            }

            return {
                Success: response.Success,
                Message: response.Message,
                Files: response.Files ?? [],
                Warnings: response.Warnings ?? []
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error generating schema preview: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`,
                Files: [],
                Warnings: []
            };
        }
    }

    /**
     * Fetches a small sample of records from an external object for preview.
     * @param companyIntegrationID - ID of the CompanyIntegration record
     * @param objectName - Name of the external object to preview
     * @param limit - Maximum number of records to fetch (default 5, max 10)
     * @returns Preview data result containing parsed record objects
     */
    public async PreviewData(
        companyIntegrationID: string,
        objectName: string,
        limit: number = 5
    ): Promise<PreviewDataResult> {
        try {
            const query = gql`
                query IntegrationPreviewData(
                    $companyIntegrationID: String!,
                    $objectName: String!,
                    $limit: Float!
                ) {
                    IntegrationPreviewData(
                        companyIntegrationID: $companyIntegrationID,
                        objectName: $objectName,
                        limit: $limit
                    ) {
                        Success
                        Message
                        Records {
                            Data
                        }
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, {
                companyIntegrationID,
                objectName,
                limit
            });
            const response = result?.IntegrationPreviewData;
            if (!response) {
                throw new Error("Invalid response from server");
            }

            return {
                Success: response.Success,
                Message: response.Message,
                Records: response.Records ?? []
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error previewing integration data: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`,
                Records: []
            };
        }
    }

    /**
     * Gets the connector's default configuration for quick setup.
     * @param companyIntegrationID - ID of the CompanyIntegration record
     * @returns Default configuration with proposed schema, objects, and field mappings
     */
    public async GetDefaultConfig(
        companyIntegrationID: string
    ): Promise<DefaultConfigResult> {
        try {
            const query = gql`
                query IntegrationGetDefaultConfig($companyIntegrationID: String!) {
                    IntegrationGetDefaultConfig(companyIntegrationID: $companyIntegrationID) {
                        Success
                        Message
                        DefaultSchemaName
                        DefaultObjects {
                            SourceObjectName
                            TargetTableName
                            TargetEntityName
                            SyncEnabled
                            FieldMappings {
                                SourceFieldName
                                DestinationFieldName
                                IsKeyField
                            }
                        }
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            const response = result?.IntegrationGetDefaultConfig;
            if (!response) {
                throw new Error("Invalid response from server");
            }

            return {
                Success: response.Success,
                Message: response.Message,
                DefaultSchemaName: response.DefaultSchemaName,
                DefaultObjects: response.DefaultObjects ?? []
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error getting default config: ${error}`);
            return {
                Success: false,
                Message: `Error: ${error.message}`
            };
        }
    }

    // ── Connection Lifecycle ──────────────────────────────────────────

    public async CreateConnection(input: {
        IntegrationID: string; CompanyID: string; CredentialTypeID: string;
        CredentialName: string; CredentialValues: string;
        ExternalSystemID?: string; Configuration?: string;
    }): Promise<MutationResult & { CompanyIntegrationID?: string; CredentialID?: string }> {
        try {
            const query = gql`mutation IntegrationCreateConnection($input: CreateConnectionInput!) {
                IntegrationCreateConnection(input: $input) { Success Message CompanyIntegrationID CredentialID }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { input });
            return result?.IntegrationCreateConnection ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async UpdateConnection(
        companyIntegrationID: string, credentialValues?: string, configuration?: string, externalSystemID?: string
    ): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationUpdateConnection(
                $companyIntegrationID: String!, $credentialValues: String, $configuration: String, $externalSystemID: String
            ) {
                IntegrationUpdateConnection(companyIntegrationID: $companyIntegrationID, credentialValues: $credentialValues, configuration: $configuration, externalSystemID: $externalSystemID) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID, credentialValues, configuration, externalSystemID });
            return result?.IntegrationUpdateConnection ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async DeactivateConnection(companyIntegrationID: string): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationDeactivateConnection($companyIntegrationID: String!) {
                IntegrationDeactivateConnection(companyIntegrationID: $companyIntegrationID) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            return result?.IntegrationDeactivateConnection ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    // ── Entity Maps ────────────────────────────────────────────────────

    public async CreateEntityMaps(
        companyIntegrationID: string, entityMaps: Array<{
            ExternalObjectName: string; EntityName?: string; EntityID?: string;
            SyncDirection?: string; Priority?: number;
            FieldMaps?: Array<{ SourceFieldName: string; DestinationFieldName: string; IsKeyField?: boolean; IsRequired?: boolean }>;
        }>
    ): Promise<MutationResult & { Created?: Array<{ EntityMapID: string; ExternalObjectName: string; FieldMapCount: number }> }> {
        try {
            const query = gql`mutation IntegrationCreateEntityMaps($companyIntegrationID: String!, $entityMaps: [EntityMapInput!]!) {
                IntegrationCreateEntityMaps(companyIntegrationID: $companyIntegrationID, entityMaps: $entityMaps) {
                    Success Message Created { EntityMapID ExternalObjectName FieldMapCount }
                }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID, entityMaps });
            return result?.IntegrationCreateEntityMaps ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async ListEntityMaps(companyIntegrationID: string): Promise<MutationResult & { EntityMaps?: string }> {
        try {
            const query = gql`query IntegrationListEntityMaps($companyIntegrationID: String!) {
                IntegrationListEntityMaps(companyIntegrationID: $companyIntegrationID) { Success Message EntityMaps }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            return result?.IntegrationListEntityMaps ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async UpdateEntityMaps(
        updates: Array<{ EntityMapID: string; SyncDirection?: string; Priority?: number; Status?: string }>
    ): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationUpdateEntityMaps($updates: [EntityMapUpdateInput!]!) {
                IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { updates });
            return result?.IntegrationUpdateEntityMaps ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async DeleteEntityMaps(entityMapIDs: string[]): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationDeleteEntityMaps($entityMapIDs: [String!]!) {
                IntegrationDeleteEntityMaps(entityMapIDs: $entityMapIDs) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { entityMapIDs });
            return result?.IntegrationDeleteEntityMaps ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    // ── Schema Pipeline ────────────────────────────────────────────────

    public async ApplySchema(
        companyIntegrationID: string, objects: SchemaPreviewObjectInput[],
        platform = 'sqlserver', skipGitCommit = false, skipRestart = false
    ): Promise<MutationResult & { Steps?: Array<{ Name: string; Status: string; DurationMs: number; Message: string }>; MigrationFilePath?: string; APIRestarted?: boolean; GitCommitSuccess?: boolean }> {
        try {
            const query = gql`mutation IntegrationApplySchema(
                $companyIntegrationID: String!, $objects: [SchemaPreviewObjectInput!]!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!
            ) {
                IntegrationApplySchema(companyIntegrationID: $companyIntegrationID, objects: $objects, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
                    Success Message Steps { Name Status DurationMs Message } MigrationFilePath APIRestarted GitCommitSuccess
                }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID, objects, platform, skipGitCommit, skipRestart });
            return result?.IntegrationApplySchema ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    /**
     * Batch apply schema for multiple connectors in one RSU pipeline run.
     * Sequential migrations, one CodeGen, one compile, one git PR, one restart.
     */
    public async ApplySchemaBatch(
        items: Array<{ CompanyIntegrationID: string; Objects: SchemaPreviewObjectInput[] }>,
        platform = 'sqlserver', skipGitCommit = false, skipRestart = false
    ): Promise<{
        Success: boolean;
        Message: string;
        Items?: Array<{ CompanyIntegrationID: string; Success: boolean; Message: string; Warnings?: string[] }>;
        Steps?: Array<{ Name: string; Status: string; DurationMs: number; Message: string }>;
        GitCommitSuccess?: boolean;
        APIRestarted?: boolean;
    }> {
        try {
            const query = gql`mutation IntegrationApplySchemaBatch(
                $items: [ApplySchemaBatchItemInput!]!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!
            ) {
                IntegrationApplySchemaBatch(items: $items, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
                    Success Message
                    Items { CompanyIntegrationID Success Message Warnings }
                    Steps { Name Status DurationMs Message }
                    GitCommitSuccess APIRestarted
                }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { items, platform, skipGitCommit, skipRestart });
            return result?.IntegrationApplySchemaBatch ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    /**
     * Full automatic "Apply All" flow: auto-names schema/tables, runs RSU pipeline,
     * creates entity maps + field maps, and starts sync.
     * @param companyIntegrationID - ID of the CompanyIntegration
     * @param sourceObjectNames - List of source object names to apply
     * @param platform - Target database platform
     * @param skipGitCommit - Skip git commit step
     * @param skipRestart - Skip API restart step
     */
    public async ApplyAll(
        companyIntegrationID: string,
        sourceObjectNames: string[],
        platform = 'sqlserver',
        skipGitCommit = false,
        skipRestart = false
    ): Promise<ApplyAllResult> {
        try {
            const query = gql`mutation IntegrationApplyAll(
                $input: ApplyAllInput!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!
            ) {
                IntegrationApplyAll(input: $input, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
                    Success Message
                    Steps { Name Status DurationMs Message }
                    EntityMapsCreated { SourceObjectName EntityName EntityMapID FieldMapCount }
                    SyncRunID GitCommitSuccess APIRestarted Warnings
                }
            }`;
            const input = { CompanyIntegrationID: companyIntegrationID, SourceObjectNames: sourceObjectNames };
            const result = await this._dataProvider.ExecuteGQL(query, { input, platform, skipGitCommit, skipRestart });
            return result?.IntegrationApplyAll ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    // ── Sync Execution ─────────────────────────────────────────────────

    public async StartSync(companyIntegrationID: string, webhookURL?: string): Promise<MutationResult & { RunID?: string }> {
        try {
            const query = gql`mutation IntegrationStartSync($companyIntegrationID: String!, $webhookURL: String) {
                IntegrationStartSync(companyIntegrationID: $companyIntegrationID, webhookURL: $webhookURL) { Success Message RunID }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID, webhookURL });
            return result?.IntegrationStartSync ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async CancelSync(runID: string): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationCancelSync($runID: String!) {
                IntegrationCancelSync(runID: $runID) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { runID });
            return result?.IntegrationCancelSync ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    // ── Scheduling ─────────────────────────────────────────────────────

    public async CreateSchedule(input: {
        CompanyIntegrationID: string; Name: string; CronExpression: string; Timezone?: string; Description?: string;
    }): Promise<MutationResult & { ScheduledJobID?: string }> {
        try {
            const query = gql`mutation IntegrationCreateSchedule($input: CreateScheduleInput!) {
                IntegrationCreateSchedule(input: $input) { Success Message ScheduledJobID }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { input });
            return result?.IntegrationCreateSchedule ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async UpdateSchedule(scheduledJobID: string, cronExpression?: string, timezone?: string, name?: string): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationUpdateSchedule($scheduledJobID: String!, $cronExpression: String, $timezone: String, $name: String) {
                IntegrationUpdateSchedule(scheduledJobID: $scheduledJobID, cronExpression: $cronExpression, timezone: $timezone, name: $name) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { scheduledJobID, cronExpression, timezone, name });
            return result?.IntegrationUpdateSchedule ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async ToggleSchedule(scheduledJobID: string, enabled: boolean): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationToggleSchedule($scheduledJobID: String!, $enabled: Boolean!) {
                IntegrationToggleSchedule(scheduledJobID: $scheduledJobID, enabled: $enabled) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { scheduledJobID, enabled });
            return result?.IntegrationToggleSchedule ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async DeleteSchedule(scheduledJobID: string, companyIntegrationID?: string): Promise<MutationResult> {
        try {
            const query = gql`mutation IntegrationDeleteSchedule($scheduledJobID: String!, $companyIntegrationID: String) {
                IntegrationDeleteSchedule(scheduledJobID: $scheduledJobID, companyIntegrationID: $companyIntegrationID) { Success Message }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { scheduledJobID, companyIntegrationID });
            return result?.IntegrationDeleteSchedule ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    // ── Status & History ───────────────────────────────────────────────

    public async GetStatus(companyIntegrationID: string): Promise<IntegrationStatusResult> {
        try {
            const query = gql`query IntegrationGetStatus($companyIntegrationID: String!) {
                IntegrationGetStatus(companyIntegrationID: $companyIntegrationID) {
                    Success Message IsActive IntegrationName TotalEntityMaps ActiveEntityMaps
                    LastRunStatus LastRunStartedAt LastRunEndedAt ScheduleEnabled
                }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            return result?.IntegrationGetStatus ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    public async GetSyncHistory(companyIntegrationID: string, limit = 20): Promise<MutationResult & { Runs?: string }> {
        try {
            const query = gql`query IntegrationGetSyncHistory($companyIntegrationID: String!, $limit: Float!) {
                IntegrationGetSyncHistory(companyIntegrationID: $companyIntegrationID, limit: $limit) { Success Message Runs }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID, limit });
            return result?.IntegrationGetSyncHistory ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    // ── Connector Capabilities ─────────────────────────────────────────

    public async GetConnectorCapabilities(companyIntegrationID: string): Promise<ConnectorCapabilitiesResult> {
        try {
            const query = gql`query IntegrationGetConnectorCapabilities($companyIntegrationID: String!) {
                IntegrationGetConnectorCapabilities(companyIntegrationID: $companyIntegrationID) {
                    Success Message SupportsGet SupportsCreate SupportsUpdate SupportsDelete SupportsSearch
                }
            }`;
            const result = await this._dataProvider.ExecuteGQL(query, { companyIntegrationID });
            return result?.IntegrationGetConnectorCapabilities ?? { Success: false, Message: 'No response' };
        } catch (e) { return { Success: false, Message: (e as Error).message }; }
    }

    private handleError<T>(e: unknown, defaultData: T): DiscoveryResult<T> {
        const error = e as Error;
        LogError(`Error in integration discovery: ${error}`);
        return {
            Success: false,
            Message: `Error: ${error.message}`,
            Data: defaultData
        };
    }
}
