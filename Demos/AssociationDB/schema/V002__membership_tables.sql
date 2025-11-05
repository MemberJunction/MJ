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

PRINT 'Membership schema tables created successfully!';
PRINT 'Tables: Organization, MembershipType, Member, Membership';
GO
