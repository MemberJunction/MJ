---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/data-context": minor
"@memberjunction/data-context-server": minor
"@memberjunction/server": minor
"@memberjunction/sqlserver-dataprovider": minor
---

Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)
