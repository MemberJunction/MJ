# @memberjunction/record-comparison

Framework-agnostic **record comparison** primitive for MemberJunction.

`RecordComparisonEngine` loads a set of records for a single entity and computes a
structured, field-level delta between them — a survivor candidate plus its potential
matches diffed column-by-column. It performs a read-only load (`RunView` with
`ResultType: 'simple'` and a targeted field list) and never mutates records.

## Why this package exists

The comparison logic is needed by two callers that sit on **opposite sides** of the
dependency graph:

- The **LLM duplicate-detection reasoning path** (`@memberjunction/ai-vector-dupe`),
  which feeds the differing-field deltas to the reasoning provider as context.
- The **server/UI side-by-side comparison panel**
  (`@memberjunction/core-entities-server` → `MJServer` resolver → GraphQL client →
  Angular `record-merge`).

`@memberjunction/core-entities-server` depends on `@memberjunction/ai-vector-dupe`, so
the dupe package sits *lower* in the graph and cannot reach an engine that lives in the
server package without creating a build cycle. Hoisting the engine into this low-level
package (its only dependency is `@memberjunction/core`) gives both sides a single
implementation with no cycle and no duplicated delta logic.

## Usage

```typescript
import { RecordComparisonEngine } from '@memberjunction/record-comparison';
import { CompositeKey } from '@memberjunction/core';

const engine = new RecordComparisonEngine();

// By entity name (resolver / UI path) — resolves the entity from metadata.
const result = await engine.CompareRecords(
  { EntityName: 'Accounts', Keys: [survivorKey, candidateKey] },
  contextUser,
  provider // request-scoped IMetadataProvider (multi-provider safety)
);

// With an already-resolved EntityInfo + an injected RunView (dupe path) — skips the
// by-name lookup and reuses the caller's request-scoped RunView.
const result2 = await engine.CompareRecordsForEntity(
  entityInfo,
  [sourceKey, ...candidateKeys],
  contextUser,
  { runView }
);
```

`result.Fields` is a plain-data delta matrix (no `BaseEntity` instances), so it
serializes cleanly across GraphQL and into a reasoning prompt.
