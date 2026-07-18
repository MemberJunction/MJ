# Bug Register — defects surfaced by the integration-audit

Companion to **[README.md](README.md)** / **[test-catalog.md](test-catalog.md)**. Every defect/anomaly the 9-cluster adversarial audit surfaced, made **fix-ready**. Each has a **disposition** so we can decide what lands in this omnibus quality PR (#3181) vs. what's a test-only pin vs. what needs your sign-off.

**Dispositions:**
- **FIX-NOW** — clear, low-risk fix that fits the quality PR; pair with a guarding test.
- **DECIDE** — real defect but the fix is a security/architecture/behavior call → **AI proposes, human approves** (per the §3a governance rule). Don't land silently.
- **PIN** — current behavior is by-design (or an accepted trade-off); write a test that *pins* it, change no code.
- **VERIFY** — suspected but unconfirmed; the first task is a test that proves whether it's real.
- **GUARD** — not a bug today, a latent risk; add a test that fails if it *becomes* one. No code change.
- **DONE** — already fixed in-repo; add a regression test so it can't return.

> **Note on scope:** writing the tests is the green-lit work; *fixing* these is a related decision. Nothing here is fixed yet. The security-sensitive ones (B1, B7, B8) especially must not be touched without your explicit go-ahead.

---

## Security / data-integrity (highest severity)

| ID | Defect | Location | Severity | Fix approach | Disposition | Guarding test |
|---|---|---|---|---|---|---|
| B1 | **TransactionGroup API-key scope bypass** — `ExecuteTransactionGroup` has no `ResolverBase`/`@Resolver()` and makes zero `CheckAPIKeyScopeAuthorization` calls, so a `view:run`-only key can Create/Update/Delete over the wire. Entity RLS still runs, but the API-key scope ceiling is skipped. | `MJServer/.../TransactionGroupResolver.ts:81` | **High** | Route TG items through the same scope check the CRUD resolvers use (per-item `entity:create/update/delete`), or gate the whole mutation. Careful not to break legit callers. | **DECIDE** (security) | SEC1 `transaction-group-scope-bypass` |
| B2 | **`GetConversationsForMemoryManager.since` injection hole** — SQL is `>= '{{ since }}'` (manual quotes, no `sqlString` filter), so a quote in the value breaks out of the literal. Mitigated only because the param is date-typed. | `metadata/queries/SQL/get-conversations-for-memory-manager.sql` | **High** (latent) | Bind via `{{ since \| sqlString }}` (or a date-safe filter) and drop the manual quotes. Trivial + safe. | **FIX-NOW** | RQ-F8 |
| B3 | **`console.log` of query Parameters + Results** on every `GetQueryData` — potentially-sensitive filter values + full result sets to server stdout. | `MJServer/.../QueryResolver.ts:205,219` | Med (hygiene) | Remove, or guard behind a verbose/debug flag. Trivial. | **FIX-NOW** | (n/a — log hygiene) |
| B4 | **Subscription channel isolation** — `RemoteOperationProgress`/`PushStatus` filter on a **client-chosen** `channelId`/`sessionId` with no user check; a user who knows/guesses another's channel receives their payloads. | `MJServer/.../ExecuteRemoteOperationResolver.ts:151`, `PushStatusResolver.ts:30` | **High** (potential leak) | Bind the channel to the authenticated user; reject subscriptions to channels the caller doesn't own. May be intentional for some flows → confirm. | **DECIDE** (security) | SEC6 `subscription-channel-isolation` |
| B5 | **Cache-invalidation broadcast scope** — `CacheInvalidationResolver` broadcasts mutated-row `RecordData` to **every** connected socket, no tenant/RLS filter; crosses tenants in a `MJTenantFilterMiddleware` deployment. | `MJServer/.../CacheInvalidationResolver.ts:43-47` | **High** (multi-tenant) | Scope the broadcast (PK-only, or per-tenant/permission filter). Significant behavior change → product decision. | **DECIDE** | SEC7 `cache-invalidation-broadcast-scope` |
| B6 | **OAuth reflected-XSS** — success/error pages interpolate `connectionId`/`error`/`error_description` from the query string into HTML unescaped. | `MJServer/.../OAuthCallbackHandler.ts:123,159-160` | Med-High | HTML-escape the interpolated values. Low-risk fix. | **FIX-NOW** | (add an escaping assertion) |
| B7 | **SQLExpressionValidator `\bXP_\b` / `\bSP_\b` word-boundary gap** — `xp_cmdshell` has no word boundary between `xp_` and `cmdshell`, so `\bXP_\b` may not match it → dangerous xprocs could slip the allowlist. | `MJGlobal/.../SQLExpressionValidator.ts:183` | **High** (if real) | If confirmed, switch to a prefix match (`\bxp_\w+`) or explicit denylist. **Confirm before changing** — the validator is security-critical and heavily used. | **VERIFY → DECIDE** | SEC13 |

## Correctness bugs

| ID | Defect | Location | Severity | Fix approach | Disposition | Guarding test |
|---|---|---|---|---|---|---|
| B8 | **`ConcurrencyMode=Queue` never terminalizes a run** — `createQueuedJobRun` writes `Status='Running'` and no drainer completes it → orphaned-`Running`-forever. | `Scheduling/.../ScheduledJobEngine.ts:1497` | **High** | Add a drainer that runs queued jobs to a terminal status, or terminalize on creation if queueing isn't implemented. Needs design. | **DECIDE** | AP3 (expected-FAIL probe) |
| B9 | **Query parameter metadata not round-tripped** — `.mj-sync.json` declares `MJ: Query Parameters` as a pulled related entity, but no param blocks are written to the query dotfiles; the only source is the SQL baseline seed. A `mj sync push` from metadata would create queries **without** parameters, breaking required-param validation. | `metadata/queries/.mj-sync.json` + `Baseline.sql:47795` | **High** (metadata integrity) | Pull params into the dotfiles (or fix the sync config so they round-trip). Affects the metadata workflow → verify carefully. | **DECIDE** | RQ-C6 |
| B10 | **`ValidationFilters` parsed but never enforced** — the loop is a no-op placeholder; declared param validation filters do nothing. The metadata field is a false promise (no live impact today — all catalog params are NULL). | `QueryProcessor/.../queryParameterProcessor.ts:206-211` (+ PG copy) | Med | Either implement enforcement or remove the field/doc so it's not a false promise. | **DECIDE** | (add once implemented) |
| B11 | **`GetConversationArtifactsMap` has no PostgreSQL variant** while its sibling does → runs SQL-Server-bracketed syntax on PG and fails. | `metadata/queries/.get-conversation-artifacts-map.json` | Med (PG only) | Author the `.pg.sql` variant + `MJ: Query SQLs` child. | **FIX-NOW** (once PG matters) | RQ-C6 / PG parity |
| B12 | **`CategoryPath` is a misnomer** — docs promise hierarchical paths (`/MJ/AI/Agents/`) but the server matches the flat category **name**. Either a bug or stale docs. | `runQuery.ts:29,139` vs `QueryResolver.ts:167` | Low-Med | Decide: implement true path matching, or fix the docs + rename. | **DECIDE** | RQ-F1 (pins current behavior) |
| B13 | **ExternalChangeDetection seed `SampleValue`s are non-executable** — reference `vwCustomers`/`dbo`/`CustomerEntity` that don't exist, and use inconsistent `EntityID` sample types (name vs GUID). Any "run with samples" harness errors. | `Baseline.sql` QueryParameter seed | Low | Fix the seed samples to real/consistent values (or mark them example-only). | **FIX-NOW** | RQ-C4 |
| B14 | **`ValidateInputs` / `RunSingleFilter` are no-op stubs** in the Action engine — the base engine performs no type validation and no filter enforcement; validation only happens inside individual actions. | `Actions/.../ActionEngine.ts:280,303` | Med | Implement the stubs, or document the contract clearly. Behavior change → decide. | **DECIDE** | AP8 (pins current contract) |
| B15 | **Tag/entity delete cascades swallow partial FK-cleanup failures** (LogError + proceed) → orphan-row risk. | `MJCoreEntitiesServer/.../MJTagEntityServer.server.ts:91` (+ others) | Med | Make partial failure fail the delete (or compensate). Decide per entity. | **DECIDE** | ES1 |

## Pin (by-design — test, don't change)

| ID | Behavior | Location | Disposition | Test |
|---|---|---|---|---|
| B16 | Server-side Save is **last-write-wins** (`SkipOldValuesCheck` is client-only) — concurrent edits silently clobber. Documented. | `interfaces.ts:306-311` | **PIN** | CD13 |
| B17 | A view's own compiled `WhereClause` bypasses `ValidateUserProvidedSQLClause` (only `ExtraFilter` is screened) — by-design for `CustomWhereClause=1` sysadmin views. | `GenericDatabaseProvider` | **PIN** (note in V3 rationale) | V3 |
| B18 | ViewID/ViewName-only RunView is **not** drop-invalidated on save → a lingered ViewID result can serve stale rows. | `providerBase.ts:381-385` | **PIN** (or small FIX — decide) | CD6 |

## Already fixed (regression-guard only)

| ID | Was | Fixed by | Test |
|---|---|---|---|
| B19 | `UserCanView` resolved resource type by `.Entity` not `.Name` → emptied the view selector + dropped the user's own views. | `8b0c04f203` | V15/V16 |

## Latent risks (GUARD — no code change yet)

| ID | Risk | Where | Guarding test |
|---|---|---|---|
| B20 | Generic single-word `DriverClass` keys in Knowledge Hub (`Tags`, `AnalyticsResource`, `VisualizationResource`) are collision-prone (ClassFactory last-registration-wins). | `metadata/applications` | G4 (metadata uniqueness) + G5 static gate |
| B21 | `DefaultSequence` collisions across default-for-new-user apps — `calculateSequenceFromDefault` de-conflicts only vs existing user rows, not other apps' defaults. | `MJApplicationEntityServer.server.ts:173` | S3/S4 |
| B22 | App slug/`Path` uniqueness enforced only at write-time (`ensureUniqueSlug`), not as a stored invariant. | `MJApplicationEntityServer.server.ts:130` | G6 |
| B23 | OpenApp reinstall idempotency + `schema.name`→`CanonicalSchemaName` binding drift. | `OpenApp` install path | O1/O2 |

---

## Recommended split for THIS PR

**Land the quick, safe fixes now** (FIX-NOW, all low-risk + a guarding test each): **B2** (`since` injection), **B3** (console.log), **B6** (OAuth escaping), **B13** (seed samples), **B11** (PG variant, if PG is in scope).

**Bring to you for a decision before touching** (DECIDE/VERIFY — security, architecture, or behavior-changing): **B1** (TG scope bypass), **B4** (subscription isolation), **B5** (cache broadcast), **B7** (xp_ regex — verify first), **B8** (queue orphan), **B9** (param round-trip), **B10** (ValidationFilters), **B12** (CategoryPath), **B14** (Action stubs), **B15** (cascade failures).

**Everything else** is PIN / GUARD / regression-only — covered by writing the test, no code change.

This way the omnibus PR fixes the safe stuff immediately, pins the by-design behavior, and gives you a clean decision list for the sensitive ones — none landed silently.
