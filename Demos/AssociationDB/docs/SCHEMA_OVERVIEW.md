# Association Sample Database - Schema Overview

Complete documentation of all schemas, tables, and relationships in the Association Sample Database.

## 🏗️ Architecture

The database uses a **single consolidated schema (AssociationDemo)** with logical domain separation through table naming conventions and grouping:

```
┌─────────────────────────────────────────────────────────────┐
│                  AssociationDemo Schema                      │
│  All tables organized by business domain prefixes/groups     │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
    Member/    Event/     Course/    Invoice/  Campaign/
    Membership EventReg   Enrollment  LineItem  Segment

        ┌──────────┬──────────┐
        ▼          ▼
    Chapter/   Committee/
    ChapterMem BoardMember
```

## 📊 Business Domains

All tables reside in the `AssociationDemo` schema but are logically organized into 8 business domains:

### 1. Membership Domain (Core)

**Purpose**: Core member and organization data - foundation for all other domains

#### Tables

##### AssociationDemo.Organization
Organizations that members belong to or represent.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Organization name |
| Industry | NVARCHAR(100) | Industry classification |
| EmployeeCount | INT | Number of employees |
| AnnualRevenue | DECIMAL(15,2) | Annual revenue in USD |
| Website | NVARCHAR(500) | Organization website |
| Description | NVARCHAR(MAX) | Organization description |
| YearFounded | INT | Year founded |
| City, State, Country | NVARCHAR | Location information |
| Phone | NVARCHAR(50) | Contact phone |

**Sample Count**: 40 organizations across technology, healthcare, finance, consulting, and international sectors

##### AssociationDemo.MembershipType
Types of memberships available.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(100) | Membership type name |
| Description | NVARCHAR(MAX) | Type description |
| AnnualDues | DECIMAL(10,2) | Annual membership cost |
| RenewalPeriodMonths | INT | Renewal period (typically 12) |
| IsActive | BIT | Whether type is currently offered |
| AllowAutoRenew | BIT | Allow automatic renewal |
| RequiresApproval | BIT | Requires approval to join |
| Benefits | NVARCHAR(MAX) | Description of benefits |
| DisplayOrder | INT | Sort order for display |

**Sample Count**: 8 types (Individual, Student, Corporate, Lifetime, Retired, Early Career, International, Honorary)

##### AssociationDemo.Member
Individual members of the association.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Email | NVARCHAR(255) | Member email (unique) |
| FirstName | NVARCHAR(100) | First name |
| LastName | NVARCHAR(100) | Last name |
| Title | NVARCHAR(100) | Job title |
| OrganizationID | UNIQUEIDENTIFIER | FK to Organization (nullable) |
| Industry | NVARCHAR(100) | Industry sector |
| JobFunction | NVARCHAR(100) | Primary job function |
| YearsInProfession | INT | Years of experience |
| JoinDate | DATE | Date joined association |
| City, State, Country | NVARCHAR | Location |
| Phone | NVARCHAR(50) | Contact phone |
| LinkedInURL | NVARCHAR(500) | LinkedIn profile |

**Sample Count**: 500 members with realistic names, titles, and distribution across organizations

##### AssociationDemo.Membership
Individual membership records (includes renewal history).

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| MembershipTypeID | UNIQUEIDENTIFIER | FK to MembershipType |
| Status | NVARCHAR(20) | Active, Expired, Cancelled, Pending, Lapsed |
| StartDate | DATE | Membership start date |
| EndDate | DATE | Membership end date |
| RenewalDate | DATE | Date renewed (if applicable) |
| AutoRenew | BIT | Automatic renewal enabled |

**Sample Count**: 625 records (includes renewal history for long-term members)

---

### 2. Events Domain

**Purpose**: Conference, webinar, workshop, and meeting management

#### Tables

##### AssociationDemo.Event
Events organized by the association.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Event name |
| EventType | NVARCHAR(50) | Conference, Webinar, Workshop, Chapter Meeting, Virtual Summit, Networking |
| StartDate | DATETIME | Event start date/time |
| EndDate | DATETIME | Event end date/time |
| Timezone | NVARCHAR(50) | Timezone |
| Location | NVARCHAR(255) | Physical location (if applicable) |
| IsVirtual | BIT | Whether event is virtual |
| VirtualPlatform | NVARCHAR(100) | Zoom, Teams, etc. |
| MeetingURL | NVARCHAR(500) | Virtual meeting URL |
| ChapterID | UNIQUEIDENTIFIER | Associated chapter (if applicable) |
| Capacity | INT | Maximum attendees |
| RegistrationOpenDate | DATETIME | Registration opens |
| RegistrationCloseDate | DATETIME | Registration closes |
| RegistrationFee | DECIMAL(10,2) | Base registration fee |
| MemberPrice | DECIMAL(10,2) | Member pricing |
| NonMemberPrice | DECIMAL(10,2) | Non-member pricing |
| CEUCredits | DECIMAL(4,2) | Continuing education credits |
| Description | NVARCHAR(MAX) | Event description |
| Status | NVARCHAR(20) | Draft, Published, Registration Open, Sold Out, In Progress, Completed, Cancelled |

**Sample Count**: 35 events (5 annual conferences 2020-2024, virtual summits, workshops, webinars, networking)

##### AssociationDemo.EventSession
Individual sessions within multi-track events.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| EventID | UNIQUEIDENTIFIER | FK to Event |
| Name | NVARCHAR(255) | Session name |
| Description | NVARCHAR(MAX) | Session description |
| StartTime | DATETIME | Session start |
| EndTime | DATETIME | Session end |
| Room | NVARCHAR(100) | Room/location |
| SpeakerName | NVARCHAR(255) | Speaker name |
| SessionType | NVARCHAR(50) | Keynote, Workshop, Panel, etc. |
| Capacity | INT | Session capacity |
| CEUCredits | DECIMAL(4,2) | Credits for this session |

**Sample Count**: 85 sessions across major conferences

##### AssociationDemo.EventRegistration
Member registrations and attendance tracking.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| EventID | UNIQUEIDENTIFIER | FK to Event |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| RegistrationDate | DATETIME | When registered |
| RegistrationType | NVARCHAR(50) | Early Bird, Standard, Late |
| Status | NVARCHAR(20) | Registered, Waitlisted, Attended, No Show, Cancelled |
| CheckInTime | DATETIME | Actual check-in time |
| InvoiceID | UNIQUEIDENTIFIER | Related invoice |
| CEUAwarded | BIT | Whether CEU credits were awarded |
| CEUAwardedDate | DATETIME | When credits awarded |
| CancellationDate | DATETIME | If cancelled |
| CancellationReason | NVARCHAR(MAX) | Cancellation reason |

**Sample Count**: 1,400+ registrations with realistic attendance patterns

---

### 3. Learning Domain

**Purpose**: Learning management system (LMS) for courses and certifications

#### Tables

##### AssociationDemo.Course
Educational courses and certification programs.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Code | NVARCHAR(50) | Unique course code |
| Title | NVARCHAR(255) | Course title |
| Description | NVARCHAR(MAX) | Course description |
| Category | NVARCHAR(100) | Course category |
| Level | NVARCHAR(20) | Beginner, Intermediate, Advanced, Expert |
| DurationHours | DECIMAL(5,2) | Estimated duration |
| CEUCredits | DECIMAL(4,2) | Continuing education credits |
| Price | DECIMAL(10,2) | Standard price |
| MemberPrice | DECIMAL(10,2) | Member pricing |
| IsActive | BIT | Currently offered |
| PublishedDate | DATE | When published |
| InstructorName | NVARCHAR(255) | Instructor name |
| PrerequisiteCourseID | UNIQUEIDENTIFIER | FK to prerequisite course |
| ThumbnailURL | NVARCHAR(500) | Course thumbnail |
| LearningObjectives | NVARCHAR(MAX) | Learning objectives |

**Sample Count**: 60 courses across Cloud, Security, Data Science, DevOps, Leadership, Software Development, Business

##### learning.Enrollment
Member course enrollments and progress.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| CourseID | UNIQUEIDENTIFIER | FK to Course |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| EnrollmentDate | DATETIME | When enrolled |
| StartDate | DATETIME | When started |
| CompletionDate | DATETIME | When completed |
| ExpirationDate | DATETIME | Enrollment expiration |
| Status | NVARCHAR(20) | Enrolled, In Progress, Completed, Failed, Withdrawn, Expired |
| ProgressPercentage | INT | 0-100% |
| LastAccessedDate | DATETIME | Last access |
| TimeSpentMinutes | INT | Total time spent |
| FinalScore | DECIMAL(5,2) | Final assessment score |
| PassingScore | DECIMAL(5,2) | Required passing score (default 70) |
| Passed | BIT | Whether passed |
| InvoiceID | UNIQUEIDENTIFIER | Related invoice |

**Sample Count**: 900 enrollments with realistic completion rates (72% completed)

##### learning.Certificate
Completion certificates issued to members.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| EnrollmentID | UNIQUEIDENTIFIER | FK to Enrollment |
| CertificateNumber | NVARCHAR(50) | Unique certificate number |
| IssuedDate | DATE | Issue date |
| ExpirationDate | DATE | Expiration (if applicable) |
| CertificatePDFURL | NVARCHAR(500) | PDF download URL |
| VerificationCode | NVARCHAR(100) | Unique verification code |

**Sample Count**: 650+ certificates for completed courses

---

### 4. Finance Schema

**Purpose**: Financial management including invoicing and payments

#### Tables

##### finance.Invoice
Invoices for dues, events, courses, etc.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| InvoiceNumber | NVARCHAR(50) | Unique invoice number |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| InvoiceDate | DATE | Invoice date |
| DueDate | DATE | Payment due date |
| SubTotal | DECIMAL(12,2) | Subtotal before tax/discounts |
| Tax | DECIMAL(12,2) | Tax amount |
| Discount | DECIMAL(12,2) | Discount amount |
| Total | DECIMAL(12,2) | Total amount |
| AmountPaid | DECIMAL(12,2) | Amount paid to date |
| Balance | DECIMAL(12,2) | Remaining balance |
| Status | NVARCHAR(20) | Draft, Sent, Partial, Paid, Overdue, Cancelled, Refunded |
| Notes | NVARCHAR(MAX) | Invoice notes |
| PaymentTerms | NVARCHAR(100) | Payment terms |

**Sample Count**: Programmatically generated for all memberships, events, and courses

##### finance.InvoiceLineItem
Detailed line items on invoices.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| InvoiceID | UNIQUEIDENTIFIER | FK to Invoice |
| Description | NVARCHAR(500) | Line item description |
| ItemType | NVARCHAR(50) | Membership Dues, Event Registration, Course Enrollment, Merchandise, Donation, Other |
| Quantity | INT | Quantity (default 1) |
| UnitPrice | DECIMAL(10,2) | Price per unit |
| Amount | DECIMAL(12,2) | Total line amount |
| TaxAmount | DECIMAL(12,2) | Tax for this line |
| RelatedEntityType | NVARCHAR(100) | Type of related entity |
| RelatedEntityID | UNIQUEIDENTIFIER | ID of related entity |

**Sample Count**: Multiple line items per invoice

##### finance.Payment
Payment transactions.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| InvoiceID | UNIQUEIDENTIFIER | FK to Invoice |
| PaymentDate | DATETIME | Payment initiated |
| Amount | DECIMAL(12,2) | Payment amount |
| PaymentMethod | NVARCHAR(50) | Credit Card, ACH, Check, Wire, PayPal, Stripe, Cash |
| TransactionID | NVARCHAR(255) | External transaction ID |
| Status | NVARCHAR(20) | Pending, Completed, Failed, Refunded, Cancelled |
| ProcessedDate | DATETIME | When processed |
| FailureReason | NVARCHAR(MAX) | Failure reason if failed |
| Notes | NVARCHAR(MAX) | Payment notes |

**Sample Count**: Generated for paid invoices with realistic success/failure rates

---

### 5. Marketing Schema

**Purpose**: Marketing campaign management and member segmentation

#### Tables

##### marketing.Segment
Member segments for targeted marketing.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Segment name |
| Description | NVARCHAR(MAX) | Segment description |
| SegmentType | NVARCHAR(50) | Static, Dynamic, One-Time |
| FilterCriteria | NVARCHAR(MAX) | Criteria for dynamic segments |
| IsActive | BIT | Whether segment is active |
| CreatedDate | DATE | Creation date |
| MemberCount | INT | Number of members in segment |

**Sample Count**: 80 segments (demographic, behavioral, engagement-based)

##### marketing.Campaign
Marketing campaigns.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Campaign name |
| CampaignType | NVARCHAR(50) | Email, Event Promotion, Membership Drive, Webinar Series, Survey, Newsletter |
| Description | NVARCHAR(MAX) | Campaign description |
| StartDate | DATE | Campaign start |
| EndDate | DATE | Campaign end |
| Status | NVARCHAR(20) | Draft, Scheduled, Active, Paused, Completed, Cancelled |
| Budget | DECIMAL(10,2) | Campaign budget |
| GoalType | NVARCHAR(100) | Type of goal |
| GoalValue | NVARCHAR(255) | Goal value |
| ActualResults | NVARCHAR(MAX) | Actual results achieved |

**Sample Count**: 45 campaigns across various types and goals

##### marketing.CampaignMember
Member assignments to campaigns.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| CampaignID | UNIQUEIDENTIFIER | FK to Campaign |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| SegmentID | UNIQUEIDENTIFIER | FK to Segment |
| Status | NVARCHAR(20) | Sent, Engaged, Converted, Bounced, Opted Out |
| AddedDate | DATETIME | When added to campaign |
| ResponseDate | DATETIME | When responded |
| ConversionDate | DATETIME | When converted |

**Sample Count**: Programmatically generated based on segments and campaigns

---

### 6. Email Schema

**Purpose**: Email communications and engagement tracking

#### Tables

##### email.EmailTemplate
Reusable email templates.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Template name |
| Subject | NVARCHAR(500) | Email subject line |
| BodyHTML | NVARCHAR(MAX) | HTML email body |
| BodyText | NVARCHAR(MAX) | Plain text version |
| TemplateType | NVARCHAR(50) | Marketing, Transactional, Newsletter |
| IsActive | BIT | Whether active |
| CreatedDate | DATE | Creation date |
| LastUsedDate | DATE | Last used |

**Sample Count**: 30 templates for various purposes

##### email.EmailSend
Individual email sends to members.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| EmailTemplateID | UNIQUEIDENTIFIER | FK to EmailTemplate |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| CampaignID | UNIQUEIDENTIFIER | FK to Campaign (if part of campaign) |
| SentDate | DATETIME | When sent |
| DeliveredDate | DATETIME | When delivered |
| OpenedDate | DATETIME | First open |
| ClickedDate | DATETIME | First click |
| BouncedDate | DATETIME | If bounced |
| BounceReason | NVARCHAR(MAX) | Bounce reason |
| UnsubscribedDate | DATETIME | If unsubscribed |
| Status | NVARCHAR(20) | Sent, Delivered, Opened, Clicked, Bounced, Failed |

**Sample Count**: Thousands of sends with realistic engagement (25% open, 5% click rates)

##### email.EmailClick
Click tracking for links in emails.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| EmailSendID | UNIQUEIDENTIFIER | FK to EmailSend |
| ClickDate | DATETIME | When clicked |
| LinkURL | NVARCHAR(MAX) | URL clicked |
| UserAgent | NVARCHAR(500) | Browser/device info |

**Sample Count**: Generated for clicked emails

---

### 7. Chapters Schema

**Purpose**: Geographic and special interest chapter management

#### Tables

##### chapters.Chapter
Local chapters and special interest groups.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Chapter name |
| ChapterType | NVARCHAR(50) | Geographic, Special Interest, Industry |
| Region | NVARCHAR(100) | Geographic region |
| City, State, Country | NVARCHAR | Location |
| FoundedDate | DATE | When founded |
| IsActive | BIT | Whether active |
| MeetingFrequency | NVARCHAR(100) | How often meets |
| Description | NVARCHAR(MAX) | Chapter description |

**Sample Count**: 15 chapters (geographic and special interest)

##### chapters.ChapterMembership
Chapter member assignments.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| ChapterID | UNIQUEIDENTIFIER | FK to Chapter |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| JoinDate | DATE | When joined chapter |
| Status | NVARCHAR(20) | Active, Inactive, Lapsed |
| Role | NVARCHAR(100) | Member role in chapter |

**Sample Count**: 275+ chapter memberships

##### chapters.ChapterOfficer
Chapter leadership positions.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| ChapterID | UNIQUEIDENTIFIER | FK to Chapter |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| Position | NVARCHAR(100) | President, Vice President, Secretary, Treasurer, etc. |
| StartDate | DATE | Term start |
| EndDate | DATE | Term end |
| IsActive | BIT | Currently serving |

**Sample Count**: 45 officers (3 per chapter)

---

### 8. Governance Schema

**Purpose**: Committee and board management

#### Tables

##### governance.Committee
Association committees and task forces.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| Name | NVARCHAR(255) | Committee name |
| CommitteeType | NVARCHAR(50) | Standing, Ad Hoc, Task Force |
| Purpose | NVARCHAR(MAX) | Committee purpose/charter |
| MeetingFrequency | NVARCHAR(100) | How often meets |
| IsActive | BIT | Whether active |
| FormedDate | DATE | When formed |
| DisbandedDate | DATE | When disbanded (if applicable) |
| ChairMemberID | UNIQUEIDENTIFIER | FK to Member (committee chair) |
| MaxMembers | INT | Maximum committee size |

**Sample Count**: 12 committees (standing, ad hoc, task forces)

##### governance.CommitteeMembership
Committee member assignments.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| CommitteeID | UNIQUEIDENTIFIER | FK to Committee |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| Role | NVARCHAR(100) | Chair, Vice Chair, Member |
| StartDate | DATE | Service start |
| EndDate | DATE | Service end |
| IsActive | BIT | Currently serving |
| AppointedBy | NVARCHAR(255) | Who appointed |

**Sample Count**: Programmatically generated (5-8 per committee)

##### governance.BoardPosition
Board of directors positions.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| PositionTitle | NVARCHAR(100) | President, VP, Treasurer, Secretary, Director |
| PositionOrder | INT | Display order |
| Description | NVARCHAR(MAX) | Position description |
| TermLengthYears | INT | Length of term |
| IsOfficer | BIT | Whether this is an officer position |
| IsActive | BIT | Whether position exists |

**Sample Count**: 9 positions (4 officers + 5 directors)

##### governance.BoardMember
Current and historical board members.

| Column | Type | Description |
|--------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| BoardPositionID | UNIQUEIDENTIFIER | FK to BoardPosition |
| MemberID | UNIQUEIDENTIFIER | FK to Member |
| StartDate | DATE | Service start |
| EndDate | DATE | Service end |
| IsActive | BIT | Currently serving |
| ElectionDate | DATE | When elected |

**Sample Count**: 9 current board members

---

## 🔗 Key Relationships

### Foreign Key Relationships

**Membership (Core)**
- None (foundation schema)

**Events**
- Event → Chapter (optional)
- EventSession → Event
- EventRegistration → Event
- EventRegistration → Member

**Learning**
- Course → Course (prerequisite, self-referencing)
- Enrollment → Course
- Enrollment → Member
- Certificate → Enrollment

**Finance**
- Invoice → Member
- InvoiceLineItem → Invoice
- InvoiceLineItem → [Various] (polymorphic via RelatedEntityType/ID)
- Payment → Invoice

**Marketing**
- CampaignMember → Campaign
- CampaignMember → Member
- CampaignMember → Segment

**Email**
- EmailSend → EmailTemplate
- EmailSend → Member
- EmailSend → Campaign (optional)
- EmailClick → EmailSend

**Chapters**
- ChapterMembership → Chapter
- ChapterMembership → Member
- ChapterOfficer → Chapter
- ChapterOfficer → Member

**Governance**
- Committee → Member (chair)
- CommitteeMembership → Committee
- CommitteeMembership → Member
- BoardMember → BoardPosition
- BoardMember → Member

---

## 📐 Design Patterns

### Evergreen Dates
All dates calculated relative to `@EndDate` (current date) using `DATEADD()` functions.

### Polymorphic Relationships
Used in finance.InvoiceLineItem via `RelatedEntityType` and `RelatedEntityID` to reference different source records.

### Audit Trails
Renewal history maintained via multiple membership records per member.

### Soft Deletes
`IsActive` flags used throughout instead of hard deletes.

### Status Enumerations
CHECK constraints define allowed status values for consistency.

### Programmatic Generation
High-volume data (registrations, enrollments, email sends) generated using CROSS JOIN and NEWID() for randomization.

---

## 🎯 Indexing Strategy

**Primary Keys**: All tables use UNIQUEIDENTIFIER with NEWSEQUENTIALID() default
**Foreign Keys**: MemberJunction CodeGen will create indexes automatically
**Unique Constraints**: InvoiceNumber, CertificateNumber, CourseCode
**Common Query Indexes**: Status fields, date fields, type fields

---

For sample queries and usage examples, see [SAMPLE_QUERIES.md](SAMPLE_QUERIES.md).
