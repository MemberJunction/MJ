# Regression Trace Store (RI-B2)

Committed, replayable trajectories for the MJ Explorer regression suite — one
`T{NNN}.trace.json` per test, keyed by the test's `TestId`. This is the home the
replay-first plan's Decision **D1** designates: traces are **compiled test
artifacts** (like snapshot files), versioned in git alongside the tests they
exercise, diffable in PRs, and immune to the DR-B1 per-run DB restore (which
would wipe any DB-resident trace).

> **Status:** this directory + contract are the Phase-0 half of RI-B2. The pieces
> that *populate* and *consume* it — driver record-on-pass (RI-B1), tier dispatch
> that loads a trace to decide replay-vs-LLM (RI-C1), `promote-traces` (RI-B3),
> and the heal ledger `.trace-health.json` (RI-B4) — are deferred (they need a
> live LLM suite). This README establishes the location + rules so they land as
> pure additions.

## The validity contract (RI-A2)

**A trace is valid *relative to* a build + a data snapshot, never absolutely.**
Each `ComputerUseTrace` carries an `AppBuildHash` (the RI-A1 composite: git SHA +
schema fingerprint) and an `AppVersion`. `decideReplayTier` compares those against
the current run's identity:

- **Exact `AppBuildHash` match** → the zero-heal `replay` fast path.
- **Any mismatch** (source changed, schema/data changed) → the safe
  `replay-with-heal` path, healing drifted targets or falling back to the LLM tier.

This is why replay is deterministic at all: the regression suite records and
replays **only against DR-B1 pristine restores**, so the same snapshot yields the
same UUIDs, and recorded selectors/URLs stay valid run-over-run. A data change is
folded into `AppBuildHash` (the schema fingerprint component), so it demotes an
exact match to `replay-with-heal` automatically — a keyed invalidation, not a
mystery flake.

## Naming & mj-sync

- Trace files are named `T{NNN}.trace.json` — **no leading dot**, so the parent
  `MJ: Tests` sync (`filePattern: "**/.*.json"`, dot-prefixed only) never sweeps
  them as test records. The parent `tests/.mj-sync.json` also lists
  `regression/traces` under `ignoreDirectories` as belt-and-suspenders.
- Traces are **driver-read files, not mj-sync entities** — they never touch the
  DB. `mj sync push` ignores this directory.

## Promotion (RI-B3, deferred)

Recording runs will write candidates to `$RUN_DIR/traces-out/`; they reach this
store only through `mj test regression promote-traces`, whose review surface is
the `diffTraces` summary (routine `selector-drift` vs. `meaningfulDrift` — steps
added/removed, targets/methods/URLs changed). A UI-changing merge shows its trace
diffs as reviewable PR artifacts; promotion is where a human sees the drift before
it is ratified. New tests' first traces promote trivially (no baseline to diff).
