# API-Key-Scoped Row Filters

**Branch:** `claude/api-key-row-filters-98ev39`
**Status:** Revised plan — awaiting review before implementation
**Date:** 2026-08-02
**Supersedes:** the original "Row-Level Filter Rules for MJ API Key Scopes" proposal (written against the public
`@memberjunction/api-keys` README, without access to internals)
**Packages touched:** `@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/api-keys`,
`@memberjunction/api-keys-base`, `@memberjunction/server`, `@memberjunction/core-entities` (generated)

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

This plan therefore delivers three workstreams in dependency order:

| WS | What | Why first |
|---|---|---|
| **WS1** | Update RLS checks the post-image, not just the pre-image | Live privilege-escalation path affecting every RLS user; also a hard prerequisite for any key filter on `entity:update` to mean anything |
| **WS2** | Multi-tenancy: injection-safe tenant predicate + per-session `UserInfo` isolation | Live injection path in an opt-in feature; the same `UserInfo`-mutation mistake would be repeated by WS3 |
| **WS3** | API-key-scoped RLS | The feature. Built as an extension of the existing RLS mechanism, not a parallel one |

**Design commitment:** WS3 ships as *the existing RLS mechanism, additionally keyed to API keys*. Not a second filter
language. A filter that is trusted as the last line of defense but enforced on only one data path is worse than no filter,
because callers will assume the other paths are covered. If we cannot land it as an RLS extension, we should not land it.

---

## 2. Grounding: what exists today

### 2.1 Role-based RLS

`RowLevelSecurityFilterInfo` (`packages/MJCore/src/generic/securityInfo.ts:394`) holds a `FilterText` template.
`MarkupFilterText(user)` (`:463`) substitutes `{{UserFieldName}}` tokens from any scalar property of `UserInfo`, plus
`{{ScopeResourceID}}` / `{{ScopeResourceType}}` from `UserInfo.MagicLinkScope` (`:474-479`).

`EntityInfo.GetUserRowLevelSecurityWhereClause(user, type, prefix)` (`packages/MJCore/src/generic/entityInfo.ts:2309`)
ORs together every filter the user's roles carry for that permission type, after a centralized exemption check
(`UserExemptFromRowLevelSecurity`, `:2231`). Filters attach to an entity+role via `EntityPermission.{Read,Create,Update,Delete}RLSFilterID`
(`entityInfo.ts:319-322`).

Applied at:

| Site | File |
|---|---|
| `RunView` WHERE assembly (step 5) | `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts:1590` |
| Save — new record (post-image) | `:3910` `CheckCreateRLS` |
| Save — existing record (pre-image) | `:3884` `CheckRecordRLS` |
| Delete | `packages/MJCore/src/generic/databaseProviderBase.ts:1487` |
| Search | `packages/SearchEngine/src/generic/SearchEngine.ts:1897` |
| GraphQL resolver helper | `packages/MJServer/src/generic/ResolverBase.ts:1002` |

RLS is already AND-composed with `ExtraFilter`, user search, and exclusion filters (`GenericDatabaseProvider.ts:1550-1594`).

### 2.2 Per-session context on `UserInfo`

`UserInfo` carries four per-session context objects, all non-enumerable getter/setter pairs, none of them DB/GraphQL fields:
`TenantContext`, `MagicLinkScope`, `ReturningVisitorContext`, `WidgetGuestContext` (`securityInfo.ts:200-278`).

`buildMagicLinkSessionUser` (`packages/MJServer/src/context.ts:202`) constructs a **fresh** `UserInfo` before setting any of
these. The comment at `:197-200` states why: *"the resolved userRecord may be a SHARED cached instance … mutating it would
leak one session's scope to another."*

### 2.3 Data hooks

`PreRunViewHook` / `PostRunViewHook` / `PreSaveHook` with `RegisterDataHook` / `GetDataHooks`
(`packages/MJCore/src/generic/dataHooks.ts:23-88`), consumed at `providerBase.ts:3123` (RunView), `providerBase.ts:2355`
(RunViews), and `baseEntity.ts:2666` (Save). `MJTenantFilterMiddleware` is the working reference consumer.

**Coverage caveat:** `PreRunViewHook` covers `RunView`/`RunViews` only — not `BaseEntity.Load()` by primary key, not
`RunQuery`, not single-record GraphQL resolvers. RLS covers more of those. This is the decisive argument for the RLS-extension
route over a hook-only implementation.

### 2.4 API key authorization

`APIKeyEngine.Authorize()` (`packages/APIKeys/Engine/src/APIKeyEngine.ts:546`) → `ScopeEvaluator.EvaluateAccess()`
(`ScopeEvaluator.ts:67`), which is pure in-memory evaluation over `APIKeysEngineBase` caches. It never touches entity data.

Enforcement is invoked at the **resolver** boundary — `ResolverBase.CheckAPIKeyScopeAuthorization` (`:654`), called from
~20 resolvers. Data access happens later, in the provider. The two layers never meet.

`AuthorizationRequest` already declares `Context?: Record<string, unknown>` (`interfaces.ts:121`), currently written and read
by nobody.

Scope rule schema — `APIKeyScope` (`migrations/v5/B202602151200__v5.0__Baseline.sql:14068`) and `APIApplicationScope`
(`:14869`), both: `ID, {APIKeyID|ApplicationID}, ScopeID, ResourcePattern nvarchar(750) NULL, PatternType, IsDeny, Priority`.

### 2.5 Known limits of the current filter path

- **No parameter binding anywhere on the filter path.** `MarkupFilterText` does `ret.replace(..., String(val))`.
  `InternalRunView` concatenates every predicate into one WHERE string and calls `ExecuteSQL(viewSQL, undefined, ...)`
  (`GenericDatabaseProvider.ts:1671`) — the parameters argument is always `undefined` on this path. Binding infrastructure
  *does* exist (`ExecuteSQL(query, parameters)`, positional `?`→`@pN` and named `@param`; used e.g. at `:3990`).
- **The only guard is a keyword blocklist.** `ValidateUserProvidedSQLClause` (`databaseProviderBase.ts:983`) strips string
  literals first, then tests 12 patterns (`insert|update|delete|exec|execute|drop|--|/*|*/|union|xp_|;`). No rule for `OR`.
  `SQLExpressionValidator` (`packages/MJGlobal/src/SQLExpressionValidator.ts`) is richer but has the same
  strip-literals-then-keyword-match structure.
- **Platform variants are not wired on the RLS path.** `RowLevelSecurityFilterInfo.GetPlatformFilterText()` exists
  (`securityInfo.ts:452`), but `GetUserRowLevelSecurityWhereClause` calls `MarkupFilterText()`, which reads `this.FilterText`
  directly. The `MJRowLevelSecurityFilterEntity` generated class exposes only `ID/Name/Description/FilterText` — there is no
  `PlatformVariants` column on `RowLevelSecurityFilter`. Cross-platform filter text is an **open item, not a freebie**.

---

## 3. WS1 — Update RLS must check the post-image

### 3.1 The defect

`databaseProviderBase.ts:1335`, on save of an existing record:

```ts
const updateRLSPass = await this.CheckRecordRLS(entity, user, EntityPermissionType.Update);
```

`CheckRecordRLS` (`GenericDatabaseProvider.ts:3884`) runs:

```sql
SELECT COUNT(*) AS cnt FROM <view> WHERE <PK> = <value> AND (<rls>)
```

That reads the row **as it exists in the database** — the pre-image. `CheckCreateRLS` (`:3910`) validates the post-image, but
only fires for new records (`bNewRecord`).

**Consequence:** an update that moves a row *out* of the caller's filter passes. With an RLS filter of
`OrganizationID = '{{UserOrganizationID}}'`, a caller can take a row they legitimately own and set `OrganizationID` to an org
they do not belong to. This is privilege escalation, not a read leak, and it is live for every RLS-governed entity today —
independent of API keys.

### 3.2 The fix

After the pre-image check passes, validate the post-image using the same synthetic-row technique `CheckCreateRLS` already
uses, with the **Update** filter and the entity's pending values:

```sql
SELECT CASE WHEN (<update rls>) THEN 1 ELSE 0 END AS pass FROM (SELECT <projections>) AS newrow
```

Both checks must pass. Pre-image failure keeps the existing generic message (`databaseProviderBase.ts:1341-1343` deliberately
does not distinguish "not found" from "access denied", to prevent ID enumeration); post-image failure gets its own message,
since the caller demonstrably has access to the row and the diagnostic leaks nothing.

**Projection correctness.** `BuildCreateRLSProjections` (`:3930`) skips fields whose value is `null`. That is acceptable for
create but wrong for update: a filter referencing a column the caller just nulled would see the column missing from the
subquery rather than `NULL`. The update projection must emit every non-virtual field including nulls, typed, so the predicate
evaluates against a faithful post-image.

**Cost control — skip the check when it cannot change the answer.** Parse the column references out of the resolved Update
filter and compare against the entity's dirty-field set. If no field referenced by the filter changed, the post-image and
pre-image agree on every column the predicate reads, and the pre-image check is sufficient. This makes the common update path
zero-additional-round-trip; only updates that actually touch a filter-referenced column pay for the second query.

### 3.3 Files

- `packages/MJCore/src/generic/databaseProviderBase.ts` — call the new check at `:1335`; declare the abstract method
  alongside `CheckRecordRLS`/`CheckCreateRLS` (`:1583`, `:1593`)
- `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` — implement; generalize `BuildCreateRLSProjections` into a
  shared projection builder with an include-nulls mode

### 3.4 Risk

This tightens behavior on a path that previously allowed the operation. Deployments with an Update RLS filter and code that
legitimately reassigns a filter-referenced column (a genuine ownership-transfer flow) will start failing. Mitigation: such a
flow should run as an RLS-exempt principal, which `UserExemptFromRowLevelSecurity` already supports. Call this out in the
changeset — it is a behavior change, and the correct one.

---

## 4. WS2 — Multi-tenancy: injection and session isolation

Both defects are in `packages/MJServer/src/multiTenancy/index.ts`. The feature is opt-in
(`configInfo.multiTenancy?.enabled`, default off — `middleware/MJTenantFilterMiddleware.ts:25`), so neither is a live
default-path vulnerability. Both are worth fixing here because WS3 would otherwise repeat them.

### 4.1 Injection via the tenant header

`createTenantPreRunViewHook` (`:106`) builds:

```ts
const tenantFilter = `[${tenantColumn}] = '${contextUser.TenantContext.TenantID}'`;
```

`TenantID` can come straight from a request header when `contextSource === 'header'` (`:42-47`), unvalidated. Downstream, that
string reaches `ValidateUserProvidedSQLClause`, which strips string literals *before* keyword matching and has no rule for
`OR`. A header value of `x' OR '1'='1` yields `[TenantID] = 'x' OR '1'='1'`, strips to `[TenantID] =  OR =`, passes
validation, and defeats tenant scoping entirely.

**Fix, defense in depth:**

1. **Validate at the boundary.** `attachTenantContext` rejects any tenant id that is not a GUID or a conservative
   identifier (`^[A-Za-z0-9_\-.]{1,128}$`). A malformed header fails the request rather than silently producing an
   unscoped session.
2. **Escape at construction.** Single-quote-escape the value when building the predicate, so a future caller reaching
   `attachTenantContext` from a different source (`'linkedEntity'`, `'custom'`) cannot reintroduce the hole.
3. **Bound the column name.** `tenantColumn` is operator-controlled config, not user input, but it is interpolated into a
   bracket identifier. Verify it resolves to a real non-virtual field on the entity and escape `]` → `]]`.
4. **Flag for follow-up:** `[${tenantColumn}]` is SQL Server bracket syntax hardcoded in a provider-agnostic hook. Confirm
   behavior under the Postgres provider before this is relied on cross-platform. Out of scope to fix here; note it.

### 4.2 Shared-`UserInfo` mutation

`createTenantMiddleware` calls `attachTenantContext(userPayload.userRecord as UserInfo, ...)` (`:45`), mutating the object in
place. For JWT sessions and API-key sessions alike, `userRecord` may be the **shared `UserCache` instance**
(`context.ts:400-405` for the API-key path). Two concurrent requests for the same user, with different tenant headers, race on
one object.

**Fix:** clone to a fresh `UserInfo` before setting per-session state and write it back to `userPayload.userRecord`, exactly
as `buildMagicLinkSessionUser` does (`context.ts:258-276`). Extract that clone-then-stamp step into a small shared helper so
WS3 and any future per-session context use the same path rather than each rediscovering the rule.

### 4.3 Note on `createTenantPreSaveHook`

It validates `entity.Get(tenantColumn)` — the post-image — and auto-stamps the tenant on new records (`:163-172`). That is the
correct shape and needs no change. Worth observing that the multi-tenancy hook got the post-image right while core RLS
(WS1) did not.

---

## 5. WS3 — API-key-scoped RLS

### 5.1 Shape

Add an optional filter reference to both scope-rule tables:

| Table | Column | Type | Meaning |
|---|---|---|---|
| `APIKeyScope` | `RowFilterID` | `uniqueidentifier NULL` FK → `RowLevelSecurityFilter.ID` | Row restriction this key's grant carries. NULL = current behavior. |
| `APIApplicationScope` | `RowFilterID` | `uniqueidentifier NULL` FK → `RowLevelSecurityFilter.ID` | Ceiling filter every key in the application inherits and cannot widen. |

**Why an FK to the existing `RowLevelSecurityFilter` rather than an inline `RowFilter nvarchar(max)`:** it reuses the
substitution engine, the filter is a named reviewable object rather than a string buried in a join table, it matches how
`EntityPermission` already references filters, and it inherits whatever platform-variant work lands later without a second
migration. Cost: authoring a key filter means creating a filter record first. At the scale where row filters are used, that is
the right trade. *This is the main reversible decision in the plan — flagging it explicitly for review.*

### 5.2 Runtime values: a registered vocabulary, not free-form parameters

The original proposal declared per-rule `FilterParameters` JSON naming a parameter and the entity field it compares against,
from which the engine would resolve a bind type. Given MJ's existing conventions, a **registered vocabulary** is both simpler
and safer, and it eliminates the JSON column entirely.

Add a fifth per-session context to `UserInfo`, alongside `TenantContext` / `MagicLinkScope` / `ReturningVisitorContext` /
`WidgetGuestContext`:

```ts
/**
 * Per-request acting context for an API-key session. Set server-side from an authenticated
 * identity; consumed by API-key-scoped RLS filters via the {{Acting*}} tokens.
 */
export interface APIKeyActingContext {
    /** Organization / tenant the caller is acting on behalf of. */
    ActingOrganizationID?: string;
    /** Person / contact the caller is acting on behalf of. */
    ActingPersonID?: string;
    /** Opaque per-integration scope value. */
    ActingScopeID?: string;
}
```

Tokens `{{ActingOrganizationID}}`, `{{ActingPersonID}}`, `{{ActingScopeID}}` resolve in `MarkupFilterText` alongside the
existing ones.

This buys:

- **Types without restating the schema.** The vocabulary is typed in TypeScript, so each token has a known validator
  (`ActingOrganizationID` and `ActingPersonID` are GUIDs; `ActingScopeID` is a bounded identifier). No per-rule type
  declarations to drift, and no `FilterParameters` JSON at all.
- **No typo class.** The original proposal's open question — free-form names fail closed but confusingly — disappears.
  An unknown token is caught at rule save.
- **Extension is a typed code change**, not a schema change, matching how the other four contexts evolved.

**Trust boundary.** These values must be derived server-side from an authenticated identity. The engine binds what it is
given and cannot validate provenance. A caller that forwards a client-supplied org id has defeated the mechanism. This goes in
the package docs *and* in the TSDoc on the interface, because the interface is what someone will actually read.

### 5.3 Exactly one entity per filtered rule

A scope rule carrying `RowFilterID` must name a single exact entity in `ResourcePattern` — no wildcards, no comma-separated
lists. Rationale from the original proposal stands and is unimproved by restating: with patterns allowed, a rule could match
an entity lacking the referenced column, and both available behaviors (deny, or skip the filter) are wrong in an authorization
path. Forbidding the case removes it.

Unfiltered rules keep full pattern support — no behavior change. The restriction can be relaxed later without breaking
anything; tightening later would be breaking.

**Enforcement** lives in a server-side entity subclass under `packages/MJCoreEntitiesServer/src/custom/` — a CHECK constraint
cannot express "no wildcards AND names a real entity AND every column reference resolves to a real non-virtual field on it."
`PatternMatcher.isValidPattern` (`packages/APIKeys/Engine/src/PatternMatcher.ts:121`) is the natural sibling for an
`IsExactResourceName` helper.

Validated at rule save:

1. `ResourcePattern` is non-null, contains no `*` or `?`, and is not a comma-separated list.
2. `ResourcePattern` resolves via `Metadata.EntityByName` to a real entity.
3. Every `{{Token}}` in the filter's `FilterText` is a member of the registered vocabulary.
4. Every column identifier in `FilterText` resolves to a real, non-virtual, non-computed field on that entity.

Check 4 supersedes the original proposal's `FilterParameters`-as-allowlist idea and is strictly stronger: it bounds *every*
column the expression touches, not only the ones being compared. `SQLExpressionValidator.checkFieldReferences` already exists
in lenient warn-only form (`SQLExpressionValidator.ts:391`, called from `:235`) — add a strict variant rather than writing
a second parser.

### 5.4 Fail closed, and fail diagnosably

`MagicLinkScope` resolves an absent scope to `''`, so a pinned predicate matches no rows. Safe, but it produces an
unexplainable empty result rather than a diagnosable failure.

For API-key filters, deny **before** any SQL is built:

- At load time, `APIKeysEngineBase` parses the `{{Token}}` set out of each referenced filter's `FilterText` and caches it
  (templates are principal-independent — safe to cache; **resolved** filters are principal-specific and must never be).
- `Authorize()` compares the matched rule's required tokens against the supplied acting context. Any missing or
  type-invalid value → **deny**, with a reason naming the token.
- The data layer still resolves an absent token to `''` as defense in depth, so a filter that somehow reaches SQL without
  its context matches nothing rather than everything.

A type mismatch denies. It does not coerce, and it does not silently match zero rows.

### 5.5 Composition

`GetUserRowLevelSecurityWhereClause` gains the key/application filters and conjoins them:

```
(role filter A OR role filter B)  AND  (application ceiling filter)  AND  (key scope filter)
```

OR within a layer (existing behavior — a user's roles are additive), AND across layers. No layer can widen another. The
existing WHERE assembly already ANDs the result with `ExtraFilter` and user search
(`GenericDatabaseProvider.ts:1550-1594`), so caller-supplied filters conjoin rather than replace, with no change needed.

### 5.6 Carrying the context

In `context.ts`, the API-key branch (`:397-415`) resolves `userRecord` from the shared `UserCache`. It must clone before
stamping `APIKeyActingContext`, via the shared helper introduced in WS2 §4.2. This is not a cache-TTL concern — it is
same-instant cross-request aliasing on one object.

Where the acting values come from is deployment-specific (a verified session token, a server-side session lookup, a trusted
upstream assertion). The plan does **not** invent a transport for them; it defines the carrier and the contract. For the AR
portal, the portal's own authenticated session supplies them server-side.

### 5.7 What Phase 2 becomes

Nothing. Because the filter resolves inside `GetUserRowLevelSecurityWhereClause`, every existing RLS call site enforces it on
day one: `RunView`, `RunViews`, the count query, `BaseEntity` load/save/delete, `SearchEngine`, and the GraphQL resolver
helper. There is no advisory phase to ship and no `EffectiveFilter` for callers to remember to apply.

`AuthorizationResult` still gains an optional `EffectiveFilter` — but as **observability**, not as the enforcement contract:
it is what `UsageLogger` records so the audit trail answers "what could this request actually see," and it is what a
consumer inspects when debugging a denial. Typed concretely, not as `Record<string, unknown>`.

---

## 6. Deliberately out of scope

**Parameterized binding on the filter path.** The right long-term answer to §2.5, and the original proposal is correct that
interpolation inside an authorization layer is the worst place for it. But it means threading a parameter array through
`InternalRunView`'s WHERE assembly, the server-side RunView cache fingerprint, and the GraphQL transport for client-issued
filters. That is its own workstream, it touches every consumer of `RunView`, and gating this feature on it would sink both.

**What we do instead, now:** the registered vocabulary means every value that can reach a filter is server-derived and
type-validated against a known validator before `Authorize()` returns. That is the second layer §3 of the original proposal
asked for, achievable today, and it does not depend on binding. It is genuinely weaker than binding and should be recorded as
such — an accepted interim position, not a solution.

**RLS platform variants.** §2.5 notes `GetPlatformFilterText` is unwired on the RLS path and `RowLevelSecurityFilter` has no
variants column. Filters authored for this feature will be single-dialect. Worth its own ticket now that a Postgres provider
ships.

---

## 7. Test plan

Both tiers must pass, per the Definition of Done. Reported with pass/fail/skip counts.

### 7.1 Unit — WS1

- Update where no filter-referenced field is dirty → one query, pre-image only (the optimization holds)
- Update that moves a row out of the Update filter → rejected
- Update that moves a row *into* the filter from a passing pre-image → allowed
- Post-image projection emits nulls as typed NULLs, not omitted columns
- Pre-image failure keeps the existing non-enumerable message; post-image failure gets its own
- RLS-exempt principal bypasses both checks

### 7.2 Unit — WS2

- Header tenant id containing `'`, `--`, or `OR` → request rejected at the boundary
- Escaped value produces a predicate matching exactly the intended tenant
- Tenant column not present on the entity → rejected
- Two concurrent requests, same user, different tenant headers → each sees only its own tenant (the aliasing regression)

### 7.3 Unit — WS3

- Rule with no `RowFilterID` behaves exactly as today *(regression)*
- Rule with a pattern resource and no `RowFilterID` → still permitted *(regression)*
- Rule with `RowFilterID` and complete acting context → correct resolved filter
- Rule with `RowFilterID` and a **missing** token → denied, with the token named; not unfiltered, not empty-result
- Malformed value for a typed token (non-GUID for `ActingOrganizationID`) → denied, not coerced
- `RowFilterID` set with a pattern resource (`Orders,Payments`, `Order*`) → rejected at rule save
- `FilterText` referencing a field absent from the target entity → rejected at rule save
- `FilterText` referencing a computed or virtual field → rejected at rule save
- `FilterText` containing an unregistered `{{Token}}` → rejected at rule save
- Application ceiling filter and key filter both present → conjoined with AND
- Caller-supplied `ExtraFilter` present → conjoined, not replaced
- Role RLS and key filter both present → conjoined (OR within roles, AND across layers)
- Token value containing SQL metacharacters → rejected by the type validator before reaching SQL
- Two principals in rapid succession → no filter bleed; template cached, resolved filter not
- Usage log records the effective filter

### 7.4 Integration — deterministic tier

Extend the existing suites rather than adding new ones:

- `packages/TestingFramework/integration-test-suite/src/checks/rls-isolation.checks.ts` — key-scoped isolation between two
  principals; post-image update rejection end to end
- `packages/TestingFramework/integration-test-suite/src/checks/scope-enforcement.checks.ts` — filtered scope rules through
  the real resolver path
- `packages/TestingFramework/integration-test-suite/src/checks/server-cache.checks.ts` — **highest-risk seam.** MJ auto-caches
  small unfiltered result sets and the server trusts its cache completely. Assert a filtered principal is never served an
  unfiltered cached result, and that two principals with different resolved filters never share a cache entry.

Plus coverage that the filter applies on paths a `PreRunViewHook` would have missed — `BaseEntity.Load()` by primary key,
`RunViews` (plural), and the count query as well as the data query — which is the concrete payoff of the RLS-extension route.

---

## 8. Sequencing

| Phase | Contents | Gate |
|---|---|---|
| **1** | WS1 + WS2. No schema changes, no CodeGen. | Both test tiers green. Independently shippable and independently valuable. |
| **2** | Migration adding `RowFilterID` to both scope tables → `mj sync push` → `mj codegen`. | Generated entity classes carry the new fields. No TypeScript written against them before this completes — see the `.Get()`/`.Set()` prohibition. |
| **3** | WS3: `APIKeyActingContext` + token resolution + `GetUserRowLevelSecurityWhereClause` composition + `context.ts` wiring + rule-save validation in `MJCoreEntitiesServer`. | Both test tiers green. |
| **4** | Docs: package README trust-boundary section, `guides/UNIFIED_PERMISSIONS_GUIDE.md` update placing the key layer in the permission model. | — |

Migration authoring follows [`migrations/CLAUDE.md`](../migrations/CLAUDE.md) — naming, hardcoded UUIDs, the system columns
CodeGen owns, and the `mj sync push` → `mj codegen` ordering (out of order, CodeGen regenerates from stale definitions and
*silently deletes* properties).

---

## 9. Open questions for review

1. **FK vs inline filter text** (§5.1). FK to `RowLevelSecurityFilter` is the recommendation; inline `nvarchar(max)` on the
   scope row is simpler to author and loses reuse plus the named-object review surface. Reversible either way, but cheaper to
   decide now.
2. **Application ceiling filters in v1, or keys only?** The plan includes both because the column is free once the mechanism
   exists. Deferring the ceiling to v2 is not breaking.
3. **Vocabulary size.** Three tokens (`ActingOrganizationID`, `ActingPersonID`, `ActingScopeID`) covers the AR portal and the
   partner-integration cases. Anything else worth registering up front, given adding one later is a typed code change rather
   than a migration?
4. **WS1 behavior-change blast radius.** Do any existing deployments run an Update RLS filter *and* legitimately reassign a
   filter-referenced column as a non-exempt principal? If so, that flow needs to move to an exempt principal before this
   lands.
5. **Should WS1 and WS2 be their own PR?** They are independently valuable, carry a behavior change, and have nothing to do
   with API keys. Splitting gives them their own review and their own revert. The counter-argument is that WS3 depends on
   WS1's correctness and reviewing them together shows why.
