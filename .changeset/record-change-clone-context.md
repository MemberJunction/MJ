---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/server": minor
---

Support `CloneContext` across the MemberJunction stack (§10.2, §10.3, §15):
- Add `Clone` to `RecordChange.Source` CHECK constraint and add nullable `ChangeContext` nvarchar(max) column.
- Declare `IRecordChangeCloneContext` and `IRecordChangeContext` JSONType interfaces with `@lookup` metadata.
- In `@memberjunction/core`: Add `CloneContext` interface, `RecordChangeSource = 'Clone'`, and `CloneContext` methods on `BaseEntity`; add structured `ChangeContext` serialization on `DatabaseProviderBase.BuildRecordChangePayload`.
- In database providers (`GenericDatabaseProvider`, `SQLServerDataProvider`, `PostgreSQLDataProvider`): propagate and persist `Source='Clone'` and `ChangeContext` across saves, deletes, and IS-A child/sibling updates. `ChangeContext` is written only when a change carries one, so tracked writes keep working on a PostgreSQL database that doesn't have the column yet.
- Clone context is set only on the server, by the record-cloning engine. It is deliberately not part of the GraphQL mutation inputs: a client-supplied context would let any caller stamp fabricated clone lineage into Record Changes.
- In `@memberjunction/server`: an update now applies only the client's field values, not the `OldValues___` / `RestoreContext___` blobs or fields the user may not read.
