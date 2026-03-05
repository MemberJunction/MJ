# Integration Engine Mock Data

A single `mock_data` SQL Server database with per-source schemas that replaces real SaaS API calls during Integration Engine development and testing.

## Database: `mock_data`

| Schema | Purpose | Tables |
|--------|---------|--------|
| **hs** | Simulates HubSpot CRM data | `contacts` (50), `companies` (20), `deals` (30) |
| **sf** | Simulates Salesforce CRM data | `Contact` (50), `Account` (20), `Opportunity` (30) |
| **ym** | Simulates YourMembership AMS data | `members` (50), `membership_types` (5), `events` (10), `event_registrations` (40) |

## Setup

Execute the unified SQL file against your SQL Server instance:

```bash
sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -i create_mock_data.sql
```

The script is idempotent -- it drops and recreates the database on each run.

## Verification

```sql
SELECT 'hs.contacts' as tbl, COUNT(*) as cnt FROM hs.contacts UNION ALL
SELECT 'hs.companies', COUNT(*) FROM hs.companies UNION ALL
SELECT 'hs.deals', COUNT(*) FROM hs.deals UNION ALL
SELECT 'sf.Contact', COUNT(*) FROM sf.Contact UNION ALL
SELECT 'sf.Account', COUNT(*) FROM sf.Account UNION ALL
SELECT 'sf.Opportunity', COUNT(*) FROM sf.Opportunity UNION ALL
SELECT 'ym.members', COUNT(*) FROM ym.members UNION ALL
SELECT 'ym.membership_types', COUNT(*) FROM ym.membership_types UNION ALL
SELECT 'ym.events', COUNT(*) FROM ym.events UNION ALL
SELECT 'ym.event_registrations', COUNT(*) FROM ym.event_registrations
ORDER BY tbl;
```

## Connector Configuration

Each connector reads from the `mock_data` database using a schema prefix. Configuration JSON example:

```json
{
  "server": "sql-claude",
  "database": "mock_data",
  "schema": "hs",
  "user": "sa",
  "password": "Claude2Sql99"
}
```

## Data Quality

- Realistic US names, emails, phone numbers, cities, and states
- All foreign keys resolve (zero orphan records)
- Unique email addresses within each schema
- Varied industries, deal stages, lifecycle stages, and membership levels
- HubSpot uses `lastmodifieddate` for incremental sync
- Salesforce uses `LastModifiedDate` for incremental sync
- YourMembership uses `updated_at` for incremental sync

## Legacy Files

The `MockHubSpot.sql`, `MockSalesforce.sql`, and `MockYourMembership.sql` files are the original separate-database approach. Use `create_mock_data.sql` instead.
