# Field-Level Security — Implementation Plan (post-Phase 2 / Phase 2.6+)

> **Forward-only.** This document contains only work that remains to be done, organized into
> independently shippable workstreams. All rationale — the R1–R7 research, the D1–D7 decisions,
> the rejected alternatives, and the as-built map of Phases 1–2 — lives in the decision record:
> [`plans/field-level-security.md`](./field-level-security.md). When this document says
> "decided," the reasoning is there; do not re-litigate here.
>
> Branch: `JF_Entity_Field_Security` (Phases 1–2 committed: `260401e0d6` Phase 1, `a2588c9c02`
> Phase 2; nothing pushed). All decisions D1–D7 were made 2026-08-06.

---

## Ground rules (constraints that survive every workstream)

1. **Nothing overrides a Deny.** No per-user exemption, at any tier.
2. **PKs and `__mj_` system columns stay readable**; the unrestrictable-entity list stands.
3. **Denial wording stays ambiguous**: `Field 'X' does not exist on entity 'Y' or you do not
   have access to it.` — on every new rejection path too.
4. **The app tier is authoritative.** DB-tier enforcement (Workstream B) is additive hardening
   for direct connections only; it can never replace the app-tier gates (F0: single service
   login).
5. **`entity_object` results are exempt from all projection/SELECT-filtering** until Workstream
   D ships. Entity objects load every column; enforcement is at the output boundary.
6. **Definition of done per repo standard**: affected packages' unit tests pass, plus the
   deterministic integration tier (`pnpm run test:integration`). Every workstream lists its
   test additions.

## Current state (what is already shipped on this branch)

| Shipped | Where |
|---|---|
| Schema (`EntityFieldPermission`), metadata aggregation, unrestrictable guards | Phase 1 commit |
| Predicate gate (ExtraFilter/OrderBy), output projection (both cache paths), GraphQL boundary (`MapFieldNamesToCodeNames`), save guard, save-time target guard | Phase 2 commit |
| 67 unit tests + 38 identifier tests | `MJCore`, `SQLDialect` `__tests__` |

Known live gaps in the shipped code (fixed by Workstream A): Aggregates bypass the predicate
gate; client round-trip silent data loss on read-denied + update-allowed fields.

---

## Workstream A — Immediate fixes + documentation

**Ships with the Phases 1–2 PR** (same branch): these harden the code that PR introduces, and
reviewers should see them together. Smallest workstream; do it first.

### A1 — Aggregates predicate gate (fixes live gap 1)

- **Change**: `ProviderBase.AssertPredicatesRespectFieldSecurity`
  (`packages/MJCore/src/generic/providerBase.ts` — the clause loop at ~2251) additionally runs
  `FindReferencedIdentifiers` over every `params.Aggregates[].expression`. Same rejection, same
  ambiguous error, same `LogDebug` on rejection. (There is no `GroupBy` param; aggregates are
  single-row — after this, the gate covers every caller-authored expression surface:
  ExtraFilter, OrderBy, Aggregates. `UserSearchString` is already handled by exclusion.)
- **Acceptance**: `Aggregates: [{expression: 'MIN(Salary)'}]` from a Salary-denied user is
  rejected before execution; unrestricted users and non-FLS entities are unaffected (gate still
  short-circuits on `HasAnyFieldPermissions`).
- **Tests**: unit tests alongside the existing gate tests in
  `MJCore/src/__tests__/fieldSecurity.enforcement.test.ts` — denied field in aggregate
  expression (bare, bracketed, function-wrapped, aliased), allowed aggregate passes, non-FLS
  entity skips.

### A2 — `UpdateRecord` denied-read guard (fixes live gap 2; interim until Workstream D)

- **Change**: in `ResolverBase.UpdateRecord`
  (`packages/MJServer/src/generic/ResolverBase.ts` ~1265–1347), before the unconditional
  `SetMany(clientNewValues)` (~1531 in `TestAndSetClientOldValuesToDBValues`'s flow): when
  `entityInfo.HasAnyFieldPermissions`, compute the user's denied-read set once and **strip those
  keys from the client's new values** (and OldValues) before they are applied. Any value the
  client sends for a field it was never shown is fabricated by construction. Silent strip (the
  R4 narrowing posture), `LogDebug` when fields are stripped.
- Also fix the now-false comment at `baseEntity.ts:2874-2877` ("a field the user cannot see was
  never loaded as null, so it is not dirty") — true client-side only; note the server-side
  `SetMany` path.
- **Acceptance / side benefit**: read-denied + update-allowed round-trip no longer destroys
  data; **and** read-denied + update-denied records become saveable again for unrelated edits
  (the fabricated value no longer makes the denied field dirty server-side, so the save guard
  no longer fires spuriously).
- **Tests**: integration-style round-trip: restricted user loads via GraphQL, edits an unrelated
  field, saves → denied column unchanged in DB (per column class: nullable/no-default,
  nullable/default, NOT NULL/default); read+update-denied user can save unrelated edits.

### A3 — Documentation deliverables (decided wording, no design left)

Create the admin-facing FLS guide (proposed: `guides/FIELD_LEVEL_SECURITY_GUIDE.md`, indexed in
`guides/README.md`) covering, at minimum:

1. **Record Changes trust boundary** (D6c): do not grant entity-level read on
   `MJ: Record Changes` to roles carrying FLS denials on any entity, or to roles that should
   not read a tracked entity's data. Mention the blunt per-deployment tool (FLS-restricting
   Record Changes' own payload columns). Payload redaction is deferred to a future
   record-change-auditing overhaul.
2. **NOT NULL constraint** (R6/R5): FLS-restricted fields should be nullable or defaulted — a
   denied NOT NULL field breaks single-record GraphQL loads for denied users (non-nullable
   type fields) and blocks record creation when no default exists.
3. **Saved queries are not FLS-filtered** (existing §2.5 boundary — restate).
4. Aggregate/predicate rejection behavior and the ambiguous error wording (so admins recognize
   it).

Direct-connection / DB-tier documentation (item 5 below) ships with Workstream B, but draft its
skeleton here if convenient:

5. **Direct-connection caveats** (F0/D1/D2): SQL Server ↔ PostgreSQL asymmetry (PG direct
   connections get NO automatic FLS); no RLS for direct connections on either platform; BI
   roles must be SELECT-only (proc-EXECUTE ownership-chaining bypass); standard roles are never
   DB-enforced (custom roles only).

---

## Workstream B — DB-tier enforcement (CodeGen, SQL Server only)

Independent of C and D. PostgreSQL emits **nothing** (D2) — its only deliverable is
documentation (A3 item 5).

### B1 — Column-level DENY emission

- **Change**: in the SQL Server permissions generation
  (`packages/CodeGenLib/src/Database/providers/sqlserver/SQLServerCodeGenProvider.ts`,
  `generateViewPermissions` ~700–708 and the orchestration in `sql_codegen.ts`): for each
  entity, emit `DENY SELECT ([col1], [col2], ...) ON [schema].[BaseView] TO [RoleSQLName]` for
  each role where **all** of:
  1. an `EntityFieldPermission` record with explicit `Type = 'Deny'` and `CanRead = 1` targets
     the (field, role) — never synthesize denies from absent Allows (D2);
  2. the role's `SQLName` is non-blank (blank = app-tier-only by design, D3a);
  3. **the service-login backstop passes** (D1a): at generation time, verify via
     `IS_ROLEMEMBER('<RoleSQLName>', '<serviceLogin>')` that no protected principal is a member
     of the target role; skip the DENY **with a prominent warning** if one is. Protected
     principals come from config, defaulting to the known service users (`MJ_Connect`,
     `MJ_Connect_Dev`) plus the configured `dbUsername`.
- Defensive filter: never emit a DENY for PK / `__mj_` / unrestrictable-entity targets (the
  save-time guard should make such records impossible; filter anyway).
- Statements land in the per-entity `*.permissions.generated.sql` files → executed by
  `applyPermissions` every run and logged through the SQL logging pipeline like all permission
  statements.
- **Policy note (documented, not coded)**: standard roles (UI/Developer/Integration) never
  receive FLS DENYs; app-tier enforcement still applies to them in full.

### B2 — Catalog-driven reconciliation (D7; also closes pre-existing entity-grant drift, gap 5)

- **Change**: at generation time, read actual permission state:
  ```sql
  SELECT pr.name AS role_name, o.name AS object_name, c.name AS column_name,
         p.state_desc, p.permission_name, p.minor_id
  FROM sys.database_permissions p
  JOIN sys.database_principals pr ON pr.principal_id = p.grantee_principal_id
  JOIN sys.objects o ON o.object_id = p.major_id
  LEFT JOIN sys.columns c ON c.object_id = p.major_id AND c.column_id = p.minor_id
  WHERE p.class = 1
  ```
  **Managed scope** = objects CodeGen owns (base views, CRUD procs, FTS functions) × roles with
  non-blank `SQLName`. Within that scope only, wipe-and-reassert: emit `REVOKE` for every
  existing entry (column-level `minor_id > 0` AND object-level `minor_id = 0`), then the current
  desired GRANTs/DENYs from metadata. Removing a DENY is also spelled `REVOKE`. Never touch
  grants to principals/roles outside the managed scope (DBA-owned grants, `db_datareader`,
  etc.).
- Ordering is already safe: view DROP/CREATE wipes object permissions, and the permissions files
  run after regeneration; the wipe-and-reassert preamble makes the no-regeneration path
  equivalent.
- **Acceptance**: deleting an `EntityFieldPermission` Deny record removes the DENY on the next
  codegen run without any schema change; deleting an `EntityPermission` row revokes the role's
  view GRANT the same way (gap 5 closed); manual drift inside the managed scope self-heals;
  grants outside the scope are untouched.

### B3 — Blank-`SQLName` skip becomes visible

- **Change**: the silent skip in the grant emitters (`if (ep.RoleSQLName && ...)` — both
  providers) logs one INFO line per skipped role per run: role name + "app-tier-only (no
  SQLName); no DB grants emitted."

### B-tests

- Unit tests on the emission logic (Deny-record filtering, backstop skip, unrestrictable
  filter, reconciliation set arithmetic) with mocked catalog rows.
- A manual verification checklist in the PR (real SQL Server): direct user in a denied custom
  role errors on the denied column (`SELECT *` and named); MJ_Connect unaffected; DENY removal
  round-trip; `cdp_BI`-style SELECT-only persona sees hard errors, cannot use procs.

---

## Workstream C — RunView SELECT-list filtering + `fls:` cache segment

Independent of B; requires A conceptually (ship after PR1). `simple`-path only; `entity_object`
untouched (ground rule 5).

### C1 — `fls:` fingerprint segment

- **Change**: `LocalCacheManager.GenerateRunViewFingerprint`
  (`packages/MJCore/src/generic/localCacheManager.ts` ~1401–1495): append `fls:<hash>` following
  the `rls:` pattern (~1472–1475) — only when the entity has FLS and the user's denied-read set
  is non-empty. Hash = the denied set, lowercased, sorted, hashed (D3: denied set, not allowed —
  precomputed, empty ⇒ no segment ⇒ shared slots, stable under additive schema change). Compute
  in `ProviderBase` beside `ComputeRunViewRLSWhereClause` (~2193).

### C2 — Allowed-set widening

- **Change**: everywhere cache-eligibility widening sets `params.Fields = all fields` —
  `PreRunView` (~2397–2417), `PreRunViews` (~2562–2582), and
  `GenericDatabaseProvider.RunViewsWithCacheCheck` (~2088–2129) — widen instead to the user's
  **allowed** set (all fields minus denied; PKs always included) when the entity has FLS and
  the denied set is non-empty. Each permission class gets its own internally consistent
  universal-superset slot under its `fls:` fingerprint.

### C3 — SELECT-list intersection

- **Change**: `GenericDatabaseProvider.getRunTimeViewFieldArray/String` (~1806–1859), for FLS
  entities on the `simple` path:
  - explicit `params.Fields` → intersect with allowed set, **silent narrowing** (D3); PK
    force-add stands;
  - empty `Fields` with no saved view → emit the **explicit allowed-column list** instead of
    `SELECT *` (trap 1);
  - saved-view column path → intersect the same way.
- `ApplyFieldSecurityProjection` stays exactly as-is (defense-in-depth for pre-change cache
  slots and any path that misses the SELECT filter).
- **Supersede the doc comment** at `providerBase.ts:2291-2295` ("SELECT-list filtering is not
  viable") — its premise (widening to ALL columns) is what C2 changes. Rewrite it to describe
  the new composition.

### C-tests

- Cache: restricted and unrestricted users produce different fingerprints on FLS entities and
  identical ones elsewhere; restricted-warmed slot never serves extra columns to anyone;
  permission change ⇒ new fingerprint ⇒ fresh slot; `AllowCaching=false` FLS entity behaves
  (narrow fields end-to-end).
- SELECT: generated SQL for a restricted user never names a denied column (explicit Fields,
  empty Fields, saved view); PKs always present; `entity_object` requests still widen to all
  columns and are never SELECT-filtered.
- Existing round-trip and projection tests keep passing unchanged.

---

## Workstream D — Not-loaded field flag (its own project; phased)

Confirmed design (D4) — see the decision record's R5 "Confirmed design" for full mechanics.
**No stored-procedure changes anywhere** (the `ISNULL` merge already provides don't-set
semantics; the `_Clear` companion and app-tier validation are the only save-path levers).
A2's stopgap stays in place until D2 below ships, then becomes redundant (keep it as
defense-in-depth).

### D-1 — Server core: flag + save path

- `EntityField` gains the not-loaded flag. Semantics: set when a **hydration source omits the
  field's key**; cleared by any explicit `Set`; never present on new (unhydrated) entities.
  Distinct from `_NeverSet` (do not reuse it).
- Hydration paths set it: `hydrateFieldsIfNeeded` (the `value !== undefined` branch),
  `LoadFromData` (both modes), `InnerLoad`/`SetMany` entry points, `Hydrate`.
- Save path: `GenerateSaveSQL` skips not-loaded fields (the existing `CoerceSaveFieldValue`
  `'skip'` kind); `RenderSaveCallBinding` suppresses the `_Clear` companion for them;
  `Validate()` exempts them from required/null checks (audit the generated Zod schemas as the
  second validation surface).
- `Dirty`: not-loaded ⇒ never dirty, made explicit.

### D-2 — Client transport round-trip

- `GraphQLDataProvider` hydration derives the flag (missing key in payload ⇒ not loaded) — on
  load, on RunView `entity_object` materialization, **and on the create/update response
  refresh** (the create-response corner: otherwise the in-memory default masquerades as a
  confirmed value and gets resent).
- Client `Save` skips not-loaded fields — including removing the NOT-NULL default/`0`/`''`
  fabrication (~1842–1855) and the OldValues for them (~1879–1893).
- Server `UpdateRecord` honors omission natively (absorbing A2's behavior).

### D-3 — Serialization surfaces

Decide and implement consistently: `GetAll()` (omit vs include not-loaded fields — affects
Record Changes payload fidelity and spread-`GetAll` app code), `ToString`, `CopyFrom`,
`TransformSimpleObjectToEntityObject`. Inventory is in the decision record (13 touch points).

### D-4 — Policy re-evaluation (only after D-1…D-3)

Re-ask, with the flag in hand: should `ApplyFieldSecurityProjection` still exempt
`entity_object`? (Likely still yes for server-internal engines — restricted `contextUser`
driving a `BaseEngine` remains warn-don't-support.) Should single-record rerouting (D5) be
revisited? Neither is assumed; both are explicitly re-opened here and nowhere else.

### D-tests

The full round-trip matrix by column class (nullable/no-default, nullable/default, NOT
NULL/default, NOT NULL/no-default): restricted user loads → edits unrelated field → saves →
denied column unchanged in DB, save succeeds. Write-only case (read-denied + update-allowed,
explicit set) saves the new value. New-record creation writes defaults normally. Record
Changes payloads reviewed for not-loaded handling.

---

## Decisions taken after Workstream D shipped (2026-08-06)

R6 answered "don't reroute single-record loads through RunView," but attached a condition:
*revisit once entity objects have a partial-hydration story.* Workstream D delivered that, so
the question was reopened with Jordan and his boss. Outcome:

- **Server-side loads no longer fetch denied columns.** `GenericDatabaseProvider.Load` emits an
  explicit allowed-column list instead of `SELECT *` when the context user has denials
  (`buildFieldSecuritySelectList`). This closes the case that motivated it: an AI agent running
  under a restricted service account previously pulled every column into server memory on a PK
  load. Omitted columns arrive as absent keys, so D-1 marks them not-loaded and the next save
  skips them.
- **The RunView reroute is DEFERRED to its own PR**, not abandoned. It is the tidier long-term
  shape (one code path, RLS consistency), but it touches the hottest path in the ORM. Two
  requirements are decided in advance so the future work does not re-litigate them:
  1. **It must pass `BypassCache`.** A PK load has never been served from cache; making it
     cache-eligible would return stale rows after direct-SQL DML. Jordan's call: single-record
     loads must always read current data.
  2. **Relationship loading stays on its current path.** Routing it through RunView would
     silently start applying RLS to related rows (a pre-existing gap — see gap 4) and needs a
     1+N reshape. Out of scope for the reroute.
- **The system user is EXEMPT from field security — this amends decision 1.** Decision 1 said
  no user is ever exempt. That still holds for every *person*: no admin bypass, no Owner
  carve-out. The system user is not a person — it is the account the server runs its own work
  as — and the exemption is required, not a convenience.

  **Why it is required (found by live testing, not by reading):** the whitelist flip means the
  FIRST rule on a field closes that field for everyone without an explicit Allow, including
  users no rule mentions. A live run proved it — a Deny aimed at a brand-new role the system
  user had nothing to do with silently stripped the field from the system user too. Engines
  then cache partially loaded records process-wide and serve them to every user, and the
  failure surfaces nowhere near the rule that caused it. The originally-planned configuration
  guard does NOT prevent this, because nothing in the configuration mentions the system user.

  **Why it costs nothing:** the server reaches the database through a single service login that
  can already read every column. Denying the system user at the app tier protects no data; it
  only breaks the server's ability to do its own work. Acting as the system user (the system API
  key, gated by `@RequireSystemUser`) is already full-trust by design.

  Implementation (reworked by the BaseEngine session, 2026-08-08): the exemption in
  `EntityFieldInfo.GetUserFieldPermissions` resolves through the `WellKnownUserSource`
  class-factory seam (MJCore base answers false; `DatabaseWellKnownUserSource` in
  GenericDatabaseProvider answers on servers). `SystemUserID` lives in
  `packages/GenericDatabaseProvider/src/systemUser.ts` — a server concept, kept out of
  browser bundles. On a client no source is registered, so the exemption never fires there
  (a browser has no system account).

- **The configuration guards stay too** — they cover the entanglement the exemption does not
  make harmless (an admin reasoning about roles should still be told "no"). Two saves are
  refused: a rule targeting a role the system user holds (`MJEntityFieldPermissionEntityServer`)
  and giving the system user a role that carries rules (`MJUserRoleEntityServer`). This mirrors
  the DB-tier backstop, which skips a column DENY for any role a service login belongs to.
  Context for why the system user matters at all: engines pre-warm as it in full startup mode,
  but in **task mode** — what job and agent runners use — engines load on first touch, so any
  caller can configure them, and their caches are process-wide and shared.
- **The `entity_object` cache exemption applies to SERVER caches only.** Caught by Jordan after
  the fact: engines default to `ResultType: 'entity_object'` and many enable `CacheLocal`, so a
  blanket exemption stripped client-side engine caching from every restricted signed-in user in
  the browser — a permanent network refetch on each page load, aimed at exactly the users an
  administrator restricted. The exemption's two hazards are both server-only: a browser hosts
  one principal (nothing to cross-serve) and its slots can only hold allowed-width rows anyway
  (the server strips denied columns on the wire). Partial entities are also no longer dangerous
  now that D-1 marks not-loaded fields, and the client `fls:` segment already separates
  permission classes. Gated on `TrustLocalCacheCompletely`.

- **The client cache key uses the ALLOWED field list**, while the server keeps using the denied
  set. Reason: once metadata ships to browsers filtered to what a user may see
  ([#3485](https://github.com/MemberJunction/MJ/issues/3485)), a denied field will not appear in
  the client's field list at all, so a denied-set key would be empty and silently stop
  segmenting. The allowed list is what the client can still observe, and it also resolves the
  `f:*` full-width ambiguity (after #3485, "all fields" means different columns per user). The
  two caches are looked up independently, so they do not need matching schemes. **The client
  fingerprint still omits the RLS clause** — a pre-existing defect filed in `MJ-UPSTREAM.md`,
  deliberately not fixed here.

## Later / explicitly out of scope here

- **Phase 4 admin UI** (unchanged scope, plus two additions from this work): warn when
  restricting a NOT NULL / no-default column; surface the Record Changes guidance.
- **Phase 3 (Skip)** — on hold, unchanged.
- **Phase 2.5 (saved queries)** — deferred by decision, unchanged; the Tier-2 standing audit
  remains the cheap de-risking option.
- **Record Changes payload redaction** — future general overhaul of record-change auditing.
- **`Load` relationship SELECTs missing RLS** (gap 4) — pre-existing, unrelated; needs its own
  issue.

## Test environment — MJDev (use this; don't hand-roll an environment)

The user has **MJDev** installed (`~/MJDev`, CLI at `~/MJDev/bin/mjdev`) — a harness that
provisions isolated MJ instances: a git worktree off the central clone (`~/MJDev/repos/mj`) +
a per-instance database on a shared Dockerized SQL Server + generated config/auth + managed
services. Read `~/MJDev/AGENTS.md` before using it (heavy-slot etiquette, honesty-in-test-
reporting protocol, issue-routing logs).

### Standing up the FLS instance (once)

```bash
# 1. Get the local-only branch into the central clone WITHOUT pushing — this also works
#    around a KNOWN mjdev bug (see ~/MJDev/MJDEV-ISSUES.md): `create` silently cuts a NEW
#    branch off origin/main when the requested branch isn't a LOCAL branch in repos/mj.
git -C ~/MJDev/repos/mj fetch /Users/jordanfanapour/Documents/GitHub/MJ \
    JF_Entity_Field_Security:JF_Entity_Field_Security

~/MJDev/bin/mjdev create fls-test --branch JF_Entity_Field_Security
# 2. VERIFY the worktree HEAD equals the branch tip you fetched — NOT origin/main.
#    If it's wrong, delete the instance and re-check the branch exists locally in repos/mj.

~/MJDev/bin/mjdev setup fls-test all      # heavy: deps → build → migrate; run ONE at a time
~/MJDev/bin/mjdev run fls-test api
```

### Baseline verification — DO THIS BEFORE IMPLEMENTING ANYTHING

The first clean-slate test of the FLS migration (local validation so far used an existing DB,
and the PG-parity situation is unresolved — see the decision record §1.1 correction):

1. `setup all` migrates from a clean DB — the FLS migration must apply cleanly.
2. Full build in the worktree; then the integration tier:
   `pnpm run test:integration` (expect 53/54 — `ai-providers.AIP1` Cohere failure is
   pre-existing and documented; anything else is new).
3. Package unit tests for `MJCore` and `SQLDialect` (the 67 + 38 FLS tests).
4. `~/MJDev/bin/mjdev e2e fls-test --check login` for a GUI smoke.

Record the baseline results before writing code, so inherited breakage is distinguishable from
introduced breakage.

### Working model during implementation

- **The instance worktree (`~/MJDev/instances/fls-test/mj`) is the branch's working home** —
  commit there for the fast loop (build → tests → API restart against the instance DB). The
  copy in `/Users/jordanfanapour/Documents/GitHub/MJ` is read-only reference until PR time
  (fetch back or push when a workstream completes). Never commit to both.
- **Test per workstream, not at the end** — each workstream's test list gates its own PR.
- Per-workstream extras the harness provides:
  - **A & C**: personas — `mjdev persona` / `use-persona` / `key` / `explorer-url` mint MJ
    users + API keys + logged-in Explorer sessions, i.e. restricted-vs-unrestricted FLS
    verification at the API and UI layers without manual auth setup.
  - **B**: the instance SQL Server (own port/DB) is the place to create custom SQL
    roles/users and verify column DENYs + reconciliation as real direct connections;
    `mjdev setup fls-test codegen` (use `--no-ai`) exercises the emission; `wipe-db` /
    `reapply-migrations` / `stage-test` give clean-state migration loops. Note a second known
    issue: workspace AI keys don't propagate to instance `.env` — irrelevant with `--no-ai`.
  - **Migration hygiene**: `setup all --prod` runs the real install path and surfaces
    non-self-contained migrations that dev setup masks — run it once before PR 1 goes up.
- Tool bugs go to `~/MJDev/MJDEV-ISSUES.md`; MJ-core bugs found while testing go to
  `~/MJDev/MJ-UPSTREAM.md` (and this plan / the decision record if FLS-relevant).

## Sequencing / PR map

| PR | Contents | Depends on |
|---|---|---|
| PR 1 | Phases 1–2 (already committed) + **Workstream A** | — (this branch) |
| PR 2 | **Workstream B** (CodeGen DB-tier + reconciliation + INFO log) | PR 1 merged |
| PR 3 | **Workstream C** (SELECT filtering + `fls:` segment) | PR 1 merged; independent of PR 2 |
| PR 4+ | **Workstream D**, phased (D-1 → D-2 → D-3, D-4 re-evaluation) | PR 1; supersedes A2 at D-2 |
