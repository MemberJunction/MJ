---
"@memberjunction/db-auto-doc": patch
---

DBAutoDoc now reads each table's existing indexes during introspection, stores them in the state file (`tables[].indexes`), and shows them to the LLM as evidence for keys. Databases often have indexes where no primary or foreign key is declared.

- The discovery validation, table analysis, and PK and FK pruning prompts get an "Existing Indexes" section. FK pruning also says whether each candidate's target column has a unique index.
- On by default; turn off with `analysis.useExistingIndexes: false`. Resumed runs read indexes for tables that don't have them yet. A schema whose catalog can't be read is skipped with a warning.
- New `Introspector.LoadIndexes(schemas)` and index-hint helpers (`BuildIndexHints`, `FormatIndexHint`, `IsUniquelyIndexed`, `AttachIndexesToTables`).
