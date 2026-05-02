---
"@memberjunction/codegen-lib": minor
---

Fix CodeGen dropping primary-key columns from `spCreate` INSERT statements for tables with composite (multi-column) primary keys. The existing single-PK uniqueidentifier workaround that re-injects the PK column into the generated INSERT was gated on `entity.PrimaryKeys.length === 1`, so composite-PK tables fell through to the else branch which only built the SELECT-back clause. Combined with metadata sync setting `AllowUpdateAPI=0` on every PK column (and `generateInsertFieldString` filtering on `!ef.AllowUpdateAPI`), every PK column was filtered out of the INSERT, producing broken stored procs that fail at runtime with `NOT NULL` violations on the missing PK columns. Both SQL Server and PostgreSQL providers now re-inject all PK columns and parameters into the INSERT column/value lists when `PrimaryKeys.length > 1`, mirroring what the single-PK branch already does for one key.
