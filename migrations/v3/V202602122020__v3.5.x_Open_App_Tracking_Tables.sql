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
        'Active', 'Disabled', 'Error', 'Installing', 'Upgrading', 'Removing'
    )),
    CONSTRAINT CK_OpenApp_Name CHECK (Name NOT LIKE '%[^a-z0-9-]%')
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks all MJ Open Apps installed in this instance',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenApp';
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
        'Schema', 'Migration', 'Packages', 'Config', 'Hooks'
    ))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail of every install, upgrade, and removal for Open Apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppInstallHistory';
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

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Inter-app dependency relationships between installed Open Apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OpenAppDependency';
GO
