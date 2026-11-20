---
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

`ExecuteTransactionGroup` accepts transaction variables only when they link a new record to the records that refer to it: each `Define` reads the primary key of an item the group creates, and each `Use` writes a foreign key of a different item that relates to the entity of that `Define` item and that the caller may write on that item (update or create). Any other variable refuses the group before any item is saved, with an error that names the variable. Integration check CA8 expects this refusal.
