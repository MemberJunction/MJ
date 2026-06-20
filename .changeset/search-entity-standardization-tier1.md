---
"@memberjunction/aiengine": minor
"@memberjunction/core-actions": patch
---

Standardize entity semantic search on `Provider.SearchEntity` (Tier 1).

Retires the bespoke in-memory "find similar by description" code paths in favor of
the unified Search-type `EntityDocument` + `Provider.SearchEntity` pipeline introduced
in #2709.

**`@memberjunction/aiengine`** — removed the ephemeral agent/action embedding machinery
that re-embedded every agent and action on first search:
- Deleted `AgentEmbeddingService` and `ActionEmbeddingService`.
- Removed `AIEngine.FindSimilarAgents`, `AIEngine.FindSimilarActions`,
  `AIEngine.RefreshAgentEmbeddings`, `AIEngine.RefreshActionEmbeddings`, and the
  `AgentVectorService` / `ActionVectorService` getters.
- `RegenerateEmbeddings` and the lazy `ensureEmbeddingsGenerated` path now cover only
  the remaining local note/example pools (unchanged Pattern B). Callers needing
  agent/action discovery should use `Provider.SearchEntity({ entityName: 'MJ: AI Agents' | 'MJ: Actions', ... })`.

**`@memberjunction/core-actions`** — the "Find Best Action", "Find Candidate Actions",
"Find Best Agent", "Find Candidate Agents", and "Search Query Catalog" actions are now
thin, backward-compatible wrappers around `Provider.SearchEntity` (semantic mode, backed
by the daily-synced "Actions Search" / "AI Agents Search" / "Queries Search"
EntityDocuments). Their input parameters and output shapes are preserved; new callers
should prefer the generic **Search Entity** action directly.

Also seeds the `Queries Search` EntityDocument + template, and deletes the now-obsolete
`scripts/backfill-query-embeddings.ts` (the daily Entity Vector Sync job populates query
vectors automatically).
