---
"@memberjunction/integration-connectors": minor
---

Add the Rhythm Software (Rhythm AMS) connector — REST + OAuth2/OIDC via Auth0. The catalog is spec-derived from Rhythm's 15 public OpenAPI specs across all 14 modules: **377 Integration Objects / 14,515 fields** (no invention; tenant-specific custom fields / saved queries / event streams / SSO deferred to runtime).

- Per-object **read-style classification** (list / POST-search / fk-child / by-id) derived from each module's spec
- **POST-search listing**, **fk-child parent-traversal**, generic per-operation **CRUD**, DynamoDB-style **cursor pagination**, **content-hash idempotency**
- **Single-origin `BaseURL`/token override** (a proxying gateway or the credential-free e2e mock; real tenants leave it unset)
- New `Rhythm OAuth2` credential type

Verified credential-free (mock vendor through the real MJ engine on SQL Server): contract ladder T0–T5/T7/T12 (T7 1,446/1,446 declared paths match the specs), all 273 bulk objects ApplyAll'd + synced (284 tables, 571/571 cells, 0 failures), and the 17-cell behavioral matrix REAL (forward / idempotent / delta / pagination / DAG 377-108-4-0 / merkle / rate-limit / retry / concurrency / bidirectional write round-trip). Ceiling is contract/mock-verified — not live-vendor or Postgres. Requires `@memberjunction/integration-engine` auth-helpers `OAuth2TokenRequest.ExtraParams` (Auth0 audience).
