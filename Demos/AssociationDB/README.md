# Association Sample Database for MemberJunction

A comprehensive, realistic sample database demonstrating a complete association management system with membership, events, learning, finance, marketing, email, chapters, and governance capabilities.

## 📋 Overview

This sample database provides a fully functional, data-rich environment for testing and demonstrating MemberJunction capabilities in an association/membership organization context. It includes:

- **Single Consolidated Schema**: All tables in the AssociationDemo schema with logical domain organization
- **8 Business Domains**: Membership, Events, Learning, Finance, Marketing, Email, Chapters, and Governance (organized as table prefixes)
- **Realistic Sample Data**: High-quality, semantically meaningful data generated for testing
- **Evergreen Dates**: All dates are calculated relative to execution time, keeping data fresh
- **Complete Relationships**: Full referential integrity across all tables
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

**Option 1: Automated Installation (Recommended)**

1. **Copy the installation script template**:
   ```bash
   cp install.sh.template install.sh
   ```

2. **Edit install.sh with your database credentials**:
   - Update server name, database name, username, and password

3. **Run the installer**:
   ```bash
   ./install.sh
   ```

   This will:
   - Generate the combined SQL file (in `tmp/combined_build.sql`)
   - Execute it against your database
   - Save output to `tmp/build_output.txt`

**Option 2: Manual Installation via SQLCMD Mode**

If you prefer to run via SSMS or want more control:

1. **From SSMS (enable SQLCMD Mode: Query → SQLCMD Mode)**:
   ```sql
   USE YourMJDatabase;
   GO
   :r MASTER_BUILD_AssociationDB.sql
   ```

2. **From command line**:
   ```bash
   sqlcmd -S localhost -d YourMJDatabase -i MASTER_BUILD_AssociationDB.sql
   ```

**Verify Installation**:
```sql
-- Check record counts
SELECT 'Members' as Entity, COUNT(*) as Count FROM AssociationDemo.Member
UNION ALL
SELECT 'Events', COUNT(*) FROM AssociationDemo.Event
UNION ALL
SELECT 'Courses', COUNT(*) FROM AssociationDemo.Course
UNION ALL
SELECT 'Campaigns', COUNT(*) FROM AssociationDemo.Campaign;
```

**Run CodeGen** (if using MemberJunction framework):
```bash
npm run codegen
```

## 📁 Project Structure

```
AssociationDB/
├── README.md                              # This file
├── install.sh.template                    # Installation script template (copy and configure)
├── prepare_build.sh                       # Generates combined SQL file
├── MASTER_BUILD_AssociationDB.sql         # Alternative SQLCMD entry point
│
├── schema/                                # Schema definition files (consolidated in AssociationDemo)
│   ├── V001__create_schema.sql           # Creates AssociationDemo schema
│   ├── V002__create_tables.sql           # All 27 tables consolidated
│   └── V003__table_documentation.sql     # Extended properties for documentation
│
├── data/                                  # Sample data population files
│   ├── 00_parameters.sql                 # Date parameters and UUID declarations
│   ├── 01_membership_data.sql            # 500 members, 40 orgs, memberships
│   ├── 02_events_data.sql                # 35 events, sessions, 1400+ registrations
│   ├── 03_learning_data.sql              # 60 courses, 900 enrollments, certificates
│   ├── 04_finance_data.sql               # Invoices, payments for all transactions
│   ├── 05_marketing_email_data.sql       # Campaigns, segments, email sends
│   └── 06_chapters_governance_data.sql   # Chapters, committees, board data
│
├── tmp/                                   # Generated files (gitignored)
│   ├── combined_build.sql                # Generated during installation
│   └── build_output.txt                  # Execution output
│
└── docs/                                  # Documentation
    ├── SCHEMA_OVERVIEW.md                # Detailed schema documentation
    ├── SAMPLE_QUERIES.md                 # Example queries for common scenarios
    └── BUSINESS_SCENARIOS.md             # Member journey documentation
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

## 🔗 Table Organization

The database consolidates all tables in a single AssociationDemo schema with logical domain organization through table naming:

```
Member/Organization tables (Membership domain - foundation)
     ↑
     ├→ Event, EventSession, EventRegistration (Events domain)
     ├→ Course, Enrollment, Certificate (Learning domain)
     ├→ Invoice, LineItem, Payment (Finance domain)
     ├→ Campaign, Segment, CampaignMember (Marketing domain)
     ├→ EmailTemplate, EmailSend (Email domain)
     ├→ Chapter, ChapterMembership (Chapters domain)
     └→ Committee, BoardPosition, Assignment (Governance domain)
```

All foreign keys are properly defined with referential integrity constraints. Domain organization is logical (via naming and grouping) rather than schema-based.

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

## 📝 Database Documentation

This sample database uses SQL Server Extended Properties for comprehensive database documentation. All schemas, tables, and columns include descriptive metadata accessible through SQL Server's metadata views.

### Documentation Architecture

The documentation is **separated from schema definitions** to support:
- **Testing auto-documentation tools** by installing schema without docs
- **Faster schema-only installations** when documentation isn't needed
- **Easy comparison** between auto-generated and manual documentation

Schema files contain only:
- CREATE TABLE statements
- Constraints and foreign keys
- Indexes
- PRINT statements

Documentation files contain:
- Extended properties for schemas (`V001__schemas_documentation.sql`)
- Extended properties for tables and columns (`V00X__*_documentation.sql`)

### Accessing Documentation

Query extended properties to see documentation:

```sql
-- View schema descriptions
SELECT
    s.name AS SchemaName,
    ep.value AS Description
FROM sys.schemas s
LEFT JOIN sys.extended_properties ep
    ON ep.major_id = s.schema_id
    AND ep.class = 3
WHERE s.name = 'AssociationDemo'
ORDER BY s.name;

-- View table and column descriptions
SELECT
    SCHEMA_NAME(t.schema_id) AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ep.value AS Description
FROM sys.tables t
INNER JOIN sys.columns c ON t.object_id = c.object_id
LEFT JOIN sys.extended_properties ep
    ON ep.major_id = c.object_id
    AND ep.minor_id = c.column_id
    AND ep.name = 'MS_Description'
WHERE SCHEMA_NAME(t.schema_id) = 'AssociationDemo'
ORDER BY SchemaName, TableName, c.column_id;
```

### Installing Without Documentation

To test auto-documentation tools, install the database without extended properties:

```sql
:setvar INCLUDE_DOCUMENTATION 0
USE YourMJDatabase;
GO
:r MASTER_BUILD_AssociationDB.sql
```

Then run your auto-documentation tool and compare results against the `*_documentation.sql` files.

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
FROM AssociationDemo.Member m
    JOIN AssociationDemo.Membership ms ON m.ID = ms.MemberID
    JOIN AssociationDemo.MembershipType mt ON ms.MembershipTypeID = mt.ID
    LEFT JOIN AssociationDemo.EventRegistration er ON m.ID = er.MemberID AND er.Status = 'Attended'
    LEFT JOIN AssociationDemo.Enrollment e ON m.ID = e.MemberID AND e.Status = 'Completed'
    LEFT JOIN AssociationDemo.Invoice inv ON m.ID = inv.MemberID
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
FROM AssociationDemo.Event e
    JOIN AssociationDemo.EventRegistration er ON e.ID = er.EventID
    JOIN AssociationDemo.Invoice inv ON inv.RelatedEntityID = er.ID
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
