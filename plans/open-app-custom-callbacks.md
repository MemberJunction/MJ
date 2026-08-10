# Open App Custom Callbacks — Design & Implementation Plan

Status: Proposal
Date: 2026-06-23
Scope: a **generic** mechanism letting any MJ Open App expose its own **custom, scope-authorized
callbacks** — GraphQL operations that the app's *external* service (an admin UI, a SaaS backend, a
worker) can call back into a consumer MJ instance to read or **modify** things, under least-privilege
authorization. Built as a **convention over existing primitives + a few small shared helpers** — no
major MJ core change. Skip is the first consumer; the feature is not Skip-specific.

> Companion docs:
> - [`open-app-spec.md`](open-app-spec.md) — the Open App packaging/install/lifecycle standard this
>   extends. See its *Security Considerations* and *Resolved Decision #8 (App permissions — "not in
>   v1")*: this plan is the first concrete step toward **app-scoped authorization for inbound calls**.
> - [`skip-callback-scoped-api-keys.md`](skip-callback-scoped-api-keys.md) — the original
>   Skip-specific scoped-callback design. The provisioner here **generalizes** that work.
> - The API-Key Scope engine reference lives in the Skip Client Open App repo
>   (`apikey-scope-feature.md`); the engine itself ships in `@memberjunction/api-keys`.

---

## 1. Summary

**The model, in one line:** an Open App ships (a) one or more **custom GraphQL resolvers** that perform
app-defined operations, each gated by (b) an **app-owned API scope**, callable by the app's external
service using (c) a **scoped API key** bound to an **app-owned service account** — minted and handed
off once by a generalized **callback-key provisioner**.

**Why this is needed.** Today an Open App's external service that wants to call back into the consumer
has only two unattractive options: the unrestricted `x-mj-api-key` system key (full power, no
granularity, no per-operation audit, unrevocable without redeploy), or the generic core resolvers
(`RunView`, `RunQuery`, `Search`, `RunAIPrompt`, `RunAIAgent`, `EmbedText`) which are read/AI-oriented
and cannot express app-specific *write* operations ("toggle this feature," "rotate this credential,"
"re-sync this metadata"). Custom callbacks give an app a **first-class, least-privilege, auditable**
inbound surface that it owns end-to-end.

**Why "convention + helpers" and not new framework machinery.** Every primitive already exists in MJ
core (see §3). The work is to (1) document the composition as a supported pattern and (2) ship a small
amount of shared code so each app doesn't re-implement the boilerplate. No manifest-schema change, no
new engine, no Open App engine changes are required for v1.

---

## 2. Worked reference: where Skip stands today

Skip is the realized first consumer and a useful concrete anchor (it is **not** the feature):

- Skip's external API already calls back into the consumer MJAPI using a **scoped key** owned by a
  **Skip Service Account**, carrying **11 scopes**, all against **generic core resolvers**.
- Skip already ships the two app-owned halves this plan generalizes: a **service-account identity
  migration** and a **callback-key provisioner** (`@askskip/server/src/skip-callback-key-provisioner.ts`).
- Skip's middleware deliberately returns **no** custom resolvers today:
  `SkipMiddleware.GetResolverPaths()` returns `[]` with the comment *"reserved for future client-side
  Skip endpoints."* **That return value is the exact seam this plan formalizes.**

A future (do-not-build-now) example that this feature would enable: a Skip Admin page that toggles
which entities Skip is allowed to see, or rotates the consumer-side Skip key — each a custom callback
behind its own `skip:admin:*` scope, executing as the Skip Service Account.

---

## 3. The mechanism — three existing primitives compose

All three are present and wired in the current MJ tree. Citations are `path:line` in this repo.

### 3a. Resolver contribution via middleware (the inbound surface)

An app's loaded server package registers a `BaseServerMiddleware` subclass (via
`@RegisterClass(BaseServerMiddleware, '<app>')`). `serve()` collects each active middleware's
`GetResolverPaths()`, globs + dynamically imports those files, and **merges them into the resolver
array passed to `buildSchemaSync`** — before the schema is built:

- Contract: `packages/MJServer/src/middleware/BaseServerMiddleware.ts:93–112` — `GetResolverPaths()`
  is documented for *"Open App resolvers, domain-specific GraphQL queries/mutations."*
- Collection: `packages/MJServer/src/index.ts:725` (`mwResolverPaths.push(...mw.GetResolverPaths())`).
- Glob + import + merge: `packages/MJServer/src/index.ts:739–761`
  (`allResolvers = [...resolvers, ...mwResolvers]`).
- Schema build with the merged set: `packages/MJServer/src/index.ts:823–830` (`buildSchemaSync({ resolvers: allResolvers })`).

**Timing is favorable**: middleware `Initialize()` runs at `index.ts:705–709`, after Metadata/UserCache
are ready and **before** the schema is built — so a middleware can do prerequisite checks and contribute
resolvers in the same boot. (Note: `BaseServerMiddleware` is for the GraphQL pipeline. For REST-style
endpoints there is a sibling `BaseServerExtension` / `ServerExtensionsCore`, PR #2037 — out of scope
here; GraphQL resolvers are the right fit because the scope gate lives on `ResolverBase`.)

### 3b. Per-operation scope authorization (the gate)

Each custom resolver calls the inherited gate; it is a **no-op for interactive JWT/OAuth users** and
only bites for API-key callers, and every decision is audit-logged:

- Gate: `packages/MJServer/src/generic/ResolverBase.ts:624–685`
  (`CheckAPIKeyScopeAuthorization(scopePath, resource, userPayload)`): returns immediately when
  `!userPayload.apiKeyHash`; checks `full_access` first; else authorizes the specific scope; throws
  `AuthorizationError` on deny.
- Two-level evaluation: `packages/APIKeys/Engine/src/ScopeEvaluator.ts:67–120` — (1) the **MJAPI
  application ceiling** (`APIApplicationScope`), then (2) the **key's own scopes** (`APIKeyScope`),
  deny-by-default.
- `userPayload` (`apiKeyId`, `apiKeyHash`) is populated by the `X-API-Key` path in
  `packages/MJServer/src/context.ts`; a worked resolver pattern is
  `packages/MJServer/src/resolvers/ActionResolver.ts:185–208` (`RunAction` →
  `CheckAPIKeyScopeAuthorization('action:execute', input.ActionID, ctx.userPayload)`).

### 3c. Scopes are plain DB rows (app-ownable, no core release)

The scope catalog and the MJAPI ceiling are ordinary `__mj` tables loaded into the engine cache at
`Config()` time — so an app's **own migration** can seed new scopes + MJAPI ceiling grants
idempotently, and the engine picks them up on the next cache load:

- Cache load: `packages/APIKeys/Base/src/APIKeysEngineBase.ts:98–154` — `RunView` over `MJ: API
  Scopes`, `MJ: API Applications`, `MJ: API Application Scopes`, `MJ: API Key Scopes`,
  `MJ: API Key Applications`; scopes indexed by `FullPath`.
- Tables (in `__mj`): `APIScope` (`FullPath`, `Name`, `Category`, `ParentID`, `ResourceType`,
  `IsActive`, …) and `APIApplicationScope` (`ApplicationID`, `ScopeID`, `ResourcePattern`,
  `PatternType`, `IsDeny`, `Priority`).

A custom scope `app:thing:update` works end-to-end purely from DB rows when: an `APIScope` row exists
(`IsActive=1`), an `APIApplicationScope` row grants it to the **MJAPI** application, and an `APIKeyScope`
row grants it to the caller's key. No code change to the engine.

### 3d. Flow

```
External service (app's admin UI / SaaS)
  │  X-API-Key: <app's scoped key>   POST /graphql  { appThingUpdate(...) }
  ▼
context.ts  → validates key → resolves to the app's Service Account → userPayload{apiKeyHash}
  ▼
AppThingResolver.appThingUpdate(input, ctx)
  │  CheckAPIKeyScopeAuthorization('app:thing:update', input.id, ctx.userPayload)
  │     → ScopeEvaluator: MJAPI ceiling ∩ key scopes  → allow/deny (+ audit)
  ▼
performs the operation AS the Service Account
  │  → MJ entity-framework permissions ALSO apply (defense in depth)
```

---

## 4. What exists vs. what this plan adds

| Piece | Status | Home |
|---|---|---|
| Resolver contribution via `GetResolverPaths()` | ✅ exists & wired | `@memberjunction/server` |
| Per-resolver scope gate (`CheckAPIKeyScopeAuthorization`) | ✅ exists | `@memberjunction/server` |
| Two-level scope evaluation (ceiling + key) | ✅ exists | `@memberjunction/api-keys` |
| Scopes/ceiling as DB rows, app-seedable by migration | ✅ exists | `__mj` tables |
| `dynamicPackages.server` runtime loader | ✅ exists | `packages/ServerBootstrap/src/index.ts:99–153, 216` |
| Skip-specific provisioner + service-account migration | ✅ exists (app side) | Skip Client Open App |
| **Generalized callback-key provisioner** (H3) | ➕ new helper | `@memberjunction/api-keys` |
| **Reusable callback middleware base** (H2) | ➕ new helper | `@memberjunction/server` |
| **`RequireAPIScope` resolver middleware** (H1, optional) | ➕ new helper | `@memberjunction/server` |
| **Scope/ceiling seed migration template** (H4) | ➕ docs/template | this plan |
| `dynamicPackages` config Zod schema + casing reconcile (C1) | 🔧 small core fix | `packages/MJServer/src/config.ts` |
| Engine cache freshness after install (C2) | 🔧 ordering/doc | install flow |

> Correction to the Skip repo's `mj-apikey-callbacks-status.md`: it lists the `dynamicPackages.server`
> loader as "not started." It **exists** today at `packages/ServerBootstrap/src/index.ts:99–153`
> (called from `createMJServer` at line 216). That doc is stale on this point.

---

## 5. Deliverables

### 5a. The convention (what every app author does)

An app that wants custom callbacks ships:

1. **A service account** (+ role + entity permissions) via its migration, seeded idempotently into
   `__mj` with fixed GUIDs. The account owns the callback key; **entity permissions** on whatever the
   callbacks touch are granted here (this is what makes *write* callbacks safe — see §7).
2. **Custom scopes + MJAPI ceiling grants** via its migration (H4 template). One scope per operation
   (or per operation-group) so consumers can revoke individual operations.
3. **Resolver classes** under a dedicated dir (e.g. `dist/callbacks/*Resolver.js`). Each method is a
   normal TypeGraphQL `@Query`/`@Mutation` extending `ResolverBase`, and authorizes first — either
   manually (`this.CheckAPIKeyScopeAuthorization('app:thing:update', resource, ctx.userPayload)`) or
   via the `@UseMiddleware(RequireAPIScope(...))` helper (H1).
4. **A callback middleware** extending the shared base (H2) that returns the resolver glob from
   `GetResolverPaths()` and runs the boot-time prerequisite check.
5. **A provisioner call** (H3) on the external service's first contact, to mint the scoped key and
   hand the raw value to the external service exactly once.

### 5b. The helpers (small shared code, in existing core packages)

**H1 — `RequireAPIScope(scopePath, resourceResolver?)` TypeGraphQL middleware** *(optional, ergonomic)*
— `@memberjunction/server`. Used as `@UseMiddleware(RequireAPIScope('app:thing:update', a => a.input.id))`
to remove per-method boilerplate. Implementation: extract `context.userPayload`, derive `resource` from
args, and call the shared gate. Requires a tiny refactor so the gate logic in
`ResolverBase.CheckAPIKeyScopeAuthorization` is also exposed as a standalone exported function the
middleware can call (no behavior change).

**H2 — `BaseOpenAppCallbackMiddleware`** — `@memberjunction/server`. Thin `BaseServerMiddleware`
subclass an app extends by supplying a small config:

```ts
export abstract class BaseOpenAppCallbackMiddleware extends BaseServerMiddleware {
  protected abstract get config(): {
    label: string;                 // e.g. 'acme-crm'
    resolverDir: string;           // absolute dir; GetResolverPaths() globs <dir>/*Resolver.{js,ts}
    serviceAccountEmail?: string;  // for the boot prerequisite check
    requiredScopePaths?: string[]; // for the boot prerequisite check
  };
  get Label() { return this.config.label; }
  GetResolverPaths() { return [path.join(this.config.resolverDir, '*Resolver.{js,ts}')]; }
  async Initialize() { /* verify service account + scopes present in caches; warn loudly if not */ }
}
```

This generalizes today's `SkipMiddleware` (prereq check + self-heal + `GetResolverPaths`).

**H3 — `CallbackKeyProvisioner`** — `@memberjunction/api-keys`. Generalization of
`skip-callback-key-provisioner.ts`:

```ts
new CallbackKeyProvisioner({
  serviceAccountEmail: 'svc@acme.internal',
  requiredScopePaths: ['acme:thing:update', 'acme:thing:read'],
  label: `Acme Callback: ${externalServiceUrl}`,
}).getOrCreateKey(): Promise<string | null>
```

Properties preserved from the Skip implementation: promise-based **mutex**, **idempotent by label**,
returns the raw key **only** on first creation (unrecoverable after; external service stores it),
returns `null` when the key already exists, and **fails closed** if any required scope is missing from
the engine cache or the service account is absent.

**H4 — Scope/ceiling seed migration template** *(documentation, not code)*. Idempotent T-SQL the app
pastes into its migration:

```sql
-- 1) Catalog the scope (fixed GUID for idempotency)
IF NOT EXISTS (SELECT 1 FROM [__mj].[APIScope] WHERE FullPath = 'acme:thing:update')
  INSERT INTO [__mj].[APIScope] (ID, Name, FullPath, Category, IsActive, Description, ResourceType)
  VALUES ('<fixed-guid-1>', 'update', 'acme:thing:update', 'Acme', 1, 'Update an Acme thing', 'AcmeThing');

-- 2) Grant it to the MJAPI application ceiling
IF NOT EXISTS (
  SELECT 1 FROM [__mj].[APIApplicationScope] aps
  JOIN [__mj].[APIApplication] a ON a.ID = aps.ApplicationID AND a.Name = 'MJAPI'
  JOIN [__mj].[APIScope] s ON s.ID = aps.ScopeID AND s.FullPath = 'acme:thing:update')
  INSERT INTO [__mj].[APIApplicationScope] (ID, ApplicationID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
  VALUES ('<fixed-guid-2>',
    (SELECT ID FROM [__mj].[APIApplication] WHERE Name = 'MJAPI'),
    (SELECT ID FROM [__mj].[APIScope]       WHERE FullPath = 'acme:thing:update'),
    '*', 'Include', 0, 0);
```

(Per-key `APIKeyScope` rows are written at runtime by H3, not in the migration.)

---

## 6. Caller-side provisioning (generalized handoff)

The external service obtains its key exactly as Skip does today, now via H3:

1. On first contact, the external service hits any app endpoint that triggers provisioning (or the app
   exposes a dedicated "register" callback). H3 mints the scoped key for the service account, assigns
   the required scopes (`APIKeyScope` rows, `ResourcePattern='*'` by default), and returns the raw key.
2. The app sends the raw key to the external service **once**. The external service persists it in its
   own credential store and sends it as `X-API-Key` on subsequent callbacks.
3. **Rotation** = delete/expire the `MJ: API Keys` row → H3 mints a fresh one on next contact → external
   service re-stores it. **Revocation of one operation** = delete that `APIKeyScope` row.

---

## 7. Security model (especially for *modify* callbacks)

- **Defense in depth.** A write callback requires **both** the API scope (the gate) **and** the service
  account's **entity-framework permissions** on the target entities. The scope says "this key may
  perform this operation"; entity permissions say "this user may touch this data." The app's migration
  must grant both (Skip already grants 8 `Query*` entity permissions for exactly this reason).
- **Least privilege + revocability.** One scope per operation; consumers narrow Skip/any app by deleting
  `APIKeyScope` rows or tightening `ResourcePattern` (e.g. `acme:thing:update` limited to
  `ResourcePattern='Contacts*'`). `full_access` is **never** granted to a callback key.
- **Audit.** Every authorization decision is logged by the engine's `UsageLogger`, giving a
  per-operation trail; record-level changes are tracked by MJ's normal change tracking.
- **Ceiling is a trust surface.** Seeding a scope into the **MJAPI** ceiling means an installed app
  widens what MJAPI keys *can* be granted. This is consistent with the Open App spec's stance
  ("apps run with full server privileges; installing is a trust decision"), and is strictly **more**
  restrictive than the status quo (external callers using the unrestricted system key). Granting the
  ceiling alone grants nothing — a key must also hold the scope (two-level deny-by-default).
- **No-op for humans.** Because the gate is a no-op when there's no `apiKeyHash`, adding these resolvers
  + checks never affects interactive Explorer users.

---

## 8. Small core changes required

- **C1 — config schema.** `dynamicPackages` is read at runtime
  (`packages/ServerBootstrap/src/index.ts:124`) but is **absent from the MJServer config Zod schema**
  (`packages/MJServer/src/config.ts`). Add a `dynamicPackages` schema entry so it is validated/typed,
  and **reconcile the field casing**: the loader reads PascalCase (`PackageName`, `StartupExport`,
  `AppName`, `Enabled`) while `open-app-spec.md`'s example shows lowercase (`packageName`, …). Pick one
  (PascalCase matches the implemented loader + the `DynamicPackageLoad` type) and align the spec, the
  CLI writer, and the loader. Custom-callback resolvers only load if the app's package loads, so this
  wiring must be correct.
- **C2 — engine cache freshness.** H3 reads scopes from `APIKeyEngine`'s cache and fails closed if a
  required scope is missing. After an app migration seeds new scopes, the cache is stale until
  `APIKeyEngine.Config(true)` runs or the server restarts. The normal Open App flow already requires a
  **server restart after install** (to load `dynamicPackages.server`), so a fresh boot loads the seeded
  scopes — **document this ordering** (callbacks become live after the mandated post-install restart).
  Optional hardening: have H3 force a one-time `Config(true)` refresh before declaring a scope missing,
  so a live install without restart self-heals.

No other core changes are required for v1.

---

## 9. Lifecycle integration with the Open App spec

- **Install:** migration seeds service account + scopes + MJAPI ceiling; package install + config write
  register the server package; post-install **restart** loads the package → `@RegisterClass` registers
  the app's callback middleware → `GetResolverPaths()` contributes the resolvers → schema includes them;
  engine cache (fresh boot) includes the new scopes. Callbacks are live.
- **Disable:** `enabled:false` in `dynamicPackages.server` stops loading the package → middleware/
  resolvers absent on next boot. The scopes/keys remain in the DB (inert without resolvers).
- **Remove (`preRemove`):** the app should **revoke its callback keys** (delete `MJ: API Keys` rows),
  then remove its `APIKeyScope` → `APIApplicationScope` → `APIScope` rows (FK order matters) and its
  service account. With `--keep-data`, leave data but still revoke keys.

---

## 10. Phased implementation plan

1. **Helpers land in core (small).** H3 `CallbackKeyProvisioner` (`@memberjunction/api-keys`), H2
   `BaseOpenAppCallbackMiddleware` (`@memberjunction/server`), and the gate refactor enabling H1.
   → verify: unit-test H3's mutex/idempotency/fail-closed; a trivial `@UseMiddleware(RequireAPIScope)`
   resolver denies an unscoped key and allows a scoped one.
2. **Config fix C1.** Add `dynamicPackages` to the Zod schema + reconcile casing across loader, CLI
   writer, and spec. → verify: a malformed `dynamicPackages` entry produces a clear config error; a
   valid one loads.
3. **Docs.** Add a "Custom Callbacks" section to `open-app-spec.md` referencing this plan + the H4
   template; update `skip-callback-scoped-api-keys.md` to point at the generalized provisioner.
4. **Reference implementation.** Migrate Skip to the helpers: `SkipMiddleware extends
   BaseOpenAppCallbackMiddleware`, provisioner → `CallbackKeyProvisioner`; add **one** trivial Skip
   custom callback end-to-end (behind a new `skip:*` scope) to prove the path. → verify: external call
   with the scoped key succeeds; same call without the scope is denied + audited; JWT user unaffected.
5. **C2 hardening (optional).** Add the one-time cache-refresh-before-fail-closed in H3.

---

## 11. Reference map

| Concern | Location (this repo) |
|---|---|
| Middleware contract + `GetResolverPaths()` | `packages/MJServer/src/middleware/BaseServerMiddleware.ts:93–112` |
| Middleware discovery / resolver merge / schema build | `packages/MJServer/src/index.ts:705–709, 725, 739–761, 823–830` |
| Per-resolver scope gate | `packages/MJServer/src/generic/ResolverBase.ts:624–685` |
| Example gated resolver | `packages/MJServer/src/resolvers/ActionResolver.ts:185–208` |
| Two-level scope evaluation | `packages/APIKeys/Engine/src/ScopeEvaluator.ts:67–120` |
| Scope/ceiling cache load | `packages/APIKeys/Base/src/APIKeysEngineBase.ts:98–154` |
| Dynamic package loader | `packages/ServerBootstrap/src/index.ts:99–153, 216` |
| Config schema (C1 gap) | `packages/MJServer/src/config.ts` |
| Open App standard | `plans/open-app-spec.md` |
| Original Skip scoped-callback design | `plans/skip-callback-scoped-api-keys.md` |
| Skip provisioner / middleware (to generalize) | Skip Client Open App: `packages/server/src/skip-callback-key-provisioner.ts`, `skip-middleware.ts` |
