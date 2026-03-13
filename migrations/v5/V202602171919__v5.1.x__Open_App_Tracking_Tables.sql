-- Migration: Open App tracking tables
-- These tables live in the __mj core schema and are part of MemberJunction itself,
-- not part of any individual app. They track what Open Apps are installed in this instance.

-----------------------------------------------------------------------
-- 1. Open Apps
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.OpenApp (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(64) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Version NVARCHAR(50) NOT NULL,
    Publisher NVARCHAR(200) NOT NULL,
    PublisherEmail NVARCHAR(255) NULL,
    PublisherURL NVARCHAR(500) NULL,
    RepositoryURL NVARCHAR(500) NOT NULL,
    SchemaName NVARCHAR(128) NULL,
    MJVersionRange NVARCHAR(100) NOT NULL,
    License NVARCHAR(50) NULL,
    Icon NVARCHAR(100) NULL,
    Color NVARCHAR(20) NULL,
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    ConfigurationSchemaJSON NVARCHAR(MAX) NULL,
    InstalledByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_OpenApp PRIMARY KEY (ID),
    CONSTRAINT UQ_OpenApp_Name UNIQUE (Name),
    CONSTRAINT UQ_OpenApp_Schema UNIQUE (SchemaName),
    CONSTRAINT FK_OpenApp_User FOREIGN KEY (InstalledByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_OpenApp_Status CHECK (Status IN (
        'Active', 'Disabled', 'Error', 'Installing', 'Upgrading', 'Removing', 'Removed'
    )),
    CONSTRAINT CK_OpenApp_Name CHECK (Name NOT LIKE '%[^a-z0-9-]%')
);
GO

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks all MJ Open Apps installed in this instance',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp';
GO

-- Column descriptions (skipping PK and FK columns — self-documenting via constraints)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique lowercase identifier for the app (e.g. acme-crm). Must contain only lowercase letters, digits, and hyphens.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable display name shown in the UI (e.g. Acme CRM)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'DisplayName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional long description of what this app does',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Currently installed semver version string (e.g. 1.2.3)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Version';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the organization or individual who published the app',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Publisher';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional contact email for the publisher',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'PublisherEmail';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional website URL for the publisher',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'PublisherURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'GitHub repository URL where this app is hosted',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'RepositoryURL';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Database schema name used by this app for its tables and objects. Unique per instance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'SchemaName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Semver range specifying which MJ versions this app is compatible with (e.g. >=4.0.0 <5.0.0)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'MJVersionRange';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'SPDX license identifier for this app (e.g. MIT, Apache-2.0)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'License';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional icon identifier (e.g. Font Awesome class) for UI display',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Icon';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional hex color code for branding in the UI (e.g. #FF5733)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Color';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full mj-app.json manifest stored as JSON for the currently installed version',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'ManifestJSON';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON Schema defining the configuration options this app accepts',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'ConfigurationSchemaJSON';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle status of the app: Active, Disabled, Error, Installing, Upgrading, Removing, or Removed',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

-----------------------------------------------------------------------
-- 2. Open App Install History (audit trail)
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.OpenAppInstallHistory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OpenAppID UNIQUEIDENTIFIER NOT NULL,
    Version NVARCHAR(50) NOT NULL,
    PreviousVersion NVARCHAR(50) NULL,
    Action NVARCHAR(20) NOT NULL,
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    Summary NVARCHAR(MAX) NULL,
    ExecutedByUserID UNIQUEIDENTIFIER NOT NULL,
    DurationSeconds INT NULL,
    StartedAt DATETIMEOFFSET NULL,
    EndedAt DATETIMEOFFSET NULL,
    Success BIT NOT NULL DEFAULT 1,
    ErrorMessage NVARCHAR(MAX) NULL,
    ErrorPhase NVARCHAR(50) NULL,
    CONSTRAINT PK_OpenAppInstallHistory PRIMARY KEY (ID),
    CONSTRAINT FK_OpenAppInstallHistory_App FOREIGN KEY (OpenAppID)
        REFERENCES ${flyway:defaultSchema}.OpenApp(ID),
    CONSTRAINT FK_OpenAppInstallHistory_User FOREIGN KEY (ExecutedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_OpenAppInstallHistory_Action CHECK (Action IN (
        'Install', 'Upgrade', 'Remove'
    )),
    CONSTRAINT CK_OpenAppInstallHistory_Phase CHECK (ErrorPhase IS NULL OR ErrorPhase IN (
        'Schema', 'Migration', 'Packages', 'Config', 'Hooks', 'Record'
    ))
);
GO

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail of every install, upgrade, and removal for Open Apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory';
GO

-- Column descriptions (skipping PK and FK columns)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Semver version that was installed or upgraded to in this operation',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'Version';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Version that was installed before this operation (NULL for initial installs)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'PreviousVersion';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of operation performed: Install, Upgrade, or Remove',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'Action';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Snapshot of the mj-app.json manifest at the time of this operation',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'ManifestJSON';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable summary of what happened during this operation',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'Summary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total wall-clock seconds the operation took to complete',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'DurationSeconds';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the operation began',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'StartedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the operation completed (success or failure)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'EndedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the operation completed successfully (1) or failed (0)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'Success';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed error message if the operation failed',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'ErrorMessage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which phase of the operation failed: Schema, Migration, Packages, Config, Hooks, or Record',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory',
    @level2type = N'COLUMN', @level2name = N'ErrorPhase';
GO

-----------------------------------------------------------------------
-- 3. Open App Dependencies
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.OpenAppDependency (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OpenAppID UNIQUEIDENTIFIER NOT NULL,
    DependsOnAppName NVARCHAR(64) NOT NULL,
    DependsOnAppID UNIQUEIDENTIFIER NULL,
    VersionRange NVARCHAR(100) NOT NULL,
    InstalledVersion NVARCHAR(50) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Satisfied',
    CONSTRAINT PK_OpenAppDependency PRIMARY KEY (ID),
    CONSTRAINT FK_OpenAppDep_App FOREIGN KEY (OpenAppID)
        REFERENCES ${flyway:defaultSchema}.OpenApp(ID),
    CONSTRAINT FK_OpenAppDep_DepApp FOREIGN KEY (DependsOnAppID)
        REFERENCES ${flyway:defaultSchema}.OpenApp(ID),
    CONSTRAINT UQ_OpenAppDep UNIQUE (OpenAppID, DependsOnAppName),
    CONSTRAINT CK_OpenAppDep_Status CHECK (Status IN (
        'Satisfied', 'Missing', 'Incompatible'
    ))
);
GO

-- Table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Inter-app dependency relationships between installed Open Apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency';
GO

-- Column descriptions (skipping PK and FK columns)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the app that this app depends on (matches OpenApp.Name)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency',
    @level2type = N'COLUMN', @level2name = N'DependsOnAppName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Semver range specifying which versions of the dependency are acceptable (e.g. ^1.0.0)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency',
    @level2type = N'COLUMN', @level2name = N'VersionRange';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual installed version of the dependency (NULL if not yet installed)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency',
    @level2type = N'COLUMN', @level2name = N'InstalledVersion';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the dependency is satisfied: Satisfied, Missing, or Incompatible',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency',
    @level2type = N'COLUMN', @level2name = N'Status';
GO





















































-- CODEGEN OUTPUT --
/* SQL generated to create new entity MJ: Open Apps */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'ac4a2799-454b-4395-aa56-a42241f32c12',
         'MJ: Open Apps',
         'Open Apps',
         NULL,
         NULL,
         'OpenApp',
         'vwOpenApps',
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
      )
   

/* SQL generated to add new entity MJ: Open Apps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ac4a2799-454b-4395-aa56-a42241f32c12', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open Apps for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ac4a2799-454b-4395-aa56-a42241f32c12', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open Apps for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ac4a2799-454b-4395-aa56-a42241f32c12', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open Apps for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ac4a2799-454b-4395-aa56-a42241f32c12', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Open App Install Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '0fcff292-3e37-42bb-b5c3-e7751ef9b875',
         'MJ: Open App Install Histories',
         'Open App Install Histories',
         NULL,
         NULL,
         'OpenAppInstallHistory',
         'vwOpenAppInstallHistories',
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
      )
   

/* SQL generated to add new entity MJ: Open App Install Histories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0fcff292-3e37-42bb-b5c3-e7751ef9b875', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0fcff292-3e37-42bb-b5c3-e7751ef9b875', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0fcff292-3e37-42bb-b5c3-e7751ef9b875', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open App Install Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0fcff292-3e37-42bb-b5c3-e7751ef9b875', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Open App Dependencies */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '57a740fa-ce0f-440b-8b90-6bf2bb9440de',
         'MJ: Open App Dependencies',
         'Open App Dependencies',
         NULL,
         NULL,
         'OpenAppDependency',
         'vwOpenAppDependencies',
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
      )
   

/* SQL generated to add new entity MJ: Open App Dependencies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57a740fa-ce0f-440b-8b90-6bf2bb9440de', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('57a740fa-ce0f-440b-8b90-6bf2bb9440de', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('57a740fa-ce0f-440b-8b90-6bf2bb9440de', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Open App Dependencies for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('57a740fa-ce0f-440b-8b90-6bf2bb9440de', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OpenAppDependency */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppDependency] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OpenAppDependency */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppDependency] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OpenApp */
ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OpenApp */
ALTER TABLE [${flyway:defaultSchema}].[OpenApp] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OpenAppInstallHistory */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppInstallHistory] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OpenAppInstallHistory */
ALTER TABLE [${flyway:defaultSchema}].[OpenAppInstallHistory] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '93528c37-1530-453b-8a5c-3dfc5c7825fd'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '93528c37-1530-453b-8a5c-3dfc5c7825fd',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5c270696-51c2-451f-88b4-8e99f1de57fa'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'OpenAppID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5c270696-51c2-451f-88b4-8e99f1de57fa',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100002,
            'OpenAppID',
            'Open App ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'AC4A2799-454B-4395-AA56-A42241F32C12',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c698c8d9-54f9-4ada-be93-74863a865572'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'DependsOnAppName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c698c8d9-54f9-4ada-be93-74863a865572',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100003,
            'DependsOnAppName',
            'Depends On App Name',
            'Name of the app that this app depends on (matches OpenApp.Name)',
            'nvarchar',
            128,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '542dcb06-633a-4c84-8e32-d38390250821'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'DependsOnAppID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '542dcb06-633a-4c84-8e32-d38390250821',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100004,
            'DependsOnAppID',
            'Depends On App ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'AC4A2799-454B-4395-AA56-A42241F32C12',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5a532892-61d9-4a21-b13e-e0515b153022'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'VersionRange')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a532892-61d9-4a21-b13e-e0515b153022',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100005,
            'VersionRange',
            'Version Range',
            'Semver range specifying which versions of the dependency are acceptable (e.g. ^1.0.0)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ab40b6e0-9247-4c1a-b042-e6e522b8a496'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'InstalledVersion')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ab40b6e0-9247-4c1a-b042-e6e522b8a496',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100006,
            'InstalledVersion',
            'Installed Version',
            'Actual installed version of the dependency (NULL if not yet installed)',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f6bca0fe-d58b-4356-9c80-f0468fd9398e'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f6bca0fe-d58b-4356-9c80-f0468fd9398e',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100007,
            'Status',
            'Status',
            'Whether the dependency is satisfied: Satisfied, Missing, or Incompatible',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Satisfied',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '05af039a-db95-4c18-89b0-c309b6211c3c'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '05af039a-db95-4c18-89b0-c309b6211c3c',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b040b769-17f4-407f-8589-27600340936f'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b040b769-17f4-407f-8589-27600340936f',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7655de67-050c-4fec-833f-3b3fe61e2451'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7655de67-050c-4fec-833f-3b3fe61e2451',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6ac413dc-ebe1-4dfc-9be4-8e44377b7f46'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6ac413dc-ebe1-4dfc-9be4-8e44377b7f46',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100002,
            'Name',
            'Name',
            'Unique lowercase identifier for the app (e.g. acme-crm). Must contain only lowercase letters, digits, and hyphens.',
            'nvarchar',
            128,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '27e04775-d00d-4d25-a076-4a6ff0205260'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'DisplayName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27e04775-d00d-4d25-a076-4a6ff0205260',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100003,
            'DisplayName',
            'Display Name',
            'Human-readable display name shown in the UI (e.g. Acme CRM)',
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3849db2d-73c2-46bf-b263-af66d6a0b34d'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3849db2d-73c2-46bf-b263-af66d6a0b34d',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100004,
            'Description',
            'Description',
            'Optional long description of what this app does',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'abe2e189-4467-4e98-87c5-b209d656438b'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Version')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'abe2e189-4467-4e98-87c5-b209d656438b',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100005,
            'Version',
            'Version',
            'Currently installed semver version string (e.g. 1.2.3)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bf1ac3d5-615d-4c91-aff7-6a9c88bc6d26'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Publisher')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bf1ac3d5-615d-4c91-aff7-6a9c88bc6d26',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100006,
            'Publisher',
            'Publisher',
            'Name of the organization or individual who published the app',
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0f40cc6a-b28a-4b49-af23-befe1b9907d3'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'PublisherEmail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0f40cc6a-b28a-4b49-af23-befe1b9907d3',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100007,
            'PublisherEmail',
            'Publisher Email',
            'Optional contact email for the publisher',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f099ed4e-387c-4f5e-87a7-5272516719d1'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'PublisherURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f099ed4e-387c-4f5e-87a7-5272516719d1',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100008,
            'PublisherURL',
            'Publisher URL',
            'Optional website URL for the publisher',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '132cf4b3-e5e5-4083-b91d-1a629352872b'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'RepositoryURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '132cf4b3-e5e5-4083-b91d-1a629352872b',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100009,
            'RepositoryURL',
            'Repository URL',
            'GitHub repository URL where this app is hosted',
            'nvarchar',
            1000,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd8a2781a-95c0-4335-81b6-0021b7078e06'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'SchemaName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd8a2781a-95c0-4335-81b6-0021b7078e06',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100010,
            'SchemaName',
            'Schema Name',
            'Database schema name used by this app for its tables and objects. Unique per instance.',
            'nvarchar',
            256,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0a1465db-2055-46ab-93d8-a70dd2245102'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'MJVersionRange')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0a1465db-2055-46ab-93d8-a70dd2245102',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100011,
            'MJVersionRange',
            'MJ Version Range',
            'Semver range specifying which MJ versions this app is compatible with (e.g. >=4.0.0 <5.0.0)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8721ceb2-e802-4c49-bbfc-bf6aeb51544b'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'License')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8721ceb2-e802-4c49-bbfc-bf6aeb51544b',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100012,
            'License',
            'License',
            'SPDX license identifier for this app (e.g. MIT, Apache-2.0)',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '19cd1851-4da5-43e7-bce7-175f1248eb26'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Icon')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '19cd1851-4da5-43e7-bce7-175f1248eb26',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100013,
            'Icon',
            'Icon',
            'Optional icon identifier (e.g. Font Awesome class) for UI display',
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a8a25dc2-66a9-4338-8cd5-c169f940372e'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Color')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a8a25dc2-66a9-4338-8cd5-c169f940372e',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100014,
            'Color',
            'Color',
            'Optional hex color code for branding in the UI (e.g. #FF5733)',
            'nvarchar',
            40,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b37c9605-c957-4a09-acc6-2862c1a86d67'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'ManifestJSON')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b37c9605-c957-4a09-acc6-2862c1a86d67',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100015,
            'ManifestJSON',
            'Manifest JSON',
            'Full mj-app.json manifest stored as JSON for the currently installed version',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '519a5582-4618-4138-b19c-1713064cc457'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'ConfigurationSchemaJSON')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '519a5582-4618-4138-b19c-1713064cc457',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100016,
            'ConfigurationSchemaJSON',
            'Configuration Schema JSON',
            'Optional JSON Schema defining the configuration options this app accepts',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a47e36f4-7942-4a8b-9735-72f74b07c618'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'InstalledByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a47e36f4-7942-4a8b-9735-72f74b07c618',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100017,
            'InstalledByUserID',
            'Installed By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f96177d9-9802-44f6-a6c4-9e8ba2116bab'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f96177d9-9802-44f6-a6c4-9e8ba2116bab',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100018,
            'Status',
            'Status',
            'Current lifecycle status of the app: Active, Disabled, Error, Installing, Upgrading, Removing, or Removed',
            'nvarchar',
            40,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8416b44a-1a4d-4d48-ac1f-5831d14dfa12'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8416b44a-1a4d-4d48-ac1f-5831d14dfa12',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100019,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '12a25c96-e439-471a-ab5d-e190a3ffc957'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '12a25c96-e439-471a-ab5d-e190a3ffc957',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100020,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6d1744ce-eeeb-42bf-b28b-a11792a71bdd'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6d1744ce-eeeb-42bf-b28b-a11792a71bdd',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2efced4c-6d5d-44e5-94d6-579d5a9ab715'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'OpenAppID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2efced4c-6d5d-44e5-94d6-579d5a9ab715',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100002,
            'OpenAppID',
            'Open App ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'AC4A2799-454B-4395-AA56-A42241F32C12',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '428f3b7c-9739-4b55-973d-eefd321e8b39'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'Version')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '428f3b7c-9739-4b55-973d-eefd321e8b39',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100003,
            'Version',
            'Version',
            'Semver version that was installed or upgraded to in this operation',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4d60aa68-feb5-4330-a568-9a7616ca8446'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'PreviousVersion')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4d60aa68-feb5-4330-a568-9a7616ca8446',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100004,
            'PreviousVersion',
            'Previous Version',
            'Version that was installed before this operation (NULL for initial installs)',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '418e9648-0eaa-4d37-aee2-49b204c8ad89'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'Action')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '418e9648-0eaa-4d37-aee2-49b204c8ad89',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100005,
            'Action',
            'Action',
            'Type of operation performed: Install, Upgrade, or Remove',
            'nvarchar',
            40,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fb44993b-77ca-44ac-995a-9a3283759941'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'ManifestJSON')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fb44993b-77ca-44ac-995a-9a3283759941',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100006,
            'ManifestJSON',
            'Manifest JSON',
            'Snapshot of the mj-app.json manifest at the time of this operation',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '13964cae-99b6-4a82-a8ea-a57452e2afca'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'Summary')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '13964cae-99b6-4a82-a8ea-a57452e2afca',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100007,
            'Summary',
            'Summary',
            'Human-readable summary of what happened during this operation',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d4ec1c7-d177-454e-93ff-c97ab42bddff'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'ExecutedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d4ec1c7-d177-454e-93ff-c97ab42bddff',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100008,
            'ExecutedByUserID',
            'Executed By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e369a9c1-d637-4798-a5cc-79c93ec73029'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'DurationSeconds')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e369a9c1-d637-4798-a5cc-79c93ec73029',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100009,
            'DurationSeconds',
            'Duration Seconds',
            'Total wall-clock seconds the operation took to complete',
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4bbc4c22-3b9e-4632-a217-0abd0392afbe'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'StartedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4bbc4c22-3b9e-4632-a217-0abd0392afbe',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100010,
            'StartedAt',
            'Started At',
            'Timestamp when the operation began',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '254f11c7-e80a-49c9-89b7-2305a482920c'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'EndedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '254f11c7-e80a-49c9-89b7-2305a482920c',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100011,
            'EndedAt',
            'Ended At',
            'Timestamp when the operation completed (success or failure)',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '276b0477-74d2-43c7-9836-99a70decdd44'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'Success')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '276b0477-74d2-43c7-9836-99a70decdd44',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100012,
            'Success',
            'Success',
            'Whether the operation completed successfully (1) or failed (0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2b1fa518-5351-4449-8e5e-2904f7186e7e'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'ErrorMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2b1fa518-5351-4449-8e5e-2904f7186e7e',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100013,
            'ErrorMessage',
            'Error Message',
            'Detailed error message if the operation failed',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f26b581d-f6e3-47ba-bbbc-167e0f8e5867'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'ErrorPhase')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f26b581d-f6e3-47ba-bbbc-167e0f8e5867',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100014,
            'ErrorPhase',
            'Error Phase',
            'Which phase of the operation failed: Schema, Migration, Packages, Config, Hooks, or Record',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd9441101-7b59-4a75-8627-39aa40ab657f'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd9441101-7b59-4a75-8627-39aa40ab657f',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100015,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '724bc32b-7c1c-4e0f-9372-d6916372a729'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '724bc32b-7c1c-4e0f-9372-d6916372a729',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100016,
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
            'Search'
         )
      END

/* SQL text to insert entity field value with ID 4dabd128-c970-4fe9-aa10-42dcdef3e687 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4dabd128-c970-4fe9-aa10-42dcdef3e687', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 89e0c912-ed96-4005-915a-6c88e1bbdbab */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('89e0c912-ed96-4005-915a-6c88e1bbdbab', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 2, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID d62f5ca8-0c50-439d-9afa-7d74ad3e55b3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d62f5ca8-0c50-439d-9afa-7d74ad3e55b3', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 3, 'Error', 'Error')

/* SQL text to insert entity field value with ID dc4fd238-6204-430a-b095-950c93c1ecd9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('dc4fd238-6204-430a-b095-950c93c1ecd9', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 4, 'Installing', 'Installing')

/* SQL text to insert entity field value with ID 370e4855-bc2e-46c2-b57c-5b7aa38f8474 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('370e4855-bc2e-46c2-b57c-5b7aa38f8474', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 5, 'Removed', 'Removed')

/* SQL text to insert entity field value with ID f4dcc7a8-6ca6-4508-af98-60fde4fadb1c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f4dcc7a8-6ca6-4508-af98-60fde4fadb1c', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 6, 'Removing', 'Removing')

/* SQL text to insert entity field value with ID 26ed1bb0-ee7c-4553-a227-b02028687b5f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('26ed1bb0-ee7c-4553-a227-b02028687b5f', 'F96177D9-9802-44F6-A6C4-9E8BA2116BAB', 7, 'Upgrading', 'Upgrading')

/* SQL text to update ValueListType for entity field ID F96177D9-9802-44F6-A6C4-9E8BA2116BAB */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F96177D9-9802-44F6-A6C4-9E8BA2116BAB'

/* SQL text to insert entity field value with ID 6071c527-a0fc-4b5b-a157-b774b8afbc88 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6071c527-a0fc-4b5b-a157-b774b8afbc88', '418E9648-0EAA-4D37-AEE2-49B204C8AD89', 1, 'Install', 'Install')

/* SQL text to insert entity field value with ID ec783aa6-9671-4969-b1ca-6e0143a63ce5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ec783aa6-9671-4969-b1ca-6e0143a63ce5', '418E9648-0EAA-4D37-AEE2-49B204C8AD89', 2, 'Remove', 'Remove')

/* SQL text to insert entity field value with ID 0199797e-c718-4b05-bb0e-7316c093b330 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0199797e-c718-4b05-bb0e-7316c093b330', '418E9648-0EAA-4D37-AEE2-49B204C8AD89', 3, 'Upgrade', 'Upgrade')

/* SQL text to update ValueListType for entity field ID 418E9648-0EAA-4D37-AEE2-49B204C8AD89 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='418E9648-0EAA-4D37-AEE2-49B204C8AD89'

/* SQL text to insert entity field value with ID 6d50c950-5c3b-4acc-93c9-1d458ee5c415 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6d50c950-5c3b-4acc-93c9-1d458ee5c415', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 1, 'Config', 'Config')

/* SQL text to insert entity field value with ID d9d4fe80-1357-432d-844f-5ad6d8f0b23f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d9d4fe80-1357-432d-844f-5ad6d8f0b23f', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 2, 'Hooks', 'Hooks')

/* SQL text to insert entity field value with ID d4de62a4-4a8d-4df9-bb38-0d5384afb5c1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d4de62a4-4a8d-4df9-bb38-0d5384afb5c1', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 3, 'Migration', 'Migration')

/* SQL text to insert entity field value with ID 69113e75-7abe-42c2-b758-a8a5dcdf29b6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('69113e75-7abe-42c2-b758-a8a5dcdf29b6', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 4, 'Packages', 'Packages')

/* SQL text to insert entity field value with ID 27cac7fb-02c9-4439-822f-bb7401c1b82f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('27cac7fb-02c9-4439-822f-bb7401c1b82f', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 5, 'Record', 'Record')

/* SQL text to insert entity field value with ID 0d45f847-99a0-4461-9633-58aa6ce7e26b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0d45f847-99a0-4461-9633-58aa6ce7e26b', 'F26B581D-F6E3-47BA-BBBC-167E0F8E5867', 6, 'Schema', 'Schema')

/* SQL text to update ValueListType for entity field ID F26B581D-F6E3-47BA-BBBC-167E0F8E5867 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F26B581D-F6E3-47BA-BBBC-167E0F8E5867'

/* SQL text to insert entity field value with ID 10438f88-7021-4cda-86d3-8f9d38cf9383 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('10438f88-7021-4cda-86d3-8f9d38cf9383', 'F6BCA0FE-D58B-4356-9C80-F0468FD9398E', 1, 'Incompatible', 'Incompatible')

/* SQL text to insert entity field value with ID 643db15e-a984-44e8-8c37-88031a81f3a2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('643db15e-a984-44e8-8c37-88031a81f3a2', 'F6BCA0FE-D58B-4356-9C80-F0468FD9398E', 2, 'Missing', 'Missing')

/* SQL text to insert entity field value with ID 247e3736-bc93-42e5-9dd5-f649d8af9b3a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('247e3736-bc93-42e5-9dd5-f649d8af9b3a', 'F6BCA0FE-D58B-4356-9C80-F0468FD9398E', 3, 'Satisfied', 'Satisfied')

/* SQL text to update ValueListType for entity field ID F6BCA0FE-D58B-4356-9C80-F0468FD9398E */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F6BCA0FE-D58B-4356-9C80-F0468FD9398E'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'cf8ada7c-2030-49a6-83d4-a3bd68f09dac'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cf8ada7c-2030-49a6-83d4-a3bd68f09dac', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'AC4A2799-454B-4395-AA56-A42241F32C12', 'InstalledByUserID', 'One To Many', 1, 1, 'MJ: Open Apps', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8c1f3348-0bda-4949-a1b8-81bc51b238f2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8c1f3348-0bda-4949-a1b8-81bc51b238f2', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', 'ExecutedByUserID', 'One To Many', 1, 1, 'MJ: Open App Install Histories', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5ac78474-4f4d-479f-8db0-46cb0cd78442'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5ac78474-4f4d-479f-8db0-46cb0cd78442', 'AC4A2799-454B-4395-AA56-A42241F32C12', '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', 'OpenAppID', 'One To Many', 1, 1, 'MJ: Open App Dependencies', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6157799d-72af-43c6-8512-3bc8c9663ba5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6157799d-72af-43c6-8512-3bc8c9663ba5', 'AC4A2799-454B-4395-AA56-A42241F32C12', '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', 'DependsOnAppID', 'One To Many', 1, 1, 'MJ: Open App Dependencies', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a87478ba-99ad-48b8-a2f7-eddfeb989222'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a87478ba-99ad-48b8-a2f7-eddfeb989222', 'AC4A2799-454B-4395-AA56-A42241F32C12', '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', 'OpenAppID', 'One To Many', 1, 1, 'MJ: Open App Install Histories', 2);
   END
                              

/* Index for Foreign Keys for OpenAppDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OpenAppID in table OpenAppDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppDependency_OpenAppID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppDependency_OpenAppID ON [${flyway:defaultSchema}].[OpenAppDependency] ([OpenAppID]);

-- Index for foreign key DependsOnAppID in table OpenAppDependency
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppDependency_DependsOnAppID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppDependency]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppDependency_DependsOnAppID ON [${flyway:defaultSchema}].[OpenAppDependency] ([DependsOnAppID]);

/* SQL text to update entity field related entity name field map for entity field ID 5C270696-51C2-451F-88B4-8E99F1DE57FA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5C270696-51C2-451F-88B4-8E99F1DE57FA',
         @RelatedEntityNameFieldMap='OpenApp'

/* SQL text to update entity field related entity name field map for entity field ID 542DCB06-633A-4C84-8E32-D38390250821 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='542DCB06-633A-4C84-8E32-D38390250821',
         @RelatedEntityNameFieldMap='DependsOnApp'

/* Base View SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: vwOpenAppDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open App Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenAppDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenAppDependencies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenAppDependencies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenAppDependencies]
AS
SELECT
    o.*,
    MJOpenApp_OpenAppID.[Name] AS [OpenApp],
    MJOpenApp_DependsOnAppID.[Name] AS [DependsOnApp]
FROM
    [${flyway:defaultSchema}].[OpenAppDependency] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OpenApp] AS MJOpenApp_OpenAppID
  ON
    [o].[OpenAppID] = MJOpenApp_OpenAppID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OpenApp] AS MJOpenApp_DependsOnAppID
  ON
    [o].[DependsOnAppID] = MJOpenApp_DependsOnAppID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: Permissions for vwOpenAppDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppDependencies] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spCreateOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenAppDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppDependency]
    @ID uniqueidentifier = NULL,
    @OpenAppID uniqueidentifier,
    @DependsOnAppName nvarchar(64),
    @DependsOnAppID uniqueidentifier,
    @VersionRange nvarchar(100),
    @InstalledVersion nvarchar(50),
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenAppDependency]
            (
                [ID],
                [OpenAppID],
                [DependsOnAppName],
                [DependsOnAppID],
                [VersionRange],
                [InstalledVersion],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OpenAppID,
                @DependsOnAppName,
                @DependsOnAppID,
                @VersionRange,
                @InstalledVersion,
                ISNULL(@Status, 'Satisfied')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenAppDependency]
            (
                [OpenAppID],
                [DependsOnAppName],
                [DependsOnAppID],
                [VersionRange],
                [InstalledVersion],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OpenAppID,
                @DependsOnAppName,
                @DependsOnAppID,
                @VersionRange,
                @InstalledVersion,
                ISNULL(@Status, 'Satisfied')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenAppDependencies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Open App Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spUpdateOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenAppDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppDependency]
    @ID uniqueidentifier,
    @OpenAppID uniqueidentifier,
    @DependsOnAppName nvarchar(64),
    @DependsOnAppID uniqueidentifier,
    @VersionRange nvarchar(100),
    @InstalledVersion nvarchar(50),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppDependency]
    SET
        [OpenAppID] = @OpenAppID,
        [DependsOnAppName] = @DependsOnAppName,
        [DependsOnAppID] = @DependsOnAppID,
        [VersionRange] = @VersionRange,
        [InstalledVersion] = @InstalledVersion,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenAppDependencies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenAppDependencies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenAppDependency table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenAppDependency]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenAppDependency];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenAppDependency
ON [${flyway:defaultSchema}].[OpenAppDependency]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppDependency]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenAppDependency] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Open App Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppDependency] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spDeleteOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenAppDependency]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppDependency];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppDependency]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenAppDependency]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppDependency] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Open App Dependencies */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppDependency] TO [cdp_Integration]



/* Index for Foreign Keys for OpenAppInstallHistory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OpenAppID in table OpenAppInstallHistory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_OpenAppID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppInstallHistory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_OpenAppID ON [${flyway:defaultSchema}].[OpenAppInstallHistory] ([OpenAppID]);

-- Index for foreign key ExecutedByUserID in table OpenAppInstallHistory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_ExecutedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenAppInstallHistory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenAppInstallHistory_ExecutedByUserID ON [${flyway:defaultSchema}].[OpenAppInstallHistory] ([ExecutedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 2EFCED4C-6D5D-44E5-94D6-579D5A9AB715 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2EFCED4C-6D5D-44E5-94D6-579D5A9AB715',
         @RelatedEntityNameFieldMap='OpenApp'

/* Index for Foreign Keys for OpenApp */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InstalledByUserID in table OpenApp
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OpenApp]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OpenApp_InstalledByUserID ON [${flyway:defaultSchema}].[OpenApp] ([InstalledByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID A47E36F4-7942-4A8B-9735-72F74B07C618 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A47E36F4-7942-4A8B-9735-72F74B07C618',
         @RelatedEntityNameFieldMap='InstalledByUser'

/* Base View SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenApps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenApps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenApps]
AS
SELECT
    o.*,
    MJUser_InstalledByUserID.[Name] AS [InstalledByUser]
FROM
    [${flyway:defaultSchema}].[OpenApp] AS o
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_InstalledByUserID
  ON
    [o].[InstalledByUserID] = MJUser_InstalledByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenApps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spCreateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenApp]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail nvarchar(255),
    @PublisherURL nvarchar(500),
    @RepositoryURL nvarchar(500),
    @SchemaName nvarchar(128),
    @MJVersionRange nvarchar(100),
    @License nvarchar(50),
    @Icon nvarchar(100),
    @Color nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON nvarchar(MAX),
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @DisplayName,
                @Description,
                @Version,
                @Publisher,
                @PublisherEmail,
                @PublisherURL,
                @RepositoryURL,
                @SchemaName,
                @MJVersionRange,
                @License,
                @Icon,
                @Color,
                @ManifestJSON,
                @ConfigurationSchemaJSON,
                @InstalledByUserID,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenApp]
            (
                [Name],
                [DisplayName],
                [Description],
                [Version],
                [Publisher],
                [PublisherEmail],
                [PublisherURL],
                [RepositoryURL],
                [SchemaName],
                [MJVersionRange],
                [License],
                [Icon],
                [Color],
                [ManifestJSON],
                [ConfigurationSchemaJSON],
                [InstalledByUserID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @DisplayName,
                @Description,
                @Version,
                @Publisher,
                @PublisherEmail,
                @PublisherURL,
                @RepositoryURL,
                @SchemaName,
                @MJVersionRange,
                @License,
                @Icon,
                @Color,
                @ManifestJSON,
                @ConfigurationSchemaJSON,
                @InstalledByUserID,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenApp] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenApp]
    @ID uniqueidentifier,
    @Name nvarchar(64),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @Version nvarchar(50),
    @Publisher nvarchar(200),
    @PublisherEmail nvarchar(255),
    @PublisherURL nvarchar(500),
    @RepositoryURL nvarchar(500),
    @SchemaName nvarchar(128),
    @MJVersionRange nvarchar(100),
    @License nvarchar(50),
    @Icon nvarchar(100),
    @Color nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @ConfigurationSchemaJSON nvarchar(MAX),
    @InstalledByUserID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        [Name] = @Name,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Version] = @Version,
        [Publisher] = @Publisher,
        [PublisherEmail] = @PublisherEmail,
        [PublisherURL] = @PublisherURL,
        [RepositoryURL] = @RepositoryURL,
        [SchemaName] = @SchemaName,
        [MJVersionRange] = @MJVersionRange,
        [License] = @License,
        [Icon] = @Icon,
        [Color] = @Color,
        [ManifestJSON] = @ManifestJSON,
        [ConfigurationSchemaJSON] = @ConfigurationSchemaJSON,
        [InstalledByUserID] = @InstalledByUserID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenApps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenApps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenApp]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenApp];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenApp
ON [${flyway:defaultSchema}].[OpenApp]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenApp]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenApp] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenApp] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenApp]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenApp]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenApp]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Open Apps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenApp] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 0D4EC1C7-D177-454E-93FF-C97AB42BDDFF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0D4EC1C7-D177-454E-93FF-C97AB42BDDFF',
         @RelatedEntityNameFieldMap='ExecutedByUser'

/* Base View SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: vwOpenAppInstallHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open App Install Histories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenAppInstallHistory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOpenAppInstallHistories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOpenAppInstallHistories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOpenAppInstallHistories]
AS
SELECT
    o.*,
    MJOpenApp_OpenAppID.[Name] AS [OpenApp],
    MJUser_ExecutedByUserID.[Name] AS [ExecutedByUser]
FROM
    [${flyway:defaultSchema}].[OpenAppInstallHistory] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OpenApp] AS MJOpenApp_OpenAppID
  ON
    [o].[OpenAppID] = MJOpenApp_OpenAppID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ExecutedByUserID
  ON
    [o].[ExecutedByUserID] = MJUser_ExecutedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppInstallHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: Permissions for vwOpenAppInstallHistories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOpenAppInstallHistories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spCreateOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOpenAppInstallHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory]
    @ID uniqueidentifier = NULL,
    @OpenAppID uniqueidentifier,
    @Version nvarchar(50),
    @PreviousVersion nvarchar(50),
    @Action nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @Summary nvarchar(MAX),
    @ExecutedByUserID uniqueidentifier,
    @DurationSeconds int,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @ErrorPhase nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OpenAppInstallHistory]
            (
                [ID],
                [OpenAppID],
                [Version],
                [PreviousVersion],
                [Action],
                [ManifestJSON],
                [Summary],
                [ExecutedByUserID],
                [DurationSeconds],
                [StartedAt],
                [EndedAt],
                [Success],
                [ErrorMessage],
                [ErrorPhase]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OpenAppID,
                @Version,
                @PreviousVersion,
                @Action,
                @ManifestJSON,
                @Summary,
                @ExecutedByUserID,
                @DurationSeconds,
                @StartedAt,
                @EndedAt,
                ISNULL(@Success, 1),
                @ErrorMessage,
                @ErrorPhase
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OpenAppInstallHistory]
            (
                [OpenAppID],
                [Version],
                [PreviousVersion],
                [Action],
                [ManifestJSON],
                [Summary],
                [ExecutedByUserID],
                [DurationSeconds],
                [StartedAt],
                [EndedAt],
                [Success],
                [ErrorMessage],
                [ErrorPhase]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OpenAppID,
                @Version,
                @PreviousVersion,
                @Action,
                @ManifestJSON,
                @Summary,
                @ExecutedByUserID,
                @DurationSeconds,
                @StartedAt,
                @EndedAt,
                ISNULL(@Success, 1),
                @ErrorMessage,
                @ErrorPhase
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOpenAppInstallHistories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Open App Install Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spUpdateOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory]
    @ID uniqueidentifier,
    @OpenAppID uniqueidentifier,
    @Version nvarchar(50),
    @PreviousVersion nvarchar(50),
    @Action nvarchar(20),
    @ManifestJSON nvarchar(MAX),
    @Summary nvarchar(MAX),
    @ExecutedByUserID uniqueidentifier,
    @DurationSeconds int,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ErrorPhase nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppInstallHistory]
    SET
        [OpenAppID] = @OpenAppID,
        [Version] = @Version,
        [PreviousVersion] = @PreviousVersion,
        [Action] = @Action,
        [ManifestJSON] = @ManifestJSON,
        [Summary] = @Summary,
        [ExecutedByUserID] = @ExecutedByUserID,
        [DurationSeconds] = @DurationSeconds,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ErrorPhase] = @ErrorPhase
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOpenAppInstallHistories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOpenAppInstallHistories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenAppInstallHistory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOpenAppInstallHistory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOpenAppInstallHistory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOpenAppInstallHistory
ON [${flyway:defaultSchema}].[OpenAppInstallHistory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OpenAppInstallHistory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OpenAppInstallHistory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Open App Install Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOpenAppInstallHistory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spDeleteOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OpenAppInstallHistory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Open App Install Histories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOpenAppInstallHistory] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'eac84d79-54e1-446e-bb28-5c94596df798'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'OpenApp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'eac84d79-54e1-446e-bb28-5c94596df798',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100019,
            'OpenApp',
            'Open App',
            NULL,
            'nvarchar',
            128,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'df8c4b7f-fdc5-4b5f-bde0-3cce901702a9'  OR 
               (EntityID = '57A740FA-CE0F-440B-8B90-6BF2BB9440DE' AND Name = 'DependsOnApp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'df8c4b7f-fdc5-4b5f-bde0-3cce901702a9',
            '57A740FA-CE0F-440B-8B90-6BF2BB9440DE', -- Entity: MJ: Open App Dependencies
            100020,
            'DependsOnApp',
            'Depends On App',
            NULL,
            'nvarchar',
            128,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ac2d5658-7cad-45ca-bcc5-a87e70144545'  OR 
               (EntityID = 'AC4A2799-454B-4395-AA56-A42241F32C12' AND Name = 'InstalledByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ac2d5658-7cad-45ca-bcc5-a87e70144545',
            'AC4A2799-454B-4395-AA56-A42241F32C12', -- Entity: MJ: Open Apps
            100041,
            'InstalledByUser',
            'Installed By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '67329e25-81bf-4be6-8ee8-97b3e8795a8d'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'OpenApp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '67329e25-81bf-4be6-8ee8-97b3e8795a8d',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100033,
            'OpenApp',
            'Open App',
            NULL,
            'nvarchar',
            128,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b9c5df9a-363b-4fa1-887b-6082950d5bb7'  OR 
               (EntityID = '0FCFF292-3E37-42BB-B5C3-E7751EF9B875' AND Name = 'ExecutedByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b9c5df9a-363b-4fa1-887b-6082950d5bb7',
            '0FCFF292-3E37-42BB-B5C3-E7751EF9B875', -- Entity: MJ: Open App Install Histories
            100034,
            'ExecutedByUser',
            'Executed By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

