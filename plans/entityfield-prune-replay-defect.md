# EntityField prune replayed from history — diagnosis and remediation plan

**Status:** proposed · **Opened:** 2026-09-10 · **Repos affected:** `MJ`, `bizapps-orders`, `bizapps-common`, `more-cheese`

A clean, from-zero install of MJ core plus the BizApps stack produces databases where a
`BaseView` exposes columns that have no matching `__mj.EntityField` row. Every
`BaseEntity.Save()` against such an entity then fails, because `SQLServerDataProvider` builds
its `@ResultTable` from entity metadata and executes `INSERT INTO @ResultTable EXEC
spCreate<Entity>` — the proc returns N columns, the table variable has M, and SQL Server
raises *"Column name or number of supplied values does not match table definition"* (Msg 213).

This document records what was measured, corrects a diagnosis that does not survive the
evidence, and sequences the fix.

---

## 1. What the symptom is NOT

The intuitive reading — *migration authors added columns to a view and forgot to append the
CodeGen `EntityField` block* — is **false for four of the five affected entities**. Every
claimed-missing field was checked against the shipped migrations by searching for its
`IF NOT EXISTS (… AND Name = '<field>')` guard:

| Entity | Field(s) | View alias | `EntityField` INSERT present? |
|---|---|---|---|
| `MJ_BizApps_Orders: Product Categories` | `RootParentProductCategoryID` | yes | **yes** — `V202607061432` |
| `MJ_BizApps_Orders: Product Categories` | `ParentProductCategoryIDDepth` / `Path` / `IsLeaf` / `ChildCount` | yes | **yes** — `V202608251540` |
| `MJ_BizApps_Orders: Price Tiers` | `ProductPrice` | yes | **yes** |
| `MJ_BizApps_Common: Activity Files` / `Activity Links` | `Activity` | yes | **yes** (×5) |
| `MJ_BizApps_Common: Addresses` | `__mj_Latitude`, `__mj_Longitude` | yes | **no — the one true omission** |

The rows are not missing because nobody wrote them. They are written, and then deleted.

**Note the repo.** `Addresses` is a **bizapps-common** entity — `MJ_BizApps_Common: Addresses`,
`BaseView` `vwAddresses`, `SchemaName` `__mj_BizAppsCommon` (`B202602271452`, line 961). MJ core
has no `Address` table, no `vwAddresses`, and no `AddressEntity` in the generated ORM. Any heal
for the geo fields belongs in bizapps-common. **Do not author an MJ-core migration for it.**

---

## 2. What actually deletes them

`spDeleteUnneededEntityFields` reconciles `EntityField` against the columns visible in the
entity's `BaseView` **at the moment it runs**. That is correct against a finished schema — which
is what CodeGen runs against. A versioned migration replays it from a point in history where the
schema is, by definition, not finished, so the procedure correctly concludes the rows are
unneeded and removes them.

This was diagnosed once already, in the header of
`bizapps-common/migrations/V202608140700__v5.34.x__Layered_Base_Views_EntityFields.sql`:

```
--   line  116  INSERT the 29 EntityField rows for the layered columns
--   line 3121  EXEC spDeleteUnneededEntityFields   <-- deletes them again
```

> *"It is the sequencing that is wrong, not the procedure."*
>
> *"Measured: 22 → 36 fields on a database where vwPeople already existed, versus 0 of 14 on a
> clean in-order install. Every developer machine is in the first state and every real host is
> in the second."*
>
> *"A later `mj codegen` also repairs it, because by then the wrappers exist — but hosts run
> migrations, not CodeGen, so the migrations must stand on their own."*

That is this bug, one schema over, with the measurement already done. It also explains the fact
no other theory accounts for: the generated entity classes and every developer database have
these fields, while a clean replay does not.

**Scale:** `spDeleteUnneededEntityFields` appears as **76 `EXEC` statements across 79 migration
files** in these four repos (MJ 49/61, bizapps-common 15/10, bizapps-orders 8/7, more-cheese 4/1
— statements/files).

---

## 3. Why it is emitted into migrations at all

CodeGen already knows this statement does not belong in a replayable migration. It tags it:

```ts
// manage-metadata.ts — deleteUnneededEntityFields()
const result = await this.LogSQLAndExecute(pool, sSQL, label, true);
//                                                          ^^^^ isRecurringScript
```

and the logger honours the tag:

```ts
// sql_logging.ts — appendToSQLLogFile()
if (isRecurringScript && SQLLogging.OmitRecurringScriptsFromLog) {
    return; // not written into the migration
}
```

The switch is `omitRecurringScriptsFromLog`. It is set wrong nearly everywhere:

```
bizapps-orders    omitRecurringScriptsFromLog: false          (mj.config.cjs:259)
more-cheese       omitRecurringScriptsFromLog: false          (mj.config.cjs:89)
bizapps-common    true  (line 123)  /  false (line 183)       — both, in one file
MJ core           not set → zod default false
```

MJ contradicts itself on the intended default:

```ts
config.ts:363    omitRecurringScriptsFromLog: z.boolean().default(false),   // schema default
config.ts:1048   omitRecurringScriptsFromLog: true,                          // fallback config
```

The fallback expresses the correct posture. The zod default is the opposite, so **a repo with a
`sqlOutput` block that simply omits the key silently selects the hazardous behaviour.** Omission
should be safe; today it is the trap.

### What the flag actually suppresses

Everything CodeGen marks recurring is a metadata *reconciler*: default column widths,
update-entities-from-schema, sync-schema-info, the entity heal, and the `EntityField` prune. All
structural DDL — materialized tables, wrapper views, special date fields, default-constraint
drops — passes `false` and is unaffected. `Entity` and `EntityField` `INSERT`s are non-recurring
and are unaffected. **Turning the flag on removes no statement a host needs.**

---

## 4. The sequencing trap that decides whether heals survive

**MJ core emits the prune unscoped, and core migrations run last on every upgrade.**

**48 of core's 49** prune invocations carry `@ExcludedSchemaNames='sys,staging'` and nothing
else — no `@EntityIDs`, no `@IncludedSchemaNames`. Core has no `includeSchemas` configured
(correct — it generates everything), so its emissions are global by construction, and
`sys,staging` excludes nothing that matters. Those statements therefore evaluate **every BizApps
schema present when they run.**

Set that against the documented upgrade path — `npx mj migrate -t v<version>` against core, on a
host that already has the apps installed. Core's 48 global prunes execute against a database
full of BizApps entities, at a moment core knows nothing about their view state.

**Consequence: heal migrations at the end of each app repo do not survive a subsequent core
upgrade.** Fixing core's scoping is not a companion improvement to the heals; it is the
precondition that makes them durable. If only one change ships, it is this one.

---

## 5. Scoping: by schema, not by entity

Scoping the prune to *processed/modified entities* is tempting and is wrong. The prune is itself
the discovery mechanism for stale fields:

```ts
const result = await this.LogSQLAndExecute(pool, sSQL, label, true);
if (result && result.length > 0) {
    ManageMetadataBase.addNewEntitiesToModifiedList(result.map(r => r.Entity));
}
```

It marks entities modified **based on what it deleted**. An entity whose column was dropped
produces no new field and no changed field — nothing else in CodeGen flags it — so it enters the
modified list only because the prune found it. Scope to processed entities and that entity is
never evaluated and its stale field survives indefinitely. The failure is silent and permanent.

Schema scoping has no such circularity: it narrows which schemas are eligible without narrowing
which entities inside them are compared. It is also already implemented and wired:

```ts
// heal-schema-params.ts — buildHealSchemaRoutineParams()
const include = (options.includeSchemas ?? []).map(s => s.trim()).filter(s => s.length > 0);
if (include.length > 0) { values.push(`'${include.join(',')}'`); names.push('IncludedSchemaNames'); }
```

All three app repos already set `includeSchemas`, so **new** captures from them are already
scoped. `@EntityIDs` is populated only on the late-phase geo-regen path; the main pass passes
`undefined`, which degrades to an unscoped full scan.

---

## 6. Plan

### Phase 1 — stop the bleeding (configuration only, no code)

Set `omitRecurringScriptsFromLog: true` in:

- `bizapps-orders/mj.config.cjs` (line 259)
- `more-cheese/mj.config.cjs` (line 89)
- `bizapps-common/mj.config.cjs` (line 183 — the second `sqlOutput` block; line 123 is already correct)

No new migration captured after this carries a prune. Nothing structural is lost (§3).

### Phase 2 — MJ core: the two real defects

1. **Flip the zod default** at `config.ts:363` to `true`, matching the fallback at `config.ts:1048`,
   so omission is safe rather than hazardous. This has real blast radius across every consumer —
   land it deliberately, with a changeset, not as a drive-by.
2. **Stop core emitting unscoped prunes into migrations.** Preferred form: core adopts the same
   omission and the prune becomes a live-CodeGen-only operation. If it must remain in core's
   migrations for core's own schema, it must carry `@IncludedSchemaNames='${flyway:defaultSchema}'`.

This is the phase that makes Phase 3 durable (§4).

### Phase 3 — heal, once, per repo

Last migration in each of **bizapps-orders** and **bizapps-common**. Follow the shape of
`bizapps-common/V202608140700` — it is the same fix and it is already proven in this family:

- `IF NOT EXISTS … INSERT` lifted verbatim, so it is idempotent and safe where rows already exist
- **hardcoded UUIDs** — never `NEWID()`
- apply-time `(SELECT COALESCE(MAX([Sequence]),0) FROM … WHERE EntityID = …) + 1` — never a literal `Sequence`
- placed after every statement that could prune the rows it inserts
- **no MJ-core migration** — the Addresses geo fields are bizapps-common's (§1)

Scope must be **measured, not assumed** — see §7.

### Phase 4 — guards, so "don't do it again" is not the mechanism

- **New CI gate, all four repos:** reject any migration containing `spDeleteUnneededEntityFields`.
  Deterministic, cheap, catches the class at authoring time.
- **Port `check-migration-entityfield-sequence.sh`** to `bizapps-orders` and `more-cheese`
  (MJ and bizapps-common already have it). bizapps-orders carries **829 of 886** `EntityField`
  INSERTs with a literal `Sequence`, the exact pattern that "cannot fail on a working dev database
  … fails only on fresh installs."
- **Do not** ship a migration that `RAISERROR`s on a view↔EntityField mismatch. It would brick a
  host upgrade on a benign difference. Put that assertion in the clean-room replay, where a
  failure costs a CI run instead of a customer's install.

---

## 7. What must be verified before Phase 3 is written

Phase 3 is the only phase whose correctness cannot be established by reading, and it is the one
that fails in the familiar way — green on every developer machine, red on every clean install.

1. **Which prune ate each field.** From a captured Flyway replay log, per entity. A heal placed
   *before* the prune that killed it passes locally and regresses on the next clean install —
   the same shape as the bug being fixed.
2. **Whether Phases 1 + 2 alone already fix it.** Run the clean install with Phases 1 and 2
   applied and nothing else. Whatever is still missing afterward is the real Phase 3 scope. It may
   be materially smaller than the five entities listed in §1, or empty.
3. **Confirm the failure mode, not just the absence.** For each field reported missing, record
   whether no row exists, or a row exists under a different name, and what its `Sequence` is.
4. **Search the replay log for `UQ_EntityField_EntityID_Sequence` violations** as well as
   foreign-key errors — MJ's own guidance notes these surface as an unrelated FK error.

---

## 8. Adjacent defects found while diagnosing (not blockers)

Recorded so they are not rediscovered; each deserves its own change.

- **`${mjSchema}` substituted into `EntityField` *names*.** 40 occurrences in bizapps-orders
  migrations read `Name = '${mjSchema}_Latitude'` / `'${mjSchema}_Longitude'` — a blanket
  `__mj` → `${mjSchema}` replacement that consumed the field name. It works only because
  `mjSchema` resolves to `__mj`; on a host with a non-default core schema the `EntityField` name
  will not match the view column, which CodeGen hardcodes as `__mj_Latitude`.
- **A live `Sequence` collision.** `bizapps-orders/V202609061900`, entity
  `66D82C24-9C9F-4CD6-B019-53C20274AB00`: `Sequence` 43 and 44 are each claimed by two different
  fields in the same file.
- **`MAX(Sequence) + N` where N > 1 is self-inflating.** `MAX` is re-evaluated per statement, so
  an intended contiguous block `+19, +20, +21, +22` yields a runaway rather than four adjacent
  values. Harmless today, but it makes `Sequence` values unstable and order-dependent.

---

## 9. Reference — evidence index

| Claim | Where to re-check it |
|---|---|
| Addresses is bizapps-common | `bizapps-common/migrations/B202602271452…sql:961` |
| `EntityField` INSERTs exist for 4/5 entities | grep `Name = '<field>'` across each repo's `migrations/*.sql` |
| Prune deletes them; prior diagnosis | `bizapps-common/migrations/V202608140700…sql`, header |
| Prune tagged recurring | `MJ/packages/CodeGenLib/src/Database/manage-metadata.ts:5438` |
| Flag honoured | `MJ/packages/CodeGenLib/src/Misc/sql_logging.ts:275` |
| Default contradiction | `MJ/packages/CodeGenLib/src/Config/config.ts:363` vs `:1048` |
| Schema scoping already wired | `MJ/packages/CodeGenLib/src/Database/heal-schema-params.ts:60-64` |
| Prune is the discovery mechanism | `MJ/packages/CodeGenLib/src/Database/manage-metadata.ts:5438-5442` |
| 48 unscoped core prunes | grep `spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'` in `MJ/migrations/v*/` |
| `@ResultTable` is provider-side | `SQLServerDataProvider` — `INSERT INTO @ResultTable EXEC spCreate<Entity>` |
