---
"@memberjunction/sql-converter": patch
---

Legacy converter: a Metadata_Sync log's last save converts even with the logger trailer after it, the T-SQL `IF EXISTS … BEGIN … END` strip no longer deletes converted saves, and saves the log announces but the output lacks count as gaps. String literals are no longer rewritten by the N-prefix, common-function, schema-reference and type-name passes (#6097, #5918, #5838).
