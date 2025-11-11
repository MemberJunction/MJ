-- Database Documentation Script
-- Generated: 2025-11-08T16:57:05.359Z
-- Database: AssociationDB
-- Server: localhost

-- This script adds MS_Description extended properties to database objects


-- Schema: AssociationDemo

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
    @value = N'Stores the assignment of association members to specific board positions, including term start and end dates, election date and active status.',
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
    @value = N'Primary key uniquely identifying each board‑membership record.',
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
    @value = N'Foreign key to the BoardPosition table identifying the specific board role assigned.',
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
    @value = N'Foreign key to the Member table identifying the member who holds the board role.',
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
    @value = N'Date when the member''s term in the board position begins.',
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
    @value = N'Date when the member''s term ends; null when the term is ongoing or not yet ended.',
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
    @value = N'Boolean flag indicating whether the board assignment is currently active.',
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
    @value = N'Date on which the member was elected to the board position.',
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
    @value = N'Stores the defined board positions for an organization, including title, display order, term length, officer status and active flag. It serves as a lookup for assigning members to specific board roles.',
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
    @value = N'Unique identifier (GUID) for each board position record.',
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
    @value = N'Human‑readable name of the board position (e.g., President, Director at Large #3).',
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
    @value = N'Optional free‑text description of the role; currently unused (all NULL).',
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
    @value = N'Length of the term for the position in years (commonly 2 or 3).',
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
    @value = N'Flag indicating whether the position is an officer (executive) role rather than a director at large.',
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
    @value = N'Stores details of marketing campaigns, including identifiers, names, type, status, schedule, budget, and description. It serves as the central entity for campaign planning and tracks member‑level engagement stages via related tables, but email send records are not currently linked to campaigns (CampaignID is null).',
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
    @value = N'Unique identifier for each campaign record.',
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
    @value = N'Human‑readable title of the campaign.',
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
    @value = N'Category of the campaign (e.g., Member Engagement, Course Launch).',
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
    @value = N'Current lifecycle state of the campaign (Active, Completed, etc.).',
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
    @value = N'Date the campaign is scheduled to begin.',
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
    @value = N'Date the campaign is scheduled to end.',
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
    @value = N'Planned monetary allocation for the campaign.',
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
    @value = N'Actual amount spent; currently null for all rows.',
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
    @value = N'Intended audience segment for the campaign; currently unspecified.',
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
    @value = N'Specific objectives the campaign aims to achieve; currently unspecified.',
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
    @value = N'Brief narrative explaining the purpose or content of the campaign.',
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
    @value = N'Stores the association between a marketing campaign, a member, and optionally a segment, recording when the member was added to the campaign and the current engagement status (Targeted, Sent, Responded, Converted, Opted Out) along with response date and any monetary conversion value.',
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
    @value = N'Surrogate primary key for each campaign‑member record',
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
    @value = N'Identifier of the campaign to which the member is linked',
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
    @value = N'Optional identifier of the segment used for targeting the member in the campaign',
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
    @value = N'Timestamp when the member was added to the campaign (or when the record was created)',
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
    @value = N'Current engagement state of the member within the campaign (Targeted, Sent, Responded, Converted, Opted Out)',
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
    @value = N'Date the member responded to the campaign (e.g., opened, clicked, replied)',
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
    @value = N'Stores digital certificates issued to members for completed course enrollments, including a unique certificate number, issue and optional expiration dates, a link to the PDF file, and a verification code for authenticity verification.',
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
    @value = N'Primary key GUID uniquely identifying each certificate record.',
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
    @value = N'Foreign key linking the certificate to the specific enrollment for which it was issued.',
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
    @value = N'Human‑readable, unique certificate identifier used for reference and display.',
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
    @value = N'Date the certificate was generated and made available to the member.',
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
    @value = N'Optional date after which the certificate is no longer considered valid.',
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
    @value = N'URL pointing to the stored PDF version of the certificate document.',
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
    @value = N'Unique code used to verify the authenticity of the certificate, often presented to third parties.',
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
    @value = N'Stores information about the various chapters of a professional technology association, including their identity, name, type, geographic location, founding date, description, activity status, meeting cadence and (future) member count.',
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
    @value = N'Official name of the chapter',
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
    @value = N'Category of the chapter: Geographic or Special Interest',
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
    @value = N'City where the chapter is based (optional)',
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
    @value = N'State or province abbreviation for the chapter location (optional)',
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
    @value = N'Brief textual description of the chapter''s focus or audience',
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
    @value = N'URL of the chapter’s website (currently missing)',
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
    @value = N'Contact email for the chapter (currently missing)',
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
    @value = N'Indicates whether the chapter is currently active',
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
    @value = N'Stores the association between individual members and association chapters, recording when a member joined a chapter, their active/inactive status, and their role within the chapter (currently always ''Member''). This linking table enables tracking of chapter memberships over time.',
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
    @value = N'Surrogate primary key for each membership record, uniquely identifying the link between a member and a chapter.',
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
    @value = N'Foreign key to the Chapter table, indicating which chapter the member is associated with.',
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
    @value = N'Foreign key to the Member table, identifying the member who belongs to the chapter.',
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
    @value = N'The date the member joined the chapter, used to track membership tenure.',
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
    @value = N'Current membership status within the chapter; either ''Active'' or ''Inactive''.',
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
    @value = N'Role of the member within the chapter; currently only ''Member'' is stored, suggesting other roles are handled elsewhere or not used.',
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
    @value = N'Stores the association between a member and a chapter that defines the member''s leadership role (e.g., President, Vice President, Secretary) within that chapter, including the tenure dates and active status.',
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
    @value = N'Primary key for each leadership assignment record',
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
    @value = N'Reference to the chapter where the member holds a position.',
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
    @value = N'Reference to the member who occupies the position.',
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
    @value = N'The leadership role held by the member within the chapter (e.g., President, Vice President, Secretary).',
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
    @value = N'Date when the member began serving in the specified position.',
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
    @value = N'Date when the member''s term ended; null when the term is ongoing or not yet recorded.',
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
    @value = N'Flag indicating whether the assignment is currently active (true by default).',
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
    @value = N'Stores details of the association''s committees, including identifiers, names, type (standing, ad hoc, task force), purpose, meeting cadence, active status, formation and disband dates, and the maximum allowed members. Leadership roles such as Chair and Vice Chair are not stored in a dedicated column but are represented in the CommitteeMembership linking table via Role values, linking members to committees.',
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
    @value = N'Descriptive title of the committee or project.',
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
    @value = N'Categorizes the committee as Standing, Ad Hoc, or Task Force.',
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
    @value = N'How often the committee meets (Monthly, Quarterly, Bi‑Weekly).',
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
    @value = N'Flag indicating whether the committee is currently active.',
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
    @value = N'Date the committee was dissolved, if applicable.',
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
    @value = N'Maximum number of members allowed in the committee.',
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
    @value = N'Stores the assignments of members to committees, capturing which member serves on which committee, their role (Chair, Vice Chair, Member), the start date of the assignment and optional end date. It enables tracking of committee composition and leadership over time.',
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
    @value = N'Surrogate primary key for each committee‑member assignment record',
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
    @value = N'Identifier of the committee to which the member is assigned',
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
    @value = N'Identifier of the member who holds the assignment',
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
    @value = N'The role the member holds on the committee (Member, Chair, Vice Chair)',
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
    @value = N'Date the member began serving on the committee',
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
    @value = N'Date the member''s service on the committee ended (null if still active)',
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
    @value = N'Flag indicating the assignment is currently active',
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
    @value = N'Optional reference to who appointed the member to the committee (currently unused)',
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
    @value = N'Stores the catalog of training courses offered by the organization, including identifiers, codes, titles, detailed descriptions, categorization, difficulty level, duration, CEU credits, pricing (regular and member), activation status, publication date, instructor, prerequisite linkage, and placeholders for media and learning objectives.',
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
    @value = N'Human‑readable short code used to reference the course',
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
    @value = N'Full name of the course',
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
    @value = N'Brief narrative explaining the course content',
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
    @value = N'Broad business domain of the course (e.g., Security, Cloud)',
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
    @value = N'Difficulty level of the course (Beginner, Intermediate, Advanced)',
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
    @value = N'Discounted price for members/subscribers',
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
    @value = N'Date the course was made publicly available',
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
    @value = N'Name of the primary instructor delivering the course',
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
    @value = N'Detailed list of skills or outcomes the learner will achieve',
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
    @value = N'Stores a record for each individual link click generated from a sent email, capturing when the click occurred, which email it belongs to, and details of the clicked link.',
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
    @value = N'Unique identifier for the click event record',
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
    @value = N'Reference to the EmailSend record that generated the email containing the clicked link',
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
    @value = N'Date and time when the link was clicked',
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
    @value = N'The full URL that was clicked by the recipient',
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
    @value = N'Human‑readable name of the link as it appeared in the email',
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
    @value = N'IP address of the user who clicked the link (currently not captured)',
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
    @value = N'Browser user‑agent string of the clicking device (currently not captured)',
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
    @value = N'Stores a record of each email sent to a member, including the template used, send/delivery timestamps, open and click tracking, bounce information, and current status. It links members, email templates, and optionally campaigns, and serves as the parent record for a separate click‑tracking table that logs each individual link click, enabling detailed per‑link engagement analytics.',
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
    @value = N'Unique identifier for each email send record.',
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
    @value = N'Reference to the email template used for this send.',
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
    @value = N'Optional link to the marketing campaign that triggered the send.',
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
    @value = N'Reference to the member (recipient) of the email.',
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
    @value = N'Subject line of the email that was sent.',
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
    @value = N'Timestamp when the email was queued/sent.',
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
    @value = N'Timestamp when the email was successfully delivered to the recipient''s server.',
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
    @value = N'Timestamp of the first open event recorded for the email.',
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
    @value = N'Number of times the email was opened.',
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
    @value = N'Timestamp of the first click on a link within the email.',
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
    @value = N'Number of link clicks recorded for the email.',
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
    @value = N'Timestamp when a bounce was recorded.',
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
    @value = N'Category of bounce (hard, soft, etc.).',
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
    @value = N'Detailed reason for the bounce.',
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
    @value = N'Timestamp when the recipient unsubscribed via this email.',
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
    @value = N'Timestamp when the email was reported as spam.',
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
    @value = N'Current processing state of the email (e.g., Sent, Delivered, Opened, Clicked, Bounced).',
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
    @value = N'Identifier assigned by the external email service provider.',
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
    @value = N'Stores predefined email templates used by the association to send automated communications such as welcome messages, renewal reminders, newsletters, and event invitations.',
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
    @value = N'Primary key uniquely identifying each email template.',
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
    @value = N'Human‑readable name of the template (e.g., "Welcome Email - New Members").',
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
    @value = N'Default subject line used when the template is sent.',
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
    @value = N'Display name of the sender shown in the email header.',
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
    @value = N'Email address used as the sender for the template.',
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
    @value = N'Optional reply‑to address; currently null for all rows.',
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
    @value = N'HTML version of the email body; not populated in the sample.',
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
    @value = N'Plain‑text version of the email body; not populated in the sample.',
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
    @value = N'Enum indicating the type of communication (Renewal, Welcome, Newsletter, Event).',
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
    @value = N'Flag indicating whether the template is currently usable.',
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
    @value = N'Short preview snippet shown in email clients before opening.',
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
    @value = N'Optional tagging field for additional classification; currently empty.',
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
    @value = N'Stores each member''s enrollment and progress in a specific course, tracking enrollment, start and completion dates, status, progress percentage, final score, pass flag, and related metadata. It has a one‑to‑one relationship with the Certificate table, where a certificate row is generated when the enrollment reaches a completed/passed status.',
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
    @value = N'Foreign key to the Course table identifying which course the member is enrolled in.',
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
    @value = N'Date the member began the course; may be null if not yet started.',
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
    @value = N'Date the member completed the course; null for ongoing or incomplete enrollments.',
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
    @value = N'Planned expiration of the enrollment or certification; currently unused (all null).',
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
    @value = N'Current state of the enrollment (Enrolled, In Progress, Completed, etc.).',
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
    @value = N'Numeric progress of the course from 0 to 100 percent.',
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
    @value = N'Timestamp of the last time the member accessed the course material; currently unused.',
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
    @value = N'Numeric score achieved on the course assessment, if applicable.',
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
    @value = N'Boolean flag indicating whether the member met or exceeded the passing score.',
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
    @value = N'Reference to an invoice for paid courses; currently null for all rows.',
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
    @value = N'Stores detailed information about industry events such as conferences, workshops, webinars and meetings related to cheese production, marketing and regulation. Each row represents a single scheduled event with its timing, location (physical or virtual), capacity, registration windows, pricing, CEU credits and current status. Events are further broken down into multiple sessions (via the related EventSession table), each with its own speaker, capacity, and CEU credit allocation, reflecting a multi‑session conference or training structure.',
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
    @value = N'Primary key uniquely identifying each event record',
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
    @value = N'Descriptive title of the event',
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
    @value = N'Category of the event (Webinar, Conference, Workshop)',
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
    @value = N'Date and time when the event begins',
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
    @value = N'Date and time when the event ends',
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
    @value = N'IANA time‑zone identifier for the event''s scheduled time',
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
    @value = N'Physical venue or indication that the event is virtual',
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
    @value = N'Boolean flag indicating if the event is held online',
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
    @value = N'Name of the online platform used when IsVirtual is true (Zoom or Teams)',
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
    @value = N'Link to join the virtual meeting when applicable',
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
    @value = N'Optional reference to a regional chapter organizing the event (currently null for all rows)',
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
    @value = N'Maximum number of participants allowed for the event',
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
    @value = N'Date when attendees can start registering for the event',
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
    @value = N'Date when registration ends',
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
    @value = N'Overall fee for registration (currently null for all rows)',
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
    @value = N'Price for members to attend the event',
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
    @value = N'Price for non‑members to attend the event',
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
    @value = N'Continuing Education Units awarded for attending the event',
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
    @value = N'Long textual summary of the event content and objectives',
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
    @value = N'Current lifecycle state of the event (Draft, Published, Registration Open, Completed, etc.)',
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
    @value = N'Stores each member''s registration and attendance details for association events, linking a member to a specific event with registration metadata, status, check‑in time, and CEU award information.',
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
    @value = N'Unique identifier for each registration record',
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
    @value = N'Reference to the event being registered for',
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
    @value = N'Reference to the member who registered',
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
    @value = N'Date the member registered for the event',
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
    @value = N'Type of registration pricing tier',
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
    @value = N'Current status of the registration/attendance',
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
    @value = N'Link to the invoice generated for the registration (currently unused)',
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
    @value = N'Indicates whether Continuing Education Units were awarded',
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
    @value = N'Date when CEU credit was awarded',
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
    @value = N'Stores individual sessions or program items that belong to a larger event, capturing details such as session name, description, schedule, location, speaker, type, capacity and CEU credits.',
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
    @value = N'Unique identifier for the session record',
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
    @value = N'Reference to the parent event to which the session belongs',
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
    @value = N'Title or name of the session',
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
    @value = N'Detailed description of the session content',
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
    @value = N'Scheduled start date and time of the session',
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
    @value = N'Scheduled end date and time of the session',
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
    @value = N'Physical or virtual location where the session is held',
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
    @value = N'Name of the person presenting or leading the session',
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
    @value = N'Category or format of the session (e.g., workshop, keynote, panel)',
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
    @value = N'Maximum number of attendees allowed for the session',
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
    @value = N'Continuing Education Units awarded for attending the session',
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
    @value = N'Stores invoice header records for association members, containing identifiers, dates, aggregated monetary totals, payment status, and a reference to the member. Detailed charges are stored in separate line‑item rows, and payments can be recorded in multiple records per invoice, supporting installment or multiple‑attempt payment models.',
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
    @value = N'Human‑readable invoice code, unique per invoice, used for external reference.',
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
    @value = N'Current state of the invoice (e.g., Paid, Sent, Overdue).',
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
    @value = N'This table stores the line‑item details for each invoice issued by the association. Each row represents a single charge (e.g., membership dues, event registration, course enrollment, donation, merchandise) linked to an invoice, including pricing, tax, and a reference to the related business entity (event, membership, or course).',
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
    @value = N'Surrogate primary key for the line‑item record, generated sequentially to ensure uniqueness and ordering.',
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
    @value = N'Foreign key linking the line item to its parent invoice record.',
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
    @value = N'Human‑readable text describing the charge (e.g., event name, membership type).',
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
    @value = N'Categorical type of the charge, limited to a predefined list (Event Registration, Membership Dues, Course Enrollment, etc.).',
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
    @value = N'Number of units for the charge; always 1 for these services.',
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
    @value = N'Price per single unit before tax.',
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
    @value = N'Total line amount (Quantity × UnitPrice); matches UnitPrice because Quantity is 1.',
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
    @value = N'Tax applied to the line item; defaults to 0 when not applicable.',
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
    @value = N'Type of the business entity the line item is associated with (Event, Membership, or Course).',
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
    @value = N'Identifier of the specific event, membership record, or course that generated the charge.',
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
    @value = N'The Member table stores individual member or contact records for the association, capturing personal details (name, email, title, job function, industry, location), professional attributes (years in profession, organization affiliation, LinkedIn profile), engagement metadata (join date, engagement score, last activity) and contact information. It serves as the central entity linking people to organizations, multiple membership records, billing/invoice data, and various association roles such as board members, chairs, campaign participants, and chapter memberships.',
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
    @value = N'Primary key GUID uniquely identifying each member record',
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
    @value = N'Primary email address of the contact, used for communication and as a unique login/identifier.',
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
    @value = N'Given name of the contact.',
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
    @value = N'Family name of the contact.',
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
    @value = N'Job title or role of the contact within their organization.',
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
    @value = N'Foreign key linking the contact to the organization they belong to.',
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
    @value = N'Industry sector of the contact''s organization or professional focus.',
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
    @value = N'Broad functional area of the contact''s work (e.g., Engineering, Executive).',
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
    @value = N'Number of years the contact has worked in their profession.',
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
    @value = N'Date the contact was added to the system or joined the association.',
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
    @value = N'URL to the contact''s LinkedIn profile, used for enrichment and verification.',
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
    @value = N'Free‑form biography or description of the contact.',
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
    @value = N'Locale/language preference for communications.',
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
    @value = N'Time zone of the contact for scheduling purposes.',
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
    @value = N'Primary landline or office phone number.',
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
    @value = N'Mobile phone number of the contact.',
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
    @value = N'City part of the contact''s address.',
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
    @value = N'State, province, or region of the contact''s address.',
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
    @value = N'Country of the contact, defaulting to United States.',
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
    @value = N'Postal/ZIP code for the contact''s address.',
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
    @value = N'Numeric score representing the contact''s engagement level; currently unused.',
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
    @value = N'Timestamp of the most recent activity performed by or on the contact.',
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
    @value = N'Link to the contact''s profile picture.',
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
    @value = N'This table stores individual membership records linking a member to a specific membership tier. Each row represents a subscription period for a member, including its status, start/end dates, renewal information, and auto‑renew settings.',
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
    @value = N'Surrogate primary key uniquely identifying each membership record.',
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
    @value = N'Foreign key to the Member table identifying the person who holds this membership.',
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
    @value = N'Foreign key to MembershipType defining which tier (e.g., standard, premium) the record represents.',
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
    @value = N'Current state of the membership (Active, Lapsed, Cancelled).',
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
    @value = N'Date the membership is scheduled to end or actually ended.',
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
    @value = N'Date the membership was (or will be) renewed; null for non‑renewed or auto‑renewed records.',
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
    @value = N'Flag indicating whether the membership should automatically renew at the end of the term.',
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
    @value = N'This table defines the various membership tiers offered by the organization, including their names, descriptions, annual dues, renewal periods, activation status, auto‑renewal and approval settings, associated benefits, and display order for UI presentation.',
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
    @value = N'Unique identifier for the membership type (primary key).',
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
    @value = N'Short label of the membership tier (e.g., Student, Corporate).',
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
    @value = N'Longer textual explanation of what the tier entails.',
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
    @value = N'Yearly fee associated with the tier (0 for free/lifetime).',
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
    @value = N'Indicates whether the tier is currently offered (always true in sample).',
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
    @value = N'Specifies if members of this tier can be auto‑renewed.',
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
    @value = N'Whether enrollment in this tier needs manual approval.',
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
    @value = N'Detailed list of benefits granted to members of this tier.',
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
    @value = N'Ordering index for presenting tiers in UI lists.',
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
    @value = N'A reference table that stores detailed information about companies or organizations, including identifiers, names, industry classification, size metrics, financial data, public market identifiers, contact details, and descriptive attributes. It serves as a foundational lookup for other entities (e.g., members of an association) that need to associate with a specific company. The catalog is relatively small (only a handful of distinct organizations) and many members are either independent individuals or belong to organizations not captured in this table, indicating a mixed individual‑and‑corporate membership model.',
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
    @value = N'Primary key uniquely identifying each company record.',
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
    @value = N'Broad business sector or industry classification of the company.',
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
    @value = N'Total market value of the company''s outstanding shares (only for publicly traded firms).',
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
    @value = N'Stock ticker symbol used on a securities exchange.',
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
    @value = N'Securities exchange where the company''s stock is listed (e.g., NYSE, NASDAQ).',
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
    @value = N'Primary public website URL for the company.',
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
    @value = N'Brief textual description of the company''s business or focus.',
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
    @value = N'Two‑letter state or province code for the company''s address.',
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
    @value = N'Country of the company''s primary location; defaults to United States.',
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
    @value = N'Postal or ZIP code for the company''s address (currently not populated).',
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
    @value = N'Primary contact telephone number for the company.',
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
    @value = N'URL to the company''s logo image (currently not populated).',
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
    @value = N'Stores individual payment transactions made against invoices, capturing when the payment occurred, how much was paid, the method used, processing details, and outcome status.',
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
    @value = N'Unique identifier for each payment record',
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
    @value = N'Reference to the invoice that this payment is applied to',
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
    @value = N'Date the customer initiated the payment',
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
    @value = N'Monetary amount of the payment',
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
    @value = N'Channel used to make the payment (e.g., Stripe, Credit Card, ACH, PayPal)',
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
    @value = N'External transaction identifier returned by the payment processor',
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
    @value = N'Current outcome of the payment attempt (Completed, Failed, etc.)',
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
    @value = N'Timestamp when the payment was processed in the system',
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
    @value = N'Reason for a failed payment, if applicable',
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
    @value = N'Optional free‑form comments about the payment',
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
    @value = N'Stores definitions of member segments used for targeting and reporting, including a unique ID, segment name, description, category (SegmentType), optional filter criteria, member count, last calculation timestamp, and active flag.',
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
    @value = N'Primary key GUID that uniquely identifies each segment definition.',
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
    @value = N'Human‑readable name of the segment (e.g., ''Technology Industry'', ''Active Members'').',
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
    @value = N'Longer text explaining the criteria or purpose of the segment.',
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
    @value = N'Category or taxonomy of the segment (e.g., Geography, Industry, Membership Status).',
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
    @value = N'Placeholder for a filter expression that defines the segment programmatically; currently null.',
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
    @value = N'Number of members currently belonging to the segment; currently zero as counts are not yet calculated.',
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
    @value = N'Timestamp of the last time MemberCount was refreshed; currently null.',
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
    @value = N'Flag indicating whether the segment is active and can be used in campaigns.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
