---
"@memberjunction/integration-engine": patch
---

Fix: template-var **child** objects now receive sampled field metadata at discovery, and the parent's addressing key is **resolved from the fetched rows** rather than presupposed.

A second-layer object whose API path nests under a parent (`/orgs/{OrgId}/events`) resolves its parent IDs through `LoadParentIDs`, which reads the **synced** DB. At discovery nothing is synced yet, so the child yields zero records → it is sampled with no fields (no widths, no PK, no custom-column capture), silently falling back to declared-only metadata. `DiscoverFieldsViaFetch` sets an opt-in `FetchContext.DiscoverySampleParents` flag; when set, the connector live-samples a small bounded page of the parent so the child yields representative records ("sync-like fetch, no DB work").

Crucially, the parent's addressing-key **field name is not presupposed**. After fetching the parent it is resolved, in order: (1) a **declared PK** in metadata; else (2) the engine's **value-statistic PK classifier run over the rows fetch just returned** (`pickKeyFromStats` / soft-fallback — discovery-via-fetch, the same determination used everywhere); else (3) a conventional identity name **only when that field is actually present in the fetched data** (a fair last-resort fallback, never an assumed name for an absent field). If none resolves, the parent is genuinely keyless and its child **adjourns** (caught on the first real sync). No hardcoded field name is ever assumed.

Discovery-only and additive: a real sync never sets the flag, so `ZERO_PARENTS` (and the "sync the parent first" DAG contract) is unchanged; non-template-var objects are untouched. The parent live-sample is an HTTP fetch with no SQL, so it is dialect-agnostic — identical on SQL Server and PostgreSQL. Covered by unit tests: the pre-fix zero-record gap, a declared-PK parent, a **keyless parent whose key is resolved from the fetched rows**, the sample bound, and the sync path staying unchanged.
