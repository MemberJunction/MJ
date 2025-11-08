-- Database Documentation Script
-- Generated: 2025-11-08T22:37:29.761Z
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
    @value = N'Stores the assignment of association members to specific board positions, including term start/end dates, election date and active status, enabling tracking of board composition over time.',
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
    @value = N'Surrogate primary key uniquely identifying each board‑member assignment record',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'BoardMember',
    @level2type = N'COLUMN',
    @level2name = N'ID';
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
    @value = N'Stores the definition of board positions within an organization, including title, display order, term length, officer status, and active flag. Used as a lookup for assigning members to specific board roles.',
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
    @value = N'Numeric order used to sort or rank positions for display or hierarchy.',
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
    @value = N'Optional free‑text description of the position; currently unused.',
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
    @value = N'Length of the elected term for the position, expressed in years (2 or 3).',
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
    @value = N'Indicates if the position is currently active in the organization; all rows are true.',
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
    @value = N'Stores definitions of marketing campaigns, including their identifiers, names, type, status, schedule, budget, and descriptive details. It serves as the central reference for campaign execution and tracking within the system.',
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
    @value = N'Unique identifier for each campaign record',
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
    @value = N'Human‑readable title of the campaign',
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
    @value = N'Date when the campaign is scheduled to begin',
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
    @value = N'Date when the campaign is scheduled to end',
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
    @value = N'Planned monetary allocation for the campaign',
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
    @value = N'Actual expenditure incurred; currently null for all rows',
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
    @value = N'Intended audience segment for the campaign; currently null',
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
    @value = N'Specific objectives the campaign aims to achieve; currently null',
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
    @value = N'Detailed narrative of the campaign purpose and content',
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
    @value = N'Stores a record for each member''s interaction with a marketing campaign (optionally within a specific segment), tracking when the member was added to the campaign, current status, response date and any monetary conversion value.',
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
    @value = N'Primary key for the interaction record, uniquely identifies each row.',
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
    @value = N'Identifier of the campaign to which the member is linked.',
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
    @value = N'Identifier of the member participating in the campaign.',
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
    @value = N'Optional identifier of the segment used for targeting this member within the campaign.',
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
    @value = N'Timestamp when the member was added to the campaign (or segment).',
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
    @value = N'Current state of the member in the campaign lifecycle (Targeted, Sent, Responded, Converted, Opted Out).',
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
    @value = N'Date the member responded to the campaign (e.g., opened, clicked, or replied).',
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
    @value = N'Monetary value attributed to the member''s conversion (e.g., purchase amount).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'CampaignMember',
    @level2type = N'COLUMN',
    @level2name = N'ConversionValue';
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
    @value = N'Stores information about the various chapters of a professional association, including their identifiers, names, type (geographic or special interest), location details, founding dates, descriptions, activity status, meeting frequency, and member count.',
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
    @value = N'Unique identifier for each chapter, generated sequentially.',
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
    @value = N'Human‑readable name of the chapter (e.g., "Toronto Chapter").',
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
    @value = N'Classifies the chapter as either Geographic or Special Interest.',
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
    @value = N'Broad geographic region where the chapter operates (e.g., "West Coast", "Canada").',
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
    @value = N'Specific city of the chapter when applicable.',
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
    @value = N'State or province abbreviation for the chapter''s location.',
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
    @value = N'Country of the chapter, defaulting to United States.',
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
    @value = N'Date the chapter was established.',
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
    @value = N'Brief narrative describing the chapter''s focus or community.',
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
    @value = N'URL for the chapter''s website (currently missing).',
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
    @value = N'Contact email address for the chapter (currently missing).',
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
    @value = N'Flag indicating whether the chapter is currently active.',
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
    @value = N'How often the chapter meets (Monthly or Quarterly).',
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
    @value = N'Number of members in the chapter (currently unknown).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Chapter',
    @level2type = N'COLUMN',
    @level2name = N'MemberCount';
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
    @value = N'Stores predefined email templates used by the association for various communications (welcome, renewal reminders, newsletters, event invitations). Each record defines the template''s identity, content metadata, sender details, category, and activation status, enabling consistent email generation across the system.',
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
    @value = N'Unique identifier for each email template (primary key).',
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
    @value = N'Human‑readable name of the template, used to select a template in the UI or code.',
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
    @value = N'Default subject line for the email when this template is used.',
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
    @value = N'Display name shown as the sender of the email.',
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
    @value = N'Email address used as the sender address for the template.',
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
    @value = N'Optional reply‑to address; currently null for all templates.',
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
    @value = N'HTML version of the email body; currently empty/null, possibly stored elsewhere or to be filled later.',
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
    @value = N'Plain‑text version of the email body; also null for now.',
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
    @value = N'Flag indicating whether the template is active and can be used for sending.',
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
    @value = N'Optional tagging field for additional classification; currently unused (null).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EmailTemplate',
    @level2type = N'COLUMN',
    @level2name = N'Tags';
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
    @value = N'Represents industry events (conferences, webinars, workshops, etc.) related to cheese production and business, storing overall event details such as type, dates, location, virtual access, registration windows, pricing, CEU credits, and status, while also serving as the parent entity for multiple EventSession records that define the event’s agenda—each session includes its own speaker, room, start/end times, capacity, and CEU allocation.',
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
    @value = N'Unique identifier for each event record.',
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
    @value = N'Category of the event (Conference, Webinar, Workshop).',
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
    @value = N'Physical venue or indication that the event is virtual.',
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
    @value = N'Flag indicating whether the event is held online.',
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
    @value = N'Online platform used for virtual events (Zoom or Teams).',
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
    @value = N'Link to join the virtual meeting.',
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
    @value = N'Identifier of the association chapter hosting the event (currently null for all rows).',
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
    @value = N'Maximum number of attendees allowed.',
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
    @value = N'Overall fee required to register (currently null for all rows).',
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
    @value = N'Registration price for members of the association.',
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
    @value = N'Full narrative describing the event content and objectives.',
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
    @value = N'Stores individual sessions or program items that belong to a larger event, capturing details such as title, description, schedule, location, speaker, type, capacity and CEU credits.',
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
    @value = N'Unique identifier for the session record.',
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
    @value = N'Reference to the parent event to which the session belongs.',
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
    @value = N'Date and time when the session begins.',
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
    @value = N'Date and time when the session ends.',
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
    @value = N'Physical or virtual location where the session is held.',
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
    @value = N'Category of the session (e.g., workshop, lecture, panel).',
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
    @value = N'Continuing Education Units awarded for attending the session.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'EventSession',
    @level2type = N'COLUMN',
    @level2name = N'CEUCredits';
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
    @value = N'Stores individual member or contact records for an association, capturing personal, professional, and contact details and linking each person to their employer organization when applicable.',
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
    @value = N'Primary key uniquely identifying each member record',
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
    @value = N'Member''s email address, used as a unique contact identifier',
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
    @value = N'Member''s given name',
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
    @value = N'Member''s family name',
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
    @value = N'Professional title or role of the member within their organization',
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
    @value = N'Reference to the employer or affiliated organization',
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
    @value = N'Industry sector of the member''s organization or work focus',
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
    @value = N'Broad functional area of the member''s work (e.g., Leadership, Design)',
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
    @value = N'Number of years the member has worked in their profession',
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
    @value = N'Date the member joined the association or was added to the system',
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
    @value = N'URL to the member''s LinkedIn profile (optional)',
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
    @value = N'Free‑form biography or description of the member (currently empty)',
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
    @value = N'Member''s preferred language for communications',
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
    @value = N'Member''s time zone (currently not populated)',
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
    @value = N'Primary phone number for the member (optional)',
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
    @value = N'Mobile phone number (currently not populated)',
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
    @value = N'City of the member''s address or location',
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
    @value = N'State, province, or region code of the member''s location',
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
    @value = N'Country of the member, defaulting to United States',
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
    @value = N'Postal or ZIP code (currently not populated)',
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
    @value = N'Numeric score representing member engagement (currently zero)',
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
    @value = N'Timestamp of the member''s most recent activity (currently null)',
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
    @value = N'Link to the member''s profile picture (currently null)',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Member',
    @level2type = N'COLUMN',
    @level2name = N'ProfilePhotoURL';
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
    @value = N'This table defines the various membership tiers offered by the organization, including their names, descriptions, fees, renewal terms, eligibility rules, benefits, and display ordering. It serves as a lookup for member records to classify each member’s subscription type.',
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
    @value = N'Unique identifier (GUID) for the membership tier',
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
    @value = N'Short label of the membership tier (e.g., Student, Corporate)',
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
    @value = N'Longer textual explanation of what the tier entails',
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
    @value = N'Yearly fee charged for the tier (0 for free or lifetime)',
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
    @value = N'Number of months the membership is valid before renewal (12 for annual, 1200 for lifetime)',
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
    @value = N'Flag indicating whether the tier is currently offered',
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
    @value = N'Whether members of this tier can be automatically renewed',
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
    @value = N'Whether enrollment in this tier requires manual approval',
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
    @value = N'Detailed list of benefits provided to members of this tier',
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
    @value = N'Numeric order used to present tiers in UI lists',
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
    @value = N'Stores detailed information about companies or organizations, including identifiers, names, industry classification, financial metrics, contact details, and location data. Serves as a master reference for entities that other tables (e.g., members, contacts) relate to.',
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
    @value = N'Surrogate primary key uniquely identifying each company record.',
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
    @value = N'Broad sector or market segment the company operates in.',
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
    @value = N'Number of employees working for the company.',
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
    @value = N'Total revenue generated by the company in a fiscal year.',
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
    @value = N'Total market value of the company''s publicly traded shares.',
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
    @value = N'Securities exchange where the company''s stock is listed.',
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
    @value = N'Public-facing website URL of the company.',
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
    @value = N'Brief textual description of the company''s products, services, or mission.',
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
    @value = N'City where the company''s primary address is located.',
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
    @value = N'Country of the company''s headquarters.',
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
    @value = N'URL to the company''s logo image (currently not populated).',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Organization',
    @level2type = N'COLUMN',
    @level2name = N'LogoURL';
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
    @value = N'Stores definitions of member segments used for targeting and reporting within the association''s membership system. Each row defines a named segment, its description, category, and metadata such as activity status and calculated member count.',
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
    @value = N'Human‑readable name of the segment (e.g., "West Coast Region").',
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
    @value = N'Longer textual description explaining the criteria or purpose of the segment.',
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
    @value = N'Category or taxonomy of the segment (e.g., Industry, Geography, Engagement).',
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
    @value = N'Placeholder for a stored filter expression that defines the segment logic; currently null for all rows.',
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
    @value = N'Number of members currently belonging to the segment; presently zero because counts have not been calculated.',
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
    @value = N'Timestamp of the last time MemberCount was refreshed; null indicates no calculation performed yet.',
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
    @value = N'Flag indicating whether the segment is active and can be used in campaigns; defaults to true.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
