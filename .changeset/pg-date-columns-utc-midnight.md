---
'@memberjunction/postgresql-dataprovider': patch
---

fix: a DATE column is parsed to UTC midnight, the same shape the SQL Server driver delivers, so a calendar day renders as its stored day regardless of where the API server runs

node-postgres' default parser builds a `date` value at local midnight on the API server, so a stored 2026-11-20 reached the framework as 2026-11-19T22:00Z on a server east of Greenwich, and every display path that reads the UTC parts of a date-only value (the form field since #4177, the grid, cards and detail panel since #4501) showed the 19th. The provider now registers a DATE parser beside its numeric and bigint ones that returns UTC midnight; timestamps keep the pg defaults. `parseDateOnly` and `PG_DATE_OID` are exported for hosts that build their own pool.
