---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core": patch
"@memberjunction/integration-test-suite": patch
---

SQL Server entity saves and deletes now send their values as typed parameters instead of pasting them into the batch as literals. The statement keeps its DECLARE / SET / EXEC shape with `SET @Name$ = @p$0`, so its text is the same for every record of an entity (for a given set of fields) and SQL Server reuses one cached plan instead of compiling every save. Each parameter is typed from its column (`nvarchar(100)`, `uniqueidentifier`, `bit`, …); `decimal`, `numeric`, `money` and `smallmoney` are sent as their exact text, because the driver would round them through a double. Record Change values are typed from the Record Changes columns, so their text is stored as Unicode. The SQL log, migration captures, error messages and TransactionGroup items get the literal form: the same statement with the values written back in, as before. `SaveSQLResult`, `DeleteSQLResult`, `ExecuteSQLOptions` and `SaveSQLFragment` gain an optional `literalSQL` for that. `datetimeoffset` and `smalldatetime` are sent as their ISO-8601 text, so the stored offset doesn't depend on the server's time zone and seconds round as before. `sql_variant` values stay inline literals, so SQL Server still picks their base type from the value. If the startup `datetimeoffset` probe fails, it is retried after 30 seconds rather than on every call.
