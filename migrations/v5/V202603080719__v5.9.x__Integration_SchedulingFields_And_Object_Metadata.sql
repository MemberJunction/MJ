-- =============================================================================
-- Migration: Add scheduling and locking fields to Company Integrations
-- Version:   5.9.x
-- Purpose:   Enable per-integration sync scheduling with granular control,
--            plus distributed locking to prevent double-execution
-- =============================================================================

-- Add scheduling fields to Company Integrations
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration ADD
    ScheduleEnabled BIT NOT NULL DEFAULT 0,
    ScheduleType NVARCHAR(20) NOT NULL DEFAULT 'Manual',
    ScheduleIntervalMinutes INT NULL,
    CronExpression NVARCHAR(200) NULL,
    NextScheduledRunAt DATETIMEOFFSET NULL,
    LastScheduledRunAt DATETIMEOFFSET NULL;
GO

-- Add constraint for ScheduleType values
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD CONSTRAINT CK_CompanyIntegration_ScheduleType
    CHECK (ScheduleType IN ('Manual', 'Interval', 'Cron'));

-- Add distributed locking fields to prevent concurrent execution
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration ADD
    IsLocked BIT NOT NULL DEFAULT 0,
    LockedAt DATETIMEOFFSET NULL,
    LockedByInstance NVARCHAR(200) NULL,
    LockExpiresAt DATETIMEOFFSET NULL;
GO

-- we have a custom base view for vwCompanyIntegrations, must refresh it so rest of codegen picks up the changes
EXEC sp_refreshview '__mj.vwCompanyIntegrations'
GO

-- Add extended properties for documentation
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether automatic sync scheduling is enabled for this integration', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'ScheduleEnabled';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Type of schedule: Manual (no auto-sync), Interval (every N minutes), Cron (cron expression)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'ScheduleType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Interval in minutes for Interval schedule type', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'ScheduleIntervalMinutes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cron expression for Cron schedule type (e.g., "0 */6 * * *" for every 6 hours)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'CronExpression';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the next scheduled sync should run. Updated after each run based on schedule config.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'NextScheduledRunAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the last scheduled sync was initiated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LastScheduledRunAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether a sync is currently locked/running for this integration', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'IsLocked';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lock was acquired', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LockedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Server instance identifier that holds the lock (hostname-pid)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LockedByInstance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lock should be considered stale and eligible for cleanup', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LockExpiresAt';



-- =============================================================================
-- Migration: Integration Object & Field Metadata Tables
-- Version:   5.9.x
-- Purpose:   Add metadata tables to describe external objects and fields
--            exposed by integrations, replacing hardcoded connector configs.
--            Mirrors EntityField column patterns for 1:1 type compatibility.
-- =============================================================================

-- =============================================================================
-- TABLE 1: IntegrationObject
-- Describes an external object/endpoint exposed by an integration
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.IntegrationObject (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    IntegrationID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    DisplayName NVARCHAR(255) NULL,
    Description NVARCHAR(MAX) NULL,
    Category NVARCHAR(100) NULL,
    APIPath NVARCHAR(500) NOT NULL,
    ResponseDataKey NVARCHAR(255) NULL,
    DefaultPageSize INT NOT NULL DEFAULT 100,
    SupportsPagination BIT NOT NULL DEFAULT 1,
    PaginationType NVARCHAR(20) NOT NULL DEFAULT 'PageNumber',
    SupportsIncrementalSync BIT NOT NULL DEFAULT 0,
    SupportsWrite BIT NOT NULL DEFAULT 0,
    DefaultQueryParams NVARCHAR(MAX) NULL,
    Configuration NVARCHAR(MAX) NULL,
    Sequence INT NOT NULL DEFAULT 0,
    Status NVARCHAR(25) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_IntegrationObject PRIMARY KEY (ID),
    CONSTRAINT FK_IntegrationObject_Integration FOREIGN KEY (IntegrationID)
        REFERENCES ${flyway:defaultSchema}.Integration(ID),
    CONSTRAINT UQ_IntegrationObject_Name UNIQUE (IntegrationID, Name),
    CONSTRAINT CK_IntegrationObject_PaginationType
        CHECK (PaginationType IN ('PageNumber', 'Offset', 'Cursor', 'None')),
    CONSTRAINT CK_IntegrationObject_Status
        CHECK (Status IN ('Active', 'Deprecated', 'Disabled'))
);

-- =============================================================================
-- TABLE 2: IntegrationObjectField
-- Describes a field on an integration object, mirroring EntityField patterns
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.IntegrationObjectField (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    IntegrationObjectID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    DisplayName NVARCHAR(255) NULL,
    Description NVARCHAR(MAX) NULL,
    Category NVARCHAR(100) NULL,
    Type NVARCHAR(100) NOT NULL,
    Length INT NULL,
    Precision INT NULL,
    Scale INT NULL,
    AllowsNull BIT NOT NULL DEFAULT 1,
    DefaultValue NVARCHAR(255) NULL,
    IsPrimaryKey BIT NOT NULL DEFAULT 0,
    IsUniqueKey BIT NOT NULL DEFAULT 0,
    IsReadOnly BIT NOT NULL DEFAULT 0,
    IsRequired BIT NOT NULL DEFAULT 0,
    RelatedIntegrationObjectID UNIQUEIDENTIFIER NULL,
    RelatedIntegrationObjectFieldName NVARCHAR(255) NULL,
    Sequence INT NOT NULL DEFAULT 0,
    Configuration NVARCHAR(MAX) NULL,
    Status NVARCHAR(25) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_IntegrationObjectField PRIMARY KEY (ID),
    CONSTRAINT FK_IntegrationObjectField_Object FOREIGN KEY (IntegrationObjectID)
        REFERENCES ${flyway:defaultSchema}.IntegrationObject(ID),
    CONSTRAINT FK_IntegrationObjectField_RelatedObject FOREIGN KEY (RelatedIntegrationObjectID)
        REFERENCES ${flyway:defaultSchema}.IntegrationObject(ID),
    CONSTRAINT UQ_IntegrationObjectField_Name UNIQUE (IntegrationObjectID, Name),
    CONSTRAINT CK_IntegrationObjectField_Status
        CHECK (Status IN ('Active', 'Deprecated', 'Disabled'))
);

-- =============================================================================
-- EXTENDED PROPERTIES: IntegrationObject
-- =============================================================================
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Describes an external object or endpoint exposed by an integration (e.g., Members, Events, Invoices)',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'ID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Integration that owns this object',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'IntegrationID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Internal/programmatic name of the external object (e.g., Members, Events)',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-friendly display label',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'DisplayName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Description of what this external object represents',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'Description';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UI grouping category (e.g., Membership, Events, Finance)',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'Category';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'API endpoint path, may include template variables like {ProfileID} that are resolved at runtime from parent object records',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'APIPath';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON key used to extract the data array from the API response envelope. NULL means the response is a root-level array.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'ResponseDataKey';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records to request per page from the API',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'DefaultPageSize';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this endpoint supports paginated fetching',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'SupportsPagination';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pagination strategy: PageNumber (page index), Offset (record offset), Cursor (opaque token), or None',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'PaginationType';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this object supports watermark-based incremental sync',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'SupportsIncrementalSync';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether data can be pushed back to this object via the API',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'SupportsWrite';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of default query parameters to include with every API request for this object',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'DefaultQueryParams';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Freeform JSON for connector-specific configuration not covered by standard columns',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'Configuration';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Processing and display order. Lower numbers are processed first.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'Sequence';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObject', @level2type=N'COLUMN', @level2name=N'Status';

-- =============================================================================
-- EXTENDED PROPERTIES: IntegrationObjectField
-- =============================================================================
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Describes a field on an integration object, mirroring EntityField column patterns for type compatibility',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'ID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the IntegrationObject this field belongs to',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'IntegrationObjectID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Field name as returned by the external API',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Name';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-friendly display label for the field',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'DisplayName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Description of what this field represents',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Description';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UI grouping category within the object',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Category';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Data type of the field (e.g., nvarchar, int, datetime, decimal, bit). Uses same type vocabulary as EntityField.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Type';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum length for string types',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Length';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Numeric precision',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Precision';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Numeric scale',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Scale';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the field can contain NULL values',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'AllowsNull';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default value from the source system',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'DefaultValue';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this field is part of the object primary key',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'IsPrimaryKey';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether values must be unique across all records',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'IsUniqueKey';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this field cannot be written back to the source system',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'IsReadOnly';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this field is required for create/update operations',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'IsRequired';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to another IntegrationObject, establishing a relationship. Used for DAG-based dependency ordering and template variable resolution in parent APIPath patterns.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'RelatedIntegrationObjectID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The field name on the related IntegrationObject that this FK points to (typically the PK field)',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'RelatedIntegrationObjectFieldName';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display and processing order within the object. Lower numbers appear first.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Sequence';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Freeform JSON for connector-specific field configuration',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Configuration';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'IntegrationObjectField', @level2type=N'COLUMN', @level2name=N'Status';

























































-- CODE GEN RUN 
/* SQL generated to create new entity MJ: Integration Objects */

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
         '86d3ed6f-2d1d-43f6-9777-fd9672fa9021',
         'MJ: Integration Objects',
         'Integration Objects',
         'Describes an external object or endpoint exposed by an integration (e.g., Members, Events, Invoices)',
         NULL,
         'IntegrationObject',
         'vwIntegrationObjects',
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
   

/* SQL generated to add new entity MJ: Integration Objects to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '86d3ed6f-2d1d-43f6-9777-fd9672fa9021', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Objects for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('86d3ed6f-2d1d-43f6-9777-fd9672fa9021', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Objects for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('86d3ed6f-2d1d-43f6-9777-fd9672fa9021', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Objects for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('86d3ed6f-2d1d-43f6-9777-fd9672fa9021', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Integration Object Fields */

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
         '3630cbfd-4c85-4b24-8a51-88d67389373e',
         'MJ: Integration Object Fields',
         'Integration Object Fields',
         'Describes a field on an integration object, mirroring EntityField column patterns for type compatibility',
         NULL,
         'IntegrationObjectField',
         'vwIntegrationObjectFields',
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
   

/* SQL generated to add new entity MJ: Integration Object Fields to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3630cbfd-4c85-4b24-8a51-88d67389373e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Object Fields for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3630cbfd-4c85-4b24-8a51-88d67389373e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Object Fields for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3630cbfd-4c85-4b24-8a51-88d67389373e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Object Fields for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3630cbfd-4c85-4b24-8a51-88d67389373e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.IntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObjectField] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.IntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObjectField] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.IntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObject] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.IntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObject] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d811e36-6c67-4927-957c-cf3692941c43' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScheduleEnabled')) BEGIN
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
            '4d811e36-6c67-4927-957c-cf3692941c43',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100046,
            'ScheduleEnabled',
            'Schedule Enabled',
            'Whether automatic sync scheduling is enabled for this integration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91e87b89-a40e-49ce-8464-75ec06bff1a7' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScheduleType')) BEGIN
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
            '91e87b89-a40e-49ce-8464-75ec06bff1a7',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100047,
            'ScheduleType',
            'Schedule Type',
            'Type of schedule: Manual (no auto-sync), Interval (every N minutes), Cron (cron expression)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Manual',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '801d0e7d-4fcb-4249-9052-4e929307f070' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScheduleIntervalMinutes')) BEGIN
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
            '801d0e7d-4fcb-4249-9052-4e929307f070',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100048,
            'ScheduleIntervalMinutes',
            'Schedule Interval Minutes',
            'Interval in minutes for Interval schedule type',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa43cb1d-7a04-40d8-ac9a-2036e3f06252' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CronExpression')) BEGIN
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
            'fa43cb1d-7a04-40d8-ac9a-2036e3f06252',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100049,
            'CronExpression',
            'Cron Expression',
            'Cron expression for Cron schedule type (e.g., "0 */6 * * *" for every 6 hours)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45e7c880-19c4-45fb-ba3c-9ffd9533fb12' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'NextScheduledRunAt')) BEGIN
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
            '45e7c880-19c4-45fb-ba3c-9ffd9533fb12',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100050,
            'NextScheduledRunAt',
            'Next Scheduled Run At',
            'When the next scheduled sync should run. Updated after each run based on schedule config.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cac39331-fa43-46bd-abc0-11ae683ea5ec' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastScheduledRunAt')) BEGIN
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
            'cac39331-fa43-46bd-abc0-11ae683ea5ec',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100051,
            'LastScheduledRunAt',
            'Last Scheduled Run At',
            'When the last scheduled sync was initiated',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e0a21b0-0039-4acc-b40a-3b8e1767d4d4' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsLocked')) BEGIN
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
            '6e0a21b0-0039-4acc-b40a-3b8e1767d4d4',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100052,
            'IsLocked',
            'Is Locked',
            'Whether a sync is currently locked/running for this integration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b9edf01-96fe-4506-97d8-1971830f101e' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LockedAt')) BEGIN
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
            '8b9edf01-96fe-4506-97d8-1971830f101e',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100053,
            'LockedAt',
            'Locked At',
            'When the lock was acquired',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '186eb537-b916-46ac-82f3-dce1789b572f' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LockedByInstance')) BEGIN
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
            '186eb537-b916-46ac-82f3-dce1789b572f',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100054,
            'LockedByInstance',
            'Locked By Instance',
            'Server instance identifier that holds the lock (hostname-pid)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9e35f33-7ed2-4413-922f-12ba98e60355' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LockExpiresAt')) BEGIN
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
            'f9e35f33-7ed2-4413-922f-12ba98e60355',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100055,
            'LockExpiresAt',
            'Lock Expires At',
            'When the lock should be considered stale and eligible for cleanup',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c29bac47-fd92-4209-b600-998618c2a052' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'ID')) BEGIN
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
            'c29bac47-fd92-4209-b600-998618c2a052',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100001,
            'ID',
            'ID',
            'Primary key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ea456ad-785f-4e37-b397-8ff6f2040810' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IntegrationObjectID')) BEGIN
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
            '8ea456ad-785f-4e37-b397-8ff6f2040810',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100002,
            'IntegrationObjectID',
            'Integration Object ID',
            'Foreign key to the IntegrationObject this field belongs to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f087bb9d-a16e-4778-a711-026b5cdb5ecb' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Name')) BEGIN
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
            'f087bb9d-a16e-4778-a711-026b5cdb5ecb',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100003,
            'Name',
            'Name',
            'Field name as returned by the external API',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0279d61-5dd7-4636-acaf-3c07b4ebf599' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'DisplayName')) BEGIN
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
            'c0279d61-5dd7-4636-acaf-3c07b4ebf599',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100004,
            'DisplayName',
            'Display Name',
            'Human-friendly display label for the field',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb935245-a13b-46ba-b54c-bede08fafec0' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Description')) BEGIN
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
            'eb935245-a13b-46ba-b54c-bede08fafec0',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100005,
            'Description',
            'Description',
            'Description of what this field represents',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc99e8ba-ddb8-4cfb-8f0a-a4a68769a942' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Category')) BEGIN
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
            'cc99e8ba-ddb8-4cfb-8f0a-a4a68769a942',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100006,
            'Category',
            'Category',
            'UI grouping category within the object',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe592595-e4fd-458a-a892-918db3abc0b8' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Type')) BEGIN
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
            'fe592595-e4fd-458a-a892-918db3abc0b8',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100007,
            'Type',
            'Type',
            'Data type of the field (e.g., nvarchar, int, datetime, decimal, bit). Uses same type vocabulary as EntityField.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a184fa33-d1e3-4341-854a-63ba62571622' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Length')) BEGIN
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
            'a184fa33-d1e3-4341-854a-63ba62571622',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100008,
            'Length',
            'Length',
            'Maximum length for string types',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc62f3d1-514c-4850-a884-098accea440c' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Precision')) BEGIN
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
            'fc62f3d1-514c-4850-a884-098accea440c',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100009,
            'Precision',
            'Precision',
            'Numeric precision',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a27f5839-ca61-42fc-b724-c4f885fb5fa0' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Scale')) BEGIN
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
            'a27f5839-ca61-42fc-b724-c4f885fb5fa0',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100010,
            'Scale',
            'Scale',
            'Numeric scale',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f48e0a4-576c-4746-af78-0ced62880881' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'AllowsNull')) BEGIN
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
            '4f48e0a4-576c-4746-af78-0ced62880881',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100011,
            'AllowsNull',
            'Allows Null',
            'Whether the field can contain NULL values',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e996e3e-68a6-468d-92b5-b1e7d905ab64' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'DefaultValue')) BEGIN
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
            '1e996e3e-68a6-468d-92b5-b1e7d905ab64',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100012,
            'DefaultValue',
            'Default Value',
            'Default value from the source system',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a41406ef-d751-4e1d-8b03-537ec3f5ed26' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsPrimaryKey')) BEGIN
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
            'a41406ef-d751-4e1d-8b03-537ec3f5ed26',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100013,
            'IsPrimaryKey',
            'Is Primary Key',
            'Whether this field is part of the object primary key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db6d509c-4ddc-4f2b-a2ed-6abdefd210a5' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsUniqueKey')) BEGIN
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
            'db6d509c-4ddc-4f2b-a2ed-6abdefd210a5',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100014,
            'IsUniqueKey',
            'Is Unique Key',
            'Whether values must be unique across all records',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b8579c3-5351-4263-aef4-bb44e30d4b4d' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsReadOnly')) BEGIN
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
            '6b8579c3-5351-4263-aef4-bb44e30d4b4d',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100015,
            'IsReadOnly',
            'Is Read Only',
            'Whether this field cannot be written back to the source system',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'da3bc5ce-671c-48ac-9cd5-497ca602d0e5' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IsRequired')) BEGIN
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
            'da3bc5ce-671c-48ac-9cd5-497ca602d0e5',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100016,
            'IsRequired',
            'Is Required',
            'Whether this field is required for create/update operations',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22a62bf2-861b-4b29-a7e1-b69b476e706e' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'RelatedIntegrationObjectID')) BEGIN
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
            '22a62bf2-861b-4b29-a7e1-b69b476e706e',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100017,
            'RelatedIntegrationObjectID',
            'Related Integration Object ID',
            'Foreign key to another IntegrationObject, establishing a relationship. Used for DAG-based dependency ordering and template variable resolution in parent APIPath patterns.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efd4b858-690a-4ad6-9bce-dacbe0f0bdf3' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'RelatedIntegrationObjectFieldName')) BEGIN
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
            'efd4b858-690a-4ad6-9bce-dacbe0f0bdf3',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100018,
            'RelatedIntegrationObjectFieldName',
            'Related Integration Object Field Name',
            'The field name on the related IntegrationObject that this FK points to (typically the PK field)',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5bc346a1-8015-4f20-9247-cb0039ee14e4' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Sequence')) BEGIN
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
            '5bc346a1-8015-4f20-9247-cb0039ee14e4',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100019,
            'Sequence',
            'Sequence',
            'Display and processing order within the object. Lower numbers appear first.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2efa2d36-459b-4433-bfbc-4e76e8a5a461' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Configuration')) BEGIN
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
            '2efa2d36-459b-4433-bfbc-4e76e8a5a461',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100020,
            'Configuration',
            'Configuration',
            'Freeform JSON for connector-specific field configuration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82d4929e-1bbf-4eb5-afc4-40d1da3d01d4' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'Status')) BEGIN
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
            '82d4929e-1bbf-4eb5-afc4-40d1da3d01d4',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100021,
            'Status',
            'Status',
            'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
            'nvarchar',
            50,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a40b0908-76cc-4d93-b7ff-659d450cdf19' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a40b0908-76cc-4d93-b7ff-659d450cdf19',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100022,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e19f566-6ffb-4b64-96c9-8ea44b3dae08' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1e19f566-6ffb-4b64-96c9-8ea44b3dae08',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100023,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5f7651f-56e2-4e92-a9fe-cfcd61b58b25' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'ID')) BEGIN
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
            'f5f7651f-56e2-4e92-a9fe-cfcd61b58b25',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100001,
            'ID',
            'ID',
            'Primary key',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0eab738-4bb1-499f-80fc-aa8a0b46b389' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'IntegrationID')) BEGIN
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
            'a0eab738-4bb1-499f-80fc-aa8a0b46b389',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100002,
            'IntegrationID',
            'Integration ID',
            'Foreign key to the Integration that owns this object',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'DD238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f19f87b-4609-4738-97d6-8627de23af4b' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Name')) BEGIN
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
            '7f19f87b-4609-4738-97d6-8627de23af4b',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100003,
            'Name',
            'Name',
            'Internal/programmatic name of the external object (e.g., Members, Events)',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b3f3dff-3e46-4db2-9fc6-d5b764d80b7e' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'DisplayName')) BEGIN
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
            '8b3f3dff-3e46-4db2-9fc6-d5b764d80b7e',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100004,
            'DisplayName',
            'Display Name',
            'Human-friendly display label',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbfed2a5-355d-4617-b4f8-237b4d3b2365' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Description')) BEGIN
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
            'dbfed2a5-355d-4617-b4f8-237b4d3b2365',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100005,
            'Description',
            'Description',
            'Description of what this external object represents',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f0f0147-386f-45c8-aa9f-021c26b634a5' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Category')) BEGIN
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
            '0f0f0147-386f-45c8-aa9f-021c26b634a5',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100006,
            'Category',
            'Category',
            'UI grouping category (e.g., Membership, Events, Finance)',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1cfa6c37-9057-4662-8c40-f835aa972edf' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'APIPath')) BEGIN
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
            '1cfa6c37-9057-4662-8c40-f835aa972edf',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100007,
            'APIPath',
            'API Path',
            'API endpoint path, may include template variables like {ProfileID} that are resolved at runtime from parent object records',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ade52a5e-adba-4414-aae2-12b535f85ac3' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'ResponseDataKey')) BEGIN
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
            'ade52a5e-adba-4414-aae2-12b535f85ac3',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100008,
            'ResponseDataKey',
            'Response Data Key',
            'JSON key used to extract the data array from the API response envelope. NULL means the response is a root-level array.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85d95d3f-dad6-492d-90af-5207d16780ee' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'DefaultPageSize')) BEGIN
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
            '85d95d3f-dad6-492d-90af-5207d16780ee',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100009,
            'DefaultPageSize',
            'Default Page Size',
            'Number of records to request per page from the API',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27719863-6129-44d5-a77c-7827db58bd91' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'SupportsPagination')) BEGIN
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
            '27719863-6129-44d5-a77c-7827db58bd91',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100010,
            'SupportsPagination',
            'Supports Pagination',
            'Whether this endpoint supports paginated fetching',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '248dbcef-e551-4913-8579-200b33459e16' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'PaginationType')) BEGIN
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
            '248dbcef-e551-4913-8579-200b33459e16',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100011,
            'PaginationType',
            'Pagination Type',
            'Pagination strategy: PageNumber (page index), Offset (record offset), Cursor (opaque token), or None',
            'nvarchar',
            40,
            0,
            0,
            0,
            'PageNumber',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c73a053e-44e2-40a8-9a0a-899e6e28af4d' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'SupportsIncrementalSync')) BEGIN
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
            'c73a053e-44e2-40a8-9a0a-899e6e28af4d',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100012,
            'SupportsIncrementalSync',
            'Supports Incremental Sync',
            'Whether this object supports watermark-based incremental sync',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e48963cb-3027-4554-bf48-52eca282d983' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'SupportsWrite')) BEGIN
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
            'e48963cb-3027-4554-bf48-52eca282d983',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100013,
            'SupportsWrite',
            'Supports Write',
            'Whether data can be pushed back to this object via the API',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38708eac-bec9-4bd1-afa5-af93a00f0fea' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'DefaultQueryParams')) BEGIN
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
            '38708eac-bec9-4bd1-afa5-af93a00f0fea',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100014,
            'DefaultQueryParams',
            'Default Query Params',
            'JSON object of default query parameters to include with every API request for this object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed9326f4-6377-4fb3-84fa-ebcc9859fc07' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Configuration')) BEGIN
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
            'ed9326f4-6377-4fb3-84fa-ebcc9859fc07',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100015,
            'Configuration',
            'Configuration',
            'Freeform JSON for connector-specific configuration not covered by standard columns',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9057e47c-7633-4b86-8adf-f09044fe4470' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Sequence')) BEGIN
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
            '9057e47c-7633-4b86-8adf-f09044fe4470',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100016,
            'Sequence',
            'Sequence',
            'Processing and display order. Lower numbers are processed first.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '027bc6fb-ac73-41c5-8856-981fb0031897' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Status')) BEGIN
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
            '027bc6fb-ac73-41c5-8856-981fb0031897',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100017,
            'Status',
            'Status',
            'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
            'nvarchar',
            50,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c7b2511-b32a-4e05-ad8f-71a8d7438e96' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4c7b2511-b32a-4e05-ad8f-71a8d7438e96',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '17416191-6ba9-4d7d-b38d-5d32220c994e' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '17416191-6ba9-4d7d-b38d-5d32220c994e',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100019,
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

/* SQL text to insert entity field value with ID b598a04e-5f57-4ae2-91aa-54bbafe86032 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b598a04e-5f57-4ae2-91aa-54bbafe86032', '91E87B89-A40E-49CE-8464-75EC06BFF1A7', 1, 'Cron', 'Cron', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 48c82bbd-d8fd-4c6a-92b3-b3cf0902b069 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('48c82bbd-d8fd-4c6a-92b3-b3cf0902b069', '91E87B89-A40E-49CE-8464-75EC06BFF1A7', 2, 'Interval', 'Interval', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 367ef13f-861f-42ff-afa3-c977d8b4b882 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('367ef13f-861f-42ff-afa3-c977d8b4b882', '91E87B89-A40E-49CE-8464-75EC06BFF1A7', 3, 'Manual', 'Manual', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 91E87B89-A40E-49CE-8464-75EC06BFF1A7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='91E87B89-A40E-49CE-8464-75EC06BFF1A7'

/* SQL text to insert entity field value with ID 22d3d809-4b32-4a1e-9265-dfe88aabd686 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22d3d809-4b32-4a1e-9265-dfe88aabd686', '248DBCEF-E551-4913-8579-200B33459E16', 1, 'Cursor', 'Cursor', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID af8bf689-dfcd-49fe-b77b-536c8139f333 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af8bf689-dfcd-49fe-b77b-536c8139f333', '248DBCEF-E551-4913-8579-200B33459E16', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5b516c4d-7e06-4312-8f83-031da0ad84f4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5b516c4d-7e06-4312-8f83-031da0ad84f4', '248DBCEF-E551-4913-8579-200B33459E16', 3, 'Offset', 'Offset', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 038699bd-21cc-4fe9-a198-57b83226c06a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('038699bd-21cc-4fe9-a198-57b83226c06a', '248DBCEF-E551-4913-8579-200B33459E16', 4, 'PageNumber', 'PageNumber', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 248DBCEF-E551-4913-8579-200B33459E16 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='248DBCEF-E551-4913-8579-200B33459E16'

/* SQL text to insert entity field value with ID 34bcc036-7f0f-43dc-9c61-3d702c3c3781 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('34bcc036-7f0f-43dc-9c61-3d702c3c3781', '027BC6FB-AC73-41C5-8856-981FB0031897', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6adab35a-a84b-4aa1-8520-314bd33a7844 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6adab35a-a84b-4aa1-8520-314bd33a7844', '027BC6FB-AC73-41C5-8856-981FB0031897', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4a58e9c8-140f-4e8a-8b8e-8630b180f29b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4a58e9c8-140f-4e8a-8b8e-8630b180f29b', '027BC6FB-AC73-41C5-8856-981FB0031897', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 027BC6FB-AC73-41C5-8856-981FB0031897 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='027BC6FB-AC73-41C5-8856-981FB0031897'

/* SQL text to insert entity field value with ID 1a3603bc-95a3-454c-bc37-05749e54e010 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1a3603bc-95a3-454c-bc37-05749e54e010', '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID f580b59b-6a40-489f-a5d0-8b751239a100 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f580b59b-6a40-489f-a5d0-8b751239a100', '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ec196207-986c-4cac-981d-9eeb838d2c53 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ec196207-986c-4cac-981d-9eeb838d2c53', '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4'


/* Create Entity Relationship: MJ: Integrations -> MJ: Integration Objects (One To Many via IntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f9f16e5b-2784-4682-aaac-df0f98e7a2c0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f9f16e5b-2784-4682-aaac-df0f98e7a2c0', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', 'IntegrationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Integration Objects -> MJ: Integration Object Fields (One To Many via IntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'eaf27ef3-7e36-41ad-a878-cf636ea412e8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('eaf27ef3-7e36-41ad-a878-cf636ea412e8', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', '3630CBFD-4C85-4B24-8A51-88D67389373E', 'IntegrationObjectID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Integration Objects -> MJ: Integration Object Fields (One To Many via RelatedIntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c13b39a7-b4c6-4e0f-8b91-761e40d40ef6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c13b39a7-b4c6-4e0f-8b91-761e40d40ef6', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', '3630CBFD-4C85-4B24-8A51-88D67389373E', 'RelatedIntegrationObjectID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

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

-- Index for foreign key CredentialID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_CredentialID ON [${flyway:defaultSchema}].[CompanyIntegration] ([CredentialID]);

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
    @Configuration nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @ScheduleEnabled bit = NULL,
    @ScheduleType nvarchar(20) = NULL,
    @ScheduleIntervalMinutes int,
    @CronExpression nvarchar(200),
    @NextScheduledRunAt datetimeoffset,
    @LastScheduledRunAt datetimeoffset,
    @IsLocked bit = NULL,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(200),
    @LockExpiresAt datetimeoffset
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
                [Configuration],
                [CredentialID],
                [ScheduleEnabled],
                [ScheduleType],
                [ScheduleIntervalMinutes],
                [CronExpression],
                [NextScheduledRunAt],
                [LastScheduledRunAt],
                [IsLocked],
                [LockedAt],
                [LockedByInstance],
                [LockExpiresAt]
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
                @Configuration,
                @CredentialID,
                ISNULL(@ScheduleEnabled, 0),
                ISNULL(@ScheduleType, 'Manual'),
                @ScheduleIntervalMinutes,
                @CronExpression,
                @NextScheduledRunAt,
                @LastScheduledRunAt,
                ISNULL(@IsLocked, 0),
                @LockedAt,
                @LockedByInstance,
                @LockExpiresAt
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
                [Configuration],
                [CredentialID],
                [ScheduleEnabled],
                [ScheduleType],
                [ScheduleIntervalMinutes],
                [CronExpression],
                [NextScheduledRunAt],
                [LastScheduledRunAt],
                [IsLocked],
                [LockedAt],
                [LockedByInstance],
                [LockExpiresAt]
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
                @Configuration,
                @CredentialID,
                ISNULL(@ScheduleEnabled, 0),
                ISNULL(@ScheduleType, 'Manual'),
                @ScheduleIntervalMinutes,
                @CronExpression,
                @NextScheduledRunAt,
                @LastScheduledRunAt,
                ISNULL(@IsLocked, 0),
                @LockedAt,
                @LockedByInstance,
                @LockExpiresAt
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
    @Configuration nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @ScheduleEnabled bit,
    @ScheduleType nvarchar(20),
    @ScheduleIntervalMinutes int,
    @CronExpression nvarchar(200),
    @NextScheduledRunAt datetimeoffset,
    @LastScheduledRunAt datetimeoffset,
    @IsLocked bit,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(200),
    @LockExpiresAt datetimeoffset
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
        [Configuration] = @Configuration,
        [CredentialID] = @CredentialID,
        [ScheduleEnabled] = @ScheduleEnabled,
        [ScheduleType] = @ScheduleType,
        [ScheduleIntervalMinutes] = @ScheduleIntervalMinutes,
        [CronExpression] = @CronExpression,
        [NextScheduledRunAt] = @NextScheduledRunAt,
        [LastScheduledRunAt] = @LastScheduledRunAt,
        [IsLocked] = @IsLocked,
        [LockedAt] = @LockedAt,
        [LockedByInstance] = @LockedByInstance,
        [LockExpiresAt] = @LockExpiresAt
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



/* Index for Foreign Keys for IntegrationObjectField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationObjectID in table IntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID ON [${flyway:defaultSchema}].[IntegrationObjectField] ([IntegrationObjectID]);

-- Index for foreign key RelatedIntegrationObjectID in table IntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegrationObjectID ON [${flyway:defaultSchema}].[IntegrationObjectField] ([RelatedIntegrationObjectID]);

/* SQL text to update entity field related entity name field map for entity field ID 8EA456AD-785F-4E37-B397-8FF6F2040810 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8EA456AD-785F-4E37-B397-8FF6F2040810', @RelatedEntityNameFieldMap='IntegrationObject'

/* Index for Foreign Keys for IntegrationObject */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key IntegrationID in table IntegrationObject
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[IntegrationObject]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID ON [${flyway:defaultSchema}].[IntegrationObject] ([IntegrationID]);

/* SQL text to update entity field related entity name field map for entity field ID A0EAB738-4BB1-499F-80FC-AA8A0B46B389 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A0EAB738-4BB1-499F-80FC-AA8A0B46B389', @RelatedEntityNameFieldMap='Integration'

/* Base View SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Objects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationObjects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationObjects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationObjects]
AS
SELECT
    i.*,
    MJIntegration_IntegrationID.[Name] AS [Integration]
FROM
    [${flyway:defaultSchema}].[IntegrationObject] AS i
INNER JOIN
    [${flyway:defaultSchema}].[Integration] AS MJIntegration_IntegrationID
  ON
    [i].[IntegrationID] = MJIntegration_IntegrationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Permissions for vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spCreateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObject]
    @ID uniqueidentifier = NULL,
    @IntegrationID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @APIPath nvarchar(500),
    @ResponseDataKey nvarchar(255),
    @DefaultPageSize int = NULL,
    @SupportsPagination bit = NULL,
    @PaginationType nvarchar(20) = NULL,
    @SupportsIncrementalSync bit = NULL,
    @SupportsWrite bit = NULL,
    @DefaultQueryParams nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Sequence int = NULL,
    @Status nvarchar(25) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObject]
            (
                [ID],
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @APIPath,
                @ResponseDataKey,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                @DefaultQueryParams,
                @Configuration,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObject]
            (
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @APIPath,
                @ResponseDataKey,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                @DefaultQueryParams,
                @Configuration,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationObjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObject] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObject] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spUpdateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObject]
    @ID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @APIPath nvarchar(500),
    @ResponseDataKey nvarchar(255),
    @DefaultPageSize int,
    @SupportsPagination bit,
    @PaginationType nvarchar(20),
    @SupportsIncrementalSync bit,
    @SupportsWrite bit,
    @DefaultQueryParams nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @Sequence int,
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObject]
    SET
        [IntegrationID] = @IntegrationID,
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Category] = @Category,
        [APIPath] = @APIPath,
        [ResponseDataKey] = @ResponseDataKey,
        [DefaultPageSize] = @DefaultPageSize,
        [SupportsPagination] = @SupportsPagination,
        [PaginationType] = @PaginationType,
        [SupportsIncrementalSync] = @SupportsIncrementalSync,
        [SupportsWrite] = @SupportsWrite,
        [DefaultQueryParams] = @DefaultQueryParams,
        [Configuration] = @Configuration,
        [Sequence] = @Sequence,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationObjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationObjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObject table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationObject]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationObject];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationObject
ON [${flyway:defaultSchema}].[IntegrationObject]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObject]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationObject] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObject] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spDeleteIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationObject]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObject] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 22A62BF2-861B-4B29-A7E1-B69B476E706E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='22A62BF2-861B-4B29-A7E1-B69B476E706E', @RelatedEntityNameFieldMap='RelatedIntegrationObject'

/* Base View SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Object Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationObjectField
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationObjectFields]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationObjectFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationObjectFields]
AS
SELECT
    i.*,
    MJIntegrationObject_IntegrationObjectID.[Name] AS [IntegrationObject],
    MJIntegrationObject_RelatedIntegrationObjectID.[Name] AS [RelatedIntegrationObject]
FROM
    [${flyway:defaultSchema}].[IntegrationObjectField] AS i
INNER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_IntegrationObjectID
  ON
    [i].[IntegrationObjectID] = MJIntegrationObject_IntegrationObjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_RelatedIntegrationObjectID
  ON
    [i].[RelatedIntegrationObjectID] = MJIntegrationObject_RelatedIntegrationObjectID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Permissions for vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spCreateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationObjectField]
    @ID uniqueidentifier = NULL,
    @IntegrationObjectID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @Type nvarchar(100),
    @Length int,
    @Precision int,
    @Scale int,
    @AllowsNull bit = NULL,
    @DefaultValue nvarchar(255),
    @IsPrimaryKey bit = NULL,
    @IsUniqueKey bit = NULL,
    @IsReadOnly bit = NULL,
    @IsRequired bit = NULL,
    @RelatedIntegrationObjectID uniqueidentifier,
    @RelatedIntegrationObjectFieldName nvarchar(255),
    @Sequence int = NULL,
    @Configuration nvarchar(MAX),
    @Status nvarchar(25) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObjectField]
            (
                [ID],
                [IntegrationObjectID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectID],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationObjectID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @Type,
                @Length,
                @Precision,
                @Scale,
                ISNULL(@AllowsNull, 1),
                @DefaultValue,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                @RelatedIntegrationObjectID,
                @RelatedIntegrationObjectFieldName,
                ISNULL(@Sequence, 0),
                @Configuration,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationObjectField]
            (
                [IntegrationObjectID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectID],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationObjectID,
                @Name,
                @DisplayName,
                @Description,
                @Category,
                @Type,
                @Length,
                @Precision,
                @Scale,
                ISNULL(@AllowsNull, 1),
                @DefaultValue,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                @RelatedIntegrationObjectID,
                @RelatedIntegrationObjectFieldName,
                ISNULL(@Sequence, 0),
                @Configuration,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationObjectFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spUpdateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationObjectField]
    @ID uniqueidentifier,
    @IntegrationObjectID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Category nvarchar(100),
    @Type nvarchar(100),
    @Length int,
    @Precision int,
    @Scale int,
    @AllowsNull bit,
    @DefaultValue nvarchar(255),
    @IsPrimaryKey bit,
    @IsUniqueKey bit,
    @IsReadOnly bit,
    @IsRequired bit,
    @RelatedIntegrationObjectID uniqueidentifier,
    @RelatedIntegrationObjectFieldName nvarchar(255),
    @Sequence int,
    @Configuration nvarchar(MAX),
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObjectField]
    SET
        [IntegrationObjectID] = @IntegrationObjectID,
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Category] = @Category,
        [Type] = @Type,
        [Length] = @Length,
        [Precision] = @Precision,
        [Scale] = @Scale,
        [AllowsNull] = @AllowsNull,
        [DefaultValue] = @DefaultValue,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUniqueKey] = @IsUniqueKey,
        [IsReadOnly] = @IsReadOnly,
        [IsRequired] = @IsRequired,
        [RelatedIntegrationObjectID] = @RelatedIntegrationObjectID,
        [RelatedIntegrationObjectFieldName] = @RelatedIntegrationObjectFieldName,
        [Sequence] = @Sequence,
        [Configuration] = @Configuration,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationObjectFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationObjectFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObjectField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationObjectField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationObjectField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationObjectField
ON [${flyway:defaultSchema}].[IntegrationObjectField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationObjectField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationObjectField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spDeleteIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationObjectField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationObjectField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Integration Object Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationObjectField] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0dcda729-db83-421e-b5ec-1b1636c7bc1e' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'IntegrationObject')) BEGIN
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
            '0dcda729-db83-421e-b5ec-1b1636c7bc1e',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100047,
            'IntegrationObject',
            'Integration Object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1ed4d02-2463-457c-9c8d-761d24cc5288' OR (EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND Name = 'RelatedIntegrationObject')) BEGIN
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
            'e1ed4d02-2463-457c-9c8d-761d24cc5288',
            '3630CBFD-4C85-4B24-8A51-88D67389373E', -- Entity: MJ: Integration Object Fields
            100048,
            'RelatedIntegrationObject',
            'Related Integration Object',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8defcead-c227-45e0-af79-6b3318c563c7' OR (EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND Name = 'Integration')) BEGIN
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
            '8defcead-c227-45e0-af79-6b3318c563c7',
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- Entity: MJ: Integration Objects
            100039,
            'Integration',
            'Integration',
            NULL,
            'nvarchar',
            200,
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
               WHERE ID = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0F0F0147-386F-45C8-AA9F-021C26B634A5'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '027BC6FB-AC73-41C5-8856-981FB0031897'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0F0F0147-386F-45C8-AA9F-021C26B634A5'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '1CFA6C37-9057-4662-8C40-F835AA972EDF'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FE592595-E4FD-458A-A892-918DB3ABC0B8'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Integration Objects.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5F7651F-56E2-4E92-A9FE-CFCD61B58B25' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0EAB738-4BB1-499F-80FC-AA8A0B46B389' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Internal Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F19F87B-4609-4738-97D6-8627DE23AF4B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DBFED2A5-355D-4617-B4F8-237B4D3B2365' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F0F0147-386F-45C8-AA9F-021C26B634A5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '027BC6FB-AC73-41C5-8856-981FB0031897' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9057E47C-7633-4B86-8ADF-F09044FE4470' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.APIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Endpoint Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1CFA6C37-9057-4662-8C40-F835AA972EDF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.ResponseDataKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Endpoint Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADE52A5E-ADBA-4414-AAE2-12B535F85AC3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultQueryParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Endpoint Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Query Parameters',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '38708EAC-BEC9-4BD1-AFA5-AF93A00F0FEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Endpoint Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'ED9326F4-6377-4FB3-84FA-EBCC9859FC07' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsPagination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync and Pagination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27719863-6129-44D5-A77C-7827DB58BD91' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.PaginationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync and Pagination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '248DBCEF-E551-4913-8579-200B33459E16' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultPageSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync and Pagination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85D95D3F-DAD6-492D-90AF-5207D16780EE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsIncrementalSync 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync and Pagination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C73A053E-44E2-40A8-9A0A-899E6E28AF4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync and Pagination',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E48963CB-3027-4554-BF48-52ECA282D983' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C7B2511-B32A-4E05-AD8F-71A8D7438E96' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '17416191-6BA9-4D7D-B38D-5D32220C994E' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-plug */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-plug', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4bd4782e-33b8-49ea-8b6c-8ab9f3a924a0', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', 'FieldCategoryInfo', '{"Object Definition":{"icon":"fa fa-info-circle","description":"Basic identification and descriptive information for the integration object"},"API Endpoint Details":{"icon":"fa fa-network-wired","description":"Technical configuration for the API endpoint, paths, and response parsing"},"Sync and Pagination":{"icon":"fa fa-sync","description":"Settings governing how data is fetched, paginated, and synchronized"},"Integration Context":{"icon":"fa fa-link","description":"Relationship to the parent integration provider"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c0d63ca2-b1cd-43f7-a551-3f3cd0ebcb3b', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', 'FieldCategoryIcons', '{"Object Definition":"fa fa-info-circle","API Endpoint Details":"fa fa-network-wired","Sync and Pagination":"fa fa-sync","Integration Context":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021'
      

/* Set categories for 25 fields */

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C29BAC47-FD92-4209-B600-998618C2A052' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Object',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EA456AD-785F-4E37-B397-8FF6F2040810' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F087BB9D-A16E-4778-A711-026B5CDB5ECB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB935245-A13B-46BA-B54C-BEDE08FAFEC0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE592595-E4FD-458A-A892-918DB3ABC0B8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Length 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A184FA33-D1E3-4341-854A-63BA62571622' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC62F3D1-514C-4850-A884-098ACCEA440C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A27F5839-CA61-42FC-B724-C4F885FB5FA0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.AllowsNull 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F48E0A4-576C-4746-AF78-0CED62880881' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E996E3E-68A6-468D-92B5-B1E7D905AB64' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Key',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A41406EF-D751-4E1D-8B03-537EC3F5ED26' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsUniqueKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   DisplayName = 'Unique Key',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB6D509C-4DDC-4F2B-A2ED-6ABDEFD210A5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   DisplayName = 'Read Only',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B8579C3-5351-4263-AEF4-BB44E30D4B4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsRequired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints',
   GeneratedFormSection = 'Category',
   DisplayName = 'Required',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Integration Object',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22A62BF2-861B-4B29-A7E1-B69B476E706E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Field Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFD4B858-690A-4AD6-9BCE-DACBE0F0BDF3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BC346A1-8015-4F20-9247-CB0039EE14E4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '2EFA2D36-459B-4433-BFBC-4E76E8A5A461' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A40B0908-76CC-4D93-B7FF-659D450CDF19' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E19F566-6FFB-4B64-96C9-8EA44B3DAE08' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Object Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Object Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1ED4D02-2463-457C-9C8D-761D24CC5288' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-columns */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-columns', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3630CBFD-4C85-4B24-8A51-88D67389373E'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('dfd2b43f-f81e-41f1-9f9b-35a9502a589e', '3630CBFD-4C85-4B24-8A51-88D67389373E', 'FieldCategoryInfo', '{"Field Identity":{"icon":"fa fa-id-card","description":"Basic identification, labeling, and status information for the integration field"},"Data Constraints":{"icon":"fa fa-check-double","description":"Technical specifications, validation rules, and data type requirements"},"Object Mapping":{"icon":"fa fa-link","description":"Relationships between integration objects and specific field configurations"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fbeb188d-a2d6-4ec8-a012-5748e6d01bf0', '3630CBFD-4C85-4B24-8A51-88D67389373E', 'FieldCategoryIcons', '{"Field Identity":"fa fa-id-card","Data Constraints":"fa fa-check-double","Object Mapping":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3630CBFD-4C85-4B24-8A51-88D67389373E'
      

/* Set categories for 36 fields */

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

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

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

-- UPDATE Entity Field Category Info MJ: Company Integrations.ExternalSystemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsExternalSystemReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

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

-- UPDATE Entity Field Category Info MJ: Company Integrations.CustomAttribute1 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

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

-- UPDATE Entity Field Category Info MJ: Company Integrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.SourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F647023E-D909-4ECB-B59D-EE477C274827' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '987EAF20-227F-4043-BD87-06C9E01598F4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '131B9CC4-3755-46F6-925A-7E3A13BCDFD6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ScheduleEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Scheduling',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D811E36-6C67-4927-957C-CF3692941C43' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ScheduleType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Scheduling',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91E87B89-A40E-49CE-8464-75EC06BFF1A7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ScheduleIntervalMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Scheduling',
   GeneratedFormSection = 'Category',
   DisplayName = 'Schedule Interval (Minutes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '801D0E7D-4FCB-4249-9052-4E929307F070' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CronExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Scheduling',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA43CB1D-7A04-40D8-AC9A-2036E3F06252' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.NextScheduledRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Scheduling',
   GeneratedFormSection = 'Category',
   DisplayName = 'Next Scheduled Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '45E7C880-19C4-45FB-BA3C-9FFD9533FB12' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastScheduledRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Scheduling',
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Scheduled Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CAC39331-FA43-46BD-ABC0-11AE683EA5EC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsLocked 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run History & Monitoring',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E0A21B0-0039-4ACC-B40A-3B8E1767D4D4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LockedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run History & Monitoring',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B9EDF01-96FE-4506-97D8-1971830F101E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LockedByInstance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run History & Monitoring',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '186EB537-B916-46AC-82F3-DCE1789B572F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LockExpiresAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run History & Monitoring',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9E35F33-7ED2-4413-922F-12BA98E60355' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

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

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Run ID',
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

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Sync Scheduling":{"icon":"fa fa-clock","description":"Configuration for automatic synchronization frequency, timing, and next scheduled executions."}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Sync Scheduling":"fa fa-clock"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

