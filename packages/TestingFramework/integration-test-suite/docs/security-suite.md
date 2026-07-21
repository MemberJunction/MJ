# Security & Permissions Integration Suite

The security/permissions family of the integration tier: **6 bundles, 34 checks** proving MJ's four permission surfaces against the live database and the real GraphQL wire — Row-Level Security and its cache-fingerprint isolation (`rls-isolation`, 9 checks, plus the client-transport `rls-isolation-client`, 1 check), the unified `PermissionEngine` provider fan-out (`permission-engine`, 14), API-key scope enforcement through the `ScopeEvaluator` two-level model (`scope-enforcement`, 5), GraphQL subscription channel isolation (`subscription-isolation`, 2), and the `APIKeyEngine` seed/authorize contract (`api-keys`, 3). All six are members of the **"Integration Tests — Deterministic"** suite and run with the rest of the tier via `npm run test:integration` from the repo root (which expands to `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`); a single bundle runs via its metadata record, e.g. `MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT28 - Permission Engine and Scope Enforcement"` (always the local workspace `mj`, never a global install). Three checks (PE11–PE13) additionally require `RUN_MUTATION_TESTS=1`. This family is the shipped realization of **test-catalog Domain 3** (see [test-catalog.md](./test-catalog.md), its design ancestor) and cross-references the [bug register](../../../../plans/integration-test-expansion/bug-register.md) throughout — several checks exist specifically to pin, warn about, or loudly document register entries.

Ground truth for every claim below is the check source under `packages/TestingFramework/integration-test-suite/src/checks/`:

| Bundle | Source file | Checks | IT record | Transport | Tier |
|---|---|---|---|---|---|
| `rls-isolation` | `src/checks/rls-isolation.checks.ts` | 9 (RLS1–RLS6, RLS8–RLS10) | IT06 | server (in-process SQL provider) | deterministic |
| `rls-isolation-client` | `src/checks/rls-isolation.checks.ts` (same file, second export) | 1 (RLS7) | IT23 | client (GraphQL, needs MJAPI) | deterministic |
| `permission-engine` | `src/checks/permission-engine.checks.ts` | 14 (PE1–PE3, PE3b, PE4–PE13) | IT28 | client (GraphQL, needs MJAPI) | deterministic; PE11–PE13 mutation |
| `scope-enforcement` | `src/checks/scope-enforcement.checks.ts` | 5 (SE1–SE5) | IT36 | server | deterministic (self-cleaning writes) |
| `subscription-isolation` | `src/checks/subscription-isolation.checks.ts` | 2 (SI1–SI2) | IT37 | client (GraphQL, needs MJAPI) | deterministic |
| `api-keys` | `src/checks/api-keys.checks.ts` | 3 (AK1–AK3) | IT13 | server | deterministic (self-cleaning writes) |

---

## Shared fixtures — the seeded principals

Most non-vacuous security assertions need **more than one identity**. The harness's context user is typically a high-privilege Owner, so any "is this allowed?" question trivially answers `true` and proves nothing. Two mechanisms provide low-privilege counterparts:

1. **Discovery** (`discoverRlsFixture` in `@memberjunction/testing-integration`, `src/rls-fixture.ts`): reads the provider's RLS filters and the live user list, surfacing a two-user divergent-clause pair, a `{{UserID}}`-scoped `TokenFilter`, and a single non-exempt `LivePair` — each guarding its own checks so partial availability degrades to skip-as-pass. Nothing is created; teardown is a no-op. On a database whose only users are RLS-exempt admins, every discovery piece is absent and the discovery checks skip loudly.
2. **Seeded principals** in `metadata-optional/integration-test/` (pushed with `npx mj sync push --dir=metadata-optional/integration-test`, the command every skip warning prints — exported as `SEED_FIXTURES_COMMAND`, `rls-fixture.ts:30`):
   - `users/.integration-test-users.json` — three version-controlled users with fixed UUID primary keys:
     - **`it-rls-a@integration.test`** and **`it-rls-b@integration.test`**, each holding ONLY the role `Integration Test: RLS Scoped Reader` (seeded in `roles/`), which grants Read on `MJ: AI Agent Runs` scoped by the `UI: Own AI Agent Runs` RLS filter (`UserID = '{{UserID}}'`) via the entity-permission row in `entity-permissions/.integration-test-permissions.json` — and grants nothing else. A user whose only role is this one is **genuinely RLS-scoped (non-exempt)**, unlike internal users who also hold Developer/Integration roles and are exempt.
     - **`it-nogrant@integration.test`** — zero roles at all. The deterministic "no grant of any kind" identity for negative cases (RLS10, PE9, PE10) and the preferred non-owner identity for the dual-path checks (PE6–PE8), replacing the old incidental reliance on `anonymous@magic-link.local`.
   - The seeded entity is pinned as `SEEDED_RLS_ENTITY = 'MJ: AI Agent Runs'` (`rls-fixture.ts:28`).

**Why the two-identity constraint matters for transports:** the server bundles resolve seeded users from `UserCache.Instance.Users` and can execute a `RunView` *as* any of them in-process. The client transport authenticates as **one wire identity** (the system API key), so a client check can pass a different `contextUser` but the server still answers as the authenticated principal — this is why per-user isolation invariants live in the server bundles (RLS4/RLS5/RLS8–RLS10) while the client bundles pin the *mechanisms* those invariants rest on (RLS7) or reconstruct the seeded principal as a `UserInfo` for provider-agnostic evaluation (`loadSeededNoGrantUser`, `permission-engine.checks.ts:172-204`, which rebuilds the user + roles from `MJ: Users` / `MJ: User Roles` over the wire because a browser-faithful client has no `UserCache`).

---

## 1. `rls-isolation` (9 checks) and `rls-isolation-client` (1 check)

### Machinery under test

The #1 security deliverable of the integration tier: **one user's RLS-filtered cache entry must NEVER serve a different user.** The product mechanism (already shipped, these checks are its executable proof):

- `EntityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '')` computes a per-user WHERE clause from the user's roles' RLS filters, substituting `{{UserID}}` tokens via `RowLevelSecurityFilterInfo.MarkupFilterText(user)`.
- `ProviderBase` threads that clause as the **third argument** of `LocalCacheManager.GenerateRunViewFingerprint`, which appends an `rls:<hash>` segment ONLY when the clause is non-empty. Two users with different effective clauses therefore hash to different fingerprints and never collide on a cache slot. The invariant is stated verbatim in the product comment at `providerBase.ts:~1888`: *"without including the RLS clause in the cache key, a scoped user could be served a cached unscoped result set (a data leak)."*

The bundle is the merged superset of two implementations that briefly coexisted after a `next` merge (the package fingerprint/cache-slot bundle plus `next`'s inline `rls-isolation-tests.ts`).

### Transport and why the client bundle is separate

`rls-isolation` (RLS1–RLS6, RLS8–RLS10) runs on the **server transport**: it needs `UserCache`, the instrumented `LocalCacheManager` storage counters (`ctx.Storage.SetCount('RunViewCache')`), and the ability to run `RunView` *as* arbitrary discovered/seeded users in-process. `rls-isolation-client` (RLS7) is a **separate bundle in the same source file** because it exercises the *client* smart-cache path (`GraphQLDataProvider`, `TrustLocalCacheCompletely = false`, opt-in `CacheLocal: true`) and therefore needs a **running MJAPI** — it is dispatched by IT23 with `transport: "client"` and is parked (seeded Skip / skips cleanly) when MJAPI is unreachable, exactly like the `client-cache` bundle's IT03. Splitting the bundles keeps IT06 runnable on a DB-only rig while IT23 waits for the API to be provisioned.

RLS7 itself carries an instructive constraint, documented in its body (`rls-isolation.checks.ts:357-366`): a GraphQL client authenticates as ONE wire identity, so two `contextUser`-varying calls may legitimately share a slot (they receive identical rows by construction) — a browser never hosts two principals in one process. RLS7 therefore does NOT attempt an end-to-end two-user serve assertion; it pins the client-side **mechanism** (divergent clauses produce divergent client fingerprints — the exact line that would flip red if someone dropped the `rls:` segment) and leaves per-user serving isolation to the server checks. Its original assertion was double-defective (a `GetCount`-counts-attempts oracle plus a fire-and-forget write race), found and rewritten on the check's first-ever execution — the fingerprint identity is now the oracle.

### Fixtures, lifecycle, tier

Discovery-only plus the seeded principals (see above). No lifecycle Setup/Teardown is registered for either bundle — nothing is created (RLS4/RLS7 warm cache slots via a column-agnostic, always-true `coldFilter(tag)` predicate rather than writing rows). All ten checks are **deterministic tier**; RLS4/RLS5/RLS9/RLS10 perform live reads but zero mutations.

### Per-check table

| Id | Name (abbreviated) | Asserted observable | Failure it catches |
|---|---|---|---|
| `rls-isolation.RLS1` | `{{UserID}}` token substitution | `MarkupFilterText(ctx.User)` embeds the user's own ID; no unsubstituted `{{UserID}}` remains | Broken predicate markup — every scoped query would carry a broken WHERE clause |
| `rls-isolation.RLS2` | Two users get different predicate TEXT | `MarkupFilterText(A) !== MarkupFilterText(B)`; each embeds its own user's ID | SQL-level segregation failure — A's cache slot could serve B |
| `rls-isolation.RLS3` | Fingerprint divergence (core cache proof) | `GenerateRunViewFingerprint(params, conn, clauseA) !== (..., clauseB)` for the same params | The `rls:<hash>` segment dropped/broken — cross-user cache collision |
| `rls-isolation.RLS4` | Server superset slot no cross-serve | Warm as A (RunViewCache write count > 0), read same params as B: another cold write (> 0), NOT a hit; plus no A-scoped rows in B's result when a `UserID` column exists | User B served from User A's cached slot (the literal leak) |
| `rls-isolation.RLS5` | Live RunView scoping (end-to-end) | Cache-bypassing `RunView` as a discovered non-exempt user returns zero rows with a foreign `UserID` | Predicate correct on paper but not enforced in the live query |
| `rls-isolation.RLS6` | Empty clause shares / non-empty diverges (always-runnable) | Empty effective clause: fingerprint identical to the no-arg fingerprint; non-empty: different. Exactly one branch runs per deployment, but the check always asserts | Either cache fragmentation for exempt users (correctness half) or missing isolation (the RLS3 half) — fills the gap when RLS3/RLS4 skip on admin-only DBs |
| `rls-isolation.RLS8` | SEEDED scoped divergence (deterministic RLS3) | `it-rls-a`/`it-rls-b` get distinct NON-EMPTY clauses on `MJ: AI Agent Runs`, each embedding its own ID (case-folded UUID compare per the UUID guide), and distinct fingerprints | RLS3's guarantee, pinned to a version-controlled two-user scenario instead of discovery luck |
| `rls-isolation.RLS9` | SEEDED live no-leak | Cache-bypassing `RunView` as `it-rls-a` returns ONLY rows with A's `UserID` (0 rows is a valid pass) | Live row leakage to a known scoped principal |
| `rls-isolation.RLS10` | SEEDED no-grant denied | `RunView` as `it-nogrant` (zero roles, no read grant) yields ZERO rows — fail-closed or empty, either way nothing reaches them | Serving any of the set to an unauthorized caller — the deterministic negative case |
| `rls-isolation-client.RLS7` | Client smart-cache no cross-serve | A's `CacheLocal: true` view writes a client slot; A/B clauses produce DIFFERENT client fingerprints (the mechanism); B's request also succeeds | Someone dropping the RLS clause from the *client* fingerprint path — B would revalidate against A's slot |

Every discovery-gated check (RLS1–RLS5) and every seed-gated check (RLS8–RLS10) **skips-as-pass with a loud console warning** naming exactly what was missing and, for the seeded checks, printing the seed command. RLS6 is the deliberate always-asserts backstop.

### Known gaps / cross-references

- **V14/V15 in the `view-execution` bundle are omitted, not stubbed** (bug-register "Coverage caveats" table): RLS AND-combination and per-user view isolation are two-identity invariants a single-identity `GraphQLDataProvider` could never fail, so those invariants are deliberately routed HERE — to RLS8–RLS10 with the seeded two-user scenario — rather than faked on the client transport.
- The intersection check the catalog calls SEC5 (RLS + cache cross-user leak) is realized by RLS4 (server superset slot) rather than as a separate check.

---

## 2. `permission-engine` (14 checks)

### Machinery under test

The **unified permissions model** of `guides/UNIFIED_PERMISSIONS_GUIDE.md`, all three concerns:

- **`PermissionEngine`** (`@memberjunction/core-entities`): `Config()` loads the `MJ: Permission Domains` catalog and ClassFactory-instantiates one `PermissionProviderBase` subclass per ACTIVE row — adding a domain is data + a class, never an engine edit. `GetAllUserPermissions` fans out across every provider with `Promise.allSettled`.
- **The two-access-path contract** for AI Agents and AI Skills: the cached runtime helpers (`AIAgentPermissionHelper` / `AISkillPermissionHelper` in `@memberjunction/ai-engine-base`) are **OPEN by default** (zero grant rows: any user may View+Run; only the owner may Edit/Delete), while the unified providers over the SAME tables are **CLOSED by default** (explicit grants only). The divergence is by design and is what these checks pin — so nobody "fixes" one path into agreement with the other.
- **Entity Permissions / RLS** (`EntityInfo.GetUserPermisions`) and **Authorizations** (`AuthorizationEvaluator.UserCanExecuteWithAncestors`) — the two other concerns of the three-concerns model, each proven with a real second identity.

The bundle header states the design rule that shapes every check: permission tests are the easiest place to write a check that CANNOT FAIL (a high-privilege context user trivially satisfies any allow). Every check is therefore a **DENY**, a **DIFFERENCE** (between two identities or two access paths), or a **SHAPE** assertion about the model itself.

### Transport

**Client-first, deliberately** — every check runs over the real GraphQL wire via `bootstrapIntegrationClient` (IT28: `transport: "client"`). The `PermissionEngine`, the providers, the AI helpers, and `GetUserPermisions` are provider-agnostic and are exactly what a browser executes; nothing here needs a server-only surface. The seeded no-grant principal is reconstructed client-side from the `Users` + `User Roles` entities (memoized per process) because the client has no `UserCache`.

### Fixtures, lifecycle, tier

- PE1–PE10 are **deterministic tier, fully read-only** (PE8's "grant rows" are UNSAVED synthetic `MJ: AI Skill Permissions` entities fed to the exported pure `ComputeEffectivePermissions` core — zero mutation).
- PE11–PE13 carry `RequiresMutation: true`. The bundle lifecycle's `Setup` honors the gate itself: without `RUN_MUTATION_TESTS=1` it creates **nothing** (PE11–PE13 skip-as-pass). With the gate on, Setup only registers the `ThrowingPermissionProvider` fixture class on the ClassFactory; **each mutation check creates and deletes its OWN throwaway `MJ: Permission Domains` row** inside its own try/finally (`withDomainRow`), so no two checks ever share a mutated catalog and PE13's defective stub can never poison PE12's fan-out. Rows are tagged `(mj-integration-test — safe to delete)` and prefixed `Integration Test Domain — ` so the shape checks (PE1–PE3b) exclude them by construction. Teardown sweeps stragglers and re-`Config()`s the engine so later bundles in the process see the real catalog.
- PE6–PE10 depend on discoverable shapes (a zero-grant non-owned agent/skill, the seeded no-grant user, a non-empty Authorization catalog) and skip-as-pass with a loud note when a piece is absent.

### Per-check table

| Id | Name (abbreviated) | Asserted observable | Failure it catches |
|---|---|---|---|
| `permission-engine.PE1` | Domain fan-out | Every ACTIVE (real) catalog row resolves a provider via `engine.GetProvider(name)`, and each provider's `DomainName` equals the row's `Name` | The classic silent failure: a domain row ships but its provider class was tree-shaken or its `@RegisterClass` key drifted — the domain vanishes from the Sharing Center with no error |
| `permission-engine.PE2` | Vocabulary conformance | Every provider's `SupportedActions` / `SupportedGranteeTypes` are members of the canonical `PermissionAction` / `GranteeType` unions; non-empty `Description`; boolean `SupportsDeny` | A typo'd action in a new provider producing an un-renderable row in a sharing UI |
| `permission-engine.PE3` | Catalog-class agreement (drift detector) | Set-equality both directions between the catalog row's declared actions/grantees and the provider class's readonly metadata | The admin UI (reads the row) offering a grant the runtime (reads the class) will never honor |
| `permission-engine.PE3b` | SupportsDeny agreement, asserted ASYMMETRICALLY | Row-says-Deny/class-says-no → **hard failure** (an operator's Deny would be silently ignored — a real revocation hole); class-says-Deny/row-says-no → **warning only** (fail-safe under-advertising) | Over-advertised Deny (security); under-advertised Deny (metadata drift, warned). **Known finding = B36**: `EntityPermissionProvider.SupportsDeny = true` but every catalog row declares `false` — Deny rows ARE enforced at runtime, no admin surface offers to create them. PE3b **warns, does not fail** on this, by design (fail-safe direction); register disposition FIX-NOW (metadata alignment) |
| `permission-engine.PE4` | Unknown domain fails CLOSED | `CheckPermission` on a nonexistent domain: `Allowed=false` for all 7 actions, result echoes the domain name, `Reason` names it; `GetResourcePermissions` returns `[]` | "No provider" silently treated as "no restriction" — the model failing OPEN |
| `permission-engine.PE5` | Real agent provider denies | The `AI Agent Permissions` provider refuses a domain-wide (`resourceId = null`) check and denies Read/Execute/Update/Delete on a stranger GUID; `GetEffectivePermissions` returns `[]` | The closed-by-default half breaking at the provider itself, not just through the aggregator |
| `permission-engine.PE6` | Agent dual-path DIFFERENCE | On a zero-grant, non-owned agent evaluated as the seeded no-grant user: helper reports View+Run true / Edit+Delete false; unified provider reports `[]` and Execute denied; then `helper.canRun !== provider.Allowed` — **the divergence itself is the assertion** | Either path "fixed" into agreement with the other — the documented open/closed asymmetry collapsing silently on one resource type |
| `permission-engine.PE7` | Skill dual-path DIFFERENCE | Identical contract over `MJ: AI Skill Permissions` (`AISkillPermissionHelper` vs `AISkillPermissionProvider`) | A change to the shared pattern landing on skills but not agents (or vice versa) |
| `permission-engine.PE8` | Grants close the open default + hierarchy | Via the pure `ComputeEffectivePermissions` with unsaved rows: empty list → open; ANY non-matching grant row → this user gets NOTHING; Delete-only grant → implies Edit, Run, View (downward collapse); Run-only grant → does NOT climb to Edit/Delete | "Open by default" leaking past the first grant row (the easiest regression to hide), or the hierarchy escalating upward (privilege escalation) |
| `permission-engine.PE9` | Entity Permissions DIFFERENCE, two real identities | `it-nogrant` (verified zero roles) has `CanRead/Create/Update/Delete = false` on `MJ: AI Agent Runs` while the context user `CanRead = true` — the difference, not the allow, is asserted | Set-level CRUD gating granting anything to a role-less principal |
| `permission-engine.PE10` | Authorizations fail closed | `AuthorizationEvaluator.UserCanExecuteWithAncestors` over every `MJ: Authorizations` row as `it-nogrant`: zero executable | The capability evaluator failing open on an empty role list — every feature gate in the product opening at once |
| `permission-engine.PE11` | [mutation] Unresolvable provider is CONTAINED | With a catalog row naming a never-registered class: `Config()` survives, the row loads, every REAL domain still resolves, and the bogus domain allows nothing (a throw counts as denial). Also warns when ClassFactory returns an instance for the unknown key — characterizing that `instantiateProviders()`'s "else skip" branch is dead code (see B35) | One bad catalog row cascading into other domains, or granting access |
| `permission-engine.PE12` | [mutation] Async-throwing provider fault-isolated | A registered fixture provider whose every method throws: it resolves, provably throws, contributes zero rows, and `GetAllUserPermissions` still returns rows from healthy domains (`Promise.allSettled` isolation) | One broken domain black-holing the Sharing Center / audit surface for every user |
| `permission-engine.PE13` | [mutation] Unresolvable provider must not POISON the fan-out | With an unresolvable-class row present, `GetAllUserPermissions` must NOT reject; row count returned | **B34** — the defect this bundle found: ClassFactory returns an abstract-base stub (not null), and the stub's `undefined` method throws SYNCHRONOUSLY inside `.map()` before `allSettled` sees a promise, so one bad row rejected the entire aggregate for all users. **Was authored expected-RED; the fix landed in #3197** (explicit ClassFactory resolution-failure reporting + deferred provider calls so sync throws become isolatable rejections) and PE13 was **verified green 2026-07-19**; it stays as the regression pin |

### Bug-register cross-references

- **B34** (High, `PermissionEngine.instantiateProviders` / `GetAllUserPermissions`) — found by this bundle, pinned by PE13. Per the check source (`permission-engine.checks.ts:972-975`) it is **fixed in #3197 and PE13 is green**; note the register row still reads "FIX-NOW / PE13 (RED, mutation tier)" — the register lags the code (see Inconsistencies, below). The IT28 record's Description also still describes PE13 as "KNOWN-RED by design".
- **B35** (Med, systemic) — the root pattern: `ClassFactory.CreateInstance` never returns null for an unknown key; any `if (instance)` guard is silently broken. PE11's warning branch characterizes one instance; the register calls for a repo-wide sweep (DECIDE). Related: B47 added `@OptionalKeyedSpecialization()` to keep the new resolution-failure instrumentation from false-positiving on designed keyed-fallback bases.
- **B36** (Low) — the PE3b warn-not-fail finding described above.
- **B61** (Low, open) — `AIAgentPermissionHelper` lacks the exported pure core its skill sibling has (which is why PE8's synthetic-row technique works only on the skill side; the agent side is covered live in PE6).

---

## 3. `scope-enforcement` (5 checks)

### Machinery under test

**API-key scope enforcement** — test-catalog Domain 3's SEC3/SEC4/SEC10 plus the `ScopeEvaluator` **two-level model** in `@memberjunction/api-keys`: level 1, the **application scope ceiling** (`MJ: API Application Scopes` — a hard cap on everything any key can do against that application, `ScopeEvaluator.ts:89`), preceded by the **application binding gate** (`MJ: API Key Applications`, `ScopeEvaluator.ts:74-86`); level 2, the **key's own scope rules** (`MJ: API Key Scopes`, Allow/Deny + `Priority` + resource patterns, sorted `Priority DESC, IsDeny DESC` at `ScopeEvaluator.ts:183-188`) with `defaultBehaviorNoScopes` deciding keys that have no rule for the requested scope (`ScopeEvaluator.ts:156-169`). Why it matters: this is the entire authorization ceiling for programmatic API access — a precedence or ceiling bug here is a direct scope-escalation vector.

Like the bundle header says, an allow-only scope test proves nothing (seeded ceilings are permissive); every check pins a **DENY that must beat an ALLOW**, or a **DIFFERENCE** between two keys/evaluators — always with a positive control proving the fixture is not vacuously denying everything.

### Transport

**Server** — drives the server-only `APIKeyEngine` (needs Node `crypto`) and the real `ScopeEvaluator` against the live DB and the real `APIKeysEngineBase` cache; `engine.Config(true, ctx.User)` reloads the cache in-process after each fixture write (the same refresh `api-keys.AK3` relies on). IT36: `transport: "server"`.

### Fixtures, lifecycle, tier

Every check mints its OWN throwaway key / key-scope / application / application-scope / key-application rows (tagged `(mj-integration-test — safe to delete)`) and deletes them LIFO in its own `finally` — children (including any `MJ: API Key Usage Logs` rows `Authorize()` writes) before parents. Following the `api-keys` precedent, **self-cleaning fixtures keep the bundle in the deterministic tier** — no `RequiresMutation` gate. The lifecycle Setup pre-warms the engine cache once; Teardown is a no-op. SE1/SE3/SE4 lean on the seeded `entity:read` scope + `MJAPI` application (whose presence AK1/AK2 prove); SE2 also needs `agent:execute`; missing seeds → loud skip-as-pass.

### Per-check table

| Id | Name (abbreviated) | Asserted observable | Failure it catches |
|---|---|---|---|
| `scope-enforcement.SE1` | Deny-precedence at equal priority | Key A with Allow(`*`) + Deny(`Users`) on `entity:read` at priority 0 → `Authorize` DENIED for resource `Users`; control key B (Allow only) → ALLOWED (proving the seeded ceiling admits the scope, so the Deny is what flipped the decision). Note the Allow/Deny rows differ by `ResourcePattern` because `UQ_APIKeyScope` is (APIKeyID, ScopeID, ResourcePattern) | The `IsDeny DESC` sort regressing — Allow beating an equal-priority Deny (catalog SEC3) |
| `scope-enforcement.SE2` | App ceiling caps the key | Key grants `entity:read` + `agent:execute`; bound app's ceiling admits ONLY `entity:read` → `agent:execute` DENIED at the application level, `entity:read` ALLOWED | The ceiling becoming advisory — a key grant punching through the application cap (catalog SEC4) |
| `scope-enforcement.SE3` | App binding precedes the ceiling | Key bound only to throwaway app X: ALLOWED against X; against `MJAPI` → DENIED with a Reason matching `not authorized for this application` | A key bound to app X reaching app Y's surface at all |
| `scope-enforcement.SE4` | Unscoped-key default | Same key + cache through `new ScopeEvaluator('allow')` (ALLOWED, and a ceiling probe isolating the key-level default) vs `new ScopeEvaluator('deny')` (DENIED) — the branch provably flips the decision; then the shared `GetAPIKeyEngine()` DENIES, pinning that the production default is the SAFE `'deny'` even though a bare `ScopeEvaluator` constructor defaults to `'allow'` | The production engine silently inheriting the constructor's `'allow'` default — every unscoped key opening up |
| `scope-enforcement.SE5` | `full_access` is ordinary at the engine | A key granted ONLY `full_access`: ALLOWED for `full_access`, DENIED for `entity:read` (no rule) | The god-mode bypass migrating from its single auditable resolver seam (`ResolverBase.CheckAPIKeyScopeAuthorization`) into the engine (catalog SEC10's engine-side complement) |

### Documented omissions (stated in the bundle header, `scope-enforcement.checks.ts:46-63`)

The per-request enforcement that turns these engine decisions into HTTP 403s lives in `@memberjunction/server` — `ResolverBase.CheckAPIKeyScopeAuthorization` (the `full_access` fast-path + per-resolver `entity:create/update/delete`, `view:run` gates), `context.ts` (`x-api-key` → UserInfo, `x-mj-api-key` → `isSystemUser`), and the `@RequireSystemUser` directive (catalog SEC8). These are **NOT exercised here**, for two hard reasons: (1) a freshly minted key's scope rules are only honored over the wire after the SERVER process reloads its `APIKeysEngineBase` cache — a client cannot force that refresh, so a wire leg cannot be made deterministic without a server restart; (2) the `@memberjunction/server` barrel validates DB config at module load and throws when it is absent, so the resolver/directive code cannot be imported into a check file without crashing this package's own registry unit tests. The resolver fast-path and `@RequireSystemUser` boundary remain a **live-wire omission**.

**Cross-reference — B1 / TG5:** the TransactionGroup API-key scope bypass (`ExecuteTransactionGroup` made zero `CheckAPIKeyScopeAuthorization` calls, so a `view:run`-only key could Create/Update/Delete over the wire — catalog SEC1) is scope enforcement by nature but is covered in the **`transaction-groups` bundle**, not here: **B1 is FIXED** (2026-07-21, `TransactionResolver` now runs a per-item scope pre-pass through the exact same check the singular CRUD resolvers use) and **TG5** is its proven-to-fail regression pin (red on the pre-fix MJAPI, green after). Mentioned here for the cross-reference only.

---

## 4. `subscription-isolation` (2 checks)

### Machinery under test

**Pub/sub channel isolation** for MJ's GraphQL subscriptions (catalog SEC6/SEC7). MJ has three subscription channels with three DIFFERENT isolation postures — all filters are inline arrow functions inside `@Subscription` decorators in `@memberjunction/server`, none separately exported:

1. `RemoteOperationProgress` — filter `payload.ChannelId === args.channelId`, where `channelId` is a fresh **unguessable per-call UUID** the client mints per operation. Correctly isolated (the routing key is a per-invocation secret) and the only channel a headless client can prove non-vacuously — **SI1 does**.
2. `statusUpdates` (PUSH_STATUS_UPDATES) — filter `payload.sessionId === args.sessionId`, where the server trusts the **client-supplied** subscription variable without checking the connected identity (the WS context's own sessionId is hard-wired to `'default'`). **Security finding: a subscriber supplying another user's sessionId receives that user's payloads.**
3. `cacheInvalidation` — **no filter at all**; every connected socket receives every tenant's entity-change payloads including `RecordData` (a full `GetAll()` of the mutated row).

### Transport, fixtures, tier

**Client** (needs live MJAPI; IT37 `transport: "client"`), parked exactly like `remote-op-wire-progress` — Setup creates fixtures over the wire, so an unreachable server fails Setup and the bundle parks cleanly. Fixtures: 2 Action Categories + a 0-effect FieldRules Record Process (`ScopeFilter: '1 = 0'`), held in a module-level handle; Teardown deletes process runs/details, the Record Process, and the categories, best-effort. Deterministic tier (dry-run operations only).

### Per-check table

| Id | Name (abbreviated) | Asserted observable | Failure it catches |
|---|---|---|---|
| `subscription-isolation.SI1` | RemoteOperationProgress channels isolated over the wire | Two `RecordProcess.RunNow` (dry-run) operations fired CONCURRENTLY with different record counts (1 vs 2): (a) result routing — each caller's `Output.processed` equals its OWN count; (b) progress isolation — each collector's events carry ONLY its own discriminator (`Handle` = per-run ProcessRunID preferred, `Total` fallback; both ops' events also verify `OperationKey`). If events carry neither discriminator, leg (b) skips loudly while (a) still stands | The inline channel filter leaking (e.g. broadcast to all subscribers) — one caller receiving the other's progress; or mutation results mis-routed between concurrent callers |
| `subscription-isolation.SI2` | Documented omission: SEC6 + SEC7 | No assertion by design — a loud skip-as-pass recording precisely WHY the two findings are not headlessly reproducible: reproducing the `statusUpdates` hijack needs TWO authenticated identities on one live socket (the integration client authenticates with a single system API key), reproducing the `cacheInvalidation` cross-tenant broadcast needs two authenticated sockets on distinct tenants, and the inline server filters cannot be imported (the `@memberjunction/server` barrel throws on config-less module load) | Nothing — deliberately. It is a **marker for a genuine gap**, visible in every run, telling a future dual-identity WS harness exactly what to build. Not a filler assertion |

### Bug-register cross-references — the OPEN findings SI2 documents

- **B49 (SEC-HIGH, OPEN — needs security review): `statusUpdates` session hijack.** The filter trusts the client-supplied `sessionId`; the authenticated identity is never compared. Found while authoring this bundle; SI2 is its loud documented omission until a two-identity WS rig exists. (Note: the register contains TWO rows labeled B49 — this one and an unrelated FIXED TransactionGroup item; see Inconsistencies.)
- **B50 (SEC-HIGH, OPEN — needs security review): `cacheInvalidation` broadcasts unfiltered, WITH `RecordData`** — a cross-tenant row-content leak in any multi-tenant deployment.
- **B4 / B5** are the earlier, audit-inferred entries for the same two surfaces (`RemoteOperationProgress`/`PushStatus` client-chosen channel keys → DECIDE; `CacheInvalidationResolver` broadcast scope → DECIDE). B49/B50 are their wave-confirmed, research-verified successors; SI1 additionally demonstrates that the `RemoteOperationProgress` half of B4 is in practice mitigated by the unguessable per-call UUID, while the `statusUpdates` half is the live B49 finding.

---

## 5. `api-keys` (3 checks)

### Machinery under test

The **`APIKeyEngine`** (`@memberjunction/api-keys`) end-to-end against real seeded metadata: `Config()` loading the seeded `MJ: API Scopes` and `MJ: API Applications`, and the full mint-hash-authorize path (`CreateAPIKey` → `HashAPIKey` (SHA-256) → `Authorize`) honoring explicit per-key Allow/Deny rules. The pure `PatternMatcher`/`ScopeEvaluator` logic already has unit specs; this bundle is the live-DB complement, graduated verbatim from the retired `integration-test-scripts/api-keys-tests.ts`. It is also the **precondition prover** for `scope-enforcement`: AK1/AK2 establish that the seeds SE1–SE5 lean on actually exist.

### Transport, fixtures, tier

**Server**, deterministic (no model calls). Lifecycle Setup runs `Config(true)` once so AK1/AK2 read a loaded cache; Teardown is a no-op because AK3 self-cleans inside its own try/finally — scope rules first, then the `MJ: API Key Usage Logs` rows that `Authorize()` writes (they FK the key), then the key itself. The key is labeled `mj-integration-test-key (safe to delete)`.

### Per-check table

| Id | Name (abbreviated) | Asserted observable | Failure it catches |
|---|---|---|---|
| `api-keys.AK1` | Seeded scopes load | `engine.Scopes` contains `full_access`, `entity:read`, `entity:delete`, `agent:execute` by `FullPath` | Seed drift or a `Config()` load regression — the entire scope model silently empty |
| `api-keys.AK2` | Seeded applications load | `engine.Applications` contains `MJAPI` by name | The default application seed missing — every `Authorize(...,'MJAPI',...)` caller broken |
| `api-keys.AK3` | Real key allow/deny through `Authorize()` | A freshly minted key with an explicit ALLOW rule on `entity:read` (priority 0) and an explicit DENY rule on `entity:delete` (priority 10): after a cache reload, `entity:read` ALLOWED and `entity:delete` DENIED, via the key's SHA-256 hash | The mint→hash→cache→authorize pipeline mis-honoring explicit rules — the most basic key contract |

---

## Sibling parity and the IT records

Every bundle's sibling is a metadata `MJ: Tests` record under `metadata-optional/integration-test/tests/integration/`, joined to the **"Integration Tests — Deterministic"** suite in `test-suites/.integration-suite.json` (verified: IT06, IT13, IT23, IT28, IT36, IT37 are all suite members; none is in the Live Model suite):

| IT record | File | Bundle(s) | Transport (per record) |
|---|---|---|---|
| IT06 - RLS Multi-User Cache Isolation | `.IT06-rls-isolation.json` | `rls-isolation` | server |
| IT13 - API Keys Engine Authorize | `.IT13-api-keys.json` | `api-keys` | server |
| IT23 - RLS Client Smart-Cache Isolation | `.IT23-rls-isolation-client.json` | `rls-isolation-client` | client (seeded Skip until MJAPI is provisioned, like IT03/IT15) |
| IT28 - Permission Engine and Scope Enforcement | `.IT28-permission-engine.json` | `permission-engine` | client |
| IT36 - API Scope Enforcement | `.IT36-scope-enforcement.json` | `scope-enforcement` | server |
| IT37 - Subscription Channel Isolation | `.IT37-subscription-isolation.json` | `subscription-isolation` | client |

**On the `NO_TSX_DISPATCHER` set:** the repo CLAUDE.md describes a three-way parity rule (bundle + tsx dispatcher + IT record) with `rls-isolation-client` listed — with a reason — in a `NO_TSX_DISPATCHER` exemption set inside `sibling-parity.test.ts`. **That set no longer exists.** Per the current `src/__tests__/sibling-parity.test.ts` (its own HISTORY comment): the July-2026 restructure **removed the tsx dispatchers entirely** — `mj test` is the single entry path — so the drift-check now enforces two-way parity only (every registered bundle has an IT record; every IT record's `checks[].type` resolves to a registered bundle; every IT record is joined to a suite) plus an assertion that `mj.config.cjs` loads this package via `testing.checkModules`. The only exemption list remaining is `NON_SUITE_BUNDLES` (currently just the framework-internal `self-test`). `rls-isolation-client` therefore needs no exemption: it satisfies parity through IT23 like every other bundle. The `packages/MJServer/integration-test-scripts/` folder now holds only documentation (README + a compaction UI playbook), no dispatchers — CLAUDE.md's dispatcher instructions are stale on this point.

---

## Consolidated bug-register map for this family

| Register ID | Status (per register/source) | Where it surfaces here |
|---|---|---|
| B34 | Fixed in #3197 per the check source; register row not yet updated from FIX-NOW/RED | `permission-engine.PE13` — authored expected-RED, now green, kept as the regression pin |
| B35 | DECIDE (systemic ClassFactory null-return gap) | Characterized by `permission-engine.PE11`'s warning branch |
| B36 | FIX-NOW (metadata alignment) | `permission-engine.PE3b` — **warns, does not fail** (fail-safe direction) |
| B4 / B5 | DECIDE (audit-inferred subscription/broadcast scope) | Superseded in practice by B49/B50; SI1 shows the `RemoteOperationProgress` leg is UUID-mitigated |
| B49 (subscription entry) | **OPEN — SEC-HIGH** (`statusUpdates` session hijack) | Documented loudly by `subscription-isolation.SI2`; not headlessly reproducible |
| B50 | **OPEN — SEC-HIGH** (unfiltered `cacheInvalidation` + `RecordData`) | Documented loudly by `subscription-isolation.SI2` |
| B1 | FIXED (TransactionGroup scope bypass) | Cross-reference only — pinned by **TG5** in the `transaction-groups` bundle (scope-related, not part of this family's files) |
| V14/V15 caveat | Omission, not stub | Two-identity RLS view invariants deliberately routed to `rls-isolation` RLS8–RLS10 |

---

## Inconsistencies found while documenting (source-of-truth notes)

1. **CLAUDE.md vs `sibling-parity.test.ts`:** the `NO_TSX_DISPATCHER` set and the tsx-dispatcher leg of the parity rule no longer exist (removed in the July-2026 restructure). CLAUDE.md's "generate BOTH siblings (dispatcher + IT record)" instruction and its `rls-isolation-client` exemption claim are stale.
2. **B34 status skew:** `permission-engine.checks.ts:972-975` records the fix (#3197) and PE13 green as of 2026-07-19; the bug register's B34 row still reads FIX-NOW with "PE13 (RED, mutation tier)", and IT28's Description still calls PE13 "KNOWN-RED by design". Both lag the code.
3. **Duplicate register ID B49:** the bug register contains two distinct rows labeled B49 (the FIXED GraphQLTransactionGroup Submit-success bug and the OPEN `statusUpdates` hijack). There is also no B37 (the numbering jumps B36 → B38).
4. **Minor header drift in `permission-engine.checks.ts`:** the file's opening line says "the 'permission-engine' bundle (PE1–PE12)" while the bundle actually exports 14 checks (PE3b and PE13 included; both ARE enumerated in the same header's per-check list).
5. **Minor header drift in `rls-isolation.checks.ts`:** the top-of-file enumeration lists RLS1–RLS7 only; RLS8–RLS10 are documented on their own check comments and on the export (`rls-isolation.checks.ts:371`), but not in the opening summary list.
