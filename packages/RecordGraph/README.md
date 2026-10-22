# @memberjunction/record-graph

Generalized record dependency graph traversal, relationship collection resolution, topological sorting, link value encoding, and graph models for MemberJunction.

Shared across:
- **Version History**: Snapshot creation, dependency tracking, rollback / restore topological ordering.
- **Record Cloning**: Deep copying of record graphs, subtype rows, child collections, and soft-link rewriting.
- **Metadata Sync**: Deterministic 4-tier collection resolution and schema composition.

## Installation

```bash
npm install @memberjunction/record-graph
```

## Key Components

### 1. `DependencyGraphWalker`

Walks an entity record's relationships to discover all dependent and referenced records.

```typescript
import { CompositeKey } from '@memberjunction/core';
import { DependencyGraphWalker } from '@memberjunction/record-graph';

const walker = new DependencyGraphWalker(provider); // provider is optional; defaults to Metadata.Provider
const userKey = CompositeKey.FromID(userId);
const rootNode = await walker.WalkDependents(
  'MJ: Users',
  userKey,
  {
    MaxDepth: 3,
    RequireTrackRecordChanges: false, // Set false for cloning, true for Version History
    IncludeSubtypes: true,            // Include IS-A subtype rows
    FollowHierarchies: true,          // Recurse self-referencing hierarchy fields
    EdgePolicy: (candidate) => {
      if (candidate.TargetEntityName === 'MJ: Audit Logs') return 'Skip';
      if (candidate.Kind === 'ForwardFK') return 'Reference';
      return 'Deep';
    },
  },
  contextUser
);

const flatNodes = walker.FlattenTopological(rootNode);
```

#### Traversal Rules & Discovery Modes

- **Reverse Walk (Owned Children)**: Curated One-To-Many relationships (`EntityRelationshipInfo`) are walked with full discovery (both reverse and forward), discovering all dependent child records.
- **Forward Walk (Referenced Records)**: Foreign key fields are walked in `forward-only` mode so referenced entities (e.g., shared lookup tables) do not traverse their own children, preventing graph explosion.
- **Subtypes (`IncludeSubtypes`)**: Discovers IS-A subtype rows via `FindISAChildEntities`.
- **Hierarchies (`FollowHierarchies`)**: Allows controlled recursion on fields whose `Configuration.Hierarchy.IsHierarchy` is true.
- **Soft Links (`IncludeSoftLinks`)**: Traverses polymorphic `EntityID`/`RecordID` pairs via `EntityIDFieldName`.
- **Non-Curated Inbound FKs (`ListNonCuratedInbound`)**: Discovers database foreign keys pointing to the record that lack a curated `EntityRelationship`.
- **Edge Policy (`EdgePolicy`)**: Pre-traversal callback returning `'Deep'`, `'Reference'`, or `'Skip'`.
- **Cycle Prevention**: Global `visited` set and entity-type `ancestorStack` to prevent infinite loops and backtracking.

### 2. Topological Sorting (`sort.ts`)

- `SortByEntityDependencyOrder<T>(items, getEntityID, provider?)`:
  Computes DAG levels from foreign keys and sorts parent entities before child entities. Handles cycles safely.
- `SortEntitiesByDependency`:
  Backward-compatible alias for `SortByEntityDependencyOrder`.
- `SortNodesTopologically(root: DependencyNode)`:
  Breadth-first traversal flattening a dependency tree into an execution-safe array where parents precede children.

### 3. Link Value Encoding (`links.ts`)

- `ResolveLinkValue(kindOrIsSoft, targetKey)`:
  Resolves the value to write into a pointer or foreign key column:
  - Hard link (`'hard'` or `false`): bare primary key value (`targetKey.GetValueByIndex(0)`).
  - Soft link (`'soft'` or `true`): canonical prefixed polymorphic encoding (`targetKey.ToRecordID()`).

### 4. Collection Resolver (`collection-resolver.ts`)

- `ResolveCollectionRelationship(entityInfo, colName)` (`resolveCollectionRelationship` is a deprecated alias):
  Resolves a collection name to its matching relationship on the entity using strict 4-tier rule strength:
  1. Explicit collection name in `RelatedRecordCollection` JSON (`"Name": "..."`)
  2. Relationship `DisplayName`
  3. `RelatedEntity` full name
  4. Stripped `RelatedEntity` name (with singular/plural tolerance)

### 5. SQL & Key Utilities (`sql.ts`, `keys.ts`)

- `SqlEquals`, `SqlContains`, `SqlIn`, `SqlNotIn`: Safe SQL filter builders (they escape with `EscapeSQLString` from `@memberjunction/global`).
- `BuildCompositeKeyFromRecord`, `BuildPrimaryKeyForLoad`, `BuildIdKey`: CompositeKey construction utilities.
- The camelCase names (`sqlEquals`, `buildIdKey`, …) and `escapeSqlString` are deprecated aliases. Use `EscapeSQLString` from `@memberjunction/global` directly.
