/******************************************************************************
 * Association Sample Database - Membership Schema Tables
 * File: V002__membership_tables.sql
 *
 * Creates core membership tables including:
 * - Organization: Companies and institutions
 * - Member: Individual members
 * - MembershipType: Types of memberships (Individual, Corporate, Student, etc.)
 * - Membership: Actual membership records with status and renewal tracking
 ******************************************************************************/

-- ============================================================================
-- Organization Table
-- ============================================================================
CREATE TABLE [membership].[Organization] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Industry] NVARCHAR(100),
    [EmployeeCount] INT,
    [AnnualRevenue] DECIMAL(18,2),
    [MarketCapitalization] DECIMAL(18,2),
    [TickerSymbol] NVARCHAR(10),
    [Exchange] NVARCHAR(50),
    [Website] NVARCHAR(500),
    [Description] NVARCHAR(MAX),
    [YearFounded] INT,
    [City] NVARCHAR(100),
    [State] NVARCHAR(50),
    [Country] NVARCHAR(100) DEFAULT 'United States',
    [PostalCode] NVARCHAR(20),
    [Phone] NVARCHAR(50),
    [LogoURL] NVARCHAR(500)
);
GO

-- Extended properties for Organization
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
-- MembershipType Table
-- ============================================================================
CREATE TABLE [membership].[MembershipType] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX),
    [AnnualDues] DECIMAL(10,2) NOT NULL,
    [RenewalPeriodMonths] INT NOT NULL DEFAULT 12,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [AllowAutoRenew] BIT NOT NULL DEFAULT 1,
    [RequiresApproval] BIT NOT NULL DEFAULT 0,
    [Benefits] NVARCHAR(MAX),
    [DisplayOrder] INT
);
GO

-- Extended properties for MembershipType
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
-- Member Table
-- ============================================================================
CREATE TABLE [membership].[Member] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Email] NVARCHAR(255) NOT NULL,
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Title] NVARCHAR(100),
    [OrganizationID] UNIQUEIDENTIFIER,
    [Industry] NVARCHAR(100),
    [JobFunction] NVARCHAR(100),
    [YearsInProfession] INT,
    [JoinDate] DATE NOT NULL,
    [LinkedInURL] NVARCHAR(500),
    [Bio] NVARCHAR(MAX),
    [PreferredLanguage] NVARCHAR(10) DEFAULT 'en-US',
    [Timezone] NVARCHAR(50),
    [Phone] NVARCHAR(50),
    [Mobile] NVARCHAR(50),
    [City] NVARCHAR(100),
    [State] NVARCHAR(50),
    [Country] NVARCHAR(100) DEFAULT 'United States',
    [PostalCode] NVARCHAR(20),
    [EngagementScore] INT DEFAULT 0,
    [LastActivityDate] DATETIME,
    [ProfilePhotoURL] NVARCHAR(500),
    CONSTRAINT FK_Member_Organization FOREIGN KEY ([OrganizationID])
        REFERENCES [membership].[Organization]([ID])
);
GO

-- Create index on email for lookups
CREATE UNIQUE INDEX IX_Member_Email ON [membership].[Member]([Email]);
GO

-- Create index on organization for reporting
CREATE INDEX IX_Member_Organization ON [membership].[Member]([OrganizationID]);
GO

-- Extended properties for Member
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
-- Membership Table
-- ============================================================================
CREATE TABLE [membership].[Membership] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [MembershipTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Active', 'Pending', 'Lapsed', 'Suspended', 'Cancelled')),
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [RenewalDate] DATE,
    [AutoRenew] BIT NOT NULL DEFAULT 1,
    [CancellationDate] DATE,
    [CancellationReason] NVARCHAR(MAX),
    CONSTRAINT FK_Membership_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID]),
    CONSTRAINT FK_Membership_Type FOREIGN KEY ([MembershipTypeID])
        REFERENCES [membership].[MembershipType]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Membership_Member ON [membership].[Membership]([MemberID]);
CREATE INDEX IX_Membership_Type ON [membership].[Membership]([MembershipTypeID]);
CREATE INDEX IX_Membership_Status ON [membership].[Membership]([Status]);
CREATE INDEX IX_Membership_Dates ON [membership].[Membership]([StartDate], [EndDate]);
GO

-- Extended properties for Membership
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

PRINT 'Membership schema tables created successfully!';
PRINT 'Tables: Organization, MembershipType, Member, Membership';
GO
