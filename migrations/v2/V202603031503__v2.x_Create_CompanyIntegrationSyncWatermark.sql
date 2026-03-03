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
