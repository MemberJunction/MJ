# MetaSearchTool — generalized semantic search across MJ tool/capability surfaces

**Status:** Planning / RFC
**Owner:** TBD
**Target release:** TBD (5.31.0 candidate)
**Depends on:** PR #2470 (`feature/agent-action-semantic-search`) — first concrete consumer of the pattern

---

## 1. Problem

PR #2470 introduced `_searchActions` — a built-in meta-tool that, when an agent has more than 25 effective actions, replaces the full action dump in the prompt with a category summary plus an LLM-callable semantic search backed by `AIEngine.FindSimilarActions`.

That pattern (`summarize-and-defer-to-search-when-large`) is generally useful. MJ has many surfaces today that flat-list a potentially-large set of items — agents, queries, prompts, templates, components, MCP tools — and none of them yet share infrastructure for handling scale via semantic search.

We need a single primitive that:

1. Encapsulates the threshold-gate / category-summary / topK-clamp / scope-filter logic in one place.
2. Is reusable from inside agent prompt context, UI picker dialogs, MCP tool catalogs, the Explorer global search bar, and any future surface.
3. Treats the existing `_searchActions` implementation as the validated reference shape — refactor it to consume the new primitive without behavior change.

---

## 2. Goals & non-goals

### Goals

- Define `BaseMetaSearchTool<T>` in `@memberjunction/ai-core-plus` (or another low-level package — see §6).
- Refactor `BaseAgent._searchActions` (PR #2470) to consume `BaseMetaSearchTool<MJActionEntityExtended>`. Existing tests stay green; behavior unchanged.
- Apply the abstraction to **at least one additional surface** in the same release as the abstraction lands. The second consumer is what *proves* the shape is right — without it the abstraction is unfounded.
- Support both **agent-runtime invocation** (LLM calls a meta-tool, gets an `ActionResultSummary`-shaped response) and **UI invocation** (picker dialog calls `tool.invoke({query, topK}, scope)` directly, gets typed matches).

### Non-goals

- Replacing existing alphabetical pickers wholesale. The threshold-gate is opt-in per surface; small lists keep their current behavior.
- Federated MCP tool search across multiple MCP server connections — that's the related but separate "MCP federated tool search" issue (see §11).
- Cross-vendor embedding model abstraction. We use whatever `AIEngine.FindSimilar*` already does.
- Performance/throughput optimization of the embedding pipeline itself — that's the embedding service's concern.

---

## 3. Reference shape (from PR #2470)

The current `_searchActions` flow in `BaseAgent` already exhibits the entire pattern. Lifting it to a base class means extracting these ingredients:

| Concern | Current location in `base-agent.ts` |
|---|---|
| Threshold constant | `ACTION_SEARCH_THRESHOLD = 25` |
| Tool name (reserved, leading underscore) | `ACTION_SEARCH_TOOL_NAME = '_searchActions'` |
| Default topK | `ACTION_SEARCH_DEFAULT_TOP_K = 10` |
| Min cosine similarity floor | `ACTION_SEARCH_MIN_SIMILARITY = 0.3` |
| topK clamp / default fallback | inline in `executeActionSearch` |
| Threshold gate decision | `formatActionDetails` branch |
| Category bucketing | `summarizeActionsByCategory` |
| Summary prompt rendering | `formatActionSummary` |
| Full-dump prompt rendering | `formatActionFullDump` |
| Search invocation | `AIEngine.Instance.FindSimilarActions(query, topK, minSim)` |
| Scope filtering | inline `effectiveById` map + filter in `executeActionSearch` |
| Result message rendering | `formatActionSearchResults` |
| Validation gate (reject `_searchActions` below threshold) | `validateActionsNextStep` |
| Step-entity / observability plumbing | `createStepEntity` + `finalizeStepEntity` |

Of those, the **bottom three** are agent-specific and stay in `BaseAgent`. Everything above is generalizable.

---

## 4. Proposed API

### 4.1 Types (in `@memberjunction/ai-core-plus`)

```typescript
/** Per-item rank returned by the underlying embedding service. */
export interface RawSearchMatch {
  id: string;
  similarityScore: number;
  categoryName?: string | null;
}

/** A scoped, type-resolved match returned by the meta-tool. */
export interface MetaSearchMatch<T> {
  item: T;
  similarityScore: number;
  category?: string | null;
}

/** One row in the category summary block. */
export interface MetaSearchCategoryBucket {
  category: string;
  count: number;
}

export interface MetaSearchInvocation {
  query: string;
  topK?: number;
}

export interface MetaSearchResult<T> {
  matches: MetaSearchMatch<T>[];
  query: string;
  topK: number;
  totalSearched: number;
  totalScopedOut: number;  // raw matches that fell outside the scope
}

export interface MetaSearchToolConfig {
  /** Reserved tool name with leading underscore (e.g. '_searchActions'). */
  toolName: string;
  /** Item-count threshold above which the summary + meta-tool is used. */
  threshold: number;
  /** Default topK when caller omits it. */
  defaultTopK: number;
  /** Hard maximum topK after clamping. */
  maxTopK: number;
  /** Minimum cosine similarity returned to the caller. */
  minSimilarity: number;
  /** Plural noun used in the summary block ("actions", "queries", "tools"). */
  itemNoun: string;
  /** Singular noun used in the summary block ("action", "query", "tool"). */
  itemNounSingular: string;
}

export class MetaSearchToolError extends Error {
  constructor(
    public readonly code: 'MISSING_PARAMETER' | 'SEARCH_ERROR' | 'INVALID_INVOCATION',
    message: string
  ) {
    super(message);
    this.name = 'MetaSearchToolError';
  }
}
```

### 4.2 Base class

```typescript
export abstract class BaseMetaSearchTool<T> {
  constructor(public readonly Config: MetaSearchToolConfig) {}

  /** Subclass: stable key used to scope raw matches to allowed items. */
  protected abstract getId(item: T): string;

  /** Subclass: category for an item (returns null/empty → "Uncategorized"). */
  protected abstract getCategory(item: T): string | null;

  /** Subclass: render one item for the full-dump path (≤ threshold). */
  protected abstract formatItemFullDump(item: T): string;

  /** Subclass: invoke the underlying embedding search. */
  protected abstract searchRaw(query: string, topK: number): Promise<RawSearchMatch[]>;

  /** Subclass: render one match for the result message back to the LLM. */
  protected abstract formatMatchForResult(match: MetaSearchMatch<T>): string;

  // ── Generic logic provided by base ─────────────────────────────

  ShouldUseMetaTool(items: T[]): boolean {
    return items.length > this.Config.threshold;
  }

  SummarizeByCategory(items: T[]): MetaSearchCategoryBucket[] { /* … */ }

  FormatSummary(items: T[]): string { /* category list + meta-tool instructions */ }

  FormatFullDump(items: T[]): string {
    return items.map(i => this.formatItemFullDump(i)).join('\n\n');
  }

  FormatForPrompt(items: T[]): string {
    return this.ShouldUseMetaTool(items) ? this.FormatSummary(items) : this.FormatFullDump(items);
  }

  ResolveTopK(rawTopK: unknown): number { /* clamp + default */ }

  async Invoke(invocation: MetaSearchInvocation, scope: T[]): Promise<MetaSearchResult<T>> {
    const topK = this.ResolveTopK(invocation.topK);
    const query = (invocation.query || '').trim();
    if (!query) {
      throw new MetaSearchToolError('MISSING_PARAMETER',
        `Missing required parameter 'query' for ${this.Config.toolName}.`);
    }
    const raw = await this.searchRaw(query, topK);
    const byId = new Map(scope.map(i => [this.getId(i), i]));
    const matches: MetaSearchMatch<T>[] = raw
      .map(r => ({ raw: r, item: byId.get(r.id) }))
      .filter((x): x is { raw: RawSearchMatch; item: T } => !!x.item)
      .map(x => ({ item: x.item, similarityScore: x.raw.similarityScore, category: x.raw.categoryName ?? null }));
    return {
      matches,
      query,
      topK,
      totalSearched: scope.length,
      totalScopedOut: raw.length - matches.length,
    };
  }

  FormatResultMessage(result: MetaSearchResult<T>): string {
    if (result.matches.length === 0) {
      return `No ${this.Config.itemNoun} matched "${result.query}". Try a broader query or increase topK.`;
    }
    const lines = result.matches.map(m => this.formatMatchForResult(m));
    return [
      `Found ${result.matches.length} ${result.matches.length === 1 ? this.Config.itemNounSingular : this.Config.itemNoun} matching "${result.query}":`,
      ``,
      ...lines,
    ].join('\n');
  }
}
```

### 4.3 Concrete subclass for actions (refactor of #2470)

Lives next to `AIEngine.FindSimilarActions` in `@memberjunction/ai-engine`:

```typescript
export class ActionMetaSearchTool extends BaseMetaSearchTool<MJActionEntityExtended> {
  constructor() {
    super({
      toolName: '_searchActions',
      threshold: 25,
      defaultTopK: 10,
      maxTopK: 50,
      minSimilarity: 0.3,
      itemNoun: 'actions',
      itemNounSingular: 'action',
    });
  }

  protected getId(action: MJActionEntityExtended): string {
    return action.ID;
  }

  protected getCategory(action: MJActionEntityExtended): string | null {
    if (!action.CategoryID) return null;
    const cat = ActionEngineServer.Instance.ActionCategories.find(c => UUIDsEqual(c.ID, action.CategoryID!));
    return cat?.Name?.trim() || null;
  }

  protected formatItemFullDump(action: MJActionEntityExtended): string {
    /* moved from BaseAgent.formatActionFullDump (single action) */
  }

  protected async searchRaw(query: string, topK: number): Promise<RawSearchMatch[]> {
    const results = await AIEngine.Instance.FindSimilarActions(query, topK, this.Config.minSimilarity);
    return results.map(r => ({ id: r.actionId, similarityScore: r.similarityScore, categoryName: r.categoryName }));
  }

  protected formatMatchForResult(match: MetaSearchMatch<MJActionEntityExtended>): string {
    /* the per-row markdown line BaseAgent.formatActionSearchResults emits today */
  }
}
```

`BaseAgent` becomes:

```typescript
private actionSearchTool = new ActionMetaSearchTool();

private formatActionDetails(actions: MJActionEntityExtended[]): string {
  return this.actionSearchTool.FormatForPrompt(actions);
}

private async executeActionSearch(action: AgentAction, effectiveActions, ...): Promise<ActionResultSummary> {
  const stepEntity = await this.createStepEntity({ /* unchanged */ });
  try {
    const result = await this.actionSearchTool.Invoke(
      { query: action.params?.query as string, topK: Number(action.params?.topK) },
      effectiveActions
    );
    const message = this.actionSearchTool.FormatResultMessage(result);
    await this.finalizeStepEntity(stepEntity, true, undefined, { actionResult: { success: true, resultCode: 'SUCCESS', matchCount: result.matches.length }});
    return { actionName: '_searchActions', success: true, params: [/* outputParam */], resultCode: 'SUCCESS', message };
  } catch (err) {
    /* MetaSearchToolError → MISSING_PARAMETER; other → SEARCH_ERROR */
  }
}
```

Net change in `BaseAgent`: ~150 lines deleted, ~30 lines added for the wiring. Tests added in PR #2470 stay green unchanged (they assert *behavior*, not internal structure).

---

## 5. Second consumer (mandatory for landing the abstraction)

Pick one. Recommended: **MCP server tool catalog**, because (a) it has a different invocation path than agents (HTTP request from external client, not LLM tool-call), (b) it forces the abstraction to handle a non-LLM caller cleanly, and (c) it's an obvious win at the customer level (MJ MCP servers with hundreds of exposed actions/agents/queries can't dump them all to every connecting client).

### 5.1 MCP server consumer sketch

In `@memberjunction/ai-mcp-server`, when handling `tools/list` for a tenant whose exposed catalog exceeds threshold:

```typescript
// pseudo
const allTools = await getCatalogForTenant(tenantId);
const searchTool = new MCPToolMetaSearchTool();

if (searchTool.ShouldUseMetaTool(allTools)) {
  return {
    tools: [
      // built-in _searchTools meta-tool
      {
        name: '_searchTools',
        description: searchTool.FormatSummary(allTools),
        inputSchema: { /* { query: string, topK?: number } */ },
      },
      // optionally: a small "always-include" pinned set
    ],
  };
}
return { tools: allTools.map(t => t.toMCPTool()) };
```

When the client invokes `tools/call` with `name: '_searchTools'`:

```typescript
const result = await searchTool.Invoke({ query: args.query, topK: args.topK }, allTools);
return { content: [{ type: 'text', text: searchTool.FormatResultMessage(result) }] };
```

Uses the same primitive, different surface, different invocation path. Validates the shape.

### 5.2 Alternative second consumers (any one would work)

- **MJ Explorer Action picker dialog** — when admin adds actions to an agent, picker offers a search box backed by `ActionMetaSearchTool`.
- **MJ Explorer Query picker** — for dashboards, reports, scheduled jobs that pick from a large query catalog.
- **Workflow builder action picker** — same pattern in a different UI host.

The MCP server consumer is the most architecturally interesting because it stretches the abstraction across protocol boundaries (HTTP MCP vs in-process LLM tool-call).

---

## 6. Package placement

Two viable homes:

### Option A: `@memberjunction/ai-core-plus`
**Pros:** lowest-level AI package, already imported by `ai-agents`, `ai-engine`, MCP packages. Natural fit for cross-cutting agent primitives.
**Cons:** the base class itself doesn't *need* AI-specific imports — it's pure logic over generic items. Could be misleading.

### Option B: `@memberjunction/global` (or a new lightweight package)
**Pros:** truly generic. Could be reused by non-AI surfaces (e.g. UI search bars).
**Cons:** new package = release coordination overhead; placing in `global` adds weight to a foundational package.

**Recommendation: Option A** unless we discover a non-AI consumer in the same release. The base class is generic *in shape* but the consumers are all going to invoke `AIEngine.FindSimilar*` underneath, so the AI-package association is pragmatic.

---

## 7. Migration plan

### Phase 1 — abstraction lands (ship in same release)
1. Add `BaseMetaSearchTool<T>` + types + `MetaSearchToolError` to `@memberjunction/ai-core-plus`. Pure-logic unit tests included (mirror the 30 tests already in PR #2470).
2. Add `ActionMetaSearchTool extends BaseMetaSearchTool<MJActionEntityExtended>` to `@memberjunction/ai-engine` next to `FindSimilarActions`.
3. Refactor `BaseAgent` to consume `ActionMetaSearchTool`. Existing PR #2470 tests stay green; expect ~150 line reduction in `base-agent.ts`.
4. Add the second consumer (MCP server `_searchTools`) — full implementation including its own integration test.
5. Update `packages/AI/CLAUDE.md` with a "Use `BaseMetaSearchTool<T>` for any new pickable-item surface" note + link to the spec.

### Phase 2 — adoption (subsequent releases, opportunistic)
- MJ Explorer Action picker dialog
- MJ Explorer Query picker
- MJ Explorer Prompt picker
- Workflow builder picker
- Future `FindSimilarQueries` / `FindSimilarPrompts` / `FindSimilarTemplates` services that wire into matching subclasses (`QueryMetaSearchTool`, `PromptMetaSearchTool`, etc.)

Each Phase 2 surface is a small, isolated PR — no large coordinated change.

---

## 8. Backwards compatibility

- `BaseAgent`'s public API doesn't change. The `_searchActions` tool name, parameter shape (`query`, `topK`), and `ActionResultSummary` return shape are all preserved.
- The 30 unit tests added in PR #2470 cover the user-visible behavior (threshold gate, scoping, topK clamp, validation, category bucketing). They stay valid.
- Existing prompts that the LLM has been trained against (or that customers have memorized) continue to work — no rename, no schema change.

---

## 9. Risks & open questions

### Risk 1 — premature abstraction
We're abstracting from one concrete consumer. If the second consumer (MCP server) reveals shape problems, we may need to redesign before it stabilizes. **Mitigation:** require the second consumer to land in the same release — it's the validation step. Don't merge the abstraction without it.

### Risk 2 — different surfaces want different threshold defaults
Action picker dialogs probably want a much lower threshold than agent-prompt context (UI can render hundreds of items easily; agents can't). **Mitigation:** threshold is per-tool-instance via `Config.threshold` — already designed in.

### Risk 3 — embedding sync overhead for new item types
For UI surfaces, item embeddings need to be fresh enough that search results match user expectations. Today only Actions have embeddings. **Mitigation:** out-of-scope — embedding sync is owned by `AIEngine.Refresh*Embeddings` and we add support for new item types as we add their consumers.

### Risk 4 — naming collision on `_search*` tool names
LLMs see all available tools including `_searchActions`. If multiple meta-tools are injected into the same prompt (`_searchActions` + `_searchTools` + `_searchQueries`), the LLM needs to disambiguate. **Mitigation:** the agent runtime only injects the meta-tool that gates *that* picker. MCP `_searchTools` lives in the MCP server's tool surface, not the agent's. They never coexist in one prompt today.

### Open question 1 — should `FindSimilarActions`-style methods themselves be abstracted into `AIEngine.FindSimilar<T>(entity, query, topK, minSim)`?
Out of scope for this issue — embedding pipeline generalization is a separate refactor. Today each item type has its own `FindSimilar*` method; that's fine for now.

### Open question 2 — should the meta-tool support OR-style multi-query?
E.g. `_searchActions(queries: ['send email', 'create ticket'])`. **Recommendation: not in V1.** YAGNI — no current consumer needs it. The LLM can call the meta-tool twice if it wants two ranked lists.

---

## 10. Test plan

- [ ] `BaseMetaSearchTool` unit tests in `ai-core-plus`: ShouldUseMetaTool gate, SummarizeByCategory ordering + Uncategorized fallback, ResolveTopK (default/clamp/truncate/invalid), Invoke missing-query error path, scoping filter (no leakage), FormatResultMessage empty + populated cases. Should mirror the 30 tests already added in PR #2470 but at the abstraction level.
- [ ] `ActionMetaSearchTool` integration test: mock `AIEngine.FindSimilarActions`, verify ID resolution + scope filtering against a fake action set.
- [ ] `BaseAgent` regression: run the 30 existing PR #2470 tests after the refactor — all pass unchanged.
- [ ] MCP server `_searchTools` integration test: mock catalog of 100 tools, verify threshold gate fires, verify search invocation routes through the abstraction, verify result message renders correctly.
- [ ] Manual: smoke-test the LLM end-to-end on Sage with the refactored implementation — confirm prompt structure and tool invocation are byte-identical to pre-refactor (same output for same input).

---

## 11. Related work

- **PR #2470** — `feature/agent-action-semantic-search` — the prototype this generalizes.
- **MCP federated tool search** — a follow-on issue for cross-MCP-server semantic search (one agent, N connected MCP servers, M tools each). Builds on this abstraction but adds federation-specific concerns (tool source identification, per-connection scope filtering, cross-server ranking).
- **Per-environment MCP server** — an existing in-flight issue for MJC-hosted per-customer MCP endpoints. The MCP server `_searchTools` consumer lands inside that infrastructure.

---

## 12. Acceptance criteria

- [ ] `BaseMetaSearchTool<T>` + types + error class shipped in `@memberjunction/ai-core-plus` with full unit-test coverage (≥ 25 tests).
- [ ] `ActionMetaSearchTool` shipped in `@memberjunction/ai-engine`.
- [ ] `BaseAgent._searchActions` refactored to consume `ActionMetaSearchTool`. Net code reduction in `base-agent.ts`. All 30 PR #2470 tests pass unchanged.
- [ ] At least one second consumer (MCP server `_searchTools` recommended) shipped in the same release, with its own tests.
- [ ] `packages/AI/CLAUDE.md` updated to reference the abstraction as the standard pattern for any new pickable-item surface.
- [ ] Changeset added with a `minor` bump on `@memberjunction/ai-core-plus`, `@memberjunction/ai-engine`, `@memberjunction/ai-agents`, and `@memberjunction/ai-mcp-server` (or whichever package houses the second consumer).
