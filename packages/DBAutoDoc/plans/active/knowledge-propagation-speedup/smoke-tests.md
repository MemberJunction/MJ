# Smoke Test Matrix

Goal: validate (or invalidate) each load-bearing claim of the architecture cheaply — before we build the real system. Each test is a small self-contained script that takes ~1–10 minutes and produces a JSON report.

All tests run in the Docker container (`Dockerfile`) against the already-complete Chinook `state.json` from a recent real run. They issue LLM calls directly to Gemini with the configured API key.

---

## T1 — Distilled-vs-verbose propagation

**Status: ✅ run 2026-04-20, validated.**

**Hypothesis**: a one-line distilled summary of a resolved parent gives the LLM enough context to match today's quality, at substantially lower input-token cost and per-call latency.

**Method**: for each of 5 tables (mix of root / mid / junction), send two prompts to Gemini 3 Flash — (A) today's full-context prompt with verbose parent descriptions, (B) distilled summary prompt. 3 samples each. Compare latency, input/output tokens, PK/FK correctness, description content.

**Result (from run 2026-04-20):**

| Metric | A (today) | B (distilled) | B/A |
|---|---|---|---|
| Total latency across 5 tables | 41.1 s | 26.3 s | 64% |
| Total input tokens | 4,572 | 1,495 | 33% |
| Total output tokens | 2,831 | 1,649 | 58% |
| PK correctness | 5/5 | 5/5 | parity |
| FK correctness | 2/5 (dbo.-prefix format bug) | 5/5 | **B better** |
| Latency variance (PlaylistTrack) | 5.6–18.3s | 5.2–5.4s | **B much more stable** |

**Verdict**: validated. Proceed to include in design.

---

## T2 — VIF-vs-alphabetical ordering within a level

**Status: pending.**

**Hypothesis**: within a topological level containing multiple ready tables, processing them in order of ascending VIF (most self-contained first) produces lower tail latency under parallel dispatch than alphabetical order, because low-VIF tables complete faster and their completion unblocks more dependents sooner.

**Method**: on Chinook's level 0 (7 tables: Artist, Customer, Employee, Genre, MediaType, Playlist — plus any PKs we can simulate), dispatch all 7 simultaneously to 4 Gemini workers under (a) alphabetical order, (b) VIF-ascending order. Repeat 3×. Measure max completion time (tail), average completion time, and the time at which the 4th, 5th, 6th tables complete (which reflects the rolling dispatch of unblocked dependents).

**Pass condition**: VIF order produces shorter tail latency AND earlier unblocking of level 1 dependents by ≥10%.

**Failure case**: if no difference or worse, VIF priority isn't worth its complexity and we fall back to alphabetical + LPT.

---

## T3 — Max-reach root ordering

**Status: pending.**

**Hypothesis**: when multiple root tables are ready (all with VIF=0), starting with the one whose transitive-descendant set is largest produces a shorter wall time to completion of the whole DFS chain, because high-reach roots unblock the most downstream work earliest.

**Method**: on Chinook, run two simulated schedules — (a) reach-descending (start with Artist, which reaches 4 descendants), (b) reach-ascending (start with Playlist, which reaches 1). Both with 4 workers. Measure time to complete all 11 tables. Each simulation uses real Gemini calls with distilled propagation.

**Pass condition**: reach-descending completes ≥10% faster.

**Additional measurement**: record when each root's subtree finishes — expect the high-reach root's subtree to finish with "time to spare" before overall completion if it's the binding constraint.

---

## T4 — Synthesis-ramp validation (**the core vision test**)

**Status: pending.**

**Hypothesis**: when we process tables in DFS order with distilled propagation, per-call latency decreases as we descend into the graph. Early calls are inference (heavy); late calls are synthesis (light).

This is the decisive test for the whole vision. If latency does not decay with depth, the "difficulty-decay" claim is false and we lose the compounding argument — we'd fall back to "distilled prompts + parallelism" without the structural reordering story.

**Method**: process Chinook end-to-end in a single synthesized DFS using real Gemini calls with distilled propagation. Record per-table latency and output token count. Bucket tables by their DFS depth (0 = roots, 3 = deepest junctions). Plot latency & output-tokens vs depth.

**Expected result** (if hypothesis is true):
```
depth 0: 5–7s per call, 250–400 output tokens
depth 1: 4–6s per call, 200–300 output tokens
depth 2: 3–5s per call, 150–250 output tokens
depth 3: 2–4s per call, 100–200 output tokens
```

A visible downward trend in both latency and output tokens. Non-trend (flat or noisy) = hypothesis falsified.

**Secondary measurement**: inspect late-depth outputs for quality. Are they still correct? Do they correctly identify junctions as junctions? This confirms that the "less work" is *because the task is easier*, not because the LLM is shortcutting.

---

## T5 — End-to-end simulator

**Status: pending.**

**Goal**: given the measured per-call latency distribution from T1-T4, simulate total wall time for Chinook + LousyDB + AdventureWorks under different configurations of the scheduler.

**Simulator models**:
- DAG structure (from actual schemas' state.json)
- Priority scheduling (composite key)
- Worker pool with concurrency cap
- Per-call latency drawn from measured distribution (depth-conditional)
- Cluster partition (Fiedler) as modeled barriers

**Outputs**: for each schema × configuration, projected wall time, projected LLM call count, projected token consumption.

**Configurations to run**:
| Config | Partitioning | Priority | Propagation | Parallel | Cache |
|---|---|---|---|---|---|
| today (baseline) | none | topological + alphabetical | verbose | 1 worker | no |
| parallel only | none | topological + alphabetical | verbose | 4 workers | no |
| parallel + distilled | none | topological + alphabetical | distilled | 4 workers | no |
| full | WCC + Fiedler | reach + VIF + LPT | distilled | 4 workers | yes |

**Expected projections** (from hypothesis):

| Schema | today | parallel only | +distilled | full | speedup |
|---|---|---|---|---|---|
| Chinook (11) | 390 s | 130 s | 85 s | **~50 s** | ~8× |
| LousyDB (20) | 1580 s | 500 s | 320 s | **~180 s** | ~9× |
| AdventureWorks (71) | unmeasured | ~1800 s | ~1150 s | **~300 s** | **~20–30×** (clustering dominates) |

AdventureWorks is the acid test — if the cluster-partition benefit shows up there, the full architecture is justified on that schema alone.

**Success condition**: simulator projects speedups within 30% of the vision's targets, AND depth-conditional latency actually showed decay in T4.

---

## How tests stack to justify implementation

- T1 alone → proves distilled propagation is safe + beneficial
- T2 alone → proves VIF ordering helps scheduling
- T3 alone → proves reach-priority matters
- **T4 is load-bearing** → proves the whole vision. If T4 fails, we keep T1 + parallelism but drop the VIF/reach/Fiedler layer.
- T5 → projects the composite system's wall-time savings to the full benchmark set, giving us a go/no-go on the cluster-partition investment (which is the most expensive piece to build)

If T1 + T4 pass cleanly, we proceed to Phase 1 (scheduler implementation) with high confidence.
If T4 fails, we scope down: ship distilled propagation + flat parallelism, skip the graph-theoretic layer.
If T1 fails (unlikely given current results), the whole plan falls apart and we need a rethink.

---

## Reproduction

```bash
cd plans/active/knowledge-propagation-speedup
docker compose build
export AI_API_KEY=...
docker compose run --rm smoke-tests ./run-tests.sh all
# or: docker compose run --rm smoke-tests ./run-tests.sh t1 t4
```

Each test writes a JSON report to `./results/<timestamp>/<test-id>.json` and appends a human-readable summary to `./results/<timestamp>/summary.md`.
