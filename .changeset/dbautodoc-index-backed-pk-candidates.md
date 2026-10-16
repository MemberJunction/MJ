---
"@memberjunction/db-auto-doc": patch
---

DBAutoDoc's PK detection now uses existing primary-key and unique indexes as evidence (`relationshipDiscovery.indexBackedCandidates`, default true):
- A declared primary key becomes a candidate at confidence 100.
- A unique, unfiltered index on NOT NULL columns becomes a candidate even when the statistics can't show uniqueness, for example on an empty table. It's scored with an index boost, so naming, type, the name blacklist and column position still pick between several unique columns.
- A unique index on a nullable column only adds a smaller boost to a column that already passes the statistical checks.
- Multi-column PK and unique indexes are considered as composite keys even when the table has a surrogate key.

PK candidates record the index that backs them (`evidence.backingIndex`).
