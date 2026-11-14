---
"@memberjunction/codegen-lib": patch
---

CodeGen's organic-key config pass reads entities and existing rows once instead of up to three queries per (key, related entity) pair, writes only rows that differ from additionalSchemaInfo, drops duplicate related-entity entries (last one wins, with a warning), and logs progress every 250 pairs.
