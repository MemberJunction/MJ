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
