# Record Changes — Restore Prior Version

## Live progress tracker

This section is the working task list. Updated as each step lands. If a session dies, a new session can pick up by reading this section + the most recent commits on `amith-nagarajan/record-changes-restore`.

**Branch:** `amith-nagarajan/record-changes-restore` (tracks `origin/amith-nagarajan/record-changes-restore`)

| # | Task | Status | Commit |
|---|---|---|---|
| 0 | Migration `V202604191500__v5.28.x__Add_Restore_Lineage_To_RecordChange.sql` + CodeGen | ✅ Done | `f536d59` |
| 0a | Plan + mockup | ✅ Done | `d24ffc1` |
| 1a | `BaseEntity` restore-context plumbing (`RestoreContext` interface, `SetRestoreContext`/`ClearRestoreContext`) | ✅ Done | (see 1d commit) |
| 1b | `SQLServerDataProvider.GetLogRecordChangeSQL` writes new columns + SP migration `V202604191502__v5.28.x__Extend_spCreateRecordChange_Internal_For_Restore.sql` (committed `0ef6a17`) | ✅ Done | `0ef6a17` |
| 1c | `PostgreSQLDataProvider` parity (BuildRecordChangeSQL + computeSaveRecordChangeParams + GenerateDeleteSQL CTE) | ✅ Done | (see 1d commit) |
| 1d | Build MJCore + provider packages — MJCore 887/887, SQLServer 75/75, PG 60/60 | ✅ Done | uncommitted |
| 2a | `RestorePreviewPanelComponent` extracted in `ng-record-changes` (slide-in, two-mode, field-level opt-out, reason text area, cancelable BeforeRestoreCommit) | ✅ Done | uncommitted |
| 2b | Semantic-bug fix — restore now applies `FullRecordJSON` of the source change (not the one-delta rollback). Preview shows full current-vs-snapshot diff. | ✅ Done | uncommitted |
| 2c | Lineage chip in timeline + conditional/overflow filter chips (data-driven; "More filters ▾" popover when >2 conditional pills) | ✅ Done | uncommitted |
| 2d | Update `record-changes` tests — 48/48 passing | ✅ Done | uncommitted |
| 3 | `record-form-container.OnRestoreRequested` rewrite — applies `FieldValues`, calls `SetRestoreContext`/`ClearRestoreContext` around `Save()` | ✅ Done | uncommitted |
| 4a | RecycleBin event types (`recycle-bin-events.ts`) — Before*/After* cancelable pattern matching `EntityDataGridComponent` convention | ✅ Done | uncommitted |
| 4b | `RecycleBinComponent` (slide-in) + `RecycleBinChipComponent` (auto-counting toolbar chip) + new `@memberjunction/ng-record-changes` and `@memberjunction/ng-versions` peer dependencies | ✅ Done | uncommitted |
| 4c | Wire `ShowRecycleBin` (default `true`) into `EntityViewerComponent` (composite header) + `EntityDataGridComponent` (toolbar). Standalone `EntityCardsComponent` has no toolbar — handled by composite. | ✅ Done | uncommitted |
| 5 | README updates — new `record-changes/README.md` from scratch (mermaid + full API tables); `entity-viewer/README.md` extended with RecycleBin section + types + dep table | ✅ Done | uncommitted |
| 6 | Final build + test pass — record-changes 48/48, base-forms 33/33, MJCore 887/887, SQLServer 75/75, PG 60/60. Downstream `ng-explorer-core` and `ng-core-entity-forms` build clean. | ✅ Done | uncommitted |

### Follow-up refactor — provider duplication elimination

After the initial implementation landed, both providers carried near-identical dialect-agnostic logic for assembling the RecordChange payload (diff, JSON serialization, change description, restore-context derivation). That logic is now hoisted into `DatabaseProviderBase` so each provider only renders its dialect-specific SQL on top of a shared payload.

| # | Task | Status | Notes |
|---|---|---|---|
| R1 | Add `RecordChangeSource` type + `RecordChangePayload` interface to `baseEntity.ts`; export through `@memberjunction/core` | ✅ Done | Co-located with `RestoreContext` |
| R2 | Add `protected ShouldTrackRecordChanges()` + `protected BuildRecordChangePayload()` to `DatabaseProviderBase` | ✅ Done | Sits next to `DiffObjects` / `CreateUserDescriptionOfChanges` / `EscapeQuotesInProperties` |
| R3 | Refactor SQL Server `GetLogRecordChangeSQL` to use the new helper — only T-SQL `EXEC` rendering remains | ✅ Done | Net −15 LOC |
| R4 | Refactor PostgreSQL `BuildRecordChangeSQL` to use the new helper — only parameterized INSERT remains | ✅ Done | Net −20 LOC |
| R5 | Refactor PG `GenerateSaveSQL` + `GenerateDeleteSQL` inline CTE paths to use the helper; delete `computeSaveRecordChangeParams` and `shouldTrackRecordChanges` | ✅ Done | Net −55 LOC, two private helpers removed |
| R6 | Build + retest all three packages | ✅ Done | MJCore 887/887, SQL Server 75/75, PG 60/60 |

**Outcome:** ~85 LOC of duplicated payload-assembly removed across providers; new fields on RecordChange now require updating one base method and two SQL templates instead of four duplicated assembly sites.

## All work complete

The feature is implemented end-to-end and ready for commit. See "Files to be created/modified" near the bottom of this document for the full file list. The remaining open question per the plan — Restore Reason policy (`Entity.RequireRestoreReason BIT` flag) — is intentionally deferred per the plan and can be added later without schema work since `RestorePreviewPanelComponent` already exposes a `RequireReason` input.

## Goal

Add a first-class "Restore record to this version" capability on top of the existing `RecordChange` history. The infrastructure for tracking changes is already in place; what's missing is (a) a correct point-in-time restore (today's UI rolls back a single delta, not a state), (b) a lineage link from the new change back to the version it was restored from, and (c) an entry point for un-deleting hard-deleted records.

## Source of truth

This plan is grounded in `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (the ORM/Zod layer). Where this plan and historical migrations differ, the entity classes win.

Current `RecordChange` shape ([entity_subclasses.ts:19900](../../packages/MJCoreEntities/src/generated/entity_subclasses.ts#L19900)):

| Field | Type | Notes |
|---|---|---|
| `ID` | UNIQUEIDENTIFIER (PK) | newsequentialid() |
| `EntityID` | UNIQUEIDENTIFIER (FK Entity) | |
| `RecordID` | NVARCHAR(750) | composite-key serialization |
| `UserID` | UNIQUEIDENTIFIER (FK User) | |
| `Type` | NVARCHAR(20) | enum: `Create`, `Update`, `Delete`, `Snapshot` (Snapshot added in v4 for Version Labels) |
| `Source` | NVARCHAR(20) | enum: `Internal`, `External` |
| `ChangedAt` | DATETIMEOFFSET | |
| `ChangesJSON` | NVARCHAR(MAX) | field-level delta (old + new) |
| `ChangesDescription` | NVARCHAR(MAX) | human-readable summary |
| `FullRecordJSON` | NVARCHAR(MAX) | **complete snapshot AFTER the change** |
| `Status` | NVARCHAR(50) | enum: `Complete`, `Error`, `Pending` |
| `ErrorLog` | NVARCHAR(MAX) NULL | |
| `ReplayRunID` | UNIQUEIDENTIFIER NULL (FK) | external-change-detection replay tracking — unrelated to user restore, leave alone |
| `IntegrationID` | UNIQUEIDENTIFIER NULL (FK) | |
| `Comments` | NVARCHAR(MAX) NULL | |

`FullRecordJSON` is the linchpin: every change row carries the complete post-change state, so any change is a valid restore target without replaying intermediate deltas.

## What's already built

- **Backend write path** ([SQLServerDataProvider.ts:1140](../../packages/SQLServerDataProvider/src/SQLServerDataProvider.ts#L1140)) writes `RecordChange` rows in the same transaction as the entity Save/Delete, gated by `Entity.TrackRecordChanges`.
- **Diff computation** in `DiffObjects` ([databaseProviderBase.ts:318](../../packages/MJCore/src/generic/databaseProviderBase.ts#L318)).
- **Retrieval** via `BaseEntity.RecordChanges` ([baseEntity.ts:2965](../../packages/MJCore/src/generic/baseEntity.ts#L2965)) and `Metadata.GetRecordChanges`.
- **Timeline UI** with type-aware diffs ([ng-record-changes.component.ts](../../packages/Angular/Generic/record-changes/src/lib/ng-record-changes.component.ts), [.html](../../packages/Angular/Generic/record-changes/src/lib/ng-record-changes.component.html)).
- **A "Restore Previous Values" button** behind an `AllowRestore` opt-in input — but only on `Type='Update'` rows.
- **A confirm/preview modal** with side-by-side current vs. version values.
- **`OnRestoreRequested` handler** in `record-form-container` ([record-form-container.component.ts:635](../../packages/Angular/Generic/base-forms/src/lib/container/record-form-container.component.ts#L635)) that calls `record.Set()` per field and `record.Save()`.
- **Heavy-weight cousin** — `VersionHistory` package's `RestoreEngine` operates at Version Label granularity (multi-record, multi-entity, FK-ordered, with pre-restore safety labels and a `MJVersionLabelRestore` audit table). Different mental model; this plan does not modify it.

## Problems with what's there today

### 1. Semantic bug (must fix)
The current single-record restore reverts the *one delta the user clicked*, not the record state at that point in time. If history is `v1 → v2 → v3 (now)` and the user picks `v2`, only the fields `v2` modified get rolled back to `v2`'s old values. Anything `v3` touched but `v2` didn't is unchanged. This is almost never what a user means by "restore to this version".

### 2. No lineage / audit linkage
A restore today produces a normal `Update` change row, indistinguishable from any other edit. Auditors can't tell that a change was a restore, can't find the source version, can't follow the chain.

### 3. Update-only
The button is hidden on `Create`, `Delete`, and `Snapshot` rows. Users can't un-delete and can't roll back to the original state.

### 4. No discovery surface for hard-deleted records
For hard-deletes, the live record is gone; the user has no way to even see that something existed worth restoring. A `Recycle Bin`-style entry point is missing.

## Proposed schema changes

Single migration, single `ALTER TABLE`, with extended properties.

| Column | Type | Purpose |
|---|---|---|
| `RestoredFromID` | UNIQUEIDENTIFIER NULL (FK → RecordChange.ID, ON DELETE NO ACTION) | When non-null, points at the historical change whose state was restored to produce this row. |
| `RestoreReason` | NVARCHAR(MAX) NULL | Optional user-entered "why this restore happened" for audit. |
| Extend `Source` enum | add `'Restore'` | Drop+recreate `CHK_RecordChange_Source` to allow `'Internal'`, `'External'`, `'Restore'`. |

**Why not a separate `RecordChangeRestore` table?** Every restore already produces a normal `RecordChange` row via the same `Save()` pipeline — adding a side-table would double the write and force joins to render the timeline. Three additions to the existing row keep it cheap and indexable.

**Why `NVARCHAR(MAX)` for `RestoreReason`?** Per the user's instruction. Practically, most reasons will be a sentence; capping early would force awkward truncation in regulated-industry use cases (finance, healthcare audit logs).

**`ReplayRunID` is left alone** — it tracks the external-change-detection replay run, an entirely different concern.

**Migration file:** `migrations/v5/V202604191500__v5.29.x__Add_Restore_Lineage_To_RecordChange.sql` (in this folder for review, then commit to `migrations/v5/`).

After migration, run CodeGen to regenerate `MJRecordChangeEntity` so the new fields become strongly-typed properties (`record.RestoredFromID`, `record.RestoreReason`).

## Proposed UX

The mockup file in this folder (`mockup.html`) shows the actual visual treatment. Highlights:

### Restore action on every change row (not just Update)
- **Update / Snapshot**: "Restore record to this version"
- **Create**: "Restore to original state" (same mechanic — apply `FullRecordJSON`)
- **Delete**: "Re-create this record" (insert path, see un-delete section)

### Restored-from chip in the timeline
When a row has `RestoredFromID` set, render a badge: *"↶ Restored from Apr 12, 2026 11:42 AM by Amith"*. Click jumps to and highlights the source row in the same timeline. Builds the version chain visually.

### Conditional, non-cluttering filter chips
Today the timeline always renders `All / Updates / Creates / Deletes` regardless of what's actually present. Proposed rule (revised based on review):

- **Always render** the `All` chip.
- **Render type chips only when at least one row of that type exists** in the loaded history. No deletes → no Deletes chip. No restores → no Restored chip. Keeps the bar uncluttered for the 90% case (a record with only updates).
- **Overflow rule:** if more than **2** conditional chips would render, collapse them into a single **"More filters ▾"** trigger that opens a small popover panel with checkboxes for each available chip. The popover shows live counts (e.g., "Updates · 12") and an "Apply" / "Clear" pair. Selected filters become inline pills next to the trigger, with an `×` to remove individually.
- This rule is data-driven by what's actually loaded — no hard-coded list. Adding a future change-type or source becomes free.

### Confirm slide-in — full-record diff with field opt-out
*Slide-in panel (not modal)* so it's reusable from both the timeline and the Recycle Bin without context loss. Lives in `@memberjunction/ng-record-changes` as `RestorePreviewPanelComponent`.

- Header: "Restore *Customer X* to version of *Apr 12, 2026 11:42 AM*".
- Table columns: ☑ | Field | Current Value | Restore To | (warning indicator).
- Pre-checked rows: every field where current ≠ snapshot. Unchanged fields render collapsed under a "12 fields will not change" disclosure.
- Field-level checkboxes let the user deselect specific fields ("restore the description but keep the new status").
- Optional "Reason for restore" text area, persisted to `RestoreReason`.
- Footer notice: *"A snapshot of the current state will be saved automatically before this restore."*
- Two buttons (per MJ convention, primary on the left): **[Restore]** **[Cancel]**.
- For the un-delete (insert) variant, the panel switches its current/restore columns to a single "Will be created with" column and surfaces a PK-collision warning if relevant.

### Un-delete entry points
Two surfaces, depending on delete style:

**Soft deletes (`IsDeleted` flag, `Status='Inactive'`, etc.)** — record still exists in the table, so the standard Restore flow on the soft-deleted record works as-is. Nothing new needed beyond making the side panel openable on records the user can read.

**Hard deletes** — the record row is gone. Surface a **per-entity Recycle Bin** as a first-class feature of the entity viewer (revised based on review):

- **Where it lives**: new standalone component `RecycleBinComponent` (selector `mj-recycle-bin`) in the `@memberjunction/ng-entity-viewer` package, alongside the existing `EntityDataGridComponent` and `EntityCardsComponent`. Reuses the same package because it's conceptually part of viewing entity data.
- **Embedded automatically** in `EntityViewerComponent`, `EntityDataGridComponent`, and `EntityCardsComponent` toolbars via a single boolean input `ShowRecycleBin` (default `true`). Consumers who don't want it pass `[ShowRecycleBin]="false"`.
- **Permission gate (revised)**: visible only when **`entity.UserPermissions.CanDelete === true`** (not `CanCreate`). Rationale: there is no native "undelete" permission, but if the user has the higher-trust permission to *delete* records of this entity, restoring deleted ones is well within scope. This intentionally restricts the Recycle Bin to higher-permission users (delete usually being more restricted than create). If the user has Delete permission but not Create permission, the actual restore action shows but disables with a tooltip — they can browse but not restore. The Recycle Bin chip itself only renders when:
  1. `Entity.TrackRecordChanges === true`, AND
  2. `entity.UserPermissions.CanDelete === true`, AND
  3. At least one `RecordChange` with `Type='Delete'` exists for the entity.
- **Cancelable Before/After events** following the existing `EntityDataGridComponent` event pattern. Lets consumers intercept (e.g., to require a custom approval workflow, to log to an external system, or to take over the actual restore execution):
  - `beforeRecycleBinOpen` (cancelable) / `afterRecycleBinOpen`
  - `beforeRecordRestore` (cancelable, exposes `recordChange`, `entityName`, `recordId`, `snapshotData`) / `afterRecordRestore`
  - `beforeRestoreCommit` (cancelable, fires after user confirms in the slide-in but before the insert) / `afterRestoreCommit`
- **Display**: opens as a slide-in panel (matching `record-changes` panel pattern). Each card shows the first NameField + up to three "interesting" fields heuristically chosen from `FullRecordJSON`, plus deleted-by/at metadata, plus `[Restore]` and `[View history]` buttons. Clicking Restore launches the `RestorePreviewPanelComponent` from the record-changes package in its un-delete variant.

**Future entry points** (deferred): "Show deleted" toggle on related-records grids; global admin "Recently Deleted" dashboard widget.

### Permissions summary
| Action | Required Permission |
|---|---|
| Open the timeline panel | Entity `CanRead` |
| Restore a live record (Update / Snapshot / Create source) | Entity `CanUpdate` |
| Open the Recycle Bin | Entity `CanDelete` |
| Re-create a hard-deleted record | Entity `CanDelete` AND `CanCreate` (Create needed for the actual insert; if missing, Restore button disables with tooltip) |

No new permission concept introduced.

## How the restore actually executes

### Update / Snapshot / Create restore (live record exists)
1. Reload the live record (concurrency safety — discard cached state from when the user opened the panel).
2. Parse `change.FullRecordJSON` of the target version.
3. For each field in `EntityInfo.Fields`:
   - Skip read-only, primary-key, and `__mj_*` fields (mirrors `RestoreEngine.applySnapshotToEntity` at [RestoreEngine.ts:386](../../packages/VersionHistory/src/RestoreEngine.ts#L386)).
   - If the user deselected the field in the modal, skip.
   - If the field no longer exists on the entity (schema drift), skip and surface in the result toast.
   - Otherwise `record.Set(field.Name, snapshotValue)`.
4. Set the new lineage fields **on the entity instance about to be saved** so they're persisted alongside the change tracking row:
   - The simplest route: extend `RestoreVersionEvent` with `SourceChangeID` and `Reason`, and have the container set those onto a transient context the SQL provider reads when it generates the next `RecordChange` insert. See "Open implementation question" below.
5. `record.Save()` — the existing transaction-bound `GetLogRecordChangeSQL` writes the new `RecordChange` row with `Source='Restore'`, `RestoredFromID=<source>`, `RestoreReason=<entered>`.
6. Refresh the timeline; emit a notification.

### Delete restore (live record is gone)
1. Parse the deletion change's `FullRecordJSON`.
2. Materialize a fresh entity via `Metadata.GetEntityObject<T>(EntityName)`.
3. Apply snapshot fields including the original primary key (since FK references elsewhere may still point to it).
4. Save (insert path). The existing change-tracking writes a `Type='Create'` row with `Source='Restore'` and `RestoredFromID` pointing at the original delete change.
5. Edge case — primary-key collision: a new record was created with the same business key after the delete. Surface a conflict dialog: *"A record with this ID already exists. Open it instead?"* — do not silently overwrite.

### Open implementation question (resolve during build)
Where do `RestoredFromID` and `RestoreReason` come from when the SQL provider builds the `RecordChange` insert? Two options:

- **Option A — transient context on `BaseEntity`**: add a `_restoreContext: { sourceChangeId, reason } | null` field; `SQLServerDataProvider.GetLogRecordChangeSQL` reads it when generating the EXEC statement. Cleanest separation of concerns, but touches `BaseEntity` core.
- **Option B — pass through `Save()` options**: extend `EntityRecordSaveOptions` with `RestoreContext`, plumb to provider. Less invasive to `BaseEntity` shape but requires all save paths to forward the option.

Recommendation: **Option A**. The restore context is conceptually part of the entity's pending change, not a save-call argument. Cleared after `Save()` returns.

## Edge cases worth being explicit about

| Case | Handling |
|---|---|
| Read-only / system fields in snapshot | Skip per `applySnapshotToEntity` pattern. |
| Field renamed/dropped since snapshot | Detect during preview build; render row as *"⚠ Field no longer exists — will be skipped"*. Don't fail. |
| FK target no longer exists (e.g., snapshot has `OwnerUserID = X`, user X deleted) | Render warning row: *"⚠ Referenced user no longer exists — set to NULL"* (if column nullable) or *"⚠ Will fail to save"* (if NOT NULL). Let the user proceed knowingly. |
| Concurrent edit between preview-open and confirm | Re-read live record on confirm; if delta changed, show a non-destructive *"Record was modified by Y while you were reviewing — refresh diff?"* prompt. |
| Restoring a Snapshot row | Same as Update — `FullRecordJSON` semantics are identical. |
| Restore loops (A→B→restore-A→restore-B) | Handled naturally; `RestoredFromID` builds a DAG, not a tree. |
| Cascading restores (restoring a parent leaves children inconsistent) | **Out of scope.** Surface a "Need to restore related records too?" link that pivots to the Version Label flow ([RestoreEngine](../../packages/VersionHistory/src/RestoreEngine.ts)). |
| External-source changes with partial `FullRecordJSON` | Allow restore but flag with a warning chip in the preview header. |
| Hard-delete then re-insert with same PK | PK collision dialog (see un-delete section). |

## Component architecture & package boundaries

```
@memberjunction/ng-record-changes  (existing package, new component added)
├─ RecordChangesComponent          (existing — timeline)
└─ RestorePreviewPanelComponent    (NEW — slide-in, reusable from anywhere)
       inputs:  RecordChange, EntityName, LiveRecord (optional — null = un-delete mode)
       outputs: RestoreConfirmed, RestoreCancelled, beforeRestoreCommit (cancelable)

@memberjunction/ng-entity-viewer   (existing package, new component added)
├─ EntityViewerComponent           (existing — composite, gains [ShowRecycleBin])
├─ EntityDataGridComponent         (existing — gains toolbar Recycle Bin chip)
├─ EntityCardsComponent            (existing — gains toolbar Recycle Bin chip)
└─ RecycleBinComponent             (NEW — slide-in panel listing deleted records)
       depends on: ng-record-changes for RestorePreviewPanelComponent
```

**Why this split:** the restore preview is RecordChange-centric and would be needed even if the Recycle Bin didn't exist (it's used from the timeline too). The Recycle Bin is entity-grid-centric — it discovers candidates by querying RecordChange filtered to an entity. Putting them in their natural packages means each can be consumed independently.

**Documentation expectations** (matching the `entity-viewer` README pattern verbatim):
- Mermaid architecture diagram in the package README.
- Full Inputs/Outputs/Events tables for every new component.
- Cancelable Before/After event pattern with `event.cancel = true` / `event.cancelReason = '...'` semantics.
- Comprehensive JSDoc on every public input/output/method including `@example` blocks.
- Type exports listed in a "Type Exports" section.
- Dependencies and peer dependencies enumerated.

## Implementation order

1. **Migration** (this PR — already created) — `RestoredFromID`, `RestoreReason`, extend `Source` enum, extended properties. User runs migration + CodeGen before further work begins.
2. **Semantic-bug fix in existing timeline** — `record-form-container.OnRestoreRequested` should apply `change.FullRecordJSON` (full state), not iterate `event.FieldChanges` (one delta). Update the preview builder in `ng-record-changes.component.ts` to compute current vs. snapshot for every entity field, not just the clicked change's delta. Tests in `packages/Angular/Generic/record-changes/src/__tests__/restore-version.test.ts` will need updating.
3. **Lineage plumbing** — restore-context on `BaseEntity` + provider read in `GetLogRecordChangeSQL` (Option A from earlier section). Persist `RestoredFromID`, `Source='Restore'`, `RestoreReason`. PostgreSQL provider parity update.
4. **Extract `RestorePreviewPanelComponent`** as a standalone reusable component in `ng-record-changes`. Replace the inline modal in the timeline with a hosted instance. Includes:
   - Field-level opt-out checkboxes
   - Reason text area
   - Slide-in panel (not modal-overlay) so context is preserved
   - Cancelable `beforeRestoreCommit` event
   - Two-mode rendering: live-record diff mode + un-delete mode
5. **Timeline lineage chip** + **conditional/overflow filter chips** (data-driven, "More filters ▾" popover when >2 conditional chips).
6. **`RecycleBinComponent` in `ng-entity-viewer`** — slide-in panel listing distinct deleted records, fed from `RecordChange` queries, gated on `entity.UserPermissions.CanDelete`.
7. **Toolbar wiring**: `ShowRecycleBin` boolean (default true) on `EntityViewerComponent`, `EntityDataGridComponent`, `EntityCardsComponent` — adds the chip with live count.
8. **Cancelable Before/After event surface** for Recycle Bin actions: `beforeRecycleBinOpen`, `afterRecycleBinOpen`, `beforeRecordRestore`, `afterRecordRestore`, `beforeRestoreCommit`, `afterRestoreCommit`.
9. **Documentation**: README updates for both packages with mermaid diagrams, full API tables, JSDoc on every public surface; storybook-style examples in the README.
10. **(Later)** Optional `Entity.RequireRestoreReason` flag for regulated environments.
11. **(Later)** "Show deleted" toggle on related-records grids.
12. **(Later)** Global "Recently Deleted" admin dashboard widget.

## What this plan deliberately does not do

- Does not unify single-record restore with `RestoreEngine` / Version Labels — different scopes, different mental models. They can converge later if it stops feeling forced.
- Does not auto-create a Version Label per restore — would pollute the label namespace; the implicit `RecordChange` snapshot is sufficient.
- Does not modify `ReplayRunID` or external-change-detection replay machinery.
- Does not introduce a new permission — restore is a write, gated by existing `CanUpdate` / `CanCreate`.

## Files to be created/modified

### New
- `migrations/v5/V202604191500__v5.29.x__Add_Restore_Lineage_To_RecordChange.sql`
- `plans/record-changes-restore/plan.md` (this file)
- `plans/record-changes-restore/mockup.html`

### Modified / new (in subsequent PRs)

**Backend / shared core**
- `packages/MJCore/src/generic/baseEntity.ts` — restore context plumbing (Option A).
- `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` — read restore context in `GetLogRecordChangeSQL`.
- `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts` — same change for PG.

**`@memberjunction/ng-record-changes`**
- New: `src/lib/restore-preview-panel/restore-preview-panel.component.{ts,html,css}` — reusable slide-in panel.
- Modified: `src/lib/ng-record-changes.component.{ts,html}` — host the new preview panel; rewire timeline to use full snapshot semantics; add lineage chip; add conditional/overflow filter chips.
- Modified: `src/__tests__/restore-version.test.ts` — update for full-snapshot semantics.
- Modified: `README.md` + `public-api.ts` — document and export `RestorePreviewPanelComponent` and its event/input types.

**`@memberjunction/ng-entity-viewer`**
- New: `src/lib/recycle-bin/recycle-bin.component.{ts,html,css}` — slide-in panel listing deleted records.
- New: `src/lib/recycle-bin/events/recycle-bin-events.ts` — Before/After cancelable event arg types.
- Modified: `src/lib/entity-viewer/entity-viewer.component.ts` — `ShowRecycleBin` input + Recycle Bin chip in toolbar.
- Modified: `src/lib/entity-data-grid/entity-data-grid.component.ts` — same.
- Modified: `src/lib/entity-cards/entity-cards.component.ts` — same.
- Modified: `src/module.ts` + `src/public-api.ts` — declare/export `RecycleBinComponent` and event types.
- Modified: `README.md` — full mermaid + API table treatment for Recycle Bin per existing convention.
- New peer dependency: `@memberjunction/ng-record-changes` (for the restore preview panel).

**`@memberjunction/ng-base-forms`**
- Modified: `src/lib/container/record-form-container.component.ts` — `OnRestoreRequested` rewrite to use full snapshot + lineage; consume `RestorePreviewPanelComponent` instead of inline preview.

## Open questions for the user before implementation

1. **Restore Reason policy**: keep purely optional, or add `Entity.RequireRestoreReason BIT` for regulated tables? (Plan punts to "later".)
2. **Hard-delete PK reuse policy**: hold the original `ID` when un-deleting (preserves dangling FKs) vs. assign new `ID` (clean slate). Plan recommends preserve.
3. **Recycle Bin default visibility**: always visible when entity has tracking on, or behind a per-user preference toggle?
