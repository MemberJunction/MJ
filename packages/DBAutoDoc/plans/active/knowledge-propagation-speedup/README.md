# DBAutoDoc: Knowledge Propagation Speedup

**Status**: Initial smoke tests run 2026-04-20. Core "synthesis ramp" hypothesis **falsified**. Revised plan in [results/FINDINGS-2026-04-20.md](results/FINDINGS-2026-04-20.md).
**Branch**: `dbautodoc-perf-incremental`
**Owner**: Madhav
**Date started**: 2026-04-20

---

## Executive summary

Today's DBAutoDoc treats every table as an independent LLM inference problem: "here's a table's schema and statistics — describe it." Phase 1 of the pipeline does this ~2N times (N tables × ~2 iterations). Each call carries a verbose prompt (~11K chars, 55% of which is repeated boilerplate), blocks the pipeline serially, and performs the same heavy inference regardless of the table's position in the FK graph.

The result: LousyDB (20 tables) takes ~26 minutes. The paper itself flags three major levers as "future work" (parallelism, cluster-sharding, confidence-driven dispatch) but implements none of them.

**The vision of this plan**: treat schema documentation as **knowledge propagation through a graph**, not independent table analysis. Early, uncertain nodes inject raw knowledge via heavy LLM inference. That knowledge is distilled and propagated to dependent nodes, where subsequent LLM calls become progressively lighter synthesis tasks rather than inference tasks. Structurally independent clusters process in parallel. Shared boilerplate is cached at the provider level. These are not independent optimizations multiplied together — they are a single coherent system where each piece enables the others.

## Problem statement

**Measured bottleneck (Chinook, instrumented run, 2026-04-20):**

| Phase | Wall time | % of iter 1 |
|---|---|---|
| DB connect + introspect + sample | 0.5 s | 0.3% |
| Phase 0 (SQL stats + LLM sanity check) | 20.2 s | 10.7% |
| Phase 1 iter 1 (sequential LLM per table) | 168 s | **89%** |
| Within-level table calls | 103 s | 55% |
| Between-level backprop gaps | 65 s | 34% |

Phase 1 is >89% of wall time. Within Phase 1, serial per-table LLM calls dominate. The existing paper's defence is built on F1 quality scores, not latency — speed is unstudied.

**Empirical baselines (from published paper results):**

| DB | Tables | Wall time | Quality (F1 weighted) |
|---|---|---|---|
| Chinook | 11 | 6:30 | 96.9% |
| Northwind | 13 | 11:57 | 83.1% |
| LousyDB | 20 | 26:20 | 91.3% |
| AdventureWorks2022 | 71 | unmeasured | 96.1% |

## The vision: knowledge propagation through a graph

### Today's model: independent inference

Every table receives the same heavy prompt structure: task + guidelines + column stats + parent descriptions (verbose) + `allTables` list + JSON schema. The LLM performs independent inference from primitives for each call, regardless of where the table sits in the graph.

Work per call is approximately constant. Total work = N × heavy_inference_cost.

### Proposed model: propagation with decaying difficulty

1. **Structural pre-partitioning.** Before any LLM call, partition the FK graph into (a) disconnected components via Union-Find, and (b) weakly-connected sub-clusters within each component via Fiedler-vector (spectral) bisection. Each sub-cluster is a near-independent scheduling problem.

2. **Scheduling by composite priority.** Within each cluster, process tables via a DAG scheduler whose priority key is:
    - Primary: dependency readiness (in-degree = 0 in remaining graph)
    - Secondary: max reachability (table whose resolution unblocks the most downstream work)
    - Tertiary: low VIF (most self-contained — minimum context needed)
    - Quaternary: prompt size (LPT — dispatch longest first to minimize tail)

3. **Distilled propagation.** When a parent is resolved, its description is distilled into a one-line summary (name, purpose, PK, domain). That summary — not the full paragraph — is carried into children's prompts. Children receive short, focused context.

4. **Difficulty decay.** As DFS descends through a cluster:
    - Early calls (low-VIF roots with no ancestors): full inference from primitives. Heavy.
    - Mid calls (some resolved ancestors): context-assisted inference. Medium.
    - Late calls (junction / confluence tables with all ancestors resolved): synthesis of known entities. Light.

    The LLM's cognitive load per call actively decreases as we propagate. This is not merely "smaller prompts" — it is a different kind of task being performed.

5. **Parallelism across clusters and within waves.** Independent clusters run in parallel. Within a cluster, tables ready at the same time dispatch to worker pool (bounded by provider rate limits).

6. **Caching the stable.** Boilerplate, JSON schema, and the `allTables` list rarely change across calls. Provider-level prefix caching (Gemini implicit cache / Anthropic `cache_control`) reuses these at ~10% of input cost with ~85% latency reduction on cache hits.

### Why this isn't "multiply the savings"

Each piece enables the others:
- Distilled propagation enables each call to be smaller, which enables effective caching (longer cacheable prefix, shorter dynamic delta)
- VIF ordering produces a monotonically-increasing prompt-size curve, so the difficulty decay happens in the right order
- Clustering means wall time is bounded by max-cluster-depth, not total node count
- Parallelism within a cluster overlaps the synthesis-phase calls
- Reach-biased root selection minimizes the number of independent DFS chains required

The total speedup is **structural** — the shape of the work changes — rather than the product of independent speedup factors.

## Hypothesis: expected end-to-end behaviour

If the vision holds, we expect to observe:

| Observation | Expected result |
|---|---|
| Per-call latency early in DFS | ~today's average (heavy inference) |
| Per-call latency late in DFS | **substantially lower** (synthesis, not inference) |
| Input tokens per call, late DFS | fraction of today's (just ancestors' distillates) |
| Output tokens per call, late DFS | fraction of today's (shorter, more certain output) |
| Wall time on Chinook (11 tables) | ~60–90 s (vs. 6:30 baseline) |
| Wall time on LousyDB (20 tables) | ~90–180 s (vs. 26:20 baseline) |
| Wall time on AdventureWorks (71 tables) | ~300–600 s (unmeasured baseline; likely 30+ minutes serial) |
| F1 quality scores | ≥ paper baseline on all benchmarks |

The critical validation targets are the **difficulty-decay curve** (the core claim) and **quality parity with the paper**.

## Plan

### Phase 0 (this document): design + smoke tests

Validate individual hypotheses cheaply before committing to implementation.

- [x] Instrument existing pipeline (done; PR pending)
- [x] T1: Distilled-vs-verbose propagation smoke test — **validated** (36% latency reduction, 67% input tokens, quality better on FK format)
- [ ] T2: VIF-vs-alphabetical ordering smoke test — measure variance difference + scheduling efficiency
- [ ] T3: Max-reach root ordering — measure cascade speed from high-reach vs low-reach starting points
- [ ] T4: Synthesis-ramp validation — measure per-call latency as function of DFS depth with distilled propagation (core vision claim)
- [ ] T5: End-to-end simulator — compose measured effects into total-wall-time projections for Chinook, LousyDB, AdventureWorks

### Phase 1: scheduler infrastructure

Once smoke tests pass, implement the unified DAG scheduler:
- `TaskScheduler<T>` with composite priority, bounded concurrency, dependency-aware dispatch
- `SchemaPartitioner` — Union-Find for disconnected components, Fiedler bisection within each
- `PropagationContext` — type-safe ancestor summary carrier, distilled from resolved descriptions
- `PromptAssembler` — composable boilerplate + cacheable-prefix + distilled-suffix

### Phase 2: drop-in replacement for Phase 1 execution

Replace `AnalysisEngine.processLevel` with `scheduler.drain()`. Keep the current serial path behind a feature flag until we're confident.

### Phase 3: caching + remaining polish

Wire Gemini implicit caching for the stable prefix. Measure cache hit rate. Tune distillation format based on quality comparison against ground truth.

### Phase 4: ablation + benchmarking

Feature-flag each component independently. Run Chinook + LousyDB with each on/off to attribute the speedup. Publish per-benchmark Pareto (F1 vs. wall time).

## Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| Distilled summary drops signal the LLM needed | Quality regression | Smoke test T4; fallback to verbose for low-confidence outputs |
| Fiedler bisection produces artificial cuts on tight schemas | Worse propagation, not better | Only apply when algebraic connectivity λ₂ is low (natural clusters exist); fall back to WCC otherwise |
| LLM rate limits cap actual parallelism below theoretical | Wall-time gain smaller than projected | Measure under concurrency in T5; tune worker pool size per provider |
| Difficulty-decay claim doesn't hold empirically | Main vision premise fails | T4 is the decisive test; if false, we fall back to "distilled + parallel + cached" without the VIF story |
| Bridge-table quality suffers (Fiedler boundary) | Worse descriptions at confluence | Process bridges last with bidirectional ancestor context |

## Success metrics

**Minimum acceptable**: 3× wall-time reduction on Chinook + LousyDB with F1 ≥ baseline on both.

**Target**: 5–6× wall-time reduction on Chinook/LousyDB; 10–20× on AdventureWorks (where clustering matters most); F1 ≥ baseline + 0.5 pp (format consistency already showed improvement in T1).

**Stretch**: Reproducible, ablated performance report showing which of [partitioning, reach-ordering, VIF, distilled propagation, parallelism, caching] contributes what fraction of the total gain, enabling paper-quality claims.

## Directory layout

```
plans/active/knowledge-propagation-speedup/
├── README.md                       # this document
├── architecture.md                 # detailed design
├── smoke-tests.md                  # test matrix + hypotheses
├── Dockerfile                      # reproducible test env
├── docker-compose.yml
├── run-tests.sh
├── smoke-tests/
│   ├── lib/
│   │   ├── gemini.mjs              # API client with retry + usage metrics
│   │   ├── schema-loader.mjs       # load state.json into clean structures
│   │   ├── priority.mjs            # VIF / reach / composite priority functions
│   │   └── metrics.mjs             # latency + token stats + aggregation
│   ├── t1-distilled-propagation.mjs
│   ├── t2-vif-ordering.mjs
│   ├── t3-reach-priority.mjs
│   ├── t4-synthesis-ramp.mjs
│   └── t5-simulator.mjs
└── results/
    └── (timestamped JSON reports)
```

## How to reproduce (once implemented)

```bash
cd plans/active/knowledge-propagation-speedup
export AI_API_KEY=...  # Gemini key
docker compose build
docker compose run --rm smoke-tests ./run-tests.sh t1 t2 t3 t4 t5
```

Results land in `./results/<timestamp>/report.md`.
