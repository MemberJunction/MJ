# @memberjunction/tag-engine

Server-only Tag Engine that extends `@memberjunction/tag-engine-base` via composition and adds semantic embedding support for tag resolution. Uses `SimpleVectorService` to embed all tags at startup for sub-millisecond local cosine similarity matching.

**Server-side only.** For client-side tag operations (hierarchy, lookups, CRUD), use `@memberjunction/tag-engine-base` directly.

> **Read first:** [Taxonomy & Tagging Guide](../../../../guides/TAXONOMY_TAGGING_GUIDE.md) — the canonical design doc for the tag taxonomy, the 4+1-tier resolver, scoping, governance, the suggestion queue, and Tag Health. This README is the API reference; the guide is the *why* and *how*.

## Installation

```bash
npm install @memberjunction/tag-engine
```

## Initialization

```typescript
import { TagEngine } from '@memberjunction/tag-engine';

await TagEngine.Instance.Config(false, contextUser);
```

`Config()` performs the following steps:

1. Loads `TagEngineBase` (all Tags and TaggedItems from the database).
2. Discovers the smallest available embedding model from `AIEngine`.
3. Generates vector embeddings for every tag (name + description).
4. Loads embeddings into an in-memory `SimpleVectorService` for instant similarity search.

Safe to call multiple times; subsequent calls are no-ops unless `forceRefresh` is true. Concurrent calls are coalesced (second caller awaits the first).

## API Reference

### Delegated Methods (from TagEngineBase)

All `TagEngineBase` methods are available directly on `TagEngine.Instance`:

| Method | Description |
|--------|-------------|
| `GetTagByID(id)` | Find tag by ID (case-insensitive UUID) |
| `GetTagByName(name)` | Find tag by name (case-insensitive string) |
| `GetChildTags(parentID)` | Get direct children of a tag |
| `GetSubtree(rootID)` | Get all descendants recursively |
| `GetTaggedItemsForRecord(entityID, recordID)` | Get all tagged items for a record |
| `GetTaxonomyTree(rootID?)` | Build hierarchical TagTreeNode tree |
| `CreateTag(name, displayName, parentID, description, contextUser)` | Create and cache a new tag |
| `CreateTaggedItem(tagID, entityID, recordID, weight, contextUser)` | Create or update a tagged item |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `Tags` | `MJTagEntity[]` | All loaded Tag entities (delegated from TagEngineBase) |
| `TaggedItems` | `MJTaggedItemEntity[]` | All loaded TaggedItem entities (delegated) |
| `TagVectorService` | `SimpleVectorService<TagEmbeddingMetadata> \| null` | In-memory vector index of tag embeddings, or null if no embedding model is available |
| `Loaded` | `boolean` | True if both the base engine and embeddings are loaded |

### Semantic Tag Resolution

#### `ResolveTag(tagText, weight, mode, rootID, threshold, contextUser): Promise<MJTagEntity | null>`

The primary method for mapping free-text tag strings to formal Tag records. Uses a three-step resolution strategy:

**Step 1 -- Exact Name Match (fast path)**

Case-insensitive string comparison against all loaded tags. If a match is found and it falls within the optional subtree constraint, it is returned immediately. No embedding computation needed.

**Step 2 -- Semantic Similarity Search**

If no exact match, embeds the tag text and performs cosine similarity search against the in-memory tag vector index. Results are filtered by the `threshold` score and optionally constrained to a subtree rooted at `rootID`.

**Step 3 -- Mode-Based Fallback**

If no match is found:

| Mode | Behavior |
|------|----------|
| `constrained` | Returns `null`. No new tags are created. |
| `auto-grow` | Creates a new tag as a child of `rootID` and adds its embedding to the vector service. |
| `free-flow` | Creates a new root-level tag (no parent) and adds its embedding to the vector service. |

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tagText` | `string` | The free-text tag to resolve |
| `weight` | `number` | Relevance weight (0.0--1.0), used if a new tag is created |
| `mode` | `'constrained' \| 'auto-grow' \| 'free-flow'` | Resolution mode |
| `rootID` | `string \| null` | Subtree root for scoping. In `auto-grow`, also the parent for new tags |
| `threshold` | `number` | Minimum cosine similarity (0--1) for semantic match acceptance |
| `contextUser` | `UserInfo` | Server-side user context |

**Example:**

```typescript
const tag = await TagEngine.Instance.ResolveTag(
    'neural networks',    // tagText
    0.85,                 // weight
    'auto-grow',          // mode
    rootTagID,            // rootID (or null)
    0.9,                  // threshold
    contextUser
);
// tag is either an existing matched Tag, a newly created Tag, or null (constrained mode only)
```

## Embedding Model Discovery

`TagEngine` automatically discovers the best embedding model at startup by:

1. Querying `AIEngine.Instance.Models` for models with `AIModelType === 'Embeddings'`.
2. Sorting by `InputTokenLimit` ascending to pick the smallest (cheapest/fastest) model.
3. Looking up the highest-priority active `ModelVendor` for that model to get the `DriverClass` and `APIName`.

If no embedding model is available, the engine logs a status message and operates in degraded mode: exact-name matching still works, but semantic similarity search is disabled. The `TagVectorService` property will be `null`.

## Graceful Degradation

| Condition | Behavior |
|-----------|----------|
| No tags in database | Skips embedding generation entirely |
| No embedding model configured | Semantic matching disabled; exact-name matching still works |
| Embedding fails for a single tag | That tag is skipped; other tags are still embedded |
| Vector service unavailable during ResolveTag | Falls through to mode-based fallback (create or return null) |

## TagEmbeddingMetadata

Each entry in the vector service carries metadata:

```typescript
interface TagEmbeddingMetadata {
    Name: string;       // The tag's internal name
    ParentID: string | null;  // Parent tag ID, or null for root tags
}
```

The embedding text for each tag is composed as `"Name: Description"` (or just `"Name"` if no description exists), providing richer semantic representation.

## Related Packages

- `@memberjunction/tag-engine-base` -- Client+server shared engine (hierarchy, CRUD, taxonomy serialization)
- `@memberjunction/content-autotagging` -- Content autotagging pipeline that uses TagEngine for taxonomy bridging
- `@memberjunction/ai-vectors-memory` -- SimpleVectorService for in-memory vector operations

## Further Reading

See the [Content Autotagging Guide](/guides/CONTENT_AUTOTAGGING_GUIDE.md) for full pipeline documentation including the tag taxonomy bridge, prompt structure, and configuration.
