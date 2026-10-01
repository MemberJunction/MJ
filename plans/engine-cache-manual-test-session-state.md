# Manual test session — live state and results (2026-10-01)

Companion to `engine-cache-manual-test-plan.md`. **This file is the session's memory**: if my context
compacts mid-session, start here. It records what is running, what passed, what failed, and what is
left — in a form that survives a restart of either of us.

---

## Live environment

| | |
|---|---|
| **API-A** | the owner's server, port **4001**, started with `REDIS_URL=redis://127.0.0.1:16390 REDIS_KEY_PREFIX=mjmanual pnpm run start:api`. Explorer attached to it. |
| **API-B** | mine, port **14100**, same database and Redis: `MJ_DISABLE_TASK_GRAPH_DISPATCHER=1 GRAPHQL_PORT=14100 REDIS_URL=redis://127.0.0.1:16390 REDIS_KEY_PREFIX=mjmanual DB_USERNAME='MJ_CodeGen' DB_PASSWORD=<inline> node -r dotenv/config packages/MJAPI/dist/index.js` |
| **Redis** | private, port **16390**, prefix `mjmanual` |
| **Database** | `mj_test_2` |
| **Wire window** | `redis-cli -p 16390 psubscribe 'mjmanual*'` → scratchpad `wire.log`; API-B's log → `api-b.log` |
| **Config** | the repo-root `mj.config.cjs` (`packages/MJAPI/mj.config.cjs` just re-exports it) carries `cacheSettings: { engineSweepIntervalSeconds: 15, verboseLogging: true }` — **a local host artifact, never commit it** |

**Driving API-B over GraphQL.** It accepts the system key in the `x-mj-api-key` header; the owner
supplies the key each session — **never write it to a file, a plan or a memory entry.** Introspection
is disabled in production mode, so discover mutation names by sending a deliberately wrong one and
reading the "Did you mean" suggestion. Known shapes: `UpdateMJAIModel(input: { ID, … })`,
`DeleteMJUserRole(ID, options___: { SkipEntityAIActions, SkipEntityActions, ReplayOnly,
IsParentEntityDelete })`, `CreateMJUserRole(input: { UserID, RoleID })`,
`ExecuteTransactionGroup(group: { Items: [{ EntityName, EntityObjectJSON, OperationType }] })`.
Note `_mj__UpdatedAt`, not `__mj_UpdatedAt`, in GraphQL selections.

**Fixture facts for this database.** The owner's user is `0643CEA3-8C8D-49A7-983B-223969C98AC9`
(`jordan.fanapour@bluecypress.io`). The role that grants update on AI Models is **`Integration`**
(singular — there is no "Integrations"), id `DFAFCCEC-6A37-EF11-86D4-000D3A4E707E`. The test model is
`all-MiniLM-L12-v2 (Local)`, id `2E328C31-9B9D-4E78-B084-C8381BC82F2F`.

---

## Results so far

| Test | Verdict | What was observed |
|---|---|---|
| **1** Cross-server propagation | **PASS** both ways | A→B: the shared slot carried `Description: 'manual-test-1'` with the save's `maxUpdatedAt`, applied from the payload with no database read on B. B→A: same in reverse. The unfiltered engine slot got a `set` (rows maintained in place); the filtered slots each got a `removed` — the designed split. |
| **1b** Browser leg | **GAP → issue #4952** | An open record form does **not** update, and navigating away and back does not either (Explorer's `CustomReuseStrategy` reattaches the stored component). Only a full page reload shows it. Not a regression — the peer→browser relay is new on this branch; the form layer is the remaining half. |
| **2** User cache (#4247) | **PASS** | A role revoked **through API-B** was enforced by API-A within seconds: the owner's save was refused with a permission error. Re-granting restored it just as fast. One small stamp notice on the wire, no user rows. |
| **3a** `cache clear --dry-run` | **PASS** | 389 keys before and after, **0** wire messages. |
| **3b** `cache clear` | **PASS** | 190 + 10 keys cleared; both servers notified; snapshot removals arrived with **`_Timestamps` last**. |
| **3c** `mj migrate` | **expectation wrong, code right** | There is no zero-applied run: `R__RefreshMetadata.sql` injects `${flyway:timestamp}` so its checksum always changes and it always re-runs. So migrate always clears — defensible, since that script really does recompile views and re-sync metadata. The changeset's "a run that applied no migrations no longer disturbs the fleet" is true as written but rarely reached for `mj migrate`. |
| **3d** `sync push`, no changes | **PASS** | Cleared 127 keys; per-category `Ok` results (the §22 fix). |
| **3e** failed push, clean rollback | **PASS** | 48 rows written inside the transaction, failure, clean rollback, **0** clears, database verified unchanged. This is the exact case the #4566-aware policy was rewritten for. |
| **4** Bulk write = one notification | **FAIL — real finding** | 40 rows in ONE `ExecuteTransactionGroup` produced **40 messages / 11.4 MB**. `SQLServerTransactionGroup.HandleSubmit` opens its transaction directly on the pool, never through the provider, so the N11 batch never engages. Evidence added to **#4250**; the changeset claim is now scoped to provider transactions. |
| **6** TTLs | **PASS** | Dataset blobs **3586**, their `_date` proxies **3286** (proxy dies first); snapshot keys **-1**; a RunView slot 3188. |
| **7** Warm start | **PASS** (seen 3×) | API-B boots `metadata 0.4s` warm vs `2.1–3.3s` when the snapshot is absent. |

**Incidental observations worth keeping**

- `DatasetCache` reports **0 keys** in every clear (dry-run, clear, and the push report) — the known
  `default`/`DatasetCache` asymmetry, now seen in production. Already handed to the
  `dataset-cache-category` worktree.
- Redis holds ~21 `__lease__:engine-sweep` keys. Under §26 the sweeper still takes a lease per engine
  per interval and then finds nothing to sweep. No database query, so the Azure concern is
  unaffected, but it is pointless Redis churn — check sweepability **before** taking the lease.
  Not yet fixed.

---

## Still to run

- **Test 5 — sweep gating (§26).** The deliberate behaviour change. Part A: a raw SQL change to
  `MJ: AI Models` must **not** be picked up (that entity trusts its cache). Part B: set
  `UPDATE __mj.Entity SET TrustServerCacheCompletely = 0 WHERE Name = 'MJ: AI Models'`, **restart
  both servers** (the flag is read from metadata at boot), repeat the change, and it must be picked
  up within ~15 s by exactly one server, with the other adopting its payload. **Restore the flag to
  1 afterwards.**
- **Test 8 — F9 (§25.5).** Needs `REDIS_TTL_SECONDS=60` on both servers; API-B boots warm (reads a
  slot it did not write), the slot expires, a save on API-B must still reach API-A.

## Cleanup owed at the end

- `UserRole` rows created during the session: `6B1995A2-…` (deleted during test 2) and
  `7EAB965D-0BE8-4DA8-B482-F5ACD412CD6E` (the re-grant — **keep**, it is the owner's working
  `Integration` role).
- 40 AI Model descriptions carry a `t4-bulk ` prefix from test 4, and `all-MiniLM-L12-v2 (Local)`
  carries a test description. Restore from `scratchpad/t4-models.json`, which holds the originals.
- `TrustServerCacheCompletely` on `MJ: AI Models` must end at **1**.
- The owner reverts the `mj.config.cjs` edits; `redis-cli -p 16390 flushdb`; stop API-B.
