---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

RunView binds the user's row-level-security values as query parameters, so every user runs the same SQL text and the database reuses one plan per query shape (#5713).
