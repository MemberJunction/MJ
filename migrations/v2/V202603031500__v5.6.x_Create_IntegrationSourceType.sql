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
