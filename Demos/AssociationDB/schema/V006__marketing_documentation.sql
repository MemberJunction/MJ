/******************************************************************************
 * Association Sample Database - Marketing Schema Documentation
 * File: V006__marketing_documentation.sql
 *
 * Extended properties (documentation) for marketing schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for Campaign
-- ============================================================================
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


-- ============================================================================
-- Extended properties for Segment
-- ============================================================================
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


-- ============================================================================
-- Extended properties for CampaignMember
-- ============================================================================
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



