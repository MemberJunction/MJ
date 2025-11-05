/******************************************************************************
 * Association Sample Database - Membership Schema Documentation
 * File: V002__membership_documentation.sql
 *
 * Extended properties (documentation) for membership schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for Organization
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Organizations and companies that are associated with the association',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Company or organization name',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Primary industry or sector',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Industry';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of employees',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'EmployeeCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Annual revenue in USD',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'AnnualRevenue';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Market capitalization in USD (for public companies)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'MarketCapitalization';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stock ticker symbol (for public companies)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'TickerSymbol';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stock exchange (NYSE, NASDAQ, etc. for public companies)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Exchange';
GO

-- ============================================================================
-- Extended properties for MembershipType
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Types of memberships offered by the association',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'MembershipType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Name of membership type (e.g., Individual, Corporate, Student)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Annual membership dues amount',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'AnnualDues';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of months until renewal (typically 12)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'RenewalPeriodMonths';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether members can set up automatic renewal',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'AllowAutoRenew';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether membership requires staff approval',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'RequiresApproval';
GO

-- ============================================================================
-- Extended properties for Member
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual members of the association',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Primary email address (unique)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member first name',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'FirstName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member last name',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'LastName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Job title',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Associated organization (if applicable)',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'OrganizationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the association',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Calculated engagement score based on activity',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'EngagementScore';
GO

-- ============================================================================
-- Extended properties for Membership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership records tracking member subscriptions and renewals',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member who holds this membership',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of membership',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'MembershipTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current status: Active, Pending, Lapsed, Suspended, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership start date',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership end/expiration date',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether membership will automatically renew',
    @level0type = N'SCHEMA', @level0name = 'membership',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'AutoRenew';
GO

PRINT 'Membership schema documentation added successfully!';
GO
