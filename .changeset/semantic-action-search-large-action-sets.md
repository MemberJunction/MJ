---
"@memberjunction/ai-agents": minor
---

feat(agents): semantic action search for large action sets

Above a configurable threshold (currently 25 actions), `BaseAgent` now replaces the full action dump in the system prompt with a category summary plus a built-in `_searchActions` meta-tool. The LLM invokes `_searchActions(query, topK)` like any other action and gets back a ranked list of matches scoped to the agent's effective actions, resolved via `AIEngine.FindSimilarActions` (existing embedding service).

Behavior:
- ≤25 effective actions: full action dump in the prompt (unchanged behavior).
- \>25 effective actions: category summary + injected `_searchActions(query, topK)` meta-tool. Result returned as a standard `ActionResultSummary` so it flows through the normal action-results message path.
- `_searchActions` is reserved (leading underscore) and intercepted by the agent runtime — never registered in the Action metadata table and never falls through to a real action lookup.
- topK is clamped to a max of 50 to bound result size.
- Matches are filtered to the agent's `effectiveActions` set — no leakage of other agents' actions.
- Below-threshold agents have `_searchActions` rejected by `validateActionsNextStep`, so the LLM cannot accidentally invoke it.

Token-savings rationale: agents with large action catalogs (50+) burned a meaningful fraction of their context window on a flat action dump. The category summary + on-demand semantic search keeps the static prompt small and lets the LLM pull the actions it actually needs.

### Configuration

The four knobs are exposed as runtime-mutable static properties on a new `ActionSearchConfig` class (exported from `@memberjunction/ai-agents`):

| Property | Default | Purpose |
|---|---|---|
| `Threshold` | `25` | Action-count above which the prompt switches to summary + meta-tool |
| `DefaultTopK` | `10` | Fallback topK when the LLM omits it from the search call |
| `MaxTopK` | `50` | Hard upper bound on topK after clamping |
| `MinSimilarity` | `0.3` | Cosine similarity floor for `_searchActions` hits |

Consumers (typically MJAPI startup) wire values from `mj.config.cjs`:

```typescript
import { ActionSearchConfig } from '@memberjunction/ai-agents';
const cfg = configInfo.agentSettings?.actionSearch;
if (cfg?.threshold != null) ActionSearchConfig.Threshold = cfg.threshold;
if (cfg?.defaultTopK != null) ActionSearchConfig.DefaultTopK = cfg.defaultTopK;
if (cfg?.maxTopK != null) ActionSearchConfig.MaxTopK = cfg.maxTopK;
if (cfg?.minSimilarity != null) ActionSearchConfig.MinSimilarity = cfg.minSimilarity;
```

Suggested `mj.config.cjs` shape:

```javascript
agentSettings: {
  actionSearch: {
    threshold: 25,
    defaultTopK: 10,
    maxTopK: 50,
    minSimilarity: 0.3,
  }
}
```

The `_searchActions` tool name itself is intentionally NOT configurable — it's a wire-protocol identifier the LLM is told about and the runtime intercepts; changing it per-deployment would break cross-deployment consistency for the same agent definition. Per-agent overrides via fields on `MJAIAgent` are intentionally out of scope here — see the follow-on RFC.
