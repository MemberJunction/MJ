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
