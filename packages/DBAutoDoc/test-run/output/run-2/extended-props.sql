-- Database Documentation Script
-- Generated: 2025-11-08T17:59:04.607Z
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
    @value = N'The AssociationDemo schema models an association’s governance, membership, communications, education, events, and financial operations. It includes entities for members, organizations, board and chapter roles, committees, campaigns, courses, enrollments, certificates, events and registrations, invoicing and payments, as well as email templates and tracking tables. The design captures relationships among these domains to support member management, governance, marketing, learning, event administration, and revenue processing.',
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
    @value = N'Stores assignments of members to specific board positions, capturing the term start/end dates, election date and active status for each board role within the association.',
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
    @value = N'Surrogate primary key for each board‑member assignment record.',
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
    @value = N'Foreign key to the BoardPosition table identifying the specific board role (e.g., President, Treasurer).',
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
    @value = N'Foreign key to the Member table identifying the person holding the board role.',
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
    @value = N'Date when the member’s term in the board position began.',
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
    @value = N'Date when the member’s term ended; null when the term is ongoing.',
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
    @value = N'Unique identifier for each board position record.',
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
    @value = N'Name of the board position (e.g., President, Treasurer, Director at Large).',
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
    @value = N'Numeric order used to sort or rank positions, lower numbers appear higher in hierarchy.',
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
    @value = N'Length of the term for the position in years (usually 2 or 3).',
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
    @value = N'Stores details of marketing campaigns, including identifiers, names, types, status, schedule, budget, and descriptive information. It serves as the central entity for campaign management and, through its relationship with the campaign‑member engagement table, tracks individual member participation, outcomes, and conversion values, enabling both aggregate and per‑member analysis.',
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
    @value = N'Primary key GUID that uniquely identifies each campaign record.',
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
    @value = N'Category of the campaign, limited to a predefined set (e.g., Member Engagement, Membership Renewal, Event Promotion, Course Launch).',
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
    @value = N'Current lifecycle state of the campaign (e.g., Completed, Active).',
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
    @value = N'Date the campaign is scheduled to finish.',
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
    @value = N'Planned monetary budget allocated for the campaign.',
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
    @value = N'Actual amount spent; currently null for all rows, indicating cost not yet recorded.',
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
    @value = N'Intended audience segment for the campaign; presently null, likely optional or to be filled later.',
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
    @value = N'Specific objectives or KPIs the campaign aims to achieve; currently null.',
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
    @value = N'Longer textual description summarizing the campaign purpose and content.',
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
    @value = N'Stores each member''s engagement record for a specific marketing campaign, optionally linked to a target segment, tracking when the member was added, their current status in the campaign lifecycle, response date and any monetary conversion value.',
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
    @value = N'Surrogate primary key for the engagement record',
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
    @value = N'Date and time when the member was added to the campaign',
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
    @value = N'Current status of the member in the campaign lifecycle (Targeted, Sent, Responded, Converted, Opted Out)',
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
    @value = N'Date and time when the member responded to the campaign (if applicable)',
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
    @value = N'Monetary value associated with a conversion event for the member',
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
    @value = N'Stores digital certificates issued to individuals for a specific enrollment, including unique certificate numbers, issue/expiration dates, PDF location, and a verification code.',
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
    @value = N'Surrogate primary key for the certificate record',
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
    @value = N'Foreign key linking the certificate to a specific enrollment record',
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
    @value = N'Human‑readable, unique identifier printed on the certificate',
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
    @value = N'Date the certificate was issued to the enrollee',
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
    @value = N'Optional date when the certificate becomes invalid or needs renewal',
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
    @value = N'URL pointing to the stored PDF version of the certificate',
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
    @value = N'Unique code used to verify the authenticity of the certificate online',
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
    @value = N'Stores details of the organization’s technology community chapters, including their identity, name, type, geographic location, founding date, description, activity status, meeting cadence and member count. It serves as the master lookup for chapters that are linked to membership and officer records.',
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
    @value = N'Primary key GUID uniquely identifying each chapter record',
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
    @value = N'Official name of the chapter (e.g., "Toronto Chapter", "AI & Machine Learning SIG")',
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
    @value = N'Category of the chapter: either Geographic or Special Interest',
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
    @value = N'Broad region classification (e.g., Northeast, West Coast, Canada)',
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
    @value = N'City where the chapter is based; nullable for non‑geographic chapters',
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
    @value = N'State or province abbreviation for the chapter’s location; nullable',
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
    @value = N'Brief narrative describing the chapter’s focus or community',
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
    @value = N'Stores the association between members and chapters, recording each member’s enrollment in a specific chapter, the date they joined, their active/inactive status, and role within the chapter.',
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
    @value = N'Surrogate primary key for each membership record',
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
    @value = N'Foreign key to the Chapter table identifying the chapter the member belongs to',
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
    @value = N'Foreign key to the Member table identifying the member linked to the chapter',
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
    @value = N'Role of the member within the chapter; currently only ‘Member’',
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
    @value = N'Stores the assignment of leadership positions (e.g., President, Vice President, Secretary) to members within specific chapters, including the start date and active status of each assignment.',
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
    @value = N'Primary key for each officer‑assignment record; uniquely identifies the row.',
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
    @value = N'Foreign key to the Chapter table; identifies the chapter where the member holds the position.',
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
    @value = N'Foreign key to the Member table; identifies the member who occupies the leadership role.',
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
    @value = N'The leadership role held by the member within the chapter (Secretary, President, Vice President).',
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
    @value = N'Date when the member began the leadership role.',
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
    @value = N'Date when the leadership role ended; null for currently active assignments.',
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
    @value = N'Flag indicating whether the assignment is currently active; defaults to true.',
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
    @value = N'Stores information about the various committees within an association, including their identity, type, purpose, meeting schedule, status, formation date, chairperson, and size limits.',
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
    @value = N'Unique identifier for each committee record',
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
    @value = N'Descriptive name of the committee or project',
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
    @value = N'Classification of the committee (Standing, Ad Hoc, or Task Force)',
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
    @value = N'Narrative statement of the committee''s mission or responsibilities',
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
    @value = N'How often the committee meets (Monthly, Quarterly, Bi-Weekly)',
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
    @value = N'Flag indicating whether the committee is currently active',
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
    @value = N'Date the committee was established',
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
    @value = N'Date the committee was dissolved, if applicable',
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
    @value = N'Reference to the Member who serves as the committee chair',
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
    @value = N'Maximum allowed number of members in the committee',
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
    @value = N'Stores the assignment of members to committees, capturing each member''s role, start date, optional end date, active status and who appointed them. It functions as a junction table linking the Committee and Member entities to model committee membership over time.',
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
    @value = N'Foreign key to the Committee table identifying the committee to which the member is assigned',
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
    @value = N'Foreign key to the Member table identifying the member participating in the committee',
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
    @value = N'Enum indicating the member''s position on the committee (Member, Chair, Vice Chair)',
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
    @value = N'Date the member''s service on the committee ended; null when still active',
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
    @value = N'Flag indicating whether the assignment is currently active; defaults to true',
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
    @value = N'Optional text indicating who appointed the member to the role; currently unused (all null)',
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
    @value = N'Stores the catalog of training courses offered, including identifiers, codes, titles, descriptions, categorization, difficulty level, duration, credit value, pricing, status, publication date, instructor, and optional prerequisite relationships.',
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
    @value = N'Primary key uniquely identifying each course record.',
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
    @value = N'Human‑readable short code used to reference the course (e.g., "LDR-203").',
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
    @value = N'Full name of the course describing its subject matter.',
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
    @value = N'Brief summary of what the course covers.',
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
    @value = N'Broad business or technical domain the course belongs to (e.g., Data Science, Cloud).',
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
    @value = N'Difficulty tier of the course: Beginner, Intermediate, or Advanced.',
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
    @value = N'Total instructional time in hours.',
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
    @value = N'Continuing Education Units awarded upon completion.',
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
    @value = N'Standard purchase price for non‑member participants.',
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
    @value = N'Discounted price offered to members or subscribers.',
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
    @value = N'Flag indicating whether the course is currently offered.',
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
    @value = N'Date the course was made publicly available.',
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
    @value = N'Name of the primary instructor delivering the course.',
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
    @value = N'Reference to another course that must be completed first.',
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
    @value = N'Link to an image representing the course (optional).',
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
    @value = N'Detailed list of skills or outcomes learners will achieve (optional).',
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
    @value = N'Stores individual click events generated when a recipient clicks a link within a sent email, linking each click to the specific EmailSend record for analytics and reporting.',
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
    @value = N'Unique identifier for each click record',
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
    @value = N'The destination URL that was clicked',
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
    @value = N'Human‑readable name of the link as defined in the email template',
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
    @value = N'IP address of the user who clicked the link (optional)',
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
    @value = N'Browser user‑agent string of the clicking client (optional)',
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
    @value = N'This table records each individual email message that was generated from an email template and sent to a member, capturing the full lifecycle of the send (queued, sent, delivered, opened, clicked, bounced, etc.) for reporting and analytics purposes.',
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
    @value = N'Surrogate primary key for the email send record; uniquely identifies each email instance.',
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
    @value = N'FK to the EmailTemplate that defines the content and subject of the email being sent.',
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
    @value = N'Optional FK to a Campaign that may have triggered the email; null for all rows indicates many sends are not tied to a campaign.',
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
    @value = N'FK to the Member who received the email; identifies the recipient.',
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
    @value = N'The subject line of the email as rendered for this send; limited to a small set of template‑derived subjects.',
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
    @value = N'Timestamp when the system queued/sent the email to the outbound service.',
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
    @value = N'Timestamp when the email was confirmed delivered to the recipient''s mailbox; null for a few bounces.',
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
    @value = N'Timestamp of the first open event; null for recipients who never opened.',
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
    @value = N'Number of times the email was opened; defaults to 0.',
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
    @value = N'Timestamp of the first click on a link within the email; null for non‑clicks.',
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
    @value = N'Number of link clicks recorded for the email; defaults to 0.',
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
    @value = N'Timestamp when the email bounced; always null because bounce handling is captured via Status/BounceType.',
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
    @value = N'Category of bounce (hard, soft, etc.); not populated in current data set.',
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
    @value = N'Textual explanation of bounce; not populated.',
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
    @value = N'Timestamp when the recipient unsubscribed via this email; not populated in current sample.',
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
    @value = N'Timestamp when the recipient marked the email as spam; not populated.',
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
    @value = N'Current state of the email send (Sent, Delivered, Opened, Clicked, Bounced, etc.); limited to four observed values.',
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
    @value = N'Identifier from the external email service (e.g., SendGrid, MailChimp); not populated in sample.',
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
    @value = N'Stores predefined email templates used by the association to compose and send various communications (welcome messages, renewal reminders, newsletters, event invitations). Each record defines the template content, sender details, category, and activation status, enabling consistent messaging across the system.',
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
    @value = N'Human‑readable title of the template (e.g., "Welcome Email - New Members").',
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
    @value = N'Default email subject line for the template.',
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
    @value = N'HTML version of the email body; currently not populated in the sample.',
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
    @value = N'Plain‑text version of the email body; currently not populated.',
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
    @value = N'Optional free‑form tags for additional categorisation; currently unused.',
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
    @value = N'This table records each member''s enrollment and progress in a specific course, capturing enrollment, start, and completion dates, status, progress percentage, scores, and administrative details such as invoicing, and it also serves as the anchor for a one‑to‑one relationship to a certificate, indicating that each enrollment can generate a time‑limited certification upon successful completion.',
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
    @value = N'Surrogate primary key for each enrollment record',
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
    @value = N'Reference to the course being taken',
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
    @value = N'Reference to the member who is enrolled',
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
    @value = N'Date the member officially enrolled in the course',
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
    @value = N'Date the member began the course content',
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
    @value = N'Date the member finished the course (if applicable)',
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
    @value = N'Planned expiration of the enrollment or certification (currently unused)',
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
    @value = N'Current state of the enrollment (Enrolled, In Progress, Completed, etc.)',
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
    @value = N'Percentage of course content completed',
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
    @value = N'Timestamp of the most recent access to the course material',
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
    @value = N'Total minutes the member spent on the course',
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
    @value = N'Score achieved on the final assessment',
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
    @value = N'Minimum score required to pass the course',
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
    @value = N'Boolean indicating whether the member met the passing score',
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
    @value = N'Reference to an invoice generated for the enrollment (currently null)',
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
    @value = N'Stores information about professional dairy education events and their individual credit‑bearing sessions, including event‑level attributes (name, type, dates, location, virtual access, pricing, overall capacity, status) and session‑level details such as speaker name, session capacity, and CEU credits, supporting continuing‑education and conference management.',
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
    @value = N'Category of the event (Conference, Workshop, Webinar).',
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
    @value = N'IANA time‑zone identifier for the event''s scheduled times.',
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
    @value = N'Boolean flag indicating whether the event is held online.',
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
    @value = N'Name of the online platform (Zoom or Teams) when IsVirtual is true.',
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
    @value = N'Direct URL for joining the virtual event.',
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
    @value = N'Reference to a chapter or regional group organizing the event (currently null for all rows).',
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
    @value = N'Overall fee for registering (currently null for all rows).',
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
    @value = N'Price for members to attend the event.',
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
    @value = N'Price for non‑members to attend the event.',
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
    @value = N'Long textual summary of the event content and objectives.',
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
    @value = N'This table records each member''s registration for an event, tracking when they signed up, the type of registration, attendance status, check‑in time, invoicing, and any CEU award or cancellation details.',
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
    @value = N'Foreign key to the Event table identifying which event the member registered for',
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
    @value = N'Foreign key to the Member table identifying the registering member',
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
    @value = N'Date the member completed the registration',
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
    @value = N'Category of registration, either Standard or Early Bird',
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
    @value = N'Current status of the registration (Attended, Registered, No Show)',
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
    @value = N'Timestamp when the member actually checked in to the event (if applicable)',
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
    @value = N'Reference to an invoice generated for the registration (if any)',
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
    @value = N'Flag indicating whether the member earned Continuing Education Units for this event',
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
    @value = N'Date the CEU was awarded to the member',
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
    @value = N'Stores individual sessions or agenda items that belong to a larger event, capturing details such as title, timing, location, speaker, type, capacity and any CEU credits awarded.',
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
    @value = N'Primary key that uniquely identifies each session record.',
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
    @value = N'Foreign key linking the session to its parent event.',
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
    @value = N'Longer text describing the session content and objectives.',
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
    @value = N'Represents the invoice header for association members, aggregating multiple line‑item records such as event registrations, membership dues, and course enrollments, and storing invoice identifiers, dates, monetary totals, payment status, and a reference to the member; each invoice is linked to a single payment record, indicating full settlement per invoice.',
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
    @value = N'Primary key uniquely identifying each invoice record.',
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
    @value = N'Human‑readable invoice code used for external reference and communication.',
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
    @value = N'Date by which payment for the invoice is expected.',
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
    @value = N'Tax amount applied to the SubTotal.',
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
    @value = N'Final amount due after adding tax and subtracting discounts.',
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
    @value = N'Remaining amount owed (Total minus AmountPaid).',
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
    @value = N'Current lifecycle state of the invoice (e.g., Paid, Sent, Overdue).',
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
    @value = N'Text describing the payment terms (e.g., Net 30), currently unused.',
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
    @value = N'Stores individual line items for each invoice, detailing what was sold or billed (e.g., event registrations, membership dues, course enrollments), the pricing, tax, and the related business entity that the line item refers to.',
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
    @value = N'Unique identifier for the line‑item record.',
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
    @value = N'Reference to the parent invoice that this line item belongs to.',
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
    @value = N'Human‑readable text describing the product or service billed on this line.',
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
    @value = N'Categorical type of the line item (Event Registration, Membership Dues, Course Enrollment, etc.).',
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
    @value = N'Number of units for the line item; always 1 in this system.',
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
    @value = N'Total price for the line (UnitPrice × Quantity).',
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
    @value = N'Tax applied to the line item.',
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
    @value = N'Type of the business entity that the line item is linked to (Event, Membership, or Course).',
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
    @value = N'Identifier of the specific event, membership record, or course that this line item references.',
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
    @value = N'Stores individual member/contact records linked to an organization, capturing personal and professional details and indicating eligibility for leadership positions such as board members, committee chairs, and chapter roles, supporting association management, communications, event participation, and governance.',
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
    @value = N'Unique identifier for each person record.',
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
    @value = N'Primary contact email address of the person.',
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
    @value = N'Given name of the person.',
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
    @value = N'Family name of the person.',
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
    @value = N'Job title or role of the person within their organization.',
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
    @value = N'Reference to the organization the person is associated with.',
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
    @value = N'Industry sector of the person''s organization or professional focus.',
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
    @value = N'Broad functional area of the person''s work (e.g., Design, DevOps).',
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
    @value = N'Number of years the person has worked in their profession.',
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
    @value = N'Date the person joined the association or became a member.',
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
    @value = N'URL to the person''s LinkedIn profile.',
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
    @value = N'Free‑form biography or description of the person.',
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
    @value = N'Language preference for communications; defaults to en-US.',
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
    @value = N'Time zone of the person (currently not populated).',
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
    @value = N'Primary phone number for the person.',
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
    @value = N'Mobile phone number (currently not populated).',
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
    @value = N'City of residence or business location.',
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
    @value = N'State or province abbreviation.',
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
    @value = N'Country of the person; defaults to United States.',
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
    @value = N'Postal/ZIP code (currently not populated).',
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
    @value = N'Numeric score representing member engagement; currently always 0.',
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
    @value = N'Timestamp of the last activity performed by the member.',
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
    @value = N'Link to the member''s profile picture.',
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
    @value = N'Represents an individual member record, linking each member to a MembershipType (tier) via a foreign key. The table stores member‑specific details and status, and inherits tier attributes such as dues and benefits from the MembershipType lookup, while also tracking lifecycle dates (StartDate, EndDate, RenewalDate) and renewal settings.',
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
    @value = N'Surrogate primary key for the membership record.',
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
    @value = N'Reference to the member who holds this subscription.',
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
    @value = N'Reference to the membership plan or tier applied to the member.',
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
    @value = N'Current state of the membership (Active, Lapsed, Cancelled, etc.).',
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
    @value = N'Date when the membership is due for renewal; null when not applicable.',
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
    @value = N'Flag indicating whether the membership should renew automatically.',
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
    @value = N'Text explaining why the membership was cancelled.',
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
    @value = N'Defines the catalog of membership tiers offered by the organization, including their names, descriptions, annual dues, renewal periods, activation status, auto‑renewal and approval settings, benefit details, and display order for UI presentation.',
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
    @value = N'Surrogate primary key uniquely identifying each membership tier.',
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
    @value = N'Yearly fee associated with the tier; 0 for complimentary memberships.',
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
    @value = N'Number of months a membership is valid before renewal (default 12, with a 1200‑month option for lifetime).',
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
    @value = N'Flag indicating whether the tier is currently offered.',
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
    @value = N'Whether members of this tier may be automatically renewed.',
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
    @value = N'Indicates if enrollment in the tier needs manual approval.',
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
    @value = N'Detailed list of perks and services included with the tier.',
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
    @value = N'Numeric order used to present tiers in UI lists.',
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
    @value = N'Stores master records for companies/organizations, primarily in the dairy and food sectors, including identifying, location, industry, financial, and contact information. It functions as a tenant or parent entity in a multi‑tenant design, grouping large numbers of members (e.g., only 11 distinct organizations across 2,000 members), and serves as a foundational entity for related tables such as Member and Contact.',
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
    @value = N'Unique identifier (GUID) for each company record',
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
    @value = N'Legal or trade name of the company',
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
    @value = N'Broad industry classification of the company',
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
    @value = N'Number of employees working for the company',
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
    @value = N'Total yearly revenue reported by the company (in local currency)',
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
    @value = N'Total market value of the company''s publicly traded shares, when applicable',
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
    @value = N'Stock ticker symbol for publicly traded companies',
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
    @value = N'Stock exchange where the ticker is listed',
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
    @value = N'Company''s public website URL',
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
    @value = N'Brief textual description of the company''s business or services',
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
    @value = N'Calendar year the company was established',
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
    @value = N'City where the company''s primary address is located',
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
    @value = N'State or province abbreviation of the company''s address',
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
    @value = N'Country of the company''s headquarters, default United States',
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
    @value = N'Postal/ZIP code of the company''s address (currently not populated)',
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
    @value = N'Primary contact phone number for the company',
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
    @value = N'URL to the company''s logo image (currently not populated)',
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
    @value = N'This table records individual payment transactions made against invoices. Each row captures when a payment was made, the amount, the method used, the external transaction identifier, and the processing outcome, linking back to the specific invoice it settles.',
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
    @value = N'Surrogate primary key for the payment record, generated sequentially to ensure uniqueness.',
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
    @value = N'Foreign key linking the payment to the invoice it settles; one‑to‑one relationship as each invoice appears only once here.',
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
    @value = N'Date the payment was initiated or captured from the payer.',
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
    @value = N'Monetary value of the payment, matching the invoice total or partial amount paid.',
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
    @value = N'Enum indicating how the payment was processed (e.g., Credit Card, Stripe, PayPal, ACH).',
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
    @value = N'External identifier supplied by the payment processor for reconciliation.',
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
    @value = N'Current state of the payment – primarily ''Completed'' or ''Failed''.',
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
    @value = N'Timestamp when the system recorded the payment outcome (often a few minutes after PaymentDate).',
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
    @value = N'Textual explanation for a failed payment; currently always null, indicating failures are rare or not captured yet.',
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
    @value = N'Optional free‑form comments about the payment (e.g., manual adjustments).',
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
    @value = N'Stores definitions of member segments used for targeting, reporting, and campaign management. Each row represents a distinct segment with its name, description, type, and metadata such as activity status and calculated member count.',
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
    @value = N'Unique identifier for each segment; primary key.',
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
    @value = N'Human‑readable name of the segment (e.g., "Technology Industry").',
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
    @value = N'Longer textual description explaining the segment''s criteria.',
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
    @value = N'Category or taxonomy of the segment (e.g., Engagement, Industry).',
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
    @value = N'Stored filter expression or query that defines the segment (currently null).',
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
    @value = N'Number of members currently belonging to the segment; calculated field.',
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
    @value = N'Timestamp of the last member‑count calculation (null indicates never calculated).',
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
    @value = N'Flag indicating whether the segment is active and usable in campaigns.',
    @level0type = N'SCHEMA',
    @level0name = N'AssociationDemo',
    @level1type = N'TABLE',
    @level1name = N'Segment',
    @level2type = N'COLUMN',
    @level2name = N'IsActive';
GO
