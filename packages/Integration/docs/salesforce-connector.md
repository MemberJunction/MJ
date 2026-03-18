# Salesforce Integration Connector

The Salesforce connector provides full bidirectional sync between MemberJunction and Salesforce CRM using the Salesforce REST API v61.0 with JWT Bearer Token authentication.

## Capabilities

| Feature | Supported |
|---|---|
| Pull sync (FetchChanges) | Yes — SOQL with `SystemModstamp` watermarks |
| Push create | Yes |
| Push update | Yes (delta fields only) |
| Push delete | Yes |
| Search | Yes — SOQL WHERE clause |
| Object discovery | Yes — live via `/sobjects/` |
| Field discovery | Yes — live via `/sobjects/{name}/describe` |
| Custom objects | Yes — discovered at runtime (`*__c`) |
| Incremental sync | Yes — `SystemModstamp` watermark |
| Deleted record detection | Yes — `queryAll` with `IsDeleted` |

## Prerequisites

1. A Salesforce org (Production, Sandbox, or Developer Edition)
2. A Connected App configured for JWT Bearer Token flow — see [Connected App Setup Guide](salesforce-connected-app-setup.md)
3. An RSA key pair (private key for MJ, X.509 certificate uploaded to SF)
4. A Salesforce integration user with appropriate permissions

## Configuration

### Credential Setup

The connector uses the **Salesforce JWT Bearer** credential type. Configure it with:

| Field | Description | Example |
|---|---|---|
| `loginUrl` | Salesforce login endpoint | `https://login.salesforce.com` (production) or `https://test.salesforce.com` (sandbox) |
| `clientId` | Connected App Consumer Key | `3MVG9...` |
| `username` | Integration user email | `integration@yourorg.com` |
| `privateKey` | PEM-encoded RSA private key | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `apiVersion` | REST API version (optional) | `61.0` (default) |

### Integration Record

The Salesforce integration is pre-configured in `metadata/integrations/.integrations.json`. After running `mj sync push`, the integration record will be available in the database with:

- **ClassName**: `SalesforceConnector`
- **ImportPath**: `@memberjunction/integration-connectors`
- **CredentialType**: Salesforce JWT Bearer
- **BatchMaxRequestCount**: 200
- **BatchRequestWaitTime**: 100ms

## Standard Objects

The connector ships with metadata for 9 standard Salesforce objects:

| Object | Fields | Write | Category |
|---|---|---|---|
| Account | 14 | Yes | Core |
| Contact | 14 | Yes | Core |
| Lead | 8 | Yes | Core |
| Opportunity | 7 | Yes | Sales |
| Task | 6 | Yes | Activity |
| Event | 5 | Yes | Activity |
| Case | 7 | Yes | Service |
| Campaign | 6 | Yes | Marketing |
| User | 4 | No (read-only) | System |

Custom objects (`*__c`) are not pre-seeded — they are discovered at runtime via `DiscoverObjects()`.

## Default Field Mappings

The connector provides pre-built field mappings for the three most common sync scenarios:

### Contact (12 mappings)
`Email` (key), `FirstName`, `LastName`, `Phone`, `MobilePhone`, `Title`, `Department`, `MailingStreet`, `MailingCity`, `MailingState`, `MailingPostalCode`, `MailingCountry`

### Account (10 mappings)
`Name` (key), `BillingStreet`, `BillingCity`, `BillingState`, `BillingPostalCode`, `BillingCountry`, `Phone`, `Website`, `Industry`, `Description`

### Lead (6 mappings)
`Email` (key), `FirstName`, `LastName`, `Phone`, `Company`, `Title`

## How Sync Works

### Pull (Inbound)

1. **Initial sync**: Fetches all records via SOQL `SELECT ... FROM {Object} ORDER BY SystemModstamp ASC`
2. **Incremental sync**: Uses `SystemModstamp > {watermark}` to fetch only changed records
3. **Deleted records**: Uses `queryAll` to include soft-deleted records (`IsDeleted = true`)
4. **Pagination**: Salesforce returns up to 2,000 records per batch; the connector follows `queryMore` cursors automatically

### Push (Outbound)

- **Create**: `POST /sobjects/{Object}/` — returns the new SF record ID
- **Update**: `PATCH /sobjects/{Object}/{Id}` — sends only changed fields
- **Delete**: `DELETE /sobjects/{Object}/{Id}` — handles already-deleted gracefully

### Conflict Resolution

The connector exposes `SystemModstamp` as `ModifiedAt` on all external records, enabling the engine's conflict resolution strategies:
- **SourceWins**: SF value always overwrites MJ
- **DestWins**: MJ value preserved
- **MostRecent**: Compares `SystemModstamp` vs `__mj_UpdatedAt`

## Authentication Flow

```
1. Build JWT assertion (RS256-signed):
   - iss: Connected App Consumer Key
   - sub: Integration user email
   - aud: Login URL
   - exp: now + 5 minutes

2. Exchange JWT for access token:
   POST {loginUrl}/services/oauth2/token
   grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}

3. Response provides:
   - access_token (used for all API calls)
   - instance_url (base URL for this org's pod)

4. Token is cached and refreshed at 80% lifetime (~96 min of 2 hours)
```

## Governor Limit Management

Salesforce enforces daily API call limits. The connector monitors usage via the `Sforce-Limit-Info` response header:

| Usage Level | Action |
|---|---|
| < 80% | Normal operation |
| 80-95% | Throttle — add delay between requests |
| > 95% | Pause sync, log warning |

Standard 429 (Too Many Requests) responses trigger exponential backoff with retry.

## Error Handling

The connector handles Salesforce-specific error codes:

| Error Code | Meaning | Connector Behavior |
|---|---|---|
| `INVALID_SESSION_ID` | Token expired | Re-authenticate and retry |
| `REQUEST_LIMIT_EXCEEDED` | Daily API limit hit | Pause sync, log warning |
| `UNABLE_TO_LOCK_ROW` | Concurrent modification | Retry with backoff (up to 3x) |
| `ENTITY_IS_DELETED` | Record already deleted | Treat as success for delete operations |
| `ENTITY_IS_LOCKED` | Record in approval process | Skip, log warning |
| `REQUIRED_FIELD_MISSING` | Missing required field | Fail with detailed message |
| `DUPLICATE_VALUE` | Unique constraint violation | Fail with field details |
| `FIELD_CUSTOM_VALIDATION_EXCEPTION` | Trigger/validation rule | Fail with validation message |
| `INSUFFICIENT_ACCESS_OR_READONLY` | Permission issue | Skip with warning |

## Compound Fields

Salesforce compound fields (`address`, `location`) are handled automatically:
- The compound aggregate field (e.g., `BillingAddress`) is **skipped**
- Individual component fields (`BillingStreet`, `BillingCity`, etc.) are exposed as writable fields
- On write operations, read-only system fields and compound aggregates are automatically stripped

## Generated Actions

The connector generates 40 actions (8 writable objects × 5 verbs):
- **Get** {Object} — Fetch a single record by ID
- **Create** {Object} — Create a new record
- **Update** {Object} — Update an existing record
- **Delete** {Object} — Delete a record
- **Search** {Object} — Search records with filters

All actions use the shared `IntegrationActionExecutor` with config-driven routing. See [INTEGRATION_ACTIONS.md](../INTEGRATION_ACTIONS.md) for architecture details.

## Troubleshooting

### "INVALID_SESSION_ID" on every request
- Verify the Connected App certificate matches the private key
- Ensure the integration user is pre-authorized on the Connected App
- Check that the `loginUrl` matches the org type (production vs sandbox)

### "REQUEST_LIMIT_EXCEEDED" during sync
- Check your org's daily API limit in Salesforce Setup → Company Information
- Consider reducing sync frequency or batch sizes
- For large initial loads, Bulk API support is planned (Phase 3)

### "INSUFFICIENT_ACCESS" for specific objects
- Ensure the integration user's profile has Read/Write access to the target objects
- Check field-level security settings for restricted fields
- Verify sharing rules allow the integration user to see the records

### Records not syncing after changes
- Verify `SystemModstamp` is updating (formula field changes may not update it)
- Check that the watermark value is progressing (visible in sync logs)
- Ensure the SOQL query isn't hitting the 2,000-record batch limit with stale watermarks

### Custom object discovery not working
- Ensure `queryable: true` on the custom object (check in Object Manager)
- Verify the integration user has Read permission on the custom object
- Run `DiscoverObjects()` to refresh the object list
