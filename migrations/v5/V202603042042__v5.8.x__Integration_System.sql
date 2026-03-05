-- Migration: Integration System tables
-- Creates IntegrationSourceType, CompanyIntegrationEntityMap, CompanyIntegrationFieldMap,
-- CompanyIntegrationSyncWatermark, and adds SourceTypeID/Configuration to CompanyIntegration.

----------------------------------------------------------------------
-- 1. IntegrationSourceType
----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.IntegrationSourceType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(500) NOT NULL,
    IconClass NVARCHAR(200) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_IntegrationSourceType PRIMARY KEY (ID),
    CONSTRAINT UQ_IntegrationSourceType_Name UNIQUE (Name),
    CONSTRAINT UQ_IntegrationSourceType_DriverClass UNIQUE (DriverClass),
    CONSTRAINT CK_IntegrationSourceType_Status CHECK (Status IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 2. CompanyIntegrationEntityMap
----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.CompanyIntegrationEntityMap (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CompanyIntegrationID UNIQUEIDENTIFIER NOT NULL,
    ExternalObjectName NVARCHAR(500) NOT NULL,
    ExternalObjectLabel NVARCHAR(500) NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    SyncDirection NVARCHAR(50) NOT NULL DEFAULT 'Pull',
    SyncEnabled BIT NOT NULL DEFAULT 1,
    MatchStrategy NVARCHAR(MAX) NULL,
    ConflictResolution NVARCHAR(50) NOT NULL DEFAULT 'SourceWins',
    Priority INT NOT NULL DEFAULT 0,
    DeleteBehavior NVARCHAR(50) NOT NULL DEFAULT 'SoftDelete',
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    Configuration NVARCHAR(MAX) NULL,
    CONSTRAINT PK_CompanyIntegrationEntityMap PRIMARY KEY (ID),
    CONSTRAINT FK_CompanyIntegrationEntityMap_CompanyIntegration FOREIGN KEY (CompanyIntegrationID) REFERENCES ${flyway:defaultSchema}.CompanyIntegration(ID),
    CONSTRAINT FK_CompanyIntegrationEntityMap_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_CompanyIntegrationEntityMap_SyncDirection CHECK (SyncDirection IN ('Pull', 'Push', 'Bidirectional')),
    CONSTRAINT CK_CompanyIntegrationEntityMap_ConflictResolution CHECK (ConflictResolution IN ('SourceWins', 'DestWins', 'MostRecent', 'Manual')),
    CONSTRAINT CK_CompanyIntegrationEntityMap_DeleteBehavior CHECK (DeleteBehavior IN ('SoftDelete', 'DoNothing', 'HardDelete')),
    CONSTRAINT CK_CompanyIntegrationEntityMap_Status CHECK (Status IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 3. CompanyIntegrationFieldMap
----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.CompanyIntegrationFieldMap (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityMapID UNIQUEIDENTIFIER NOT NULL,
    SourceFieldName NVARCHAR(500) NOT NULL,
    SourceFieldLabel NVARCHAR(500) NULL,
    DestinationFieldName NVARCHAR(500) NOT NULL,
    DestinationFieldLabel NVARCHAR(500) NULL,
    Direction NVARCHAR(50) NOT NULL DEFAULT 'SourceToDest',
    TransformPipeline NVARCHAR(MAX) NULL,
    IsKeyField BIT NOT NULL DEFAULT 0,
    IsRequired BIT NOT NULL DEFAULT 0,
    DefaultValue NVARCHAR(MAX) NULL,
    Priority INT NOT NULL DEFAULT 0,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_CompanyIntegrationFieldMap PRIMARY KEY (ID),
    CONSTRAINT FK_CompanyIntegrationFieldMap_EntityMap FOREIGN KEY (EntityMapID) REFERENCES ${flyway:defaultSchema}.CompanyIntegrationEntityMap(ID),
    CONSTRAINT CK_CompanyIntegrationFieldMap_Direction CHECK (Direction IN ('SourceToDest', 'DestToSource', 'Both')),
    CONSTRAINT CK_CompanyIntegrationFieldMap_Status CHECK (Status IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 4. CompanyIntegrationSyncWatermark
----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityMapID UNIQUEIDENTIFIER NOT NULL,
    Direction NVARCHAR(50) NOT NULL DEFAULT 'Pull',
    WatermarkType NVARCHAR(50) NOT NULL DEFAULT 'Timestamp',
    WatermarkValue NVARCHAR(MAX) NULL,
    LastSyncAt DATETIMEOFFSET NULL,
    RecordsSynced INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_CompanyIntegrationSyncWatermark PRIMARY KEY (ID),
    CONSTRAINT FK_CompanyIntegrationSyncWatermark_EntityMap FOREIGN KEY (EntityMapID) REFERENCES ${flyway:defaultSchema}.CompanyIntegrationEntityMap(ID),
    CONSTRAINT CK_CompanyIntegrationSyncWatermark_Direction CHECK (Direction IN ('Pull', 'Push')),
    CONSTRAINT CK_CompanyIntegrationSyncWatermark_WatermarkType CHECK (WatermarkType IN ('Timestamp', 'Cursor', 'ChangeToken', 'Version')),
    CONSTRAINT UQ_CompanyIntegrationSyncWatermark_EntityMap_Direction UNIQUE (EntityMapID, Direction)
);

----------------------------------------------------------------------
-- 5. Add columns to CompanyIntegration
----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD SourceTypeID UNIQUEIDENTIFIER NULL,
        Configuration NVARCHAR(MAX) NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD CONSTRAINT FK_CompanyIntegration_IntegrationSourceType
    FOREIGN KEY (SourceTypeID) REFERENCES ${flyway:defaultSchema}.IntegrationSourceType(ID);

----------------------------------------------------------------------
-- 6. Extended Properties — Table Descriptions
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines categories of integration sources such as SaaS API, Relational Database, or File Feed.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'IntegrationSourceType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maps an external object from a company integration to a MemberJunction entity, controlling sync direction, matching, and conflict resolution.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maps individual fields between an external source object and a MemberJunction entity, with optional transform pipeline.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks incremental sync progress per entity map and direction using watermarks (timestamp, cursor, change token, or version).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationSyncWatermark';

----------------------------------------------------------------------
-- 7. Extended Properties — IntegrationSourceType Columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Display name for this source type (e.g. SaaS API, Relational Database, File Feed).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'IntegrationSourceType',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Optional longer description of this source type.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'IntegrationSourceType',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Fully-qualified class name registered via @RegisterClass that implements BaseIntegrationConnector for this source type.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'IntegrationSourceType',
    @level2type = N'COLUMN', @level2name = 'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Font Awesome icon class for UI display.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'IntegrationSourceType',
    @level2type = N'COLUMN', @level2name = 'IconClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this source type is available for use. Active or Inactive.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'IntegrationSourceType',
    @level2type = N'COLUMN', @level2name = 'Status';

----------------------------------------------------------------------
-- 8. Extended Properties — CompanyIntegrationEntityMap Columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The name of the object in the external system (e.g. table name, API resource name).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'ExternalObjectName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Optional human-friendly label for the external object.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'ExternalObjectLabel';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether data flows from external to MJ (Pull), MJ to external (Push), or both.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'SyncDirection';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When true, this entity map is included in sync runs.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'SyncEnabled';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'JSON configuration for the match engine describing how to identify existing records (key fields, fuzzy thresholds, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'MatchStrategy';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How to handle conflicts when both source and destination have been modified. SourceWins, DestWins, MostRecent, or Manual.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'ConflictResolution';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Processing order when multiple entity maps exist. Lower numbers are processed first.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How to handle records that no longer exist in the source. SoftDelete, DoNothing, or HardDelete.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'DeleteBehavior';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this entity map is Active or Inactive.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Optional JSON configuration specific to this entity mapping.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationEntityMap',
    @level2type = N'COLUMN', @level2name = 'Configuration';

----------------------------------------------------------------------
-- 9. Extended Properties — CompanyIntegrationFieldMap Columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The field/column name in the external source system.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'SourceFieldName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Optional human-friendly label for the source field.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'SourceFieldLabel';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The MJ entity field name this source field maps to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'DestinationFieldName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Optional human-friendly label for the destination field.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'DestinationFieldLabel';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Direction of field mapping: SourceToDest, DestToSource, or Both.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'Direction';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'JSON array of transform names to apply in order (e.g. ["trim", "uppercase"]). See FieldMappingEngine for available transforms.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'TransformPipeline';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When true, this field is used by the MatchEngine to find existing records during sync.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'IsKeyField';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When true, a sync record is rejected if this field has no value.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'IsRequired';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Default value to use when the source field is null or missing.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'DefaultValue';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Processing order for this field mapping within the entity map.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this field mapping is Active or Inactive.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationFieldMap',
    @level2type = N'COLUMN', @level2name = 'Status';

----------------------------------------------------------------------
-- 10. Extended Properties — CompanyIntegrationSyncWatermark Columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Sync direction this watermark tracks: Pull or Push.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
    @level2type = N'COLUMN', @level2name = 'Direction';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The type of watermark: Timestamp, Cursor, ChangeToken, or Version.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
    @level2type = N'COLUMN', @level2name = 'WatermarkType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The serialized watermark value used to resume incremental sync.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
    @level2type = N'COLUMN', @level2name = 'WatermarkValue';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Timestamp of the last successful sync for this watermark.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
    @level2type = N'COLUMN', @level2name = 'LastSyncAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Cumulative count of records synced through this watermark.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
    @level2type = N'COLUMN', @level2name = 'RecordsSynced';

----------------------------------------------------------------------
-- 11. Extended Properties — New CompanyIntegration Columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Links this integration to its source type (SaaS API, Database, File Feed, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegration',
    @level2type = N'COLUMN', @level2name = 'SourceTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'JSON configuration for the integration connection (server, database, credentials reference, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'CompanyIntegration',
    @level2type = N'COLUMN', @level2name = 'Configuration';






























































-- CODE GEN RUN
