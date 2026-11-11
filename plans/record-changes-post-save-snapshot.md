# Record Changes — Aligning `FullRecordJSON` with Stored Post-Save State Under Delta Updates

**Status:** Implemented (Option A) — see [Outcome](#outcome-option-a-implemented)
**Date:** 2026-11-09
**Scope:** `@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`
**Related:** PR [#6474](https://github.com/MemberJunction/MJ/pull/6474) (`plans/orm-improvements-ef-comparison.md`), PR [#6490](https://github.com/MemberJunction/MJ/pull/6490) (`plans/transaction-group-concurrency.md`), [#6468](https://github.com/MemberJunction/MJ/issues/6468), [#4339](https://github.com/MemberJunction/MJ/issues/4339), [PR #6474 review comment](https://github.com/MemberJunction/MJ/pull/6474#issuecomment-6744739815), [#6468 review conditions](https://github.com/MemberJunction/MJ/issues/6468#issuecomment-6728103040)

---

## Outcome: Option A implemented

`FullRecordJSON` for tracked creates and updates is built in the save's own statement from the returned row: `FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES` over `@ResultTable` on SQL Server, `row_to_json` over `save_result` on PostgreSQL. `ChangesJSON` and `ChangesDescription` are still computed in TypeScript. Deletes are unchanged.

### What the investigation found in real databases

Read from local SQL Server databases (`more-cheese-2`, `agrip2`, `Skip-3`) and PostgreSQL databases (`mc_pg`, `more-cheese`, `mj_pg_test`):

- **Decrypted secrets in the audit table.** Every `MJ: Credentials` Record Change held the decrypted `Values` (289 rows in one database) while the table held ciphertext. Option A records the ciphertext.
- **Stale update snapshots.** `__mj_UpdatedAt` was the pre-save value; another writer's change was missing.
- **Incomplete create snapshots.** Null ID, timestamps and joined display values.
- **Numbers at the wrong precision.** JavaScript values rather than what the column stored (`63.760888` recorded where `int` stored `63`).
- **PostgreSQL doubled apostrophes.** `EscapeQuotesInProperties` is applied, then the JSON is bound as a parameter, so `'` was stored as `''`. Option A fixes this for `FullRecordJSON` on saves; deletes and `ChangesJSON` still have it (follow-up below).
- Older rows on one database stored dates as `{}` (an earlier bug, already fixed).

### Format decisions

Each column is rendered the way a loaded entity serializes it, so readers that compare an old snapshot with a new one as strings see no false changes:

| Column type | Rendered as |
|---|---|
| `datetime2`, `smalldatetime`, `datetimeoffset`, `timestamptz` | UTC `YYYY-MM-DDTHH:MM:SS.mmmZ`, milliseconds truncated (as the driver does) |
| `datetime` | Same, milliseconds rounded (it stores 1/300-second ticks; the driver rounds) |
| `date` / `time` | `YYYY-MM-DDT00:00:00.000Z` / `1970-01-01THH:MM:SS.mmmZ` |
| `bigint` | String (as the drivers return it) |
| binary | base64 (PostgreSQL `bytea` would otherwise be `\x…` hex) |
| `json`/`jsonb`, `xml`, `sql_variant`, unknown types | Text |
| `geography`, `geometry`, `hierarchyid` | `.ToString()` (`FOR JSON` refuses CLR types with error 13604 and fails the whole save) |

Without the explicit `Z`, `datetime`/`datetime2` values (MJ stores them as UTC) would be read as local time by every restore path.

### Fallbacks to the in-memory snapshot

- Entities whose compiled procedure returns datestamps only (15 high-volume log entities), and PostgreSQL saves that project the result to datestamps: there is no full row to read.
- SQL Server entities with a `.` in a column name, which `FOR JSON PATH` would nest.

A restricted user's update now reads stored values only for fields the object wrote without having read them (needed for the diff's old values), not the whole row.

### Verified

- Unit tests in the three changed packages, plus a mutation check that the new tests fail without the change.
- Live tests against a fresh SQL Server and a fresh PostgreSQL database (`record-change-snapshot-live-db.integration.test.ts` in each provider, env-gated): create snapshot holds server values; a stale writer's snapshot carries another server's change and the stored `__mj_UpdatedAt`; restoring that version keeps the other change; encrypted values are ciphertext; every column type renders as above, including under a non-UTC PostgreSQL session. With the old behavior forced, the snapshot checks fail on both databases.
- Deterministic integration tier on SQL Server.

### Follow-ups (not in this change)

1. **PostgreSQL `''` in deletes and `ChangesJSON`.** Same root cause as above; needs the payload builder to skip SQL quote escaping when the value is bound as a parameter.
2. **Readers comparing snapshots across formats.** VersionHistory `DiffEngine` and the label diffs compare with string/JSON equality, so a pre-change snapshot vs a post-change one can still differ on UUID case, encrypted values and PostgreSQL apostrophes.
3. **Create cards list more fields.** `ng-record-changes` `GetCreatedFields` will now show `__mj_` timestamps and joined display fields, which are no longer null; filter `__mj_` and virtual fields there.
4. **Encrypted fields in readers.** Restore previews show `$ENC$…` and always mark the field changed; Predictive Studio's continuity check treats ciphertext vs decrypted current value as a mismatch. Restoring ciphertext works while the key is unchanged.
5. **Other snapshot writers keep the old format.** VersionHistory `SnapshotBuilder` and Predictive Studio `WriteHistorySnapshots` (decrypted, in-memory), and the IS-A sibling writer (`FOR JSON` without `INCLUDE_NULL_VALUES`).

---

## Why this plan exists

PR [#6474](https://github.com/MemberJunction/MJ/pull/6474) shipped delta-only `spUpdate*` / `fn_update*` bindings on `GenericDatabaseProvider` (`DeltaUpdates = true` by default). When an existing record is updated on an entity with a CodeGen-generated update routine (`spUpdateGenerated === true`), the provider binds **only primary keys and dirty editable columns** (plus `_Clear` flags for explicit `NULL` assignments), leaving untouched columns at their `= NULL` parameter defaults so `ISNULL(@Param, [Col])` / `COALESCE(p_param, "Col")` preserves concurrent database writes.

That resolves cross-process lost updates on the live table ([#4339](https://github.com/MemberJunction/MJ/issues/4339), [#6468](https://github.com/MemberJunction/MJ/issues/6468)). However, as highlighted during review ([PR #6474 comment](https://github.com/MemberJunction/MJ/pull/6474#issuecomment-6744739815) and [#6468 review](https://github.com/MemberJunction/MJ/issues/6468#issuecomment-6728103040)), **`RecordChange.FullRecordJSON` is still assembled in TypeScript before `spUpdate*` executes**, from `entity.GetAll(false)`:

1. Process A and Process B both load row `R` at $t_0$ (`Col1 = 'v0'`, `Col2 = 'w0'`).
2. Process A updates `Col1 = 'v1'` at $t_1$. The live row in SQL is now `{ Col1: 'v1', Col2: 'w0' }`.
3. Process B (still holding `Col1 = 'v0'` in memory) updates `Col2 = 'w1'` at $t_2$.
   - **Live table:** `{ Col1: 'v1', Col2: 'w1' }` — **correct** (delta update preserved `Col1 = 'v1'`).
   - **`RecordChange.ChangesJSON` & `ChangesDescription`:** records only `Col2: 'w0' -> 'w1'` — **correct**.
   - **Process B's in-memory entity after `Save()`:** `{ Col1: 'v1', Col2: 'w1' }` — **correct** (`finalizeSave` hydrates from the row returned by `spUpdate*`).
   - **`RecordChange.FullRecordJSON` on B's audit entry:** `{ Col1: 'v0', Col2: 'w1' }` — **stale on `Col1`**, because `BuildRecordChangeSnapshots` serialized `entity.GetAll(false)` *before* `spUpdate*` ran.

While strictly better than the pre-#6474 behavior (where Process B *also* overwrote the live table with `Col1 = 'v0'`), a stale `FullRecordJSON` means **restoring** a record to Process B's `RecordChange` version can re-introduce `Col1 = 'v0'` even though `Col1` was already `'v1'` in the database when B's save committed.

---

## What is true today

| Component | File & Method | Current behavior |
|---|---|---|
| Snapshot builder | `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` — `BuildRecordChangeSnapshots` (~line 2378) | On full-width entities (`entity.HoldsEveryField() === true`), sets `NewData = entity.GetAll(false)` and `OldData = entity.GetAll(true)` with zero extra reads. On narrowed entities (FLS or partial `Fields` load), reads the current stored row first and overlays dirty fields onto it. |
| Diff & payload builder | `packages/MJCore/src/generic/databaseProviderBase.ts` — `BuildRecordChangePayload` (~line 3075) | Computes `ChangesJSON` and `ChangesDescription` by diffing `NewData` vs `OldData`, and serializes `FullRecordJSON = JSON.stringify(EscapeQuotesInProperties(NewData))` (SQL Server) or unescaped JSON (PostgreSQL). |
| SQL Server single-batch wrapper | `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` — `WrapSaveCallWithRecordChange` (~line 1995) | Executes `INSERT INTO @ResultTable EXEC spUpdate...; EXEC [__mj].spCreateRecordChange_Internal @FullRecordJSON = N'...', ...; SELECT * FROM @ResultTable;` in **one round-trip**. |
| PostgreSQL single-batch wrapper | `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts` — `WrapSaveCallWithRecordChange` (~line 1226) | Executes `WITH save_result AS (SELECT * FROM fn_update...), record_change AS (INSERT INTO "__mj"."RecordChange" ... VALUES (..., $7::text, ...)) SELECT * FROM save_result;` in **one round-trip**. |

### Architectural constraints any fix must respect

1. **`SaveReturnMode === 'datestamps_only'`:** When an entity or `EntitySaveOptions` requests `datestamps_only`, `ProjectSaveCallToDatestamps` narrows the returned row to PK + `__mj_CreatedAt` / `__mj_UpdatedAt`. `@ResultTable` (on SQL Server when `spUpdate` returns the full view row before projection) *does* hold the full view row prior to final `SELECT` projection, whereas on PostgreSQL `save_result` holds the full composite return of `fn_update*` before outer projection. Verify both paths!
2. **Encrypted columns (`EntityField.Encrypt === true`):** What is stored in `RecordChange.FullRecordJSON` today? Let's keep strict parity with `BuildRecordChangeSnapshots` / FLS / encryption policies: today `entity.GetAll(false)` holds decrypted in-memory values (or ciphertext when `AllowDecryptInAPI === false`), whereas `@ResultTable` / `save_result` in SQL holds raw database column values (ciphertext for encrypted columns). **Crucial security check:** storing raw SQL row JSON avoids leaking plaintext into `RecordChange.FullRecordJSON`, *or* post-processing in TypeScript preserves exact formatting parity — the chosen design must verify `ciphertext-cache.checks.ts` and `encrypted-read-client.checks.ts` expectations for `RecordChange.FullRecordJSON`.
3. **Round-trip budget:** `TrackRecordChanges` is enabled (`true`) on the majority of MJ entities. Adding an unconditional second SQL round-trip to every update would double DB round-trips on standard saves unless either:
   - `FullRecordJSON` is synthesized **inside the existing single SQL batch** from `@ResultTable` (SQL Server `FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES`) / `save_result` (PostgreSQL `row_to_json(save_result)::text`), **or**
   - A post-save TypeScript `RecordChange` insert runs inside `saveTxScope` only when needed.

---

## Candidate Designs

### Option A — Synthesize `FullRecordJSON` inside the single SQL batch (Recommended to prototype first)

Keep `ChangesJSON` and `ChangesDescription` computed in TypeScript (since they depend only on the caller's dirty fields, which B owns authoritatively, and use MJ's rich human-readable formatting), while deriving `FullRecordJSON` **in SQL directly from the post-update row** already captured in `@ResultTable` / `save_result`:

* **SQL Server (`WrapSaveCallWithRecordChange`):**
  `@ResultTable` already captures the full `SELECT * FROM vwEntity` emitted at the end of `spUpdate*`! Instead of passing a literal `@FullRecordJSON = N'...'` on UPDATE, declare:
  ```sql
  DECLARE @PostSaveFullRecordJSON NVARCHAR(MAX) = (
      SELECT * FROM @ResultTable FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
  );
  EXEC [__mj].spCreateRecordChange_Internal
      ...,
      @FullRecordJSON = @PostSaveFullRecordJSON,
      ...;
  ```
* **PostgreSQL (`WrapSaveCallWithRecordChange`):**
  In the existing `WITH save_result AS (...)` CTE:
  ```sql
  record_change AS (
      INSERT INTO "__mj"."RecordChange" (..., "FullRecordJSON", ...)
      SELECT ..., row_to_json(save_result)::text, ...
      FROM save_result
      RETURNING 1
  )
  ```

**Pros:**
- **Zero extra round-trips** — keeps the 1-batch architecture on both SQL Server and PostgreSQL.
- **Guaranteed atomic truth** — `FullRecordJSON` is byte-for-byte the exact post-update view row (including database triggers, computed columns, joined virtual view columns like `Category`, and fresh `__mj_UpdatedAt`, which pre-save `entity.GetAll(false)` previously had as stale!).
- Eliminates sending a multi-kilobyte `@FullRecordJSON` string literal from Node.js to SQL on every tracked update!

**Nuances to validate in Option A:**
1. **JSON value formatting parity with Restore:** Check every consumer of `RecordChange.FullRecordJSON` (specifically `RestoreContext` / Explorer Record Changes UI diff viewer / `RecordChange` restore logic) to confirm `FOR JSON PATH, INCLUDE_NULL_VALUES` and `row_to_json()` date/boolean/UUID formatting (`bit` -> `true`/`false` in `FOR JSON PATH`, `datetimeoffset` ISO-8601 strings) deserializes identically through `LoadFromData` / `SetMany`.
2. **Encrypted columns:** In `@ResultTable` / `save_result`, encrypted columns hold `$ENC$...` ciphertext rather than plaintext — which is actually **more secure** at rest in `RecordChange.FullRecordJSON`! Verify how Restore handles `$ENC$...` values when hydrating an entity for restore.
3. **Custom `spUpdate` (`spUpdateGenerated === false`) returning no rows or partial columns:** `WrapSaveCallWithRecordChange` already requires `spUpdate` to match `@ResultTable` columns; keep `@FullRecordJSON` fallback via `ISNULL(@PostSaveFullRecordJSON, N'...')` if `@ResultTable` is empty.

### Option B — Two-step write inside `saveTxScope` (Fallback if Option A hits formatting incompatibilities)

If consumers of `FullRecordJSON` strictly require TypeScript `PostProcessRows` output:
1. Enlist `TrackRecordChanges` updates in `saveTxScope` (`ShouldEnlistSaveInTransaction` returns `true` on tracked delta updates).
2. Execute `spUpdate*` (forcing full view row return even if `SaveReturnMode === 'datestamps_only'`), run `PostProcessRows`, and then execute `spCreateRecordChange_Internal` as a second statement inside the same transaction before `saveTxScope.Commit()`.

**Trade-off:** Adds `BEGIN TRAN` + second query + `COMMIT` to every tracked update. Only choose Option B if Option A's SQL-native JSON serialization breaks an existing `FullRecordJSON` consumer that cannot be normalized.

---

## Workstreams

### WS1 — Audit all `FullRecordJSON` readers & Restore flows
1. Audit every reader of `RecordChange.FullRecordJSON` across the monorepo (`MJCore`, `MJCoreEntities`, `MJServer`, `Angular/Generic/record-changes`, `TestingFramework/integration-test-suite`).
2. Document exact expectations for:
   - `bit` / `boolean` serialization (`true`/`false` vs `1`/`0`),
   - `Date` / `datetimeoffset` ISO strings,
   - `NULL` key presence (`INCLUDE_NULL_VALUES`),
   - Encrypted fields (`$ENC$...`) during Restore,
   - Virtual / joined view columns.

### WS2 — Implement post-save `FullRecordJSON` capture on SQL Server & PostgreSQL
1. Implement Option A (SQL-derived `FullRecordJSON` from `@ResultTable` / `save_result` on `isUpdate && useDeltaUpdate`, or across all tracked saves if formatting parity holds).
2. Ensure `SaveReturnMode: 'datestamps_only'` still projects only PK + datestamps on the outer `SELECT` returned to the caller while `@ResultTable` / `save_result` captures the full view row internally for `FullRecordJSON` (already how SQL Server `ProjectSaveCallToDatestamps` works!).
3. Remove redundant pre-save `Load` in `BuildRecordChangeSnapshots` on narrowed updates if `FullRecordJSON` now comes from the stored post-update row and `ChangesJSON` diffs only loaded dirty fields! (Verify `save-delete-paths.test.ts` narrowed-object tests.)

### WS3 — Unit & Multi-Connection Live DB Verification
1. **Unit tests (`SQLServerDataProvider` & `PostgreSQLDataProvider`):**
   - Verify generated SQL wrapper derives `FullRecordJSON` from `@ResultTable` / `save_result` with `INCLUDE_NULL_VALUES` / `row_to_json`.
   - Verify `ChangesJSON` and `ChangesDescription` continue to record **only** the caller's dirty fields.
2. **Live DB concurrent delta-update + Restore integration test:**
   - Connection Pool 1 and Pool 2 load the same `TrackRecordChanges = true` entity at $t_0$.
   - Pool 1 updates `DisplayName = 'From Pool 1'` and saves.
   - Pool 2 (stale `DisplayName` in memory) updates `Description = 'From Pool 2'` and saves.
   - Query `[__mj].[RecordChange]` for Pool 2's entry:
     - Assert `ChangesJSON` contains **only** `Description`.
     - Assert `JSON.parse(FullRecordJSON)` contains **both** `DisplayName === 'From Pool 1'` **and** `Description === 'From Pool 2'`, plus the post-save `__mj_UpdatedAt`!
   - Execute a subsequent edit + **Restore** back to Pool 2's `RecordChange` snapshot and assert `DisplayName === 'From Pool 1'` is preserved rather than reverted!

---

## Decisions needed from reviewers

1. **Option A (SQL `FOR JSON PATH` / `row_to_json` in 1 round-trip) vs. Option B (TypeScript post-processed 2nd query in transaction):** Confirm Option A is preferred assuming `bit`/`datetimeoffset`/encryption restore parity passes.
2. **Scope of Option A:** Apply SQL-derived `FullRecordJSON` to **all** tracked `CREATE` + `UPDATE` saves (so `FullRecordJSON` *always* includes DB defaults, triggers, joined virtual columns, and fresh `__mj_UpdatedAt` while cutting wire payload size to SQL), or **only** delta `UPDATE`s first?
