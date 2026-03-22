-- Database Documentation Script
-- Generated: 2026-03-21T18:13:19.635Z
-- Database: AW_Stripped
-- Server: sql-claude

-- This script adds MS_Description extended properties to database objects


-- Schema: dbo

-- Table: dbo.AWBuildVersion
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'dbo'
    AND t.name = 'AWBuildVersion'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'AWBuildVersion';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A system metadata table that stores the current version and build information of the database schema. It typically contains a single row representing the state of the database deployment.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'AWBuildVersion';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'AWBuildVersion'
    AND c.name = 'SystemInformationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'AWBuildVersion',
        @level2type = N'COLUMN',
        @level2name = N'SystemInformationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A surrogate primary key used to uniquely identify the system information record.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'AWBuildVersion',
    @level2type = N'COLUMN',
    @level2name = N'SystemInformationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'AWBuildVersion'
    AND c.name = 'Database Version'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'AWBuildVersion',
        @level2type = N'COLUMN',
        @level2name = N'Database Version';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific version number or build identifier of the database schema.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'AWBuildVersion',
    @level2type = N'COLUMN',
    @level2name = N'Database Version';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'AWBuildVersion'
    AND c.name = 'VersionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'AWBuildVersion',
        @level2type = N'COLUMN',
        @level2name = N'VersionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the current database version was released or deployed.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'AWBuildVersion',
    @level2type = N'COLUMN',
    @level2name = N'VersionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'AWBuildVersion'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'AWBuildVersion',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the version record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'AWBuildVersion',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: dbo.DatabaseLog
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A central audit log that records Data Definition Language (DDL) changes and database modifications. It captures details about schema changes, object creations, and administrative actions to provide a historical record of the database''s structural evolution.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'DatabaseLogID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'DatabaseLogID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each log entry.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'DatabaseLogID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'PostTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'PostTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the database change was executed.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'PostTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'DatabaseUser'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'DatabaseUser';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The database user account that performed the action.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'DatabaseUser';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'Event'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'Event';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The type of DDL event that triggered the log entry (e.g., CREATE_TABLE, ALTER_INDEX).',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'Event';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'Schema'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'Schema';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The database schema to which the affected object belongs.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'Schema';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'Object'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'Object';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The name of the database object (table, view, procedure, etc.) that was created or modified.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'Object';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'TSQL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'TSQL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The exact Transact-SQL command that was executed.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'TSQL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'DatabaseLog'
    AND c.name = 'XmlEvent'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'DatabaseLog',
        @level2type = N'COLUMN',
        @level2name = N'XmlEvent';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The complete event data in XML format, providing detailed context about the environment and the change.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'DatabaseLog',
    @level2type = N'COLUMN',
    @level2name = N'XmlEvent';
GO

-- Table: dbo.ErrorLog
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A central repository for logging database-related errors, typically populated by TRY...CATCH blocks within stored procedures or triggers to facilitate troubleshooting and auditing.',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorLogID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorLogID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the error log entry',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorLogID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the error occurred',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'UserName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'UserName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The database or application user who encountered the error',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'UserName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific SQL Server error number',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorSeverity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorSeverity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The severity level of the error (typically 0-25)',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorSeverity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorState'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorState';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The state code of the error, used to identify the specific location in the code that raised the error',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorState';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorProcedure'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorProcedure';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The name of the stored procedure or trigger where the error occurred',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorProcedure';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorLine'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorLine';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The line number within the procedure or trigger where the error was raised',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorLine';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'dbo'
    AND t.name = 'ErrorLog'
    AND c.name = 'ErrorMessage'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'dbo',
        @level1type = N'TABLE',
        @level1name = N'ErrorLog',
        @level2type = N'COLUMN',
        @level2name = N'ErrorMessage';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full text description of the error message',
    @level0type = N'SCHEMA',
    @level0name = N'dbo',
    @level1type = N'TABLE',
    @level1name = N'ErrorLog',
    @level2type = N'COLUMN',
    @level2name = N'ErrorMessage';
GO


-- Schema: HumanResources

-- Table: HumanResources.Department
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Department'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Department';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that defines the organizational departments within the company and categorizes them into broader functional groups.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Department';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Department'
    AND c.name = 'DepartmentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Department',
        @level2type = N'COLUMN',
        @level2name = N'DepartmentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each department.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Department',
    @level2type = N'COLUMN',
    @level2name = N'DepartmentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Department'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Department',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the specific department (e.g., ''Tool Design'', ''Research and Development'').',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Department',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Department'
    AND c.name = 'GroupName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Department',
        @level2type = N'COLUMN',
        @level2name = N'GroupName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A high-level categorization used to group multiple departments into major business divisions (e.g., ''Manufacturing'', ''Sales and Marketing'').',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Department',
    @level2type = N'COLUMN',
    @level2name = N'GroupName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Department'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Department',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the department record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Department',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: HumanResources.Employee
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Serves as the central registry for current employee data, representing individuals who have successfully transitioned from recruitment to active employment. It maintains a point-in-time snapshot of professional attributes, organizational hierarchy, and benefit balances, while notably excluding direct compensation data which is managed via time-series history for auditing purposes. It acts as the primary anchor for historical role changes, document ownership, and specialized operational responsibilities including procurement and a distinct subset of sales personnel.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary identifier for the employee, linking directly to their record in the Person.Person table.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'NationalIDNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'NationalIDNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique government-issued identification number for the employee (e.g., SSN).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'NationalIDNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'LoginID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'LoginID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The employee''s network or domain login credentials.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'LoginID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'OrganizationNode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'OrganizationNode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A hierarchyid value representing the employee''s position within the company''s reporting structure.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'OrganizationNode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'OrganizationLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'OrganizationLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The depth of the employee within the organizational hierarchy (e.g., 1 for executives, 4 for staff).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'OrganizationLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'JobTitle'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'JobTitle';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The official professional title of the employee.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'JobTitle';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'BirthDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'BirthDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The employee''s date of birth, used for age verification and HR records.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'BirthDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'MaritalStatus'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'MaritalStatus';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The employee''s marital status (M = Married, S = Single).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'MaritalStatus';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'Gender'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'Gender';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The employee''s gender (M = Male, F = Female).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'Gender';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'HireDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'HireDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the employee was officially hired by the company.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'HireDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'SalariedFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'SalariedFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the employee is paid a fixed salary (true) or hourly wages (false).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'SalariedFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'VacationHours'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'VacationHours';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current balance of accrued vacation time available to the employee.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'VacationHours';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'SickLeaveHours'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'SickLeaveHours';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current balance of accrued sick leave available to the employee.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'SickLeaveHours';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'CurrentFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'CurrentFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the employee is currently active (true) or has left the company (false).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'CurrentFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Employee'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Employee',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp of the last time this record was updated.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Employee',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: HumanResources.EmployeeDepartmentHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table tracks the historical and current assignments of employees to specific departments and work shifts. It serves as a ledger for organizational movement, recording when an employee started and ended their tenure in a particular department and shift combination.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary identifier for the employee, linking to the HumanResources.Employee table.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND c.name = 'DepartmentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory',
        @level2type = N'COLUMN',
        @level2name = N'DepartmentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier for the department the employee is or was assigned to.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory',
    @level2type = N'COLUMN',
    @level2name = N'DepartmentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND c.name = 'ShiftID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory',
        @level2type = N'COLUMN',
        @level2name = N'ShiftID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier for the specific work shift (e.g., Day, Evening, Night) assigned to the employee.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory',
    @level2type = N'COLUMN',
    @level2name = N'ShiftID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the employee began this specific department and shift assignment.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the employee left this department or shift. A NULL value indicates the assignment is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeeDepartmentHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeeDepartmentHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeeDepartmentHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: HumanResources.EmployeePayHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeePayHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeePayHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table maintains a historical record of employee compensation changes. It tracks the specific pay rate, the date the rate took effect, and the frequency of payment for every employee, allowing the organization to audit salary progression over time.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeePayHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeePayHistory'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeePayHistory',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary identifier for the employee, linking this record to their profile in the HumanResources.Employee table.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeePayHistory',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeePayHistory'
    AND c.name = 'RateChangeDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeePayHistory',
        @level2type = N'COLUMN',
        @level2name = N'RateChangeDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The effective date of the pay rate change.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeePayHistory',
    @level2type = N'COLUMN',
    @level2name = N'RateChangeDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeePayHistory'
    AND c.name = 'Rate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeePayHistory',
        @level2type = N'COLUMN',
        @level2name = N'Rate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The salary or hourly wage amount assigned to the employee starting on the RateChangeDate.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeePayHistory',
    @level2type = N'COLUMN',
    @level2name = N'Rate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeePayHistory'
    AND c.name = 'PayFrequency'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeePayHistory',
        @level2type = N'COLUMN',
        @level2name = N'PayFrequency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A code indicating how often the employee is paid (e.g., 1 = Monthly, 2 = Bi-weekly).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeePayHistory',
    @level2type = N'COLUMN',
    @level2name = N'PayFrequency';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'EmployeePayHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'EmployeePayHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the pay record was last updated in the system.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'EmployeePayHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: HumanResources.JobCandidate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'JobCandidate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'JobCandidate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores resumes and application information for job seekers. It acts as a repository for candidate profiles, which can be linked to existing employee records if the candidate is an internal applicant or a successful hire.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'JobCandidate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'JobCandidate'
    AND c.name = 'JobCandidateID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'JobCandidate',
        @level2type = N'COLUMN',
        @level2name = N'JobCandidateID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for job candidate records',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'JobCandidate',
    @level2type = N'COLUMN',
    @level2name = N'JobCandidateID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'JobCandidate'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'JobCandidate',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the candidate to an employee record in HumanResources.Employee',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'JobCandidate',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'JobCandidate'
    AND c.name = 'Resume'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'JobCandidate',
        @level2type = N'COLUMN',
        @level2name = N'Resume';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed resume information stored in a structured XML format, including work history, education, and contact details',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'JobCandidate',
    @level2type = N'COLUMN',
    @level2name = N'Resume';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'JobCandidate'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'JobCandidate',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the candidate record was last updated',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'JobCandidate',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: HumanResources.Shift
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Shift'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Shift';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that defines the standard work shifts within the organization, specifying the names and time boundaries (start and end times) for daily work periods.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Shift';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Shift'
    AND c.name = 'ShiftID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Shift',
        @level2type = N'COLUMN',
        @level2name = N'ShiftID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for a work shift.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Shift',
    @level2type = N'COLUMN',
    @level2name = N'ShiftID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Shift'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Shift',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the shift (e.g., Day, Evening, Night).',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Shift',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Shift'
    AND c.name = 'StartTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Shift',
        @level2type = N'COLUMN',
        @level2name = N'StartTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The time of day the work shift is scheduled to begin.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Shift',
    @level2type = N'COLUMN',
    @level2name = N'StartTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Shift'
    AND c.name = 'EndTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Shift',
        @level2type = N'COLUMN',
        @level2name = N'EndTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The time of day the work shift is scheduled to end.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Shift',
    @level2type = N'COLUMN',
    @level2name = N'EndTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'HumanResources'
    AND t.name = 'Shift'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'HumanResources',
        @level1type = N'TABLE',
        @level1name = N'Shift',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the shift record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'HumanResources',
    @level1type = N'TABLE',
    @level1name = N'Shift',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO


-- Schema: Person

-- Table: Person.Address
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Person.Address table serves as a centralized repository for physical address information within the database. It stores street-level details, city, postal codes, and geographic coordinates, providing a standardized way to associate locations with individuals, business entities, and sales orders.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'AddressID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'AddressID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier and primary key for each address record.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'AddressID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'AddressLine1'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'AddressLine1';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The primary street address or P.O. Box information.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'AddressLine1';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'AddressLine2'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'AddressLine2';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional address information such as apartment, suite, unit number, or department names.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'AddressLine2';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The name of the city where the address is located.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'StateProvinceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'StateProvinceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the address to a specific state, province, or region defined in the Person.StateProvince table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'StateProvinceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'PostalCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'PostalCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The postal or zip code for the address.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'PostalCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'SpatialLocation'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'SpatialLocation';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Geographic coordinates (latitude and longitude) for the address, used for spatial mapping and proximity queries.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'SpatialLocation';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for row-level tracking and synchronization, likely for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Address'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Address',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the address record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Address',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.AddressType
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'AddressType'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'AddressType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A foundational lookup table that defines the various categories or purposes of addresses within the system, such as Billing, Shipping, or Home. It is used to classify the relationship between business entities and their physical locations.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'AddressType';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'AddressType'
    AND c.name = 'AddressTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'AddressType',
        @level2type = N'COLUMN',
        @level2name = N'AddressTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each address category.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'AddressType',
    @level2type = N'COLUMN',
    @level2name = N'AddressTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'AddressType'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'AddressType',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the address type (e.g., ''Shipping'', ''Main Office'').',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'AddressType',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'AddressType'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'AddressType',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A globally unique identifier used for row-level tracking and database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'AddressType',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'AddressType'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'AddressType',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'AddressType',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.BusinessEntity
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntity'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A foundational base table that implements a Table-per-Type inheritance pattern, providing a unique identity (BusinessEntityID) for all participants in the system, including individuals (People) and organizations (Vendors and Stores). It serves as a polymorphic root, centralizing shared associations such as physical addresses and contact persons across these diverse entity types.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntity';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntity'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntity',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The primary unique identifier for any business-related entity in the system.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntity',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntity'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntity',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A globally unique identifier used for tracking the row across different databases, typically for merge replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntity',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntity'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntity',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntity',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.BusinessEntityAddress
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityAddress'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that associates business entities (such as individuals, stores, or vendors) with specific physical addresses and defines the purpose of that address (e.g., Home, Billing, Shipping).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityAddress';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityAddress'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityAddress',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key identifying the person, vendor, or store associated with the address.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityAddress',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityAddress'
    AND c.name = 'AddressID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityAddress',
        @level2type = N'COLUMN',
        @level2name = N'AddressID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key identifying the specific physical location from the Person.Address table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityAddress',
    @level2type = N'COLUMN',
    @level2name = N'AddressID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityAddress'
    AND c.name = 'AddressTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityAddress',
        @level2type = N'COLUMN',
        @level2name = N'AddressTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key identifying the category of the address (e.g., Home, Billing, Shipping, Office).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityAddress',
    @level2type = N'COLUMN',
    @level2name = N'AddressTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityAddress'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityAddress',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for row-level synchronization and tracking across distributed databases.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityAddress',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityAddress'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityAddress',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityAddress',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.BusinessEntityContact
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityContact'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityContact';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that associates individuals (Person.Person) with business entities (Person.BusinessEntity), such as stores or vendors, and defines their specific contact roles (Person.ContactType).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityContact';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityContact'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityContact',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the organization (such as a store or vendor) that the contact person is associated with.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityContact',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityContact'
    AND c.name = 'PersonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityContact',
        @level2type = N'COLUMN',
        @level2name = N'PersonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the individual person who serves as the contact for the business entity.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityContact',
    @level2type = N'COLUMN',
    @level2name = N'PersonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityContact'
    AND c.name = 'ContactTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityContact',
        @level2type = N'COLUMN',
        @level2name = N'ContactTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier for the specific role or job title the person holds at the business entity (e.g., ''Owner'', ''Purchasing Manager'').',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityContact',
    @level2type = N'COLUMN',
    @level2name = N'ContactTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityContact'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityContact',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ROWGUIDCOL number uniquely identifying the record, used for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityContact',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'BusinessEntityContact'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'BusinessEntityContact',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'BusinessEntityContact',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.ContactType
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'ContactType'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'ContactType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that defines a standardized list of professional roles or job titles (e.g., ''Sales Representative'', ''Purchasing Manager'') for individuals acting as contacts for business entities. While the table provides a comprehensive set of categories, usage patterns indicate that only a specific subset of these roles (7 out of 20) is actively associated with business entity contacts in the current system state.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'ContactType';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'ContactType'
    AND c.name = 'ContactTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'ContactType',
        @level2type = N'COLUMN',
        @level2name = N'ContactTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each contact type.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'ContactType',
    @level2type = N'COLUMN',
    @level2name = N'ContactTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'ContactType'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'ContactType',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the contact role or job title (e.g., ''Owner'', ''Sales Agent'').',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'ContactType',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'ContactType'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'ContactType',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'ContactType',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.CountryRegion
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'CountryRegion'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'CountryRegion';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A master lookup table storing standardized ISO 3166-1 alpha-2 country codes and names. It serves as the top-level entity in the global geographic hierarchy, anchoring both administrative subdivisions (states and provinces) and organizational structures (sales territories). This central role facilitates standardized address management, currency mapping, and regional financial reporting by allowing countries to be subdivided into distinct logistical and commercial zones.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'CountryRegion';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'CountryRegion'
    AND c.name = 'CountryRegionCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'CountryRegion',
        @level2type = N'COLUMN',
        @level2name = N'CountryRegionCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique 2-character identifier for a country or region, typically following ISO 3166-1 alpha-2 standards.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'CountryRegion',
    @level2type = N'COLUMN',
    @level2name = N'CountryRegionCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'CountryRegion'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'CountryRegion',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full, formal name of the country or region.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'CountryRegion',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'CountryRegion'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'CountryRegion',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'CountryRegion',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.EmailAddress
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'EmailAddress'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'EmailAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores email addresses for individuals identified in the Person.Person table. It allows for the association of one or more electronic mail contact points with a specific business entity (person).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'EmailAddress';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'EmailAddress'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'EmailAddress',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary identifier for the person or entity to whom the email address belongs; links to the Person.Person table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'EmailAddress',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'EmailAddress'
    AND c.name = 'EmailAddressID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'EmailAddress',
        @level2type = N'COLUMN',
        @level2name = N'EmailAddressID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique surrogate primary key for each email address record.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'EmailAddress',
    @level2type = N'COLUMN',
    @level2name = N'EmailAddressID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'EmailAddress'
    AND c.name = 'EmailAddress'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'EmailAddress',
        @level2type = N'COLUMN',
        @level2name = N'EmailAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual electronic mail address string (e.g., user@adventure-works.com).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'EmailAddress',
    @level2type = N'COLUMN',
    @level2name = N'EmailAddress';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'EmailAddress'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'EmailAddress',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'EmailAddress',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'EmailAddress'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'EmailAddress',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'EmailAddress',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.Password
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'Password'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Password';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores security credentials, specifically hashed passwords and their corresponding salts, for individuals defined in the Person.Person table. This table enables secure authentication by ensuring plain-text passwords are never stored in the database.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Password';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Password'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Password',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the person, acting as both the primary key and a link to the Person.Person table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Password',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Password'
    AND c.name = 'PasswordHash'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Password',
        @level2type = N'COLUMN',
        @level2name = N'PasswordHash';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A cryptographically hashed version of the user''s password, encoded in Base64.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Password',
    @level2type = N'COLUMN',
    @level2name = N'PasswordHash';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Password'
    AND c.name = 'PasswordSalt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Password',
        @level2type = N'COLUMN',
        @level2name = N'PasswordSalt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A random string added to the password before hashing to protect against rainbow table attacks.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Password',
    @level2type = N'COLUMN',
    @level2name = N'PasswordSalt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Password'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Password',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for row-level tracking and database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Password',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Password'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Password',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the password was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Password',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.Person
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The central identity provider and unified directory for all individuals associated with the business, including employees, vendor contacts, and customers. It functions as a foundational ''base class'' where generic Person records are ''promoted'' to specialized transacting entities (via the Customer table) or organizational roles (via the Employee table). The table ensures a consistent identity across the system—often evidenced by universal corporate-style email assignments for nearly 20,000 records—and serves as the primary anchor for security credentials, corporate hierarchy, and financial associations via the BusinessEntityID.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key to Person.BusinessEntity, uniquely identifying the person as a business entity.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'PersonType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'PersonType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A code indicating the role of the person: IN (Individual Customer), SC (Store Contact), GC (General Contact), EM (Employee), VC (Vendor Contact), or SP (Sales Person).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'PersonType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'NameStyle'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'NameStyle';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates the display format for the name: 0 for Western (First Last) and 1 for Eastern (Last First).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'NameStyle';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A prefix or honorific for the person (e.g., Mr., Ms., Mrs.).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'FirstName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'FirstName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The individual''s first or given name.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'FirstName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'MiddleName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'MiddleName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The individual''s middle name or initial.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'MiddleName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'LastName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'LastName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The individual''s last name or surname.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'LastName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'Suffix'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'Suffix';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A name suffix such as Jr., Sr., or PhD.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'Suffix';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'EmailPromotion'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'EmailPromotion';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Marketing preference code: 0 = No promotions, 1 = Promotions from AdventureWorks, 2 = Promotions from AdventureWorks and partners.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'EmailPromotion';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'AdditionalContactInfo'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'AdditionalContactInfo';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'XML data containing additional contact details such as secondary phone numbers, pagers, and specific contact instructions.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'AdditionalContactInfo';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'Demographics'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'Demographics';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'XML data storing personal survey information including birth date, marital status, yearly income, education, and occupation.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'Demographics';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'Person'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'Person',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'Person',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.PersonPhone
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'PersonPhone'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PersonPhone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores telephone numbers associated with individuals (persons) in the database. It acts as a bridge between the central person records and their various contact numbers, categorizing each number by type (e.g., Cell, Home, Work).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PersonPhone';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PersonPhone'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PersonPhone',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary identifier for the person, acting as a foreign key to the Person.Person table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PersonPhone',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PersonPhone'
    AND c.name = 'PhoneNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PersonPhone',
        @level2type = N'COLUMN',
        @level2name = N'PhoneNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual telephone number string, including area codes and international formatting where applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PersonPhone',
    @level2type = N'COLUMN',
    @level2name = N'PhoneNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PersonPhone'
    AND c.name = 'PhoneNumberTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PersonPhone',
        @level2type = N'COLUMN',
        @level2name = N'PhoneNumberTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A reference to the type of phone number (e.g., Cell, Home, Work).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PersonPhone',
    @level2type = N'COLUMN',
    @level2name = N'PhoneNumberTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PersonPhone'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PersonPhone',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the phone number record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PersonPhone',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.PhoneNumberType
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'PhoneNumberType'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PhoneNumberType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that defines the three standard categories for phone numbers used by the organization: Cell, Home, and Work. It provides the exhaustive set of labels for the Person.PersonPhone table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PhoneNumberType';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PhoneNumberType'
    AND c.name = 'PhoneNumberTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PhoneNumberType',
        @level2type = N'COLUMN',
        @level2name = N'PhoneNumberTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each phone number type.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PhoneNumberType',
    @level2type = N'COLUMN',
    @level2name = N'PhoneNumberTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PhoneNumberType'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PhoneNumberType',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the phone number category (e.g., Cell, Home, Work).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PhoneNumberType',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'PhoneNumberType'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'PhoneNumberType',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'PhoneNumberType',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Person.StateProvince
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Person.StateProvince table serves as a geographical lookup for sub-national administrative divisions such as states, provinces, and regions. It maps these entities to their parent countries and assigns them to specific sales territories for organizational and tax purposes.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'StateProvinceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'StateProvinceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the StateProvince table.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'StateProvinceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'StateProvinceCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'StateProvinceCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ISO or postal abbreviation for the state or province (e.g., ''WA'' for Washington).',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'StateProvinceCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'CountryRegionCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'CountryRegionCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the state/province to a specific country in Person.CountryRegion.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'CountryRegionCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'IsOnlyStateProvinceFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'IsOnlyStateProvinceFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A flag indicating whether this is the only state or province record for the associated country, or potentially used to distinguish primary administrative divisions.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'IsOnlyStateProvinceFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full descriptive name of the state or province.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'TerritoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'TerritoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the state/province to a sales territory for sales reporting and management.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'TerritoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Person'
    AND t.name = 'StateProvince'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Person',
        @level1type = N'TABLE',
        @level1name = N'StateProvince',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Person',
    @level1type = N'TABLE',
    @level1name = N'StateProvince',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO


-- Schema: Production

-- Table: Production.BillOfMaterials
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the hierarchical structure of manufactured products, defining which components and sub-assemblies are required to create a parent product. It includes quantity requirements, unit measures, and effective date ranges for versioning product configurations.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'BillOfMaterialsID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'BillOfMaterialsID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each Bill of Materials record.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'BillOfMaterialsID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'ProductAssemblyID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'ProductAssemblyID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ID of the product that is being assembled (the parent item). Null values indicate the component is a top-level item or raw material not currently assigned to a specific assembly in this context.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'ProductAssemblyID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'ComponentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'ComponentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ID of the product used as a constituent part of the assembly (the child item).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'ComponentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date when this specific component-to-assembly relationship became effective.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date when this component was no longer used in the assembly. If null, the component is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'UnitMeasureCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'UnitMeasureCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unit of measure (e.g., Each, Ounces, Inches) for the quantity of the component used.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'UnitMeasureCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'BOMLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'BOMLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The depth level of the component within the product hierarchy (e.g., 0 for the main assembly, 1 for direct components, 2 for sub-components).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'BOMLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'PerAssemblyQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'PerAssemblyQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The quantity of the component required to produce a single unit of the parent assembly.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'PerAssemblyQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'BillOfMaterials'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'BillOfMaterials',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last time the BOM record was updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'BillOfMaterials',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.Culture
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'Culture'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Culture';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that defines the specific languages and regions (cultures) supported for localized product information, such as product descriptions. The system is configured to support a specific set of locales: English, French, Arabic, Thai, Hebrew, and Traditional Chinese.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Culture';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Culture'
    AND c.name = 'CultureID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Culture',
        @level2type = N'COLUMN',
        @level2name = N'CultureID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the culture, typically using a standard language code (e.g., ''en'' for English).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Culture',
    @level2type = N'COLUMN',
    @level2name = N'CultureID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Culture'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Culture',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full display name of the language or culture.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Culture',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Culture'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Culture',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Culture',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.Document
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores technical documentation, product manuals, and instructional guides organized in a hierarchical folder structure. It acts as a central repository for binary document files and their associated metadata used in the manufacturing and maintenance of products. The system is designed for high reusability, where a small set of standardized documents supports a significantly larger number of distinct product models and components.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'DocumentNode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'DocumentNode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A hierarchyid value that defines the position of the document or folder within the organizational tree.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'DocumentNode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'DocumentLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'DocumentLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The depth level of the node within the hierarchy (e.g., 0 for root, 1 for top-level folders).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'DocumentLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The human-readable title of the document or folder.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'Owner'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'Owner';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The employee responsible for the document, referencing the HumanResources.Employee table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'Owner';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'FolderFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'FolderFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the entry is a folder (true) or a document file (false).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'FolderFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'FileName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'FileName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full name of the file, including the extension if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'FileName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'FileExtension'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'FileExtension';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The file type extension (e.g., .doc).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'FileExtension';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'Revision'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'Revision';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The version or revision number of the document for change tracking.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'Revision';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'ChangeNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'ChangeNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'An incremental number tracking the specific change set or update applied to the document.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'ChangeNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current workflow state of the document (e.g., Draft, Approved, Obsolete).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'DocumentSummary'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'DocumentSummary';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A brief textual description or abstract of the document''s contents.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'DocumentSummary';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'Document'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'Document';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual binary content of the document file.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'Document';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for row-level tracking and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Document'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Document',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the document record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Document',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.Illustration
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'Illustration'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Illustration';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores modular and reusable vector graphic illustrations in XML (XAML) format. These illustrations provide visual diagrams, assembly instructions, or component layouts that can be shared across multiple product models and manufacturing lines.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Illustration';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Illustration'
    AND c.name = 'IllustrationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Illustration',
        @level2type = N'COLUMN',
        @level2name = N'IllustrationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each illustration record.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Illustration',
    @level2type = N'COLUMN',
    @level2name = N'IllustrationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Illustration'
    AND c.name = 'Diagram'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Illustration',
        @level2type = N'COLUMN',
        @level2name = N'Diagram';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Vector graphic data stored in XAML (XML) format, representing the actual illustration.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Illustration',
    @level2type = N'COLUMN',
    @level2name = N'Diagram';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Illustration'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Illustration',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the illustration record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Illustration',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.Location
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'Location'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Location';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table defining the physical areas and functional work centers (e.g., assembly lines, storage, specialized shops) within the manufacturing facility. It stores operational metadata, including hourly cost rates and capacity availability, which are used to calculate planned and actual costs in production routing and to track inventory across at least 14 distinct functional areas.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Location';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Location'
    AND c.name = 'LocationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Location',
        @level2type = N'COLUMN',
        @level2name = N'LocationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each manufacturing or storage location.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Location',
    @level2type = N'COLUMN',
    @level2name = N'LocationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Location'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Location',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the work center or storage area (e.g., ''Tool Crib'', ''Paint Shop'').',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Location',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Location'
    AND c.name = 'CostRate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Location',
        @level2type = N'COLUMN',
        @level2name = N'CostRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The standard hourly cost or overhead rate associated with performing work at this specific location.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Location',
    @level2type = N'COLUMN',
    @level2name = N'CostRate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Location'
    AND c.name = 'Availability'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Location',
        @level2type = N'COLUMN',
        @level2name = N'Availability';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The capacity or percentage of time that the location is available for production activities.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Location',
    @level2type = N'COLUMN',
    @level2name = N'Availability';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Location'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Location',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the location record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Location',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.Product
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Production.Product table serves as the central master catalog for all items within the organization, encompassing raw materials, sub-assembly components, and finished goods sold to customers. It stores comprehensive metadata including physical attributes (size, weight, color), financial data (cost, list price), manufacturing indicators, and inventory management thresholds.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The display name of the product or component.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ProductNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ProductNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique internal alphanumeric code (SKU) for product tracking.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ProductNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'MakeFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'MakeFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the product is manufactured in-house (true) or purchased (false).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'MakeFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'FinishedGoodsFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'FinishedGoodsFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the product is a saleable end-product (true) or a component/part (false).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'FinishedGoodsFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'Color'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Color';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The visual color of the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Color';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'SafetyStockLevel'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'SafetyStockLevel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The minimum inventory level that should be maintained at all times.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'SafetyStockLevel';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ReorderPoint'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ReorderPoint';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The inventory level at which a new purchase or production order should be triggered.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ReorderPoint';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'StandardCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'StandardCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The standard cost to manufacture or acquire the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'StandardCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ListPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ListPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The suggested retail selling price.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ListPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'Size'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Size';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The physical size of the product (e.g., frame size, clothing size).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Size';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'SizeUnitMeasureCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'SizeUnitMeasureCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unit of measure for the Size column (e.g., CM).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'SizeUnitMeasureCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'WeightUnitMeasureCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'WeightUnitMeasureCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unit of measure for the Weight column (e.g., LB, G).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'WeightUnitMeasureCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'Weight'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Weight';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The physical weight of the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Weight';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'DaysToManufacture'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'DaysToManufacture';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of days required to manufacture the product in-house.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'DaysToManufacture';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ProductLine'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ProductLine';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorizes products into lines: R (Road), M (Mountain), T (Touring), or S (Standard).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ProductLine';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'Class'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Class';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Quality or price class: H (High), M (Medium), or L (Low).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Class';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'Style'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'Style';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Product style: W (Women''s), M (Men''s), or U (Universal).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'Style';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ProductSubcategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ProductSubcategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to the specific sub-classification of the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ProductSubcategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ProductModelID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ProductModelID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to the high-level product model or design group.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ProductModelID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'SellStartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'SellStartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the product was first available for sale.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'SellStartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'SellEndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'SellEndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the product was removed from the catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'SellEndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'DiscontinuedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'DiscontinuedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the product was discontinued.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'DiscontinuedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'Product'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'Product',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last record update.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Product',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductCategory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCategory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A highly consolidated top-level lookup table that serves as the root of the product hierarchy. It defines the four primary classifications (Bikes, Components, Clothing, and Accessories) that encompass all 37 product subcategories, organizing the entire inventory into broad functional areas.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCategory'
    AND c.name = 'ProductCategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'ProductCategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique primary identifier for a high-level product category.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'ProductCategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCategory'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the product category used for display and reporting.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCategory'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for database replication and synchronization across different environments.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCategory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCategory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the category record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCategory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductCostHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCostHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCostHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table, Production.ProductCostHistory, tracks the historical changes in the standard cost of products over time. It allows the business to maintain a record of what a product cost to manufacture or purchase during specific date ranges, which is essential for accurate financial reporting, inventory valuation, and margin analysis.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCostHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCostHistory'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCostHistory',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the product whose cost is being tracked. This is a foreign key referencing Production.Product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCostHistory',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCostHistory'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCostHistory',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date on which the associated StandardCost became effective for the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCostHistory',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCostHistory'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCostHistory',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date on which the associated StandardCost ceased to be effective. A NULL value indicates that this is the current active cost for the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCostHistory',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCostHistory'
    AND c.name = 'StandardCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCostHistory',
        @level2type = N'COLUMN',
        @level2name = N'StandardCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The cost of the product during the specified date range (StartDate to EndDate).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCostHistory',
    @level2type = N'COLUMN',
    @level2name = N'StandardCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductCostHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductCostHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductCostHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductDescription
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDescription'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDescription';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores unique localized marketing and technical descriptions for products. Each entry provides a specific description for a product model in a particular language. Although the schema uses a junction table for mapping, the data indicates that descriptions are not shared; every record is purpose-built for a single product model and culture combination.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDescription';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDescription'
    AND c.name = 'ProductDescriptionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDescription',
        @level2type = N'COLUMN',
        @level2name = N'ProductDescriptionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier and primary key for each product description record.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDescription',
    @level2type = N'COLUMN',
    @level2name = N'ProductDescriptionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDescription'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDescription',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual text content describing a product''s features, benefits, or specifications, stored in various languages.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDescription',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDescription'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDescription',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A globally unique identifier used for row-level tracking and synchronization across databases.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDescription',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDescription'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDescription',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the description record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDescription',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductDocument
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDocument'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDocument';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that creates a many-to-many relationship between products and their associated technical documentation, such as manuals, specifications, or maintenance guides.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDocument';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDocument'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDocument',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for a product being associated with a document.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDocument',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDocument'
    AND c.name = 'DocumentNode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDocument',
        @level2type = N'COLUMN',
        @level2name = N'DocumentNode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The hierarchical identifier for a document in the document management system.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDocument',
    @level2type = N'COLUMN',
    @level2name = N'DocumentNode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductDocument'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductDocument',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the association between the product and the document was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductDocument',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductInventory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Production.ProductInventory table tracks the real-time stock levels of products across various physical locations, such as warehouses and manufacturing work centers. It provides granular detail by specifying the exact shelf and bin where items are stored, facilitating precise inventory management and order fulfillment.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier of the product in stock. This links to the master product catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'LocationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'LocationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier for the physical facility or work center (e.g., Warehouse, Paint Shop, Subassembly) where the inventory is held.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'LocationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'Shelf'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'Shelf';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The alphanumeric designation of the storage rack or shelf within a location. ''N/A'' is used for items not stored on standard shelving.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'Shelf';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'Bin'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'Bin';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific container or compartment number on a shelf where the product is located.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'Bin';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'Quantity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'Quantity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current count of units available for the specific Product/Location/Shelf/Bin combination.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'Quantity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for global row identification and synchronization/replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductInventory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductInventory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the inventory level or location details were last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductInventory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductListPriceHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductListPriceHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductListPriceHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table tracks the historical changes of product list prices over time. It functions as a temporal record, allowing the business to audit previous pricing tiers and determine the active list price for any given date by using the StartDate and EndDate range.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductListPriceHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductListPriceHistory'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductListPriceHistory',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the product whose price is being tracked. This is a foreign key referencing the Production.Product table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductListPriceHistory',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductListPriceHistory'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductListPriceHistory',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date on which the specific list price became effective for the product.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductListPriceHistory',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductListPriceHistory'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductListPriceHistory',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date on which the specific list price ceased to be effective. A NULL value indicates that this is the current active price.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductListPriceHistory',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductListPriceHistory'
    AND c.name = 'ListPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductListPriceHistory',
        @level2type = N'COLUMN',
        @level2name = N'ListPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The official selling price of the product during the period defined by StartDate and EndDate.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductListPriceHistory',
    @level2type = N'COLUMN',
    @level2name = N'ListPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductListPriceHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductListPriceHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the record was last updated in the system.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductListPriceHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductModel
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Production.ProductModel table serves as the central hub for high-level product definitions, anchoring multi-lingual marketing collateral, technical illustrations, and manufacturing specifications. It groups specific product variants (SKUs) and stores structured XML for cataloging and assembly instructions. The table acts as a relational anchor for externalized visual assets (vector graphics) and localized descriptions, supporting a global consumer-facing product catalog of approximately 127 distinct models.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND c.name = 'ProductModelID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel',
        @level2type = N'COLUMN',
        @level2name = N'ProductModelID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the product model record.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel',
    @level2type = N'COLUMN',
    @level2name = N'ProductModelID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the product model used for branding and identification.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND c.name = 'CatalogDescription'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel',
        @level2type = N'COLUMN',
        @level2name = N'CatalogDescription';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed product specifications, features, and marketing summaries stored in XML format for web catalogs.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel',
    @level2type = N'COLUMN',
    @level2name = N'CatalogDescription';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND c.name = 'Instructions'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel',
        @level2type = N'COLUMN',
        @level2name = N'Instructions';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Manufacturing and assembly instructions, including work center locations, labor hours, and specific tools required.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel',
    @level2type = N'COLUMN',
    @level2name = N'Instructions';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for row-level tracking and synchronization across distributed databases.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModel'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModel',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp of the last update to the model information.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModel',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductModelIllustration
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelIllustration'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelIllustration';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that establishes a many-to-many relationship between product models and their corresponding illustrations. It allows multiple diagrams, assembly instructions, or visual layouts to be associated with a single product model, and enables the reuse of a single illustration across different models.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelIllustration';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelIllustration'
    AND c.name = 'ProductModelID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelIllustration',
        @level2type = N'COLUMN',
        @level2name = N'ProductModelID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key referencing the product model. It identifies which high-level product definition the illustration belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelIllustration',
    @level2type = N'COLUMN',
    @level2name = N'ProductModelID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelIllustration'
    AND c.name = 'IllustrationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelIllustration',
        @level2type = N'COLUMN',
        @level2name = N'IllustrationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key referencing the specific illustration. It identifies the graphic or diagram being linked to the product model.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelIllustration',
    @level2type = N'COLUMN',
    @level2name = N'IllustrationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelIllustration'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelIllustration',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp indicating when the association between the product model and the illustration was last created or updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelIllustration',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductModelProductDescriptionCulture
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelProductDescriptionCulture'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelProductDescriptionCulture';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that facilitates product localization by mapping product models to specific language-based descriptions. It decouples localized marketing text from the core product model, complementing the master XML catalog descriptions stored in the ProductModel table by providing discrete, culture-specific text entries for various regions.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelProductDescriptionCulture';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelProductDescriptionCulture'
    AND c.name = 'ProductModelID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelProductDescriptionCulture',
        @level2type = N'COLUMN',
        @level2name = N'ProductModelID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key identifying the specific product model. It groups various product variants under a single marketing umbrella.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelProductDescriptionCulture',
    @level2type = N'COLUMN',
    @level2name = N'ProductModelID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelProductDescriptionCulture'
    AND c.name = 'ProductDescriptionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelProductDescriptionCulture',
        @level2type = N'COLUMN',
        @level2name = N'ProductDescriptionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key identifying the specific text description. Each ID points to a unique string of marketing or technical text.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelProductDescriptionCulture',
    @level2type = N'COLUMN',
    @level2name = N'ProductDescriptionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelProductDescriptionCulture'
    AND c.name = 'CultureID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelProductDescriptionCulture',
        @level2type = N'COLUMN',
        @level2name = N'CultureID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key identifying the language or region for the description (e.g., ''en'' for English, ''fr'' for French).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelProductDescriptionCulture',
    @level2type = N'COLUMN',
    @level2name = N'CultureID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductModelProductDescriptionCulture'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductModelProductDescriptionCulture',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the mapping record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelProductDescriptionCulture',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO


-- Table: Production.ProductProductPhoto
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductProductPhoto'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductProductPhoto';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that creates a many-to-many relationship between products and their associated photographs. It specifically identifies which images are assigned to which products and designates which photo serves as the primary visual representation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductProductPhoto';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductProductPhoto'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for a product, referencing the Production.Product table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductProductPhoto'
    AND c.name = 'ProductPhotoID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ProductPhotoID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for a specific photograph, referencing the Production.ProductPhoto table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'ProductPhotoID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductProductPhoto'
    AND c.name = 'Primary'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'Primary';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A boolean flag indicating whether the associated photo is the main image used for the product in catalogs or web displays.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'Primary';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductProductPhoto'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp indicating when the product-photo association was last created or updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductReview
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores customer-submitted feedback, ratings, and detailed comments for specific products. This table facilitates a product review system, allowing the company to track customer satisfaction and provide social proof to potential buyers.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'ProductReviewID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'ProductReviewID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier and primary key for each individual product review.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'ProductReviewID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the review to a specific item in the Production.Product table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'ReviewerName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'ReviewerName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The name of the individual who authored the review.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'ReviewerName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'ReviewDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'ReviewDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the review was originally submitted.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'ReviewDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'EmailAddress'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'EmailAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The contact email address of the reviewer.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'EmailAddress';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'Rating'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'Rating';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A numerical score (likely on a scale of 1-5) representing the reviewer''s level of satisfaction.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'Rating';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'Comments'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'Comments';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full text of the product review, containing detailed feedback and descriptions of the user''s experience.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'Comments';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductReview'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductReview',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the review record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductReview',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductSubcategory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductSubcategory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductSubcategory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table defines specific sub-classifications for products, acting as a secondary level in the product hierarchy between broad categories and individual items. It organizes the company''s 504 products into 37 distinct sub-groups, such as ''Road Bikes'' or ''Handlebars'', enabling granular inventory management and reporting across the entire product catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductSubcategory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductSubcategory'
    AND c.name = 'ProductSubcategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductSubcategory',
        @level2type = N'COLUMN',
        @level2name = N'ProductSubcategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique primary identifier for each product subcategory.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductSubcategory',
    @level2type = N'COLUMN',
    @level2name = N'ProductSubcategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductSubcategory'
    AND c.name = 'ProductCategoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductSubcategory',
        @level2type = N'COLUMN',
        @level2name = N'ProductCategoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A reference to the parent category in Production.ProductCategory that this subcategory belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductSubcategory',
    @level2type = N'COLUMN',
    @level2name = N'ProductCategoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductSubcategory'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductSubcategory',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The display name of the subcategory used in catalogs and search filters.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductSubcategory',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductSubcategory'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductSubcategory',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for tracking rows across different databases, likely for merge replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductSubcategory',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductSubcategory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductSubcategory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the subcategory record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductSubcategory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ScrapReason
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ScrapReason'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ScrapReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table that defines standard reasons for scrapping products or components during the manufacturing process. It allows the production team to categorize and track the causes of material waste and quality failures within work orders. Usage patterns in related tables indicate that scrapping is a relatively rare event, with reasons recorded for only a small fraction of total production activities.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ScrapReason';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ScrapReason'
    AND c.name = 'ScrapReasonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ScrapReason',
        @level2type = N'COLUMN',
        @level2name = N'ScrapReasonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for a specific scrap reason.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ScrapReason',
    @level2type = N'COLUMN',
    @level2name = N'ScrapReasonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ScrapReason'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ScrapReason',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the scrap reason, detailing the specific mechanical failure, human error, or process deviation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ScrapReason',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ScrapReason'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ScrapReason',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the scrap reason record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ScrapReason',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.TransactionHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A central ledger recording all historical movements of products within the inventory system. It tracks stock changes resulting from sales, manufacturing (work orders), and purchasing activities, providing an audit trail for quantity and cost variances.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'TransactionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'TransactionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each inventory transaction record',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'TransactionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific product being moved or accounted for in this transaction',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'ReferenceOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'ReferenceOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ID of the source document that triggered the transaction (e.g., a Work Order, Sales Order, or Purchase Order)',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'ReferenceOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'ReferenceOrderLineID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'ReferenceOrderLineID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific line item within the source document (ReferenceOrderID) associated with this transaction',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'ReferenceOrderLineID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'TransactionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'TransactionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the inventory movement occurred',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'TransactionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'TransactionType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'TransactionType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Categorizes the source of the transaction: ''S'' for Sales Order, ''W'' for Work Order, and ''P'' for Purchase Order',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'TransactionType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'Quantity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'Quantity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of units involved in the transaction',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'Quantity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'ActualCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'ActualCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual unit cost or total cost of the product at the time of the transaction',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'ActualCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of when the transaction record was last updated',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.TransactionHistoryArchive
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A central ledger that records all inventory movements and cost changes across the manufacturing, purchasing, and sales processes. It serves as a historical audit trail for every transaction that affects product stock levels or valuation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'TransactionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'TransactionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each inventory transaction record.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'TransactionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific item involved in the transaction, linking to the master product list.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'ReferenceOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'ReferenceOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The source document ID that triggered this transaction (e.g., a Work Order, Sales Order, or Purchase Order).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'ReferenceOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'ReferenceOrderLineID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'ReferenceOrderLineID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific line item within the reference order, used when an order contains multiple products.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'ReferenceOrderLineID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'TransactionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'TransactionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the inventory movement or financial event occurred.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'TransactionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'TransactionType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'TransactionType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A code indicating the source of the transaction: ''W'' for WorkOrder (Production), ''S'' for SalesOrder (Sales), and ''P'' for PurchaseOrder (Purchasing).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'TransactionType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'Quantity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'Quantity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of units moved or processed in this transaction.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'Quantity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'ActualCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'ActualCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unit cost or total financial value associated with the product at the time of the transaction.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'ActualCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'TransactionHistoryArchive'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'TransactionHistoryArchive',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp when the transaction record was last updated in the system.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'TransactionHistoryArchive',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.UnitMeasure
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'UnitMeasure'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'UnitMeasure';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A foundational lookup table defining standardized units of measure for physical dimensions (e.g., ''CM'', ''IN'') and mass (e.g., ''LB'', ''G'', ''OZ'') used across manufacturing, inventory, and purchasing. It supports multi-unit manufacturing requirements by distinguishing between consumption units (e.g., ''EA'') and bulk procurement units (e.g., ''CTN'', ''PAK'', ''DZ'').',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'UnitMeasure';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'UnitMeasure'
    AND c.name = 'UnitMeasureCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'UnitMeasure',
        @level2type = N'COLUMN',
        @level2name = N'UnitMeasureCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique 3-character alphanumeric code representing a specific unit of measure.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'UnitMeasure',
    @level2type = N'COLUMN',
    @level2name = N'UnitMeasureCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'UnitMeasure'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'UnitMeasure',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full descriptive name of the unit of measure.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'UnitMeasure',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'UnitMeasure'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'UnitMeasure',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'UnitMeasure',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.WorkOrder
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Production.WorkOrder table tracks the manufacturing process for products. It records the quantity of items to be produced, the actual quantity completed and stocked, and any items scrapped during production along with the reason for failure. It also manages the production schedule via start, end, and due dates.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'WorkOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'WorkOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier and primary key for each work order.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'WorkOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier for the product being manufactured, referencing the Production.Product table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'OrderQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'OrderQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The total number of units requested to be produced in this work order.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'OrderQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'StockedQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'StockedQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual number of units successfully completed and moved into inventory.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'StockedQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'ScrappedQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'ScrappedQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of units that failed quality standards or were damaged during production.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'ScrappedQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when work on the order actually began.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the work order was completed.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'DueDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'DueDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The scheduled completion date for the work order.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'DueDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'ScrapReasonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'ScrapReasonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to a standard reason why items were scrapped, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'ScrapReasonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrder'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrder',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrder',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.WorkOrderRouting
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table, Production.WorkOrderRouting, records the specific sequence of manufacturing steps (operations) required to complete a work order. It tracks the schedule, actual execution time, and costs associated with each operation at various work centers (locations) within the facility.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'WorkOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'WorkOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary identifier for the work order this routing step belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'WorkOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier for the product being manufactured.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'OperationSequence'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'OperationSequence';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The order in which the manufacturing steps must be performed (e.g., step 1, step 2).',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'OperationSequence';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'LocationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'LocationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific work center or functional area where the operation takes place.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'LocationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ScheduledStartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ScheduledStartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The planned start date and time for this specific operation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ScheduledStartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ScheduledEndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ScheduledEndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The planned completion date and time for this specific operation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ScheduledEndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ActualStartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ActualStartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the operation actually began.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ActualStartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ActualEndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ActualEndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the operation was actually completed.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ActualEndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ActualResourceHrs'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ActualResourceHrs';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of labor or machine hours consumed during this operation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ActualResourceHrs';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'PlannedCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'PlannedCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The estimated cost of labor and overhead for this operation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'PlannedCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ActualCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ActualCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The real cost incurred for labor and overhead during this operation.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ActualCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'WorkOrderRouting'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'WorkOrderRouting',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'WorkOrderRouting',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO


-- Schema: Purchasing

-- Table: Purchasing.ProductVendor
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that manages the relationship between products and their approved suppliers (vendors). It stores procurement-specific metadata such as lead times, vendor-specific pricing, order quantity constraints, and tracking for the most recent transactions.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for a product, linking to the Production.Product table.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the vendor, linking to the Purchasing.Vendor table.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'AverageLeadTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'AverageLeadTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The typical number of days required for the vendor to deliver the product after an order is placed.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'AverageLeadTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'StandardPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'StandardPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current agreed-upon list price for the product when purchased from this specific vendor.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'StandardPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'LastReceiptCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'LastReceiptCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual unit cost paid for the product during the most recent delivery.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'LastReceiptCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'LastReceiptDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'LastReceiptDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the last shipment of this product was received from this vendor.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'LastReceiptDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'MinOrderQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'MinOrderQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The minimum quantity that must be ordered from this vendor in a single purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'MinOrderQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'MaxOrderQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'MaxOrderQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The maximum quantity that can be ordered from this vendor in a single purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'MaxOrderQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'OnOrderQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'OnOrderQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The quantity of the product currently requested in open purchase orders that has not yet been received.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'OnOrderQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'UnitMeasureCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'UnitMeasureCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unit of measure (e.g., Case, Each, Carton) used when ordering this product from this vendor.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'UnitMeasureCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ProductVendor'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ProductVendor',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ProductVendor',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Purchasing.PurchaseOrderDetail
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the individual line items for every purchase order, detailing the specific products requested, their costs, and the quantities received and rejected during the procurement process.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'PurchaseOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'PurchaseOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the parent purchase order header record.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'PurchaseOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'PurchaseOrderDetailID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'PurchaseOrderDetailID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each line item within a purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'PurchaseOrderDetailID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'DueDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'DueDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date by which the vendor is expected to deliver the items for this specific line.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'DueDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'OrderQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'OrderQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The quantity of the product originally ordered from the vendor.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'OrderQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key referencing the specific product being purchased.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'UnitPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'UnitPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The cost per unit of the product as specified on the purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'UnitPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'LineTotal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'LineTotal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The calculated total cost for the line item (OrderQty * UnitPrice).',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'LineTotal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'ReceivedQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'ReceivedQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual quantity of items delivered by the vendor.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'ReceivedQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'RejectedQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'RejectedQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The quantity of items that failed quality inspection or were incorrect and subsequently rejected.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'RejectedQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'StockedQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'StockedQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The final quantity of items accepted and moved into inventory (usually ReceivedQty minus RejectedQty).',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'StockedQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderDetail'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Purchasing.PurchaseOrderHeader
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores general purchase order information, acting as the header record for procurement transactions with vendors. It tracks the overall status, financial totals, and logistical details for each order placed by the company.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'PurchaseOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'PurchaseOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'PurchaseOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'RevisionNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'RevisionNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Incremental number tracking the version or number of times the purchase order has been modified.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'RevisionNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current lifecycle stage of the purchase order (e.g., 1 = Pending, 2 = Approved, 3 = Rejected, 4 = Complete).',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'EmployeeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'EmployeeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier of the employee (typically a purchasing agent) who created the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'EmployeeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'VendorID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'VendorID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier of the supplier from whom the goods are being purchased.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'VendorID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'ShipMethodID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ShipMethodID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier for the shipping company and service level used for the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ShipMethodID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'OrderDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'OrderDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the purchase order was officially placed.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'OrderDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'ShipDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ShipDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the vendor shipped the items; may be null if the order hasn''t shipped.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ShipDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'SubTotal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'SubTotal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The sum of all line items in the order before taxes and shipping costs.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'SubTotal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'TaxAmt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'TaxAmt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The total tax amount applied to the purchase order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'TaxAmt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'Freight'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'Freight';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The shipping and handling costs associated with the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'Freight';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'TotalDue'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'TotalDue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The final total cost of the order, calculated as SubTotal + TaxAmt + Freight.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'TotalDue';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'PurchaseOrderHeader'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'PurchaseOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp of the last time the purchase order record was updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'PurchaseOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Purchasing.ShipMethod
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A shared utility table that defines a unified logistics system for both inbound procurement and outbound sales. It stores shipping service names and their associated pricing models, including a base fee and a variable rate, providing a centralized configuration used across the Purchasing and Sales domains.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND c.name = 'ShipMethodID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod',
        @level2type = N'COLUMN',
        @level2name = N'ShipMethodID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier and primary key for each shipping method.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod',
    @level2type = N'COLUMN',
    @level2name = N'ShipMethodID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the shipping service or carrier method.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND c.name = 'ShipBase'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod',
        @level2type = N'COLUMN',
        @level2name = N'ShipBase';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The fixed minimum charge or base fee applied to a shipment using this method.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod',
    @level2type = N'COLUMN',
    @level2name = N'ShipBase';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND c.name = 'ShipRate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod',
        @level2type = N'COLUMN',
        @level2name = N'ShipRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The variable cost rate charged per unit (likely weight or volume) for the shipment.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod',
    @level2type = N'COLUMN',
    @level2name = N'ShipRate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for database replication and row tracking.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'ShipMethod'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'ShipMethod',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the shipping method record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'ShipMethod',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Purchasing.Vendor
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores master data for the company''s active supplier base. It extends the BusinessEntity model with vendor-level attributes such as credit ratings and preferred status, while delegating product-specific logistical constraints—such as lead times and order quantities—to related tables.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key linking the vendor to the base Person.BusinessEntity table.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'AccountNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'AccountNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique code assigned to the vendor for accounting and tracking purposes.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'AccountNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The formal name of the vendor company.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'CreditRating'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'CreditRating';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A numeric rating (1-5) indicating the vendor''s creditworthiness or reliability.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'CreditRating';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'PreferredVendorStatus'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'PreferredVendorStatus';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A boolean flag indicating if the vendor is a preferred source for purchasing.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'PreferredVendorStatus';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'ActiveFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'ActiveFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the vendor is currently active and available for new purchase orders.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'ActiveFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'PurchasingWebServiceURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'PurchasingWebServiceURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The URL for the vendor''s web service, likely used for automated electronic data interchange (EDI) or online ordering.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'PurchasingWebServiceURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Purchasing'
    AND t.name = 'Vendor'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Purchasing',
        @level1type = N'TABLE',
        @level1name = N'Vendor',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the vendor record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Purchasing',
    @level1type = N'TABLE',
    @level1name = N'Vendor',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO


-- Schema: Sales

-- Table: Sales.CountryRegionCurrency
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'CountryRegionCurrency'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CountryRegionCurrency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that maps countries and regions to their respective local currencies. It facilitates multi-currency support by defining which currency is standard for a specific geographic area.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CountryRegionCurrency';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CountryRegionCurrency'
    AND c.name = 'CountryRegionCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CountryRegionCurrency',
        @level2type = N'COLUMN',
        @level2name = N'CountryRegionCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ISO standard code identifying the country or region, acting as a link to geographic metadata.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CountryRegionCurrency',
    @level2type = N'COLUMN',
    @level2name = N'CountryRegionCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CountryRegionCurrency'
    AND c.name = 'CurrencyCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CountryRegionCurrency',
        @level2type = N'COLUMN',
        @level2name = N'CurrencyCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ISO standard three-letter code for the currency used in the associated country or region.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CountryRegionCurrency',
    @level2type = N'COLUMN',
    @level2name = N'CurrencyCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CountryRegionCurrency'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CountryRegionCurrency',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the mapping record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CountryRegionCurrency',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.CreditCard
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores credit card details as independent payment entities, including card types, numbers, and expiration dates. It functions as a central repository of payment instruments that are linked to individuals via junction tables, allowing for flexible associations where multiple people can be authorized for the same card or one person can manage multiple cards.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND c.name = 'CreditCardID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard',
        @level2type = N'COLUMN',
        @level2name = N'CreditCardID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each credit card record',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard',
    @level2type = N'COLUMN',
    @level2name = N'CreditCardID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND c.name = 'CardType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard',
        @level2type = N'COLUMN',
        @level2name = N'CardType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The brand or category of the credit card (e.g., Vista, SuperiorCard)',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard',
    @level2type = N'COLUMN',
    @level2name = N'CardType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND c.name = 'CardNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard',
        @level2type = N'COLUMN',
        @level2name = N'CardNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique credit card account number',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard',
    @level2type = N'COLUMN',
    @level2name = N'CardNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND c.name = 'ExpMonth'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard',
        @level2type = N'COLUMN',
        @level2name = N'ExpMonth';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The month the credit card expires (1-12)',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard',
    @level2type = N'COLUMN',
    @level2name = N'ExpMonth';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND c.name = 'ExpYear'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard',
        @level2type = N'COLUMN',
        @level2name = N'ExpYear';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The year the credit card expires',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard',
    @level2type = N'COLUMN',
    @level2name = N'ExpYear';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CreditCard'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CreditCard',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last time the record was updated',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CreditCard',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.Currency
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'Currency'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Currency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A master lookup table storing ISO-standard international currency codes and names. It serves as a foundational reference for global commerce, mapping currencies to nearly 100 countries and regions. It provides the basis for exchange rate tracking, specifically supporting financial operations where USD is utilized as the functional base currency for all rate calculations.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Currency';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Currency'
    AND c.name = 'CurrencyCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Currency',
        @level2type = N'COLUMN',
        @level2name = N'CurrencyCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique three-letter ISO code identifying the currency.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Currency',
    @level2type = N'COLUMN',
    @level2name = N'CurrencyCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Currency'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Currency',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The full descriptive name of the currency.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Currency',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Currency'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Currency',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the currency record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Currency',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.CurrencyRate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores historical daily exchange rates between a base currency and various foreign currencies to support international sales transactions. While it provides the necessary data for multi-currency reporting, the high null rate for CurrencyRateID in transaction tables indicates that a majority of the business is conducted in a single primary base currency, making this table an optional lookup for non-local orders.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'CurrencyRateID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'CurrencyRateID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the currency rate record',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'CurrencyRateID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'CurrencyRateDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'CurrencyRateDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific date for which the exchange rates are valid',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'CurrencyRateDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'FromCurrencyCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'FromCurrencyCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The source or base currency code (e.g., USD)',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'FromCurrencyCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'ToCurrencyCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'ToCurrencyCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The target or quote currency code being converted to',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'ToCurrencyCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'AverageRate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'AverageRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The average exchange rate for the day',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'AverageRate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'EndOfDayRate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'EndOfDayRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The final exchange rate at the close of the business day',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'EndOfDayRate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'CurrencyRate'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'CurrencyRate',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of when the record was last updated',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'CurrencyRate',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.Customer
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.Customer table serves as a central registry for all entities that purchase products, including individual consumers and retail stores. It functions as a bridge that links specific individuals (from Person.Person) or business entities (from Sales.Store) to a geographic Sales.SalesTerritory and assigns them a unique AccountNumber for tracking sales transactions.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'CustomerID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'CustomerID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier and primary key for each customer record.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'CustomerID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'PersonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'PersonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key referencing the individual person associated with this customer account. This is populated for individual consumers (B2C).',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'PersonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'StoreID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'StoreID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key referencing the store or business entity associated with this customer account. This is populated for retail or wholesale accounts (B2B).',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'StoreID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'TerritoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'TerritoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the customer to a specific geographic sales region for tax, shipping, and sales performance tracking.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'TerritoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'AccountNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'AccountNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique, human-readable business identifier for the customer account, typically used in billing and external communications.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'AccountNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ROWGUIDCOL used for uniquely identifying a row across multiple databases, primarily for merge replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Customer'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Customer',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the customer record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Customer',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.PersonCreditCard
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'PersonCreditCard'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'PersonCreditCard';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that links individuals (Person.Person) to their credit cards (Sales.CreditCard). It serves as a mapping layer that allows a single person to manage multiple payment methods for use in the checkout and payment process.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'PersonCreditCard';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'PersonCreditCard'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'PersonCreditCard',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key referencing the individual associated with the credit card.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'PersonCreditCard',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'PersonCreditCard'
    AND c.name = 'CreditCardID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'PersonCreditCard',
        @level2type = N'COLUMN',
        @level2name = N'CreditCardID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key referencing the specific credit card details.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'PersonCreditCard',
    @level2type = N'COLUMN',
    @level2name = N'CreditCardID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'PersonCreditCard'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'PersonCreditCard',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the association between the person and the credit card was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'PersonCreditCard',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesOrderDetail
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.SalesOrderDetail table stores the individual line items for every sales order in the system. It acts as a child table to Sales.SalesOrderHeader, breaking down a single order into its constituent products, quantities, and prices, while also tracking shipping information and promotional discounts applied to specific items.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'SalesOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'SalesOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier of the parent sales order, linking this line item to the header record in Sales.SalesOrderHeader.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'SalesOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'SalesOrderDetailID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'SalesOrderDetailID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'An individual incrementing identifier for each line item within the database.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'SalesOrderDetailID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'CarrierTrackingNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'CarrierTrackingNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The shipping tracking number provided by the logistics carrier. The ~50% null rate suggests this is only populated once an item has shipped or is only applicable to certain shipping methods.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'CarrierTrackingNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'OrderQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'OrderQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The quantity of the specific product ordered in this line item.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'OrderQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier of the product being purchased, referencing the Production.Product catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'SpecialOfferID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'SpecialOfferID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The identifier for a specific promotion or discount applied to this product line item.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'SpecialOfferID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'UnitPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'UnitPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The selling price per unit of the product at the time of the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'UnitPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'UnitPriceDiscount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'UnitPriceDiscount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The discount amount or percentage applied to the UnitPrice, derived from the associated SpecialOfferID.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'UnitPriceDiscount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'LineTotal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'LineTotal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The calculated total for the line item, typically (UnitPrice * (1 - UnitPriceDiscount)) * OrderQty.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'LineTotal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for row-level synchronization across distributed databases.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderDetail'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderDetail',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the line item record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderDetail',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesOrderHeader
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.SalesOrderHeader table serves as the primary record for all customer sales transactions. It stores high-level order metadata including transaction dates, shipping details, payment information, and financial totals (tax, freight, and subtotal), while linking to specific customers, sales representatives, and geographic territories.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'SalesOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'SalesOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the sales order header record.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'SalesOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'RevisionNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'RevisionNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Incremental number tracking changes or updates made to the order record.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'RevisionNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'OrderDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'OrderDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the order was placed by the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'OrderDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'DueDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'DueDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date by which the order is expected to be delivered or completed.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'DueDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'ShipDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ShipDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual date the order was shipped to the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ShipDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The current processing state of the order (e.g., 5 likely represents ''Shipped'' or ''Complete'').',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'OnlineOrderFlag'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'OnlineOrderFlag';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the order was placed online (true) or through a sales person (false).',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'OnlineOrderFlag';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'SalesOrderNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'SalesOrderNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique human-readable identifier for the sales order, typically used for customer support and tracking.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'SalesOrderNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'PurchaseOrderNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'PurchaseOrderNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The customer''s internal purchase order reference number, primarily used in B2B transactions.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'PurchaseOrderNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'AccountNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'AccountNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique account reference number assigned to the customer.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'AccountNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'CustomerID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'CustomerID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the order to the Sales.Customer who placed it.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'CustomerID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'SalesPersonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'SalesPersonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the order to the Sales.SalesPerson responsible for the sale.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'SalesPersonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'TerritoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'TerritoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the order to the Sales.SalesTerritory where the sale occurred.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'TerritoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'BillToAddressID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'BillToAddressID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking to the Person.Address where the invoice should be sent.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'BillToAddressID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'ShipToAddressID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ShipToAddressID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking to the Person.Address where the products should be delivered.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ShipToAddressID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'ShipMethodID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ShipMethodID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking to the Purchasing.ShipMethod used to transport the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ShipMethodID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'CreditCardID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'CreditCardID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking to the Sales.CreditCard used for payment.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'CreditCardID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'CreditCardApprovalCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'CreditCardApprovalCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The authorization code returned by the credit card processor for the transaction.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'CreditCardApprovalCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'CurrencyRateID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'CurrencyRateID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking to the Sales.CurrencyRate used to convert the order total for international sales.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'CurrencyRateID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'SubTotal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'SubTotal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The sum of all line items in the order before taxes and shipping fees.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'SubTotal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'TaxAmt'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'TaxAmt';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The total tax amount calculated for the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'TaxAmt';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'Freight'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'Freight';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The total shipping and handling cost for the order.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'Freight';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'TotalDue'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'TotalDue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The final total amount the customer must pay (SubTotal + TaxAmt + Freight).',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'TotalDue';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'Comment'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'Comment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional notes or comments regarding the sales order.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'Comment';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeader'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeader',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeader',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesOrderHeaderSalesReason
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeaderSalesReason'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeaderSalesReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that associates sales orders with one or more reasons for the purchase. It enables many-to-many relationships between orders and standardized sales reasons, allowing the business to track the effectiveness of promotions, marketing, or other purchase drivers.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeaderSalesReason';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeaderSalesReason'
    AND c.name = 'SalesOrderID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeaderSalesReason',
        @level2type = N'COLUMN',
        @level2name = N'SalesOrderID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier of the sales order. This is a foreign key linking to the header of the transaction.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeaderSalesReason',
    @level2type = N'COLUMN',
    @level2name = N'SalesOrderID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeaderSalesReason'
    AND c.name = 'SalesReasonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeaderSalesReason',
        @level2type = N'COLUMN',
        @level2name = N'SalesReasonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier of the reason for the sale (e.g., ''Price'', ''Promotion'', ''Review'').',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeaderSalesReason',
    @level2type = N'COLUMN',
    @level2name = N'SalesReasonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesOrderHeaderSalesReason'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesOrderHeaderSalesReason',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesOrderHeaderSalesReason',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesPerson
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.SalesPerson table stores performance metrics, compensation structures, and territory assignments for employees designated as sales representatives. It acts as a specialized extension of the HumanResources.Employee table, tracking financial targets (quotas), incentives (bonuses and commissions), and actual sales performance. While these representatives are assigned to specific geographic regions, they are involved in only a small fraction (approximately 12%) of total sales transactions, as the majority of orders are processed through automated or online channels without direct sales representative intervention.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key linking to the HumanResources.Employee table, identifying the specific employee who is a salesperson.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'TerritoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'TerritoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier for the geographic sales region currently assigned to the salesperson.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'TerritoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'SalesQuota'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'SalesQuota';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The projected sales target or goal assigned to the salesperson for the current period.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'SalesQuota';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'Bonus'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'Bonus';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The amount of extra performance-based pay earned by the salesperson.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'Bonus';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'CommissionPct'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'CommissionPct';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The percentage rate used to calculate commission earned on sales made by this individual.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'CommissionPct';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'SalesYTD'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'SalesYTD';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The total cumulative sales amount generated by the salesperson in the current fiscal year to date.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'SalesYTD';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'SalesLastYear'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'SalesLastYear';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The total sales amount generated by the salesperson in the previous fiscal year.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'SalesLastYear';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPerson'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPerson',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPerson',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesPersonQuotaHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPersonQuotaHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPersonQuotaHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table tracks the historical sales quotas assigned to sales representatives over time. It allows the organization to monitor how sales targets have evolved for each salesperson, typically on a quarterly basis, providing a longitudinal view of performance expectations.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPersonQuotaHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPersonQuotaHistory'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPersonQuotaHistory',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The unique identifier for the salesperson, serving as a foreign key to the Sales.SalesPerson table.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPersonQuotaHistory',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPersonQuotaHistory'
    AND c.name = 'QuotaDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPersonQuotaHistory',
        @level2type = N'COLUMN',
        @level2name = N'QuotaDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The effective date or start date of the specific sales quota period.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPersonQuotaHistory',
    @level2type = N'COLUMN',
    @level2name = N'QuotaDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPersonQuotaHistory'
    AND c.name = 'SalesQuota'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPersonQuotaHistory',
        @level2type = N'COLUMN',
        @level2name = N'SalesQuota';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The projected sales target amount (in currency) assigned to the salesperson for the period.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPersonQuotaHistory',
    @level2type = N'COLUMN',
    @level2name = N'SalesQuota';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPersonQuotaHistory'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPersonQuotaHistory',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier used for row-level tracking and synchronization, common in replicated environments.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPersonQuotaHistory',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesPersonQuotaHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesPersonQuotaHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp indicating when the quota record was last created or updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesPersonQuotaHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesReason
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesReason'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A lookup table containing seven categories that define why a sales order was placed, such as marketing advertisements, promotions, or product quality. It serves as a master list for categorizing the drivers behind customer purchases and is actively used to tag tens of thousands of transactions across the sales system.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesReason';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesReason'
    AND c.name = 'SalesReasonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesReason',
        @level2type = N'COLUMN',
        @level2name = N'SalesReasonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and unique identifier for each sales reason.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesReason',
    @level2type = N'COLUMN',
    @level2name = N'SalesReasonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesReason'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesReason',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the sales reason, such as the specific advertisement medium or purchase driver.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesReason',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesReason'
    AND c.name = 'ReasonType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesReason',
        @level2type = N'COLUMN',
        @level2name = N'ReasonType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A high-level grouping for the sales reasons, used to aggregate data for reporting.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesReason',
    @level2type = N'COLUMN',
    @level2name = N'ReasonType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesReason'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesReason',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesReason',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesTaxRate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.SalesTaxRate table stores specific sales tax percentages and types associated with geographic regions (states and provinces). It is used by the sales system to calculate the appropriate tax amount for orders based on the customer''s location.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'SalesTaxRateID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'SalesTaxRateID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the sales tax rate record.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'SalesTaxRateID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'StateProvinceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'StateProvinceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key identifying the state or province to which the tax rate applies.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'StateProvinceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'TaxType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'TaxType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A category code for the tax (e.g., 1 = State/Provincial, 2 = County/Local, 3 = Federal/GST).',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'TaxType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'TaxRate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'TaxRate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual percentage rate used to calculate sales tax.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'TaxRate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the tax rate for display on invoices or reports.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ROWGUIDCOL number uniquely identifying the record, used for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTaxRate'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTaxRate',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the tax rate record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTaxRate',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesTerritory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.SalesTerritory table defines geographical regions—granularly mapped to states and provinces—used to organize the sales force, track performance, and facilitate tax rate application. It categorizes territories into broad groups and countries, maintains year-to-date and historical financial figures, and serves as the primary organizational unit for assigning multiple salespersons to specific regions.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'TerritoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'TerritoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each sales territory.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'TerritoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The descriptive name of the sales territory (e.g., ''Northwest'', ''Germany'').',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'CountryRegionCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'CountryRegionCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ISO standard code for the country or region associated with the territory.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'CountryRegionCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'Group'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'Group';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A higher-level geographic grouping for the territories, such as ''North America'' or ''Europe''.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'Group';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'SalesYTD'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'SalesYTD';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total sales revenue generated within the territory for the current year to date.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'SalesYTD';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'SalesLastYear'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'SalesLastYear';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total sales revenue generated within the territory during the previous fiscal year.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'SalesLastYear';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'CostYTD'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'CostYTD';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total costs incurred by the territory for the current year to date.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'CostYTD';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'CostLastYear'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'CostLastYear';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total costs incurred by the territory during the previous fiscal year.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'CostLastYear';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ROWGUIDCOL number uniquely identifying the record, used for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SalesTerritoryHistory
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales.SalesTerritoryHistory table tracks the historical and current assignments of salespersons to specific sales territories over time. It allows the organization to maintain a record of which sales representative was responsible for which geographic region during specific date ranges.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key identifying the salesperson. Part of the composite primary key.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND c.name = 'TerritoryID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory',
        @level2type = N'COLUMN',
        @level2name = N'TerritoryID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key identifying the sales territory assigned to the salesperson. Part of the composite primary key.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory',
    @level2type = N'COLUMN',
    @level2name = N'TerritoryID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the salesperson began their assignment in the specified territory. Part of the composite primary key.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date the salesperson''s assignment in the territory ended. A NULL value typically indicates the assignment is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for row tracking and synchronization, likely for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SalesTerritoryHistory'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SalesTerritoryHistory',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SalesTerritoryHistory',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.ShoppingCartItem
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual product line items within a customer''s active shopping cart before an order is finalized. It tracks the quantity of specific products and associates them with a unique cart identifier.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND c.name = 'ShoppingCartItemID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem',
        @level2type = N'COLUMN',
        @level2name = N'ShoppingCartItemID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the shopping cart item record.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem',
    @level2type = N'COLUMN',
    @level2name = N'ShoppingCartItemID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND c.name = 'ShoppingCartID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem',
        @level2type = N'COLUMN',
        @level2name = N'ShoppingCartID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A unique identifier for the shopping cart session, often representing a customer ID or a temporary session token.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem',
    @level2type = N'COLUMN',
    @level2name = N'ShoppingCartID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND c.name = 'Quantity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem',
        @level2type = N'COLUMN',
        @level2name = N'Quantity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The number of units of the specified product added to the cart.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem',
    @level2type = N'COLUMN',
    @level2name = N'Quantity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key referencing the specific product being purchased.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND c.name = 'DateCreated'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem',
        @level2type = N'COLUMN',
        @level2name = N'DateCreated';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp when the item was first added to the shopping cart.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem',
    @level2type = N'COLUMN',
    @level2name = N'DateCreated';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'ShoppingCartItem'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'ShoppingCartItem',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The timestamp when the cart item (e.g., quantity) was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'ShoppingCartItem',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SpecialOffer
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores definitions for promotional discounts and volume-based pricing offers, including discount percentages, validity periods, and quantity requirements. These offers are designed to be mapped to specific products rather than applied globally, allowing for targeted marketing events and category-specific promotions.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'SpecialOfferID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'SpecialOfferID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key for the special offer record.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'SpecialOfferID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A human-readable name or description of the promotion or discount tier.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'DiscountPct'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'DiscountPct';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The percentage of discount applied to the product price, expressed as a decimal.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'DiscountPct';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'Type'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'Type';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The classification of the offer, such as volume-based, seasonal, or inventory-clearing.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'Type';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The target group for the offer, distinguishing between direct customers and resellers.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the promotional offer becomes active.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time when the promotional offer expires.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'MinQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'MinQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The minimum quantity of items that must be purchased to qualify for the discount.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'MinQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'MaxQty'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'MaxQty';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The maximum quantity of items allowed for the discount tier; NULL usually indicates no upper limit.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'MaxQty';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ROWGUIDCOL number uniquely identifying the record, used for database replication.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOffer'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOffer',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOffer',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.SpecialOfferProduct
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOfferProduct'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOfferProduct';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A junction table that creates a many-to-many relationship between products and special offers. It defines which specific products are eligible for promotional discounts, volume pricing, or seasonal offers, and serves as a strictly enforced validation mechanism to ensure only valid product-promotion combinations are applied to sales orders.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOfferProduct';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOfferProduct'
    AND c.name = 'SpecialOfferID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOfferProduct',
        @level2type = N'COLUMN',
        @level2name = N'SpecialOfferID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key referencing Sales.SpecialOffer. Identifies the specific promotion or discount program.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOfferProduct',
    @level2type = N'COLUMN',
    @level2name = N'SpecialOfferID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOfferProduct'
    AND c.name = 'ProductID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOfferProduct',
        @level2type = N'COLUMN',
        @level2name = N'ProductID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key referencing Production.Product. Identifies the specific item eligible for the associated special offer.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOfferProduct',
    @level2type = N'COLUMN',
    @level2name = N'ProductID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOfferProduct'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOfferProduct',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier used for database replication and synchronization.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOfferProduct',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'SpecialOfferProduct'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'SpecialOfferProduct',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the mapping between the product and the special offer was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'SpecialOfferProduct',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Sales.Store
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores detailed information about the retail stores and wholesale outlets that purchase products from the company. This table defines the commercial (B2B) customer segment, which represents a small but specifically managed portion of the total customer base. It extends the base business entity identity with store-specific attributes, account management assignments, and operational demographics.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND c.name = 'BusinessEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store',
        @level2type = N'COLUMN',
        @level2name = N'BusinessEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key and foreign key linking to the base Person.BusinessEntity record, identifying the store as a unique legal entity.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'BusinessEntityID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The registered or trade name of the store or retail outlet.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND c.name = 'SalesPersonID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store',
        @level2type = N'COLUMN',
        @level2name = N'SalesPersonID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ID of the internal salesperson assigned to manage the relationship and sales for this specific store account.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'SalesPersonID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND c.name = 'Demographics'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store',
        @level2type = N'COLUMN',
        @level2name = N'Demographics';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'XML-formatted data containing store survey results, including annual revenue, bank name, business type, year opened, specialty, and square footage.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'Demographics';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND c.name = 'rowguid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store',
        @level2type = N'COLUMN',
        @level2name = N'rowguid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A globally unique identifier used for tracking the row across different database instances or for replication purposes.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'rowguid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Sales'
    AND t.name = 'Store'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Sales',
        @level1type = N'TABLE',
        @level1name = N'Store',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date and time the store record was last updated.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO
