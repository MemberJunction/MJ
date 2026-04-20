# Duplicate Detection Developer Guide

## How It Works

The duplicate detection pipeline has 6 stages:

```
Records → Template → Embed → Query VectorDB → Filter/Rerank → Persist Matches → Auto-Merge
```

1. **Template**: Each record is rendered as human-readable text via an Entity Document template
2. **Embed**: The template text is converted to a vector embedding using the configured AI model
3. **Query**: Each embedding is compared against all stored vectors in the vector database
4. **Filter**: Results below `PotentialMatchThreshold` are discarded; self-matches are excluded
5. **Persist**: Matches are stored as `MJ: Duplicate Run Detail Matches` records
6. **Auto-Merge**: Matches above `AbsoluteMatchThreshold` are automatically merged

## Entity Document Setup

An **Entity Document** defines how records are converted to text for embedding. It specifies:

- **Entity**: Which entity's records to vectorize
- **Template**: A text template with field placeholders (e.g., `{{Entity.FirstName}} {{Entity.LastName}} {{Entity.Email}}`)
- **AI Model**: Which embedding model to use
- **Vector Database**: Where to store the vectors

Create one via the MJ Explorer UI under "Entity Documents" with Type = "Record Duplicate".

## Configuring Thresholds

| Threshold | Entity Document Field | Purpose | Typical Value |
|---|---|---|---|
| `PotentialMatchThreshold` | `PotentialMatchThreshold` | Minimum similarity score to consider a potential match | 0.7 - 0.85 |
| `AbsoluteMatchThreshold` | `AbsoluteMatchThreshold` | Score above which matches are auto-merged without review | 0.95 - 0.99 |

**Start conservative**: Set `PotentialMatchThreshold` low (0.7) to catch more candidates, and `AbsoluteMatchThreshold` high (0.98) to avoid false auto-merges. Tune based on results.

## DuplicateDetectionOptions Reference

```typescript
interface DuplicateDetectionOptions {
    DuplicateRunID?: string;      // Continue an existing run
    TopK?: number;                // Neighbors to retrieve (default: 5)
    ReRankingEnabled?: boolean;   // Enable reranking (default: false)
    ReRankingModelID?: string;    // Which reranker model to use
    ReRankingTopK?: number;       // Max candidates to rerank
    FusionMethod?: 'rrf' | 'weighted';  // Hybrid fusion method
    KeywordSearchWeight?: number; // 0.0-1.0, keyword vs vector balance
    IncrementalOnly?: boolean;    // Only check new/modified records
    OnProgress?: (progress) => void;  // Progress callback
}
```

## Hybrid Search

When the vector database supports `HybridQuery` (e.g., Weaviate, Qdrant), the detector automatically combines:

- **Vector similarity**: Embedding-based semantic matching
- **Keyword matching**: BM25 text search on the template text

Results are fused using **Reciprocal Rank Fusion (RRF)**:

```
Score(d) = Σ 1/(k + rank_i(d))   where k=60
```

RRF is score-scale independent — it works purely on ordinal position, making it robust across different scoring systems.

### Tuning Hybrid Search

- `KeywordSearchWeight: 0.3` (default) — 70% vector, 30% keyword
- `KeywordSearchWeight: 0.0` — pure vector search (same as no hybrid)
- `KeywordSearchWeight: 0.5` — equal weight
- `KeywordSearchWeight: 1.0` — pure keyword (not recommended for dupe detection)

## Reranking

Enable post-retrieval reranking for better precision:

```typescript
const request = new PotentialDuplicateRequest();
request.Options = {
    TopK: 20,                    // Retrieve more candidates
    ReRankingEnabled: true,       // Enable reranking
    ReRankingTopK: 10,           // Rerank top 10
};
```

The reranker uses MJ's existing `BaseReranker` infrastructure with `LLMReranker` (LLM-based) or `CohereReranker` (Cohere API) providers.

## Progress Callbacks

Monitor long-running detection:

```typescript
request.Options = {
    OnProgress: (progress) => {
        console.log(`[${progress.Phase}] ${progress.ProcessedRecords}/${progress.TotalRecords} - ${progress.MatchesFound} matches`);
    }
};
```

Phases: `Vectorizing` → `Embedding` → `Querying` → `Matching` → `Merging`

## Performance Tuning

| Parameter | Default | Effect |
|---|---|---|
| `TopK` | 5 | More candidates = better recall but slower |
| Concurrency | 5 | Parallel vector queries |
| Batch size | 20 | Parallel database saves |

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| "No Entity Document found" | Missing or inactive entity document | Create one with Type = "Record Duplicate" and Status = "Active" |
| "No API Key found" | Missing env var for AI model or vector DB | Set the appropriate API key (e.g., `OPENAI_API_KEY`, `PINECONE_API_KEY`) |
| Low match quality | Template too generic or TopK too low | Add more discriminating fields to template; increase TopK |
| Too many false positives | Threshold too low | Raise `PotentialMatchThreshold` |
| Slow detection | Large list, sequential processing | Consider smaller lists or incremental detection |
