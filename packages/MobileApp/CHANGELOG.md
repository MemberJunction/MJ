# @memberjunction/mobile-app

## 6.1.0-edge.6

### Patch Changes

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [80fcb61]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/react-runtime@6.1.0-edge.6
  - @memberjunction/ai-realtime-client@6.1.0-edge.6
  - @memberjunction/markdown-core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [2197110]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/markdown-core@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ai-realtime-client@6.1.0-edge.5
  - @memberjunction/react-runtime@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-realtime-client@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/react-runtime@6.1.0-edge.4
  - @memberjunction/markdown-core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ai-realtime-client@6.1.0-edge.3
  - @memberjunction/react-runtime@6.1.0-edge.3
  - @memberjunction/markdown-core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ai-realtime-client@6.1.0-edge.2
  - @memberjunction/react-runtime@6.1.0-edge.2
  - @memberjunction/markdown-core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/react-runtime@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/ai-realtime-client@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/markdown-core@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [5c6e36c]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/react-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/ai-realtime-client@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/markdown-core@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/react-runtime@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/ai-realtime-client@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/markdown-core@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/react-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/ai-realtime-client@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/markdown-core@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/react-runtime@5.50.0
  - @memberjunction/ai-realtime-client@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/markdown-core@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-realtime-client@5.49.0
  - @memberjunction/react-runtime@5.49.0
  - @memberjunction/markdown-core@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [a101255]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/markdown-core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/ai-realtime-client@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/react-runtime@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/react-runtime@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/ai-realtime-client@5.47.0
  - @memberjunction/global@5.47.0
  - @memberjunction/markdown-core@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/react-runtime@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/ai-realtime-client@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/markdown-core@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/react-runtime@5.45.1
- @memberjunction/ai@5.45.1
- @memberjunction/ai-realtime-client@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/markdown-core@5.45.1

## 5.45.0

### Patch Changes

- 1c4e0bb: Add repository.url to MobileApp package.json to satisfy the validate-package-repository CI gate, which was failing on every PR since the package landed without it
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/react-runtime@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/ai-realtime-client@5.45.0
  - @memberjunction/markdown-core@5.45.0
