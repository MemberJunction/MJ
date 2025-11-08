-- Database Documentation Script
-- Generated: 2025-11-08T20:40:13.039Z
-- Database: AssociationDB
-- Server: localhost

-- This script adds MS_Description extended properties to database objects


-- Schema: AssociationDemo

IF EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE major_id = SCHEMA_ID('AssociationDemo')
    AND name = 'MS_Description'
    AND minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Add a foreign key EventSessionID to EventRegistration (or create a linking table) to capture session‑level registrations.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo';
GO

-- Table: AssociationDemo.BoardMember
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the assignment of members to specific board positions, including term dates, election date and active status, effectively representing a board membership roster for an association.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the board‑member assignment record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'BoardPositionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'BoardPositionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the specific board role (e.g., President, Treasurer) the member occupies',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'BoardPositionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the member who holds the board position',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member’s term in the board position begins',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member’s term ends; null when the term is ongoing',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the board assignment is currently active',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardMember'
    AND c.name = 'ElectionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardMember',
        @level2type = N'COLUMN',
        @level2name = N'ElectionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member was elected to the board position, may differ from start date',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'ElectionDate';
GO

-- Table: AssociationDemo.BoardPosition
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the predefined board positions for an organization, including title, display order, term length, officer status and active flag. Used as a lookup for assigning members to board roles.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID uniquely identifying each board position record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'PositionTitle'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'PositionTitle';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the board position (e.g., President, Treasurer, Director at Large #3).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'PositionTitle';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'PositionOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'PositionOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric order used for sorting or hierarchy of positions, with 1 being highest priority.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'PositionOrder';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑text description of the position; currently unused (all NULL).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'TermLengthYears'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'TermLengthYears';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Length of the term for the position in years (typically 2 or 3).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'TermLengthYears';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'IsOfficer'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'IsOfficer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the position is an officer (executive) role.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'IsOfficer';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'BoardPosition'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'BoardPosition',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the position is currently active; all rows are true.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardPosition',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.Campaign
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about marketing/email campaigns, including identifiers, names, types, status, schedule, budget, description, and tracks monetary outcomes via conversion values. It serves as the central definition for campaigns linked to members, but email send records often have a null CampaignID, indicating that some sends are ad‑hoc or template‑driven and not directly tied to a formal campaign.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier (GUID) for each campaign record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Descriptive title of the campaign',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'CampaignType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'CampaignType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the campaign (e.g., Member Engagement, Membership Renewal, Event Promotion, Course Launch)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'CampaignType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the campaign (e.g., Completed, Active)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the campaign is scheduled to begin',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the campaign is scheduled to end',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Budget'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Budget';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Planned monetary budget for the campaign',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Budget';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'ActualCost'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'ActualCost';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Actual amount spent; currently null for all rows',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'ActualCost';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'TargetAudience'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'TargetAudience';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Intended audience segment for the campaign; optional',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'TargetAudience';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Goals'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Goals';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specific objectives or KPIs for the campaign; optional',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Goals';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Campaign'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Campaign',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free‑text description of the campaign purpose and content',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Campaign',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO

-- Table: AssociationDemo.CampaignMember
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores each member''s participation record in a marketing campaign, optionally linked to a specific segment, tracking when they were added, their current status (e.g., Sent, Responded, Converted), response date and any monetary conversion value.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the participation record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'CampaignID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'CampaignID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the campaign the member is associated with',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'CampaignID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the member participating in the campaign',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'SegmentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'SegmentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional identifier of the segment used to target the member within the campaign',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'SegmentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'AddedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'AddedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time the member was added to the campaign',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'AddedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the member in the campaign lifecycle',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'ResponseDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'ResponseDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time the member responded to the campaign, if applicable',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ResponseDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CampaignMember'
    AND c.name = 'ConversionValue'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CampaignMember',
        @level2type = N'COLUMN',
        @level2name = N'ConversionValue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary value attributed to a conversion event for the member',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ConversionValue';
GO

-- Table: AssociationDemo.Certificate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores digital certificates issued to individuals or entities that have enrolled in a program, capturing the certificate identifier, issue/expiration dates, a link to the PDF, and a verification code.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key uniquely identifying each certificate record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'EnrollmentID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'EnrollmentID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Enrollment table, indicating which enrollment the certificate belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'EnrollmentID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'CertificateNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'CertificateNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable, unique certificate identifier (e.g., CERT-2025-000253).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'CertificateNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'IssuedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'IssuedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the certificate was issued to the enrollee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'IssuedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'ExpirationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'ExpirationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional date when the certificate expires; null for non‑expiring certificates.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'ExpirationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'CertificatePDFURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'CertificatePDFURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL pointing to the stored PDF version of the certificate.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'CertificatePDFURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Certificate'
    AND c.name = 'VerificationCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Certificate',
        @level2type = N'COLUMN',
        @level2name = N'VerificationCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique code used to verify the authenticity of the certificate online.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Certificate',
    @level2type = N'COLUMN',
    @level2name = N'VerificationCode';
GO

-- Table: AssociationDemo.Chapter
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Represents the chapters of a professional technology association, serving as grouping entities for many members (members can belong to multiple chapters) and supporting internal governance with multiple officer assignments. Includes identity, name, type (geographic or special‑interest), location details, founding date, description, activity status, meeting frequency, and member count.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each chapter record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official name of the chapter (e.g., "Toronto Chapter" or "AI & Machine Learning SIG")',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'ChapterType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'ChapterType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the chapter: either geographic or special‑interest',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'ChapterType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Region'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Region';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broad region classification (e.g., National, Northeast, Canada)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Region';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City where the chapter is based (nullable for non‑geographic chapters)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State or province abbreviation for the chapter location (nullable)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the chapter, defaulting to United States',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'FoundedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'FoundedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the chapter was established',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'FoundedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief textual description of the chapter''s focus or community',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Web address for the chapter (currently empty)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'Email'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'Email';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Contact email for the chapter (currently empty)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'Email';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the chapter is currently active',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'MeetingFrequency'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'MeetingFrequency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How often the chapter meets (Monthly or Quarterly)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'MeetingFrequency';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Chapter'
    AND c.name = 'MemberCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Chapter',
        @level2type = N'COLUMN',
        @level2name = N'MemberCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of members in the chapter (currently unknown)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'MemberCount';
GO

-- Table: AssociationDemo.ChapterMembership
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the association between members and chapters, recording each member''s enrollment in a specific chapter, the date they joined, their active/inactive status, and role within the chapter.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key uniquely identifying each membership record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'ChapterID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'ChapterID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the chapter to which the member belongs',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'ChapterID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the member participating in the chapter',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'JoinDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'JoinDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member joined the chapter',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'JoinDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current membership status in the chapter (Active or Inactive)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterMembership'
    AND c.name = 'Role'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterMembership',
        @level2type = N'COLUMN',
        @level2name = N'Role';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role of the member within the chapter; presently only ''Member''',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterMembership',
    @level2type = N'COLUMN',
    @level2name = N'Role';
GO

-- Table: AssociationDemo.ChapterOfficer
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the assignment of members to leadership positions within association chapters, recording which member holds which officer role (President, Vice President, Secretary), the chapter they serve, and the period of service.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for each officer assignment record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'ChapterID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'ChapterID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Chapter table identifying the chapter where the role is held',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'ChapterID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Member table identifying the member occupying the role',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'Position'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'Position';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The officer title held by the member within the chapter (President, Vice President, Secretary)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'Position';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the member began serving in the specified position',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the member''s term ended; null when the term is ongoing',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'ChapterOfficer'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'ChapterOfficer',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the assignment is currently active (default true)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'ChapterOfficer',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO

-- Table: AssociationDemo.Committee
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores records for the various committees of an association, capturing each committee''s identity, type, purpose, meeting schedule, active status, formation and disband dates, chairperson (linked to a member), and size limits.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each committee record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Descriptive name of the committee or task force.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'CommitteeType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'CommitteeType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the committee: Standing, Ad Hoc, or Task Force.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'CommitteeType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'Purpose'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'Purpose';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Narrative statement of the committee''s mission or responsibility.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'Purpose';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'MeetingFrequency'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'MeetingFrequency';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How often the committee meets (Monthly, Quarterly, Bi-Weekly).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'MeetingFrequency';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the committee is currently active (true).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'FormedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'FormedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the committee was officially created.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'FormedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'DisbandedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'DisbandedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the committee was dissolved, if applicable; null when still active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'DisbandedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'ChairMemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'ChairMemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the Member who serves as the committee chair.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'ChairMemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Committee'
    AND c.name = 'MaxMembers'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Committee',
        @level2type = N'COLUMN',
        @level2name = N'MaxMembers';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum allowed number of members in the committee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Committee',
    @level2type = N'COLUMN',
    @level2name = N'MaxMembers';
GO

-- Table: AssociationDemo.CommitteeMembership
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the association of members to committees, recording each member''s role, start date, optional end date, and active status within a committee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each committee membership record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'CommitteeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'CommitteeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the committee to which the member belongs.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'CommitteeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the member assigned to the committee.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'Role'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'Role';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The position the member holds within the committee (Member, Chair, Vice Chair).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'Role';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the member''s committee assignment began.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the member''s committee assignment ended; null for ongoing assignments.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the membership is currently active.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'CommitteeMembership'
    AND c.name = 'AppointedBy'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'CommitteeMembership',
        @level2type = N'COLUMN',
        @level2name = N'AppointedBy';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name or identifier of the person who appointed the member to the committee; currently unused.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CommitteeMembership',
    @level2type = N'COLUMN',
    @level2name = N'AppointedBy';
GO

-- Table: AssociationDemo.Course
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores detailed information about training courses offered, including identifiers, codes, titles, descriptions, categorization, difficulty level, duration, credit value, pricing, activation status, publication date, instructor, prerequisite relationships, and media assets.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each course record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Code'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Code';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short alphanumeric code used to reference the course internally and externally',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Code';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable name of the course',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief summary of the course content',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broad business or technical domain the course belongs to',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Level'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Level';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Intended difficulty or expertise level of the course',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Level';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'DurationHours'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'DurationHours';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total instructional time in hours',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'DurationHours';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'CEUCredits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'CEUCredits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Continuing Education Units awarded upon completion',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'Price'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'Price';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Standard purchase price for non‑members',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'Price';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'MemberPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'MemberPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discounted price for members or subscribers',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'MemberPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the course is currently offered',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'PublishedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'PublishedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the course was made available in the catalog',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'PublishedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'InstructorName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'InstructorName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the primary instructor or presenter for the course',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'InstructorName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'PrerequisiteCourseID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'PrerequisiteCourseID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to another course that must be completed first',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'PrerequisiteCourseID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'ThumbnailURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'ThumbnailURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to an image representing the course',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'ThumbnailURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Course'
    AND c.name = 'LearningObjectives'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Course',
        @level2type = N'COLUMN',
        @level2name = N'LearningObjectives';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed list of skills or outcomes learners will achieve',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Course',
    @level2type = N'COLUMN',
    @level2name = N'LearningObjectives';
GO

-- Table: AssociationDemo.EmailClick
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores a single record for each link click generated from a sent email, capturing when the click occurred, which email it belongs to, the target URL, optional link label, and (when available) the visitor''s IP address and browser user‑agent. This enables detailed email engagement analytics.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the click record (primary key).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'EmailSendID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'EmailSendID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the EmailSend record that generated the email containing the clicked link.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'EmailSendID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'ClickDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'ClickDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the recipient clicked the link.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'ClickDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'URL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'URL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The destination URL that was clicked.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'URL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'LinkName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'LinkName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional display name or label of the clicked link (e.g., "View Events").',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'LinkName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'IPAddress'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'IPAddress';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IP address of the user at click time (optional).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'IPAddress';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailClick'
    AND c.name = 'UserAgent'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailClick',
        @level2type = N'COLUMN',
        @level2name = N'UserAgent';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Browser user‑agent string of the user at click time (optional).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailClick',
    @level2type = N'COLUMN',
    @level2name = N'UserAgent';
GO

-- Table: AssociationDemo.EmailSend
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'This table records each individual email message that was sent to a member using a specific email template, tracking its lifecycle (sent, delivered, opened, clicked, bounced, etc.) for marketing and member communications analysis.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each email send record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'TemplateID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'TemplateID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the email template used for this send',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'TemplateID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'CampaignID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'CampaignID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the marketing campaign that triggered the send',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'CampaignID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the member (recipient) of the email',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'Subject'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'Subject';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Subject line of the email that was sent',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'Subject';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'SentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'SentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the email was queued/sent to the mail system',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'SentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'DeliveredDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'DeliveredDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the email was reported as delivered to the recipient''s mailbox',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'DeliveredDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'OpenedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'OpenedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the first open event recorded for the email',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'OpenedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'OpenCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'OpenCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times the email was opened',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'OpenCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ClickedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ClickedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the first click on a link within the email',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ClickedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ClickCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ClickCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of link clicks recorded for the email',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ClickCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'BouncedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'BouncedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the email bounced back to the sender',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'BouncedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'BounceType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'BounceType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of bounce (e.g., hard, soft)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'BounceType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'BounceReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'BounceReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable explanation for the bounce',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'BounceReason';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'UnsubscribedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'UnsubscribedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the recipient unsubscribed as a result of this email',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'UnsubscribedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'SpamReportedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'SpamReportedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the recipient marked the email as spam',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'SpamReportedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current processing state of the email (e.g., Sent, Delivered, Opened, Clicked, Bounced)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailSend'
    AND c.name = 'ExternalMessageID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailSend',
        @level2type = N'COLUMN',
        @level2name = N'ExternalMessageID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier assigned by the external email service provider (e.g., SendGrid, MailChimp)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailSend',
    @level2type = N'COLUMN',
    @level2name = N'ExternalMessageID';
GO

-- Table: AssociationDemo.EmailTemplate
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores predefined email templates used by the association for various communications such as welcome messages, renewal reminders, newsletters and event invitations.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each email template',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable name of the template, used to select the appropriate email content.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Subject'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Subject';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Subject line that will appear in the email when the template is used.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Subject';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'FromName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'FromName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the sender shown in the email''s From field.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'FromName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'FromEmail'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'FromEmail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address used in the From header for the template.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'FromEmail';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'ReplyToEmail'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'ReplyToEmail';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional address where replies should be directed; currently unused (all NULL).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'ReplyToEmail';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'HtmlBody'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'HtmlBody';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'HTML version of the email body; currently NULL, possibly stored elsewhere or generated at send time.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'HtmlBody';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'TextBody'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'TextBody';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Plain‑text version of the email body; also NULL for same reason as HtmlBody.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'TextBody';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Category'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Category';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broad classification of the template (Renewal, Welcome, Newsletter, Event).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Category';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the template is currently usable for sending emails.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'PreviewText'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'PreviewText';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short preview snippet shown in email clients before opening the message.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'PreviewText';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EmailTemplate'
    AND c.name = 'Tags'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EmailTemplate',
        @level2type = N'COLUMN',
        @level2name = N'Tags';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑form tags for additional categorisation; currently unused (NULL).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Tags';
GO

-- Table: AssociationDemo.Enrollment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores each enrollment of a member in a training course or program, tracking enrollment, start and completion dates, progress, scores, status, billing details, and linking to a certificate record that is issued when the enrollment meets certification criteria.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key uniquely identifying each enrollment record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'CourseID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'CourseID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Course table identifying which course is being taken.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'CourseID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Member table identifying the participant.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'EnrollmentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'EnrollmentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member officially enrolled in the course.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'EnrollmentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member began the course (may differ from enrollment).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'CompletionDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'CompletionDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member finished the course; null when not yet completed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'CompletionDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'ExpirationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'ExpirationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Planned expiration of the enrollment or certification; currently unused.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'ExpirationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the enrollment (Enrolled, In Progress, Completed, etc.).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'ProgressPercentage'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'ProgressPercentage';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric progress of the course from 0 to 100.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'ProgressPercentage';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'LastAccessedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'LastAccessedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the last time the member accessed the course material.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'LastAccessedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'TimeSpentMinutes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'TimeSpentMinutes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total minutes the member has spent on the course; currently always 0.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'TimeSpentMinutes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'FinalScore'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'FinalScore';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Score the member achieved on the final assessment, if any.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'FinalScore';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'PassingScore'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'PassingScore';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Minimum score required to pass the course (fixed at 70).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'PassingScore';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'Passed'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'Passed';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Boolean indicating whether the member met or exceeded the passing score.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'Passed';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Enrollment'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Enrollment',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the invoice generated for this enrollment; currently null.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Enrollment',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO

-- Table: AssociationDemo.Event
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores detailed information about a limited set of recurring industry events, conferences, webinars, and workshops focused on professional development in the cheese industry, including scheduling, location, virtual access details, capacity, registration periods, early‑bird and standard pricing, CEU credits, session types, and status, with each event supporting multiple registrations and CEU awards.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key uniquely identifying each event record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Descriptive title of the event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'EventType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'EventType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the event (Webinar, Conference, Workshop).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'EventType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time when the event begins.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time when the event ends.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Timezone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Timezone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IANA timezone identifier for the event''s scheduled times.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Timezone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Location'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Location';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Physical venue or indication of virtual attendance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Location';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'IsVirtual'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'IsVirtual';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the event is conducted virtually.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'IsVirtual';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'VirtualPlatform'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'VirtualPlatform';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the online platform used when IsVirtual is true (e.g., Zoom, Teams).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'VirtualPlatform';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'MeetingURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'MeetingURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Direct URL for participants to join the virtual event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'MeetingURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'ChapterID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'ChapterID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a regional chapter; currently null for all rows.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'ChapterID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Capacity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Capacity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of attendees allowed for the event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Capacity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'RegistrationOpenDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationOpenDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when registration for the event opens.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationOpenDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'RegistrationCloseDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationCloseDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when registration for the event closes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationCloseDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'RegistrationFee'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationFee';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Overall fee required to register; currently null for all rows.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationFee';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'MemberPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'MemberPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registration price for members of the organization.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'MemberPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'NonMemberPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'NonMemberPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registration price for non‑members.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'NonMemberPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'CEUCredits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'CEUCredits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Continuing Education Units awarded for attending the event.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Long-form narrative describing the event''s content and objectives.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Event'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Event',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current lifecycle state of the event (Draft, Published, Registration Open, Completed, etc.).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Event',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO

-- Table: AssociationDemo.EventRegistration
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores each member''s registration for a specific event, capturing when they registered, the type of registration (Standard or Early Bird), current status (Registered, Attended, No Show, etc.), check‑in time, invoicing reference, CEU award flag and dates, as well as cancellation details. It links members to events and supports reporting on attendance, billing, and continuing‑education credits.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the registration record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'EventID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'EventID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the event being registered for',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'EventID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the member who registered',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'RegistrationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the member signed up for the event',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'RegistrationType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'RegistrationType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of registration pricing (Standard or Early Bird)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'RegistrationType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current registration status (Registered, Attended, No Show, etc.)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CheckInTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CheckInTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the member actually checked in to the event',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CheckInTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the invoice generated for this registration (currently null)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CEUAwarded'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CEUAwarded';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the member earned a CEU credit for this event',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CEUAwarded';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CEUAwardedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CEUAwardedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the CEU credit was awarded',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CEUAwardedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CancellationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CancellationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the registration was cancelled, if applicable',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CancellationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventRegistration'
    AND c.name = 'CancellationReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventRegistration',
        @level2type = N'COLUMN',
        @level2name = N'CancellationReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reason provided for cancellation',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventRegistration',
    @level2type = N'COLUMN',
    @level2name = N'CancellationReason';
GO

-- Table: AssociationDemo.EventSession
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores detailed information about individual sessions or program items that belong to a larger event, including scheduling, location, speaker, capacity, and continuing education credits.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each session record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'EventID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'EventID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the parent event that the session belongs to.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'EventID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Title or short name of the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Longer textual description of the session content.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'StartTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'StartTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scheduled start date and time of the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'StartTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'EndTime'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'EndTime';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scheduled end date and time of the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'EndTime';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Room'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Room';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Physical or virtual location where the session takes place.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Room';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'SpeakerName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'SpeakerName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the person presenting or leading the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'SpeakerName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'SessionType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'SessionType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the session (e.g., keynote, workshop, panel).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'SessionType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'Capacity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'Capacity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of attendees allowed for the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'Capacity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'EventSession'
    AND c.name = 'CEUCredits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'EventSession',
        @level2type = N'COLUMN',
        @level2name = N'CEUCredits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of Continuing Education Units awarded for attending the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
GO

-- Table: AssociationDemo.Invoice
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual invoices issued to members, capturing invoice identifiers, dates, monetary amounts, payment status and related member reference.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID uniquely identifying each invoice record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'InvoiceNumber'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceNumber';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable, unique invoice code used for external reference.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceNumber';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the invoice to the member (customer) who is billed.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'InvoiceDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the invoice was created or issued.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'DueDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'DueDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date by which payment is expected.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'DueDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'SubTotal'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'SubTotal';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sum of line‑item amounts before tax and discounts.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'SubTotal';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Tax'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Tax';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tax amount applied to the subtotal.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Tax';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Discount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Discount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discount applied to the invoice; currently always zero.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Discount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Total'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Total';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final amount due (SubTotal + Tax – Discount).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Total';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'AmountPaid'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'AmountPaid';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Amount that has been paid toward the invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'AmountPaid';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Balance'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Balance';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Remaining amount owed (Total – AmountPaid).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Balance';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current state of the invoice (Paid, Sent, Overdue, etc.).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑form text for additional invoice comments.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Invoice'
    AND c.name = 'PaymentTerms'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Invoice',
        @level2type = N'COLUMN',
        @level2name = N'PaymentTerms';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Text describing payment terms (e.g., Net 30); currently unused.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Invoice',
    @level2type = N'COLUMN',
    @level2name = N'PaymentTerms';
GO

-- Table: AssociationDemo.InvoiceLineItem
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual line items for each invoice, detailing what was sold or billed (event registrations, course enrollments, membership dues, etc.), the price, tax and a link to the underlying business entity.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the line‑item record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the line item to its parent invoice',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable text describing the product or service billed',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'ItemType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'ItemType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Category of the billed item (Event Registration, Course Enrollment, Membership Dues)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'ItemType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'Quantity'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'Quantity';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of units for the line item (always 1)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'Quantity';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'UnitPrice'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'UnitPrice';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Price per single unit before tax',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'UnitPrice';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'Amount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'Amount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total price for the line (UnitPrice × Quantity)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'Amount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'TaxAmount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'TaxAmount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tax applied to the line item',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'TaxAmount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'RelatedEntityType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'RelatedEntityType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of the underlying business entity the line refers to (Event, Membership, Course)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'RelatedEntityType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'InvoiceLineItem'
    AND c.name = 'RelatedEntityID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'InvoiceLineItem',
        @level2type = N'COLUMN',
        @level2name = N'RelatedEntityID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the specific Event, Membership or Course record linked to this line',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'InvoiceLineItem',
    @level2type = N'COLUMN',
    @level2name = N'RelatedEntityID';
GO

-- Table: AssociationDemo.Member
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual contact records linked to organizations, serving as the central member entity that captures personal, professional, and communication details. Members may hold leadership or board roles, act as billable customers for invoicing, participate in event registrations, and can have multiple concurrent or historic subscription records, supporting membership, CRM, governance, and financial processes.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'System‑generated unique identifier for the person record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Email'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Email';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary business email address of the individual, used as a unique contact key',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Email';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'FirstName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'FirstName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Given name of the individual',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'FirstName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'LastName'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'LastName';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Family name of the individual',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'LastName';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Title'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Title';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current job title or role within the organization',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Title';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'OrganizationID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'OrganizationID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the organization the person is affiliated with',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'OrganizationID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Industry'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Industry';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Industry sector of the individual''s organization or personal focus',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Industry';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'JobFunction'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'JobFunction';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broad functional area of the individual''s work (e.g., DevOps, Data Science)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'JobFunction';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'YearsInProfession'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'YearsInProfession';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of years the individual has worked in their field',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'YearsInProfession';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'JoinDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'JoinDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the individual was added to the system or joined the organization',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'JoinDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'LinkedInURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'LinkedInURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to the person''s LinkedIn profile (optional)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'LinkedInURL';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Bio'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Bio';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free‑form biography or description (currently empty)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Bio';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'PreferredLanguage'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'PreferredLanguage';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Locale/language preference for communications',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'PreferredLanguage';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Timezone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Timezone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Time zone identifier for the individual (currently missing)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Timezone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Phone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Phone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary business phone number (optional)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Phone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Mobile'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Mobile';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Mobile phone number (currently missing)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Mobile';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City of residence or work location',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State or province abbreviation',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the individual, default United States',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'PostalCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'PostalCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal/ZIP code (currently missing)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'PostalCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'EngagementScore'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'EngagementScore';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric score representing engagement level (currently all zero)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'EngagementScore';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'LastActivityDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'LastActivityDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent activity by the individual (currently missing)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'LastActivityDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Member'
    AND c.name = 'ProfilePhotoURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Member',
        @level2type = N'COLUMN',
        @level2name = N'ProfilePhotoURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to the individual''s profile picture (currently missing)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'ProfilePhotoURL';
GO

-- Table: AssociationDemo.Membership
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores each member''s subscription to a specific membership plan, including start/end dates, status, renewal settings and cancellation details. It links a Member to a MembershipType and tracks the lifecycle of that membership.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key of the membership record, uniquely identifying each subscription instance.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'MemberID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'MemberID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the Member who holds this subscription.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'MemberID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'MembershipTypeID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'MembershipTypeID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the MembershipType (plan) assigned to the member.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'MembershipTypeID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current state of the subscription (Active, Lapsed, Cancelled).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'StartDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'StartDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the membership became effective.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'StartDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'EndDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'EndDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the membership is scheduled to end or has ended.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'EndDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'RenewalDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'RenewalDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the next renewal is expected or was processed; nullable for non‑renewing or pending renewals.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'RenewalDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'AutoRenew'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'AutoRenew';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the membership should renew automatically at EndDate.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'AutoRenew';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'CancellationDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'CancellationDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date the membership was cancelled, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'CancellationDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Membership'
    AND c.name = 'CancellationReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Membership',
        @level2type = N'COLUMN',
        @level2name = N'CancellationReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Text explaining why a membership was cancelled, if applicable.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Membership',
    @level2type = N'COLUMN',
    @level2name = N'CancellationReason';
GO

-- Table: AssociationDemo.MembershipType
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores the definitions of the various membership plans offered by the organization, including their names, descriptions, annual dues, renewal periods, status flags, benefit details, and display ordering. It serves as a lookup for assigning a specific plan to individual members.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID uniquely identifying each membership plan record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short label of the membership plan (e.g., Student, Corporate).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Longer textual explanation of what the plan includes and who it targets.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'AnnualDues'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'AnnualDues';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Yearly fee associated with the plan; 0 for complimentary plans.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'AnnualDues';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'RenewalPeriodMonths'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'RenewalPeriodMonths';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of months a membership is valid before renewal; 12 for annual, 1200 for lifetime.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'RenewalPeriodMonths';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the plan is currently offered (always true in sample).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'AllowAutoRenew'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'AllowAutoRenew';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies if the plan can be automatically renewed at the end of its period.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'AllowAutoRenew';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'RequiresApproval'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'RequiresApproval';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether enrollment in the plan needs manual approval (e.g., honorary or corporate).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'RequiresApproval';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'Benefits'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'Benefits';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed list of benefits provided to members of this plan.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'Benefits';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'MembershipType'
    AND c.name = 'DisplayOrder'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'MembershipType',
        @level2type = N'COLUMN',
        @level2name = N'DisplayOrder';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Numeric order used to present plans in UI lists (1‑8).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'MembershipType',
    @level2type = N'COLUMN',
    @level2name = N'DisplayOrder';
GO

-- Table: AssociationDemo.Organization
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A master table that stores detailed information about companies or organizations—including identifiers, names, industry classification, financial metrics, market data, contact details, and location—and serves as the tenant or parent entity in a multi‑tenant membership/CRM system. It is referenced by the Member table, where most members share the same OrganizationID (indicating tenancy), while a portion of members have null OrganizationID, supporting unaffiliated contacts.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key GUID uniquely identifying each company record.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Legal or trade name of the company.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Industry'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Industry';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broad industry category the company operates in.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Industry';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'EmployeeCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'EmployeeCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of employees working for the company.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'EmployeeCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'AnnualRevenue'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'AnnualRevenue';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Fiscal year revenue reported by the company (currency unspecified).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'AnnualRevenue';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'MarketCapitalization'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'MarketCapitalization';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total market value of the company''s outstanding shares (for publicly traded firms).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'MarketCapitalization';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'TickerSymbol'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'TickerSymbol';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock ticker symbol used on a public exchange.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'TickerSymbol';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Exchange'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Exchange';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stock exchange where the ticker is listed (NYSE or NASDAQ).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Exchange';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Website'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Website';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Company''s public website URL.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Website';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief textual description of the company''s business or mission.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'YearFounded'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'YearFounded';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calendar year the company was established.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'YearFounded';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'City'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'City';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City where the company''s headquarters or primary address is located.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'City';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'State'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'State';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State or province abbreviation for the company''s address.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'State';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Country'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Country';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country of the company''s primary location.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Country';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'PostalCode'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'PostalCode';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal/ZIP code for the company''s address (currently not populated).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'PostalCode';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'Phone'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'Phone';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary contact phone number for the company.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'Phone';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Organization'
    AND c.name = 'LogoURL'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Organization',
        @level2type = N'COLUMN',
        @level2name = N'LogoURL';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Link to the company''s logo image (currently empty).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'LogoURL';
GO

-- Table: AssociationDemo.Payment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual payment records for invoices, capturing when a payment was made, how much, the method used, transaction reference, processing details and final status.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Surrogate primary key for the payment record, generated sequentially.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'InvoiceID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'InvoiceID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key linking the payment to its corresponding invoice.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'InvoiceID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'PaymentDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'PaymentDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the payment was initiated or received.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'PaymentDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'Amount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'Amount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monetary amount of the payment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'Amount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'PaymentMethod'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'PaymentMethod';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Method used to process the payment (e.g., Credit Card, Stripe, ACH, PayPal).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'PaymentMethod';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'TransactionID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'TransactionID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'External processor''s transaction identifier, prefixed with ''TXN-''.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'TransactionID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'Status'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'Status';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current outcome of the payment attempt (Completed or Failed).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'Status';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'ProcessedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'ProcessedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the payment was processed in the system (often a few minutes after PaymentDate).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'ProcessedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'FailureReason'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'FailureReason';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Textual reason for a failed payment, populated only when Status = ''Failed''.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'FailureReason';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Payment'
    AND c.name = 'Notes'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Payment',
        @level2type = N'COLUMN',
        @level2name = N'Notes';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free‑form comments about the payment.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Payment',
    @level2type = N'COLUMN',
    @level2name = N'Notes';
GO

-- Table: AssociationDemo.Segment
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores definitions of member segments used for marketing and engagement purposes, including their names, descriptions, categorization, and runtime metadata such as member count and calculation date.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment';
GO

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'ID'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'ID';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for each segment definition',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'ID';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'Name'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'Name';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human‑readable name of the segment',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'Name';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'Description'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'Description';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed explanation of the segment''s criteria or purpose',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'Description';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'SegmentType'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'SegmentType';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Broad category of the segment such as Industry, Engagement, Geography, etc.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'SegmentType';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'FilterCriteria'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'FilterCriteria';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Placeholder for the query or rule that defines the segment members',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'FilterCriteria';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'MemberCount'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'MemberCount';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of members currently belonging to the segment',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'MemberCount';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'LastCalculatedDate'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'LastCalculatedDate';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent member count calculation',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'LastCalculatedDate';
GO
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = 'AssociationDemo'
    AND t.name = 'Segment'
    AND c.name = 'IsActive'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'AssociationDemo',
        @level1type = N'TABLE',
        @level1name = N'Segment',
        @level2type = N'COLUMN',
        @level2name = N'IsActive';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Flag indicating whether the segment is active and usable',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
