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
| _(pending)_ | W5 — create suppression + `Get`/`Set` read gate |

## Status by workstream

| # | Workstream | State |
|---|---|---|
| W1 | Schema + CodeGen | **Done.** Migration `V202608082359__v6.1.x__Entity_Field_Permissions.sql`. CodeGen generated the value-list unions AND a `ValidateReadAccessRequiredForCreateOrUpdate` validator from the CHECK constraint, so the hand-written EFP validation the research doc planned is unnecessary. |
| W2 | Aggregation | **Done.** Trinary truth table, post-aggregation Read-required clamp, `GetDeniedCreateFields`, `EnableFieldLevelSecurity` replacing `HasAnyFieldPermissions`. |
| W3 | Cache reversal | **Done.** Server `fls:` segment, allowed-set widening and `entity_object` exemption all removed; client keeps its allowed-list key. Tier split lives only in `ComputeRunViewFLSFingerprintKey`. |
| W4 | Lifecycle | **Partial.** Delta + applier + 2 of 3 adapters done. **Remaining:** CodeGen manage-metadata adapter (schema changes), adapter unit tests. |
| W5 | Create enforcement + Get/Set throw | **Done.** `EntityField.CreateSuppressed`, `ApplyFieldLevelCreateSuppression`, `AssertFieldReadable` on `Get`/`Set`, `FieldSecurityDenialMessage` now shared. |
| W6 | Metadata invalidation + docs | **Not started.** |

## Test baseline (all currently passing)

MJCore 1998 · MJCoreEntitiesServer 419 · MJServer 826 (+56 skipped) ·
GenericDatabaseProvider 894 (+5 skipped) · CodeGenLib 764 (+60 skipped) ·
GraphQLDataProvider 274 · SQLServerDataProvider 87. Full build: 299 tasks.

## Integration tests — deferred to the END, deliberately

Per Jordan: new integration tests will exercise users holding FLS roles, which means the
suite has to **create custom roles in the database and assign users to them**. Do not run
`pnpm run test:integration` piecemeal before then.

Target database: `mj_test` on `localhost:1433` (SQL Server container `sql2022`), CodeGen login
`MJ_CodeGen`. **Credentials live in the repo-root `.env` — read them from there, never copy
them into a tracked file.**

## Remaining work, in order

### W4 finish
1. **CodeGen manage-metadata adapter.** New column on an enabled entity currently has no rows,
   so it is denied to everyone until some other adapter happens to fire. Hook
   `ComputeFieldPermissionDelta` into the manage-metadata step (`ManageMetadataBase.manageMetadata`,
   before the unconditional `provider.Refresh()`).
2. **Adapter unit tests** — `MJEntityEntityServer`, the `MJEntityPermissionEntityServer`
   reconciliation path, and `ReconcileFieldPermissions` itself. The pure delta has 16 tests;
   these three have none.

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

### W6 — metadata invalidation + docs
- Wire `remote-invalidate` → metadata refresh (`RefreshIfNeeded()`, debounced). The pub/sub
  infrastructure already exists and fires; only this last hop is missing.
- **One invalidation per unit of work.** Reconciliation currently publishes one per row saved.
  Suppress per-node publishes between `graph_save_started` and `graph_save` and publish once.
- Rewrite `guides/FIELD_LEVEL_SECURITY_GUIDE.md` — §1.1 is the old allow-list-flip narrative,
  the §1 config table lists the old columns, and §2's write-only line is now impossible.
- Rewrite `.changeset/field-level-security.md` (same reason).
- `ResolverBase.PublishCacheInvalidation` is dead (zero callers) but **pre-existing in `next`** —
  deleting it belongs in its own commit, not the FLS PR.

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
