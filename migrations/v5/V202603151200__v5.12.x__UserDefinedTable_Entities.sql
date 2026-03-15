-- UserDefinedTable and UserDefinedField entities
-- Tracks tables created via the User Defined Tables (UDT) pipeline
-- Part of Runtime Schema Update (RSU) Phase 5

-- UserDefinedTable: tracks tables created via the UDT pipeline
CREATE TABLE ${flyway:defaultSchema}.UserDefinedTable (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    SchemaName NVARCHAR(100) NOT NULL DEFAULT 'custom',
    TableName NVARCHAR(200) NOT NULL,
    EntityName NVARCHAR(200) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    PipelineRunID NVARCHAR(200) NULL,
    MigrationFilePath NVARCHAR(500) NULL,
    CONSTRAINT PK_UserDefinedTable PRIMARY KEY (ID),
    CONSTRAINT FK_UserDefinedTable_User FOREIGN KEY (CreatedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID)
);

-- UserDefinedField: tracks fields within user-defined tables
CREATE TABLE ${flyway:defaultSchema}.UserDefinedField (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserDefinedTableID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Type NVARCHAR(50) NOT NULL,
    MaxLength INT NULL,
    Precision INT NULL,
    Scale INT NULL,
    AllowEmpty BIT NOT NULL DEFAULT 1,
    DefaultValue NVARCHAR(500) NULL,
    Sequence INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_UserDefinedField PRIMARY KEY (ID),
    CONSTRAINT FK_UserDefinedField_Table FOREIGN KEY (UserDefinedTableID) REFERENCES ${flyway:defaultSchema}.UserDefinedTable(ID)
);
