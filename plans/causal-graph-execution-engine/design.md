# Causal Graph Execution Engine — Design

## 1. Graph Topology

### 1.1 Node Types

```
TableNode        — represents a table (e.g., CRM.CUSTOMER)
ColumnNode       — represents a column (e.g., CRM.CUSTOMER.ID)
HypothesisNode   — represents a belief (e.g., "CUSTOMER.ID is PK", "ORDER.CUSTOMERID → CUSTOMER.ID")
EvidenceNode     — represents an observation (e.g., "CUSTOMER.ID has 100% uniqueness")
```

### 1.2 Edge Types (Causal)

```
TableNode ──contains──▶ ColumnNode           (structural, static)
ColumnNode ──hypothesis──▶ HypothesisNode     (column participates in this hypothesis)
EvidenceNode ──updates──▶ HypothesisNode      (evidence modifies belief probability)
HypothesisNode ──activates──▶ HypothesisNode  (inter-graph causal: PK confirmation activates FK hypotheses)
HypothesisNode ──prunes──▶ HypothesisNode     (PK rejection eliminates FK hypotheses targeting it)
```

### 1.3 Initial Graph Construction (Pre-scan)

Before any DB queries, build the full graph from schema metadata alone:

1. **Create structural nodes**: One TableNode per table, one ColumnNode per column
2. **Create PK hypothesis nodes**: One per column that passes cheap eligibility (non-null type, not in blacklist)
3. **Create FK hypothesis edges**: One per (source_column, target_column) pair where naming heuristics suggest a relationship. This is the "fully connected" starting point — every plausible FK edge exists with a prior probability
4. **Assign priors**: Based on naming patterns, column position, data type compatibility

The priors are cheap to compute (string matching, type checking) and establish the initial belief state before any expensive operations.

## 2. Belief Model

### 2.1 Belief Representation

Each HypothesisNode carries:

```typescript
interface Belief {
  probability: number;        // 0.0 to 1.0
  status: 'active' | 'confirmed' | 'pruned';
  evidenceHistory: Evidence[];  // ordered list of updates
  activationThreshold: number;  // probability at which downstream work triggers
  confirmationThreshold: number; // probability at which belief is locked (e.g., 0.95)
  pruningThreshold: number;     // probability below which belief is eliminated (e.g., 0.05)
}
```

### 2.2 Bayesian Update Rule

When new evidence E arrives for hypothesis H:

```
P(H | E) = P(E | H) * P(H) / P(E)
```

In practice, we use log-odds for numerical stability:

```
logit(posterior) = logit(prior) + log_likelihood_ratio(evidence)
```

Each evidence type has a pre-calibrated likelihood ratio:

| Evidence Type | LR when supports H | LR when contradicts H |
|---|---|---|
| 100% unique column | 50.0 | 0.02 |
| Column named `{Table}ID` | 20.0 | 0.5 |
| Position 0 in table | 5.0 | 0.8 |
| Value overlap ≥ 95% | 100.0 | — |
| Value overlap < 10% | — | 0.001 |
| LLM says "yes, this is FK" | 10.0 | 0.1 |
| LLM says "no" | 0.1 | 10.0 |
| Transitive: A→B confirmed, B→C candidate | 3.0 | — |

These ratios are tunable and should be calibrated against ground-truth databases.

### 2.3 Propagation Rules

When a hypothesis transitions state:

**Confirmed (P ≥ 0.95)**:
- If PK hypothesis: activate all FK hypotheses targeting this column (set their activation flag)
- If FK hypothesis: update the TopologicalSorter dependency for the analysis phase

**Pruned (P ≤ 0.05)**:
- If PK hypothesis: prune all FK hypotheses targeting this column (set P → 0.0, status → pruned)
- If FK hypothesis: remove from candidate set, no further evidence collection

**Activation threshold crossed (P ≥ 0.5)**:
- FK hypothesis whose PK dependency is now ≥ 0.5: schedule value overlap test
- Previously deferred work becomes eligible

## 3. Execution Model

### 3.1 Work Queue

Instead of iterating tables in a loop, the engine maintains a priority queue of **work items**:

```typescript
interface WorkItem {
  type: 'column_stats' | 'value_overlap' | 'composite_check' | 'llm_update';
  targetNode: HypothesisNode;
  priority: number;          // higher = more impactful (based on how many downstream nodes it would update)
  estimatedCost: number;     // ms estimate for this operation
  dependencies: Belief[];    // beliefs that must be above activation threshold
}
```

The scheduler picks work items by priority, respecting a concurrency limit for DB queries.

### 3.2 Execution Loop

```
1. Initialize graph from schema metadata (assign priors)
2. Enqueue initial work items:
   - column_stats for all PK-eligible columns (cheap, no dependencies)
   - value_overlap for FK hypotheses whose PK dependency priors are already high
3. While work queue is non-empty AND not converged:
   a. Dequeue highest-priority item whose dependencies are satisfied
   b. Execute the operation (DB query, LLM call, or pure computation)
   c. Create Evidence node from result
   d. Bayesian-update all connected hypothesis nodes
   e. For each hypothesis that transitions state:
      - Propagate to downstream hypotheses (confirm/prune/activate)
      - Enqueue new work items that are now unblocked
   f. Check convergence: all hypotheses confirmed or pruned?
4. Extract confirmed PKs and FKs as PKCandidate[] and FKCandidate[]
```

### 3.3 Concurrency Model

```
DB query pool:     max 5 concurrent (avoid overwhelming the database)
LLM call pool:     max 3 concurrent (API rate limits)
Graph operations:  synchronous (sub-ms, no need to parallelize)
```

Work items from the queue are dispatched to the appropriate pool. Results flow back through the graph synchronously.

### 3.4 Priority Calculation

A work item's priority is based on its **downstream impact** — how many hypotheses would be updated by its result:

```
priority = (number of downstream hypotheses) × (average uncertainty of those hypotheses)
```

This means:
- A column stats query for a column that's referenced by 15 FK hypotheses runs before one referenced by 2
- A value overlap test for an already-high-confidence FK runs before an ambiguous one (confirmation is cheaper than exploration)

## 4. Inter-graph Causal Chains

### 4.1 PK → FK Activation

```
[PK Hypothesis: CUSTOMER.ID]
    belief: 0.3 → (column_stats: 100% unique, no nulls) → 0.85 → (position 0) → 0.92
    status: active → CONFIRMED (≥ 0.95 after naming evidence)
         │
         ├──activates──▶ [FK Hypothesis: ORDER.CUSTOMERID → CUSTOMER.ID]
         │                  prior was 0.4 (naming match), now activation threshold met
         │                  → enqueue value_overlap test
         │
         ├──activates──▶ [FK Hypothesis: INVOICE.CUSTID → CUSTOMER.ID]
         │                  prior was 0.2 (weak naming), still below activation
         │                  → stays dormant until more evidence
         │
         └──prunes──▶    [FK Hypothesis: *.CUSTOMERID → CUSTOMER.NAME]
                           CUSTOMER.NAME PK hypothesis already pruned (not unique)
                           → all FK edges targeting CUSTOMER.NAME are dead
```

### 4.2 FK → LLM Integration

LLM is not a separate phase. It's an evidence source that fires when:

```
if (hypothesis.probability > 0.3 && hypothesis.probability < 0.7
    && hypothesis.evidenceHistory.length >= 2
    && !hypothesis.evidenceHistory.some(e => e.type === 'llm')) {
  enqueue({ type: 'llm_update', targetNode: hypothesis, priority: ... });
}
```

The LLM call produces an evidence node that Bayesian-updates the hypothesis just like any other evidence. If statistical evidence already pushed the belief to 0.95 or 0.02, no LLM call is needed.

### 4.3 Backpropagation as Belief Revision

Current backpropagation is a post-hoc phase that checks if new FKs should trigger re-evaluation of PKs. In the causal model, this is just reverse propagation:

- FK hypothesis CONFIRMED → update PK hypothesis for the target column (evidence: "something references me as a PK, confidence boost")
- FK hypothesis PRUNED → if this was the only evidence supporting a weak PK candidate, PK belief decreases

This happens naturally through the graph edges — no separate backpropagation phase.

## 5. Data Structures

### 5.1 CausalGraph

```typescript
class CausalGraph {
  nodes: Map<string, GraphNode>;         // all nodes by ID
  hypotheses: Map<string, HypothesisNode>; // quick access to belief nodes
  workQueue: PriorityQueue<WorkItem>;

  addEvidence(nodeId: string, evidence: Evidence): StateTransition[];
  propagate(transitions: StateTransition[]): WorkItem[];
  getConfirmedPKs(): PKCandidate[];
  getConfirmedFKs(): FKCandidate[];
  isConverged(): boolean;
}
```

### 5.2 Integration with Existing Code

The CausalGraph wraps the existing detectors — it doesn't replace them:

```
CausalGraph
  ├── uses PKDetector.analyzeSingleColumnPK()     for column_stats work items
  ├── uses PKDetector.detectCompositeKeys()        for composite_check work items
  ├── uses FKDetector.analyzeFKCandidate()         for value_overlap work items
  ├── uses FKDetector.findPotentialTargets()       for initial FK hypothesis creation
  ├── uses SanityChecker / LLMValidator            for llm_update work items
  └── uses ColumnStatsCache                        shared across all operations
```

The detectors become **stateless workers** that execute individual operations. The graph owns the state and orchestration.

## 6. Convergence

The graph converges when:
1. All hypotheses are either confirmed (≥ 0.95) or pruned (≤ 0.05), OR
2. The work queue is empty (no more evidence can be collected), OR
3. Token/time budget is exhausted

Hypotheses left in the ambiguous zone (0.05 - 0.95) after convergence are reported as candidates with their probability as the confidence score — directly replacing the current 0-100 heuristic score.

## 7. Comparison with Current Pipeline

| Aspect | Current | Causal Graph |
|---|---|---|
| PK detection | Sequential loop, all tables | Parallel, priority-ordered |
| FK detection | Waits for ALL PKs | Starts per-PK as they confirm |
| LLM validation | Separate phase after FK | Inline evidence source, fires on ambiguity |
| Backpropagation | Post-hoc phase | Natural reverse propagation |
| Pruning | Only at gate checks within a phase | Continuous, cross-phase |
| Confidence model | Heuristic 0-100 score | Bayesian probability with evidence trail |
| Concurrency | None | Configurable pools (DB: 5, LLM: 3) |
| Resumability | Checkpoint per phase | Checkpoint = serialize graph state |
