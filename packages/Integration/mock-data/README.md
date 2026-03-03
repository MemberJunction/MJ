# Integration Engine Mock Databases

Three SQL Server mock databases that replace real SaaS API calls during Integration Engine development and testing.

## Databases

| Database | Purpose | Tables |
|----------|---------|--------|
| **MockHubSpot** | Simulates HubSpot CRM data | `hs_Owners` (20), `hs_Companies` (100), `hs_Contacts` (300), `hs_Deals` (150) |
| **MockSalesforce** | Simulates Salesforce CRM data | `sf_User` (20), `sf_Account` (100), `sf_Contact` (300), `sf_Opportunity` (150) |
| **MockYourMembership** | Simulates YourMembership AMS data | `ym_Chapters` (15), `ym_MembershipLevels` (10), `ym_Members` (300), `ym_Events` (50), `ym_EventRegistrations` (200) |

## Setup

Execute each SQL file against your SQL Server instance:

```bash
sqlcmd -S <server> -U sa -P '<password>' -C -i MockHubSpot.sql
sqlcmd -S <server> -U sa -P '<password>' -C -i MockSalesforce.sql
sqlcmd -S <server> -U sa -P '<password>' -C -i MockYourMembership.sql
```

Scripts are idempotent -- they drop and recreate databases on each run.

## Verification

Each database has a `sp_MockDataSummary` stored procedure that returns table names and row counts:

```sql
EXEC MockHubSpot.dbo.sp_MockDataSummary;
EXEC MockSalesforce.dbo.sp_MockDataSummary;
EXEC MockYourMembership.dbo.sp_MockDataSummary;
```

## Data Quality

- Realistic US names, emails, phone numbers, cities, and states
- Dollar amounts range from $500 to $250,000 (deals/opportunities)
- Dates spread across 2023-01-01 to 2025-12-31
- All foreign keys resolve (zero orphan records)
- Unique email addresses within each database
- Varied industries, deal stages, lifecycle stages, and membership levels
