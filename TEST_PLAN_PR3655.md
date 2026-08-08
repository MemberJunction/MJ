# Test Plan — PR #3655 (`fix(runview): order row-limited queries by PK`)

**PR**: https://github.com/MemberJunction/MJ/pull/3655
**Head branch**: `fix/runview-keyset-pagination-ties` (single commit `e26c866`, base `da635cc3e` = `next`)
**Scope**: 2 files — `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` (+27/−3) and one changeset. No migrations, no metadata, no API changes.

**What the fix does**: when a row-limited RunView (`MaxRows`, entity `UserViewMaxRows`, or a keyset page)
has no caller `OrderBy` and no stored-view `OrderByClause`, the provider now emits
`ORDER BY <quoted first-PK>` instead of an unordered `TOP N`/`LIMIT N`. This makes page 1 of a keyset
(`AfterKey`) walk agree with page 2+ (which always forced `ORDER BY <pk>` + seek predicate), eliminating
duplicated and silently skipped rows — the root cause of the long-standing
`IT25 - View Execution (client-first)` / `view-execution.V10` failure (deterministic tier stuck at 59/60).

---

## What the remote review session already verified (do not repeat)

1. **Code review — sound.** Independently traced all RunViewGeneric paths (TOP, PG LIMIT, OFFSET,
   keyset page 1 vs 2+, `SaveViewResults` logging path, `count_only`, `IgnoreMaxRows`, whitespace
   OrderBy, composite PK): the fallback produces valid, consistent SQL on both SQL Server and PG.
   Key confirmations:
   - Page 2+ keyset orders by `QuoteIdentifier(pk) + direction` (`BuildKeysetSeekClause`); the new
     page-1 fallback emits exactly `QuoteIdentifier(pk)` (implicit ASC) — same identifier, same
     effective direction, same server-side type comparison. Composite PKs cannot reach the keyset
     path (`AfterKeyNotSupportedError`), so the single-column fallback is sufficient.
   - `guides/KEYSET_PAGINATION_GUIDE.md` already documents "the framework auto-applies `ORDER BY pk`" —
     this PR makes the implementation conform to its own documented contract.
   - Skipping `ValidateUserProvidedSQLClause`/`TransformExternalSQLClause` for the fallback is correct:
     it is a provider-generated quoted identifier, not user input; caller-provided OrderBy still goes
     through both.
   - SQL Server `executeSQLForUserViewRunLogging` appends `ORDER BY ${orderBySQL}` — the fallback
     flows through the `SaveViewResults` path correctly.
   - The OFFSET block's own belt-and-braces PK fallback is retained (OFFSET/FETCH without ORDER BY is
     a syntax error), producing byte-identical SQL to before for the pagination path.
   - No existing unit test pins the old unordered page-1 SQL shape; the keyset unit suite tests
     `BuildKeysetSeekClause`/`formatKeysetSeekValue` in isolation only (the PR's "no SQL-capture
     harness" claim is accurate).
2. **Unit tier at PR state**: `packages/GenericDatabaseProvider` → **866 passed, 5 skipped, 18 files, 0 failed** —
   matches the PR's claim.
3. **Both red CI checks on the PR are pre-existing base-branch breakage**, introduced by the durable
   EntityAction dispatch work merged to `next` earlier the same day (~17:18 UTC) — NOT by this PR:
   - `Integration (SQL Server, deterministic)`: fresh-DB `mj migrate` fails in
     `V202608081200__v6.1.x__Durable_EntityAction_Dispatch.sql` batch 9/41 with
     `FK_EntityFieldValue_EntityField` violation — before any test runs. The identical failure occurs
     on the base commit `da635cc3e` and several prior `next` commits (last green: `09fe2d345`).
   - `Run unit tests`: `@memberjunction/global` `UUIDCompliance.test.ts` scan fails with 5 direct
     UUID-comparison violations in `MJServer/src/services/TaskGraphActionRunner.ts` and
     `TestingFramework/integration-test-suite/src/checks/entity-actions.checks.ts` — all files from
     the durable-dispatch merge, none touched by this PR. Reproduced locally at base.
4. **PR #3640 interaction**: #3640's diff is entirely AI-model-configuration/realtime work; it never
   touched the provider or IT25. PR 3655's "correction" note applies only to #3640's description text
   and is consistent with the code (keyset mode rejects non-PK OrderBy, so sort-key ties cannot arise).

---

## Local agent instructions

Work through the phases in order. **Attribute failures carefully**: the two known base-branch failure
signatures above must be reported as *pre-existing* (separately), never as PR 3655 findings.

### Phase 0 — Setup

```bash
git fetch origin
git checkout fix/runview-keyset-pagination-ties
git merge origin/next            # pick up latest next; expect no conflicts (2-file diff)
pnpm install
pnpm run build                   # expect clean; remote session verified clean at da635cc3e + patch
```

- Ensure the dev database is migrated to current head: `npx mj migrate`.
  - **Contingency (known base issue)**: if migrate fails in
    `V202608081200__v6.1.x__Durable_EntityAction_Dispatch.sql` with the
    `FK_EntityFieldValue_EntityField` error, that is the pre-existing base defect. Do not debug it as
    part of this PR. Use a database already migrated past it, or escalate to the durable-dispatch
    owners; the integration tier cannot run until the DB is current.

### Phase 1 — Unit tier (fast re-confirmation)

```bash
cd packages/GenericDatabaseProvider && pnpm test
```

**Pass criteria**: 18 files passed, **866 passed / 5 skipped, 0 failed**.

(If you also run repo-wide `pnpm test` from root: expect the known pre-existing MJGlobal
`UUIDCompliance` failure until `next` fixes it — not a PR 3655 finding.)

### Phase 2 — Integration tier (the decisive test)

IT25 is a **client-first** bundle: the RunView executes on MJAPI over GraphQL, so the server must be
running **this PR's code**. A stale server silently tests the old code.

```bash
# 1. Kill/avoid any already-running MJAPI that predates this build, then:
pnpm run start:api                       # or: GRAPHQL_PORT=4001 pnpm run start:api  (if 4000 is taken —
                                         #     point the test config at the alternate port)

# 2. Single bundle, 3 consecutive runs (the old bug was order-dependent/nondeterministic;
#    3 straight passes gives real confidence):
npx mj test run "IT25 - View Execution (client-first)"
npx mj test run "IT25 - View Execution (client-first)"
npx mj test run "IT25 - View Execution (client-first)"

# 3. Full deterministic tier:
pnpm run test:integration                # = MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"
```

**Pass criteria**:
- IT25 passes ×3, specifically `view-execution.V10` ("keyset walk returns every row exactly once;
  short final page ends it") — previously the lone deterministic-tier failure.
- V7/V9 (offset pagination) still pass — the fallback now supplies the ORDER BY the pagination block
  used to add itself; SQL is equivalent, but confirm.
- V12 (MaxRows / IgnoreMaxRows / UserViewMaxRows) and V13 (aggregates) still pass.
- Full deterministic suite: **60/60** (was 59/60). Pay attention to any *other* bundle that newly
  fails: row-limited unordered queries now return **PK-ordered** rows, so a test that implicitly
  depended on the old arbitrary row set/order would surface here. Any such failure is a real finding —
  report it against the PR with the bundle name and output.

### Phase 3 — Behavior & perf spot checks (recommended, ~10 min)

The behavior note in the PR is real: unordered `MaxRows` queries now return the first-N *by PK* rather
than an arbitrary N, and entities whose PK is not the clustered index gain a sort.

1. Start Explorer (`pnpm run start:explorer`), open the largest entity lists you have (default views,
   no explicit sort). Confirm: they load, row order is now stable across refreshes (PK order), and the
   MJAPI console shows no notable query-time regressions on those views.
2. Optional DESC keyset sanity: run a small script that walks an entity with
   `OrderBy: 'ID DESC'` + `AfterKey` on every page (including page 1) — expect no dupes/misses in
   either direction.

### Phase 4 — Sign-off

Report per phase: pass/fail/skip counts and any deviations. Merge-readiness verdict:

- **Merge-blocking**: any Phase 1/2 failure traceable to the PR's two files, or a new deterministic-tier
  failure caused by PK-ordering of previously-unordered results.
- **Not merge-blocking (report separately)**: the two known base-branch failures (migration FK,
  MJGlobal UUID compliance); these will keep the PR's CI red until fixed on `next` regardless of
  this PR. Coordinate the merge decision with that in mind (re-run CI after `next` is repaired, or
  merge on the strength of the local deterministic-tier pass per team policy).

### Optional follow-up (post-merge, not blocking)

The PR author offered to add a unit-tier SQL-capture harness (subclass the provider, stub
`ExecuteSQL`, assert the generated `ORDER BY <pk>` on row-limited unordered queries). Worth accepting
as a follow-up so this invariant is pinned at both tiers.
