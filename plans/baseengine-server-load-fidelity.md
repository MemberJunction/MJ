# BaseEngine server-side load fidelity — effects analysis and recommended design

**Status: RESEARCH RECORD ONLY. Superseded for implementation by
[`baseengine-system-user-loading.md`](baseengine-system-user-loading.md).**

A first implementation of §4 was written and then **reverted** — it resolved the system user
through a new optional member on `IMetadataProvider`, which put identity policy on a
data-access interface and created a second source of truth for the system user that could
drift from `UserCache`. The replacement design uses a ClassFactory-registered
well-known-user source plugin instead (name pending). The research below (§1–§3, the R1–R10 answers) was not
affected by that change of mechanism and remains the evidence base; §4–§6 are superseded.
See the corrected as-built note at the bottom.

Proposal under analysis: when `ProviderToUse.ProviderType === 'Database'`, BaseEngine executes
all internal loads as the MJ system user so process-wide engine caches are never corrupted by a
restricted first caller. When `'Network'`, behavior is unchanged.

Every claim below was verified in code this session (worktree
`~/MJDev/instances/fls-test/mj`, branch `JF_Entity_Field_Security`, uncommitted FLS batch
included). Line numbers are as of this session.

---

## 1. Verdict

The change is right, and it is **safer and smaller than the jumpstart assumed** — no engine in
this repo needs an opt-out, the client path is provably untouched, and full-mode MJAPI already
produces byte-identical caches. But two parts of the problem statement were wrong and the
naive implementation has a trap that would rebuild the bug it fixes:

1. **"Task mode is the exposure" is mostly wrong in-repo.** Every in-repo task-mode process
   (MetadataSync, CodeGenLib, MJCLI, AICLI, TestingFramework CLI) bootstraps through
   `setupSQLServerClient`/the PG equivalent, warms UserCache, and passes the **system user as
   its own contextUser** — the proposal is a no-op for them. The real in-repo exposure is
   full-mode MJAPI itself (§2).
2. **Poisoning today is mostly loud, not silent.** The shipped permission-constrained layer
   (`CheckPermissionsOrSkipAll`, baseEngine.ts:1657–1703) pre-flight-checks CanRead on every
   entity config and, on ANY denial, seals ALL configs empty with `permissionDenied: true` —
   and `GetConfigData`-routed accessors then **throw `PermissionConstrainedError`**
   (baseEngine.ts:384–393). A restricted first caller therefore mostly causes a process-wide
   engine **outage** (throws / empty registry reads), not silently-wrong data. The silent
   residue is narrower but real: RLS-partial loads (succeed with fewer rows), the new
   FLS-trimmed single-record `Load()` path, raw-field getters that bypass `GetConfigData`
   (e.g. `SkillPermissions`, BaseAIEngine.ts:663–665), and the `HandleSingleViewResult`
   empty-seal classifier (:1809–1817) as a secondary path.
3. **The trap:** substituting the system user only at Config-time load leaves every
   event-driven refresh path re-fetching as `this._contextUser`
   (baseEngine.ts:836, :876, :903, :1080, :1287, :1484, :2064–2120) — the first
   invalidation event, entity event, or expiration timer **re-poisons the cache**, silently
   and terminally. The design must cover all load paths (§4, D-A).

---

## 2. The corrected exposure set (what the change actually fixes, in-repo)

| # | Exposure | Evidence |
|---|---|---|
| 1 | **Unregistered engines in full-mode MJAPI** lazy-load as the first request user: TemplateEngineServer, ActionEngineBase/Server, CommunicationEngine, EntityCommunicationsEngine carry no `@RegisterForStartup` | grep of registrations; consumed at RunTemplateResolver.ts:104, ActionResolver.ts:183–292, EntityCommunicationsResolver.ts:186–188 |
| 2 | **The deferred-startup window**: AIEngine registers deferred with a 15,000 ms delay (AIEngine.ts:66–71). A request that first-touches it inside the window seals the cache as that request user; the later deferred system-user `Config(false)` is a **no-op** (`_loaded` short-circuit, baseEngine.ts:516/541) | RegisterForStartup.ts:602–607, 641–677 |
| 3 | **`Config(true, requestUser)` resolver sites** re-load shared caches as the request user even in full mode: RunTemplateResolver.ts:104, FileResolver.ts:456, VectorizeEntityResolver.ts:78, IntegrationDiscoveryResolver.ts:1387/2396/5085/5737 | q3/q6 census: 57 non-test `Config(true,…)` sites, 25 client-only, 29 safe, 3 needing attention |
| 4 | **Downstream repos** (SaaS/Skip-Brain agent runners) that genuinely run task mode with real end-user contexts | not enumerable from this repo — the design's escape hatch (D-F) covers them |
| 5 | **Startup fallback degradation**: when `GetSystemUser()` resolves nothing, startup runs as **any active Owner** (`backupSysUser`, config.ts:44–46, index.ts:331–334) — an Owner is NOT FLS-exempt, so full mode itself can pre-warm restricted | UserCache.ts:30–32 |

Live example the change fixes deterministically: `conversations.ts:412` lazily calls
`ResourcePermissionEngine.Instance.Config(false, contextUser)` — first restricted caller seals
a partial permission-table cache for the process.

---

## 3. Research answers (R1–R10, compressed — full reports in session record)

**R1 — Per-user engines: NONE need an opt-out.** Complete enumeration: ~50 BaseEngine
subclasses + ~12 composition wrappers. Exactly ONE engine builds a user-interpolated load
filter — UserInfoEngine — and only when `ProviderType === 'Network'`
(UserInfoEngine.ts:173–177; the code comment says the server intent verbatim: *"On the server
(Database provider), load everything because the server handles multiple users from a single
process"*). Every other user-scoped engine loads full tables and scopes per-user in accessors
(UserViewEngine, UserRoutineEngine, DashboardEngine, ResourcePermissionEngine, MCPEngine,
InteractiveFormsEngine). ConversationEngine opted out of BaseEngine.Load entirely for its
user-scoped query (conversations.ts:369–381, :418) — untouched. All nine `AdditionalLoading`
overrides are contextUser-agnostic. **System-user loads are not merely safe — they are what
these engines' accessors already assume.**

**R2 — RLS: the system user has NO code-level RLS exemption.** Exemption is emergent from role
data: `UserExemptFromRowLevelSecurity` (entityInfo.ts:2657–2684) exempts any user holding a
role with a filter-less EntityPermission row; the system user qualifies via its
Developer/Integration roles (baseline UserRole inserts). The only `IsSystemUser` check in the
permission layer is FLS (entityInfo.ts:1086). No engine relies on RLS-scoped loads. The
API-key row-filter layer is deliberately NOT role-exempt (entityInfo.ts:2805–2825) but a
UserCache-resolved system user carries no `APIKeyRowFilters`. See D-F.

**R3 — Leakage: nothing gets worse than today's default; one enforcement hole gets better.**
Full-mode MJAPI already pre-warms as the system user → byte-identical caches. The transport
that serves cache-shaped data verbatim — datasets — is **already permission-blind to any
authenticated user** (`GetDatasetByName`: no CanRead, no RLS, no FLS,
GenericDatabaseProvider.ts:4230–4458; `DatasetResolver.ts:51` passes no user). That is the
floor; engine caches cannot leak more than it. Enforcement lives at egress (resolvers/ACL
helpers) and those helpers need a *complete* cache to work: `GetEffectivePermissions` reads
`AIEngineBase.AgentPermissions` and **fails closed** on a sealed cache
(AIAgentPermissionHelper.ts:137–147 — a poisoned cache is a process-wide agent outage), while
`SkillPermissions` bypasses sealing and is open-by-default (BaseAIEngine.ts:663–665) — the one
genuine fail-open the change hardens.

**R4 — Saves: BaseEngine itself never writes; the split is structurally clean.** Zero
`.Save()` in baseEngine.ts. Identity leaks through hydration: cached entities carry the load
user as `ContextCurrentUser` (via `rv.RunView(params, contextUser)` :1776 and
`GetEntityObject(..., this._contextUser)` :876/:1484/:1965), and `BaseEntity.ActiveUser`
(baseEntity.ts:2835–2838) stamps `RecordChange.UserID` from it
(databaseProviderBase.ts:1879–1912). In full mode this is **already the system user** — the
proposal changes attribution only in the (rare, see §2) restricted-first-caller windows.
Business `UserID` stamps that consume the public `ContextUser` getter (Communication
`run.UserID` :114, RecommendationEngine `RunByUserID` :75, ActionEngine logs :557/:561,
ScheduledJobEngine direct-SQL stats writes :1035–1041) keep the caller under D-A.

**R5 — System-user resolution: optional provider accessor, implemented once in
GenericDatabaseProvider.** No user list exists anywhere in MJCore/IMetadataProvider today;
server `CurrentUser` is circular-null (providerBase.ts:4400–4402, SQLServerDataProvider.ts:619–621);
the PG path fills SQLServerDataProvider's UserCache by **poking its private field**
(MJServer index.ts:1737–1755). The system-user row is baseline-seeded on both platforms
(v2: V202407171600 :31272; PG v5 baseline :71958). Recommended shape in D-B.
**Trap: `UserCache.GetSystemUser()` THROWS (TypeError) on a never-populated cache**
(`_users` undefined, UserCache.ts:30–32 + :71–73; `Refresh` swallows failures :62–64) — any
accessor touching UserCache must null-guard.

**R6 — forceRefresh: 57 non-test `Config(true,…)` sites; 25 client-only; 29 safe (all reload
for new ROWS, none for user-scoping); 3 need attention:**
1. `QueryResolver.ts:177` — `Config(true)` with **no user**; throws today at :528 (broken
   retry path). Must be fixed to pass a user regardless of guard-order choice.
2. `AIAgentPermissionHelper.ClearCache` (:186–191) — fire-and-forget `Config(true)` no-user;
   throws and is swallowed today (cache silently never refreshes). Same fix.
3. `ScheduledJobEngine.OnJobChanged` (:447) — safe for data, but its direct-SQL mutations use
   `this.Base.ContextUser` (:1035–1041 etc.); D-A's dual identity keeps that stable.

**R7 — Datasets: user-invariant across identity; NOT invariant across contextUser presence.**
`contextUser` in the dataset SQL layer is logging-only; the one byte-affecting use is that
`PostProcessRows` (datetime normalization + decryption) runs only `if (entityInfo &&
contextUser)` (GenericDatabaseProvider.ts:4393–4398). The engine's non-bypass path passes NO
user (baseEngine.ts:1932) — so today the two engine dataset paths cache **different bytes**
for entities with datetime/encrypted fields. Threading the load user through fixes that
inconsistency; the plan-doc claim "no RLS/FLS on item rows" (field-level-security.md:664) is
confirmed and the FLS work did not touch dataset paths. Transitive hazard the proposal
removes: a poisoned EncryptionEngineBase leaves ciphertext in shared dataset cache slots
(:746–752, :4403–4409).

**R8 — Client no-op: proven.** Exactly one production implementation root (`ProviderBase`);
GraphQLDataProvider = `'Network'` (graphQLDataProvider.ts:1414–1416),
SQLServerDataProvider/PostgreSQLDataProvider = `'Database'` (:800–802 / :229–231). baseEngine
has exactly ONE ProviderType branch today — the :528 guard; gating the substitution on the
same predicate inherits its test history. Server-side processes on GraphQLDataProvider
(agents-client, entity-comm-client, integration client bundles) correctly stay 'Network':
one token = one identity, fidelity lives at the remote MJAPI. Test stubs with missing/invalid
ProviderType fail the `=== Database` comparison safely — keep the loose comparison, no
exhaustive switch.

**R9 — FLS interaction.** With system-user loads, engines' denied-read set is always empty →
`flsCacheExemptEntityObjectRequest` (providerBase.ts:2320-area, uncommitted) stops firing for
engines; **keep it** for non-engine restricted `entity_object` requests. The
"warn-don't-support" posture (guide §3.4 :169–172; field-level-security.md R5 :572–574; D-4
bullet :270–273; both config-guard comments) becomes wrong for engines on Database providers
and must be updated (§6). The two system-user config guards are load-inert (save-time only)
and stay. Note the FLS-trimmed single-record `Load()` path (buildFieldSecuritySelectList,
GenericDatabaseProvider.ts:1822–1834, applied :3964–3967) is a *new* partial-hydration vector
for engines doing per-record loads under a restricted user — system-user loads close it.

**R10 — Failure modes.** Both baselines seed the system user; every discovered bootstrap warms
UserCache before any engine load; MJAPI's HTTP server starts long after
(index.ts:885 vs :492). When no system user resolves: fall back to the passed contextUser
(= exactly current behavior) and warn once per engine class via the existing `WarningManager`
(MJGlobal warningManager.ts:1–19, already consumed by MJCore). **Never** adopt the
`backupSysUser` any-active-Owner fallback inside BaseEngine — an Owner is not FLS-exempt; that
is the same bug, quieter. Unit-test impact: **zero** — no existing test drives real `Load()`
with a Database-typed mock (all BaseEngine tests stub Config or omit ProviderType), and the
optional-accessor pattern means mocks without it fall back to current behavior.

---

## 4. Recommended design

### D-A. Dual identity: `_loadUser` + `_contextUser` (the load-bearing decision)

Two single-field alternatives both fail:
- Substitute only at the RunView execution points → every event-driven refresh
  (:836, :876, :1080, :1287, :1484, :2064–2120) still runs as `_contextUser` → re-poisons.
- Assign the system user to `_contextUser` at :571 → the public `ContextUser` getter
  (:2180–2182) flips for every attribution consumer (Communication `run.UserID`,
  RecommendationEngine `RunByUserID`, ActionEngine logs, ScheduledJobEngine direct-SQL
  writes) → silent audit change.

So: add a private `_loadUser: UserInfo | null` and a protected accessor
`LoadUserToUse` (≡ `this._loadUser ?? this._contextUser`). Route **every** internal load,
refresh, and hydration path through it: `LoadConfigs`/`CheckPermissionsOrSkipAll`,
`LoadSingleEntityConfig` :1776, `LoadMultipleEntityConfigs` :1893, dataset loads :1929/:1932,
remote-invalidate paths :824/:836/:846/:876/:903, retries :1080/:1105, debounced refresh
:1287–1289, `cloneEntityForCache` :1484, expiration/refresh surface :2064–2120,
`AdditionalLoading(...)` call sites. `_contextUser` keeps exactly today's meaning ("the
Config caller") behind the public getter. Subclass write paths change **zero** lines.

Consequence to state plainly: hydrated cache entities carry the load user as
`ContextCurrentUser`, so an engine that mutates-and-saves a cache-resident entity
(UserInfoEngine.SetSetting :357/:371, conversations moveFolder :606/:620) authors
RecordChange as the system user. This is byte-identical to shipped full-mode behavior; it is
a delta only in the §2 windows. (Alternative if Jordan wants caller-authored saves: hydrate
via `LoadUserToUse` but `Config` the entity objects with `_contextUser` — one-line change in
the two hydration paths; costs divergence from full-mode behavior.)

### D-B. Resolution: optional `ResolveSystemUser()` on `IMetadataProvider`

```ts
// interfaces.ts — optional member
ResolveSystemUser?(): Promise<UserInfo | null>;
```
Implemented **once** in `GenericDatabaseProvider` via `this.ExecuteSQL` against
`vwUsers`/`vwUserRoles` `WHERE ID = SystemUserID`, memoized per provider instance, returning a
**dedicated UserInfo with UserRoles populated** (CanRead checks are role-driven), never the
shared UserCache object (securityInfo.ts:295–308 documents why). Returns `null` — never
throws — when the row is absent. SQLServerDataProvider MAY short-circuit through UserCache as
an optimization but must guard the cold-cache TypeError. Network providers simply don't
implement it. Why not a registered callback: process-global, wrong for multi-connection
processes (engine instances are per connection string, :627), needs test-reset plumbing. Why
not scanning a provider user list: none exists. Bonus: MJServer's PG bootstrap can later
retire its private-field poke (index.ts:1754) and all three existing resolution sites can
unify on the accessor.

### D-C. Substitution point and guard order

At the top of `Load()` (before the :528 throw):

```ts
if (this.ProviderToUse?.ProviderType === ProviderType.Database) {
    const sys = await this.ProviderToUse.ResolveSystemUser?.() ?? null;
    if (sys) this._loadUser = sys;
    else if (contextUser) /* warn once per engine class via WarningManager */;
}
if (this.ProviderToUse?.ProviderType === ProviderType.Database && !contextUser)
    throw ... // UNCHANGED — contextUser is still required server-side
```

- The :528 throw stays: substitution does **not** make user-less server `Config(true)` legal.
  "No user on the server" remains loud. The two broken no-user sites (QueryResolver.ts:177,
  AIAgentPermissionHelper.ClearCache) get explicit fixes to pass a user.
- Fallback is the passed contextUser = exactly current behavior; warn once per engine class
  (operators should know fidelity protection is inactive; `WarningManager` precedent).
- `Config(forceRefresh, someUser)` server-side now means "reload rows now, as the system
  user" — which is what all 29 safe sites actually want; `_contextUser` still rotates to the
  new caller for attribution semantics, matching today.

### D-D. The failure classifier must use the effective user

`ContextUserCanReadConfigEntity` (:1849–1866) is consulted after a FAILED load to decide
permanent-vs-transient. Post-substitution it must evaluate the **effective load user** — if it
keeps evaluating the original restricted caller, a genuinely transient failure (network,
restart) gets misclassified as permanent and sealed empty, recreating the poisoning. Same for
`CheckPermissionsOrSkipAll` (:1657): it must gate on `LoadUserToUse`.

### D-E. Datasets: thread the load user through (recommended, separable)

Pass `LoadUserToUse` to `GetAndCacheDatasetByName` (add the parameter; :1932 currently drops
identity entirely). Security-neutral (datasets are user-invariant across identities) but it
closes the raw-vs-processed byte split — non-bypass loads gain `PostProcessRows` (datetime 'Z'
adjustment + decryption), matching the bypass path. **This is a behavior change to flag in the
changeset** (datetime strings gain the platform adjustment; encrypted columns arrive
decrypted in engine dataset properties). If deferred, nothing breaks — it stays inconsistent
as today.

### D-F. System-user permission guarantees — Jordan's decision (amends the security model)

The substitution's correctness rests on the system user actually passing three layers.
Today only one is code-guaranteed:

| Layer | Today | Failure if role data drifts |
|---|---|---|
| FLS | **code-guaranteed** — `IsSystemUser` short-circuit (entityInfo.ts:1086) | — |
| Entity CanRead | role-data-emergent (`GetUserPermisions`, entityInfo.ts:2608–2644, no shortcut) | ONE Deny row on a role the system user holds ⇒ `CheckPermissionsOrSkipAll` seals the ENTIRE engine empty for the whole process — including privileged callers (all-or-nothing, :1678–1700). The docblock at :1652–1653 *asserts* the system user has all permissions; nothing guarantees it. |
| RLS | role-data-emergent (filter-less Developer/Integration rows) | scoped engine caches quietly return |

Options:
1. **Code-guarantee all three** — add `IsSystemUser` short-circuits to `GetUserPermisions`
   and `UserExemptFromRowLevelSecurity`, mirroring the FLS decision. The FLS rationale
   ("denying the system user protects nothing and breaks the server; the DB login reads
   everything anyway") applies verbatim. **Recommended** — one consistent posture, and the
   config guards already stop admins from entangling the system user.
2. Narrow: bypass only the engine pre-flight (`CheckPermissionsOrSkipAll`) when the effective
   load user `IsSystemUser`. Smallest diff; leaves RLS emergent.
3. Document the role-data dependency only. Cheapest; highest silent-failure risk.

### D-G. Registry hardening (independent bug, fix alongside)

`FindCachedEntity`/`TryGetCachedRecords` (baseEngineRegistry.ts:651–717) return live property
arrays with **no check of `permissionDenied` or `loadedSuccessfully`** — a sealed-empty `[]`
is truthy and propagates (live consumer: `AIEngine.RefreshActions` prefers
`TryGetCachedRecords('MJ: Actions')`; also sync-metadata-engine.ts:313). Skip sealed/failed
entries in the lookup. (The registry's class-name-only keying is a separate multi-connection
defect — log to MJ-UPSTREAM, not this PR.)

### D-H. Disposition of the permission-constrained API

On Database providers with a resolvable system user, `CheckPermissionsOrSkipAll`,
`PermissionConstrainedError`, `IsPermissionConstrained` become dead paths for engine loads.
They MUST survive: (a) Network — client consumers exist (application-manager,
workspace-state-manager, home-dashboard, form-resolver); (b) the no-system-user fallback
path. Document this in the class docs; no API removal.

---

## 5. Code changes (implementation order) with per-change risk

1. **MJCore `interfaces.ts`** — optional `ResolveSystemUser?(): Promise<UserInfo|null>`.
   Risk: none (optional member; mocks unaffected).
2. **GenericDatabaseProvider** — implement + memoize (ExecuteSQL against vwUsers/vwUserRoles,
   roles populated, dedicated instance). Risk: SQL must handle the row being absent → null.
   PG parity is free (PostgreSQLDataProvider inherits).
3. **SQLServerDataProvider** *(optional)* — UserCache short-circuit with cold-cache guard.
   Risk: the TypeError trap (UserCache.ts:30/:71) if the guard is skipped.
4. **baseEngine.ts** — `_loadUser` + `LoadUserToUse`; substitution block ahead of the :528
   guard (throw unchanged); route ALL load/refresh/hydration paths through `LoadUserToUse`
   (§D-A list); classifier + pre-flight on the effective user (D-D); warn-once fallback;
   thread user into dataset non-bypass path (D-E, separable). Risk: missing one refresh path
   re-poisons — the test below must cover the event-refresh path explicitly.
5. **entityInfo.ts** *(pending D-F choice)* — `IsSystemUser` short-circuits in
   `GetUserPermisions` and/or `UserExemptFromRowLevelSecurity`. Risk: security-model change;
   needs Jordan's explicit sign-off + guide wording.
6. **baseEngineRegistry.ts** — skip `permissionDenied`/`loadedSuccessfully:false` entries
   (D-G). Risk: consumers relying on sealed-empty arrays (none found; AIEngine falls back to
   loading its own copy).
7. **Resolver fixes** — QueryResolver.ts:177 and AIAgentPermissionHelper ClearCache pass a
   real user. Risk: none; both are broken today (throw / silently-never-refresh).
8. **Docs** — guide §3.4 (engines out of "configuration to avoid"), implementation-plan D-4
   bullet, `flsCacheExemptEntityObjectRequest` docblock "accepted cost" sentence, both config
   guard comments (task-mode threat becomes historical rationale), annotate (not rewrite) the
   R5 as-built paragraph.
9. **Tests** — new unit tests: substitution engages on Database + resolvable system user;
   fallback to caller + warn when unresolvable; event-refresh path uses the load user
   (anti-re-poison canary); classifier uses effective user; Network untouched. Existing
   suites: zero expected changes (R10c). Integration tier: run whole deterministic suite;
   audit server-transport checks that assert engine state as a restricted user (q8 flagged
   these as the likely canaries).

**Not in scope, logged for later:** the permission-blind dataset transport
(`GetDatasetByName` + DatasetResolver, a live FLS/RLS bypass documented at
field-level-security.md:664 — belongs in the FLS guide's admin warnings); registry
class-name keying across connections; `StartActionLog` ignoring `params.ContextUser`
(ActionEngine-Base.ts:259); `AIEngine.ExecuteEntityAIAction` user-less GetEntityObject
(:1406); `backupSysUser` retirement in the bootstraps; UserInfoEngine `_loadedForUserId`
reload churn on the server (:169–171).

## 6. Open decisions for Jordan

1. **D-F scope** — code-guarantee system-user CanRead + RLS (recommended), pre-flight-only,
   or document-only?
2. **Save authorship for cache-resident entities** — accept system-user authorship (matches
   full mode today; recommended) or re-stamp hydrated entities with `_contextUser`?
3. **Dataset user-threading (D-E)** — in this PR (recommended; flag byte changes) or defer?
4. **Registry hardening (D-G)** — in this PR (recommended; independent bug) or separate?
5. **Docs (item 8)** — this PR ships stale "warn-don't-support" wording otherwise;
   recommend same PR.

---

## As built — CORRECTED (2026-08-08)

An earlier revision of this section claimed the design had shipped. **It had not.** The
implementation described there was written, verified green (MJCore 1800, all downstream suites
at baseline, integration tier 55/55), and then **reverted** by Jordan before commit.

Why it was reverted, and it is the right call:

1. It added `ResolveSystemUser?()` to `IMetadataProvider` — putting identity policy on an
   interface whose job is metadata and data access, and obliging every provider
   implementation (including out-of-repo ones) to carry it.
2. It implemented the lookup as a fresh `vwUsers`/`vwUserRoles` query inside
   `DatabaseProviderBase`, memoized per provider instance. That is a **second source of truth**
   for the system user alongside `UserCache`, and the two can drift: role sync refreshes
   `UserCache` (`SyncRolesUsersResolver.ts:115`), the private memo would not.

The replacement mechanism — a concrete well-known-user source base in MJCore, registered
through the MJGlobal ClassFactory and implemented once in GenericDatabaseProvider so both
dialects inherit it — fixes both: the provider interface is untouched, and the lookup is a
single named seam rather than a private memo that drifts. Full plan:
[`baseengine-system-user-loading.md`](baseengine-system-user-loading.md).

**What survived the revert unchanged** (only the resolution seam was wrong): the dual
`_loadUser`/`_contextUser` split, routing all fourteen load/refresh/hydration paths, evaluating
the permission gates against the effective load user, warn-once degradation to current
behavior, the `ProviderType` gate, and the client no-op.

**Two facts learned while implementing, worth keeping:**

1. `BaseSingleton`'s constructor **returns the already-registered instance** for the class
   name, so engine tests must clear `___SINGLETON__<ClassName>` from `GetGlobalObjectStore()`
   to get an unloaded engine.
2. The server-side "must provide contextUser" guard (baseEngine.ts:528) reads the engine's
   **already-bound** provider because it runs ahead of `SetProvider`, so it does not fire on a
   first-ever load whose provider arrives only as an argument. Pre-existing; left alone.
