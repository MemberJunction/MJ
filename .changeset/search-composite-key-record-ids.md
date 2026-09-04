---
"@memberjunction/core": patch
"@memberjunction/search-engine": patch
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-shared-generic": patch
---

Search results open for entities whose primary key is not named `ID`, and round-trip composite primary keys end to end.

Clicking a universal-search result failed with `InnerLoad returned false for key ID=<value>` for any entity whose key column has another name (`individual_id`, `organization_id`, …). Every search navigation site built the key as `{ FieldName: 'ID', Value: RecordID }` or `CompositeKey.FromID(RecordID)`, and `Load()` correctly rejects a field that is not one of the entity's primary keys. MJ supports primary keys with any column name(s) and type(s), so the fix uses the entity's metadata everywhere instead of a literal.

**The contract.** A search result's `RecordID` is a *compact* `CompositeKey` segment: the bare value for a single-column key (so `IN (...)` filters, dedup keys and persisted ids are unchanged), the full `Field1|Value1||Field2|Value2` segment for a composite key. `CompositeKey.LoadFromURLSegment(entity, s)` already reads both forms; two new statics make it the one-liner every consumer calls, and one new serializer produces it:

- `CompositeKey.FromURLSegment(entityInfo, recordId)` — the inverse of the compact form; falls back to an `ID` key only when the entity cannot be resolved.
- `CompositeKey.FromEntityRecord(entityInfo, row)` — the key from a RunView row using the entity's real primary key column(s).
- `FieldValueCollection.ToCompactURLSegment()` — bare value for one column, prefixed segment for several (or when a lone value itself contains `|`).
- `ToWhereClause()` now doubles embedded quotes, since it builds SQL from record ids that can come from an external index.

**Consumers** (`ng-explorer-core`, `ng-search`): the shell dropdown, the "See all results" page, the omnibar palette (the default search surface — not named in the report), the FK-cell "open related record" path in views and single-search-result, and the two recents name lookups all resolve the key with `FromURLSegment` against the entity's metadata.

**Producers** (`core`, `search-engine`, `ai-vectors-memory`): `EntitySearchProvider` read `record.ID`, which is `''` for these entities — `SearchFusion` drops empty ids, so the entity lane silently contributed nothing for them; it now builds the key from `PrimaryKeys`. The full-text lane, `SearchEntity`'s lexical pass and its permission filter (`ID IN (...)`, `Fields: ['ID']`), and the in-process `SimpleVectorDatabase` (`row['ID']`, `` `ID|…` ``) do the same. `VectorSearchProvider` no longer flattens a composite key to bare values joined by `||`, which nothing could parse.

**Permission filter** (`search-engine`): `verifyOwnershipAndRowFilters` verified results with `FirstPrimaryKey IN (...)`. Once composite entities emit real segments that check could never match and — it fails closed — every composite-key result would be dropped as unauthorized. Composite keys now verify with one `(F1=… AND F2=…)` term per record; single-column keys keep the `IN` fast path. Matching is on primary-key values in metadata order, UUID-normalized, so an externally indexed id still matches the row the database returns.

**Recents** (`ng-shared-generic`): `RecentAccessService` persisted `Values(',')`, which drops field names; composite keys written there could never be reopened. It now writes the compact segment. Existing single-value rows are unchanged and read back as before.

Also fixed in `core`: `EmbeddedRecord` built its parent-load key with `FromID` for a single-column key, which fails for any embedded entity whose key isn't named `ID`.
