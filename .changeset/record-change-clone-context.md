---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/codegen-lib": minor
---

Support `CloneContext` across the MemberJunction stack (§10.2, §10.3, §15):
- Add `Clone` to `RecordChange.Source` CHECK constraint and add nullable `ChangeContext` nvarchar(max) column.
- Declare `IRecordChangeCloneContext` and `IRecordChangeContext` JSONType interfaces with `@lookup` metadata.
- In `@memberjunction/core`: Add `CloneContext` interface, `RecordChangeSource = 'Clone'`, and `CloneContext` methods on `BaseEntity`; add structured `ChangeContext` serialization on `DatabaseProviderBase.BuildRecordChangePayload`.
- In database providers (`GenericDatabaseProvider`, `SQLServerDataProvider`, `PostgreSQLDataProvider`): propagate and persist `Source='Clone'` and `@ChangeContext` / `"ChangeContext"` JSON across saves, deletes, and IS-A child/sibling updates.
- In `@memberjunction/server`: define `CloneContextInput` GraphQL input type, code-generate `CloneContext___` mutation input parameter, and apply inbound clone context to server entities in `ResolverBase`.
- In `@memberjunction/graphql-dataprovider`: mirror client-side `entity.CloneContext` onto mutation variables as `CloneContext___`.
