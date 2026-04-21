# Architecture: Knowledge Propagation Speedup

This is the detailed design behind the vision in [README.md](README.md). Read that first.

---

## Core abstractions

### 1. `SchemaGraph`

Immutable representation of the schema as a directed graph where:
- Nodes = tables (each carrying columns, stats, Phase 0 confidence)
- Edges = FK relationships (A→B means "A has FK pointing to B", i.e. A depends on B)

Computed once after Phase 0. Backed by:
- `nodes: Map<string, TableNode>` — keyed by `schema.table`
- `outEdges: Map<string, Edge[]>` — A→B edges keyed by source
- `inEdges: Map<string, Edge[]>` — B←A edges keyed by target

### 2. `SchemaPartitioner`

Splits `SchemaGraph` into a forest of clusters that can be processed independently.

```typescript
interface Partition {
  clusters: Cluster[];           // disjoint subsets of nodes
  bridgeEdges: Edge[];           // FK edges that cross clusters (handled separately)
  bridgeNodes: string[];         // tables with low Fiedler magnitude (cluster boundaries)
}

class SchemaPartitioner {
  partition(graph: SchemaGraph): Partition;
}
```

Algorithm (two-pass):
1. **Hard partition** via Union-Find over FK edges → disconnected components. Most small schemas yield 1 component; larger enterprise schemas may yield several.
2. **Soft partition** within each component via recursive Fiedler bisection:
   - Compute graph Laplacian L = D − A
   - Extract Fiedler vector (2nd-smallest eigenvector of L) via power iteration with deflation
   - Split nodes by sign of their Fiedler entry; recurse on each half until cluster size ≤ threshold (e.g. 15 tables) OR algebraic connectivity λ₂ ≥ threshold (component is tight, stop splitting)
3. Edges between resulting clusters become "bridges" — their source tables are marked as bridge nodes and processed last with context from both sides.

### 3. `PriorityQueue<TableNode>` with composite key

```typescript
function composePriority(table: TableNode, graph: SchemaGraph): PriorityKey {
  return {
    ready: table.unresolvedDependencyCount === 0,           // must be true to dispatch
    reach: -graph.reachableDescendants(table).size,         // prefer high-reach (negated for min-heap)
    vif: computeVIF(table, graph),                          // prefer low VIF
    promptSize: -estimatePromptSize(table),                 // LPT (negated)
  };
}
```

Tables not yet ready are held separately and promoted to the queue as their dependencies resolve.

### 4. `TaskScheduler`

Generic dependency-aware scheduler. Holds a priority queue + worker pool.

```typescript
class TaskScheduler<T> {
  constructor(opts: {
    concurrency: number;
    priority: (t: T) => PriorityKey;
    executor: (t: T, ctx: ExecutionContext) => Promise<void>;
  });

  addTask(task: T, dependencies: T[]): void;
  async drain(): Promise<SchedulerReport>;
}
```

Reports: total wall time, per-task latency, queue depth over time, worker utilization, cache hit rate.

### 5. `PropagationContext`

Carries distilled knowledge down edges as tables resolve.

```typescript
interface DistilledSummary {
  schema: string;
  table: string;
  purpose: string;          // ≤ 15-word one-liner
  pk: string[];             // column names
  domain: string;           // "Sales", "HR", etc.
  roleInParent?: string;    // only for bidirectional ascent
}

class PropagationContext {
  recordResolution(table: TableNode, summary: DistilledSummary): void;
  getAncestorSummaries(table: TableNode): DistilledSummary[];
  getDescendantSummaries(table: TableNode): DistilledSummary[];  // for ascent
}
```

Extraction of `DistilledSummary` from a full LLM response is deterministic: pull the first sentence, PK columns from the structured output, domain from the structured output. No second LLM call required.

### 6. `PromptAssembler`

Composes the LLM prompt from cacheable and dynamic parts.

```typescript
class PromptAssembler {
  buildPrompt(table: TableNode, ctx: PropagationContext): PromptPayload;
}

interface PromptPayload {
  cachePrefix: string;   // boilerplate + JSON schema + allTables — stable across calls
  dynamicSuffix: string; // table info + columns + distilled-ancestor summaries
}
```

Provider integration:
- **Gemini**: implicit cache matches the longest common prefix automatically. We structure our prompt so `cachePrefix` is exact-match stable across all calls.
- **Anthropic**: explicit `cache_control: ephemeral` marker at end of `cachePrefix`.

### 7. `PhaseOneExecutor`

Replaces today's `AnalysisEngine.processLevel` loop.

```typescript
class PhaseOneExecutor {
  async run(graph: SchemaGraph, phase0Result: DiscoveryResult): Promise<Phase1Result> {
    const partition = this.partitioner.partition(graph);
    const scheduler = new TaskScheduler<TableNode>({
      concurrency: 4,
      priority: composePriority,
      executor: this.analyzeTable.bind(this),
    });

    // Add all tables with their FK-derived dependencies
    for (const cluster of partition.clusters) {
      for (const node of cluster.nodes) {
        scheduler.addTask(node, node.dependencies);
      }
    }
    // Bridge tables get added last, after any of their cluster's work has started
    for (const bridgeNode of partition.bridgeNodes) {
      scheduler.addTask(bridgeNode, this.bridgeDependencies(bridgeNode, partition));
    }

    return await scheduler.drain();
  }

  private async analyzeTable(node: TableNode, ctx: ExecutionContext): Promise<void> {
    const payload = this.promptAssembler.buildPrompt(node, ctx.propagation);
    const result = await ctx.llm.call(payload);
    const summary = extractDistilledSummary(result);
    ctx.propagation.recordResolution(node, summary);
    ctx.state.setTableDescription(node, result);
  }
}
```

## The difficulty-decay claim — why each piece matters

The vision's central claim is that **LLM work per call decreases as DFS descends**, because later calls are synthesis tasks rather than inference tasks. This only holds if all of the following are true simultaneously:

1. **Ancestors are resolved before descendants** — topological ordering via the DAG scheduler enforces this.
2. **Resolutions are distilled into compact, structured summaries** — the `PropagationContext` with `DistilledSummary` type guarantees this.
3. **The summary is semantically sufficient** — an LLM receiving "Playlist: user-curated track collection, PK=PlaylistId; Track: individual song, PK=TrackId" has enough to synthesize "PlaylistTrack is a many-to-many junction" without re-deriving what Playlist and Track are.

If any one of these breaks, the claim breaks. Specifically:
- If summaries are too terse (e.g., just the table name), the LLM has to re-infer from primitives — no synthesis, just inference.
- If summaries are verbose (full paragraphs), we're back to today's prompt bloat.
- If DFS order is wrong (junctions processed before their parents), synthesis has nothing to synthesize from.

This is why the architecture ships as a unified system. Each piece is load-bearing for the others.

## Parallelism model

Worker pool with provider-aware concurrency. Realistic numbers:
- Gemini Flash: 60 req/min RPM limit, ~5 concurrent requests well-tolerated
- Anthropic Sonnet: tier-dependent, conservative default 4 concurrent

Within a cluster:
- Multiple level-0 nodes can dispatch immediately
- As each resolves, its direct dependents become ready and enter the queue
- The scheduler maintains N concurrent workers; when one completes, the next highest-priority ready task dispatches

Across clusters:
- All clusters share the same worker pool
- No inter-cluster coordination needed (bridges handled by explicit dependencies)

Expected "wave" behaviour:
1. Initial wave: fills workers with top-reach-priority level-0 nodes
2. Propagation: as level-0 resolves, descendants become ready; each resolution unblocks ~constant number of children
3. Tail: junction/bridge tables with many inbound dependencies wait for all of them, then dispatch with maximum context — these calls are synthesis, fast, and have minimal tail tax

## Where the paper's "parallel within level" model breaks down

The paper claims wall time is bounded by **dependency depth n**, not table count |T|, because levels are parallelizable. This is optimistic:
- It assumes every level's tables can dispatch simultaneously. In practice, LLM rate limits cap parallelism at ~4–8 per provider.
- It ignores the tail problem: within a level, the slowest table determines level completion.
- It serializes across levels with a hard barrier, so a level with one 15s outlier blocks the next level by 15s even if other tables in the level finished in 5s.

Our model removes the level barrier. A table in level 2 can start as soon as *its specific* dependencies are done, regardless of what the rest of level 1 is doing. In graph terms: we schedule by the DAG's longest-path dependencies, not by the topological-level discretization.

## What we keep from today's system

- `DiscoveryEngine` (Phase 0) — unchanged. Its output (PK/FK candidates with confidence, populated `ColumnStatsCache`) is exactly the right input for our architecture.
- `table-analysis.md` prompt template — restructured into stable prefix + dynamic suffix but the content guidelines stay the same.
- All convergence / ground-truth / locking infrastructure — operates on the output of the new executor identically.
- The post-Phase-1 pruning passes — unchanged.

The change is surgical: `AnalysisEngine.processLevel` is replaced by `PhaseOneExecutor.run`. Everything else is infrastructure the new executor uses.

## Feature flags

Each piece is flag-gated for measurement:

```yaml
analysis:
  phase1Executor: "scheduler"   # or "legacy-serial"
  scheduler:
    useClusterPartitioning: true    # Union-Find + Fiedler
    useReachPriority: true          # max-reach bias
    useVifPriority: true            # low-VIF tiebreak
    useDistilledPropagation: true   # vs verbose parent descriptions
    concurrency: 4
    useProviderCache: true          # Gemini implicit cache hint
```

This lets us ablate each contributor independently, which is required to publish the ablation table promised in the success metrics.
