---
"@memberjunction/db-auto-doc": patch
---

Fix Phase 0 Wave 1 generator, SQL escaping, dialect row-limit, and evaluation-script defects in `@memberjunction/db-auto-doc`: export `PickBestPKCandidate` from `ApplyPrimaryKeys`, gate rejected/non-winning PK and FK candidates in `AdditionalSchemaInfoGenerator` (preserving real column descriptions and never combining discovered PKs onto declared catalog PKs), escape SQL Server identifier literals in `SQLGenerator`, make `SampleQueryGenerator` dialect-aware for both prompt `databaseType` and validation row limits across SQL Server, PostgreSQL, MySQL, and Oracle, and align `compare.py` with the published `0.35 FK / 0.30 PK / 0.20 TblDesc / 0.15 ColDesc` weights, single-winner PK selection, and schema-qualified FK keys.
