/******************************************************************************
 * Association Sample Database - Chapters Schema Tables
 * File: V008__chapters_tables.sql
 *
 * Creates chapter and community management tables including:
 * - Chapter: Local chapters and special interest groups
 * - ChapterMembership: Member participation in chapters
 * - ChapterOfficer: Chapter leadership positions
 ******************************************************************************/

-- ============================================================================
-- Chapter Table
-- ============================================================================
CREATE TABLE [chapters].[Chapter] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [ChapterType] NVARCHAR(50) NOT NULL CHECK ([ChapterType] IN ('Geographic', 'Special Interest', 'Industry')),
    [Region] NVARCHAR(100),
    [City] NVARCHAR(100),
    [State] NVARCHAR(50),
    [Country] NVARCHAR(100) DEFAULT 'United States',
    [FoundedDate] DATE,
    [Description] NVARCHAR(MAX),
    [Website] NVARCHAR(500),
    [Email] NVARCHAR(255),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [MeetingFrequency] NVARCHAR(100),
    [MemberCount] INT
);
GO

-- Extended properties for Chapter
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Local chapters and special interest groups within the association',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter name',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter type: Geographic, Special Interest, or Industry',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'ChapterType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date chapter was founded',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'FoundedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often the chapter meets',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of active members in this chapter',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MemberCount';
GO

-- ============================================================================
-- ChapterMembership Table
-- ============================================================================
CREATE TABLE [chapters].[ChapterMembership] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ChapterID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [JoinDate] DATE NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Active', 'Inactive')),
    [Role] NVARCHAR(100),
    CONSTRAINT FK_ChapterMembership_Chapter FOREIGN KEY ([ChapterID])
        REFERENCES [chapters].[Chapter]([ID]),
    CONSTRAINT FK_ChapterMembership_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Extended properties for ChapterMembership
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participation in local chapters',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this membership is for',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participating in chapter',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the chapter',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership status: Active or Inactive',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role within chapter (Member, Officer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Role';
GO

-- ============================================================================
-- ChapterOfficer Table
-- ============================================================================
CREATE TABLE [chapters].[ChapterOfficer] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ChapterID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Position] NVARCHAR(100) NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_ChapterOfficer_Chapter FOREIGN KEY ([ChapterID])
        REFERENCES [chapters].[Chapter]([ID]),
    CONSTRAINT FK_ChapterOfficer_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Extended properties for ChapterOfficer
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter leadership positions and officers',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this officer serves',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as officer',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Officer position (President, Vice President, Secretary, etc.)',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'Position';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of officer term',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of officer term',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'EndDate';
GO

PRINT 'Chapters schema tables created successfully!';
PRINT 'Tables: Chapter, ChapterMembership, ChapterOfficer';
GO
