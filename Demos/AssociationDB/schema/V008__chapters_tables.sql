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

PRINT 'Chapters schema tables created successfully!';
PRINT 'Tables: Chapter, ChapterMembership, ChapterOfficer';
GO
