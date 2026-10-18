---
"@memberjunction/db-auto-doc": patch
---

Value lists in `additionalSchemaInfo.json` are checked against the data before they are emitted (#4537).

- **Verdicts only for candidates.** The table-analysis prompt asked for a value-list verdict only on enum candidates, but any verdict the model returned was kept. A verdict now counts only when its column passes the enum candidate gate, both when it is recorded and when it is exported, so re-exporting an older state file is cleaned too. User-approved columns are exported as approved.
- **No invented values.** A verdict's values are cut down to the values observed in the column. A verdict with fewer than two observed values left is dropped.
- **More columns excluded from the gate.** MJ's own `__mj_*` columns, audit columns naming who wrote a row (`CreatedBy`, `cst_add_user`, …), and columns whose values are all years, GUIDs or dates.
- **Open lists unless a constraint closes them.** A list inferred from sampled data is emitted as `ListOrUserEntry`, since a sample cannot show that no other value exists. `List` is kept when a CHECK constraint backs the column or a user approved it.
