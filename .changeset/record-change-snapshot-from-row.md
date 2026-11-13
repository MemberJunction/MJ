---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

A tracked save's Record Change `FullRecordJSON` is now built in the save's own statement from the row the save returned (`@ResultTable` on SQL Server, `save_result` on PostgreSQL), not serialized from the entity in memory before the save. It costs no extra round trip.

- The snapshot holds what the database stored: a column another server changed after this object was loaded, the new `__mj_UpdatedAt`, server-set defaults and IDs on a create, and current joined display values. Restoring a version no longer reverts another writer's change.
- Encrypted columns are recorded as their stored ciphertext. Before, the decrypted value was written to the audit table.
- PostgreSQL no longer stores `'` as `''` in `FullRecordJSON`.
- Values are written as a loaded entity serializes them: date-times as UTC ISO-8601 with milliseconds and `Z` (including `datetime`/`datetime2`, which have no offset), `bigint` as a string, binary as base64, JSON columns as text, and SQL Server spatial and `hierarchyid` columns as text.
- Entities whose save procedure returns datestamps only keep the in-memory snapshot, as do SQL Server entities with a `.` in a column name.
- A restricted user's update reads stored values only for the fields it wrote without being able to read them; it no longer reads the rest of the row to widen the snapshot.
