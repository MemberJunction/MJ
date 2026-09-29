# Jumpstart — engine/cache architecture implementation session

You are implementing an agreed plan. The investigation, measurement and review are done; do not
redo them. Read these three files in this order before touching code:

1. `plans/engine-cache-architecture-plan.md` — the plan. Sections 6 (phases), 10 and 11 (decisions
   recorded with the owner) are binding. Section 7.1 is the measured baseline you will compare
   against. Sections 1–5 are the evidence if you need to know *why* something is in the plan.
2. `plans/engine-cache-architecture.md` — the original brief; §10 is the session log with the
   corrections that were made to it. Environment traps in §3 are real and already cost hours.
3. `packages/MJCore/docs/related-record-collections.md` §4–5 — only when you reach Phase 5.

## What is decided (do not reopen)

- Phase order 1 → 2 → 3 → 5, as in plan §6 with the amendments in §10/§11.
- Item 2.1 is the **blunt** form: `mj sync push`, `mj codegen`, `mj migrate` clear the RunView,
  Dataset and Metadata categories on Redis when `REDIS_URL` is configured, plus an explicit
  `mj cache clear` command. Closes #4083. The CLI does **not** get a Redis provider until N11 exists.
- Registry (N2): never persisted or published on a provider that isolates (Redis); keep for IndexedDB.
- Category index (N3): per-entity sets with lazy pruning; `SCAN` only for `ClearCategory`/admin.
- Pollers (N4): metadata only — `AllowCaching=false` on `MJ: User Routines` and any entity read on a
  schedule with a per-run filter. No `BypassCache` change in the driver.
- TTL default: 1 hour, only after N3 is in.
- Redis-before-engines (N1): permitted, implemented in `GenericDatabaseProvider` so SQL Server and
  PostgreSQL both get it, and it lands **after** 2.1 and 1.2 — a fresh boot is what heals stale
  peers today (measured, plan §7.1 E3c) and N1 removes that.
- Idea A (incremental derived-state hook on `BaseEngine`): rejected. Idea C: row-identity shape,
  and the slot-maintenance funnel computes `maxUpdatedAt` from rows. Idea B: scoped sweeper, Phase 3.
- Grouping children under parents: **no new base-class mechanism**. Phase 5 migrates the remaining
  hand-written groupings onto declared related-record collections (`Source: 'cache'`).
- N7 and #3059 are one version counter; N11 (batch scope, #4250/#4301) is one mechanism with two
  consumers (Redis slot path and browser listener).
- Skip stays on `Config(true)` until an LTS release carries this work. Nothing here changes Skip.
- PostgreSQL is in scope for testing, not just SQL Server.

## Environment state you inherit

- Branch is `next` at `c7a30c7c03`, nothing committed by the previous session. **Cut a feature
  branch tracking a same-named remote before any edit** (repo rule 3/4). Never commit without being
  asked; never run `git checkout --`/`restore`/`reset --hard`.
- Untracked files: the two `plans/*.md` above and a scratch rig,
  `packages/TestingFramework/integration-test-suite/rigs/cache-fleet-baseline.ts` +
  `rigs/lib/cache-fleet-replica.ts`. The rig is the measurement tool; it is not merge-ready (its
  raw-SQL step uses an `N'…'` literal, SQL Server only). Findings that need a regression pin go
  into `src/checks/` bundles dispatched by `mj test`, not into the rig.
- `mj_test_2` on the local SQL Server (`sql2022`, localhost:1433) is **your** database, migrated to
  v6.1.x on 2026-09-16. `.env` at the repo root already points at it; you cannot read `.env`, and
  the harness loads it for you. No CodeGen and no `mj sync push` were run. No PG database exists
  yet for MJ; the `pg-autoquote` container on 5434 is a PostgreSQL server you can create one on.
- `dist/` was rebuilt across the whole graph on 2026-09-16 and verified to contain #4470. After a
  branch switch or a pull, rebuild with the dependency graph before measuring anything.
- A local `redis-server` (Homebrew) exists; the rig starts its own on port 16380 and cleans up.
  A Redis on 6379 is also running — it is not yours, use a private prefix if you touch it.

## How to start

1. Cut the branch. Then run the baseline rig once on the unmodified branch so you have numbers from
   *your* build: `npx tsx packages/TestingFramework/integration-test-suite/rigs/cache-fleet-baseline.ts --replicas=3 --phases=boot,latency,stale --trials=20`.
   Expect: ~109 DB calls per replica at boot, ~27 ms p50 propagation, identical `fleetHash` on every
   replica, staleness ∞ for the raw and CLI-shaped writers, fresh boot heals peers.
2. Phase 1 in plan §6 order (1.1 → 1.6). Each item names its regression pin; write the pin with
   the change. Unit tests in the package (`pnpm test`), then the deterministic integration tier
   (`pnpm run test:integration`), both green before moving on. Report pass/fail/skip counts.
3. Re-run the rig after Phase 1 and after Phase 2 and append the numbers to plan §7.1 under a
   dated heading. The deltas that matter: events and bytes per replica at boot, payloads applied,
   fleet DB calls, and E3 staleness after the CLI clear exists.
4. Append decisions and surprises to the plan as you go; correct anything wrong and say so.

## Evidence standard (inherited, non-negotiable)

Reproduce before claiming a cause, or label it a hypothesis. Verify the binary under test is the
build you think it is (the previous session found a stale `dist/` and a half-linked workspace on
day one). Assert on derived state and observable behaviour, never on row counts alone — the
incident that started all this had perfect counts.

## Traps already paid for

- `pnpm install` at the root before building if a package fails to resolve a workspace sibling.
- A port answering is not proof your process owns it; check the PID.
- Turbo filters env vars; run packages directly for anything that needs `DB_*`.
- `mj sync push` writes `lastModified` into `metadata/**/*.json`; do not run it casually.
- `LogStatus` output is dropped under `NODE_ENV=production`; the rig sets that for its children.
- `RunView` without `IgnoreMaxRows: true` does not share an engine's cache slot for the same entity.
