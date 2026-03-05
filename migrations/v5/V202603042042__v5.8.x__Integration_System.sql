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
/* SQL generated to create new entity MJ: Integration Source Types */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '57801845-6620-4cbd-993f-e4aa2d464a04',
         'MJ: Integration Source Types',
         'Integration Source Types',
         'Defines categories of integration sources such as SaaS API, Relational Database, or File Feed.',
         NULL,
         'IntegrationSourceType',
         'vwIntegrationSourceTypes',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Integration Source Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57801845-6620-4cbd-993f-e4aa2d464a04', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Source Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('57801845-6620-4cbd-993f-e4aa2d464a04', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Source Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('57801845-6620-4cbd-993f-e4aa2d464a04', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Source Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('57801845-6620-4cbd-993f-e4aa2d464a04', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Company Integration Entity Maps */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '41579cac-5ddc-48b4-8703-31292be0a414',
         'MJ: Company Integration Entity Maps',
         'Company Integration Entity Maps',
         'Maps an external object from a company integration to a MemberJunction entity, controlling sync direction, matching, and conflict resolution.',
         NULL,
         'CompanyIntegrationEntityMap',
         'vwCompanyIntegrationEntityMaps',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Company Integration Entity Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '41579cac-5ddc-48b4-8703-31292be0a414', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('41579cac-5ddc-48b4-8703-31292be0a414', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('41579cac-5ddc-48b4-8703-31292be0a414', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('41579cac-5ddc-48b4-8703-31292be0a414', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Company Integration Field Maps */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'feca4edd-74f9-4a1c-a284-e586e76b23fe',
         'MJ: Company Integration Field Maps',
         'Company Integration Field Maps',
         'Maps individual fields between an external source object and a MemberJunction entity, with optional transform pipeline.',
         NULL,
         'CompanyIntegrationFieldMap',
         'vwCompanyIntegrationFieldMaps',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Company Integration Field Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'feca4edd-74f9-4a1c-a284-e586e76b23fe', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Company Integration Sync Watermarks */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'd5c4fef3-21d0-4a41-893b-34f9527195f0',
         'MJ: Company Integration Sync Watermarks',
         'Company Integration Sync Watermarks',
         'Tracks incremental sync progress per entity map and direction using watermarks (timestamp, cursor, change token, or version).',
         NULL,
         'CompanyIntegrationSyncWatermark',
         'vwCompanyIntegrationSyncWatermarks',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Company Integration Sync Watermarks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd5c4fef3-21d0-4a41-893b-34f9527195f0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.IntegrationSourceType */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationSourceType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.IntegrationSourceType */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationSourceType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c91ef1ae-5036-440d-8492-121518a3d36e' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c91ef1ae-5036-440d-8492-121518a3d36e',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca111fe4-61fe-49d0-9106-a75de3035fb1' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'CompanyIntegrationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca111fe4-61fe-49d0-9106-a75de3035fb1',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100002,
            'CompanyIntegrationID',
            'Company Integration ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'DE238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41d1dc11-6093-4473-abf6-1b578b9a26bd' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'ExternalObjectName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '41d1dc11-6093-4473-abf6-1b578b9a26bd',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100003,
            'ExternalObjectName',
            'External Object Name',
            'The name of the object in the external system (e.g. table name, API resource name).',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77802508-d414-4972-932d-c84439de5db4' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'ExternalObjectLabel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77802508-d414-4972-932d-c84439de5db4',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100004,
            'ExternalObjectLabel',
            'External Object Label',
            'Optional human-friendly label for the external object.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '749758c4-a7b3-413a-a434-4844771c7f84' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '749758c4-a7b3-413a-a434-4844771c7f84',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100005,
            'EntityID',
            'Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd5a1d3c-f54b-41ff-9879-b3bcd73a231f' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'SyncDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd5a1d3c-f54b-41ff-9879-b3bcd73a231f',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100006,
            'SyncDirection',
            'Sync Direction',
            'Whether data flows from external to MJ (Pull), MJ to external (Push), or both.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pull',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e29e9aba-528d-4a3d-aeb7-b9625ab4362d' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'SyncEnabled')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e29e9aba-528d-4a3d-aeb7-b9625ab4362d',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100007,
            'SyncEnabled',
            'Sync Enabled',
            'When true, this entity map is included in sync runs.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ef5faaf-4128-459f-978f-bc14223fd131' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'MatchStrategy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ef5faaf-4128-459f-978f-bc14223fd131',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100008,
            'MatchStrategy',
            'Match Strategy',
            'JSON configuration for the match engine describing how to identify existing records (key fields, fuzzy thresholds, etc.).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '350740c9-5552-45b2-a222-889bb91f6e3b' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'ConflictResolution')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '350740c9-5552-45b2-a222-889bb91f6e3b',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100009,
            'ConflictResolution',
            'Conflict Resolution',
            'How to handle conflicts when both source and destination have been modified. SourceWins, DestWins, MostRecent, or Manual.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'SourceWins',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1eb6c90-5caf-4a45-88b8-2ca52a3d7d83' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f1eb6c90-5caf-4a45-88b8-2ca52a3d7d83',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100010,
            'Priority',
            'Priority',
            'Processing order when multiple entity maps exist. Lower numbers are processed first.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81628273-7743-4dca-a036-82b8595bb2aa' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'DeleteBehavior')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81628273-7743-4dca-a036-82b8595bb2aa',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100011,
            'DeleteBehavior',
            'Delete Behavior',
            'How to handle records that no longer exist in the source. SoftDelete, DoNothing, or HardDelete.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'SoftDelete',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6e720dd-fefd-4c82-b694-dea4fc4d308a' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e6e720dd-fefd-4c82-b694-dea4fc4d308a',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100012,
            'Status',
            'Status',
            'Whether this entity map is Active or Inactive.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3428aa14-3fcd-463a-8b90-29e08070c300' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3428aa14-3fcd-463a-8b90-29e08070c300',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100013,
            'Configuration',
            'Configuration',
            'Optional JSON configuration specific to this entity mapping.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a83f1a0-06f9-43d2-9151-53a5178eece2' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a83f1a0-06f9-43d2-9151-53a5178eece2',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100014,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88ca33db-38d1-406a-bb78-5809ac6f86eb' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88ca33db-38d1-406a-bb78-5809ac6f86eb',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100015,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95eb5e41-3d51-4af7-93b5-fd0466702686' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '95eb5e41-3d51-4af7-93b5-fd0466702686',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '846d8888-af62-4d4b-ae06-a52c284377a7' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'EntityMapID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '846d8888-af62-4d4b-ae06-a52c284377a7',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100002,
            'EntityMapID',
            'Entity Map ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '41579CAC-5DDC-48B4-8703-31292BE0A414',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b060fd28-be54-42cf-bef5-fe27359e5a72' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'Direction')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b060fd28-be54-42cf-bef5-fe27359e5a72',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100003,
            'Direction',
            'Direction',
            'Sync direction this watermark tracks: Pull or Push.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pull',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1647d6d5-b2b7-4702-acf4-faefff2d091a' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'WatermarkType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1647d6d5-b2b7-4702-acf4-faefff2d091a',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100004,
            'WatermarkType',
            'Watermark Type',
            'The type of watermark: Timestamp, Cursor, ChangeToken, or Version.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Timestamp',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a104bf94-1f56-4b4a-a243-bd8a2a3f3ef7' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'WatermarkValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a104bf94-1f56-4b4a-a243-bd8a2a3f3ef7',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100005,
            'WatermarkValue',
            'Watermark Value',
            'The serialized watermark value used to resume incremental sync.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '028d4ee7-1a23-4c6a-9e42-1527ba110c70' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'LastSyncAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '028d4ee7-1a23-4c6a-9e42-1527ba110c70',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100006,
            'LastSyncAt',
            'Last Sync At',
            'Timestamp of the last successful sync for this watermark.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4b0f49e-b21c-4358-8e46-ec4ba66a3a22' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'RecordsSynced')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4b0f49e-b21c-4358-8e46-ec4ba66a3a22',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100007,
            'RecordsSynced',
            'Records Synced',
            'Cumulative count of records synced through this watermark.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d349d6a-e5e1-4037-b1be-104e1bd8009e' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2d349d6a-e5e1-4037-b1be-104e1bd8009e',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e87f3f8f-fb10-46c6-b42a-d41c0af3aae3' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e87f3f8f-fb10-46c6-b42a-d41c0af3aae3',
            'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f647023e-d909-4ecb-b59d-ee477c274827' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f647023e-d909-4ecb-b59d-ee477c274827',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100042,
            'SourceTypeID',
            'Source Type ID',
            'Links this integration to its source type (SaaS API, Database, File Feed, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '57801845-6620-4CBD-993F-E4AA2D464A04',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '987eaf20-227f-4043-bd87-06c9e01598f4' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '987eaf20-227f-4043-bd87-06c9e01598f4',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100043,
            'Configuration',
            'Configuration',
            'JSON configuration for the integration connection (server, database, credentials reference, etc.).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2882887-8d20-41cb-a1be-91e3e270d3e6' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2882887-8d20-41cb-a1be-91e3e270d3e6',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76cf6a33-6556-46ca-aa57-4050aa9ad647' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '76cf6a33-6556-46ca-aa57-4050aa9ad647',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100002,
            'Name',
            'Name',
            'Display name for this source type (e.g. SaaS API, Relational Database, File Feed).',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7691951-eef3-47ee-b375-0421de28ae7a' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e7691951-eef3-47ee-b375-0421de28ae7a',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100003,
            'Description',
            'Description',
            'Optional longer description of this source type.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16a801a3-e1ef-4f41-adbd-9af7747ade78' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16a801a3-e1ef-4f41-adbd-9af7747ade78',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100004,
            'DriverClass',
            'Driver Class',
            'Fully-qualified class name registered via @RegisterClass that implements BaseIntegrationConnector for this source type.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '254c0b4e-cc02-46bc-92e3-8a46463198cb' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = 'IconClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '254c0b4e-cc02-46bc-92e3-8a46463198cb',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100005,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class for UI display.',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b1ff62d-f04e-42b4-85f9-02ce12e23381' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b1ff62d-f04e-42b4-85f9-02ce12e23381',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100006,
            'Status',
            'Status',
            'Whether this source type is available for use. Active or Inactive.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d083aa3-60cb-41dc-82d0-26dd3e9c5ade' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d083aa3-60cb-41dc-82d0-26dd3e9c5ade',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10ddedfe-56d3-4938-bfe4-0fd79da1d6da' OR (EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '10ddedfe-56d3-4938-bfe4-0fd79da1d6da',
            '57801845-6620-4CBD-993F-E4AA2D464A04', -- Entity: MJ: Integration Source Types
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dfb579f-2f81-4b1f-a357-09c7ea664ad0' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3dfb579f-2f81-4b1f-a357-09c7ea664ad0',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6befb401-01dd-454a-bb34-d300e78ab97d' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'EntityMapID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6befb401-01dd-454a-bb34-d300e78ab97d',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100002,
            'EntityMapID',
            'Entity Map ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '41579CAC-5DDC-48B4-8703-31292BE0A414',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8a8d8a6-7f09-4a3f-ade8-24d5ad46c512' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'SourceFieldName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8a8d8a6-7f09-4a3f-ade8-24d5ad46c512',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100003,
            'SourceFieldName',
            'Source Field Name',
            'The field/column name in the external source system.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd36a432-32e7-4b66-b59c-dfaec7001a76' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'SourceFieldLabel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd36a432-32e7-4b66-b59c-dfaec7001a76',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100004,
            'SourceFieldLabel',
            'Source Field Label',
            'Optional human-friendly label for the source field.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4886f7d9-06ef-4979-9346-b689afcf5cb9' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'DestinationFieldName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4886f7d9-06ef-4979-9346-b689afcf5cb9',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100005,
            'DestinationFieldName',
            'Destination Field Name',
            'The MJ entity field name this source field maps to.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d8315d9-aed2-4e67-8743-6233f9f1c312' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'DestinationFieldLabel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4d8315d9-aed2-4e67-8743-6233f9f1c312',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100006,
            'DestinationFieldLabel',
            'Destination Field Label',
            'Optional human-friendly label for the destination field.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6d1f636-074a-44c4-9908-2f05ac0d8cea' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'Direction')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e6d1f636-074a-44c4-9908-2f05ac0d8cea',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100007,
            'Direction',
            'Direction',
            'Direction of field mapping: SourceToDest, DestToSource, or Both.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'SourceToDest',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9be66dc5-e20a-4fee-acad-68bd018f0b86' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'TransformPipeline')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9be66dc5-e20a-4fee-acad-68bd018f0b86',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100008,
            'TransformPipeline',
            'Transform Pipeline',
            'JSON array of transform names to apply in order (e.g. ["trim", "uppercase"]). See FieldMappingEngine for available transforms.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb6b2fc1-8530-4229-a524-85437510b1b0' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'IsKeyField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bb6b2fc1-8530-4229-a524-85437510b1b0',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100009,
            'IsKeyField',
            'Is Key Field',
            'When true, this field is used by the MatchEngine to find existing records during sync.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '923b68d4-6b26-4b39-8324-f115221e6733' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'IsRequired')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '923b68d4-6b26-4b39-8324-f115221e6733',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100010,
            'IsRequired',
            'Is Required',
            'When true, a sync record is rejected if this field has no value.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f47d2da-b34d-436f-8177-5e1ba9435288' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'DefaultValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5f47d2da-b34d-436f-8177-5e1ba9435288',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100011,
            'DefaultValue',
            'Default Value',
            'Default value to use when the source field is null or missing.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93e74709-a312-49e1-8c80-ea2909a6b5bf' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '93e74709-a312-49e1-8c80-ea2909a6b5bf',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100012,
            'Priority',
            'Priority',
            'Processing order for this field mapping within the entity map.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f978bf2-eea0-46e7-86c7-62d09da17b96' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2f978bf2-eea0-46e7-86c7-62d09da17b96',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100013,
            'Status',
            'Status',
            'Whether this field mapping is Active or Inactive.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93f28803-d909-4bcb-9742-08455f48ab78' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '93f28803-d909-4bcb-9742-08455f48ab78',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100014,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4ad87ba-fb93-4118-b671-a023bd200fe3' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b4ad87ba-fb93-4118-b671-a023bd200fe3',
            'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
            100015,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert entity field value with ID 320c7162-90a4-4db7-a5c4-e94f76fd0928 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('320c7162-90a4-4db7-a5c4-e94f76fd0928', '6B1FF62D-F04E-42B4-85F9-02CE12E23381', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID abe25d79-8370-4f9d-ab62-be616d5605bd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('abe25d79-8370-4f9d-ab62-be616d5605bd', '6B1FF62D-F04E-42B4-85F9-02CE12E23381', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 6B1FF62D-F04E-42B4-85F9-02CE12E23381 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6B1FF62D-F04E-42B4-85F9-02CE12E23381'

/* SQL text to insert entity field value with ID b4c0bb3e-3eee-40ec-b9ff-8214bd1517d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4c0bb3e-3eee-40ec-b9ff-8214bd1517d8', 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F', 1, 'Bidirectional', 'Bidirectional', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5f890b85-1e27-447f-8330-3e0224cb848e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f890b85-1e27-447f-8330-3e0224cb848e', 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F', 2, 'Pull', 'Pull', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 937dcb43-8274-401e-bfb5-1dec6e5c9384 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('937dcb43-8274-401e-bfb5-1dec6e5c9384', 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F', 3, 'Push', 'Push', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID CD5A1D3C-F54B-41FF-9879-B3BCD73A231F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CD5A1D3C-F54B-41FF-9879-B3BCD73A231F'

/* SQL text to insert entity field value with ID 9e464d63-8bd0-4804-a8c2-deb86df1298e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9e464d63-8bd0-4804-a8c2-deb86df1298e', '350740C9-5552-45B2-A222-889BB91F6E3B', 1, 'DestWins', 'DestWins', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a3d7f98a-4a06-4570-9ef3-693fc15c3758 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a3d7f98a-4a06-4570-9ef3-693fc15c3758', '350740C9-5552-45B2-A222-889BB91F6E3B', 2, 'Manual', 'Manual', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5afef4fe-5d6e-4cfb-888d-3e7916644cc7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5afef4fe-5d6e-4cfb-888d-3e7916644cc7', '350740C9-5552-45B2-A222-889BB91F6E3B', 3, 'MostRecent', 'MostRecent', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c28e4432-57c1-4313-abad-0af695020e66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c28e4432-57c1-4313-abad-0af695020e66', '350740C9-5552-45B2-A222-889BB91F6E3B', 4, 'SourceWins', 'SourceWins', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 350740C9-5552-45B2-A222-889BB91F6E3B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='350740C9-5552-45B2-A222-889BB91F6E3B'

/* SQL text to insert entity field value with ID eba565ff-3c0a-4ed1-be06-06e078b6d3a8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eba565ff-3c0a-4ed1-be06-06e078b6d3a8', '81628273-7743-4DCA-A036-82B8595BB2AA', 1, 'DoNothing', 'DoNothing', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID f6f283f4-c163-40fc-aad4-af89d6a1fd14 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6f283f4-c163-40fc-aad4-af89d6a1fd14', '81628273-7743-4DCA-A036-82B8595BB2AA', 2, 'HardDelete', 'HardDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5b5f2304-020c-4c1f-9a33-27ae0c8002c5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5b5f2304-020c-4c1f-9a33-27ae0c8002c5', '81628273-7743-4DCA-A036-82B8595BB2AA', 3, 'SoftDelete', 'SoftDelete', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 81628273-7743-4DCA-A036-82B8595BB2AA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='81628273-7743-4DCA-A036-82B8595BB2AA'

/* SQL text to insert entity field value with ID ce5d4081-e3a9-4089-a04d-85f56b7868ae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ce5d4081-e3a9-4089-a04d-85f56b7868ae', 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID c9464edc-e223-4d85-8abf-0961eee51f2f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c9464edc-e223-4d85-8abf-0961eee51f2f', 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID E6E720DD-FEFD-4C82-B694-DEA4FC4D308A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E6E720DD-FEFD-4C82-B694-DEA4FC4D308A'

/* SQL text to insert entity field value with ID 8556f387-55b5-4ebb-8eca-ab1a1bf3dc3c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8556f387-55b5-4ebb-8eca-ab1a1bf3dc3c', 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA', 1, 'Both', 'Both', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 57753405-bca2-4f95-a60b-0a0d3e07f1e2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('57753405-bca2-4f95-a60b-0a0d3e07f1e2', 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA', 2, 'DestToSource', 'DestToSource', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6db2ced8-e10e-4784-ba7a-a41f158d2603 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6db2ced8-e10e-4784-ba7a-a41f158d2603', 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA', 3, 'SourceToDest', 'SourceToDest', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID E6D1F636-074A-44C4-9908-2F05AC0D8CEA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E6D1F636-074A-44C4-9908-2F05AC0D8CEA'

/* SQL text to insert entity field value with ID 487705c4-5661-4688-90bb-a03ee062a41d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('487705c4-5661-4688-90bb-a03ee062a41d', '2F978BF2-EEA0-46E7-86C7-62D09DA17B96', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 76558316-d6b6-4b1f-81b5-ef394c7b2144 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('76558316-d6b6-4b1f-81b5-ef394c7b2144', '2F978BF2-EEA0-46E7-86C7-62D09DA17B96', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 2F978BF2-EEA0-46E7-86C7-62D09DA17B96 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2F978BF2-EEA0-46E7-86C7-62D09DA17B96'

/* SQL text to insert entity field value with ID f59b99bc-2041-487d-8fe8-936966e12f23 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f59b99bc-2041-487d-8fe8-936966e12f23', 'B060FD28-BE54-42CF-BEF5-FE27359E5A72', 1, 'Pull', 'Pull', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 8ca4dcae-2311-4476-9e48-971e3a8984d9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8ca4dcae-2311-4476-9e48-971e3a8984d9', 'B060FD28-BE54-42CF-BEF5-FE27359E5A72', 2, 'Push', 'Push', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID B060FD28-BE54-42CF-BEF5-FE27359E5A72 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B060FD28-BE54-42CF-BEF5-FE27359E5A72'

/* SQL text to insert entity field value with ID 8b340060-d9a1-4e47-811c-f5b16c34bcc0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8b340060-d9a1-4e47-811c-f5b16c34bcc0', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 1, 'ChangeToken', 'ChangeToken', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4eeb592d-dce6-4451-9078-e2a25710fd97 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4eeb592d-dce6-4451-9078-e2a25710fd97', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 2, 'Cursor', 'Cursor', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5a8d78d2-0cc9-4baf-8532-5e819263647c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a8d78d2-0cc9-4baf-8532-5e819263647c', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 3, 'Timestamp', 'Timestamp', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ab50f84b-a598-4642-967f-d0debf74a80e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ab50f84b-a598-4642-967f-d0debf74a80e', '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A', 4, 'Version', 'Version', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'


/* Update EntityRelationship join field from 'ParentRunID' to 'LastRunID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'LastRunID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '5841FDE4-13D8-4C69-B8FF-A3D2539EB0DE';



/* Update EntityRelationship join field from 'AgentID' to 'SubAgentID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SubAgentID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '2DC5B6C7-DD43-4AA6-B29A-2742BF1D9D53';

/* Update EntityRelationship join field from 'SubAgentID' to 'AgentID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'AgentID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '5B6A8AA1-533A-494B-8C5E-12885A76A482';



/* Update EntityRelationship join field from 'SubAgentID' to 'AgentID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'AgentID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '02CF7124-B3E1-4737-A16A-82A29F3D8E97';



/* Update EntityRelationship join field from 'AgentID' to 'SubAgentID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SubAgentID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '49B7BC13-A831-4070-ABA0-B0FF5F2C1C7B';

/* Update EntityRelationship join field from 'DestinationStepID' to 'OriginStepID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'OriginStepID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '6DD99AFE-EF4D-44E4-A70E-6ACC547F0E8D';

/* Update EntityRelationship join field from 'OriginStepID' to 'DestinationStepID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DestinationStepID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '8F64A0FD-9E48-4C86-9F34-3A2904D05F8F';



/* Create Entity Relationship: MJ: Company Integration Entity Maps -> MJ: Company Integration Sync Watermarks (One To Many via EntityMapID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '852d0c9b-96a5-4ed0-b065-54c0b941c146'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('852d0c9b-96a5-4ed0-b065-54c0b941c146', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'EntityMapID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Company Integration Entity Maps -> MJ: Company Integration Field Maps (One To Many via EntityMapID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a37bc78c-21ab-4906-85df-ad04dbfa8227'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a37bc78c-21ab-4906-85df-ad04dbfa8227', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'EntityMapID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Update EntityRelationship join field from 'DefaultPromptForContextSummarizationID' to 'DefaultPromptForContextCompressionID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DefaultPromptForContextCompressionID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'E798F6CA-7EEE-4C3D-8A3B-7E9855EBE05A';

/* Update EntityRelationship join field from 'DefaultPromptForContextCompressionID' to 'DefaultPromptForContextSummarizationID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DefaultPromptForContextSummarizationID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '4BC01135-879A-4E45-A8C9-77895B135F68';



/* Update EntityRelationship join field from 'PromptID' to 'ChildPromptID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'ChildPromptID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';

/* Update EntityRelationship join field from 'PromptID' to 'JudgeID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'JudgeID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';



/* Update EntityRelationship join field from 'CompanyName' to 'CompanyID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'CompanyID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '0780F0B9-38A7-4A74-919E-5E707DC96687';



/* Update EntityRelationship join field from 'IntegrationName' to 'IntegrationID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'IntegrationID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '99448653-DBD1-4722-AE01-79A97A3AE574';



/* Create Entity Relationship: MJ: Company Integrations -> MJ: Company Integration Entity Maps (One To Many via CompanyIntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '73e11f7d-28d5-4d9a-8e28-9b73f974b47c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('73e11f7d-28d5-4d9a-8e28-9b73f974b47c', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'CompanyIntegrationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Update EntityRelationship join field from 'EntityID' to 'OutputEntityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'OutputEntityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '522E7A02-9B04-44EB-9A20-5334BF8B795F';



/* Update EntityRelationship join field from 'EntityID' to 'RelatedEntityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'RelatedEntityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '86ED5122-2FEA-48A1-8B75-B58519890413';



/* Update EntityRelationship join field from 'EntityID' to 'CategoryEntityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'CategoryEntityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '53806B32-1416-44E4-BD9E-FBABD9F24806';



/* Create Entity Relationship: MJ: Entities -> MJ: Company Integration Entity Maps (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f4c0b17e-ca91-429e-8df1-7ee08e893fa8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f4c0b17e-ca91-429e-8df1-7ee08e893fa8', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Update EntityRelationship join field from 'EntityID' to 'RelatedEntityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'RelatedEntityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '0A19F94D-6030-42B2-8E65-DDFBC95248FA';



/* Update EntityRelationship join field from 'SourceEntityID' to 'TargetEntityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'TargetEntityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '508F99BA-9B64-42C4-81D6-E91FF88E9767';

/* Update EntityRelationship join field from 'TargetEntityID' to 'SourceEntityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SourceEntityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '48C5803E-B13B-4D36-A64C-C76A8FC4DBA2';



/* Update EntityRelationship join field from 'ResponseByUserID' to 'RequestForUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'RequestForUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'CAE3B137-2933-482D-8E76-2B2AE64AE67E';



/* Update EntityRelationship join field from 'RequestForUserID' to 'ResponseByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'ResponseByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '0910E31D-CEE4-4D08-80B0-51F13B0DCE85';

/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'UserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '4DF971E6-FBF5-4664-9809-F2CD913E11AF';

/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SharedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '274EC64B-6605-412C-97E2-24D54B1F7A60';

/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'UserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'A6996B42-5F84-4726-A513-F6E757223F6C';



/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SharedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '09E7FB7E-EFFF-4EFD-9DCC-E332F57B1AA5';



/* Update EntityRelationship join field from 'StartedByUserID' to 'ApprovedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'ApprovedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'C2E9FE80-1C30-4D71-8755-D705D22A214E';



/* Update EntityRelationship join field from 'OwnerUserID' to 'NotifyUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'NotifyUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'FEA0A41E-14A4-4C1D-929B-BADE744A889C';

/* Update EntityRelationship join field from 'NotifyUserID' to 'OwnerUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'OwnerUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '29B73CCF-1517-4BDA-9BB5-EE6D48E1609A';



/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'UserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'C5E028C8-5366-45D5-AA41-A8FBD4141B98';

/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SharedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'DEE326A5-8469-42FC-ACF5-3E8B95154452';



/* Update EntityRelationship join field from 'SharedByUserID' to 'UserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'UserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'D44E5696-7C12-4782-A719-FF3BCD827F3D';

/* Update EntityRelationship join field from 'UserID' to 'SharedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SharedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '6C80EC70-CE3D-4A90-9838-8BAC5DBED65C';



/* Update EntityRelationship join field from 'UserID' to 'CreatedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'CreatedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '7ACCC9C0-B542-4647-8CFA-606EE9815D59';

/* Update EntityRelationship join field from 'CreatedByUserID' to 'UserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'UserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'ED3B0A4C-5EEA-4A6E-9933-0A2701D7241D';



/* Update EntityRelationship join field from 'InitiatedByUserID' to 'ApprovedByUserID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'ApprovedByUserID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'DB049342-E5BB-4BD9-8113-67C0A1FF2530';



/* Update EntityRelationship join field from 'DisplayUserViewGUID' to 'DisplayUserViewID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DisplayUserViewID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'F55F183D-0522-40C8-8D45-C6F3943B24C7';



/* Update EntityRelationship join field from 'WorkflowName' to 'WorkflowID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'WorkflowID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '65EB838F-F461-4196-AD9E-BDFAA777B0C3';



/* Update EntityRelationship join field from 'WorkflowEngineName' to 'WorkflowEngineID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'WorkflowEngineID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '668382FA-E2C1-4D2C-93D3-9806E35AC02A';

/* Update EntityRelationship join field from 'ReadRLSFilterID' to 'CreateRLSFilterID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'CreateRLSFilterID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '1FA13340-C7BB-4F59-A2EF-552D6B05B344';



/* Update EntityRelationship join field from 'ReadRLSFilterID' to 'UpdateRLSFilterID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'UpdateRLSFilterID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '1FA13340-C7BB-4F59-A2EF-552D6B05B344';

/* Update EntityRelationship join field from 'ReadRLSFilterID' to 'DeleteRLSFilterID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DeleteRLSFilterID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '1FA13340-C7BB-4F59-A2EF-552D6B05B344';

/* Update EntityRelationship join field from 'AuthorizationName' to 'AuthorizationID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'AuthorizationID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '55E0E8BE-F9BA-4E7B-A7DD-DB84F4EA1250';



/* Update EntityRelationship join field from 'AuthorizationName' to 'AuthorizationID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'AuthorizationID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'AD19291C-4C43-488D-B19B-E07B6F76C94D';

/* Update EntityRelationship join field from 'AuditLogTypeName' to 'AuditLogTypeID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'AuditLogTypeID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '12BCF651-04DF-49C7-917D-BF978E0BF8E1';



/* Update EntityRelationship join field from 'ModelID' to 'OriginalModelID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'OriginalModelID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '65F2C6F7-CAEE-4F10-A6A1-353899FECB9F';



/* Update EntityRelationship join field from 'WorkSpaceID' to 'WorkspaceID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'WorkspaceID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'BB812A13-5542-4890-B2C9-1D5D8C5AE012';

/* Update EntityRelationship join field from 'DatasetName' to 'DatasetID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DatasetID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '50B47AB8-5508-47B2-A87C-EC2BE40A9F75';



/* Update EntityRelationship join field from 'ID' to 'VectorDatabaseID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'VectorDatabaseID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '40AC053A-48B1-466B-AB38-3854F4FF6A72';



/* Update EntityRelationship join field from 'EmailTemplateID' to 'SMSTemplateID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'SMSTemplateID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '2712A384-38A8-455F-B4BB-C6DC10274214';



/* Update EntityRelationship join field from 'SMSTemplateID' to 'EmailTemplateID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'EmailTemplateID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '1A061C05-49CD-4328-8375-6809189BC57B';



/* Update EntityRelationship join field from 'DependencyComponentID' to 'ComponentID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'ComponentID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '77CA2F71-8D7D-4048-83F1-5F704925B009';

/* Update EntityRelationship join field from 'ComponentID' to 'DependencyComponentID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DependencyComponentID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '90CE0E3A-47C9-41B4-ABB0-B4CC24DB5A8A';



/* Update EntityRelationship join field from 'PreRestoreLabelID' to 'VersionLabelID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'VersionLabelID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'B1250534-179A-45F6-AF26-4C25E5F5AA05';

/* Update EntityRelationship join field from 'VersionLabelID' to 'PreRestoreLabelID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'PreRestoreLabelID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'CCD2C638-5D37-4A7E-9E3F-5D0690F022AF';



/* Update EntityRelationship join field from 'OpenAppID' to 'DependsOnAppID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DependsOnAppID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '5AC78474-4F4D-479F-8DB0-46CB0CD78442';

/* Update EntityRelationship join field from 'DependsOnAppID' to 'OpenAppID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'OpenAppID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '6157799D-72AF-43C6-8512-3BC8C9663BA5';



/* Update EntityRelationship join field from 'ParentID' to 'RerunFromPromptRunID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'RerunFromPromptRunID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'D54F8E97-FD0A-47D0-A0C6-D65B281622C6';



/* Update EntityRelationship join field from 'DefaultInputModalityID' to 'DefaultOutputModalityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DefaultOutputModalityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'C58517CB-380F-45BD-8DD5-58798FD2D49B';

/* Update EntityRelationship join field from 'DefaultOutputModalityID' to 'DefaultInputModalityID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DefaultInputModalityID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'DD6D64BE-A698-4FE9-8A16-535076D45658';

/* Update EntityRelationship join field from 'DependsOnTaskID' to 'TaskID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'TaskID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = 'D356ECA0-D245-4088-8727-BFF97A3AB60F';

/* Update EntityRelationship join field from 'TaskID' to 'DependsOnTaskID' */
   UPDATE [${flyway:defaultSchema}].[EntityRelationship]
      SET [RelatedEntityJoinField] = 'DependsOnTaskID',
          [__mj_UpdatedAt] = GETUTCDATE()
      WHERE [ID] = '3B41F196-2565-4E06-8C4B-1595C33AF364';



/* Create Entity Relationship: MJ: Integration Source Types -> MJ: Company Integrations (One To Many via SourceTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b008fd00-904e-41ab-bd44-69465d99be79'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b008fd00-904e-41ab-bd44-69465d99be79', '57801845-6620-4CBD-993F-E4AA2D464A04', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'SourceTypeID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for CompanyIntegrationEntityMap */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table CompanyIntegrationEntityMap
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationEntityMap]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_CompanyIntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ([CompanyIntegrationID]);

-- Index for foreign key EntityID in table CompanyIntegrationEntityMap
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationEntityMap]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_EntityID ON [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID CA111FE4-61FE-49D0-9106-A75DE3035FB1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CA111FE4-61FE-49D0-9106-A75DE3035FB1', @RelatedEntityNameFieldMap='CompanyIntegration'

/* Index for Foreign Keys for CompanyIntegrationFieldMap */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationFieldMap
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationFieldMap_EntityMapID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationFieldMap]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationFieldMap_EntityMapID ON [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] ([EntityMapID]);

/* Base View SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Field Maps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationFieldMap
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap]
    @ID uniqueidentifier = NULL,
    @EntityMapID uniqueidentifier,
    @SourceFieldName nvarchar(500),
    @SourceFieldLabel nvarchar(500),
    @DestinationFieldName nvarchar(500),
    @DestinationFieldLabel nvarchar(500),
    @Direction nvarchar(50) = NULL,
    @TransformPipeline nvarchar(MAX),
    @IsKeyField bit = NULL,
    @IsRequired bit = NULL,
    @DefaultValue nvarchar(MAX),
    @Priority int = NULL,
    @Status nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
            (
                [ID],
                [EntityMapID],
                [SourceFieldName],
                [SourceFieldLabel],
                [DestinationFieldName],
                [DestinationFieldLabel],
                [Direction],
                [TransformPipeline],
                [IsKeyField],
                [IsRequired],
                [DefaultValue],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityMapID,
                @SourceFieldName,
                @SourceFieldLabel,
                @DestinationFieldName,
                @DestinationFieldLabel,
                ISNULL(@Direction, 'SourceToDest'),
                @TransformPipeline,
                ISNULL(@IsKeyField, 0),
                ISNULL(@IsRequired, 0),
                @DefaultValue,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
            (
                [EntityMapID],
                [SourceFieldName],
                [SourceFieldLabel],
                [DestinationFieldName],
                [DestinationFieldLabel],
                [Direction],
                [TransformPipeline],
                [IsKeyField],
                [IsRequired],
                [DefaultValue],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityMapID,
                @SourceFieldName,
                @SourceFieldLabel,
                @DestinationFieldName,
                @DestinationFieldLabel,
                ISNULL(@Direction, 'SourceToDest'),
                @TransformPipeline,
                ISNULL(@IsKeyField, 0),
                ISNULL(@IsRequired, 0),
                @DefaultValue,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Company Integration Field Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap]
    @ID uniqueidentifier,
    @EntityMapID uniqueidentifier,
    @SourceFieldName nvarchar(500),
    @SourceFieldLabel nvarchar(500),
    @DestinationFieldName nvarchar(500),
    @DestinationFieldLabel nvarchar(500),
    @Direction nvarchar(50),
    @TransformPipeline nvarchar(MAX),
    @IsKeyField bit,
    @IsRequired bit,
    @DefaultValue nvarchar(MAX),
    @Priority int,
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
    SET
        [EntityMapID] = @EntityMapID,
        [SourceFieldName] = @SourceFieldName,
        [SourceFieldLabel] = @SourceFieldLabel,
        [DestinationFieldName] = @DestinationFieldName,
        [DestinationFieldLabel] = @DestinationFieldLabel,
        [Direction] = @Direction,
        [TransformPipeline] = @TransformPipeline,
        [IsKeyField] = @IsKeyField,
        [IsRequired] = @IsRequired,
        [DefaultValue] = @DefaultValue,
        [Priority] = @Priority,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationFieldMap table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationFieldMap]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationFieldMap];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationFieldMap
ON [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integration Field Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Company Integration Field Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 749758C4-A7B3-413A-A434-4844771C7F84 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='749758C4-A7B3-413A-A434-4844771C7F84', @RelatedEntityNameFieldMap='Entity'

/* Base View SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: vwCompanyIntegrationEntityMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Entity Maps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationEntityMap
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps]
AS
SELECT
    c.*,
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [c].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: Permissions for vwCompanyIntegrationEntityMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spCreateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @ExternalObjectName nvarchar(500),
    @ExternalObjectLabel nvarchar(500),
    @EntityID uniqueidentifier,
    @SyncDirection nvarchar(50) = NULL,
    @SyncEnabled bit = NULL,
    @MatchStrategy nvarchar(MAX),
    @ConflictResolution nvarchar(50) = NULL,
    @Priority int = NULL,
    @DeleteBehavior nvarchar(50) = NULL,
    @Status nvarchar(50) = NULL,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
            (
                [ID],
                [CompanyIntegrationID],
                [ExternalObjectName],
                [ExternalObjectLabel],
                [EntityID],
                [SyncDirection],
                [SyncEnabled],
                [MatchStrategy],
                [ConflictResolution],
                [Priority],
                [DeleteBehavior],
                [Status],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @ExternalObjectName,
                @ExternalObjectLabel,
                @EntityID,
                ISNULL(@SyncDirection, 'Pull'),
                ISNULL(@SyncEnabled, 1),
                @MatchStrategy,
                ISNULL(@ConflictResolution, 'SourceWins'),
                ISNULL(@Priority, 0),
                ISNULL(@DeleteBehavior, 'SoftDelete'),
                ISNULL(@Status, 'Active'),
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
            (
                [CompanyIntegrationID],
                [ExternalObjectName],
                [ExternalObjectLabel],
                [EntityID],
                [SyncDirection],
                [SyncEnabled],
                [MatchStrategy],
                [ConflictResolution],
                [Priority],
                [DeleteBehavior],
                [Status],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @ExternalObjectName,
                @ExternalObjectLabel,
                @EntityID,
                ISNULL(@SyncDirection, 'Pull'),
                ISNULL(@SyncEnabled, 1),
                @MatchStrategy,
                ISNULL(@ConflictResolution, 'SourceWins'),
                ISNULL(@Priority, 0),
                ISNULL(@DeleteBehavior, 'SoftDelete'),
                ISNULL(@Status, 'Active'),
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Company Integration Entity Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spUpdateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @ExternalObjectName nvarchar(500),
    @ExternalObjectLabel nvarchar(500),
    @EntityID uniqueidentifier,
    @SyncDirection nvarchar(50),
    @SyncEnabled bit,
    @MatchStrategy nvarchar(MAX),
    @ConflictResolution nvarchar(50),
    @Priority int,
    @DeleteBehavior nvarchar(50),
    @Status nvarchar(50),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
    SET
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalObjectName] = @ExternalObjectName,
        [ExternalObjectLabel] = @ExternalObjectLabel,
        [EntityID] = @EntityID,
        [SyncDirection] = @SyncDirection,
        [SyncEnabled] = @SyncEnabled,
        [MatchStrategy] = @MatchStrategy,
        [ConflictResolution] = @ConflictResolution,
        [Priority] = @Priority,
        [DeleteBehavior] = @DeleteBehavior,
        [Status] = @Status,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationEntityMap table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationEntityMap]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationEntityMap];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationEntityMap
ON [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integration Entity Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spDeleteCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Company Integration Entity Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap] TO [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationSyncWatermark */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationSyncWatermark
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationSyncWatermark_EntityMapID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationSyncWatermark_EntityMapID ON [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] ([EntityMapID]);

/* Index for Foreign Keys for CompanyIntegration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID ON [${flyway:defaultSchema}].[CompanyIntegration] ([CompanyID]);

-- Index for foreign key IntegrationID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID ON [${flyway:defaultSchema}].[CompanyIntegration] ([IntegrationID]);

-- Index for foreign key SourceTypeID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID ON [${flyway:defaultSchema}].[CompanyIntegration] ([SourceTypeID]);

/* Base View Permissions SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: Permissions for vwCompanyIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrations] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit = NULL,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255),
    @SourceTypeID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [ID],
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name],
                [SourceTypeID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name,
                @SourceTypeID,
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name],
                [SourceTypeID],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name,
                @SourceTypeID,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255),
    @SourceTypeID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        [CompanyID] = @CompanyID,
        [IntegrationID] = @IntegrationID,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1,
        [Name] = @Name,
        [SourceTypeID] = @SourceTypeID,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegration
ON [${flyway:defaultSchema}].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for MJ: Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* Base View SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Sync Watermarks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationSyncWatermark
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark]
    @ID uniqueidentifier = NULL,
    @EntityMapID uniqueidentifier,
    @Direction nvarchar(50) = NULL,
    @WatermarkType nvarchar(50) = NULL,
    @WatermarkValue nvarchar(MAX),
    @LastSyncAt datetimeoffset,
    @RecordsSynced int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
            (
                [ID],
                [EntityMapID],
                [Direction],
                [WatermarkType],
                [WatermarkValue],
                [LastSyncAt],
                [RecordsSynced]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityMapID,
                ISNULL(@Direction, 'Pull'),
                ISNULL(@WatermarkType, 'Timestamp'),
                @WatermarkValue,
                @LastSyncAt,
                ISNULL(@RecordsSynced, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
            (
                [EntityMapID],
                [Direction],
                [WatermarkType],
                [WatermarkValue],
                [LastSyncAt],
                [RecordsSynced]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityMapID,
                ISNULL(@Direction, 'Pull'),
                ISNULL(@WatermarkType, 'Timestamp'),
                @WatermarkValue,
                @LastSyncAt,
                ISNULL(@RecordsSynced, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Company Integration Sync Watermarks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark]
    @ID uniqueidentifier,
    @EntityMapID uniqueidentifier,
    @Direction nvarchar(50),
    @WatermarkType nvarchar(50),
    @WatermarkValue nvarchar(MAX),
    @LastSyncAt datetimeoffset,
    @RecordsSynced int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
    SET
        [EntityMapID] = @EntityMapID,
        [Direction] = @Direction,
        [WatermarkType] = @WatermarkType,
        [WatermarkValue] = @WatermarkValue,
        [LastSyncAt] = @LastSyncAt,
        [RecordsSynced] = @RecordsSynced
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationSyncWatermark table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationSyncWatermark]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationSyncWatermark];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationSyncWatermark
ON [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Company Integration Sync Watermarks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark] TO [cdp_Integration]



/* Index for Foreign Keys for IntegrationSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Source Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationSourceTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationSourceTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationSourceTypes]
AS
SELECT
    i.*
FROM
    [${flyway:defaultSchema}].[IntegrationSourceType] AS i
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Permissions for vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spCreateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationSourceType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(500),
    @IconClass nvarchar(200),
    @Status nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @IconClass,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType]
            (
                [Name],
                [Description],
                [DriverClass],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @IconClass,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integration Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spUpdateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(500),
    @IconClass nvarchar(200),
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationSourceType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationSourceTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationSourceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationSourceType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationSourceType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationSourceType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationSourceType
ON [${flyway:defaultSchema}].[IntegrationSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integration Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spDeleteIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationSourceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationSourceType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationSourceType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Integration Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationSourceType] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a0e85e8-8610-4949-981f-19b0c6df658f' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'CompanyIntegration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a0e85e8-8610-4949-981f-19b0c6df658f',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100031,
            'CompanyIntegration',
            'Company Integration',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63f97d2f-bd4d-4a08-b83f-cd6891788b76' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '63f97d2f-bd4d-4a08-b83f-cd6891788b76',
            '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
            100032,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '185817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4886F7D9-06EF-4979-9346-B689AFCF5CB9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BB6B2FC1-8530-4229-A524-85437510B1B0'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '93E74709-A312-49E1-8C80-EA2909A6B5BF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4886F7D9-06EF-4979-9346-B689AFCF5CB9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4D8315D9-AED2-4E67-8743-6233F9F1C312'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6B1FF62D-F04E-42B4-85F9-02CE12E23381'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '028D4EE7-1A23-4C6A-9E42-1527BA110C70'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E29E9ABA-528D-4A3D-AEB7-B9625AB4362D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8A0E85E8-8610-4949-981F-19B0C6DF658F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '63F97D2F-BD4D-4A08-B83F-CD6891788B76'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '77802508-D414-4972-932D-C84439DE5DB4'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8A0E85E8-8610-4949-981F-19B0C6DF658F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '63F97D2F-BD4D-4A08-B83F-CD6891788B76'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95EB5E41-3D51-4AF7-93B5-FD0466702686' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.EntityMapID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Map',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '846D8888-AF62-4D4B-AE06-A52C284377A7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.Direction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.WatermarkType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.WatermarkValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Progress',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.LastSyncAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Progress',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '028D4EE7-1A23-4C6A-9E42-1527BA110C70' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.RecordsSynced 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Progress',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D349D6A-E5E1-4037-B1BE-104E1BD8009E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E87F3F8F-FB10-46C6-B42A-D41C0AF3AAE3' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-sync-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-sync-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('aef59a99-d889-4e3d-88e1-c0678b8646bd', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'FieldCategoryInfo', '{"Sync Configuration":{"icon":"fa fa-sliders-h","description":"Settings that define the scope, direction, and methodology of the synchronization"},"Sync Progress":{"icon":"fa fa-history","description":"Real-time tracking of sync values, timestamps, and record counts"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('62d50040-224f-4252-96c7-3773483bb8c4', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'FieldCategoryIcons', '{"Sync Configuration":"fa fa-sliders-h","Sync Progress":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0'
      

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DFB579F-2F81-4B1F-A357-09C7EA664AD0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.EntityMapID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Map',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BEFB401-01DD-454A-BB34-D300E78AB97D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.SourceFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Mapping Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.SourceFieldLabel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Mapping Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.DestinationFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Mapping Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4886F7D9-06EF-4979-9346-B689AFCF5CB9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.DestinationFieldLabel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Mapping Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D8315D9-AED2-4E67-8743-6233F9F1C312' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.Direction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Mapping Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.TransformPipeline 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Logic and Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9BE66DC5-E20A-4FEE-ACAD-68BD018F0B86' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.IsKeyField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Logic and Validation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Key Field',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB6B2FC1-8530-4229-A524-85437510B1B0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.IsRequired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Logic and Validation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Required',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '923B68D4-6B26-4B39-8324-F115221E6733' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Logic and Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F47D2DA-B34D-436F-8177-5E1BA9435288' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Logic and Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93E74709-A312-49E1-8C80-EA2909A6B5BF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Logic and Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93F28803-D909-4BCB-9742-08455F48AB78' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B4AD87BA-FB93-4118-B671-A023BD200FE3' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-exchange-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-exchange-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('83429c79-083b-4902-9e13-bbf5ac0c2692', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'FieldCategoryInfo', '{"Mapping Definition":{"icon":"fa fa-columns","description":"Fields and directions defining how data moves between the external source and destination"},"Sync Logic and Validation":{"icon":"fa fa-vial","description":"Rules for data transformation, matching, prioritization, and field-level validation"},"System Metadata":{"icon":"fa fa-cog","description":"Internal identifiers and system-managed audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f3513d84-b5fe-4e79-90dc-1c6a84470d18', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'FieldCategoryIcons', '{"Mapping Definition":"fa fa-columns","Sync Logic and Validation":"fa fa-vial","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE'
      

/* Set categories for 25 fields */

-- UPDATE Entity Field Category Info MJ: Company Integrations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '115817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '125817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '135817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsExternalSystemReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.SourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Linking & Core Info',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F647023E-D909-4ECB-B59D-EE477C274827' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.AccessToken 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '155817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.RefreshToken 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '165817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.TokenExpirationDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '175817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.APIKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '185817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ClientID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ClientSecret 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ExternalSystemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CustomAttribute1 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.DriverClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '385817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.DriverImportPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '395817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'External System Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '987EAF20-227F-4043-BD87-06C9E01598F4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunStartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunEndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.CompanyIntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA111FE4-61FE-49D0-9106-A75DE3035FB1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.CompanyIntegration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A0E85E8-8610-4949-981F-19B0C6DF658F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '749758C4-A7B3-413A-A434-4844771C7F84' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63F97D2F-BD4D-4A08-B83F-CD6891788B76' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.ExternalObjectName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41D1DC11-6093-4473-ABF6-1B578B9A26BD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.ExternalObjectLabel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77802508-D414-4972-932D-C84439DE5DB4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.SyncDirection 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.SyncEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E29E9ABA-528D-4A3D-AEB7-B9625AB4362D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1EB6C90-5CAF-4A45-88B8-2CA52A3D7D83' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.DeleteBehavior 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81628273-7743-4DCA-A036-82B8595BB2AA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.MatchStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Engine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1EF5FAAF-4128-459F-978F-BC14223FD131' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.ConflictResolution 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Engine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '350740C9-5552-45B2-A222-889BB91F6E3B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Engine Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '3428AA14-3FCD-463A-8B90-29E08070C300' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C91EF1AE-5036-440D-8492-121518A3D36E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A83F1A0-06F9-43D2-9151-53A5178EECE2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '88CA33DB-38D1-406A-BB78-5809AC6F86EB' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-exchange-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-exchange-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '41579CAC-5DDC-48B4-8703-31292BE0A414'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('796b0a50-e0a2-47e2-9c53-9a79a23453df', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FieldCategoryInfo', '{"Object Mapping":{"icon":"fa fa-link","description":"Defines the relationship between external system objects and internal MemberJunction entities."},"Sync Control":{"icon":"fa fa-sync","description":"Operational settings that control how and when data synchronization occurs."},"Engine Configuration":{"icon":"fa fa-cogs","description":"Advanced logic for record matching, conflict handling, and custom mapping behavior."},"System Metadata":{"icon":"fa fa-database","description":"Internal record identifiers and audit tracking information."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b4adec7a-a565-40aa-bc6e-062eeb6bc4d4', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FieldCategoryIcons', '{"Object Mapping":"fa fa-link","Sync Control":"fa fa-sync","Engine Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414'
      

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Integration Source Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76CF6A33-6556-46CA-AA57-4050AA9AD647' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E7691951-EEF3-47EE-B375-0421DE28AE7A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B1FF62D-F04E-42B4-85F9-02CE12E23381' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.IconClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '254C0B4E-CC02-46BC-92E3-8A46463198CB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F2882887-8D20-41CB-A1BE-91E3E270D3E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D083AA3-60CB-41DC-82D0-26DD3E9C5ADE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Source Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '10DDEDFE-56D3-4938-BFE4-0FD79DA1D6DA' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-plug */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-plug', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '57801845-6620-4CBD-993F-E4AA2D464A04'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('efccb55c-768d-4daf-8aba-65b635e4718a', '57801845-6620-4CBD-993F-E4AA2D464A04', 'FieldCategoryInfo', '{"Source Type Definition":{"icon":"fa fa-info-circle","description":"Basic identification and availability status for this integration source type"},"Technical Configuration":{"icon":"fa fa-cogs","description":"Technical implementation details including the driver class and UI representation"},"System Metadata":{"icon":"fa fa-database","description":"System-generated identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('45f1e5cc-d371-4d52-9576-2c18810ac742', '57801845-6620-4CBD-993F-E4AA2D464A04', 'FieldCategoryIcons', '{"Source Type Definition":"fa fa-info-circle","Technical Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '57801845-6620-4CBD-993F-E4AA2D464A04'
      

/* Remove stale One-To-Many EntityRelationships */

/* Remove stale EntityRelationship: undefined -> undefined (FK field 'CompanyName' no longer exists) */
   DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5C8442AB-9E0E-40BE-A70B-4FA0FE279992';

/* Remove stale EntityRelationship: undefined -> undefined (FK field 'ArtifactID' no longer exists) */
   DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '947E8026-7845-4E01-BBD4-F2ED84A47E09';







































































--- CODE GEN RUN TO FIX ISSUES RE ORDERING

/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: AI Agent Runs (One To Many via LastRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '77bfb3b9-ff99-4af6-92fe-5e979365052d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('77bfb3b9-ff99-4af6-92fe-5e979365052d', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'LastRunID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Prompts -> MJ: AI Prompt Runs (One To Many via ChildPromptID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4014c078-e011-4711-9a96-101a80d62ed4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4014c078-e011-4711-9a96-101a80d62ed4', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ChildPromptID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Prompts -> MJ: AI Prompt Runs (One To Many via JudgeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '818abb60-291e-4760-8a86-8da541300728'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('818abb60-291e-4760-8a86-8da541300728', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'JudgeID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Entity AI Actions (One To Many via OutputEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bac649b1-bbde-42b6-b8ac-64ab30e49ab3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bac649b1-bbde-42b6-b8ac-64ab30e49ab3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '00248F34-2837-EF11-86D4-6045BDEE16E6', 'OutputEntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Relationships (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '76e32992-eb0e-4a64-a0b5-6355b746c628'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('76e32992-eb0e-4a64-a0b5-6355b746c628', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E2238F34-2837-EF11-86D4-6045BDEE16E6', 'RelatedEntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Resource Types (One To Many via CategoryEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a97c9ca4-5b00-4526-9680-f2336b43e07f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a97c9ca4-5b00-4526-9680-f2336b43e07f', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'CategoryEntityID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Fields (One To Many via RelatedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4d1a0628-a697-4463-95aa-69b5c5daaf7a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4d1a0628-a697-4463-95aa-69b5c5daaf7a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'RelatedEntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Duplicate Runs (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e3d3e66f-4358-45e4-b1c4-34df4282d6ca'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e3d3e66f-4358-45e4-b1c4-34df4282d6ca', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '30248F34-2837-EF11-86D4-6045BDEE16E6', 'ApprovedByUserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Record Merge Logs (One To Many via ApprovedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd58e8135-9e85-48f8-927d-e34cae087e55'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d58e8135-9e85-48f8-927d-e34cae087e55', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '17248F34-2837-EF11-86D4-6045BDEE16E6', 'ApprovedByUserID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Row Level Security Filters -> MJ: Entity Permissions (One To Many via ReadRLSFilterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '186a5e2e-6d78-41ba-9184-c3ab9772d926'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('186a5e2e-6d78-41ba-9184-c3ab9772d926', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'ReadRLSFilterID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Row Level Security Filters -> MJ: Entity Permissions (One To Many via CreateRLSFilterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7ed2faec-6136-449a-a6e5-aae4b049785d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7ed2faec-6136-449a-a6e5-aae4b049785d', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'CreateRLSFilterID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Row Level Security Filters -> MJ: Entity Permissions (One To Many via DeleteRLSFilterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd69ece92-a003-4731-b3e7-d6fe6760466e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d69ece92-a003-4731-b3e7-d6fe6760466e', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'DeleteRLSFilterID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Models -> MJ: AI Prompt Runs (One To Many via OriginalModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '98a4a8dd-cc85-4425-aef7-bbd762b5b0f9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('98a4a8dd-cc85-4425-aef7-bbd762b5b0f9', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'OriginalModelID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Prompt Runs -> MJ: AI Prompt Runs (One To Many via RerunFromPromptRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '98e22ea6-9c8e-43b2-b087-d9b6a5e3f1f8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('98e22ea6-9c8e-43b2-b087-d9b6a5e3f1f8', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'RerunFromPromptRunID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    

