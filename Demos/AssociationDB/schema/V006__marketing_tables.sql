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

-- Extended properties for Campaign
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Marketing campaigns and promotional initiatives',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign name',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign type: Email, Event Promotion, Membership Renewal, Course Launch, Donation Drive, or Member Engagement',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'CampaignType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign status: Draft, Scheduled, Active, Completed, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign start date',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign end date',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Budgeted amount for campaign',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Budget';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Actual cost incurred',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'ActualCost';
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

-- Extended properties for Segment
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member segmentation for targeted marketing',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Segment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment name',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment type (Industry, Geography, Engagement, Membership Type, etc.)',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'SegmentType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Filter criteria (JSON or SQL WHERE clause)',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'FilterCriteria';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of members matching this segment',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'MemberCount';
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

-- Extended properties for CampaignMember
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Members targeted by marketing campaigns',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign targeting this member',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'CampaignID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member being targeted',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment this member was added through',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'SegmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member was added to campaign',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'AddedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign member status: Targeted, Sent, Responded, Converted, or Opted Out',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Value of conversion (revenue generated from this campaign interaction)',
    @level0type = N'SCHEMA', @level0name = 'marketing',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'ConversionValue';
GO

PRINT 'Marketing schema tables created successfully!';
PRINT 'Tables: Campaign, Segment, CampaignMember';
GO
