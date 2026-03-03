-- Migration: Create CompanyIntegrationEntityMap table
-- Maps external objects from a company integration to MJ entities

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
