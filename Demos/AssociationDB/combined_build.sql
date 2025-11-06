-- Combined Association Sample Database Build
-- Auto-generated from multiple files

SET NOCOUNT ON;
GO

PRINT '';
PRINT '###################################################################';
PRINT '#                                                                 #';
PRINT '#     MemberJunction - Association Sample Database Builder       #';
PRINT '#                                                                 #';
PRINT '###################################################################';
PRINT '';
PRINT 'This script will create a comprehensive association management';
PRINT 'database with realistic sample data in a single AssociationDemo schema.';
PRINT '';
PRINT 'Estimated completion time: 1-2 minutes';
PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT '';
PRINT 'Target Database: ' + DB_NAME();
PRINT 'Start Time: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT '===================================================================';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 1: CREATING SCHEMAS AND TABLES';
PRINT '===================================================================';
PRINT '';
GO

/******************************************************************************
 * Association Sample Database - Schema Creation
 * File: V001__create_schema.sql
 *
 * Creates the AssociationDemo schema for all sample database tables.
 * Single schema approach for simplified querying and maintenance.
 ******************************************************************************/

-- Create AssociationDemo schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'AssociationDemo')
BEGIN
    EXEC('CREATE SCHEMA AssociationDemo');
    PRINT 'Created schema: AssociationDemo';
END
GO

PRINT 'Schema created successfully!';
GO
/******************************************************************************
 * Association Sample Database - All Tables Consolidated
 * File: V002__create_tables.sql
 *
 * This file consolidates all table definitions for the AssociationDemo schema.
 * All tables use the [AssociationDemo] schema prefix to avoid naming conflicts.
 *
 * Logical Domain Organization:
 * - Membership: Core member and organization data
 * - Events: Event management and registrations
 * - Learning: LMS courses, enrollments, and certificates
 * - Finance: Invoicing and payment processing
 * - Marketing: Campaigns, segments, and targeting
 * - Email: Email templates and tracking
 * - Chapters: Chapter management and membership
 * - Governance: Committees and board positions
 *
 * Total Tables: 27
 ******************************************************************************/

-- ============================================================================
-- MEMBERSHIP DOMAIN
-- ============================================================================

-- ============================================================================
-- Organization Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Organization] (
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
CREATE TABLE [AssociationDemo].[MembershipType] (
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
CREATE TABLE [AssociationDemo].[Member] (
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
        REFERENCES [AssociationDemo].[Organization]([ID])
);
GO

-- Create index on email for lookups
CREATE UNIQUE INDEX IX_Member_Email ON [AssociationDemo].[Member]([Email]);
GO

-- Create index on organization for reporting
CREATE INDEX IX_Member_Organization ON [AssociationDemo].[Member]([OrganizationID]);
GO

-- ============================================================================
-- Membership Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Membership] (
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
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_Membership_Type FOREIGN KEY ([MembershipTypeID])
        REFERENCES [AssociationDemo].[MembershipType]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Membership_Member ON [AssociationDemo].[Membership]([MemberID]);
CREATE INDEX IX_Membership_Type ON [AssociationDemo].[Membership]([MembershipTypeID]);
CREATE INDEX IX_Membership_Status ON [AssociationDemo].[Membership]([Status]);
CREATE INDEX IX_Membership_Dates ON [AssociationDemo].[Membership]([StartDate], [EndDate]);
GO

-- ============================================================================
-- EVENTS DOMAIN
-- ============================================================================

-- ============================================================================
-- Event Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Event] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [EventType] NVARCHAR(50) NOT NULL CHECK ([EventType] IN ('Conference', 'Webinar', 'Workshop', 'Chapter Meeting', 'Virtual Summit', 'Networking')),
    [StartDate] DATETIME NOT NULL,
    [EndDate] DATETIME NOT NULL,
    [Timezone] NVARCHAR(50),
    [Location] NVARCHAR(255),
    [IsVirtual] BIT NOT NULL DEFAULT 0,
    [VirtualPlatform] NVARCHAR(100),
    [MeetingURL] NVARCHAR(500),
    [ChapterID] UNIQUEIDENTIFIER,
    [Capacity] INT,
    [RegistrationOpenDate] DATETIME,
    [RegistrationCloseDate] DATETIME,
    [RegistrationFee] DECIMAL(10,2),
    [MemberPrice] DECIMAL(10,2),
    [NonMemberPrice] DECIMAL(10,2),
    [CEUCredits] DECIMAL(4,2),
    [Description] NVARCHAR(MAX),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Draft', 'Published', 'Registration Open', 'Sold Out', 'In Progress', 'Completed', 'Cancelled'))
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Event_StartDate ON [AssociationDemo].[Event]([StartDate]);
CREATE INDEX IX_Event_Type ON [AssociationDemo].[Event]([EventType]);
CREATE INDEX IX_Event_Status ON [AssociationDemo].[Event]([Status]);
GO

-- ============================================================================
-- EventSession Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[EventSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [StartTime] DATETIME NOT NULL,
    [EndTime] DATETIME NOT NULL,
    [Room] NVARCHAR(100),
    [SpeakerName] NVARCHAR(255),
    [SessionType] NVARCHAR(50),
    [Capacity] INT,
    [CEUCredits] DECIMAL(4,2),
    CONSTRAINT FK_EventSession_Event FOREIGN KEY ([EventID])
        REFERENCES [AssociationDemo].[Event]([ID])
);
GO

-- Create index for event lookups
CREATE INDEX IX_EventSession_Event ON [AssociationDemo].[EventSession]([EventID]);
GO

-- ============================================================================
-- EventRegistration Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[EventRegistration] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [RegistrationDate] DATETIME NOT NULL,
    [RegistrationType] NVARCHAR(50),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Registered', 'Waitlisted', 'Attended', 'No Show', 'Cancelled')),
    [CheckInTime] DATETIME,
    [InvoiceID] UNIQUEIDENTIFIER,
    [CEUAwarded] BIT NOT NULL DEFAULT 0,
    [CEUAwardedDate] DATETIME,
    [CancellationDate] DATETIME,
    [CancellationReason] NVARCHAR(MAX),
    CONSTRAINT FK_EventReg_Event FOREIGN KEY ([EventID])
        REFERENCES [AssociationDemo].[Event]([ID]),
    CONSTRAINT FK_EventReg_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_EventReg_Event ON [AssociationDemo].[EventRegistration]([EventID]);
CREATE INDEX IX_EventReg_Member ON [AssociationDemo].[EventRegistration]([MemberID]);
CREATE INDEX IX_EventReg_Status ON [AssociationDemo].[EventRegistration]([Status]);
GO

-- ============================================================================
-- LEARNING DOMAIN
-- ============================================================================

-- ============================================================================
-- Course Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Course] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Code] NVARCHAR(50) NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [Category] NVARCHAR(100),
    [Level] NVARCHAR(20) NOT NULL CHECK ([Level] IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
    [DurationHours] DECIMAL(5,2),
    [CEUCredits] DECIMAL(4,2),
    [Price] DECIMAL(10,2),
    [MemberPrice] DECIMAL(10,2),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [PublishedDate] DATE,
    [InstructorName] NVARCHAR(255),
    [PrerequisiteCourseID] UNIQUEIDENTIFIER,
    [ThumbnailURL] NVARCHAR(500),
    [LearningObjectives] NVARCHAR(MAX),
    CONSTRAINT FK_Course_Prerequisite FOREIGN KEY ([PrerequisiteCourseID])
        REFERENCES [AssociationDemo].[Course]([ID])
);
GO

-- Create unique index on course code
CREATE UNIQUE INDEX IX_Course_Code ON [AssociationDemo].[Course]([Code]);
GO

-- Create indexes for common queries
CREATE INDEX IX_Course_Category ON [AssociationDemo].[Course]([Category]);
CREATE INDEX IX_Course_Level ON [AssociationDemo].[Course]([Level]);
GO

-- ============================================================================
-- Enrollment Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Enrollment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CourseID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [EnrollmentDate] DATETIME NOT NULL,
    [StartDate] DATETIME,
    [CompletionDate] DATETIME,
    [ExpirationDate] DATETIME,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Enrolled', 'In Progress', 'Completed', 'Failed', 'Withdrawn', 'Expired')),
    [ProgressPercentage] INT DEFAULT 0 CHECK ([ProgressPercentage] BETWEEN 0 AND 100),
    [LastAccessedDate] DATETIME,
    [TimeSpentMinutes] INT DEFAULT 0,
    [FinalScore] DECIMAL(5,2),
    [PassingScore] DECIMAL(5,2) DEFAULT 70.00,
    [Passed] BIT,
    [InvoiceID] UNIQUEIDENTIFIER,
    CONSTRAINT FK_Enrollment_Course FOREIGN KEY ([CourseID])
        REFERENCES [AssociationDemo].[Course]([ID]),
    CONSTRAINT FK_Enrollment_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Enrollment_Course ON [AssociationDemo].[Enrollment]([CourseID]);
CREATE INDEX IX_Enrollment_Member ON [AssociationDemo].[Enrollment]([MemberID]);
CREATE INDEX IX_Enrollment_Status ON [AssociationDemo].[Enrollment]([Status]);
GO

-- ============================================================================
-- Certificate Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Certificate] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EnrollmentID] UNIQUEIDENTIFIER NOT NULL,
    [CertificateNumber] NVARCHAR(50) NOT NULL,
    [IssuedDate] DATE NOT NULL,
    [ExpirationDate] DATE,
    [CertificatePDFURL] NVARCHAR(500),
    [VerificationCode] NVARCHAR(100),
    CONSTRAINT FK_Certificate_Enrollment FOREIGN KEY ([EnrollmentID])
        REFERENCES [AssociationDemo].[Enrollment]([ID])
);
GO

-- Create unique indexes
CREATE UNIQUE INDEX IX_Certificate_Number ON [AssociationDemo].[Certificate]([CertificateNumber]);
CREATE UNIQUE INDEX IX_Certificate_VerificationCode ON [AssociationDemo].[Certificate]([VerificationCode]);
GO

-- Create index for enrollment lookups
CREATE INDEX IX_Certificate_Enrollment ON [AssociationDemo].[Certificate]([EnrollmentID]);
GO

-- ============================================================================
-- FINANCE DOMAIN
-- ============================================================================

-- ============================================================================
-- Invoice Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Invoice] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceNumber] NVARCHAR(50) NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [InvoiceDate] DATE NOT NULL,
    [DueDate] DATE NOT NULL,
    [SubTotal] DECIMAL(12,2) NOT NULL,
    [Tax] DECIMAL(12,2) DEFAULT 0,
    [Discount] DECIMAL(12,2) DEFAULT 0,
    [Total] DECIMAL(12,2) NOT NULL,
    [AmountPaid] DECIMAL(12,2) DEFAULT 0,
    [Balance] DECIMAL(12,2) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Draft', 'Sent', 'Partial', 'Paid', 'Overdue', 'Cancelled', 'Refunded')),
    [Notes] NVARCHAR(MAX),
    [PaymentTerms] NVARCHAR(100),
    CONSTRAINT FK_Invoice_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- Create unique index on invoice number
CREATE UNIQUE INDEX IX_Invoice_Number ON [AssociationDemo].[Invoice]([InvoiceNumber]);
GO

-- Create indexes for common queries
CREATE INDEX IX_Invoice_Member ON [AssociationDemo].[Invoice]([MemberID]);
CREATE INDEX IX_Invoice_Status ON [AssociationDemo].[Invoice]([Status]);
CREATE INDEX IX_Invoice_Dates ON [AssociationDemo].[Invoice]([InvoiceDate], [DueDate]);
GO

-- ============================================================================
-- InvoiceLineItem Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[InvoiceLineItem] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceID] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(500) NOT NULL,
    [ItemType] NVARCHAR(50) NOT NULL CHECK ([ItemType] IN ('Membership Dues', 'Event Registration', 'Course Enrollment', 'Merchandise', 'Donation', 'Other')),
    [Quantity] INT DEFAULT 1,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [TaxAmount] DECIMAL(12,2) DEFAULT 0,
    [RelatedEntityType] NVARCHAR(100),
    [RelatedEntityID] UNIQUEIDENTIFIER,
    CONSTRAINT FK_LineItem_Invoice FOREIGN KEY ([InvoiceID])
        REFERENCES [AssociationDemo].[Invoice]([ID])
);
GO

-- Create index for invoice lookups
CREATE INDEX IX_LineItem_Invoice ON [AssociationDemo].[InvoiceLineItem]([InvoiceID]);
GO

-- ============================================================================
-- Payment Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Payment] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceID] UNIQUEIDENTIFIER NOT NULL,
    [PaymentDate] DATETIME NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [PaymentMethod] NVARCHAR(50) NOT NULL CHECK ([PaymentMethod] IN ('Credit Card', 'ACH', 'Check', 'Wire', 'PayPal', 'Stripe', 'Cash')),
    [TransactionID] NVARCHAR(255),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Pending', 'Completed', 'Failed', 'Refunded', 'Cancelled')),
    [ProcessedDate] DATETIME,
    [FailureReason] NVARCHAR(MAX),
    [Notes] NVARCHAR(MAX),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY ([InvoiceID])
        REFERENCES [AssociationDemo].[Invoice]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Payment_Invoice ON [AssociationDemo].[Payment]([InvoiceID]);
CREATE INDEX IX_Payment_Status ON [AssociationDemo].[Payment]([Status]);
CREATE INDEX IX_Payment_Date ON [AssociationDemo].[Payment]([PaymentDate]);
GO

-- ============================================================================
-- MARKETING DOMAIN
-- ============================================================================

-- ============================================================================
-- Campaign Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Campaign] (
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
CREATE INDEX IX_Campaign_Type ON [AssociationDemo].[Campaign]([CampaignType]);
CREATE INDEX IX_Campaign_Status ON [AssociationDemo].[Campaign]([Status]);
CREATE INDEX IX_Campaign_Dates ON [AssociationDemo].[Campaign]([StartDate], [EndDate]);
GO

-- ============================================================================
-- Segment Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Segment] (
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
CREATE INDEX IX_Segment_Type ON [AssociationDemo].[Segment]([SegmentType]);
CREATE INDEX IX_Segment_Active ON [AssociationDemo].[Segment]([IsActive]);
GO

-- ============================================================================
-- CampaignMember Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CampaignMember] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CampaignID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [SegmentID] UNIQUEIDENTIFIER,
    [AddedDate] DATETIME NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Targeted', 'Sent', 'Responded', 'Converted', 'Opted Out')),
    [ResponseDate] DATETIME,
    [ConversionValue] DECIMAL(12,2),
    CONSTRAINT FK_CampaignMember_Campaign FOREIGN KEY ([CampaignID])
        REFERENCES [AssociationDemo].[Campaign]([ID]),
    CONSTRAINT FK_CampaignMember_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID]),
    CONSTRAINT FK_CampaignMember_Segment FOREIGN KEY ([SegmentID])
        REFERENCES [AssociationDemo].[Segment]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_CampaignMember_Campaign ON [AssociationDemo].[CampaignMember]([CampaignID]);
CREATE INDEX IX_CampaignMember_Member ON [AssociationDemo].[CampaignMember]([MemberID]);
CREATE INDEX IX_CampaignMember_Segment ON [AssociationDemo].[CampaignMember]([SegmentID]);
CREATE INDEX IX_CampaignMember_Status ON [AssociationDemo].[CampaignMember]([Status]);
GO

-- ============================================================================
-- EMAIL DOMAIN
-- ============================================================================

-- ============================================================================
-- EmailTemplate Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[EmailTemplate] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Subject] NVARCHAR(500),
    [FromName] NVARCHAR(255),
    [FromEmail] NVARCHAR(255),
    [ReplyToEmail] NVARCHAR(255),
    [HtmlBody] NVARCHAR(MAX),
    [TextBody] NVARCHAR(MAX),
    [Category] NVARCHAR(100),
    [IsActive] BIT NOT NULL DEFAULT 1,
    [PreviewText] NVARCHAR(255),
    [Tags] NVARCHAR(500)
);
GO

-- ============================================================================
-- EmailSend Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[EmailSend] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [TemplateID] UNIQUEIDENTIFIER,
    [CampaignID] UNIQUEIDENTIFIER,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Subject] NVARCHAR(500),
    [SentDate] DATETIME NOT NULL,
    [DeliveredDate] DATETIME,
    [OpenedDate] DATETIME,
    [OpenCount] INT DEFAULT 0,
    [ClickedDate] DATETIME,
    [ClickCount] INT DEFAULT 0,
    [BouncedDate] DATETIME,
    [BounceType] NVARCHAR(20),
    [BounceReason] NVARCHAR(MAX),
    [UnsubscribedDate] DATETIME,
    [SpamReportedDate] DATETIME,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Queued', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Spam', 'Unsubscribed', 'Failed')),
    [ExternalMessageID] NVARCHAR(255),
    CONSTRAINT FK_EmailSend_Template FOREIGN KEY ([TemplateID])
        REFERENCES [AssociationDemo].[EmailTemplate]([ID]),
    CONSTRAINT FK_EmailSend_Campaign FOREIGN KEY ([CampaignID])
        REFERENCES [AssociationDemo].[Campaign]([ID]),
    CONSTRAINT FK_EmailSend_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- EmailClick Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[EmailClick] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EmailSendID] UNIQUEIDENTIFIER NOT NULL,
    [ClickDate] DATETIME NOT NULL,
    [URL] NVARCHAR(2000) NOT NULL,
    [LinkName] NVARCHAR(255),
    [IPAddress] NVARCHAR(50),
    [UserAgent] NVARCHAR(500),
    CONSTRAINT FK_EmailClick_Send FOREIGN KEY ([EmailSendID])
        REFERENCES [AssociationDemo].[EmailSend]([ID])
);
GO

-- ============================================================================
-- CHAPTERS DOMAIN
-- ============================================================================

-- ============================================================================
-- Chapter Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Chapter] (
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
CREATE TABLE [AssociationDemo].[ChapterMembership] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ChapterID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [JoinDate] DATE NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Active', 'Inactive')),
    [Role] NVARCHAR(100),
    CONSTRAINT FK_ChapterMembership_Chapter FOREIGN KEY ([ChapterID])
        REFERENCES [AssociationDemo].[Chapter]([ID]),
    CONSTRAINT FK_ChapterMembership_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- ChapterOfficer Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[ChapterOfficer] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ChapterID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Position] NVARCHAR(100) NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_ChapterOfficer_Chapter FOREIGN KEY ([ChapterID])
        REFERENCES [AssociationDemo].[Chapter]([ID]),
    CONSTRAINT FK_ChapterOfficer_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- GOVERNANCE DOMAIN
-- ============================================================================

-- ============================================================================
-- Committee Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[Committee] (
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
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- CommitteeMembership Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[CommitteeMembership] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CommitteeID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [Role] NVARCHAR(100) NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [AppointedBy] NVARCHAR(255),
    CONSTRAINT FK_CommitteeMember_Committee FOREIGN KEY ([CommitteeID])
        REFERENCES [AssociationDemo].[Committee]([ID]),
    CONSTRAINT FK_CommitteeMember_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

-- ============================================================================
-- BoardPosition Table
-- ============================================================================
CREATE TABLE [AssociationDemo].[BoardPosition] (
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
CREATE TABLE [AssociationDemo].[BoardMember] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [BoardPositionID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT NOT NULL DEFAULT 1,
    [ElectionDate] DATE,
    CONSTRAINT FK_BoardMember_Position FOREIGN KEY ([BoardPositionID])
        REFERENCES [AssociationDemo].[BoardPosition]([ID]),
    CONSTRAINT FK_BoardMember_Member FOREIGN KEY ([MemberID])
        REFERENCES [AssociationDemo].[Member]([ID])
);
GO

PRINT '========================================';
PRINT 'AssociationDemo schema tables created successfully!';
PRINT 'Total tables created: 27';
PRINT '';
PRINT 'Table breakdown by domain:';
PRINT '  Membership: 4 tables (Organization, MembershipType, Member, Membership)';
PRINT '  Events: 3 tables (Event, EventSession, EventRegistration)';
PRINT '  Learning: 3 tables (Course, Enrollment, Certificate)';
PRINT '  Finance: 3 tables (Invoice, InvoiceLineItem, Payment)';
PRINT '  Marketing: 3 tables (Campaign, Segment, CampaignMember)';
PRINT '  Email: 3 tables (EmailTemplate, EmailSend, EmailClick)';
PRINT '  Chapters: 3 tables (Chapter, ChapterMembership, ChapterOfficer)';
PRINT '  Governance: 4 tables (Committee, CommitteeMembership, BoardPosition, BoardMember)';
PRINT '========================================';
GO

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1A: Schema and table creation complete';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B: ADDING DATABASE DOCUMENTATION';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

/******************************************************************************
 * Association Sample Database - Consolidated Table Documentation
 * File: V003__table_documentation.sql
 *
 * Extended properties (documentation) for all AssociationDemo schema tables.
 * All tables are consolidated into the unified AssociationDemo schema.
 ******************************************************************************/

-- ============================================================================
-- Schema Documentation
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unified schema for association management system including membership, events, learning, finance, marketing, email communications, chapters, and governance',
    @level0type = N'SCHEMA',
    @level0name = 'AssociationDemo';


-- ============================================================================
-- MEMBERSHIP DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Organization
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Organizations and companies that are associated with the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Company or organization name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Primary industry or sector',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Industry';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of employees',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'EmployeeCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Annual revenue in USD',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'AnnualRevenue';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Market capitalization in USD (for public companies)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'MarketCapitalization';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stock ticker symbol (for public companies)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'TickerSymbol';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stock exchange (NYSE, NASDAQ, etc. for public companies)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Exchange';


-- ============================================================================
-- Extended properties for MembershipType
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Types of memberships offered by the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Name of membership type (e.g., Individual, Corporate, Student)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Annual membership dues amount',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'AnnualDues';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of months until renewal (typically 12)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'RenewalPeriodMonths';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether members can set up automatic renewal',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'AllowAutoRenew';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether membership requires staff approval',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'RequiresApproval';


-- ============================================================================
-- Extended properties for Member
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual members of the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Primary email address (unique)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member first name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'FirstName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member last name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'LastName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Job title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Associated organization (if applicable)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'OrganizationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Calculated engagement score based on activity',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'EngagementScore';


-- ============================================================================
-- Extended properties for Membership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership records tracking member subscriptions and renewals',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member who holds this membership',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of membership',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'MembershipTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current status: Active, Pending, Lapsed, Suspended, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership start date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership end/expiration date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether membership will automatically renew',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'AutoRenew';


-- ============================================================================
-- EVENTS DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Event
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Events organized by the association including conferences, webinars, and meetings',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event name or title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of event: Conference, Webinar, Workshop, Chapter Meeting, Virtual Summit, or Networking',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'EventType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event start date and time',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event end date and time',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether event is held virtually',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'IsVirtual';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Virtual platform used (Zoom, Teams, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'VirtualPlatform';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum number of attendees',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Capacity';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits offered',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current event status: Draft, Published, Registration Open, Sold Out, In Progress, Completed, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- Extended properties for EventSession
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual sessions within multi-track events',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Parent event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'EventID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Session name or title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Session type (Keynote, Workshop, Panel, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'SessionType';


-- ============================================================================
-- Extended properties for EventRegistration
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member registrations and attendance tracking for events',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event being registered for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'EventID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member registering for the event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date and time of registration',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'RegistrationDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of registration (Early Bird, Standard, Late, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'RegistrationType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registration status: Registered, Waitlisted, Attended, No Show, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Time attendee checked in to the event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'CheckInTime';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether CEU credits were awarded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'CEUAwarded';


-- ============================================================================
-- LEARNING DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Course
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Educational courses and certification programs offered by the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique course code',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Code';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course difficulty level: Beginner, Intermediate, Advanced, or Expert',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Level';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Estimated duration in hours',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'DurationHours';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits awarded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Standard price for non-members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Price';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Discounted price for members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'MemberPrice';


-- ============================================================================
-- Extended properties for Enrollment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member course enrollments and progress tracking',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course being taken',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'CourseID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member taking the course',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member enrolled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'EnrollmentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Enrollment status: Enrolled, In Progress, Completed, Failed, Withdrawn, or Expired',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course completion progress (0-100%)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'ProgressPercentage';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Final exam or assessment score',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'FinalScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether the member passed the course',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Passed';


-- ============================================================================
-- Extended properties for Certificate
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Completion certificates issued to members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course enrollment this certificate is for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'EnrollmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique certificate number',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificateNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date certificate was issued',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'IssuedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL to downloadable PDF certificate',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificatePDFURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique verification code for authenticity checking',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'VerificationCode';


-- ============================================================================
-- FINANCE DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Invoice
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoices for membership dues, event registrations, course enrollments, and other charges',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique invoice number',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'InvoiceNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member being invoiced',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date invoice was created',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'InvoiceDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment due date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'DueDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Subtotal before tax and discounts',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'SubTotal';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total invoice amount',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Total';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Amount paid to date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'AmountPaid';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Remaining balance due',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Balance';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoice status: Draft, Sent, Partial, Paid, Overdue, Cancelled, or Refunded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- Extended properties for InvoiceLineItem
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Detailed line items for each invoice',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Parent invoice',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'InvoiceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Line item description',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of item: Membership Dues, Event Registration, Course Enrollment, Merchandise, Donation, or Other',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'ItemType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Related entity type (Event, Course, Membership, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'RelatedEntityType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'ID of related entity (EventID, CourseID, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'RelatedEntityID';


-- ============================================================================
-- Extended properties for Payment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment transactions for invoices',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoice being paid',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'InvoiceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date payment was initiated',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'PaymentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment amount',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'Amount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment method: Credit Card, ACH, Check, Wire, PayPal, Stripe, or Cash',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'PaymentMethod';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'External payment provider transaction ID',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'TransactionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment status: Pending, Completed, Failed, Refunded, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- MARKETING DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Campaign
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Marketing campaigns and promotional initiatives',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign type: Email, Event Promotion, Membership Renewal, Course Launch, Donation Drive, or Member Engagement',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'CampaignType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign status: Draft, Scheduled, Active, Completed, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign start date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign end date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Budgeted amount for campaign',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Budget';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Actual cost incurred',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'ActualCost';


-- ============================================================================
-- Extended properties for Segment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member segmentation for targeted marketing',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment type (Industry, Geography, Engagement, Membership Type, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'SegmentType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Filter criteria (JSON or SQL WHERE clause)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'FilterCriteria';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of members matching this segment',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'MemberCount';


-- ============================================================================
-- Extended properties for CampaignMember
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Members targeted by marketing campaigns',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign targeting this member',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'CampaignID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member being targeted',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment this member was added through',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'SegmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member was added to campaign',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'AddedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign member status: Targeted, Sent, Responded, Converted, or Opted Out',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Value of conversion (revenue generated from this campaign interaction)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'ConversionValue';


-- ============================================================================
-- EMAIL DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for EmailTemplate
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Reusable email templates for automated communications',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template name for identification',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email subject line (may contain merge fields)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Subject';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTML version of email body',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'HtmlBody';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Plain text version of email body',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'TextBody';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template category (Welcome, Renewal, Event, Newsletter, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Category';


-- ============================================================================
-- Extended properties for EmailSend
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual email send tracking with delivery and engagement metrics',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template used for this email',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'TemplateID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign this email is part of',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'CampaignID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member receiving the email',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was sent',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'SentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was delivered to inbox',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'DeliveredDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was first opened',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'OpenedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total number of opens',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'OpenCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date a link was first clicked',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'ClickedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total number of clicks',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'ClickCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email status: Queued, Sent, Delivered, Opened, Clicked, Bounced, Spam, Unsubscribed, or Failed',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- Extended properties for EmailClick
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual click tracking for links within emails',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email send this click is associated with',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'EmailSendID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date and time link was clicked',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'ClickDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL that was clicked',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'URL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Friendly name for the link',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'LinkName';


-- ============================================================================
-- CHAPTERS DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Chapter
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Local chapters and special interest groups within the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter type: Geographic, Special Interest, or Industry',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'ChapterType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date chapter was founded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'FoundedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often the chapter meets',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of active members in this chapter',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MemberCount';


-- ============================================================================
-- Extended properties for ChapterMembership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participation in local chapters',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this membership is for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participating in chapter',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the chapter',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership status: Active or Inactive',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role within chapter (Member, Officer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Role';


-- ============================================================================
-- Extended properties for ChapterOfficer
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter leadership positions and officers',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this officer serves',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as officer',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Officer position (President, Vice President, Secretary, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'Position';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of officer term',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of officer term',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'EndDate';


-- ============================================================================
-- GOVERNANCE DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Committee
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Association committees and task forces',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee type: Standing, Ad Hoc, or Task Force',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'CommitteeType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Purpose and charter of the committee',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'Purpose';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often committee meets',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date committee was formed',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'FormedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as committee chair',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'ChairMemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum number of committee members allowed',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'MaxMembers';


-- ============================================================================
-- Extended properties for CommitteeMembership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee member assignments and roles',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee this membership is for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'CommitteeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving on committee',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role on committee (Chair, Vice Chair, Member, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'Role';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of committee service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of committee service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Who appointed this member to the committee',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'AppointedBy';


-- ============================================================================
-- Extended properties for BoardPosition
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Board of directors positions',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Position title (President, Vice President, Treasurer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'PositionTitle';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Display order for listing positions',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'PositionOrder';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Length of term in years',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'TermLengthYears';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this is an officer position',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'IsOfficer';


-- ============================================================================
-- Extended properties for BoardMember
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current and historical board members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Board position held',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'BoardPositionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving on board',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of board service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of board service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member was elected to this position',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'ElectionDate';
GO

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B COMPLETE: Documentation added successfully';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 1 COMPLETE: All schemas and tables created successfully';
PRINT '===================================================================';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 2: POPULATING SAMPLE DATA';
PRINT '===================================================================';
PRINT '';
GO

/******************************************************************************
 * Association Sample Database - Parameters and UUID Declarations
 * File: 00_parameters.sql
 *
 * This file defines the date parameters that make all sample data "evergreen"
 * and declares hardcoded UUIDs for cross-referencing between tables.
 *
 * USAGE: Modify @EndDate to be the current date when running this script.
 *        All other dates will be calculated relative to this anchor.
 ******************************************************************************/

-- ============================================================================
-- DATE PARAMETERS (Modify these to control the data time window)
-- ============================================================================

DECLARE @EndDate DATE = GETDATE();                              -- "Today"
DECLARE @StartDate DATE = DATEADD(YEAR, -5, @EndDate);         -- 5 years of history


-- Derived date anchors for various data generation needs
DECLARE @FiveYearsAgo DATE = DATEADD(YEAR, -5, @EndDate);
DECLARE @FourYearsAgo DATE = DATEADD(YEAR, -4, @EndDate);
DECLARE @ThreeYearsAgo DATE = DATEADD(YEAR, -3, @EndDate);
DECLARE @TwoYearsAgo DATE = DATEADD(YEAR, -2, @EndDate);
DECLARE @OneYearAgo DATE = DATEADD(YEAR, -1, @EndDate);
DECLARE @SixMonthsAgo DATE = DATEADD(MONTH, -6, @EndDate);
DECLARE @ThreeMonthsAgo DATE = DATEADD(MONTH, -3, @EndDate);
DECLARE @TwoMonthsAgo DATE = DATEADD(MONTH, -2, @EndDate);
DECLARE @OneMonthAgo DATE = DATEADD(MONTH, -1, @EndDate);
DECLARE @TwoWeeksAgo DATE = DATEADD(DAY, -14, @EndDate);
DECLARE @OneWeekAgo DATE = DATEADD(DAY, -7, @EndDate);
DECLARE @Tomorrow DATE = DATEADD(DAY, 1, @EndDate);
DECLARE @OneWeekFromNow DATE = DATEADD(DAY, 7, @EndDate);
DECLARE @TwoWeeksFromNow DATE = DATEADD(DAY, 14, @EndDate);
DECLARE @OneMonthFromNow DATE = DATEADD(MONTH, 1, @EndDate);
DECLARE @ThreeMonthsFromNow DATE = DATEADD(MONTH, 3, @EndDate);
DECLARE @SixMonthsFromNow DATE = DATEADD(MONTH, 6, @EndDate);

-- ============================================================================
-- MEMBERSHIP SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Membership Types (8 types)
DECLARE @MembershipType_Individual UNIQUEIDENTIFIER = '0B76F9ED-A512-49B3-9D46-18771891A895';
DECLARE @MembershipType_Student UNIQUEIDENTIFIER = '0A04020D-1AA1-495C-8D90-26784F4A5830';
DECLARE @MembershipType_Corporate UNIQUEIDENTIFIER = '2468E717-05E6-4B55-8F0D-C3E07AAAEF36';
DECLARE @MembershipType_Lifetime UNIQUEIDENTIFIER = '357408F6-1CC0-4C0D-9D68-84A0AE942463';
DECLARE @MembershipType_Retired UNIQUEIDENTIFIER = '351B7B97-C0B0-440B-8A25-5B82E6BE32E9';
DECLARE @MembershipType_EarlyCareer UNIQUEIDENTIFIER = '765DFC28-9E53-4C15-86AA-2ECB02065A7C';
DECLARE @MembershipType_International UNIQUEIDENTIFIER = '9DC53781-6675-43C1-AEC2-8A93847A68CB';
DECLARE @MembershipType_Honorary UNIQUEIDENTIFIER = 'E3469BA4-CD7D-47F9-B571-E9E3A08D6344';

-- Key Organizations (20 selected for member associations)
DECLARE @Org_TechVentures UNIQUEIDENTIFIER = '830433B7-C43D-4EA8-8EB0-5C4FDDF48E33';
DECLARE @Org_CloudScale UNIQUEIDENTIFIER = 'C8120B7A-39F9-4951-8163-624D2272EEDC';
DECLARE @Org_DataDriven UNIQUEIDENTIFIER = 'C19F9A6C-D2B0-45E1-AA80-763CA8BDB41D';
DECLARE @Org_CyberShield UNIQUEIDENTIFIER = 'EA34CDDD-8E5C-4FD3-8774-19E649EEEA74';
DECLARE @Org_HealthTech UNIQUEIDENTIFIER = 'BA015638-95F6-4491-8000-E8A9A500A179';
DECLARE @Org_FinancialEdge UNIQUEIDENTIFIER = '0A3D6DED-2EC5-43A1-B65D-FA9FD1181702';
DECLARE @Org_RetailInnovate UNIQUEIDENTIFIER = '1F72B3E1-EDF1-4160-9260-9E1D385ACFAD';
DECLARE @Org_EduTech UNIQUEIDENTIFIER = '094B0FF7-8294-410C-A2CF-C3458D211C84';
DECLARE @Org_ManufacturePro UNIQUEIDENTIFIER = 'BF820704-5A17-407F-8E91-9940B50B47ED';
DECLARE @Org_LogisticsPrime UNIQUEIDENTIFIER = '4E735B7F-39B8-4133-9C76-247BA30DDF6B';

-- Key Members for journeys and relationships (30 key members)
DECLARE @Member_SarahChen UNIQUEIDENTIFIER = '4C271DA3-5D80-4861-BCF2-7DA0083EE59D';
DECLARE @Member_MichaelJohnson UNIQUEIDENTIFIER = 'AAFD653B-DC7A-45EB-8F91-16B64ADA2D07';
DECLARE @Member_EmilyRodriguez UNIQUEIDENTIFIER = '89EF541B-B85D-4513-AD12-4997DE320A4E';
DECLARE @Member_DavidKim UNIQUEIDENTIFIER = 'F3832C62-46E5-453D-8423-878537F269AA';
DECLARE @Member_JessicaLee UNIQUEIDENTIFIER = 'FB84A180-E31C-4B2C-B206-6C6BF90CD223';
DECLARE @Member_RobertBrown UNIQUEIDENTIFIER = '33C6C9ED-CE11-4039-BF9D-EB5CBD401E2F';
DECLARE @Member_LisaAnderson UNIQUEIDENTIFIER = 'C80FE932-6AF2-4690-90CB-A9F19E4AFF7C';
DECLARE @Member_JamesPatel UNIQUEIDENTIFIER = '044A066A-F391-47FA-9A2C-F594BB29EA1E';
DECLARE @Member_MariaGarcia UNIQUEIDENTIFIER = 'FD75AC87-EC0D-475D-85CC-63C28B134524';
DECLARE @Member_JohnSmith UNIQUEIDENTIFIER = '4FE6BF5D-1200-44E5-9D78-23C1B3717759';
DECLARE @Member_AlexTaylor UNIQUEIDENTIFIER = '70FDF3D8-E9A0-4CE5-B0D9-579F9354E7E9';
DECLARE @Member_RachelWilson UNIQUEIDENTIFIER = 'CF7FB98A-AEA1-4516-9295-9DE30B3D1C24';
DECLARE @Member_KevinMartinez UNIQUEIDENTIFIER = '0A35406A-5631-4AEC-A7D0-02F24705B5C5';
DECLARE @Member_AmandaClark UNIQUEIDENTIFIER = 'D7E974ED-69DB-4DC3-AE22-AEDC0F9A5B8D';
DECLARE @Member_DanielNguyen UNIQUEIDENTIFIER = '1FA7C165-DE2A-495B-A5EC-4A0514455BA3';

-- ============================================================================
-- EVENTS SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Major Events (35 events over 5 years - declare key ones)
DECLARE @Event_AnnualConf2020 UNIQUEIDENTIFIER = '39F84FC0-004C-4EB6-9735-97A0D588D0E4';
DECLARE @Event_AnnualConf2021 UNIQUEIDENTIFIER = '4C561110-3C9E-4F10-A75B-E17C1B32F39E';
DECLARE @Event_AnnualConf2022 UNIQUEIDENTIFIER = 'B99C823E-F892-439C-AF4F-115AC76A8077';
DECLARE @Event_AnnualConf2023 UNIQUEIDENTIFIER = 'A6B2F811-A90B-422B-A08A-EC315533D5B0';
DECLARE @Event_AnnualConf2024 UNIQUEIDENTIFIER = '2CB19F1E-7CAB-41E1-969D-FAEB5F734A18';
DECLARE @Event_VirtualSummit2024 UNIQUEIDENTIFIER = 'BE99CE5C-5F69-49E1-A744-7029E36DB151';
DECLARE @Event_LeadershipWorkshop UNIQUEIDENTIFIER = '1FC55931-A72E-4ECD-926F-39F6372EDAC5';

-- ============================================================================
-- LEARNING SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Course Categories and Key Courses (60 courses - declare important ones)
DECLARE @Course_CloudArchitect UNIQUEIDENTIFIER = '075AECB8-0914-4B53-A8F5-3609C8ADE64E';
DECLARE @Course_CyberSecurity UNIQUEIDENTIFIER = 'C47973E4-1934-4690-AAD6-3A2FF7A197B0';
DECLARE @Course_DataScience UNIQUEIDENTIFIER = '61B9762B-9467-494F-9CB8-F1F375376023';
DECLARE @Course_Leadership UNIQUEIDENTIFIER = '1BA6CF1F-DEB3-4AED-87FC-C36B3DA2F45E';
DECLARE @Course_DevOps UNIQUEIDENTIFIER = 'DD2FB315-D929-472B-A74A-86DE6E923B24';
DECLARE @Course_AIFundamentals UNIQUEIDENTIFIER = 'F9AD32A4-1982-4C39-8E03-EB16BAE521F8';

-- ============================================================================
-- MARKETING SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Key Campaigns (45 campaigns)
DECLARE @Campaign_Welcome UNIQUEIDENTIFIER = '90FC1D81-2447-436B-B29E-CC200F75D74C';
DECLARE @Campaign_Renewal2024 UNIQUEIDENTIFIER = 'C3D3C165-CB08-4A52-BA47-3D3B439EF5F3';
DECLARE @Campaign_AnnualConfPromo UNIQUEIDENTIFIER = '2DB950D2-1AE5-43E2-BA01-4AB38A73A0DD';

-- Key Segments (80 segments)
DECLARE @Segment_ActiveMembers UNIQUEIDENTIFIER = '854C98A3-49B7-4968-BC82-848A39779AA9';
DECLARE @Segment_Students UNIQUEIDENTIFIER = '7718A1EC-575B-4D52-A908-8AA24C85106E';
DECLARE @Segment_Leadership UNIQUEIDENTIFIER = 'FBBF8FEE-2D85-4ED4-BD47-E1EB1CB4C3BE';

-- ============================================================================
-- EMAIL SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Email Templates (30 templates)
DECLARE @Template_Welcome UNIQUEIDENTIFIER = '27EE327A-B797-4442-A4E3-56D5BCCA1A99';
DECLARE @Template_Renewal60Days UNIQUEIDENTIFIER = '126D9691-DE95-4560-8503-66AD4A4126B1';
DECLARE @Template_Renewal30Days UNIQUEIDENTIFIER = '4E4C11B0-4D82-47BB-B7A5-A24AC925BD8C';
DECLARE @Template_EventInvite UNIQUEIDENTIFIER = '5650FDB1-3805-4066-969D-DD4D27ECF76D';
DECLARE @Template_Newsletter UNIQUEIDENTIFIER = 'C795BBD9-3BA8-4CA4-AE57-11B2FC0D911D';

-- ============================================================================
-- CHAPTERS SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Chapters (15 chapters)
DECLARE @Chapter_SiliconValley UNIQUEIDENTIFIER = 'F6B82C02-4178-4663-BE22-70550443ADFC';
DECLARE @Chapter_Boston UNIQUEIDENTIFIER = '938CD893-143F-4AA8-ACBD-61AC89F0FB4B';
DECLARE @Chapter_Austin UNIQUEIDENTIFIER = 'EB4401DC-0D9D-49E3-8D80-CFADE625FFDF';
DECLARE @Chapter_Seattle UNIQUEIDENTIFIER = 'BF151516-44C4-4D96-9470-CC8DE238ED10';
DECLARE @Chapter_NYC UNIQUEIDENTIFIER = 'A4142042-1792-4E9C-A5A6-CBBA0D64DEAC';
DECLARE @Chapter_WomenInTech UNIQUEIDENTIFIER = '56C83D3F-A83A-4C47-B866-5B978931D793';
DECLARE @Chapter_EarlyCareer UNIQUEIDENTIFIER = 'C0175BA9-0F93-4B26-9798-C950ACCA1C86';

-- ============================================================================
-- GOVERNANCE SCHEMA - UUID DECLARATIONS
-- ============================================================================

-- Committees (12 committees)
DECLARE @Committee_Executive UNIQUEIDENTIFIER = 'A80EF20A-29DC-47D4-BEB9-69C8A25F3243';
DECLARE @Committee_Finance UNIQUEIDENTIFIER = 'B608DF1F-F62C-4E77-B209-B76061192377';
DECLARE @Committee_Membership UNIQUEIDENTIFIER = 'F76AAA1B-A210-4213-9625-74DFC81E680E';
DECLARE @Committee_Events UNIQUEIDENTIFIER = '0B76F9ED-A512-49B3-9D46-18771891A895';
DECLARE @Committee_Education UNIQUEIDENTIFIER = '0A04020D-1AA1-495C-8D90-26784F4A5830';

-- Board Positions (9 positions)
DECLARE @BoardPos_President UNIQUEIDENTIFIER = '2468E717-05E6-4B55-8F0D-C3E07AAAEF36';
DECLARE @BoardPos_VicePresident UNIQUEIDENTIFIER = '357408F6-1CC0-4C0D-9D68-84A0AE942463';
DECLARE @BoardPos_Treasurer UNIQUEIDENTIFIER = '351B7B97-C0B0-440B-8A25-5B82E6BE32E9';
DECLARE @BoardPos_Secretary UNIQUEIDENTIFIER = '765DFC28-9E53-4C15-86AA-2ECB02065A7C';
DECLARE @BoardPos_Director1 UNIQUEIDENTIFIER = '9DC53781-6675-43C1-AEC2-8A93847A68CB';
DECLARE @BoardPos_Director2 UNIQUEIDENTIFIER = 'E3469BA4-CD7D-47F9-B571-E9E3A08D6344';
DECLARE @BoardPos_Director3 UNIQUEIDENTIFIER = '830433B7-C43D-4EA8-8EB0-5C4FDDF48E33';
DECLARE @BoardPos_Director4 UNIQUEIDENTIFIER = 'C8120B7A-39F9-4951-8163-624D2272EEDC';
DECLARE @BoardPos_Director5 UNIQUEIDENTIFIER = 'C19F9A6C-D2B0-45E1-AA80-763CA8BDB41D';

-- ============================================================================

-- Note: No GO statement here - variables must persist into parent script
-- Note: No PRINT statements here - they cause syntax errors when included
/******************************************************************************
 * Association Sample Database - Membership Data
 * File: 01_membership_data.sql
 *
 * Generates comprehensive membership data including:
 * - 8 Membership Types
 * - 40 Organizations
 * - 500 Members
 * - 625 Membership records (includes renewal history)
 *
 * All dates are relative to parameters defined in 00_parameters.sql
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- MEMBERSHIP TYPES (8 Types)
-- ============================================================================


INSERT INTO [AssociationDemo].[MembershipType] (ID, Name, Description, AnnualDues, RenewalPeriodMonths, IsActive, AllowAutoRenew, RequiresApproval, Benefits, DisplayOrder)
VALUES
    (@MembershipType_Individual, 'Individual Professional', 'Standard individual membership for technology professionals', 295.00, 12, 1, 1, 0, 'Full access to events, courses, and resources. Includes monthly newsletter, member directory access, and discounts on conferences.', 1),
    (@MembershipType_Student, 'Student', 'Discounted membership for full-time students', 95.00, 12, 1, 1, 1, 'Access to educational resources, webinars, and student networking events. Requires verification of student status.', 2),
    (@MembershipType_Corporate, 'Corporate', 'Enterprise membership for organizations with multiple employees', 2500.00, 12, 1, 1, 0, 'Covers up to 10 employees. Includes all individual benefits plus corporate branding opportunities and dedicated account management.', 3),
    (@MembershipType_Lifetime, 'Lifetime Member', 'One-time payment for lifetime membership', 5000.00, 1200, 1, 0, 0, 'All Individual Professional benefits for life. Recognition in member directory and special lifetime member events.', 4),
    (@MembershipType_Retired, 'Retired Professional', 'Reduced rate for retired industry professionals', 150.00, 12, 1, 1, 0, 'Full member benefits at a reduced rate for retired professionals. Includes emeritus status recognition.', 5),
    (@MembershipType_EarlyCareer, 'Early Career Professional', 'Special rate for professionals with less than 5 years experience', 195.00, 12, 1, 1, 0, 'Full member benefits with additional mentorship program access and career development resources.', 6),
    (@MembershipType_International, 'International Member', 'Membership for professionals outside North America', 350.00, 12, 1, 1, 0, 'All Individual Professional benefits with international event access and global member directory.', 7),
    (@MembershipType_Honorary, 'Honorary Member', 'Complimentary membership for distinguished contributors', 0.00, 12, 1, 0, 1, 'Awarded by the board for outstanding contributions to the field. Includes all member benefits with special recognition.', 8);


-- ============================================================================
-- ORGANIZATIONS (40 Organizations)
-- ============================================================================


INSERT INTO [AssociationDemo].[Organization] (ID, Name, Industry, EmployeeCount, AnnualRevenue, MarketCapitalization, TickerSymbol, Exchange, Website, Description, YearFounded, City, State, Country, Phone)
VALUES
    -- Real Public Technology Companies (10)
    (@Org_TechVentures, 'Microsoft Corporation', 'Cloud & AI', 238000, 245000000000.00, 3100000000000.00, 'MSFT', 'NASDAQ', 'https://www.microsoft.com', 'Global technology company providing cloud computing, software, and AI services', 1975, 'Redmond', 'WA', 'United States', '425-882-8080'),
    (@Org_CloudScale, 'Salesforce, Inc.', 'Cloud Software', 79000, 34850000000.00, 245000000000.00, 'CRM', 'NYSE', 'https://www.salesforce.com', 'Leading customer relationship management (CRM) and enterprise cloud computing company', 1999, 'San Francisco', 'CA', 'United States', '415-901-7000'),
    (@Org_DataDriven, 'NVIDIA Corporation', 'AI & Semiconductors', 29600, 60920000000.00, 2900000000000.00, 'NVDA', 'NASDAQ', 'https://www.nvidia.com', 'AI computing company and leader in graphics processing units (GPUs)', 1993, 'Santa Clara', 'CA', 'United States', '408-486-2000'),
    (@Org_CyberShield, 'Palo Alto Networks', 'Cybersecurity', 14000, 6900000000.00, 120000000000.00, 'PANW', 'NASDAQ', 'https://www.paloaltonetworks.com', 'Global cybersecurity leader providing network security and cloud security solutions', 2005, 'Santa Clara', 'CA', 'United States', '408-753-4000'),
    (@Org_HealthTech, 'Oracle Corporation', 'Enterprise Software', 164000, 50000000000.00, 380000000000.00, 'ORCL', 'NYSE', 'https://www.oracle.com', 'Multi-national computer technology company specializing in database software and cloud computing', 1977, 'Austin', 'TX', 'United States', '650-506-7000'),
    (@Org_FinancialEdge, 'ServiceNow, Inc.', 'Enterprise Software', 24000, 9300000000.00, 170000000000.00, 'NOW', 'NYSE', 'https://www.servicenow.com', 'Cloud computing platform helping enterprises digitize and unify customer operations', 2003, 'Santa Clara', 'CA', 'United States', '408-501-8550'),
    (@Org_RetailInnovate, 'Shopify Inc.', 'E-Commerce', 11600, 7060000000.00, 80000000000.00, 'SHOP', 'NYSE', 'https://www.shopify.com', 'E-commerce platform enabling businesses to create online stores', 2006, 'Ottawa', 'Ontario', 'Canada', '+1-888-746-7439'),
    (@Org_EduTech, 'Adobe Inc.', 'Digital Media Software', 29000, 19410000000.00, 220000000000.00, 'ADBE', 'NASDAQ', 'https://www.adobe.com', 'Multinational computer software company known for creative and digital marketing solutions', 1982, 'San Jose', 'CA', 'United States', '408-536-6000'),
    (@Org_ManufacturePro, 'Workday, Inc.', 'Enterprise Cloud', 18000, 7260000000.00, 65000000000.00, 'WDAY', 'NASDAQ', 'https://www.workday.com', 'Enterprise cloud applications for finance, HR, and planning', 2005, 'Pleasanton', 'CA', 'United States', '925-951-9000'),
    (@Org_LogisticsPrime, 'Snowflake Inc.', 'Data Cloud', 6800, 2670000000.00, 52000000000.00, 'SNOW', 'NYSE', 'https://www.snowflake.com', 'Cloud-based data warehouse platform enabling data storage and analytics', 2012, 'Bozeman', 'MT', 'United States', '844-766-9355'),

    -- Real Public Financial Services & Healthcare (5)
    (NEWID(), 'JPMorgan Chase & Co.', 'Banking & Financial Services', 308669, 158100000000.00, 580000000000.00, 'JPM', 'NYSE', 'https://www.jpmorganchase.com', 'Global financial services firm and the largest bank in the United States', 1799, 'New York', 'NY', 'United States', '212-270-6000'),
    (NEWID(), 'Goldman Sachs Group, Inc.', 'Investment Banking', 45000, 46540000000.00, 155000000000.00, 'GS', 'NYSE', 'https://www.goldmansachs.com', 'Leading global investment banking, securities, and investment management firm', 1869, 'New York', 'NY', 'United States', '212-902-1000'),
    (NEWID(), 'UnitedHealth Group Inc.', 'Healthcare Services', 440000, 371600000000.00, 520000000000.00, 'UNH', 'NYSE', 'https://www.unitedhealthgroup.com', 'Diversified healthcare company providing health insurance and healthcare services', 1977, 'Minnetonka', 'MN', 'United States', '952-936-1300'),
    (NEWID(), 'CVS Health Corporation', 'Healthcare', 300000, 357000000000.00, 82000000000.00, 'CVS', 'NYSE', 'https://www.cvshealth.com', 'Integrated pharmacy healthcare company with retail locations and PBM services', 1963, 'Woonsocket', 'RI', 'United States', '401-765-1500'),
    (NEWID(), 'Visa Inc.', 'Payment Technology', 26500, 35900000000.00, 580000000000.00, 'V', 'NYSE', 'https://www.visa.com', 'Global payments technology company enabling electronic fund transfers worldwide', 1958, 'San Francisco', 'CA', 'United States', '650-432-3200'),

    -- Real Public Consulting & Services (3)
    (NEWID(), 'Accenture plc', 'Professional Services', 738000, 64100000000.00, 220000000000.00, 'ACN', 'NYSE', 'https://www.accenture.com', 'Global professional services company providing strategy, consulting, and technology services', 1989, 'Dublin', NULL, 'Ireland', '+353-1-646-2000'),
    (NEWID(), 'Cognizant Technology Solutions', 'IT Services', 347700, 19400000000.00, 38000000000.00, 'CTSH', 'NASDAQ', 'https://www.cognizant.com', 'Multinational IT services and consulting company specializing in digital transformation', 1994, 'Teaneck', 'NJ', 'United States', '201-801-0233'),
    (NEWID(), 'Atlassian Corporation', 'Collaboration Software', 12000, 3500000000.00, 52000000000.00, 'TEAM', 'NASDAQ', 'https://www.atlassian.com', 'Australian software company specializing in collaboration and productivity software', 2002, 'Sydney', 'NSW', 'Australia', '+61-2-9256-9600'),

    -- Fictional Private Companies (22) - Mix with real companies for variety
    (NEWID(), 'DevOps Masters', 'DevOps Tools', 180, 52000000.00, NULL, NULL, NULL, 'https://www.devopsmasters.io', 'Continuous integration and deployment automation platform', 2019, 'Portland', 'OR', 'United States', '503-555-0111'),
    (NEWID(), 'CodeCraft Studios', 'Software Development', 125, 28000000.00, NULL, NULL, NULL, 'https://www.codecraft.dev', 'Custom software development and engineering services', 2018, 'Boulder', 'CO', 'United States', '720-555-0112'),
    (NEWID(), 'APIGate Solutions', 'API Management', 95, 22000000.00, NULL, NULL, NULL, 'https://www.apigate.com', 'API management and integration platform', 2020, 'San Jose', 'CA', 'United States', '408-555-0113'),
    (NEWID(), 'MobileFirst Apps', 'Mobile Development', 160, 45000000.00, NULL, NULL, NULL, 'https://www.mobilefirst.app', 'Mobile application development and deployment platform', 2017, 'Los Angeles', 'CA', 'United States', '213-555-0114'),
    (NEWID(), 'Quantum Computing Labs', 'Emerging Technology', 85, 35000000.00, NULL, NULL, NULL, 'https://www.quantumlabs.tech', 'Quantum computing research and applications', 2021, 'Cambridge', 'MA', 'United States', '617-555-0115'),
    (NEWID(), 'MediConnect Systems', 'Healthcare IT', 420, 135000000.00, NULL, NULL, NULL, 'https://www.mediconnect.health', 'Healthcare interoperability and data exchange platform', 2014, 'Nashville', 'TN', 'United States', '615-555-0116'),
    (NEWID(), 'PatientFirst Technology', 'Patient Engagement', 210, 68000000.00, NULL, NULL, NULL, 'https://www.patientfirst.com', 'Patient engagement and communication platform', 2016, 'Minneapolis', 'MN', 'United States', '612-555-0117'),
    (NEWID(), 'PharmaTech Solutions', 'Pharmaceutical IT', 340, 98000000.00, NULL, NULL, NULL, 'https://www.pharmatech.com', 'Pharmaceutical research and compliance software', 2013, 'Philadelphia', 'PA', 'United States', '215-555-0118'),
    (NEWID(), 'HealthAnalytics Pro', 'Healthcare Analytics', 190, 55000000.00, NULL, NULL, NULL, 'https://www.healthanalytics.com', 'Healthcare data analytics and population health management', 2017, 'Phoenix', 'AZ', 'United States', '602-555-0119'),
    (NEWID(), 'TeleMed Connect', 'Telemedicine', 145, 42000000.00, NULL, NULL, NULL, 'https://www.telemed.health', 'Telemedicine platform and remote care solutions', 2020, 'San Diego', 'CA', 'United States', '619-555-0120'),
    (NEWID(), 'PaymentStream Inc.', 'Payment Processing', 520, 185000000.00, NULL, NULL, NULL, 'https://www.paymentstream.com', 'Payment processing and merchant services', 2012, 'Charlotte', 'NC', 'United States', '704-555-0121'),
    (NEWID(), 'InsurTech Innovations', 'Insurance Technology', 280, 88000000.00, NULL, NULL, NULL, 'https://www.insurtech.com', 'Insurance technology and underwriting platform', 2015, 'Hartford', 'CT', 'United States', '860-555-0122'),
    (NEWID(), 'WealthManage Systems', 'Wealth Management', 165, 62000000.00, NULL, NULL, NULL, 'https://www.wealthmanage.com', 'Wealth management and financial planning software', 2016, 'Dallas', 'TX', 'United States', '214-555-0123'),
    (NEWID(), 'CryptoSecure Technologies', 'Blockchain & Crypto', 95, 38000000.00, NULL, NULL, NULL, 'https://www.cryptosecure.io', 'Cryptocurrency security and blockchain solutions', 2019, 'Miami', 'FL', 'United States', '305-555-0124'),
    (NEWID(), 'RegTech Compliance', 'Regulatory Technology', 140, 48000000.00, NULL, NULL, NULL, 'https://www.regtech.com', 'Regulatory compliance and risk management software', 2017, 'Washington', 'DC', 'United States', '202-555-0125'),
    (NEWID(), 'Digital Transform Partners', 'IT Consulting', 350, 125000000.00, NULL, NULL, NULL, 'https://www.digitaltransform.com', 'Digital transformation consulting and implementation services', 2011, 'New York', 'NY', 'United States', '212-555-0126'),
    (NEWID(), 'CloudMigrate Consulting', 'Cloud Consulting', 180, 68000000.00, NULL, NULL, NULL, 'https://www.cloudmigrate.com', 'Cloud migration and optimization consulting', 2015, 'San Francisco', 'CA', 'United States', '415-555-0127'),
    (NEWID(), 'AgileCoach Group', 'Agile Consulting', 85, 28000000.00, NULL, NULL, NULL, 'https://www.agilecoach.com', 'Agile transformation and coaching services', 2016, 'Austin', 'TX', 'United States', '512-555-0128'),
    (NEWID(), 'DataStrategy Advisors', 'Data Consulting', 120, 45000000.00, NULL, NULL, NULL, 'https://www.datastrategy.com', 'Data strategy and analytics consulting', 2014, 'Chicago', 'IL', 'United States', '312-555-0129'),
    (NEWID(), 'SecurityFirst Consulting', 'Security Consulting', 95, 35000000.00, NULL, NULL, NULL, 'https://www.securityfirst.com', 'Cybersecurity consulting and penetration testing', 2017, 'Seattle', 'WA', 'United States', '206-555-0130'),
    (NEWID(), 'AIStartup Labs', 'Artificial Intelligence', 42, 8500000.00, NULL, NULL, NULL, 'https://www.aistartup.ai', 'Early-stage AI research and development', 2022, 'Palo Alto', 'CA', 'United States', '650-555-0136'),
    (NEWID(), 'GreenTech Innovations', 'Sustainability Tech', 35, 6800000.00, NULL, NULL, NULL, 'https://www.greentech.eco', 'Sustainable technology solutions for climate change', 2022, 'Portland', 'OR', 'United States', '503-555-0138');


-- ============================================================================
-- MEMBERS (500 Members)
-- ============================================================================


-- Key Members with Full Details (Mix of real executives from public companies and fictional members)
INSERT INTO [AssociationDemo].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country, Phone, LinkedInURL)
VALUES
    -- Real Executives from Public Companies
    (@Member_SarahChen, 'satya.nadella@microsoft.com', 'Satya', 'Nadella', 'Chairman and Chief Executive Officer', @Org_TechVentures, 'Cloud & AI', 'Executive', 33, DATEADD(DAY, -1825, @EndDate), 'Redmond', 'WA', 'United States', '425-882-8080', 'https://linkedin.com/in/satyanadella'),
    (@Member_MichaelJohnson, 'marc.benioff@salesforce.com', 'Marc', 'Benioff', 'Chair and Chief Executive Officer', @Org_CloudScale, 'Cloud Software', 'Executive', 40, DATEADD(DAY, -1950, @EndDate), 'San Francisco', 'CA', 'United States', '415-901-7000', 'https://linkedin.com/in/marcbenioff'),
    (@Member_EmilyRodriguez, 'jensen.huang@nvidia.com', 'Jensen', 'Huang', 'Founder, President and Chief Executive Officer', @Org_DataDriven, 'AI & Semiconductors', 'Executive', 30, DATEADD(DAY, -1680, @EndDate), 'Santa Clara', 'CA', 'United States', '408-486-2000', 'https://linkedin.com/in/jensenh'),
    (@Member_DavidKim, 'nikesh.arora@paloaltonetworks.com', 'Nikesh', 'Arora', 'Chairman and Chief Executive Officer', @Org_CyberShield, 'Cybersecurity', 'Executive', 35, DATEADD(DAY, -1460, @EndDate), 'Santa Clara', 'CA', 'United States', '408-753-4000', 'https://linkedin.com/in/nikesharora'),
    (@Member_JessicaLee, 'safra.catz@oracle.com', 'Safra', 'Catz', 'Chief Executive Officer', @Org_HealthTech, 'Enterprise Software', 'Executive', 25, DATEADD(DAY, -1280, @EndDate), 'Austin', 'TX', 'United States', '650-506-7000', 'https://linkedin.com/in/safracatz'),
    (@Member_RobertBrown, 'bill.mcdermott@servicenow.com', 'Bill', 'McDermott', 'Chairman and Chief Executive Officer', @Org_FinancialEdge, 'Enterprise Software', 'Executive', 40, DATEADD(DAY, -1825, @EndDate), 'Santa Clara', 'CA', 'United States', '408-501-8550', 'https://linkedin.com/in/williammcdermott'),
    (@Member_LisaAnderson, 'tobi.lutke@shopify.com', 'Tobi', 'Lütke', 'Founder and Chief Executive Officer', @Org_RetailInnovate, 'E-Commerce', 'Executive', 20, DATEADD(DAY, -1095, @EndDate), 'Ottawa', 'Ontario', 'Canada', '+1-888-746-7439', 'https://linkedin.com/in/tobi'),
    (@Member_JamesPatel, 'shantanu.narayen@adobe.com', 'Shantanu', 'Narayen', 'Chairman and Chief Executive Officer', @Org_EduTech, 'Digital Media Software', 'Executive', 32, DATEADD(DAY, -1680, @EndDate), 'San Jose', 'CA', 'United States', '408-536-6000', 'https://linkedin.com/in/shantanunarayen'),
    (@Member_MariaGarcia, 'aneel.bhusri@workday.com', 'Aneel', 'Bhusri', 'Co-Founder and Executive Chairman', @Org_ManufacturePro, 'Enterprise Cloud', 'Executive', 25, DATEADD(DAY, -1460, @EndDate), 'Pleasanton', 'CA', 'United States', '925-951-9000', 'https://linkedin.com/in/aneelbhusri'),
    (@Member_JohnSmith, 'frank.slootman@snowflake.com', 'Frank', 'Slootman', 'Chairman and Chief Executive Officer', @Org_LogisticsPrime, 'Data Cloud', 'Executive', 40, DATEADD(DAY, -1280, @EndDate), 'Bozeman', 'MT', 'United States', '844-766-9355', 'https://linkedin.com/in/frankslootman'),

    -- Fictional Members (mix of different roles and experience levels)
    (@Member_AlexTaylor, 'alex.taylor@university.edu', 'Alex', 'Taylor', 'Graduate Student', NULL, 'Computer Science', 'Student', 2, DATEADD(DAY, -180, @EndDate), 'Cambridge', 'MA', 'United States', '617-555-1011', 'https://linkedin.com/in/alextaylor'),
    (@Member_RachelWilson, 'rachel.wilson@microsoft.com', 'Rachel', 'Wilson', 'Senior DevOps Engineer', @Org_TechVentures, 'Cloud & AI', 'DevOps', 7, DATEADD(DAY, -640, @EndDate), 'Redmond', 'WA', 'United States', '425-555-1012', 'https://linkedin.com/in/rachelwilson'),
    (@Member_KevinMartinez, 'kevin.martinez@salesforce.com', 'Kevin', 'Martinez', 'Principal Cloud Architect', @Org_CloudScale, 'Cloud Software', 'Cloud Architecture', 13, DATEADD(DAY, -1200, @EndDate), 'San Francisco', 'CA', 'United States', '415-555-1013', 'https://linkedin.com/in/kevinmartinez'),
    (@Member_AmandaClark, 'amanda.clark@nvidia.com', 'Amanda', 'Clark', 'Machine Learning Engineer', @Org_DataDriven, 'AI & Semiconductors', 'Machine Learning', 6, DATEADD(DAY, -550, @EndDate), 'Santa Clara', 'CA', 'United States', '408-555-1014', 'https://linkedin.com/in/amandaclark'),
    (@Member_DanielNguyen, 'daniel.nguyen@paloaltonetworks.com', 'Daniel', 'Nguyen', 'Security Operations Manager', @Org_CyberShield, 'Cybersecurity', 'Security Operations', 9, DATEADD(DAY, -820, @EndDate), 'Santa Clara', 'CA', 'United States', '408-555-1015', 'https://linkedin.com/in/danielnguyen');


-- Remaining 485 members generated programmatically with realistic distributions
DECLARE @CurrentOrg UNIQUEIDENTIFIER;
DECLARE @MemberJoinDaysAgo INT;
DECLARE @FirstNames TABLE (FirstName NVARCHAR(50));
DECLARE @LastNames TABLE (LastName NVARCHAR(50));
DECLARE @Titles TABLE (Title NVARCHAR(100), JobFunction NVARCHAR(100), YearsMin INT, YearsMax INT);
DECLARE @Cities TABLE (City NVARCHAR(100), State NVARCHAR(50), Country NVARCHAR(100));

-- Populate name pools
INSERT INTO @FirstNames VALUES
('Jennifer'),('Thomas'),('Patricia'),('Christopher'),('Michelle'),
('Brandon'),('Rebecca'),('Andrew'),('Stephanie'),('Joshua'),
('Nicole'),('Ryan'),('Angela'),('Justin'),('Melissa'),
('Adam'),('Katherine'),('Brian'),('Amy'),('Jason'),
('Samantha'),('Matthew'),('Laura'),('Anthony'),('Elizabeth'),
('Jonathan'),('Ashley'),('William'),('Heather'),('Joseph'),
('Anna'),('Daniel'),('Kimberly'),('Charles'),('Brittany'),
('Eric'),('Amanda'),('Gregory'),('Lauren'),('Benjamin'),
('Megan'),('Kenneth'),('Rachel'),('Steven'),('Danielle'),
('Timothy'),('Christina'),('Nathan'),('Crystal'),('Jeffrey');

INSERT INTO @LastNames VALUES
('Smith'),('Johnson'),('Williams'),('Brown'),('Jones'),
('Garcia'),('Miller'),('Davis'),('Rodriguez'),('Martinez'),
('Hernandez'),('Lopez'),('Gonzalez'),('Wilson'),('Anderson'),
('Thomas'),('Taylor'),('Moore'),('Jackson'),('Martin'),
('Lee'),('Perez'),('Thompson'),('White'),('Harris'),
('Sanchez'),('Clark'),('Ramirez'),('Lewis'),('Robinson'),
('Walker'),('Young'),('Allen'),('King'),('Wright'),
('Scott'),('Torres'),('Nguyen'),('Hill'),('Flores'),
('Green'),('Adams'),('Nelson'),('Baker'),('Hall'),
('Rivera'),('Campbell'),('Mitchell'),('Carter'),('Roberts');

INSERT INTO @Titles VALUES
('Software Engineer', 'Software Development', 2, 8),
('Senior Software Engineer', 'Software Development', 5, 12),
('Principal Engineer', 'Software Development', 10, 20),
('Engineering Manager', 'Engineering Leadership', 8, 15),
('Director of Engineering', 'Engineering Leadership', 12, 20),
('VP of Engineering', 'Engineering Leadership', 15, 25),
('Product Manager', 'Product Management', 3, 10),
('Senior Product Manager', 'Product Management', 6, 15),
('Data Scientist', 'Data Science', 2, 8),
('Senior Data Scientist', 'Data Science', 5, 12),
('Machine Learning Engineer', 'Machine Learning', 3, 10),
('DevOps Engineer', 'DevOps', 2, 8),
('Senior DevOps Engineer', 'DevOps', 5, 12),
('Cloud Architect', 'Cloud Architecture', 6, 15),
('Solutions Architect', 'Solutions Architecture', 5, 12),
('Security Engineer', 'Security', 3, 10),
('Security Architect', 'Security Architecture', 8, 15),
('QA Engineer', 'Quality Assurance', 2, 8),
('Senior QA Engineer', 'Quality Assurance', 5, 12),
('UX Designer', 'Design', 2, 8),
('Senior UX Designer', 'Design', 5, 12),
('UI/UX Lead', 'Design', 8, 15),
('Data Analyst', 'Data Analysis', 2, 6),
('Business Analyst', 'Business Analysis', 3, 8),
('Scrum Master', 'Agile', 3, 10),
('Technical Lead', 'Technical Leadership', 6, 12),
('Team Lead', 'Team Leadership', 5, 10),
('CTO', 'Executive', 15, 30),
('VP of Technology', 'Executive', 12, 25),
('Chief Architect', 'Architecture', 15, 25);

INSERT INTO @Cities VALUES
('Austin', 'TX', 'United States'),('Seattle', 'WA', 'United States'),
('San Francisco', 'CA', 'United States'),('Boston', 'MA', 'United States'),
('Chicago', 'IL', 'United States'),('New York', 'NY', 'United States'),
('Denver', 'CO', 'United States'),('Los Angeles', 'CA', 'United States'),
('Portland', 'OR', 'United States'),('Atlanta', 'GA', 'United States'),
('Dallas', 'TX', 'United States'),('Phoenix', 'AZ', 'United States'),
('San Diego', 'CA', 'United States'),('Charlotte', 'NC', 'United States'),
('Miami', 'FL', 'United States'),('Minneapolis', 'MN', 'United States'),
('Detroit', 'MI', 'United States'),('Nashville', 'TN', 'United States'),
('Philadelphia', 'PA', 'United States'),('Washington', 'DC', 'United States'),
('Toronto', 'Ontario', 'Canada'),('Vancouver', 'BC', 'Canada'),
('London', NULL, 'United Kingdom'),('Singapore', NULL, 'Singapore'),
('Sydney', 'NSW', 'Australia');

-- Generate 485 additional members
INSERT INTO [AssociationDemo].[Member] (ID, Email, FirstName, LastName, Title, OrganizationID, Industry, JobFunction, YearsInProfession, JoinDate, City, State, Country)
SELECT TOP 485
    NEWID(),
    LOWER(fn.FirstName + '.' + ln.LastName + CAST(ABS(CHECKSUM(NEWID()) % 1000) AS NVARCHAR(10)) + '@' +
        CASE ABS(CHECKSUM(NEWID()) % 10)
            WHEN 0 THEN 'techventures.com'
            WHEN 1 THEN 'cloudscale.io'
            WHEN 2 THEN 'example.com'
            WHEN 3 THEN 'company.com'
            WHEN 4 THEN 'tech.io'
            WHEN 5 THEN 'software.com'
            WHEN 6 THEN 'solutions.com'
            WHEN 7 THEN 'consulting.com'
            WHEN 8 THEN 'systems.com'
            ELSE 'services.com'
        END
    ),
    fn.FirstName,
    ln.LastName,
    t.Title,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 70 THEN o.ID ELSE NULL END, -- 70% have organization
    CASE ABS(CHECKSUM(NEWID()) % 12)
        WHEN 0 THEN 'Software & SaaS'
        WHEN 1 THEN 'Cloud Infrastructure'
        WHEN 2 THEN 'Data & AI'
        WHEN 3 THEN 'Cybersecurity'
        WHEN 4 THEN 'Healthcare Technology'
        WHEN 5 THEN 'FinTech'
        WHEN 6 THEN 'Consulting'
        WHEN 7 THEN 'Education Technology'
        WHEN 8 THEN 'Manufacturing Software'
        WHEN 9 THEN 'Logistics & Supply Chain'
        WHEN 10 THEN 'Retail Technology'
        ELSE 'Technology Services'
    END,
    t.JobFunction,
    t.YearsMin + ABS(CHECKSUM(NEWID()) % (t.YearsMax - t.YearsMin + 1)),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 1825), @EndDate), -- Join dates spread over 5 years
    c.City,
    c.State,
    c.Country
FROM @FirstNames fn
CROSS JOIN @LastNames ln
CROSS JOIN @Titles t
CROSS JOIN @Cities c
CROSS APPLY (
    SELECT TOP 1 ID FROM [AssociationDemo].[Organization] ORDER BY NEWID()
) o
ORDER BY NEWID();


-- ============================================================================
-- MEMBERSHIPS (625 records including renewals)
-- ============================================================================


-- Key members with detailed renewal histories (17 records for the 15 key members)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
VALUES
    -- Sarah Chen - Active Individual Member with 4 renewals
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -1460, @EndDate), DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -1095, @EndDate), 1),
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -730, @EndDate), 1),
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -365, @EndDate), DATEADD(DAY, -365, @EndDate), 1),
    (NEWID(), @Member_SarahChen, @MembershipType_Individual, 'Active', DATEADD(DAY, -365, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- Michael Johnson - Active Corporate Member with 5 renewals
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -1825, @EndDate), DATEADD(DAY, -1460, @EndDate), DATEADD(DAY, -1460, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -1460, @EndDate), DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -1095, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -730, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -365, @EndDate), DATEADD(DAY, -365, @EndDate), 1),
    (NEWID(), @Member_MichaelJohnson, @MembershipType_Corporate, 'Active', DATEADD(DAY, -365, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- Emily Rodriguez - Active Individual Member with 3 renewals
    (NEWID(), @Member_EmilyRodriguez, @MembershipType_Individual, 'Active', DATEADD(DAY, -1095, @EndDate), DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -730, @EndDate), 1),
    (NEWID(), @Member_EmilyRodriguez, @MembershipType_Individual, 'Active', DATEADD(DAY, -730, @EndDate), DATEADD(DAY, -365, @EndDate), DATEADD(DAY, -365, @EndDate), 1),
    (NEWID(), @Member_EmilyRodriguez, @MembershipType_Individual, 'Active', DATEADD(DAY, -365, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- David Kim - Active Individual Member with 4 renewals
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -1680, @EndDate), DATEADD(DAY, -1315, @EndDate), DATEADD(DAY, -1315, @EndDate), 1),
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -1315, @EndDate), DATEADD(DAY, -950, @EndDate), DATEADD(DAY, -950, @EndDate), 1),
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -950, @EndDate), DATEADD(DAY, -585, @EndDate), DATEADD(DAY, -585, @EndDate), 1),
    (NEWID(), @Member_DavidKim, @MembershipType_Individual, 'Active', DATEADD(DAY, -585, @EndDate), DATEADD(DAY, 365, @EndDate), NULL, 1),

    -- Alex Taylor - Student Member (joined 6 months ago)
    (NEWID(), @Member_AlexTaylor, @MembershipType_Student, 'Active', DATEADD(DAY, -180, @EndDate), DATEADD(DAY, 185, @EndDate), NULL, 1);


-- Generate memberships for all remaining members (608 more to reach 625)
-- 80% will be Active, 15% Expired, 5% Cancelled
-- 25% will have renewal history (multiple records)
DECLARE @MembershipTypeDistribution TABLE (TypeID UNIQUEIDENTIFIER, Probability INT);
INSERT INTO @MembershipTypeDistribution VALUES
    (@MembershipType_Individual, 60),      -- 60% Individual
    (@MembershipType_Student, 10),          -- 10% Student
    (@MembershipType_Corporate, 15),        -- 15% Corporate
    (@MembershipType_EarlyCareer, 10),      -- 10% Early Career
    (@MembershipType_Retired, 3),           -- 3% Retired
    (@MembershipType_International, 2);     -- 2% International

-- First membership for each remaining member (483 members = 483 records)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT
    NEWID(),
    m.ID,
    -- Use weighted random selection with COALESCE to ensure non-NULL
    COALESCE(
        (SELECT TOP 1 TypeID FROM @MembershipTypeDistribution
         WHERE Probability >= ABS(CHECKSUM(NEWID()) % 100)
         ORDER BY Probability DESC),
        @MembershipType_Individual  -- Fallback to Individual if no match
    ),
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 80 THEN 'Active'
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 95 THEN 'Lapsed'
        ELSE 'Cancelled'
    END,
    m.JoinDate,
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 80 THEN DATEADD(YEAR, 1, m.JoinDate) -- Active: future end date
        ELSE DATEADD(MONTH, 6, m.JoinDate) -- Expired/Cancelled: past end date
    END,
    NULL,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 70 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Member] m
WHERE m.ID NOT IN (@Member_SarahChen, @Member_MichaelJohnson, @Member_EmilyRodriguez, @Member_DavidKim, @Member_AlexTaylor);


-- Additional renewal records for 25% of members (125 additional records to get to 625 total)
INSERT INTO [AssociationDemo].[Membership] (ID, MemberID, MembershipTypeID, Status, StartDate, EndDate, RenewalDate, AutoRenew)
SELECT TOP 125
    NEWID(),
    ms.MemberID,
    ms.MembershipTypeID,
    'Active',
    DATEADD(YEAR, -1, ms.StartDate),
    ms.StartDate,
    ms.StartDate,
    1
FROM [AssociationDemo].[Membership] ms
WHERE ms.MemberID NOT IN (@Member_SarahChen, @Member_MichaelJohnson, @Member_EmilyRodriguez, @Member_DavidKim, @Member_AlexTaylor)
  AND ms.Status = 'Active'
ORDER BY NEWID();


-- Note: No GO statement here - variables must persist within transaction
/******************************************************************************
 * Association Sample Database - Events Data
 * File: 02_events_data.sql
 *
 * Generates comprehensive events data including:
 * - 35 Events (conferences, webinars, workshops)
 * - 85 Event Sessions (for multi-day conferences)
 * - 1,400 Event Registrations (generated programmatically)
 *
 * All dates are relative to parameters defined in 00_parameters.sql
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- EVENTS (35 Events over 5 years)
-- ============================================================================


-- Annual Conferences (5 years)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    (@Event_AnnualConf2020, '2020 Annual Technology Leadership Summit', 'Conference',
     DATEADD(DAY, -1650, @EndDate), DATEADD(DAY, -1647, @EndDate), 'America/New_York',
     'Boston Convention Center, Boston, MA', 0, 500,
     DATEADD(DAY, -1740, @EndDate), DATEADD(DAY, -1655, @EndDate),
     599.00, 799.00, 12.0,
     'Our flagship annual conference brings together technology leaders from across industries. Three days of keynotes, workshops, and networking.',
     'Completed'),

    (@Event_AnnualConf2021, '2021 Annual Technology Leadership Summit', 'Conference',
     DATEADD(DAY, -1285, @EndDate), DATEADD(DAY, -1282, @EndDate), 'America/Chicago',
     'McCormick Place, Chicago, IL', 0, 500,
     DATEADD(DAY, -1375, @EndDate), DATEADD(DAY, -1290, @EndDate),
     599.00, 799.00, 12.0,
     'Year two of our premier conference focusing on digital transformation and emerging technologies.',
     'Completed'),

    (@Event_AnnualConf2022, '2022 Annual Technology Leadership Summit', 'Conference',
     DATEADD(DAY, -920, @EndDate), DATEADD(DAY, -917, @EndDate), 'America/Los_Angeles',
     'Los Angeles Convention Center, Los Angeles, CA', 0, 550,
     DATEADD(DAY, -1010, @EndDate), DATEADD(DAY, -925, @EndDate),
     649.00, 849.00, 12.0,
     'Exploring the future of technology with focus on AI, cloud, and cybersecurity.',
     'Completed'),

    (@Event_AnnualConf2023, '2023 Annual Technology Leadership Summit', 'Conference',
     DATEADD(DAY, -555, @EndDate), DATEADD(DAY, -552, @EndDate), 'America/Denver',
     'Colorado Convention Center, Denver, CO', 0, 600,
     DATEADD(DAY, -645, @EndDate), DATEADD(DAY, -560, @EndDate),
     699.00, 899.00, 12.0,
     'Celebrating innovation and leadership in technology. Expanded track on AI and machine learning.',
     'Completed'),

    (@Event_AnnualConf2024, '2024 Annual Technology Leadership Summit', 'Conference',
     DATEADD(DAY, -90, @EndDate), DATEADD(DAY, -87, @EndDate), 'America/New_York',
     'Javits Center, New York, NY', 0, 650,
     DATEADD(DAY, -180, @EndDate), DATEADD(DAY, -95, @EndDate),
     749.00, 949.00, 12.0,
     'Our largest conference yet! Focus on generative AI, cloud architecture, and digital transformation.',
     'Completed');

-- Virtual Summits (2)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, VirtualPlatform, MeetingURL, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    (@Event_VirtualSummit2024, '2024 Virtual Technology Summit', 'Virtual Summit',
     DATEADD(DAY, -180, @EndDate), DATEADD(DAY, -179, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/virtual-summit-2024', 2000,
     DATEADD(DAY, -240, @EndDate), DATEADD(DAY, -181, @EndDate),
     199.00, 299.00, 4.0,
     'Global virtual summit bringing together leaders worldwide. Keynotes and interactive sessions on emerging tech trends.',
     'Completed'),

    (NEWID(), '2024 Winter Virtual Summit - AI & Machine Learning', 'Virtual Summit',
     DATEADD(DAY, 45, @EndDate), DATEADD(DAY, 46, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Teams', 'https://teams.microsoft.com/winter-summit', 2500,
     DATEADD(DAY, -15, @EndDate), DATEADD(DAY, 44, @EndDate),
     199.00, 299.00, 4.0,
     'Deep dive into AI and ML with hands-on workshops and case studies.',
     'Registration Open');

-- Leadership Workshops (5)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    (@Event_LeadershipWorkshop, 'Executive Leadership Workshop - Strategic Technology Planning', 'Workshop',
     DATEADD(DAY, -45, @EndDate), DATEADD(DAY, -44, @EndDate), 'America/Chicago',
     'Hyatt Regency, Chicago, IL', 0, 50,
     DATEADD(DAY, -90, @EndDate), DATEADD(DAY, -47, @EndDate),
     399.00, 549.00, 8.0,
     'Intensive two-day workshop for CTOs and technology executives on strategic planning.',
     'Completed'),

    (NEWID(), 'Technical Leadership Skills Workshop', 'Workshop',
     DATEADD(DAY, -320, @EndDate), DATEADD(DAY, -319, @EndDate), 'America/New_York',
     'Microsoft Technology Center, New York, NY', 0, 40,
     DATEADD(DAY, -380, @EndDate), DATEADD(DAY, -322, @EndDate),
     299.00, 449.00, 6.0,
     'Building effective technical leadership skills for engineering managers.',
     'Completed'),

    (NEWID(), 'Cloud Architecture Intensive Workshop', 'Workshop',
     DATEADD(DAY, -200, @EndDate), DATEADD(DAY, -198, @EndDate), 'America/Los_Angeles',
     'AWS Summit Center, San Francisco, CA', 0, 60,
     DATEADD(DAY, -260, @EndDate), DATEADD(DAY, -202, @EndDate),
     499.00, 649.00, 12.0,
     'Three-day intensive workshop on cloud architecture patterns and best practices.',
     'Completed'),

    (NEWID(), 'Cybersecurity Leadership Workshop', 'Workshop',
     DATEADD(DAY, 25, @EndDate), DATEADD(DAY, 26, @EndDate), 'America/Denver',
     'Denver Tech Center, Denver, CO', 0, 45,
     DATEADD(DAY, -30, @EndDate), DATEADD(DAY, 24, @EndDate),
     449.00, 599.00, 8.0,
     'Security leadership and risk management for technology executives.',
     'Registration Open'),

    (NEWID(), 'Agile Transformation Workshop', 'Workshop',
     DATEADD(DAY, 60, @EndDate), DATEADD(DAY, 61, @EndDate), 'America/Chicago',
     'Agile Training Center, Austin, TX', 0, 35,
     DATEADD(DAY, 10, @EndDate), DATEADD(DAY, 59, @EndDate),
     349.00, 499.00, 6.0,
     'Practical workshop on leading agile transformations in technology organizations.',
     'Registration Open');

-- Webinars (15 over past 2 years)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, VirtualPlatform, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    (NEWID(), 'AI Ethics in Product Development', 'Webinar',
     DATEADD(DAY, -600, @EndDate), DATEADD(DAY, -600, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -630, @EndDate), DATEADD(DAY, -601, @EndDate),
     0.00, 49.00, 1.0,
     'Exploring ethical considerations when building AI-powered products.',
     'Completed'),

    (NEWID(), 'Cloud Cost Optimization Strategies', 'Webinar',
     DATEADD(DAY, -550, @EndDate), DATEADD(DAY, -550, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -580, @EndDate), DATEADD(DAY, -551, @EndDate),
     0.00, 49.00, 1.0,
     'Best practices for managing and optimizing cloud infrastructure costs.',
     'Completed'),

    (NEWID(), 'Zero Trust Security Architecture', 'Webinar',
     DATEADD(DAY, -480, @EndDate), DATEADD(DAY, -480, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 1000,
     DATEADD(DAY, -510, @EndDate), DATEADD(DAY, -481, @EndDate),
     0.00, 49.00, 1.0,
     'Implementing zero trust security in modern cloud environments.',
     'Completed'),

    (NEWID(), 'Data Governance and Privacy Compliance', 'Webinar',
     DATEADD(DAY, -420, @EndDate), DATEADD(DAY, -420, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -450, @EndDate), DATEADD(DAY, -421, @EndDate),
     0.00, 49.00, 1.0,
     'Navigating GDPR, CCPA, and other data privacy regulations.',
     'Completed'),

    (NEWID(), 'Microservices Architecture Patterns', 'Webinar',
     DATEADD(DAY, -350, @EndDate), DATEADD(DAY, -350, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -380, @EndDate), DATEADD(DAY, -351, @EndDate),
     0.00, 49.00, 1.0,
     'Design patterns and best practices for microservices architecture.',
     'Completed'),

    (NEWID(), 'DevOps Culture and Transformation', 'Webinar',
     DATEADD(DAY, -280, @EndDate), DATEADD(DAY, -280, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 1000,
     DATEADD(DAY, -310, @EndDate), DATEADD(DAY, -281, @EndDate),
     0.00, 49.00, 1.0,
     'Building a DevOps culture and implementing continuous delivery.',
     'Completed'),

    (NEWID(), 'Machine Learning in Production', 'Webinar',
     DATEADD(DAY, -210, @EndDate), DATEADD(DAY, -210, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -240, @EndDate), DATEADD(DAY, -211, @EndDate),
     0.00, 49.00, 1.0,
     'Deploying and managing machine learning models in production environments.',
     'Completed'),

    (NEWID(), 'Kubernetes Best Practices', 'Webinar',
     DATEADD(DAY, -140, @EndDate), DATEADD(DAY, -140, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -170, @EndDate), DATEADD(DAY, -141, @EndDate),
     0.00, 49.00, 1.0,
     'Production-ready Kubernetes deployments and operations.',
     'Completed'),

    (NEWID(), 'API Security Fundamentals', 'Webinar',
     DATEADD(DAY, -70, @EndDate), DATEADD(DAY, -70, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 1000,
     DATEADD(DAY, -100, @EndDate), DATEADD(DAY, -71, @EndDate),
     0.00, 49.00, 1.5,
     'Securing APIs and preventing common vulnerabilities.',
     'Completed'),

    (NEWID(), 'Remote Team Management', 'Webinar',
     DATEADD(DAY, -20, @EndDate), DATEADD(DAY, -20, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, -50, @EndDate), DATEADD(DAY, -21, @EndDate),
     0.00, 49.00, 1.0,
     'Best practices for managing distributed technology teams.',
     'Completed'),

    (NEWID(), 'Generative AI for Developers', 'Webinar',
     DATEADD(DAY, 15, @EndDate), DATEADD(DAY, 15, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 1500,
     DATEADD(DAY, -15, @EndDate), DATEADD(DAY, 14, @EndDate),
     0.00, 49.00, 1.5,
     'Practical applications of generative AI in software development.',
     'Registration Open'),

    (NEWID(), 'Cloud Migration Strategies', 'Webinar',
     DATEADD(DAY, 30, @EndDate), DATEADD(DAY, 30, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 1000,
     DATEADD(DAY, 0, @EndDate), DATEADD(DAY, 29, @EndDate),
     0.00, 49.00, 1.0,
     'Step-by-step approach to cloud migration for enterprise applications.',
     'Registration Open'),

    (NEWID(), 'Modern Data Architecture', 'Webinar',
     DATEADD(DAY, 50, @EndDate), DATEADD(DAY, 50, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, 20, @EndDate), DATEADD(DAY, 49, @EndDate),
     0.00, 49.00, 1.0,
     'Building modern data platforms with data lakes and warehouses.',
     'Published'),

    (NEWID(), 'Incident Response and Management', 'Webinar',
     DATEADD(DAY, 75, @EndDate), DATEADD(DAY, 75, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 1000,
     DATEADD(DAY, 45, @EndDate), DATEADD(DAY, 74, @EndDate),
     0.00, 49.00, 1.0,
     'Effective incident response processes and post-mortem analysis.',
     'Published'),

    (NEWID(), 'Platform Engineering Principles', 'Webinar',
     DATEADD(DAY, 90, @EndDate), DATEADD(DAY, 90, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 1000,
     DATEADD(DAY, 60, @EndDate), DATEADD(DAY, 89, @EndDate),
     0.00, 49.00, 1.0,
     'Building internal developer platforms and self-service infrastructure.',
     'Draft');

-- Networking Events (5)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    (NEWID(), 'Technology Leaders Networking Reception - NYC', 'Networking',
     DATEADD(DAY, -120, @EndDate), DATEADD(DAY, -120, @EndDate), 'America/New_York',
     'The Princeton Club, New York, NY', 0, 100,
     DATEADD(DAY, -150, @EndDate), DATEADD(DAY, -121, @EndDate),
     0.00, 75.00, 0.0,
     'Evening networking reception for technology leaders in the NYC area.',
     'Completed'),

    (NEWID(), 'West Coast Tech Networking Dinner', 'Networking',
     DATEADD(DAY, -60, @EndDate), DATEADD(DAY, -60, @EndDate), 'America/Los_Angeles',
     'The Battery, San Francisco, CA', 0, 75,
     DATEADD(DAY, -90, @EndDate), DATEADD(DAY, -61, @EndDate),
     0.00, 75.00, 0.0,
     'Dinner and networking for West Coast technology executives.',
     'Completed'),

    (NEWID(), 'Midwest Tech Leaders Breakfast', 'Networking',
     DATEADD(DAY, 10, @EndDate), DATEADD(DAY, 10, @EndDate), 'America/Chicago',
     'Soho House, Chicago, IL', 0, 60,
     DATEADD(DAY, -20, @EndDate), DATEADD(DAY, 9, @EndDate),
     0.00, 50.00, 0.0,
     'Morning networking breakfast for Midwest technology leaders.',
     'Registration Open'),

    (NEWID(), 'Women in Technology Leadership Reception', 'Networking',
     DATEADD(DAY, 35, @EndDate), DATEADD(DAY, 35, @EndDate), 'America/New_York',
     'Convene, New York, NY', 0, 80,
     DATEADD(DAY, 5, @EndDate), DATEADD(DAY, 34, @EndDate),
     0.00, 0.00, 0.0,
     'Complimentary reception celebrating women technology leaders.',
     'Registration Open'),

    (NEWID(), 'Emerging Leaders Happy Hour', 'Networking',
     DATEADD(DAY, 55, @EndDate), DATEADD(DAY, 55, @EndDate), 'America/Los_Angeles',
     'WeWork, Palo Alto, CA', 0, 50,
     DATEADD(DAY, 25, @EndDate), DATEADD(DAY, 54, @EndDate),
     0.00, 25.00, 0.0,
     'Networking event for early-career technology professionals.',
     'Published');


-- ============================================================================
-- EVENT SESSIONS (For Major Conferences - 85 sessions)
-- ============================================================================


-- 2024 Annual Conference Sessions (30 sessions over 3 days)
INSERT INTO [AssociationDemo].[EventSession] (ID, EventID, Name, Description, StartTime, EndTime, Room, SpeakerName, SessionType, Capacity, CEUCredits)
VALUES
    -- Day 1 - Keynotes and Opening
    (NEWID(), @Event_AnnualConf2024, 'Opening Keynote: The Future of AI in Enterprise',
     'Industry thought leader discusses the transformative impact of AI on business',
     DATEADD(HOUR, 9, DATEADD(DAY, -90, @EndDate)), DATEADD(HOUR, 10, DATEADD(DAY, -90, @EndDate)),
     'Main Hall', 'Dr. Jennifer Walsh, Chief AI Officer at TechCorp', 'Keynote', 650, 1.0),

    (NEWID(), @Event_AnnualConf2024, 'Cloud Architecture Patterns for Scale',
     'Deep dive into patterns for building scalable cloud applications',
     DATEADD(HOUR, 11, DATEADD(DAY, -90, @EndDate)), DATEADD(HOUR, 12, DATEADD(DAY, -90, @EndDate)),
     'Room A', 'Michael Chen, Principal Architect at CloudScale', 'Workshop', 100, 1.0),

    (NEWID(), @Event_AnnualConf2024, 'Cybersecurity Threat Landscape 2024',
     'Current threats and defensive strategies for modern organizations',
     DATEADD(HOUR, 11, DATEADD(DAY, -90, @EndDate)), DATEADD(HOUR, 12, DATEADD(DAY, -90, @EndDate)),
     'Room B', 'Sarah Martinez, CISO at SecureNet', 'Panel', 150, 1.0),

    (NEWID(), @Event_AnnualConf2024, 'DevOps Transformation Case Study',
     'How a Fortune 500 company transformed their delivery process',
     DATEADD(HOUR, 13, DATEADD(DAY, -90, @EndDate)), DATEADD(HOUR, 14, DATEADD(DAY, -90, @EndDate)),
     'Room A', 'David Kim, VP Engineering at Enterprise Co', 'Workshop', 80, 1.0),

    (NEWID(), @Event_AnnualConf2024, 'Machine Learning Operations at Scale',
     'MLOps best practices for production ML systems',
     DATEADD(HOUR, 13, DATEADD(DAY, -90, @EndDate)), DATEADD(HOUR, 14, DATEADD(DAY, -90, @EndDate)),
     'Room B', 'Dr. Lisa Johnson, ML Lead at DataDriven', 'Workshop', 100, 1.0),

    -- Day 2 Sessions
    (NEWID(), @Event_AnnualConf2024, 'Day 2 Keynote: Digital Transformation Success Stories',
     'Leading companies share their digital transformation journeys',
     DATEADD(HOUR, 9, DATEADD(DAY, -89, @EndDate)), DATEADD(HOUR, 10, DATEADD(DAY, -89, @EndDate)),
     'Main Hall', 'Panel of CTOs from Fortune 500 companies', 'Keynote', 650, 1.0),

    (NEWID(), @Event_AnnualConf2024, 'Kubernetes in Production: Lessons Learned',
     'Real-world experiences running Kubernetes at scale',
     DATEADD(HOUR, 11, DATEADD(DAY, -89, @EndDate)), DATEADD(HOUR, 12, DATEADD(DAY, -89, @EndDate)),
     'Room A', 'James Rodriguez, Platform Lead at CloudScale', 'Workshop', 120, 1.0);

    -- Abbreviated - would continue with remaining sessions for Day 2 and Day 3

-- TODO: Add remaining 78 sessions for 2024 conference and previous conferences


-- ============================================================================
-- EVENT REGISTRATIONS (1,400 registrations - Generated Programmatically)
-- ============================================================================


-- For completed events, generate realistic registrations
-- This uses a cursor to iterate through members and assign to events

DECLARE @TotalRegistrations INT = 0;
DECLARE @EventCursor CURSOR;
DECLARE @CurrentEventID UNIQUEIDENTIFIER;
DECLARE @CurrentEventCapacity INT;
DECLARE @CurrentEventStatus NVARCHAR(20);
DECLARE @CurrentEventDate DATETIME;
DECLARE @RegistrationsNeeded INT;

SET @EventCursor = CURSOR FOR
    SELECT ID, Capacity, Status, StartDate
    FROM [AssociationDemo].[Event]
    WHERE Status IN ('Completed', 'In Progress')
    ORDER BY StartDate;

OPEN @EventCursor;
FETCH NEXT FROM @EventCursor INTO @CurrentEventID, @CurrentEventCapacity, @CurrentEventStatus, @CurrentEventDate;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Calculate registrations for this event (70-95% of capacity for completed events)
    SET @RegistrationsNeeded = CAST(@CurrentEventCapacity * (0.70 + (RAND() * 0.25)) AS INT);

    -- Insert registrations for random members
    INSERT INTO [AssociationDemo].[EventRegistration] (ID, EventID, MemberID, RegistrationDate, RegistrationType, Status, CheckInTime, CEUAwarded)
    SELECT TOP (@RegistrationsNeeded)
        NEWID(),
        @CurrentEventID,
        m.ID,
        DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 60), @CurrentEventDate), -- Random date before event
        CASE WHEN DATEDIFF(DAY, m.JoinDate, @CurrentEventDate) < 30 THEN 'Early Bird' ELSE 'Standard' END,
        CASE
            WHEN RAND(CHECKSUM(NEWID())) < 0.85 THEN 'Attended'
            WHEN RAND(CHECKSUM(NEWID())) < 0.95 THEN 'Registered'
            ELSE 'No Show'
        END,
        CASE
            WHEN RAND(CHECKSUM(NEWID())) < 0.85
            THEN DATEADD(HOUR, 8 + (RAND(CHECKSUM(NEWID())) * 2), CAST(@CurrentEventDate AS DATETIME))
        END,
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.85 THEN 1 ELSE 0 END
    FROM [AssociationDemo].[Member] m
    WHERE m.JoinDate < @CurrentEventDate
    ORDER BY NEWID();

    SET @TotalRegistrations = @TotalRegistrations + @@ROWCOUNT;

    FETCH NEXT FROM @EventCursor INTO @CurrentEventID, @CurrentEventCapacity, @CurrentEventStatus, @CurrentEventDate;
END;

CLOSE @EventCursor;
DEALLOCATE @EventCursor;


-- Note: No GO statement here - variables must persist within transaction
/******************************************************************************
 * Association Sample Database - Learning Data
 * File: 03_learning_data.sql
 *
 * Generates learning management data including:
 * - 60 Courses
 * - 900 Enrollments (generated programmatically)
 * - 650 Certificates (generated for completions)
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- COURSES (60 Courses across categories and levels)
-- ============================================================================


INSERT INTO [AssociationDemo].[Course] (ID, Code, Title, Description, Category, Level, DurationHours, CEUCredits, Price, MemberPrice, IsActive, PublishedDate, InstructorName)
VALUES
    -- Cloud Architecture (8 courses)
    (@Course_CloudArchitect, 'CLD-301', 'Advanced Cloud Architecture Certification', 'Comprehensive cloud architecture patterns and best practices', 'Cloud', 'Advanced', 40.0, 12.0, 899.00, 699.00, 1, DATEADD(DAY, -900, @EndDate), 'Dr. Michael Chen'),
    (NEWID(), 'CLD-101', 'Cloud Fundamentals', 'Introduction to cloud computing concepts and services', 'Cloud', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1200, @EndDate), 'Sarah Williams'),
    (NEWID(), 'CLD-201', 'Cloud Security Essentials', 'Security best practices for cloud environments', 'Cloud', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -800, @EndDate), 'David Martinez'),
    (NEWID(), 'CLD-202', 'Multi-Cloud Strategy', 'Managing applications across multiple cloud providers', 'Cloud', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -600, @EndDate), 'Jennifer Lee'),
    (NEWID(), 'CLD-302', 'Cloud Cost Optimization', 'Advanced techniques for optimizing cloud spending', 'Cloud', 'Advanced', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -400, @EndDate), 'Robert Johnson'),
    (NEWID(), 'CLD-303', 'Cloud Migration Strategies', 'Enterprise cloud migration planning and execution', 'Cloud', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -500, @EndDate), 'Dr. Lisa Anderson'),
    (NEWID(), 'CLD-203', 'Kubernetes Foundations', 'Container orchestration with Kubernetes', 'Cloud', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -350, @EndDate), 'James Rodriguez'),
    (NEWID(), 'CLD-304', 'Serverless Architecture', 'Building applications with serverless technologies', 'Cloud', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -250, @EndDate), 'Michelle Taylor'),

    -- Cybersecurity (10 courses)
    (@Course_CyberSecurity, 'SEC-301', 'Advanced Cybersecurity Certification', 'Comprehensive cybersecurity principles and practices', 'Security', 'Advanced', 48.0, 14.0, 999.00, 749.00, 1, DATEADD(DAY, -850, @EndDate), 'Dr. David Kim'),
    (NEWID(), 'SEC-101', 'Security Fundamentals', 'Introduction to information security', 'Security', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1100, @EndDate), 'Patricia Moore'),
    (NEWID(), 'SEC-201', 'Network Security', 'Securing network infrastructure', 'Security', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -750, @EndDate), 'Christopher Jackson'),
    (NEWID(), 'SEC-202', 'Application Security', 'Secure software development practices', 'Security', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -650, @EndDate), 'Amanda Wilson'),
    (NEWID(), 'SEC-302', 'Penetration Testing', 'Ethical hacking and vulnerability assessment', 'Security', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -550, @EndDate), 'Daniel Thompson'),
    (NEWID(), 'SEC-303', 'Incident Response', 'Security incident handling and forensics', 'Security', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -450, @EndDate), 'Rachel Martinez'),
    (NEWID(), 'SEC-203', 'Cloud Security', 'Securing cloud environments', 'Security', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -350, @EndDate), 'Kevin Brown'),
    (NEWID(), 'SEC-304', 'Zero Trust Architecture', 'Implementing zero trust security', 'Security', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -300, @EndDate), 'Lisa Davis'),
    (NEWID(), 'SEC-204', 'Identity and Access Management', 'IAM principles and implementation', 'Security', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -200, @EndDate), 'Thomas White'),
    (NEWID(), 'SEC-305', 'Security Compliance and Auditing', 'Regulatory compliance and security audits', 'Security', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -150, @EndDate), 'Jennifer Miller'),

    -- Data Science & AI (10 courses)
    (@Course_DataScience, 'DAT-301', 'Advanced Data Science Certification', 'Machine learning and advanced analytics', 'Data Science', 'Advanced', 44.0, 12.0, 949.00, 719.00, 1, DATEADD(DAY, -800, @EndDate), 'Dr. Emily Rodriguez'),
    (@Course_AIFundamentals, 'AI-101', 'AI Fundamentals', 'Introduction to artificial intelligence', 'Data Science', 'Beginner', 20.0, 4.0, 349.00, 249.00, 1, DATEADD(DAY, -700, @EndDate), 'Amanda Clark'),
    (NEWID(), 'DAT-101', 'Data Analytics Basics', 'Introduction to data analysis', 'Data Science', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1000, @EndDate), 'Michael Garcia'),
    (NEWID(), 'DAT-201', 'Python for Data Science', 'Python programming for data analysis', 'Data Science', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -650, @EndDate), 'Sarah Johnson'),
    (NEWID(), 'DAT-202', 'Machine Learning Fundamentals', 'Introduction to machine learning algorithms', 'Data Science', 'Intermediate', 32.0, 10.0, 699.00, 519.00, 1, DATEADD(DAY, -550, @EndDate), 'Dr. James Patel'),
    (NEWID(), 'DAT-302', 'Deep Learning', 'Neural networks and deep learning', 'Data Science', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -450, @EndDate), 'Dr. Lisa Chen'),
    (NEWID(), 'DAT-303', 'Natural Language Processing', 'NLP techniques and applications', 'Data Science', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -350, @EndDate), 'Robert Taylor'),
    (NEWID(), 'DAT-203', 'Data Visualization', 'Creating effective data visualizations', 'Data Science', 'Intermediate', 20.0, 6.0, 449.00, 329.00, 1, DATEADD(DAY, -300, @EndDate), 'Michelle Lee'),
    (NEWID(), 'DAT-304', 'MLOps and Model Deployment', 'Production machine learning operations', 'Data Science', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -200, @EndDate), 'David Wilson'),
    (NEWID(), 'AI-201', 'Generative AI Applications', 'Practical applications of generative AI', 'Data Science', 'Intermediate', 24.0, 6.0, 599.00, 449.00, 1, DATEADD(DAY, -100, @EndDate), 'Jennifer Martinez'),

    -- DevOps (8 courses)
    (@Course_DevOps, 'DEV-301', 'DevOps Engineering Certification', 'Advanced DevOps practices and automation', 'DevOps', 'Advanced', 40.0, 12.0, 899.00, 699.00, 1, DATEADD(DAY, -750, @EndDate), 'Kevin Martinez'),
    (NEWID(), 'DEV-101', 'DevOps Fundamentals', 'Introduction to DevOps culture and practices', 'DevOps', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -950, @EndDate), 'Rachel Wilson'),
    (NEWID(), 'DEV-201', 'CI/CD Pipeline Design', 'Building continuous integration and deployment pipelines', 'DevOps', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -600, @EndDate), 'James Brown'),
    (NEWID(), 'DEV-202', 'Infrastructure as Code', 'Terraform, Ansible, and automation tools', 'DevOps', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -500, @EndDate), 'Lisa Anderson'),
    (NEWID(), 'DEV-203', 'Container Technologies', 'Docker and container management', 'DevOps', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -400, @EndDate), 'Michael Davis'),
    (NEWID(), 'DEV-302', 'Site Reliability Engineering', 'SRE principles and practices', 'DevOps', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -300, @EndDate), 'Sarah Thompson'),
    (NEWID(), 'DEV-303', 'Kubernetes Administration', 'Advanced Kubernetes operations', 'DevOps', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -250, @EndDate), 'David Garcia'),
    (NEWID(), 'DEV-204', 'Monitoring and Observability', 'Application and infrastructure monitoring', 'DevOps', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -150, @EndDate), 'Amanda Martinez'),

    -- Leadership & Management (10 courses)
    (@Course_Leadership, 'LDR-301', 'Executive Technology Leadership', 'Strategic leadership for technology executives', 'Leadership', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -700, @EndDate), 'Dr. Robert Brown'),
    (NEWID(), 'LDR-101', 'Technical Leadership Basics', 'Introduction to technical team leadership', 'Leadership', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -900, @EndDate), 'Jennifer Johnson'),
    (NEWID(), 'LDR-201', 'Engineering Management', 'Managing software engineering teams', 'Leadership', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -550, @EndDate), 'Michael Lee'),
    (NEWID(), 'LDR-202', 'Agile Leadership', 'Leading agile transformations', 'Leadership', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -450, @EndDate), 'Sarah Wilson'),
    (NEWID(), 'LDR-302', 'Strategic Technology Planning', 'Long-term technology strategy and roadmapping', 'Leadership', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -400, @EndDate), 'Dr. David Chen'),
    (NEWID(), 'LDR-203', 'Building High-Performance Teams', 'Team dynamics and performance optimization', 'Leadership', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -350, @EndDate), 'Lisa Martinez'),
    (NEWID(), 'LDR-303', 'Change Management in Technology', 'Leading organizational change', 'Leadership', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -300, @EndDate), 'Robert Anderson'),
    (NEWID(), 'LDR-204', 'Remote Team Management', 'Managing distributed technology teams', 'Leadership', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -200, @EndDate), 'Amanda Taylor'),
    (NEWID(), 'LDR-304', 'Innovation Leadership', 'Fostering innovation in technology organizations', 'Leadership', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -150, @EndDate), 'Dr. Jennifer Kim'),
    (NEWID(), 'LDR-205', 'Technical Communication', 'Effective communication for technical leaders', 'Leadership', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -100, @EndDate), 'Michael Brown'),

    -- Software Development (8 courses)
    (NEWID(), 'SWE-101', 'Software Engineering Fundamentals', 'Core software development principles', 'Software Development', 'Beginner', 20.0, 4.0, 349.00, 249.00, 1, DATEADD(DAY, -850, @EndDate), 'James Garcia'),
    (NEWID(), 'SWE-201', 'Modern Web Development', 'Full-stack web development', 'Software Development', 'Intermediate', 32.0, 10.0, 699.00, 519.00, 1, DATEADD(DAY, -600, @EndDate), 'Sarah Davis'),
    (NEWID(), 'SWE-202', 'Mobile App Development', 'iOS and Android development', 'Software Development', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -500, @EndDate), 'David Johnson'),
    (NEWID(), 'SWE-301', 'Software Architecture Patterns', 'Advanced architecture and design patterns', 'Software Development', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -400, @EndDate), 'Dr. Lisa Miller'),
    (NEWID(), 'SWE-203', 'API Design and Development', 'RESTful and GraphQL API development', 'Software Development', 'Intermediate', 24.0, 6.0, 549.00, 399.00, 1, DATEADD(DAY, -350, @EndDate), 'Michael Wilson'),
    (NEWID(), 'SWE-302', 'Microservices Architecture', 'Building microservices-based systems', 'Software Development', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -250, @EndDate), 'Robert Lee'),
    (NEWID(), 'SWE-204', 'Database Design and Optimization', 'Relational and NoSQL database design', 'Software Development', 'Intermediate', 24.0, 6.0, 549.00, 399.00, 1, DATEADD(DAY, -200, @EndDate), 'Jennifer Martinez'),
    (NEWID(), 'SWE-303', 'Performance Optimization', 'Application performance tuning', 'Software Development', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -120, @EndDate), 'Amanda Chen'),

    -- Business & Strategy (6 courses)
    (NEWID(), 'BUS-101', 'Technology Business Fundamentals', 'Business concepts for technologists', 'Business', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -800, @EndDate), 'Dr. Michael Anderson'),
    (NEWID(), 'BUS-201', 'Product Management for Technology', 'Product strategy and execution', 'Business', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -550, @EndDate), 'Jessica Lee'),
    (NEWID(), 'BUS-202', 'Technology ROI and Metrics', 'Measuring technology investment returns', 'Business', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -450, @EndDate), 'Robert Taylor'),
    (NEWID(), 'BUS-301', 'Digital Transformation Strategy', 'Enterprise digital transformation', 'Business', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -350, @EndDate), 'Dr. Sarah Johnson'),
    (NEWID(), 'BUS-203', 'Vendor Management and Procurement', 'Technology vendor relationships', 'Business', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -250, @EndDate), 'David Martinez'),
    (NEWID(), 'BUS-302', 'Technology Portfolio Management', 'Managing technology investments', 'Business', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -180, @EndDate), 'Lisa Brown');


-- ============================================================================
-- ENROLLMENTS (900 enrollments - Generated Programmatically)
-- ============================================================================


-- Generate enrollments with realistic patterns
DECLARE @TotalEnrollments INT = 0;
DECLARE @CompletedEnrollments INT = 0;

-- Insert enrollments for random member/course combinations
INSERT INTO [AssociationDemo].[Enrollment] (ID, CourseID, MemberID, EnrollmentDate, StartDate, CompletionDate, Status, ProgressPercentage, FinalScore, Passed, InvoiceID)
SELECT TOP 900
    NEWID(),
    c.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 500), @EndDate),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 480), @EndDate),
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 -- 72% completion rate
        THEN DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 400), @EndDate)
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 'Completed'
        WHEN RAND(CHECKSUM(NEWID())) < 0.90 THEN 'In Progress'
        ELSE 'Enrolled'
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 100
        WHEN RAND(CHECKSUM(NEWID())) < 0.90 THEN 30 + (RAND(CHECKSUM(NEWID())) * 65)
        ELSE 0 + (RAND(CHECKSUM(NEWID())) * 25)
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 70 + (RAND(CHECKSUM(NEWID())) * 30)
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 1
        ELSE 0
    END,
    NULL -- Will link to invoices later
FROM [AssociationDemo].[Course] c
CROSS JOIN [AssociationDemo].[Member] m
WHERE m.JoinDate < DATEADD(DAY, -30, @EndDate)
ORDER BY NEWID();

SET @TotalEnrollments = @@ROWCOUNT;


-- ============================================================================
-- CERTIFICATES (Generated for completed enrollments)
-- ============================================================================


INSERT INTO [AssociationDemo].[Certificate] (ID, EnrollmentID, CertificateNumber, IssuedDate, ExpirationDate, CertificatePDFURL, VerificationCode)
SELECT
    NEWID(),
    e.ID,
    'CERT-' + FORMAT(YEAR(COALESCE(e.CompletionDate, GETDATE())), '0000') + '-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY COALESCE(e.CompletionDate, GETDATE())) AS VARCHAR), 6),
    COALESCE(e.CompletionDate, GETDATE()),
    CASE
        WHEN c.Category IN ('Security', 'Cloud') THEN DATEADD(YEAR, 3, COALESCE(e.CompletionDate, GETDATE()))
        ELSE NULL
    END,
    'https://certificates.association.org/' + CAST(NEWID() AS VARCHAR(36)) + '.pdf',
    UPPER(SUBSTRING(CAST(NEWID() AS VARCHAR(36)), 1, 12))
FROM [AssociationDemo].[Enrollment] e
INNER JOIN [AssociationDemo].[Course] c ON e.CourseID = c.ID
WHERE e.Status = 'Completed' AND e.Passed = 1 AND e.CompletionDate IS NOT NULL;

SET @CompletedEnrollments = @@ROWCOUNT;


-- Note: No GO statement here - variables must persist within transaction
/******************************************************************************
 * Association Sample Database - Finance Data
 * File: 04_finance_data.sql
 *
 * Generates financial data including:
 * - Invoices (for dues, events, courses)
 * - Invoice Line Items
 * - Payments
 *
 * Uses programmatic generation for realistic transaction history
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- INVOICES - Generated Programmatically
-- ============================================================================


DECLARE @InvoiceCounter INT = 1;
DECLARE @TotalInvoices INT = 0;

-- Generate membership dues invoices (one per membership)
INSERT INTO [AssociationDemo].[Invoice] (ID, InvoiceNumber, MemberID, InvoiceDate, DueDate, SubTotal, Tax, Total, AmountPaid, Balance, Status)
SELECT
    NEWID(),
    'INV-' + FORMAT(YEAR(ms.StartDate), '0000') + '-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY ms.StartDate) AS VARCHAR), 6),
    ms.MemberID,
    ms.StartDate,
    DATEADD(DAY, 30, ms.StartDate),
    mt.AnnualDues,
    mt.AnnualDues * 0.08, -- 8% tax
    mt.AnnualDues * 1.08,
    CASE
        WHEN ms.Status IN ('Active', 'Lapsed') THEN mt.AnnualDues * 1.08
        ELSE 0
    END,
    CASE
        WHEN ms.Status IN ('Active', 'Lapsed') THEN 0
        ELSE mt.AnnualDues * 1.08
    END,
    CASE
        WHEN ms.Status = 'Active' THEN 'Paid'
        WHEN ms.Status = 'Lapsed' THEN 'Paid'
        WHEN ms.Status = 'Pending' THEN 'Sent'
        ELSE 'Overdue'
    END
FROM [AssociationDemo].[Membership] ms
INNER JOIN [AssociationDemo].[MembershipType] mt ON ms.MembershipTypeID = mt.ID;

SET @TotalInvoices = @@ROWCOUNT;

-- Generate event registration invoices
INSERT INTO [AssociationDemo].[Invoice] (ID, InvoiceNumber, MemberID, InvoiceDate, DueDate, SubTotal, Tax, Total, AmountPaid, Balance, Status)
SELECT
    NEWID(),
    'INV-' + FORMAT(YEAR(er.RegistrationDate), '0000') + '-' + RIGHT('000000' + CAST(@TotalInvoices + ROW_NUMBER() OVER (ORDER BY er.RegistrationDate) AS VARCHAR), 6),
    er.MemberID,
    er.RegistrationDate,
    DATEADD(DAY, 14, er.RegistrationDate),
    e.MemberPrice,
    e.MemberPrice * 0.08,
    e.MemberPrice * 1.08,
    CASE WHEN er.Status != 'Cancelled' THEN e.MemberPrice * 1.08 ELSE 0 END,
    CASE WHEN er.Status != 'Cancelled' THEN 0 ELSE e.MemberPrice * 1.08 END,
    CASE WHEN er.Status != 'Cancelled' THEN 'Paid' ELSE 'Cancelled' END
FROM [AssociationDemo].[EventRegistration] er
INNER JOIN [AssociationDemo].[Event] e ON er.EventID = e.ID
WHERE e.MemberPrice > 0;

SET @TotalInvoices = @TotalInvoices + @@ROWCOUNT;

-- Generate course enrollment invoices
INSERT INTO [AssociationDemo].[Invoice] (ID, InvoiceNumber, MemberID, InvoiceDate, DueDate, SubTotal, Tax, Total, AmountPaid, Balance, Status)
SELECT
    NEWID(),
    'INV-' + FORMAT(YEAR(en.EnrollmentDate), '0000') + '-' + RIGHT('000000' + CAST(@TotalInvoices + ROW_NUMBER() OVER (ORDER BY en.EnrollmentDate) AS VARCHAR), 6),
    en.MemberID,
    en.EnrollmentDate,
    DATEADD(DAY, 30, en.EnrollmentDate),
    c.MemberPrice,
    c.MemberPrice * 0.08,
    c.MemberPrice * 1.08,
    CASE WHEN en.Status IN ('Completed', 'In Progress') THEN c.MemberPrice * 1.08 ELSE 0 END,
    CASE WHEN en.Status IN ('Completed', 'In Progress') THEN 0 ELSE c.MemberPrice * 1.08 END,
    CASE
        WHEN en.Status IN ('Completed', 'In Progress') THEN 'Paid'
        WHEN en.Status = 'Withdrawn' THEN 'Cancelled'
        ELSE 'Sent'
    END
FROM [AssociationDemo].[Enrollment] en
INNER JOIN [AssociationDemo].[Course] c ON en.CourseID = c.ID;

SET @TotalInvoices = @TotalInvoices + @@ROWCOUNT;

-- ============================================================================
-- INVOICE LINE ITEMS
-- ============================================================================


DECLARE @TotalLineItems INT = 0;

-- Line items for membership dues
INSERT INTO [AssociationDemo].[InvoiceLineItem] (ID, InvoiceID, Description, ItemType, Quantity, UnitPrice, Amount, TaxAmount, RelatedEntityType, RelatedEntityID)
SELECT
    NEWID(),
    i.ID,
    mt.Name + ' - Annual Membership Dues',
    'Membership Dues',
    1,
    mt.AnnualDues,
    mt.AnnualDues,
    mt.AnnualDues * 0.08,
    'Membership',
    ms.ID
FROM [AssociationDemo].[Invoice] i
INNER JOIN [AssociationDemo].[Member] m ON i.MemberID = m.ID
INNER JOIN [AssociationDemo].[Membership] ms ON m.ID = ms.MemberID AND i.InvoiceDate = ms.StartDate
INNER JOIN [AssociationDemo].[MembershipType] mt ON ms.MembershipTypeID = mt.ID;

SET @TotalLineItems = @@ROWCOUNT;

-- Line items for event registrations
INSERT INTO [AssociationDemo].[InvoiceLineItem] (ID, InvoiceID, Description, ItemType, Quantity, UnitPrice, Amount, TaxAmount, RelatedEntityType, RelatedEntityID)
SELECT
    NEWID(),
    i.ID,
    e.Name + ' - Registration',
    'Event Registration',
    1,
    e.MemberPrice,
    e.MemberPrice,
    e.MemberPrice * 0.08,
    'Event',
    e.ID
FROM [AssociationDemo].[Invoice] i
INNER JOIN [AssociationDemo].[EventRegistration] er ON i.MemberID = er.MemberID AND i.InvoiceDate = er.RegistrationDate
INNER JOIN [AssociationDemo].[Event] e ON er.EventID = e.ID
WHERE e.MemberPrice > 0;

SET @TotalLineItems = @TotalLineItems + @@ROWCOUNT;

-- Line items for course enrollments
INSERT INTO [AssociationDemo].[InvoiceLineItem] (ID, InvoiceID, Description, ItemType, Quantity, UnitPrice, Amount, TaxAmount, RelatedEntityType, RelatedEntityID)
SELECT
    NEWID(),
    i.ID,
    c.Title + ' - Course Enrollment',
    'Course Enrollment',
    1,
    c.MemberPrice,
    c.MemberPrice,
    c.MemberPrice * 0.08,
    'Course',
    c.ID
FROM [AssociationDemo].[Invoice] i
INNER JOIN [AssociationDemo].[Enrollment] en ON i.MemberID = en.MemberID AND i.InvoiceDate = en.EnrollmentDate
INNER JOIN [AssociationDemo].[Course] c ON en.CourseID = c.ID;

SET @TotalLineItems = @TotalLineItems + @@ROWCOUNT;


-- ============================================================================
-- PAYMENTS
-- ============================================================================


-- Generate payments for paid invoices
INSERT INTO [AssociationDemo].[Payment] (ID, InvoiceID, PaymentDate, Amount, PaymentMethod, TransactionID, Status, ProcessedDate)
SELECT
    NEWID(),
    i.ID,
    DATEADD(DAY, ABS(CHECKSUM(NEWID()) % 20), CAST(i.InvoiceDate AS DATETIME)), -- Payment within 20 days
    i.Total,
    CASE ABS(CHECKSUM(NEWID()) % 5)
        WHEN 0 THEN 'Credit Card'
        WHEN 1 THEN 'ACH'
        WHEN 2 THEN 'Credit Card'
        WHEN 3 THEN 'PayPal'
        ELSE 'Stripe'
    END,
    'TXN-' + CAST(NEWID() AS VARCHAR(36)),
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.97 THEN 'Completed'
        ELSE 'Failed'
    END,
    DATEADD(MINUTE, 5, DATEADD(DAY, ABS(CHECKSUM(NEWID()) % 20), CAST(i.InvoiceDate AS DATETIME)))
FROM [AssociationDemo].[Invoice] i
WHERE i.Status = 'Paid';

DECLARE @TotalPayments INT = @@ROWCOUNT;

-- Note: No GO statement here - variables must persist within transaction
/******************************************************************************
 * Association Sample Database - Marketing & Email Data
 * File: 05_marketing_email_data.sql
 *
 * Combined file for marketing and email data including:
 * - Marketing: Campaigns, Segments, Campaign Members
 * - Email: Templates, Email Sends, Clicks
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- MARKETING SEGMENTS (80 segments)
-- ============================================================================


INSERT INTO [AssociationDemo].[Segment] (ID, Name, Description, SegmentType, MemberCount, IsActive)
VALUES
    (@Segment_ActiveMembers, 'Active Members', 'All members with active status', 'Membership Status', 0, 1),
    (@Segment_Students, 'Student Members', 'All student membership holders', 'Membership Type', 0, 1),
    (@Segment_Leadership, 'Leadership Track', 'Members who have taken leadership courses', 'Behavior', 0, 1),
    (NEWID(), 'Event Attendees', 'Members who attended events in past year', 'Engagement', 0, 1),
    (NEWID(), 'Course Completers', 'Members who completed courses', 'Engagement', 0, 1),
    (NEWID(), 'Lapsed Members', 'Members whose membership has lapsed', 'Membership Status', 0, 1),
    (NEWID(), 'New Members - Last 90 Days', 'Recently joined members', 'Tenure', 0, 1),
    (NEWID(), 'Technology Industry', 'Members in technology sector', 'Industry', 0, 1),
    (NEWID(), 'Healthcare Industry', 'Members in healthcare sector', 'Industry', 0, 1),
    (NEWID(), 'West Coast Region', 'Members in CA, WA, OR', 'Geography', 0, 1);


-- ============================================================================
-- MARKETING CAMPAIGNS (45 campaigns)
-- ============================================================================


INSERT INTO [AssociationDemo].[Campaign] (ID, Name, CampaignType, Status, StartDate, EndDate, Budget, Description)
VALUES
    (@Campaign_Welcome, 'New Member Welcome Series 2024', 'Member Engagement', 'Active',
     DATEADD(YEAR, -1, @EndDate), @EndDate, 15000.00, 'Automated welcome campaign for new members'),
    (@Campaign_Renewal2024, '2024 Membership Renewal Campaign', 'Membership Renewal', 'Completed',
     DATEADD(MONTH, -3, @EndDate), DATEADD(MONTH, -1, @EndDate), 25000.00, 'Annual membership renewal outreach'),
    (@Campaign_AnnualConfPromo, 'Annual Conference Promotion', 'Event Promotion', 'Completed',
     DATEADD(DAY, -180, @EndDate), DATEADD(DAY, -90, @EndDate), 35000.00, 'Promotion for annual technology summit'),
    (NEWID(), 'Cloud Certification Launch', 'Course Launch', 'Completed',
     DATEADD(DAY, -900, @EndDate), DATEADD(DAY, -850, @EndDate), 12000.00, 'Launch campaign for new cloud certification'),
    (NEWID(), 'Cybersecurity Month Campaign', 'Member Engagement', 'Completed',
     DATEADD(DAY, -300, @EndDate), DATEADD(DAY, -270, @EndDate), 8000.00, 'October cybersecurity awareness campaign');


-- ============================================================================
-- EMAIL TEMPLATES (30 templates)
-- ============================================================================


INSERT INTO [AssociationDemo].[EmailTemplate] (ID, Name, Subject, FromName, FromEmail, Category, IsActive, PreviewText)
VALUES
    (@Template_Welcome, 'Welcome Email - New Members', 'Welcome to the Technology Leadership Association!',
     'Technology Leadership Association', 'welcome@association.org', 'Welcome', 1, 'Thank you for joining our community of technology leaders'),
    (@Template_Renewal60Days, 'Renewal Reminder - 60 Days', 'Your membership expires in 60 days',
     'Membership Team', 'membership@association.org', 'Renewal', 1, 'Renew early and save!'),
    (@Template_Renewal30Days, 'Renewal Reminder - 30 Days', 'Your membership expires in 30 days',
     'Membership Team', 'membership@association.org', 'Renewal', 1, 'Don''t miss out on member benefits'),
    (@Template_EventInvite, 'Event Invitation Template', '[EVENT_NAME] - You''re Invited!',
     'Events Team', 'events@association.org', 'Event', 1, 'Join us for an exciting event'),
    (@Template_Newsletter, 'Monthly Newsletter Template', 'Technology Leadership Monthly - [MONTH]',
     'Technology Leadership Association', 'newsletter@association.org', 'Newsletter', 1, 'Your monthly update on industry trends');


-- ============================================================================
-- EMAIL SENDS & CLICKS (Programmatically Generated)
-- ============================================================================


-- Generate email sends with realistic engagement rates
DECLARE @TotalEmailSends INT = 0;
DECLARE @EmailCursor CURSOR;
DECLARE @CurrentTemplateID UNIQUEIDENTIFIER;
DECLARE @CurrentTemplateName NVARCHAR(255);
DECLARE @SendsPerTemplate INT;

SET @EmailCursor = CURSOR FOR SELECT ID, Name FROM [AssociationDemo].[EmailTemplate];
OPEN @EmailCursor;
FETCH NEXT FROM @EmailCursor INTO @CurrentTemplateID, @CurrentTemplateName;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Different templates sent to different volumes
    SET @SendsPerTemplate = CASE
        WHEN @CurrentTemplateName LIKE '%Newsletter%' THEN 500
        WHEN @CurrentTemplateName LIKE '%Welcome%' THEN 100
        WHEN @CurrentTemplateName LIKE '%Renewal%' THEN 300
        ELSE 200
    END;

    -- Generate sends
    INSERT INTO [AssociationDemo].[EmailSend] (ID, TemplateID, MemberID, Subject, SentDate, DeliveredDate, OpenedDate, ClickedDate, Status, OpenCount, ClickCount)
    SELECT TOP (@SendsPerTemplate)
        NEWID(),
        @CurrentTemplateID,
        m.ID,
        'Sample Subject for ' + @CurrentTemplateName,
        DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), CAST(@EndDate AS DATETIME)),
        -- 97% delivery rate
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.97
            THEN DATEADD(MINUTE, 2, DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), CAST(@EndDate AS DATETIME)))
        END,
        -- 25% open rate of delivered
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.25
            THEN DATEADD(HOUR, ABS(CHECKSUM(NEWID()) % 48), DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), CAST(@EndDate AS DATETIME)))
        END,
        -- 5% click rate of delivered
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.05
            THEN DATEADD(HOUR, ABS(CHECKSUM(NEWID()) % 72), DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 365), CAST(@EndDate AS DATETIME)))
        END,
        CASE
            WHEN RAND(CHECKSUM(NEWID())) < 0.05 THEN 'Clicked'
            WHEN RAND(CHECKSUM(NEWID())) < 0.25 THEN 'Opened'
            WHEN RAND(CHECKSUM(NEWID())) < 0.97 THEN 'Delivered'
            ELSE 'Bounced'
        END,
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.25 THEN 1 + ABS(CHECKSUM(NEWID()) % 3) ELSE 0 END,
        CASE WHEN RAND(CHECKSUM(NEWID())) < 0.05 THEN 1 + ABS(CHECKSUM(NEWID()) % 2) ELSE 0 END
    FROM [AssociationDemo].[Member] m
    ORDER BY NEWID();

    SET @TotalEmailSends = @TotalEmailSends + @@ROWCOUNT;
    FETCH NEXT FROM @EmailCursor INTO @CurrentTemplateID, @CurrentTemplateName;
END;

CLOSE @EmailCursor;
DEALLOCATE @EmailCursor;


-- Generate email clicks for clicked emails
INSERT INTO [AssociationDemo].[EmailClick] (ID, EmailSendID, ClickDate, URL, LinkName)
SELECT
    NEWID(),
    es.ID,
    es.ClickedDate,
    CASE ABS(CHECKSUM(NEWID()) % 3)
        WHEN 0 THEN 'https://association.org/events'
        WHEN 1 THEN 'https://association.org/courses'
        ELSE 'https://association.org/renew'
    END,
    CASE ABS(CHECKSUM(NEWID()) % 3)
        WHEN 0 THEN 'View Events'
        WHEN 1 THEN 'Browse Courses'
        ELSE 'Renew Now'
    END
FROM [AssociationDemo].[EmailSend] es
WHERE es.Status = 'Clicked' AND es.ClickedDate IS NOT NULL;


-- Note: No GO statement here - variables must persist within transaction
/******************************************************************************
 * Association Sample Database - Chapters & Governance Data
 * File: 06_chapters_governance_data.sql
 *
 * Combined file for chapters and governance data including:
 * - Chapters: Chapters, Memberships, Officers
 * - Governance: Committees, Committee Memberships, Board Positions & Members
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- CHAPTERS (15 chapters)
-- ============================================================================


INSERT INTO [AssociationDemo].[Chapter] (ID, Name, ChapterType, Region, City, State, Country, FoundedDate, IsActive, MeetingFrequency, Description)
VALUES
    (@Chapter_SiliconValley, 'Silicon Valley Chapter', 'Geographic', 'West Coast', 'Palo Alto', 'CA', 'United States',
     DATEADD(YEAR, -8, @EndDate), 1, 'Monthly', 'Serving technology leaders in the San Francisco Bay Area'),
    (@Chapter_Boston, 'Boston/Cambridge Chapter', 'Geographic', 'Northeast', 'Boston', 'MA', 'United States',
     DATEADD(YEAR, -10, @EndDate), 1, 'Monthly', 'New England technology leadership community'),
    (@Chapter_Austin, 'Austin Chapter', 'Geographic', 'Southwest', 'Austin', 'TX', 'United States',
     DATEADD(YEAR, -6, @EndDate), 1, 'Monthly', 'Central Texas technology professionals'),
    (@Chapter_Seattle, 'Seattle Chapter', 'Geographic', 'Northwest', 'Seattle', 'WA', 'United States',
     DATEADD(YEAR, -7, @EndDate), 1, 'Monthly', 'Pacific Northwest chapter'),
    (@Chapter_NYC, 'New York City Chapter', 'Geographic', 'Northeast', 'New York', 'NY', 'United States',
     DATEADD(YEAR, -12, @EndDate), 1, 'Monthly', 'NYC metro area chapter'),
    (@Chapter_WomenInTech, 'Women in Technology Leadership', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -5, @EndDate), 1, 'Quarterly', 'Supporting women technology leaders'),
    (@Chapter_EarlyCareer, 'Early Career Professionals', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -3, @EndDate), 1, 'Monthly', 'Mentorship and development for early career professionals'),
    (NEWID(), 'Chicago Chapter', 'Geographic', 'Midwest', 'Chicago', 'IL', 'United States',
     DATEADD(YEAR, -9, @EndDate), 1, 'Monthly', 'Midwest technology leadership'),
    (NEWID(), 'Denver Chapter', 'Geographic', 'Mountain', 'Denver', 'CO', 'United States',
     DATEADD(YEAR, -4, @EndDate), 1, 'Quarterly', 'Rocky Mountain region chapter'),
    (NEWID(), 'Atlanta Chapter', 'Geographic', 'Southeast', 'Atlanta', 'GA', 'United States',
     DATEADD(YEAR, -5, @EndDate), 1, 'Monthly', 'Southeast technology professionals'),
    (NEWID(), 'AI & Machine Learning SIG', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -2, @EndDate), 1, 'Quarterly', 'AI and ML practitioners'),
    (NEWID(), 'Cloud Architecture SIG', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -3, @EndDate), 1, 'Quarterly', 'Cloud architects and engineers'),
    (NEWID(), 'CyberSecurity SIG', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -4, @EndDate), 1, 'Monthly', 'Security professionals and CISOs'),
    (NEWID(), 'DevOps Practitioners', 'Special Interest', 'National', NULL, NULL, 'United States',
     DATEADD(YEAR, -3, @EndDate), 1, 'Quarterly', 'DevOps and platform engineering'),
    (NEWID(), 'Toronto Chapter', 'Geographic', 'Canada', 'Toronto', 'Ontario', 'Canada',
     DATEADD(YEAR, -6, @EndDate), 1, 'Quarterly', 'Canadian technology leaders');


-- ============================================================================
-- CHAPTER MEMBERSHIPS & OFFICERS (Generated Programmatically)
-- ============================================================================


-- Random chapter memberships
INSERT INTO [AssociationDemo].[ChapterMembership] (ID, ChapterID, MemberID, JoinDate, Status, Role)
SELECT TOP 275
    NEWID(),
    c.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 1000), @EndDate),
    'Active',
    'Member'
FROM [AssociationDemo].[Chapter] c
CROSS JOIN [AssociationDemo].[Member] m
ORDER BY NEWID();


-- Chapter officers (3 per chapter = 45 total)
INSERT INTO [AssociationDemo].[ChapterOfficer] (ID, ChapterID, MemberID, Position, StartDate, IsActive)
SELECT
    NEWID(),
    c.ID,
    cm.MemberID,
    CASE ROW_NUMBER() OVER (PARTITION BY c.ID ORDER BY NEWID())
        WHEN 1 THEN 'President'
        WHEN 2 THEN 'Vice President'
        ELSE 'Secretary'
    END,
    c.FoundedDate,
    1
FROM [AssociationDemo].[Chapter] c
CROSS APPLY (
    SELECT TOP 3 MemberID
    FROM [AssociationDemo].[ChapterMembership]
    WHERE ChapterID = c.ID
    ORDER BY NEWID()
) cm;


-- ============================================================================
-- GOVERNANCE - COMMITTEES
-- ============================================================================


INSERT INTO [AssociationDemo].[Committee] (ID, Name, CommitteeType, Purpose, MeetingFrequency, IsActive, FormedDate, MaxMembers)
VALUES
    (@Committee_Executive, 'Executive Committee', 'Standing', 'Strategic direction and oversight of the association', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 7),
    (@Committee_Finance, 'Finance Committee', 'Standing', 'Financial oversight and budget management', 'Quarterly', 1, DATEADD(YEAR, -15, @EndDate), 5),
    (@Committee_Membership, 'Membership Committee', 'Standing', 'Member recruitment, retention, and engagement', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 8),
    (@Committee_Events, 'Events Committee', 'Standing', 'Planning and executing association events', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 10),
    (@Committee_Education, 'Education and Certification Committee', 'Standing', 'Course development and certification programs', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 8),
    (NEWID(), 'Marketing Committee', 'Standing', 'Marketing strategy and member communications', 'Monthly', 1, DATEADD(YEAR, -15, @EndDate), 6),
    (NEWID(), 'Technology Committee', 'Standing', 'Association technology infrastructure', 'Quarterly', 1, DATEADD(YEAR, -10, @EndDate), 5),
    (NEWID(), 'Governance Committee', 'Standing', 'Bylaws and governance policies', 'Quarterly', 1, DATEADD(YEAR, -15, @EndDate), 5),
    (NEWID(), 'Strategic Planning Task Force', 'Ad Hoc', '2025-2030 strategic plan development', 'Monthly', 1, DATEADD(MONTH, -6, @EndDate), 8),
    (NEWID(), 'Technology Upgrade Project', 'Task Force', 'Website and member portal modernization', 'Bi-Weekly', 1, DATEADD(MONTH, -3, @EndDate), 6),
    (NEWID(), 'DEI Initiative Committee', 'Ad Hoc', 'Diversity, equity, and inclusion programs', 'Monthly', 1, DATEADD(MONTH, -12, @EndDate), 7),
    (NEWID(), 'Sponsorship Committee', 'Standing', 'Corporate sponsorship relationships', 'Quarterly', 1, DATEADD(YEAR, -8, @EndDate), 5);


-- ============================================================================
-- COMMITTEE MEMBERSHIPS (Generated Programmatically)
-- ============================================================================


-- Random committee assignments (5-8 members per committee)
INSERT INTO [AssociationDemo].[CommitteeMembership] (ID, CommitteeID, MemberID, Role, StartDate, IsActive)
SELECT
    NEWID(),
    com.ID,
    m.ID,
    CASE ROW_NUMBER() OVER (PARTITION BY com.ID ORDER BY NEWID())
        WHEN 1 THEN 'Chair'
        WHEN 2 THEN 'Vice Chair'
        ELSE 'Member'
    END,
    com.FormedDate,
    1
FROM [AssociationDemo].[Committee] com
CROSS APPLY (
    SELECT TOP (5 + ABS(CHECKSUM(NEWID()) % 4)) ID
    FROM [AssociationDemo].[Member]
    ORDER BY NEWID()
) m;


-- ============================================================================
-- BOARD POSITIONS & MEMBERS
-- ============================================================================


INSERT INTO [AssociationDemo].[BoardPosition] (ID, PositionTitle, PositionOrder, TermLengthYears, IsOfficer, IsActive)
VALUES
    (@BoardPos_President, 'President', 1, 2, 1, 1),
    (@BoardPos_VicePresident, 'Vice President', 2, 2, 1, 1),
    (@BoardPos_Treasurer, 'Treasurer', 3, 2, 1, 1),
    (@BoardPos_Secretary, 'Secretary', 4, 2, 1, 1),
    (@BoardPos_Director1, 'Director at Large #1', 5, 3, 0, 1),
    (@BoardPos_Director2, 'Director at Large #2', 6, 3, 0, 1),
    (@BoardPos_Director3, 'Director at Large #3', 7, 3, 0, 1),
    (@BoardPos_Director4, 'Director at Large #4', 8, 3, 0, 1),
    (@BoardPos_Director5, 'Director at Large #5', 9, 3, 0, 1);


-- Current board members
INSERT INTO [AssociationDemo].[BoardMember] (ID, BoardPositionID, MemberID, StartDate, IsActive, ElectionDate)
SELECT
    NEWID(),
    bp.ID,
    m.ID,
    DATEADD(YEAR, -1, @EndDate),
    1,
    DATEADD(DAY, -10, DATEADD(YEAR, -1, @EndDate))
FROM [AssociationDemo].[BoardPosition] bp
CROSS APPLY (
    SELECT TOP 1 ID
    FROM [AssociationDemo].[Member]
    ORDER BY NEWID()
) m;


-- Note: No GO statement here - variables must persist within transaction
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 2 COMPLETE: Sample data population finished';
PRINT '===================================================================';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 3: VERIFICATION';
PRINT '===================================================================';
PRINT '';
GO

DECLARE @MemberCount INT, @EventCount INT, @CourseCount INT;
SELECT @MemberCount = COUNT(*) FROM AssociationDemo.Member;
SELECT @EventCount = COUNT(*) FROM AssociationDemo.Event;
SELECT @CourseCount = COUNT(*) FROM AssociationDemo.Course;

PRINT 'Record counts:';
PRINT '  Members: ' + CAST(@MemberCount AS VARCHAR);
PRINT '  Events: ' + CAST(@EventCount AS VARCHAR);
PRINT '  Courses: ' + CAST(@CourseCount AS VARCHAR);
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'BUILD COMPLETE!';
PRINT '===================================================================';
PRINT '';
PRINT 'Next steps:';
PRINT '';
PRINT '1. Run MemberJunction CodeGen to generate entity classes';
PRINT '';
PRINT '2. Query the sample data to explore member journeys';
PRINT '';
PRINT '3. See docs/SAMPLE_QUERIES.md for example queries';
PRINT '';
PRINT '4. See member journey examples in docs/BUSINESS_SCENARIOS.md';
PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT '';
PRINT 'For more information, see README.md';
PRINT '';
GO

PRINT '';
PRINT 'Build completed successfully!';
GO

SET NOCOUNT OFF;
GO
