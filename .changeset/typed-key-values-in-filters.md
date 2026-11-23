---
"@memberjunction/generic-database-provider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/lists": patch
"@memberjunction/templates": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities": patch
"@memberjunction/record-comparison": patch
"@memberjunction/record-cloning": patch
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Validate key values before they go into server-built SQL. A record load refuses a value for a UUID key that is not a well-formed UUID. List member reads, Template.Run, skill export and the List Detail duplicate check build their filters from the loaded record's ID or from validated, escaped values, and do not return database error text. Record comparison and record clone Plan and Describe accept only the entity's primary key fields in a key, and build the clause from those field names. `CompositeKey.ToWhereClause` accepts only field names in identifier form (plain, `[bracketed]` or `"quoted"` parts joined by `.`) and only string, number, bigint, boolean, Date or empty values, and throws for any other key before it builds text.
