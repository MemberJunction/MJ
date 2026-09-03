---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions-apollo": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/archiving-engine": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/external-change-detection": patch
"@memberjunction/integration-engine": patch
"@memberjunction/lists": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/mobile-app": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/record-set-processor": patch
"@memberjunction/record-set-processor-base": patch
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/version-history": patch
"@memberjunction/ng-archive-manager": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-hierarchy-tree": patch
"@memberjunction/ng-resource-permissions": patch
"@memberjunction/ng-versions": patch
---

Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

**What changed, by kind**

- **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
- **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
- **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
- **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
- **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

**The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:

1. *Strict*: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
2. *Strict*: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
3. *Ratchet*: `FirstPrimaryKey` and `CompositeKey.FromID(` per package, against `primary-key-baseline.json`. These are legitimate where MJ is single-column by design (foreign-key targets, keyset `ORDER BY`, IS-A shared keys, literal core entities), so the count may fall but never rise. Marker `// first-pk-ok: <reason>` exempts a line.
4. *Strict*: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID".

No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.
