# Platform Suite — Metadata, Lifecycle and Background-Processing Bundles

This document describes the **platform / metadata / lifecycle / background-processing family** of MemberJunction's integration-test suite as it ships today: **17 bundles, 104 checks**, all registered in `@memberjunction/integration-test-suite` (`src/checks/*.checks.ts`) and dispatched through the metadata-driven `mj test` path (`MJ: Tests` records `.IT##-*.json` in `metadata-optional/integration-test/tests/integration/`). The family covers the platform's structural backbone — metadata ↔ physical-DB agreement, CodeGen artifact consistency, ClassFactory resolution, mj-sync parsing, application wiring, OpenApp teardown — and the background-processing stack — scheduled jobs, concurrency modes, the Actions pipeline, user routines, Remote Operations (in-process and over the wire), realtime deterministic seams, Predictive Studio stack seams, unified search, templates, and communication dry-run. Design ancestors are Domains **1, 5, 7, 9, 10, 12 and 13** of the candidate catalog ([./test-catalog.md](./test-catalog.md)); defects found while building these bundles are tracked in the bug register ([../../../../plans/integration-test-expansion/bug-register.md](../../../../plans/integration-test-expansion/bug-register.md)).

**How to run.** Seed the test metadata once per environment (`npx mj sync push --dir=metadata-optional/integration-test`), then:

```bash
# The whole deterministic tier (the CI gate) — includes every bundle in this family
npm run test:integration

# One suite
npx mj test suite "Integration Tests — Deterministic"

# One bundle while iterating (by its IT record name)
npx mj test run "IT24 - Metadata/DB Consistency Audit"
```

The per-bundle `tsx` dispatchers and `run-all.ts` aggregator were retired in the July 2026 restructure — `mj test` is the single entry path (see `packages/MJServer/integration-test-scripts/README.md` for the migration map).

## Family overview

Every bundle in this family belongs to the **"Integration Tests — Deterministic"** suite (none is in the Live Model suite). Tier gating follows `testing-integration/src/tiers.ts`: deterministic checks are ungated; the single mutation-tier check (`actions-pipeline.AP2`) requires `RUN_MUTATION_TESTS=1`; `predictive-studio.PS5` carries an *internal* live leg gated by `PS_INTEGRATION=1` (not a tier flag — the check runs either way, the sidecar leg is skipped without the env var). Transport is declared per IT record (`Configuration.transport`); client-transport members are sequenced late in the suite because `bootstrapIntegrationClient` rebinds the process's global provider to GraphQL.

| Bundle | Checks | IT record | Transport | Tier notes |
|---|---|---|---|---|
| `metadata-consistency` | 7 (MC1–MC6, MC8) | IT24 - Metadata/DB Consistency Audit | server (documented exception — `sys.*` has no client surface) | deterministic; declares `Platforms: ['sqlserver']`, so PostgreSQL reports an honest `Skipped` |
| `codegen-determinism` | 6 (CD1–CD6) | IT50 - CodeGen Artifact Consistency | client | deterministic; CD6 source legs skip outside the repo tree |
| `metadata-sync` | 9 (MS1–MS9) | IT49 - MetadataSync Parsing Contracts | server | deterministic; zero DB writes |
| `class-resolution` | 5 (CR1–CR5) | IT48 - ClassFactory Resolution Contracts | server | deterministic; read-only |
| `app-wiring` | 10 (AW1–AW10) | IT26 - Application Wiring (all shipped apps) | client | deterministic; read-only |
| `open-app-teardown` | 2 (OAT1–OAT2) | IT21 - Open-App Metadata Teardown | server (raw SQL via dialect) | deterministic; self-seeding lifecycle |
| `scheduled-jobs` | 2 (SJ1–SJ2) | IT09 - Scheduled Jobs Engine Lifecycle | server | deterministic |
| `scheduling-concurrency` | 3 (SC1–SC3) | IT41 - Scheduling Concurrency | server | deterministic |
| `actions-pipeline` | 5 (AP1–AP5) | IT39 - Actions Pipeline | server | deterministic except **AP2 (`RequiresMutation: true`)** |
| `user-routines` | 16 (UR1–UR16) | IT22 - User Routines Dispatcher | server | deterministic |
| `remote-operations` | 7 (RO1–RO7) | IT11 - Remote Operations (4th Data Primitive) | server (in-process provider dispatch) | deterministic |
| `remote-op-wire-progress` | 1 (WIRE1) | IT15 - Remote Operations Over-The-Wire Progress | client (needs live MJAPI; parked like IT03 until MJAPI is provisioned in CI) | deterministic |
| `realtime-deterministic` | 9 (RD1–RD9) | IT51 - Realtime Deterministic Seams | server | deterministic; several checks skip-as-pass loudly on unseeded slices |
| `predictive-studio` | 5 (PS1–PS5) | IT14 - Predictive Studio Stack Seams | server | deterministic; PS5 live-sidecar leg gated `PS_INTEGRATION=1` |
| `search` | 7 (SR1–SR7) | IT52 - Unified Search Seams | client | deterministic; SR7 skips off the Network transport |
| `templates` | 6 (TP1–TP6) | IT38 - Template Engine Rendering | server | deterministic |
| `communication` | 4 (CM1–CM4) | IT42 - Communication DryRun | server | deterministic; nothing ever leaves the process |

---

## 1. Metadata and CodeGen integrity

### 1.1 `metadata-consistency` (MC1–MC6, MC8) — IT24

**Machinery under test.** The agreement between MJ's entity-metadata cache and the *physical* SQL Server catalog: generated base views and CRUD procedures in `sys.objects`, CHECK-constraint value lists vs `EntityFieldValue` rows, CodeGen's `IDX_AUTO_MJ_FKEY_{Table}_{Column}` FK indexes, field `Sequence` integrity vs base-view column order, `MS_Description` extended properties, and `MJ: Schema Info` coverage/casing. This is the highest value-per-effort audit in the catalog (Domain 1) because CodeGen is *supposed* to keep all of it in lockstep — every red here means a migration was applied without CodeGen, or CodeGen itself misfired (which it demonstrably has: see B24/B26 below).

**Transport.** Server, by documented exception: `sys.objects` / `sys.check_constraints` / `sys.indexes` / `sys.columns` / `sys.extended_properties` have no GraphQL surface. The file header records the exception explicitly and notes the eventual Remote-Operation escape hatch was deliberately not built here.

**Platform.** SQL-Server-only, and now *declared* as such: the bundle registers `Platforms: ['sqlserver']`, so on PostgreSQL the driver reports the whole test as `Skipped` without invoking a single check body. Before #3257 it relied on `poolOrSkip()` returning null when `ctx.Pool` was undefined — which, it turns out, meant these checks **never executed in CI on either platform**: `ctx.Pool` comes from the active bootstrap context, and the `mj test` CLI did not publish one, so the pool was undefined on SQL Server too and every check skipped-as-pass. The CLI now publishes that context, so all seven registered checks (MC1–MC6 and MC8 — MC7 is deliberately unimplemented) genuinely run on SQL Server for the first time.

**Fixtures/lifecycle.** None. Zero fixtures, zero mutation, no lifecycle registered — every check is a pure SELECT plus the in-memory metadata cache. Each check sweeps *all* entities, aggregates offenders, and reports a count plus a bounded sample of 8.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `metadata-consistency.MC1` | every generated BaseView exists in sys.objects | for each non-virtual entity with `BaseViewGenerated=1`, `schema.BaseView` present in the `sys.objects` view set (case-insensitive) | a migration dropped/renamed a view without CodeGen re-running; a CodeGen run that wrote view DDL but never executed it |
| `metadata-consistency.MC2` | every generated spCreate/spUpdate/spDelete exists | for each entity with `Allow*API` + `sp*Generated`, the expected proc name (explicit or `spCreate{BaseTableCodeName}` convention) present in `sys.objects` | missing CRUD procs — every save/delete on that entity fails at runtime |
| `metadata-consistency.MC3` | CHECK-constraint value lists match EntityFieldValue rows | each column CHECK constraint that parses as a value list (parser mirrors CodeGen's `parseCheckConstraintValues`, N-literal normalized, nested/standard NULL forms) equals the field's `EntityFieldValues` after alphabetize+dedupe | a migration widened/narrowed a CHECK without CodeGen syncing `EntityFieldValue` — dropdowns and generated unions drift from what the DB accepts (the rule-2c bug class at its source) |
| `metadata-consistency.MC4` | every FK column has its IDX_AUTO_MJ_FKEY index | for each physical FK field (`RelatedEntity` non-empty, not virtual), `IDX_AUTO_MJ_FKEY_{BaseTableCodeName}_{CodeName}` (truncated to 128) present in `sys.indexes` | CodeGen emitting index DDL that never executes — FK joins/filters degrade to scans |
| `metadata-consistency.MC5` | field sequences gapless from 1 + match base-view column order | per entity: no duplicate `Sequence`, gapless 1..N; then positional agreement between Sequence-ordered field names and the base view's physical `column_id` order (order leg only when the sequence is sound and a real view exists) | sequence corruption from partial CodeGen runs; a regenerated view whose column order no longer matches metadata (breaks positional consumers) |
| `metadata-consistency.MC6` | every core-schema physical field carries an MS_Description | for core-schema (`ctx.Schema ?? '__mj'`) describable fields (excluding virtual, `__mj_` system, PKs and FKs — the exact `migrations/CLAUDE.md` exemption), a description exists in metadata OR as a physical `MS_Description`; **ratchet: offender count `<= MC6_DEBT_CEILING = 270`**, non-core schemas reported informationally, never gated | a NEW column shipped without `sp_addextendedproperty` (the count rising past the ceiling fails the build; the 270-column legacy debt does not) |
| `metadata-consistency.MC8` | SchemaInfo covers every entity schema with casing-correct names | every entity schema physically exists in `sys.schemas`, has an `MJ: Schema Info` row, metadata casing matches physical casing, and `CanonicalSchemaName` — *when set* — names the same schema (NULL is legitimate and NOT asserted: it means fall-back-to-SchemaName, which is every SQL Server install) | the PG lowercase-folding bug class from the POSTGRES_SCHEMA_CASING_GUIDE — a CanonicalSchemaName pointing at a different schema, or an unregistered schema |

**Pinned gaps, ratchets, and bug-register cross-references.**

- **MC4 / B24** — the first live run (2026-07-19, MJ_5_48_0) found **6 FK columns missing their index** (`TemplateCategory.ParentID`/`.UserID`, `TemplateContent.TemplateID`/`.TypeID`, `CompanyIntegration.ScheduledJobID`, `CompanyIntegrationRun.ScheduledJobRunID`), independently confirmed against `sys.indexes`. MC4 was **red** on that run; the backfill migration `V202607191254__v5.49.x__Backfill_Missing_FK_Auto_Indexes.sql` is now in `migrations/v5/`, so MC4 is **green on any database where that migration has been applied** (the bug-register row's "currently RED" wording predates the migration landing in-tree).
- **B26 (root cause, DECIDE/architecture, open)** — CodeGen *writes* DDL for unchanged entities but never *executes* it: `logSQLForNewOrModifiedEntity` only runs for changed entities, and the combined `_all_entities.sql` only executes when *nothing* changed, so DDL added to a generator after an entity stopped changing silently never lands and re-running CodeGen cannot heal it. MC4 catches the symptom; the cause needs an execute-vs-log separation (deliberately not fixed in PR #3196 — see the register for why `forceLog` has fused side effects, and the PG-parity note: PostgreSQL never executes index DDL during codegen at all).
- **B27 (latent)** — `autoIndexForeignKeys()` defaults to `false` and is commented out in `distribution.config.cjs`; a distribution-config CodeGen run would emit no FK-index SQL at all. MC4 would catch the resulting drift.
- **B28 (latent, FIX-NOW)** — the SQL Server FK-index generator lacks the `!IsPrimaryKey && !IsVirtual` field filter the PG generator has, so a virtual FK field on a non-virtual entity would produce `CREATE INDEX` on a nonexistent column. MC4's `indexableForeignKeys()` filter (`!f.IsVirtual`) deliberately mirrors what CodeGen *should* index.
- **B29 (architecture)** — the FK-index logic is duplicated per dialect provider instead of shared as a template method in the base; MC4 is dialect-aware but only exercises the SQL Server side today.
- **MC6 / B25** — the ratchet ceiling `MC6_DEBT_CEILING = 270` locks the 2026-07-19 measured debt (raw count was 1003 until PK/FK columns were correctly exempted). Lower it as descriptions land; **never raise it** — the file's own comment calls raising it out.
- **MC7 — deliberately NOT written** (bug-register coverage caveat): a DriverClass ↔ ClassFactory resolution check cannot distinguish "bad metadata" from "provider package not loaded in this process" (`server-bootstrap-lite` deliberately excludes several provider packages, and ClassFactory exposes no all-registrations accessor). It was left unwritten rather than faked; the file header and IT24's description both record this.

### 1.2 `codegen-determinism` (CD1–CD6) — IT50

**Machinery under test.** The internal consistency of the *existing* generated artifacts without running CodeGen: every live core-schema entity must have a `@RegisterClass(BaseEntity, '<Entity Name>')` registration, a `<ClassName>Entity` class export and a `<ClassName>Schema` Zod schema in `@memberjunction/core-entities` whose shape agrees field-for-field with live metadata — including the CHECK-constraint value-list unions (the rule-2c drift class MC3 checks at the DB end; CD4 checks at the TypeScript end). The reverse direction (stale generated pairs with no live entity) is asserted too. Because the live metadata comes from the same database CodeGen last ran against, any red means schema/codegen drift — a migration applied without re-running CodeGen.

**Transport.** IT50 declares **client** transport (the checks read metadata through the run's provider plus module exports; nothing needs raw SQL). Zod is deliberately *not* imported — schemas are inspected through structural duck-types (`shape` + `safeParse`) so the bundle does not couple to core-entities' zod version. CD6's source-tree legs walk up from cwd to find the repo root and **skip loudly** when not run inside the MJ repo.

**Fixtures/lifecycle.** None — read-only, no lifecycle. Anti-vacuity floors throughout: `coreEntities()` asserts >100 core entities, CD3 asserts >1000 compared fields, CD4 asserts >50 value-list fields, CD5 asserts at least one generated pair per entity.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `codegen-determinism.CD1` | every core entity has a ClassFactory BaseEntity registration | `GetRegistration(BaseEntity, e.Name)` exists and its `SubClass.prototype instanceof BaseEntity`, for all core entities | an entity added by migration whose generated registration never shipped — `GetEntityObject` falls back to raw `BaseEntity` at runtime |
| `codegen-determinism.CD2` | every ClassName maps to exported `<ClassName>Entity` + `<ClassName>Schema` | both exports exist per entity; a mapping-convention precondition is pinned on `MJ: Users` first so a convention change fails with one clear message, not 300 misses; empty `ClassName` is itself an offense (POSTGRES_SCHEMA_CASING_GUIDE) | missing/renamed generated artifacts; the PG lowercase-ClassName break |
| `codegen-determinism.CD3` | zod schema shapes agree field-for-field with live metadata | every live field `CodeName` has a schema key (accounting for the `Config` → `Config_` BaseEntity-collision suffix) and every schema key maps back to a live field | CodeGen behind the DB (missing keys) or the DB behind the artifacts (stale keys) |
| `codegen-determinism.CD4` | value-list fields: every live CHECK value parses, a bogus value is rejected | for strict `ValueListType='List'` string fields: each `EntityFieldValue.Value` passes `safeParse`, and the sentinel `__MJ_IT_BOGUS_VALUE__` is rejected (proving a union was actually generated, not an open string) | the rule-2c drift class — a CHECK widened without regenerating the union, or a union silently degenerating to `z.string()` |
| `codegen-determinism.CD5` | no orphaned generated schema/class pairs | every `MJ*Schema` export with a matching BaseEntity-subclass `*Entity` export maps back to a live core entity by ClassName | an entity deleted from the DB whose artifacts were never regenerated away |
| `codegen-determinism.CD6` | generated source markers + registration-count parity | `loadModule` tree-shaking anchor exported and callable; `entity_subclasses.ts` carries the anchor; `@RegisterClass(BaseEntity, '` occurrence count in the checked-in file **equals** the live core-entity count; `remote_operations.ts` carries the GENERATED CODE banner | the checked-in generated file and the DB being out of step in either direction; loss of the tree-shaking anchor the bootstraps rely on |

### 1.3 `metadata-sync` (MS1–MS9) — IT49

**Machinery under test.** The mj-sync seams *without ever pushing* (Domain 9): `SyncEngine.processFieldValue`'s `@lookup` / `@parent` / `@root` / `@file` / `@env` reference-parsing contracts, real `@lookup` resolution over the live provider (single-field, compound, case-insensitive — catalog MT3, the PG `LOWER()` seam), validate-only `ValidationService.validateDirectory` against the shipped `metadata-optional/integration-test` tree, and the donor-cache delegation rules of `SyncMetadataEngine.delegateEntityIfCached` driven by **real** `BaseEngine` donors loaded through the run's provider (two throwaway donor engine classes defined in the check file itself — one qualifying unfiltered/unordered, one disqualified by `OrderBy`).

**Transport.** Server (IT49). **Zero database writes** — lookups and validation are reads, the `@parent`/`@root` fixture BaseEntity records are never saved, `@file` uses an OS temp dir removed in a `finally`, `@env` sets and deletes its own env var. No lifecycle registered. The two donor engines stay registered for the process lifetime (harmless: two tiny static lookup tables, true to how real donors behave).

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `metadata-sync.MS1` | LANDMINE PIN — a `@lookup` VALUE containing ` & ` is rejected | `@lookup:MJ: Entities.Name=Sales & Marketing` throws `Invalid lookup field format` (the compound parser splits unconditionally on `&`, no escaping); emits a loud `PRODUCT NOTE` console.warn | either direction of drift: a future escape-syntax fix (update the pin) or a silent regression that resolves against the truncated `Sales` value. The warn also records that `ValidationService.parseReference` **silently drops** the fragment — validation passes files the runtime parser rejects at push time |
| `metadata-sync.MS2` | single-field `@lookup` resolves a real row | `@lookup:MJ: Entities.Name=MJ: Users` resolves to the `MJ: Users` entity ID (`UUIDsEqual`) | lookup resolution broken against the live provider |
| `metadata-sync.MS3` | `@lookup` value matching is case-insensitive | the case-mangled value `mj: users` resolves to the same row | the per-dialect `LOWER()` lookup seam regressing (would break PG pushes and CI-collation SQL Server) |
| `metadata-sync.MS4` | compound `@lookup` (`A=1&B=2`) resolves | `@lookup:MJ: Entities.SchemaName=<schema>&Name=MJ: Users` resolves correctly, proving `&` is the structural separator | compound-lookup parsing/resolution regression |
| `metadata-sync.MS5` | non-keyword `@`-strings pass through; `@env` round-trips; non-strings as-is | `@mui/material` and plain strings verbatim; numeric input returns a number; `@env:<set var>` resolves; `@env:<missing>` rejects with a message | the classic npm-scope false positive; env resolution breakage |
| `metadata-sync.MS6` | `@parent`/`@root` require a record and read through `BaseEntity.Get` | orphan `@parent:`/`@root:` reject naming themselves; against a real never-saved `MJ: Query Categories` entity both resolve the field value | parent/root context threading regression (zero writes — the record is never saved) |
| `metadata-sync.MS7` | `@file` resolves relative to baseDir; missing file rejects | round-trips a temp file's exact text; missing file rejects with `File not found` | `@file` base-directory resolution drift |
| `metadata-sync.MS8` | validate-only ValidationService passes the shipped integration-test tree | `validateDirectory(metadata-optional/integration-test)` visits >0 files (anti-vacuity) and reports `isValid` with zero errors; **skips loudly** when run outside the repo | the shipped seed tree going invalid, or validator config/filePattern drift making it vacuous |
| `metadata-sync.MS9` | donor-cache delegation vetting rules | after loading both real donors: `FindCachedEntity`/`TryGetCachedRecords` discover the qualifying donor with real BaseEntity rows; `delegateEntityIfCached` **accepts** the unfiltered/unordered donor (and records it in the delegation summary), **refuses** the OrderBy donor (leg conditionally skipped with a warn if another loaded engine legitimately qualifies), and returns `false` for a dynamically-chosen no-donor entity (candidate list probed so a future engine cannot silently make the leg vacuous) | the CLAUDE.md "Check the Registry Before You Query" vetting rules regressing — delegating to an ordered donor whose arrays get reassigned mid-push |

---

## 2. Class resolution

### 2.1 `class-resolution` (CR1–CR5) — IT48

**Machinery under test.** The ClassFactory resolution contract over the registry a **real bootstrapped process** actually builds (Domain 2, catalog CD10) — generated + extended entity registrations from `@memberjunction/core-entities`, permission-provider registrations, and the marker-bearing bases (`@RequiresSubclass`, `@OptionalKeyedSpecialization`) — reached through the same call paths production uses (`provider.GetEntityObject`, EntityField hydration). Unit tests cover the factory mechanics against synthetic classes; this bundle covers the live registry. It directly guards the B34/B35/B47 family of bugs (base-class-fallback stubs installed as live providers; false-positive fallback warnings on the designed EntityField probe).

**Transport.** Server (IT48). **Fixtures.** None — entirely read-only, no lifecycle; uses a per-process `NEVER_REGISTERED_KEY` and a local unmarked probe base class. CR5 captures `console.warn`/`console.error` in a try/finally to assert reporter behavior.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `class-resolution.CR1` | known entities resolve to registered extended subclasses through the real provider | `GetEntityObject` for `MJ: User Views`/`MJ: Queries`/`MJ: Dashboards` returns instances of `MJUserViewEntityExtended`/`MJQueryEntityExtended`/`MJDashboardEntityExtended` (descendants allowed — a server `*EntityServer` on top still passes); the registry's winning registration for the key **is** the class the provider built | extended-subclass registrations lost to tree-shaking or ordering — custom business logic silently bypassed |
| `class-resolution.CR2` | a generated-only entity is a key HIT, not a fallback | `TryCreateInstance(BaseEntity, 'MJ: Action Categories')` reports `Resolved: true`, instance is (a descendant of) `MJActionCategoryEntity`, no `Reason` | the generated tier degrading to the fallback path (would mask CR1-class losses) |
| `class-resolution.CR3` | key-miss on an unmarked base falls back to the base class without throwing | `TryCreateInstance` with a never-registered key: `Resolved: false`, instance is `BaseEntity` **itself** (constructor name pinned — not another key's registration leaking in), `Reason` includes `no registration found`; `CreateInstance` does not throw | the long-standing fallback contract BaseEntity relies on flipping closed — or, worse, a missed key being served a different key's class |
| `class-resolution.CR4` | `@RequiresSubclass` bases hard-fail on a miss; marker does not leak | positive control first (`MJEntityPermissionProvider` resolves, `DomainName === 'Entity Permissions'`, marker NOT present on the concrete subclass — own-property contract); miss: `TryCreateInstance` → `{Resolved: false, Instance: null}` with a `RequiresSubclass` reason; `CreateInstance` **throws** with `CANNOT be used as a fallback` | the B34 hole — a method-less abstract stub installed as a live provider; or a leaked marker making every resolved provider throw |
| `class-resolution.CR5` | the EntityField `@OptionalKeyedSpecialization` probe stays silent on a miss — while an unmarked miss still warns | anti-vacuity control: an unmarked-base keyed miss produces the fallback WARNING (reporter provably alive, fresh base + fresh key to dodge the cap/dedup); the `<Entity>.<Field>` probe key falls back to a functional `EntityField` with **zero** ClassFactory noise; a full hydration (`NewRecord()` builds one EntityField per metadata field) is equally silent | the B47 regression in either direction: the reporter false-positiving on the designed per-field probe (a console firehose in every real process) or the reporter dying entirely (verified suppression vs dead logger) |

---

## 3. Applications and OpenApp lifecycle

### 3.1 `app-wiring` (AW1–AW10) — IT26

**Machinery under test.** The "every shipped app is wired correctly" contract (Domain 12, catalog rows G1–G9, S1, S2, S7) asserted **over the real GraphQL wire** (client-first transport). Every check parameterizes over *all* applications in metadata rather than naming apps, so new apps inherit the contract automatically. The value is lock-in (all 77 DriverClass refs currently resolve, zero collisions) plus four latent risks flagged in the bug register: DriverClass collision (**B20**, risk #1), DefaultSequence conflicts (**B21**), write-only slug uniqueness (**B22**), and nav-item drift.

**Transport.** Client (IT26). **Fixtures.** None — read-only, no lifecycle. Anti-vacuity discipline is explicit: every check that iterates a collection first asserts the collection is non-empty (`loadApps` floors at >0 rows); checks whose subject can legitimately be absent (Application Roles, Settings, AgentSettings, non-Active apps) log an honest skip-as-pass.

**Tier.** All deterministic.

| Id | Name (catalog row) | Asserted observable | Failure it catches |
|---|---|---|---|
| `app-wiring.AW1` | G1: every Application row loads; provider cache matches the table | exact two-way ID parity between the `MJ: Applications` table read and `ctx.Provider.Applications` (UUIDs normalized for SS/PG casing) | metadata-cache drift — apps in the table missing from the provider, or stale ghosts in the cache |
| `app-wiring.AW2` | G2: DefaultNavItems is valid JSON, every item well-formed | for every (Active app, nav item) pair: parseable JSON array, `Label` and `ResourceType` non-empty, `DriverClass` present when `ResourceType='Custom'` | malformed nav JSON or a Custom tab with no component to load — a dead tab in the shell |
| `app-wiring.AW3` | G3: exactly one isDefault tab per nav-bearing Active app | `items.filter(isDefault === true).length === 1` per app | zero-default (app opens nowhere) or multi-default (ambiguous landing tab) |
| `app-wiring.AW4` | G4: DriverClass values non-empty and globally unique | across all Custom nav items of Active apps: no empty DriverClass, no case-insensitive duplicates | **B20** — generic single-word DriverClass keys colliding (ClassFactory last-registration-wins would render the wrong component in one of the apps) |
| `app-wiring.AW5` | G6: non-null application Paths globally unique | case-insensitive uniqueness over trimmed non-empty `Path` values | **B22** — slug uniqueness is enforced only at write time (`ensureUniqueSlug`), not as a stored invariant; this is the stored-state guard |
| `app-wiring.AW6` | G7: every Application-Entities join row resolves both ends | every `MJ: Application Entities` row's `ApplicationID` in the app set and `EntityID` in the provider's entity set | orphaned join rows after app/entity removal — phantom entity tabs |
| `app-wiring.AW7` | G8: Application Roles resolve; CanAdmin implies CanAccess | every role row's ApplicationID resolves, RoleID non-empty, and no grant sets `CanAdmin` without `CanAccess`; honest skip when zero role rows configured | dangling grants and the incoherent admin-without-access privilege shape |
| `app-wiring.AW8` | G9: app-scoped Application Settings point at real apps | every non-null `ApplicationID` on a setting resolves (null = global setting, valid) | orphaned settings silently never applying |
| `app-wiring.AW9` | S1/S2: AgentSettings DefaultAgentID + RelevantAgents resolve | for every app with parseable `AgentSettings`: `DefaultAgentID` and every `RelevantAgents[].AgentID` exist in `MJ: AI Agents` | the default-agent resolution chain dead-ending — an app whose chat surface cannot resolve its agent |
| `app-wiring.AW10` | S7: non-Active apps never fan out to new users | no Deprecated/Disabled/Pending app has `DefaultForNewUser === true`; the Active filter returns only Active apps | a retired app still being handed to every new user |

**Pinned gaps and adjacent guards.**

- **G5 is a static CI gate, not a wire check** (bug-register coverage caveat): the `@RegisterClass(BaseResourceComponent, 'X')` registrations live in Angular bundles the server cannot observe, so the DriverClass-registration half ships as `.github/scripts/check-driverclass-registrations.sh`. AW4 covers the metadata half (non-empty + globally unique — 77/77 distinct measured at authoring).
- **B21 (DefaultSequence collisions) is NOT covered here** — the catalog's S3/S4 legs are mutation-tier (fan-out to a throwaway user / DfNU flip) and have not shipped; AW10 covers only the S7 exclusion contract. B21 remains a GUARD-disposition open item.
- **B23 (OpenApp reinstall idempotency / CanonicalSchemaName binding, catalog O1/O2)** — partially covered by the `open-app-teardown` bundle below (the reinstall-PK leg); the full install→remove→reinstall graph (O1) and post-install CanonicalSchemaName check (O2) are unshipped catalog candidates. MC8 covers the CanonicalSchemaName *coherence* half generically.

### 3.2 `open-app-teardown` (OAT1–OAT2) — IT21

**Machinery under test.** The Open-App metadata teardown seam: the exported `RemoveAppEntityMetadata` (the `mj app remove` code path) driven against the exact scenario the OpenApp PR proved — a *used* app whose entity has an orphaned `RecordChange` (a NOT-NULL FK into `__mj.Entity` that the old hardcoded-list teardown under-deleted) plus a link-less, fixed-GUID nav Application (the Solution 2 declared-id path). Graduated verbatim from the old `open-app-teardown-tests.ts`.

**Transport.** Server only — the seed and assertions are raw SQL through the provider's `Dialect` (`QuoteSchema`/`QuoteStringLiteral`/`ExecuteSQL`), and `RemoveAppEntityMetadata` takes the `DatabaseProviderBase` directly.

**Fixtures/lifecycle.** A registered `BundleLifecycle`: Setup seeds `SchemaInfo` + `Entity` + `EntityField` + the blocking `RecordChange` + the link-less `Application` (all IDs pre-generated and published to `ctx.OpenAppTeardownFixture` **before the first INSERT**, so a mid-Setup crash still gives the idempotent Teardown every ID); Teardown best-effort deletes children-before-parents.

**Tier.** Both deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `open-app-teardown.OAT1` | FK-graph teardown clears all metadata incl. the blocking RecordChange | after `RemoveAppEntityMetadata(AppSchema, …, {DeclaredApplicationIds})` returns Success: zero `Entity`, `EntityField`, `RecordChange` (the row the old hardcoded list missed) and `SchemaInfo` rows for the app | the FK-graph cascade regressing to the under-deleting hardcoded list — teardown left blocked by a RecordChange FK |
| `open-app-teardown.OAT2` | link-less Application removed; same-GUID re-create has no PK collision | the declared Application row is gone; re-INSERTing the **same fixed GUID** succeeds (would throw on `PK_Application` collision) and reads back | the reinstall path (B23-adjacent) breaking — a migration-declared app surviving teardown and colliding on reinstall |

---

## 4. Scheduling, Actions and Routines

### 4.1 `scheduled-jobs` (SJ1–SJ2) — IT09

**Machinery under test.** The Scheduled Jobs engine's run lifecycle + distributed lease through `SchedulingEngine.Instance.ExecuteScheduledJob` (the direct-execution path; the polling path is the sibling bundle below). The fixture job points its `Run Record Process` driver at a **missing** Record Process so the driver fails fast and deterministically — the engine's lease/run-lifecycle/stats contract is identical on success or failure, so no LLM or long work is needed.

**Transport.** Server. **Fixtures/lifecycle.** Lifecycle creates one `MJ: Scheduled Jobs` row (`mj-integration-test-job (safe to delete)`, cron `0 * * * * *`, `ConcurrencyMode='Skip'`); the fixture handle is published immediately after the save so a crash in the subsequent `Config` refresh can never orphan it; Teardown deletes the runs (FK) then the job.

**Tier.** Both deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `scheduled-jobs.SJ1` | ExecuteScheduledJob persists a terminal run + increments job stats | a `MJ: Scheduled Job Runs` row exists with terminal `Status` and `CompletedAt`; reloaded job has `RunCount === 1` and `LastRunAt` set | runs orphaned non-terminal; stats sproc not firing |
| `scheduled-jobs.SJ2` | the distributed lock is released; the job is immediately re-runnable | after the run: `LockToken` and `ExpectedCompletionAt` (the lease) both null; a second execution reaches terminal and bumps `RunCount` to 2 with the lock released again | a leaked lease permanently wedging the job — the exact failure a distributed scheduler cannot self-diagnose |

### 4.2 `scheduling-concurrency` (SC1–SC3) — IT41

**Machinery under test.** Engine-level `ConcurrencyMode` semantics through the *polling* path `ExecuteScheduledJobs` under a **held foreign lock** (Domain 5) — the legs `scheduled-jobs` does not cover. The atomic lock sprocs are the thing under test; there is no client surface for the poll path. Isolation is by archaic time: the fixture job's `NextRunAt` is pinned to 2001-01-01 and every poll evaluates at 2001-01-02 — no real job in any deployment can be due then, so the poll can only ever match the fixture. "Another holder is running" is simulated by writing a foreign `LockToken` + a 10-minutes-out `ExpectedCompletionAt` directly onto the job row; `spAcquireScheduledJobLock`'s WHERE clause then refuses acquisition exactly as it would against a live holder.

**Transport.** Server. **Fixtures/lifecycle.** Lifecycle creates one job (Skip mode, `NextRunAt=2001-01-01`, missing Record Process for fast deterministic failure), publishes the fixture handle before the Config refresh; Teardown sweeps runs then the job. **The fixture lives in module state, not a typed `IntegrationCheckContext` slot** — a deliberate contract-neutral choice documented in the header (same-process for both front-ends). The three checks are **ordered and share lock state**: SC1 installs the foreign lock, SC2/SC3 re-assert it is still held and fresh before proceeding.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `scheduling-concurrency.SC1` | Skip: a due-but-locked job is skipped | after the poll: no run returned for the job, zero persisted run rows, `RunCount` 0, and the **foreign** LockToken untouched | Skip mode executing anyway, or the engine stealing/releasing a lock it never held |
| `scheduling-concurrency.SC2` | Queue: the queue-event run is TERMINAL on creation (**B8 fix pin**) | exactly one queue event returned; its run has `Status='Cancelled'` (explicitly `!== 'Running'`), `QueuedAt` and `CompletedAt` set, `Success=false`, an `ErrorMessage` naming `ConcurrencyMode=Queue`; the DB row agrees; `RunCount` still 0 (a queue event is not an execution) | **bug register B8** — `createQueuedJobRun` used to write `Status='Running'` with no drainer anywhere, so every Queue-mode contention produced an orphaned-Running-forever run. The fix terminalizes on creation; the check body carries an explicit banner that this pin MUST be updated together with `createQueuedJobRun` if a real drainer ever ships |
| `scheduling-concurrency.SC3` | Concurrent: the SAME due job under the SAME held lock executes (positive control) | one run returned, terminal, `CompletedAt` set, **no** `QueuedAt`; run-row count grew by exactly 1; `RunCount === 1`; `NextRunAt` advanced past the eval time; the foreign lock is **still** held (Concurrent acquired no lock, so its finally must not release one) | Concurrent mode blocking on a lock it does not need; the finally releasing a foreign holder's lock. SC3 is also the anti-vacuity proof that SC1/SC2's "nothing happened" was real: identical evalTime and lock state, only the mode differs |

### 4.3 `actions-pipeline` (AP1–AP5) — IT39

**Machinery under test.** The ActionEngine execution pipeline in-process through `ActionEngineServer.Instance` (Domain 5, catalog rows AP6/AP7/AP8 plus a metadata-integrity leg) — the exact code path agents and routines invoke server-side (there is no client-side RunAction wire today). The executable fixture is the pure-computation core action **`Calculate Expression`** (DriverClass `__CalculateExpression`): no LLM, no network, no side effects beyond the `MJ: Action Execution Logs` rows the engine itself writes.

> Note: this bundle was not explicitly assigned to a documentation family in the task plan; it is documented here with the background-processing bundles, which is where its Domain-5 catalog ancestry places it.

**Transport.** Server. **Fixtures/lifecycle.** Lifecycle resolves (never mutates) the core `Calculate Expression` action; module-state fixture (documented contract-neutral choice, same as `scheduling-concurrency`) tracks every execution-log ID **immediately** on creation so a failing assertion can never orphan a row; Teardown settles 1.5s (the log INSERT/UPDATE ride the fire-and-forget `BaseEntitySaveQueue`) then deletes tracked logs in reverse order.

**Tier.** Deterministic, **except AP2 which is `RequiresMutation: true`** — it only fires when `RUN_MUTATION_TESTS=1` (mutation checks live inside the deterministic suite and are gated at runtime by the driver, per the suite description).

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `actions-pipeline.AP1` | action metadata coherent — unique result codes / param names per Active action; fixture contract intact | engine caches non-empty (anti-vacuity); for every Active action: result codes unique after trim+lowercase (because `InternalRunAction` resolves the returned code case-insensitively — duplicates make resolution ambiguous), none blank, param names unique; the fixture action declares its required `Expression` Input param + `SUCCESS`/`INVALID_EXPRESSION`/`MISSING_PARAMETERS` codes. **Known-offender exception (B51):** `KNOWN_DUPLICATE_RESULT_CODE_ACTIONS = {'computer use'}` — the shipped `Computer Use` action carries a duplicate `Error` result code; fixing means deleting a metadata row (barred under the authoring session's no-destructive-DB constraint), so that one action **warns loudly** while the check stays strict for every other action — no NEW duplicates can ship | ambiguous result-code resolution; broken by-name param lookup; fixture-contract drift that would invalidate AP2/AP3 |
| `actions-pipeline.AP2` (MUT) | RunAction resolves the result-code entity and writes a complete terminal execution log | `Success` true; `result.Result` resolves to the action's own `SUCCESS` metadata row (right ActionID); computed value of `(2*3) + 4/8` is exactly `6.5` (proves real execution, not a stub); the fire-and-forget log row is polled to land AND finalize (≤15s), then `verifyActionLog` asserts `EndedAt`/`ResultCode`, plus ActionID/UserID stamps and the Params JSON echoing the input | dropped/duplicate log writes on the fire-and-forget queue; result-code entity resolution regressing; catalog AP6/AP7 seam |
| `actions-pipeline.AP3` | bad inputs come back as structured per-action result codes; SkipActionLog writes nothing | zero params → `MISSING_PARAMETERS`; `process.exit(0)` expression → `INVALID_EXPRESSION`; both structured (no throw), both with `LogEntry == null` under `skipLog` | validation failures escaping as throws; SkipActionLog leaking audit rows |
| `actions-pipeline.AP4` | KNOWN-GAP PIN (**B14**): base `ValidateInputs`/`RunSingleFilter` are no-op stubs | a zero-param call with a garbage (blank, unsaved) `MJ: Action Filters` entity attached sails through BOTH engine stubs — the engine's own `Input validation failed` sentinel is **absent** — and the refusal that comes back is the ACTION's own `MISSING_PARAMETERS` | drift in either direction on **bug register B14** (verified still present 2026-07-21 against `ActionEngine.ts` ~280/~303, including the unreachable filters-failed fall-through corollary). If the stubs are ever implemented, this check MUST flip together with B14's disposition — the banner in the check body says so |
| `actions-pipeline.AP5` | an unresolvable DriverClass yields a structured failure, never an escaped throw | an in-memory-only ghost action with DriverClass `__MJIntegrationTestNoSuchDriverClass` (never saved — no FK rows; `SkipActionLog` because a log row would violate the ActionID FK): `Success` false, message contains `Could not find a class for action`, no result-code entity resolves | a ClassFactory miss crashing the pipeline instead of being contained |

### 4.4 `user-routines` (UR1–UR16) — IT22

**Machinery under test.** The User Routines feature (P1.5) end to end against the real DB: the `MJUserRoutineEntity`/`MJUserRoutineRecipientEntity` **entity servers** (NextRunAt computation, activation-window flooring, cron validation, recipient grantee exclusivity), the pure schedule/eligibility functions (`IsRoutineDue`, `BuildDueRoutineFilter` — asserted to *agree* between JS and the SQL prefilter), and the **`UserRoutineDispatcherDriver`** full pass (seed, claim-by-advancing-NextRunAt, execute-as-owner, result-hash/OnChange suppression, in-app notification, cascade delete, routine conversations). Graduated verbatim from `user-routines-tests.ts`. No LLM — the executable target is the `Calculate Expression` core action.

**Transport.** Server (raw-SQL legs use `ExecuteSQL`/`MJCoreSchemaName`; the dispatcher is invoked in-process with a fabricated, never-saved `ScheduledJobExecutionContext`). **Fixtures/lifecycle.** `ctx.UserRoutinesFixture` — Setup resolves the Calc action ID; checks create their own routines through `makeRoutine` (every ID tracked); the checks are **ordered and stateful**: UR9 creates the due/future/sunset trio, UR10/UR11 run and assert the due one, UR13 re-arms it OnChange, UR14 deletes it. Teardown removes notifications (direct SQL — even Owner users lack entity-API Delete on `MJ: User Notifications`), runs, action logs, recipients, routines, then conversations (FK order), best-effort.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `user-routines.UR1` | Save computes NextRunAt from cron when not set | computed `NextRunAt` non-null, in the future, top-of-hour for the hourly cron | entity server not seeding the schedule — routine never becomes due |
| `user-routines.UR2` | Save floors NextRunAt at a future StartAt | `NextRunAt >= StartAt` for a +24h activation window | routines firing before their activation window |
| `user-routines.UR3` | Save respects an explicitly-set NextRunAt | an explicit past NextRunAt survives the save within 1s | the save path clobbering the dispatcher's claim bookkeeping (the claim contract) |
| `user-routines.UR4` | Save REJECTS an invalid cron expression | `Save()` returns false for `'definitely not a cron'` | garbage schedules persisting and wedging the dispatcher |
| `user-routines.UR5` | Save REJECTS TargetType without TargetID | `Save()` false when `TargetType='Action'` but no TargetID | untargetable routines persisting |
| `user-routines.UR6` | Recipient rejects BOTH UserID and Email | `Save()` false; failure message mentions the exclusivity rule | the grantee-exclusivity invariant (User xor Email) regressing |
| `user-routines.UR7` | Recipient rejects NEITHER set | `Save()` false with no grantee at all | ghost recipients |
| `user-routines.UR8` | Recipient accepts exactly one grantee | a UserID-only recipient with Channel + Sequence saves | the validator over-rejecting the legitimate shape |
| `user-routines.UR9` | JS due-evaluation + SQL prefilter agree on window edges | `IsRoutineDue` true for past-NextRunAt Active, false before StartAt and past EndAt; `BuildDueRoutineFilter(now)` as a RunView `ExtraFilter` includes/excludes the exact same three fixtures | the save-path and dispatcher disagreeing about due-ness — the shared-schedule-math contract (`UserRoutineProcessor`) splitting |
| `user-routines.UR10` | dispatcher pass — seeds NULL-NextRunAt (computed, NOT run) and executes the due routine | after `driver.Execute`: `RoutinesSeeded >= 1` and `RoutinesRun >= 1`; the SQL-nulled legacy routine gets a future NextRunAt and **zero** run rows; future-StartAt and sunset routines produced zero runs | the seeding path executing instead of seeding; window edges ignored by the real sweep |
| `user-routines.UR11` | run row carries linkage + hash; routine rolls up LastRun* (claimed forward) | exactly one run: `Status='Success'`, `CompletedAt`, linked `ActionExecutionLogID` (verified terminal via `verifyActionLog`), `ResultSummary` contains `42`, `ResultHash` is a sha256 hex; routine back-read: `LastRunAt`/`LastRunStatus='Success'`/`LastResultHash` matching, `NextRunAt` advanced past now | linkage-only telemetry breaking (orphaned action logs); the claim-before-run not advancing NextRunAt (double execution risk) |
| `user-routines.UR12` | owner received an in-app notification | exactly one `MJ: User Notifications` row whose `ResourceConfiguration` carries the run ID; title carries the routine name | NotifyCondition=Always silently not notifying |
| `user-routines.UR13` | OnChange — identical result on a second pass produces NO new notification | after reload + re-arm (`NotifyCondition='OnChange'`): a second run row with identical `ResultHash`, `NotificationSent=false`, zero notification rows for it (the reload-first comment pins that saving a stale entity would clobber the dispatcher's bookkeeping) | OnChange hash suppression regressing — notification spam on unchanged results |
| `user-routines.UR14` | deleting a run-bearing routine cascades bookkeeping in one Delete() | with ≥2 run rows behind an FK: `Delete()` succeeds, run rows gone, routine row gone — while the **linked Action Execution Logs survive** (that is where the real telemetry lives) | the pre-cascade FK failure this entity server was built to fix; or an over-eager cascade destroying execution telemetry |
| `user-routines.UR15` | EnsureRoutineConversation creates a hidden, Application-scoped conversation | conversation created, `ConversationID` persisted on the routine; conversation is `ApplicationScope='Application'` with a bound ApplicationID (`CK_Conversation_ScopeAppBinding`), `Type='Routine'`, owned by the routine owner, `LinkedRecordID` back to the routine | routine conversations leaking into the default chat list, or losing their record linkage |
| `user-routines.UR16` | EnsureRoutineConversation is idempotent | the second call returns the SAME conversation ID | duplicate hidden conversations accumulating per dispatcher pass |

---

## 5. Remote Operations

### 5.1 `remote-operations` (RO1–RO7) — IT11

**Machinery under test.** The Remote Operations architecture (`BaseRemotableOperation`, the 4th data primitive) full-stack but headless: each operation is invoked exactly as any caller would — `new Op().Execute(input, { provider, user })` — and routes through the REAL provider dispatch (ClassFactory → `ProviderBase.RouteOperation` → `ExecuteServer` → `Authorize` → `InternalExecute` → the actual engine → SQL Server). Operations covered: `Template.Run`, `RecordProcess.RunNow` (dry and wet), `GetRunStatus`, and the Pause/Resume/Cancel control ops. Graduated verbatim from `remote-operations-tests.ts`.

**Transport.** Server in-process (the same call site a browser would use; the wire leg is the sibling bundle below). **Fixtures/lifecycle.** `ctx.RemoteOpsFixture` — Setup creates a throwaway Template + Text Content (`Hello {{ name }}`), two Action Categories with null Descriptions, and a FieldRules Record Process (formula rule writing `Description`); the handle is published up-front and populated per record so a mid-Setup crash leaves Teardown something to sweep. Teardown deletes Process Run Details → Process Runs → the Record Process → categories → the auto-extracted `MJ: Template Params` (BypassCache — created mid-render through the engine's own path) → content → template. `ControlRunID` is threaded through the fixture: RO6 sets it, RO7 reads it. **Registration order is deliberate** — the exported array runs RO1, RO2, RO3, **RO5, RO4**, RO6, RO7, so both dry-run checks (RO3/RO5) observe null Descriptions before RO4's wet run writes them.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `remote-operations.RO1` | Template.Run renders by ID with data | `Success`, `Output.output === 'Hello World'` exact, numeric `executionTimeMs` | the typed op → template engine seam breaking |
| `remote-operations.RO2` | Template.Run on a nonexistent template fails cleanly | `Success=false`, `ErrorMessage` matches `/not found/i`, no throw | error containment on the primitive's failure path |
| `remote-operations.RO3` | RunNow dryRun previews the diff, writes nothing | `status='Completed'`, `processed=2`, and after a settle every category `Description` still null | dry-run persisting — the exact promise the first-class `ProcessRun.DryRun` flag makes |
| `remote-operations.RO5` | RunNow (LongRunning) emits typed progress to attached onProgress | ≥1 `RemoteOpProgress` event, each with `OperationKey='RecordProcess.RunNow'` and numeric `Processed` (RO-3 in-process leg) | the executor's per-batch progress forwarding silently dying |
| `remote-operations.RO4` | RunNow dryRun:false applies the rule set | `processed=2` and both Descriptions read back as `mj-remote-op-test-cat-N — bulk updated` exactly | the write-back path (WriteBackProcessor over FieldRules) not persisting |
| `remote-operations.RO6` | GetRunStatus returns status + counts by ProcessRunID | a fresh dry run yields `processRunID`; `GetRunStatus` on it returns `Completed` / `processed=2` | run-status lookup drift between executor bookkeeping and the status op |
| `remote-operations.RO7` | Pause/Resume/Cancel toggle CancellationRequested | Pause sets `CancellationRequested=true` (verified in-DB, BypassCache), Resume clears it, Cancel sets it again; each op returns a status string | the control-op → substrate pause/cancel handshake breaking silently |

### 5.2 `remote-op-wire-progress` (WIRE1) — IT15

**Machinery under test.** The over-the-wire RO-3 proof: a `GraphQLDataProvider` client calls `RecordProcess.RunNow` with `onProgress` and asserts the typed `RemoteOpProgress` emitted server-side arrives over the `RemoteOperationProgress` GraphQL subscription — the full chain client subscribe → mutation → server `emitProgress` → PubSub → subscription → client `onProgress`. This is the transport doctrine's "attached progress works over the wire" claim, wire-proven.

**Transport.** Client only — needs a live MJAPI. Per IT15's description it is **parked exactly like IT03**: seeded in the deterministic suite, the run skips cleanly when MJAPI is unreachable, until MJAPI is provisioned in CI.

**Fixtures/lifecycle.** Same shape as the parent bundle but created **over the wire**: 2 Action Categories + a FieldRules Record Process; handle published up-front; FK-ordered teardown (details → runs → process → categories).

**Tier.** Deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `remote-op-wire-progress.WIRE1` | RunNow over the wire returns the summary AND streams typed progress | with **no provider passed** (global GraphQLDataProvider → marshalled over GraphQL): `Success`, `processed=2` over the wire, ≥1 streamed progress event each with `OperationKey='RecordProcess.RunNow'` | the per-call progress subscription channel breaking anywhere in the resolver/PubSub/client chain — the in-process RO5 would stay green while every browser lost progress |

---

## 6. Realtime (and the Predictive Studio deterministic legs that live with it)

### 6.1 `realtime-deterministic` (RD1–RD9) — IT51

**Machinery under test.** Domain 10's deterministic legs — **no live sessions, no sidecar, no model calls**: realtime metadata integrity (agent channels, Realtime-model → vendor DriverClass wiring, the co-agent pairing junction), agent-session row lifecycle, the bridge `*EntityServer` invariants from the Realtime Bridges guide exercised through real `Save()` attempts, bridge driver-registry ClassFactory resolution (LoopbackBridge), plus two Predictive Studio deterministic legs NOT covered by `predictive-studio.checks.ts`: the ML guidance-matrix integrity and the `ProductionModelPromotionGate`'s deterministic refusal paths.

**Transport.** Server (IT51). RD5/RD6 use a `serverInvariantsActive()` guard: over the Network transport invariants are always enforced resolver-side; in-process they are only observable when the bootstrap registered the `*EntityServer` subclass — otherwise the check **skips loudly** rather than passing vacuously.

**Fixtures/lifecycle.** No shared lifecycle — every fixture row is tagged `(mj-integration-test — safe to delete)` and deleted in the same check's `finally`. RD1–RD3 and RD8 skip-as-pass **loudly** (console.warn naming the seed command) when the deployment has not seeded that slice.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `realtime-deterministic.RD1` | seeded agent-channel metadata coherent | every `MJ: AI Agent Channels` row: non-empty Name, `TransportType` inside the **generated zod union** (`MJAIAgentChannelSchema.shape.TransportType.safeParse` — schema-driven, never a hand-copied union), `ConfigSchema` parseable JSON when present | channel rows drifting outside the CHECK-constraint truth; unparseable config schemas |
| `realtime-deterministic.RD2` | every active Realtime model has a DriverClass-bearing vendor row | for each `IsActive` model of the `Realtime` model type: ≥1 `MJ: AI Model Vendors` row with a non-empty DriverClass | a Realtime model that can never be instantiated — dead metadata the engine only discovers at session start |
| `realtime-deterministic.RD3` | co-agent pairing junction integrity | every pairing: non-empty CoAgentID, at least one of TargetAgentID/TargetAgentTypeID, no duplicate (CoAgent, Target, TargetType, Type) tuples, ≤1 Active `IsDefault` per (CoAgent, Type, target-kind) slot | unresolvable or ambiguous pairings — the default-pairing resolver picking nondeterministically |
| `realtime-deterministic.RD4` | agent-session row round-trips its lifecycle fields (and PINS the no-EntityServer fact) | a tagged session saves, reads back with typed `Status='Active'` + UserID, closes through the entity layer (`Closed`/`CloseReason='Explicit'`/`ClosedAt` — the janitor's terminal shape); emits a loud **PRODUCT NOTE** that `MJ: AI Agent Sessions` has NO `*EntityServer` subclass — all session invariants live only in SessionManager and are bypassable by any direct Save | field round-trip regressions; and the pin flips if an EntityServer ever ships (the direct close-save would start being refused) |
| `realtime-deterministic.RD5` | bridge-provider EntityServer invariants on the real Save path | unknown feature flag refused (message names it), non-boolean flag value refused, a well-formed Disabled provider saves | the `IBridgeProviderFeatures` validation gate regressing — malformed capability declarations persisting |
| `realtime-deterministic.RD6` | session-bridge invariants: outbound target, status↔timestamp, close-reason coherence | Outbound bridge with no Address/ExternalConnectionID refused (message names it); `Status='Connected'` without `ConnectedAt` refused; `CloseReason` on a Pending bridge refused; a coherent Inbound/Pending bridge saves | the three `*EntityServer` invariants from the Realtime Bridges guide silently dropping — incoherent bridge rows breaking duration metrics and close semantics |
| `realtime-deterministic.RD7` | bridge driver registry resolves LoopbackBridge via ClassFactory | `GetRegistration(BaseRealtimeBridge, LOOPBACK_BRIDGE_DRIVER_CLASS)` resolves to the LoopbackBridge class itself, subclassing `BaseRealtimeBridge`; the mangled key `'  loopbackbridge  '` resolves to the same SubClass (trim + case-insensitive — the contract the engine relies on for metadata-stored DriverClass strings) | driver registration lost to tree-shaking; key-normalization drift |
| `realtime-deterministic.RD8` | ML guidance matrix (Algorithms × Use Cases × Rankings) referentially coherent | algorithms seeded (hard assert with the seed command); every ranking references a real algorithm + use case, `SuitabilityScore` in 1..5, no duplicate (algorithm, use case) pairs | the 6×7 guidance matrix rotting — dangling rankings steering the Model Development Agent wrong |
| `realtime-deterministic.RD9` | ProductionModelPromotionGate refuses deterministically | injection leg (no fixture): a non-UUID id (`x' OR 1=1 --`) → `not-found`, never concatenated into SQL; then against a real dominance-flagged Draft model (anti-vacuity: `detectSingleFeatureDominance` pre-verified on the fixture importance): no-sign-off → `refused-leakage`; sign-off without reason → `signoff-reason-required`; Draft→Published with valid sign-off → `invalid-transition`; final BypassCache reload proves `Status` still `Draft` — no refusal path mutated the model | any of the four refusal paths softening (leakage promotion, reason-free sign-offs, lifecycle jumps, injection), or a refusal that half-writes |

---

## 7. Predictive Studio

### 7.1 `predictive-studio` (PS1–PS5) — IT14

**Machinery under test.** Predictive Studio's **stack seams** over the real provider: ML entity CRUD with typed fields, the `'ML Model'` Record Set Processing work-type registration + resolution through the substrate's pluggable `RecordProcessorRegistry` (the exact call `RecordProcessExecutor.buildProcessor()` makes for non-built-in work types), and the four Predictive Studio Actions in real metadata invoked through the real Action-execution path. Graduated verbatim from `predictive-studio-tests.ts`. The PS engine is imported for its `@RegisterClass` side effects (the same registration path a server bootstrap uses — the PS engine is NOT in `server-bootstrap-lite`), anchored by `LoadMLModelInferenceProcessor()`/`LoadPredictiveStudioActions()`.

**Transport.** Server. **Gated prerequisite:** deterministic and **sidecar-free by default**; the only live leg is *inside* PS5, gated on `PS_INTEGRATION=1` (mirroring `RUN_AGENT_TESTS` on the AI tier) — it invokes a real train against the fixture pipeline and asserts only a structured result. The deterministic tier uses a deny-everything `stubInferenceDeps()` whose seams are never exercised (PS3 asserts resolution only, never calling the sidecar).

**Fixtures/lifecycle.** `ctx.PredictiveStudioFixture` — Setup resolves a target entity + a seeded ML algorithm (hard assert naming `mj sync push --include=ml-algorithms`), then creates the Pipeline → Model → Scoring Binding lineage; handle published up-front, populated per record; Teardown deletes child → parent (binding → model → pipeline), best-effort. The registry registration is deliberately left in place (process-wide, idempotent, last-wins).

**Tier.** All deterministic (PS5's internal leg env-gated, not tier-flagged).

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `predictive-studio.PS1` | ML entity CRUD round-trips with typed fields | reloaded model: pipeline FK, algorithm FK, `Version=1`, `ProblemType='classification'` and `Status='Draft'` (typed unions), `TargetVariable` | the `MJ: ML *` entity layer breaking under CodeGen churn |
| `predictive-studio.PS2` | pipeline ↔ model ↔ binding FK lineage reads back | pipeline's TargetEntityID + typed ProblemType; binding's `MLModelID` → model, `Mode='OnDemand'`, `TargetColumn='RenewalScore'` | lineage corruption — a binding scoring against the wrong model |
| `predictive-studio.PS3` | `'ML Model'` work type resolves MLModelInferenceProcessor through the registry seam | after `registerMLScoringProcessor(stubDeps)`: `Registry.Has(ML_INFERENCE_WORK_TYPE)`; `Resolve()` with a real `RecordProcessorBuildContext` (Configuration carrying `modelId`) returns an `MLModelInferenceProcessor` instance; the lowercased key `'ml model'` also resolves (case-insensitive registry) | the pluggable work-type seam breaking — every ML-scoring Record Process silently falling to "unknown work type" |
| `predictive-studio.PS4` | the four PS Actions exist with params + result codes | `Train ML Model` / `Score Record Set` / `Run Experiment Session` / `Promote ML Model` all Active; Train's DriverClass equals `TRAIN_MODEL_DRIVER_CLASS` (the `@RegisterClass` key), params include PipelineID/ModelID/HoldoutMetrics/LeakageFlagged, codes include SUCCESS/VALIDATION_ERROR/TRAINING_FAILED | metadata ↔ driver-class wiring drift the agents/UI depend on |
| `predictive-studio.PS5` | invoking Train ML Model with missing PipelineID fails cleanly | default leg: zero params → `Success=false` with `VALIDATION_ERROR` (or a message naming PipelineID) — proving metadata → driver-class → `InternalRunAction` param-validation wiring without a sidecar; **`PS_INTEGRATION=1` leg:** a real train against the fixture pipeline returns a *structured* result (success OR a clean engine failure code, never a throw) | the action short-circuiting incorrectly (or throwing); with the gate on, the sidecar spawn/contract path |

---

## 8. Search

### 8.1 `search` (SR1–SR7) — IT52

**Machinery under test.** Domain 13's deterministic legs over the search decision-tree APIs (Search Overview guide): `EntityByName` (definition lookup) vs `SearchEntity`/`SearchEntities` (ranked record search, pinned to `mode: 'lexical'` so no embedding model is ever touched — the semantic legs are the LLM-gated tier, deliberately omitted), hostile-input robustness of the lexical pass, `SearchEngine.Search` graceful-configuration contracts, `SearchScopePermissionResolver` fail-closed semantics against real scope metadata, and the `GraphQLSearchClient` scope-list wire round-trip.

**Transport.** Client (IT52); the checks run through `ctx.Provider` so they go over the wire under the GraphQL bootstrap and in-process otherwise — except SR7, which is **Network-transport-only** and skips with a warn when the run is not on `GraphQLDataProvider`.

**Fixtures/lifecycle.** Stateless Setup. The only rows the bundle can create are the `MJ: Search Execution Logs` audit rows SearchEngine writes per invocation — every query carries `LOG_QUERY_PREFIX` (`'mj-integration-test search'`) and Teardown sweeps exactly those rows with a **bounded re-sweep poll** (5 × 300ms), because `logSearchExecution` is fire-and-forget (unawaited at `SearchEngine.ts:446`) and a single synchronous sweep can race the write and leak the row.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `search.SR1` | EntityByName: case/trim-insensitive hit, clean undefined for unknown names | `'MJ: Users'` and `'  mj: users  '` resolve the SAME EntityInfo; unknown name → `undefined`, never a throw; the provider surface agrees with the Metadata facade | the O(1) name-map contract (the CLAUDE.md `EntityByName` rule) regressing |
| `search.SR2` | SearchEntity (lexical) relevance-ordered with the exact-name record at rank 1 | searching `MJ: Entities` for the literal `MJ: Users`: non-empty, rank-1 `recordId` is the MJ: Users entity, `matchType='lexical'`, scores monotonically descending | the lexical scorer breaking (exact-name 1.0 no longer winning) or ordering scrambled |
| `search.SR3` | SearchEntities batch stays input-aligned; degrades to clean empties | 3-slot batch: one group per param; valid slot non-empty (anti-vacuity via SR2); unknown entity → empty group, whitespace query → empty group, no throws | batch misalignment — results attributed to the wrong request |
| `search.SR4` | hostile search text stays literal | quote-tautology probe (`zz' OR '1'='1`) matches nothing; `%__nonexistent__%` wildcard probe matches nothing | quote/wildcard escaping regressing — a match-everything predicate (or injection) in the lexical LIKE |
| `search.SR5` | SearchEngine.Search: unconfigured deployments return empty-success; short queries short-circuit | sub-minimum query (`'mj'`) → `Success=true`, `TotalCount=0`; a tagged well-formed probe → `Success=true`, `Results` an array, `TotalCount === Results.length`, whatever the provider configuration (warns when zero providers are active — the empty-success contract verified, ranked cross-source coverage not exercised) | graceful-degradation regressions: a throw or `Success=false` on an unconfigured deployment; MIN_TERM_LENGTH guard loss |
| `search.SR6` | SearchScopePermissionResolver fail-closed; real-scope decisions internally consistent | a guaranteed-nonexistent scope ID resolves `Allowed=false`, `Level='None'`, `toSqlPredicate()==='1=0'`; for up to 10 real seeded scopes: `Allowed ⇔ Level!=='None' ⇔ '1=1'/'1=0'` predicate agreement, non-empty auditable `Reason` (real-scope leg skips with a warn when no scopes are seeded) | fail-open drift on the scope gate — the highest-severity search bug class |
| `search.SR7` | GraphQLSearchClient scope list round-trips with no phantoms (Network only) | every scope returned by `GetSearchScopes()` over the wire exists in `MJ: Search Scopes` (no phantoms) with a non-empty name; a strict subset is legitimate (permission filtering) and only the no-phantom direction is asserted | the wire scope list inventing scopes — a client offering scopes the server will refuse (or worse, honor) |

---

## 9. Templates and Communication

### 9.1 `templates` (TP1–TP6) — IT38

**Machinery under test.** The Templates framework through the REAL `TemplateEngineServer` — nunjucks environment, custom filters, param validation + default-merge, and the dataset-backed metadata cache — against a fixture created via real entity saves. What the unit tests already cover (content/param selection, engine internals on mocks) is deliberately not re-proven; the integration value is the live round-trip: entity Save → `Template_Metadata` dataset load → virtual Content/Params association → `FindTemplate` → `RenderTemplate` → exact output.

**Transport.** Server. **Fixtures/lifecycle.** `ctx.TemplatesFixture` — Setup creates a Template + Text Content (`Hello {{ name }}! You have {{ count }} items.`), then **normalizes** the params the server save pipeline auto-extracts (`ensureParam`: required `name`, defaulted `count=42` — creating either only if extraction did not), and forces an engine Config refresh against the just-created fixture. Teardown sweeps ALL params on the fixture template (ours plus any later auto-extracted, FK-safe), then content, then template.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `templates.TP1` | RenderTemplate exact and deterministic | via the engine cache (`FindTemplate` + `GetHighestPriorityContent('Text')`): output exactly `Hello World! You have 3 items.`, byte-identical across two renders | nondeterministic rendering; cache/content selection drift |
| `templates.TP2` | custom filters registered; autoescape is the default | `jsoninline\|safe` emits compact JSON; without `\|safe` quotes become `&quot;` (autoescape provably live); `json\|safe` matches 2-space stringify; `jsonparse` exposes parsed properties; builtin `upper` still works | filter registration loss; autoescape silently off (an XSS-relevant default) |
| `templates.TP3` | not-found and missing-TemplateText fail cleanly | `FindTemplate` on an unknown name → undefined, no throw; rendering an unsaved content row with null TemplateText → `Success=false`, no output, message naming TemplateText | error contracts degenerating to throws |
| `templates.TP4` | required-param failure, default merge, SkipValidation | missing required `name` → failure naming `Parameter name is required`; omitted `count` renders with the merged default 42; SkipValidation renders through with empty required + merged default | the validation/default-merge pipeline drifting (breaks every prompt/notification template consumer) |
| `templates.TP5` | injection neutralized; template syntax not re-evaluated | `<script>alert(1)</script>` in data arrives as `&lt;script&gt;`; `{{ 7*7 }}` in data stays literal (never `49`) | XSS through contextData; SSTI (data re-evaluated as template) |
| `templates.TP6` | LIVE TemplateText round-trip: save → dataset refresh → cache → render | the engine-cached virtual Content collection contains the exact fixture row with byte-equal text; after an entity UPDATE + forced `Config(true)` the cache carries the NEW text and renders `Goodbye X!` | the entity → dataset → engine-cache invalidation loop breaking — stale template text served forever |

Housekeeping note: TP1 contains a **triple-duplicated assertion line** (`content != null` asserted three times in a row, an editing artifact of "review P2") — harmless but worth cleaning.

### 9.2 `communication` (CM1–CM4) — IT42

**Machinery under test.** The Communication framework's **DRY-RUN seam** end to end through the real `CommunicationEngine`: metadata-selected provider → ClassFactory provider instance → message processing → the Communication Log audit lifecycle → the provider's full payload construction — stopping at the external transport boundary. **Absolutely nothing leaves the process**: every send sets `Message.DryRun = true`, which every shipped provider honors by returning a DryRun-marked success without contacting its external service. All five provider packages (SendGrid, Gmail, Twilio, MS Graph, Expo Push) are statically imported so their `@RegisterClass` decorators fire.

**Transport.** Server. **Credentials strategy:** the send is attempted with deployment/environment credentials first; if the provider's preflight rejects (thrown OR returned as `Success:false` — the MS Graph shape, adversarial review C1), it retries with syntactically valid **dummy** credentials — safe precisely because DryRun never contacts the service, and it keeps credential-resolution → payload-construction exercised on any deployment.

**Fixtures/lifecycle.** `ctx.CommunicationFixture` — Setup runs engine Config and selects the first Active + `SupportsSending` provider (name-sorted for **deterministic selection** — the backing RunView has no OrderBy) whose class is ClassFactory-registered and exposes a message type; when none qualifies the fixture records a `SkipReason` and every check **skip-as-passes loudly**. Teardown sweeps Communication Logs by the run-unique `SubjectMarker` (which also covers CM4's `-preview` marker by containment) plus linked Communication Runs, best-effort with loud notes when the deployment forbids deletes on audit entities.

**Tier.** All deterministic.

| Id | Name | Asserted observable | Failure it catches |
|---|---|---|---|
| `communication.CM1` | engine Config resolves an Active registered provider; GetProvider error contract | engine `Loaded`; all five provider classes statically referenced; `GetProvider('mj-it-nonexistent-provider')` **throws** naming the miss; the selected provider resolves to a concrete subclass (never the base class) | provider registration lost to tree-shaking; the GetProvider miss degenerating to a hollow base instance |
| `communication.CM2` | DryRun send succeeds, is DryRun-marked, writes exactly one audit row | `SendSingleMessage` with DryRun: `Success`, `DryRun=true`, empty Error; bounded poll (≤16 × 300ms — a fixed settle raced the audit write under load, review P1) until a **Complete** marker row lands; exactly one Complete row ever (a Pending preflight row from a rejected environment-credential attempt is tolerated as the documented second row, cap 2) | the audit lifecycle dropping or duplicating delivery state; a "dry run" that isn't marked as one |
| `communication.CM3` | the audit row is Complete + error-free and carries the DryRun marker | still exactly one Complete row; `Status='Complete'`, `Direction='Sending'`, no ErrorMessage; `MessageContent` JSON has explicit `DryRun: true` plus the exact To/Subject sent — no persisted state can be mistaken for a real delivery | an audit row that looks like a real send — the compliance failure this bundle exists to prevent |
| `communication.CM4` | previewOnly stays distinct: no DryRun mark, NO audit row | `previewOnly=true` send: `Success`, `DryRun` NOT set (the modes are distinct — preview short-circuits BEFORE the provider), zero Communication Log rows for the preview marker | preview and dry-run collapsing into each other (preview starting to write audit rows, or dry-run losing its provider leg) |

---

## Cross-family summary: pins, ratchets, known-offender exceptions

| Where | Kind | Bug register | What is pinned |
|---|---|---|---|
| MC4 | red-until-fixed finding, now migrated | **B24** (+ root causes **B26/B27/B28/B29**) | 6 missing `IDX_AUTO_MJ_FKEY_*` indexes; backfill migration `V202607191254` in-tree, MC4 green on migrated DBs; the CodeGen execute-vs-log architecture fix (B26) remains open |
| MC6 | **debt ratchet** | **B25** | `MC6_DEBT_CEILING = 270` undescribed core columns; lower as descriptions land, never raise |
| MC7 | deliberately unwritten | coverage-caveat table | DriverClass↔ClassFactory audit cannot distinguish bad metadata from an unloaded provider package — left unwritten rather than faked |
| MS1 | landmine pin + product note | (product note in-check) | `&` in a `@lookup` value hard-throws at push time while `ValidationService.parseReference` silently drops it — validation passes files the runtime rejects |
| AW4 / AW5 / AW10 | latent-risk guards | **B20 / B22** (+ **B21** uncovered, **B23** partial via OAT) | DriverClass uniqueness, slug uniqueness, non-Active fan-out exclusion; G5 registration half is the static gate `.github/scripts/check-driverclass-registrations.sh` |
| SC2 | fixed-contract pin | **B8** | Queue-mode contention runs are terminal on creation (`Cancelled`), never orphaned `Running`; must be updated with any future drainer |
| AP1 | **known-offender exception** | **B51** | `Computer Use` ships a duplicate `Error` result code — warns for that one action, strict for all others |
| AP4 | known-gap pin | **B14** | base `ValidateInputs`/`RunSingleFilter` are no-op stubs; validation lives only inside actions; check must flip when the stubs are implemented |
| RD4 | product-note pin | (product note in-check) | `MJ: AI Agent Sessions` has no `*EntityServer` — all session invariants live in SessionManager and are bypassable by direct Save |

---

*Written 2026-07-21 against the working tree. Check counts verified against the exported arrays in each `*.checks.ts`; IT-record tier/transport/suite membership verified against `metadata-optional/integration-test/`.*
