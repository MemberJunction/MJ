---
"@memberjunction/server": patch
---

`ExecuteTransactionGroup` accepts transaction variables only when they link a new record to the records that refer to it: each `Define` reads the primary key of an item the group creates, and each `Use` writes a foreign key of a different item that relates to the entity of that `Define` item. Any other variable refuses the group before any item is saved, with an error that names the variable.
