---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/core": patch
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
---

New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
