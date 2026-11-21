---
"@memberjunction/sqlserver-dataprovider": patch
---

A save or query refused by a `THROW` or `RAISERROR` in a trigger or procedure (SQL Server error number 50000 and up) now reports only that message to the caller. Before, the provider appended the whole executed statement and its parameters to every SQL error, so a business refusal such as "this line cannot be changed once its order is confirmed" reached the user with the SQL behind it. The statement and parameters are still written to the server log. Engine errors (numbers below 50000) keep the full detail as before.
