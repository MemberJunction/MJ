# @memberjunction/tag-engine-base

Client+server shared engine for the MemberJunction Tag taxonomy. Loads all `Tag` and `TaggedItem` records at startup using the `BaseEngine` pattern and provides hierarchy helpers, taxonomy serialization, and CRUD operations.

This package is safe to use on both client and server. For server-only capabilities (semantic embedding and `ResolveTag()`), see `@memberjunction/tag-engine`.

> **Read first:** [Taxonomy & Tagging Guide](../../../../guides/TAXONOMY_TAGGING_GUIDE.md) — explains how Tag, TagScope, TagSynonym, TagSuggestion, ContentItemTag, and TaggedItem fit together, plus the scoping and governance model that this engine enforces. Highly recommended before extending or consuming this package.

## Installation

```bash
npm install @memberjunction/tag-engine-base
```

## Initialization

Call `Config()` once at startup. The engine caches all Tags and TaggedItems and subsequent calls are no-ops unless `forceRefresh` is true.

```typescript
import { TagEngineBase } from '@memberjunction/tag-engine-base';

// Server-side (contextUser required)
await TagEngineBase.Instance.Config(false, contextUser);

// Client-side (contextUser optional)
await TagEngineBase.Instance.Config();
```

## API Reference

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `Tags` | `MJTagEntity[]` | All loaded Tag entities |
| `TaggedItems` | `MJTaggedItemEntity[]` | All loaded TaggedItem entities |

### Lookup Methods

#### `GetTagByID(id: string): MJTagEntity | undefined`

Find a tag by its ID. Uses case-insensitive UUID comparison via `UUIDsEqual()`.

```typescript
const tag = TagEngineBase.Instance.GetTagByID('a1b2c3d4-...');
```

#### `GetTagByName(name: string): MJTagEntity | undefined`

Find a tag by its Name. Uses case-insensitive, trimmed string comparison.

```typescript
const tag = TagEngineBase.Instance.GetTagByName('Machine Learning');
```

#### `GetChildTags(parentID: string): MJTagEntity[]`

Get direct children of a given parent tag.

```typescript
const children = TagEngineBase.Instance.GetChildTags(parentTag.ID);
```

#### `GetSubtree(rootID: string): MJTagEntity[]`

Get all descendants of a root tag, recursively. Returns a flat array (does not include the root itself).

```typescript
const allDescendants = TagEngineBase.Instance.GetSubtree(rootTag.ID);
```

#### `GetTaggedItemsForRecord(entityID: string, recordID: string): MJTaggedItemEntity[]`

Get all tagged items associated with a specific entity record.

```typescript
const items = TagEngineBase.Instance.GetTaggedItemsForRecord(entityInfo.ID, record.ID);
```

### Taxonomy Serialization

#### `GetTaxonomyTree(rootID?: string): TagTreeNode[]`

Build a hierarchical tree of `TagTreeNode` objects, suitable for serializing to JSON for LLM prompt injection.

- If `rootID` is provided, returns a single-element array with that tag as the root.
- If `rootID` is omitted, returns the full forest from all root-level tags (those with no parent).

```typescript
// Full taxonomy tree
const fullTree = TagEngineBase.Instance.GetTaxonomyTree();

// Subtree rooted at a specific tag
const subtree = TagEngineBase.Instance.GetTaxonomyTree(rootTagID);
```

The `TagTreeNode` interface:

```typescript
interface TagTreeNode {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string | null;
    Children: TagTreeNode[];
}
```

### CRUD Methods

#### `CreateTag(name, displayName, parentID, description, contextUser): Promise<MJTagEntity>`

Create a new Tag entity, save it to the database, and add it to the local cache.

```typescript
const newTag = await TagEngineBase.Instance.CreateTag(
    'deep-learning',        // Name
    'Deep Learning',        // DisplayName
    parentTag.ID,           // ParentID (or null for root-level)
    'Neural network architectures with multiple layers',  // Description
    contextUser
);
```

#### `CreateTaggedItem(tagID, entityID, recordID, weight, contextUser): Promise<MJTaggedItemEntity>`

Create or update a `TaggedItem` linking a tag to an entity record. If a `TaggedItem` already exists for the same tag+entity+record combination, updates its weight instead of creating a duplicate.

```typescript
const taggedItem = await TagEngineBase.Instance.CreateTaggedItem(
    tag.ID,             // TagID
    entityInfo.ID,      // EntityID
    record.ID,          // RecordID
    0.85,               // Weight (0.0 - 1.0)
    contextUser
);
```

## Integration with Content Autotagging

`TagEngineBase` provides the foundational tag operations used by the autotagging pipeline. The taxonomy tree is serialized to JSON and injected into the LLM prompt so the model can prefer existing tags. See the [Content Autotagging Guide](/guides/CONTENT_AUTOTAGGING_GUIDE.md) for the full pipeline documentation.
