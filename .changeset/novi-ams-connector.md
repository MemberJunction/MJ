---
"@memberjunction/integration-connectors": minor
---

Add the **Novi AMS** connector — a read+write integration for the Novi association-management system's public REST API.

- **`NoviConnector`** (`@RegisterClass(BaseIntegrationConnector, 'NoviConnector')`, `IntegrationName` = `"Novi AMS"`) extends `BaseRESTIntegrationConnector` and rides the generic per-operation CRUD path. Novi-specific overrides: `BuildHeaders` (`Authorization: Basic <rawApiKey>` — the raw key after `Basic `, not base64 user:pass), per-tenant `GetBaseURL` resolved from `CompanyIntegration.Configuration` (Novi has no shared host — each org is `https://www.<assoc>.org/api/`), `NormalizeResponse` for both envelopes (`{TotalCount, Results}` lists, `{data}` details), offset `ExtractPaginationInfo`/`BuildPaginatedURL` (`pageSize` + `offset`), `RateLimitPolicy`/`ExtractRetryAfterMs` (20/s · 600/min · 100k/day), a `FetchChanges` that emits each object's `IncrementalWatermarkField` and advances only on full-batch success, and a GET-then-merge-then-PUT `UpdateRecord` (Novi PUT is full-object replacement, no PATCH). `ExtractIDFromResponse` reads Novi's `UniqueID`/`<Object>UniqueId` keys and still routes creates through `BuildCreatedResult`.
- **Metadata** (`metadata/integrations/novi/.novi.integration.json`): 32 Integration Objects / 387 fields covering members, member types, activities, groups, committees (+roles/members), events, tickets, registrations, attendees, orders (+items), products (+purchases), subscriptions, custom fields (definitions + per-customer values), credit types, webhooks, articles, static pages, NPS surveys, and lookups — with per-operation CRUD columns, offset pagination, incremental watermarks, and FK relationships. Passes the bijection, dag-completeness, and fk-lookup-qualifier floor graders.
- 20 vitest unit tests (`NoviConnector.test.ts`).

Built and verified credential-free via the connector workshop. **Ceiling: sync-verified** — beyond matching Novi's published API (api-docs.noviams.com + the official Postman collection), the connector passes the full credential-free verification surface on SQL Server (real MJ engine, mock Novi vendor, real DB):

- **Verification ladder T0–T6 all green** (T0 tsc, T1 structural invariants, T2 cross-pass consistency, T3 doc self-check over 32 objects, T4 vitest 20/20, T5 mock-HTTP 32 objects/61 records, T6 SQLite create/update/delete/ordering). T7 (OpenAPI) and T8 (live) are N/A — Novi publishes no OpenAPI spec and live testing needs a customer API key.
- **Read sync over ALL 32 objects**: `ApplyAll` builds 32 tables + entity maps; forward sync 100% complete and rowcount-asserted per object; idempotent re-run with content-hash incremental narrowing; child-path objects (GroupMember/CommitteeMember via parent chain) and derived line-items (OrderItem/ProductPurchase) all sync.
- **Write paths**: delta create/update/delete (5/5) and a full bidirectional create→update→delete round-trip (7/7) through the connector's CRUD.
- DAG: 32 objects / 26 FK `@lookup` edges / **0 cycles**.

Not yet live/production-verified: a round-trip against a real Novi tenant needs a customer API key (the credential boundary). Tenant-specific behavior (API-key field/group exposure, custom fields, QuickBooks/SSO setup, real rate-limit/error shapes) is deferred to runtime discovery. OAuth2/OIDC SSO and the QuickBooks-direct/Zapier routes are intentionally out of scope (recorded in the Integration `Configuration`).
