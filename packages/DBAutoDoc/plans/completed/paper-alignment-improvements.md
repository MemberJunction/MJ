# DBAutoDoc: Tool Improvements to Align with Research Paper

## Purpose
This plan identifies gaps between the current DBAutoDoc implementation and claims made in the research paper outline, plus improvements that would strengthen the evaluation story.

---

## 1. Convergence Detection Enhancement

### Paper Claim
Section 5.6 describes "semantic comparison" and "material change detection" for convergence — the system should detect when descriptions stop changing *semantically*, not just when no log entries are marked `changed`.

### Current Implementation
`ConvergenceDetector.hasConverged()` checks:
1. Max iterations (hard stop)
2. Stability window — scans `processingLog` for any entry with `result === 'changed'`
3. Confidence threshold — all tables above minimum

The semantic comparison (`AnalysisEngine.compareDescriptions()`) exists and calls the LLM, but its result is only used to set the `changed`/`unchanged` flag in the log. The convergence detector doesn't distinguish between "wording changed but meaning didn't" vs "material semantic shift."

### Proposed Improvement
- Track the `materialChange` boolean from `SemanticComparisonPromptResult` separately in log entries
- Add a convergence mode that counts only *material* changes in the stability window
- This makes convergence more robust: minor LLM rephrasing across iterations won't prevent convergence, but genuine semantic shifts will reset the stability window
- **Config addition**: `convergence.useSemantic: boolean` (default: true)

### Files to Modify
- `src/core/ConvergenceDetector.ts` — add semantic-aware `hasRecentMaterialChanges()`
- `src/state/IterationTracker.ts` — ensure `ProcessingLogEntry` carries `materialChange` field
- `src/types/config.ts` — add `useSemantic` to `ConvergenceConfig`

### Effort: Small (1-2 hours)

---

## 2. Multi-Hop Backpropagation Cascading

### Paper Claim
Section 5.5 describes recursive propagation: "If their descriptions change, recursively propagate to *their* dependents" with depth limiting.

### Current Implementation
Backpropagation is single-hop per iteration: child insights update parents, but those parent updates don't immediately trigger *their* parents within the same iteration. Multi-level cascading happens implicitly across the outer iteration loop (next iteration re-analyzes everything).

### Current Behavior is Actually Fine
The outer iteration loop naturally cascades changes: Iteration 1 propagates A→B, Iteration 2 propagates B→C, etc. This is correct and the paper should describe it accurately. However, within a single iteration, the `maxDepth` config parameter is accepted but not used for recursive propagation.

### Proposed Improvement
- Add optional recursive backpropagation within a single iteration (up to `maxDepth` levels)
- When a parent's description is revised by backpropagation, check if *that* parent has parents, and propagate again (up to depth limit)
- This accelerates convergence for deep dependency chains (fewer outer iterations needed)
- Keep it optional — the current behavior (cascading via outer loop) is valid and simpler

### Files to Modify
- `src/core/BackpropagationEngine.ts` — add recursive propagation loop with depth counter
- Wire up the dependency graph so backprop engine can find parent→grandparent relationships

### Effort: Medium (3-4 hours)

---

## 3. LLM-as-FK-Validator Feedback Loop (Paper Section Addition)

### Paper Gap
The bidirectional flow between statistical FK detection and LLM analysis is not described in the outline but is implemented:
- `processFKInsightsFromLLM()` takes structured `foreignKeys` from the table analysis LLM response
- These are fed back into the discovery phase, creating new FK candidates or boosting/demoting existing ones

### Current Implementation Status
`processFKInsightsFromLLM()` is implemented (lines 795-927) and active. The deprecated regex-based `extractAndFeedbackFKInsights()` is disabled.

### No Code Change Needed
The implementation is solid. The paper just needs to describe this feature prominently (see outline updates).

---

## 4. Evaluation Infrastructure

### Paper Needs
Section 7 requires 3-5 diverse databases with measurable ground truth. The current implementation has only been tested on one anonymized enterprise database.

### Plan
1. **AdventureWorks** (SQL Server) — well-documented, 70+ tables, declared keys that can be stripped
2. **Pagila** (PostgreSQL) — PostgreSQL port of Sakila, 15 tables, clean schema
3. **Northwind** (SQL Server/PostgreSQL) — classic, small, well-understood
4. **Chinook** (cross-platform) — music store, 11 tables, simple relationships
5. **Additional enterprise databases** (anonymized) — dozens available from real clients

### Evaluation Methodology
For each benchmark database:
1. Run with all declared keys → baseline (ground truth for key discovery)
2. Strip all PK/FK constraints → run DBAutoDoc
3. Measure: PK precision/recall, FK precision/recall, description quality (human eval 1-5)
4. Run ablation: with vs. without backpropagation, with vs. without ground truth
5. Record: convergence curves, token usage, cost, iterations to stability

### Evaluation Scripts Needed
- `scripts/eval/strip-keys.sql` — removes all PK/FK declarations from a database copy
- `scripts/eval/compare-keys.ts` — compares discovered vs. declared keys, computes P/R/F1
- `scripts/eval/convergence-plot.ts` — generates convergence curve data from state.json
- `scripts/eval/ablation-runner.ts` — runs multiple configurations and collects results

### Effort: Large (1-2 weeks for full evaluation suite)

---

## 5. Ground Truth Propagation Metrics

### Paper Claim
Section 5.7 and 7.3.3 claim ground truth on a few key tables "propagates quality improvements broadly."

### Current Implementation
Ground truth is applied and respected (never overwritten), but there's no measurement of how far its influence spreads through backpropagation.

### Proposed Improvement
- Track a `groundTruthInfluence` field on each table's description iteration
- When backpropagation fires because a ground-truth table was a neighbor, mark the resulting description as "ground-truth-influenced"
- This enables the ablation study: "injecting GT on 10% of tables improved descriptions on X% of non-GT tables"

### Files to Modify
- `src/types/state.ts` — add `groundTruthInfluenced: boolean` to `DescriptionIteration`
- `src/core/BackpropagationEngine.ts` — set flag when any trigger source has ground truth
- `src/core/AnalysisEngine.ts` — set flag when `buildTableContext()` includes GT-flagged neighbor descriptions

### Effort: Small (2-3 hours)

---

## 6. Convergence Curve Data Export

### Paper Need
Section 7.3.1 needs convergence curves showing "% of descriptions changing per iteration."

### Current Implementation
The data exists in `processingLog` entries but isn't aggregated or exported in a plottable format.

### Proposed Improvement
- Add a `convergence-report` export format that produces a CSV/JSON with per-iteration stats:
  - Iteration number, tables changed, tables unchanged, avg confidence, backprop triggers, tokens used
- This feeds directly into paper figures

### Files to Modify
- New file: `src/generators/ConvergenceReportGenerator.ts`
- `src/core/AnalysisOrchestrator.ts` — add to export pipeline

### Effort: Small (1-2 hours)

---

## 7. Ablation Mode Configuration

### Paper Need
Section 7.3.2 requires running with vs. without backpropagation. Section 7.3.3 requires varying ground truth coverage.

### Current Implementation
Backpropagation can be disabled via `config.analysis.backpropagation.enabled = false`. Ground truth can be omitted from config. So ablation is *possible* but requires manually creating multiple config files.

### Proposed Improvement
- Add CLI flags: `--no-backpropagation`, `--no-ground-truth`, `--single-pass` (1 iteration, no backprop, no sanity checks)
- Add `--ablation-mode` that runs all variants sequentially and produces a comparison report
- Output separate state files for each variant

### Files to Modify
- `src/commands/analyze.ts` — add CLI flags
- New file: `src/commands/ablation.ts` — orchestrates multiple runs

### Effort: Medium (4-6 hours)

---

## 8. Seed Context vs. Ground Truth Distinction

### Paper Gap
The paper should distinguish between:
- **Ground Truth**: Immutable expert descriptions that are never overwritten (anchors)
- **Seed Context**: Domain background (business purpose, industry, custom instructions) that guides analysis but doesn't lock descriptions

### Current Implementation
Both exist as separate config sections (`groundTruth` and `seedContext`), but the paper outline lumps them together.

### No Code Change Needed
The distinction is already clean in the implementation. The paper just needs to describe both mechanisms (see outline updates).

---

## Priority Order

| # | Improvement | Effort | Paper Impact | Priority |
|---|------------|--------|-------------|----------|
| 4 | Evaluation infrastructure | Large | Critical | P0 |
| 1 | Semantic convergence detection | Small | High | P1 |
| 5 | Ground truth propagation metrics | Small | High | P1 |
| 6 | Convergence curve export | Small | High | P1 |
| 7 | Ablation mode CLI | Medium | High | P1 |
| 2 | Recursive backpropagation | Medium | Medium | P2 |
| 3 | LLM-as-FK-validator (paper only) | None | Medium | P2 |
| 8 | Seed context distinction (paper only) | None | Low | P3 |

---

## Timeline Estimate

- **Week 1**: P0 — Set up evaluation databases (AdventureWorks, Pagila, Northwind), build key-stripping and comparison scripts
- **Week 2**: P1 — Semantic convergence, GT propagation tracking, convergence export, ablation CLI
- **Week 3**: P2 — Recursive backpropagation, run full evaluation suite across all databases
- **Week 4**: Analysis — Generate all figures, tables, and ablation comparisons for paper
