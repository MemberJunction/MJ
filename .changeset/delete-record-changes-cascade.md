---
"@memberjunction/sqlserver-dataprovider": patch
---

Deleting a record no longer fails with SQL error 213 ("Column name or number of supplied values does not match table definition") when its entity tracks record changes and cascades deletes, and another record references it. The cascading delete procedure's own result sets are no longer captured into a one-column table; the delete is confirmed by the row being gone, and the Delete record change is still written.
