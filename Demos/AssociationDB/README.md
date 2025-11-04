# Association Sample Database for MemberJunction

A comprehensive, realistic sample database demonstrating a complete association management system with membership, events, learning, finance, marketing, email, chapters, and governance capabilities.

## 📋 Overview

This sample database provides a fully functional, data-rich environment for testing and demonstrating MemberJunction capabilities in an association/membership organization context. It includes:

- **8 Business Domains**: Membership, Events, Learning, Finance, Marketing, Email, Chapters, and Governance
- **Realistic Sample Data**: High-quality, semantically meaningful data generated for testing
- **Evergreen Dates**: All dates are calculated relative to execution time, keeping data fresh
- **Complete Relationships**: Full referential integrity across all schemas
- **Ready for CodeGen**: Designed to work seamlessly with MemberJunction's code generation system

## 🎯 What's Included

### Data Volumes

| Domain | Entities | Sample Data |
|--------|----------|-------------|
| **Membership** | Organizations, Members, Memberships, Membership Types | 40 organizations, 500 members, 625 membership records, 8 types |
| **Events** | Events, Sessions, Registrations | 35 events, 85 sessions, 1,400+ registrations |
| **Learning** | Courses, Enrollments, Certificates | 60 courses, 900 enrollments, 650+ certificates |
| **Finance** | Invoices, Line Items, Payments | Programmatically generated based on memberships/events/courses |
| **Marketing** | Campaigns, Segments, Campaign Members | 45 campaigns, 80 segments, comprehensive membership tracking |
| **Email** | Templates, Sends, Opens, Clicks | 30 templates, programmatic send/engagement data |
| **Chapters** | Chapters, Memberships, Officers | 15 chapters, 275+ members, 45 officers |
| **Governance** | Committees, Board Positions, Members | 12 committees, 9 board positions, committee/board assignments |

### Business Scenarios Covered

- **Member Lifecycle**: Registration → Engagement → Renewal → Retention
- **Event Management**: Conference planning → Registration → Attendance → CEU tracking
- **Learning Paths**: Course enrollment → Progress tracking → Certification → Continuing education
- **Financial Operations**: Invoicing → Payment processing → Revenue tracking
- **Marketing Campaigns**: Segmentation → Campaign execution → Email engagement → Conversion
- **Chapter Operations**: Geographic/interest-based groups → Local leadership → Activities
- **Governance**: Committee work → Board operations → Organizational leadership

## 🚀 Quick Start

### Prerequisites

- SQL Server 2016 or later (Express, Standard, or Enterprise)
- MemberJunction framework installed
- SQL Server Management Studio (SSMS) or Azure Data Studio

### Installation Steps

1. **Ensure clean database**:
   ```sql
   -- Create new database or use existing MemberJunction database
   -- The schema files use conditional creation (IF NOT EXISTS)
   ```

2. **Run the master build script**:
   ```sql
   -- Option 1: Run from SSMS
   :setvar DatabaseName "YourMJDatabase"
   USE [$(DatabaseName)];
   GO
   :r MASTER_BUILD_AssociationDB.sql

   -- Option 2: Run via sqlcmd
   sqlcmd -S localhost -d YourMJDatabase -i MASTER_BUILD_AssociationDB.sql
   ```

3. **Verify the installation**:
   ```sql
   -- Check record counts
   SELECT 'Members' as Entity, COUNT(*) as Count FROM membership.Member
   UNION ALL
   SELECT 'Events', COUNT(*) FROM events.Event
   UNION ALL
   SELECT 'Courses', COUNT(*) FROM learning.Course
   UNION ALL
   SELECT 'Campaigns', COUNT(*) FROM marketing.Campaign;
   ```

4. **Run MemberJunction CodeGen** (if applicable):
   ```bash
   # Generate entity classes and database objects
   npm run codegen
   ```

## 📁 Project Structure

```
AssociationDB/
├── README.md                          # This file
├── MASTER_BUILD_AssociationDB.sql     # Master build script (runs everything)
│
├── schema/                            # Schema definition files
│   ├── V001__create_schemas.sql      # Creates 8 schemas
│   ├── V002__membership_tables.sql   # Membership domain tables
│   ├── V003__events_tables.sql       # Events domain tables
│   ├── V004__learning_tables.sql     # Learning/LMS domain tables
│   ├── V005__finance_tables.sql      # Finance domain tables
│   ├── V006__marketing_tables.sql    # Marketing domain tables
│   ├── V007__email_tables.sql        # Email/communications tables
│   ├── V008__chapters_tables.sql     # Chapters domain tables
│   └── V009__governance_tables.sql   # Governance domain tables
│
├── data/                              # Sample data population files
│   ├── 00_parameters.sql             # Date parameters and UUID declarations
│   ├── 01_membership_data.sql        # 500 members, 40 orgs, memberships
│   ├── 02_events_data.sql            # 35 events, sessions, 1400+ registrations
│   ├── 03_learning_data.sql          # 60 courses, 900 enrollments, certificates
│   ├── 04_finance_data.sql           # Invoices, payments for all transactions
│   ├── 05_marketing_email_data.sql   # Campaigns, segments, email sends
│   └── 06_chapters_governance_data.sql # Chapters, committees, board data
│
└── docs/                              # Documentation
    ├── SCHEMA_OVERVIEW.md            # Detailed schema documentation
    ├── SAMPLE_QUERIES.md             # Example queries for common scenarios
    └── BUSINESS_SCENARIOS.md         # Member journey documentation
```

## 🗓️ Evergreen Date System

All dates in this sample database are **relative to execution time**, making the data "evergreen" - you can run this script years from now and the data will still appear current.

**How it works**:
- `@EndDate` is set to current date (`GETDATE()`)
- `@StartDate` is 5 years before `@EndDate`
- All data dates are calculated using `DATEADD()` functions relative to these anchors

**Example**:
```sql
-- Member joined 4 years ago (relative to today)
JoinDate = DATEADD(DAY, -1460, @EndDate)

-- Event happened 90 days ago
StartDate = DATEADD(DAY, -90, @EndDate)
```

This ensures:
- Data always appears within the last 5 years
- Relationships maintain proper temporal ordering
- Reports and queries return meaningful results regardless of when the script runs

## 🔗 Schema Relationships

The database implements a multi-schema architecture with clear domain boundaries:

```
membership.*        ← Core member and organization data (foundation)
     ↑
     ├→ events.*               (Event registrations reference members)
     ├→ learning.*             (Course enrollments reference members)
     ├→ finance.*              (Invoices reference members)
     ├→ marketing.*            (Campaign members reference members)
     ├→ email.*                (Email sends reference members)
     ├→ chapters.*             (Chapter memberships reference members)
     └→ governance.*           (Committee/board assignments reference members)
```

All foreign keys are properly defined with referential integrity constraints.

## 🎓 Use Cases

### For Development
- Test MemberJunction entity generation
- Develop reports and dashboards
- Build integrations with realistic data
- Test data access patterns and performance

### For Demonstration
- Show prospective clients realistic association management
- Demonstrate member lifecycle capabilities
- Illustrate multi-domain data relationships
- Showcase reporting and analytics potential

### For Testing
- Validate query performance at scale
- Test data migrations and transformations
- Verify security and access control
- Ensure referential integrity across domains

## 📚 Documentation

- **[Schema Overview](docs/SCHEMA_OVERVIEW.md)**: Detailed documentation of all tables, columns, and relationships
- **[Sample Queries](docs/SAMPLE_QUERIES.md)**: Common queries for reports, analytics, and data exploration
- **[Business Scenarios](docs/BUSINESS_SCENARIOS.md)**: Member journey examples and use case walkthroughs

## ⚙️ Customization

### Adjusting Data Volumes

Edit the data generation files in `/data` to change record counts:

```sql
-- In 01_membership_data.sql
SELECT TOP 485  -- Change this number to generate more/fewer members
    NEWID(),
    ...
```

### Modifying Date Ranges

Edit `00_parameters.sql`:

```sql
-- Change the time window (currently 5 years)
DECLARE @StartDate DATE = DATEADD(YEAR, -10, @EndDate);  -- 10 years instead
```

### Adding New Data

Follow the established patterns in data files:
1. Use declared UUIDs from `00_parameters.sql` for cross-references
2. Use `DATEADD()` functions for all dates
3. Use programmatic generation (CROSS JOIN, ORDER BY NEWID()) for volume
4. Include realistic distributions (80/15/5 Active/Expired/Cancelled, etc.)

## 🔍 Sample Queries

### Member Engagement Summary
```sql
SELECT
    m.FirstName + ' ' + m.LastName as MemberName,
    mt.Name as MembershipType,
    COUNT(DISTINCT er.ID) as EventsAttended,
    COUNT(DISTINCT e.ID) as CoursesCompleted,
    COALESCE(SUM(inv.Total), 0) as TotalSpent
FROM membership.Member m
    JOIN membership.Membership ms ON m.ID = ms.MemberID
    JOIN membership.MembershipType mt ON ms.MembershipTypeID = mt.ID
    LEFT JOIN events.EventRegistration er ON m.ID = er.MemberID AND er.Status = 'Attended'
    LEFT JOIN learning.Enrollment e ON m.ID = e.MemberID AND e.Status = 'Completed'
    LEFT JOIN finance.Invoice inv ON m.ID = inv.MemberID
WHERE ms.Status = 'Active'
GROUP BY m.FirstName, m.LastName, mt.Name
ORDER BY TotalSpent DESC;
```

### Event Revenue Analysis
```sql
SELECT
    e.Name,
    e.EventType,
    COUNT(DISTINCT er.ID) as Registrations,
    SUM(inv.Total) as Revenue,
    AVG(inv.Total) as AvgTicketPrice
FROM events.Event e
    JOIN events.EventRegistration er ON e.ID = er.EventID
    JOIN finance.Invoice inv ON inv.RelatedEntityID = er.ID
WHERE inv.Status IN ('Paid', 'Partial')
GROUP BY e.Name, e.EventType
ORDER BY Revenue DESC;
```

See [SAMPLE_QUERIES.md](docs/SAMPLE_QUERIES.md) for more examples.

## 🤝 Contributing

This is a demonstration database for MemberJunction. To suggest improvements:

1. Test the data thoroughly
2. Document any issues or enhancement ideas
3. Submit feedback through appropriate MemberJunction channels

## 📄 License

Part of the MemberJunction framework. See main repository for licensing information.

## 🆘 Support

For questions or issues:
- MemberJunction Documentation: [Link to MJ docs]
- GitHub Issues: [Link to MJ repository]
- Community Forum: [Link to community]

---

**Note**: This is sample/demonstration data only. Do not use in production environments without proper review and customization for your specific needs.
