# @memberjunction/integration-connectors

Concrete integration connectors for the MemberJunction Integration Engine. This package provides seven connectors — four production REST API connectors, two SQL-based connectors, and a file-based connector — all implementing `BaseIntegrationConnector` from `@memberjunction/integration-engine`.

## Connectors

### Production REST API Connectors

These connectors call live external APIs and extend `BaseRESTIntegrationConnector`.

#### SalesforceConnector

Production connector for Salesforce CRM using the REST API v61.0 with full bidirectional sync.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'SalesforceConnector')`

**Authentication — Two Supported Flows:**

The connector auto-detects the auth flow based on the credentials provided.

**1. Client Credentials Flow** (recommended for new setups):
```json
{
  "authFlow": "client_credentials",
  "loginUrl": "https://myorg.my.salesforce.com",
  "clientId": "3MVG9...your-consumer-key",
  "clientSecret": "D4A28...your-client-secret",
  "apiVersion": "61.0"
}
```

**2. JWT Bearer Token Flow** (RS256, certificate-based):
```json
{
  "authFlow": "jwt_bearer",
  "loginUrl": "https://login.salesforce.com",
  "tokenUrl": "https://myorg.my.salesforce.com",
  "clientId": "3MVG9...your-consumer-key",
  "username": "integration-user@myorg.com",
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
  "apiVersion": "61.0"
}
```

| Field | Required | Description |
|---|---|---|
| `loginUrl` | Yes | Org URL. For Client Credentials: My Domain URL. For JWT: `login.salesforce.com` (prod) or `test.salesforce.com` (sandbox) as the JWT audience. |
| `clientId` | Yes | Connected App Consumer Key |
| `clientSecret` | CC only | Client Secret from Connected App |
| `username` | JWT only | Integration user's Salesforce email |
| `privateKey` | JWT only | PEM-encoded RSA private key (matching X.509 cert uploaded to Connected App) |
| `tokenUrl` | No | Token endpoint URL if different from `loginUrl` (e.g., My Domain URL for JWT flow) |
| `apiVersion` | No | Salesforce REST API version (default: `61.0`) |
| `authFlow` | No | Explicit flow selection. Auto-detected: `clientSecret` present → `client_credentials`; `privateKey` + `username` present → `jwt_bearer` |

**Capabilities:**
- Full CRUD (Create, Read, Update, Delete)
- SOQL-based search
- Live schema discovery via Describe API (standard + custom objects)
- Incremental sync with `SystemModstamp` watermarks and `queryAll` for deleted records
- Governor limit tracking (throttles at 80%, pauses at 95%)
- Automatic token caching and refresh

**Standard Objects (9):** Account, Contact, Lead, Opportunity, Task, Event, Case, Campaign, User (read-only)

**Default field mappings:**
| Source Object | Target Entity | Key Mappings |
|---|---|---|
| Contact | Contacts | Email (key), FirstName, LastName, Phone, MobilePhone, Title, Department, mailing address fields (12 total) |
| Account | Companies | Name (key), Industry, Phone, Website, billing address fields, Type, AnnualRevenue, NumberOfEmployees (10 total) |
| Lead | Contacts | Email (key), FirstName, LastName, Company, Phone, Title (6 total) |

See also: [Connector usage guide](../docs/salesforce-connector.md) · [Connected App setup guide](../docs/salesforce-connected-app-setup.md)

#### HubSpotConnector

Production connector for HubSpot CRM using the V3 API with full bidirectional sync, including association objects.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')`

**Authentication:** OAuth2 Bearer token via HubSpot Private App credentials.

**Capabilities:** Full CRUD, search, list, association fetching (v4 per-object associations endpoint)

**Objects:** Contacts, Companies, Deals, Owners, Tickets, Line Items, plus association objects (Contact↔Company, Deal↔Company, etc.)

**Default field mappings:**
| Source Object | Target Entity | Key Mappings |
|---|---|---|
| Contacts | Contacts | email (key), firstname, lastname, phone, company, lifecyclestage |
| Companies | Companies | name (key), domain, industry, city, state |

#### RasaConnector

Production connector for Rasa.io newsletter platform. Read-only — pulls newsletter and subscriber data.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'RasaConnector')`

**Authentication:** Basic auth (username/password) to obtain a JWT, scoped to a community ID.

**Objects:** Newsletters, Newsletter Sections, Newsletter Section Items, Subscribers

#### WicketConnector

Production connector for Wicket membership management platform with full bidirectional sync.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'WicketConnector')`

**Authentication:** HMAC-SHA256 signed requests.

**Capabilities:** Full CRUD, search

### SQL-Based Connectors

These connectors read from SQL Server databases and extend `RelationalDBConnector`.

#### RelationalDBConnector (Base Class)

Abstract base class for connectors backed by SQL Server via the `mssql` package.

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
- `TestConnection` — runs `SELECT @@VERSION`
- `DiscoverObjects` — queries `INFORMATION_SCHEMA.TABLES`
- `DiscoverFields` — queries `INFORMATION_SCHEMA.COLUMNS`
- `FetchChangesFromTable` — incremental fetch with watermark filtering and batch limiting
- Connection pool caching per server+database pair

#### YourMembershipConnector

Reads from YourMembership database tables: `ym_Members`, `ym_Events`, `ym_EventRegistrations`, `ym_Chapters`, `ym_MembershipLevels`.

**Registration:** `@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')`

**Default field mappings:**
| Source Object | Target Entity | Key Mappings |
|---|---|---|
| ym_Members | Contacts | email (key), first_name, last_name, phone, status |

### File-Based Connectors

#### FileFeedConnector

Reads data from local CSV files. Always performs a full load (no incremental sync).

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
- `FetchChanges` — parses all rows into `ExternalRecord[]` (watermark ignored)

## Action Generation

Integration connectors can auto-generate MJ Action metadata for use by AI agents and workflow engines. Each connector declares its objects and fields via `GetIntegrationObjects()`, and the CLI generator produces mj-sync compatible JSON files.

```bash
# Generate actions for all connectors
npx tsx src/generate-integration-actions.ts

# Generate for a specific connector
npx tsx src/generate-integration-actions.ts salesforce
npx tsx src/generate-integration-actions.ts hubspot
```

See [INTEGRATION_ACTIONS.md](../INTEGRATION_ACTIONS.md) for full documentation.

## Building

```bash
cd packages/Integration/connectors
npm run build
```

## Testing

```bash
cd packages/Integration/connectors
npm run test          # single run
npm run test:watch    # watch mode
```

## Architecture

```
src/
  index.ts                        # Package exports
  RelationalDBConnector.ts        # Base class for SQL-based connectors
  HubSpotConnector.ts             # HubSpot REST API connector (full CRUD)
  SalesforceConnector.ts          # Salesforce REST API connector (full CRUD)
  RasaConnector.ts                # Rasa.io REST API connector (read-only)
  WicketConnector.ts              # Wicket REST API connector (full CRUD)
  YourMembershipConnector.ts      # YourMembership SQL connector
  FileFeedConnector.ts            # CSV file connector
  generate-integration-actions.ts # CLI: auto-generate action metadata from connectors
  __tests__/                      # Unit and integration tests
test-fixtures/
  sample-contacts.csv             # 100-row sample for FileFeed testing
```
