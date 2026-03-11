/**
 * Local interface definitions for integration-engine entity types.
 *
 * These interfaces mirror the properties used from the generated entity classes
 * in @memberjunction/core-entities. They are defined locally because CodeGen
 * has not yet been run against the new integration tables, so the generated
 * classes are not yet exported from core-entities.
 *
 * Once CodeGen is run and core-entities is rebuilt, these can be replaced
 * with the real generated entity types.
 */

/**
 * Mirrors MJIntegrationSourceTypeEntity from the IntegrationSourceType table.
 * @see migrations/v2/V202603040356__v5.7.x_Create_IntegrationSourceType.sql
 */
export interface IIntegrationSourceType {
    ID: string;
    Name: string;
    Description: string | null;
    DriverClass: string;
    IconClass: string | null;
    Status: 'Active' | 'Inactive';
    Get(fieldName: string): unknown;
    Set?(fieldName: string, value: unknown): void;
    Save?(): Promise<boolean>;
}

/**
 * Mirrors MJCompanyIntegrationEntityMapEntity from the CompanyIntegrationEntityMap table.
 * @see migrations/v2/V202603040357__v5.7.x_Create_CompanyIntegrationEntityMap.sql
 */
export interface ICompanyIntegrationEntityMap {
    ID: string;
    CompanyIntegrationID: string;
    ExternalObjectName: string;
    ExternalObjectLabel: string | null;
    EntityID: string;
    SyncDirection: 'Pull' | 'Push' | 'Bidirectional';
    SyncEnabled: boolean;
    MatchStrategy: string | null;
    ConflictResolution: 'SourceWins' | 'DestWins' | 'MostRecent' | 'Manual';
    Priority: number;
    DeleteBehavior: 'SoftDelete' | 'DoNothing' | 'HardDelete';
    Status: 'Active' | 'Inactive';
    Configuration: string | null;
    /** View field: joined entity name */
    Entity: string;
    Get(fieldName: string): unknown;
    Set?(fieldName: string, value: unknown): void;
    Save?(): Promise<boolean>;
}

/**
 * Mirrors MJCompanyIntegrationFieldMapEntity from the CompanyIntegrationFieldMap table.
 * @see migrations/v2/V202603040358__v5.7.x_Create_CompanyIntegrationFieldMap.sql
 */
export interface ICompanyIntegrationFieldMap {
    ID: string;
    EntityMapID: string;
    SourceFieldName: string;
    SourceFieldLabel: string | null;
    DestinationFieldName: string;
    DestinationFieldLabel: string | null;
    Direction: 'SourceToDest' | 'DestToSource' | 'Both';
    TransformPipeline: string | null;
    IsKeyField: boolean;
    IsRequired: boolean;
    DefaultValue: string | null;
    Priority: number;
    Status: 'Active' | 'Inactive';
    Get(fieldName: string): unknown;
    Set?(fieldName: string, value: unknown): void;
    Save?(): Promise<boolean>;
}

/**
 * Mirrors MJCompanyIntegrationSyncWatermarkEntity from the CompanyIntegrationSyncWatermark table.
 * @see migrations/v2/V202603040359__v5.7.x_Create_CompanyIntegrationSyncWatermark.sql
 */
export interface ICompanyIntegrationSyncWatermark {
    ID: string;
    EntityMapID: string;
    Direction: 'Pull' | 'Push';
    WatermarkType: 'Timestamp' | 'Cursor' | 'ChangeToken' | 'Version';
    WatermarkValue: string | null;
    LastSyncAt: Date | null;
    RecordsSynced: number;
    Get(fieldName: string): unknown;
    Set?(fieldName: string, value: unknown): void;
    Save?(): Promise<boolean>;
    NewRecord?(): void;
}
