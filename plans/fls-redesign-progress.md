# FLS Redesign — implementation progress

> Working tracker for the field-level-security redesign on `JF_Entity_Field_Security`.
> Contract documents: [`fls-redesign-direction.md`](./fls-redesign-direction.md) (leadership
> direction) and [`fls-redesign-research.md`](./fls-redesign-research.md) (R1–R8 + decisions).
> This file records what is DONE, what is NOT, and the traps already paid for — so work can
> resume without re-deriving any of it.

## Commits so far (nothing pushed)

| Commit | Contents |
|---|---|
| `a944885798` | W1 — schema + CodeGen: trinary columns, `Entity.EnableFieldLevelSecurity`, `TrackRecordChanges = 0` |
| `8ed964c6c2` | W2 + W3 — trinary aggregation, RunView cache posture, comment/dead-code cleanup |
| `052ce4980f` | W4 (partial) — reconciliation delta, transactional applier, flag-flip + entity-permission adapters |
| `105a31e9e8` | W5 — create suppression + `Get`/`Set` read gate |
| `641e4b62c8` | Form-field access gate + fail-open `ActiveUser` resolution |
| `6db09ebb9f` | W4 complete — CodeGen schema-change reconciliation + applier tests |
| `f1f2f61b4d` | W6 docs — guide + changeset rewritten for the trinary model |

## Status by workstream

| # | Workstream | State |
|---|---|---|
| W1 | Schema + CodeGen | **Done.** Migration `V202608082359__v6.1.x__Entity_Field_Permissions.sql`. CodeGen generated the value-list unions AND a `ValidateReadAccessRequiredForCreateOrUpdate` validator from the CHECK constraint, so the hand-written EFP validation the research doc planned is unnecessary. |
| W2 | Aggregation | **Done.** Trinary truth table, post-aggregation Read-required clamp, `GetDeniedCreateFields`, `EnableFieldLevelSecurity` replacing `HasAnyFieldPermissions`. |
| W3 | Cache reversal | **Done.** Server `fls:` segment, allowed-set widening and `entity_object` exemption all removed; client keeps its allowed-list key. Tier split lives only in `ComputeRunViewFLSFingerprintKey`. |
| W4 | Lifecycle | **Done.** Delta + applier + all 3 adapters (flag flip, entity permissions, CodeGen schema changes) + tests. |
| W5 | Create enforcement + Get/Set throw | **Done.** `EntityField.CreateSuppressed`, `ApplyFieldLevelCreateSuppression`, `AssertFieldReadable` on `Get`/`Set`, `FieldSecurityDenialMessage` now shared. |
| W6 | Metadata invalidation + docs | **Done.** Guide + changeset rewritten; `remote-invalidate` → metadata refresh wired and debounced. One known gap accepted — see below. |

## Test baseline (all currently passing)

MJCore 1998 · MJCoreEntitiesServer 429 · MJServer 826 (+56 skipped) ·
GenericDatabaseProvider 894 (+5 skipped) · CodeGenLib 771 (+60 skipped) ·
GraphQLDataProvider 280 · SQLServerDataProvider 87 · ng-base-forms 196.
Full build: 299 tasks. `mj standards check` passes.

## Integration tests — deferred to the END, deliberately

Per Jordan: new integration tests will exercise users holding FLS roles, which means the
suite has to **create custom roles in the database and assign users to them**. Do not run
`pnpm run test:integration` piecemeal before then.

Target database: `mj_test` on `localhost:1433` (SQL Server container `sql2022`), CodeGen login
`MJ_CodeGen`. **Credentials live in the repo-root `.env` — read them from there, never copy
them into a tracked file.**

## Remaining work, in order

### W4 — DONE
The CodeGen adapter is `reconcileFieldLevelSecurity` in `CodeGenLib/src/Database/`, called from
`runCodeGen.ts` **after** the `provider.Refresh()` that follows `manageMetadata` — it must see the
`EntityField` rows that pass just created, or it computes the delta from a field list predating
the columns it exists to cover. Failures are logged, not fatal: reconciliation is a maintenance
pass over data CodeGen does not own, and failing the run after schema/views/procs are written
would trade a recoverable permissions gap for an unrecoverable half-finished build.

Still untested by unit tests: `MJEntityEntityServer` and the `MJEntityPermissionEntityServer`
reconciliation path (both are thin wiring over `ReconcileFieldPermissions`, which has 10 tests).
The live flag-flip is the real oracle and belongs in the integration tier.

### W5 — DONE, but note the deferred client-UI consequence
Shipped as designed: `EntityField.CreateSuppressed` (deliberately separate from `NotLoaded`,
which additionally suppresses the `_Clear` companion and exempts validation),
`ApplyFieldLevelCreateSuppression` on the save path, the omission in `GenerateSaveSQL`, and
`AssertFieldReadable` on `Get`/`Set` placed BEFORE `Get`'s raw-mode fast path.

**`Get`/`Set` gate on READ only.** Update and create denials are enforced on the write path,
where a rejection can name a save rather than a keystroke — gating `Set` on update would throw
on every keystroke of a bound form field.

**No `ResolverBase` create-path strip was added, and none is needed.** The resolver applies
client values via `SetMany` (exempt from the gate), then `BaseEntity.Save()` marks and
`GenerateSaveSQL` omits. Adding a strip would be redundant code.

**Client-UI blast radius is CLOSED.** `MjFormFieldComponent.IsFieldReadableByUser` gates the
whole field in the template, first, before any expression reads a value. Memoized (template
getters run every change-detection cycle and `GetDeniedReadFields` walks every field), invalidated
in `ngOnChanges` on `Record`/`FieldName`. Fails open on missing entity/user/flag.

Adding that gate surfaced a real defect in `BaseEntity`: `ActiveUser` ends in
`Metadata.Provider.CurrentUser`, which throws a TypeError when no global provider is configured.
Harmless while only the save path consulted it; fatal once `Get()`/`Set()` do on every access to
an FLS-enabled entity. Now routed through `resolveActiveUserOrNull()`, which treats "no provider
to ask" as "no user" and fails open.

### W6 — docs DONE, invalidation REMAINING

Done: `guides/FIELD_LEVEL_SECURITY_GUIDE.md` and `.changeset/field-level-security.md` rewritten
for the trinary model (commit `f1f2f61b4d`). `check:claude-md` passes.

Done: `GraphQLDataProvider.ScheduleMetadataRefreshForPermissionChange` recognises the five
permission-bearing entity names and calls `RefreshIfNeeded()` on a 500ms debounce. Metadata is the
provider's own AllMetadata cache, not a `BaseEngine`, so `remote-invalidate` alone never reached
it — a client would keep rendering a column it had just lost until the next full refresh.

Not done, deliberately: `ResolverBase.PublishCacheInvalidation` is dead (zero callers) but
**pre-existing in `next`**, so deleting it belongs in its own commit rather than the FLS PR.

## 🔴 KNOWN GAP — one cache invalidation per row, not per transaction

**Accepted for this PR; needs its own follow-up.** Decided with Jordan 2026-08-08.

The global listener at `packages/MJServer/src/index.ts:841-856` publishes `CACHE_INVALIDATION`
to every connected browser on every `BaseEntity` save/delete. `ReconcileFieldPermissions` saves
rows one at a time, so enabling field security on a wide entity emits **hundreds of broadcasts
for what is logically one transaction**.

Impact is performance and noise, not correctness — every broadcast carries accurate data and
clients converge on the right state. It is worst on the least frequent operation (the initial
flag flip), which is why it is not blocking.

**The research doc's proposed fix does not work, and this is the trap to avoid re-walking.** It
proposed suppressing per-node publishes between `graph_save_started` and `graph_save`. Those
events are raised by `BaseEntity`'s ENTITY-GRAPH save path. Reconciliation uses
`RunInEntityTransaction` with individual `Save()` calls, which is not a graph save — so
`graph_save` never fires and the suppression would be silently inert.

Two shapes that would actually work:

- **(a) An explicit batch scope (recommended).** A primitive in MJCore — where `BaseEntity`
  events originate — that marks "a bulk unit of work is in flight". The MJServer listener
  coalesces while it is open and publishes once on close; the reconciler opts in explicitly.
  **Dependency direction constrains this**: MJCoreEntitiesServer cannot call into MJServer, so
  the primitive cannot live in MJServer.
- **(b) Debounce the listener per entity name.** Simpler, and would help every bulk write in the
  platform. But it changes semantics for all entities and would drop `recordData` for coalesced
  saves, which browser `BaseEngine` caches use for in-place updates — a broad behavior change for
  a narrow problem.

Ideally the scope would be the TRANSACTION itself: `RunInEntityTransaction` already knows the
unit of work's boundaries, so hanging the batch on the transaction scope would make every
server-side multi-row write correct by default rather than only the ones that remember to opt in.
That is worth investigating before committing to (a).

## Traps already paid for — do not re-learn these

- **`mj sync push` BEFORE `mj codegen`.** Skipping it regenerates from stale DB metadata and
  silently deletes code — it removed the whole `Workflow.Draft` remote operation twice. Order for
  a NEW column: `mj migrate` → `mj codegen --skipfiles` → `mj sync push` → `mj codegen`. For a
  files-only fix afterwards, `mj codegen --skipdb`.
- **Revert the `sync push` write-back.** It stamps `lastModified`/`checksum` into
  `metadata/**/*.json`; a feature PR must not carry those.
- **`ClassFactory` resolves ONE class per entity name**, priority auto-incrementing by load order.
  A second `@RegisterClass(BaseEntity, '<same name>')` silently displaces the first with no error.
  This already bit `MJ: Entity Permissions`, where `@memberjunction/server` had a subclass queueing
  DB-tier permission propagation. Before adding a server subclass, grep for an existing
  registration.
- **Class-registration manifests** regenerate via `npm run mj:manifest`. If a manifest references
  a class you deleted, the generator cannot bootstrap (it loads the stale manifest) — hand-fix the
  manifest, rebuild, then regenerate to confirm "No changes detected".
- **`grep` silently returns nothing on `packages/MJCore/src/generic/localCacheManager.ts`.** Use
  `awk` on that file.
- **Use `UUIDsEqual`, never `===`,** for ID comparison — MJ stores UUIDs in mixed case by source.
- Migration folder follows the version in the migration's own FILENAME. PG counterparts are the
  build engineer's job; never hand-author `migrations-pg/**`.
- `BaseEntityResult.CompleteMessage`, not `.Message`. `Role.Name` max 50 chars.
- Strip ANSI (`sed 's/\x1b\[[0-9;]*m//g'`) before grepping vitest counts. A test-count DROP matters
  as much as a failure.

## Decisions that are settled — do not re-litigate

Trinary Read/Update/Create, each Allow/Deny/No Access. Read required for Update and Create,
enforced twice (row CHECK + post-aggregation clamp) because a row constraint cannot see across
roles. System-user exemption stays, resolved via `WellKnownUserSource.IsSystemUser()`; both
configuration guards stay. No raw DML — `RunInEntityTransaction`, not entity graphs, for
reconciliation. Create enforcement silently applies the column default. Server cache holds
full-width shared slots; the client keeps its allowed-list key. `TrackRecordChanges = 0` on
`MJ: Entity Field Permissions`. Everything ships in ONE PR.

Comments in this feature's code should describe the code as it stands — not the branch's own
design history, workstream numbers, or decision IDs.
