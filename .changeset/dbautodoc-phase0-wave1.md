---
"@memberjunction/db-auto-doc": patch
---

Fix Phase 0 Wave 1 generator, SQL escaping, dialect row-limit, and evaluation-script defects in `@memberjunction/db-auto-doc`: gate rejected/non-winning PK and FK candidates in `AdditionalSchemaInfoGenerator` (and drop placeholder PK descriptions), escape SQL identifiers and literals in `SQLGenerator`, emit dialect-aware `LIMIT 10` on PostgreSQL/MySQL in `SampleQueryGenerator`, and align `compare.py` with published weights and schema-qualified FK keys.
