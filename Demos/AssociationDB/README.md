# Cheese Industry Association Sample Database

A comprehensive, production-ready demonstration database for the **American Cheese Association** - showcasing a complete association management system built for MemberJunction with 58 tables spanning membership management, events, learning, finance, marketing, community forums, certifications, products & competitions, and legislative tracking.

## 🎯 Overview

This sample database represents a realistic **cheese industry trade association** managing:
- 2,000 artisan cheesemakers, retailers, suppliers, and dairy producers
- Comprehensive member lifecycle from onboarding through renewal
- Multi-track conferences, workshops, and educational events
- Professional certification programs (ACS, WCMA, IDFA)
- Cheese competition judging and award tracking
- Federal and state legislative advocacy
- Community forums and knowledge sharing
- Resource libraries and best practices

### Why Cheese Industry?

The cheese industry provides an ideal demonstration context because it combines:
- **B2B and B2C dynamics**: Producers, retailers, suppliers, and distributors
- **Regulatory complexity**: FDA regulations, raw milk laws, labeling requirements
- **Professional development**: Master Cheesemaker certifications, safety training
- **Competitions and awards**: Industry recognition through judging
- **Advocacy needs**: Trade policy, food safety regulations, environmental standards
- **Geographic diversity**: Regional chapters across dairy-producing states

## 📊 Database Statistics

### Data Volume

| Domain | Tables | Key Records |
|--------|--------|-------------|
| **Core Membership** | 4 | 2,000 members, 40 organizations, 8 membership types |
| **Events & Conferences** | 3 | 21 events, 85 sessions, 1,400+ registrations |
| **Learning & Education** | 3 | 60 courses, 900 enrollments, 650+ certificates |
| **Financial Operations** | 3 | Invoices, line items, payments (auto-generated) |
| **Marketing & Campaigns** | 3 | 45 campaigns, 80 segments, targeted outreach |
| **Email Communications** | 3 | 30 templates, thousands of sends, engagement tracking |
| **Chapters & Geographic** | 3 | 15 chapters, 275+ members, 45 officers |
| **Governance** | 4 | 12 committees, 9 board positions, assignments |
| **Community Forums** | 8 | 50 threads, 200+ posts, moderation, reactions |
| **Resource Library** | 6 | 100 resources, categories, downloads, bookmarks |
| **Certifications** | 6 | 413 certifications, 85 CE records, renewals |
| **Products & Awards** | 6 | 110 cheese products, 5 competitions, 29 judges |
| **Legislative Tracking** | 6 | 12 legislative issues, 7 policy positions, 150 advocacy actions |

**Total**: 58 tables | 10,000+ records with complete referential integrity

## 🚀 Quick Start

### Prerequisites

- SQL Server 2016 or later (Express, Standard, or Enterprise)
- MemberJunction framework installed
- `sqlcmd` command-line utility
- Bash shell (macOS/Linux/WSL)

### Installation

**Automated Installation (Recommended)**

1. **Create environment file**:
   ```bash
   cp .env.template .env
   ```

2. **Edit `.env` with your database credentials**:
   ```bash
   DB_SERVER=localhost
   DB_NAME=AssociationDB2  # Your MJ database name
   DB_USER=sa
   DB_PASSWORD=your_password_here
   ```

3. **Run the installer**:
   ```bash
   ./install.sh
   ```

   Skip documentation (faster):
   ```bash
   ./install.sh --skip-docs
   ```

### Verification

After installation, verify the data:

```sql
SELECT 'Members' as Entity, COUNT(*) as Count FROM AssociationDemo.Member
UNION ALL SELECT 'Events', COUNT(*) FROM AssociationDemo.Event
UNION ALL SELECT 'Courses', COUNT(*) FROM AssociationDemo.Course
UNION ALL SELECT 'Forum Threads', COUNT(*) FROM AssociationDemo.ForumThread
UNION ALL SELECT 'Resources', COUNT(*) FROM AssociationDemo.Resource
UNION ALL SELECT 'Certifications', COUNT(*) FROM AssociationDemo.Certification
UNION ALL SELECT 'Products', COUNT(*) FROM AssociationDemo.Product
UNION ALL SELECT 'Legislative Issues', COUNT(*) FROM AssociationDemo.LegislativeIssue;
```

Expected output: 2000 members, 21 events, 60 courses, 50 threads, 100 resources, 413 certifications, 110 products, 12 legislative issues

### Run MemberJunction CodeGen

```bash
npm run codegen
```

## 📁 Project Structure

```
AssociationDB/
├── schema/                                # DDL files (versioned migrations)
│   ├── V001__create_schema.sql           # Create AssociationDemo schema
│   ├── V002__create_tables.sql           # Core 26 tables
│   ├── V003__table_documentation.sql     # Extended properties
│   ├── V004__create_community_tables.sql # Phase 1: Forums (8 tables)
│   ├── V005__create_resource_library_tables.sql  # Phase 2: Resources (6 tables)
│   ├── V006__create_certification_tables.sql     # Phase 3: Certifications (6 tables)
│   ├── V007__create_product_showcase_tables.sql  # Phase 4: Products/Awards (6 tables)
│   └── V008__create_legislative_tracking_tables.sql # Phase 5: Legislative (6 tables)
│
├── data/                                  # Sample data population
│   ├── 00_parameters.sql                 # Date anchors and UUIDs
│   ├── 01_membership_data.sql            # 2000 members, organizations
│   ├── 02_events_data.sql                # Events, sessions, registrations
│   ├── 03_learning_data.sql              # Courses, enrollments, certificates
│   ├── 04_finance_data.sql               # Invoices, payments
│   ├── 05_marketing_email_data.sql       # Campaigns, segments, emails
│   ├── 06_chapters_governance_data.sql   # Chapters, committees, boards
│   ├── 07_community_forum_data.sql       # Forum posts and discussions
│   ├── 08_resource_library_data.sql      # Knowledge base resources
│   ├── 09_certification_data.sql         # Professional certifications
│   ├── 10_product_showcase_data.sql      # Products and competitions
│   └── 11_legislative_tracking_data.sql  # Legislative issues and advocacy
│
└── docs/                                  # Comprehensive documentation
    ├── SCHEMA_OVERVIEW.md                # Complete schema reference with ERDs
    ├── SAMPLE_QUERIES.md                 # SQL queries for all domains
    └── BUSINESS_SCENARIOS.md             # Member journeys and workflows
```

## 🗓️ Evergreen Date System

All dates are **dynamically calculated** relative to execution time:

```sql
DECLARE @EndDate DATE = GETDATE();           -- Today
DECLARE @StartDate DATE = DATEADD(YEAR, -5, @EndDate);  -- 5 years ago
```

Run this script in any year and data appears current. No manual date updates required.

## 🎓 Key Features

### 1. Realistic Industry Data

- **40 Organizations**: Artisan cheesemakers, dairy producers, retailers, suppliers
- **2,000 Members**: Cheesemakers, buyers, QA managers, sales professionals
- **Membership Status**: 80% Active, 15% Lapsed, 5% Cancelled

### 2. Complete Event Lifecycle

- Annual conferences (5 years of history)
- Multi-track sessions with CEU credits
- Registration types and pricing tiers
- Attendance tracking and check-in
- Automatic invoicing and payments

### 3. Professional Development

- Course categories: Cheese Making, Food Safety, Sensory Evaluation, Business
- Certification programs: ACS, WCMA, ADSA
- Continuing education tracking
- Renewal management

### 4. Legislative Advocacy

- Federal and state legislative bodies
- Key issues: Raw milk regulations, labeling, pricing, trade, environmental
- Policy positions and rationale
- Government contact database
- Member advocacy action tracking

### 5. Product Showcase & Competitions

- Major competitions: ACS, World Championship, International
- Product catalog with specifications
- Judge assignment (29 judges across 11 organizations)
- Scoring and awards tracking

### 6. Community & Knowledge Sharing

- Specialized forums (5 categories)
- Resource library (100+ items)
- Moderation and reactions
- Download and bookmark tracking

## 📚 Documentation

Comprehensive documentation in the `docs/` folder:

- **[Schema Overview](docs/SCHEMA_OVERVIEW.md)**: Complete ERDs, table/column documentation, relationships
- **[Sample Queries](docs/SAMPLE_QUERIES.md)**: Analytics queries for all domains
- **[Business Scenarios](docs/BUSINESS_SCENARIOS.md)**: Member journeys and workflows

## 🔧 Customization

### Adjust Data Volumes

```sql
-- In data files, change TOP value
SELECT TOP 500  -- Generate fewer members
```

### Modify Date Ranges

```sql
-- In 00_parameters.sql
DECLARE @StartDate DATE = DATEADD(YEAR, -10, @EndDate);  -- 10 years instead of 5
```

## 🎯 Use Cases

- **Development**: Test MJ CodeGen, develop reports, build integrations
- **Demonstrations**: Show complete association management to prospects
- **QA**: Validate performance, migrations, integrity
- **Training**: Onboard developers with realistic data

## 🤝 Contributing

Submit feedback and enhancement ideas through MemberJunction channels.

## 📄 License

Part of the MemberJunction framework. See main repository for licensing.

---

**Note**: This is sample/demonstration data for a fictional cheese industry association. Member names and organizations are procedurally generated.

**Version**: 2.0.0 | **Tables**: 58 | **Records**: 10,000+
