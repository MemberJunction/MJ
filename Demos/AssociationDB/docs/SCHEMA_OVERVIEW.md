# Association Sample Database - Complete Schema Overview

Comprehensive documentation of all 58 tables across the Cheese Industry Association database.

## 🏗️ Database Architecture

### Overview

```mermaid
erDiagram
    MEMBER ||--o{ MEMBERSHIP : "has"
    MEMBER ||--o{ EVENT_REGISTRATION : "registers for"
    MEMBER ||--o{ ENROLLMENT : "enrolls in"
    MEMBER ||--o{ CERTIFICATION : "earns"
    MEMBER ||--o{ FORUM_POST : "creates"
    MEMBER ||--o{ RESOURCE_BOOKMARK : "bookmarks"
    MEMBER ||--o{ ADVOCACY_ACTION : "takes"

    ORGANIZATION ||--o{ MEMBER : "employs"

    EVENT ||--o{ EVENT_SESSION : "contains"
    EVENT ||--o{ EVENT_REGISTRATION : "has"

    COURSE ||--o{ ENROLLMENT : "has"
    ENROLLMENT ||--o{ CERTIFICATE : "produces"

    COMPETITION ||--o{ COMPETITION_ENTRY : "receives"
    COMPETITION ||--o{ COMPETITION_JUDGE : "assigns"
    PRODUCT ||--o{ COMPETITION_ENTRY : "enters"

    LEGISLATIVE_BODY ||--o{ LEGISLATIVE_ISSUE : "manages"
    LEGISLATIVE_ISSUE ||--o{ POLICY_POSITION : "has"
    LEGISLATIVE_ISSUE ||--o{ ADVOCACY_ACTION : "tracks"

    FORUM ||--o{ FORUM_THREAD : "contains"
    FORUM_THREAD ||--o{ FORUM_POST : "has"

    RESOURCE_CATEGORY ||--o{ RESOURCE : "contains"
```

### Schema Organization

All 58 tables reside in the **`AssociationDemo`** schema, organized into 13 logical domains:

| Domain | Tables | Purpose |
|--------|--------|---------|
| **Core Membership** | 4 | Member profiles, organizations, membership types and records |
| **Events** | 3 | Conferences, workshops, sessions, registrations |
| **Learning** | 3 | Courses, enrollments, certificates |
| **Finance** | 3 | Invoices, line items, payments |
| **Marketing** | 3 | Campaigns, segments, targeting |
| **Email** | 3 | Templates, sends, click tracking |
| **Chapters** | 3 | Geographic/interest groups, membership, leadership |
| **Governance** | 4 | Committees, board positions, assignments |
| **Forums** | 8 | Discussion forums, threads, posts, moderation |
| **Resources** | 6 | Knowledge base, categories, downloads, bookmarks |
| **Certifications** | 6 | Professional credentials, CE credits, renewals |
| **Products & Awards** | 6 | Product catalog, competitions, judging, awards |
| **Legislative** | 6 | Legislative tracking, advocacy, policy positions |

---

## 📋 Phase 0: Core Domains (26 Tables)

### Core Membership Domain (4 tables)

Foundation for all other domains.

```mermaid
erDiagram
    ORGANIZATION ||--o{ MEMBER : "employs"
    MEMBER ||--o{ MEMBERSHIP : "has records"
    MEMBERSHIP_TYPE ||--o{ MEMBERSHIP : "defines"

    ORGANIZATION {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar Industry
        int EmployeeCount
        decimal AnnualRevenue
    }

    MEMBER {
        uniqueidentifier ID PK
        nvarchar Email UK
        nvarchar FirstName
        nvarchar LastName
        uniqueidentifier OrganizationID FK
        date JoinDate
    }

    MEMBERSHIP_TYPE {
        uniqueidentifier ID PK
        nvarchar Name
        decimal AnnualDues
        int RenewalPeriodMonths
    }

    MEMBERSHIP {
        uniqueidentifier ID PK
        uniqueidentifier MemberID FK
        uniqueidentifier MembershipTypeID FK
        nvarchar Status
        date StartDate
        date EndDate
    }
```

**Key Tables:**
- **Organization**: 40 cheese producers, retailers, suppliers
- **Member**: 2,000 industry professionals
- **MembershipType**: 8 types (Individual, Corporate, Student, etc.)
- **Membership**: 2,500+ records including renewal history

### Events Domain (3 tables)

```mermaid
erDiagram
    EVENT ||--o{ EVENT_SESSION : "contains"
    EVENT ||--o{ EVENT_REGISTRATION : "has"
    MEMBER ||--o{ EVENT_REGISTRATION : "registers"

    EVENT {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar EventType
        datetime StartDate
        datetime EndDate
        decimal CEUCredits
        nvarchar Status
    }

    EVENT_SESSION {
        uniqueidentifier ID PK
        uniqueidentifier EventID FK
        nvarchar Name
        nvarchar SpeakerName
        nvarchar SessionType
        decimal CEUCredits
    }

    EVENT_REGISTRATION {
        uniqueidentifier ID PK
        uniqueidentifier EventID FK
        uniqueidentifier MemberID FK
        nvarchar Status
        datetime CheckInTime
        bit CEUAwarded
    }
```

**Data**: 21 events, 85 sessions, 1,400+ registrations

### Learning Domain (3 tables)

```mermaid
erDiagram
    COURSE ||--o{ ENROLLMENT : "has"
    ENROLLMENT ||--o{ CERTIFICATE : "produces"
    MEMBER ||--o{ ENROLLMENT : "enrolls"
    COURSE ||--o| COURSE : "requires prerequisite"

    COURSE {
        uniqueidentifier ID PK
        nvarchar Code UK
        nvarchar Title
        nvarchar Category
        nvarchar Level
        decimal CEUCredits
    }

    ENROLLMENT {
        uniqueidentifier ID PK
        uniqueidentifier CourseID FK
        uniqueidentifier MemberID FK
        nvarchar Status
        int ProgressPercentage
        decimal FinalScore
        bit Passed
    }

    CERTIFICATE {
        uniqueidentifier ID PK
        uniqueidentifier EnrollmentID FK
        nvarchar CertificateNumber UK
        date IssuedDate
        nvarchar VerificationCode
    }
```

**Data**: 60 courses, 900 enrollments, 650+ certificates

### Finance, Marketing, Email Domains (9 tables)

**Finance**: Invoice generation, line items, payment processing
**Marketing**: Campaign management, segmentation, targeting
**Email**: Template library, sends, engagement tracking

---

## 📋 Phase 1: Community Forums (8 Tables)

Knowledge sharing and member engagement.

```mermaid
erDiagram
    FORUM ||--o{ FORUM_THREAD : "contains"
    FORUM_THREAD ||--o{ FORUM_POST : "has"
    FORUM_POST ||--o{ FORUM_POST_REACTION : "receives"
    MEMBER ||--o{ FORUM_THREAD : "creates"
    MEMBER ||--o{ FORUM_POST : "authors"
    MEMBER ||--o{ FORUM_POST_REACTION : "reacts"

    FORUM {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar Description
        int DisplayOrder
        bit IsActive
    }

    FORUM_THREAD {
        uniqueidentifier ID PK
        uniqueidentifier ForumID FK
        uniqueidentifier CreatedByMemberID FK
        nvarchar Title
        nvarchar Status
        bit IsPinned
        bit IsLocked
    }

    FORUM_POST {
        uniqueidentifier ID PK
        uniqueidentifier ThreadID FK
        uniqueidentifier AuthorMemberID FK
        nvarchar Content
        bit IsModerated
    }
```

**Features:**
- 5 specialized forums (Cheese Making, Raw Milk, Business, Equipment, Events)
- Thread management (pinned, locked, closed)
- Post moderation and reactions (like, helpful, expert)
- Member reputation tracking
- 50 threads, 200+ posts

---

## 📋 Phase 2: Resource Library (6 Tables)

Centralized knowledge base and document repository.

```mermaid
erDiagram
    RESOURCE_CATEGORY ||--o{ RESOURCE : "contains"
    RESOURCE ||--o{ RESOURCE_DOWNLOAD : "tracks"
    RESOURCE ||--o{ RESOURCE_BOOKMARK : "bookmarked"
    MEMBER ||--o{ RESOURCE_DOWNLOAD : "downloads"
    MEMBER ||--o{ RESOURCE_BOOKMARK : "bookmarks"

    RESOURCE_CATEGORY {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar Description
        int DisplayOrder
    }

    RESOURCE {
        uniqueidentifier ID PK
        uniqueidentifier CategoryID FK
        nvarchar Title
        nvarchar ResourceType
        nvarchar FileURL
        int DownloadCount
    }

    RESOURCE_DOWNLOAD {
        uniqueidentifier ID PK
        uniqueidentifier ResourceID FK
        uniqueidentifier MemberID FK
        datetime DownloadDate
    }

    RESOURCE_BOOKMARK {
        uniqueidentifier ID PK
        uniqueidentifier ResourceID FK
        uniqueidentifier MemberID FK
        datetime BookmarkedDate
    }
```

**Content Types:**
- Best Practice Guides
- Research Papers
- Regulatory Templates
- Industry Reports
- Video Tutorials
- Webinar Recordings

**Data**: 100 resources across 10 categories

---

## 📋 Phase 3: Certifications (6 Tables)

Professional credential management and continuing education.

```mermaid
erDiagram
    ACCREDITING_BODY ||--o{ CERTIFICATION_TYPE : "offers"
    CERTIFICATION_TYPE ||--o{ CERTIFICATION : "defines"
    CERTIFICATION ||--o{ CONTINUING_EDUCATION : "requires"
    CERTIFICATION ||--o{ CERTIFICATION_RENEWAL : "renews"
    MEMBER ||--o{ CERTIFICATION : "earns"

    ACCREDITING_BODY {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar Acronym
        nvarchar Description
        nvarchar Website
    }

    CERTIFICATION_TYPE {
        uniqueidentifier ID PK
        uniqueidentifier AccreditingBodyID FK
        nvarchar Name
        int ValidityYears
        decimal CEURequiredForRenewal
    }

    CERTIFICATION {
        uniqueidentifier ID PK
        uniqueidentifier MemberID FK
        uniqueidentifier CertificationTypeID FK
        nvarchar Status
        date DateEarned
        date DateExpires
    }

    CONTINUING_EDUCATION {
        uniqueidentifier ID PK
        uniqueidentifier CertificationID FK
        nvarchar ActivityType
        decimal CEUCredits
        date CompletionDate
    }
```

**Certifications:**
- American Cheese Society (ACS)
- Wisconsin Master Cheesemaker
- American Dairy Science Association (ADSA)
- Food Safety Modernization Act (FSMA)

**Data**: 413 certifications, 85 CE records, 19 renewals

---

## 📋 Phase 4: Products & Awards (6 Tables)

Product showcase and competition management.

```mermaid
erDiagram
    PRODUCT_CATEGORY ||--o{ PRODUCT : "categorizes"
    PRODUCT ||--o{ COMPETITION_ENTRY : "enters"
    COMPETITION ||--o{ COMPETITION_ENTRY : "receives"
    COMPETITION ||--o{ COMPETITION_JUDGE : "assigns"
    COMPETITION_ENTRY ||--o| PRODUCT_AWARD : "wins"
    MEMBER ||--o{ PRODUCT : "produces"

    PRODUCT {
        uniqueidentifier ID PK
        uniqueidentifier MemberID FK
        uniqueidentifier CategoryID FK
        nvarchar Name
        nvarchar CheeseType
        nvarchar MilkSource
        int AgeMonths
        bit IsAwardWinner
    }

    COMPETITION {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar Description
        date StartDate
        date EndDate
        nvarchar Status
    }

    COMPETITION_ENTRY {
        uniqueidentifier ID PK
        uniqueidentifier CompetitionID FK
        uniqueidentifier ProductID FK
        decimal Score
        nvarchar Award
    }

    COMPETITION_JUDGE {
        uniqueidentifier ID PK
        uniqueidentifier CompetitionID FK
        uniqueidentifier MemberID FK
        nvarchar Organization
        nvarchar Credentials
    }
```

**Competitions:**
- American Cheese Society Competition
- World Championship Cheese Contest
- International Cheese & Dairy Awards
- Good Food Awards
- US Championship Cheese Contest

**Data**: 110 products, 110 entries, 29 judges (11 organizations), 43 awards

---

## 📋 Phase 5: Legislative Tracking (6 Tables)

Government relations and advocacy management.

```mermaid
erDiagram
    LEGISLATIVE_BODY ||--o{ LEGISLATIVE_ISSUE : "manages"
    LEGISLATIVE_BODY ||--o{ GOVERNMENT_CONTACT : "employs"
    LEGISLATIVE_ISSUE ||--o{ POLICY_POSITION : "defines"
    LEGISLATIVE_ISSUE ||--o{ ADVOCACY_ACTION : "tracks"
    LEGISLATIVE_ISSUE ||--o{ REGULATORY_COMMENT : "receives"
    MEMBER ||--o{ ADVOCACY_ACTION : "performs"

    LEGISLATIVE_BODY {
        uniqueidentifier ID PK
        nvarchar Name
        nvarchar BodyType
        nvarchar Level
        nvarchar State
    }

    LEGISLATIVE_ISSUE {
        uniqueidentifier ID PK
        uniqueidentifier LegislativeBodyID FK
        nvarchar Title
        nvarchar IssueType
        nvarchar BillNumber
        nvarchar Status
        nvarchar ImpactLevel
        nvarchar Category
    }

    POLICY_POSITION {
        uniqueidentifier ID PK
        uniqueidentifier LegislativeIssueID FK
        nvarchar Position
        nvarchar PositionStatement
        date AdoptedDate
        nvarchar Priority
    }

    ADVOCACY_ACTION {
        uniqueidentifier ID PK
        uniqueidentifier LegislativeIssueID FK
        uniqueidentifier MemberID FK
        nvarchar ActionType
        date ActionDate
        nvarchar Description
    }
```

**Legislative Bodies:**
- Federal: US Senate, House, FDA, USDA
- State: Wisconsin, California, Vermont

**Key Issues:**
- Raw milk cheese aging requirements (FDA)
- Food labeling modernization
- Dairy pricing reform
- Import/export tariffs
- Environmental regulations
- Animal welfare standards

**Data**: 10 bodies, 12 issues, 7 positions, 10 contacts, 150 actions, 1 comment

---

## 🔗 Cross-Domain Relationships

### Member-Centric View

Every domain connects to the Member table:

```mermaid
graph TD
    M[Member] --> MS[Membership]
    M --> ER[Event Registration]
    M --> EN[Enrollment]
    M --> C[Certification]
    M --> FP[Forum Post]
    M --> RB[Resource Bookmark]
    M --> P[Product]
    M --> AA[Advocacy Action]
    M --> CM[Chapter Membership]
    M --> COM[Committee Membership]
    M --> I[Invoice]
    M --> ES[Email Send]

    style M fill:#ffcccc
```

### Financial Flow

```mermaid
graph LR
    MS[Membership] --> I[Invoice]
    ER[Event Registration] --> I
    EN[Course Enrollment] --> I
    I --> ILI[Invoice Line Item]
    I --> P[Payment]

    style I fill:#ffffcc
```

---

## 📐 Design Patterns

### 1. Evergreen Dates
All dates calculated relative to `GETDATE()` using `DATEADD()`:
```sql
JoinDate = DATEADD(YEAR, -2, @EndDate)  -- 2 years ago
```

### 2. Status Enumerations
CHECK constraints define allowed values:
```sql
Status NVARCHAR(20) CHECK (Status IN ('Active', 'Lapsed', 'Cancelled'))
```

### 3. Soft Deletes
`IsActive` flags instead of hard deletes:
```sql
IsActive BIT DEFAULT 1
```

### 4. Audit Trails
Renewal history via multiple membership records per member

### 5. Polymorphic Relationships
`RelatedEntityType` + `RelatedEntityID` in InvoiceLineItem

---

## 🎯 Key Indexing Strategy

**Primary Keys**: All tables use `UNIQUEIDENTIFIER` with `NEWSEQUENTIALID()`

**Foreign Keys**: Automatically indexed by MemberJunction CodeGen

**Unique Constraints**:
- InvoiceNumber
- CertificateNumber
- CourseCode
- Email (Member)

**Common Filters**: Status fields, date ranges, type fields

---

## 📊 Table Summary

| Phase | Tables | Purpose | Records |
|-------|--------|---------|---------|
| **Core** | 26 | Base association management | 5,000+ |
| **Phase 1** | 8 | Community forums | 250+ |
| **Phase 2** | 6 | Resource library | 300+ |
| **Phase 3** | 6 | Certifications | 500+ |
| **Phase 4** | 6 | Products & awards | 300+ |
| **Phase 5** | 6 | Legislative tracking | 200+ |
| **TOTAL** | **58** | Complete association system | **10,000+** |

---

For sample queries, see [SAMPLE_QUERIES.md](SAMPLE_QUERIES.md)

For business scenarios, see [BUSINESS_SCENARIOS.md](BUSINESS_SCENARIOS.md)
