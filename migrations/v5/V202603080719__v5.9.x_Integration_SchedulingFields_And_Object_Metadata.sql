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
         'a376650b-0958-4b75-8122-e3bd4e2085f2',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a376650b-0958-4b75-8122-e3bd4e2085f2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Objects for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a376650b-0958-4b75-8122-e3bd4e2085f2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Objects for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a376650b-0958-4b75-8122-e3bd4e2085f2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Objects for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a376650b-0958-4b75-8122-e3bd4e2085f2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         '3cc4adca-ce0c-47e9-aa8d-0b7c43e3458b',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3cc4adca-ce0c-47e9-aa8d-0b7c43e3458b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Object Fields for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3cc4adca-ce0c-47e9-aa8d-0b7c43e3458b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Object Fields for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3cc4adca-ce0c-47e9-aa8d-0b7c43e3458b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Object Fields for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3cc4adca-ce0c-47e9-aa8d-0b7c43e3458b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.IntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObjectField] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.IntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObjectField] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.IntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObject] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.IntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationObject] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1f26c73-2300-40e8-ada7-6485522b2df2' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'ID')) BEGIN
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
            'e1f26c73-2300-40e8-ada7-6485522b2df2',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0f0963d-7634-4460-a239-a016d7d1c914' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'IntegrationObjectID')) BEGIN
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
            'd0f0963d-7634-4460-a239-a016d7d1c914',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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
            'A376650B-0958-4B75-8122-E3BD4E2085F2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a2088a6-ccc0-42ed-a697-05b4487dc24a' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Name')) BEGIN
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
            '0a2088a6-ccc0-42ed-a697-05b4487dc24a',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f6894bd-7eb1-44df-920c-042beda7d05d' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'DisplayName')) BEGIN
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
            '3f6894bd-7eb1-44df-920c-042beda7d05d',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a7c00a9-ebfd-4f82-b5a6-d54842e0f8ad' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Description')) BEGIN
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
            '4a7c00a9-ebfd-4f82-b5a6-d54842e0f8ad',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35153b4c-bf7a-45dc-8e6c-8eeca3f68f98' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Category')) BEGIN
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
            '35153b4c-bf7a-45dc-8e6c-8eeca3f68f98',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c51bf160-471d-4fbd-ae8a-f0f8b90386e6' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Type')) BEGIN
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
            'c51bf160-471d-4fbd-ae8a-f0f8b90386e6',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a9dacbc5-e435-43a8-be69-7722cfa90db1' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Length')) BEGIN
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
            'a9dacbc5-e435-43a8-be69-7722cfa90db1',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dfe3880c-798d-4db5-bdc5-23a66c9a0144' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Precision')) BEGIN
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
            'dfe3880c-798d-4db5-bdc5-23a66c9a0144',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '797522b4-4c34-497c-8fb3-d2878b1998a5' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Scale')) BEGIN
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
            '797522b4-4c34-497c-8fb3-d2878b1998a5',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91b7e80a-2156-48cd-9365-1ddb4b933069' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'AllowsNull')) BEGIN
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
            '91b7e80a-2156-48cd-9365-1ddb4b933069',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c0ea6fa-f274-47a1-8f7e-180535926a0a' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'DefaultValue')) BEGIN
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
            '5c0ea6fa-f274-47a1-8f7e-180535926a0a',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fef5c1e5-550c-4d0e-9562-d569a60fe679' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'IsPrimaryKey')) BEGIN
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
            'fef5c1e5-550c-4d0e-9562-d569a60fe679',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3effcaf7-6b7b-40a2-8303-1207cd5d78cc' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'IsUniqueKey')) BEGIN
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
            '3effcaf7-6b7b-40a2-8303-1207cd5d78cc',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09fde9ae-1adc-4ea0-91f9-02e901769a63' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'IsReadOnly')) BEGIN
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
            '09fde9ae-1adc-4ea0-91f9-02e901769a63',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a00d310-7159-4a80-8de9-2bacb8538e2f' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'IsRequired')) BEGIN
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
            '7a00d310-7159-4a80-8de9-2bacb8538e2f',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b22f876-9b5d-42f2-9377-d64049fa9467' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'RelatedIntegrationObjectID')) BEGIN
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
            '8b22f876-9b5d-42f2-9377-d64049fa9467',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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
            'A376650B-0958-4B75-8122-E3BD4E2085F2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d4a9fbe-dc9c-49df-a0ee-484ad4da7b2f' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'RelatedIntegrationObjectFieldName')) BEGIN
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
            '6d4a9fbe-dc9c-49df-a0ee-484ad4da7b2f',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6421496-41c4-4b3d-ae2b-a35a35a2fae0' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Sequence')) BEGIN
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
            'd6421496-41c4-4b3d-ae2b-a35a35a2fae0',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88e614b2-5717-4fb2-b7ae-9b09aa02206c' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Configuration')) BEGIN
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
            '88e614b2-5717-4fb2-b7ae-9b09aa02206c',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42b12ae5-bb2f-4554-bedd-0b71a199c409' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'Status')) BEGIN
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
            '42b12ae5-bb2f-4554-bedd-0b71a199c409',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4efe9b99-47bc-43a1-8a97-ce70a626e168' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4efe9b99-47bc-43a1-8a97-ce70a626e168',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '753b52da-2368-4582-8988-e2047391f88e' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '753b52da-2368-4582-8988-e2047391f88e',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '952ac623-01e2-4169-97c5-ae4bd3bc5b00' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'ID')) BEGIN
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
            '952ac623-01e2-4169-97c5-ae4bd3bc5b00',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6b48b88-67f8-4a24-b5cf-52e931039add' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'IntegrationID')) BEGIN
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
            'f6b48b88-67f8-4a24-b5cf-52e931039add',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1101e0f3-dd2e-45cc-a8d5-6a85c661a33b' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Name')) BEGIN
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
            '1101e0f3-dd2e-45cc-a8d5-6a85c661a33b',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23a830da-a0d6-434a-a5d9-42a36a6bea49' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'DisplayName')) BEGIN
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
            '23a830da-a0d6-434a-a5d9-42a36a6bea49',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6e1a3b9-952d-461b-9fff-1d4bb11014d5' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Description')) BEGIN
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
            'd6e1a3b9-952d-461b-9fff-1d4bb11014d5',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5869926-6849-4935-bf80-cd42946e70f4' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Category')) BEGIN
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
            'd5869926-6849-4935-bf80-cd42946e70f4',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a6aeeb8-3b33-4f26-9603-3dc602951680' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'APIPath')) BEGIN
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
            '0a6aeeb8-3b33-4f26-9603-3dc602951680',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '916eeff8-7f1e-4e01-950a-4dbd79f01177' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'ResponseDataKey')) BEGIN
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
            '916eeff8-7f1e-4e01-950a-4dbd79f01177',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ef38d90-fe1e-42a0-9ac6-9ac34f76b3f7' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'DefaultPageSize')) BEGIN
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
            '5ef38d90-fe1e-42a0-9ac6-9ac34f76b3f7',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a3ceb60-380b-44ea-bbcd-e9029f3e1aa4' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'SupportsPagination')) BEGIN
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
            '6a3ceb60-380b-44ea-bbcd-e9029f3e1aa4',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '707feee6-a58b-466e-ba6a-04a7322ef2de' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'PaginationType')) BEGIN
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
            '707feee6-a58b-466e-ba6a-04a7322ef2de',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dddf958-0fcd-4413-8bfa-107f8e6d1659' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'SupportsIncrementalSync')) BEGIN
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
            '1dddf958-0fcd-4413-8bfa-107f8e6d1659',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf91194f-744d-4cf6-80bd-ceab34643678' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'SupportsWrite')) BEGIN
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
            'bf91194f-744d-4cf6-80bd-ceab34643678',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7938992b-adb1-44fb-bf0d-9bcd140d08f2' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'DefaultQueryParams')) BEGIN
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
            '7938992b-adb1-44fb-bf0d-9bcd140d08f2',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '138a2d66-fdcb-4170-be65-75ae0dc8a9b1' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Configuration')) BEGIN
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
            '138a2d66-fdcb-4170-be65-75ae0dc8a9b1',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9178b46c-0150-45d1-a9b9-d52d190afa0c' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Sequence')) BEGIN
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
            '9178b46c-0150-45d1-a9b9-d52d190afa0c',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f31c7be-3356-40c4-aa87-8d0ed03bd24d' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Status')) BEGIN
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
            '0f31c7be-3356-40c4-aa87-8d0ed03bd24d',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70ad8587-b21a-4a23-b5b4-68582461f339' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '70ad8587-b21a-4a23-b5b4-68582461f339',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '542bafe0-6988-4366-b23c-8efa167f8080' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '542bafe0-6988-4366-b23c-8efa167f8080',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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

/* SQL text to insert entity field value with ID d748408f-cf2e-40cf-9bd6-405b5b5da26e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d748408f-cf2e-40cf-9bd6-405b5b5da26e', '707FEEE6-A58B-466E-BA6A-04A7322EF2DE', 1, 'Cursor', 'Cursor', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 156d4663-9c3a-451a-917f-3d03474b5429 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('156d4663-9c3a-451a-917f-3d03474b5429', '707FEEE6-A58B-466E-BA6A-04A7322EF2DE', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 82607fb8-c597-4130-9257-56d33499df56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82607fb8-c597-4130-9257-56d33499df56', '707FEEE6-A58B-466E-BA6A-04A7322EF2DE', 3, 'Offset', 'Offset', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 8b3ae715-9aed-4e53-82fd-832bdf209fc6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8b3ae715-9aed-4e53-82fd-832bdf209fc6', '707FEEE6-A58B-466E-BA6A-04A7322EF2DE', 4, 'PageNumber', 'PageNumber', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 707FEEE6-A58B-466E-BA6A-04A7322EF2DE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='707FEEE6-A58B-466E-BA6A-04A7322EF2DE'

/* SQL text to insert entity field value with ID 8a087d38-2b46-4b11-81cc-cbd61dd6095a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8a087d38-2b46-4b11-81cc-cbd61dd6095a', '0F31C7BE-3356-40C4-AA87-8D0ED03BD24D', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID af6b1ea5-d1eb-416e-be7e-70cfc9e528cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af6b1ea5-d1eb-416e-be7e-70cfc9e528cc', '0F31C7BE-3356-40C4-AA87-8D0ED03BD24D', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7d64a741-86b3-41cd-a99d-1f56c31e8b95 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7d64a741-86b3-41cd-a99d-1f56c31e8b95', '0F31C7BE-3356-40C4-AA87-8D0ED03BD24D', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 0F31C7BE-3356-40C4-AA87-8D0ED03BD24D */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0F31C7BE-3356-40C4-AA87-8D0ED03BD24D'

/* SQL text to insert entity field value with ID e50a7929-b98c-4325-875b-2dd675500893 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e50a7929-b98c-4325-875b-2dd675500893', '42B12AE5-BB2F-4554-BEDD-0B71A199C409', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7a9c7d01-9489-4849-bd15-1a55f04a9fbd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7a9c7d01-9489-4849-bd15-1a55f04a9fbd', '42B12AE5-BB2F-4554-BEDD-0B71A199C409', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID db35f0f3-ee02-4b6e-8685-09bc787de1f0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('db35f0f3-ee02-4b6e-8685-09bc787de1f0', '42B12AE5-BB2F-4554-BEDD-0B71A199C409', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 42B12AE5-BB2F-4554-BEDD-0B71A199C409 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='42B12AE5-BB2F-4554-BEDD-0B71A199C409'


/* Create Entity Relationship: MJ: Integrations -> MJ: Integration Objects (One To Many via IntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e0a886d5-0259-4cdc-9c97-71f5d45f9a99'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e0a886d5-0259-4cdc-9c97-71f5d45f9a99', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'A376650B-0958-4B75-8122-E3BD4E2085F2', 'IntegrationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Integration Objects -> MJ: Integration Object Fields (One To Many via IntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '80f944f7-082c-4c89-be3c-dc6cc3e90896'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('80f944f7-082c-4c89-be3c-dc6cc3e90896', 'A376650B-0958-4B75-8122-E3BD4E2085F2', '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', 'IntegrationObjectID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Integration Objects -> MJ: Integration Object Fields (One To Many via RelatedIntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'da1ba76c-cc4c-4da7-bbb9-f44c6c7d8b3d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('da1ba76c-cc4c-4da7-bbb9-f44c6c7d8b3d', 'A376650B-0958-4B75-8122-E3BD4E2085F2', '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', 'RelatedIntegrationObjectID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

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

/* SQL text to update entity field related entity name field map for entity field ID D0F0963D-7634-4460-A239-A016D7D1C914 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D0F0963D-7634-4460-A239-A016D7D1C914', @RelatedEntityNameFieldMap='IntegrationObject'

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

/* SQL text to update entity field related entity name field map for entity field ID F6B48B88-67F8-4A24-B5CF-52E931039ADD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F6B48B88-67F8-4A24-B5CF-52E931039ADD', @RelatedEntityNameFieldMap='Integration'

/* SQL text to update entity field related entity name field map for entity field ID 8B22F876-9B5D-42F2-9377-D64049FA9467 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8B22F876-9B5D-42F2-9377-D64049FA9467', @RelatedEntityNameFieldMap='RelatedIntegrationObject'

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '499e59d2-77ee-4e7e-8690-ca1d38e5ea47' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'IntegrationObject')) BEGIN
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
            '499e59d2-77ee-4e7e-8690-ca1d38e5ea47',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a17d910-b127-4f73-b6ec-8338c2613ac7' OR (EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B' AND Name = 'RelatedIntegrationObject')) BEGIN
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
            '0a17d910-b127-4f73-b6ec-8338c2613ac7',
            '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', -- Entity: MJ: Integration Object Fields
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '184644d6-4079-425e-9cf8-d54c1d8339ef' OR (EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2' AND Name = 'Integration')) BEGIN
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
            '184644d6-4079-425e-9cf8-d54c1d8339ef',
            'A376650B-0958-4B75-8122-E3BD4E2085F2', -- Entity: MJ: Integration Objects
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
            SET IsNameField = 1
            WHERE ID = '23A830DA-A0D6-434A-A5D9-42A36A6BEA49'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '23A830DA-A0D6-434A-A5D9-42A36A6BEA49'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D5869926-6849-4935-BF80-CD42946E70F4'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9178B46C-0150-45D1-A9B9-D52D190AFA0C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0F31C7BE-3356-40C4-AA87-8D0ED03BD24D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '184644D6-4079-425E-9CF8-D54C1D8339EF'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '23A830DA-A0D6-434A-A5D9-42A36A6BEA49'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D5869926-6849-4935-BF80-CD42946E70F4'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0A6AEEB8-3B33-4F26-9603-3DC602951680'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].[EntityField]
            SET IsNameField = 1
            WHERE ID = '3F6894BD-7EB1-44DF-920C-042BEDA7D05D'
            AND AutoUpdateIsNameField = 1
         

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3F6894BD-7EB1-44DF-920C-042BEDA7D05D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C51BF160-471D-4FBD-AE8A-F0F8B90386E6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D6421496-41C4-4B3D-AE2B-A35A35A2FAE0'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '42B12AE5-BB2F-4554-BEDD-0B71A199C409'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '499E59D2-77EE-4E7E-8690-CA1D38E5EA47'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '3F6894BD-7EB1-44DF-920C-042BEDA7D05D'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4A7C00A9-EBFD-4F82-B5A6-D54842E0F8AD'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '35153B4C-BF7A-45DC-8E6C-8EECA3F68F98'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C51BF160-471D-4FBD-AE8A-F0F8B90386E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '499E59D2-77EE-4E7E-8690-CA1D38E5EA47'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 25 fields */

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1F26C73-2300-40E8-ADA7-6485522B2DF2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Relationships',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0F0963D-7634-4460-A239-A016D7D1C914' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Field Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A2088A6-CCC0-42ED-A697-05B4487DC24A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F6894BD-7EB1-44DF-920C-042BEDA7D05D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A7C00A9-EBFD-4F82-B5A6-D54842E0F8AD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'UI Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35153B4C-BF7A-45DC-8E6C-8EECA3F68F98' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Data Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C51BF160-471D-4FBD-AE8A-F0F8B90386E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Length 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A9DACBC5-E435-43A8-BE69-7722CFA90DB1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFE3880C-798D-4DB5-BDC5-23A66C9A0144' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '797522B4-4C34-497C-8FB3-D2878B1998A5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.AllowsNull 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91B7E80A-2156-48CD-9365-1DDB4B933069' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5C0EA6FA-F274-47A1-8F7E-180535926A0A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Key',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEF5C1E5-550C-4D0E-9562-D569A60FE679' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsUniqueKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Unique Key',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3EFFCAF7-6B7B-40A2-8303-1207CD5D78CC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Read Only',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09FDE9AE-1ADC-4EA0-91F9-02E901769A63' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IsRequired 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Required',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7A00D310-7159-4A80-8DE9-2BACB8538E2F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Object ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B22F876-9B5D-42F2-9377-D64049FA9467' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObjectFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Field Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D4A9FBE-DC9C-49DF-A0EE-484AD4DA7B2F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6421496-41C4-4B3D-AE2B-A35A35A2FAE0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '88E614B2-5717-4FB2-B7AE-9B09AA02206C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Field Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42B12AE5-BB2F-4554-BEDD-0B71A199C409' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4EFE9B99-47BC-43A1-8A97-CE70A626E168' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '753B52DA-2368-4582-8988-E2047391F88E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.IntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Relationships',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '499E59D2-77EE-4E7E-8690-CA1D38E5EA47' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Object Fields.RelatedIntegrationObject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Integration Relationships',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A17D910-B127-4F73-B6EC-8338C2613AC7' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-columns */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-columns', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ec7e812a-ebd6-4fc3-8f9b-d26af2e5427f', '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', 'FieldCategoryInfo', '{"Field Details":{"icon":"fa fa-info-circle","description":"Basic identification and descriptive information for the integration field"},"Data Specifications":{"icon":"fa fa-database","description":"Technical data types, constraints, and validation rules for the field"},"Integration Relationships":{"icon":"fa fa-link","description":"Mappings and links to other integration objects and external systems"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields and system-level configurations"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('435d2f9d-f795-4c05-b933-d47d77582534', '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B', 'FieldCategoryIcons', '{"Field Details":"fa fa-info-circle","Data Specifications":"fa fa-database","Integration Relationships":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3CC4ADCA-CE0C-47E9-AA8D-0B7C43E3458B'
      

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Integration Objects.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '952AC623-01E2-4169-97C5-AE4BD3BC5B00' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6B48B88-67F8-4A24-B5CF-52E931039ADD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Integration Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '184644D6-4079-425E-9CF8-D54C1D8339EF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Internal Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1101E0F3-DD2E-45CC-A8D5-6A85C661A33B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23A830DA-A0D6-434A-A5D9-42A36A6BEA49' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6E1A3B9-952D-461B-9FFF-1D4BB11014D5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'UI Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5869926-6849-4935-BF80-CD42946E70F4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F31C7BE-3356-40C4-AA87-8D0ED03BD24D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Object Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9178B46C-0150-45D1-A9B9-D52D190AFA0C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.APIPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A6AEEB8-3B33-4F26-9603-3DC602951680' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.ResponseDataKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '916EEFF8-7F1E-4E01-950A-4DBD79F01177' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultQueryParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Query Parameters',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7938992B-ADB1-44FB-BF0D-9BCD140D08F2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '138A2D66-FDCB-4170-BE65-75AE0DC8A9B1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsPagination 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A3CEB60-380B-44EA-BBCD-E9029F3E1AA4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.PaginationType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '707FEEE6-A58B-466E-BA6A-04A7322EF2DE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.DefaultPageSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EF38D90-FE1E-42A0-9AC6-9AC34F76B3F7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsIncrementalSync 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1DDDF958-0FCD-4413-8BFA-107F8E6D1659' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.SupportsWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Sync Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF91194F-744D-4CF6-80BD-CEAB34643678' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70AD8587-B21A-4A23-B5B4-68582461F339' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '542BAFE0-6988-4366-B23C-8EFA167F8080' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-plug */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-plug', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'A376650B-0958-4B75-8122-E3BD4E2085F2'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7ee33511-ab63-4994-a3f3-c256c015be84', 'A376650B-0958-4B75-8122-E3BD4E2085F2', 'FieldCategoryInfo', '{"Object Definition":{"icon":"fa fa-id-card","description":"Basic identification, labeling, and status information for the external integration object."},"API Configuration":{"icon":"fa fa-network-wired","description":"Technical endpoint details, JSON path keys, and request parameters required for connectivity."},"Sync Settings":{"icon":"fa fa-sync-alt","description":"Configuration for data transfer behaviors including pagination, incremental sync, and write-back capabilities."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system-managed audit fields and record timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('26093912-d400-45a8-b005-42ed77f56edd', 'A376650B-0958-4B75-8122-E3BD4E2085F2', 'FieldCategoryIcons', '{"Object Definition":"fa fa-id-card","API Configuration":"fa fa-network-wired","Sync Settings":"fa fa-sync-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'A376650B-0958-4B75-8122-E3BD4E2085F2'
      

/* Generated Validation Functions for MJ: Company Integrations */
-- CHECK constraint for MJ: Company Integrations @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([ScheduleType]=''Cron'' OR [ScheduleType]=''Interval'' OR [ScheduleType]=''Manual'')', 'public ValidateScheduleTypeAllowedValues(result: ValidationResult) {
	if (this.ScheduleType != null) {
		const allowed = ["Cron", "Interval", "Manual"];
		if (allowed.indexOf(this.ScheduleType) === -1) {
			result.Errors.push(new ValidationErrorInfo(
				"ScheduleType",
				"Schedule Type must be one of the following values: " + allowed.join(", ") + ".",
				this.ScheduleType,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The schedule type must be set to ''Cron'', ''Interval'', or ''Manual'' to ensure the system knows how to properly trigger the integration.', 'ValidateScheduleTypeAllowedValues', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DE238F34-2837-EF11-86D4-6045BDEE16E6');
  
            

