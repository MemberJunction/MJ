# MemberJunction Demo Schemas

This directory contains comprehensive demonstration schemas that showcase MemberJunction's capabilities and provide realistic sample data for testing, development, and demonstrations.

## Overview

The demo schemas consist of three complementary systems:

1. **CRM Schema** - Customer Relationship Management system
2. **Events Schema** - Event management and abstract submission system
3. **Sample Data** - Realistic data for 100+ major public companies

Together, these schemas demonstrate real-world business scenarios and can be used to explore MemberJunction's features without needing production data.

## Quick Start

### Installation Order

Execute the scripts in this exact order:

```sql
-- Step 1: Create CRM base schema
-- Run: CRM Schema 1.sql

-- Step 2: Extend CRM with sales functionality
-- Run: CRM Schema 2 - Products - Deals - Invoices.sql

-- Step 3: Add public company sample data (optional)
-- Run: CRM Schema 3 - Public Companies Sample Data.sql

-- Step 4: Create Events schema (requires CRM schema)
-- Run: Events Schema - Abstract Submission Management.sql
```

### Cleanup

To remove demo schemas (in reverse installation order):

```sql
-- Step 1: Drop Events schema
-- Run: Events Schema - Drop.sql

-- Step 2: Drop CRM schema
-- Run: CRM Schema - Drop.sql
```

## Schema Details

### CRM Schema (Base)

**File:** `CRM Schema 1.sql`

The foundation of a customer relationship management system with core entities:

#### Tables

- **Account** - Organizations/companies (prospects, customers, vendors, partners)
  - Includes ticker symbols, exchanges, employee counts, founding years for public companies
- **Contact** - Individual people associated with accounts
- **Activity** - Interactions and touchpoints (calls, emails, meetings, tasks)
- **AccountInsight** - AI-powered news, research, and intelligence tracking per account
- **Industry**, **AccountType**, **AccountStatus**, **ActivityType** - Lookup tables

#### Key Features

- **Public Company Support**: Track ticker symbols, stock exchanges, employee counts, founding years
- **AccountInsight System**: AI-powered tracking of:
  - News articles
  - SEC filings and financial reports
  - Earnings calls
  - Press releases and leadership changes
  - Market analysis
  - Sentiment analysis (Positive, Negative, Neutral, Mixed)
  - Priority levels (High, Medium, Low)
  - Tagging and AI-generated summaries
- Self-referencing contacts (reporting structure)
- Computed column for full name
- Check constraints for data integrity
- Foreign key relationships
- Comprehensive extended properties documentation

#### Sample Data

Basic lookup values for industries, account types, and activity types.

#### Use Cases

- Contact management and executive tracking
- Activity tracking and logging
- Account hierarchy modeling
- Relationship mapping
- **AI-Powered Account Intelligence**:
  - Automated news monitoring and research
  - Track competitor activities and market movements
  - Monitor financial performance and SEC filings
  - Leadership change tracking
  - Sentiment analysis of news coverage
  - Prioritized insights for sales/account teams

---

### CRM Schema 2 (Sales Extension)

**File:** `CRM Schema 2 - Products - Deals - Invoices.sql`

**Prerequisites:** CRM Schema 1

Extends the base CRM with sales pipeline, product catalog, and invoicing capabilities.

#### Tables

- **Product** - Master catalog of products and services
- **Deal** - Sales opportunities and pipeline management
- **DealLineItem** - Products/services associated with deals
- **Invoice** - Billing documents for closed deals
- **InvoiceLineItem** - Line items on invoices
- **Payment** - Payment tracking for invoices

#### Key Features

- Computed columns for deal expected revenue
- Invoice totals with tax calculations
- Payment tracking with balance calculations
- Support for recurring billing
- Deal stages and pipeline management
- Product pricing and cost tracking

#### Sample Data

Sample products, deals in various stages, invoices, and payment records.

#### Use Cases

- Sales pipeline management
- Opportunity tracking
- Product catalog management
- Quote generation
- Invoice processing
- Revenue forecasting

---

### CRM Schema 3 (Public Company Data)

**File:** `CRM Schema 3 - Public Companies Sample Data.sql`

**Prerequisites:** CRM Schema 1

Populates the CRM with realistic data for 100 major publicly traded companies.

#### Content

- **100 Companies** across 13 industries:
  - Technology (40+ companies including FAANG, SaaS leaders)
  - Finance (10 major banks, payment processors)
  - Healthcare & Pharmaceuticals (10 companies)
  - Retail & Consumer Goods (10 brands)
  - Energy (5 companies)
  - Telecommunications (4 carriers)
  - Automotive & Aerospace (5 manufacturers)
  - Media & Entertainment (4 companies)
  - Transportation & Hospitality (7 companies)

- **48 Executive Contacts** across 10 major companies:
  - CEOs, CFOs, CTOs, CIOs
  - General Counsels, Chief People Officers, COOs, CROs, CMOs
  - Accurate names and titles for Apple, Microsoft, Google, Amazon, Salesforce, Oracle, Adobe, JPMorgan Chase, Meta, NVIDIA

- **8 Sample AccountInsight Records**:
  - News articles (Apple earnings, NVIDIA chip launch, Tesla recall)
  - Earnings calls (Microsoft Azure growth)
  - SEC filings (JPMorgan 10-Q)
  - Leadership changes (Apple VP hire)
  - Market analysis (Microsoft Teams market share)
  - Financial reports (NVIDIA data center revenue)
  - Each with sentiment analysis, priority, tags, and AI summaries

- **Accurate Public Company Data**:
  - Real ticker symbols (AAPL, MSFT, GOOGL, etc.)
  - Stock exchanges (NYSE, NASDAQ)
  - Employee counts (ranging from 6,320 to 2,100,000)
  - Founding years (1784 to 2022)
  - Real annual revenue figures
  - Actual headquarters locations
  - Working phone numbers and websites
  - Industry classifications

#### Use Cases

- Testing with realistic company names
- Demonstration datasets for presentations
- Learning SQL queries with familiar brands
- Integration testing with recognizable data
- Training scenarios with real-world context

---

### Events Schema (Abstract Submission Management)

**File:** `Events Schema - Abstract Submission Management.sql`

**Prerequisites:** CRM Schema 1 (for Account and Contact foreign keys)

A comprehensive event management system focused on conference abstract submissions, speaker management, AI-powered evaluation, and review workflows.

#### Tables

##### Core Tables

- **Event** - Conferences and events with submission tracking
- **Speaker** - Speaker profiles with AI-enhanced research dossiers
- **Submission** - Abstract submissions with AI evaluation
- **SubmissionSpeaker** - Many-to-many link between submissions and speakers

##### Review & Workflow Tables

- **SubmissionReview** - Human reviews and scoring by committee members
- **SubmissionNotification** - Audit trail of all email notifications
- **EventReviewTask** - Work queue for review committee

#### Key Features

##### Automated Submission Processing

- Integration with Typeform for submission intake
- Configurable monitoring frequency per event
- Box.com integration for presentation files
- Automatic submission status tracking

##### AI-Powered Features

- **AI Evaluation**: Rubric-based scoring of submissions
  - Overall score (0-100)
  - Dimensional scores (relevance, quality, experience)
  - Detailed reasoning and feedback
  - Pass/fail determination

- **Speaker Research**: Automated dossier building
  - Web search for background information
  - Social media presence analysis
  - Speaking history compilation
  - Credibility scoring (0-100)
  - Publications and reach tracking
  - Red flag identification

- **Content Analysis**:
  - Abstract summarization
  - Key topic extraction
  - Presentation slide analysis
  - Target audience level classification

##### Review Workflow

- Multi-reviewer support
- Task assignment and tracking
- Priority-based work queues
- Decision tracking (Accept, Reject, Waitlist)
- Resubmission handling

##### Notification System

- Automated email notifications at each stage:
  - Initial receipt confirmation
  - Screening pass/fail notices
  - Resubmission requests with feedback
  - Final acceptance/rejection letters
- Delivery status tracking
- Engagement tracking (click-through)

#### Sample Data

The schema includes realistic sample data for demonstration:

- **2 Events**:
  - Tech Summit 2026 (San Francisco)
  - DevOps Days 2026 (Austin)

- **5 Speakers** with varying experience levels:
  - Industry leaders (92.5 credibility score)
  - Academic researchers (95.0 score)
  - Startup CTOs (78.0 score)
  - Consultants (65.0 score)

- **6 Submissions** in various states:
  - Under Review (production AI systems)
  - Under Review (Kubernetes security workshop)
  - Passed Initial (AI interpretability keynote)
  - Failed Initial (HTML/CSS basics - too basic)
  - Analyzing (AWS cost optimization)
  - New (DevOps tools lightning talk)

- **2 Human Reviews** for top submissions
- **6 Notification Records** showing the communication trail
- **4 Review Tasks** in work queue

#### Integration Points

- **CRM.Account**: Link events to organizing companies
- **CRM.Contact**: Link speakers and reviewers to CRM contacts
- **External Systems**:
  - Typeform API for submission intake
  - Box.com API for file storage
  - Email service for notifications

#### Use Cases

##### Phase 1 (Implemented in Schema)

- Automated abstract submission processing
- AI-powered speaker research and credibility assessment
- Rubric-based AI evaluation and screening
- Human review workflow and task management
- Multi-stage notification system
- Resubmission handling

##### Phase 2 (Future Enhancements)

- Conflict detection and scheduling
- Session pairing and recommendations
- Diversity tracking and analytics
- Plagiarism checking
- Sentiment analysis of submissions
- Q&A generation from abstracts

##### Phase 3 (Advanced Features)

- Real-time reviewer collaboration
- Mobile review applications
- Speaker portal for status tracking
- AI-powered agenda building
- Sponsor matching based on topics
- Marketing content generation

## Schema Relationships

```
CRM Schema (Base)
├── Account
│   ├── AccountInsight (AccountID, CreatedByContactID)
│   └── Contact
│       ├── Activity (AccountID, ContactID)
│       └── Event (AccountID) [Events Schema]
│
├── CRM Schema 2 (Sales)
│   ├── Product
│   ├── Deal (AccountID, ContactID, OwnerID)
│   │   └── DealLineItem (DealID, ProductID)
│   └── Invoice (AccountID, ContactID, DealID)
│       ├── InvoiceLineItem (InvoiceID, ProductID)
│       └── Payment (InvoiceID)
│
└── Events Schema
    ├── Event (AccountID from CRM.Account)
    ├── Speaker (ContactID from CRM.Contact)
    ├── Submission (EventID)
    │   └── SubmissionSpeaker (SubmissionID, SpeakerID)
    ├── SubmissionReview (SubmissionID, ReviewerContactID from CRM.Contact)
    ├── SubmissionNotification (SubmissionID)
    └── EventReviewTask (EventID, SubmissionID, AssignedToContactID from CRM.Contact)
```

## Common Queries

### CRM Queries

```sql
-- Get all contacts for a specific account
SELECT c.*, a.Name AS AccountName
FROM CRM.Contact c
INNER JOIN CRM.Account a ON c.AccountID = a.ID
WHERE a.Name = 'Microsoft Corporation';

-- Find all activities for high-priority accounts
SELECT ac.*, a.Name AS AccountName, c.FullName AS ContactName
FROM CRM.Activity ac
INNER JOIN CRM.Account a ON ac.AccountID = a.ID
LEFT JOIN CRM.Contact c ON ac.ContactID = c.ID
WHERE ac.Priority = 'High'
ORDER BY ac.StartDate DESC;

-- List all deals in the pipeline with expected revenue
SELECT d.Name, a.Name AS AccountName, d.Stage, d.Amount, d.ExpectedRevenue, d.CloseDate
FROM CRM.Deal d
INNER JOIN CRM.Account a ON d.AccountID = a.ID
WHERE d.Stage NOT IN ('Closed Won', 'Closed Lost')
ORDER BY d.ExpectedRevenue DESC;

-- Get recent high-priority insights for an account
SELECT i.Title, i.InsightType, i.PublishedDate, i.Sentiment, i.Priority, i.Summary
FROM CRM.AccountInsight i
INNER JOIN CRM.Account a ON i.AccountID = a.ID
WHERE a.Name = 'Apple Inc.'
  AND i.IsArchived = 0
  AND i.Priority = 'High'
ORDER BY i.PublishedDate DESC;

-- Monitor news sentiment across all accounts
SELECT a.Name, a.TickerSymbol,
       COUNT(*) AS InsightCount,
       SUM(CASE WHEN i.Sentiment = 'Positive' THEN 1 ELSE 0 END) AS PositiveCount,
       SUM(CASE WHEN i.Sentiment = 'Negative' THEN 1 ELSE 0 END) AS NegativeCount,
       SUM(CASE WHEN i.Sentiment = 'Neutral' THEN 1 ELSE 0 END) AS NeutralCount
FROM CRM.Account a
INNER JOIN CRM.AccountInsight i ON a.ID = i.AccountID
WHERE i.CreatedAt >= DATEADD(DAY, -30, GETDATE())
  AND i.IsArchived = 0
GROUP BY a.Name, a.TickerSymbol
ORDER BY InsightCount DESC;

-- Find all SEC filings and financial reports for public companies
SELECT a.Name, a.TickerSymbol, i.InsightType, i.Title, i.PublishedDate, i.SourceURL
FROM CRM.AccountInsight i
INNER JOIN CRM.Account a ON i.AccountID = a.ID
WHERE i.InsightType IN ('SEC Filing', 'Financial Report', 'Earnings Call')
  AND a.TickerSymbol IS NOT NULL
ORDER BY i.PublishedDate DESC;

-- Get all public companies with executive contact information
SELECT a.Name, a.TickerSymbol, a.Exchange, a.EmployeeCount, a.Founded,
       c.FirstName + ' ' + c.LastName AS ExecutiveName, c.Title
FROM CRM.Account a
INNER JOIN CRM.Contact c ON a.ID = c.AccountID
WHERE a.TickerSymbol IS NOT NULL
  AND c.ContactType = 'Executive'
ORDER BY a.Name, c.Title;
```

### Events Queries

```sql
-- Get all submissions for an event with speaker info
SELECT s.SubmissionTitle, s.Status, s.AIEvaluationScore,
       sp.FullName AS SpeakerName, sp.Organization
FROM Events.Submission s
INNER JOIN Events.Event e ON s.EventID = e.ID
INNER JOIN Events.SubmissionSpeaker ss ON s.ID = ss.SubmissionID
INNER JOIN Events.Speaker sp ON ss.SpeakerID = sp.ID
WHERE e.Name = 'Tech Summit 2026'
ORDER BY s.AIEvaluationScore DESC;

-- Find submissions that passed screening with speaker credibility
SELECT s.SubmissionTitle, s.AIEvaluationScore, s.Status,
       sp.FullName, sp.CredibilityScore, sp.Organization
FROM Events.Submission s
INNER JOIN Events.SubmissionSpeaker ss ON s.ID = ss.SubmissionID
INNER JOIN Events.Speaker sp ON ss.SpeakerID = sp.ID
WHERE s.PassedInitialScreening = 1
ORDER BY s.AIEvaluationScore DESC, sp.CredibilityScore DESC;

-- Get review tasks pending for an event
SELECT t.Priority, s.SubmissionTitle, s.Status,
       c.FirstName + ' ' + c.LastName AS AssignedTo, t.DueDate
FROM Events.EventReviewTask t
INNER JOIN Events.Submission s ON t.SubmissionID = s.ID
LEFT JOIN CRM.Contact c ON t.AssignedToContactID = c.ID
WHERE t.Status = 'Pending'
ORDER BY t.Priority, t.DueDate;

-- Notification audit trail for a submission
SELECT n.NotificationType, n.SentAt, n.RecipientEmail, n.Subject, n.DeliveryStatus
FROM Events.SubmissionNotification n
INNER JOIN Events.Submission s ON n.SubmissionID = s.ID
WHERE s.SubmissionTitle LIKE '%AI%'
ORDER BY n.SentAt;
```

## Data Model Highlights

### Design Patterns Used

1. **UUID Primary Keys** (Events schema)
   - UNIQUEIDENTIFIER for globally unique identifiers
   - Enables distributed systems and merging
   - Better for public-facing IDs

2. **INT IDENTITY Primary Keys** (CRM schema)
   - Traditional auto-increment for performance
   - Smaller index sizes
   - Sequential for better clustering

3. **Computed Columns**
   - `Contact.FullName` in CRM
   - `Deal.ExpectedRevenue` in Sales
   - `Invoice.Total`, `Invoice.TotalWithTax` in Invoicing

4. **Self-Referencing Relationships**
   - `Contact.ReportsToID` for org charts
   - `Event.ParentID` for event hierarchies
   - `Submission.ResubmissionOfID` for resubmission tracking

5. **CHECK Constraints**
   - Enforce enum-like values (Status, Type fields)
   - Validate numeric ranges (scores, probabilities)
   - Ensure data integrity at database level

6. **Comprehensive Documentation**
   - Extended properties on every table and column
   - Explains purpose, format, constraints
   - Supports auto-generated documentation tools

## MemberJunction Integration

### CodeGen Compatibility

These schemas are designed to work seamlessly with MemberJunction's CodeGen system:

1. **Auto-Generated Entities**: CodeGen will create strongly-typed TypeScript classes for each table
2. **Zod Schemas**: Validation schemas generated from CHECK constraints
3. **Database Views**: Generated with proper joins and computed fields
4. **CRUD Operations**: Stored procedures created automatically
5. **Angular Forms**: UI components generated from metadata

### Metadata-Driven Features

- Entity fields automatically discovered
- Foreign key relationships mapped to TypeScript navigation properties
- Check constraints converted to dropdown lists in UI
- Extended properties used for field descriptions in forms
- Computed columns marked as read-only

### Usage in Applications

```typescript
// Example: Load events with submissions
const md = new Metadata();
const eventEntity = await md.GetEntityObject<EventEntity>('Event', contextUser);
await eventEntity.Load(eventId);

// Navigate relationships
const submissions = await eventEntity.GetSubmissions();
for (const submission of submissions) {
    console.log(`${submission.SubmissionTitle}: ${submission.AIEvaluationScore}`);
}
```

## Best Practices

### When Using Demo Schemas

1. **Reset Data Between Tests**: Use transactions or restore from clean backup
2. **Understand Relationships**: Study the foreign keys before modifying data
3. **Respect Constraints**: CHECK constraints enforce business rules
4. **Use Extended Properties**: Read column descriptions for data format expectations
5. **Follow Patterns**: Use the same naming and structure conventions for extensions

### Extension Guidelines

When adding to these schemas:

1. **Match Naming Conventions**: Use PascalCase for tables/columns, lowercase for schema names
2. **Add Extended Properties**: Document every new table and column
3. **Use Appropriate Keys**: UUID for Events schema, INT IDENTITY for CRM schema
4. **Add CHECK Constraints**: Enforce business rules at database level
5. **Consider CodeGen**: New tables should work with MemberJunction CodeGen

## Support and Documentation

- **MemberJunction Docs**: https://docs.memberjunction.org
- **GitHub Repository**: https://github.com/MemberJunction/MJ
- **Issues/Questions**: https://github.com/MemberJunction/MJ/issues

## License

These demo schemas are part of the MemberJunction project and follow the same licensing as the main repository.

---

**Note**: The sample data in these schemas is for demonstration purposes only. Company information is based on publicly available data and may not reflect current figures. Use appropriate licensing and permissions when using this data in production systems.
