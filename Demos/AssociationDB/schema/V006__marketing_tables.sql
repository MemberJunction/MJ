/******************************************************************************
 * Association Sample Database - Marketing Schema Tables
 * File: V006__marketing_tables.sql
 *
 * Creates marketing and campaign management tables including:
 * - Campaign: Marketing campaigns and initiatives
 * - Segment: Member segmentation for targeting
 * - CampaignMember: Members targeted by campaigns
 ******************************************************************************/

-- ============================================================================
-- Campaign Table
-- ============================================================================
CREATE TABLE [marketing].[Campaign] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [CampaignType] NVARCHAR(50) NOT NULL CHECK ([CampaignType] IN ('Email', 'Event Promotion', 'Membership Renewal', 'Course Launch', 'Donation Drive', 'Member Engagement')),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Draft', 'Scheduled', 'Active', 'Completed', 'Cancelled')),
    [StartDate] DATE,
    [EndDate] DATE,
    [Budget] DECIMAL(12,2),
    [ActualCost] DECIMAL(12,2),
    [TargetAudience] NVARCHAR(MAX),
    [Goals] NVARCHAR(MAX),
    [Description] NVARCHAR(MAX)
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Campaign_Type ON [marketing].[Campaign]([CampaignType]);
CREATE INDEX IX_Campaign_Status ON [marketing].[Campaign]([Status]);
CREATE INDEX IX_Campaign_Dates ON [marketing].[Campaign]([StartDate], [EndDate]);
GO

-- ============================================================================
-- Segment Table
-- ============================================================================
CREATE TABLE [marketing].[Segment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [SegmentType] NVARCHAR(50),
    [FilterCriteria] NVARCHAR(MAX),
    [MemberCount] INT,
    [LastCalculatedDate] DATETIME,
    [IsActive] BIT NOT NULL DEFAULT 1
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Segment_Type ON [marketing].[Segment]([SegmentType]);
CREATE INDEX IX_Segment_Active ON [marketing].[Segment]([IsActive]);
GO

-- ============================================================================
-- CampaignMember Table
-- ============================================================================
CREATE TABLE [marketing].[CampaignMember] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CampaignID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [SegmentID] UNIQUEIDENTIFIER,
    [AddedDate] DATETIME NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Targeted', 'Sent', 'Responded', 'Converted', 'Opted Out')),
    [ResponseDate] DATETIME,
    [ConversionValue] DECIMAL(12,2),
    CONSTRAINT FK_CampaignMember_Campaign FOREIGN KEY ([CampaignID])
        REFERENCES [marketing].[Campaign]([ID]),
    CONSTRAINT FK_CampaignMember_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID]),
    CONSTRAINT FK_CampaignMember_Segment FOREIGN KEY ([SegmentID])
        REFERENCES [marketing].[Segment]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_CampaignMember_Campaign ON [marketing].[CampaignMember]([CampaignID]);
CREATE INDEX IX_CampaignMember_Member ON [marketing].[CampaignMember]([MemberID]);
CREATE INDEX IX_CampaignMember_Segment ON [marketing].[CampaignMember]([SegmentID]);
CREATE INDEX IX_CampaignMember_Status ON [marketing].[CampaignMember]([Status]);
GO

PRINT 'Marketing schema tables created successfully!';
PRINT 'Tables: Campaign, Segment, CampaignMember';
GO
