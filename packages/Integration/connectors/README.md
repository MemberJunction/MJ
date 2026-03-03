# @memberjunction/integration-connectors

Concrete integration connectors for the MemberJunction Integration Engine. This package provides four connectors that implement `BaseIntegrationConnector` from `@memberjunction/integration-engine`.

## Connectors

### RelationalDBConnector (Base Class)

Abstract base class for connectors that read from SQL Server databases via the `mssql` package. Provides shared logic for connection management, object/field discovery, and batched record fetching with watermark support.

**Configuration JSON:**
```json
{
  "server": "your-sql-server",
  "database": "YourDatabase",
  "user": "username",
  "password": "password"
}
```

**Shared capabilities:**
- `TestConnection` — runs `SELECT @@VERSION` to verify connectivity
- `DiscoverObjects` — queries `INFORMATION_SCHEMA.TABLES` for all base tables
- `DiscoverFields` — queries `INFORMATION_SCHEMA.COLUMNS` for a given table
- `FetchChangesFromTable` — parameterized incremental fetch with watermark filtering and batch limiting
- Connection pool caching per server+database pair

### HubSpotConnector

Reads from MockHubSpot database tables: `hs_Contacts`, `hs_Companies`, `hs_Deals`, `hs_Owners`.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')`

**Default field mappings:**
| Source Object | Target Entity | Mappings |
|---|---|---|
| `hs_Contacts` | Contacts | email→Email (key), firstname→FirstName, lastname→LastName, phone→Phone, company→CompanyName, lifecyclestage→Status |
| `hs_Companies` | Companies | name→Name (key), domain→Website, industry→Industry, city→City, state→State |
| `hs_Deals` | — | No default mappings |

**To swap for real HubSpot API:** Replace `RelationalDBConnector` with direct HTTP calls to the HubSpot V3 API. The `FetchChanges` method would use the HubSpot Search API with `lastmodifieddate` filters, and `Configuration` would store an API key or OAuth tokens instead of database credentials.

### SalesforceConnector

Reads from MockSalesforce database tables: `sf_Contact`, `sf_Account`, `sf_Opportunity`, `sf_User`.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'SalesforceConnector')`

**Default field mappings:**
| Source Object | Target Entity | Mappings |
|---|---|---|
| `sf_Contact` | Contacts | Email→Email (key), FirstName→FirstName, LastName→LastName, Phone→Phone, Title→Title, Department→Department |
| `sf_Account` | Companies | Name→Name (key), Industry→Industry, BillingCity→City, BillingState→State, Phone→Phone |

**To swap for real Salesforce API:** Replace `RelationalDBConnector` with `jsforce` or direct REST calls to the Salesforce SOQL API. Use `SystemModstamp` for watermarks and the Salesforce Bulk API for large datasets.

### YourMembershipConnector

Reads from MockYourMembership database tables: `ym_Members`, `ym_Events`, `ym_EventRegistrations`, `ym_Chapters`, `ym_MembershipLevels`.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')`

**Default field mappings:**
| Source Object | Target Entity | Mappings |
|---|---|---|
| `ym_Members` | Contacts | email→Email (key), first_name→FirstName, last_name→LastName, phone→Phone, status→Status |

### FileFeedConnector

Reads data from local CSV files. Always performs a full load (no incremental sync support).

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'FileFeedConnector')`

**Configuration JSON:**
```json
{
  "storagePath": "/absolute/path/to/file.csv",
  "fileType": "csv"
}
```

**Capabilities:**
- `TestConnection` — checks that the file exists on disk
- `DiscoverObjects` — returns the file name as the single available object
- `DiscoverFields` — parses the CSV header row
- `FetchChanges` — parses all data rows into `ExternalRecord[]` (watermark is ignored)

**CSV parsing rules:**
- First row is treated as the header
- Supports quoted fields with commas inside
- Supports escaped quotes (`""`) inside quoted fields
- Empty values are mapped to `null`

## Building

```bash
cd packages/Integration/connectors
npm run build
```

## Testing

Tests are integration tests that connect to the mock SQL Server databases.

```bash
cd packages/Integration/connectors
npm run test          # single run
npm run test:watch    # watch mode
```

## Architecture

```
src/
  index.ts                     # Package exports
  RelationalDBConnector.ts     # Base class for SQL-based connectors
  HubSpotConnector.ts          # HubSpot mock connector
  SalesforceConnector.ts       # Salesforce mock connector
  YourMembershipConnector.ts   # YourMembership mock connector
  FileFeedConnector.ts         # CSV file connector
  __tests__/                   # Integration tests
test-fixtures/
  sample-contacts.csv          # 100-row sample for FileFeed testing
```
