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
