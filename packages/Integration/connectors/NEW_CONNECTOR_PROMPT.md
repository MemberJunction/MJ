# Prompt: Add a New Integration Connector to MemberJunction

Use this prompt when you want Claude to create a new integration connector for MJ. Copy and fill in the blanks, then paste to Claude.

---

## Prompt

I need to add a new integration connector to MemberJunction for **[PLATFORM NAME]** (e.g., Mailchimp, Stripe, Xero, Dynamics 365).

### Platform Details
- **API Documentation URL**: [paste the link to their REST API docs]
- **Auth method**: [OAuth 2.0 / API Key / Basic Auth / Bearer Token / other]
- **API base URL**: [e.g., https://api.platform.com/v2]
- **Rate limits**: [e.g., 100 requests/minute, or "unknown — check docs"]

### Requirements
1. **Discover ALL available API endpoints** by parsing the API documentation. For every resource that supports GET (list/read), create an IntegrationObject. For every resource that supports POST/PUT/DELETE, mark `SupportsWrite: true`.

2. **Use live API discovery if the platform supports it** (e.g., Salesforce `/sobjects`, HubSpot `/crm/v3/schemas`). Otherwise, create a complete static `PLATFORM_OBJECTS` array with all endpoints and their fields.

3. **Implement full CRUD** — CreateRecord, UpdateRecord, DeleteRecord — for all writable endpoints. Set `SupportsCreate`, `SupportsUpdate`, `SupportsDelete` getters to `true`.

4. **Implement incremental sync** using the platform's change detection mechanism:
   - Prefer: CDC/webhook endpoints if available
   - Otherwise: `updated_at >= watermark` filtering
   - Last resort: full load with client-side watermark comparison

5. **Follow the existing connector patterns exactly**:
   - File: `packages/Integration/connectors/src/[PlatformName]Connector.ts`
   - Extend `BaseRESTIntegrationConnector` for REST APIs, `BaseIntegrationConnector` for non-REST
   - Register with `@RegisterClass(BaseIntegrationConnector, '[PlatformName]Connector')`
   - Export a tree-shaking prevention function: `export function Load[PlatformName]Connector() {}`
   - Add to `packages/Integration/connectors/src/index.ts`

6. **Authentication**: Implement `Authenticate()` returning a `RESTAuthContext`. Handle token refresh/caching. Use MJ Credentials entity for secrets (never hardcode).

7. **Pagination**: Override `ExtractPaginationInfo()` and `BuildPaginatedURL()` for the platform's pagination pattern (offset, cursor, page number, link header, etc.)

8. **Response parsing**: Override `ExtractRecords()` to handle the platform's response envelope (e.g., `{ data: [...] }`, `{ results: [...] }`, JSON:API format, etc.)

9. **Field metadata**: Define `IntegrationObjectInfo[]` with accurate field types, PKs, FKs, IsRequired, IsReadOnly. If the API has a metadata/describe endpoint, use it for live field discovery in `DiscoverFields()`.

10. **Error handling**: Map platform-specific HTTP errors to MJ's `SyncErrorCode` types. Handle rate limiting with exponential backoff.

### Reference Connectors
Study these existing connectors as patterns:
- **REST with live discovery**: `HubSpotConnector.ts` (CRM + non-CRM + associations)
- **REST with static objects + CRUD**: `WicketConnector.ts` (JSON:API format)
- **REST with auth sessions**: `YourMembershipConnector.ts` (session-based auth)
- **Non-REST (XML/SOAP)**: `SageIntacctConnector.ts` (XML API with live inspect)
- **OAuth + query language**: `QuickBooksConnector.ts` (SQL-like queries)
- **OAuth + REST**: `SalesforceConnector.ts` (SOQL + REST)

### Output
- The complete connector TypeScript file
- Updated `index.ts` with the new export
- A metadata JSON file for `metadata/integrations/.platform-name.json` if the platform uses static objects
- Verification that `npm run build` passes in `packages/Integration/connectors`

### Verification Checklist
After implementation, verify:
- [ ] `DiscoverObjects()` returns all available API endpoints
- [ ] `DiscoverFields()` returns accurate field metadata for each object
- [ ] `FetchChanges()` handles pagination correctly and respects watermarks
- [ ] `CreateRecord()`, `UpdateRecord()`, `DeleteRecord()` work for writable objects
- [ ] `SupportsCreate`, `SupportsUpdate`, `SupportsDelete` getters return `true`
- [ ] Auth handles token refresh without manual intervention
- [ ] Rate limiting is handled gracefully (backoff, not crash)
- [ ] `npm run build` passes with zero errors
- [ ] All fields use proper TypeScript types (no `any`)
