# BaseEngine server-side load identity — implementation plan

**Status: IMPLEMENTED and green (2026-08-08) — except D7, which was implemented, found to
cause two integration regressions, and REMOVED from this change. See §9.**

**Scope**: a pre-existing `BaseEngine` defect, independent of field-level security. It is
being fixed on the `JF_Entity_Field_Security` branch for convenience of delivery, not because
it belongs to that feature. Nothing here depends on FLS shipping, and FLS does not depend on
this. §3 records the two narrow places they touch.

Evidence for every claim was gathered by code-reading the worktree
`~/MJDev/instances/fls-test/mj`; the full effects analysis (research questions R1–R10, all
engines enumerated, all call sites censused) lives in
[`baseengine-server-load-fidelity.md`](baseengine-server-load-fidelity.md), which this plan
supersedes as the implementation record. Line numbers are pre-change.

---

## 1. The bug

`BaseEngine` caches whole tables in process memory and serves them to every user of the
process. But it loads that cache **as whichever user happened to call `Config()` first**, and
runs every query through the normal permission pipeline as that user.

The mechanism, in `packages/MJCore/src/generic/baseEngine.ts`:

1. `Config()` → `Load(configs, provider, forceRefresh, contextUser)` stores
   `_contextUser = contextUser` (:571).
2. `LoadConfigs` pre-flights CanRead on every entity config via `CheckPermissionsOrSkipAll`
   (:1657). If the user is denied on **any one** of them, **all** configs are sealed as empty
   arrays flagged `permissionDenied`, and the engine is still marked loaded (:1678–1700).
3. Otherwise the configs are queried as that user (:1776, :1893) — so RLS scopes the rows and
   FLS can trim columns.
4. `_loaded = true` (:590). Every later `Config()` short-circuits (:516, :541). The cache is
   sealed for the life of the process.
5. Every background refresh — remote invalidation (:836), entity events (:1080), retry timers
   (:1287), expiration (:2112), cross-tab cache sync (:2064), full refresh (:2120) — re-fetches
   as the stored `_contextUser`, so the identity persists indefinitely.

The result depends on how the caller is restricted:

| Restriction | Symptom | Loud or silent? |
|---|---|---|
| No CanRead on any one config entity | Whole engine sealed empty; `GetConfigData` accessors throw `PermissionConstrainedError` (:384–393) for **every** user | Loud — a process-wide engine outage |
| RLS row scoping | Queries succeed with only that user's rows; cached and served to everyone | **Silent** |
| FLS column denial | `entity_object` RunViews aren't trimmed, but per-record `Load()` is — partial records cached process-wide | **Silent** |
| Raw getters that bypass `GetConfigData` | Empty array reads as "no rules exist"; `SkillPermissions` (BaseAIEngine.ts:663–665) is open-by-default, so empty means permissive | **Silent, fail-open** |

This is not theoretical and not new — it predates FLS entirely. Entity permissions and RLS
have always been able to poison an engine cache.

## 2. Where it actually bites

MJAPI boots in `full` mode and pre-warms **registered** engines as the system user
(`MJServer/src/index.ts:331–334`), which is why this isn't constantly on fire. The gaps:

1. **Engines with no `@RegisterForStartup`** load lazily as the first request user, even in
   full mode: `TemplateEngineServer`, `ActionEngineBase`/`Server`, `CommunicationEngine`,
   `EntityCommunicationsEngine`. Reached from `RunTemplateResolver.ts:104`,
   `ActionResolver.ts:183–292`, `EntityCommunicationsResolver.ts:186–188`.
2. **The deferred-startup window.** `AIEngine` registers deferred with a **15,000 ms** delay
   (`AIEngine.ts:66–71`). A request that first-touches it inside that window seals the cache as
   that request's user, and the deferred system-user load that arrives later is a no-op because
   `_loaded` is already true.
3. **`Config(true, requestUser)` at request time** re-loads the shared cache as the request
   user and rotates `_contextUser` for all future background refreshes:
   `RunTemplateResolver.ts:104`, `FileResolver.ts:456`, `VectorizeEntityResolver.ts:78`,
   `IntegrationDiscoveryResolver.ts:1387/2396/5085/5737`.
4. **Startup's own fallback.** When the system user can't be resolved, startup runs as *any
   active Owner* (`sysUser || backupSysUser`, `SQLServerDataProvider/src/config.ts:44–46`).
   An Owner is not FLS-exempt and may carry RLS — so full mode itself can pre-warm restricted.
5. **Downstream repos** (SaaS, Skip-Brain agent runners) genuinely running task mode with real
   end-user contexts. Not enumerable from this repo.

Note: in-repo task-mode processes (MetadataSync, CodeGen, MJCLI, AICLI, TestingFramework CLI)
all bootstrap through `setupSQLServerClient` and pass the **system user** as their own context,
so they are already fine. "Task mode is the exposure" is the wrong framing for this repo.

Concrete live example: `conversations.ts:412` lazily calls
`ResourcePermissionEngine.Instance.Config(false, contextUser)` — the first restricted caller
seals a partial permission table for the whole process.

## 3. Relationship to FLS (why this is orthogonal)

Independent: the defect exists with entity permissions and RLS alone, both of which long
predate FLS. Two narrow points of contact, neither a dependency:

- FLS already shipped a **system-user exemption** for field permissions
  (`entityInfo.ts:1086`) precisely because engine caches are process-wide. That exemption is a
  partial version of this fix — it protects column width only. It cannot help with entity
  CanRead sealing or RLS row scoping. This plan generalizes it to one identity decision.
- Once engines load as the system user, the FLS `entity_object` shared-cache exemption
  (`providerBase.ts`, `flsCacheExemptEntityObjectRequest`) stops firing for engine traffic. It
  must be **kept** for non-engine restricted `entity_object` requests, but its documented
  "accepted cost" note becomes near-moot. Doc-only follow-up, listed in §8.

## 4. Design

### D1 — A pluggable system-user source in MJCore

A concrete base class in MJCore, resolved through `MJGlobal`'s ClassFactory, that answers one
question: *for this provider, what is the MJ system user?* The default answers `null`.
Server-side packages register a subclass that answers properly.

Why a class-factory plugin rather than a member on `IMetadataProvider` (the rejected first
attempt): a metadata provider's job is data access, not identity policy, and putting the lookup
in MJCore duplicated `UserCache` — creating a second source of truth that can drift from it
(role sync refreshes `UserCache`; a private MJCore memo would not). The plugin lets the server
implementation simply return what `UserCache` already knows.

**Naming.** Avoiding `Resolver` (conflates with GraphQL resolvers) and `Provider` (conflates
with MJ data providers). MJ already has a `…Source` family — `AWSKMSKeySource`,
`ConfigFileKeySource`, `EnvVarKeySource`, `EntityDocumentVectorSource` — that reads as "where
this comes from," which is exactly the question. All candidates below are collision-free.

The name should carry the *category*, not today's single method, because the category is
already populated. A repo sweep found **19 non-test sites** hand-resolving well-known users
through `UserCache`, and they want more than the system user:

- plain system user — `MJServer/src/index.ts:331,1321`, `auth/index.ts:177`,
  `ResolverBase.ts:715`, `IntegrationDiscoveryResolver.ts:2127`,
  `rest/SignatureWebhookHandler.ts:95`, `rest/OAuthCallbackHandler.ts:568`,
  `MJCLI/src/utils/open-app-context.ts:88`, `commands/artifacts/reclassify.ts:68`,
  `SQLServerDataProvider/src/config.ts:44`, both FLS config guards in MJCoreEntitiesServer;
- **system user with an active-Owner fallback** — all three telephony routers
  (`TwilioTelephonyRouter.ts:178`, `VonageTelephonyRouter.ts:233`,
  `RingCentralTelephonyService.ts:301`) plus `config.ts:44` and `index.ts:331`;
- **scoped-anonymous / widget-guest elevation** — `scoped-anon-elevation.checks.ts:71,151`,
  and the MJServer paths that "fail closed to the caller when no system user is available".

So the future is plainly "well-known, platform-owned identities that are not end users":
system user today, the Owner fallback and the scoped-anonymous identity as visible next
members. That argues for naming the category and leaving room for
`GetFallbackOwnerUser(provider)` / `GetScopedAnonymousUser(...)` beside `GetSystemUser`.

| Option | Base class (MJCore) | Note |
|---|---|---|
| **1 (recommended)** | `WellKnownUserSource` | Names the populated category exactly; `GetSystemUser(provider)` reads naturally on it; doesn't overpromise beyond users |
| 2 | `PlatformUserSource` | Same idea, vaguer about what qualifies |
| 3 | `SystemUserSource` | Literal and precise for today; strains if a second well-known identity is added |
| 4 | `SystemContextSource` | Widest headroom (non-user things later), but "context" is heavily overloaded in MJ (`contextUser`) |

Shape (recommended option):

```ts
// packages/MJCore/src/generic/wellKnownUserSource.ts
export class WellKnownUserSource {
    /**
     * The MJ system user for the given provider's connection, or null when this process
     * has no elevated identity to offer (browsers, and any process without a server-side
     * subclass registered). Default implementation returns null.
     */
    public async GetSystemUser(provider: IMetadataProvider): Promise<UserInfo | null> {
        return null;
    }
}
```

Three mechanics verified in `packages/MJGlobal/src/ClassFactory.ts` that drive this shape:

- `CreateInstance` **falls back to instantiating the base class itself** when nothing is
  registered (:294, documented as deliberate; `BaseEntity` relies on it). So the base must be
  **concrete, not abstract** — then the no-registration fallback *is* the correct client
  behavior, for free.
- Do **not** mark it `@RequiresSubclass()`; that makes unresolved lookups throw. We want a
  silent, correct default on the client.
- Resolution is highest `priority` wins, ties broken by last-registered
  (`resolveRegistration`, :538–556) — so a downstream repo can override with a higher priority
  to supply, say, a tenant service account.

Use `TryCreateInstance` rather than `CreateInstance` where we want to *know* whether a real
subclass resolved; it returns `{Resolved, Instance, Reason}` instead of a hollow fallback, and
that drives the diagnostic in D6.

**Method name**: `GetSystemUser(provider)` for consistency with the existing
`UserCache.GetSystemUser()`. (`GetSystemContextUser` also works; the argument for
`GetSystemUser` is that the two now mean the same thing and should read the same.)

**Async** even though `UserCache.GetSystemUser()` is synchronous: a PostgreSQL task-mode
process has no warm cache and must query. `Load()` is already async, so this costs nothing and
avoids a breaking signature change later.

### D2 — ONE implementation, in GenericDatabaseProvider

Registration only exists if the module is in the process's import graph, so *where* the
subclass lives decides which processes get the behavior.

MJAPI loads MJServer — but MJCLI, CodeGen, MetadataSync, AICLI and the TestingFramework CLI do
not. In MJServer, every CLI and job process would silently fall back to the null source: the
exact silent degradation this change exists to prevent. So: a data-provider package.

The dependency graph lets it be a **single** implementation rather than one per dialect, which
matches the observation that the two would be near-identical. Both concrete providers depend on
`@memberjunction/generic-database-provider` (verified in both `package.json` files), and
GenericDatabaseProvider does **not** depend on SQLServerDataProvider, so there's no cycle.
Loading either provider therefore loads the registration:

```
MJCore            WellKnownUserSource            (concrete, returns null)
   ↑
GenericDatabaseProvider   DatabaseWellKnownUserSource   @RegisterClass — the one implementation
   ↑                          ↑
SQLServerDataProvider     PostgreSQLDataProvider        both inherit it by being loaded
```

**It must query, not read `UserCache`** — and that is a feature, not a compromise. `UserCache`
lives in SQLServerDataProvider, so GenericDatabaseProvider importing it would invert the
dependency. Querying `vwUsers`/`vwUserRoles` through the existing dialect-neutral helpers
(`QuoteSchemaAndView`, `QuoteIdentifier`, `BuildParameterPlaceholder`, `MJCoreSchemaName` — all
already on `DatabaseProviderBase`) instead:

- **fixes PostgreSQL properly.** Today the PG path has no user cache of its own; MJServer
  reaches into SQLServerDataProvider's `UserCache` singleton and **writes its private `_users`
  field through a cast** (`MJServer/src/index.ts:1754`). A PG process that doesn't go through
  MJServer has no system user at all. A provider-level query removes that entirely.
- **works on a cold cache**, which the current consumers do not — both FLS config guards skip
  silently when `UserCache` was never refreshed, and `UserCache.GetSystemUser()` actually
  **throws a TypeError** in that state (`.find()` on an undefined `_users`, `UserCache.ts:30–32`
  + `:71–73`; `Refresh` swallows its own errors at `:62–64`).

**Do not memoize indefinitely.** That was the specific flaw in the reverted attempt: a
permanent private copy drifts from `UserCache` after role sync
(`SyncRolesUsersResolver.ts:115`). Engine loads are rare — once per engine per process plus
refreshes — so query on demand, or memoize with a short TTL. Populate `UserRoles` from
`vwUserRoles`: entity CanRead is role-driven.

*Optional, only if the extra round trips ever matter*: SQLServerDataProvider may register a
higher-priority subclass that returns `UserCache`'s copy when the cache is warm and defers to
the base otherwise. Not proposed for this change.

**Do not adopt the `backupSysUser` any-active-Owner fallback** that startup and the telephony
routers use. An Owner is not the FLS-exempt identity and may carry RLS; using one as the
process-wide cache identity is the same class of bug, quieter. Return null and let D6 degrade.
(If a well-known *Owner fallback* is wanted later, it belongs as its own named method on this
class — see the naming rationale in D1 — not smuggled into `GetSystemUser`.)

### D3 — Two identities inside the engine

Add a private `_loadUser: UserInfo | null` alongside `_contextUser`, plus a protected
accessor (`LoadUserToUse`, and a `LoadUserFor(explicit?)` variant for public entry points that
accept a user argument). `_loadUser` is what every internal read runs as; `_contextUser` keeps
its current meaning — the caller — behind the public `ContextUser` getter (:2181).

Both single-field alternatives are wrong, and this was verified against real consumers:

- Substituting **only at the initial load** leaves all six refresh paths running as
  `_contextUser`, so the first invalidation event, entity event, or expiration timer
  re-poisons the cache. Silently and terminally.
- Overwriting **`_contextUser` itself** silently re-attributes everything that reads the public
  getter: `run.UserID` on communication runs (`Communication/base-types/src/BaseEngine.ts:114`),
  `RunByUserID` on recommendations (`AI/Recommendations/Engine/src/Engine.ts:75`), action
  execution logs (`Actions/Engine/src/generic/ActionEngine.ts:557/561`), and
  `ScheduledJobEngine`'s direct-SQL statistics writes (:1035–1041).

### D4 — Route every internal read through the load user

All fourteen sites, verified by grep of `this._contextUser`:

| Path | Lines |
|---|---|
| Initial load + `AdditionalLoading` | 576, 577 (via the `LoadConfigs`/`AdditionalLoading` arguments) |
| Remote-invalidate: re-fetch, hydration, post-processing | 824, 836, 846, 876, 903 |
| Debounced entity-event refresh + retry timer | 1080, 1105, 1287, 1289 |
| `cloneEntityForCache` hydration | 1484 |
| Cross-tab cache fallback, `AddDynamicConfig`, `RefreshItem`, `RefreshAllItems` | 2064, 2088, 2112, 2120 |

After the change `_contextUser` should have exactly three readers: the assignment (:571), the
public getter (:2181), and the final fallback inside `LoadUserFor`.

Because `Load()` passes the load user into `LoadConfigs`, everything downstream —
`CheckPermissionsOrSkipAll`, `LoadMultipleEntityConfigs`, `LoadSingleEntityConfig`,
`HandleSingleViewResult` — inherits it without individual edits.

**Datasets**: `LoadSingleDatasetConfig`'s bypass path passes the context user (:1929) and
should pass the load user; the non-bypass path passes **no user at all** (:1932) and should be
**left alone** for now. Threading a user there newly enables `PostProcessRows` (datetime
normalization + decryption), which changes returned bytes. It's a real inconsistency worth
fixing, but it is a separate decision (§7).

### D5 — The permission gates must evaluate the load user

`CheckPermissionsOrSkipAll` (:1657) and the post-failure classifier
`ContextUserCanReadConfigEntity` (:1849) must test the **effective load user**, not the
original caller. If they keep testing the caller, the pre-flight still seals the engine and a
genuinely transient failure still gets misclassified as permanent — recreating the bug.

### D6 — Degrade to today's behavior, never crash

When no system user resolves (no subclass registered, missing row, cold cache, query failure),
`_loadUser` stays null and `LoadUserToUse` falls through to the caller — bit-for-bit the
current behavior. Emit **one warning per engine class** so an operator can tell that fidelity
protection is inactive rather than silently absent. `WarningManager`
(`MJGlobal/src/warningManager.ts`) already provides per-session warn-once semantics and is
consumed by MJCore today; a static `Set` of class names is the lighter alternative.

Also short-circuit when the caller **already is** the system user (`IsSystemUser`,
`securityInfo.ts:156`): no lookup, and the startup pre-warm path stays provably byte-identical
to today.

### D7 — Make the system user genuinely permission-unconstrained (DECIDED)

**Decision taken: the system user is unconstrained by permissions, and the code will say so
rather than depending on role data to make it accidentally true.**

Today only field-level security exempts it in code (`entityInfo.ts:1086`). Entity permissions
and RLS exempt it only *emergently*: `GetUserPermisions` (`entityInfo.ts:2608–2644`) is purely
role-driven with no `IsSystemUser` check, and `UserExemptFromRowLevelSecurity`
(`entityInfo.ts:2657–2684`) exempts any user holding a role with a filter-less permission row —
which the system user satisfies only because its baseline Developer/Integration roles happen to
have null RLS filter IDs. One Deny row on a role it holds, or one RLS filter attached to
Developer, and `CheckPermissionsOrSkipAll` seals an entire engine empty for the whole process.

That fragility is unacceptable under this design, and the FLS rationale applies verbatim: the
server reaches the database through a single service login that can already read and write
everything, so constraining the system user at the app tier protects nothing and only breaks
the server's ability to do its own work.

Changes:

- `EntityInfo.GetUserPermisions` — short-circuit to full permissions (`CanRead`, `CanCreate`,
  `CanUpdate`, `CanDelete` all true) when `IsSystemUser(user)`. All four, not just Read: "always
  unconstrained" is the decision, and the service login already has that authority.
- `EntityInfo.UserExemptFromRowLevelSecurity` — short-circuit to exempt when `IsSystemUser`.

Deliberately **not** changed: the **API-key row-filter layer**
(`getAPIKeyRowFilterClause`, `entityInfo.ts:2805–2825`), which is intentionally not role-exempt
and fails closed. Those filters scope a *key*, not an identity — a narrower ceiling voluntarily
placed on a credential. A `UserCache`- or query-resolved system user carries no
`APIKeyRowFilters` anyway, so this is a no-op in practice; it is called out so the exemption's
boundary is explicit rather than assumed.

Note this makes the two save-time config guards
(`MJEntityFieldPermissionEntityServer`, `MJUserRoleEntityServer`) belt-and-braces rather than
load-bearing — they still earn their place by telling an administrator "no" at configuration
time instead of letting them build a rule that silently does nothing.

### D8 — Keep the `ProviderType === Database` gate in BaseEngine

The plugin already makes browsers a no-op (no subclass in the bundle), but a Node process can
hold a GraphQL (`Network`) provider *and* have SQLServerDataProvider loaded — hybrid processes
and tests do exactly that. Gating on `ProviderType` first is cheap, keeps the intent readable
at the call site, and reuses the predicate already at :528. Belt and braces.

Resolution must happen **after** `SetProvider(provider)` (:570) so it consults the provider
this load actually uses. (Pre-existing quirk, left alone: the :528 guard runs *before*
`SetProvider`, so on a first-ever load with the provider passed only as an argument it reads
the previously-bound or global provider.)

## 5. Code changes

| # | File | Change |
|---|---|---|
| 1 | `packages/MJCore/src/generic/wellKnownUserSource.ts` (new) | Concrete `WellKnownUserSource` base returning null; exported from MJCore's index |
| 2 | `packages/MJCore/src/generic/baseEngine.ts` | `_loadUser`, `LoadUserToUse`/`LoadUserFor`, resolution step after `SetProvider`, warn-once, all 14 sites routed (D3/D4/D6/D8), gates on the effective user (D5) |
| 3 | `packages/MJCore/src/generic/entityInfo.ts` | `IsSystemUser` short-circuits in `GetUserPermisions` and `UserExemptFromRowLevelSecurity` (D7) |
| 4 | `packages/GenericDatabaseProvider/src/` (new file) | `DatabaseWellKnownUserSource` — `@RegisterClass(WellKnownUserSource)`, queries `vwUsers`/`vwUserRoles` dialect-neutrally, roles populated, no long-lived memo, null on missing row or failure; imported from the package entry so the decorator actually runs |
| 5 | `packages/MJCore/src/__tests__/baseEngine.systemUserLoad.test.ts` (new) | Engine behavior |
| 6 | `packages/MJCore/src/__tests__/wellKnownUserSource.test.ts` (new) | Base default returns null; ClassFactory resolves the registered subclass and honors priority |
| 7 | `packages/MJCore/src/__tests__/` (extend FLS/permission tests) | System user unconstrained for all four permission types; RLS-exempt regardless of roles; API-key row filters still apply (D7) |
| 8 | `packages/GenericDatabaseProvider/src/__tests__/` | Source: resolves with roles, null on absent row, null (no throw) on query failure, correct dialect SQL |

No changes to SQLServerDataProvider or PostgreSQLDataProvider — both inherit the registration
by depending on GenericDatabaseProvider. That is the point of D2.

## 6. Test plan

New unit coverage:

- substitution engages on a Database provider with a registered source; the query runs as the
  system user even though a restricted user called `Config()`;
- **the anti-re-poison canary** — after load, `RefreshItem`/`RefreshAllItems` and an
  entity-event refresh still run as the system user (this is the test that fails if any of the
  fourteen sites is missed);
- `ContextUser` still returns the caller (attribution unchanged);
- a caller denied CanRead no longer seals the engine (`IsPermissionConstrained === false`);
- `Config(true, restrictedUser)` reloads as the system user;
- caller already system → no lookup performed;
- Network provider → no substitution, caller used;
- degradation: no subclass registered / source returns null / source throws → caller used,
  engine still loads, warning emitted once per class;
- user-less server-side `Config` still throws (substitution doesn't legalize it);
- the base class default returns null, and ClassFactory resolves the highest-priority
  subclass when one is registered.

Regression tiers, both required by the definition of done. Run each package with its **own**
`pnpm test`, not `npx vitest` — MJServer pins vitest 3 while the root pins 4, and v4 rejects
`vi.fn(() => …)` used as a constructor, producing three false failures in
`RealtimeBridgeResolver.test.ts`.

Baselines to match: MJCore 1784, SQLServerDataProvider 87, GenericDatabaseProvider 888 (+5
skip), GraphQLDataProvider 274, MJCoreEntities 573, MJCoreEntitiesServer 394, MJServer 802
(+56 skip); integration tier 55/55 (`pnpm run test:integration`, MJAPI up on :4010).

Note the integration tier cannot by itself prove the lookup path: MJAPI boots in full mode
passing the system user, which hits the D6 short-circuit by design. To exercise it live, either
enable SQL statement logging on the instance or drive a task-mode process.

One test-infrastructure fact worth writing down: `BaseEngine` extends `BaseSingleton`, whose
constructor **returns the already-registered instance** for the class name. Engine tests must
delete the `___SINGLETON__<ClassName>` key from `GetGlobalObjectStore()` to obtain a genuinely
unloaded engine, or the second test in a file silently exercises the first test's loaded engine.

## 7. Decisions

### Settled

- **Method name**: `GetSystemUser(provider)`.
- **Concrete base, `@RegisterClass` only** — no `@RequiresSubclass()`, so an unregistered
  process silently and correctly gets the null default.
- **Subclass lives in a data-provider package** — refined in D2 to a *single* implementation in
  GenericDatabaseProvider, since both concrete providers depend on it.
- **Generic, not engine-specific** — the class names a category (well-known platform
  identities) with 19 existing hand-rolled consumers and at least two more members visible.
  The "a generic name advertises an escalation primitive" objection is noted and answered by
  D7: the system user is now *defined* as unconstrained, so the capability is explicit policy
  rather than an accident to be hidden.
- **The system user is always permission-unconstrained (D7)** — implemented in code, not left
  to role data.

### Open

1. **Class name.** `WellKnownUserSource` (recommended), `PlatformUserSource`,
   `SystemUserSource`, or `SystemContextSource` — see the D1 table for the trade-offs. The
   recommendation follows from naming the category rather than today's single method.
2. **Save authorship.** Cache-resident entities hydrate with the load user as
   `ContextCurrentUser`, so an engine that mutates-and-saves a cached entity
   (`UserInfoEngine.SetSetting` :357/:371, `conversations.ts` moveFolder :606/:620) authors
   `RecordChange` as the system user. This already matches full-mode behavior today; the
   alternative is re-stamping hydrated entities with `_contextUser` before save. Accept
   (recommended) or re-stamp?
3. **Dataset post-processing** — was decision 4; explained and recommended below. Defer.

### On the dataset item (previously "dataset threading") — recommend DEFER

This one was written opaquely; plainly:

Engine configs can be `Type: 'dataset'` instead of `'entity'`, and dataset loads take one of
two paths in `LoadSingleDatasetConfig`. The force-refresh path passes the context user
(:1929); the normal cached path calls `GetAndCacheDatasetByName(name, filters)` and passes
**no user at all** (:1932).

For datasets the user has **no security effect whatsoever** — `GetDatasetByName` applies no
CanRead check, no RLS, and no FLS (`GenericDatabaseProvider.ts:4230–4458`). But whether a user
is *present* does change the returned bytes: `PostProcessRows` runs only
`if (entityInfo && contextUser)` (:4393–4398), and it does two things — datetime normalization
and **decryption of encrypted fields**.

So today the same dataset config yields *different data* depending on which path loaded it:
via force-refresh, decrypted and datetime-adjusted; via the normal path, raw ciphertext and
unadjusted datetimes. That is a pre-existing inconsistency sitting on lines this change
touches.

Passing the load user to the normal path would make both paths agree — but it would also mean
engine dataset properties that hold ciphertext today start holding plaintext, and datetime
strings shift. That is a real, user-visible data change with its own blast radius and its own
testing needs, and it has nothing to do with load identity.

**Recommendation: leave :1932 alone and keep this PR about identity.** Pass the load user on
the bypass path (:1929) only, which is identity-consistent and byte-neutral because datasets
don't vary by user. File the inconsistency as its own item (§8).

## 8. Out of scope — follow-ups to file separately

- **Registry hardening.** `BaseEngineRegistry.FindCachedEntity`/`TryGetCachedRecords`
  (:651–717) hand out engine arrays with no check of `permissionDenied`/`loadedSuccessfully`;
  a sealed-empty `[]` is truthy and propagates (live consumer: `AIEngine.RefreshActions`;
  also `sync-metadata-engine.ts:313`). Independent bug, worth its own fix.
- **Two broken call sites**: `QueryResolver.ts:177` and `AIAgentPermissionHelper.ClearCache`
  (:186–191) call `Config(true)` with **no** user — they throw server-side today (the latter
  swallowed, so that cache never refreshes).
- **Doc updates**: the "an FLS-restricted contextUser driving an engine is warn-don't-support"
  posture (`guides/FIELD_LEVEL_SECURITY_GUIDE.md` §3.4, `plans/field-level-security.md` R5,
  the D-4 bullet, both config-guard comments) becomes wrong for engines once this ships.
- **Registry keying** by class name only, which cross-serves between connections in a
  multi-connection process.
- `StartActionLog` ignoring `params.ContextUser` (`ActionEngine-Base.ts:259`);
  `AIEngine.ExecuteEntityAIAction`'s user-less `GetEntityObject` (:1406); retiring
  `backupSysUser`; `UserInfoEngine._loadedForUserId` reload churn on the server (:169–171).
- **Datasets remain an FLS/RLS bypass** generally (`GetDatasetByName` applies no CanRead, RLS,
  or FLS; `DatasetResolver.ts:51` passes no user) — pre-existing, documented at
  `plans/field-level-security.md:664`, unrelated to this fix.
- **Dataset raw-vs-processed inconsistency** — the cached path (`baseEngine.ts:1932`) passes no
  user and so skips `PostProcessRows`, while the force-refresh path (:1929) runs it; the same
  dataset therefore caches ciphertext or plaintext depending on which path loaded it. Deferred
  from this change (§7); fixing it changes returned data and needs its own testing.
- **Consolidating the 19 hand-rolled system-user lookups** onto the new class (see the D1
  list). Highest-value first: the two FLS config guards in MJCoreEntitiesServer, which would
  also drop their `@memberjunction/sqlserver-dataprovider` import and stop skipping silently on
  a cold cache; then the three telephony routers, which want a named Owner-fallback method
  rather than repeating `GetSystemUser() ?? find(Owner)`; then startup's
  `sysUser || backupSysUser` sites. None are required by this change.


---

## 9. Implementation record (2026-08-08)

### Shipped

| File | Change |
|---|---|
| `packages/MJCore/src/generic/wellKnownUserSource.ts` (new) | Concrete `WellKnownUserSource` with `GetSystemUser(provider)` returning null; exported from MJCore |
| `packages/MJCore/src/generic/baseEngine.ts` | `ResolveContextUser()` + once-per-class fallback warning; `Load()` calls it after `SetProvider` |
| `packages/GenericDatabaseProvider/src/DatabaseWellKnownUserSource.ts` (new) | `@RegisterClassEx(WellKnownUserSource, { skipNullKeyWarning: true })`; queries `vwUsers`/`vwUserRoles` dialect-neutrally, roles populated, null on absent row / non-DB provider / failure |
| `packages/MJCore/src/__tests__/baseEngine.systemUserLoad.test.ts` (new) | 13 tests |
| `packages/MJCore/src/__tests__/wellKnownUserSource.test.ts` (new) | 5 tests |
| `packages/GenericDatabaseProvider/src/__tests__/databaseWellKnownUserSource.test.ts` (new) | 6 tests |

**The dual-identity design (old D3/D4) was dropped at Jordan's direction.** There is ONE
identity: `ResolveContextUser` sets `_contextUser` to the system user on a Database provider,
and every existing load/refresh/hydration path reads it unchanged. This shrank the diff from
fourteen edited call sites to five changed lines in `Load()`, and makes the rule structurally
impossible to violate — a refresh path added later cannot forget to use the right identity.
The cost is the accepted semantic change: `ContextUser` reports the system user on a server.

Two details that fell out of the simpler shape:
- **The identity is sticky.** Once resolved, a later `Config(forceRefresh, someUser)` does not
  move it, so a restricted caller cannot pull the shared cache back under their permissions.
  `_contextUser` doubles as the lookup memo, so hot per-request force-refresh paths
  (RunTemplateResolver) do not re-query. No extra field needed.
- **`RegisterClassEx` with `skipNullKeyWarning`** — the un-keyed registration is correct here
  (one source per process, not keyed variants), and without the flag every server process logs
  a factory advisory at startup.

### Verification

- Unit: MJCore **1802** (1784 baseline + 18), GenericDatabaseProvider **894** +5 skip (888 + 6),
  SQLServerDataProvider 87, MJCoreEntities 573, MJCoreEntitiesServer 394, GraphQLDataProvider
  274, MJServer 802 +56 skip. All at or above baseline. 24 new tests.
- Builds clean across MJCore and all seven downstream packages.
- Integration tier against a live MJAPI running this code: **55/55**.

### D7 (system user unconstrained) — REMOVED, needs its own change

Implemented as decided, then backed out after it caused two integration regressions. Bisected
by neutralizing each short-circuit independently (baseline log confirms both tests passed
before):

1. **`GetUserPermisions` short-circuit → IT68 (SA1/SA4/SA5).** Mechanism fully understood. The
   testing CLI runs as the System user (`TestingFramework/CLI/src/lib/mj-provider.ts:192`,
   `UserByName("System")`), and IT68 synthesizes its zero-role anonymous principal by cloning
   `ctx.User` and emptying `UserRoles` — so the fixture carries `SystemUserID` and the
   ID-keyed short-circuit grants it everything.
   *Production is not affected*: `buildMagicLinkSessionUser` builds from
   `verifyUserRecord(email, …)` — the magic-link user, never System — and
   `CloneUserForSessionContext` preserves roles. A repo sweep found **no** non-test code
   constructing a principal with `UserRoles: []`.
   **But the finding is real and should be recorded with the decision:** after D7, *any*
   `UserInfo` carrying `SystemUserID` is fully privileged regardless of roles. De-privileging
   by stripping roles stops working for that ID. IT68 would need to base its fixture on a
   non-System user, which is also more faithful to production.
2. **`UserExemptFromRowLevelSecurity` short-circuit → IT31/RVM4.** Mechanism **not**
   understood, which is why D7 is out rather than patched. 21 engine-cached entities returned
   `entity_object` rows missing `__mj_CreatedAt`/`__mj_UpdatedAt`. Code reading says this
   should be impossible: the exemption is consumed only by
   `GetUserRowLevelSecurityWhereClause` → `GetEffectiveRowFilterWhereClause` (the only
   non-test callers), which yields an empty clause for System either way — exempt returns `''`,
   and not-exempt with no matching RLS objects also returns `''`. So the observed effect
   contradicts the model of the code, and something here is not yet understood. Candidate
   leads for the follow-up: the RLS clause participates in the server RunView cache
   fingerprint (`ComputeRunViewRLSWhereClause`, providerBase.ts:2205) while the **client**
   fingerprint omits the `rls:` segment (a pre-existing defect already logged in
   `MJ-UPSTREAM.md`), so a fingerprint shift on one side only could serve a mis-shaped cached
   payload; and Workstream D marks absent columns not-loaded, which is what would make them
   vanish from `GetAll()`.

Recommendation: pursue D7 as its own change, starting by explaining RVM4. The fragility it was
meant to fix (the system user's entity-CanRead and RLS exemptions being role-data-emergent
rather than code-guaranteed) is real and unaddressed until then.
