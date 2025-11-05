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

PRINT 'Governance schema tables created successfully!';
PRINT 'Tables: Committee, CommitteeMembership, BoardPosition, BoardMember';
GO
