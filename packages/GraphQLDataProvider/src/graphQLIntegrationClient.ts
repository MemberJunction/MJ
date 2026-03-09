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
