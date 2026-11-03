---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/core": patch
---

Deleting a record no longer fails with SQL error 213 ("Column name or number of supplied values does not match table definition") when its entity tracks record changes and cascades deletes, and another record references it. The cascading delete procedure's own result sets are no longer captured into a one-column table; the delete is confirmed by the row being gone from the entity's base view (which runtime logins can read, and which hides soft-deleted rows), and the Delete record change is still written. Primary-key values written into the delete SQL are now escaped, so a string key containing a quote no longer breaks the statement. A delete inside a transaction group now reports failure when the returned key does not match the record, instead of always reporting success.
