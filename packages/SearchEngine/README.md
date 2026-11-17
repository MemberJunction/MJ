# @memberjunction/search-engine

Reusable server-side search engine for MemberJunction applications. Provides hybrid search blending vector similarity, full-text search, entity LIKE-search, external storage search, and taxonomy tag-weighted retrieval using Reciprocal Rank Fusion (RRF).

---

## 🔍 Search Architecture

The engine coordinates multiple search providers through a unified interface (`BaseSearchProvider`), runs them concurrently, and fuses candidates with rank-based or score-based fusion:

| Provider | DriverClass | SourceType | Retrieval Mechanism |
|----------|-------------|------------|---------------------|
| **EntitySearchProvider** | `EntitySearchProvider` | `entity` | Database `LIKE` matching on entities where `AllowUserSearchAPI=true` |
| **VectorSearchProvider** | `VectorSearchProvider` | `vector` | Cosine similarity against vector embeddings in vector databases |
| **FullTextSearchProvider** | `FullTextSearchProvider` | `fulltext` | SQL Server / PostgreSQL full-text catalog indexing |
| **StorageSearchProvider** | `StorageSearchProvider` | `storage` | File / blob storage indexing |
| **TagSearchProvider** | `TagSearchProvider` | `tag` | Knowledge graph taxonomy tag & synonym matching with continuous weighting |

---

## 🏷️ TagSearchProvider

### Purpose & Concept

In enterprise search, searching for a concept such as `"Cheddar"` or `"Machine Learning"` should find the products, articles, companies, or tickets associated with that tag — rather than returning the administrative tag definition record itself (`"Cheddar Cheddar - MJ: Tags"`).

`TagSearchProvider` implements tag-weighted record retrieval:
1. **Excludes Administrative Taxonomy Records**: Internal taxonomy entities (`MJ: Tags`, `MJ: Tagged Items`, `MJ: Tag Synonyms`, `MJ: Tag Scopes`, `MJ: Tag Co-Occurrences`) have `AllowUserSearchAPI = 0`.
2. **Matches Query to Taxonomy Graph**: Matches query terms against active tags and synonyms loaded into memory via `TagEngineBase`.
3. **Retrieves Associated Records**: Queries `MJ: Tagged Items` (and `MJ: Content Item Tags`) for records associated with the matched tags.
4. **Weights by Continuous Relevance**: Multiplies the tag match confidence ($0.0 - 1.0$) by the tagged item's continuous weight (`TaggedItem.Weight`, $0.0 - 1.0$).
5. **Deduplicates Across Tags**: When a record is tagged with multiple matching tags, takes the highest score, aggregates all matched tags into the result, and formats a descriptive snippet.

### Tag Matching Confidence Matrix

`TagSearchProvider` uses a multi-tier matching strategy against `TagEngineBase.Instance`:

| Tier | Match Type | Query Example | Tag / Synonym Example | Confidence |
|------|------------|---------------|-----------------------|------------|
| 1 | Exact match | `"Cheddar"` | Tag Name: `"Cheddar"` or DisplayName: `"Sharp Cheddar"` | **1.00** |
| 1 | Synonym exact match | `"Yellow Cheese"` | Synonym: `"Yellow Cheese"` $\to$ Tag: `"Cheddar"` | **1.00** |
| 2 | Word token match | `"buy cheddar cheese"` | Word `"cheddar"` matches Tag: `"Cheddar"` | **0.90** |
| 2 | Word boundary match | `"Cheddar"` | Query matches boundary in Tag: `"Cheddar Cheese"` | **0.85** |
| 2 | Synonym token match | `"buy yellow cheese"` | Words match Synonym: `"Yellow Cheese"` | **0.85** |
| 3 | Substring match (min 3 chars) | `"chedd"` | Substring in Tag: `"Cheddar"` | **0.75** |
| - | No match | `"random term"` | No tag or synonym matches | **0.00** *(zero DB queries executed)* |

### Continuous Weight Scaling

Tags in MemberJunction are not binary on/off flags. Autotagging pipelines and users assign relevance weights:
- `Weight = 1.0`: Central topic or manually applied tag.
- `Weight = 0.8`: Highly relevant topic.
- `Weight = 0.5`: Moderately relevant topic.
- `Weight = 0.1`: Tangential reference.

The final score for a tag-retrieved record is:
$$\text{Score} = \text{round}(\text{TagConfidence} \times \text{TaggedItem.Weight}, 2)$$

Example:
- Query: `"Cheddar"` (Exact match $\implies \text{Confidence} = 1.00$).
- Product *"Vermont Farmhouse Sharp"* has `Weight = 0.95`.
- Final Score = $0.95$.
- Snippet: `Tagged with "Sharp Cheddar" (95% relevance)`.

### Configuration in Metadata

The provider is registered in `metadata/search-providers/.search-providers.json` and in `[__mj].[SearchProvider]`:

```json
{
  "ID": "E89F43A1-7023-4158-9A7B-4B6CD7E19F12",
  "Name": "Tags",
  "DriverClass": "TagSearchProvider",
  "DisplayName": "Tags",
  "Description": "Retrieves records linked via the taxonomy knowledge graph and Tagged Items, weighted by tag match confidence and relevance weight.",
  "Priority": 3,
  "SupportsPreview": true
}
```

---

## 🔀 Fusion and Enrichment

1. **Reciprocal Rank Fusion (RRF)**:
   Results from `TagSearchProvider` participate in `SearchFusion.Fuse()`. When an item matches across both direct entity LIKE-search and tag-weighted retrieval, RRF boosts the record's final rank, and `SearchFusion.Deduplicate()` combines score breakdowns (`ScoreBreakdown.Tag` + `ScoreBreakdown.Entity`) and merges tags.
2. **Security & Permission Push-Down**:
   `SearchEngine` automatically validates entity read permissions and executes `verifyOwnershipAndRowFilters` on tag results via `RunView`, guaranteeing that users only see records they are permitted to view. For content items and chunks, the protected `VerifyOriginRecords` gate then follows the result to the record it was derived from (through `MJ: Entity Record Documents`) and keeps it only when that origin record is readable under the origin entity's own permissions and row filters. See [SEARCH_SCOPES_AND_RAG_GUIDE.md § 4](../../guides/SEARCH_SCOPES_AND_RAG_GUIDE.md#4-permission-push-down-section-36).
3. **Automatic Record Name Enrichment**:
   `SearchEnricher.Enrich()` resolves canonical record names using `GetEntityRecordNames` for all tag results and attaches entity icons.

---

## 🎯 Re-ranking

A scope opts into a re-ranker with `ScopeConfig.reRanker.driverClass`; a scope without one keeps the fused order. The shipped drivers are `CohereReRanker`, `VoyageReRanker`, `OpenAIReRanker`, `BGEReRanker` (local) and `DecisionReRanker`.

**`DecisionReRanker`** scores each candidate with a typed decision: one Likelihood per candidate, asked as the searching user through the `Default Decision` prompt and its failover chain. A decision call bills input tokens only and needs no reranker key of its own. The scoring is `@memberjunction/ai-reranker`'s `DecisionReranker`, resolved through the ClassFactory, so it must be loaded (both server bootstraps load it).

```json
{
  "reRanker": {
    "driverClass": "DecisionReRanker",
    "inputTopN": 50,
    "outputTopN": 10,
    "config": { "minRelevanceThreshold": 0.1 }
  }
}
```

| `config` key | Meaning | Default |
|---|---|---|
| `promptID` | The decision prompt to ask | `Default Decision` |
| `timeoutMS` | Time budget for the rerank's decision calls, all together | 15 000 |
| `maxDocumentsPerCall` | Candidates per call when no model declares `Decision.MaxQuestionsPerCall` | 20 |
| `minRelevanceThreshold` | Drop results below it, unless none reaches it. The scores are uncalibrated, so start at 0.1 | none |

Cost is reported to the scope's `RerankerBudgetCents` guard from the decision runs' recorded usage, or from the per-candidate estimate when no cost was recorded. A failed rerank falls back to the fused order, as for every driver.

---

## 🧪 Testing

Run package unit tests:

```bash
cd packages/SearchEngine
npm run test
```
