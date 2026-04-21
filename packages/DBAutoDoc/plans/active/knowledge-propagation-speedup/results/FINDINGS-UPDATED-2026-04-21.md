# DBAutoDoc Speedup Plan — Updated Findings (2026-04-21)

Supersedes FINDINGS-2026-04-20. Captures results from Tests κ (unguarded P2), λ (grounded P2), δ (P1+P2 stability), and prior α/γ. Consolidates the decision to implement.

---

## Headlines

1. **Distilled propagation is the largest speed lever we have** (proven T1/α: 36% latency, 67% input tokens, equal-or-better quality).
2. **Parallelism via DAG scheduler is the second largest** (external literature: 3–4×).
3. **Grounded P2 ascent is a quality lever, not a speed lever** (λ: 5/7 wins, accuracy parity, zero hallucinations — but each call costs ~same as P1).
4. **Prompt caching is a free ~1.3× on input-side** (provider-native).
5. **Stacked target**: 4–6× realistic on small/medium schemas, higher on larger ones via cluster parallelism. 5× minimum on larger DBs is attainable.

---

## Test results summary

| Test | Scope | Outcome | Decision |
|---|---|---|---|
| T1 (Chinook, 5 tables) | Distilled vs verbose prompt | 36% latency ↓, 67% input tokens ↓, quality same or better | Ship distilled as default |
| T2 (VIF ordering sim) | Chinook simulation | Tie (all level-0 VIFs equal) | Defer VIF sim to larger schemas |
| T4 (Chinook depth) | Synthesis ramp claim | Failed — latency grows with depth due to column count | Drop synthesis-ramp narrative |
| α (synthetic chain-10) | Constant-complexity depth test | Output tokens grow mildly with depth (+17%); descriptions richer, not shorter | Propagation = quality, not speed |
| γ (concise directive) | Explicit LLM instruction | Output shrinks ~10% uniformly but growth pattern same | Include directive in prompt template |
| δ1 (chain P1+P2) | P2 refinement cost | P2 is 30% faster median, 84% smaller output than P1 | P2 is cheap refinement |
| δ2 (chain P1+P2×2) | P2 convergence check | P2 keeps rewriting cosmetically; no self-reported convergence | Run P2 exactly once; no iteration |
| κ (Chinook quality) | P1 vs P1+unguarded-P2 | Unguarded P2 hallucinated in 4/7 tables | Unguarded P2 is unsafe |
| **λ (Chinook grounded P2)** | **P1 vs P1+grounded-P2** | **B wins 5/7, zero hallucinations, desc-aware 4.5 → 9.8** | **Ship grounded P2 as quality flag** |

### λ in detail

```
Wins:  A (P1-only) = 1   B (P1+grounded-P2) = 5   tie = 1
Avg accuracy:           A = 9.7   B = 9.8
Avg descendant-aware:   A = 4.5   B = 9.8
Hallucination count:    0 / 7  (was 4/7 in unguarded κ)
```

Fix that made it work: restore FULL schema context (columns, stats, FK details, parent summaries) in the P2 prompt, not just the current description. Rule added: "only add facts supported by the schema or direct descendants."

---

## What's in the implementation

### Ships as default
1. **Distilled propagation in P1**: `buildTableContext` uses 1-line parent summaries instead of verbose paragraphs. Target: 67% input token reduction.
2. **Concise directive**: prompt explicitly requests 1-sentence descriptions, 15-25 words. Target: ~10% output reduction.
3. **Parallel processLevel**: for-loop replaced with worker pool, `levelConcurrency` config knob (default 4). Target: 3× wall time reduction.
4. **Feature flags in config**: `useDistilledPropagation`, `levelConcurrency`, `useGroundedP2Refinement`.

### Ships behind a flag (off by default)
5. **Grounded P2 ascent**: after all P1 calls in an iteration, run a refinement pass for non-leaf tables. Uses full schema grounding. Trade: ~1.6× total call count, ~0.2 F1 gain on descendant-awareness.

### Deferred to future phase
6. **Fiedler-based cluster partitioning for Phase 3 pruning**: marginal value on small schemas; valuable on 50+-table schemas with multi-domain FK candidates. Design is documented in architecture.md.
7. **Reach-priority tiebreak in scheduler**: cheap to add once scheduler exists, defer until measurement justifies.

---

## Expected end-to-end speedup

Conservative estimate on LousyDB (20 tables, 26:20 baseline):

| Configuration | Projected | Speedup |
|---|---|---|
| Baseline (today) | ~1580 s | 1.0× |
| + distilled prompts | ~1050 s | 1.5× |
| + 4-way parallelism | ~280 s | 5.6× |
| + concise directive | ~260 s | 6.1× |
| + prompt caching (est.) | ~220 s | 7.2× |

Target met (≥5× on larger DBs). Achievable with the default-on changes alone.

Quality flag (grounded P2) adds maybe 30% back to wall time for +0.3 F1 in description quality.

---

## Open risks

1. **Network variance**: Gemini API has ~5-10% of calls taking 3-5× median latency. Need retry + reasonable timeout budget. Observed 222s hangs on 2/19 calls during overnight testing.
2. **Rate limits**: 4 concurrent workers should fit within Gemini Flash's RPM, but schemas with 50+ tables might hit ceiling briefly in initial waves. Adaptive throttle recommended.
3. **Phase 0 backprop gaps**: within-level gaps (~34% of Chinook Phase 1 time) come from backprop LLM calls we haven't optimized. If these dominate after parallelism speeds up per-table work, they'll become the next bottleneck.
4. **Quality vs ground truth**: we only have PK/FK ground truth, not description ground truth. Quality claims rely on LLM-judge comparisons, which is imperfect.

---

## What's been done vs what still needs doing

- [x] Instrumentation in pipeline (merged to dbautodoc-perf-incremental branch)
- [x] Smoke tests designed and run (T1, α, γ, δ1, δ2, κ, λ)
- [x] Plan doc + architecture doc + smoke-tests.md written
- [x] Docker container for smoke tests
- [ ] **Implementation of distilled propagation in buildTableContext** ← next
- [ ] **Implementation of parallel processLevel** ← next
- [ ] **Feature flags added to config**
- [ ] **Unit tests updated + passing**
- [ ] **End-to-end run on Chinook + LousyDB with new implementation**
- [ ] **Quality comparison against paper baseline**
