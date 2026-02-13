-- MJ Sample App: Initial schema setup
-- Creates a simple table in the app's own schema to demonstrate migration support.

CREATE TABLE ${flyway:defaultSchema}.SampleRecord (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_SampleRecord PRIMARY KEY (ID),
    CONSTRAINT CK_SampleRecord_Status CHECK (Status IN ('Active', 'Inactive', 'Archived'))
);
