# Implementation Tasks

## Phase 1: Core Graph Infrastructure

### 1.1 Define graph node types and belief model
- Create `src/discovery/graph/types.ts` with `GraphNode`, `HypothesisNode`, `EvidenceNode`, `Belief`, `WorkItem` interfaces
- Define `StateTransition` type (confirmed | pruned | activated)
- Define evidence likelihood ratio table as a calibratable config

### 1.2 Implement CausalGraph class
- Create `src/discovery/graph/CausalGraph.ts`
- Node management: add/get/remove nodes and edges
- `addEvidence()`: Bayesian update using log-odds
- `propagate()`: walk causal edges, apply confirm/prune/activate transitions
- `isConverged()`: check if all hypotheses resolved or queue empty

### 1.3 Implement PriorityQueue for work items
- Create `src/discovery/graph/WorkQueue.ts`
- Priority based on downstream impact (number of hypotheses × uncertainty)
- Support for dependency gating (don't dequeue until dependencies met)
- Concurrency pool integration (DB pool, LLM pool)

## Phase 2: Graph Construction from Schema

### 2.1 Build initial graph from schema metadata
- Create `src/discovery/graph/GraphBuilder.ts`
- Create TableNodes and ColumnNodes from `SchemaDefinition[]`
- Create PK hypothesis nodes for eligible columns (reuse PKDetector eligibility logic)
- Create FK hypothesis edges using `FKDetector.findPotentialTargets()` naming heuristics
- Assign prior probabilities based on naming, position, type

### 2.2 Calibrate prior probabilities
- Map existing PKDetector heuristic scores (H1-H12) to Bayesian priors
- Map FKDetector gate logic to prior edge weights
- Validate against known ground-truth schemas (the existing test databases)

## Phase 3: Evidence Sources as Graph Operations

### 3.1 Wrap PKDetector as stateless evidence producer
- Extract `analyzeSingleColumnPK()` → returns `Evidence` (not `PKCandidate`)
- Extract `detectCompositeKeys()` → returns `Evidence`
- Remove internal state management (graph owns state)
- Keep `ColumnStatsCache` as shared resource

### 3.2 Wrap FKDetector as stateless evidence producer
- Extract `analyzeFKCandidate()` → returns `Evidence` (value overlap result)
- Remove sequential iteration logic (graph schedules work items)
- Keep gate logic as pre-checks before enqueuing expensive work

### 3.3 Wrap LLM validation as evidence producer
- `SanityChecker.reviewCandidates()` → returns `Evidence[]`
- `LLMValidator.validateTableRelationships()` → returns `Evidence[]`
- Triggered by ambiguity detection, not phase boundary

## Phase 4: Execution Engine

### 4.1 Implement the main execution loop
- Create `src/discovery/graph/GraphExecutionEngine.ts`
- Replace `DiscoveryEngine.executeIteration()` with graph-driven loop
- Dequeue → execute → update → propagate → enqueue cycle
- Convergence detection

### 4.2 Implement concurrency pools
- DB query pool (configurable, default 5)
- LLM call pool (configurable, default 3)
- Dispatching from work queue to appropriate pool
- Result callback → graph update

### 4.3 Implement checkpointing
- Serialize graph state (node beliefs, evidence history, queue state)
- Resume from checkpoint (reconstruct graph, re-populate queue)
- Compatible with existing `onCheckpoint` callback pattern

## Phase 5: Integration

### 5.1 Wire into DiscoveryEngine
- New code path behind feature flag: `config.discovery.useCausalGraph: boolean`
- `DiscoveryEngine.discover()` delegates to `GraphExecutionEngine` when flag is on
- Same output contract: `PKCandidate[]`, `FKCandidate[]`

### 5.2 Logging and observability
- Log belief transitions (what evidence caused what state change)
- Log pruning events (what work was avoided)
- Summary stats: total work items enqueued vs executed vs pruned
- Comparison metric: wall time vs sequential baseline

### 5.3 Testing
- Unit tests for Bayesian update math
- Unit tests for propagation (confirm/prune chains)
- Integration test: run both sequential and causal on same schema, compare results
- Performance benchmark: wall time comparison on 137-table ACA schema

## Phase 6: Calibration and Tuning

### 6.1 Likelihood ratio calibration
- Run against ground-truth databases where PKs/FKs are known
- Measure precision/recall for each evidence type's likelihood ratio
- Adjust ratios to maximize F1 score

### 6.2 Threshold tuning
- Confirmation threshold (default 0.95): too low = false positives, too high = unnecessary LLM calls
- Pruning threshold (default 0.05): too high = missed relationships, too low = wasted queries
- Activation threshold (default 0.5): too low = premature FK testing, too high = delayed parallelism

### 6.3 Priority function tuning
- Compare priority strategies: downstream impact vs uncertainty reduction vs cost minimization
- Profile on real schemas to find the strategy that minimizes wall time
