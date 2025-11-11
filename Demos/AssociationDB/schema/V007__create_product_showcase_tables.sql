/******************************************************************************
 * Association Sample Database - Product Showcase & Awards Domain
 * File: V007__create_product_showcase_tables.sql
 *
 * This file creates the Product Showcase and Awards tables for showcasing
 * member products and managing competitions. All tables use the
 * [AssociationDemo] schema prefix.
 *
 * Domain: Product Showcase & Awards/Competitions
 * - ProductCategory: Categories of cheese products
 * - Product: Individual cheese products from members
 * - Competition: Cheese competitions and judging events
 * - CompetitionEntry: Product entries in competitions
 * - CompetitionJudge: Judges for competitions
 * - ProductAward: Awards won by products
 *
 * Total Tables: 6
 ******************************************************************************/

-- ============================================================================
-- PRODUCT SHOWCASE & AWARDS DOMAIN
-- ============================================================================

-- ============================================================================
-- ProductCategory Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ProductCategory] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [ParentCategoryID] UNIQUEIDENTIFIER,
    [DisplayOrder] INT DEFAULT 0,
    [IsActive] BIT DEFAULT 1,
    [ImageURL] NVARCHAR(500),
    CONSTRAINT FK_ProductCategory_Parent FOREIGN KEY ([ParentCategoryID])
        REFERENCES [AssociationDemo].[ProductCategory]([ID])
);
GO

-- ============================================================================
-- Product Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Product] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [CheeseType] NVARCHAR(100),
    [MilkSource] NVARCHAR(100) CHECK ([MilkSource] IN ('Cow', 'Goat', 'Sheep', 'Buffalo', 'Mixed')),
    [AgeMonths] INT,
    [Weight] DECIMAL(10,2),
    [WeightUnit] NVARCHAR(20) DEFAULT 'oz',
    [RetailPrice] DECIMAL(10,2),
    [IsOrganic] BIT DEFAULT 0,
    [IsRawMilk] BIT DEFAULT 0,
    [IsAwardWinner] BIT DEFAULT 0,
    [DateIntroduced] DATE,
    [Status] NVARCHAR(50) DEFAULT 'Active' CHECK ([Status] IN ('Active', 'Discontinued', 'Seasonal', 'Limited Edition')),
    [ImageURL] NVARCHAR(500),
    [TastingNotes] NVARCHAR(MAX),
    [PairingNotes] NVARCHAR(MAX),
    [ProductionMethod] NVARCHAR(MAX),
    [AwardCount] INT DEFAULT 0,
    CONSTRAINT FK_Product_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_Product_Category FOREIGN KEY ([CategoryID])
        REFERENCES [AssociationDemo].[ProductCategory]([ID])
);
GO

-- ============================================================================
-- Competition Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Competition] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Year] INT NOT NULL,
    [Description] NVARCHAR(MAX),
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [JudgingDate] DATE,
    [AwardsDate] DATE,
    [Location] NVARCHAR(255),
    [EntryDeadline] DATE,
    [EntryFee] DECIMAL(10,2),
    [Status] NVARCHAR(50) DEFAULT 'Upcoming' CHECK ([Status] IN ('Upcoming', 'Open for Entries', 'Entries Closed', 'Judging', 'Completed', 'Cancelled')),
    [TotalEntries] INT DEFAULT 0,
    [TotalCategories] INT DEFAULT 0,
    [Website] NVARCHAR(500),
    [ContactEmail] NVARCHAR(255),
    [IsAnnual] BIT DEFAULT 1,
    [IsInternational] BIT DEFAULT 0
);
GO

-- ============================================================================
-- CompetitionEntry Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CompetitionEntry] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CompetitionID] UNIQUEIDENTIFIER NOT NULL,
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [CategoryID] UNIQUEIDENTIFIER NOT NULL,
    [EntryNumber] NVARCHAR(50),
    [SubmittedDate] DATE NOT NULL,
    [Status] NVARCHAR(50) DEFAULT 'Submitted' CHECK ([Status] IN ('Submitted', 'Accepted', 'Rejected', 'Judged', 'Winner', 'Finalist', 'Disqualified')),
    [Score] DECIMAL(5,2),
    [Ranking] INT,
    [AwardLevel] NVARCHAR(100) CHECK ([AwardLevel] IN ('Best in Show', 'Gold', 'Silver', 'Bronze', 'Honorable Mention', 'Finalist', 'None')),
    [JudgingNotes] NVARCHAR(MAX),
    [FeedbackProvided] BIT DEFAULT 0,
    [EntryFee] DECIMAL(10,2),
    [PaymentStatus] NVARCHAR(50) DEFAULT 'Unpaid' CHECK ([PaymentStatus] IN ('Unpaid', 'Paid', 'Refunded', 'Waived')),
    CONSTRAINT FK_CompetitionEntry_Competition FOREIGN KEY ([CompetitionID])
        REFERENCES [AssociationDemo].[Competition]([ID]),
    CONSTRAINT FK_CompetitionEntry_Product FOREIGN KEY ([ProductID])
        REFERENCES [AssociationDemo].[Product]([ID]),
    CONSTRAINT FK_CompetitionEntry_Category FOREIGN KEY ([CategoryID])
        REFERENCES [AssociationDemo].[ProductCategory]([ID])
);
GO

-- ============================================================================
-- CompetitionJudge Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CompetitionJudge] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CompetitionID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER,
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(255),
    [Organization] NVARCHAR(255),
    [Credentials] NVARCHAR(MAX),
    [YearsExperience] INT,
    [Specialty] NVARCHAR(255),
    [Role] NVARCHAR(100) CHECK ([Role] IN ('Head Judge', 'Technical Judge', 'Sensory Judge', 'Assistant Judge', 'Trainee')),
    [AssignedCategories] NVARCHAR(MAX),
    [Status] NVARCHAR(50) DEFAULT 'Confirmed' CHECK ([Status] IN ('Invited', 'Confirmed', 'Declined', 'Completed', 'Removed')),
    [InvitedDate] DATE,
    [ConfirmedDate] DATE,
    [CompensationAmount] DECIMAL(10,2),
    [Notes] NVARCHAR(MAX),
    CONSTRAINT FK_CompetitionJudge_Competition FOREIGN KEY ([CompetitionID])
        REFERENCES [AssociationDemo].[Competition]([ID]),
    CONSTRAINT FK_CompetitionJudge_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ProductAward Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ProductAward] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [CompetitionID] UNIQUEIDENTIFIER,
    [CompetitionEntryID] UNIQUEIDENTIFIER,
    [AwardName] NVARCHAR(255) NOT NULL,
    [AwardLevel] NVARCHAR(100) NOT NULL,
    [AwardingOrganization] NVARCHAR(255),
    [AwardDate] DATE NOT NULL,
    [Year] INT NOT NULL,
    [Category] NVARCHAR(255),
    [Score] DECIMAL(5,2),
    [Description] NVARCHAR(MAX),
    [CertificateURL] NVARCHAR(500),
    [IsDisplayed] BIT DEFAULT 1,
    [DisplayOrder] INT DEFAULT 0,
    CONSTRAINT FK_ProductAward_Product FOREIGN KEY ([ProductID])
        REFERENCES [AssociationDemo].[Product]([ID]),
    CONSTRAINT FK_ProductAward_Competition FOREIGN KEY ([CompetitionID])
        REFERENCES [AssociationDemo].[Competition]([ID]),
    CONSTRAINT FK_ProductAward_Entry FOREIGN KEY ([CompetitionEntryID])
        REFERENCES [AssociationDemo].[CompetitionEntry]([ID])
);
GO
