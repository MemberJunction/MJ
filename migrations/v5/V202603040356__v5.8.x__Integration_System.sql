-- Migration: Create IntegrationSourceType table
-- Defines the types of integration sources (SaaS API, Database, File Feed, etc.)

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

-- Seed data
INSERT INTO ${flyway:defaultSchema}.IntegrationSourceType (ID, Name, Description, DriverClass, IconClass, Status)
VALUES
    ('A1B2C3D4-E5F6-7890-ABCD-EF1234567801', 'SaaS API', 'Cloud-based SaaS application connected via REST/GraphQL API', 'SaaSAPIConnector', 'fa-solid fa-cloud', 'Active'),
    ('A1B2C3D4-E5F6-7890-ABCD-EF1234567802', 'Relational Database', 'Direct connection to a relational database (SQL Server, PostgreSQL, MySQL, etc.)', 'RelationalDBConnector', 'fa-solid fa-database', 'Active'),
    ('A1B2C3D4-E5F6-7890-ABCD-EF1234567803', 'File Feed', 'File-based data feed (CSV, Excel, JSON, XML)', 'FileFeedConnector', 'fa-solid fa-file-csv', 'Active');




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



-- Migration: Create CompanyIntegrationFieldMap table
-- Maps individual fields between external objects and MJ entity fields

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


-- Migration: Create CompanyIntegrationSyncWatermark table
-- Tracks sync progress per entity map and direction for incremental sync

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



-- Migration: Add SourceTypeID and Configuration columns to CompanyIntegration
-- Links each company integration to its source type

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD SourceTypeID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD Configuration NVARCHAR(MAX) NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD CONSTRAINT FK_CompanyIntegration_IntegrationSourceType
    FOREIGN KEY (SourceTypeID) REFERENCES ${flyway:defaultSchema}.IntegrationSourceType(ID);
