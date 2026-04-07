# Causal Graph Execution Engine for DBAutoDoc Discovery

## Problem

DBAutoDoc's discovery pipeline treats PK detection, FK detection, and LLM validation as sequential phases. Each phase runs to completion before the next begins. For a 137-table schema, this means:

- FK detection for table B waits for table Z's PK — even though B has no relationship to Z
- LLM validation waits for all FK detection to complete — even for relationships already at high confidence
- Evidence discovered early doesn't prune downstream work until a phase boundary is crossed
- The most expensive operation (DB value overlap queries at 6-30s each) runs exhaustively on all surviving candidates, including many that could be eliminated by evidence already available elsewhere in the graph

## Core Insight

The detection stages aren't truly sequential dependencies — they're **parallel streams connected by causal edges**. A PK confirmation in table A should immediately activate FK inference for tables referencing A. An LLM verdict shouldn't be a post-hoc validation phase — it should be a Bayesian evidence source that updates PK/FK beliefs inline.

The relationships between tables, columns, and detection stages form a natural **causal network**. Representing this network explicitly — and propagating beliefs through it — enables both parallelism and pruning that the sequential model cannot achieve.

## Proposed Solution

Replace the sequential phase pipeline with a **causal Bayesian network** operating at two levels:

### Inter-graph: Between detection stages
PK, FK, and LLM operate as parallel streams. As individual PK beliefs resolve (not "the PK phase"), FK inference activates for dependent tables. LLM evidence feeds back into PK/FK belief updates as a Bayesian update source, not as a separate validation step.

### Intra-graph: Within each detection stage
Tables and columns are nodes in a directed graph with causal edges. Information propagates through the network: a PK confirmation triggers belief updates in all connected FK hypotheses. Transitive dependencies can push beliefs to 1.0 (confirmed) or 0.0 (disproved) purely through propagation — without running the expensive DB query.

### LLM as Bayesian updater
LLM is not a subgraph or phase — it's an evidence source integrated into the belief update loop. When statistical evidence leaves a belief ambiguous (e.g., FK confidence at 0.6), the LLM provides a Bayesian update that resolves it. LLM calls fire when needed, not as a blanket pass over all candidates.

## Where the Time Savings Come From

The expensive operations in the current pipeline are:
1. **DB value overlap queries** (Gate 6 in FKDetector): 6-30s per candidate pair
2. **LLM calls**: ~2-5s per validation batch
3. **Column statistics queries**: ~0.5-1s per column (mitigated by ColumnStatsCache)

The causal graph reduces wall time through:

### 1. Early pruning eliminates expensive queries
A column proven non-PK (belief → 0.0) instantly eliminates all FK edges pointing to it. Those value overlap queries — which would have cost 6-30s each — never execute.

**Concrete example**: In the current pipeline, FKDetector tests `CALLTYPECODE` against 10 potential targets (all rejected at Gate 6 with 0% overlap). In the causal model, if pre-scan naming heuristics assign low prior probability to these edges, and the PK subgraph confirms that the target CODE columns are weak PK candidates (position multiplier, poor naming score), those edges prune before any overlap query runs.

### 2. Transitive closure confirms relationships cheaply
If A.ID is confirmed PK (1.0), and B.AID has 95% value overlap with A.ID, and C.BID has 92% overlap with B.BID — the causal graph can infer C→B→A transitively. The belief propagation for C.BID→B.BID can incorporate A's PK confidence without a separate expensive test.

### 3. No phase boundaries means no idle time
In the sequential model, after PK detection completes for table 1, the system does nothing with that information until ALL 137 tables complete PKs. In the causal model, FK inference for tables depending on table 1's PK starts immediately.

### 4. LLM calls are targeted, not exhaustive
Instead of validating all FK candidates in a blanket pass, LLM evidence fires only for beliefs in the ambiguous zone (e.g., 0.3-0.7 confidence). High-confidence and low-confidence beliefs resolve through statistical evidence alone.

## Cost of the Graph

The Bayesian propagation overhead (computing posteriors, managing the graph, topological updates) is sub-millisecond per operation. For 137 tables × ~20 columns = ~2,740 nodes, even full graph traversal is negligible compared to a single 6s DB query. The graph pays for itself if it eliminates even one unnecessary value overlap test.

## Scope

- **In scope**: Discovery phase (`DiscoveryEngine.discover()` and its sub-phases: PKDetector, FKDetector, LLM validation, backpropagation)
- **Out of scope**: DB introspection, data sampling, main LLM description analysis, export
- **Target directory**: `packages/DBAutoDoc/src/discovery/`
- **Contract preserved**: Same inputs (schemas + config), same outputs (PKCandidate[], FKCandidate[]), different execution model
- **Incremental adoption**: Can be feature-flagged alongside existing sequential pipeline for A/B comparison
