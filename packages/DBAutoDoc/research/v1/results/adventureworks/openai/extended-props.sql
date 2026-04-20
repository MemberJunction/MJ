-- Database Documentation Script
-- Generated: 2026-03-22T13:08:36.916Z
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
    @value = N'dbo.AWBuildVersion stores the installed AdventureWorks database build/version metadata, acting as a one-row system table that records which database release is loaded and when that version information was created or last modified.',
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
    @value = N'Unique identifier for the single system information record in dbo.AWBuildVersion; it exists to provide a stable primary key for the singleton row.',
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
    @value = N'The installed database build/version string for the AdventureWorks database.',
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
    @value = N'The date and time associated with the recorded database version, likely when this build information was generated or released.',
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
    @value = N'Timestamp indicating when the version record was last updated in the database.',
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
    @value = N'dbo.DatabaseLog stores an audit trail of database DDL and metadata changes captured as XML event records. It exists to record when schema objects such as tables, views, procedures, indexes, constraints, and extended properties were created or altered, along with the exact T-SQL used and contextual details about the event.',
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
    @value = N'Primary identifier for each logged database event row.',
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
    @value = N'Timestamp when the database event was recorded or occurred.',
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
    @value = N'Database principal under which the event was executed or logged.',
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
    @value = N'Type of database event that was captured, such as table creation, index creation, or extended property changes.',
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
    @value = N'Schema containing the affected object.',
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
    @value = N'Name of the affected database object.',
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
    @value = N'Exact T-SQL statement associated with the logged event.',
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
    @value = N'Structured XML representation of the event details.',
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
    @value = N'dbo.ErrorLog stores application or database error events captured for troubleshooting and auditing. Each row records when an error occurred, which user encountered it, the error number and severity details, the procedure and line where it happened, and the full error message.',
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
    @value = N'Surrogate identifier for each logged error event, likely the primary key for uniquely identifying log entries.',
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
    @value = N'Date and time when the error was recorded.',
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
    @value = N'Name of the user or login context associated with the error.',
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
    @value = N'Numeric SQL Server error code or application error code.',
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
    @value = N'Severity level of the error.',
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
    @value = N'State code associated with the error number.',
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
    @value = N'Stored procedure or routine where the error occurred.',
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
    @value = N'Line number within the procedure or batch where the error was raised.',
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
    @value = N'Full descriptive text of the error.',
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
    @value = N'HumanResources.Department stores the master list of organizational departments used by the human resources and operations modules. It serves as a lookup/reference table for assigning employees to departments over time and for reporting departments by broader functional groupings. In addition to individual department names, it organizes departments into six higher-level business functions: Executive General and Administration, Research and Development, Sales and Marketing, Quality Assurance, Manufacturing, and Inventory Management.',
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
    @value = N'Unique identifier for each department record; serves as the stable key used by related tables to reference a department.',
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
    @value = N'The department''s human-readable name, such as Engineering, Sales, or Production.',
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
    @value = N'A broader functional grouping for the department, used to categorize departments into business areas like Manufacturing or Sales and Marketing.',
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
    @value = N'Timestamp indicating when the department record was last modified or seeded in the database.',
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
    @value = N'HumanResources.Employee stores the core employee master record for each person employed by the organization, combining identity, login, job, personal, and employment-status attributes. It represents employees as a specialization of the shared business entity model, and serves as the parent record for related employee history such as department/shift assignments, pay history, sales quota history, and purchasing-related activity. It exists to track who is employed, their role, hire details, leave balances, and their participation in organizational and operational processes.',
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
    @value = N'The employee''s shared business entity identifier and the table''s primary key; links each employee record to the base person/business entity record.',
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
    @value = N'Government-issued or internal national identification number used to uniquely identify the employee in HR records.',
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
    @value = N'Windows/domain login used by the employee to authenticate to company systems.',
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
    @value = N'Hierarchy path node representing the employee''s position in the organizational tree.',
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
    @value = N'Numeric depth of the employee within the organization hierarchy.',
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
    @value = N'The employee''s current job title or role.',
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
    @value = N'The employee''s date of birth.',
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
    @value = N'Marital status code for the employee.',
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
    @value = N'Gender code for the employee.',
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
    @value = N'The date the employee was hired.',
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
    @value = N'Indicates whether the employee is salaried rather than hourly.',
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
    @value = N'Current accrued vacation leave balance in hours.',
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
    @value = N'Current accrued sick leave balance in hours.',
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
    @value = N'Indicates whether the employee record is currently active/current.',
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
    @value = N'System-generated unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp of the last modification to the employee record.',
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
    @value = N'HumanResources.EmployeeDepartmentHistory stores the assignment history of employees to departments and shifts over time. It records when an employee started in a department/shift combination, whether that assignment has ended, and when the record was last modified. The table exists to track organizational placement history rather than just the current assignment.',
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
    @value = N'Identifies the employee whose department/shift assignment is being recorded.',
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
    @value = N'Identifies the department the employee was assigned to during the recorded period.',
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
    @value = N'Identifies the work shift associated with the employee''s assignment.',
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
    @value = N'The date the employee began the department/shift assignment.',
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
    @value = N'The date the employee''s assignment ended, if it is no longer active.',
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
    @value = N'Timestamp indicating when the history record was last updated.',
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
    @value = N'HumanResources.EmployeePayHistory stores the historical pay rate records for employees over time. It exists to track when an employee''s compensation changed, what the new rate was, and how often that rate is paid, enabling payroll history and compensation auditing.',
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
    @value = N'Identifies the employee whose pay history record this is.',
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
    @value = N'The date and time when this pay rate became effective.',
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
    @value = N'The employee''s pay rate at the time of the change.',
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
    @value = N'Indicates how often the employee is paid.',
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
    @value = N'Timestamp of the last modification to the row.',
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
    @value = N'HumanResources.JobCandidate stores recruiting application records for people who have applied for jobs, including their resume content and the person record they are associated with. It exists to capture candidate-specific hiring data separate from the core person master record in Person.Person.',
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
    @value = N'Surrogate identifier for each job candidate record in HumanResources.JobCandidate.',
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
    @value = N'References the underlying person record for the candidate in Person.Person.',
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
    @value = N'XML-formatted resume document containing the candidate''s name, skills, employment history, education, contact information, and related profile details.',
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
    @value = N'Timestamp indicating when the job candidate record was last updated.',
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
    @value = N'HumanResources.Shift stores the standard work shift definitions used by the HR system, including shift name and its start/end times. It acts as a small lookup table that classifies employee department history records by shift schedule.',
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
    @value = N'Unique identifier for each shift definition.',
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
    @value = N'Human-readable shift label such as Day, Evening, or Night.',
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
    @value = N'Clock time when the shift begins.',
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
    @value = N'Clock time when the shift ends.',
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
    @value = N'Timestamp indicating when the shift record was last modified.',
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
    @value = N'Person.Address stores postal and geographic address records used by people, businesses, and sales-related entities in the database. It acts as a shared address master so multiple records can reference the same standardized location information for shipping, billing, and contact purposes.',
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
    @value = N'Surrogate identifier for each address record.',
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
    @value = N'Primary street address line, such as house number, street name, or building address.',
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
    @value = N'Optional secondary address information such as apartment, suite, department, or internal routing details.',
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
    @value = N'City, town, or locality component of the address.',
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
    @value = N'Reference to the state, province, or similar administrative region for the address.',
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
    @value = N'Postal or ZIP code associated with the address.',
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
    @value = N'Geographic point representation of the address, stored as a geography value for mapping and spatial queries.',
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
    @value = N'Globally unique row identifier used for replication, synchronization, or system-level uniqueness.',
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
    @value = N'Timestamp indicating when the address record was last updated.',
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
    @value = N'Person.AddressType is a lookup table that defines the allowed categories for how an address is used in the system, such as Billing, Shipping, Home, Primary, Main Office, and Archive. It exists so related tables like Person.BusinessEntityAddress can classify each address with a standardized type instead of storing free-text labels. The live data currently in use appears to be a subset of the full lookup set, with only address type IDs 2, 3, and 5 actively referenced in related tables.',
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
    @value = N'Surrogate identifier for each address type record; serves as the primary key and is used by related tables to reference a specific address classification.',
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
    @value = N'Human-readable label for the address type, such as Billing or Shipping.',
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
    @value = N'Globally unique row identifier used for replication and system-level uniqueness tracking.',
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
    @value = N'Timestamp indicating when the address type record was last updated.',
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
    @value = N'Person.BusinessEntity stores the shared supertype identity record for all business-related entities in the system, including people, employees, vendors, stores, and other addressable entities. It provides the common surrogate key and audit metadata that subtype tables such as Person.Person, HumanResources.Employee, Purchasing.Vendor, and Sales.Store extend with their own domain-specific attributes. It also serves as the parent identity anchor for contact-detail tables, allowing a single business entity to have multiple related email addresses and other contact records.',
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
    @value = N'Surrogate identifier for the business entity record; used as the shared key that child tables reference.',
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
    @value = N'Globally unique row identifier used for replication or system-level uniqueness tracking.',
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
    @value = N'Timestamp indicating when the business entity row was last updated.',
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
    @value = N'Person.BusinessEntityAddress is a junction table that links business entities to postal addresses and classifies each link by address type (for example billing, shipping, or home). It exists to support multiple addresses per entity and multiple entities sharing the same address, while preserving the role of each address in the relationship.',
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
    @value = N'Identifies the business entity associated with the address link.',
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
    @value = N'Identifies the address being linked to the business entity.',
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
    @value = N'Indicates the role or usage type of the address for the entity, such as billing or shipping.',
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
    @value = N'Globally unique row identifier used for replication, synchronization, or stable row tracking.',
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
    @value = N'Timestamp of the last update to the relationship record.',
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
    @value = N'Person.BusinessEntityContact stores the relationship between a business entity and a person, classified by contact role. It acts as a bridge table that records which person is associated with which business entity and what type of contact that person is for that entity (for example, sales, purchasing, or other business contact roles).',
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
    @value = N'Identifies the business entity that the person is associated with in this contact relationship.',
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
    @value = N'Identifies the person involved in the contact relationship; this is the row''s primary identifier.',
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
    @value = N'Specifies the role or category of the contact relationship, such as the person''s function for the business entity.',
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
    @value = N'A globally unique row identifier used for replication, synchronization, or stable row tracking.',
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
    @value = N'The timestamp when the contact relationship row was last updated.',
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
    @value = N'Person.ContactType is a lookup table that defines the standardized categories used to classify how a person or business entity is related to an organization, such as sales roles, purchasing roles, marketing roles, and accounting roles. It exists to provide consistent contact-role labels that can be assigned through Person.BusinessEntityContact.',
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
    @value = N'Primary key identifier for each contact type category.',
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
    @value = N'Human-readable label for the contact type, such as a job role or relationship category.',
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
    @value = N'Timestamp indicating when the lookup row was last modified or seeded.',
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
    @value = N'dbo.CountryRegion stores the master list of countries and regions used throughout the database as a foundational geographic lookup table. It provides standardized country/region codes and names so other tables can reference consistent location values for sales and address-related data.',
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
    @value = N'Two-character country or region code that uniquely identifies each geographic entry and serves as the table''s primary key.',
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
    @value = N'The full display name of the country or region.',
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
    @value = N'The date the row was last modified or loaded into the database.',
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
    @value = N'This table stores email address records for people in the system, linking each email address to a specific person/business entity. It exists to support one-to-many email contact information for individuals while keeping email data separate from the core person record.',
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
    @value = N'Identifies the person/business entity that owns this email address record.',
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
    @value = N'Surrogate primary key for the email address record.',
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
    @value = N'The actual email address string associated with the person/business entity.',
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
    @value = N'Globally unique row identifier used for replication or synchronization.',
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
    @value = N'Timestamp indicating when the email address record was last updated.',
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
    @value = N'This table stores authentication credentials for people in the system, linking each Person.Person record to a password hash and salt used for login verification. It exists to separate sensitive security data from the core person profile while supporting user authentication for individuals who have application accounts.',
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
    @value = N'Identifier of the person whose authentication credentials are stored in this row; also serves as the table''s primary key.',
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
    @value = N'Hashed password value used to verify a user''s login credentials without storing the plaintext password.',
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
    @value = N'Random salt used when hashing the password to protect against precomputed hash attacks and ensure hash uniqueness.',
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
    @value = N'Globally unique row identifier used for replication, synchronization, or system-level uniqueness tracking.',
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
    @value = N'Timestamp indicating when the password record was last updated.',
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
    @value = N'Person.Person stores master person records for the Adventure Works database, representing individuals such as customers, employees, sales contacts, job candidates, vendors, and other people associated with the business. It serves as the canonical person-level hub for human entities across the model, anchoring related contact, demographic, security, recruiting, sales, and customer data, including individual customer records, role-based contact assignments, login credentials, and stored payment instruments. It also functions as the shared identity foundation for related person/employee extensions such as Sales.SalesPerson.',
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
    @value = N'Unique identifier for the person record; serves as the row''s primary key and links this person to related business entity-based tables.',
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
    @value = N'Code indicating what kind of person this record represents, such as individual, employee, sales contact, vendor contact, or store contact.',
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
    @value = N'Flag indicating whether the person''s name should be displayed in a special style or format.',
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
    @value = N'Honorific or salutation such as Mr., Ms., Mrs., Sr., or Sra.',
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
    @value = N'Person''s given name.',
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
    @value = N'Person''s middle name or middle initial, when available.',
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
    @value = N'Person''s family name or surname.',
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
    @value = N'Name suffix such as Jr., Sr., II, III, IV, or PhD.',
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
    @value = N'Preference or status code controlling email marketing promotion level for the person.',
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
    @value = N'XML payload containing extra contact methods, notes, and contact history for the person.',
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
    @value = N'XML payload containing survey and demographic attributes for the person, such as income, education, occupation, and household details.',
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
    @value = N'Globally unique row identifier used for replication or synchronization scenarios.',
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
    @value = N'Timestamp of the last update to the person record.',
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
    @value = N'Person.PersonPhone stores phone numbers associated with business entities that represent people, along with the type of each phone number. It exists to support a one-to-many style contact model where a person can have multiple phone numbers and each number is classified as home, work, cell, or another standardized type.',
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
    @value = N'Identifies the person/business entity that owns the phone number record.',
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
    @value = N'The actual phone number stored for the entity.',
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
    @value = N'Classifies the phone number by type, such as home, work, or cell.',
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
    @value = N'Timestamp indicating when the phone record was last updated.',
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
    @value = N'A lookup table that defines the allowed phone number types used by people in the system, such as Home, Cell, and Work. It exists to standardize phone type classification and support consistent references from person phone records.',
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
    @value = N'Surrogate identifier for each phone number type. It uniquely identifies the lookup value used by related phone records.',
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
    @value = N'Human-readable label for the phone type, such as Home, Cell, or Work.',
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
    @value = N'Timestamp indicating when the lookup row was last modified.',
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
    @value = N'Person.StateProvince stores the master list of states, provinces, and similar subnational regions used for addresses, tax rates, and sales territory mapping. It provides standardized geographic codes and names, links each region to a country/region, and assigns the region to a sales territory for reporting and operational classification.',
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
    @value = N'Surrogate primary key for each state/province record.',
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
    @value = N'Short standardized code for the state/province, such as a postal abbreviation or local administrative code.',
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
    @value = N'Code of the country or region that contains this state/province.',
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
    @value = N'Indicates whether this record represents the only state/province-level subdivision for its country/region.',
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
    @value = N'Human-readable name of the state, province, department, or equivalent administrative region.',
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
    @value = N'Sales territory assignment for this geographic region.',
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
    @value = N'Globally unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp indicating when the row was last modified.',
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
    @value = N'Production.BillOfMaterials stores the bill of materials for manufactured products, defining which component products are required to assemble a parent product, in what quantity, and during what effective date range. It supports product structure, versioning, and manufacturing planning in the Adventure Works production process.',
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
    @value = N'Surrogate primary key for each bill of materials record.',
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
    @value = N'The parent product being assembled.',
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
    @value = N'The component product required in the assembly.',
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
    @value = N'The date this bill of materials relationship becomes effective.',
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
    @value = N'The date this bill of materials relationship stops being effective, if applicable.',
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
    @value = N'The unit of measure used for the component quantity.',
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
    @value = N'The level of the component within the assembly hierarchy.',
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
    @value = N'The quantity of the component required per one assembly unit.',
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
    @value = N'The last date the BOM record was updated.',
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
    @value = N'Production.Culture is a small lookup table that stores the set of supported language/culture codes and their human-readable names. It exists to standardize localization values used elsewhere in the database, especially for linking product descriptions to a specific language/culture in Production.ProductModelProductDescriptionCulture.',
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
    @value = N'The culture/language code used as the unique identifier for each supported culture entry.',
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
    @value = N'The human-readable name of the culture or language.',
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
    @value = N'The date the culture record was last modified or seeded into the database.',
    @level0type = N'SCHEMA',
    @level0name = N'Production',
    @level1type = N'TABLE',
    @level1name = N'Culture',
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
    @value = N'Production.Illustration stores reusable illustration assets used to visually document products, likely as vector artwork or diagrams. It exists so product models can be linked to one or more technical drawings/images without duplicating the artwork across products.',
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
    @value = N'Unique identifier for each illustration asset in Production.Illustration.',
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
    @value = N'XML/XAML representation of the illustration artwork itself, storing the vector drawing or diagram content.',
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
    @value = N'Timestamp indicating when the illustration record was last updated.',
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
    @value = N'Production.Location stores the manufacturing locations or work centers used in the production process, along with their standard cost rate and available capacity. It acts as a lookup/reference table for where inventory is stored or where work is performed, and is used by production and inventory routing tables to track operations and stock by location.',
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
    @value = N'Primary identifier for each production location or work center.',
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
    @value = N'Human-readable name of the location, such as a shop area, storage area, or production station.',
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
    @value = N'Standard cost associated with using the location, likely a per-hour or per-unit operating cost.',
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
    @value = N'Available capacity for the location, likely measured in hours, units, or another production-capacity metric.',
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
    @value = N'Timestamp indicating when the location record was last updated.',
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
    @value = N'Production.Product stores the master catalog of sellable and manufacturable products in the Adventure Works database, including bikes, components, clothing, and accessories. It acts as the central product entity that other production, purchasing, and sales tables reference for inventory, pricing, bills of materials, work orders, reviews, and order lines.',
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
    @value = N'Surrogate primary key for each product record.',
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
    @value = N'Human-readable product name used in catalog, reporting, and user interfaces.',
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
    @value = N'Business-facing product code or SKU-like identifier.',
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
    @value = N'Indicates whether the product is manufactured in-house.',
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
    @value = N'Indicates whether the item is a sellable finished good.',
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
    @value = N'Optional product color attribute.',
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
    @value = N'Minimum inventory threshold used to avoid stockouts.',
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
    @value = N'Inventory level at which replenishment should be triggered.',
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
    @value = N'Standard manufacturing or acquisition cost of the product.',
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
    @value = N'Catalog selling price for the product.',
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
    @value = N'Optional size or dimension value for the product.',
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
    @value = N'Unit of measure for the Size value.',
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
    @value = N'Unit of measure for the Weight value.',
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
    @value = N'Optional product weight used for shipping, manufacturing, or material planning.',
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
    @value = N'Estimated number of days required to manufacture the product.',
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
    @value = N'High-level product line classification.',
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
    @value = N'Product class or quality tier.',
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
    @value = N'Product style or gender/style classification.',
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
    @value = N'Foreign key to the product subcategory classification.',
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
    @value = N'Foreign key to the product model definition.',
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
    @value = N'Date the product became available for sale.',
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
    @value = N'Date the product stopped being sold, if discontinued.',
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
    @value = N'Date the product was discontinued.',
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
    @value = N'Globally unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp of the last update to the product record.',
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
    @value = N'Production.ProductCategory stores the top-level product categories used to classify products in the manufacturing/catalog hierarchy. It exists as a lookup table so subcategories and products can be organized under broad groups such as Bikes, Components, Clothing, and Accessories.',
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
    @value = N'Surrogate identifier for each product category; uniquely identifies the category record and is used by child tables such as Production.ProductSubcategory.',
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
    @value = N'Human-readable category name used to label the top-level product grouping, such as Bikes or Accessories.',
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
    @value = N'Globally unique row identifier used for replication/integration and to uniquely track the row across systems.',
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
    @value = N'Timestamp indicating when the category row was last updated.',
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
    @value = N'This table stores product standard cost history by effective date, linking each product in Production.Product to the standard cost that applies during a specific time period. It exists to preserve historical cost changes for manufacturing and reporting, and to support downstream sales and order-detail calculations that need the correct cost at a given date.',
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
    @value = N'Identifies the product whose standard cost is being tracked. It links each history row to a specific item in Production.Product.',
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
    @value = N'The date on which this standard cost version becomes effective.',
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
    @value = N'The date on which this standard cost version stops being effective. Null likely indicates the current or open-ended record.',
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
    @value = N'The standard manufacturing cost for the product during the effective period defined by StartDate and EndDate.',
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
    @value = N'The date the row was last updated in the database.',
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
    @value = N'Production.ProductDescription stores multilingual marketing and technical descriptions for products. It exists to hold reusable description text that can be linked to product models through the bridge table Production.ProductModelProductDescriptionCulture, allowing the same product model to have descriptions in different cultures/languages.',
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
    @value = N'Surrogate identifier for each product description record.',
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
    @value = N'The actual descriptive text for a product, used for marketing or catalog presentation in one or more languages.',
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
    @value = N'Globally unique row identifier used for replication or synchronization purposes.',
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
    @value = N'Timestamp indicating when the description record was last changed.',
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
    @value = N'A junction table that links products to the technical documents that describe or support them. It exists to record which Production.Product items are associated with which Production.Document records, likely for product specifications, drawings, manuals, or other supporting documentation.',
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
    @value = N'Identifies the product associated with a document. This is the product side of the product-document relationship and links each row to a specific Production.Product record.',
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
    @value = N'Identifies the document associated with a product, using the hierarchical key from Production.Document. This links the row to a specific document record in the document tree.',
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
    @value = N'The date and time when the product-document association was last modified.',
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
    @value = N'This table stores current inventory quantities for specific products at specific production locations, including the shelf and bin where each product is stored. It exists to support warehouse and manufacturing inventory tracking by showing how much of each product is on hand at each location.',
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
    @value = N'Identifies the product whose inventory is being tracked at a location.',
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
    @value = N'Identifies the production or warehouse location where the product is stored.',
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
    @value = N'Shelf or aisle code indicating the storage shelf position within the location.',
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
    @value = N'Numeric bin or compartment identifier within the shelf/location.',
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
    @value = N'The number of units of the product currently on hand at the specified location.',
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
    @value = N'Globally unique row identifier used for replication or synchronization.',
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
    @value = N'Timestamp indicating when the inventory record was last updated.',
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
    @value = N'This table stores historical product list price records for products in Production.Product, capturing when a given list price became effective and when it ended. It exists to preserve price history over time so sales, reporting, and auditing processes can determine the correct list price for a product at a specific date.',
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
    @value = N'Identifies the product whose list price history is being recorded.',
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
    @value = N'The date on which this list price became effective.',
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
    @value = N'The date on which this list price stopped being effective, if the price was superseded.',
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
    @value = N'The product''s list price during the effective period defined by StartDate and EndDate.',
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
    @value = N'The timestamp when the history row was last updated.',
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
    @value = N'Production.ProductModel stores the master definitions for product models in the Adventure Works catalog, including the model name, rich XML catalog description, manufacturing instructions, and metadata used to relate each model to products, illustrations, and localized descriptions. It serves as the parent template for product variants, where multiple Product rows can share the same ProductModelID while differing by attributes such as size or color. It also supports a many-to-many relationship with illustrations and can be associated with multiple localized product descriptions for multilingual catalog content.',
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
    @value = N'Unique identifier for each product model.',
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
    @value = N'Human-readable product model name used in the catalog and related descriptions.',
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
    @value = N'XML catalog content describing the product model''s marketing summary, manufacturer info, features, and specifications.',
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
    @value = N'XML manufacturing and assembly instructions for the product model.',
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
    @value = N'Globally unique row identifier used for replication or synchronization purposes.',
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
    @value = N'Timestamp indicating when the product model record was last updated.',
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
    @value = N'A junction table that links Production.ProductModel records to Production.Illustration records, indicating which technical illustrations are associated with each product model. It exists to support a many-to-many relationship between product models and reusable illustration assets.',
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
    @value = N'Identifies the product model being linked to an illustration.',
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
    @value = N'Identifies the illustration associated with the product model.',
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
    @value = N'Timestamp indicating when the association row was last modified.',
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
    @value = N'A bridge table that links product models to localized product descriptions by culture. It exists to assign the correct marketing/technical description text to each product model in each supported language.',
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
    @value = N'Identifies the product model that this localized description applies to.',
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
    @value = N'Identifies the reusable description text linked to the product model.',
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
    @value = N'Specifies the language/culture for the description text.',
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
    @value = N'Audit timestamp indicating when the row was last modified.',
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
    @value = N'Production.ProductProductPhoto is a junction table that links products to product photos and marks which photo is the primary image for a given product. It exists to support a many-to-many relationship between Production.Product and Production.ProductPhoto, while also storing the primary-photo flag used for catalog display or merchandising.',
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
    @value = N'Identifies the product being associated with a photo.',
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
    @value = N'Identifies the photo linked to the product.',
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
    @value = N'Indicates whether this photo is the primary image for the product.',
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
    @value = N'Records when the product-photo association was last modified.',
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
    @value = N'Production.ProductReview stores customer-written reviews for products in the Adventure Works catalog, including who wrote the review, when it was written, the rating given, contact email, and the review text. It exists to capture post-purchase product feedback and support product quality analysis and merchandising decisions.',
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
    @value = N'Unique identifier for each product review record.',
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
    @value = N'Identifies the product being reviewed.',
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
    @value = N'Name of the person who wrote the review.',
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
    @value = N'Date and time the review was submitted.',
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
    @value = N'Email contact for the reviewer.',
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
    @value = N'Numeric score assigned by the reviewer, likely on a star scale.',
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
    @value = N'Free-text review content describing the reviewer''s opinion and experience with the product.',
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
    @value = N'Timestamp indicating when the review row was last updated.',
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
    @value = N'Production.ProductSubcategory stores the lookup values for product subcategories within the product catalog hierarchy. It exists to classify individual products under broader product categories such as Bikes, Components, Clothing, and Accessories, enabling consistent product organization, filtering, and reporting.',
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
    @value = N'Primary identifier for each product subcategory.',
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
    @value = N'Identifies the parent product category that this subcategory belongs to.',
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
    @value = N'Human-readable name of the product subcategory.',
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
    @value = N'Globally unique row identifier used for replication or system-level identity tracking.',
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
    @value = N'Timestamp indicating when the subcategory record was last modified.',
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
    @value = N'Production.ScrapReason stores the standardized list of reasons why manufactured items are scrapped during production. It serves as a lookup table for classifying scrap events consistently on work orders, supporting reporting, quality analysis, and manufacturing process improvement. Scrap reasons are used selectively and are optional on work orders, indicating that scrap is an exception condition rather than a required outcome for every production run.',
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
    @value = N'Primary identifier for each scrap reason code.',
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
    @value = N'Human-readable description of the scrap reason.',
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
    @value = N'Date the scrap reason record was last modified or seeded into the database.',
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
    @value = N'This table stores product transaction history records for inventory movements and cost tracking in the Adventure Works manufacturing/sales system. Each row represents a dated transaction for a specific product, capturing the transaction type, quantity moved, the related source order or work order reference, and the actual cost associated with that movement.',
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
    @value = N'Unique identifier for each transaction record in the ledger.',
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
    @value = N'Identifies the product affected by the transaction.',
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
    @value = N'Identifier of the source document or order that generated the transaction.',
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
    @value = N'Line number or line identifier within the referenced source order.',
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
    @value = N'Date the product transaction occurred.',
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
    @value = N'Code indicating the business process that created the transaction, such as sales, work order, or purchase.',
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
    @value = N'Number of units affected by the transaction.',
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
    @value = N'Actual cost recorded for the transaction.',
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
    @value = N'Timestamp when the transaction row was last updated.',
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
    @value = N'Production.TransactionHistory stores the inventory transaction ledger for products, capturing each stock movement or cost-affecting event tied to a product and, when applicable, the originating work order. It exists to support manufacturing and inventory costing by recording quantities, transaction types, dates, and actual costs for product-related transactions.',
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
    @value = N'Unique identifier for each transaction history record.',
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
    @value = N'Identifies the product affected by the transaction.',
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
    @value = N'Identifier of the originating order or work order associated with the transaction.',
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
    @value = N'Line-level reference within the originating order or work order.',
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
    @value = N'Date and time when the transaction occurred.',
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
    @value = N'Code indicating the type of inventory transaction.',
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
    @value = N'Number of units affected by the transaction.',
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
    @value = N'Actual cost associated with the transaction.',
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
    @value = N'Date and time the transaction record was last updated.',
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
    @value = N'Production.UnitMeasure stores the standardized unit-of-measure codes used across manufacturing, inventory, and purchasing to describe quantities, component usage, and vendor packaging. It functions as a shared lookup table for measurement and packaging units such as EA, OZ, IN, CTN, and PAK, allowing other tables to consistently reference how items are measured or supplied.',
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
    @value = N'Short code that uniquely identifies a unit of measure, such as KG, OZ, EA, or L. It serves as the primary key and compact reference value used by related tables.',
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
    @value = N'The descriptive name of the unit of measure, such as Kilogram, Ounces, Each, or Gallon. This provides a readable label for the code.',
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
    @value = N'Timestamp indicating when the unit measure record was last updated.',
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
    @value = N'Production.WorkOrder stores manufacturing work orders for products, including the planned quantity, actual stocked quantity, scrap quantity, schedule dates, and optional scrap reason. It exists to track the lifecycle and outcome of production jobs for individual products in the manufacturing process.',
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
    @value = N'Unique identifier for each work order record.',
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
    @value = N'Identifier of the product being manufactured on this work order.',
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
    @value = N'Planned quantity to produce for the work order.',
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
    @value = N'Quantity successfully completed and moved into stock.',
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
    @value = N'Quantity lost to scrap during the work order.',
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
    @value = N'Date the work order began.',
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
    @value = N'Date the work order finished or was closed.',
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
    @value = N'Target completion date for the work order.',
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
    @value = N'Optional reason code explaining why units were scrapped.',
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
    @value = N'Timestamp of the last update to the work order record.',
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
    @value = N'Production.WorkOrderRouting stores the routing steps for each manufacturing work order, tracking which product operation is performed at which production location, when it is scheduled and actually executed, and the planned versus actual labor/cost outcomes for that routing step.',
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
    @value = N'Identifies the manufacturing work order this routing step belongs to.',
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
    @value = N'Identifies the product being manufactured for this routing step.',
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
    @value = N'The sequence number of the operation within the work order routing.',
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
    @value = N'The production location or work center where the operation is performed.',
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
    @value = N'The planned date when the routing operation is scheduled to begin.',
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
    @value = N'The planned date when the routing operation is scheduled to finish.',
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
    @value = N'The actual date when work on the routing operation began.',
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
    @value = N'The actual date when work on the routing operation finished.',
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
    @value = N'The actual labor or machine hours consumed by the routing operation.',
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
    @value = N'The expected cost for performing the routing operation.',
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
    @value = N'The realized cost incurred for performing the routing operation.',
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
    @value = N'The last date and time this routing record was updated.',
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
    @value = N'This table stores vendor-specific purchasing terms for individual products, linking each product to a supplier with negotiated lead times, pricing, order quantity limits, and unit-of-measure information. It exists to support procurement planning and purchase order generation by defining how a given vendor supplies a given product.',
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
    @value = N'Identifies the product being sourced from a vendor.',
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
    @value = N'Identifies the vendor supplying the product.',
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
    @value = N'Typical number of days the vendor needs to deliver the product after ordering.',
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
    @value = N'Standard negotiated purchase price for the product from this vendor.',
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
    @value = N'Unit cost recorded on the most recent receipt from this vendor for this product.',
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
    @value = N'Date when the product was last received from the vendor.',
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
    @value = N'Minimum quantity that can be ordered from this vendor for the product.',
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
    @value = N'Maximum quantity that can be ordered from this vendor for the product.',
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
    @value = N'Quantity of the product currently on order from this vendor.',
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
    @value = N'Unit of measure used when ordering or packaging the product from the vendor.',
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
    @value = N'Timestamp of the last update to this vendor-product purchasing record.',
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
    @value = N'Purchasing.PurchaseOrderDetail stores the line-item details for each purchase order, including which product was ordered, the quantity and unit price, expected due date, and receiving/inspection outcomes. It exists to support procurement execution, tracking each ordered product from order placement through receipt, rejection, and stocking.',
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
    @value = N'Identifies the purchase order header that this line item belongs to.',
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
    @value = N'Unique identifier for each purchase order line item.',
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
    @value = N'The expected date by which the ordered product should be received.',
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
    @value = N'The quantity of product ordered on this purchase order line.',
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
    @value = N'The product being purchased on this line item.',
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
    @value = N'The agreed purchase price per unit for the product on this line.',
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
    @value = N'The total monetary amount for the line item, typically derived from quantity and unit price.',
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
    @value = N'The quantity actually received from the supplier for this line item.',
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
    @value = N'The quantity received but rejected during inspection or quality control.',
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
    @value = N'The quantity accepted and moved into inventory stock.',
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
    @value = N'Timestamp of the last update to the purchase order detail record.',
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
    @value = N'Purchasing.PurchaseOrderHeader stores the header-level records for purchase orders placed with vendors. It represents each purchase order as a business document, capturing who created it, which supplier and shipping method were used, when it was ordered and shipped, and the financial totals for the order.',
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
    @value = N'Unique identifier for each purchase order header record.',
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
    @value = N'Tracks the revision/version of the purchase order document.',
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
    @value = N'Indicates the current workflow state of the purchase order.',
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
    @value = N'References the employee responsible for creating, approving, or managing the purchase order.',
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
    @value = N'References the supplier/vendor from whom the goods or services are being purchased.',
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
    @value = N'References the shipping method used for the purchase order.',
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
    @value = N'Date the purchase order was placed.',
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
    @value = N'Date the purchase order was shipped or fulfilled.',
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
    @value = N'Pre-tax, pre-freight monetary total for the purchase order.',
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
    @value = N'Tax amount applied to the purchase order.',
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
    @value = N'Shipping or freight charge for the purchase order.',
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
    @value = N'Final amount due for the purchase order, including subtotal, tax, and freight.',
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
    @value = N'Timestamp of the last update to the purchase order record.',
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
    @value = N'Purchasing.ShipMethod stores the available shipping methods used for purchase orders and sales orders, including each method''s name and pricing parameters. It acts as a lookup/reference table so order headers can record which shipping option was chosen and calculate shipping charges.',
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
    @value = N'Primary identifier for each shipping method.',
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
    @value = N'The display name or code for the shipping method.',
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
    @value = N'Base shipping charge applied for this method.',
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
    @value = N'Additional shipping rate used in cost calculation.',
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
    @value = N'Globally unique row identifier used for replication or synchronization.',
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
    @value = N'Timestamp of the last modification to the shipping method record.',
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
    @value = N'This table stores vendor master records for suppliers that the purchasing system can buy from. It captures each vendor''s business identity, account code, display name, credit rating, preferred/active status, and optional purchasing website, allowing purchasing documents and product sourcing rules to reference a consistent supplier record.',
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
    @value = N'Primary identifier for the vendor record; also links the vendor to its shared business entity identity in Person.BusinessEntity.',
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
    @value = N'Vendor account code used internally to identify the supplier in purchasing processes and reports.',
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
    @value = N'The vendor''s display name or legal/doing-business-as name.',
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
    @value = N'Numeric rating used to classify the vendor''s creditworthiness or purchasing risk.',
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
    @value = N'Indicates whether this supplier is marked as a preferred vendor for purchasing decisions.',
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
    @value = N'Indicates whether the vendor is currently active and available for use in purchasing.',
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
    @value = N'Optional URL for the vendor''s purchasing or ordering web service endpoint.',
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
    @value = N'Timestamp of the last update to the vendor record.',
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
    @value = N'Sales.CountryRegionCurrency is a bridge/lookup table that maps each country or region to its associated currency. It exists to standardize regional currency assignments so sales and geography-related processes can consistently determine which currency is used in a given country/region.',
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
    @value = N'The country or region code for the geographic entity being mapped to a currency.',
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
    @value = N'The currency code associated with the country or region.',
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
    @value = N'The timestamp when the country-region to currency mapping row was last modified.',
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
    @value = N'Sales.CreditCard stores credit card payment instrument details used by customers for sales transactions, including the card type, masked/encoded card number, expiration month and year, and audit metadata. It exists so sales orders and person-to-card associations can reference a reusable credit card record rather than duplicating payment details across transactions.',
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
    @value = N'Surrogate identifier for each credit card record.',
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
    @value = N'The type or brand/category of the credit card.',
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
    @value = N'The stored credit card number or tokenized card identifier.',
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
    @value = N'Expiration month of the credit card.',
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
    @value = N'Expiration year of the credit card.',
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
    @value = N'Timestamp indicating when the credit card record was last modified.',
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
    @value = N'This table stores the master list of supported currencies and their ISO-style currency codes for the sales schema. It serves as a lookup/reference table used to assign currencies to countries and regions through Sales.CountryRegionCurrency, and it also acts as the base currency list referenced by Sales.CurrencyRate for historical exchange-rate records between currencies.',
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
    @value = N'The unique 3-character currency code used to identify each currency record.',
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
    @value = N'The display name of the currency, such as ''US Dollar'' or ''Polish Zloty''.',
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
    @value = N'The date the currency reference row was last modified or loaded into the database.',
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
    @value = N'Sales.CurrencyRate stores daily exchange-rate quotes used to convert sales amounts from a base currency (USD) into other currencies. It exists to support order pricing, reporting, and currency conversion for sales transactions across multiple currencies.',
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
    @value = N'Surrogate primary key for each currency-rate record.',
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
    @value = N'The date on which the exchange rate applies or was recorded.',
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
    @value = N'The source currency for the exchange rate, used as the base currency in the conversion.',
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
    @value = N'The target currency being quoted against the base currency.',
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
    @value = N'The average exchange rate for the date, likely used for reporting or average conversion calculations.',
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
    @value = N'The exchange rate at the end of the day, likely used for closing valuation or transactional conversion.',
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
    @value = N'Timestamp indicating when the row was last inserted or updated.',
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
    @value = N'Sales.Customer stores customer account records for Adventure Works, linking each customer to either an individual person or a retail store and assigning the customer to a sales territory. It exists as the central customer master table used by sales orders and customer-related reporting.',
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
    @value = N'Surrogate primary key for each customer record.',
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
    @value = N'Optional link to the individual person who is the customer.',
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
    @value = N'Optional link to the retail store account that is the customer.',
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
    @value = N'Sales territory assigned to the customer for regional sales management and reporting.',
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
    @value = N'Business account code used to identify the customer in a human-readable format.',
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
    @value = N'Globally unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp indicating when the customer record was last modified.',
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
    @value = N'A junction table that links people to the credit cards they have on file, storing the association between a person record and a reusable credit card record. It exists so sales and customer-related processes can reference which credit card belongs to which person without duplicating card details.',
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
    @value = N'Identifies the person associated with the credit card.',
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
    @value = N'Identifies the credit card linked to the person.',
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
    @value = N'Audit timestamp showing when the association row was last updated.',
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
    @value = N'Sales.SalesOrderDetail stores the individual line items for each sales order, capturing which product was sold, in what quantity, at what unit price and discount, and the resulting line total. It exists to support order fulfillment, invoicing, revenue reporting, and historical pricing/discount analysis at the item level.',
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
    @value = N'Identifies the sales order header that this line item belongs to.',
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
    @value = N'Unique identifier for each sales order line item.',
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
    @value = N'Optional shipping carrier tracking number associated with the line item or shipment fulfillment.',
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
    @value = N'Quantity of the product ordered on this line item.',
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
    @value = N'Identifies the product sold on this order line.',
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
    @value = N'Identifies the special offer or promotion applied to this line item.',
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
    @value = N'Per-unit selling price recorded for the product on this order line.',
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
    @value = N'Discount amount or discount rate applied per unit on this line item.',
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
    @value = N'Extended total for the line item after quantity and discount are applied.',
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
    @value = N'Globally unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp indicating when the row was last modified.',
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
    @value = N'Sales.SalesOrderHeader stores one row per sales order header in the Adventure Works sales system. It captures the order''s lifecycle dates, customer and territory assignment, shipping and billing addresses, payment and currency information, and order-level financial totals used to manage and report on completed sales transactions.',
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
    @value = N'Unique identifier for each sales order header record.',
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
    @value = N'Revision/version number for the order header, used to track changes to the order record.',
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
    @value = N'Date the sales order was created.',
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
    @value = N'Date the order is expected to be fulfilled or paid by.',
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
    @value = N'Date the order was shipped.',
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
    @value = N'Order status code indicating the current processing state of the sales order.',
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
    @value = N'Indicates whether the order was placed online.',
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
    @value = N'Human-readable business order number for the sales order.',
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
    @value = N'Customer-provided purchase order number associated with the sales order, when applicable.',
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
    @value = N'Customer account number used for the order.',
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
    @value = N'Identifier of the customer who placed the order.',
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
    @value = N'Identifier of the salesperson responsible for the order, when assigned.',
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
    @value = N'Sales territory associated with the order.',
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
    @value = N'Address used for billing the order.',
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
    @value = N'Address where the order should be shipped.',
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
    @value = N'Shipping method selected for the order.',
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
    @value = N'Credit card used to pay for the order, if payment was made by card.',
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
    @value = N'Authorization or approval code returned by the payment processor for the credit card transaction.',
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
    @value = N'Exchange-rate record used when the order was placed in a non-base currency.',
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
    @value = N'Order subtotal before tax and freight.',
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
    @value = N'Tax amount charged on the order.',
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
    @value = N'Shipping/freight charge for the order.',
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
    @value = N'Final amount due for the order, including subtotal, tax, and freight.',
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
    @value = N'Optional free-text comment or note about the order.',
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
    @value = N'Globally unique row identifier used for replication or synchronization.',
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
    @value = N'Timestamp of the last modification to the order header record.',
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
    @value = N'This table is a junction/bridge table that links sales orders in Sales.SalesOrderHeader to the reasons recorded in Sales.SalesReason. It exists to support a many-to-many relationship, allowing a single sales order to have multiple reasons and a single reason to apply to many orders.',
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
    @value = N'Identifies the sales order that this reason is associated with.',
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
    @value = N'Identifies the standardized reason for the sales order.',
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
    @value = N'Timestamp indicating when the order-reason association row was last modified.',
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
    @value = N'Sales.SalesPerson stores salesperson-specific compensation, quota, performance, and territory assignment data for employees who sell products. It exists to track how each salesperson is paid and measured, and to support sales reporting, commission calculations, and territory-based management.',
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
    @value = N'Identifier for the salesperson record, inherited from the underlying person/employee entity and used as the row''s primary key.',
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
    @value = N'Sales territory assigned to the salesperson for regional responsibility and reporting.',
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
    @value = N'Target sales amount assigned to the salesperson for a period.',
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
    @value = N'Fixed bonus amount paid to the salesperson.',
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
    @value = N'Commission rate used to calculate variable pay from sales.',
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
    @value = N'Year-to-date sales amount attributed to the salesperson.',
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
    @value = N'Sales amount attributed to the salesperson for the previous year.',
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
    @value = N'Globally unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp of the last update to the salesperson record.',
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
    @value = N'This table stores historical sales quota assignments for employees, recording the quota amount each salesperson or sales employee was expected to achieve at specific quarter-end dates. It exists to track quota targets over time for performance management and sales planning.',
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
    @value = N'Identifies the employee whose sales quota is being recorded.',
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
    @value = N'The date the quota record applies to, likely the end of a fiscal quarter or quota period.',
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
    @value = N'The monetary sales target assigned to the employee for the quota period.',
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
    @value = N'A globally unique row identifier used for replication and row-level identity.',
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
    @value = N'Timestamp indicating when the quota record was last updated.',
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
    @value = N'Sales.SalesReason stores the standardized reasons why customers placed sales orders, such as promotions, marketing campaigns, pricing, product quality, or other influences. It exists as a lookup table so sales orders can be linked to one or more consistent reason categories through Sales.SalesOrderHeaderSalesReason.',
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
    @value = N'Unique identifier for each sales reason.',
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
    @value = N'The specific sales reason label shown to users or used in reporting, such as promotion, price, quality, or advertisement.',
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
    @value = N'Broad category grouping for the sales reason, such as Marketing, Promotion, or Other.',
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
    @value = N'Timestamp indicating when the sales reason record was last modified.',
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
    @value = N'Sales.SalesTaxRate stores tax rate definitions applied to specific states or provinces, including the tax type, percentage rate, and a descriptive name. It exists to support sales tax calculation and jurisdiction-specific tax configuration in the sales domain.',
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
    @value = N'Surrogate primary key for each sales tax rate record.',
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
    @value = N'References the state or province to which this tax rate applies.',
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
    @value = N'Categorizes the kind of tax rate being stored, such as a state sales tax, output tax, or taxable supply tax.',
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
    @value = N'The tax percentage or rate applied for the jurisdiction and tax type.',
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
    @value = N'Human-readable label for the tax rate definition.',
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
    @value = N'Globally unique identifier used for replication and row-level uniqueness.',
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
    @value = N'Timestamp indicating when the tax rate row was last modified.',
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
    @value = N'Sales.SalesTerritory stores the geographic sales territories used to classify customers, salespeople, and sales activity by region. It functions as both a foundational lookup/dimension table for reporting and a real operational assignment entity for sales management and regional planning, with territory names, country/region codes, regional grouping, and year-to-date sales performance metrics. The table is referenced throughout the sales and geography model and is actively used to assign both customers and individual salespeople to a small, fixed set of managed geographic regions, indicating that territories are business-managed entities rather than just static reporting categories.',
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
    @value = N'Human-readable territory name, such as a region or country-based sales area.',
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
    @value = N'Two-letter country/region code associated with the territory.',
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
    @value = N'Higher-level geographic grouping used for reporting and territory classification.',
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
    @value = N'Sales generated by the territory year-to-date.',
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
    @value = N'Sales generated by the territory in the previous year.',
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
    @value = N'Year-to-date cost associated with the territory.',
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
    @value = N'Cost associated with the territory in the previous year.',
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
    @value = N'Globally unique row identifier used for replication or synchronization.',
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
    @value = N'Timestamp indicating when the territory row was last modified.',
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
    @value = N'A bridge/history table that records which Sales.SalesPerson is assigned to which Sales.SalesTerritory over time, including the start and end dates of each assignment and a row-level GUID for replication/tracking. It exists to support territory assignment history and time-based sales reporting.',
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
    @value = N'Identifies the salesperson whose territory assignment is being recorded.',
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
    @value = N'Identifies the sales territory assigned to the salesperson.',
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
    @value = N'The date the salesperson-territory assignment became effective.',
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
    @value = N'The date the salesperson-territory assignment ended, or null if the assignment is current.',
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
    @value = N'A globally unique row identifier used for replication, synchronization, or stable row tracking.',
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
    @value = N'The timestamp when the assignment record was last modified.',
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
    @value = N'Sales.ShoppingCartItem stores the line items currently placed in a shopping cart, linking a cart identifier to specific products and quantities. It exists to support the e-commerce/cart workflow by tracking which products a shopper intends to purchase before checkout, along with creation and modification timestamps.',
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
    @value = N'Surrogate primary key for each shopping cart line item row.',
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
    @value = N'Identifier for the shopping cart that this item belongs to.',
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
    @value = N'Number of units of the product currently in the cart item.',
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
    @value = N'Reference to the product being added to the cart.',
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
    @value = N'Timestamp when the cart item was first created.',
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
    @value = N'Timestamp when the cart item was last updated.',
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
    @value = N'Sales.SpecialOfferProduct is a bridge table that assigns promotional offers to specific products. It exists to model which products participate in which special offers, enabling the sales system to apply discounts and promotions to eligible items during order pricing.',
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
    @value = N'Identifier of the special offer applied in this row; also the table''s primary key in the provided data and a foreign key to Sales.SpecialOffer.SpecialOfferID.',
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
    @value = N'Human-readable name or label for the special offer, such as a promotion or discount campaign.',
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
    @value = N'Discount percentage applied by the offer.',
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
    @value = N'Classification of the offer, such as volume discount, seasonal discount, excess inventory, new product, discontinued product, or no discount.',
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
    @value = N'Audience or applicability category for the offer, such as reseller, customer, or no discount.',
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
    @value = N'Date when the offer becomes active.',
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
    @value = N'Date when the offer expires or stops being valid.',
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
    @value = N'Minimum quantity required for the offer to apply.',
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
    @value = N'Maximum quantity allowed for the offer tier, when applicable.',
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
    @value = N'Globally unique row identifier used for replication or synchronization.',
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
    @value = N'Timestamp of the last modification to the row.',
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
    @value = N'Sales.SpecialOfferProduct is a bridge table that maps products to the special offers or promotions they participate in. It exists to support many-to-many promotion assignment so the sales system can determine which Production.Product items are eligible for a given Sales.SpecialOffer when pricing orders and applying discounts.',
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
    @value = N'Identifies the special offer or promotion applied to the product. This links each row to a specific Sales.SpecialOffer record and is part of the table''s composite business key.',
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
    @value = N'Identifies the product participating in the special offer. This links the row to a specific Production.Product record and is the other half of the junction relationship.',
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
    @value = N'A globally unique row identifier used by the Adventure Works schema for replication, synchronization, or stable row identity.',
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
    @value = N'The date and time the row was last changed.',
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
    @value = N'Sales.Store stores retail store accounts that Adventure Works sells to, including the store''s business identity, assigned salesperson, and a demographics survey used for customer profiling and sales analysis.',
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
    @value = N'Unique identifier for the store''s business entity record; this is the store''s surrogate key and inherited identity in the shared entity model.',
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
    @value = N'The store''s business name as used in sales and customer records.',
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
    @value = N'Identifier of the salesperson responsible for managing this store account.',
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
    @value = N'XML payload containing survey-based store profile attributes such as sales volume, revenue, banking relationship, business type, specialty, size, internet connectivity, and employee count.',
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
    @value = N'Globally unique row identifier used for replication and synchronization.',
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
    @value = N'Timestamp indicating when the store record was last modified.',
    @level0type = N'SCHEMA',
    @level0name = N'Sales',
    @level1type = N'TABLE',
    @level1name = N'Store',
    @level2type = N'COLUMN',
    @level2name = N'ModifiedDate';
GO
