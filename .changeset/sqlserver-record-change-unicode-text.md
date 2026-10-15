---
"@memberjunction/sqlserver-dataprovider": patch
---

Record Change audit rows keep characters outside the database code page. The SQL Server provider now sends the entity name, record ID, ChangesJSON, ChangesDescription and FullRecordJSON to `spCreateRecordChange_Internal` as `N'…'` literals, so emoji, CJK, Greek and other non-Latin text are no longer stored as `?`.
