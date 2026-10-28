---
"@memberjunction/db-auto-doc": patch
---

DBAutoDoc's PK detection now uses existing unique indexes as evidence for tables with no declared primary key (`relationshipDiscovery.indexBackedCandidates`, default true):
- A unique, unfiltered index on NOT NULL columns becomes a candidate even when the statistics can't show uniqueness, for example on an empty table. It's scored with an index boost, so naming, type, the name blacklist and column position still pick between several unique columns.
- A unique index on a nullable column only adds a smaller boost to a column that already passes the statistical checks.
- Multi-column unique indexes are considered as composite keys when no single column qualifies (junction tables, for example). Next to a qualifying single-column key they're treated as alternate keys and not added, because discovery flags every candidate's columns as primary key.

PK candidates record the index that backs them (`evidence.backingIndex`).
