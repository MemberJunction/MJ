---
"@memberjunction/generic-database-provider": patch
---

Loading a record, and the row-level security check on one, now refuse a value for a numeric primary key that is not a number, with a clear error, instead of failing later in the database.
