---
"@memberjunction/db-auto-doc": patch
---

Value lists in `additionalSchemaInfo.json` are checked against the data before they are emitted (#4537).

- **Verdicts only for candidates.** The table-analysis prompt asked for a value-list verdict only on enum candidates, but any verdict the model returned was kept. A verdict now counts only when its column passes the enum candidate gate, both when it is recorded and when it is exported, so re-exporting an older state file is cleaned too. User-approved columns are exported as approved.
- **No invented values.** A verdict's values are cut down to the values observed in the column. A verdict with fewer than two observed values left is dropped. Table sampling now keeps each low-cardinality column's full value distribution on its statistics, so "observed" means every distinct value, not the 20-row random sample.
- **More columns excluded from the gate.** MJ's own `__mj_*` columns, audit columns naming who wrote a row (`CreatedBy`, `cst_add_user`, …), and columns whose values are all years, GUIDs or dates.
- **Open lists unless a user closes them.** A list inferred from data is emitted as `ListOrUserEntry`, since the data cannot show that no other value is allowed. `List` is kept only when a user approved the column. A CHECK constraint does not close it either: CodeGen builds the closed list from a value-list CHECK itself, and a CHECK that is not a value list (e.g. `Status <> ''`) allows values the data does not hold.
- **String columns can be candidates again.** The drivers report bare type names (`varchar`, `nvarchar`) and keep the length separately, and `Database.ts` dropped that length. So the gate saw every varchar/nvarchar column as unbounded, and no string column was ever a candidate: every value list came from model verdicts on non-candidates. Columns now carry `maxLength` (declared characters; the SQL Server driver converts `nchar`/`nvarchar` bytes to characters), and the gate reads it when the type string has no length.
