# Association Sample Database - Comprehensive Plan

**Created**: 2025-11-04
**Status**: Planning
**Goal**: Build a realistic, comprehensive sample database for associations with membership, events, learning, finance, marketing, and email systems

---

## Executive Summary

This demo creates a **complete, production-realistic association management database** with multiple schemas representing typical association business domains. The database will contain hundreds of members, dozens of events, thousands of transactions, and detailed relationship data - all with **evergreen dates** that remain fresh when re-run years from now.

### Key Design Principles

1. **Date Parameters Only** - Start/End dates frame the entire business window
2. **LLM-Generated Quality Data** - Hardcoded, semantically rich data instead of algorithmic generation
3. **Evergreen/Fresh** - Re-running the script years later still produces current-looking data
4. **Cross-Schema Relationships** - Realistic data flows across all business domains
5. **MJ Integration** - All tables registered in MJ metadata for auto-generation of views, SPs, TypeScript entities, Angular forms

---

## Directory Structure

```
/Demos/AssociationDB/
├── README.md                          # Demo overview and setup instructions
├── schema/                            # Database schema migrations
│   ├── V001__create_schemas.sql      # Create all schemas
│   ├── V002__membership_tables.sql   # Membership domain tables
│   ├── V003__events_tables.sql       # Events domain tables
│   ├── V004__learning_tables.sql     # Learning/LMS domain tables
│   ├── V005__finance_tables.sql      # Finance domain tables
│   ├── V006__marketing_tables.sql    # Marketing domain tables
│   ├── V007__email_tables.sql        # Email tracking domain tables
│   ├── V008__chapters_tables.sql     # Chapters/communities domain tables
│   └── V009__governance_tables.sql   # Governance domain tables
├── data/                              # Sample data generation
│   ├── 00_parameters.sql             # Date parameters and UUID declarations
│   ├── 01_membership_data.sql        # Membership data inserts
│   ├── 02_events_data.sql            # Events data inserts
│   ├── 03_learning_data.sql          # Learning data inserts
│   ├── 04_finance_data.sql           # Finance data inserts
│   ├── 05_marketing_data.sql         # Marketing data inserts
│   ├── 06_email_data.sql             # Email data inserts
│   ├── 07_chapters_data.sql          # Chapters data inserts
│   └── 08_governance_data.sql        # Governance data inserts
└── docs/
    ├── SCHEMA_OVERVIEW.md            # Entity relationship documentation
    ├── SAMPLE_QUERIES.md             # Useful queries for demo/testing
    └── BUSINESS_SCENARIOS.md         # Member journeys and use cases
```

---

## Schema Organization

### Multi-Schema Design

All schemas will be created within the **default MJ database** (not separate databases), following MJ's pattern of using schemas for logical organization.

```
Database: [MJ Database]
├── __mj (MemberJunction core - unchanged)
├── membership (Core member lifecycle)
├── events (Conferences, webinars, registrations)
├── learning (LMS, courses, certifications)
├── finance (Invoicing, payments, revenue)
├── marketing (Campaigns, segments, attribution)
├── email (Templates, sends, tracking)
├── chapters (Geographic/interest-based communities)
└── governance (Committees, board, volunteers)
```

### Why This Approach?

- **Realistic** - Mirrors how associations actually organize data
- **MJ Compatible** - Uses `SchemaName` field in Entity metadata
- **Scalable** - Easy to add new domains without cluttering
- **Secure** - Can apply schema-level permissions if needed
- **Clear** - Developers immediately understand data organization

---

## Date Parameter Strategy

### The Problem
Traditional sample data becomes stale:
- Member joined "2020-01-15" looks outdated in 2027
- Event on "2023-06-10" clearly in the past
- Invoices from 2021 don't demonstrate current billing

### The Solution: Relative Dates

All dates calculated relative to `@StartDate` and `@EndDate` parameters:

```sql
-- Date Parameters (only configuration needed)
DECLARE @EndDate DATE = GETDATE();                      -- "Today"
DECLARE @StartDate DATE = DATEADD(YEAR, -5, @EndDate); -- 5 years of history

-- Derived date anchors
DECLARE @OneYearAgo DATE = DATEADD(YEAR, -1, @EndDate);
DECLARE @SixMonthsAgo DATE = DATEADD(MONTH, -6, @EndDate);
DECLARE @ThirtyDaysAgo DATE = DATEADD(DAY, -30, @EndDate);
DECLARE @Tomorrow DATE = DATEADD(DAY, 1, @EndDate);
DECLARE @NextMonth DATE = DATEADD(MONTH, 1, @EndDate);

-- Usage in data generation
-- Member joined 2.5 years ago
JoinDate = DATEADD(DAY, -912, @EndDate)

-- Event happening next month
StartDate = DATEADD(DAY, 35, @EndDate)

-- Invoice from 45 days ago
InvoiceDate = DATEADD(DAY, -45, @EndDate)
```

### Date Distribution Strategy

**Historical Data (StartDate → EndDate-90 days)**
- Member join dates spread across 5 years
- Completed events and registrations
- Paid invoices and completed courses
- Email campaigns with full metrics

**Recent Data (EndDate-90 days → EndDate)**
- Active memberships near renewal
- Recently completed events
- Recent course enrollments
- Fresh email campaigns

**Future Data (EndDate → EndDate+180 days)**
- Upcoming events with registrations opening
- Future membership renewals
- Scheduled campaigns

---

## Data Volumes and Quality

### Volume Targets

| Domain | Entity | Records | Notes |
|--------|--------|---------|-------|
| **Membership** | Organizations | 40 | Mix of small/medium/large |
| | Members | 500 | Realistic distribution across types |
| | Memberships | 625 | Includes renewal history |
| | Membership Types | 8 | Individual, Student, Corporate, Lifetime, etc. |
| **Events** | Events | 35 | Conferences, webinars, chapter meetings |
| | Event Registrations | 1,400 | ~40 registrations per event avg |
| | Event Sessions | 85 | Tracks for multi-day conferences |
| **Learning** | Courses | 60 | Beginner to advanced levels |
| | Enrollments | 900 | ~45% of members take courses |
| | Course Completions | 650 | ~72% completion rate |
| | Certificates | 650 | Issued upon completion |
| **Finance** | Invoices | 3,200 | Dues, events, courses over 5 years |
| | Line Items | 4,100 | Invoice details |
| | Payments | 3,500 | Some invoices have multiple payments |
| | Refunds | 85 | ~2.5% refund rate |
| **Marketing** | Campaigns | 45 | Email, event promotion, renewals |
| | Segments | 80 | Dynamic member groupings |
| | Campaign Members | 18,000 | Members targeted by campaigns |
| **Email** | Templates | 30 | Welcome, renewal, event, newsletter |
| | Email Sends | 22,000 | Individual tracking records |
| | Email Clicks | 1,100 | ~5% click-through rate |
| **Chapters** | Chapters | 15 | Geographic and special interest |
| | Chapter Members | 275 | Active chapter participants |
| | Chapter Officers | 45 | Leadership roles |
| | Chapter Events | 60 | Local chapter meetings |
| **Governance** | Committees | 12 | Standing and ad-hoc |
| | Committee Members | 65 | Volunteer assignments |
| | Board Positions | 9 | President, VP, Treasurer, etc. |
| | Board Members | 9 | Current board |

**Total Records: ~53,000** across all tables

### Data Quality Standards

**Semantic Richness**
- Real organization names: "TechVentures Inc.", "HealthCare Plus", "Global Retail Analytics"
- Realistic member names and titles: "Sarah Chen, VP of Engineering"
- Descriptive event names: "2024 Annual Technology Leadership Summit"
- Professional course titles: "Advanced Cloud Architecture Certification"

**Realistic Distributions**
- 70% active members, 20% lapsed, 10% pending/new
- 60% individual, 20% corporate, 15% student, 5% lifetime
- Event attendance: 85% attended, 10% registered, 5% no-show
- Payment success: 95% paid on time, 3% late, 2% failed

**Cross-Domain Coherence**
- Sarah Chen joins → attends events → takes courses → renews membership
- Corporate members have multiple employees as individual members
- Chapter events tie to chapter membership
- Email campaigns drive event registrations

**Geographic Distribution**
- US: 75% (concentrated in major tech hubs)
- Canada: 10%
- UK/Europe: 10%
- Asia/Pacific: 5%

---

## Entity Relationships

### Core Entity Definitions

#### MEMBERSHIP Schema

**Member** (500 records)
```sql
CREATE TABLE [membership].[Member] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Email] NVARCHAR(255) NOT NULL UNIQUE,
    [FirstName] NVARCHAR(100) NOT NULL,
    [LastName] NVARCHAR(100) NOT NULL,
    [Title] NVARCHAR(100),
    [OrganizationID] UNIQUEIDENTIFIER,              -- FK to Organization
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
    [Country] NVARCHAR(100),
    [PostalCode] NVARCHAR(20),
    [EngagementScore] INT DEFAULT 0,                -- Calculated score
    [LastActivityDate] DATETIME,
    [ProfilePhotoURL] NVARCHAR(500)
);
```

**Organization** (40 records)
```sql
CREATE TABLE [membership].[Organization] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Industry] NVARCHAR(100),
    [EmployeeCount] INT,
    [AnnualRevenue] DECIMAL(18,2),
    [Website] NVARCHAR(500),
    [Description] NVARCHAR(MAX),
    [YearFounded] INT,
    [City] NVARCHAR(100),
    [State] NVARCHAR(50),
    [Country] NVARCHAR(100),
    [Phone] NVARCHAR(50),
    [LogoURL] NVARCHAR(500)
);
```

**MembershipType** (8 records)
```sql
CREATE TABLE [membership].[MembershipType] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX),
    [AnnualDues] DECIMAL(10,2) NOT NULL,
    [RenewalPeriodMonths] INT DEFAULT 12,
    [IsActive] BIT DEFAULT 1,
    [AllowAutoRenew] BIT DEFAULT 1,
    [RequiresApproval] BIT DEFAULT 0,
    [Benefits] NVARCHAR(MAX)                        -- JSON array
);
```

**Membership** (625 records - includes renewal history)
```sql
CREATE TABLE [membership].[Membership] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to Member
    [MembershipTypeID] UNIQUEIDENTIFIER NOT NULL,   -- FK to MembershipType
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Active', 'Pending', 'Lapsed', 'Suspended', 'Cancelled')),
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [RenewalDate] DATE,
    [AutoRenew] BIT DEFAULT 1,
    [CancellationDate] DATE,
    [CancellationReason] NVARCHAR(MAX),
    CONSTRAINT FK_Membership_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID),
    CONSTRAINT FK_Membership_Type FOREIGN KEY (MembershipTypeID) REFERENCES [membership].[MembershipType](ID)
);
```

#### EVENTS Schema

**Event** (35 records)
```sql
CREATE TABLE [events].[Event] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [EventType] NVARCHAR(50) NOT NULL CHECK (EventType IN ('Conference', 'Webinar', 'Workshop', 'Chapter Meeting', 'Virtual Summit', 'Networking')),
    [StartDate] DATETIME NOT NULL,
    [EndDate] DATETIME NOT NULL,
    [Timezone] NVARCHAR(50),
    [Location] NVARCHAR(255),
    [IsVirtual] BIT DEFAULT 0,
    [VirtualPlatform] NVARCHAR(100),                -- Zoom, Teams, etc.
    [MeetingURL] NVARCHAR(500),
    [ChapterID] UNIQUEIDENTIFIER,                   -- FK to chapters.Chapter
    [Capacity] INT,
    [RegistrationOpenDate] DATETIME,
    [RegistrationCloseDate] DATETIME,
    [RegistrationFee] DECIMAL(10,2),
    [MemberPrice] DECIMAL(10,2),
    [NonMemberPrice] DECIMAL(10,2),
    [CEUCredits] DECIMAL(4,2),                      -- Continuing education
    [Description] NVARCHAR(MAX),
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Draft', 'Published', 'Registration Open', 'Sold Out', 'In Progress', 'Completed', 'Cancelled'))
);
```

**EventRegistration** (1,400 records)
```sql
CREATE TABLE [events].[EventRegistration] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,            -- FK to Event
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [RegistrationDate] DATETIME NOT NULL,
    [RegistrationType] NVARCHAR(50),                -- Early Bird, Standard, etc.
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Registered', 'Waitlisted', 'Attended', 'No Show', 'Cancelled')),
    [CheckInTime] DATETIME,
    [InvoiceID] UNIQUEIDENTIFIER,                   -- FK to finance.Invoice
    [CEUAwarded] BIT DEFAULT 0,
    [CEUAwardedDate] DATETIME,
    [CancellationDate] DATETIME,
    [CancellationReason] NVARCHAR(MAX),
    CONSTRAINT FK_EventReg_Event FOREIGN KEY (EventID) REFERENCES [events].[Event](ID),
    CONSTRAINT FK_EventReg_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

**EventSession** (85 records - for multi-track events)
```sql
CREATE TABLE [events].[EventSession] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,            -- FK to Event
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [StartTime] DATETIME NOT NULL,
    [EndTime] DATETIME NOT NULL,
    [Room] NVARCHAR(100),
    [SpeakerName] NVARCHAR(255),
    [SessionType] NVARCHAR(50),                     -- Keynote, Workshop, Panel
    [Capacity] INT,
    [CEUCredits] DECIMAL(4,2),
    CONSTRAINT FK_Session_Event FOREIGN KEY (EventID) REFERENCES [events].[Event](ID)
);
```

#### LEARNING Schema

**Course** (60 records)
```sql
CREATE TABLE [learning].[Course] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Code] NVARCHAR(50) NOT NULL UNIQUE,
    [Title] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [Category] NVARCHAR(100),
    [Level] NVARCHAR(20) NOT NULL CHECK (Level IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
    [DurationHours] DECIMAL(5,2),
    [CEUCredits] DECIMAL(4,2),
    [Price] DECIMAL(10,2),
    [MemberPrice] DECIMAL(10,2),
    [IsActive] BIT DEFAULT 1,
    [PublishedDate] DATE,
    [InstructorName] NVARCHAR(255),
    [PrerequisiteCourseID] UNIQUEIDENTIFIER,        -- FK to Course (self-reference)
    [ThumbnailURL] NVARCHAR(500),
    [LearningObjectives] NVARCHAR(MAX)              -- JSON array
);
```

**Enrollment** (900 records)
```sql
CREATE TABLE [learning].[Enrollment] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CourseID] UNIQUEIDENTIFIER NOT NULL,           -- FK to Course
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [EnrollmentDate] DATETIME NOT NULL,
    [StartDate] DATETIME,
    [CompletionDate] DATETIME,
    [ExpirationDate] DATETIME,
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Enrolled', 'In Progress', 'Completed', 'Failed', 'Withdrawn', 'Expired')),
    [ProgressPercentage] INT DEFAULT 0 CHECK (ProgressPercentage BETWEEN 0 AND 100),
    [LastAccessedDate] DATETIME,
    [TimeSpentMinutes] INT DEFAULT 0,
    [FinalScore] DECIMAL(5,2),
    [PassingScore] DECIMAL(5,2) DEFAULT 70.00,
    [Passed] BIT,
    [InvoiceID] UNIQUEIDENTIFIER,                   -- FK to finance.Invoice
    CONSTRAINT FK_Enrollment_Course FOREIGN KEY (CourseID) REFERENCES [learning].[Course](ID),
    CONSTRAINT FK_Enrollment_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

**Certificate** (650 records)
```sql
CREATE TABLE [learning].[Certificate] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EnrollmentID] UNIQUEIDENTIFIER NOT NULL,       -- FK to Enrollment
    [CertificateNumber] NVARCHAR(50) NOT NULL UNIQUE,
    [IssuedDate] DATE NOT NULL,
    [ExpirationDate] DATE,
    [CertificatePDFURL] NVARCHAR(500),
    [VerificationCode] NVARCHAR(100) UNIQUE,
    CONSTRAINT FK_Certificate_Enrollment FOREIGN KEY (EnrollmentID) REFERENCES [learning].[Enrollment](ID)
);
```

#### FINANCE Schema

**Invoice** (3,200 records)
```sql
CREATE TABLE [finance].[Invoice] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceNumber] NVARCHAR(50) NOT NULL UNIQUE,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [InvoiceDate] DATE NOT NULL,
    [DueDate] DATE NOT NULL,
    [SubTotal] DECIMAL(12,2) NOT NULL,
    [Tax] DECIMAL(12,2) DEFAULT 0,
    [Discount] DECIMAL(12,2) DEFAULT 0,
    [Total] DECIMAL(12,2) NOT NULL,
    [AmountPaid] DECIMAL(12,2) DEFAULT 0,
    [Balance] DECIMAL(12,2) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Draft', 'Sent', 'Partial', 'Paid', 'Overdue', 'Cancelled', 'Refunded')),
    [Notes] NVARCHAR(MAX),
    [PaymentTerms] NVARCHAR(100),
    CONSTRAINT FK_Invoice_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

**InvoiceLineItem** (4,100 records)
```sql
CREATE TABLE [finance].[InvoiceLineItem] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceID] UNIQUEIDENTIFIER NOT NULL,          -- FK to Invoice
    [Description] NVARCHAR(500) NOT NULL,
    [ItemType] NVARCHAR(50) NOT NULL CHECK (ItemType IN ('Membership Dues', 'Event Registration', 'Course Enrollment', 'Merchandise', 'Donation', 'Other')),
    [Quantity] INT DEFAULT 1,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [TaxAmount] DECIMAL(12,2) DEFAULT 0,
    [RelatedEntityType] NVARCHAR(100),              -- 'Event', 'Course', etc.
    [RelatedEntityID] UNIQUEIDENTIFIER,             -- ID of event/course/etc.
    CONSTRAINT FK_LineItem_Invoice FOREIGN KEY (InvoiceID) REFERENCES [finance].[Invoice](ID)
);
```

**Payment** (3,500 records)
```sql
CREATE TABLE [finance].[Payment] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [InvoiceID] UNIQUEIDENTIFIER NOT NULL,          -- FK to Invoice
    [PaymentDate] DATETIME NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [PaymentMethod] NVARCHAR(50) NOT NULL CHECK (PaymentMethod IN ('Credit Card', 'ACH', 'Check', 'Wire', 'PayPal', 'Stripe', 'Cash')),
    [TransactionID] NVARCHAR(255),                  -- External provider ID
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Pending', 'Completed', 'Failed', 'Refunded', 'Cancelled')),
    [ProcessedDate] DATETIME,
    [FailureReason] NVARCHAR(MAX),
    [Notes] NVARCHAR(MAX),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY (InvoiceID) REFERENCES [finance].[Invoice](ID)
);
```

#### MARKETING Schema

**Campaign** (45 records)
```sql
CREATE TABLE [marketing].[Campaign] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [CampaignType] NVARCHAR(50) NOT NULL CHECK (CampaignType IN ('Email', 'Event Promotion', 'Membership Renewal', 'Course Launch', 'Donation Drive', 'Member Engagement')),
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Draft', 'Scheduled', 'Active', 'Completed', 'Cancelled')),
    [StartDate] DATE,
    [EndDate] DATE,
    [Budget] DECIMAL(12,2),
    [ActualCost] DECIMAL(12,2),
    [TargetAudience] NVARCHAR(MAX),
    [Goals] NVARCHAR(MAX),
    [Description] NVARCHAR(MAX)
);
```

**Segment** (80 records)
```sql
CREATE TABLE [marketing].[Segment] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [SegmentType] NVARCHAR(50),                     -- 'Industry', 'Geography', 'Engagement', 'Membership Type'
    [FilterCriteria] NVARCHAR(MAX),                 -- JSON or SQL WHERE clause
    [MemberCount] INT,
    [LastCalculatedDate] DATETIME,
    [IsActive] BIT DEFAULT 1
);
```

**CampaignMember** (18,000 records)
```sql
CREATE TABLE [marketing].[CampaignMember] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CampaignID] UNIQUEIDENTIFIER NOT NULL,         -- FK to Campaign
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [SegmentID] UNIQUEIDENTIFIER,                   -- FK to Segment
    [AddedDate] DATETIME NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Targeted', 'Sent', 'Responded', 'Converted', 'Opted Out')),
    [ResponseDate] DATETIME,
    [ConversionValue] DECIMAL(12,2),
    CONSTRAINT FK_CampaignMember_Campaign FOREIGN KEY (CampaignID) REFERENCES [marketing].[Campaign](ID),
    CONSTRAINT FK_CampaignMember_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

#### EMAIL Schema

**EmailTemplate** (30 records)
```sql
CREATE TABLE [email].[EmailTemplate] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Subject] NVARCHAR(500),
    [FromName] NVARCHAR(255),
    [FromEmail] NVARCHAR(255),
    [ReplyToEmail] NVARCHAR(255),
    [HtmlBody] NVARCHAR(MAX),
    [TextBody] NVARCHAR(MAX),
    [Category] NVARCHAR(100),
    [IsActive] BIT DEFAULT 1,
    [PreviewText] NVARCHAR(255),
    [Tags] NVARCHAR(500)                            -- Comma-separated
);
```

**EmailSend** (22,000 records)
```sql
CREATE TABLE [email].[EmailSend] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [TemplateID] UNIQUEIDENTIFIER,                  -- FK to EmailTemplate
    [CampaignID] UNIQUEIDENTIFIER,                  -- FK to marketing.Campaign
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [Subject] NVARCHAR(500),
    [SentDate] DATETIME NOT NULL,
    [DeliveredDate] DATETIME,
    [OpenedDate] DATETIME,                          -- First open
    [OpenCount] INT DEFAULT 0,
    [ClickedDate] DATETIME,                         -- First click
    [ClickCount] INT DEFAULT 0,
    [BouncedDate] DATETIME,
    [BounceType] NVARCHAR(20),                      -- 'Hard', 'Soft'
    [BounceReason] NVARCHAR(MAX),
    [UnsubscribedDate] DATETIME,
    [SpamReportedDate] DATETIME,
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Queued', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Spam', 'Unsubscribed', 'Failed')),
    [ExternalMessageID] NVARCHAR(255),              -- Provider tracking ID
    CONSTRAINT FK_EmailSend_Template FOREIGN KEY (TemplateID) REFERENCES [email].[EmailTemplate](ID),
    CONSTRAINT FK_EmailSend_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

**EmailClick** (1,100 records)
```sql
CREATE TABLE [email].[EmailClick] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EmailSendID] UNIQUEIDENTIFIER NOT NULL,        -- FK to EmailSend
    [ClickDate] DATETIME NOT NULL,
    [URL] NVARCHAR(2000) NOT NULL,
    [LinkName] NVARCHAR(255),
    [IPAddress] NVARCHAR(50),
    [UserAgent] NVARCHAR(500),
    CONSTRAINT FK_EmailClick_Send FOREIGN KEY (EmailSendID) REFERENCES [email].[EmailSend](ID)
);
```

#### CHAPTERS Schema

**Chapter** (15 records)
```sql
CREATE TABLE [chapters].[Chapter] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [ChapterType] NVARCHAR(50) NOT NULL CHECK (ChapterType IN ('Geographic', 'Special Interest', 'Industry')),
    [Region] NVARCHAR(100),
    [City] NVARCHAR(100),
    [State] NVARCHAR(50),
    [Country] NVARCHAR(100),
    [FoundedDate] DATE,
    [Description] NVARCHAR(MAX),
    [Website] NVARCHAR(500),
    [Email] NVARCHAR(255),
    [IsActive] BIT DEFAULT 1,
    [MeetingFrequency] NVARCHAR(100),
    [MemberCount] INT
);
```

**ChapterMembership** (275 records)
```sql
CREATE TABLE [chapters].[ChapterMembership] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [ChapterID] UNIQUEIDENTIFIER NOT NULL,          -- FK to Chapter
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [JoinDate] DATE NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CHECK (Status IN ('Active', 'Inactive')),
    [Role] NVARCHAR(100),                           -- 'Member', 'Officer', etc.
    CONSTRAINT FK_ChapterMembership_Chapter FOREIGN KEY (ChapterID) REFERENCES [chapters].[Chapter](ID),
    CONSTRAINT FK_ChapterMembership_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

#### GOVERNANCE Schema

**Committee** (12 records)
```sql
CREATE TABLE [governance].[Committee] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [CommitteeType] NVARCHAR(50) NOT NULL CHECK (CommitteeType IN ('Standing', 'Ad Hoc', 'Task Force')),
    [Purpose] NVARCHAR(MAX),
    [MeetingFrequency] NVARCHAR(100),
    [IsActive] BIT DEFAULT 1,
    [FormedDate] DATE,
    [DisbandedDate] DATE,
    [ChairMemberID] UNIQUEIDENTIFIER,               -- FK to membership.Member
    [MaxMembers] INT
);
```

**CommitteeMembership** (65 records)
```sql
CREATE TABLE [governance].[CommitteeMembership] (
    [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [CommitteeID] UNIQUEIDENTIFIER NOT NULL,        -- FK to Committee
    [MemberID] UNIQUEIDENTIFIER NOT NULL,           -- FK to membership.Member
    [Role] NVARCHAR(100) NOT NULL,                  -- 'Chair', 'Vice Chair', 'Member'
    [StartDate] DATE NOT NULL,
    [EndDate] DATE,
    [IsActive] BIT DEFAULT 1,
    [AppointedBy] NVARCHAR(255),
    CONSTRAINT FK_CommitteeMember_Committee FOREIGN KEY (CommitteeID) REFERENCES [governance].[Committee](ID),
    CONSTRAINT FK_CommitteeMember_Member FOREIGN KEY (MemberID) REFERENCES [membership].[Member](ID)
);
```

---

## Sample Data Generation Strategy

### Phase 1: Foundation Data (Static/Lookup)

**Order**: These must be created first as they're referenced by other tables

1. **Membership Types** (8 records)
   - Individual ($295/year)
   - Student ($95/year)
   - Corporate ($2,500/year)
   - Lifetime ($5,000 one-time)
   - Retired ($150/year)
   - Early Career ($195/year)
   - International ($350/year)
   - Honorary (Free)

2. **Email Templates** (30 records)
   - Welcome series (3 templates)
   - Renewal reminders (5 templates - 90/60/30/7/overdue)
   - Event promotions (8 templates)
   - Course announcements (5 templates)
   - Newsletters (4 templates)
   - Transactional (5 templates - receipts, confirmations)

3. **Chapters** (15 records)
   - Geographic: Silicon Valley, Boston, Austin, Seattle, NYC, Chicago, Denver, Miami, Atlanta, Toronto
   - Special Interest: Women in Tech, Early Career Professionals, AI & ML Practitioners, Cloud Architecture, CyberSecurity

4. **Committees** (12 records)
   - Standing: Executive, Finance, Membership, Events, Education, Marketing, Governance, Ethics
   - Ad Hoc: Strategic Planning, Bylaws Revision, Technology Upgrade, DEI Initiative

### Phase 2: Core Entities (Member-Centric)

**Order**: Build the member base first

5. **Organizations** (40 records)
   - 10 Large enterprises (10,000+ employees, $1B+ revenue)
   - 15 Mid-market (500-5000 employees, $50M-$500M revenue)
   - 15 Small businesses (<500 employees, <$50M revenue)

6. **Members** (500 records)
   - Distribution:
     - 300 Individual members (60%)
     - 100 Corporate members tied to organizations (20%)
     - 75 Student members (15%)
     - 25 Lifetime/Retired/Honorary (5%)
   - Join dates: Distributed across 5-year window
   - Demographics: Realistic titles, industries, locations

7. **Memberships** (625 records)
   - Each current member: 1 active membership
   - 100 members: 1 renewal (2 total membership records)
   - 25 members: 2 renewals (3 total membership records)
   - Includes 50 lapsed memberships

### Phase 3: Events & Registrations

8. **Events** (35 records)
   - 5 Annual conferences (completed in past years + 1 upcoming)
   - 15 Webinars (mix of completed and upcoming)
   - 8 Workshops (hands-on training)
   - 5 Chapter meetings per chapter (75 total chapter events via separate table)
   - 2 Virtual summits

9. **Event Sessions** (85 records)
   - Keynotes, breakouts, workshops for multi-day conferences
   - Realistic conference schedules (3-day events with 8-10 sessions/day)

10. **Event Registrations** (1,400 records)
    - ~40 registrations per event average
    - Early bird vs. standard pricing
    - 85% attendance rate for past events
    - Registration dates between event announcement and start date

### Phase 4: Learning & Certifications

11. **Courses** (60 records)
    - Categories: Cloud, Security, Leadership, Data Science, DevOps, Architecture
    - Levels: 20 Beginner, 25 Intermediate, 15 Advanced
    - Prices: $199-$899, Member discounts

12. **Enrollments** (900 records)
    - ~45% of members have taken at least one course
    - Power users with 5+ enrollments
    - Status distribution: 72% Completed, 18% In Progress, 10% Withdrawn

13. **Certificates** (650 records)
    - One per successful completion
    - Unique certificate numbers: CERT-2024-001234
    - Verification codes for authenticity

### Phase 5: Financial Records

14. **Invoices** (3,200 records)
    - Membership dues: ~650 invoices/year × 5 years = 3,250
    - Event registrations: Bundled into above or separate line items
    - Course enrollments: Bundled into invoices
    - Status: 90% Paid, 5% Overdue, 3% Partial, 2% Cancelled

15. **Invoice Line Items** (4,100 records)
    - Each invoice: 1-2 line items on average
    - Types: Dues, Events, Courses, Merchandise

16. **Payments** (3,500 records)
    - Most invoices: 1 payment
    - Some invoices: 2-3 payments (payment plans)
    - Methods: 70% Credit Card, 20% ACH, 8% Check, 2% Other
    - 3% failure rate

### Phase 6: Marketing & Email

17. **Segments** (80 records)
    - Industry-based: Software, Healthcare, Finance, Retail, etc. (15)
    - Geography: By state/region (20)
    - Engagement: Active, At-Risk, Lapsed, New (10)
    - Membership: By type (8)
    - Behavior: Event Attendees, Course Takers, etc. (15)
    - Custom: Leadership, Volunteers, Donors (12)

18. **Campaigns** (45 records)
    - Recurring: Monthly newsletter (60 over 5 years)
    - Renewal campaigns: 5/year × 5 = 25
    - Event promotions: 35 events = 35 campaigns
    - Course launches: 60 courses = periodic campaigns (20)
    - Member engagement: 15

19. **Campaign Members** (18,000 records)
    - Average 400 members per campaign
    - Conversion rates: 5-15% depending on campaign type

20. **Email Sends** (22,000 records)
    - Tied to campaigns
    - Individual tracking: sent → delivered → opened → clicked
    - Realistic metrics:
      - 97% delivery rate
      - 22% open rate
      - 5% click rate
      - 2% bounce rate
      - 0.5% unsubscribe

21. **Email Clicks** (1,100 records)
    - ~5% of delivered emails
    - Track specific link URLs
    - Timestamps relative to email open

### Phase 7: Community & Governance

22. **Chapter Memberships** (275 records)
    - ~18-20 members per chapter
    - Some members belong to multiple chapters

23. **Chapter Officers** (45 records)
    - 3 officers per chapter (President, VP, Secretary)

24. **Committee Memberships** (65 records)
    - 5-8 members per committee
    - Term dates (typically 1-3 years)

25. **Board Positions & Members** (9 each)
    - President, VP, Treasurer, Secretary, 5 Directors
    - Current board members

---

## Member Journey Examples

To ensure data coherence, we'll create **realistic member journeys** that span multiple schemas:

### Journey 1: Active Professional Member (Sarah Chen)

```sql
-- Background: VP of Engineering, joined 4 years ago, highly engaged

-- Member record
INSERT INTO membership.Member VALUES (
    @Member_SarahChen,
    'sarah.chen@techventures.com',
    'Sarah', 'Chen',
    'VP of Engineering',
    @Org_TechVentures,
    'Software & SaaS',
    'Engineering Leadership',
    15, -- years in profession
    DATEADD(DAY, -1460, @EndDate), -- joined 4 years ago
    ...
);

-- Memberships (renewed 4 times)
-- Year 1
INSERT INTO membership.Membership VALUES (
    NEWID(), @Member_SarahChen, @MembershipType_Corporate,
    'Active',
    DATEADD(DAY, -1460, @EndDate),
    DATEADD(DAY, -1095, @EndDate),
    ...
);
-- Year 2, 3, 4 similar...

-- Event attendance (10 events over 4 years)
INSERT INTO events.EventRegistration VALUES
    (@Event_AnnualConf2021, @Member_SarahChen, 'Attended', ...),
    (@Event_WebinarAI_2022, @Member_SarahChen, 'Attended', ...),
    -- 8 more events...

-- Course completions (8 courses)
INSERT INTO learning.Enrollment VALUES
    (@Course_CloudArchitect, @Member_SarahChen, 'Completed', 94.5, ...),
    -- 7 more courses...

-- Certificates earned (8)
INSERT INTO learning.Certificate VALUES
    (NEWID(), @Enrollment_SarahChen_Cloud, 'CERT-2022-001234', ...),
    -- 7 more certificates...

-- Invoices (4 annual dues + 10 events + 8 courses = 22 invoices)
INSERT INTO finance.Invoice VALUES
    ('INV-2021-001234', @Member_SarahChen, DATEADD(DAY, -1460, @EndDate), 'Paid', ...),
    -- 21 more invoices...

-- Email engagement (opened 65% of emails, clicked 15%)
INSERT INTO email.EmailSend VALUES
    (@Template_Welcome, @Member_SarahChen, 'Opened', ...),
    (@Template_Newsletter_Mar2024, @Member_SarahChen, 'Clicked', ...),
    -- 100+ email sends...

-- Committee membership (Education Committee, 2 years)
INSERT INTO governance.CommitteeMembership VALUES
    (@Committee_Education, @Member_SarahChen, 'Member', DATEADD(DAY, -730, @EndDate), NULL, ...);

-- Chapter membership (Silicon Valley)
INSERT INTO chapters.ChapterMembership VALUES
    (@Chapter_SiliconValley, @Member_SarahChen, 'Active', ...);
```

### Journey 2: Student Member (Alex Kim)

```sql
-- Background: Graduate student, joined 6 months ago, moderate engagement

-- Member record (no organization affiliation)
INSERT INTO membership.Member VALUES (
    @Member_AlexKim,
    'alex.kim@university.edu',
    'Alex', 'Kim',
    'Graduate Student',
    NULL, -- no organization
    'Computer Science',
    'Student',
    2, -- years in profession
    DATEADD(DAY, -180, @EndDate), -- joined 6 months ago
    ...
);

-- Membership (single, still active)
INSERT INTO membership.Membership VALUES (
    NEWID(), @Member_AlexKim, @MembershipType_Student,
    'Active',
    DATEADD(DAY, -180, @EndDate),
    DATEADD(DAY, 185, @EndDate), -- expires in future
    ...
);

-- Event attendance (3 webinars - free for students)
INSERT INTO events.EventRegistration VALUES
    (@Event_WebinarIntroML, @Member_AlexKim, 'Attended', ...),
    -- 2 more webinars...

-- Course enrollment (1 beginner course, in progress)
INSERT INTO learning.Enrollment VALUES
    (@Course_PythonBasics, @Member_AlexKim, 'In Progress', 65, ...);

-- Invoice (just student dues)
INSERT INTO finance.Invoice VALUES
    ('INV-2024-045678', @Member_AlexKim, DATEADD(DAY, -180, @EndDate), 'Paid', ...);

-- Email engagement (opened 40% of emails, lower than average)
INSERT INTO email.EmailSend VALUES
    (@Template_Welcome, @Member_AlexKim, 'Opened', ...),
    (@Template_Newsletter_Oct2024, @Member_AlexKim, 'Delivered', ...), -- not opened
    -- 15 email sends...
```

### Journey 3: Lapsed Member (John Davis)

```sql
-- Background: Former active member, didn't renew after 3 years

-- Member record
INSERT INTO membership.Member VALUES (
    @Member_JohnDavis,
    'j.davis@email.com',
    'John', 'Davis',
    'Software Engineer',
    NULL,
    'Technology',
    'Software Development',
    8,
    DATEADD(DAY, -1460, @EndDate), -- joined 4 years ago
    ...
);

-- Memberships (3 years active, then lapsed)
-- Year 1-3: Active
INSERT INTO membership.Membership VALUES
    (NEWID(), @Member_JohnDavis, @MembershipType_Individual, 'Active', ...),
    -- Years 2-3...

-- Year 4: Lapsed (didn't renew)
INSERT INTO membership.Membership VALUES
    (NEWID(), @Member_JohnDavis, @MembershipType_Individual, 'Lapsed',
     DATEADD(DAY, -365, @EndDate),
     DATEADD(DAY, -1, @EndDate), -- expired yesterday
     ...);

-- Event attendance (attended 2 events when active, none recently)
INSERT INTO events.EventRegistration VALUES
    (@Event_Conf2022, @Member_JohnDavis, 'Attended', DATEADD(DAY, -900, @EndDate), ...);

-- Invoices (3 paid, 1 unpaid renewal)
INSERT INTO finance.Invoice VALUES
    ('INV-2024-012345', @Member_JohnDavis, DATEADD(DAY, -60, @EndDate), 'Overdue', ...);

-- Email engagement (decreasing over time, recent emails not opened)
INSERT INTO email.EmailSend VALUES
    (@Template_RenewalReminder60Days, @Member_JohnDavis, 'Delivered', ...), -- not opened
    (@Template_RenewalReminder30Days, @Member_JohnDavis, 'Delivered', ...), -- not opened
    ...
```

---

## Integration with MemberJunction

### CodeGen Expectations

After running CodeGen on these schemas, MJ will automatically generate:

1. **Database Views** (9 schemas × avg 4 tables = ~36 views)
   - `vwMember`, `vwMembership`, `vwEvent`, `vwInvoice`, etc.
   - Proper JOINs with denormalized foreign key names
   - All computed fields included

2. **Stored Procedures** (~108 procedures)
   - `spCreateMember`, `spUpdateMember`, `spDeleteMember`
   - Same for all 36 tables

3. **TypeScript Entity Classes** (`packages/MJCoreEntities/src/generated/entity_subclasses.ts`)
   ```typescript
   @RegisterClass(BaseEntity, 'Members')
   export class MemberEntity extends BaseEntity {
       get Email(): string;
       get FirstName(): string;
       // ... all fields with proper types
   }
   ```

4. **Zod Schemas** (for validation)
   ```typescript
   Email: z.string().email(),
   Status: z.enum(['Active', 'Pending', 'Lapsed', 'Suspended', 'Cancelled']),
   ```

5. **Angular Forms** (`packages/Angular/Explorer/core-entity-forms/`)
   - Complete CRUD forms for each entity
   - Dropdowns populated from foreign keys
   - Validation based on CHECK constraints

### Entity Metadata Registration

Each table needs metadata entry:

```sql
-- Example for Member entity
INSERT INTO __mj.Entity (
    ID,
    Name,
    BaseTable,
    BaseView,
    SchemaName,
    Description,
    TrackRecordChanges,
    IncludeInAPI,
    AllowCreateAPI,
    AllowUpdateAPI
) VALUES (
    NEWID(),
    'Members',
    'Member',
    'vwMember',
    'membership',
    'Individual members of the association',
    1, -- Track changes
    1, -- Include in API
    1, -- Allow create
    1  -- Allow update
);
```

---

## File Structure and Execution Order

### Schema Files (Run Once)

Execute in order to create all tables:

```bash
# From /Demos/AssociationDB/schema/
1. V001__create_schemas.sql
2. V002__membership_tables.sql
3. V003__events_tables.sql
4. V004__learning_tables.sql
5. V005__finance_tables.sql
6. V006__marketing_tables.sql
7. V007__email_tables.sql
8. V008__chapters_tables.sql
9. V009__governance_tables.sql
```

### Data Files (Run After Schema)

Execute in order to populate tables:

```bash
# From /Demos/AssociationDB/data/
1. 00_parameters.sql            # Sets @StartDate, @EndDate, declares UUIDs
2. 01_membership_data.sql       # Organizations, Members, Types, Memberships
3. 02_events_data.sql           # Events, Sessions, Registrations
4. 03_learning_data.sql         # Courses, Enrollments, Certificates
5. 04_finance_data.sql          # Invoices, Line Items, Payments
6. 05_marketing_data.sql        # Campaigns, Segments, Campaign Members
7. 06_email_data.sql            # Templates, Sends, Clicks
8. 07_chapters_data.sql         # Chapters, Memberships, Officers
9. 08_governance_data.sql       # Committees, Committee Memberships, Board
```

### Single Master Script (Alternative)

Create `MASTER_AssociationDB_Build.sql` that includes all files:

```sql
-- Master build script for Association Sample Database
-- Run this single file to create entire database

-- Phase 1: Create schemas
:r V001__create_schemas.sql

-- Phase 2: Create all tables
:r V002__membership_tables.sql
:r V003__events_tables.sql
-- ... all schema files

-- Phase 3: Populate data
:r 00_parameters.sql
:r 01_membership_data.sql
-- ... all data files

PRINT 'Association Sample Database build complete!'
PRINT 'Total tables created: 36'
PRINT 'Total records inserted: ~53,000'
```

---

## Sample Queries and Use Cases

### Analytics Queries

**Member Retention by Cohort**
```sql
SELECT
    YEAR(m.JoinDate) AS JoinYear,
    COUNT(DISTINCT m.ID) AS TotalMembers,
    SUM(CASE WHEN ms.Status = 'Active' THEN 1 ELSE 0 END) AS ActiveMembers,
    CAST(SUM(CASE WHEN ms.Status = 'Active' THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT m.ID) AS DECIMAL(5,2)) AS RetentionRate
FROM membership.Member m
LEFT JOIN membership.Membership ms ON m.ID = ms.MemberID
    AND ms.EndDate >= GETDATE()
GROUP BY YEAR(m.JoinDate)
ORDER BY JoinYear;
```

**Event ROI Analysis**
```sql
SELECT
    e.Name,
    e.EventType,
    COUNT(er.ID) AS TotalRegistrations,
    SUM(i.Total) AS Revenue,
    SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS Attendees,
    CAST(SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) * 100.0 / COUNT(er.ID) AS DECIMAL(5,2)) AS AttendanceRate
FROM events.Event e
LEFT JOIN events.EventRegistration er ON e.ID = er.EventID
LEFT JOIN finance.Invoice i ON er.InvoiceID = i.ID
WHERE e.Status = 'Completed'
GROUP BY e.Name, e.EventType
ORDER BY Revenue DESC;
```

**Email Campaign Effectiveness**
```sql
SELECT
    c.Name AS CampaignName,
    COUNT(DISTINCT es.ID) AS EmailsSent,
    SUM(CASE WHEN es.Status IN ('Delivered', 'Opened', 'Clicked') THEN 1 ELSE 0 END) AS Delivered,
    SUM(CASE WHEN es.Status IN ('Opened', 'Clicked') THEN 1 ELSE 0 END) AS Opened,
    SUM(CASE WHEN es.Status = 'Clicked' THEN 1 ELSE 0 END) AS Clicked,
    CAST(SUM(CASE WHEN es.Status IN ('Opened', 'Clicked') THEN 1 ELSE 0 END) * 100.0 /
         NULLIF(SUM(CASE WHEN es.Status IN ('Delivered', 'Opened', 'Clicked') THEN 1 ELSE 0 END), 0) AS DECIMAL(5,2)) AS OpenRate,
    CAST(SUM(CASE WHEN es.Status = 'Clicked' THEN 1 ELSE 0 END) * 100.0 /
         NULLIF(SUM(CASE WHEN es.Status IN ('Opened', 'Clicked') THEN 1 ELSE 0 END), 0) AS DECIMAL(5,2)) AS ClickRate
FROM marketing.Campaign c
JOIN email.EmailSend es ON c.ID = es.CampaignID
GROUP BY c.Name;
```

**Member Engagement Scoring**
```sql
SELECT
    m.FirstName + ' ' + m.LastName AS MemberName,
    m.Email,
    -- Events: 10 points per attended
    COUNT(DISTINCT er.ID) * 10 AS EventPoints,
    -- Courses: 15 points per completion
    COUNT(DISTINCT CASE WHEN enr.Status = 'Completed' THEN enr.ID END) * 15 AS CoursePoints,
    -- Email: 2 points per click
    COUNT(DISTINCT ec.ID) * 2 AS EmailPoints,
    -- Committee: 50 points
    COUNT(DISTINCT cm.ID) * 50 AS CommitteePoints,
    -- Total
    (COUNT(DISTINCT er.ID) * 10 +
     COUNT(DISTINCT CASE WHEN enr.Status = 'Completed' THEN enr.ID END) * 15 +
     COUNT(DISTINCT ec.ID) * 2 +
     COUNT(DISTINCT cm.ID) * 50) AS TotalEngagementScore
FROM membership.Member m
LEFT JOIN events.EventRegistration er ON m.ID = er.MemberID AND er.Status = 'Attended'
LEFT JOIN learning.Enrollment enr ON m.ID = enr.MemberID
LEFT JOIN email.EmailSend es ON m.ID = es.MemberID
LEFT JOIN email.EmailClick ec ON es.ID = ec.EmailSendID
LEFT JOIN governance.CommitteeMembership cm ON m.ID = cm.MemberID
WHERE m.ID IN (SELECT MemberID FROM membership.Membership WHERE Status = 'Active')
GROUP BY m.FirstName, m.LastName, m.Email
ORDER BY TotalEngagementScore DESC;
```

---

## Testing and Validation

### Data Integrity Checks

```sql
-- Check referential integrity
-- All memberships should have valid members
SELECT COUNT(*) FROM membership.Membership ms
WHERE NOT EXISTS (SELECT 1 FROM membership.Member m WHERE m.ID = ms.MemberID);
-- Should return 0

-- All event registrations should have valid events and members
SELECT COUNT(*) FROM events.EventRegistration er
WHERE NOT EXISTS (SELECT 1 FROM events.Event e WHERE e.ID = er.EventID)
   OR NOT EXISTS (SELECT 1 FROM membership.Member m WHERE m.ID = er.MemberID);
-- Should return 0

-- All payments should have valid invoices
SELECT COUNT(*) FROM finance.Payment p
WHERE NOT EXISTS (SELECT 1 FROM finance.Invoice i WHERE i.ID = p.InvoiceID);
-- Should return 0
```

### Business Logic Validation

```sql
-- Invoice totals should match sum of payments
SELECT i.InvoiceNumber, i.Total, i.AmountPaid, SUM(p.Amount) AS ActualPaid
FROM finance.Invoice i
LEFT JOIN finance.Payment p ON i.ID = p.InvoiceID AND p.Status = 'Completed'
GROUP BY i.InvoiceNumber, i.Total, i.AmountPaid
HAVING ABS(i.AmountPaid - ISNULL(SUM(p.Amount), 0)) > 0.01;
-- Should return 0 rows

-- Event registrations should not exceed capacity
SELECT e.Name, e.Capacity, COUNT(er.ID) AS Registrations
FROM events.Event e
JOIN events.EventRegistration er ON e.ID = er.EventID
WHERE e.Capacity IS NOT NULL
GROUP BY e.Name, e.Capacity
HAVING COUNT(er.ID) > e.Capacity;
-- Should return 0 rows (or only 'Sold Out' status events)

-- Members shouldn't have overlapping active memberships of same type
SELECT m.Email, mt.Name, COUNT(*) AS OverlappingMemberships
FROM membership.Membership ms1
JOIN membership.Membership ms2 ON ms1.MemberID = ms2.MemberID
    AND ms1.MembershipTypeID = ms2.MembershipTypeID
    AND ms1.ID < ms2.ID
    AND ms1.StartDate <= ms2.EndDate
    AND ms1.EndDate >= ms2.StartDate
JOIN membership.Member m ON ms1.MemberID = m.ID
JOIN membership.MembershipType mt ON ms1.MembershipTypeID = mt.ID
GROUP BY m.Email, mt.Name;
-- Should return 0 rows (unless intentional)
```

---

## README Template

The `/Demos/AssociationDB/README.md` will include:

- **Overview**: What the demo demonstrates
- **Prerequisites**: SQL Server version, MJ installation
- **Quick Start**: Step-by-step setup instructions
- **Schema Overview**: Diagram and entity descriptions
- **Sample Data**: What's included and realistic volumes
- **Date Parameters**: How to customize date range
- **Re-running**: Instructions for resetting and re-populating
- **Sample Queries**: Common analytics queries
- **Use Cases**: Example scenarios (member journeys)
- **Extending**: How to add custom tables/data
- **Troubleshooting**: Common issues and solutions

---

## Success Criteria

✅ **Comprehensive Coverage**: All major association business domains represented
✅ **Realistic Data**: Semantically meaningful, not lorem ipsum
✅ **Evergreen Dates**: Can be re-run years later and data looks current
✅ **Cross-Schema Relationships**: Member journeys span all domains
✅ **MJ Integration**: All tables registered, CodeGen-compatible
✅ **Parameterized**: Easy to adjust date ranges
✅ **Well-Documented**: Clear README and schema docs
✅ **Testable**: Includes validation queries
✅ **Production-Realistic**: Volumes, distributions, and patterns mirror real associations

---

## Implementation Timeline

### Phase 1: Foundation (Day 1)
- Create directory structure
- Write plan document (this file)
- Create schema migration files for membership + events

### Phase 2: Core Schemas (Day 2)
- Complete remaining schema files (learning, finance, marketing, email, chapters, governance)
- Create parameter declaration file
- Begin membership and events data generation

### Phase 3: Data Generation (Days 3-4)
- Generate all sample data files with realistic, hardcoded records
- Implement member journeys across schemas
- Create UUID declarations for referential integrity

### Phase 4: Documentation & Testing (Day 5)
- Write comprehensive README
- Create sample queries document
- Write business scenarios documentation
- Test data integrity and business logic
- Create master build script

---

## Next Steps

1. ✅ Create this plan document
2. Create `/Demos/AssociationDB` directory structure
3. Begin with schema migration files
4. Generate sample data with evergreen dates
5. Document and test

**Ready to proceed with implementation!**
