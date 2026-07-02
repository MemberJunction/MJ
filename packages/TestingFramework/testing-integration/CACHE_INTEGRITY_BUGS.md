# RunView / RunQuery Cache Integrity — Bug Report

**Discovered by:** the Integration Test tier (`@memberjunction/testing-integration`) while adding coverage to the six cache check bundles.
**Environment:** SQL Server `mj_integrations` @ `localhost:1433` (356 entities); live MJAPI @ `http://localhost:4060/` for the client-transport findings.
**Scope of the defects:** `@memberjunction/core` (`localCacheManager`, `providerBase`), `@memberjunction/generic-database-provider`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/server` (`ResolverBase`). **None of the bugs are in the testing package** — the testing package only *reproduces* them.

> Every bug below has an executable reproduction: a named check in a cache bundle that is **currently red**. See [How to reproduce](#how-to-reproduce). No product code has been changed.

---

## Executive summary

| # | Check(s) | Title | Severity | Transports |
|---|---|---|---|---|
| 1 | `server-cache.S31` | RunView cache serves rows to users who lack read permission (authorization bypass) | **Critical (security)** | server + client (MJAPI) |
| 2 | `server-cache.S29` | Stored view's WhereClause is dropped by the cache (view collides with the plain entity query) | **High** | server + client |
| 3 | `server-cache.S30` | Cross-entity denormalized fields go stale (parent rename never invalidates child caches) | Medium | server + client |
| 4 | `server-cache.S28` | `IgnoreMaxRows` is ignored on a cache hit (row loss on capped entities) | Medium | server + client |
| 5 | `aggregates-cache.AGG3`, `client-cache.C13` | Aggregate result **ordering** is corrupted by the cache | Medium | server + client |
| A | — (report-only) | `SaveViewResults: true` throws a SQL error (`Number(guid)` = NaN + unquoted email) | Medium (broken feature) | server |
| B | — (report-only) | RLS cache-key segment uses a 32-bit non-crypto hash (collision → cross-user serve) | Low prob / high impact (hardening) | server + client |
| C | — (latent) | Stored view run by ViewID **without** EntityName omits the RLS segment from the cache key | High (unverified — needs RLS users) | server |

Bugs **1–5** are the ones with red reproductions. **A/B/C** are additional findings surfaced during the hunt.

---

## Shared root cause (bugs 2, 4, 5, and part of C)

The RunView server cache keys entries on a **fingerprint** produced by
`LocalCacheManager.GenerateRunViewFingerprint()` (`packages/MJCore/src/generic/localCacheManager.ts:1159`):

```
EntityName | ExtraFilter | OrderBy | MaxRows | StartRow | AggHash | UserSearch [| ak:<key>] [| rls:<hash>] [| <connection>]
```

Any input that **changes the result set but is not in that list** causes two semantically-different
queries to collide on one cache slot and cross-serve. The fingerprint deliberately excludes `Fields`
and `ResultType` (that is correct — the cache stores the full-width superset and projects per read).
But it **also silently excludes** several result-affecting inputs:

- the **order** of the `Aggregates[]` array — `generateAggregateHash` sorts it (`localCacheManager.ts:1236`) → bug 5
- **`IgnoreMaxRows`** — never referenced by the fingerprint → bug 4
- **`ViewID` / `ViewName`** and the resolved stored-view **`WhereClause` / `OrderByClause`** — the view is resolved *after* the fingerprint is computed → bug 2

`RunQuery`'s sibling fingerprint (`GenerateRunQueryFingerprint`, `localCacheManager.ts:1863`) gets this
right: it `JSON.stringify`s the parameters with **no normalization**, so different inputs never collide.
The two fingerprint functions disagree on whether input order/shape matters — that inconsistency is the tell.

Bugs **1** (permission check placement) and **3** (invalidation scope) have different root causes, detailed in their sections.

---

## How to reproduce

All commands run from the repo root against the configured DB (`.env` / `mj.config.cjs`).

```bash
# Bugs 4 (S28) and 1 (S31) — run in the default tier (read-only / no mutation):
npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts

# Bugs 2 (S29) and 3 (S30) — mutation-gated (create + delete their own throwaway fixtures):
RUN_MUTATION_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts

# Bug 5 (AGG3) — server transport:
npx tsx packages/MJServer/integration-test-scripts/aggregates-cache-tests.ts

# Bug 5 (C13) — client transport (needs MJAPI running: cd packages/MJAPI && npm run start):
npx tsx packages/MJServer/integration-test-scripts/client-cache-tests.ts
```

Reproduction sources: `packages/TestingFramework/testing-integration/src/checks/{server-cache,aggregates-cache,client-cache}.checks.ts`.

---

## Bug 1 — RunView cache serves rows to users who lack read permission

> **Suggested issue title:** *Authorization bypass: RunView server cache returns rows without a read-permission check on cache hits*
> **Labels:** `security`, `bug`, `caching`, `P0` · **Check:** `server-cache.S31` · **Severity: Critical**

### Symptom
A user with **no read permission** on an entity is served that entity's rows when a permitted user
warmed the same cache slot first. Confirmed live: `anonymous@magic-link.local` (a restricted magic-link
user) was **denied** on a cold read of `MJ: Action Categories`, then returned **48 rows** (cache hit,
`ExecutionTime = 0`) after the system user warmed the slot.

### Root cause
The entity read-permission check `CheckUserReadPermissions` (`packages/MJCore/src/generic/databaseProviderBase.ts:1009`)
is invoked **only inside `InternalRunView`** (`packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts:1448`
and `:2094`). But a cache **hit** returns from `PreRunView` (`packages/MJCore/src/generic/providerBase.ts:1985`+)
**before `InternalRunView` is ever called**, so the permission check is skipped on every cache hit.

Two more facts make it exploitable cross-user:
1. **The MJAPI resolver does not check read permission either.** `ResolverBase.RunViewGenericInternal`
   (`packages/MJServer/src/generic/ResolverBase.ts:692`) calls `rv.RunView(...)` at `:760` after only an
   *API-key scope* check (`CheckAPIKeyScopeAuthorization`, `:718`). `ResolverBase.CheckUserReadPermissions`
   is **defined at `:581` but has zero call sites** in the RunView path.
2. **The fingerprint has no coarse-permission component** — only the RLS clause. For entities without RLS
   (the common case) every user's clause is empty, so a permitted user and an unpermitted user produce the
   **identical** fingerprint and share one slot.

The server cache is process-global and shared across all users/requests (`TrustLocalCacheCompletely = true`),
so this is a real cross-user bypass in a live MJAPI, not just an embedded-harness artifact.

### Impact
Any user who can reach the RunView GraphQL endpoint (including low-privilege / anonymous magic-link users)
can read data from any entity **they have no permission to read**, as long as a privileged user has queried
the same entity+filter+orderby. No mutation is required to trigger it; the attacker only needs the cache warm.

### Reproduction (S31)
`server-cache.S31` discovers an (A can-read / B cannot-read) pair on a cacheable, RLS-free entity, asserts B
is denied a cold (`BypassCache`) read, has A warm the slot, then asserts B is **still** denied via the cache
path. It currently fails: B is served the rows.

### Proposed fix
Enforce the read-permission check **before the cache is consulted**, independent of `InternalRunView` — i.e.
at the top of the RunView pipeline (`providerBase.RunView` / `PreRunView`) so *all* callers (MJAPI resolver
**and** direct server-side callers) are protected. Keeping the check only in the resolver would leave
server-side `RunView` callers exposed. The cache may continue to *share* entries across users (that is fine);
the fix is that access must be gated **before** any cached row is returned.

---

## Bug 2 — Stored view's WhereClause is dropped by the cache

> **Suggested issue title:** *Stored views silently ignore their WhereClause through the RunView cache (collide with the plain entity query)*
> **Labels:** `bug`, `caching`, `data-integrity`, `P1` · **Check:** `server-cache.S29` (mutation) · **Severity: High**

### Symptom
A stored view scoped by a `WhereClause` returns the **entire unfiltered table** when a plain query on the
same entity was cached first (and vice-versa: a plain list can be served a view's filtered subset).
Confirmed: a view filtered to `Name LIKE 'MJ: A%'` (97 rows) returned **all 356 rows, 259 off-filter**
(cache hit, `ExecutionTime = 0`).

### Root cause
The fingerprint is computed in `PreRunView` from `params` (`providerBase.ts:1985`), but a stored view's
`WhereClause` / `OrderByClause` are only applied later, inside `InternalRunView`
(`GenericDatabaseProvider.ts:1436` resolves the view; `:1513` applies its WhereClause). At fingerprint time:
- `ViewID` / `ViewName` are **intentionally excluded** (see the comment at `localCacheManager.ts:1184`), and
- the view's own `WhereClause` is **not in `params.ExtraFilter`**.

So `{ EntityName: 'X', ViewID: <any> }` and a plain `{ EntityName: 'X' }` both fingerprint to
`X|_|_|-1|0|_|_|<conn>` — identical. `IsServerCacheAllowedForEntity` even returns `true` for view queries
with no EntityName (`providerBase.ts:2884`), so nothing gates it out. The justifying comment
("*two different views that resolve to the same entity/filter/orderBy produce identical SQL*") is incorrect —
it ignores that each view carries its **own** WhereClause/OrderByClause.

### Impact
Data-integrity and confidentiality: a saved view scoped to (e.g.) "my team's records" can return every
row in the table, and a plain entity list can silently shrink to some other view's filtered subset. Which
one wins is decided purely by **cache warm order**.

### Reproduction (S29)
`server-cache.S29` creates a throwaway view with `WhereClause = "Name LIKE 'MJ: A%'"`, warms the unfiltered
slot with a plain `RunView({ EntityName: 'MJ: Entities' })`, then runs the view and asserts every returned
row matches the WhereClause. It currently fails (259 off-filter rows).

### Proposed fix
Include `ViewID` / `ViewName` in `GenerateRunViewFingerprint`. This makes (a) two different views never share
a slot and (b) a stored view (which has a `ViewID`) never collide with a plain entity query (which has none).
Alternatively, resolve the view's effective `WhereClause`/`OrderByClause` **before** fingerprinting and fold
them into the key. Do **not** rely on the "views are just containers" assumption — it is false whenever a
view has a stored filter.

---

## Bug 3 — Cross-entity denormalized fields go stale

> **Suggested issue title:** *Renaming a related record leaves stale denormalized values in cached child views (event-driven invalidation is entity-scoped only)*
> **Labels:** `bug`, `caching`, `data-integrity`, `P2` · **Check:** `server-cache.S30` (mutation) · **Severity: Medium**

### Symptom
After renaming a parent record, cached child rows keep showing the **old** denormalized parent name.
Confirmed: renaming an AI Prompt Category left cached `MJ: AI Prompts` rows showing `Category = 'Marketing
Agents'` (cache hit) while the DB view already returned the new name.

### Root cause
Cache invalidation is keyed on the **fingerprint's entity** (`addToEntityIndex` →
`extractEntityFromFingerprint`, `packages/MJCore/src/generic/localCacheManager.ts:503`). A `BaseEntity` save on
the *parent* entity (e.g. `MJ: AI Prompt Categories`) invalidates only the parent's cache entries — not the
*child* entries (`MJ: AI Prompts`) that **denormalize the parent's name** via a view join. The child cache
entry is indexed under the child entity and is never touched, so it serves the stale parent value until the
child row itself changes.

This contradicts the caching guide's claim that "*BaseEntity event-driven invalidation guarantees freshness*"
and "*Server trusts its cache completely*" — the guarantee does not hold for denormalized cross-entity fields,
which are pervasive in MJ views (`Category`, `User`, `Model`, etc.).

### Impact
Stale labels/names anywhere a view denormalizes a related record's field. Read-only correctness issue
(not a security issue); severity depends on how visible the denormalized field is.

### Reproduction (S30)
`server-cache.S30` creates a throwaway Query Category + Query, warms a `RunView('MJ: Queries')` that
denormalizes `Category`, renames the parent category, and asserts the cached child row reflects the new name.
It currently fails (stale name served).

### Proposed fix
This is the hardest to fix cleanly. Options, roughly in increasing cost:
1. **Correct the documentation** so the freshness guarantee is scoped to same-entity changes (minimum).
2. Provide a per-entity opt-out (disable caching or shorten TTL) for entities whose views are
   denormalization-heavy.
3. Track denormalized-field → source-entity dependencies in metadata and invalidate dependent child caches
   when a source entity changes (correct but requires dependency metadata + broader invalidation).

---

## Bug 4 — `IgnoreMaxRows` is ignored on a cache hit

> **Suggested issue title:** *`IgnoreMaxRows` collides with the capped query in the cache → rows silently dropped on capped entities*
> **Labels:** `bug`, `caching`, `data-integrity`, `P2` · **Check:** `server-cache.S28` · **Severity: Medium**

### Symptom
On an entity with a `UserViewMaxRows` cap, `RunView({ ..., IgnoreMaxRows: true })` returns the **capped** row
count instead of all rows, when the capped (default) query was cached first. Confirmed on
`MJ: Entity Record Documents` (cap 1000, true total 1177): `IgnoreMaxRows: true` returned **1000 rows, not
1177** — 177 silently lost.

### Root cause
`IgnoreMaxRows` changes the row count — a dynamic view applies `TOP <UserViewMaxRows>` when the entity has a
cap (`GenericDatabaseProvider.ts:1490`) and `IgnoreMaxRows` skips it (`:1476`). But `IgnoreMaxRows` is in
**neither** `GenerateRunViewFingerprint` **nor** the eligibility gate `runViewCacheEligible`
(`providerBase.ts:1141`). So `{ E }` and `{ E, IgnoreMaxRows: true }` share one slot; the first to run
dictates the row count the other receives.

### Impact
Row loss (or over-return, depending on warm order) for any entity that sets `UserViewMaxRows`. A job that
uses `IgnoreMaxRows: true` to intentionally read *all* rows can silently get a truncated set.

### Reproduction (S28)
`server-cache.S28` discovers a capped entity whose true count exceeds its cap, warms the capped query, then
asserts `IgnoreMaxRows: true` returns more than the cap. It currently fails (served the capped slot).

### Proposed fix
Add `params.IgnoreMaxRows` to the fingerprint (simplest, one line). *(Related, non-cache aside:* `StartRow`
without `MaxRows` is silently ignored at `GenericDatabaseProvider.ts:1473` — worth a separate look, but it is
a query-semantics quirk, not a cache bug.)*

---

## Bug 5 — Aggregate result ordering is corrupted by the cache

> **Suggested issue title:** *Reordered `Aggregates[]` collide in the cache and return results in the wrong order (violates the documented order contract)*
> **Labels:** `bug`, `caching`, `data-integrity`, `P2` · **Checks:** `aggregates-cache.AGG3` (server), `client-cache.C13` (client) · **Severity: Medium** · **Both transports**

### Symptom
Two `RunView` calls that differ only in the **order** of their `Aggregates[]` share one cache slot; the
second caller receives `AggregateResults` in the **first** caller's order. A consumer that reads
`result.AggregateResults[i]` positionally gets the wrong aggregate's value.
Confirmed (server and client): warming with `[COUNT(*) as Cnt, MAX(...) as MaxUpd]` then requesting
`[MAX(...) as MaxUpd, COUNT(*) as Cnt]` returned results ordered `["Cnt","MaxUpd"]` — the reverse of the
second caller's input.

### Root cause
`generateAggregateHash` **sorts** the aggregate expressions before hashing
(`packages/MJCore/src/generic/localCacheManager.ts:1236`, the `.sort()` at `~:1244`), so aggregate order is
not part of the fingerprint. On a cache hit the provider returns `cached.aggregateResults` **verbatim**
(`providerBase.ts:2003`; client paths at `:2137` / `:2372`) with no re-ordering to the caller's input. This
contradicts the documented contract: `RunViewResult.AggregateResults` is "*in same order as input Aggregates
array*" (`packages/MJCore/src/generic/interfaces.ts:882`; also `packages/MJCore/src/views/runView.ts:334`).

### Impact
Silent wrong values for any code that reads `AggregateResults` positionally after a reordered-but-equivalent
aggregate query was cached. Affects both the server cache and the client (GraphQL) smart cache.

### Reproduction
`aggregates-cache.AGG3` (server) and `client-cache.C13` (client) warm with `[A,B]`, read with `[B,A]`, and
assert `AggregateResults[i].alias` matches the caller's own input order. Both currently fail.

### Proposed fix
Remove the `.sort()` in `generateAggregateHash` so aggregate order participates in the fingerprint (matches
`RunQuery`'s no-normalization precedent; reordered aggregates get their own slot). Trivial and consistent.
Alternative: re-order the cached `AggregateResults` to the caller's `params.Aggregates` order (by
expression+alias) on every hit path — more invasive (5 call sites) and must handle duplicate expressions.

---

## Additional finding A — `SaveViewResults: true` throws a SQL error

> **Suggested issue title:** *`RunView({ SaveViewResults: true })` fails: view-run logging casts the GUID view ID with `Number()` (→ NaN) and interpolates the user email unquoted*
> **Labels:** `bug`, `sql`, `P2` · **Severity: Medium (broken feature)** · Report-only (no bundle check; different subsystem)

### Root cause
`executeSQLForUserViewRunLogging` (`packages/SQLServerDataProvider/src/SQLServerDataProvider.ts:648`) builds:

```sql
EXEC [__mj].spCreateUserViewRunWithDetail(${viewId}, ${user.Email}, @ViewIDLIst)
```

where `viewId` is `Number(viewEntity.ID)` (`GenericDatabaseProvider.ts:1593`). Modern MJ view IDs are
**GUIDs**, so `Number(guid)` → **`NaN`**, and `user.Email` is interpolated **without quotes**. The generated
statement `spCreateUserViewRunWithDetail(NaN, not.set@nowhere.com, ...)` fails with *Incorrect syntax near
'NaN'*. Any `RunView` with `SaveViewResults: true` therefore fails.

> This also *shields* a would-be cache bug: `ShouldBypassDedup` (`providerBase.ts:1547`) bypasses the **dedup**
> layer for `SaveViewResults` because it "creates DB records", but `runViewCacheEligible` does **not** exclude
> it from the **persistent** cache — so a cached `SaveViewResults` run would skip creating the `UserViewRun`.
> That asymmetry is latent because the feature errors out before caching. Fixing the SQL below would expose it;
> `SaveViewResults` should be excluded from the persistent cache too.

### Proposed fix
Pass the view ID as a quoted `uniqueidentifier` literal (drop the `Number()` cast) and pass the email as a
quoted string literal (ideally parameterized). Add `SaveViewResults` to the cache-ineligible predicate.

---

## Additional finding B — 32-bit hash on the RLS security segment

> **Suggested issue title:** *RLS cache-key segment uses a 32-bit non-cryptographic hash — collision = cross-user cache serve*
> **Labels:** `security`, `hardening`, `P3` · **Severity: Low probability / high impact** · Report-only

### Root cause
The `rls:<hash>` segment that keeps one user's row-level-scoped cache entry from serving a differently-scoped
user is produced by `simpleHash` — djb2, 32-bit (`packages/MJCore/src/generic/localCacheManager.ts:1257`). A
hash collision between two different RLS clauses yields the **same** fingerprint segment → cross-user serve.
A real collision was brute-forced: `djb2('c1r') == djb2('c30') == b885ecb`, and because equal-length
colliding strings stay collided under any shared prefix, two different RLS clauses (`UserScope='c1r'` vs
`UserScope='c30'`) produce the identical fingerprint. The same weakness applies to `aggHash`.

### Impact
Per-pair probability is ~2⁻³², but the consequence is a cross-user / cross-tenant data leak, and the birthday
bound applies across many distinct clauses. Using a non-cryptographic 32-bit hash for a security boundary is a
latent risk.

### Proposed fix
Use a collision-resistant hash (e.g. truncated SHA-256) for the `rls:` segment specifically, or embed the RLS
clause verbatim in the key (it is already present in the executed SQL, so it is not secret).

---

## Additional finding C — ViewID-only view runs omit the RLS segment

> **Labels:** `security`, `caching`, `P2` · **Severity: High if reachable** · Latent — could not verify live (this DB has no two distinct RLS users)

`ComputeRunViewRLSWhereClause` returns `''` when `params.EntityName` is unset
(`packages/MJCore/src/generic/providerBase.ts:1901`). A stored view run by `ViewID` **without** `EntityName`
therefore gets **no** `rls:` segment in its fingerprint, even though `InternalRunView` still applies RLS in the
SQL (`GenericDatabaseProvider.ts:1556`). Two differently-scoped users running the same view-by-ID would share
one cache slot → cross-user serve. Additionally such an entry is indexed under entity `Unknown`, so it is never
invalidated. This overlaps bug 2 (view-by-ID caching is already broken) and should be resolved by the same fix
(key on ViewID/ViewName and resolve the entity/RLS before fingerprinting). Needs a DB with two distinct RLS
users to demonstrate end-to-end.

---

## Suggested fix sequencing

1. **Bug 1 (S31)** — critical security; fix first. Enforce read permission before the cache read.
2. **Bug 2 (S29) + finding C** — high; key the fingerprint on `ViewID`/`ViewName` (and resolve entity/RLS
   before fingerprinting).
3. **Bug 4 (S28)** — one-line fingerprint addition.
4. **Bug 5 (AGG3/C13)** — one-line (`.sort()` removal).
5. **Finding A** — fix the `SaveViewResults` SQL; exclude it from the persistent cache.
6. **Finding B** — widen the RLS-segment hash.
7. **Bug 3 (S30)** — correct the docs now; scope a dependency-based invalidation design separately.

## Reproductions added (for reference)

All under `packages/TestingFramework/testing-integration/src/checks/`:

- `server-cache.checks.ts`: **S28** (IgnoreMaxRows), **S29** (view WhereClause, mutation), **S30**
  (denormalized staleness, mutation), **S31** (authorization bypass) — plus the passing coverage check **S27**
  (OrderBy identity).
- `aggregates-cache.checks.ts`: **AGG3** (aggregate order).
- `client-cache.checks.ts`: **C13** (aggregate order over GraphQL).
- Passing coverage added alongside: `runquery-cache.Q10`, `dataset-cache.DS3`, `rls-isolation.RLS4`.

The count/mutation guards in `src/__tests__/check-registry.test.ts` and the inventory in `CHECK_MAP.md` were
updated to match.
