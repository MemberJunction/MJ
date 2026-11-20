---
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

`ExecuteTransactionGroup` accepts transaction variables only when they link a new record to the records that refer to it: each `Define` reads the primary key of an item the group creates, and each `Use` writes, on a different item the group creates, a foreign key that relates to the entity of that `Define` item and that the caller may set on create. Each variable is registered with the entity's own field name. Any other variable refuses the group before any item is saved, with an error that names the variable. Integration check CA8 now sends a group the resolver accepts, so it reaches the conversation message rule for transaction variables.
