/******************************************************************************
 * Association Sample Database - Legislative Tracking & Advocacy Domain
 * File: V008__create_legislative_tracking_tables.sql
 *
 * This file creates the Legislative Tracking and Advocacy tables for monitoring
 * regulations, bills, and policy issues affecting the cheese industry.
 * All tables use the [AssociationDemo] schema prefix.
 *
 * Domain: Legislative Tracking & Advocacy
 * - LegislativeBody: Legislative/regulatory bodies (Congress, state legislatures, etc.)
 * - LegislativeIssue: Bills, regulations, and policy issues being tracked
 * - PolicyPosition: Association's official stances on issues
 * - GovernmentContact: Legislators, regulators, and agency officials
 * - AdvocacyAction: Member advocacy activities and engagement
 * - RegulatoryComment: Official comments on proposed regulations
 *
 * Total Tables: 6
 ******************************************************************************/

-- ============================================================================
-- LEGISLATIVE TRACKING & ADVOCACY DOMAIN
-- ============================================================================

-- ============================================================================
-- LegislativeBody Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[LegislativeBody] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [BodyType] NVARCHAR(50) NOT NULL CHECK ([BodyType] IN ('Federal Congress', 'Federal Agency', 'State Legislature', 'State Agency', 'County', 'City', 'Regulatory Board', 'International')),
    [Level] NVARCHAR(20) NOT NULL CHECK ([Level] IN ('Federal', 'State', 'County', 'City', 'International')),
    [State] NVARCHAR(2),
    [Country] NVARCHAR(100) DEFAULT 'United States',
    [Description] NVARCHAR(MAX),
    [Website] NVARCHAR(500),
    [SessionSchedule] NVARCHAR(500),
    [IsActive] BIT DEFAULT 1
);
GO

-- ============================================================================
-- LegislativeIssue Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[LegislativeIssue] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [LegislativeBodyID] UNIQUEIDENTIFIER NOT NULL,
    [Title] NVARCHAR(500) NOT NULL,
    [IssueType] NVARCHAR(50) NOT NULL CHECK ([IssueType] IN ('Bill', 'Regulation', 'Rule', 'Policy', 'Amendment', 'Resolution', 'Executive Order', 'Court Case')),
    [BillNumber] NVARCHAR(100),
    [Status] NVARCHAR(50) NOT NULL CHECK ([Status] IN ('Introduced', 'In Committee', 'Passed Committee', 'Floor Vote Pending', 'Passed House', 'Passed Senate', 'Enacted', 'Signed', 'Vetoed', 'Failed', 'Withdrawn', 'Comment Period', 'Final Rule')),
    [IntroducedDate] DATE,
    [LastActionDate] DATE,
    [EffectiveDate] DATE,
    [Summary] NVARCHAR(MAX),
    [ImpactLevel] NVARCHAR(20) CHECK ([ImpactLevel] IN ('Critical', 'High', 'Medium', 'Low', 'Monitoring')),
    [ImpactDescription] NVARCHAR(MAX),
    [Category] NVARCHAR(100) CHECK ([Category] IN ('Food Safety', 'Labeling', 'Import/Export', 'Dairy Pricing', 'Environmental', 'Labor', 'Taxation', 'Animal Welfare', 'Raw Milk', 'Organic Standards', 'Trade', 'Farm Bill', 'Other')),
    [Sponsor] NVARCHAR(255),
    [TrackingURL] NVARCHAR(500),
    [IsActive] BIT DEFAULT 1,
    CONSTRAINT FK_LegislativeIssue_Body FOREIGN KEY ([LegislativeBodyID])
        REFERENCES [AssociationDemo].[LegislativeBody]([ID])
);
GO

-- ============================================================================
-- PolicyPosition Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[PolicyPosition] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [LegislativeIssueID] UNIQUEIDENTIFIER NOT NULL,
    [Position] NVARCHAR(30) NOT NULL CHECK ([Position] IN ('Support', 'Oppose', 'Support with Amendments', 'Neutral', 'Monitoring')),
    [PositionStatement] NVARCHAR(MAX) NOT NULL,
    [Rationale] NVARCHAR(MAX),
    [AdoptedDate] DATE NOT NULL,
    [AdoptedBy] NVARCHAR(255),
    [ExpirationDate] DATE,
    [Priority] NVARCHAR(20) CHECK ([Priority] IN ('Critical', 'High', 'Medium', 'Low')),
    [IsPublic] BIT DEFAULT 1,
    [DocumentURL] NVARCHAR(500),
    [ContactPerson] NVARCHAR(255),
    [LastReviewedDate] DATE,
    CONSTRAINT FK_PolicyPosition_Issue FOREIGN KEY ([LegislativeIssueID])
        REFERENCES [AssociationDemo].[LegislativeIssue]([ID])
);
GO

-- ============================================================================
-- GovernmentContact Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[GovernmentContact] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [LegislativeBodyID] UNIQUEIDENTIFIER,
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Title] NVARCHAR(255),
    [ContactType] NVARCHAR(50) NOT NULL CHECK ([ContactType] IN ('Senator', 'Representative', 'Legislator', 'Committee Chair', 'Committee Member', 'Agency Head', 'Regulator', 'Staff Member', 'Governor', 'Mayor', 'Commissioner', 'Judge', 'Other')),
    [Party] NVARCHAR(50),
    [District] NVARCHAR(100),
    [Committee] NVARCHAR(255),
    [Email] NVARCHAR(255),
    [Phone] NVARCHAR(50),
    [OfficeAddress] NVARCHAR(500),
    [Website] NVARCHAR(500),
    [TermStart] DATE,
    [TermEnd] DATE,
    [Notes] NVARCHAR(MAX),
    [IsActive] BIT DEFAULT 1,
    CONSTRAINT FK_GovernmentContact_Body FOREIGN KEY ([LegislativeBodyID])
        REFERENCES [AssociationDemo].[LegislativeBody]([ID])
);
GO

-- ============================================================================
-- AdvocacyAction Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[AdvocacyAction] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [LegislativeIssueID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER,
    [GovernmentContactID] UNIQUEIDENTIFIER,
    [ActionType] NVARCHAR(50) NOT NULL CHECK ([ActionType] IN ('Email', 'Phone Call', 'Meeting', 'Letter', 'Testimony', 'Petition Signature', 'Social Media', 'Event Attendance', 'Campaign Contribution', 'Other')),
    [ActionDate] DATE NOT NULL,
    [Description] NVARCHAR(MAX),
    [Outcome] NVARCHAR(MAX),
    [FollowUpRequired] BIT DEFAULT 0,
    [FollowUpDate] DATE,
    [Notes] NVARCHAR(MAX),
    CONSTRAINT FK_AdvocacyAction_Issue FOREIGN KEY ([LegislativeIssueID])
        REFERENCES [AssociationDemo].[LegislativeIssue]([ID]),
    CONSTRAINT FK_AdvocacyAction_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_AdvocacyAction_Contact FOREIGN KEY ([GovernmentContactID])
        REFERENCES [AssociationDemo].[GovernmentContact]([ID])
);
GO

-- ============================================================================
-- RegulatoryComment Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[RegulatoryComment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [LegislativeIssueID] UNIQUEIDENTIFIER NOT NULL,
    [DocketNumber] NVARCHAR(100),
    [CommentPeriodStart] DATE,
    [CommentPeriodEnd] DATE,
    [SubmittedDate] DATE NOT NULL,
    [SubmittedBy] NVARCHAR(255),
    [CommentText] NVARCHAR(MAX) NOT NULL,
    [CommentType] NVARCHAR(50) CHECK ([CommentType] IN ('Individual', 'Organization', 'Coalition', 'Technical', 'Public Hearing')),
    [AttachmentURL] NVARCHAR(500),
    [ConfirmationNumber] NVARCHAR(100),
    [Status] NVARCHAR(50) DEFAULT 'Submitted' CHECK ([Status] IN ('Draft', 'Submitted', 'Acknowledged', 'Published', 'Considered', 'Rejected')),
    [Response] NVARCHAR(MAX),
    [Notes] NVARCHAR(MAX),
    CONSTRAINT FK_RegulatoryComment_Issue FOREIGN KEY ([LegislativeIssueID])
        REFERENCES [AssociationDemo].[LegislativeIssue]([ID])
);
GO
