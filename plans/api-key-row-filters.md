# API-Key-Scoped Row Filters

**Branch:** `claude/api-key-row-filters-98ev39`
**Status:** Plan approved (v2.2) — migration written, all blocking decisions resolved, implementation not started
**Proposed implementation owner:** @jordanfanapour (cc @MarceloT-BC)
**Date:** 2026-08-02
**Supersedes:** the original "Row-Level Filter Rules for MJ API Key Scopes" proposal (written against the public
`@memberjunction/api-keys` README, without access to internals)
**Packages touched:** `@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/api-keys`,
`@memberjunction/api-keys-base`, `@memberjunction/server`, `@memberjunction/core-entities` (generated)

> **v2 changelog.** A security review against the actual source found a **critical fail-open** in v1's design (§5.5 folded
> the key filter into a method that early-returns for exempt users — see §5.5 below), resolved the caching question with a
> concrete answer and a testable invariant (§5.7), and added five bypass paths v1 did not address (§5.6). v1's core
> direction — extend RLS rather than build a parallel path — survived review unchanged.
>
> **v2.1 changelog.** §9.1 resolved in favor of the FK. The shared-filter drift hazard that choice introduces is closed by a
> same-entity invariant (§5.3 check 6) plus a second enforcement point on filter save (§5.3) — the latter is mandatory under
> either storage option, because without it the save-time validation is bypassable by editing `FilterText` after attaching.
> Migration written (§8 Phase 2). §9.2 (`full_access` semantics) also resolved: the combination is **invalid and rejected**,
> not silently resolved either way — see §5.6.1. **No decisions remain blocking implementation.**
>
> **v2.3 changelog — post-approval review (PR #3409, MarceloT-BC; findings verified against source before adoption).**
> All six findings held. (M1) `CheckRecordRLS` interpolates the PK unescaped — a client-reachable RLS bypass; fixed in WS1
> alongside (M5) the raw numeric branch of the projection builder. (M2) `MarkupFilterText` substitutes `"undefined"` for
> own-but-undefined properties and never escapes values — §5.4 now extends the fail-closed rule to the `{{User*}}` surface.
> (M3) new cache invariant INV-3: fingerprint and WHERE must be computed for the same principal. (M4) the legacy RLS method
> is deprecated with a no-new-callers repo guard. (M6) the `ReportResolver` injection upgraded to its own ticket. §9.8 ack
> adopted with the error-message condition (key-wide deny must name cause + remedy); §9.4: `ActingCompanyIDs` registered
> **list-capable** — cardinality treated as a one-way door. Four tickets enumerated in §5.10.
>
> **v2.2 changelog — post-review (PR #3409, cadam11).** All four review observations verified against source and adopted:
> (1) §5.9's coverage claim was overstated — `query:run`/`query:test`/`dataset:read`/`report:run` bypass RLS entirely
> (queries by documented design; the query cache carries **no user segment**); new §5.10 is the scope×RLS matrix, with v1
> denying those scopes to filtered keys. (2) Binding mechanics answered concretely in §5.5.1 (per-request stamp on the
> cloned `UserInfo`; staleness = `scopeCacheTTLMs`, same envelope as scope enforcement; object-valued stamps are outside the
> token surface). (3) §5.6 rows 3/4 escalated from warn/document to **startup refusal**. (4) WS1/WS2 split into their own
> PR; §3.2's "reordering" wording fixed — nothing existing moves. Verification also surfaced rule shadowing (§5.4: a
> higher-priority unfiltered rule would silently defeat a filter; evaluation now ANDs all matching filters) and a
> stamp-dropping `UserCache` re-fetch in `ReportResolver` (§5.6 row 11).

---

## 1. Executive summary

The original proposal asked for a new `RowFilter` expression language on API key scope rules, with its own parameter
declarations, its own binding rules, and its own enforcement path in `RunView`/`BaseEntity`.

Grounding it against the codebase changed the shape of the work substantially:

- **MJ already has the mechanism.** Role-based RLS (`RowLevelSecurityFilterInfo` + `EntityInfo.GetUserRowLevelSecurityWhereClause`)
  is a filter-template engine with runtime token substitution, applied on read, save, delete, and search. Magic-link resource
  scoping (`{{ScopeResourceID}}`) is already "template + per-session value from a verified token + fail-closed on absence" —
  precisely the pattern the proposal describes.
- **The actual gap is narrower and sharper.** MJ's row filtering binds to **roles** and **sessions**, never to an **API key**.
  Two keys issued to the same user have identical row visibility, and there is no way to narrow one below the other. An API
  key cannot be *less* than its owner — which is what makes key rotation and revocation meaningful as a blast-radius control.
- **Two of the proposal's security requirements describe live defects.** "Writes check both states" and "never interpolate"
  are not forward-looking requirements here; they name bugs that exist in the tree today. Those are higher-value than the
  feature and must land first.

Three workstreams in dependency order:

| WS | What | Why first |
|---|---|---|
| **WS1** | Update RLS checks the post-image, not just the pre-image | Live privilege-escalation path affecting every RLS user; also a hard prerequisite for any key filter on `entity:update` to mean anything |
| **WS2** | Multi-tenancy: injection-safe tenant predicate + per-session `UserInfo` isolation | Live injection path in an opt-in feature; the same `UserInfo`-mutation mistake would be repeated by WS3 |
| **WS3** | API-key-scoped RLS | The feature. Built as an extension of the existing RLS mechanism, not a parallel one |

**Design commitment:** WS3 ships as *the existing RLS mechanism, additionally keyed to API keys*. Not a second filter
language. A filter that is trusted as the last line of defense but enforced on only one data path is worse than no filter,
because callers will assume the other paths are covered. If we cannot land it as an RLS extension, we should not land it.

**Governing principle for every open decision in this plan: a row filter must fail closed, and it must fail *loudly*.**
Every ambiguity below is resolved in the direction of "deny and say why," never "return everything" and never "return
nothing silently."

---

## 2. Grounding: what exists today

### 2.1 Role-based RLS

`RowLevelSecurityFilterInfo` (`packages/MJCore/src/generic/securityInfo.ts:394`) holds a `FilterText` template.
`MarkupFilterText(user)` (`:463`) substitutes `{{UserFieldName}}` tokens from any scalar property of `UserInfo`, plus
`{{ScopeResourceID}}` / `{{ScopeResourceType}}` from `UserInfo.MagicLinkScope` (`:474-479`).

`EntityInfo.GetUserRowLevelSecurityWhereClause(user, type, prefix)` (`packages/MJCore/src/generic/entityInfo.ts:2309`)
**first checks exemption** (`:2312`), and if not exempt, ORs together every filter the user's roles carry for that
permission type (`:2318-2324`). Filters attach to an entity+role via `EntityPermission.{Read,Create,Update,Delete}RLSFilterID`
(`entityInfo.ts:319-322`).

Applied at:

| Site | File |
|---|---|
| `RunView` WHERE assembly (step 5) | `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts:1590` |
| RunView **cache fingerprint** (via `ComputeRunViewRLSWhereClause`) | `packages/MJCore/src/generic/providerBase.ts:2190`, used at `:2292` and `GenericDatabaseProvider.ts:2237, 2447, 2606` |
| `BaseEntity.Load()` by primary key | `GenericDatabaseProvider.ts:3811` |
| Save — new record (post-image) | `GenericDatabaseProvider.ts:3910` `CheckCreateRLS` |
| Save — existing record (pre-image) | `:3884` `CheckRecordRLS` |
| Delete | `packages/MJCore/src/generic/databaseProviderBase.ts:1487` |
| External-source read guard | `GenericDatabaseProvider.ts:2509` `assertExternalReadAllowedUnderRLS` |
| Search | `packages/SearchEngine/src/generic/SearchEngine.ts:1897` |
| GraphQL resolver helper | `packages/MJServer/src/generic/ResolverBase.ts:1002` |

RLS is already AND-composed with `ExtraFilter`, user search, and exclusion filters (`GenericDatabaseProvider.ts:1550-1594`).

### 2.2 🚨 The RLS exemption is an early return, and it is broad

`UserExemptFromRowLevelSecurity` (`entityInfo.ts:2231`) walks the entity's permissions and returns `true` **as soon as it
finds any role the user holds whose `EntityPermission` row for that permission type has no RLS filter ID** (`:2238-2252`).
It does not check whether the permission is actually granted (`CanRead` etc.) — only that a filter is absent.

`GetUserRowLevelSecurityWhereClause` then returns `''` immediately (`:2312-2314`) — no filter at all.

**Consequence, and it is the single most important fact in this document:** the users who hold API keys are
disproportionately service accounts, integration users, and admins with at least one broad role. Those users are *exempt*.
Any row filter folded into this method after the exemption check is **silently absent for exactly the principals the feature
exists to constrain**, and it would pass any test written with a narrow-role fixture user. See §5.5.

### 2.3 Per-session context on `UserInfo`

`UserInfo` carries four per-session context objects — `TenantContext`, `MagicLinkScope`, `ReturningVisitorContext`,
`WidgetGuestContext` — as getter/setter pairs over `_`-prefixed backing fields (`securityInfo.ts:200-278`). A precision that
matters for the token-surface analysis in §5.5.1: the **getters** are non-enumerable prototype accessors, but the **backing
fields are enumerable own properties** (declared with initializers under `useDefineForClassFields: false`, so they become
constructor assignments). What keeps context objects out of `MarkupFilterText`'s `{{UserX}}` token surface is not
enumerability — it is the `typeof val !== 'object'` guard at `securityInfo.ts:470`, which skips object-valued properties.
The one scalar backing field, `_IsMagicLinkAnonymous`, *does* enter the token surface (as `{{User_IsMagicLinkAnonymous}}`);
no filter authors that token today, and §5.3's vocabulary check keeps underscore tokens out of key filters.

`buildMagicLinkSessionUser` (`packages/MJServer/src/context.ts:202`) constructs a **fresh** `UserInfo` before setting any of
these. The comment at `:197-200` states why: *"the resolved userRecord may be a SHARED cached instance … mutating it would
leak one session's scope to another."*

The clone works, but by a subtle mechanism worth stating because WS2/WS3 depend on it: `UserInfo`'s constructor
(`securityInfo.ts:203-207`) calls `BaseInfo.copyInitData`, which assigns a key **only if `Object.prototype.hasOwnProperty.call(this, key)`**
(`packages/MJCore/src/generic/baseInfo.ts:20-42`). Spreading a `UserInfo` does *not* capture the public getters, but *does*
capture the `_`-prefixed backing fields, which are own properties — which is how the contexts survive. Roles need the
explicit `_UserRoles: undefined` / `UserRoles: …` dance the magic-link path performs, because the constructor reads
`initData.UserRoles || initData._UserRoles` (`:207`).

### 2.4 Data hooks

`PreRunViewHook` / `PostRunViewHook` / `PreSaveHook` with `RegisterDataHook` / `GetDataHooks`
(`packages/MJCore/src/generic/dataHooks.ts:23-88`), consumed at `providerBase.ts:3123` (RunView), `providerBase.ts:2355`
(RunViews), and `baseEntity.ts:2666` (Save). `MJTenantFilterMiddleware` is the working reference consumer.

**Coverage caveat:** `PreRunViewHook` covers `RunView`/`RunViews` only — not `BaseEntity.Load()` by primary key, not
`RunQuery`, not single-record GraphQL resolvers. RLS covers more of those. This is the decisive argument for the RLS-extension
route over a hook-only implementation.

### 2.5 API key authorization

`APIKeyEngine.Authorize()` (`packages/APIKeys/Engine/src/APIKeyEngine.ts:546`) → `ScopeEvaluator.EvaluateAccess()`
(`ScopeEvaluator.ts:67`), pure in-memory evaluation over `APIKeysEngineBase` caches. It never touches entity data.

Enforcement is invoked at the **resolver** boundary — `ResolverBase.CheckAPIKeyScopeAuthorization` (`:654`), called from
~20 resolvers. Data access happens later, in the provider. The two layers never meet.

Two blanket bypasses exist above the scope evaluator: `enforcementEnabled: false` returns `Allowed` unconditionally
(`APIKeyEngine.ts:596`), and a `full_access` grant short-circuits the specific scope check (`ResolverBase.ts:679-692`).

`AuthorizationRequest` already declares `Context?: Record<string, unknown>` (`interfaces.ts:121`), currently written and read
by nobody.

Scope rule schema — `APIKeyScope` (`migrations/v5/B202602151200__v5.0__Baseline.sql:14068`) and `APIApplicationScope`
(`:14869`), both: `ID, {APIKeyID|ApplicationID}, ScopeID, ResourcePattern nvarchar(750) NULL, PatternType, IsDeny, Priority`.

### 2.6 Known limits of the current filter path

- **No parameter binding anywhere on the filter path.** `MarkupFilterText` does `ret.replace(..., String(val))`.
  `InternalRunView` concatenates every predicate into one WHERE string and calls `ExecuteSQL(viewSQL, undefined, ...)`
  (`GenericDatabaseProvider.ts:1671`) — the parameters argument is always `undefined` on this path. Binding infrastructure
  *does* exist (`ExecuteSQL(query, parameters)`, positional `?`→`@pN` and named `@param`; used e.g. at `:3990`).
- **The only guard is a keyword blocklist.** `ValidateUserProvidedSQLClause` (`databaseProviderBase.ts:983`) strips string
  literals first, then tests 12 patterns (`insert|update|delete|exec|execute|drop|--|/*|*/|union|xp_|;`). No rule for `OR`.
  `SQLExpressionValidator` (`packages/MJGlobal/src/SQLExpressionValidator.ts`) is richer but has the same
  strip-literals-then-keyword-match structure.
- **Platform variants are not wired on the RLS path — and the code that suggests otherwise is dead.** To be precise, since
  a careless reading invites wiring it up and assuming it works: `RowLevelSecurityFilterInfo` declares a `PlatformVariants`
  property and a working `GetPlatformFilterText()` (`securityInfo.ts:414-455`), but **no `PlatformVariants` column exists on
  the `RowLevelSecurityFilter` table** to feed it — the property is always null — and `GetUserRowLevelSecurityWhereClause`
  calls `MarkupFilterText()`, which reads `this.FilterText` directly anyway. Making that path real needs a column, CodeGen,
  and a call-site change. Cross-platform filter text is an **open item, not a freebie**.

---

## 3. WS1 — Update RLS must check the post-image

### 3.1 The defect

`databaseProviderBase.ts:1335`, on save of an existing record, calls
`CheckRecordRLS(entity, user, EntityPermissionType.Update)`. That method (`GenericDatabaseProvider.ts:3884`) runs:

```sql
SELECT COUNT(*) AS cnt FROM <view> WHERE <PK> = <value> AND (<rls>)
```

That reads the row **as it exists in the database** — the pre-image. `CheckCreateRLS` (`:3910`) validates the post-image, but
only fires for new records (`bNewRecord`).

**Consequence:** an update that moves a row *out* of the caller's filter passes. With a filter of
`OrganizationID = '{{UserOrganizationID}}'`, a caller can take a row they legitimately own and set `OrganizationID` to an org
they do not belong to. Privilege escalation, live today for every RLS-governed entity, independent of API keys.

### 3.2 The fix

After the pre-image check passes, validate the post-image using the same synthetic-row technique `CheckCreateRLS` uses, with
the **Update** filter and the entity's pending values:

```sql
SELECT CASE WHEN (<update rls>) THEN 1 ELSE 0 END AS pass FROM (SELECT <projections>) AS newrow
```

Both checks must pass. Pre-image failure keeps the existing generic message (`databaseProviderBase.ts:1338-1341` deliberately
does not distinguish "not found" from "access denied", to prevent ID enumeration); post-image failure gets its own message,
since the caller demonstrably has access to the row and the diagnostic leaks nothing.

**Projection correctness — typed NULLs.** `BuildCreateRLSProjections` (`:3930`) skips fields whose value is `null`. That is
acceptable for create but wrong for update: a filter referencing a column the caller just nulled would see the column missing
from the subquery rather than `NULL`. The update projection must emit **every** non-virtual field, including nulls.

A bare `SELECT NULL AS Col` has no type, and comparisons against an untyped NULL can behave differently from a real row
(notably in `CASE`/`CAST` contexts and under `CONCAT_NULL_YIELDS_NULL` settings). Emit `CAST(NULL AS <sqltype>) AS <Col>`,
taking `<sqltype>` from `EntityFieldInfo` (`Type`, `Length`, `Precision`, `Scale`) — the same metadata CodeGen uses. If a
field's SQL type cannot be resolved, **fail the save**; do not emit an untyped NULL and hope.

**Cost control — and why the obvious optimization is rejected as designed.** v1 proposed parsing column references out of the
resolved filter and skipping the post-image check when no referenced field is dirty. That optimization **fails open**: a
reference the parser misses (aliased column, function-wrapped column, column inside a subquery, case variance, a value
changed by a DEFAULT/trigger/computed column rather than an explicit `Set`) silently skips a required authorization check.

Revised rule: **the post-image check runs by default.** The skip is permitted only when the resolved filter fully decomposes
into a conjunction of simple `Column <op> <literal|token>` terms that the parser understands completely, and none of those
columns is dirty. If decomposition is not total — for any reason — run the check. The parser must return
"fully-understood: yes/no", and "no" means run it. A fail-open optimization in an authorization path is not a performance
win; it is a vulnerability with a benchmark attached.

**Hook ordering.** The post-image check must run **after** `OnBeforeSaveExecute` (`databaseProviderBase.ts:1347`), not before.
Before-save hooks (entity actions, AI actions, the multi-tenancy `PreSaveHook`) can mutate field values, including
filter-referenced ones. A check that runs before them validates a state that is not what gets written.

To be precise about what changes, because an earlier draft's wording invited misreading: **nothing existing moves.** The
pre-image check stays at step 2b and `OnBeforeSaveExecute` stays at step 3; the post-image check is a *new* step inserted
after hooks complete, so it validates final values. No existing hook's ordering or inputs change. The only difference hooks
observe is that their mutations now land *inside* the authorization boundary instead of after it — which is the point.

**Escaping fixes folded into WS1** (review findings M1/M5, both verified). `CheckRecordRLS` interpolates the primary-key
value with **no quote escaping** (`GenericDatabaseProvider.ts:3895-3899`), while the `Load()`-by-PK path 90 lines earlier
escapes and carries a comment calling the unescaped case an injection vector (`:3800-3804`) — the fix was made in one place
and missed in the authorization check. It is reachable with client input: for entities with `TrackRecordChanges = false`,
the update resolver does `LoadFromData(clientOldValues)` then `Save()` (`ResolverBase.ts:1250-1253`), so the PK value is
client-supplied and `' OR '1'='1` makes the `SELECT COUNT(*)` pass RLS on a row the caller cannot see. WS1 rewrites this
method — apply the same `''`-escaping as the Load path. Likewise `BuildCreateRLSProjections` (`:3930-3948`) escapes quoted
fields but emits `String(val)` raw for non-quoted (numeric) fields; the generalized typed-CAST builder escapes/validates
every branch (a numeric field's value must parse as a number or the save fails).

**ReplayOnly** (`options.ReplayOnly`) skips the RLS checks but executes no SQL (`databaseProviderBase.ts:1286-1293`,
`:1393` — `result = [entity.GetAll()]`), so no write escalation exists there; WS1 confirms after-save hooks stay safe on
that path and otherwise leaves it alone.

### 3.3 Scope

WS1 covers the **update** path. Explicitly in scope to verify and, if broken, fix in the same workstream:

- **Delete** (`databaseProviderBase.ts:1487`) — pre-image only is *correct* for delete; no post-image exists. Confirm no change needed.
- **Transaction groups** — `TransactionGroupResolver` routes items through the CRUD path; confirm the post-image check runs per item.
- **Composite-PK entities** — `CheckRecordRLS` builds `pkWhere` from `entity.PrimaryKeys` (`:3897`); the post-image path must handle composites identically.

### 3.4 Files

- `packages/MJCore/src/generic/databaseProviderBase.ts` — insert the post-image call after the before-save hook; declare the
  abstract method alongside `CheckRecordRLS`/`CheckCreateRLS` (`:1583`, `:1593`)
- `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` — implement; generalize `BuildCreateRLSProjections` into a
  shared projection builder with an include-nulls, typed-CAST mode

### 3.5 Risk

This tightens behavior on a path that previously allowed the operation. Deployments with an Update RLS filter and code that
legitimately reassigns a filter-referenced column (a genuine ownership-transfer flow) will start failing. Mitigation: such a
flow should run as an RLS-exempt principal. **Note the tension with §2.2**: exemption is broad and easy to acquire, so
"just make it exempt" is a real escape hatch that weakens the boundary elsewhere. Prefer narrowing the Update filter to permit
the legitimate transition over granting exemption. Call this out in the changeset — it is a behavior change, and the correct one.

---

## 4. WS2 — Multi-tenancy: injection and session isolation

Both defects are in `packages/MJServer/src/multiTenancy/index.ts`. The feature is opt-in
(`configInfo.multiTenancy?.enabled`, default off — `middleware/MJTenantFilterMiddleware.ts:25`), so neither is a live
default-path vulnerability. Both are fixed here because WS3 would otherwise repeat them.

### 4.1 Injection via the tenant header

`createTenantPreRunViewHook` (`:106`) builds:

```ts
const tenantFilter = `[${tenantColumn}] = '${contextUser.TenantContext.TenantID}'`;
```

`TenantID` can come straight from a request header when `contextSource === 'header'` (`:42-47`), unvalidated. Downstream,
that string reaches `ValidateUserProvidedSQLClause`, which strips string literals *before* keyword matching and has no rule
for `OR`. A header value of `x' OR '1'='1` yields `[TenantID] = 'x' OR '1'='1'`, strips to `[TenantID] =  OR =`, passes
validation, and defeats tenant scoping entirely.

**Fix, defense in depth — with the exact transformations specified:**

1. **Validate at the boundary.** `attachTenantContext` rejects any tenant id not matching `^[A-Za-z0-9_.\-]{1,128}$` (GUIDs
   included). Malformed → fail the request with 400. A rejected header must never degrade to "no tenant context," which would
   silently produce an *unscoped* session — that is the fail-open case and it is the whole point of validating.
2. **Escape at construction, platform-aware.** Even with (1), escape the value where the predicate is built, so a future
   caller reaching `attachTenantContext` from `'linkedEntity'` or `'custom'` cannot reintroduce the hole. Single-quote
   escaping is `'` → `''` for both SQL Server and Postgres. Do **not** rely on backslash escaping (Postgres
   `standard_conforming_strings` dependent).
3. **Bound and quote the column identifier.** `tenantColumn` is operator config, not user input, but it is interpolated into
   a bracket identifier. Verify it resolves to a real non-virtual field on the entity (reject otherwise), and quote via the
   provider's own `QuoteIdentifier` rather than hardcoded `[...]` — which also fixes (4).
4. **Platform correctness.** `[${tenantColumn}]` is T-SQL bracket syntax hardcoded in a provider-agnostic hook; it is invalid
   on Postgres. Using `QuoteIdentifier` resolves it. In-scope for WS2, not deferred — a tenant filter that throws on Postgres
   is a broken security control, and one that *doesn't* throw is worse.

### 4.2 Shared-`UserInfo` mutation

`createTenantMiddleware` calls `attachTenantContext(userPayload.userRecord as UserInfo, ...)` (`:45`), mutating in place. For
JWT and API-key sessions alike, `userRecord` may be the **shared `UserCache` instance** (`context.ts:400-405` for the API-key
path). Two concurrent requests for the same user with different tenant headers race on one object.

**Fix:** clone to a fresh `UserInfo` before setting per-session state and write it back to `userPayload.userRecord`, as
`buildMagicLinkSessionUser` does (`context.ts:258-276`). Extract clone-then-stamp into one shared helper so WS3 and any future
per-session context use the same path.

**The helper is load-bearing for authorization and must be tested as such.** Per §2.3, the clone survives only because
backing fields are own properties and `copyInitData` gates on `hasOwnProperty`. A tsconfig change to class-field semantics,
or a refactor that converts a backing field to a `#private` field or a `WeakMap`, would silently drop context or roles — and
dropping a *restricting* context fails open. Unit-test that a cloned `UserInfo` preserves: `UserRoles` (identity and count),
all four existing contexts, and the new `APIKeyActingContext`.

### 4.3 Note on `createTenantPreSaveHook`

It validates `entity.Get(tenantColumn)` — the post-image — and auto-stamps the tenant on new records (`:163-172`). Correct
shape; no change needed. Worth observing that the multi-tenancy hook got the post-image right while core RLS (WS1) did not.

---

## 5. WS3 — API-key-scoped RLS

### 5.1 Shape

Add an optional filter reference to both scope-rule tables:

| Table | Column | Type | Meaning |
|---|---|---|---|
| `APIKeyScope` | `RowFilterID` | `uniqueidentifier NULL` FK → `RowLevelSecurityFilter.ID` | Row restriction this key's grant carries. NULL = current behavior. |
| `APIApplicationScope` | `RowFilterID` | `uniqueidentifier NULL` FK → `RowLevelSecurityFilter.ID` | Ceiling filter every key in the application inherits and cannot widen. |

**Why an FK to the existing `RowLevelSecurityFilter` rather than an inline `RowFilter nvarchar(max)`** *(decided — §9.1)*:
it reuses the substitution engine, matches how `EntityPermission` already references filters, inherits whatever
platform-variant work lands later without a second migration, and — the security argument — the FK makes the filter
**undeletable while referenced**. With `NO ACTION` (the default), you cannot silently un-filter a live API key by deleting
its filter record. An inline column has no equivalent: clearing it is an ordinary update.

`RowLevelSecurityFilter` today has exactly four referrers, all from `EntityPermission`
(`FK_EntityPermission_{Read,Create,Update,Delete}RLSFilter`, baseline `:73367-73377`). These columns make it six.

**The one hazard the FK introduces, and how it is closed.** A filter record carries *no entity binding* — it is only
`ID / Name / Description / FilterText`. All entity context lives in the referrer: `EntityPermission` supplies it via
`EntityID`, an `APIKeyScope` via `ResourcePattern`. So one filter record can be pointed at two *different* entities by two
rows, and `FilterText` is a column-level expression that is only valid against entities having those columns. Reuse is not a
requirement for this feature, so rather than accommodate that, we forbid it (§5.3 check 6): **every referrer of a filter must
resolve to the same entity.** Sharing between two `APIKeyScope` rows on the same entity — a read rule and an update rule —
stays legal, which is the only sharing pattern that is actually plausible.

### 5.2 Runtime values: a registered vocabulary, not free-form parameters

Add a fifth per-session context to `UserInfo`, alongside the existing four:

```ts
/**
 * Per-request acting context for an API-key session. Set server-side from an authenticated
 * identity; consumed by API-key-scoped RLS filters via the {{Acting*}} tokens.
 *
 * TRUST BOUNDARY: these values MUST be derived server-side. The engine binds what it is given
 * and cannot validate provenance. Never populate from a client-supplied header, argument, or
 * GraphQL variable. Never expose via a resolver — see §5.8.
 */
export interface APIKeyActingContext {
    /** Organization / tenant the caller is acting on behalf of. */
    ActingOrganizationID?: string;
    /** Person / contact the caller is acting on behalf of. */
    ActingPersonID?: string;
    /** Opaque per-integration scope value. */
    ActingScopeID?: string;
    /** Companies the caller is acting for — LIST-capable (see cardinality note). */
    ActingCompanyIDs?: string[];
}
```

Tokens `{{ActingOrganizationID}}`, `{{ActingPersonID}}`, `{{ActingScopeID}}`, and `{{ActingCompanyIDs}}` resolve in
`MarkupFilterText` alongside the existing ones.

**Cardinality is a one-way door — decided now, per review.** "Adding a token later is a typed code change" holds for adding
*new* tokens, but not for changing an existing token's **shape**: a scalar token can only ever express
`Col = '{{ActingCompanyID}}'`, and moving to a set later breaks every filter already authored against it. Accounting-style
workloads (consolidated views, shared-services users across several companies) need sets on day one. So `ActingCompanyIDs`
is **list-capable from the start**: `Col IN ({{ActingCompanyIDs}})`, with the registered validator checking each element
(GUID), quoting and `''`-escaping each, and resolving an **empty or absent set to `(1=0)`** — same composition as §5.4's
unresolved-token rule. The three scalar tokens stay scalar; that is now an explicit, documented one-way door for each.
(`ActingCustomerID` was considered and rejected: customers modeled as organizations are covered by `ActingOrganizationID`.)

This buys types without restating the schema (each token has a known validator — the two ID tokens are GUIDs,
`ActingScopeID` is a bounded identifier), removes the typo class entirely (an unknown token is caught at rule save), and
makes extension a typed code change rather than a schema change — matching how the other four contexts evolved. It also
eliminates the original proposal's `FilterParameters` JSON column.

### 5.3 Exactly one entity per filtered rule

A scope rule carrying `RowFilterID` must name a single exact entity in `ResourcePattern` — no wildcards, no comma-separated
lists. With patterns allowed, a rule could match an entity lacking the referenced column, and both available behaviors (deny,
or skip the filter) are wrong in an authorization path. Forbidding the case removes it.

Unfiltered rules keep full pattern support — no behavior change. The restriction can be relaxed later without breaking
anything; tightening later would be breaking.

**Enforcement** lives in a server-side entity subclass under `packages/MJCoreEntitiesServer/src/custom/` — a CHECK constraint
cannot express these. `PatternMatcher.isValidPattern` (`packages/APIKeys/Engine/src/PatternMatcher.ts:121`) is the natural
sibling for an `IsExactResourceName` helper.

Validated at rule save:

1. `ResourcePattern` is non-null, contains no `*` or `?`, and is not a comma-separated list.
2. `ResourcePattern` resolves via `Metadata.EntityByName` to a real entity.
3. Every `{{Token}}` in the filter's `FilterText` is a member of the registered vocabulary.
4. Every column identifier in `FilterText` resolves to a real, non-virtual, non-computed field on that entity.
5. **The filter is not a `PatternType='Exclude'` or `IsDeny` rule.** A row filter narrows an *allow*; attaching one to a deny
   or exclude rule has no coherent meaning and would read as though it restricted something. Reject at save.
6. **Every other referrer of this filter resolves to the same entity** (§5.1). Check the filter's existing `EntityPermission`
   rows (via `EntityID`) and `APIKeyScope` / `APIApplicationScope` rows (via `ResourcePattern`). Any disagreement → reject.

Check 4 supersedes the original proposal's `FilterParameters`-as-allowlist idea and is strictly stronger: it bounds *every*
column the expression touches. `SQLExpressionValidator.checkFieldReferences` exists in lenient warn-only form
(`SQLExpressionValidator.ts:391`, called from `:235`) — add a strict variant rather than writing a second parser.

**Validation needs a second enforcement point, on the filter itself.** Checks 4 and 6 constrain `FilterText` against an
entity, but they run when the *scope rule* is saved. Without an equivalent check when the *filter* is saved, all of it is
trivially bypassable: attach a valid filter, then edit its `FilterText` to reference anything. Add a
`MJRowLevelSecurityFilterEntityServer` subclass that, on save, re-runs checks 4 and 6 against **every** current referrer and
rejects if any fails. This is mandatory regardless of the FK-vs-inline decision — it is the difference between validation and
the appearance of validation.

Note this makes the filter record's edit path stricter than it is today for pure-`EntityPermission` filters, which currently
have no such validation. That is a deliberate tightening: an invalid RLS filter fails closed at query time (SQL error), but
"fails closed with an unexplainable 500" is not a good outcome either.

### 5.4 Fail closed, and fail diagnosably

Deny **before** any SQL is built:

- At load time, `APIKeysEngineBase` parses the `{{Token}}` set out of each referenced filter's `FilterText` and caches it
  (templates are principal-independent — safe to cache; **resolved** filters are principal-specific and must never be).
- `Authorize()` compares the matched rule's required tokens against the supplied acting context. Any missing or
  type-invalid value → **deny**, with a reason naming the token.
- A type mismatch denies. It does not coerce, and it does not silently match zero rows.

**Multiple matching rules — a filter cannot be shadowed.** `ScopeEvaluator.evaluateRules` sorts Priority DESC / IsDeny DESC
and **returns on the first matching allow rule** (`ScopeEvaluator.ts:184-211`); rules sorted below the winner are never
evaluated and never appear in `EvaluatedRules`. Left as-is, a key holding an unfiltered `Order*` Include rule at higher
priority plus a filtered exact `Orders` rule would grant **unfiltered** access to Orders — the filter silently defeated,
invisibly, by a priority number. Worse, same-priority ties fall back to load order of an ORDER-BY-less query
(`APIKeysEngineBase.ts:120-124` — the `_keyScopes` config has no OrderBy), which is not deterministic across cache reloads.

Required evaluation change: for the resource being authorized, collect **all** matching allow rules; the effective row
filter is the **AND of every filter carried by any matching allow rule**. An unfiltered matching rule still grants, but
contributes no filter and cannot cancel one — most-restrictive-wins, always. Deny rules keep their existing trumping
semantics. This also makes the same-priority nondeterminism moot for filtering (AND is order-independent); add an `OrderBy`
to the `_keyScopes`/`_appScopes` engine configs anyway so `MatchedKeyRule` is stable across reloads.

**Defense-in-depth substitution must be `(1=0)`, not `''`.** v1 proposed resolving an absent token to the empty string, as
`MagicLinkScope` does. That is safe for `Col = '{{Tok}}'` but **fails open** for other shapes a filter author may plausibly
write: `Col <> '{{Tok}}'` matches every row, `Col LIKE '%{{Tok}}%'` matches every row, `Col NOT IN ('{{Tok}}')` matches
nearly every row, and in an unquoted numeric context `''` is either a syntax error or coerces to `0`.

Revised rule: if any required token is unresolved at markup time, **the entire filter resolves to the literal `(1=0)`** —
matching nothing regardless of the expression's shape — and an error is logged naming the filter and token. Never substitute
an empty string into a predicate whose operator you do not control. (The existing `{{ScopeResourceID}}` → `''` behavior is
out of scope to change here, but it has the same latent weakness and deserves its own ticket.)

**The same rule must cover the existing `{{User*}}` surface, which WS3 makes load-bearing** (review finding M2, verified).
`MarkupFilterText`'s guard is `val !== null && typeof val !== 'object'` (`securityInfo.ts:470`) — **`undefined` passes it**
(`typeof undefined === 'undefined'`) and substitutes the literal string `"undefined"`. Run that through this section's own
analysis: `Col <> '{{UserOrganizationID}}'` becomes `Col <> 'undefined'` and matches every row — fail-open on the existing
token surface. `copyInitData` (`baseInfo.ts:20-42`) can produce own-but-`undefined` properties, so it is reachable. The same
function also never `''`-escapes `String(val)`, so a user-sourced value containing an apostrophe breaks any filter that
substitutes it — the same defect class WS2 fixes for the tenant header. WS3 therefore hardens `MarkupFilterText` itself:
treat `undefined` exactly like `null` (unresolved), and `''`-escape every substituted scalar. Both changes are
behavior-tightening for role RLS too and get their own regression tests.

### 5.5 🚨 Composition — and why it cannot live inside `GetUserRowLevelSecurityWhereClause`

**This section is the correction that motivated v2.** v1 said the key filter would be added inside
`GetUserRowLevelSecurityWhereClause` and conjoined. That is wrong and would have shipped a silent fail-open.

Per §2.2, that method early-returns `''` at `entityInfo.ts:2312` whenever `UserExemptFromRowLevelSecurity` is true — and
exemption is granted by holding *any* role with a filter-less permission row for that type. API keys are overwhelmingly held
by service accounts and admins, who are exempt. The key filter would therefore be dropped for precisely the principals it
exists to constrain, while appearing to work in any test using a narrow-role fixture.

The exemption is a property of **role RLS** — "this user has a role that grants unrestricted access" — and must not extend to
a key ceiling, whose entire purpose is to restrict a principal *below* what their roles allow.

**Design:** introduce a new method on `EntityInfo` and move the call sites to it:

```ts
/**
 * Effective row-filter clause: role RLS (subject to role exemption) AND the API-key and
 * application ceiling filters (NOT subject to role exemption — a key ceiling must bind an
 * exempt principal, that is its purpose). Returns '' only when no layer contributes.
 */
public GetEffectiveRowFilterWhereClause(user: UserInfo, type: EntityPermissionType, returnPrefix: string): string
```

Composition:

```
[ role RLS: (roleA OR roleB), or '' if exempt/none ]
  AND [ application ceiling filter, or omitted if none ]
  AND [ key scope filter, or omitted if none ]
```

- **OR within the role layer** — existing, unchanged semantics; a user's roles are additive.
- **AND across layers** — no layer can widen another. An exempt user gets `''` for the role term and the key term still
  applies. This is what makes "a key can be less than its owner" true.
- `GetUserRowLevelSecurityWhereClause` keeps its current signature and semantics for backward compatibility; the new method
  wraps it. **But the old name is a permanent fail-open trap** (review finding M4): it is the familiar name a future call
  site will reach for, and it silently omits key filters. Mark it `@deprecated` pointing at
  `GetEffectiveRowFilterWhereClause`, and add a repo test asserting no non-test caller exists outside the new method — the
  nine-site migration is a one-time job; the guard against a tenth caller has to be permanent.

**Call sites to migrate — the complete list, verified.** `GetUserRowLevelSecurityWhereClause` has **nine** callers outside
tests. Every one is an enforcement point; a missed one is an unenforced path, so migrating all nine is part of the definition
of done:

| # | Site | What it guards |
|---|---|---|
| 1 | `GenericDatabaseProvider.ts:1590` | `InternalRunView` WHERE assembly (primary read path) |
| 2 | `GenericDatabaseProvider.ts:2361` | secondary WHERE assembly (alternate RunView path) |
| 3 | `GenericDatabaseProvider.ts:2510` | `assertExternalReadAllowedUnderRLS` — external-source refusal (§5.6 #5) |
| 4 | `GenericDatabaseProvider.ts:3811` | **`BaseEntity.Load()` by primary key** — the path a `PreRunViewHook` would miss |
| 5 | `GenericDatabaseProvider.ts:3890` | `CheckRecordRLS` — pre-image on update/delete |
| 6 | `GenericDatabaseProvider.ts:3915` | `CheckCreateRLS` — post-image on create |
| 7 | `providerBase.ts:2195` | `ComputeRunViewRLSWhereClause` — **feeds the cache fingerprint** (§5.7 INV-1) |
| 8 | `SearchEngine.ts:1897` | search path |
| 9 | `ResolverBase.ts:1002` | GraphQL resolver helper |

Site 4 is the concrete proof of §2.4's argument: `Load()` by PK is covered by RLS and would **not** have been covered by a
`PreRunViewHook` implementation.

#### 5.5.1 Where the binding lives (mechanics)

`EntityInfo` lives in MJCore, which cannot depend on the APIKeys packages — the dependency points the other way. The
key→entity→filter binding rows live in `APIKeyScope`, cached by `APIKeysEngineBase`. The bridge is the same one every other
per-session concern uses: **plain data stamped on `UserInfo`**.

- **Stamp point:** `context.ts`, in MJServer — which sees both sides. After key validation, resolve the key's filtered scope
  rules from `APIKeysEngineBase` into a compact binding set and stamp it, together with `APIKeyActingContext`, onto the
  **cloned** per-request `UserInfo` (the WS2 §4.2 helper):

  ```ts
  interface APIKeyRowFilterBinding {
      EntityID: string;
      PermissionType: EntityPermissionType;   // resolved from the rule's scope path at stamp time
      FilterID: string;
  }
  ```

  The scope-path→permission-type mapping is fixed here: `entity:read` and `view:run` → Read, `entity:create` → Create,
  `entity:update` → Update, `entity:delete` → Delete. Mapping by permission type (not scope path) at the data layer is
  deliberate — reads reach the provider via more than one scope, and `entity:read` is currently defined but unenforced at the
  resolver layer (reads gate through `view:run`, see §5.10), so the data layer must not care which resolver scope admitted
  the call.

- **Consumption:** `GetEffectiveRowFilterWhereClause` reads `user.APIKeyRowFilters` and resolves each `FilterID` via
  `Metadata.Provider.RowLevelSecurityFilters` — already MJCore-resident, so no dependency inversion.
- **Staleness:** the binding is rebuilt **per request** (`getUserPayload` runs per request) from the `APIKeysEngineBase`
  cache, so the staleness envelope is exactly `scopeCacheTTLMs` — identical to scope enforcement itself. No new staleness
  class is introduced; a key-scope edit propagates on the same schedule as any other scope change.
- **Token surface:** the binding carrier is object-valued, so `MarkupFilterText`'s `typeof` guard (`securityInfo.ts:470`)
  keeps it out of the `{{UserX}}` surface (see §2.3). The §5.8 no-client-exposure negative test covers the binding carrier
  as well as `APIKeyActingContext`.
- **Downstream propagation — verified:** agent, prompt, action, template, task, and MCP execution all resolve their
  `contextUser` via `GetUserFromPayload`, which returns `userPayload.userRecord` when present (`ResolverBase.ts:1074-1075`) —
  and `getUserPayload` always populates it. So stamps flow into engine execution without further work. The verified
  exception: `ReportResolver.CreateReportFromConversationDetailID` re-fetches the user from `UserCache` by email
  (`ReportResolver.ts:83`) and runs its entity work under that **unstamped** shared instance. Fix it to use
  `GetUserFromPayload` as part of WS3, and add a repo test that no resolver resolves its operation `contextUser` from
  `UserCache` when a payload user exists (§5.6 row 11).

### 5.6 Bypass inventory — every way the filter could fail to apply

v1 did not enumerate these. Each needs an explicit decision, and the default for all of them is *deny*.

| # | Bypass | Current behavior | Decision |
|---|---|---|---|
| 1 | **Role RLS exemption** | `entityInfo.ts:2312` early-returns `''` | Key filter evaluated outside the exemption — §5.5 |
| 2 | **`full_access` scope** | `ResolverBase.ts:679-692` short-circuits the specific scope check | **DECIDED: the combination is invalid and is rejected, not silently resolved.** `full_access` means unrestricted, so a row filter alongside it is incoherent — one of the two is a lie about what the key can reach. Rather than pick a winner at runtime, forbid the config. See §5.6.1. |
| 3 | **`enforcementEnabled: false`** | `APIKeyEngine.ts:596` returns `Allowed` unconditionally | **Startup refusal** (escalated from a warning, per review — a warning is fail-open). `Config()` throws when any row-filtered scope rule exists while enforcement is disabled. Operator remedy: remove the filters or re-enable enforcement. |
| 4 | **Key has no scope rules + `defaultBehaviorNoScopes: 'allow'`** | `ScopeEvaluator.ts:156-167` allows | **Startup refusal** (escalated from documentation, same rationale). Combined with row 3, this is one invariant: *the presence of any row-filtered scope rule requires the engine to be enforcing and default-deny; violations refuse startup.* `'deny'` is already the engine default (`APIKeyEngine.ts:144`). |
| 5 | **External-data-source entities** | `assertExternalReadAllowedUnderRLS` (`GenericDatabaseProvider.ts:2509`) refuses reads when RLS applies, **but lets exempt users through** | Must refuse when a *key* filter applies, regardless of role exemption. Otherwise the filter is silently unenforceable on external-backed entities. Migrating this call site to `GetEffectiveRowFilterWhereClause` fixes it. |
| 6 | **Non-resolver entry points** | Scope checks live in resolvers; MCP/A2A/REST surfaces may not call them | The data-layer filter covers these *because* it is in RLS — but confirm no surface constructs a provider with a principal lacking acting context, which would deny (correct) rather than allow. |
| 7 | **`APIKeysEngineBase` not `Config`'d** | Cached rules empty → no rules match | Must deny, not allow, when a filtered key is used before the engine loads. Verify the load-order at `MJServer/src/index.ts:672-674`. |
| 8 | **Dangling `RowFilterID`** | FK prevents it in-DB; a stale cache could hold one | Unresolvable filter ID → deny. |
| 9 | **Rule shadowing** | `ScopeEvaluator.ts:184-211` — first matching allow wins, evaluation stops; shadowed rules absent even from `EvaluatedRules` | Evaluation change in §5.4: AND every filter carried by any matching allow rule; an unfiltered match grants but cannot cancel a filter. |
| 10 | **Scopes checked in code but absent from scope metadata** | `report:run`, `template:execute`, `mcp:sync/execute/oauth` have no record in `metadata/api-scopes/.api-scopes.json`; unknown path ⇒ `GetScopeByPath` null ⇒ zero rules ⇒ default-behavior branch | Fail-closed under the row-3/4 invariant (default-deny required). Pre-existing metadata gap — file its own ticket to register the missing scopes. |
| 11 | **`UserCache` re-fetch drops stamps** | `ReportResolver.ts:83` resolves its operation user from `UserCache` by email, bypassing the stamped payload user; `ResolverBase.ts:757` has a fallback branch | Fix `ReportResolver` to use `GetUserFromPayload`; add a test asserting no resolver resolves its operation `contextUser` from `UserCache` when a payload user exists (§5.5.1). |

#### 5.6.1 `full_access` + row filter is an invalid configuration

**Decision (2026-08-02):** a `full_access` grant means unrestricted access. A row filter on the same key asserts the
opposite. The two cannot both be honored, and *either* silent resolution is a bug: applying the filter makes `full_access`
not mean full access, and ignoring it makes a row filter that someone deliberately configured silently absent — the
fail-open case this whole feature exists to prevent.

So the combination is **rejected outright** rather than resolved. Enforced at two points:

**Authoring time (primary).** Reject at save:
- Setting `RowFilterID` on an `APIKeyScope` / `APIApplicationScope` row when that key (or application) also holds a
  `full_access` grant.
- Granting `full_access` to a key (or application) that already has any row-filtered scope rule.

Error text must name both sides so the author can see the conflict: *"Cannot set a row filter on this scope rule: the key
also holds a `full_access` grant, which is unrestricted by definition. Remove the `full_access` grant or the row filter."*

**Runtime (backstop, fail-closed).** The `full_access` fast path at `ResolverBase.ts:679-692` currently returns early on
`Allowed`. It must first check whether the key has any row-filtered scope rule, and if so **deny** — throwing the existing
`AuthorizationError` (a 403 with a diagnosable reason), not a 500, and not falling through to the unrestricted allow.

The backstop is not redundant with the authoring check. A key can acquire `full_access` through the **application ceiling**
rather than its own rules, the two records can be modified independently, and `APIKeysEngineBase`'s cache can serve a stale
combination for up to `scopeCacheTTLMs`. Any of those produces a live key holding both at request time, and the only safe
answer there is to refuse the request.

**Consequence to document for operators:** a key that legitimately needs broad access *and* row scoping does not use
`full_access` — it enumerates the scopes it needs and filters those. That is the intended shape; `full_access` is a
break-glass grant, not a convenience.

### 5.7 Caching — resolved, with a testable invariant

**The question:** does the server-side RunView cache fingerprint vary by the resolved per-principal filter, or will two
principals collide and read each other's rows?

**The answer: it varies — by construction, provided the filter enters through the RLS path.**
`ComputeRunViewRLSWhereClause` (`providerBase.ts:2190`) resolves the RLS clause and is passed as the third argument to
`GenerateRunViewFingerprint` at every cache read/write: `providerBase.ts:2292`, `GenericDatabaseProvider.ts:2237` (read),
`:2447` (write), `:2606`. So a different resolved filter yields a different fingerprint and a different cache slot.

**This converts into two invariants that must be stated and tested:**

- **INV-1.** The key filter MUST be emitted by `ComputeRunViewRLSWhereClause` (i.e. reached via
  `GetEffectiveRowFilterWhereClause`). It must **not** be appended later inside `InternalRunView`'s WHERE assembly, which runs
  *after* the fingerprint is computed — that would produce two principals sharing one cache slot with different effective
  filters. This is the single highest-consequence implementation constraint in WS3.
- **INV-2.** The clause used for the fingerprint and the clause used in the WHERE must be byte-identical. They are computed by
  two independent calls today (`providerBase.ts:2195` vs `GenericDatabaseProvider.ts:1590`). Any nondeterminism —
  role-iteration order, `Set` ordering, whitespace — silently splits or merges cache slots. Make the composition
  deterministic (stable ordering of the OR terms and the AND layers) and assert it.

- **INV-3** (added per review, finding M3): the fingerprint clause and the WHERE clause must be computed **for the same
  principal**. `ComputeRunViewRLSWhereClause` resolves `contextUser ?? this.CurrentUser` (`providerBase.ts:2191`) while
  `InternalRunView` uses its own `user` variable (`GenericDatabaseProvider.ts:1590`). Divergence is harmless today (role
  RLS, they generally agree), but once the clause is per-key, a divergence fingerprints the slot for one principal and
  fills it with another's rows. INV-1/INV-2 cover *where* the clause is emitted and byte-stability — not *whose* it is.
  Resolve the principal **once** per request and thread the same reference to both computations; assert identity in the
  integration test.

**Also flagged:** `baseEngine.ts:1525` and `:2005` call `GenerateRunViewFingerprint` with only two arguments — no RLS clause.
Confirm no `BaseEngine` config caches an entity that carries RLS or a key filter; if one does, its cache slot is
principal-agnostic and would collide.

### 5.8 Carrying the context

In `context.ts`, the API-key branch (`:397-415`) resolves `userRecord` from the shared `UserCache`. It must clone before
stamping `APIKeyActingContext`, via the WS2 §4.2 helper. Not a cache-TTL concern — same-instant cross-request aliasing.

**Client-boundary hazard.** `TenantContext` is serialized to the client and auto-stamped onto the client-side `UserInfo` by
`GraphQLDataProvider` (`graphQLDataProvider.ts:457-461`) via a `CurrentUserTenantContext` query
(`resolvers/CurrentUserContextResolver.ts`). `APIKeyActingContext` must **not** get equivalent treatment: no resolver may
expose it, and no client-side path may set it. A client-settable acting context is a total bypass of the feature. Add an
explicit negative test asserting no GraphQL field returns it.

Where the acting values originate is deployment-specific (a verified session token, a server-side session lookup, a trusted
upstream assertion). This plan defines the carrier and the contract, not a transport. For the AR portal, the portal's own
authenticated session supplies them server-side.

### 5.9 What Phase 2 becomes

Nothing. Because the filter resolves inside the effective-filter method, every migrated RLS call site enforces it on day one:
`RunView`, `RunViews`, the count query, `BaseEntity` load/save/delete, `SearchEngine`, the external-source guard, and the
GraphQL resolver helper. There is no advisory phase and no `EffectiveFilter` for callers to remember to apply.

`AuthorizationResult` still gains an optional `EffectiveFilter` — as **observability**, not the enforcement contract: what
`UsageLogger` records so the audit trail answers "what could this request actually see," and what a consumer inspects when
debugging a denial. Typed concretely, not as `Record<string, unknown>`.

**Scope qualification (per review):** "every RLS call site" is not "every read path." Three read scopes bypass RLS entirely
by design and one more is unenforced; §5.10 is the matrix and the decision.

### 5.10 Scope coverage: read paths that bypass RLS

Review of the plan surfaced that §5.9's coverage claim held only for the entity CRUD/view/search paths. Verified against
source, the full picture:

| Scope | Data path | RLS? | Cache safety |
|---|---|---|---|
| `view:run`, `view:batch` | RunView WHERE assembly | ✅ | ✅ fingerprint carries RLS clause |
| `entity:create/update/delete/merge` | BaseEntity save/delete + RLS checks | ✅ | n/a |
| `entity:read` | **defined but unenforced** — zero call sites in MJServer; reads gate via `view:run` | (✅ at data layer) | — |
| `search:execute` | SearchEngine | ✅ (`SearchEngine.ts:1897`) | — |
| `user:read`, `datacontext:read` (view/entity items) | RunView | ✅ | ✅ |
| `query:run`, `query:test` | Rendered stored/tested SQL via raw `ExecuteSQL` — **no RLS by documented design** (`GenericDatabaseProvider.ts:3141-3147`: "a saved Query is trusted, admin-authored raw SQL gated by query-level permissions") | ❌ | ❌ **query cache fingerprint carries no user segment** (`providerBase.ts:1859-1860`: "user A's warmed slot is user B's cache hit"); the B43 hit-gate re-authorizes but is binary run/deny — every authorized principal gets identical cached rows |
| `datacontext:read` (query/SQL items) | inherits the query path | ❌ | ❌ same |
| `dataset:read` | Per-item `SELECT ... FROM <baseView> WHERE <item filter>` — no RLS clause; resolver doesn't even pass `contextUser` (`DatasetResolver.ts:51`); fingerprint built **without** the RLS argument the cache API documents as mandatory (`GenericDatabaseProvider.ts:4058-4061` vs `localCacheManager.ts:1393-1398`) | ❌ | ❌ cross-user shared slots keyed on `{EntityName, ExtraFilter}` |
| `report:run` | Stored `ReportSQL` executed verbatim via raw `ExecuteSQL`, no `contextUser` passed (`ReportResolver.ts:56-58`, `databaseProviderBase.ts:2194-2199`); scope not even registered in metadata (row 10) | ❌ | — |
| `agent/prompt/action/template/task/mcp:*` | Execution scopes — their own data access flows through RunView/BaseEntity under the stamped `contextUser` (§5.5.1) | ✅ inherited | ✅ inherited |

Datasets are seeded metadata-only (`MJ_Metadata`, `ResourceTypes`, `Communication_Metadata`, `Template_Metadata`) but
nothing constrains them to metadata — `DatasetItem.EntityID` can point at any entity.

**Decision — v1 denies the bypassing scopes for filtered keys.** A key carrying **any** row-filtered scope rule is denied
`query:run`, `query:test`, `dataset:read`, `report:run`, and any other scope whose path executes raw SQL (confirm the
ad-hoc-query surface's gate at implementation time), enforced in `Authorize()` alongside the §5.6.1 backstop. Rationale: a
filtered key that can run an arbitrary saved query against the filtered entity reads it unfiltered — the filter would be
decoration. Same "start strict, relax later is non-breaking" principle as the exact-entity rule.

**Acked in review with one condition, adopted here.** The deny is **key-wide, not entity-wide**: one row filter on one
entity revokes these four scopes for the whole key, and a key that does twenty things and needs a filter on one must be
split in two. That consequence is accepted for v1 — but the remedy is not discoverable from a bare scope denial, so the
**`AuthorizationError` must name the cause and the remedy**: *"denied: this API key carries a row filter (on `<entity>`),
which is incompatible with `<scope>` because that path bypasses row-level security. Split the key, or remove the row
filter."* Not just the scope that failed. This is a hard requirement, tested in §7.3 — it is the difference between a
five-minute fix and a lost day when a filtered key's workload later grows into a saved Query.

**The precise relaxation, for later, is asymmetric:**

- **Datasets: implementable now.** `DatasetItem.EntityID` is a non-nullable FK, and the read path already joins it. "Deny
  `dataset:read` only when the dataset includes a filtered entity" is a straightforward metadata check.
- **Queries: NOT safely implementable today.** The `MJ: Query Entities` bridge is best-effort and **fails open**: rows exist
  only for queries saved through the server entity path (migration-seeded queries have none), the SQL extractor swallows
  parse errors and records an entity only when it resolves fields, an empty extraction *deletes* existing bridge rows, and
  explicit Query Permissions short-circuit entity checks entirely (`MJQueryEntityServer.server.ts:71-101`,
  `resolve.ts:530-562`, `MJQueryEntityExtended.ts:157-175`). A precise deny built on that mapping treats "no bridge rows" as
  "touches nothing" — fail-open. Any future relaxation must fail closed on absent bridge data.

**Tickets to file** (per review — these evaporate when the plan doc goes stale; none are gated on this feature):

1. **`ReportResolver.CreateReportFromConversationDetailID` SQL injection** — client-supplied `ConversationDetailID`
   interpolated into raw `mssql.Request` SQL (`ReportResolver.ts:92-104`, verified). Live shipping code; deserves its own
   issue and severity, not a closing aside. (Upgraded from "worth a ticket" on review pushback — correctly so.)
2. **RLS exemption looseness** — exemption granted from the mere presence of a filter-less permission row, without checking
   the permission is granted (§2.2, §6, §9.7).
3. **Query cache carries no user segment** — all authorized principals share one cached result set
   (`providerBase.ts:1859-1866`).
4. **Integration suite: client-transport members hard-fail on missing `MJ_API_KEY` instead of skipping** — 19 pre-existing,
   non-gating errors on every CI run (`config.ts:116` throws before the "MJAPI is not reachable" skip check can run).

---

## 6. Deliberately out of scope

**Parameterized binding on the filter path.** The right long-term answer to §2.6. It means threading a parameter array through
`InternalRunView`'s WHERE assembly, the cache fingerprint, and the GraphQL transport for client-issued filters. Its own
workstream; gating this feature on it would sink both.

**What we do instead, now:** the registered vocabulary means every value that can reach a filter is server-derived and
type-validated against a known validator before `Authorize()` returns. That is the second layer the original proposal asked
for, achievable today, and independent of binding. It is genuinely weaker than binding and is recorded as an accepted interim
position, not a solution.

**RLS platform variants.** §2.6 notes `GetPlatformFilterText` is unwired on the RLS path and `RowLevelSecurityFilter` has no
variants column. Filters authored for this feature are single-dialect. **Fail mode if a T-SQL filter runs on Postgres: the
query throws, so the request fails closed** — acceptable, but confirm during WS3 that the thrown error is not swallowed
anywhere into an empty-result path, which would be indistinguishable from "no rows match." Own ticket now that a Postgres
provider ships.

**The RLS exemption's own looseness.** §2.2 notes `UserExemptFromRowLevelSecurity` grants exemption from the mere *presence*
of a filter-less permission row, without checking that the permission is granted. That is arguably a bug in its own right.
WS3 routes around it rather than changing it — changing it would alter behavior for every existing RLS deployment. Separate
ticket.

---

## 7. Test plan

Both tiers must pass, per the Definition of Done. Reported with pass/fail/skip counts. Tests marked **[FO]** are fail-open
regression tests — the ones that would pass against a broken implementation if written carelessly.

### 7.1 Unit — WS1

- Update that moves a row out of the Update filter → rejected **[FO]**
- Update that moves a row into the filter from a passing pre-image → allowed
- Post-image projection emits `CAST(NULL AS <type>)` for every non-virtual null field, not omitted columns
- Unresolvable field type → save fails rather than emitting untyped NULL
- Skip-optimization: filter that does **not** fully decompose (function-wrapped column, subquery, alias) → check still runs **[FO]**
- Skip-optimization: simple filter, no referenced field dirty → check skipped (perf assertion)
- Before-save hook mutates a filter-referenced field → post-image check sees the mutated value **[FO]**
- Composite-PK entity → post-image check builds the correct predicate
- Pre-image failure keeps the non-enumerable message; post-image failure gets its own
- Delete path unchanged

### 7.2 Unit — WS2

- Header tenant id containing `'`, `--`, `OR`, or exceeding 128 chars → request rejected at the boundary **[FO]**
- Rejected header does **not** degrade to an unscoped session **[FO]**
- Escaping is applied even when the value arrives via `'linkedEntity'` / `'custom'` source
- Tenant column not present on the entity → rejected
- Identifier quoted via `QuoteIdentifier`, producing valid SQL on both SQL Server and Postgres
- Clone helper preserves `UserRoles`, all four existing contexts, and `APIKeyActingContext` **[FO]**
- Two concurrent requests, same user, different tenant headers → each sees only its own tenant

### 7.3 Unit — WS3

- Rule with no `RowFilterID` behaves exactly as today *(regression)*
- Rule with a pattern resource and no `RowFilterID` → still permitted *(regression)*
- **Exempt user (holds a role with a filter-less permission row) + filtered key → filter STILL applies** **[FO]** — the §5.5 regression; write this one first
- Role RLS present + key filter present → AND-composed, not OR-composed **[FO]**
- Adding a second, more permissive role does not widen past the key filter **[FO]**
- Setting `RowFilterID` on a scope rule whose key holds `full_access` → rejected at save, error names both sides
- Granting `full_access` to a key that already has a filtered scope rule → rejected at save
- **Runtime backstop: key holding both at request time → denied, not allowed** **[FO]** — the case authoring validation
  cannot catch. Exercise all three routes: `full_access` inherited from the application ceiling, the two records edited
  independently, and a stale `APIKeysEngineBase` cache serving the combination
- Runtime backstop denial is an `AuthorizationError` (403 with a reason), not an unhandled 500
- `enforcementEnabled: false` + filtered rule exists → startup warning emitted
- Key with no scope rules + `defaultBehaviorNoScopes: 'allow'` → documented behavior asserted
- External-source entity + key filter → read refused even for a role-exempt user **[FO]**
- Missing required token → denied at `Authorize()`, reason names the token
- Unresolved token reaching markup → filter resolves to `(1=0)`, not `''` **[FO]**
- `(1=0)` fallback asserted for `<>`, `LIKE`, `NOT IN`, and numeric-context filters **[FO]**
- Malformed value for a typed token (non-GUID for `ActingOrganizationID`) → denied, not coerced
- `RowFilterID` set with a pattern resource → rejected at rule save
- `RowFilterID` set on an `IsDeny` or `Exclude` rule → rejected at rule save
- `FilterText` referencing an absent / computed / virtual field → rejected at rule save
- `FilterText` containing an unregistered `{{Token}}` → rejected at rule save
- Application ceiling filter and key filter both present → conjoined
- Caller-supplied `ExtraFilter` present → conjoined, not replaced
- Token value containing SQL metacharacters → rejected by the type validator before reaching SQL
- No GraphQL field exposes `APIKeyActingContext` **or the row-filter binding carrier**; client cannot set either **[FO]**
- Usage log records the effective filter
- **Shadowing: unfiltered higher-priority Include rule + filtered exact rule on the same entity → filter applies** **[FO]**
- Two filtered rules both matching → filters AND together
- Startup refusal: filtered rule exists + `enforcementEnabled: false` → `Config()` throws
- Startup refusal: filtered rule exists + `defaultBehaviorNoScopes: 'allow'` → `Config()` throws
- **Filtered key requesting `query:run` / `query:test` / `dataset:read` / `report:run` → denied** **[FO]** (§5.10)
- The §5.10 denial's `AuthorizationError` names the row filter as the cause and states the split-the-key remedy — not just
  the failed scope
- Unfiltered key requesting those scopes → unchanged *(regression)*
- `{{ActingCompanyIDs}}` with a multi-element set → `IN` list with each element validated, quoted, escaped; empty or absent
  set → `(1=0)` **[FO]**
- `MarkupFilterText`: own-but-`undefined` property → treated as unresolved, never the literal string `"undefined"` **[FO]**
- `MarkupFilterText`: substituted value containing `'` → escaped, filter still parses
- `CheckRecordRLS` with a PK value containing `' OR '1'='1` → escaped, RLS check fails closed **[FO]** (WS1, finding M1)
- Repo guard: no non-test caller of `GetUserRowLevelSecurityWhereClause` outside `GetEffectiveRowFilterWhereClause` **[FO]**
- **INV-3**: fingerprint and WHERE computed from the same principal reference (integration tier, §5.7)
- `ReportResolver` operation user comes from `GetUserFromPayload`, not a `UserCache` re-fetch (§5.6 row 11)

### 7.4 Integration — deterministic tier

Extend existing suites: `rls-isolation.checks.ts`, `scope-enforcement.checks.ts`, `server-cache.checks.ts`
(all under `packages/TestingFramework/integration-test-suite/src/checks/`).

- **INV-1 (cache slot separation)** — two principals whose only difference is the resolved key filter, querying the same
  entity with identical `RunViewParams`, must not share a cache slot. Must force the auto-cache path (small, unfiltered,
  unsorted result set) or the test proves nothing **[FO]**
- **INV-2 (fingerprint/WHERE agreement)** — assert the clause used for the fingerprint equals the clause in the executed SQL,
  including ordering stability across repeated calls with multiple roles **[FO]**
- Every migrated call site enforces: `BaseEntity.Load()` by PK, `RunViews` (plural), the count query, delete, search,
  external-source guard, transaction-group items — each asserted individually, since "covered for free" is the claim under test
- Post-image update rejection end to end
- No `BaseEngine` config caches an RLS/key-filtered entity under a principal-agnostic fingerprint

---

## 8. Sequencing

| Phase | Contents | Gate |
|---|---|---|
| **1** | WS1 + WS2, **as their own PR** (adopted from review — independently valuable, and they carry both the behavior change and the Postgres quoting change, so they deserve their own review and their own revert). No schema changes, no CodeGen. | Both tiers green. |
| **2** | **Migration written and STAGED** — `plans/api-key-row-filters-staged/` (T-SQL + PG counterpart + changeset, with an activation README). It was originally committed live under `migrations/v5/`, and CI's deterministic tier **correctly rejected** it: DDL without its CodeGen output leaves views/procs/EntityField metadata inconsistent (IT13/IT36 fail on the `INSERT INTO @ResultTable EXEC spCreate...` column-count mismatch after `R__RefreshMetadata` partially absorbs the new columns). Empirical confirmation of this row's own rule. Activation: move files into place → apply → `mj sync push` → `mj codegen` → append output behind the separator block → restore the changeset. | Generated entity classes expose `RowFilterID` on `MJAPIKeyScopeEntity` and `MJAPIApplicationScopeEntity`. No TypeScript written against them before this completes — see the `.Get()`/`.Set()` prohibition. |
| **3** | WS3: `GetEffectiveRowFilterWhereClause` + **all** call-site migrations + `APIKeyActingContext` + token resolution + `context.ts` wiring + rule-save validation. | Both tiers green, INV-1/INV-2 asserted. |
| **4** | Docs: package README trust-boundary section, `guides/UNIFIED_PERMISSIONS_GUIDE.md` update placing the key layer in the permission model. | — |

Migration authoring follows [`migrations/CLAUDE.md`](../migrations/CLAUDE.md). Two notes specific to this one:

- **The `mj sync push` → `mj codegen` ordering hazard does not apply here.** That rule exists because CodeGen reads JSONType
  definitions from the database. v2 eliminated the `FilterParameters` JSON column (§5.2 replaced it with the registered token
  vocabulary), so this migration introduces no JSON types and there is no stale-definition/silent-property-deletion risk.
  Run the documented order anyway; just don't treat it as load-bearing.
- **No FK indexes in the migration.** CodeGen creates `IDX_AUTO_MJ_FKEY_<table>_<column>` automatically; hand-written ones
  leave two competing indexes on the same column (`migrations/CLAUDE.md:239`).

Adding nullable columns with FKs is additive and consistent with
[`PUBLISH_NO_BREAK_POLICY.md`](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md).

---

## 9. Open questions for review

1. ~~**FK vs inline filter text**~~ — **RESOLVED 2026-08-02: FK to `RowLevelSecurityFilter`.** Reuse is not a requirement,
   so the sharing hazard is forbidden rather than accommodated (§5.1, §5.3 check 6), and the FK's delete protection is a
   security win an inline column cannot match. Migration written and staged at
   `plans/api-key-row-filters-staged/` (see §8 Phase 2 for why it is staged rather than live).
2. ~~**`full_access` semantics**~~ — **RESOLVED 2026-08-02: the combination is invalid and is rejected.** `full_access`
   means unrestricted; a row filter alongside it is incoherent, and either silent resolution is a bug. Rejected at authoring
   time on both sides, with a fail-closed runtime backstop for the cases authoring validation cannot catch (ceiling-granted
   `full_access`, independent edits, stale scope cache). Specified in §5.6.1.
3. **Application ceiling filters in v1, or keys only?** Included because the column is free once the mechanism exists.
   Deferring is not breaking.
4. **Vocabulary size** (§5.2). Three tokens cover the AR portal and partner-integration cases. Anything else worth
   registering up front, given adding one later is a typed code change rather than a migration?
5. **WS1 blast radius** (§3.5). Do any deployments run an Update RLS filter *and* legitimately reassign a filter-referenced
   column as a non-exempt principal? Given §2.2, "grant exemption" is a poor remedy — prefer widening the filter.
6. ~~**Should WS1 and WS2 be their own PR?**~~ — **RESOLVED 2026-08-02: yes, split** (reviewer concurred). §8 Phase 1 ships
   as its own PR.
7. **Is the §2.2 exemption looseness worth its own fix now?** WS3 routes around it. Left alone, every role-RLS deployment
   keeps a broader-than-intended exemption. Changing it is behavior-affecting for existing deployments.
8. **§5.10's v1 wholesale-deny** (filtered keys denied `query:run`/`query:test`/`dataset:read`/`report:run`) is decided in
   the plan on fail-closed grounds, but it is the one decision added post-review — flagging it for the PR thread so it gets
   an explicit ack rather than riding in silently. The relaxation path (precise per-target denial) is documented and
   asymmetric: implementable for datasets now, not safely for queries until the `Query Entities` bridge fails closed.
