/******************************************************************************
 * Association Sample Database - Governance Schema Tables
 * File: V009__governance_tables.sql
 *
 * Creates governance and volunteer management tables including:
 * - Committee: Committees and task forces
 * - CommitteeMembership: Committee member assignments
 * - BoardPosition: Board of directors positions
 ******************************************************************************/

-- ============================================================================
-- Committee Table
-- ============================================================================
CREATE TABLE [governance].[Committee] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [CommitteeType] NVARCHAR(50) NOT NULL CHECK ([CommitteeType] IN ('Standing', 'Ad Hoc', 'Task Force')),
    [Purpose] NVARCHAR(MAX),
    [MeetingFrequency] NVARCHAR(100),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [FormedDate] DATE,
    [DisbandedDate] DATE,
    [ChairMemberID] UNIQUEIDENTIFIER,
    [MaxMembers] INT,
    CONSTRAINT FK_Committee_Chair FOREIGN KEY ([ChairMemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Extended properties for Committee
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Association committees and task forces',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee name',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee type: Standing, Ad Hoc, or Task Force',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'CommitteeType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Purpose and charter of the committee',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'Purpose';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often committee meets',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date committee was formed',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'FormedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as committee chair',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'ChairMemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum number of committee members allowed',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'MaxMembers';
GO

-- ============================================================================
-- CommitteeMembership Table
-- ============================================================================
CREATE TABLE [governance].[CommitteeMembership] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CommitteeID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Role] NVARCHAR(100) NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [AppointedBy] NVARCHAR(255),
    CONSTRAINT FK_CommitteeMember_Committee FOREIGN KEY ([CommitteeID])
        REFERENCES [governance].[Committee]([ID]),
    CONSTRAINT FK_CommitteeMember_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Extended properties for CommitteeMembership
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee member assignments and roles',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee this membership is for',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'CommitteeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving on committee',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role on committee (Chair, Vice Chair, Member, etc.)',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'Role';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of committee service',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of committee service',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Who appointed this member to the committee',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'AppointedBy';
GO

-- ============================================================================
-- BoardPosition Table
-- ============================================================================
CREATE TABLE [governance].[BoardPosition] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [PositionTitle] NVARCHAR(100) NOT NULL,
    [PositionOrder] INT NOT NULL,
    [Description] NVARCHAR(MAX),
    [TermLengthYears] INT,
    [IsOfficer] BIT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1
);
GO

-- Extended properties for BoardPosition
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Board of directors positions',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardPosition';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Position title (President, Vice President, Treasurer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'PositionTitle';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Display order for listing positions',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'PositionOrder';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Length of term in years',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'TermLengthYears';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this is an officer position',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'IsOfficer';
GO

-- ============================================================================
-- BoardMember Table
-- ============================================================================
CREATE TABLE [governance].[BoardMember] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [BoardPositionID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [ElectionDate] DATE,
    CONSTRAINT FK_BoardMember_Position FOREIGN KEY ([BoardPositionID])
        REFERENCES [governance].[BoardPosition]([ID]),
    CONSTRAINT FK_BoardMember_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Extended properties for BoardMember
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current and historical board members',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Board position held',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'BoardPositionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving on board',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of board service',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of board service',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member was elected to this position',
    @level0type = N'SCHEMA', @level0name = 'governance',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'ElectionDate';
GO

PRINT 'Governance schema tables created successfully!';
PRINT 'Tables: Committee, CommitteeMembership, BoardPosition, BoardMember';
GO
