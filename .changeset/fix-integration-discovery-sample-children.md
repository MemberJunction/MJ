---
"@memberjunction/integration-engine": patch
---

Fix: template-var **child** objects now receive sampled field metadata at discovery.

A second-layer object whose API path nests under a parent (`/orgs/{OrgId}/events`) resolves its parent IDs through `LoadParentIDs`, which reads the **synced** DB. At discovery time nothing is synced yet, so `LoadParentIDs` returns `[]` → `FetchWithTemplateVars` emits `ZERO_PARENTS` and yields no records → the child is sampled with **zero fields** (no column widths, no provable PK, no custom-column capture), silently falling back to declared-only metadata.

`DiscoverFieldsViaFetch` now sets an opt-in `FetchContext.DiscoverySampleParents` flag; when a template-var child finds no synced parents **and** that flag is set, the connector live-samples a small bounded page of the parent (`SampleParentIDsForDiscovery`, default 3, depth-capped for multi-level chains) so the child yields representative records for field-stat accumulation — "sync-like fetch, no DB work". The fallback is **discovery-only**: a real sync never sets the flag, so `ZERO_PARENTS` (and the "sync the parent first" DAG contract) is unchanged on the sync path. Code-only, additive, dialect-agnostic; covered by unit tests proving the pre-fix zero-record gap, the child sampling correctly through its live-sampled parent, the sample bound, and the sync path staying unchanged.
