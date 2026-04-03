-- Database Documentation Script
-- Generated: 2026-03-22T13:08:36.477Z
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
    @value = N'A singleton system metadata table that stores version and build information for the AdventureWorks database itself. It tracks the current database version number, when that version was released, and when the record was last modified. This table serves as a self-documenting artifact for database administrators and deployment pipelines to identify which version of the database schema is installed.',
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
    @value = N'Surrogate primary key for the table. Always contains the value 1 since this is a singleton table with exactly one row representing the current database build version.',
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
    @value = N'The version number of the AdventureWorks database schema, stored as a string in the format matching SQL Server version numbering (e.g., ''15.0.4280.7''). This identifies the specific build or release of the database.',
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
    @value = N'The date and time when the current database version was officially released or created. Represents the timestamp of the version identified in the ''Database Version'' column.',
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
    @value = N'The date and time when this record was last updated. Tracks the most recent modification to the system information row, which may reflect when the database was last patched or the record was last touched.',
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
    @value = N'A database-level audit log that records all DDL (Data Definition Language) events executed against the AdventureWorks2019 database. Each row captures a single DDL statement execution, including the event type, the T-SQL command issued, the database object affected, and a full XML representation of the event instance. This table serves as a historical record of schema creation and modification activities, primarily capturing the initial database build/deployment script execution.',
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
    @value = N'Surrogate primary key that uniquely identifies each DDL event log entry. Auto-incremented integer assigned to each logged database event.',
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
    @value = N'The date and time when the DDL event was captured and logged. Reflects the exact timestamp of the DDL statement execution.',
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
    @value = N'The database user account that executed the DDL statement. Identifies who performed the schema change within the database context.',
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
    @value = N'The type of DDL event that was captured. Identifies the category of schema change operation performed (e.g., CREATE_TABLE, ALTER_TABLE, CREATE_INDEX, CREATE_PROCEDURE, CREATE_VIEW, CREATE_FUNCTION, CREATE_TRIGGER, CREATE_EXTENDED_PROPERTY, etc.).',
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
    @value = N'The database schema that owns the object affected by the DDL event. Identifies the organizational namespace of the modified database object.',
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
    @value = N'The name of the specific database object affected by the DDL event, such as a table name, index name, constraint name, column name, function name, or procedure name.',
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
    @value = N'The complete T-SQL statement that was executed and triggered the DDL event. Stores the exact SQL command text, including CREATE TABLE, ALTER TABLE, CREATE INDEX, EXECUTE sp_addextendedproperty, and other DDL statements.',
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
    @value = N'The full XML representation of the DDL event instance as captured by SQL Server''s EVENTDATA() function within a DDL trigger. Contains comprehensive event metadata including event type, timestamp, server name, SPID, login name, database name, schema name, object name, object type, and the complete T-SQL command with session SET options.',
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
    @value = N'A system-level audit table that records database errors encountered during stored procedure or batch execution. It captures detailed information about each error event, including when it occurred, who triggered it, and the specific error details such as number, severity, state, procedure name, line number, and message. This table serves as a centralized error logging mechanism for the AdventureWorks database.',
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
    @value = N'The primary key and unique identifier for each error log entry. Auto-incremented integer that uniquely identifies each recorded error event.',
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
    @value = N'The date and time when the error occurred. Records the exact timestamp of the error event for chronological tracking and debugging.',
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
    @value = N'The database username of the user whose session triggered the error. Identifies which user or service account was executing code when the error occurred.',
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
    @value = N'The SQL Server error number associated with the error. Corresponds to the value returned by the ERROR_NUMBER() function within a TRY/CATCH block.',
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
    @value = N'The severity level of the error, ranging from 0 to 25 in SQL Server. Higher values indicate more critical errors. Nullable because some errors may not have an associated severity.',
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
    @value = N'The state number of the error, which provides additional context about the error''s origin within SQL Server. Nullable as not all errors have a meaningful state value.',
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
    @value = N'The name of the stored procedure or trigger in which the error occurred. Nullable because errors can occur outside of stored procedures (e.g., in ad-hoc batches).',
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
    @value = N'The line number within the stored procedure, trigger, or batch at which the error occurred. Nullable for cases where a line number cannot be determined.',
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
    @value = N'The full text of the error message describing what went wrong. This is the human-readable description of the error event.',
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
    @value = N'A lookup/reference table that stores the organizational departments within the company. Each row represents a distinct department, categorized under a broader functional group. This table serves as the foundational reference for employee department assignments tracked in HumanResources.EmployeeDepartmentHistory.',
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
    @value = N'The primary key and unique identifier for each department. A small integer auto-incremented from 1 to 16, uniquely identifying each of the 16 departments in the organization.',
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
    @value = N'The full descriptive name of the department (e.g., ''Sales'', ''Engineering'', ''Human Resources''). This is the human-readable identifier used to distinguish departments.',
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
    @value = N'The higher-level functional group or division to which the department belongs (e.g., ''Manufacturing'', ''Sales and Marketing'', ''Executive General and Administration''). Groups multiple departments under a common organizational umbrella.',
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
    @value = N'The date and time when the department record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores employment-specific information for all 290 employees at AdventureWorks. This table extends Person.Person with HR-specific attributes such as job title, organizational hierarchy position, national ID, login credentials, hire date, compensation type, and leave balances. It represents the core employee record in the HumanResources domain and serves as the anchor for pay history, department assignments, job candidacy, and sales/purchasing roles.

Compensation data reveals that the majority of employees (approximately 264 of 290) have only their initial pay rate on record, with ~26 having received at least one pay rate change. Pay rates range from $6.50 to $37.50 per hour, and two distinct payroll cycles (PayFrequency values 1 and 2) distinguish likely hourly/non-exempt workers from salaried/exempt employees. Department assignments are notably stable, with only ~6 employees having transfer records, confirming that EmployeeDepartmentHistory is a sparse audit trail rather than a frequently updated record.

The table also anchors several specialized workforce subsets: only 17 employees (BusinessEntityIDs 274–290) are designated salespeople, confirming Sales.SalesPerson as a small, dedicated specialization of this table. Purchasing authority is similarly restricted to a dedicated procurement team of 12 employees, and document management is concentrated among just 3 employees — both patterns reflecting role-based access controls anchored here. Additionally, this table serves as the destination for a pre-hire pipeline: HumanResources.JobCandidate tracks applicants, but only a small fraction (2 of 13 sampled candidates) are converted to employees.',
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
    @value = N'Primary key and foreign key to Person.Person.BusinessEntityID. Uniquely identifies each employee and links the employee record to the corresponding person record, enabling access to name, contact, and demographic information stored in Person.Person.',
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
    @value = N'The employee''s national identification number (e.g., Social Security Number in the US). Used for payroll, tax, and legal identification purposes.',
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
    @value = N'The employee''s network login identifier in domain\username format (e.g., ''adventure-works\michael9''). Used for system authentication and access control.',
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
    @value = N'A hierarchyid value representing the employee''s position in the organizational hierarchy tree. Encodes the full path from the root of the organization to this employee''s node.',
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
    @value = N'A computed or stored integer indicating the depth of the employee''s node in the organizational hierarchy. Level 1 is the top (e.g., CEO), and higher numbers represent lower levels (e.g., 4 = front-line worker).',
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
    @value = N'The official job title of the employee within the organization (e.g., ''Production Technician - WC60'', ''Design Engineer'', ''Pacific Sales Manager'').',
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
    @value = N'The employee''s date of birth. Used for age verification, benefits eligibility, and HR compliance purposes.',
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
    @value = N'The employee''s marital status, encoded as a single character: ''M'' for Married, ''S'' for Single.',
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
    @value = N'The employee''s gender, encoded as a single character: ''M'' for Male, ''F'' for Female.',
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
    @value = N'The date the employee was hired by the company. Used for tenure calculations, benefits eligibility, and HR reporting.',
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
    @value = N'Indicates whether the employee is salaried (true) or hourly/non-salaried (false). Determines payroll processing method.',
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
    @value = N'The number of vacation hours the employee has accrued or is entitled to. Used for leave management and payroll.',
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
    @value = N'The number of sick leave hours the employee has accrued or is entitled to. Used for leave management and HR compliance.',
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
    @value = N'Indicates whether the employee is currently active (true) or has been terminated/separated (false). All 290 rows have a value of true, meaning this table only contains current employees.',
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
    @value = N'A globally unique identifier (GUID) for the employee record. Used for replication, data synchronization, and uniquely identifying rows across distributed systems.',
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
    @value = N'The date and time when the employee record was last modified. Used for auditing and change tracking.',
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
    @value = N'Tracks the historical record of employee department and shift assignments over time within AdventureWorks. Each row represents a period during which an employee was assigned to a specific department and work shift, with start and optional end dates defining the duration of that assignment. This is a slowly changing dimension (Type 2) table that preserves the full history of department/shift changes for each employee.',
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
    @value = N'Foreign key referencing the employee (HumanResources.Employee.BusinessEntityID). Identifies which employee this department/shift assignment belongs to.',
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
    @value = N'Foreign key referencing HumanResources.Department. Identifies the department the employee was assigned to during this period.',
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
    @value = N'Foreign key referencing HumanResources.Shift. Identifies the work shift (Day=1, Evening=2, Night=3) the employee worked during this assignment period.',
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
    @value = N'The date on which the employee began working in the specified department and shift. Together with EndDate, defines the duration of this assignment.',
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
    @value = N'The date on which the employee''s assignment to this department and shift ended. NULL indicates the assignment is currently active. Only 6 distinct non-null values exist, representing the few employees who have changed departments or left.',
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
    @value = N'The date and time the record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores the historical pay rate records for employees at AdventureWorks, tracking changes in compensation over time. Each row represents a specific pay rate effective from a given date for an employee, enabling a full audit trail of salary/wage changes. This is the HumanResources.EmployeePayHistory table.',
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
    @value = N'The unique identifier of the employee whose pay rate is being recorded. Part of the composite primary key and a foreign key referencing HumanResources.Employee.BusinessEntityID.',
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
    @value = N'The effective date on which the pay rate change took effect. Together with BusinessEntityID, forms the composite primary key, allowing multiple pay rate records per employee over time.',
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
    @value = N'The hourly pay rate for the employee effective from the RateChangeDate. Stored as a money data type, with values ranging from approximately $6.50 to $37.50 per hour.',
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
    @value = N'Indicates how frequently the employee is paid. Only two values exist: 1 = Monthly pay cycle, 2 = Bi-weekly (every two weeks) pay cycle.',
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
    @value = N'The date and time the record was last modified. Standard audit column used across AdventureWorks tables to track when data was last updated.',
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
    @value = N'Stores job candidate applications and their associated resumes for the AdventureWorks company. Each record represents a single job applicant, optionally linked to an existing employee if the candidate was subsequently hired. The resume is stored as structured XML containing personal information, employment history, education, skills, and contact details.',
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
    @value = N'Surrogate primary key uniquely identifying each job candidate record. Auto-incremented integer assigned when a new candidate application is created.',
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
    @value = N'Optional foreign key linking a job candidate to an existing employee in HumanResources.Employee. NULL for candidates who have not been hired; populated when a candidate is subsequently hired and becomes an employee.',
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
    @value = N'Structured XML document containing the candidate''s full resume, including personal name, professional skills summary, employment history (employer, job title, responsibilities, dates, location), education (degree, school, GPA, dates), contact address, phone numbers, email, and website. Resumes appear in multiple languages including English, Chinese (Simplified), French, and Thai.',
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
    @value = N'Timestamp recording when the job candidate record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'A lookup/reference table defining the work shifts used in the organization. It stores the three standard work shifts (Day, Evening, Night) with their respective start and end times, serving as a foundational reference for employee scheduling and department history tracking.',
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
    @value = N'The primary key uniquely identifying each work shift. A small integer (tinyint) appropriate for a small, fixed set of shift types.',
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
    @value = N'The human-readable name of the shift (Day, Evening, Night), used for display and identification purposes.',
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
    @value = N'The time of day when the shift begins. Day shift starts at 07:00, Evening at 15:00, and Night at 23:00.',
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
    @value = N'The time of day when the shift ends. Day shift ends at 15:00, Evening at 23:00, and Night at 07:00 (next day).',
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
    @value = N'The date and time when the shift record was last modified. All records share the same date (2008-04-30), indicating they were created or last updated together as seed data.',
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
    @value = N'Stores physical address information for persons, businesses, and other entities in the AdventureWorks database. Each row represents a unique mailing or shipping address including street, city, state/province, postal code, and geographic coordinates. This table serves as a central address repository referenced by sales orders and business entity address associations. Notably, addresses are not shared between business entities — each business entity association uses a distinct address record, meaning duplicate physical locations are stored as separate rows rather than being reused across entities.',
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
    @value = N'Surrogate primary key uniquely identifying each address record in the system.',
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
    @value = N'The primary street address line, typically containing the street number and street name.',
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
    @value = N'Optional secondary address line for suite numbers, apartment numbers, department names, or other supplementary address information.',
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
    @value = N'The city or municipality name for the address.',
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
    @value = N'Foreign key referencing Person.StateProvince, identifying the state, province, or other sub-national geographic division for the address.',
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
    @value = N'The postal or ZIP code for the address, stored as a string to accommodate international formats.',
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
    @value = N'Geographic coordinates (latitude/longitude) of the address stored as a SQL Server geography type using the WGS84 coordinate system (SRID 4326), enabling spatial queries and mapping.',
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
    @value = N'A globally unique identifier (GUID) for the address row, used for replication and row-level identification across distributed systems.',
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
    @value = N'The date and time when the address record was last modified, used for auditing and change tracking.',
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
    @value = N'A lookup/reference table that defines the types of addresses used throughout the system. It categorizes addresses into distinct types such as Billing, Shipping, Home, Primary, Main Office, and Archive, enabling consistent classification of addresses associated with business entities. In practice, only 3 of the 6 defined address types are actively used in business entity address associations (IDs 2, 3, and 5), with type 2 being the most frequently used. The remaining types (Billing, Home, Archive, or others) appear to be defined for potential use but are not currently utilized in the system.',
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
    @value = N'The primary key and unique identifier for each address type. An integer surrogate key that uniquely identifies each address classification category.',
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
    @value = N'The human-readable name of the address type (e.g., Billing, Shipping, Home, Primary, Main Office, Archive). This is the descriptive label used to classify an address''s purpose or role.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used to support replication and row-level identification across distributed systems.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'The foundational polymorphic identity table for the AdventureWorks database, serving as the root identity record for all business entities across multiple distinct subtypes. Every entity in the system — whether an individual person (of 6 types: individual customers, store contacts, general contacts, employees, vendor contacts, and salespersons), a vendor organization, or a retail/wholesale store — must first exist as a record in this table, which assigns a unique BusinessEntityID. The table contains only three columns: an identity key, a rowguid for replication, and a ModifiedDate for auditing, reflecting its role as a pure identity registry rather than a data store. With 20,777 total records, individual persons (via Person.Person) account for approximately 19,972 records (~96%), making them the dominant subtype. Vendor organizations occupy a higher ID range (~1500–1690), while store entities use IDs in the range 304–1944, suggesting entities were registered in batches or phases. The remaining ~805 records (~4%) represent non-person organizational entities (vendors and stores), which notably do not have email addresses in the system — email addresses are exclusively assigned to person-type entities, further reinforcing the distinction between person and organizational subtypes. The table also anchors address associations (with ~19,579 entities having at least one address) and organizational contact relationships (805 organizational entities with named contact persons). This table acts as the true polymorphic anchor for the entire entity hierarchy, enabling a table-per-type inheritance pattern across persons, vendors, and stores.',
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
    @value = N'The unique identifier for every business entity in the system. This is the primary key and serves as the root identity that all specialized entity tables (Person, Vendor, Store, etc.) inherit and reference. It is an integer surrogate key auto-assigned to each new entity.',
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
    @value = N'A globally unique identifier (GUID) assigned to each business entity record. Used to uniquely identify rows across distributed systems, replication scenarios, or data merges where integer keys may conflict.',
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
    @value = N'The date and time when the business entity record was last modified. Used for auditing and change tracking purposes. All sample values fall on the same date (2017-12-13), suggesting a bulk load or migration event, but the millisecond-level precision indicates individual record timestamps.',
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
    @value = N'A junction/bridge table that associates business entities (persons, vendors, stores) with their physical addresses and categorizes each association by address type. This table implements a many-to-many relationship between business entities and addresses, allowing a single entity to have multiple addresses of different types simultaneously. The six address types (Billing, Shipping, Home, Primary, Main Office, Archive) reveal a dual-purpose design: commercial entities (vendors, stores) typically use Billing, Shipping, and Main Office address types, while individual persons use Home and Primary address types. It serves as the central linking mechanism for address data across the AdventureWorks system and is referenced by sales order processing.',
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
    @value = N'The unique identifier of the business entity (person, vendor, or store) associated with the address. References Person.BusinessEntity as the root identity record. Part of the composite primary key.',
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
    @value = N'The unique identifier of the physical address associated with the business entity. References Person.Address which stores the full address details. Part of the composite primary key.',
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
    @value = N'Classifies the type of address for this business entity association (e.g., Home, Billing, Shipping, Main Office). Only 3 distinct values are used (2, 3, 5) out of the available address types in Person.AddressType. Part of the composite primary key.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used for replication and row-level identification across distributed systems. Standard AdventureWorks audit column.',
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
    @value = N'The date and time when the business entity address association record was last modified. Used for auditing and change tracking.',
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
    @value = N'A junction/bridge table that associates persons with business entities and defines the nature of their contact relationship via a contact type. Each record represents a specific person acting in a specific role for a given business entity such as a vendor or store. This table enables many-to-many relationships between business entities and persons, with the contact type clarifying the role of the person within that entity. Contact roles span multiple functional domains including sales (Sales Representative, Sales Manager, Sales Associate, Sales Agent, Assistant Sales Representative, Assistant Sales Agent, Regional Account Representative), purchasing (Purchasing Manager, Purchasing Agent), marketing (Marketing Manager, Marketing Representative, Marketing Assistant, International Marketing Manager, Product Manager), ownership (Owner, Owner/Marketing Assistant), and administrative roles (Order Administrator, Export Administrator, Coordinator Foreign Markets, Accounting Manager). With 909 rows and 805 distinct BusinessEntityIDs, some business entities have multiple contacts serving different functional roles.',
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
    @value = N'The unique identifier of the business entity (such as a vendor or store) that the contact person is associated with. References Person.BusinessEntity as the root identity record. This is part of the composite primary key.',
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
    @value = N'The unique identifier of the person who serves as a contact for the business entity. References Person.Person.BusinessEntityID. This is part of the composite primary key and identifies the individual in the contact relationship.',
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
    @value = N'The type or role of the contact relationship, such as Owner, Sales Representative, or Purchasing Manager. References Person.ContactType.ContactTypeID. This is part of the composite primary key and classifies the nature of the person''s role within the business entity.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used for replication and row-level identification across distributed systems. Standard AdventureWorks auditing column.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'A lookup/reference table that defines the types of contacts (roles) that can be associated with business entities. It stores a predefined set of 20 contact role classifications such as Sales Representative, Purchasing Manager, Marketing Assistant, etc., used to categorize the nature of a person''s relationship with a business entity. However, only 7 of the 20 defined contact types are actively used in practice (IDs: 2, 11, 14, 15, 17, 18, 19), with contact types 11 and 15 being the most frequently assigned roles. The remaining 13 contact types are defined but currently unused, indicating the table was pre-populated with a broader taxonomy than is currently needed by the business.',
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
    @value = N'The primary key and unique identifier for each contact type. An auto-incremented integer that uniquely identifies each contact role classification.',
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
    @value = N'The descriptive name of the contact type, representing the role or title a person holds in relation to a business entity (e.g., ''Sales Representative'', ''Purchasing Manager'', ''Marketing Assistant''). This is the human-readable label used throughout the application.',
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
    @value = N'The date and time when the contact type record was last modified. All records share the same date (2008-04-30), indicating this reference data was loaded or last updated as a batch during initial database setup.',
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
    @value = N'A reference/lookup table storing all countries and regions of the world, identified by their ISO 3166-1 alpha-2 country codes. This foundational table serves as a geographic reference used throughout the AdventureWorks database for associating currencies, sales territories, and other entities with specific countries or regions. The table supports historical multi-currency country associations, as evidenced by some countries being mapped to multiple currencies (e.g., European countries linked to both legacy national currencies and EUR). While all 238 country/region codes are available as a global reference, only 6 are actively used in the sales domain: United States (US), United Kingdom (GB), France (FR), Germany (DE), Canada (CA), and Australia (AU), with the US being the primary sales market spanning at least 5 territories.',
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
    @value = N'The ISO 3166-1 alpha-2 two-character code uniquely identifying each country or region (e.g., ''US'' for United States, ''CA'' for Canada). Serves as the primary key and the foreign key target for dependent tables.',
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
    @value = N'The full English name of the country or region (e.g., ''Brazil'', ''France'', ''Timor-Leste''). Provides a human-readable label for display and reporting purposes.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes. All records share the same date (2008-04-30), indicating the entire table was loaded or last updated in a single batch operation.',
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
    @value = N'Stores email addresses for persons registered in the AdventureWorks system. Each record associates a unique email address with a specific person (via BusinessEntityID), enabling contact and authentication functionality. This table supports a one-to-one relationship between persons and their primary email addresses, serving as the email contact repository for all ~19,972 registered system users.',
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
    @value = N'Foreign key linking this email address record to a specific person in Person.Person. Identifies which individual owns this email address. Has a 1:1 relationship with EmailAddressID, meaning each person has exactly one email address record in this table.',
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
    @value = N'Surrogate primary key uniquely identifying each email address record. Auto-incremented integer assigned when a new email address is registered for a person.',
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
    @value = N'The actual email address string for the person. All sample values follow the pattern ''firstname+number@adventure-works.com'', indicating these are internal/demo email addresses for the AdventureWorks fictional company. Average length of 27 characters is consistent with typical email address lengths.',
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
    @value = N'A globally unique identifier (GUID) assigned to each email address record, used for replication and row-level identification across distributed systems. Standard AdventureWorks auditing column present in most tables.',
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
    @value = N'Timestamp recording when the email address record was last created or modified. Used for auditing and change tracking purposes. Standard AdventureWorks audit column.',
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
    @value = N'Stores authentication credentials (password hash and salt) for persons registered as system users in the AdventureWorks application. Each record links a person''s identity (via BusinessEntityID) to their securely hashed password, enabling login authentication for the ~19,972 individuals who have registered accounts.',
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
    @value = N'Primary key and foreign key referencing Person.Person.BusinessEntityID. Uniquely identifies the person whose authentication credentials are stored in this row. The 1:1 relationship means each person has at most one password record.',
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
    @value = N'A Base64-encoded cryptographic hash of the person''s password combined with the salt. Used to verify login credentials without storing the plaintext password. The 44-character length is consistent with a Base64-encoded 32-byte (256-bit) hash output.',
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
    @value = N'A Base64-encoded random salt value appended or prepended to the plaintext password before hashing. Ensures that two users with the same password will have different hash values, protecting against rainbow table and dictionary attacks.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used for replication and row-level identification across distributed systems. Standard AdventureWorks audit column present in most tables.',
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
    @value = N'The date and time when the password record was last created or updated. Used for auditing and tracking when credentials were last changed.',
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
    @value = N'Stores personal information for all individuals in the AdventureWorks system, including customers, employees, vendors, and other contacts. This table is the central identity repository for person-level data such as names, titles, contact preferences, demographic survey data, and additional contact information. It extends the Person.BusinessEntity base table by adding person-specific attributes and serves as the foundation for multiple specialized roles (employees, customers, etc.).

Key characteristics of the population: The table contains 20,000+ person records, of which the vast majority (~19,119 out of ~19,820 customers) are customers, while only ~290 are employees (a small specialized subset). Approximately 19,972 are registered system users with password credentials, and every registered system user has exactly one email address on file (confirmed by a strict 1:1 mandatory relationship between Person.Password and Person.EmailAddress records). Additionally, ~19,118 persons have credit cards on file, indicating broad purchasing capability, and ~19,972 have at least one phone number recorded. The table distinguishes between ''known contacts'' (all persons) and ''active system users'' (only those with a corresponding Person.Password record). Each person serves as a unique identity record — the one-to-one relationship with HumanResources.Employee means employment attributes are stored separately while personal details (name, contact info) remain here.',
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
    @value = N'Primary key and foreign key to Person.BusinessEntity. Uniquely identifies each person record and links to the base entity table that anchors all business entities in the system.',
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
    @value = N'Classifies the type of person: IN=Individual (retail customer), SC=Store Contact, GC=General Contact, EM=Employee, VC=Vendor Contact, SP=Sales Person. Determines the role this person plays in the business.',
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
    @value = N'Indicates the name formatting style. A value of ''false'' means Western name style (FirstName + LastName order); ''true'' would indicate Eastern style (LastName + FirstName). All records show ''false'', suggesting the dataset is primarily Western-style names.',
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
    @value = N'Optional honorific title for the person (e.g., Mr., Ms., Mrs., Sr., Sra.). Approximately 94.8% of records have no title, making this an optional courtesy field.',
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
    @value = N'The person''s first (given) name. Required field for all person records.',
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
    @value = N'The person''s middle name or initial. Optional field with approximately 42.5% of records having no middle name.',
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
    @value = N'The person''s last (family/surname) name. Required field for all person records.',
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
    @value = N'Optional name suffix such as generational indicators (Jr., Sr., II, III, IV) or academic credentials (PhD). Very rarely populated — only 0.4% of records have a suffix.',
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
    @value = N'Indicates the person''s email marketing preference: 0=No promotional emails, 1=Promotional emails from AdventureWorks only, 2=Promotional emails from AdventureWorks and selected partners.',
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
    @value = N'XML document storing supplementary contact information beyond the primary contact details, including additional phone numbers, mobile numbers, pager numbers, email addresses, home addresses, and CRM contact records/notes.',
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
    @value = N'XML document containing individual survey/demographic data for the person, including purchase history (TotalPurchaseYTD, DateFirstPurchase), personal attributes (BirthDate, MaritalStatus, Gender), socioeconomic data (YearlyIncome, Education, Occupation), and lifestyle data (HomeOwnerFlag, NumberCarsOwned, CommuteDistance, TotalChildren).',
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
    @value = N'A globally unique identifier (GUID) for the row, used for replication and merge operations to uniquely identify records across distributed database instances.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores phone numbers associated with persons in the AdventureWorks system. This is a junction/association table that links persons (via Person.Person) to their phone numbers, categorized by phone number type (Cell, Home, Work via Person.PhoneNumberType). A single person may have multiple phone numbers of different types, making this a one-to-many extension of the Person.Person table for contact information.',
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
    @value = N'Foreign key referencing Person.Person.BusinessEntityID. Identifies the person to whom this phone number belongs. Part of the composite primary key.',
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
    @value = N'The actual phone number string for the person. Stored as a Phone data type, supporting various international and domestic formats. Not unique across the table as phone numbers may be shared.',
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
    @value = N'Foreign key referencing Person.PhoneNumberType.PhoneNumberTypeID. Classifies the phone number as one of three types: Cell (1), Home (2), or Work (3). Part of the composite primary key.',
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
    @value = N'Timestamp recording when the phone number record was last created or modified. Used for auditing and change tracking purposes.',
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
    @value = N'A lookup/reference table that defines the types of phone numbers supported in the system. It stores exactly three phone number categories (Cell=1, Home=2, Work=3) used to classify contact phone numbers throughout the database. Cell and Home phone types are more frequently recorded than Work phones, reflecting typical personal contact data patterns.',
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
    @value = N'The primary key and unique identifier for each phone number type. An auto-incremented integer that uniquely identifies each category of phone number (Cell, Home, Work).',
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
    @value = N'The human-readable name/label for the phone number type. Contains values ''Cell'', ''Home'', and ''Work'', representing the three supported categories of phone numbers in the system.',
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
    @value = N'The date and time when the record was last modified. All records share the same timestamp, indicating they were inserted together during initial database seeding and have not been updated since.',
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
    @value = N'Stores reference data for states, provinces, and other sub-national geographic divisions used throughout the AdventureWorks database. Each record represents a unique state or province within a country or region, identified by a short code and full name, and linked to a sales territory for business reporting purposes. This table serves as a geographic lookup used by addresses and sales tax rates.',
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
    @value = N'Surrogate primary key uniquely identifying each state or province record in the table.',
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
    @value = N'The official abbreviation or code for the state or province (e.g., ''CA'' for California, ''AB'' for Alberta). Fixed 2-character nchar field.',
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
    @value = N'The ISO country or region code indicating which country this state or province belongs to (e.g., ''US'', ''CA'', ''FR'', ''DE'', ''AU'').',
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
    @value = N'Boolean flag indicating whether this record is the only state/province entry for its country. When true, the country does not have multiple sub-national divisions tracked in the system.',
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
    @value = N'The full official name of the state or province (e.g., ''California'', ''Quebec'', ''Vaucluse'', ''Queensland'').',
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
    @value = N'Foreign key linking this state or province to a sales territory in Sales.SalesTerritory, used to associate geographic regions with sales reporting structures.',
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
    @value = N'A globally unique identifier (GUID) for the row, used for replication and merge operations to uniquely identify records across distributed database instances.',
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
    @value = N'The date and time when the record was last modified, used for auditing and change tracking.',
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
    @value = N'The Bill of Materials (BOM) table for Adventure Works Cycles, storing the hierarchical structure of product assemblies. Each record defines a parent-child relationship between a product assembly and one of its component parts, including the quantity needed, the unit of measure, the BOM level in the hierarchy, and the date range during which this component relationship is valid. This table enables manufacturing to understand what parts and sub-assemblies are required to build finished products.',
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
    @value = N'Surrogate primary key uniquely identifying each bill of materials record.',
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
    @value = N'Foreign key referencing the parent product assembly (Production.Product.ProductID) that this component belongs to. NULL for top-level components that are not part of any higher-level assembly (BOMLevel = 0).',
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
    @value = N'Foreign key referencing the child component or sub-assembly (Production.Product.ProductID) that is used in the parent assembly. This is the part being consumed or incorporated.',
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
    @value = N'The date on which this bill of materials component relationship became effective. Used for temporal versioning of BOM structures.',
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
    @value = N'The date on which this bill of materials component relationship was superseded or discontinued. NULL indicates the relationship is currently active and has no expiration.',
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
    @value = N'Foreign key to Production.UnitMeasure specifying the unit of measure for the PerAssemblyQty quantity. Values are EA (Each), OZ (Ounce), or IN (Inch).',
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
    @value = N'Integer indicating the depth of this component in the product assembly hierarchy. Level 0 represents top-level standalone components, level 1 represents direct sub-assemblies, and higher levels represent deeper nesting.',
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
    @value = N'The quantity of this component required to produce one unit of the parent assembly, expressed in the units defined by UnitMeasureCode.',
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
    @value = N'Timestamp recording when this BOM record was last modified, used for auditing and change tracking.',
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
    @value = N'A lookup/reference table that stores the supported cultures (languages and locales) used in the AdventureWorks system. It defines the set of languages in which product descriptions and other content can be localized, serving as a foundational reference for internationalization support. The table contains entries for the invariant culture plus 6 active localization targets — English (en), French (fr), Arabic (ar), Thai (th), Traditional Chinese (zh-cht), and Hebrew (he) — reflecting the specific geographic and linguistic markets that Adventure Works Cycles supports for its product catalog.',
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
    @value = N'The primary key and unique identifier for each culture/locale. Uses standard .NET/Windows culture codes (e.g., ''en'' for English, ''fr'' for French, ''zh-cht'' for Traditional Chinese). An empty/blank value represents the invariant culture. Fixed-length nchar field padded to a consistent length.',
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
    @value = N'The human-readable display name of the culture/language (e.g., ''English'', ''French'', ''Arabic'', ''Invariant Language (Invariant Country)''). Used for display purposes in administrative interfaces.',
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
    @value = N'The date and time when the culture record was last modified. All records share the same date (2008-04-30), indicating the table was populated as part of the initial database setup and has not been updated since.',
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
    @value = N'Stores document metadata and content for the AdventureWorks document management system. Each record represents a document (such as product manuals, maintenance guides, assembly instructions) organized in a hierarchical folder structure. Documents contain binary content (typically Word files), summaries, revision tracking, and ownership information linking to employees. The table contains a small, curated set of documents (only ~6 distinct document nodes) that are broadly shared across many products (32+), indicating these are general-purpose, product-family-level resources — such as shared maintenance guides, universal assembly instructions, or category-wide manuals — rather than product-specific documentation.',
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
    @value = N'Primary key using SQL Server''s hierarchyid data type to represent the document''s position in a hierarchical folder/document tree structure. Enables efficient tree traversal and parent-child relationships without explicit parent ID columns.',
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
    @value = N'Computed column representing the depth level of the document or folder in the hierarchy (0=root, 1=top-level folders, 2=documents/subfolders). Derived from DocumentNode.',
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
    @value = N'Human-readable title or name of the document or folder. For folders this is a category name (e.g., ''Documents'', ''Assembly'', ''Maintenance''); for documents it describes the content (e.g., ''Front Reflector Bracket Installation'').',
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
    @value = N'Foreign key referencing HumanResources.Employee.BusinessEntityID, identifying the employee responsible for or who owns this document.',
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
    @value = N'Boolean flag indicating whether this record represents a folder (true) or an actual document (false) in the hierarchy.',
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
    @value = N'The file system name of the document including extension (e.g., ''Front Reflector Bracket Installation.doc'') or just the folder name without extension for folder records.',
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
    @value = N'The file extension of the document (e.g., ''.doc'' for Word documents). Empty string for folder records.',
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
    @value = N'Revision number or version identifier for the document, tracking how many times the document has been revised.',
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
    @value = N'Numeric change tracking counter indicating how many changes have been made to the document. Higher values indicate more frequently updated documents.',
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
    @value = N'Document lifecycle status code: likely 1=Pending/Draft, 2=Active/Published, 3=Obsolete/Archived.',
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
    @value = N'Text summary or abstract describing the content and purpose of the document. Null for folder records.',
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
    @value = N'Binary large object (varbinary) containing the actual document file content, typically Microsoft Word (.doc) format binary data.',
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
    @value = N'Globally unique identifier (GUID) for the document record, used for replication and unique identification across distributed systems.',
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
    @value = N'Timestamp recording when the document record was last modified, used for auditing and change tracking.',
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
    @value = N'Stores technical illustration diagrams for product models, represented as XAML/XML vector graphics. Each record contains a unique illustration identifier and its corresponding diagram data exported from Adobe Illustrator CS as XAML for use in WPF/Silverlight Viewbox rendering. The table contains at least 6 illustrations, and individual illustrations are designed to be reusable across multiple product models — for example, illustrations IDs 3, 4, and 5 are shared across different product model families, indicating these diagrams represent common component types (e.g., shared mechanical parts or assemblies) rather than being exclusive to a single product model. These illustrations are linked to product models through the Production.ProductModelIllustration junction table.',
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
    @value = N'Primary key uniquely identifying each illustration record. An auto-incremented integer surrogate key used to reference illustrations from the Production.ProductModelIllustration junction table.',
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
    @value = N'The actual illustration content stored as XML, specifically XAML markup generated by Adobe Illustrator CS via the XAML Export Plug-In. Contains WPF Viewbox/Canvas/Path elements representing vector graphics of product components such as mechanical parts, bicycle components, and assembly diagrams.',
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
    @value = N'Timestamp recording when the illustration record was last created or modified. Used for auditing and change tracking purposes, consistent with the AdventureWorks pattern of including ModifiedDate on all tables.',
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
    @value = N'Stores manufacturing work center and physical location information within a production facility. Each record represents a distinct area or station in the manufacturing plant (e.g., Final Assembly, Paint Shop, Frame Welding) along with its associated cost rate and available capacity hours. The table contains 14 locations with non-sequential IDs (1-7 and 10-60), suggesting locations were added over time or grouped by functional area. Of these, 7 locations (IDs 10, 20, 30, 40, 45, 50, 60) serve as active work centers used in production routing, each with a fixed standard cost rate and defined capacity hours; the remaining 7 (IDs 1-7) function primarily as storage/inventory areas with zero cost rate and zero availability. Location 50 is the most frequently used work center in production routing. All 14 locations are actively used for product inventory storage. This is a foundational lookup/reference table used to track where manufacturing operations are performed and where inventory is physically stored.',
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
    @value = N'Unique numeric identifier for each manufacturing location or work center. Serves as the primary key and is referenced by Production.ProductInventory and Production.WorkOrderRouting.',
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
    @value = N'Descriptive name of the manufacturing location or work center (e.g., ''Final Assembly'', ''Paint Shop'', ''Frame Welding''). Used to identify the physical area within the production facility.',
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
    @value = N'The hourly cost rate (in currency units) charged for work performed at this location. Storage and non-production areas have a cost rate of 0, while active manufacturing work centers have rates ranging from $12.25 to $25.00 per hour.',
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
    @value = N'The number of hours per week this location is available for production work. Storage locations have 0 availability, while active work centers have values of 80, 96, 108, or 120 hours per week.',
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
    @value = N'The date and time when the location record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'The central product catalog table for Adventure Works Cycles, storing all products sold, manufactured, or used as components. Each row represents a single product with its full definition including pricing, physical attributes, manufacturing details, inventory parameters, and lifecycle dates. This table serves as the master reference for all product-related operations across sales, purchasing, production, and inventory management.',
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
    @value = N'The unique integer identifier for each product. Serves as the primary key and is referenced by all dependent tables across the database.',
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
    @value = N'The human-readable name of the product, such as ''HL Touring Frame - Blue, 50'' or ''AWC Logo Cap''. Names often encode product line, color, and size information.',
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
    @value = N'A structured alphanumeric product code (e.g., ''FR-R38R-44'', ''BK-M68B-46'') used for internal identification and SKU management. The prefix typically encodes the product category or type.',
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
    @value = N'Boolean flag indicating whether the product is manufactured in-house (true) or purchased from an external vendor (false). Drives routing to production vs. purchasing workflows.',
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
    @value = N'Boolean flag indicating whether the product is a finished good available for sale (true) or an internal component/subassembly not sold directly to customers (false).',
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
    @value = N'The color of the product (e.g., Black, Silver, Red, Blue, Multi, Silver/Black). Nullable because many components and raw materials do not have a meaningful color attribute.',
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
    @value = N'The minimum inventory quantity that must be maintained before a reorder is triggered. Used by inventory management to prevent stockouts.',
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
    @value = N'The inventory level at which a new purchase or production order should be initiated. Works in conjunction with SafetyStockLevel to manage replenishment.',
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
    @value = N'The standard manufacturing or acquisition cost of the product used for cost accounting and profitability analysis. Zero for products without a defined cost (e.g., discontinued or placeholder items).',
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
    @value = N'The official retail list price at which the product is offered for sale to customers. Zero for internal components not sold directly.',
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
    @value = N'The size designation of the product, which may be numeric (e.g., 44, 48, 52 for frame sizes in cm) or alphabetic (S, M, L, XL for clothing). Nullable for products without a size dimension.',
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
    @value = N'The unit of measure code for the Size column. Only ''CM'' is present, indicating frame and component sizes are measured in centimeters.',
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
    @value = N'The unit of measure code for the Weight column. Values are ''LB'' (pounds) or ''G'' (grams), reflecting mixed unit usage across product types.',
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
    @value = N'The physical weight of the product in the unit specified by WeightUnitMeasureCode. Nullable for products where weight is not tracked.',
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
    @value = N'The number of days required to manufacture the product. Zero for purchased items or items with no manufacturing lead time.',
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
    @value = N'A single-character code indicating the product line: R=Road, M=Mountain, T=Touring, S=Standard/Other. Nullable for components not associated with a specific line.',
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
    @value = N'A single-character code indicating the product quality/price class: H=High, M=Medium, L=Low. Nullable for components without a class designation.',
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
    @value = N'A single-character code indicating the intended gender/style of the product: U=Universal/Unisex, M=Men''s, W=Women''s. Nullable for non-apparel or non-styled products.',
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
    @value = N'Foreign key referencing Production.ProductSubcategory, placing the product within the second level of the product classification hierarchy (e.g., Mountain Bikes, Road Frames, Jerseys). Nullable for raw components not assigned to a subcategory.',
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
    @value = N'Foreign key referencing Production.ProductModel, associating the product with a model template that may include catalog descriptions and manufacturing instructions. Nullable for components without a formal model.',
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
    @value = N'The date on which the product became available for sale. Used to control product availability windows in the sales catalog.',
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
    @value = N'The date on which the product was no longer available for sale. Nullable for currently active products. Used to retire products from the sales catalog.',
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
    @value = N'The date on which the product was fully discontinued and removed from all operations. Currently null for all 504 products, suggesting no products have been fully discontinued in this dataset.',
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
    @value = N'A globally unique identifier (GUID) assigned to each product row, used for replication and synchronization across distributed database environments.',
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
    @value = N'The timestamp of the last modification to the product record. Only 2 distinct values, both in February 2014, suggesting a bulk data load or migration event.',
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
    @value = N'A top-level lookup table that defines the four high-level product categories used to classify all products in the AdventureWorks business: Bikes, Components, Clothing, and Accessories. It serves as the root of the product classification hierarchy, with 37 subcategories distributed beneath it — Bikes (Mountain Bikes, Road Bikes, Touring Bikes), Components (14 subcategories including frames, brakes, wheels, and drivetrain parts), Clothing (Caps, Gloves, Jerseys, Shorts, Socks, Tights, Vests), and Accessories (12 subcategories including helmets, lights, locks, and hydration gear) — and ultimately individual products hanging beneath those subcategories.',
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
    @value = N'The primary key and unique identifier for each product category. An auto-incrementing integer that uniquely identifies one of the four top-level product groupings.',
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
    @value = N'The human-readable name of the product category (Bikes, Components, Clothing, Accessories). This is the display label used throughout the application to classify products at the highest level.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used to support database replication and row-level identification across distributed systems.',
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
    @value = N'The date and time when the row was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores the historical standard cost of products over time, tracking how manufacturing/acquisition costs have changed across different date ranges. Each record represents a product''s standard cost for a specific effective period, enabling cost analysis and historical reporting. This is the Production.ProductCostHistory table in the AdventureWorks database.',
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
    @value = N'Foreign key referencing the product in Production.Product. Identifies which product this cost history record belongs to. Combined with StartDate forms the composite primary key.',
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
    @value = N'The date on which this standard cost became effective for the product. Combined with ProductID forms the composite primary key. Only 3 distinct values indicate annual cost revision cycles (May 2011, May 2012, May 2013).',
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
    @value = N'The date on which this standard cost record expired or was superseded by a new cost. NULL values (~48.8%) indicate currently active cost records with no expiration. Only 2 distinct non-null values (2012-05-29, 2013-05-29) align with the start of subsequent cost periods.',
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
    @value = N'The standard manufacturing or acquisition cost of the product during the effective date range defined by StartDate and EndDate. Used for cost accounting, variance analysis, and profitability calculations.',
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
    @value = N'Audit timestamp recording when this cost history record was last modified in the database. Only 3 distinct values indicate batch update operations.',
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
    @value = N'Stores multilingual product descriptions used across the Adventure Works product catalog. Each row contains a text description of a product or product component, written in a specific language. This table serves as a centralized repository of localized description text associated with product models across different cultures/languages. Notably, each description is uniquely assigned to exactly one product model-culture combination — descriptions are not shared or reused across different product models or cultures, making each row effectively a dedicated description for a specific model-language pairing.',
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
    @value = N'The primary key and unique identifier for each product description record. Auto-incremented integer that uniquely identifies each description entry.',
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
    @value = N'The actual localized text description of a product or product component. Contains marketing and technical descriptions written in various languages including English, French, Arabic, Hebrew, Chinese, Thai, and others.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used to support database replication and row-level identification across distributed systems.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and tracking changes to description records.',
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
    @value = N'A junction/bridge table that associates products with their related technical documents. It establishes a many-to-many relationship between products in the Production.Product catalog and documents stored in the Production.Document system, enabling each product to be linked to multiple documents (such as assembly instructions, maintenance guides, or product manuals) and each document to be associated with multiple products.',
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
    @value = N'The identifier of the product being associated with a document. References the product catalog in Production.Product. Forms part of the composite primary key.',
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
    @value = N'The hierarchical node identifier of the document associated with the product. References the document management system in Production.Document. Forms part of the composite primary key.',
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
    @value = N'The date and time when the product-document association record was last modified. Used for auditing and change tracking.',
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
    @value = N'Tracks the physical inventory of products stored at specific warehouse locations within the manufacturing facility. Each record represents a unique combination of product and storage location, capturing the exact shelf and bin where the product is stored along with the current quantity on hand. This table is the operational inventory ledger for Adventure Works Cycles'' production warehouse.',
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
    @value = N'Foreign key referencing the product being stored. Identifies which product this inventory record tracks.',
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
    @value = N'Foreign key referencing the warehouse or work center location where the product is physically stored. Only 14 distinct locations exist, representing the manufacturing facility''s storage areas.',
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
    @value = N'The shelf identifier within the storage location where the product is physically placed. Single alphabetic characters (A-Z) represent shelf labels; ''N/A'' indicates no specific shelf assignment.',
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
    @value = N'The bin number within the shelf at the storage location, providing the most granular physical location coordinate for the stored product.',
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
    @value = N'The current quantity of the product on hand at the specified location. Represents the number of units physically present in the warehouse bin.',
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
    @value = N'A globally unique identifier (GUID) assigned to each inventory record, used for replication and row-level identification across distributed systems.',
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
    @value = N'The date and time when the inventory record was last updated, used for auditing and change tracking purposes.',
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
    @value = N'Stores the historical and current list price records for products over time, tracking price changes with effective date ranges. Each record captures the list price for a specific product during a defined period (StartDate to EndDate), enabling price history tracking and auditing. This is the Production.ProductListPriceHistory table in the AdventureWorks database.',
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
    @value = N'Foreign key referencing Production.Product, identifying which product this price record belongs to. Part of the composite primary key.',
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
    @value = N'The date on which this list price became effective for the product. Part of the composite primary key along with ProductID.',
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
    @value = N'The date on which this list price was superseded or expired. NULL indicates the price is currently active (no end date yet assigned).',
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
    @value = N'The list price (in money/currency) of the product during the period defined by StartDate and EndDate. This is the customer-facing retail price.',
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
    @value = N'The date and time when this price history record was last modified, used for auditing and change tracking.',
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
    @value = N'Stores product model definitions for Adventure Works Cycles, serving as a template or blueprint that groups related product variants. Each record represents a distinct product model (e.g., ''Road-450'', ''Mountain-300'') and may include rich XML-based catalog descriptions for marketing purposes and XML-based manufacturing/assembly instructions for production use. A subset of models (e.g., IDs 7, 10, 47, 48, 67) have associated technical illustrations, with some complex models (IDs 47 and 48) linked to multiple illustrations, suggesting these represent products with more intricate assembly or component diagrams. Nearly all product models (127 of 128) have localized multilingual descriptions, indicating broad internationalization support across the product catalog. Of the 128 product models defined, 119 (93%) are actively referenced by finished goods and major components in the product catalog, while approximately 211 raw components, fasteners, and paint products (~41.8% of all products) are not associated with any product model — indicating that product models apply primarily to structured, finished or semi-finished products rather than undifferentiated raw materials.',
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
    @value = N'The primary key uniquely identifying each product model. Acts as the surrogate key referenced by dependent tables such as Production.Product, Production.ProductModelIllustration, and Production.ProductModelProductDescriptionCulture.',
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
    @value = N'The human-readable name of the product model (e.g., ''Road-450'', ''Mountain-300'', ''Touring Tire''). This name identifies the model family and is used for display and reference purposes.',
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
    @value = N'An optional XML document containing the marketing catalog description for the product model, including summary text, manufacturer info, product features (warranty, maintenance, components), pictures, and technical specifications. Used for customer-facing product listings.',
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
    @value = N'An optional XML document containing work-center-specific manufacturing and assembly instructions for the product model. Includes step-by-step procedures, materials, tools, labor hours, machine hours, setup hours, and lot sizes organized by work center location ID.',
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
    @value = N'A globally unique identifier (GUID) assigned to each product model row, used for replication and row-level identification across distributed systems.',
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
    @value = N'The date and time when the product model record was last modified. Used for auditing and change tracking.',
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
    @value = N'A junction/bridge table that establishes many-to-many relationships between product models and their associated technical illustrations. Each record links a specific product model (from Production.ProductModel) to a specific illustration diagram (from Production.Illustration), enabling a product model to have multiple illustrations and an illustration to be reused across multiple product models. This table supports AdventureWorks'' library of reusable technical diagrams used in product documentation, including the visual aids referenced within manufacturing instruction XML (e.g., ''illustration diag 3, 4, 5, 7''). Illustrations are stored separately in Production.Illustration and associated at the product model level through this junction table.',
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
    @value = N'Foreign key referencing the product model in Production.ProductModel. Together with IllustrationID, forms the composite primary key of this junction table. Identifies which product model is associated with a given illustration.',
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
    @value = N'Foreign key referencing a technical illustration diagram in Production.Illustration. Together with ProductModelID, forms the composite primary key of this junction table. Identifies which illustration is associated with a given product model.',
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
    @value = N'Timestamp recording when the association between a product model and an illustration was last created or modified. Standard audit column used throughout the AdventureWorks database.',
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
    @value = N'A junction/bridge table that associates product models with their localized descriptions for specific cultures/languages. Each row links a product model (from Production.ProductModel) to a specific text description (from Production.ProductDescription) in a particular language/culture (from Production.Culture), enabling multilingual product catalog support across six supported languages (English, French, Hebrew, Arabic, Chinese Traditional, Thai). Notably, the same ProductDescriptionID can be reused across multiple product models, meaning description text is shared rather than unique per model. This localized text system complements the XML-based CatalogDescription column in ProductModel, providing structured, translatable plain-text descriptions separate from the richer XML catalog data.',
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
    @value = N'Foreign key referencing the product model (Production.ProductModel) for which a localized description is being provided. Part of the composite primary key.',
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
    @value = N'Foreign key referencing the specific localized description text (Production.ProductDescription) associated with the product model and culture combination. Part of the composite primary key.',
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
    @value = N'Foreign key referencing the culture/language (Production.Culture) for which the description is written. Identifies the language locale such as English (en), French (fr), Arabic (ar), Thai (th), Traditional Chinese (zh-cht), or Hebrew (he). Part of the composite primary key.',
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
    @value = N'Timestamp recording when the record was last modified. Used for auditing and change tracking purposes.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductModelProductDescriptionCulture',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO

-- Table: Production.ProductPhoto
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores product photo images for the AdventureWorks product catalog. Each record contains thumbnail and large-format GIF images of products, along with their file names and a modification timestamp. With only 42 distinct photos serving 504 products, photos are shared across product variants (e.g., different sizes or colors of the same model) rather than being unique per SKU. This table serves as the central repository for reusable product visual assets used in the e-commerce and catalog systems, linked to specific products through the Production.ProductProductPhoto junction table.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND c.name = 'ProductPhotoID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ProductPhotoID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key identifier for each product photo record. Auto-incrementing integer that uniquely identifies each photo entry in the catalog.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'ProductPhotoID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND c.name = 'ThumbNailPhoto'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ThumbNailPhoto';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Binary data containing the thumbnail-sized GIF image of the product. Used for product listings and search results where smaller images are needed for performance.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'ThumbNailPhoto';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND c.name = 'ThumbnailPhotoFileName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ThumbnailPhotoFileName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'File name of the thumbnail photo, following the naming convention ''productname_color_small.gif''. Used to identify and reference the thumbnail image file.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'ThumbnailPhotoFileName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND c.name = 'LargePhoto'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'LargePhoto';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Binary data containing the full-size GIF image of the product. Used for product detail pages where high-resolution images are displayed.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'LargePhoto';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND c.name = 'LargePhotoFileName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'LargePhotoFileName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'File name of the large photo, following the naming convention ''productname_color_large.gif''. Used to identify and reference the full-size image file.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto',
    @level2type = N'COLUMN',
    @level2name = N'LargePhotoFileName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'Production'
    AND t.name = 'ProductPhoto'
    AND c.name = 'ModifiedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'Production',
        @level1type = N'TABLE',
        @level1name = N'ProductPhoto',
        @level2type = N'COLUMN',
        @level2name = N'ModifiedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp recording when the photo record was last modified. Used for auditing and tracking changes to product photo data.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'ProductPhoto',
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
    @value = N'A junction/bridge table that associates products with their photos in a many-to-many relationship. Each record links a specific product (from Production.Product) to a specific photo (from Production.ProductPhoto), indicating which photos are assigned to which products. The ''Primary'' flag (always true in this dataset) suggests this table supports designating a primary/default photo per product.',
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
    @value = N'Foreign key referencing the product in Production.Product. Together with ProductPhotoID, forms the composite primary key of this junction table. Identifies which product the photo is associated with.',
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
    @value = N'Foreign key referencing the photo record in Production.ProductPhoto. Together with ProductID, forms the composite primary key. Identifies which photo is linked to the product. Only 42 distinct values across 504 rows indicates photos are reused across multiple products.',
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
    @value = N'A boolean flag (of type Flag, which is a bit/boolean) indicating whether this photo is the primary/default photo for the product. All current values are ''true'', suggesting the dataset only contains primary photo associations, or that all products currently have only one photo each designated as primary.',
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
    @value = N'Timestamp recording when the product-photo association record was last modified. Only 4 distinct dates exist, indicating records were created or updated in batch operations on specific dates (2008-03-31, 2011-05-01, 2012-04-30, 2013-04-30).',
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
    @value = N'Stores customer-submitted product reviews for Adventure Works Cycles products. Each record captures a reviewer''s identity, contact information, rating, written comments, and the date the review was submitted. This table enables the company to collect and display customer feedback on specific products, supporting product quality assessment and customer engagement.',
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
    @value = N'The primary key and unique identifier for each product review record. An auto-incrementing integer that uniquely identifies each review submission.',
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
    @value = N'Foreign key referencing the product being reviewed in Production.Product. Identifies which specific product the customer is providing feedback on.',
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
    @value = N'The name of the customer or reviewer who submitted the product review. Stored as a Name data type, allowing for natural language names.',
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
    @value = N'The date on which the product review was submitted. Recorded as a datetime value, though only date precision appears to be used (all times are midnight).',
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
    @value = N'The email address of the reviewer, used for contact purposes or review verification. Each reviewer has a unique email address from various external domains.',
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
    @value = N'A numeric rating given by the reviewer to the product, likely on a scale of 1 to 5. Higher values indicate greater satisfaction.',
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
    @value = N'The full text of the reviewer''s written feedback about the product. This is a free-form narrative field that can contain detailed opinions, experiences, and recommendations. The field is nullable, meaning a rating can be submitted without written comments.',
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
    @value = N'The date and time when the review record was last modified. Used for auditing and tracking changes to review records over time.',
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
    @value = N'A lookup/reference table that defines the second level of the product classification hierarchy in AdventureWorks, sitting between the top-level ProductCategory and individual products. It contains 37 subcategories (e.g., Mountain Bikes, Road Bikes, Jerseys, Helmets, Bottom Brackets) that group related products within one of four parent categories: Bikes, Components, Clothing, and Accessories. All 37 subcategories are actively used by products, confirming there are no orphaned entries. Notably, subcategory assignment is optional for products — approximately 295 products (~41.8%) carry a null ProductSubcategoryID, indicating that raw materials, unfinished components, or internally-used items may exist outside this classification hierarchy.',
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
    @value = N'The primary key and unique identifier for each product subcategory. An auto-incrementing integer that uniquely identifies each of the 37 subcategories in the system.',
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
    @value = N'Foreign key referencing the parent category in Production.ProductCategory. Groups subcategories under one of four top-level categories (Bikes, Components, Clothing, Accessories), establishing the two-level product classification hierarchy.',
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
    @value = N'The human-readable name of the product subcategory (e.g., ''Mountain Bikes'', ''Jerseys'', ''Bottom Brackets''). Used for display purposes in product catalogs, reports, and user interfaces.',
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
    @value = N'A globally unique identifier (GUID) assigned to each subcategory row. Used to support data replication and merge replication scenarios across distributed database environments.',
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
    @value = N'The date and time when the subcategory record was last modified. All records share the same date (2008-04-30), indicating this reference data was loaded or last updated as a batch on that date.',
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
    @value = N'A lookup/reference table that stores the predefined reasons why manufactured products are scrapped or rejected during the production process. Each record represents a distinct cause of product failure or defect, used to categorize scrap events in manufacturing work orders. The table contains exactly 16 active scrap reason categories (IDs 1-16), all of which are actively referenced in production work orders. Despite a large volume of approximately 72,591 work orders, only roughly 1% result in scrap events, indicating a high manufacturing yield rate. All 16 scrap reasons see real-world usage, confirming this is a fully utilized reference dataset rather than a partially adopted one.',
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
    @value = N'The primary key and unique identifier for each scrap reason. An auto-incrementing small integer that uniquely identifies each type of manufacturing defect or failure reason.',
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
    @value = N'A descriptive label for the scrap reason, representing the specific type of manufacturing defect or failure that caused a product to be scrapped. Examples include process failures (e.g., ''Paint process failed'', ''Primer process failed''), dimensional issues (e.g., ''Drill size too small'', ''Trim length too long''), and quality failures (e.g., ''Stress test failed'', ''Handling damage'').',
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
    @value = N'The date and time when the record was last modified. Used for auditing and tracking changes to the reference data. All records share the same date (2008-04-30), indicating the entire table was loaded or last updated in a single batch operation.',
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
    @value = N'Records every inventory and cost transaction affecting products in the Adventure Works manufacturing environment. Each row captures a single transaction event — a sale (S), work order (W), or purchase (P) — that changes product inventory levels or costs. This table serves as the active transaction history log, tracking quantity movements and actual costs for products across all business operations, linked to both the product catalog and manufacturing work orders.',
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
    @value = N'Unique surrogate primary key identifying each individual transaction record in the history log.',
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
    @value = N'Foreign key referencing the product involved in the transaction, linking to Production.Product.',
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
    @value = N'Foreign key referencing the source order or work order that generated this transaction, linking to Production.WorkOrder. For sales transactions (S), this would reference a sales order; for work orders (W), a work order; for purchases (P), a purchase order.',
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
    @value = N'The line item number within the referenced order, identifying which specific line of the order generated this transaction. Defaults to 0 when not applicable.',
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
    @value = N'The date and time when the transaction occurred, recording when the inventory movement or cost event took place.',
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
    @value = N'Single-character code indicating the type of transaction: ''S'' = Sale (inventory reduction via sales order), ''W'' = Work Order (inventory movement via manufacturing), ''P'' = Purchase (inventory addition via purchase order).',
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
    @value = N'The number of units involved in the transaction. Positive values indicate additions to inventory (purchases), negative values would indicate reductions (sales), though the sign convention may be handled by TransactionType.',
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
    @value = N'The actual monetary cost per unit or total cost associated with the transaction. Zero values appear frequently, likely for internal work order movements where cost transfer is handled separately.',
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
    @value = N'The date and time when this transaction record was last modified, used for auditing and data synchronization purposes.',
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
    @value = N'Records every inventory transaction affecting product stock levels in the Adventure Works manufacturing environment. Each row captures a single transaction event — whether a product was sold (S), consumed in a work order/manufacturing process (W), or purchased (P) — along with the quantity moved, the actual cost, and a reference to the originating order. This table serves as the detailed audit trail for all product inventory movements.',
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
    @value = N'Unique surrogate primary key identifying each individual inventory transaction record.',
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
    @value = N'Foreign key referencing the product involved in this inventory transaction, linking to Production.Product.',
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
    @value = N'Foreign key referencing the originating order that caused this inventory movement. For W-type transactions this references Production.WorkOrder.WorkOrderID; for S-type it likely references a sales order, and for P-type a purchase order (polymorphic relationship).',
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
    @value = N'The line item number within the referenced order that this transaction corresponds to. A value of 0 typically indicates a header-level or single-line transaction.',
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
    @value = N'The date and time when the inventory transaction occurred.',
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
    @value = N'Single-character code indicating the type of inventory transaction: ''S'' = Sale (inventory out to customer), ''W'' = Work Order (inventory consumed in manufacturing), ''P'' = Purchase (inventory received from vendor).',
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
    @value = N'The number of units of the product involved in this transaction. Positive values indicate additions to inventory (purchases), negative values would indicate removals (sales, consumption).',
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
    @value = N'The actual monetary cost of the transaction, representing the total cost for the quantity of product transacted. Zero values may indicate internal transfers, zero-cost items, or transactions where cost is tracked elsewhere.',
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
    @value = N'The date and time when this transaction record was last modified, used for auditing and change tracking.',
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
    @value = N'A lookup/reference table storing standardized units of measure used across both manufacturing and purchasing processes. Each record defines a unit of measure with a short 3-character code and descriptive name. The table serves dual purposes: in manufacturing/BOM contexts, only 3 codes are actively used (EA for discrete countable parts, OZ for weight-based materials, IN for inch-based dimensions), with EA being overwhelmingly dominant; in purchasing contexts, 7 codes represent vendor packaging and ordering units (CTN, EA, CAN, CS, GAL, DZ, PAK). While the table contains 38 total unit codes, only 10 distinct codes are actively referenced across the database, suggesting the remaining entries are pre-loaded reference data available for future use. The table has no foreign key dependencies, confirming its role as a foundational shared reference across production and procurement domains.',
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
    @value = N'A 3-character alphanumeric code uniquely identifying each unit of measure (e.g., ''CM '' for Centimeter, ''LB '' for US pound, ''EA '' for Each). Serves as the primary key and is used as a foreign key reference in dependent tables.',
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
    @value = N'The full descriptive name of the unit of measure (e.g., ''Centimeter'', ''Kilogram'', ''Cubic foot''). Provides a human-readable label for display and reporting purposes.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'The Production.WorkOrder table stores manufacturing work orders for Adventure Works Cycles, tracking the production lifecycle of manufactured products. Each record represents a single work order authorizing the production of a specific quantity of a product, capturing planned and actual production quantities, scrap information, and key dates (start, end, due). It serves as the central hub for production planning and execution tracking within the manufacturing schema.',
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
    @value = N'The unique identifier for each work order. This is the primary key of the table, auto-incremented to uniquely identify each manufacturing production order.',
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
    @value = N'Foreign key referencing Production.Product, identifying which product is being manufactured in this work order. Only manufactured products (MakeFlag = true) would appear here.',
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
    @value = N'The quantity of the product ordered/planned for production in this work order. Represents the target production quantity authorized by the work order.',
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
    @value = N'The actual quantity of finished product successfully completed and added to inventory stock. This may differ from OrderQty due to scrap or production shortfalls.',
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
    @value = N'The quantity of product units that were scrapped (rejected/discarded) during the manufacturing process. Most work orders have zero scrap (samples show predominantly 0 values).',
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
    @value = N'The date when manufacturing of this work order began. Represents the actual or planned start of production.',
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
    @value = N'The date when manufacturing of this work order was completed. Nullable, indicating work orders that have not yet been completed will have a NULL end date.',
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
    @value = N'The date by which the work order is due to be completed. Represents the planned completion deadline for the production order.',
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
    @value = N'Foreign key referencing Production.ScrapReason, identifying the reason why units were scrapped during production. NULL for the vast majority of work orders (99% null) where no scrap occurred.',
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
    @value = N'The date and time when the work order record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores work order routing information that tracks the manufacturing operations performed at specific work center locations for each work order. Each record represents a specific operation step (identified by OperationSequence) performed at a particular work center (LocationID) for a given work order, capturing both planned and actual scheduling dates, resource hours consumed, and costs incurred. The LocationID foreign key links to Production.Location, where CostRate and Availability attributes are used to calculate actual operation costs and determine scheduling feasibility for each routing step. This table enables production scheduling, shop floor tracking, and cost variance analysis across manufacturing operations.',
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
    @value = N'Foreign key referencing the parent work order in Production.WorkOrder. Identifies which manufacturing work order this routing step belongs to. Part of the composite primary key.',
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
    @value = N'Foreign key referencing the product being manufactured in Production.Product. Identifies which product is being produced in this work order routing step. Part of the composite primary key.',
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
    @value = N'A numeric sequence number (1-7) indicating the order in which manufacturing operations are performed within a work order. Lower numbers represent earlier steps in the production process.',
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
    @value = N'Foreign key referencing the manufacturing work center or physical location in Production.Location where this operation is performed. Part of the composite primary key. Values (10,20,30,40,45,50,60) correspond to specific work centers in the production facility.',
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
    @value = N'The planned/scheduled date when this manufacturing operation is expected to begin at the specified work center.',
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
    @value = N'The planned/scheduled date when this manufacturing operation is expected to be completed at the specified work center.',
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
    @value = N'The actual date when this manufacturing operation began. Nullable, as operations may not have started yet or the actual date may not have been recorded.',
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
    @value = N'The actual date when this manufacturing operation was completed. Nullable, as operations may still be in progress or the completion date may not have been recorded.',
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
    @value = N'The actual number of resource hours consumed during this manufacturing operation. Only 6 distinct values (1, 2, 3, 3.5, 4, 4.1) suggesting standardized time allocations per operation type.',
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
    @value = N'The planned/budgeted cost for performing this manufacturing operation at the specified work center. Only 7 distinct values suggest costs are derived from standard rates per location or operation type.',
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
    @value = N'The actual cost incurred for performing this manufacturing operation. Nullable and shares the same 7 distinct values as PlannedCost, suggesting costs are calculated from standard rates applied to actual hours.',
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
    @value = N'The date and time when this routing record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Purchasing.ProductVendor is a junction/association table that defines the purchasing relationship between products and their approved vendors (suppliers). For each product-vendor combination, it stores procurement parameters including lead times, pricing, order quantity constraints, and the unit of measure used when ordering. This table enables the purchasing department to know which vendors supply which products, at what price, and under what ordering terms. The MinOrderQty and MaxOrderQty columns actively constrain purchase order quantities — observed dominant order quantities in related purchase order data (e.g., 3 and 550) reflect these bounds. Additionally, the table supports vendor quality evaluation at the product level, as rejection quantities tracked in related purchasing transactions can be traced back to specific product-vendor pairings defined here.',
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
    @value = N'Foreign key referencing the product being purchased from the vendor. Part of the composite primary key identifying the unique product-vendor relationship.',
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
    @value = N'Foreign key referencing the vendor (supplier) who supplies the product. Part of the composite primary key identifying the unique product-vendor relationship.',
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
    @value = N'The average number of days it takes for the vendor to deliver the product after an order is placed. Used for procurement planning and inventory management.',
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
    @value = N'The standard unit price charged by the vendor for this product. Used as the baseline cost for purchasing and cost accounting purposes.',
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
    @value = N'The actual unit cost paid the last time this product was received from this vendor. May differ from StandardPrice due to discounts, surcharges, or price changes.',
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
    @value = N'The date when the most recent shipment of this product was received from this vendor. Helps track vendor activity and product availability history.',
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
    @value = N'The minimum quantity that must be ordered from this vendor for this product in a single purchase order. Enforces vendor minimum order requirements.',
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
    @value = N'The maximum quantity that can be ordered from this vendor for this product in a single purchase order. Enforces vendor or internal purchasing limits.',
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
    @value = N'The quantity of this product currently on order from this vendor (i.e., ordered but not yet received). Nullable because there may be no outstanding orders.',
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
    @value = N'The unit of measure used when ordering this product from this vendor (e.g., EA=Each, CTN=Carton, CAN=Can, CS=Case, GAL=Gallon, DZ=Dozen, PAK=Pack). References the standard unit of measure lookup table.',
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
    @value = N'The date and time when this product-vendor record was last modified. Used for auditing and change tracking.',
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
    @value = N'Stores the individual line items (detail records) for purchase orders issued by AdventureWorks to its vendors. Each row represents a single product line within a purchase order, capturing the product ordered, quantities (ordered, received, rejected, and stocked), pricing, due date, and calculated line total. This is the child table to Purchasing.PurchaseOrderHeader and together they form the complete purchase order document.',
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
    @value = N'Foreign key referencing the parent purchase order in Purchasing.PurchaseOrderHeader. Together with PurchaseOrderDetailID, forms the composite primary key of this table. Identifies which purchase order this line item belongs to.',
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
    @value = N'Surrogate primary key uniquely identifying each purchase order line item record. Auto-incremented integer that, combined with PurchaseOrderID, forms the composite primary key.',
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
    @value = N'The date by which the ordered product line is expected to be delivered by the vendor. This is a line-item level due date, allowing different products within the same purchase order to have different delivery deadlines.',
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
    @value = N'The quantity of the product ordered from the vendor on this purchase order line. Stored as smallint, reflecting that order quantities are whole numbers and typically not extremely large.',
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
    @value = N'Foreign key referencing the product being ordered on this line item. Links to Purchasing.ProductVendor to identify the specific product-vendor purchasing relationship, ensuring only approved vendor-product combinations are ordered.',
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
    @value = N'The price per unit agreed upon with the vendor for this product on this purchase order line, stored in money data type. May reflect the standard price from Purchasing.ProductVendor or a negotiated price for this specific order.',
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
    @value = N'The total monetary value for this purchase order line, calculated as OrderQty multiplied by UnitPrice. Represents the extended cost for the product line and contributes to the subtotal in the parent Purchasing.PurchaseOrderHeader record.',
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
    @value = N'The actual quantity of the product received from the vendor against this purchase order line. May differ from OrderQty in cases of partial shipments or over-delivery. Used to track fulfillment status.',
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
    @value = N'The quantity of received product that was rejected during quality inspection and not accepted into inventory. A value of 0 indicates all received goods passed inspection. Non-zero values indicate quality issues with the vendor shipment.',
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
    @value = N'The quantity of received product that was accepted and placed into inventory stock, calculated as ReceivedQty minus RejectedQty. Represents the net usable quantity added to inventory from this purchase order line.',
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
    @value = N'The date and time when this purchase order detail record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores the header-level information for purchase orders issued by AdventureWorks to its vendors. Each record represents a single purchase order transaction, capturing the ordering employee, vendor, shipping method, key dates, and financial totals (subtotal, tax, freight, and total due). This is the parent table for Purchasing.PurchaseOrderDetail, which stores the individual line items of each order. With an average of approximately 2.2 line items per order (8,845 detail lines across 4,012 orders), AdventureWorks typically issues focused purchase orders with a small number of distinct products, consistent with ordering from specialized vendors with limited product ranges.',
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
    @value = N'The unique identifier for each purchase order. Serves as the primary key of this table and is referenced by Purchasing.PurchaseOrderDetail to link line items back to their parent order.',
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
    @value = N'Tracks the number of times the purchase order has been revised or updated since its creation. A value of 4 is the most common, suggesting most orders go through a standard revision cycle.',
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
    @value = N'Represents the current lifecycle status of the purchase order. The 4 possible values likely correspond to: 1=Pending, 2=Approved, 3=Rejected, 4=Complete (or similar workflow states).',
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
    @value = N'References the employee (purchasing agent) who created or is responsible for the purchase order. Links to HumanResources.Employee via BusinessEntityID.',
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
    @value = N'References the vendor (supplier) to whom the purchase order was issued. Links to Purchasing.Vendor via BusinessEntityID.',
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
    @value = N'References the shipping method selected for delivery of the ordered goods. Links to Purchasing.ShipMethod via ShipMethodID.',
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
    @value = N'The date on which the purchase order was placed with the vendor.',
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
    @value = N'The expected or actual date on which the ordered goods were shipped by the vendor. Nullable, as some orders may not yet have shipped.',
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
    @value = N'The pre-tax, pre-freight monetary total of all line items in the purchase order. Represents the sum of line item costs from Purchasing.PurchaseOrderDetail.',
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
    @value = N'The shipping/freight cost associated with delivering the purchase order.',
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
    @value = N'The total amount due to the vendor for this purchase order, calculated as SubTotal + TaxAmt + Freight. Represents the final payable amount.',
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
    @value = N'The date and time when the purchase order record was last modified. Used for auditing and change tracking.',
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
    @value = N'A lookup/reference table that defines the available shipping methods used in the AdventureWorks system. Each record represents a distinct shipping carrier or service option, including its base shipping cost and per-unit rate. This table serves as a foundational reference for both purchase orders and sales orders. All 5 shipping methods are actively used in purchasing (purchase orders utilize the full range of shipping options), while sales orders use only 2 of the 5 available methods (ShipMethodID values 1 and 5), confirming that the sales channel operates with a significantly more restricted set of shipping options compared to procurement, which has broader shipping flexibility.',
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
    @value = N'The primary key and unique identifier for each shipping method. An integer surrogate key used to reference a specific shipping method from order tables.',
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
    @value = N'The descriptive name of the shipping method or carrier service (e.g., ''OVERNIGHT J-FAST'', ''CARGO TRANSPORT 5''). This is the human-readable label displayed to users when selecting a shipping option.',
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
    @value = N'The base (fixed) shipping cost charged for using this shipping method, regardless of weight or quantity. Represents the flat fee component of the shipping cost calculation.',
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
    @value = N'The per-unit or per-weight shipping rate charged in addition to the base fee. Used to calculate the variable portion of the total shipping cost.',
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
    @value = N'A globally unique identifier (GUID) assigned to each shipping method row. Used for replication, data synchronization, or merge operations across distributed database environments.',
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
    @value = N'The date and time when the shipping method record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores information about vendors (suppliers) that the company purchases products from. Each record represents a unique vendor with their account details, credit rating, preferred status, and purchasing web service URL. This table is part of the Purchasing domain and serves as the central vendor master record, referenced by purchase orders and product-vendor relationships. Notably, the table functions as a vendor registry that includes not only active vendors but also inactive or candidate vendors: approximately 18 of the 104 vendors have no active product supply relationships defined, and the same 18 vendors have never had a purchase order placed against them, suggesting they may be deprecated, inactive, or prospective vendors retained for reference purposes.',
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
    @value = N'The primary key and foreign key linking this vendor record to the Person.BusinessEntity table. Every vendor must first be registered as a business entity, and this ID serves as the unique identifier for the vendor throughout the purchasing system.',
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
    @value = N'A unique alphanumeric account number assigned to each vendor for identification and reference in purchasing transactions. The format appears to be a truncated vendor name followed by a sequence number (e.g., ''ALLENSON0001'').',
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
    @value = N'The full business name of the vendor company. Used for display and identification purposes throughout the purchasing process.',
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
    @value = N'A numeric rating (1-5) representing the vendor''s creditworthiness and reliability. Lower values likely indicate better credit standing. Used to assess vendor financial risk in purchasing decisions.',
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
    @value = N'A boolean flag indicating whether this vendor is a preferred supplier. Preferred vendors are prioritized for purchasing decisions. The majority of vendors (most samples show ''true'') are marked as preferred.',
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
    @value = N'A boolean flag indicating whether the vendor is currently active and available for purchasing. Inactive vendors would be excluded from new purchase orders while retaining historical data.',
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
    @value = N'The URL of the vendor''s web service endpoint used for electronic purchasing integration. Only a small subset of vendors (approximately 6 out of 104) expose a purchasing web service, making this field optional.',
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
    @value = N'The date and time when the vendor record was last modified. Used for auditing and tracking changes to vendor information over time.',
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
    @value = N'A junction/bridge table that maps countries and regions to their corresponding currencies, establishing a many-to-many relationship between geographic regions and the currencies used within them. This table supports multi-currency sales operations by defining which currency is associated with each country or region, enabling proper currency handling for international transactions.',
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
    @value = N'The ISO 3166-1 alpha-2 two-letter code identifying a country or region. Forms part of the composite primary key and serves as a foreign key to Person.CountryRegion. Identifies which country or region is being mapped to a currency.',
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
    @value = N'The ISO 4217 three-letter currency code identifying the currency used in the corresponding country or region. Forms part of the composite primary key and serves as a foreign key to Sales.Currency. Includes both current and historical/obsolete currencies.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes. The presence of only two distinct values suggests bulk data loads or system migrations rather than individual record-level updates.',
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
    @value = N'Stores credit card information associated with individual customers for sales transactions. Each record represents a unique credit card tied to exactly one person, containing the card type, masked/tokenized card number, and expiration details. The 1:1 relationship with Sales.PersonCreditCard confirms that each credit card belongs to a single customer rather than serving as a shared or reusable payment reference. This table functions as a per-customer payment instrument store within the Sales domain, supporting payment processing for orders.',
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
    @value = N'Surrogate primary key uniquely identifying each credit card record in the system.',
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
    @value = N'The brand or network type of the credit card. Only 4 possible values exist: SuperiorCard, Distinguish, ColonialVoice, and Vista — representing fictional card network brands analogous to real-world brands like Visa, MasterCard, etc.',
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
    @value = N'The credit card number, stored as a string. Each value is 14 characters long and appears to be a numeric string, likely representing a masked or tokenized version of the actual card number for security purposes.',
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
    @value = N'The expiration month of the credit card, stored as a small integer (1-12 representing January through December).',
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
    @value = N'The expiration year of the credit card. Values range from 2005 to 2008, reflecting the time period of the sample data.',
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
    @value = N'The date and time when the credit card record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'A reference/lookup table storing world currencies—both current and historical/legacy—identified by their standard ISO 4217 three-letter currency codes and full names. The table intentionally retains obsolete currencies (e.g., Deutsche Mark/DEM, French Franc/FRF, Austrian Schilling/ATS, Finnish Markka/FIM, Slovak Koruna/SKK, Spanish Peseta/ESP, Latvian Lats/LVL) to support historical transaction records, exchange rate history, and country-currency mappings for nations that have since adopted the Euro or changed currencies. This foundational table supports multi-currency financial transactions and reporting within the sales domain, serving as the authoritative currency registry for both Sales.CountryRegionCurrency (country-to-currency mappings) and Sales.CurrencyRate (exchange rates, including self-referential USD-to-USD rates).',
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
    @value = N'The ISO 4217 three-letter currency code that uniquely identifies each currency (e.g., ''USD'' for US Dollar, ''CAD'' for Canadian Dollar). Serves as the primary key of the table.',
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
    @value = N'The full human-readable name of the currency (e.g., ''Canadian Dollar'', ''Russian Ruble(old)''). Provides a descriptive label for display purposes in reports and user interfaces.',
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
    @value = N'The date and time when the currency record was last modified. Used for auditing and change tracking purposes. All records share the same date (2008-04-30), indicating a single bulk data load.',
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
    @value = N'Stores daily currency exchange rates used to convert monetary values between USD and various foreign currencies. Each record captures the exchange rate for a specific currency pair on a given date, including both an average rate for the day and an end-of-day rate. This table supports multi-currency sales transactions by providing the conversion rates referenced by sales orders. Approximately 44.5% of sales orders involve international customers requiring currency conversion, reflecting a substantial global customer base, while the remaining 55.5% are domestic USD transactions that do not reference this table.',
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
    @value = N'Surrogate primary key uniquely identifying each currency rate record. Auto-incremented integer assigned to each exchange rate entry.',
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
    @value = N'The date for which the exchange rate applies. Rates are recorded daily, with 1,097 distinct dates spanning approximately 2011 to 2014.',
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
    @value = N'The source currency code for the exchange rate conversion. Always ''USD'' (US Dollar), indicating all rates are expressed relative to the US Dollar as the base currency.',
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
    @value = N'The target currency code to which USD is being converted. Contains 14 distinct ISO 4217 currency codes including major currencies (EUR, GBP, JPY, CAD, AUD) and others (ARS, MXN, SAR, VEB, CNY, BRL, DEM, FRF, USD).',
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
    @value = N'The average exchange rate from USD to the target currency for the given date, representing the mean rate observed throughout the trading day.',
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
    @value = N'The closing exchange rate from USD to the target currency at the end of the trading day, representing the final rate at market close.',
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
    @value = N'The date and time when the record was last modified, used for auditing and change tracking purposes.',
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
    @value = N'Stores customer records for the AdventureWorks sales system. Each record represents a unique customer entity, which can be either an individual person (linked to Person.Person) or a business/store (linked to Sales.Store), or both. The table assigns each customer a unique account number and associates them with a sales territory. It serves as the central customer registry referenced by sales orders, with customers typically placing multiple orders over time (averaging approximately 1.65 orders per customer based on order history).',
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
    @value = N'The primary key and unique identifier for each customer record in the system.',
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
    @value = N'Optional foreign key linking the customer to an individual person record in Person.Person. Populated for individual (retail) customers; NULL for store-only customers.',
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
    @value = N'Optional foreign key linking the customer to a store/business entity in Sales.Store. Populated only for business/wholesale customers; NULL for individual retail customers.',
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
    @value = N'Foreign key linking the customer to a sales territory in Sales.SalesTerritory. Defines the geographic sales region the customer belongs to.',
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
    @value = N'A unique, human-readable account number assigned to each customer, formatted as ''AW'' followed by an 8-digit number (e.g., ''AW00026309''). Used as a business-facing customer identifier.',
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
    @value = N'A globally unique identifier (GUID) for the customer record, used for replication and row-level identification across distributed systems.',
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
    @value = N'Timestamp recording when the customer record was last modified. All records show the same date (2014-09-12), indicating a bulk load or migration event.',
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
    @value = N'A junction/bridge table that establishes a many-to-many relationship between persons (customers) and their credit cards. Each record links a specific person (identified by BusinessEntityID) to a specific credit card (identified by CreditCardID), enabling customers to have credit cards on file for sales transactions. This table is part of the AdventureWorks sales payment infrastructure and is referenced by Sales.SalesOrderHeader to associate orders with payment methods.',
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
    @value = N'The unique identifier of the person who owns or is associated with the credit card. This is a foreign key referencing Person.Person.BusinessEntityID, identifying the customer in the relationship.',
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
    @value = N'The unique identifier of the credit card associated with the person. This is a foreign key referencing Sales.CreditCard.CreditCardID, identifying the specific credit card in the relationship.',
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
    @value = N'The date and time when the person-credit card association record was last modified. This is a standard audit column used throughout the AdventureWorks database to track data changes.',
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
    @value = N'Stores individual line items for sales orders in the AdventureWorks sales system. Each row represents a single product ordered within a sales order, capturing the product, quantity, pricing, applicable special offer/discount, carrier tracking information, and computed line total. This is the detail/child table to Sales.SalesOrderHeader, enabling multi-product orders where each product line is tracked independently with its own pricing and discount information.',
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
    @value = N'Foreign key referencing the parent sales order in Sales.SalesOrderHeader. Identifies which order this line item belongs to. Multiple detail rows share the same SalesOrderID, forming the line items of a single order.',
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
    @value = N'Surrogate primary key uniquely identifying each sales order line item across all orders. Auto-incremented integer that provides a globally unique identifier for every detail record.',
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
    @value = N'The shipment tracking number assigned by the carrier for the package containing this line item. Approximately 50% null, indicating it is populated only when the order has been shipped and a tracking number is available.',
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
    @value = N'The quantity of the product ordered on this line item. A smallint indicating how many units of the product were purchased.',
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
    @value = N'Foreign key identifying the specific product ordered on this line item. References Sales.SpecialOfferProduct (in conjunction with SpecialOfferID) to validate the product-offer combination, and transitively references Production.Product.',
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
    @value = N'Foreign key identifying the special promotional offer applied to this line item. Combined with ProductID, references Sales.SpecialOfferProduct to validate that the offer applies to the ordered product. SpecialOfferID=1 represents ''No Discount'' (the default), which dominates the sample values.',
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
    @value = N'The selling price per unit of the product at the time of the order, in the order''s currency. This is the price before any discount is applied.',
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
    @value = N'The fractional discount rate applied to the unit price for this line item, expressed as a decimal (e.g., 0.10 = 10% discount). Corresponds to the discount percentage from the associated special offer. A value of 0 means no discount was applied.',
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
    @value = N'The computed total monetary value for this line item, calculated as UnitPrice * OrderQty * (1 - UnitPriceDiscount). Represents the actual revenue amount for this product line after discounts.',
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
    @value = N'A globally unique identifier (GUID) for the row, used for replication and merge operations. Standard AdventureWorks pattern for enabling row-level tracking across distributed systems.',
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
    @value = N'The date and time when the row was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores the header-level information for each sales order in the AdventureWorks sales system. Each row represents a single sales transaction initiated by a customer, capturing order identification, dates, status, financial totals, payment details, shipping information, and the associated salesperson and territory. This table is the central hub of the sales order lifecycle, referenced by order line items (Sales.SalesOrderDetail) and sales reasons (Sales.SalesOrderHeaderSalesReason).',
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
    @value = N'The primary key and unique identifier for each sales order. Used to reference this order from child tables such as Sales.SalesOrderDetail and Sales.SalesOrderHeaderSalesReason.',
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
    @value = N'Tracks the number of times the sales order has been revised or updated. Only values 8 and 9 appear, suggesting these records have been through multiple revision cycles.',
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
    @value = N'The date and time when the sales order was placed by the customer.',
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
    @value = N'The date by which the order is expected to be fulfilled or delivered to the customer.',
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
    @value = N'The actual date the order was shipped. Nullable, as some orders may not yet have been shipped at the time of record creation.',
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
    @value = N'An enumerated status code representing the current state of the sales order. All records have value 5, which likely corresponds to ''Shipped'' or ''Completed'' in the AdventureWorks status enumeration (1=In Process, 2=Approved, 3=Backordered, 4=Rejected, 5=Shipped, 6=Cancelled).',
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
    @value = N'A boolean flag indicating whether the order was placed online (true) or through a salesperson (false). Approximately 87.8% of orders are online, matching the null rate of SalesPersonID.',
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
    @value = N'A human-readable, formatted sales order number with the prefix ''SO'' followed by a numeric identifier (e.g., ''SO55838''). Used as the business-facing order reference number.',
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
    @value = N'The customer''s purchase order number, provided when the customer is a business placing an order against their own internal PO system. Null for online/individual orders (~87.8% null).',
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
    @value = N'The customer''s account number in the format ''10-4030-XXXXXX'' or ''10-4020-XXXXXX'', used for billing and account identification purposes.',
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
    @value = N'Foreign key referencing Sales.Customer, identifying the customer who placed the order.',
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
    @value = N'Foreign key referencing Sales.SalesPerson, identifying the salesperson responsible for the order. Null for online orders (~87.8% null), populated only for orders placed through a sales representative.',
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
    @value = N'Foreign key referencing Sales.SalesTerritory, identifying the geographic sales territory associated with the order. Used for sales performance tracking and territory-based reporting.',
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
    @value = N'Foreign key referencing Person.Address, identifying the billing address for the order where invoices are sent.',
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
    @value = N'Foreign key referencing Person.Address, identifying the shipping address where the order will be physically delivered.',
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
    @value = N'Foreign key referencing Purchasing.ShipMethod, identifying the shipping carrier or method used to deliver the order. Only 2 of the 5 available shipping methods are used for sales orders.',
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
    @value = N'Foreign key referencing Sales.CreditCard, identifying the credit card used to pay for the order. Null for approximately 3.6% of orders, which may represent non-credit-card payment methods or offline orders.',
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
    @value = N'The authorization or approval code returned by the credit card processor when the payment was approved. Null when no credit card is used (3.6% null, matching CreditCardID null rate).',
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
    @value = N'Foreign key referencing Sales.CurrencyRate, identifying the exchange rate used to convert the order total to a foreign currency. Null for domestic (USD) orders, which represent approximately 55.5% of all orders.',
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
    @value = N'The pre-tax, pre-freight subtotal of all line items in the order, representing the sum of extended prices from Sales.SalesOrderDetail.',
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
    @value = N'The total tax amount charged on the order, calculated based on applicable tax rates for the shipping destination.',
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
    @value = N'The shipping and handling charges for the order, based on the selected shipping method and order weight/size.',
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
    @value = N'The total amount due for the order, computed as SubTotal + TaxAmt + Freight. This is the final amount charged to the customer.',
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
    @value = N'An optional free-text comment or note associated with the sales order. Nearly always null (99.9%), used only in exceptional cases.',
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
    @value = N'A globally unique identifier (GUID) assigned to each sales order row, used for replication and data synchronization purposes.',
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
    @value = N'The date and time when the sales order record was last modified, used for auditing and change tracking.',
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
    @value = N'A junction/bridge table that associates sales orders with the reasons customers made those purchases. Each row links a specific sales order (from Sales.SalesOrderHeader) to a specific sales reason (from Sales.SalesReason), enabling many-to-many relationships between orders and purchase motivations. This table supports sales analysis by tracking why customers bought products.',
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
    @value = N'Foreign key referencing the sales order in Sales.SalesOrderHeader. Together with SalesReasonID, forms the composite primary key of this junction table. Identifies which sales order is associated with a given purchase reason.',
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
    @value = N'Foreign key referencing a purchase reason in Sales.SalesReason. Together with SalesOrderID, forms the composite primary key. Identifies the motivation (e.g., price, promotion, advertising) attributed to the sales order.',
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
    @value = N'Timestamp recording when the association between the sales order and sales reason was last created or modified. Standard audit column used throughout the AdventureWorks database.',
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
    @value = N'Stores sales performance and compensation data for individual sales representatives at AdventureWorks. Each record represents one salesperson employee (only 17 total), capturing their assigned sales territory, sales quota, bonus amount, commission percentage, year-to-date sales figures, and prior year sales. This table serves as the central record for the sales force, linking HR employee records to sales-specific metrics and territory assignments. Notably, these salespeople handle only a minority of total order volume — approximately 12.2% of orders are attributed to a salesperson, while the remaining ~87.8% are online/direct orders with no salesperson assignment. This means the sales team focuses on a select segment of business (likely B2B or key account sales) rather than the dominant online channel.',
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
    @value = N'Primary key and foreign key identifying the salesperson. References HumanResources.Employee.BusinessEntityID, meaning each salesperson is also an employee. This is a specialization pattern where the Sales.SalesPerson table extends the employee record with sales-specific attributes.',
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
    @value = N'Foreign key referencing Sales.SalesTerritory, indicating the geographic sales territory currently assigned to this salesperson. A salesperson is assigned to one territory at a time, though territory history is tracked separately in Sales.SalesTerritoryHistory.',
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
    @value = N'The sales quota (target revenue) assigned to the salesperson, expressed in monetary units. Only two distinct values exist (250,000 and 300,000), suggesting quota tiers rather than individually negotiated targets. Nullable, indicating some salespeople may not have a quota set.',
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
    @value = N'The bonus amount paid to the salesperson, expressed in monetary units. Values range from 0 to 6,700, with 14 distinct values across 17 rows, suggesting individually determined bonuses based on performance.',
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
    @value = N'The commission rate (as a decimal percentage) earned by the salesperson on sales. Values range from 0 to 0.02 (0% to 2%), with 8 distinct rates, suggesting tiered or individually negotiated commission structures.',
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
    @value = N'The total sales revenue generated by the salesperson from the beginning of the current fiscal year to date. All 17 values are unique, reflecting individual performance levels ranging from ~$172K to ~$4.25M.',
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
    @value = N'The total sales revenue generated by the salesperson during the previous fiscal year. Some salespeople have a value of 0, likely indicating they were hired during the current year and had no prior-year sales.',
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
    @value = N'A globally unique identifier (GUID) for the row, used for replication and data synchronization purposes. Each row has a unique GUID.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores the historical record of sales quota assignments for each salesperson over time. Each row captures a specific quota amount assigned to a salesperson (identified by BusinessEntityID) for a particular quota period (QuotaDate). This table tracks how sales targets have changed across multiple fiscal periods from 2011 through 2014, enabling analysis of quota trends and salesperson performance targets over time.',
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
    @value = N'Foreign key referencing the salesperson in Sales.SalesPerson. Identifies which salesperson this quota record belongs to. Part of the composite primary key.',
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
    @value = N'The effective date of the sales quota assignment, representing the end of a quota period. Together with BusinessEntityID, forms the composite primary key. Dates follow a roughly quarterly pattern (end of February, May, August, November/December) from May 2011 through March 2014.',
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
    @value = N'The monetary sales quota (target) assigned to the salesperson for the given quota period. Stored as a money type representing the dollar amount the salesperson is expected to achieve.',
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
    @value = N'A globally unique identifier (GUID) for each row, used for replication and row-level identification purposes. Every row has a unique GUID.',
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
    @value = N'The date and time when the quota record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'A lookup/reference table that stores predefined reasons why customers make purchases. It categorizes sales motivations (e.g., price, quality, advertising) into types (Marketing, Promotion, Other) and is used to tag sales orders with one or more reasons for purchase. Of the 10 defined reasons, only 7 are actively used in practice (IDs: 1, 2, 4, 5, 6, 9, 10), with Reason ID 1 being the most frequently assigned. The gaps in IDs (3, 7, 8) suggest those reasons were retired or deleted. A single sales order can be attributed to multiple reasons simultaneously via the junction table Sales.SalesOrderHeaderSalesReason.',
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
    @value = N'The primary key and unique identifier for each sales reason record. An auto-incremented integer that uniquely identifies each reason a customer may have for making a purchase.',
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
    @value = N'The descriptive name of the sales reason, representing the specific motivation or influence behind a customer''s purchase decision (e.g., ''Price'', ''Quality'', ''Television Advertisement'', ''Demo Event'').',
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
    @value = N'A categorical classification grouping sales reasons into broader types: ''Marketing'' (for advertising and brand-related reasons), ''Promotion'' (for promotional activities), and ''Other'' (for miscellaneous reasons). Acts as an enum/category field.',
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
    @value = N'The date and time when the sales reason record was last modified. Used for auditing and tracking changes to the reference data.',
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
    @value = N'Stores sales tax rates applicable to different states/provinces, categorized by tax type. Each row defines a named tax rate (e.g., ''California State Sales Tax'', ''Canadian GST'') associated with a specific geographic region and a tax type classification. This table supports tax calculation during sales order processing in the AdventureWorks system.',
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
    @value = N'Primary key uniquely identifying each sales tax rate record.',
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
    @value = N'Foreign key referencing Person.StateProvince, identifying the state or province to which this tax rate applies.',
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
    @value = N'Enumeration indicating the category or type of tax. Only 3 possible values (1, 2, 3), likely representing categories such as state/provincial sales tax, combined tax, and VAT/output tax.',
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
    @value = N'The percentage tax rate applied to taxable sales in the associated state/province for the given tax type. Values range from 5% to 19.6%.',
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
    @value = N'Human-readable name describing the tax rate, such as ''California State Sales Tax'', ''Canadian GST'', or ''United Kingdom Output Tax''.',
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
    @value = N'A globally unique identifier (GUID) for the row, used for replication and data synchronization purposes.',
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
    @value = N'The date and time when the record was last modified. All records share the same date (2008-04-30), indicating a bulk load or initial data population.',
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
    @value = N'Stores sales territory definitions used to organize and track sales performance across geographic regions. The table defines exactly 10 territories, each representing a named geographic area (e.g., Southwest, United Kingdom, Australia) associated with a country/region and a broader sales group (North America, Europe, Pacific). Territories are broad geographic groupings that span multiple states/provinces and, in some cases, multiple countries (e.g., US states, Canadian provinces, Pacific island territories, and European countries). The table tracks year-to-date and prior-year sales and cost figures for each territory. All 10 territories are actively used — each has at least one assigned salesperson and an active customer base, with some territories supporting multiple salespeople for shared or overlapping coverage. Territory usage is confirmed across 31,465 sales orders, demonstrating full geographic coverage and reflecting relative sales volume by region. It serves as a foundational reference for assigning salespeople, customers, and orders to geographic sales regions.',
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
    @value = N'The primary key and unique identifier for each sales territory. An auto-incrementing integer used to reference this territory from related tables such as Sales.SalesPerson, Sales.Customer, Sales.SalesOrderHeader, and Sales.SalesTerritoryHistory.',
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
    @value = N'The human-readable name of the sales territory (e.g., ''Southwest'', ''United Kingdom'', ''Australia''). Used for display and reporting purposes to identify the geographic sales region.',
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
    @value = N'The ISO 3166-1 alpha-2 country code identifying the country or region this sales territory belongs to. Foreign key referencing Person.CountryRegion. Values include US, GB, FR, DE, CA, AU — indicating territories span the United States, United Kingdom, France, Germany, Canada, and Australia.',
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
    @value = N'A high-level geographic grouping for the sales territory. Only three values exist: ''North America'', ''Europe'', and ''Pacific''. Used to roll up territory-level sales data into broader regional summaries.',
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
    @value = N'The total sales revenue generated within this territory for the current fiscal year to date, stored in monetary units. Used for performance tracking and quota comparison.',
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
    @value = N'The total sales revenue generated within this territory during the previous fiscal year. Used for year-over-year performance comparison.',
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
    @value = N'The total costs associated with this sales territory for the current fiscal year to date. Currently all values are zero, suggesting this field is reserved for future use or not yet populated.',
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
    @value = N'The total costs associated with this sales territory for the previous fiscal year. Currently all values are zero, suggesting this field is reserved for future use or not yet populated.',
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
    @value = N'A globally unique identifier (GUID) for each sales territory row. Used for replication and data synchronization purposes to uniquely identify records across distributed systems.',
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
    @value = N'The date and time when the territory record was last modified. All records share the same date (2008-04-30), indicating a bulk load or migration event. Used for auditing and change tracking.',
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
    @value = N'Tracks the historical assignment of sales representatives to sales territories over time. Each record captures a specific period during which a salesperson (identified by BusinessEntityID) was assigned to a particular sales territory (identified by TerritoryID), with StartDate and EndDate defining the duration of that assignment. This table serves as an audit trail of territory assignments, enabling analysis of how salespeople have moved between territories over time.',
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
    @value = N'The unique identifier of the salesperson whose territory assignment is being recorded. References Sales.SalesPerson to identify which sales representative this history record belongs to.',
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
    @value = N'The identifier of the sales territory to which the salesperson was assigned during the period defined by StartDate and EndDate. References Sales.SalesTerritory to identify the geographic region.',
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
    @value = N'The date when the salesperson''s assignment to the specified territory began. Together with BusinessEntityID and TerritoryID, forms part of the composite primary key to uniquely identify each assignment period.',
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
    @value = N'The date when the salesperson''s assignment to the specified territory ended. A NULL value indicates the assignment is currently active (the salesperson is still assigned to that territory). Only 3 distinct non-null end dates exist, suggesting most current assignments are still active.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used for replication and row-level identification across distributed systems. Each value is unique across all 17 rows.',
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
    @value = N'The date and time when the record was last modified. Used for auditing and tracking when territory assignment records were created or updated.',
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
    @value = N'Stores individual line items in customer shopping carts for the Adventure Works e-commerce platform. Each row represents a specific product added to a shopping cart session, tracking the quantity desired and when the item was added. This table supports the online shopping experience by persisting cart contents between sessions.',
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
    @value = N'The primary key and unique identifier for each shopping cart line item. Auto-incremented integer that uniquely identifies each product entry in any shopping cart.',
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
    @value = N'Identifies the shopping cart session this item belongs to. Stored as a string (nvarchar) rather than an integer FK, suggesting it is a session-based or token-based cart identifier. Multiple items can share the same ShoppingCartID, grouping them into one cart.',
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
    @value = N'The number of units of the product the customer has added to their shopping cart. Represents the desired purchase quantity for this line item.',
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
    @value = N'Foreign key referencing the product being added to the cart. Links to Production.Product to identify which specific product (by ID 862, 874, or 881) the customer intends to purchase.',
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
    @value = N'The timestamp when this shopping cart item was first added to the cart. Used to track cart age and potentially expire old cart items.',
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
    @value = N'The timestamp of the most recent modification to this cart item record, such as a quantity update. Standard audit column used throughout the AdventureWorks schema.',
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
    @value = N'Stores definitions of special promotional offers and discounts available in the AdventureWorks sales system. Each record defines a named promotion with its discount percentage, type, category, applicable date range, and quantity thresholds. This is a foundational lookup/reference table used to apply discounts to sales order line items and products. The table contains a small, selective set of promotions (only 15 are associated with at least one product). SpecialOfferID 1 serves as a default ''No Discount'' offer (0% discount) applied broadly to the overwhelming majority of transactions, while the remaining offers represent targeted discounts at specific rates — 2%, 5%, 10%, 15%, 20%, 30%, 35%, and 40% — such as volume discounts, seasonal promotions, and inventory-driven offers. Promotional pricing is applied to only a minority of sales order line items.',
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
    @value = N'Primary key uniquely identifying each special offer or promotional discount record.',
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
    @value = N'Human-readable name or label for the special offer, such as ''Half-Price Pedal Sale'', ''Volume Discount 41 to 60'', or ''No Discount''.',
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
    @value = N'The discount percentage applied to the product price when this offer is used, stored as a decimal (e.g., 0.10 = 10%, 0.50 = 50%). A value of 0 indicates no discount.',
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
    @value = N'Categorizes the nature of the promotion. Possible values: ''Volume Discount'', ''Seasonal Discount'', ''Excess Inventory'', ''New Product'', ''Discontinued Product'', ''No Discount''.',
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
    @value = N'Indicates the target audience or channel for the offer. Possible values: ''Reseller'', ''Customer'', ''No Discount''.',
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
    @value = N'The date on which the special offer becomes active and eligible to be applied to sales.',
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
    @value = N'The date on which the special offer expires and is no longer applicable to sales.',
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
    @value = N'The minimum order quantity required for this offer to apply. For volume discounts, this defines the lower bound of the quantity tier (e.g., 11, 15, 25, 41, 61). Non-volume offers typically have a value of 0.',
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
    @value = N'The maximum order quantity for which this offer applies, defining the upper bound of a quantity tier. NULL for offers without an upper quantity limit (e.g., ''Volume Discount over 60'' or non-volume offers).',
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
    @value = N'A globally unique identifier (GUID) for the row, used for replication and merge operations across distributed database environments.',
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
    @value = N'The date and time when the record was last modified, used for auditing and change tracking.',
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
    @value = N'A junction/bridge table that associates special promotional offers with the specific products to which they apply. Each row represents a valid combination of a special offer and a product, defining which products are eligible for which promotions. This table serves as the many-to-many resolution between Sales.SpecialOffer and Production.Product, and is referenced by Sales.SalesOrderDetail to apply discounts at the line-item level.',
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
    @value = N'Foreign key referencing Sales.SpecialOffer, identifying which promotional offer is associated with the product. Part of the composite primary key. Only 15 distinct values, reflecting the limited number of active promotions.',
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
    @value = N'Foreign key referencing Production.Product, identifying which product is eligible for the associated special offer. Part of the composite primary key. 295 distinct values indicate a broad range of products participate in promotions.',
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
    @value = N'A globally unique identifier (GUID) assigned to each row, used to support replication and row-level identification across distributed systems. Not a business key but a technical identifier.',
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
    @value = N'The date and time when the special offer–product association record was last modified. Used for auditing and change tracking purposes.',
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
    @value = N'Stores information about retail and wholesale stores that are business-to-business customers of AdventureWorks, representing a small but distinct subset of the overall customer base. Each record represents a named store entity with an assigned salesperson and demographic survey data capturing business characteristics such as annual sales, revenue, business type, specialty, square footage, number of employees, and banking information. With only 701 store records among approximately 19,820 total customers (roughly 6.6% of the customer base), this table exclusively captures commercial/business accounts, while the vast majority of AdventureWorks customers are individual retail consumers who are not associated with any store. This table is part of the sales customer hierarchy and is referenced by Sales.Customer via StoreID to link store entities to customer records.',
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
    @value = N'Primary key and foreign key to Person.BusinessEntity. Uniquely identifies each store as a business entity in the AdventureWorks entity hierarchy. Every store must first be registered as a BusinessEntity before appearing in this table.',
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
    @value = N'The trading name or business name of the store. Used to identify the store in sales orders, customer records, and reporting.',
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
    @value = N'Foreign key to Sales.SalesPerson identifying the sales representative assigned to manage the relationship with this store. Nullable, as some stores may not have a dedicated salesperson assigned.',
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
    @value = N'XML document containing survey data about the store''s business characteristics, including annual sales volume, annual revenue, banking institution, business type (BS=Bike Store, OS=Online Store, BM=Bike Manufacturer), year the store opened, product specialty (Road/Mountain/Touring), store square footage, number of brands carried, internet connection type, and number of employees.',
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
    @value = N'A globally unique identifier (GUID) for the store record, used for replication and merge operations to uniquely identify rows across distributed database instances.',
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
    @value = N'Timestamp recording when the store record was last modified. Used for auditing and change tracking purposes.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO
