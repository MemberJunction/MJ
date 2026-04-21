# DBAutoDoc Speedup — Formal Architecture Spec

**Status**: design frozen, pending implementation
**Supersedes**: architecture.md (aspirational) + FINDINGS-UPDATED-2026-04-21.md (empirical results)
**Author**: designed interactively with the user, 2026-04-20/21
**Scope**: the novel mechanism, not the mechanical bits (parallelism, Docker, etc.)

---

## Problem statement

DBAutoDoc describes N database tables via LLM calls. Today's cost is O(N × iter × per_call_cost) with per_call_cost scaling with prompt size and iter ≥ 2. On schemas with 70+ tables this is tens of minutes per run. The quality (F1 against ground-truth PKs/FKs) is near-ceiling; the bottleneck is **throughput, not accuracy**.

Goal: reduce wall time by ≥5× on schemas with ≥20 tables, without regressing F1.

---

## System invariants

The architecture maintains four invariants by construction. When any one breaks, the speedup story breaks with it.

### I1 — Bounded distillate size
Every propagated summary is ≤ D words (recommended: D = 30). Enforced at P1 output time by prompt constraint + post-processing truncation.

**Implication**: at DFS depth k, total ancestor context is ≤ k × D words. For k = 5 and D = 30, that's 150 words regardless of schema size. Prompts stay bounded.

### I2 — Additive-only P2 (delta semantics)
P2 refinement cannot rewrite existing descriptions. It can only emit a delta: "add this sentence" or "no delta." Deterministic merge.

**Implication**:
- Monotonic quality — information accumulates, never regresses
- Convergence is trivial — empty delta = done
- Hallucination mode from κ cannot occur (can't fabricate; can only extend)

### I3 — Per-component independence
Tables are partitioned into clusters by constrained Fiedler split. Each cluster is processed in its own worker pool with no shared state across clusters. Bridge tables (cut boundaries) processed last.

**Implication**: wall time bounded by max(cluster_depth × per_call), not total_tables × per_call. Super-linear speedup with schema size.

### I4 — Stable-prefix cacheability
Every LLM call's prompt is structured as `<stable_prefix> || <dynamic_suffix>`. The stable prefix (guidelines, JSON schema, glossary) is cacheable at the provider level. Dynamic suffix contains only table-specific + distilled propagation content.

**Implication**: after first call per cluster, subsequent calls pay ~10% of prefill cost. Per-call latency drops by the input-proportional component.

---

## Component specifications

### C1 — SchemaPartitioner (constrained Fiedler split)

**Input**: SchemaGraph (nodes = tables, edges = FK relations)
**Output**: dendrogram of clusters + list of bridge nodes

**Algorithm**:
1. Compute graph Laplacian L = D − A
2. Compute centrality per node (betweenness or degree). Flag top-K% as "anchor" nodes.
3. Compute Fiedler vector of L' where anchor nodes' edges are weighted ×W_heavy (makes cutting through them costly)
4. Split nodes by Fiedler sign → two clusters
5. For each cluster, recurse (step 2) until stop criterion:
   - Cluster size < S_min (don't split further; default S_min = 8)
   - Eigengap ratio λ_3 / λ_2 > T_tight (cluster is internally tight; default T_tight = 3.0)
   - Max recursion depth reached (default: 3 splits)
6. Bridge nodes: those with |Fiedler entry| < T_bridge at any split level

**Complexity**: O(|V|² + |E|) per split via power iteration with deflation. For 100-node schemas: ~ms. For 1000-node: ~sec. Acceptable.

**Persistence**: the dendrogram is schema-fingerprint-keyed and cached across runs. Only recompute if schema structure changed.

### C2 — Component DFS scheduler

**Input**: cluster (node list + internal edges + bridge nodes if applicable)
**Output**: resolved descriptions for all cluster members

**Algorithm**:
```
for each cluster (in parallel, independent worker pools):
    ready_queue = priority queue, priority = composite(in_degree=0, vif, reach)
    initialize with cluster roots (nodes with no cluster-internal dependencies)
    workers = N per cluster (typically 2-4, bounded by provider rate limits)

    while ready_queue is non-empty:
        worker pops lowest-VIF / highest-reach ready node
        worker runs P1(node) with distilled ancestor summaries
        on completion:
            store distilled summary (I1: size ≤ D words)
            for each cluster-internal dependent: decrement in_degree; enqueue if 0

# After all clusters' descent:
for each cluster (in reverse topo order):
    for each non-leaf node:
        worker runs P2(node) with distilled descendant deltas
        apply delta to description (I2: additive only)

# Bridge tables:
process bridges last with summaries from BOTH adjacent clusters
```

**Priority key** (composite):
- Primary: readiness (in_degree == 0)
- Secondary: −reach (prefer max transitive-descendant count — unblocks the most work)
- Tertiary: VIF (prefer lowest — simplest prompts first)
- Quaternary: −prompt_size (LPT — schedule biggest first for tail reduction)

### C3 — PromptAssembler

**Output shape**: `{ cachePrefix: string, dynamicSuffix: string }`

**cachePrefix** (stable across all calls in a run):
- Task description (≈ 500 words)
- JSON schema for response
- Guidelines (≈ 1000 words)
- Cluster-scoped table-name glossary (anti-hallucination; only this cluster's tables)

**dynamicSuffix** (per-call):
- This table's schema fragment (columns, stats, FK declarations)
- Distilled ancestor summaries (I1: ≤ D words each)
- Current description (for P2 only)
- Distilled descendant deltas (for P2 only)

**Provider integration**:
- Gemini: rely on implicit caching when prefix ≥ 1024 tokens (size prefix accordingly)
- Anthropic: explicit `cache_control: ephemeral` at end of cachePrefix
- OpenAI: use prefix cache when available

### C4 — DistilledSummary (I1 enforcement)

**Structured output from every P1 call**:
```json
{
  "tableDescription": "...",
  "distillate": {
    "purpose": "...",        // ≤ 10 words, required
    "pk": ["col1"],          // column names
    "domain": "...",         // 1-2 word domain tag (Sales, HR, Catalog)
    "roleInSchema": "..."    // ≤ 10 words, what function in the system
  }
}
```

Distillate is what propagates. It's deterministically ≤ D words even if tableDescription is longer.

### C5 — DeltaRefinement (I2 enforcement, replaces current P2)

**P2 prompt skeleton**:
```
Current description: <verbatim>
Descendants (distilled): [ ... ]

Task: emit a DELTA to ADD to the description.
- If descendants reveal new role/usage, output: {"add": "single clause to append", "reason": "..."}
- If descendants add nothing material, output: {"add": null, "reason": "no material addition"}

Constraints:
- Delta is ≤ 15 words
- Delta is APPENDED to existing description — do not rewrite
- Do not mention entities > 1 hop away
```

**Merge**: `description = description + " " + delta.add` when `add` is non-null. Otherwise no change.

**Convergence signal**: run P2 ascent once per cluster after descent. If any deltas emitted, done for this pass (no second pass). If all deltas null, cluster is converged.

### C6 — Dendrogram-based iteration control

Replace today's "iterate until descriptions stabilize" with:
- **Descent iterations**: until no new knowledge propagates (trivially one pass, because VIF ordering + bounded distillates means every node has its full ancestor context on first visit)
- **Ascent iterations**: single pass, delta-gated. No re-ascent.
- **Total LLM calls**: ~N + (N − L) where L = leaf count per cluster. One descent + one ascent.

Compare to today: 2N or more with backprop re-runs. Immediate ~2× call count reduction, before parallelism.

---

## Interaction matrix

| Component pair | Interaction |
|---|---|
| I1 × I4 | Bounded distillate is what makes stable-prefix possible (dynamic suffix stays small) |
| C1 × C2 | Fiedler partition defines the scheduler's independent work units |
| C4 × C2 | Distillate format defines what propagates through the scheduler's priority queue |
| C5 × I2 | Delta semantics IS the I2 invariant operationalised |
| C6 × I2 | Empty-delta convergence works only because P2 is additive |

The architecture is **coupled** — components depend on each other's invariants. This is why component-level ablation is misleading; the correct evaluation is full-system vs baseline.

---

## Expected performance (theoretical)

Conservative projections for three schemas:

| Schema | Tables | Clusters | Max cluster depth | Today (serial) | Projected (full arch) | Speedup |
|---|---|---|---|---|---|---|
| Chinook | 11 | 1 | 4 | 390 s | ~80 s | 4.9× |
| LousyDB | 20 | 2-3 | 3 | 1580 s | ~100 s | 15.8× |
| AdventureWorks | 71 | 4-5 | 4 | ~3000 s (est.) | ~150 s | 20× |

The asymmetry: small schemas don't benefit from component parallelism (only 1 cluster). Larger schemas get super-linear benefit as clusters × parallel workers multiply.

---

## Measurement protocol

**Baseline**: origin/next with no speedup features. Measured on Chinook = 6:30. LousyDB baseline recorded in paper as 26:20.

**Full architecture**: all components from C1–C6 active. One run per schema, 3 trials for variance. Record:
- Wall time
- Total LLM calls
- F1 against ground truth PKs/FKs
- Per-phase timings ([PERF] markers already instrumented)

**Ablations** (honest, but secondary):
- −C1 (no Fiedler split; single cluster): isolates partition contribution
- −C5 (no delta semantics; rewrite P2): replicates κ hallucination failure
- −I1 (no distillate cap): prompt size grows with depth, measure degradation
- −I4 (no caching): measure pure algorithmic contribution

---

## Known risks

1. **Fiedler computation correctness on degenerate graphs**: disconnected components, self-loops, duplicate edges. Mitigation: validation pass before computing Laplacian.
2. **Delta merge producing grammatically awkward descriptions** (running-together clauses). Mitigation: light regex-based cleanup on merge, or have P2 emit sentence-level deltas from the start.
3. **Bridge tables receiving insufficient context** if neighboring clusters' summaries are too short. Mitigation: bridge prompts get full distillates from both sides, not just the primary cluster.
4. **Provider-level caching inconsistency across calls** (Gemini implicit cache has 5-minute TTL). Mitigation: pace calls within window, or switch to explicit cached content.
5. **Unit test coverage of async ordering edge cases** (race conditions in concurrent DFS per cluster). Mitigation: scheduler has dedicated tests, including adversarial dep-ready ordering.

---

## Implementation sequence

1. **C1 SchemaPartitioner + tests** (stand-alone, no LLM dependency) — ~1 day
2. **C4 DistilledSummary format + P1 prompt update + size enforcement** — ~half day
3. **C3 PromptAssembler split (cachePrefix / dynamicSuffix)** — ~half day
4. **C2 scheduler refactor to per-component** — ~1-2 days
5. **C5 delta P2 + merge + C6 convergence** — ~1 day
6. **Anthropic caching integration (opt-in)** — ~half day
7. **End-to-end test on Chinook + LousyDB + AdventureWorks** — ~1 day

Total: ~5-6 days of work. Each step is measurable in isolation; only the final run measures the integrated system.

---

## What we're deliberately NOT doing

- **Token-level model routing** (cheap-model-for-confident-tables). Paper's future work #5. Valid lever but out of scope for this plan — orthogonal.
- **Batched multi-table prompts**. Analyzed earlier: worse for decode-dominated wall time + quality risk. Not in scope.
- **SQL-side parallelism on Phase 0 stats queries**. Phase 0 is <10% of run time (measured). Optimizing it doesn't move the headline number.

---

## Open questions before implementation

1. What's the minimum F1 regression tolerance? (Plan assumes zero regression; in practice we'd probably accept 1-2 pp if wall time halves.)
2. Do we ship with Fiedler off by default (flag-gated) until measured at scale, or on by default once unit tests pass?
3. On provider caching — Anthropic gives explicit control and is measurable; Gemini's implicit cache is harder to verify. Do we benchmark primarily against Anthropic for this plan?
4. How aggressive is the distillate word cap? D = 20, 30, or 50? Trade-off curve unmapped.

These are decisions to make before coding, not during.
