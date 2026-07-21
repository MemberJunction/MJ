---
"@memberjunction/testing-integration": patch
"@memberjunction/server": patch
---

Integration-test expansion Wave 2 — two new bundles (22 checks) covering the core write-side and the permission model.

**`entity-writes` (8 checks, client-first)** — Record-Change fidelity (exact before/after `ChangesJSON`, offenders identified by content not position), virtual-field capture on both INSERT and UPDATE, keyset `AfterKey` completeness over a real fixture set, keyset guardrail refusals each differing from a passing control by exactly one illegal ingredient, dedup-linger invalidation after save, UUID case-insensitive FK round-trip, `datetimeoffset` round-trip to the millisecond, and server-side `ValidateAsync` enforcement that survives `SkipAsyncValidation`.

**`permission-engine` (14 checks, client-first)** — provider fan-out from the `MJ: Permission Domains` catalog (every active row ClassFactory-resolves a matching provider), normalized `PermissionAction`/`GranteeType` vocabulary conformance, catalog↔provider capability agreement, unknown-domain fails **closed**, and the **two-access-path asymmetry** for Agents and Skills (cached helper open-by-default vs unified provider closed-by-default over the same table) — where the divergence itself is the assertion, so it cannot collapse silently. Plus grant-flips-the-default-off, permission collapse ordering, and two genuinely distinct identities proving a role-less user gets neither entity CRUD nor any of 13 authorizations.

Both bundles ship all parity siblings and register best-effort teardown for their mutation-tier checks.

Note: `permission-engine`'s PE13 is intentionally RED — it pins a confirmed defect where a single unresolvable provider breaks `GetAllUserPermissions` for every user. It is mutation-tier, so the default CI gate stays green.
