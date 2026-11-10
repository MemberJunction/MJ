---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Key lookups write an `N'…'` literal for an `nchar`/`nvarchar`/`ntext` key on SQL Server, following the key column's `UnicodePrefix` as the save path does. Record load and the Record Change snapshot, record-dependency lookups, soft-link dependency queries, the IS-A sibling Record Change read and the search permission re-read now match non-ASCII keys and can seek the key's index. `CompositeKey.ToWhereClause` takes an optional entity to apply the prefix; without it the output is unchanged. `BuildPrimaryKeyWhereClause` also refuses a non-numeric value for a numeric key. PostgreSQL metadata types text keys `nvarchar` too, and `N'…'` is `bpchar` there, which costs a varchar key its index, so the PostgreSQL provider writes no prefix (`KeyLiteralUnicodePrefix`) and drops `N` from client clauses.
