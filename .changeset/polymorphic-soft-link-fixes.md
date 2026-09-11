---
"@memberjunction/core": minor
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Fix the polymorphic (`EntityID`/`RecordID`) soft-link dependency path, and add a canonical `RecordID` encoding API.

MJ models "a pointer to any record" as an `EntityID` + `RecordID` column pair, and `EntityField.EntityIDFieldName` has existed since the v2 baseline to declare one. It is `NULL` on every row in the system, so the code that consumes it has never run — and it did not work. This fixes the mechanism. It does **not** declare any pairs, so nothing changes at runtime until `EntityIDFieldName` is populated (see the caveat at the end).

**Defects fixed**

- `BuildSoftLinkDependencySQL` filtered the discriminator on the **holder** of the link rather than the entity whose dependents were being sought — it looked for `TaskLink` rows whose `EntityID` points at `TaskLink`. Both the SQL Server and PostgreSQL providers had this in the same shape.
- `GetRecordDependencies` returned as soon as no *hard* foreign-key dependents were found, so the soft-link query was never built for an entity whose only dependents are polymorphic — precisely the case it exists to serve.
- The soft-link query compared the payload column against the bare first primary key value, but a `RecordID` column stores the field-prefixed form.
- String quoting was derived from the **holder's** primary key type and then applied to both the entity-ID and the record-ID literal, so an integer-keyed holder produced malformed SQL. Both literals are now always quoted, and values are escaped.
- Record merge repointed every dependency by writing the bare primary key value. That is correct for a foreign key and silently wrong for a `RecordID` column, which holds the field-prefixed form — it would have left pointers that resolve to nothing. The choice is now an explicit, tested seam (`ResolveMergeLinkValue`).
- Dependency rows mapped the dependent record's key onto the **parent** entity's primary key columns rather than the entity whose row it actually is.

**New API on `CompositeKey`**

- `ToRecordID()` — the canonical serialization for a polymorphic `RecordID` column. Unlike `ToConcatenatedString()` it **throws** rather than emitting a string that cannot be parsed back (a value containing the delimiter, or a null key component).
- `FromRecordID(entity, s)` — parses and **validates the field names and arity against the entity's primary keys**. `LoadFromConcatenatedString` cannot signal failure: given a string with no delimiter it leaves the key empty and returns normally, which is why consumers hand-roll delimiter sniffers today. The name check is also what safely rejects a legacy bare composite (`val1||val2`), which parses cleanly as a shape but names fields the entity does not have.
- `FromLegacyRecordID(entity, s)` — the transitional bare-value form, named so it is obviously temporary, so reading a legacy encoding is a decision at the call site rather than a guess inside the parser.

**Behavior change**

`GetRecordDependencies` now throws for an entity that is not in metadata, where it previously returned `[]`. Returning "no dependencies" for an entity we cannot resolve is indistinguishable, to a caller about to delete a record, from "this record is safe to delete".

**Not included, deliberately**

No `EntityIDFieldName` values are populated, so no polymorphic pair is declared and the soft-link path stays dormant. An audit done alongside this change found **90 write sites** across the repo that set a polymorphic payload column, of which **2** use the canonical encoding — the rest write a bare value, a comma-joined list (`CompositeKey.Values()`), a `||`-joined list, or a `Field=Value AND ...` string (`CompositeKey.ToString()`). Declaring pairs before those writers are normalized would make merge write the canonical form into columns that mostly hold bare values. Normalizing them is Layer 0 of `plans/polymorphic-foreign-keys.md`.
